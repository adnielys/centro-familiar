import { todayISO } from "../domain/dates";
import type { GastoFijo } from "../domain/types";
import { store } from "../data/store";

/** Registra hoy el pago de un gasto fijo por su importe habitual (luego se puede editar). */
export function pagarFijo(f: GastoFijo): Promise<unknown> {
  return store.add("gastos", {
    monto: f.monto,
    moneda: f.moneda,
    metodo: f.metodo,
    categoria: f.categoria,
    descripcion: f.nombre,
    fecha: todayISO(),
    hijoId: f.hijoIds.length === 1 ? f.hijoIds[0] : null,
    origen: "fijo",
    naturaleza: "fijo",
    fijoId: f.id,
  });
}
