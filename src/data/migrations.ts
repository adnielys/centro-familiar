/**
 * Migraciones de datos guardados por versiones anteriores de la app.
 * Se aplican al cargar (y al importar una copia), así que son idempotentes.
 */
import type { Actividad } from "../domain/types";

type ActividadLegacy = Omit<Actividad, "hijoIds"> & { hijoIds?: string[]; hijoId?: string };

/** v0.1 → v0.2: una actividad pertenecía a un hijo (`hijoId`); ahora a varios (`hijoIds`). */
export function migrarActividad(raw: ActividadLegacy): { actividad: Actividad; cambiada: boolean } {
  if (Array.isArray(raw.hijoIds)) return { actividad: raw as Actividad, cambiada: false };
  const { hijoId, ...rest } = raw;
  return { actividad: { ...rest, hijoIds: hijoId ? [hijoId] : [] }, cambiada: true };
}
