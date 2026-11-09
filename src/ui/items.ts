/** Filas de lista reutilizadas por varias vistas. */
import { AREAS, METODOS, TIPOS_ACTIVIDAD, TIPOS_DEBER } from "../domain/catalog";
import { REPETICIONES } from "../domain/tareas";
import { fmtDate } from "../domain/dates";
import type { Actividad, Deber, Gasto, ISODate, Tarea } from "../domain/types";
import { store } from "../data/store";
import { chip, delBtn, dueChip, esc, fmtMoney, kidChip, kidColor } from "./dom";

export function tareaItem(t: Tarea, today: ISODate, opts: { agendar?: boolean; editar?: boolean } = {}): string {
  const done = t.estado === "hecha";
  const gasto = done ? store.byId("gastos", t.gastoId) : undefined;
  const costo = gasto
    ? `<span class="pill ok">Pagado ${esc(fmtMoney(gasto.monto, gasto.moneda))}</span>`
    : t.costo && !done ? `<span class="pill">${t.costo.tipo === "estimado" ? `≈${esc(fmtMoney(t.costo.monto, t.costo.moneda))} estimado` : esc(fmtMoney(t.costo.monto, t.costo.moneda))}</span>` : "";
  const bloque = store.data.bloques.find((b) => b.tareaId === t.id);
  return `<li class="${done ? "done" : ""}">
    <input type="checkbox" class="round-check" data-toggle="tareas" data-id="${esc(t.id)}" ${done ? "checked" : ""} aria-label="Marcar «${esc(t.titulo)}» como hecha">
    <div class="grow"><div class="title">${esc(t.titulo)}</div>
      <div class="chips">${done ? "" : dueChip(t.vence, today)}${bloque && !done ? chip(bloque.inicio) : ""}${t.repetir ? chip(REPETICIONES[t.repetir]) : ""}${t.area !== "hijos" ? chip(AREAS[t.area]) : ""}${t.prioridad === "alta" ? chip("Alta", "bad") : ""}${t.hijoIds.map((id) => kidChip(store.byId("hijos", id))).join("")}</div>
      <div class="item-foot">
        ${costo}
        <span class="item-actions">
          ${!done && opts.agendar ? `<button class="icon-btn accent" type="button" data-agendar="${esc(t.id)}">Agendar</button>` : ""}
          ${opts.editar ? `<button class="icon-btn" type="button" data-edit-tarea="${esc(t.id)}">Editar</button>` : ""}
          ${delBtn("tareas", t.id)}
        </span>
      </div>
    </div></li>`;
}

export function deberItem(d: Deber, today: ISODate, showKid: boolean): string {
  const done = d.estado === "hecha";
  return `<li class="${done ? "done" : ""}">
    <input type="checkbox" data-toggle="deberes" data-id="${esc(d.id)}" ${done ? "checked" : ""} aria-label="Marcar ${esc(d.materia)} como hecho">
    <div class="grow"><div class="title">${esc(d.materia)}${d.descripcion ? ` · <span class="muted">${esc(d.descripcion)}</span>` : ""}</div>
      <div class="chips">${showKid ? kidChip(store.byId("hijos", d.hijoId)) : ""}${chip(TIPOS_DEBER[d.tipo], d.tipo === "examen" ? "warn" : "")}${done ? "" : dueChip(d.entrega, today)}</div>
    </div>${delBtn("deberes", d.id)}</li>`;
}

export function gastoItem(g: Gasto, opts: { fecha?: boolean; editar?: boolean } = {}): string {
  const { fecha = true, editar = false } = opts;
  return `<li>
    <div class="grow"><div class="title">${esc(g.descripcion || g.categoria)}</div>
      <div class="chips">${fecha ? chip(fmtDate(g.fecha)) : ""}${g.naturaleza === "fijo" ? chip("Base", "ok") : ""}${chip(g.categoria)}${chip(METODOS[g.metodo])}${kidChip(store.byId("hijos", g.hijoId))}</div>
    </div>
    <div class="row-actions col">
      <span class="amount">${esc(fmtMoney(g.monto, g.moneda))}</span>
      <div class="row-actions">
        ${editar ? `<button class="icon-btn" type="button" data-edit-gasto="${esc(g.id)}">Editar</button>` : ""}
        ${delBtn("gastos", g.id)}
      </div>
    </div></li>`;
}

export function actividadItem(a: Actividad): string {
  const kids = a.hijoIds.map((id) => store.byId("hijos", id)).filter((k): k is NonNullable<typeof k> => Boolean(k));
  const kid = kids[0];
  const horario = a.horaFin ? `${a.horaInicio}–${a.horaFin}` : a.horaInicio;
  return `<li>
    <span class="stripe" style="background:${esc(kidColor(kid))}"></span>
    <span class="time">${esc(a.horaInicio)}</span>
    <div class="grow"><div class="title">${esc(a.titulo)}</div>
      <div class="chips">${kids.map(kidChip).join("")}${chip(TIPOS_ACTIVIDAD[a.tipo])}${chip(horario)}${a.lugar ? chip(a.lugar) : ""}${a.meOcupa ? chip("Te ocupa", "warn") : ""}</div>
      ${a.llevar ? `<div class="small muted">Llevar: ${esc(a.llevar)}</div>` : ""}
    </div></li>`;
}
