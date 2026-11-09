import { COLORES_HIJO, DIAS_CORTOS, TIPOS_ACTIVIDAD, TIPOS_DEBER } from "../../domain/catalog";
import { MATERIAS_LISTA } from "../../domain/clasificador.js";
import { isoWeekday, todayISO } from "../../domain/dates";
import type { Actividad, TipoActividad, TipoDeber } from "../../domain/types";
import { store } from "../../data/store";
import { attempt, emptyLi, esc, formValues, kidColor, optionsHtml, qs, toast } from "../dom";
import { deberItem } from "../items";
import type { View } from "../router";

let root: HTMLElement;
let hijoSel: string | null = null;
/** Actividad que se está editando en el formulario (null = creando una nueva). */
let editandoId: string | null = null;

export const hijosView: View = {
  id: "hijos",
  label: "Familia",

  mount(el) {
    root = el;
    el.innerHTML = `
      <div class="card">
        <h2>Hijos</h2>
        <div class="kids" id="kidPicker"></div>
        <details id="detHijo">
          <summary>Añadir hijo</summary>
          <form id="formHijo" autocomplete="off">
            <div class="row">
              <label for="hNombre">Nombre <input id="hNombre" name="nombre" required maxlength="60"></label>
              <label for="hEscuela">Escuela <input id="hEscuela" name="escuela" maxlength="80"></label>
              <label for="hGrado">Grado <input id="hGrado" name="grado" maxlength="30" placeholder="3er grado"></label>
            </div>
            <button class="btn" type="submit">Guardar</button>
          </form>
        </details>
      </div>
      <div id="kidPanel" class="view" hidden>
        <div class="card">
          <div class="card-head"><h2 id="kidTitle"></h2><button class="icon-btn" type="button" id="delKid">Eliminar hijo</button></div>
          <div class="week-wrap"><div class="week" id="kidWeek"></div></div>
          <details id="detActividad">
            <summary id="actSummary">Añadir actividad o clase</summary>
            <form id="formActividad" autocomplete="off">
              <div class="row">
                <label for="aTitulo">Actividad <input id="aTitulo" name="titulo" required maxlength="80" placeholder="Natación"></label>
                <label for="aTipo">Tipo <select id="aTipo" name="tipo">${optionsHtml(Object.entries(TIPOS_ACTIVIDAD), "extraescolar")}</select></label>
                <label for="aLugar">Lugar <input id="aLugar" name="lugar" maxlength="80"></label>
              </div>
              <fieldset class="fieldset">
                <legend>Para</legend>
                <div class="days" id="aHijos"></div>
              </fieldset>
              <fieldset class="fieldset">
                <legend>Días</legend>
                <div class="days">${DIAS_CORTOS.map((d, i) => `<label for="dia${i + 1}"><input type="checkbox" id="dia${i + 1}" name="dia" value="${i + 1}">${d}</label>`).join("")}</div>
              </fieldset>
              <div class="row">
                <label for="aInicio">Empieza <input id="aInicio" name="horaInicio" type="time" required></label>
                <label for="aFin">Termina <input id="aFin" name="horaFin" type="time"></label>
              </div>
              <label for="aLlevar">Qué llevar <input id="aLlevar" name="llevar" maxlength="120" placeholder="Toalla, gorro, merienda"></label>
              <label class="check" for="aMeOcupa"><input type="checkbox" id="aMeOcupa" name="meOcupa" checked> Me ocupa a mí (llevar, recoger o acompañar): cuenta como ocupado en mi agenda</label>
              <div class="actions">
                <button class="btn" type="submit" id="actGuardar">Guardar actividad</button>
                <button class="btn ghost" type="button" id="actCancelar" hidden>Cancelar edición</button>
              </div>
            </form>
          </details>
        </div>
        <div class="card">
          <h2>Deberes y exámenes</h2>
          <ul class="list" id="kidDeberes"></ul>
          <details>
            <summary>Añadir deber o examen</summary>
            <form id="formDeber" autocomplete="off">
              <div class="row">
                <label for="dMateria">Materia <select id="dMateria" name="materia">${optionsHtml(MATERIAS_LISTA.map((m) => [m, m]), "Matemática")}</select></label>
                <label for="dTipo">Tipo <select id="dTipo" name="tipo">${optionsHtml(Object.entries(TIPOS_DEBER), "deber")}</select></label>
                <label for="dEntrega">Para el día <input id="dEntrega" name="entrega" type="date" required></label>
              </div>
              <label for="dDesc">Detalle <input id="dDesc" name="descripcion" maxlength="160" placeholder="Ejercicios pág. 34"></label>
              <button class="btn" type="submit">Guardar</button>
            </form>
          </details>
        </div>
      </div>`;

    el.addEventListener("click", (e) => {
      const t = e.target as HTMLElement;
      const kidBtn = t.closest<HTMLElement>("[data-kid]");
      if (kidBtn) {
        hijoSel = kidBtn.dataset.kid ?? null;
        salirDeEdicion();
        this.update();
        return;
      }
      const editBtn = t.closest<HTMLElement>("[data-edit-act]");
      if (editBtn?.dataset.editAct) return editarActividad(editBtn.dataset.editAct);
      const quitarBtn = t.closest<HTMLButtonElement>("[data-quitar-act]");
      if (quitarBtn?.dataset.quitarAct) return quitarDeHijo(quitarBtn, quitarBtn.dataset.quitarAct);
    });

    // Las clases de escuela normalmente no te ocupan; el resto sí (llevar/recoger).
    qs<HTMLSelectElement>("#aTipo", el).addEventListener("change", (e) => {
      qs<HTMLInputElement>("#aMeOcupa", el).checked = (e.target as HTMLSelectElement).value !== "escuela";
    });

    qs<HTMLFormElement>("#formHijo", el).addEventListener("submit", async (e) => {
      e.preventDefault();
      const form = e.target as HTMLFormElement;
      const v = formValues(form);
      if (!v.nombre) return toast("Escribe el nombre.");
      const color = COLORES_HIJO[store.data.hijos.length % COLORES_HIJO.length];
      const ok = await attempt(async () => {
        hijoSel = (await store.add("hijos", { nombre: v.nombre, escuela: v.escuela, grado: v.grado, color })).id;
      }, `${v.nombre} añadido`);
      if (ok) {
        form.reset();
        qs<HTMLDetailsElement>("#detHijo", el).open = false;
      }
    });

    qs<HTMLFormElement>("#formActividad", el).addEventListener("submit", (e) => {
      e.preventDefault();
      void guardarActividad(e.target as HTMLFormElement);
    });
    qs<HTMLButtonElement>("#actCancelar", el).addEventListener("click", () => salirDeEdicion());

    qs<HTMLFormElement>("#formDeber", el).addEventListener("submit", async (e) => {
      e.preventDefault();
      const form = e.target as HTMLFormElement;
      const v = formValues(form);
      if (!hijoSel) return;
      const ok = await attempt(
        () => store.add("deberes", { hijoId: hijoSel as string, materia: v.materia, tipo: v.tipo as TipoDeber, entrega: v.entrega, descripcion: v.descripcion, estado: "pendiente" }),
        "Guardado",
      );
      if (ok) form.reset();
    });

    const delKid = qs<HTMLButtonElement>("#delKid", el);
    delKid.addEventListener("click", () => {
      if (!hijoSel) return;
      if (!delKid.dataset.armed) {
        delKid.dataset.armed = "1";
        delKid.textContent = "¿Seguro? Se borran su horario y deberes";
        setTimeout(() => {
          delete delKid.dataset.armed;
          delKid.textContent = "Eliminar hijo";
        }, 4000);
        return;
      }
      const id = hijoSel;
      void attempt(() => removeKidCascade(id), "Eliminado");
    });
  },

  update() {
    const kids = store.data.hijos;
    if (hijoSel && !store.byId("hijos", hijoSel)) hijoSel = null;
    if (!hijoSel && kids.length) hijoSel = kids[0].id;

    qs("#kidPicker", root).innerHTML = kids.length
      ? kids.map((k) => `<button type="button" class="kid-btn" data-kid="${esc(k.id)}" style="color:${esc(kidColor(k))}" aria-pressed="${k.id === hijoSel}">${esc(k.nombre)}</button>`).join("")
      : `<p class="empty">Añade a tus hijos para organizar sus horarios, deberes y gastos.</p>`;
    if (!kids.length) qs<HTMLDetailsElement>("#detHijo", root).open = true;

    const kid = store.byId("hijos", hijoSel);
    qs("#kidPanel", root).hidden = !kid;
    if (!kid) return;

    renderHijosDelFormulario();

    const today = todayISO();
    const wdHoy = isoWeekday(today);
    qs("#kidTitle", root).textContent = `Horario de ${kid.nombre}${kid.grado ? ` · ${kid.grado}` : ""}`;
    qs("#kidWeek", root).innerHTML = DIAS_CORTOS.map((label, i) => {
      const wd = i + 1;
      const acts = store.data.actividades.filter((a) => a.hijoIds.includes(kid.id) && a.dias.includes(wd)).sort((a, b) => a.horaInicio.localeCompare(b.horaInicio));
      return `<div class="day-col${wd === wdHoy ? " is-today" : ""}"><h3>${label}</h3>${acts.map((a) => slotHtml(a, kid.id)).join("") || `<span class="muted small">—</span>`}</div>`;
    }).join("");

    const deberes = store.data.deberes
      .filter((d) => d.hijoId === kid.id)
      .sort((a, b) => Number(a.estado === "hecha") - Number(b.estado === "hecha") || a.entrega.localeCompare(b.entrega));
    qs("#kidDeberes", root).innerHTML = deberes.length ? deberes.map((d) => deberItem(d, today, false)).join("") : emptyLi("Sin deberes ni exámenes registrados.");
  },
};

