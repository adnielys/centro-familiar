/**
 * Balance de un mes por moneda: cuánto se gastó (base y variable), qué falta por pagar,
 * los mayores gastos variables y la comparación con el mes anterior.
 */
import { monthOf } from "./dates";
import { estadoDelMes, mesesHasta } from "./fijos";
import type { Gasto, GastoFijo, ISODate, Moneda, ResumenMoneda, Tarea } from "./types";

export interface Pendiente {
  titulo: string;
  monto: number;
  fecha: ISODate | null;
  estimado: boolean;
  fuente: "tarea" | "fijo";
}

export interface Balance extends ResumenMoneda {
  moneda: Moneda;
  ym: string;
  porMetodo: Record<string, number>;
  mayores: Gasto[];
  pendientes: Pendiente[];
  anterior: number;
  /** Variación del total frente al mes anterior en %, o null si el mes anterior fue 0. */
  variacion: number | null;
}

const r2 = (n: number): number => Math.round(n * 100) / 100;
const sumar = (gs: readonly Gasto[]): number => r2(gs.reduce((s, g) => s + g.monto, 0));

export function balanceDelMes(
  datos: { gastos: readonly Gasto[]; tareas: readonly Tarea[]; fijos: readonly GastoFijo[] },
  ym: string,
  moneda: Moneda,
  hoy: ISODate,
): Balance {
  const delMes = datos.gastos.filter((g) => g.moneda === moneda && monthOf(g.fecha) === ym);
  const base = delMes.filter((g) => g.naturaleza === "fijo");
  const variable = delMes.filter((g) => g.naturaleza !== "fijo");

  const categorias = new Map<string, number>();
  for (const g of delMes) categorias.set(g.categoria, r2((categorias.get(g.categoria) ?? 0) + g.monto));
  const porMetodo: Record<string, number> = {};
  for (const g of delMes) porMetodo[g.metodo] = r2((porMetodo[g.metodo] ?? 0) + g.monto);

  const finMes = `${ym}-31`;
  const pendientesTareas: Pendiente[] = datos.tareas
    .filter((t) => t.estado === "pendiente" && t.costo?.moneda === moneda && (!t.vence || t.vence <= finMes))
    .map((t) => ({ titulo: t.titulo, monto: t.costo?.monto ?? 0, fecha: t.vence, estimado: t.costo?.tipo === "estimado", fuente: "tarea" as const }));
  const pendientesFijos: Pendiente[] = datos.fijos
    .filter((f) => f.activo && f.moneda === moneda)
    .flatMap((f) => {
      const e = estadoDelMes(f, datos.gastos, ym, hoy);
      const faltan = e.esperados - e.pagos;
      return faltan > 0 ? [{ titulo: f.nombre, monto: r2(f.monto * faltan), fecha: e.proximo, estimado: false, fuente: "fijo" as const }] : [];
    });
  const pendientes = [...pendientesTareas, ...pendientesFijos].sort((a, b) => (a.fecha ?? "9999").localeCompare(b.fecha ?? "9999"));

  const [prev] = mesesHasta(ym, 2);
  const anterior = sumar(datos.gastos.filter((g) => g.moneda === moneda && monthOf(g.fecha) === prev));
  const total = sumar(delMes);

  return {
    moneda, ym, total,
    base: sumar(base),
    variable: sumar(variable),
    pendiente: r2(pendientes.reduce((s, p) => s + p.monto, 0)),
    movimientos: delMes.length,
    categorias: [...categorias.entries()].sort((a, b) => b[1] - a[1]),
    porMetodo,
    mayores: [...variable].sort((a, b) => b.monto - a.monto).slice(0, 5),
    pendientes,
    anterior,
    variacion: anterior ? Math.round(((total - anterior) / anterior) * 100) : null,
  };
}

/** Lo que se guarda en un corte (sin listas detalladas). */
export const resumenDe = (b: Balance): ResumenMoneda => ({
  total: b.total, base: b.base, variable: b.variable, pendiente: b.pendiente, movimientos: b.movimientos, categorias: b.categorias.slice(0, 8),
});
