/** Consultas derivadas del estado, compartidas por varias vistas. */
import { PRIORIDAD_ORDEN } from "../domain/catalog";
import { addDays, isoWeekday, monthOf } from "../domain/dates";
import type { Actividad, Deber, Estado, Gasto, ISODate, Moneda, Tarea } from "../domain/types";
import { store } from "../data/store";

export function tareasPorEstado(estado: Estado): Tarea[] {
  return store.data.tareas
    .filter((t) => t.estado === estado)
    .sort((a, b) => (a.vence ?? "9999").localeCompare(b.vence ?? "9999") || PRIORIDAD_ORDEN[a.prioridad] - PRIORIDAD_ORDEN[b.prioridad]);
}

export const tareasUrgentes = (today: ISODate): Tarea[] => tareasPorEstado("pendiente").filter((t) => t.vence !== null && t.vence <= today);

export function actividadesDelDia(iso: ISODate, hijoId?: string): Actividad[] {
  const wd = isoWeekday(iso);
  return store.data.actividades
    .filter((a) => a.dias.includes(wd) && (!hijoId || a.hijoId === hijoId))
    .sort((a, b) => a.horaInicio.localeCompare(b.horaInicio));
}

export function deberesProximos(today: ISODate, dias = 7): Deber[] {
  const limite = addDays(today, dias);
  return store.data.deberes.filter((d) => d.estado === "pendiente" && d.entrega <= limite).sort((a, b) => a.entrega.localeCompare(b.entrega));
}

export function gastosDelMes(ym: string): Gasto[] {
  return store.data.gastos
    .filter((g) => monthOf(g.fecha) === ym)
    .sort((a, b) => b.fecha.localeCompare(a.fecha) || (b.creado ?? "").localeCompare(a.creado ?? ""));
}

export const totalEn = (gastos: readonly Gasto[], moneda: Moneda): number =>
  gastos.filter((g) => g.moneda === moneda).reduce((s, g) => s + g.monto, 0);

export function sumarPor(gastos: readonly Gasto[], key: (g: Gasto) => string): Record<string, number> {
  const acc: Record<string, number> = {};
  for (const g of gastos) acc[key(g)] = (acc[key(g)] ?? 0) + g.monto;
  return acc;
}
