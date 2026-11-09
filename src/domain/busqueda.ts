/** Búsqueda y paginación de listas (sin acentos ni mayúsculas). */
import type { Gasto } from "./types";

export const normalizar = (s: string): string => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

/**
 * Filtra gastos cuyo texto (descripción, categoría, método, hijo, moneda, fecha o importe)
 * contiene todas las palabras de la búsqueda.
 */
export function buscarGastos(gastos: readonly Gasto[], consulta: string, nombreHijo: (id: string | null) => string = () => ""): Gasto[] {
  const palabras = normalizar(consulta).split(/\s+/).filter(Boolean);
  if (!palabras.length) return [...gastos];
  return gastos.filter((g) => {
    const texto = normalizar(
      [g.descripcion, g.categoria, g.metodo === "banca_remota" ? "banca remota" : "efectivo", g.naturaleza === "fijo" ? "base fijo" : "variable",
        nombreHijo(g.hijoId), g.moneda, g.fecha, String(g.monto), g.monto.toFixed(2)].join(" "),
    );
    return palabras.every((p) => texto.includes(p));
  });
}

export interface Pagina<T> {
  items: T[];
  pagina: number;
  paginas: number;
  total: number;
  desde: number;
  hasta: number;
}

/** Página `pagina` (1-based, acotada al rango válido) de `porPagina` elementos. */
export function paginar<T>(items: readonly T[], pagina: number, porPagina: number): Pagina<T> {
  const paginas = Math.max(1, Math.ceil(items.length / porPagina));
  const actual = Math.min(Math.max(1, pagina), paginas);
  const inicio = (actual - 1) * porPagina;
  const slice = items.slice(inicio, inicio + porPagina);
  return { items: slice, pagina: actual, paginas, total: items.length, desde: items.length ? inicio + 1 : 0, hasta: inicio + slice.length };
}
