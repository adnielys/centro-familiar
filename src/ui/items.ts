/** Filas de lista reutilizadas por varias vistas. */
import { AREAS, METODOS, TIPOS_ACTIVIDAD, TIPOS_DEBER } from "../domain/catalog";
import { fmtDate } from "../domain/dates";
import type { Actividad, Deber, Gasto, ISODate, Tarea } from "../domain/types";
import { store } from "../data/store";
import { chip, delBtn, dueChip, esc, fmtMoney, kidChip, kidColor } from "./dom";

export function tareaItem(t: Tarea, today: ISODate, opts: { agendar?: boolean } = {}): string {
  const done = t.estado === "hecha";
  return `<li class="${done ? "done" : ""}">
    <input type="checkbox" data-toggle="tareas" data-id="${esc(t.id)}" ${done ? "checked" : ""} aria-label="Marcar «${esc(t.titulo)}» como hecha">
    <div class="grow"><div class="title">${esc(t.titulo)}</div>
      <div class="chips">${done ? "" : dueChip(t.vence, today)}${chip(AREAS[t.area])}${t.prioridad === "alta" ? chip("Alta", "bad") : ""}${kidChip(store.byId("hijos", t.hijoId))}</div>
    </div>
    ${!done && opts.agendar ? `<button class="icon-btn accent" type="button" data-agendar="${esc(t.id)}">Agendar</button>` : ""}
    ${delBtn("tareas", t.id)}</li>`;
}

export function deberItem(d: Deber, today: ISODate, showKid: boolean): string {
  const done = d.estado === "hecha";
  return `<li class="${done ? "done" : ""}">
    <input type="checkbox" data-toggle="deberes" data-id="${esc(d.id)}" ${done ? "checked" : ""} aria-label="Marcar ${esc(d.materia)} como hecho">
    <div class="grow"><div class="title">${esc(d.materia)}${d.descripcion ? ` · <span class="muted">${esc(d.descripcion)}</span>` : ""}</div>
      <div class="chips">${showKid ? kidChip(store.byId("hijos", d.hijoId)) : ""}${chip(TIPOS_DEBER[d.tipo], d.tipo === "examen" ? "warn" : "")}${done ? "" : dueChip(d.entrega, today)}</div>
    </div>${delBtn("deberes", d.id)}</li>`;
}

export function gastoItem(g: Gasto, showDate = true): string {
  return `<li>
    <div class="grow"><div class="title">${esc(g.descripcion || g.categoria)}</div>
      <div class="chips">${showDate ? chip(fmtDate(g.fecha)) : ""}${chip(g.categoria)}${chip(METODOS[g.metodo])}${kidChip(store.byId("hijos", g.hijoId))}</div>
    </div>
    <span class="amount">${esc(fmtMoney(g.monto, g.moneda))}</span>${delBtn("gastos", g.id)}</li>`;
}

export function actividadItem(a: Actividad): string {
  const kid = store.byId("hijos", a.hijoId);
  const horario = a.horaFin ? `${a.horaInicio}–${a.horaFin}` : a.horaInicio;
  return `<li>
    <span class="stripe" style="background:${esc(kidColor(kid))}"></span>
    <span class="time">${esc(a.horaInicio)}</span>
    <div class="grow"><div class="title">${esc(a.titulo)}</div>
      <div class="chips">${kidChip(kid)}${chip(TIPOS_ACTIVIDAD[a.tipo])}${chip(horario)}${a.lugar ? chip(a.lugar) : ""}${a.meOcupa ? chip("Te ocupa", "warn") : ""}</div>
      ${a.llevar ? `<div class="small muted">Llevar: ${esc(a.llevar)}</div>` : ""}
    </div></li>`;
}
