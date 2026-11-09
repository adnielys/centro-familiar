import { AREAS, PRIORIDADES } from "../../domain/catalog";
import { todayISO } from "../../domain/dates";
import type { Area, Estado, Prioridad, Tarea } from "../../domain/types";
import { store } from "../../data/store";
import { attempt, emptyLi, formValues, kidOptions, optionsHtml, qs, toast } from "../dom";
import { tareaItem } from "../items";
import type { View } from "../router";
import { tareasPorEstado } from "../selectors";

let root: HTMLElement;
let filtro: Estado = "pendiente";
/** Tarea que se está editando (null = creando una nueva). */
let editandoId: string | null = null;

export const tareasView: View = {
  id: "tareas",
  label: "Tareas",

  mount(el) {
    root = el;
    el.innerHTML = `
      <div class="card" id="tareaCard">
        <h2 id="tareaTitulo">Nueva tarea</h2>
        <form id="formTarea" autocomplete="off">
          <label for="tTitulo">Qué hay que hacer <input id="tTitulo" name="titulo" required maxlength="160" placeholder="Pagar la luz"></label>
          <div class="row">
            <label for="tArea">Área <select id="tArea" name="area">${optionsHtml(Object.entries(AREAS), "personal")}</select></label>
            <label for="tPrioridad">Prioridad <select id="tPrioridad" name="prioridad">${optionsHtml(Object.entries(PRIORIDADES), "media")}</select></label>
            <label for="tVence">Fecha límite <input id="tVence" name="vence" type="date"></label>
            <label for="tHijo">Hijo (opcional) <select id="tHijo" name="hijoId"></select></label>
          </div>
          <div class="actions">
            <button class="btn" type="submit" id="tGuardar">Añadir tarea</button>
            <button class="btn ghost" type="button" id="tCancelar" hidden>Cancelar edición</button>
          </div>
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

    qs<HTMLFormElement>("#formTarea", el).addEventListener("submit", (e) => {
      e.preventDefault();
      void guardar(e.target as HTMLFormElement);
    });
    qs<HTMLButtonElement>("#tCancelar", el).addEventListener("click", () => salirDeEdicion());

    el.addEventListener("click", (e) => {
      const t = e.target as HTMLElement;
      const f = t.closest<HTMLElement>("[data-filter]");
      if (f) {
        filtro = f.dataset.filter as Estado;
        this.update();
        return;
      }
      const ed = t.closest<HTMLElement>("[data-edit-tarea]");
      const tarea = ed ? store.byId("tareas", ed.dataset.editTarea) : undefined;
      if (tarea) editar(tarea);
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
      ? items.map((t) => tareaItem(t, today, { agendar: true, editar: true })).join("")
      : emptyLi(filtro === "pendiente" ? "No tienes tareas pendientes." : "Todavía no has completado tareas.");
  },
};

function editar(t: Tarea): void {
  editandoId = t.id;
  const form = qs<HTMLFormElement>("#formTarea", root);
  const set = (name: string, value: string): void => {
    (form.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement).value = value;
  };
  set("titulo", t.titulo);
  set("area", t.area);
  set("prioridad", t.prioridad);
  set("vence", t.vence ?? "");
  set("hijoId", t.hijoId ?? "");
  setModo(true);
  qs("#tareaCard", root).scrollIntoView({ behavior: "smooth", block: "start" });
}

function salirDeEdicion(): void {
  editandoId = null;
  qs<HTMLFormElement>("#formTarea", root).reset();
  setModo(false);
}

function setModo(editando: boolean): void {
  qs("#tareaTitulo", root).textContent = editando ? "Editar tarea" : "Nueva tarea";
  qs("#tGuardar", root).textContent = editando ? "Guardar cambios" : "Añadir tarea";
  qs("#tCancelar", root).hidden = !editando;
}

async function guardar(form: HTMLFormElement): Promise<void> {
  const v = formValues(form);
  if (!v.titulo) return toast("Escribe qué hay que hacer.");
  const datos = { titulo: v.titulo, area: v.area as Area, prioridad: v.prioridad as Prioridad, vence: v.vence || null, hijoId: v.hijoId || null };
  const id = editandoId;
  const ok = await attempt(
    () => (id ? store.update("tareas", id, datos) : store.add("tareas", { ...datos, estado: "pendiente", completada: null })),
    id ? "Cambios guardados" : "Tarea añadida",
  );
  if (ok) salirDeEdicion();
}
