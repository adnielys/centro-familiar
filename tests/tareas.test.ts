import { describe, expect, it } from "vitest";
import { planCompletar, siguienteVencimiento, tareaVacia } from "../src/domain/tareas";
import type { Tarea } from "../src/domain/types";

const tarea = (over: Partial<Tarea> = {}): Tarea => ({ ...tareaVacia(), id: "t1", titulo: "Pagar inglés", vence: "2026-11-10", ...over });
const AHORA = "2026-11-08T20:00:00.000Z";

describe("siguienteVencimiento", () => {
  it("mensual conserva el día y se ajusta a meses cortos", () => {
    expect(siguienteVencimiento("2026-11-10", "mensual")).toBe("2026-12-10");
    expect(siguienteVencimiento("2026-12-15", "mensual")).toBe("2027-01-15");
    expect(siguienteVencimiento("2027-01-31", "mensual")).toBe("2027-02-28");
  });
  it("semanal y quincenal suman días", () => {
    expect(siguienteVencimiento("2026-11-28", "semanal")).toBe("2026-12-05");
    expect(siguienteVencimiento("2026-11-20", "quincenal")).toBe("2026-12-05");
  });
});

describe("planCompletar", () => {
  it("tarea sin costo ni repetición: solo se marca hecha", () => {
    expect(planCompletar(tarea(), "2026-11-08", AHORA, null)).toEqual({ patch: { estado: "hecha", completada: AHORA }, gasto: null, siguiente: null });
  });

  it("tarea con costo que se repite: gasto fijo + siguiente del mes que viene", () => {
    const t = tarea({ hijoIds: ["k1", "k2"], repetir: "mensual", costo: { monto: 1500, moneda: "CUP", metodo: "efectivo", categoria: "Educación" } });
    const plan = planCompletar(t, "2026-11-08", AHORA, { monto: 1500, moneda: "CUP", metodo: "banca_remota" });
    expect(plan.gasto).toEqual({
      monto: 1500, moneda: "CUP", metodo: "banca_remota", categoria: "Educación", descripcion: "Pagar inglés", fecha: "2026-11-08",
      hijoId: null, origen: "tarea", naturaleza: "fijo", fijoId: null,
    });
    expect(plan.siguiente).toMatchObject({ titulo: "Pagar inglés", vence: "2026-12-10", estado: "pendiente", hijoIds: ["k1", "k2"], repetir: "mensual", gastoId: null });
    expect(plan.siguiente?.costo).toEqual(t.costo);
  });

  it("pago de una tarea puntual es variable y asignado al único hijo", () => {
    const t = tarea({ hijoIds: ["k1"], costo: { monto: 300, moneda: "USD", metodo: "efectivo", categoria: "Ropa" } });
    const plan = planCompletar(t, "2026-11-08", AHORA, { monto: 280, moneda: "USD", metodo: "efectivo" });
    expect(plan.gasto).toMatchObject({ monto: 280, naturaleza: "variable", hijoId: "k1", categoria: "Ropa" });
    expect(plan.siguiente).toBeNull();
  });

  it("no duplica la siguiente si ya existe; sin vencimiento parte de hoy", () => {
    expect(planCompletar(tarea({ repetir: "semanal", siguienteId: "t2" }), "2026-11-08", AHORA, null).siguiente).toBeNull();
    expect(planCompletar(tarea({ repetir: "semanal", vence: null }), "2026-11-08", AHORA, null).siguiente?.vence).toBe("2026-11-15");
  });

  it("un pago de 0 no crea gasto", () => {
    expect(planCompletar(tarea(), "2026-11-08", AHORA, { monto: 0, moneda: "CUP", metodo: "efectivo" }).gasto).toBeNull();
  });
});
