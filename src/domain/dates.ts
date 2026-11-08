import type { HHMM, ISODate } from "./types";

const pad = (n: number): string => String(n).padStart(2, "0");

export const toISODate = (d: Date): ISODate => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseISODate = (iso: ISODate): Date => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
};
export const todayISO = (): ISODate => toISODate(new Date());
export const addDays = (iso: ISODate, n: number): ISODate => {
  const d = parseISODate(iso);
  d.setDate(d.getDate() + n);
  return toISODate(d);
};
/** Día ISO de la semana: 1 = lunes … 7 = domingo. */
export const isoWeekday = (iso: ISODate): number => {
  const w = parseISODate(iso).getDay();
  return w === 0 ? 7 : w;
};
export const monthOf = (iso: ISODate | null | undefined): string => (iso || "").slice(0, 7);
export const daysInMonth = (ym: string): number => {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m, 0).getDate();
};

/** "HH:MM" → minutos desde medianoche. */
export const toMinutes = (hhmm: HHMM): number => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m || 0);
};
/** Minutos desde medianoche → "HH:MM". */
export const toHHMM = (min: number): HHMM => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
export const nowMinutes = (): number => {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
};
export const fmtDuration = (min: number): string => {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
};

export const fmtDate = (iso: ISODate): string =>
  parseISODate(iso).toLocaleDateString("es", { weekday: "short", day: "numeric", month: "short" });
export const fmtLongDate = (iso: ISODate): string =>
  parseISODate(iso).toLocaleDateString("es", { weekday: "long", day: "numeric", month: "long" });
export const fmtMonth = (ym: string): string => {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("es", { month: "long", year: "numeric" });
};
