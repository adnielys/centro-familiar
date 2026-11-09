import { describe, expect, it } from "vitest";
import { migrarActividad, migrarGasto } from "../src/data/migrations";

const base = { id: "a1", titulo: "Natación", tipo: "deporte" as const, dias: [1], horaInicio: "17:00", horaFin: null, lugar: "", llevar: "", meOcupa: true };

describe("migrarActividad", () => {
  it("convierte hijoId en hijoIds", () => {
    const { actividad, cambiada } = migrarActividad({ ...base, hijoId: "k1" });
    expect(cambiada).toBe(true);
    expect(actividad.hijoIds).toEqual(["k1"]);
    expect("hijoId" in actividad).toBe(false);
  });

  it("no toca actividades ya migradas", () => {
    const { actividad, cambiada } = migrarActividad({ ...base, hijoIds: ["k1", "k2"] });
    expect(cambiada).toBe(false);
    expect(actividad.hijoIds).toEqual(["k1", "k2"]);
  });
});

describe("migrarGasto", () => {
  it("los gastos antiguos pasan a variables sin gasto fijo", () => {
    const old = { id: "g1", monto: 10, moneda: "CUP" as const, metodo: "efectivo" as const, categoria: "Otros", descripcion: "", fecha: "2026-11-01", hijoId: null, origen: "manual" as const };
    const { gasto, cambiada } = migrarGasto(old);
    expect(cambiada).toBe(true);
    expect(gasto).toMatchObject({ naturaleza: "variable", fijoId: null });
    expect(migrarGasto(gasto).cambiada).toBe(false);
  });
});

import { migrarTarea } from "../src/data/migrations";

describe("migrarTarea", () => {
  it("convierte hijoId en hijoIds y añade costo/repetición vacíos", () => {
    const old = { id: "t1", titulo: "Pagar luz", area: "hogar" as const, prioridad: "alta" as const, vence: null, hijoId: "k1", estado: "pendiente" as const, completada: null };
    const { tarea, cambiada } = migrarTarea(old);
    expect(cambiada).toBe(true);
    expect(tarea).toMatchObject({ hijoIds: ["k1"], costo: null, repetir: null, gastoId: null, siguienteId: null, serieId: null });
    expect("hijoId" in tarea).toBe(false);
    expect(migrarTarea(tarea).cambiada).toBe(false);
  });
});

describe("migrarTarea · costo sin tipo", () => {
  it("un costo antiguo pasa a importe fijo", () => {
    const old = { id: "t2", titulo: "Inglés", area: "hijos" as const, prioridad: "media" as const, vence: null, hijoIds: [], estado: "pendiente" as const, completada: null,
      costo: { monto: 1500, moneda: "CUP" as const, metodo: "efectivo" as const, categoria: "Educación" }, repetir: "mensual" as const, gastoId: null, siguienteId: null };
    const { tarea, cambiada } = migrarTarea(old);
    expect(cambiada).toBe(true);
    expect(tarea.costo?.tipo).toBe("fijo");
  });
});
