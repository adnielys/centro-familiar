/**
 * Tipo de cambio USD↔CUP (TRMI de elTOQUE o manual) y totales combinados.
 * Cada gasto se convierte con la tasa del día en que se hizo (o la anterior más cercana).
 */
import type { Gasto, ISODate, Moneda, Tasa } from "./types";

/**
 * Extrae la tasa del USD (en CUP) de la respuesta de la API de elTOQUE.
 * Tolerante con la forma: { tasas: { USD } } (documentada), [{ currency, cup }] o { USD } en la raíz.
 */
export function parseTasaUSD(json: unknown): number | null {
  const valido = (v: unknown): number | null => {
    const n = typeof v === "string" ? Number(v.replace(",", ".")) : v;
    return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : null;
  };
  if (!json || typeof json !== "object") return null;
  const o = json as Record<string, unknown>;
  const tasas = o.tasas as Record<string, unknown> | undefined;
  if (tasas && typeof tasas === "object") return valido(tasas.USD);
  const lista = Array.isArray(json) ? json : Array.isArray(o.rates) ? o.rates : null;
  if (lista) {
    const usd = lista.find((r: unknown) => (r as Record<string, unknown>)?.currency === "USD") as Record<string, unknown> | undefined;
    return usd ? valido(usd.cup ?? usd.value ?? usd.rate) : null;
  }
  return valido(o.USD);
}

/** Tasa aplicable a una fecha: la de ese día o la anterior más cercana; si no hay anteriores, la primera posterior. */
export function tasaPara(fecha: ISODate, tasas: readonly Tasa[]): Tasa | null {
  if (!tasas.length) return null;
  const ordenadas = [...tasas].sort((a, b) => a.fecha.localeCompare(b.fecha));
  let elegida: Tasa | null = null;
  for (const t of ordenadas) {
    if (t.fecha <= fecha) elegida = t;
    else break;
  }
  return elegida ?? ordenadas[0];
}

export const tasaActual = (tasas: readonly Tasa[], hoy: ISODate): Tasa | null => tasaPara(hoy, tasas);

const r2 = (n: number): number => Math.round(n * 100) / 100;

export interface TotalCombinado {
  /** Todo expresado en CUP. */
  cup: number;
  /** Todo expresado en USD. */
  usd: number;
  /** Gastos que no se pudieron convertir por falta de tasa. */
  sinTasa: number;
}

/** Suma gastos de distintas monedas convirtiendo cada uno con la tasa de su fecha. */
export function totalCombinado(gastos: readonly Gasto[], tasas: readonly Tasa[]): TotalCombinado {
  let cup = 0;
  let usd = 0;
  let sinTasa = 0;
  for (const g of gastos) {
    const t = tasaPara(g.fecha, tasas);
    if (g.moneda === "CUP") {
      cup += g.monto;
      if (t) usd += g.monto / t.usd;
      else sinTasa++;
    } else {
      usd += g.monto;
      if (t) cup += g.monto * t.usd;
      else sinTasa++;
    }
  }
  return { cup: r2(cup), usd: r2(usd), sinTasa };
}

/** Convierte un importe con una tasa (1 USD = tasa CUP). */
export const convertir = (monto: number, de: Moneda, a: Moneda, tasa: number): number =>
  de === a ? monto : r2(de === "USD" ? monto * tasa : monto / tasa);

/** Ventana de consulta de la API: desde las 00:00 de hoy hasta ahora (debe ser < 24 h). Formato "YYYY-MM-DD HH:MM:SS". */
export function ventanaDeHoy(ahora: Date): { date_from: string; date_to: string } {
  const pad = (n: number): string => String(n).padStart(2, "0");
  const dia = `${ahora.getFullYear()}-${pad(ahora.getMonth() + 1)}-${pad(ahora.getDate())}`;
  return { date_from: `${dia} 00:00:01`, date_to: `${dia} ${pad(ahora.getHours())}:${pad(ahora.getMinutes())}:${pad(ahora.getSeconds())}` };
}
