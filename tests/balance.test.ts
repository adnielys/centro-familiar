import { describe, expect, it } from "vitest";
import { balanceDelMes, resumenDe } from "../src/domain/balance";
import { tareaVacia } from "../src/domain/tareas";
import type { Gasto, GastoFijo, Tarea } from "../src/domain/types";

const g = (over: Partial<Gasto>): Gasto => ({
  id: Math.random().toString(36), monto: 100, moneda: "CUP", metodo: "efectivo", categoria: "Alimentación", descripcion: "", fecha: "2026-11-05",
  hijoId: null, origen: "manual", naturaleza: "variable", fijoId: null, ...over,
});
const gastos = [
  g({ monto: 1500, naturaleza: "fijo", categoria: "Educación", metodo: "banca_remota" }),
  g({ monto: 800, descripcion: "Mercado" }),
  g({ monto: 300, categoria: "Ocio", descripcion: "Helados" }),
  g({ monto: 50, moneda: "USD" }),
  g({ monto: 2000, fecha: "2026-10-12" }),
];
const tareas: Tarea[] = [
  { ...tareaVacia(), id: "t1", titulo: "Pagar luz", vence: "2026-11-20", costo: { tipo: "estimado", monto: 1600, moneda: "CUP", metodo: "efectivo", categoria: "Servicios" } },
  { ...tareaVacia(), id: "t2", titulo: "Pagar luz", vence: "2026-12-20", costo: { tipo: "estimado", monto: 1600, moneda: "CUP", metodo: "efectivo", categoria: "Servicios" } },
  { ...tareaVacia(), id: "t3", titulo: "Hecha", vence: "2026-11-02", estado: "hecha", costo: { tipo: "fijo", monto: 99, moneda: "CUP", metodo: "efectivo", categoria: "Otros" } },
];
const fijos: GastoFijo[] = [{ id: "f1", nombre: "Limpieza", monto: 2500, moneda: "CUP", metodo: "efectivo", categoria: "Hogar", frecuencia: "semanal", diaPago: 1, hijoIds: [], activo: true }];

describe("balanceDelMes", () => {
  const b = balanceDelMes({ gastos, tareas, fijos }, "2026-11", "CUP", "2026-11-08");

  it("totales del mes por moneda y comparación con el mes anterior", () => {
    expect(b).toMatchObject({ total: 2600, base: 1500, variable: 1100, movimientos: 3, anterior: 2000, variacion: 30 });
    expect(b.porMetodo).toEqual({ banca_remota: 1500, efectivo: 1100 });
    expect(b.categorias[0]).toEqual(["Educación", 1500]);
  });

  it("mayores gastos: solo variables, de mayor a menor", () => {
    expect(b.mayores.map((x) => x.monto)).toEqual([800, 300]);
  });

  it("pendientes: tareas con costo de este mes y pagos fijos que faltan (noviembre 2026 tiene 5 lunes)", () => {
    expect(b.pendientes.map((p) => [p.fuente, p.titulo, p.monto, p.estimado])).toEqual([
      ["fijo", "Limpieza", 12500, false],
      ["tarea", "Pagar luz", 1600, true],
    ]);
    expect(b.pendiente).toBe(14100);
  });

  it("sin mes anterior la variación es null; el resumen para el corte recorta categorías", () => {
    const usd = balanceDelMes({ gastos, tareas, fijos }, "2026-11", "USD", "2026-11-08");
    expect(usd.variacion).toBeNull();
    expect(resumenDe(b)).toEqual({ total: 2600, base: 1500, variable: 1100, pendiente: 14100, movimientos: 3, categorias: b.categorias });
  });
});
