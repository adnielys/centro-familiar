/**
 * Tareas por periodo: «Ahora» (lo que toca esta semana/este mes y lo vencido),
 * «Próximas» (agrupadas por mes) y «Hechas».
 */
import { MONEDAS } from "../../domain/catalog";
import { fmtMonth, todayISO } from "../../domain/dates";
import { agruparPorMes, enPeriodoActual, finDeMes } from "../../domain/periodos";
import { hechasSinGasto } from "../../domain/tareas";
import { store } from "../../data/store";
import type { Tarea } from "../../domain/types";
import { attempt, confirmTap, emptyLi, esc, numberFmt, qs } from "../dom";
import { ICONS } from "../icons";
import { tareaItem } from "../items";
import type { View } from "../router";
import { tareasPorEstado } from "../selectors";
import { abrirTareaSheet } from "../tareaSheet";
import { registrarTodosLosFijos } from "../tareaActions";

type Filtro = "ahora" | "proximas" | "hechas";
const FILTROS: Array<[Filtro, string]> = [["ahora", "Ahora"], ["proximas", "Próximas"], ["hechas", "Hechas"]];

let root: HTMLElement;
let filtro: Filtro = "ahora";

export const tareasView: View = {
  id: "tareas",
  label: "Tareas",
  icon: ICONS.tareas,

  mount(el) {
    root = el;
    el.innerHTML = `
      <div class="tiles" id="tareasTiles"></div>
      <div class="card">
        <div class="seg wide" role="group" aria-label="Filtrar tareas">
          ${FILTROS.map(([f, l]) => `<button type="button" data-filter="${f}" aria-pressed="${f === filtro}">${l} <span class="count" data-count="${f}"></span></button>`).join("")}
        </div>
        <p class="small muted" id="tareasAyuda"></p>
        <div class="notice" id="sinGasto" hidden></div>
        <ul class="list" id="listaTareas"></ul>
        <button class="btn ghost block" type="button" id="tNueva">${ICONS.mas} Nueva tarea</button>
      </div>`;

    qs<HTMLButtonElement>("#tNueva", el).addEventListener("click", () => abrirTareaSheet());
    el.addEventListener("click", (e) => {
      const todos = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-registrar-todos]");
      if (todos) {
        const pendientes = hechasSinGasto(store.data.tareas, (id) => Boolean(store.byId("gastos", id)));
        const n = pendientes.filter((t) => t.costo?.tipo === "fijo").length;
        if (!confirmTap(todos, `¿Registrar ${n} ${n === 1 ? "gasto" : "gastos"}?`)) return;
        void attempt(() => registrarTodosLosFijos(pendientes), `${n} ${n === 1 ? "gasto registrado" : "gastos registrados"}`);
        return;
      }
      const f = (e.target as HTMLElement).closest<HTMLElement>("[data-filter]");
      if (!f) return;
      filtro = f.dataset.filter as Filtro;
      this.update();
    });
  },

  update() {
    const today = todayISO();
    const pendientes = tareasPorEstado("pendiente");
    const ahora = pendientes.filter((t) => enPeriodoActual(t, today));
    const proximas = pendientes.filter((t) => !enPeriodoActual(t, today));
    const hechas = tareasPorEstado("hecha").sort((a, b) => (b.completada ?? "").localeCompare(a.completada ?? "")).slice(0, 60);

    renderTiles(ahora, today);
    const counts: Record<Filtro, number> = { ahora: ahora.length, proximas: proximas.length, hechas: hechas.length };
    root.querySelectorAll<HTMLButtonElement>("[data-filter]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.filter === filtro)));
    root.querySelectorAll<HTMLElement>("[data-count]").forEach((c) => (c.textContent = counts[c.dataset.count as Filtro] ? String(counts[c.dataset.count as Filtro]) : ""));
    qs("#tareasAyuda", root).textContent = {
      ahora: "Lo que toca ahora: las semanales de esta semana, el resto de este mes y lo vencido.",
      proximas: "Lo que viene después. Cada tarea pasa a «Ahora» cuando llega su semana o su mes.",
      hechas: "Las últimas tareas completadas.",
    }[filtro];

    renderSinGasto();
    const lista = qs("#listaTareas", root);
    if (filtro === "ahora") {
      lista.innerHTML = ahora.length ? ahora.map((t) => tareaItem(t, today, { agendar: true, editar: true })).join("") : emptyLi("Nada pendiente por ahora. Toca + para crear una tarea.");
    } else if (filtro === "proximas") {
      lista.innerHTML = proximas.length
        ? agruparPorMes(proximas).map(([ym, ts]) => `<li class="date-head">${esc(fmtMonth(ym))}</li>${ts.map((t) => tareaItem(t, today, { editar: true })).join("")}`).join("")
        : emptyLi("No hay tareas para más adelante.");
    } else {
      lista.innerHTML = hechas.length ? hechas.map((t) => tareaItem(t, today, { editar: true })).join("") : emptyLi("Todavía no has completado tareas.");
    }
  },
};

/** Aviso en «Hechas»: tareas completadas sin gasto registrado. */
function renderSinGasto(): void {
  const box = qs("#sinGasto", root);
  const sinGasto = hechasSinGasto(store.data.tareas, (id) => Boolean(store.byId("gastos", id)));
  const conCosto = sinGasto.filter((t) => t.costo?.tipo === "fijo");
  box.hidden = filtro !== "hechas" || !sinGasto.length;
  if (box.hidden) return;
  box.innerHTML = `<span>${sinGasto.length} ${sinGasto.length === 1 ? "tarea hecha no tiene" : "tareas hechas no tienen"} gasto registrado. ${conCosto.length ? "Puedes registrarlos todos de una vez o uno a uno con «Registrar gasto»." : "Toca «Registrar gasto» en cada una."}</span>
    ${conCosto.length ? `<button class="btn" type="button" data-registrar-todos>Registrar todos (${conCosto.length} con costo fijo)</button>` : ""}`;
}

function renderTiles(ahora: readonly Tarea[], today: string): void {
  const fin = finDeMes(today);
  const porPagar = ahora.filter((t) => t.costo && (!t.vence || t.vence <= fin));
  const tiles = MONEDAS.map((m) => {
    const ts = porPagar.filter((t) => t.costo?.moneda === m);
    if (!ts.length) return "";
    const total = ts.reduce((s, t) => s + (t.costo?.monto ?? 0), 0);
    return `<div class="tile"><div class="num">${esc(numberFmt.format(total))} <span class="small muted">${m}</span></div><div class="lbl">Por pagar este mes · ${ts.length} ${ts.length === 1 ? "tarea" : "tareas"}</div></div>`;
  }).join("");
  qs("#tareasTiles", root).innerHTML = `<div class="tile"><div class="num">${ahora.length}</div><div class="lbl">Pendientes ahora</div></div>${tiles}`;
}
