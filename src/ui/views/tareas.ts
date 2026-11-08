import { AREAS, PRIORIDADES } from "../../domain/catalog";
import { todayISO } from "../../domain/dates";
import type { Area, Estado, Prioridad } from "../../domain/types";
import { store } from "../../data/store";
import { attempt, emptyLi, formValues, kidOptions, optionsHtml, qs, toast } from "../dom";
import { tareaItem } from "../items";
import type { View } from "../router";
import { tareasPorEstado } from "../selectors";

let root: HTMLElement;
let filtro: Estado = "pendiente";

export const tareasView: View = {
  id: "tareas",
  label: "Tareas",

  mount(el) {
    root = el;
    el.innerHTML = `
      <div class="card">
        <h2>Nueva tarea</h2>
        <form id="formTarea" autocomplete="off">
          <label for="tTitulo">Qué hay que hacer <input id="tTitulo" name="titulo" required maxlength="160" placeholder="Pagar la luz"></label>
          <div class="row">
            <label for="tArea">Área <select id="tArea" name="area">${optionsHtml(Object.entries(AREAS), "personal")}</select></label>
            <label for="tPrioridad">Prioridad <select id="tPrioridad" name="prioridad">${optionsHtml(Object.entries(PRIORIDADES), "media")}</select></label>
            <label for="tVence">Fecha límite <input id="tVence" name="vence" type="date"></label>
            <label for="tHijo">Hijo (opcional) <select id="tHijo" name="hijoId"></select></label>
          </div>
          <button class="btn" type="submit">Añadir tarea</button>
        </form>
      </div>
      <div class="card">
        <div class="card-head">
          <h2>Mis tareas</h2>
          <div class="seg" role="group" aria-label="Filtrar tareas">
            <button type="button" data-filter="pendiente" aria-pressed="true">Pendientes</button>
            <button type="button" data-filter="hecha" aria-pressed="false">Hechas</button>
          </div>
        </div>
        <ul class="list" id="listaTareas"></ul>
      </div>`;

    qs<HTMLFormElement>("#formTarea", el).addEventListener("submit", async (e) => {
      e.preventDefault();
      const form = e.target as HTMLFormElement;
      const v = formValues(form);
      if (!v.titulo) return toast("Escribe qué hay que hacer.");
      const ok = await attempt(
        () => store.add("tareas", { titulo: v.titulo, area: v.area as Area, prioridad: v.prioridad as Prioridad, vence: v.vence || null, hijoId: v.hijoId || null, estado: "pendiente", completada: null }),
        "Tarea añadida",
      );
      if (ok) form.reset();
    });

    el.addEventListener("click", (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>("[data-filter]");
      if (!b) return;
      filtro = b.dataset.filter as Estado;
      this.update();
    });
  },

  update() {
    const sel = qs<HTMLSelectElement>("#tHijo", root);
    const current = sel.value;
    sel.innerHTML = optionsHtml(kidOptions(store.data.hijos), current);
    root.querySelectorAll<HTMLButtonElement>("[data-filter]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.filter === filtro)));
    const today = todayISO();
    const items = tareasPorEstado(filtro);
    if (filtro === "hecha") items.sort((a, b) => (b.completada ?? "").localeCompare(a.completada ?? ""));
    qs("#listaTareas", root).innerHTML = items.length
      ? items.map((t) => tareaItem(t, today, { agendar: true })).join("")
      : emptyLi(filtro === "pendiente" ? "No tienes tareas pendientes." : "Todavía no has completado tareas.");
  },
};
