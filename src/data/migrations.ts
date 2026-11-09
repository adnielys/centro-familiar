/**
 * Migraciones de datos guardados por versiones anteriores de la app.
 * Se aplican al cargar (y al importar una copia), así que son idempotentes.
 */
import type { Actividad, Gasto } from "../domain/types";

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
