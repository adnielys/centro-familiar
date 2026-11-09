/**
 * Tareas con costo y repetición: qué pasa al completarlas (gasto + siguiente de la serie).
 * Funciones puras: devuelven los datos a guardar; la capa de UI los persiste.
 */
import { addDays, daysInMonth } from "./dates";
import type { Frecuencia, Gasto, ISODate, Metodo, Moneda, Tarea } from "./types";

export type NuevoGasto = Omit<Gasto, "id" | "creado">;
export type NuevaTarea = Omit<Tarea, "id" | "creado">;

export const REPETICIONES: Record<Frecuencia, string> = { semanal: "Cada semana", quincenal: "Cada 15 días", mensual: "Cada mes" };

const pad = (n: number): string => String(n).padStart(2, "0");

/** Siguiente fecha de una serie. Mensual conserva el día (ajustado a meses cortos: 31 → 30/28). */
export function siguienteVencimiento(desde: ISODate, f: Frecuencia, diaOriginal?: number): ISODate {
  if (f === "semanal") return addDays(desde, 7);
  if (f === "quincenal") return addDays(desde, 15);
  const [y, m, d] = desde.split("-").map(Number);
  const next = new Date(y, m, 1);
  const ym = `${next.getFullYear()}-${pad(next.getMonth() + 1)}`;
  return `${ym}-${pad(Math.min(diaOriginal ?? d, daysInMonth(ym)))}`;
}

export interface Pago {
  monto: number;
  moneda: Moneda;
  metodo: Metodo;
}

/** Promedio de los últimos `n` pagos (redondeado a 2 decimales); null si no hay pagos. */
export function promedioReciente(montos: readonly number[], n = 3): number | null {
  const ultimos = montos.filter((m) => m > 0).slice(-n);
  if (!ultimos.length) return null;
  return Math.round((ultimos.reduce((a, b) => a + b, 0) / ultimos.length) * 100) / 100;
}

export interface PlanCompletar {
  /** Cambios a aplicar a la tarea (gastoId/siguienteId se rellenan al persistir). */
  patch: Pick<Tarea, "estado" | "completada">;
  gasto: NuevoGasto | null;
  siguiente: NuevaTarea | null;
}

/**
 * Qué hay que guardar al completar una tarea.
 * - Con pago: un gasto (fijo si la tarea se repite, variable si no) con la categoría del costo.
 * - Si se repite y aún no existe la siguiente: la próxima tarea de la serie, con el mismo costo previsto.
 */
export function planCompletar(t: Tarea, hoy: ISODate, ahoraISO: string, pago: Pago | null, historial: readonly number[] = []): PlanCompletar {
  const gasto: NuevoGasto | null = pago && pago.monto > 0
    ? {
        monto: Math.round(pago.monto * 100) / 100,
        moneda: pago.moneda,
        metodo: pago.metodo,
        categoria: t.costo?.categoria ?? "Otros",
        descripcion: t.titulo,
        fecha: hoy,
        hijoId: t.hijoIds.length === 1 ? t.hijoIds[0] : null,
        origen: "tarea",
        naturaleza: t.repetir ? "fijo" : "variable",
        fijoId: null,
      }
    : null;

  // Importe estimado: la próxima toma el promedio de los últimos pagos de la serie (incluido este).
  const pagos = gasto ? [...historial, gasto.monto] : [...historial];
  const estimado = t.costo?.tipo === "estimado" ? promedioReciente(pagos) : null;
  const siguiente: NuevaTarea | null = t.repetir && !t.siguienteId
    ? {
        titulo: t.titulo, area: t.area, prioridad: t.prioridad, hijoIds: [...t.hijoIds],
        costo: t.costo ? { ...t.costo, monto: estimado ?? t.costo.monto } : null,
        repetir: t.repetir,
        vence: siguienteVencimiento(t.vence ?? hoy, t.repetir),
        estado: "pendiente", completada: null, gastoId: null, siguienteId: null, serieId: t.serieId ?? t.id,
      }
    : null;

  return { patch: { estado: "hecha", completada: ahoraISO }, gasto, siguiente };
}

/** Datos por defecto de una tarea nueva. */
export const tareaVacia = (): NuevaTarea => ({
  titulo: "", area: "personal", prioridad: "media", vence: null, hijoIds: [], estado: "pendiente", completada: null,
  costo: null, repetir: null, gastoId: null, siguienteId: null, serieId: null,
});
