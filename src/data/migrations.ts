/**
 * Migraciones de datos guardados por versiones anteriores de la app.
 * Se aplican al cargar (y al importar una copia), así que son idempotentes.
 */
import type { Actividad, Gasto, Tarea } from "../domain/types";

type ActividadLegacy = Omit<Actividad, "hijoIds"> & { hijoIds?: string[]; hijoId?: string };

/** v0.1 → v0.2: una actividad pertenecía a un hijo (`hijoId`); ahora a varios (`hijoIds`). */
export function migrarActividad(raw: ActividadLegacy): { actividad: Actividad; cambiada: boolean } {
  if (Array.isArray(raw.hijoIds)) return { actividad: raw as Actividad, cambiada: false };
  const { hijoId, ...rest } = raw;
  return { actividad: { ...rest, hijoIds: hijoId ? [hijoId] : [] }, cambiada: true };
}

type GastoLegacy = Omit<Gasto, "naturaleza" | "fijoId"> & Partial<Pick<Gasto, "naturaleza" | "fijoId">>;

/** v0.2 → v0.3: los gastos se clasifican en fijo/variable y pueden ser pago de un gasto fijo. */
export function migrarGasto(raw: GastoLegacy): { gasto: Gasto; cambiada: boolean } {
  if (raw.naturaleza && raw.fijoId !== undefined) return { gasto: raw as Gasto, cambiada: false };
  return { gasto: { ...raw, naturaleza: raw.naturaleza ?? "variable", fijoId: raw.fijoId ?? null }, cambiada: true };
}

type TareaLegacy = Omit<Tarea, "hijoIds" | "costo" | "repetir" | "gastoId" | "siguienteId"> &
  Partial<Pick<Tarea, "hijoIds" | "costo" | "repetir" | "gastoId" | "siguienteId">> & { hijoId?: string | null };

/** v0.3 → v0.4: tareas para varios hijos, con costo y repetición. */
export function migrarTarea(raw: TareaLegacy): { tarea: Tarea; cambiada: boolean } {
  if (Array.isArray(raw.hijoIds) && raw.costo !== undefined && raw.repetir !== undefined && raw.gastoId !== undefined && raw.siguienteId !== undefined) {
    return { tarea: raw as Tarea, cambiada: false };
  }
  const { hijoId, ...rest } = raw;
  return {
    tarea: {
      ...rest,
      hijoIds: Array.isArray(raw.hijoIds) ? raw.hijoIds : hijoId ? [hijoId] : [],
      costo: raw.costo ?? null,
      repetir: raw.repetir ?? null,
      gastoId: raw.gastoId ?? null,
      siguienteId: raw.siguienteId ?? null,
    },
    cambiada: true,
  };
}