function slotHtml(a: Actividad, kidId: string): string {
  const otros = a.hijoIds.filter((id) => id !== kidId).map((id) => store.byId("hijos", id)?.nombre).filter(Boolean);
  const color = kidColor(store.byId("hijos", kidId));
  return `<div class="slot${editandoId === a.id ? " editing" : ""}" style="border-color:${esc(color)}">
    <strong>${esc(a.horaInicio)}</strong> ${esc(a.titulo)}
    ${a.lugar ? `<div class="muted">${esc(a.lugar)}</div>` : ""}
    ${otros.length ? `<div class="muted">Con ${esc(otros.join(", "))}</div>` : ""}
    ${a.meOcupa ? `<div class="muted">Te ocupa</div>` : ""}
    <div class="slot-actions">
      <button class="icon-btn accent" type="button" data-edit-act="${esc(a.id)}">Editar</button>
      <button class="icon-btn" type="button" data-quitar-act="${esc(a.id)}">Quitar</button>
    </div>
  </div>`;
}

/** Casillas "Para" con todos los hijos; conserva lo marcado salvo al cambiar de modo. */
function renderHijosDelFormulario(seleccion?: readonly string[]): void {
  const cont = qs("#aHijos", root);
  const marcados = seleccion ?? (cont.childElementCount
    ? Array.from(cont.querySelectorAll<HTMLInputElement>("input:checked")).map((i) => i.value)
    : hijoSel ? [hijoSel] : []);
  cont.innerHTML = store.data.hijos.map((k) => `<label for="ah-${esc(k.id)}"><input type="checkbox" id="ah-${esc(k.id)}" name="hijo" value="${esc(k.id)}"${marcados.includes(k.id) ? " checked" : ""}>${esc(k.nombre)}</label>`).join("");
}

