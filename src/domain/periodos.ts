/**
 * Periodos: qué tareas tocan "ahora". Las semanales hasta el domingo de esta semana;
 * el resto (mensuales, puntuales) hasta fin de mes; lo vencido o sin fecha, siempre.
 */
import { addDays, daysInMonth, isoWeekday, monthOf } from "./dates";
import type { ISODate, Tarea } from "./types";

const pad = (n: number): string => String(n).padStart(2, "0");

export const finDeSemana = (hoy: ISODate): ISODate => addDays(hoy, 7 - isoWeekday(hoy));
export const finDeMes = (hoy: ISODate): ISODate => `${monthOf(hoy)}-${pad(daysInMonth(monthOf(hoy)))}`;

export function enPeriodoActual(t: Pick<Tarea, "vence" | "repetir">, hoy: ISODate): boolean {
  if (!t.vence || t.vence <= hoy) return true;
  return t.vence <= (t.repetir === "semanal" ? finDeSemana(hoy) : finDeMes(hoy));
}

/** Agrupa tareas futuras por mes ("YYYY-MM"), en orden cronológico. */
export function agruparPorMes<T extends Pick<Tarea, "vence">>(tareas: readonly T[]): Array<[string, T[]]> {
  const grupos = new Map<string, T[]>();
  for (const t of [...tareas].sort((a, b) => (a.vence ?? "").localeCompare(b.vence ?? ""))) {
    const ym = monthOf(t.vence);
    grupos.set(ym, [...(grupos.get(ym) ?? []), t]);
  }
  return [...grupos.entries()];
}
