import type { HHMM, ISODate } from "./types";

export type Confianza = "alta" | "baja";
export type TipoPropuesta = "gasto" | "tarea" | "deber";

export interface ContextoClasificador {
  hoy: ISODate;
  hijos: ReadonlyArray<{ id: string; nombre: string }>;
  reglas: ReadonlyArray<{ patron: string; categoria: string }>;
  monedaPorDefecto: string;
}

/** Datos propuestos: la forma depende de `tipo`; se validan al guardar. */
export interface DatosPropuesta {
  [campo: string]: string | number | null | undefined;
  hora?: HHMM | null;
  duracion?: number | null;
  repetir?: "mensual" | "quincenal" | "semanal" | null;
  costoMonto?: number | null;
  costoMoneda?: string | null;
  costoMetodo?: string | null;
  costoCategoria?: string | null;
  costoTipo?: "fijo" | "estimado" | null;
}

export interface Propuesta {
  tipo: TipoPropuesta;
  datos: DatosPropuesta;
  confianza: Record<string, Confianza>;
  explicacion: string;
  origen: "texto" | "ocr";
  texto: string;
}

export function analizarTexto(texto: string, ctx: ContextoClasificador): Propuesta[];
export function analizarRecibo(ocrText: string, ctx: ContextoClasificador): Propuesta;
export function patronDeAprendizaje(descripcion: string): string | null;
export function idDeRegla(patron: string): string;
export const CATEGORIAS_CLASIFICADOR: string[];
export const MATERIAS_LISTA: string[];
export const _internals: {
  parseNumber(raw: string): number | null;
  normalize(s: string): string;
  [k: string]: unknown;
};
