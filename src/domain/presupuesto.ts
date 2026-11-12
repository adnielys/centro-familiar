/**
 * Promedio de los meses cerrados y gasto ideal por categoría.
 * Se calcula con los gastos guardados (no con la foto del corte, que solo guarda 8 categorías
 * y mezcla base con variable); los cortes solo dicen qué meses están cerrados.
 */
import { monthOf } from "./dates";
import type { Gasto, Moneda } from "./types";

export const RANGOS_PROMEDIO = [3, 6, 12] as const;
export type RangoPromedio = (typeof RANGOS_PROMEDIO)[number];
export const AJUSTES_IDEAL = [0, 5, 10] as const;
export type AjusteIdeal = (typeof AJUSTES_IDEAL)[number];

/** A partir de este día del mes se avisa por ritmo; antes, una sola compra grande dispara la proyección. */
export const DIA_MINIMO_RITMO = 7;

const r2 = (n: number): number => Math.round(n * 100) / 100;

/** Los `n` meses cerrados más recientes anteriores a `antesDe` (YYYY-MM), del más reciente al más antiguo. */
export function mesesCerrados(cortes: ReadonlyArray<{ ym: string }>, antesDe: string, n: number): string[] {
  return [...new Set(cortes.map((c) => c.ym))].filter((ym) => ym < antesDe).sort().reverse().slice(0, n);
}

export function mediana(xs: readonly number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mitad = Math.floor(s.length / 2);
  return s.length % 2 ? s[mitad] : (s[mitad - 1] + s[mitad]) / 2;
}

/** Redondea hacia arriba a un importe cómodo: centenas en CUP, de 5 en 5 en USD. */
export function redondearArriba(n: number, moneda: Moneda): number {
  const paso = moneda === "USD" ? 5 : 100;
  return n > 0 ? Math.ceil(r2(n) / paso) * paso : 0;
}

const delMes = (gastos: readonly Gasto[], ym: string, moneda: Moneda): Gasto[] =>
  gastos.filter((g) => g.moneda === moneda && monthOf(g.fecha) === ym);
const suma = (gs: readonly Gasto[]): number => r2(gs.reduce((s, g) => s + g.monto, 0));
const esBase = (g: Gasto): boolean => g.naturaleza === "fijo";

export interface PromedioMeses {
  meses: string[];
  total: number;
  base: number;
  variable: number;
  /** El mes más caro del rango, para entender por qué sube el promedio. */
  maximo: { ym: string; total: number };
}

/** Gasto medio por mes en una moneda. null si ningún mes tiene gastos en esa moneda. */
export function promedioDeMeses(gastos: readonly Gasto[], meses: readonly string[], moneda: Moneda): PromedioMeses | null {
  const porMes = meses.map((ym) => {
    const gs = delMes(gastos, ym, moneda);
    return { ym, total: suma(gs), base: suma(gs.filter(esBase)) };
  });
  if (!porMes.some((m) => m.total > 0)) return null;
  const media = (f: (m: (typeof porMes)[number]) => number): number => r2(porMes.reduce((s, m) => s + f(m), 0) / porMes.length);
  const maximo = porMes.reduce((a, b) => (b.total > a.total ? b : a));
  return {
    meses: [...meses],
    total: media((m) => m.total),
    base: media((m) => m.base),
    variable: media((m) => m.total - m.base),
    maximo: { ym: maximo.ym, total: maximo.total },
  };
}

export interface IdealCategoria {
  categoria: string;
  /** Lo propuesto para el mes: mediana × (1 − ajuste), redondeada hacia arriba. */
  ideal: number;
  mediana: number;
  promedio: number;
  /** Se suele pagar de una vez al mes (luz, recarga…): no tiene sentido proyectarla por días. */
  puntual: boolean;
}

/**
 * Gasto variable ideal por categoría: la mediana de los meses (un mes raro, como el de un
 * cumpleaños, no la infla), menos el ajuste de ahorro elegido. Un mes sin gasto en la categoría
 * cuenta como 0, para que algo ocasional no se convierta en un gasto mensual.
 */
export function idealPorCategoria(gastos: readonly Gasto[], meses: readonly string[], moneda: Moneda, ajuste: number = 0): IdealCategoria[] {
  if (!meses.length) return [];
  const porCategoria = new Map<string, { montos: number[]; veces: number[] }>();
  meses.forEach((ym, i) => {
    for (const g of delMes(gastos, ym, moneda)) {
      if (esBase(g)) continue;
      const c = porCategoria.get(g.categoria) ?? { montos: meses.map(() => 0), veces: meses.map(() => 0) };
      c.montos[i] = r2(c.montos[i] + g.monto);
      c.veces[i] += 1;
      porCategoria.set(g.categoria, c);
    }
  });
  return [...porCategoria]
    .map(([categoria, { montos, veces }]) => {
      const m = mediana(montos);
      return {
        categoria,
        ideal: redondearArriba(m * (1 - ajuste / 100), moneda),
        mediana: r2(m),
        promedio: r2(montos.reduce((s, x) => s + x, 0) / montos.length),
        puntual: mediana(veces.filter((v) => v > 0)) <= 1,
      };
    })
    .filter((c) => c.ideal > 0)
    .sort((a, b) => b.ideal - a.ideal || a.categoria.localeCompare(b.categoria));
}

/** Gasto variable de un mes por categoría. */
export function variablePorCategoria(gastos: readonly Gasto[], ym: string, moneda: Moneda): Map<string, number> {
  const res = new Map<string, number>();
  for (const g of delMes(gastos, ym, moneda)) if (!esBase(g)) res.set(g.categoria, r2((res.get(g.categoria) ?? 0) + g.monto));
  return res;
}

export type EstadoRitmo = "bien" | "atento" | "pasado";

export interface Ritmo {
  estado: EstadoRitmo;
  /** Lo que debería llevarse gastado a estas alturas del mes si se reparte el ideal por igual. */
  esperado: number;
  /** Gasto a fin de mes si se sigue al mismo ritmo (null antes del día mínimo o si es puntual). */
  proyeccion: number | null;
}

/**
 * Compara lo gastado con el ideal según el día del mes (`dia` = días transcurridos, incluido hoy).
 * Un gasto `puntual` (un pago al mes) no se proyecta: pagar la luz el día 10 no es un ritmo.
 */
export function ritmo(gastado: number, ideal: number, dia: number, diasMes: number, puntual = false): Ritmo {
  const fraccion = Math.min(1, Math.max(0, dia / diasMes));
  const esperado = r2(ideal * fraccion);
  const proyeccion = !puntual && dia >= DIA_MINIMO_RITMO && fraccion > 0 ? r2(gastado / fraccion) : null;
  const estado: EstadoRitmo = gastado > ideal ? "pasado" : proyeccion !== null && proyeccion > ideal * 1.05 ? "atento" : "bien";
  return { estado, esperado, proyeccion };
}
