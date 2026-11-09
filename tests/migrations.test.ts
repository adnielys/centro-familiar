import { describe, expect, it } from "vitest";
import { migrarActividad } from "../src/data/migrations";

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
