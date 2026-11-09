import { describe, expect, it } from "vitest";
import { MAX_RECORDATORIOS, idEstable, planificarRecordatorios } from "../src/domain/recordatorios";
import { tareaVacia } from "../src/domain/tareas";
import type { Gasto, GastoFijo, Tarea } from "../src/domain/types";

const tarea = (over: Partial<Tarea> = {}): Tarea => ({ ...tareaVacia(), id: "t1", titulo: "Pagar luz", vence: "2026-11-10", ...over });
const fijo = (over: Partial<GastoFijo> = {}): GastoFijo => ({
  id: "f1", nombre: "Inglés", monto: 1500, moneda: "CUP", metodo: "efectivo", categoria: "Educación",
  frecuencia: "mensual", diaPago: 10, hijoIds: [], activo: true, ...over,
});
const pago = (over: Partial<Gasto> = {}): Gasto => ({
  id: "g", monto: 1500, moneda: "CUP", metodo: "efectivo", categoria: "Educación", descripcion: "", fecha: "2026-11-05",
  hijoId: null, origen: "fijo", naturaleza: "fijo", fijoId: "f1", ...over,
});
const base = { tareas: [], fijos: [], gastos: [], hoy: "2026-11-08", ahoraMin: 8 * 60, hora: "09:00" } as const;

describe("idEstable", () => {
  it("es determinista, positivo y distingue claves", () => {
    expect(idEstable("tarea:a")).toBe(idEstable("tarea:a"));
    expect(idEstable("tarea:a")).not.toBe(idEstable("tarea:b"));
    expect(idEstable("x")).toBeGreaterThan(0);
  });
});

describe("planificarRecordatorios", () => {
  it("avisa las tareas pendientes con fecha a la hora configurada", () => {
    const r = planificarRecordatorios({ ...base, tareas: [tarea(), tarea({ id: "t2", vence: null }), tarea({ id: "t3", estado: "hecha" })] });
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ titulo: "Pagar luz", cuando: "2026-11-10T09:00" });
  });
  it("omite avisos que ya pasaron, incluido hoy si la hora ya pasó", () => {
    const tareas = [tarea({ vence: "2026-11-07" }), tarea({ id: "t2", vence: "2026-11-08" })];
    expect(planificarRecordatorios({ ...base, tareas })).toHaveLength(1);
    expect(planificarRecordatorios({ ...base, tareas, ahoraMin: 10 * 60 })).toHaveLength(0);
  });
  it("incluye los vencimientos de fijos de este mes y los siguientes, salvo los ya pagados", () => {
    const sinPagar = planificarRecordatorios({ ...base, fijos: [fijo()] }).map((x) => x.cuando);
    expect(sinPagar).toEqual(["2026-11-10T09:00", "2026-12-10T09:00"]);
    const pagado = planificarRecordatorios({ ...base, fijos: [fijo()], gastos: [pago()] }).map((x) => x.cuando);
    expect(pagado).toEqual(["2026-12-10T09:00"]);
  });
  it("ignora fijos inactivos", () => {
    expect(planificarRecordatorios({ ...base, fijos: [fijo({ activo: false })] })).toEqual([]);
  });
  it("respeta el límite de iOS ordenando por fecha", () => {
    const tareas = Array.from({ length: 80 }, (_, i) => tarea({ id: `t${i}`, vence: i < 40 ? "2026-11-20" : "2026-11-09" }));
    const r = planificarRecordatorios({ ...base, tareas });
    expect(r).toHaveLength(MAX_RECORDATORIOS);
    expect(r[0].cuando).toBe("2026-11-09T09:00");
  });
});
