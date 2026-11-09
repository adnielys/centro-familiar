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
export type OrigenGasto = "manual" | "texto" | "ocr";

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

export interface Tarea extends Entity {
  titulo: string;
  area: Area;
  prioridad: Prioridad;
  vence: ISODate | null;
  hijoId: string | null;
  estado: Estado;
  completada: string | null;
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
}

export interface Collections {
  hijos: Hijo;
  tareas: Tarea;
  gastos: Gasto;
  actividades: Actividad;
  deberes: Deber;
  reglas: Regla;
  bloques: Bloque;
}

export type CollectionName = keyof Collections;
export const COLLECTION_NAMES: readonly CollectionName[] = ["hijos", "tareas", "gastos", "actividades", "deberes", "reglas", "bloques"];

export const DEFAULT_CONFIG: Config = {
  monedaPrincipal: "CUP",
  jornada: { inicio: "07:00", fin: "22:00" },
  trabajo: { activo: true, dias: [1, 2, 3, 4, 5], inicio: "09:00", fin: "17:00" },
  googleClientId: "",
};