function editarActividad(id: string): void {
  const a = store.byId("actividades", id);
  if (!a) return;
  editandoId = id;
  const form = qs<HTMLFormElement>("#formActividad", root);
  const set = (name: string, value: string): void => {
    (form.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement).value = value;
  };
  set("titulo", a.titulo);
  set("tipo", a.tipo);
  set("lugar", a.lugar);
  set("horaInicio", a.horaInicio);
  set("horaFin", a.horaFin ?? "");
  set("llevar", a.llevar);
  qs<HTMLInputElement>("#aMeOcupa", form).checked = a.meOcupa;
  form.querySelectorAll<HTMLInputElement>('input[name="dia"]').forEach((i) => (i.checked = a.dias.includes(Number(i.value))));
  renderHijosDelFormulario(a.hijoIds);
  setModoEdicion(true, a.titulo);
  const det = qs<HTMLDetailsElement>("#detActividad", root);
  det.open = true;
  det.scrollIntoView({ behavior: "smooth", block: "start" });
  hijosView.update();
}

function salirDeEdicion(): void {
  editandoId = null;
  const form = qs<HTMLFormElement>("#formActividad", root);
  form.reset();
  renderHijosDelFormulario(hijoSel ? [hijoSel] : []);
  setModoEdicion(false);
  hijosView.update();
}

