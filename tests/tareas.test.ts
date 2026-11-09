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
    const t = tarea({ hijoIds: ["k1", "k2"], repetir: "mensual", costo: { tipo: "fijo", monto: 1500, moneda: "CUP", metodo: "efectivo", categoria: "Educación" } });
    const plan = planCompletar(t, "2026-11-08", AHORA, { monto: 1500, moneda: "CUP", metodo: "banca_remota" });
    expect(plan.gasto).toEqual({
      monto: 1500, moneda: "CUP", metodo: "banca_remota", categoria: "Educación", descripcion: "Pagar inglés", fecha: "2026-11-08",
      hijoId: null, origen: "tarea", naturaleza: "fijo", fijoId: null,
    });
    expect(plan.siguiente).toMatchObject({ titulo: "Pagar inglés", vence: "2026-12-10", estado: "pendiente", hijoIds: ["k1", "k2"], repetir: "mensual", gastoId: null });
    expect(plan.siguiente?.costo).toEqual(t.costo);
  });

  it("pago de una tarea puntual es variable y asignado al único hijo", () => {
    const t = tarea({ hijoIds: ["k1"], costo: { tipo: "fijo", monto: 300, moneda: "USD", metodo: "efectivo", categoria: "Ropa" } });
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

import { promedioReciente } from "../src/domain/tareas";

describe("importe estimado (luz, agua…)", () => {
  const luz = (over: Partial<Tarea> = {}): Tarea => tarea({
    titulo: "Pagar luz", repetir: "mensual", costo: { tipo: "estimado", monto: 1500, moneda: "CUP", metodo: "efectivo", categoria: "Servicios" }, ...over,
  });

  it("promedioReciente usa los últimos 3 pagos", () => {
    expect(promedioReciente([1000, 1400, 1600, 1900])).toBe(1633.33);
    expect(promedioReciente([])).toBeNull();
  });

  it("la siguiente toma el promedio de los últimos pagos de la serie", () => {
    const plan = planCompletar(luz({ serieId: "s1" }), "2026-11-08", AHORA, { monto: 1800, moneda: "CUP", metodo: "efectivo" }, [1400, 1600]);
    expect(plan.siguiente?.costo).toMatchObject({ tipo: "estimado", monto: 1600 });
    expect(plan.siguiente?.serieId).toBe("s1");
    expect(plan.gasto?.naturaleza).toBe("fijo");
  });

  it("sin historial la serie arranca con la propia tarea y su primer pago", () => {
    const plan = planCompletar(luz(), "2026-11-08", AHORA, { monto: 1720, moneda: "CUP", metodo: "efectivo" });
    expect(plan.siguiente?.serieId).toBe("t1");
    expect(plan.siguiente?.costo?.monto).toBe(1720);
  });

  it("un costo fijo no cambia aunque pagues otro importe", () => {
    const t = luz({ costo: { tipo: "fijo", monto: 1500, moneda: "CUP", metodo: "efectivo", categoria: "Educación" } });
    expect(planCompletar(t, "2026-11-08", AHORA, { monto: 1450, moneda: "CUP", metodo: "efectivo" }).siguiente?.costo?.monto).toBe(1500);
  });
});

import { gastoDeTarea, hechasSinGasto } from "../src/domain/tareas";

describe("gasto de tareas ya hechas", () => {
  it("usa la fecha indicada y la categoría elegida si la tarea no tenía costo", () => {
    const t = tarea({ titulo: "Pagar Dilsi", repetir: "mensual", hijoIds: [] });
    expect(gastoDeTarea(t, { monto: 100, moneda: "USD", metodo: "efectivo" }, "2026-11-03", "Hogar")).toMatchObject({
      monto: 100, moneda: "USD", categoria: "Hogar", fecha: "2026-11-03", naturaleza: "fijo", descripcion: "Pagar Dilsi",
    });
  });
  it("detecta hechas sin gasto (o con un gasto que ya no existe)", () => {
    const ts = [tarea({ id: "a", estado: "hecha" }), tarea({ id: "b", estado: "hecha", gastoId: "g1" }), tarea({ id: "c", estado: "hecha", gastoId: "borrado" }), tarea({ id: "d" })];
    expect(hechasSinGasto(ts, (id) => id === "g1").map((t) => t.id)).toEqual(["a", "c"]);
  });
});
