/**
 * Motor de disponibilidad: calcula cuándo estás ocupado y cuándo libre en un día.
 *
 * Fuentes de ocupación:
 *  - trabajo: tu horario laboral (días y horas configurados)
 *  - hijos:   actividades de los niños marcadas como "me ocupa" (llevar, recoger, acompañar)
 *  - bloque:  lo que tú agendaste
 *  - google:  eventos con hora de Google Calendar
 *
 * Todo trabaja en minutos desde medianoche, sobre la "jornada" configurada (p. ej. 07:00–22:00).
 * Funciones puras: sin DOM, sin red, sin reloj implícito (la hora actual se pasa como parámetro).
 */
import { DURACION_ACTIVIDAD_DEFECTO } from "./catalog";
import { addDays, isoWeekday, toMinutes } from "./dates";
import type { Actividad, Bloque, Config, Hijo, ISODate } from "./types";

export type FuenteOcupacion = "trabajo" | "hijos" | "bloque" | "google";

export interface Ocupacion {
  inicio: number;
  fin: number;
  fuente: FuenteOcupacion;
  titulo: string;
  /** id del bloque o actividad de origen, si aplica */
  refId?: string;
}

export interface Hueco {
  inicio: number;
  fin: number;
}

export interface FuentesAgenda {
  config: Pick<Config, "jornada" | "trabajo">;
  actividades: readonly Actividad[];
  hijos: readonly Hijo[];
  bloques: readonly Bloque[];
  /** Ocupaciones externas (Google Calendar) por fecha. */
  externas?: (fecha: ISODate) => readonly Ocupacion[];
}

const overlaps = (a: { inicio: number; fin: number }, b: { inicio: number; fin: number }): boolean => a.inicio < b.fin && b.inicio < a.fin;

/** Todas las ocupaciones de un día, ordenadas por inicio. */
export function ocupacionesDelDia(fecha: ISODate, f: FuentesAgenda): Ocupacion[] {
  const wd = isoWeekday(fecha);
  const result: Ocupacion[] = [];

  const { trabajo } = f.config;
  if (trabajo.activo && trabajo.dias.includes(wd)) {
    result.push({ inicio: toMinutes(trabajo.inicio), fin: toMinutes(trabajo.fin), fuente: "trabajo", titulo: "Trabajo" });
  }

  const nombre = (id: string): string => f.hijos.find((h) => h.id === id)?.nombre ?? "";
  for (const a of f.actividades) {
    if (!a.meOcupa || !a.dias.includes(wd)) continue;
    const inicio = toMinutes(a.horaInicio);
    const fin = a.horaFin ? toMinutes(a.horaFin) : inicio + DURACION_ACTIVIDAD_DEFECTO;
    const quien = nombre(a.hijoId);
    result.push({ inicio, fin, fuente: "hijos", titulo: quien ? `${a.titulo} (${quien})` : a.titulo, refId: a.id });
  }

  for (const b of f.bloques) {
    if (b.fecha !== fecha) continue;
    result.push({ inicio: toMinutes(b.inicio), fin: toMinutes(b.fin), fuente: "bloque", titulo: b.titulo, refId: b.id });
  }

  if (f.externas) result.push(...f.externas(fecha));

  return result.filter((o) => o.fin > o.inicio).sort((a, b) => a.inicio - b.inicio || a.fin - b.fin);
}

/**
 * Ocupaciones que chocan con el intervalo [inicio, fin) de esa fecha.
 * `ignorarBloqueId` permite mover un bloque existente sin que choque consigo mismo.
 */
export function conflictos(fecha: ISODate, inicio: number, fin: number, f: FuentesAgenda, ignorarBloqueId?: string): Ocupacion[] {
  return ocupacionesDelDia(fecha, f).filter((o) => !(o.fuente === "bloque" && o.refId === ignorarBloqueId) && overlaps(o, { inicio, fin }));
}

/** Une intervalos solapados o contiguos. */
export function fusionar(intervalos: readonly Hueco[]): Hueco[] {
  const sorted = [...intervalos].sort((a, b) => a.inicio - b.inicio);
  const merged: Hueco[] = [];
  for (const it of sorted) {
    const last = merged[merged.length - 1];
    if (last && it.inicio <= last.fin) last.fin = Math.max(last.fin, it.fin);
    else merged.push({ inicio: it.inicio, fin: it.fin });
  }
  return merged;
}

/**
 * Huecos libres del día dentro de la jornada, de al menos `minDuracion` minutos.
 * Si `desde` se indica (p. ej. la hora actual para hoy), no se devuelven huecos anteriores.
 */
export function huecosLibres(fecha: ISODate, f: FuentesAgenda, minDuracion = 15, desde?: number): Hueco[] {
  let cursor = Math.max(toMinutes(f.config.jornada.inicio), desde ?? 0);
  const finJornada = toMinutes(f.config.jornada.fin);
  const ocupado = fusionar(ocupacionesDelDia(fecha, f));
  const libres: Hueco[] = [];
  for (const o of ocupado) {
    if (o.fin <= cursor) continue;
    if (o.inicio >= finJornada) break;
    if (o.inicio > cursor) libres.push({ inicio: cursor, fin: Math.min(o.inicio, finJornada) });
    cursor = Math.max(cursor, o.fin);
  }
  if (cursor < finJornada) libres.push({ inicio: cursor, fin: finJornada });
  return libres.filter((h) => h.fin - h.inicio >= minDuracion);
}

export const minutosLibres = (huecos: readonly Hueco[]): number => huecos.reduce((s, h) => s + (h.fin - h.inicio), 0);

/**
 * Primer hueco de `duracion` minutos a partir de (fecha, desdeMin), buscando hasta `maxDias` días.
 * Devuelve el inicio más temprano posible dentro de un hueco libre.
 */
export function siguienteHueco(
  fecha: ISODate,
  desdeMin: number,
  duracion: number,
  f: FuentesAgenda,
  maxDias = 14,
): { fecha: ISODate; inicio: number; fin: number } | null {
  for (let i = 0; i < maxDias; i++) {
    const dia = addDays(fecha, i);
    const hueco = huecosLibres(dia, f, duracion, i === 0 ? desdeMin : undefined)[0];
    if (hueco) return { fecha: dia, inicio: hueco.inicio, fin: hueco.inicio + duracion };
  }
  return null;
}

export type Veredicto =
  | { libre: true }
  | { libre: false; choques: Ocupacion[]; alternativa: { fecha: ISODate; inicio: number; fin: number } | null }
  | { libre: false; fueraDeJornada: true; alternativa: { fecha: ISODate; inicio: number; fin: number } | null };

/** Respuesta a "¿estoy libre en este horario?" con una alternativa si no lo estás. */
export function comprobar(fecha: ISODate, inicio: number, fin: number, f: FuentesAgenda, ignorarBloqueId?: string): Veredicto {
  const duracion = fin - inicio;
  const fueraDeJornada = inicio < toMinutes(f.config.jornada.inicio) || fin > toMinutes(f.config.jornada.fin);
  const choques = conflictos(fecha, inicio, fin, f, ignorarBloqueId);
  if (!choques.length && !fueraDeJornada) return { libre: true };
  const sinEsteBloque: FuentesAgenda = ignorarBloqueId ? { ...f, bloques: f.bloques.filter((b) => b.id !== ignorarBloqueId) } : f;
  const alternativa = siguienteHueco(fecha, inicio, duracion, sinEsteBloque);
  return choques.length ? { libre: false, choques, alternativa } : { libre: false, fueraDeJornada: true, alternativa };
}
