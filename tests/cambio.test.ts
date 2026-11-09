import { describe, expect, it } from "vitest";
import { convertir, parseTasaUSD, tasaPara, totalCombinado, ventanaDeHoy } from "../src/domain/cambio";
import type { Gasto, Tasa } from "../src/domain/types";

const tasa = (fecha: string, usd: number): Tasa => ({ id: fecha, fecha, usd, fuente: "eltoque", actualizado: "" });
const g = (over: Partial<Gasto>): Gasto => ({
  id: "x", monto: 100, moneda: "CUP", metodo: "efectivo", categoria: "Otros", descripcion: "", fecha: "2026-11-05",
  hijoId: null, origen: "manual", naturaleza: "variable", fijoId: null, ...over,
});

describe("parseTasaUSD", () => {
  it("formato documentado { tasas: { USD } }", () => {
    expect(parseTasaUSD({ tasas: { ECU: 520, USD: 470, MLC: 300 }, date: "2026-11-08" })).toBe(470);
  });
  it("lista [{ currency, cup }] y USD en la raíz", () => {
    expect(parseTasaUSD([{ currency: "ECU", cup: 860 }, { currency: "USD", cup: 760 }])).toBe(760);
    expect(parseTasaUSD({ rates: [{ currency: "USD", cup: "455,5" }] })).toBe(455.5);
    expect(parseTasaUSD({ USD: 480 })).toBe(480);
  });
  it("respuestas sin USD o inválidas", () => {
    expect(parseTasaUSD({ tasas: { ECU: 520 } })).toBeNull();
    expect(parseTasaUSD(null)).toBeNull();
    expect(parseTasaUSD({ tasas: { USD: 0 } })).toBeNull();
  });
});

describe("tasaPara", () => {
  const tasas = [tasa("2026-11-01", 460), tasa("2026-11-06", 470), tasa("2026-10-20", 450)];
  it("usa la del día o la anterior más cercana", () => {
    expect(tasaPara("2026-11-06", tasas)?.usd).toBe(470);
    expect(tasaPara("2026-11-05", tasas)?.usd).toBe(460);
    expect(tasaPara("2026-12-01", tasas)?.usd).toBe(470);
  });
  it("si el gasto es anterior a todas, usa la primera; sin tasas, null", () => {
    expect(tasaPara("2026-09-01", tasas)?.usd).toBe(450);
    expect(tasaPara("2026-11-05", [])).toBeNull();
  });
});

describe("totalCombinado", () => {
  it("convierte cada gasto con la tasa de su fecha", () => {
    const tasas = [tasa("2026-11-01", 400), tasa("2026-11-06", 500)];
    const r = totalCombinado([g({ monto: 4000, fecha: "2026-11-02" }), g({ monto: 10, moneda: "USD", fecha: "2026-11-07" })], tasas);
    expect(r).toEqual({ cup: 9000, usd: 20, sinTasa: 0 });
  });
  it("sin tasas cuenta los que no pudo convertir", () => {
    expect(totalCombinado([g({ monto: 100 }), g({ monto: 5, moneda: "USD" })], [])).toEqual({ cup: 100, usd: 5, sinTasa: 2 });
  });
  it("convertir y ventana de consulta < 24 h", () => {
    expect(convertir(10, "USD", "CUP", 470)).toBe(4700);
    expect(convertir(4700, "CUP", "USD", 470)).toBe(10);
    expect(ventanaDeHoy(new Date(2026, 10, 8, 21, 5, 9))).toEqual({ date_from: "2026-11-08 00:00:01", date_to: "2026-11-08 21:05:09" });
  });
});