function setModoEdicion(editando: boolean, titulo = ""): void {
  qs("#actSummary", root).textContent = editando ? `Editando: ${titulo}` : "Añadir actividad o clase";
  qs("#actGuardar", root).textContent = editando ? "Guardar cambios" : "Guardar actividad";
  qs("#actCancelar", root).hidden = !editando;
}

async function guardarActividad(form: HTMLFormElement): Promise<void> {
  const v = formValues(form);
  const dias = Array.from(form.querySelectorAll<HTMLInputElement>('input[name="dia"]:checked')).map((i) => Number(i.value));
  const hijoIds = Array.from(form.querySelectorAll<HTMLInputElement>('input[name="hijo"]:checked')).map((i) => i.value);
  if (!hijoIds.length) return toast("Elige al menos un hijo en «Para».");
  if (!dias.length) return toast("Elige al menos un día.");
  if (v.horaFin && v.horaFin <= v.horaInicio) return toast("La hora de fin debe ser posterior al inicio.");
  const datos: Omit<Actividad, "id" | "creado"> = {
    hijoIds, titulo: v.titulo, tipo: v.tipo as TipoActividad, dias, horaInicio: v.horaInicio,
    horaFin: v.horaFin || null, lugar: v.lugar, llevar: v.llevar, meOcupa: qs<HTMLInputElement>("#aMeOcupa", form).checked,
  };
  const id = editandoId;
  const ok = await attempt(() => (id ? store.update("actividades", id, datos) : store.add("actividades", datos)), id ? "Cambios guardados" : "Actividad guardada");
  if (ok) salirDeEdicion();
}

/** Quita la actividad del horario de este hijo; si no le queda ningún hijo, se borra. Dos toques. */
function quitarDeHijo(btn: HTMLButtonElement, id: string): void {
  const a = store.byId("actividades", id);
  if (!a || !hijoSel) return;
  if (!btn.dataset.armed) {
    btn.dataset.armed = "1";
    btn.textContent = "¿Seguro?";
    setTimeout(() => {
      if (!btn.isConnected) return;
      delete btn.dataset.armed;
      btn.textContent = "Quitar";
    }, 3000);
    return;
  }
  const restantes = a.hijoIds.filter((h) => h !== hijoSel);
  if (editandoId === id) salirDeEdicion();
  void attempt(() => (restantes.length ? store.update("actividades", id, { hijoIds: restantes }) : store.remove("actividades", id)), "Quitado del horario");
}

/** Al borrar un hijo: sale de sus actividades (se borran si quedan sin hijos) y se borran sus deberes; gastos y tareas quedan sin asignar. */
async function removeKidCascade(kidId: string): Promise<void> {
  for (const a of store.data.actividades.filter((x) => x.hijoIds.includes(kidId))) {
    const restantes = a.hijoIds.filter((h) => h !== kidId);
    if (restantes.length) await store.update("actividades", a.id, { hijoIds: restantes });
    else await store.remove("actividades", a.id);
  }
  for (const d of store.data.deberes.filter((x) => x.hijoId === kidId)) await store.remove("deberes", d.id);
  for (const g of store.data.gastos.filter((x) => x.hijoId === kidId)) await store.update("gastos", g.id, { hijoId: null });
  for (const t of store.data.tareas.filter((x) => x.hijoIds.includes(kidId))) await store.update("tareas", t.id, { hijoIds: t.hijoIds.filter((h) => h !== kidId) });
  await store.remove("hijos", kidId);
  hijoSel = null;
}
