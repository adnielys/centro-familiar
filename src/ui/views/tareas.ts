import { MONEDAS } from "../../domain/catalog";
import { monthOf, todayISO } from "../../domain/dates";
import type { Estado } from "../../domain/types";
import { emptyLi, esc, numberFmt, qs } from "../dom";
import { ICONS } from "../icons";
import { tareaItem } from "../items";
import type { View } from "../router";
import { tareasPorEstado } from "../selectors";
import { abrirTareaSheet } from "../tareaSheet";

let root: HTMLElement;
let filtro: Estado = "pendiente";

export const tareasView: View = {
  id: "tareas",
  label: "Tareas",
  icon: ICONS.tareas,

  mount(el) {
    root = el;
    el.innerHTML = `
      <div class="tiles" id="tareasTiles"></div>
      <div class="card">
        <div class="card-head">
          <h2>Mis tareas</h2>
          <div class="seg" role="group" aria-label="Filtrar tareas">
            <button type="button" data-filter="pendiente" aria-pressed="true">Pendientes</button>
            <button type="button" data-filter="hecha" aria-pressed="false">Hechas</button>
          </div>
        </div>
        <ul class="list" id="listaTareas"></ul>
        <button class="btn ghost block" type="button" id="tNueva">${ICONS.mas} Nueva tarea</button>
      </div>`;

    qs<HTMLButtonElement>("#tNueva", el).addEventListener("click", () => abrirTareaSheet());
    el.addEventListener("click", (e) => {
      const f = (e.target as HTMLElement).closest<HTMLElement>("[data-filter]");
      if (!f) return;
      filtro = f.dataset.filter as Estado;
      this.update();
    });
  },

  update() {
    const today = todayISO();
    const ym = monthOf(today);
    const pendientes = tareasPorEstado("pendiente");
    // Lo que falta por pagar este mes (tareas con costo que vencen este mes o ya vencidas).
    const porPagar = pendientes.filter((t) => t.costo && (!t.vence || t.vence <= `${ym}-31`));
    const tiles = MONEDAS.map((m) => {
      const lista = porPagar.filter((t) => t.costo?.moneda === m);
      return lista.length
        ? `<div class="tile"><div class="num">${esc(numberFmt.format(lista.reduce((s, t) => s + (t.costo?.monto ?? 0), 0)))} <span class="small muted">${m}</span></div><div class="lbl">Por pagar este mes · ${lista.length} ${lista.length === 1 ? "tarea" : "tareas"}</div></div>`
        : "";
    }).join("");
    qs("#tareasTiles", root).innerHTML = `<div class="tile"><div class="num">${pendientes.length}</div><div class="lbl">Pendientes</div></div>${tiles}`;

    root.querySelectorAll<HTMLButtonElement>("[data-filter]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.filter === filtro)));
    const items = filtro === "pendiente" ? pendientes : tareasPorEstado("hecha").sort((a, b) => (b.completada ?? "").localeCompare(a.completada ?? ""));
    qs("#listaTareas", root).innerHTML = items.length
      ? items.map((t) => tareaItem(t, today, { agendar: true, editar: true })).join("")
      : emptyLi(filtro === "pendiente" ? "No tienes tareas pendientes. Toca + para crear una." : "Todavía no has completado tareas.");
  },
};
