import { describe, expect, it } from "vitest";
import { estadoDelMes, historico, mesesHasta, pendientesHasta, previstoDelMes, resumenDelMes, vencimientos } from "../src/domain/fijos";
import type { Gasto, GastoFijo } from "../src/domain/types";

const fijo = (over: Partial<GastoFijo> = {}): GastoFijo => ({
  id: "f1", nombre: "Inglés", monto: 1500, moneda: "CUP", metodo: "efectivo", categoria: "Educación",
  frecuencia: "mensual", diaPago: 10, hijoIds: ["k1"], activo: true, ...over,
});
const gasto = (over: Partial<Gasto> = {}): Gasto => ({
  id: "g", monto: 100, moneda: "CUP", metodo: "efectivo", categoria: "Alimentación", descripcion: "", fecha: "2026-11-05",
  hijoId: null, origen: "manual", naturaleza: "variable", fijoId: null, ...over,
});

describe("vencimientos", () => {
  it("mensual: un pago, ajustado al último día en meses cortos", () => {
    expect(vencimientos(fijo(), "2026-11")).toEqual(["2026-11-10"]);
    expect(vencimientos(fijo({ diaPago: 31 }), "2026-11")).toEqual(["2026-11-30"]);
    expect(vencimientos(fijo({ diaPago: 31 }), "2027-02")).toEqual(["2027-02-28"]);
  });
  it("quincenal: dos pagos separados 15 días", () => {
    expect(vencimientos(fijo({ frecuencia: "quincenal", diaPago: 5 }), "2026-11")).toEqual(["2026-11-05", "2026-11-20"]);
    expect(vencimientos(fijo({ frecuencia: "quincenal", diaPago: 30 }), "2026-11")).toEqual(["2026-11-15", "2026-11-30"]);
  });
  it("semanal: cada día de la semana indicado (noviembre 2026 tiene 5 domingos)", () => {
    expect(vencimientos(fijo({ frecuencia: "semanal", diaPago: 7 }), "2026-11")).toEqual(["2026-11-01", "2026-11-08", "2026-11-15", "2026-11-22", "2026-11-29"]);
    expect(previstoDelMes(fijo({ frecuencia: "semanal", diaPago: 7, monto: 200 }), "2026-11")).toBe(1000);
  });
  it("un fijo inactivo no prevé gasto", () => {
    expect(previstoDelMes(fijo({ activo: false }), "2026-11")).toBe(0);
  });
});

describe("estadoDelMes", () => {
  it("pendiente y luego vencido", () => {
    expect(estadoDelMes(fijo(), [], "2026-11", "2026-11-08")).toMatchObject({ pagos: 0, esperados: 1, proximo: "2026-11-10", vencido: false, completo: false });
    expect(estadoDelMes(fijo(), [], "2026-11", "2026-11-12").vencido).toBe(true);
  });
  it("completo cuando hay tantos pagos como vencimientos", () => {
    const pagos = [gasto({ fijoId: "f1", naturaleza: "fijo", monto: 1500, fecha: "2026-11-09" })];
    expect(estadoDelMes(fijo(), pagos, "2026-11", "2026-11-12")).toMatchObject({ pagado: 1500, completo: true, proximo: null, vencido: false });
  });
  it("quincenal con un pago: queda el segundo", () => {
    const f = fijo({ frecuencia: "quincenal", diaPago: 5 });
    const pagos = [gasto({ fijoId: "f1", naturaleza: "fijo", fecha: "2026-11-05" })];
    expect(estadoDelMes(f, pagos, "2026-11", "2026-11-08")).toMatchObject({ pagos: 1, esperados: 2, proximo: "2026-11-20" });
  });
  it("pendientesHasta lista vencidos y próximos ordenados", () => {
    const fijos = [fijo(), fijo({ id: "f2", nombre: "Baile", diaPago: 3 }), fijo({ id: "f3", nombre: "Renta", diaPago: 28 })];
    expect(pendientesHasta(fijos, [], "2026-11-08", "2026-11-15").map((p) => [p.fijo.nombre, p.vencido])).toEqual([["Baile", true], ["Inglés", false]]);
  });
});

describe("fijo vs variable", () => {
  const gastos = [
    gasto({ monto: 1500, naturaleza: "fijo", fijoId: "f1" }),
    gasto({ monto: 300 }),
    gasto({ monto: 200 }),
    gasto({ monto: 20, moneda: "USD" }),
    gasto({ monto: 999, fecha: "2026-10-03" }),
  ];
  it("resume el mes por moneda", () => {
    expect(resumenDelMes(gastos, [fijo(), fijo({ id: "f2", monto: 800 })], "2026-11", "CUP")).toEqual({
      fijoPagado: 1500, fijoPrevisto: 2300, variable: 500, total: 2000, pctVariable: 25,
    });
  });
  it("histórico de 6 meses terminando en el mes elegido", () => {
    expect(mesesHasta("2026-02", 3)).toEqual(["2025-12", "2026-01", "2026-02"]);
    const h = historico(gastos, "2026-11", "CUP", 2);
    expect(h).toEqual([{ ym: "2026-10", fijo: 0, variable: 999 }, { ym: "2026-11", fijo: 1500, variable: 500 }]);
  });
});
