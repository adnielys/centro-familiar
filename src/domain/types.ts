/** Fecha local "YYYY-MM-DD". */
export type ISODate = string;
/** Hora local "HH:MM" (24 h). */
export type HHMM = string;

export type Moneda = "CUP" | "USD";
export type Metodo = "efectivo" | "banca_remota";
export type Area = "personal" | "trabajo" | "hogar" | "hijos";
export type Prioridad = "alta" | "media" | "baja";
export type Estado = "pendiente" | "hecha";
export type TipoActividad = "escuela" | "extraescolar" | "deporte" | "medico" | "otro";
export type TipoDeber = "deber" | "examen" | "proyecto";
export type OrigenGasto = "manual" | "texto" | "ocr" | "fijo" | "tarea";
/** Fijo = gasto base comprometido (colegiaturas, clases, renta…); variable = el resto. */
export type Naturaleza = "fijo" | "variable";
export type Frecuencia = "mensual" | "quincenal" | "semanal";

export interface Entity {
  id: string;
  creado?: string;
}

export interface Hijo extends Entity {
  nombre: string;
  escuela: string;
  grado: string;
  color: string;
}

/** Costo previsto de una tarea: al completarla se confirma y se registra como gasto. */
export interface CostoTarea {
  /** Importe fijo (siempre igual) o estimado (varía: luz, agua…); el estimado se recalcula con los últimos pagos. */
  tipo: "fijo" | "estimado";
  monto: number;
  moneda: Moneda;
  metodo: Metodo;
  categoria: string;
}

export interface Tarea extends Entity {
  titulo: string;
  area: Area;
  prioridad: Prioridad;
  vence: ISODate | null;
  hijoIds: string[];
  estado: Estado;
  completada: string | null;
  costo: CostoTarea | null;
  /** Si se repite, al completarla se crea la siguiente. Con costo y repetición cuenta como gasto fijo. */
  repetir: Frecuencia | null;
  /** Gasto creado al completarla (para poder deshacer). */
  gastoId: string | null;
  /** Siguiente tarea de la serie ya creada (evita duplicarla al desmarcar y volver a marcar). */
  siguienteId: string | null;
  /** Id de la primera tarea de una serie repetida (para el historial de pagos). */
  serieId: string | null;
}

export interface Gasto extends Entity {
  monto: number;
  moneda: Moneda;
  metodo: Metodo;
  categoria: string;
  descripcion: string;
  fecha: ISODate;
  hijoId: string | null;
  origen: OrigenGasto;
  naturaleza: Naturaleza;
  /** Gasto fijo del que es un pago, si aplica. */
  fijoId: string | null;
}

export interface Actividad extends Entity {
  /** Hijos que hacen esta actividad (una misma clase puede ser de varios). */
  hijoIds: string[];
  titulo: string;
  tipo: TipoActividad;
  /** Días ISO: 1 = lunes … 7 = domingo. */
  dias: number[];
  horaInicio: HHMM;
  horaFin: HHMM | null;
  lugar: string;
  llevar: string;
  /** Si me ocupa a mí (llevar, recoger, acompañar). Cuenta como ocupado en la agenda. */
  meOcupa: boolean;
}

export interface Deber extends Entity {
  hijoId: string;
  materia: string;
  tipo: TipoDeber;
  entrega: ISODate;
  descripcion: string;
  estado: Estado;
}

/** Compromiso de pago recurrente (clases, colegiatura, renta, niñera…). */
export interface GastoFijo extends Entity {
  nombre: string;
  monto: number;
  moneda: Moneda;
  metodo: Metodo;
  categoria: string;
  frecuencia: Frecuencia;
  /** mensual/quincenal: día del mes (1–31); semanal: día ISO de la semana (1 = lunes … 7 = domingo). */
  diaPago: number;
  hijoIds: string[];
  activo: boolean;
}

/** Resumen de una moneda en un corte de mes. */
export interface ResumenMoneda {
  total: number;
  base: number;
  variable: number;
  pendiente: number;
  movimientos: number;
  categorias: Array<[string, number]>;
}

/** Corte (cierre) de un mes: foto del balance para comparar meses. id = "YYYY-MM". */
export interface Corte extends Entity {
  ym: string;
  cerrado: string;
  monedas: Record<Moneda, ResumenMoneda>;
  nota: string;
}

/** Tasa de cambio de un día: 1 USD = `usd` CUP. id = fecha "YYYY-MM-DD". */
export interface Tasa extends Entity {
  fecha: ISODate;
  usd: number;
  fuente: "eltoque" | "manual";
  actualizado: string;
}

/** Regla aprendida de una corrección: patrón de texto → categoría. */
export interface Regla extends Entity {
  patron: string;
  categoria: string;
  actualizado: string;
}

/** Bloque de tiempo agendado en la agenda. */
export interface Bloque extends Entity {
  titulo: string;
  fecha: ISODate;
  inicio: HHMM;
  fin: HHMM;
  tareaId: string | null;
}

export interface Config {
  monedaPrincipal: Moneda;
  /** Ventana del día que se considera agendable. */
  jornada: { inicio: HHMM; fin: HHMM };
  trabajo: { activo: boolean; dias: number[]; inicio: HHMM; fin: HHMM };
  /** OAuth Client ID de Google (tipo "Aplicación web") para leer Google Calendar. Vacío = desactivado. */
  googleClientId: string;
  /** Tipo de cambio: token personal de elTOQUE y/o URL de un proxy propio (si el navegador no puede llamar directo). */
  cambio: { eltoqueToken: string; proxyUrl: string };
  /** Avisos locales (solo en la app nativa): hora del aviso el día del vencimiento. */
  avisos: { activo: boolean; hora: HHMM };
  /** Balance: cuántos meses cerrados promediar (3, 6 o 12) y el % de ahorro sobre el ideal (0, 5 o 10). */
  presupuesto: { meses: number; ajuste: number };
}

export interface Collections {
  hijos: Hijo;
  tareas: Tarea;
  gastos: Gasto;
  actividades: Actividad;
  deberes: Deber;
  reglas: Regla;
  bloques: Bloque;
  fijos: GastoFijo;
  cortes: Corte;
  tasas: Tasa;
}

export type CollectionName = keyof Collections;
export const COLLECTION_NAMES: readonly CollectionName[] = ["hijos", "tareas", "gastos", "actividades", "deberes", "reglas", "bloques", "fijos", "cortes", "tasas"];

export const DEFAULT_CONFIG: Config = {
  monedaPrincipal: "CUP",
  jornada: { inicio: "07:00", fin: "22:00" },
  trabajo: { activo: true, dias: [1, 2, 3, 4, 5], inicio: "09:00", fin: "17:00" },
  googleClientId: "",
  cambio: { eltoqueToken: "", proxyUrl: "" },
  avisos: { activo: false, hora: "09:00" },
  presupuesto: { meses: 3, ajuste: 0 },
};
