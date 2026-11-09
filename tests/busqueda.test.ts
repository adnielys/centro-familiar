import { describe, expect, it } from "vitest";
import { buscarGastos, paginar } from "../src/domain/busqueda";
import type { Gasto } from "../src/domain/types";

const g = (over: Partial<Gasto>): Gasto => ({
  id: "x", monto: 100, moneda: "CUP", metodo: "efectivo", categoria: "Alimentación", descripcion: "", fecha: "2026-11-05",
  hijoId: null, origen: "manual", naturaleza: "variable", fijoId: null, ...over,
});
const gastos = [
  g({ id: "1", descripcion: "Fogón nuevo compró Alain", categoria: "Hogar", monto: 300, moneda: "USD", metodo: "banca_remota" }),
  g({ id: "2", descripcion: "Caja de pollo, arroz", monto: 100, moneda: "USD" }),
  g({ id: "3", descripcion: "Pagar natación", categoria: "Educación", monto: 200, hijoId: "k1", naturaleza: "fijo" }),
];
const ids = (r: Gasto[]): string[] => r.map((x) => x.id);

describe("buscarGastos", () => {
  it("sin acentos ni mayúsculas, por descripción y categoría", () => {
    expect(ids(buscarGastos(gastos, "FOGON"))).toEqual(["1"]);
    expect(ids(buscarGastos(gastos, "educacion"))).toEqual(["3"]);
  });
  it("por método, importe, moneda e hijo; varias palabras deben coincidir todas", () => {
    expect(ids(buscarGastos(gastos, "banca"))).toEqual(["1"]);
    expect(ids(buscarGastos(gastos, "300"))).toEqual(["1"]);
    expect(ids(buscarGastos(gastos, "usd pollo"))).toEqual(["2"]);
    expect(ids(buscarGastos(gastos, "lucas", (id) => (id === "k1" ? "Lucas" : "")))).toEqual(["3"]);
    expect(ids(buscarGastos(gastos, "base"))).toEqual(["3"]);
  });
  it("consulta vacía devuelve todo", () => {
    expect(buscarGastos(gastos, "  ")).toHaveLength(3);
  });
});

describe("paginar", () => {
  const items = Array.from({ length: 32 }, (_, i) => i + 1);
  it("divide en páginas y acota la página pedida", () => {
    expect(paginar(items, 1, 15)).toMatchObject({ pagina: 1, paginas: 3, total: 32, desde: 1, hasta: 15 });
    expect(paginar(items, 3, 15).items).toEqual([31, 32]);
    expect(paginar(items, 9, 15).pagina).toBe(3);
    expect(paginar([], 1, 15)).toMatchObject({ pagina: 1, paginas: 1, total: 0, desde: 0, hasta: 0 });
  });
});
