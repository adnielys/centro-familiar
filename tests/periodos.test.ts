import { describe, expect, it } from "vitest";
import { agruparPorMes, enPeriodoActual, finDeMes, finDeSemana } from "../src/domain/periodos";

// Domingo 8 nov 2026 y martes 10 nov 2026
describe("periodos", () => {
  it("fin de semana (domingo) y fin de mes", () => {
    expect(finDeSemana("2026-11-08")).toBe("2026-11-08");
    expect(finDeSemana("2026-11-10")).toBe("2026-11-15");
    expect(finDeMes("2026-11-10")).toBe("2026-11-30");
    expect(finDeMes("2027-02-03")).toBe("2027-02-28");
  });

  it("mensuales y puntuales: hasta fin de mes; la de diciembre no aparece en noviembre", () => {
    expect(enPeriodoActual({ vence: "2026-11-25", repetir: "mensual" }, "2026-11-10")).toBe(true);
    expect(enPeriodoActual({ vence: "2026-12-10", repetir: "mensual" }, "2026-11-10")).toBe(false);
    expect(enPeriodoActual({ vence: "2026-11-30", repetir: null }, "2026-11-10")).toBe(true);
  });

  it("semanales: solo las de esta semana", () => {
    expect(enPeriodoActual({ vence: "2026-11-15", repetir: "semanal" }, "2026-11-10")).toBe(true);
    expect(enPeriodoActual({ vence: "2026-11-16", repetir: "semanal" }, "2026-11-10")).toBe(false);
  });

  it("vencidas y sin fecha siempre están", () => {
    expect(enPeriodoActual({ vence: "2026-10-01", repetir: "mensual" }, "2026-11-10")).toBe(true);
    expect(enPeriodoActual({ vence: null, repetir: null }, "2026-11-10")).toBe(true);
  });

  it("agrupa por mes en orden", () => {
    const g = agruparPorMes([{ vence: "2027-01-08" }, { vence: "2026-12-10" }, { vence: "2026-12-12" }]);
    expect(g.map(([ym, ts]) => [ym, ts.length])).toEqual([["2026-12", 2], ["2027-01", 1]]);
  });
});
