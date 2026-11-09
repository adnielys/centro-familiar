/**
 * Planificación de recordatorios locales (función pura, sin dependencias de plataforma).
 * Genera un aviso por tarea pendiente con fecha y por pago fijo próximo, a la hora configurada.
 * iOS limita a 64 notificaciones locales pendientes: se ordenan por fecha y se recortan.
 */
import { addDays, monthOf, toMinutes } from "./dates";
import { estadoDelMes, vencimientos } from "./fijos";
import type { Gasto, GastoFijo, HHMM, ISODate, Tarea } from "./types";

export const MAX_RECORDATORIOS = 60;
export const DIAS_VISTA = 45;

export interface Recordatorio {
  /** Entero estable (iOS lo exige) derivado de la clave lógica. */
  id: number;
  clave: string;
  titulo: string;
  cuerpo: string;
  /** Momento local "YYYY-MM-DDTHH:MM". */
  cuando: string;
}

export interface EntradaRecordatorios {
  tareas: readonly Tarea[];
  fijos: readonly GastoFijo[];
  gastos: readonly Gasto[];
  hoy: ISODate;
  /** Minutos desde medianoche de "ahora", para no programar avisos ya pasados. */
  ahoraMin: number;
  hora: HHMM;
}

/** Hash FNV-1a de 31 bits: id positivo y estable a partir de un texto. */
export function idEstable(texto: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) & 0x7fffffff;
}

export function planificarRecordatorios(e: EntradaRecordatorios): Recordatorio[] {
  const limite = addDays(e.hoy, DIAS_VISTA);
  const yaPaso = (fecha: ISODate) => fecha < e.hoy || (fecha === e.hoy && toMinutes(e.hora) <= e.ahoraMin);
  const crear = (clave: string, fecha: ISODate, titulo: string, cuerpo: string): Recordatorio => ({
    id: idEstable(clave),
    clave,
    titulo,
    cuerpo,
    cuando: `${fecha}T${e.hora}`,
  });

  const deTareas = e.tareas
    .filter((t) => t.estado === "pendiente" && t.vence && t.vence <= limite && !yaPaso(t.vence))
    .map((t) => crear(`tarea:${t.id}:${t.vence}`, t.vence as ISODate, t.titulo, t.costo ? "Tarea con pago para hoy" : "Tarea para hoy"));

  const deFijos = e.fijos.filter((f) => f.activo).flatMap((f) => fechasDeFijo(f, e.gastos, e.hoy, limite)
    .filter((fecha) => !yaPaso(fecha))
    .map((fecha) => crear(`fijo:${f.id}:${fecha}`, fecha, `Pago: ${f.nombre}`, `${f.monto} ${f.moneda} · vence hoy`)));

  return [...deTareas, ...deFijos]
    .sort((a, b) => a.cuando.localeCompare(b.cuando) || a.clave.localeCompare(b.clave))
    .slice(0, MAX_RECORDATORIOS);
}

/** Vencimientos de un fijo en la ventana: los del mes actual aún no pagados y los de meses siguientes. */
function fechasDeFijo(f: GastoFijo, gastos: readonly Gasto[], hoy: ISODate, limite: ISODate): ISODate[] {
  const mesActual = monthOf(hoy);
  const estado = estadoDelMes(f, gastos, mesActual, hoy);
  const pagadas = new Set(vencimientos(f, mesActual).slice(0, estado.pagos));
  const meses = mesesEntre(mesActual, monthOf(limite));
  return meses
    .flatMap((ym) => vencimientos(f, ym))
    .filter((fecha) => fecha >= hoy && fecha <= limite && !pagadas.has(fecha));
}

function mesesEntre(desde: string, hasta: string): string[] {
  const out: string[] = [];
  let [y, m] = desde.split("-").map(Number);
  for (;;) {
    const ym = `${y}-${String(m).padStart(2, "0")}`;
    out.push(ym);
    if (ym >= hasta) return out;
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
}
