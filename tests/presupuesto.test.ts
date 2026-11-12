import { describe, expect, it } from "vitest";
import { idealPorCategoria, mediana, mesesCerrados, promedioDeMeses, redondearArriba, ritmo, variablePorCategoria } from "../src/domain/presupuesto";
import type { Gasto } from "../src/domain/types";

const g = (fecha: string, monto: number, categoria = "Alimentación", over: Partial<Gasto> = {}): Gasto => ({
  id: Math.random().toString(36), monto, moneda: "CUP", metodo: "efectivo", categoria, descripcion: "", fecha,
  hijoId: null, origen: "manual", naturaleza: "variable", fijoId: null, ...over,
});

// Agosto–octubre: octubre trae un cumpleaños (Alimentación disparada) y Ocio solo aparece dos meses.
const gastos: Gasto[] = [
  g("2026-08-03", 14200), g("2026-08-10", 2400, "Servicios"), g("2026-08-15", 3000, "Ocio"),
  g("2026-09-04", 15800), g("2026-09-11", 2500, "Servicios"),
  g("2026-10-02", 22900), g("2026-10-12", 2450, "Servicios"), g("2026-10-20", 1500, "Ocio"),
  g("2026-08-05", 3000, "Educación", { naturaleza: "fijo" }), g("2026-09-05", 3000, "Educación", { naturaleza: "fijo" }), g("2026-10-05", 3000, "Educación", { naturaleza: "fijo" }),
  g("2026-10-07", 40, "Alimentación", { moneda: "USD" }),
  g("2026-11-05", 9100), g("2026-11-08", 600, "Transporte"),
];
const MESES = ["2026-10", "2026-09", "2026-08"];

describe("mesesCerrados", () => {
  it("devuelve los n cierres más recientes anteriores al mes, sin el mes en curso", () => {
    const cortes = [{ ym: "2026-06" }, { ym: "2026-10" }, { ym: "2026-08" }, { ym: "2026-09" }, { ym: "2026-11" }];
    expect(mesesCerrados(cortes, "2026-11", 3)).toEqual(MESES);
    expect(mesesCerrados(cortes, "2026-11", 12)).toEqual([...MESES, "2026-06"]);
    expect(mesesCerrados(cortes, "2026-09", 3)).toEqual(["2026-08", "2026-06"]);
  });
});

describe("mediana y redondeo", () => {
  it("mediana con número par e impar de valores", () => {
    expect(mediana([22900, 14200, 15800])).toBe(15800);
    expect(mediana([1, 3, 10, 2])).toBe(2.5);
    expect(mediana([])).toBe(0);
  });

  it("redondea hacia arriba a centenas en CUP y de 5 en 5 en USD", () => {
    expect(redondearArriba(15801, "CUP")).toBe(15900);
    expect(redondearArriba(15800, "CUP")).toBe(15800);
    expect(redondearArriba(41, "USD")).toBe(45);
    expect(redondearArriba(0, "CUP")).toBe(0);
  });
});

describe("promedioDeMeses", () => {
  it("media por mes de total, base y variable, y el mes más caro", () => {
    const p = promedioDeMeses(gastos, MESES, "CUP");
    expect(p).toMatchObject({ meses: MESES, base: 3000, maximo: { ym: "2026-10", total: 29850 } });
    // (22 600 + 21 300 + 29 850) / 3
    expect(p?.total).toBe(24583.33);
    expect(p?.variable).toBe(21583.33);
  });

  it("cada moneda va aparte y sin gastos devuelve null", () => {
    expect(promedioDeMeses(gastos, MESES, "USD")?.total).toBe(13.33);
    expect(promedioDeMeses(gastos, ["2026-01"], "CUP")).toBeNull();
  });
});

describe("idealPorCategoria", () => {
  it("usa la mediana, así el mes del cumpleaños no infla el ideal", () => {
    const ideal = idealPorCategoria(gastos, MESES, "CUP");
    expect(ideal.find((c) => c.categoria === "Alimentación")).toEqual({ categoria: "Alimentación", ideal: 15800, mediana: 15800, promedio: 17633.33, puntual: true });
  });

  it("marca como puntual lo que se paga una vez al mes y no lo que se compra varias veces", () => {
    const varias = [...gastos, g("2026-08-20", 100), g("2026-09-21", 100), g("2026-10-22", 100)];
    const ideal = idealPorCategoria(varias, MESES, "CUP");
    expect(ideal.find((c) => c.categoria === "Servicios")?.puntual).toBe(true);
    expect(ideal.find((c) => c.categoria === "Alimentación")?.puntual).toBe(false);
  });

  it("deja fuera los gastos base y cuenta como 0 los meses sin gasto", () => {
    const ideal = idealPorCategoria(gastos, MESES, "CUP");
    expect(ideal.map((c) => c.categoria)).toEqual(["Alimentación", "Servicios", "Ocio"]);
    expect(ideal.find((c) => c.categoria === "Ocio")?.mediana).toBe(1500);
  });

  it("aplica el ajuste de ahorro y redondea hacia arriba", () => {
    const ideal = idealPorCategoria(gastos, MESES, "CUP", 10);
    expect(ideal.find((c) => c.categoria === "Alimentación")?.ideal).toBe(14300);
    expect(ideal.find((c) => c.categoria === "Servicios")?.ideal).toBe(2300);
  });

  it("una categoría que solo apareció un mes de tres no tiene ideal", () => {
    const raro = [...gastos, g("2026-09-20", 5000, "Ropa")];
    expect(idealPorCategoria(raro, MESES, "CUP").some((c) => c.categoria === "Ropa")).toBe(false);
  });

  it("sin meses cerrados no hay ideal", () => {
    expect(idealPorCategoria(gastos, [], "CUP")).toEqual([]);
  });
});

describe("variablePorCategoria", () => {
  it("suma solo el gasto variable del mes", () => {
    expect(Object.fromEntries(variablePorCategoria(gastos, "2026-11", "CUP"))).toEqual({ "Alimentación": 9100, "Transporte": 600 });
  });
});

describe("ritmo", () => {
  it("bien si a este ritmo no se pasa", () => {
    expect(ritmo(5000, 15800, 12, 30)).toEqual({ estado: "bien", esperado: 6320, proyeccion: 12500 });
  });

  it("atento si al ritmo actual terminaría pasándose", () => {
    expect(ritmo(9100, 15800, 12, 30)).toMatchObject({ estado: "atento", proyeccion: 22750 });
  });

  it("pasado si ya superó el ideal", () => {
    expect(ritmo(16000, 15800, 20, 30).estado).toBe("pasado");
  });

  it("un gasto puntual ya pagado no se proyecta: la luz del día 10 no es un ritmo", () => {
    expect(ritmo(2450, 2500, 12, 30, true)).toEqual({ estado: "bien", esperado: 1000, proyeccion: null });
    expect(ritmo(2600, 2500, 12, 30, true).estado).toBe("pasado");
  });

  it("los primeros días no proyecta: una compra grande no es un ritmo", () => {
    expect(ritmo(6000, 15800, 3, 30)).toEqual({ estado: "bien", esperado: 1580, proyeccion: null });
  });

  it("un mes ya terminado compara contra el ideal completo", () => {
    expect(ritmo(15000, 15800, 31, 31)).toMatchObject({ estado: "bien", esperado: 15800, proyeccion: 15000 });
  });
});
