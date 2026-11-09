/**
 * Gastos fijos: compromisos recurrentes y su estado en cada mes, y el análisis fijo vs variable.
 * Funciones puras; el "hoy" y los datos se reciben como parámetros.
 */
import { daysInMonth, isoWeekday, monthOf } from "./dates";
import type { Frecuencia, Gasto, GastoFijo, ISODate, Moneda } from "./types";

const pad = (n: number): string => String(n).padStart(2, "0");
const fecha = (ym: string, day: number): ISODate => `${ym}-${pad(Math.min(day, daysInMonth(ym)))}`;

export const FRECUENCIAS: Record<Frecuencia, string> = { mensual: "Mensual", quincenal: "Quincenal", semanal: "Semanal" };

/** Fechas de pago de un gasto fijo dentro de un mes ("YYYY-MM"), ordenadas. */
export function vencimientos(f: Pick<GastoFijo, "frecuencia" | "diaPago">, ym: string): ISODate[] {
  switch (f.frecuencia) {
    case "mensual":
      return [fecha(ym, f.diaPago)];
    case "quincenal": {
      const [a, b] = f.diaPago <= 15 ? [f.diaPago, f.diaPago + 15] : [f.diaPago - 15, f.diaPago];
      return [fecha(ym, a), fecha(ym, b)];
    }
    case "semanal": {
      const out: ISODate[] = [];
      for (let d = 1; d <= daysInMonth(ym); d++) if (isoWeekday(fecha(ym, d)) === f.diaPago) out.push(fecha(ym, d));
      return out;
    }
  }
}

/** Importe previsto de un gasto fijo en un mes. */
export const previstoDelMes = (f: GastoFijo, ym: string): number => (f.activo ? f.monto * vencimientos(f, ym).length : 0);

export const pagosDelMes = (f: GastoFijo, gastos: readonly Gasto[], ym: string): Gasto[] =>
  gastos.filter((g) => g.fijoId === f.id && monthOf(g.fecha) === ym).sort((a, b) => a.fecha.localeCompare(b.fecha));

export interface EstadoFijo {
  previsto: number;
  pagado: number;
  pagos: number;
  esperados: number;
  /** Próxima fecha sin pagar en el mes, o null si está todo pagado. */
  proximo: ISODate | null;
  vencido: boolean;
  completo: boolean;
}

/** Estado de un gasto fijo en un mes: los primeros N vencimientos se consideran cubiertos por N pagos. */
export function estadoDelMes(f: GastoFijo, gastos: readonly Gasto[], ym: string, hoy: ISODate): EstadoFijo {
  const fechas = f.activo ? vencimientos(f, ym) : [];
  const pagos = pagosDelMes(f, gastos, ym);
  const pendientes = fechas.slice(pagos.length);
  const proximo = pendientes[0] ?? null;
  return {
    previsto: previstoDelMes(f, ym),
    pagado: pagos.reduce((s, g) => s + g.monto, 0),
    pagos: pagos.length,
    esperados: fechas.length,
    proximo,
    vencido: proximo !== null && proximo < hoy,
    completo: proximo === null,
  };
}

/** Pagos fijos pendientes que vencen hasta `limite` (incluye vencidos), para avisos. */
export function pendientesHasta(fijos: readonly GastoFijo[], gastos: readonly Gasto[], hoy: ISODate, limite: ISODate): Array<{ fijo: GastoFijo; fecha: ISODate; vencido: boolean }> {
  const ym = monthOf(hoy);
  return fijos
    .filter((f) => f.activo)
    .map((f) => ({ fijo: f, estado: estadoDelMes(f, gastos, ym, hoy) }))
    .filter(({ estado }) => estado.proximo !== null && estado.proximo <= limite)
    .map(({ fijo, estado }) => ({ fijo, fecha: estado.proximo as ISODate, vencido: estado.vencido }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
}

export interface ResumenNaturaleza {
  fijoPagado: number;
  fijoPrevisto: number;
  variable: number;
  total: number;
  /** % del gasto real que es variable (0–100). */
  pctVariable: number;
}

export function resumenDelMes(gastos: readonly Gasto[], fijos: readonly GastoFijo[], ym: string, moneda: Moneda): ResumenNaturaleza {
  const delMes = gastos.filter((g) => g.moneda === moneda && monthOf(g.fecha) === ym);
  const fijoPagado = delMes.filter((g) => g.naturaleza === "fijo").reduce((s, g) => s + g.monto, 0);
  const variable = delMes.filter((g) => g.naturaleza !== "fijo").reduce((s, g) => s + g.monto, 0);
  const fijoPrevisto = fijos.filter((f) => f.moneda === moneda).reduce((s, f) => s + previstoDelMes(f, ym), 0);
  const total = fijoPagado + variable;
  return { fijoPagado, fijoPrevisto, variable, total, pctVariable: total ? Math.round((variable / total) * 100) : 0 };
}

/** Meses ("YYYY-MM") que terminan en `ym`, del más antiguo al más reciente. */
export function mesesHasta(ym: string, n: number): string[] {
  const [y, m] = ym.split("-").map(Number);
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(y, m - 1 - (n - 1 - i), 1);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
  });
}

export function historico(gastos: readonly Gasto[], ym: string, moneda: Moneda, n = 6): Array<{ ym: string; fijo: number; variable: number }> {
  return mesesHasta(ym, n).map((mes) => {
    const delMes = gastos.filter((g) => g.moneda === moneda && monthOf(g.fecha) === mes);
    return {
      ym: mes,
      fijo: delMes.filter((g) => g.naturaleza === "fijo").reduce((s, g) => s + g.monto, 0),
      variable: delMes.filter((g) => g.naturaleza !== "fijo").reduce((s, g) => s + g.monto, 0),
    };
  });
}
