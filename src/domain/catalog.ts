import type { Area, Metodo, Moneda, Prioridad, TipoActividad, TipoDeber } from "./types";

export const MONEDAS: readonly Moneda[] = ["CUP", "USD"];
export const METODOS: Record<Metodo, string> = { efectivo: "Efectivo", banca_remota: "Banca Remota" };
export const CATEGORIAS: readonly string[] = ["Alimentación", "Transporte", "Hogar", "Servicios", "Salud", "Educación", "Ropa", "Ocio", "Hijos", "Otros"];
export const AREAS: Record<Area, string> = { personal: "Personal", trabajo: "Trabajo", hogar: "Hogar", hijos: "Hijos" };
export const PRIORIDADES: Record<Prioridad, string> = { alta: "Alta", media: "Media", baja: "Baja" };
export const PRIORIDAD_ORDEN: Record<Prioridad, number> = { alta: 0, media: 1, baja: 2 };
export const TIPOS_ACTIVIDAD: Record<TipoActividad, string> = { escuela: "Escuela", extraescolar: "Extraescolar", deporte: "Deporte", medico: "Médico", otro: "Otro" };
export const TIPOS_DEBER: Record<TipoDeber, string> = { deber: "Deber", examen: "Examen", proyecto: "Proyecto" };
export const DIAS_CORTOS: readonly string[] = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
export const COLORES_HIJO: readonly string[] = ["#C2410C", "#6D28D9", "#15803D", "#1D4ED8", "#BE185D"];
/** Duración por defecto de una actividad sin hora de fin, en minutos. */
export const DURACION_ACTIVIDAD_DEFECTO = 60;
