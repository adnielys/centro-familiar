import { COLORES_HIJO, DIAS_CORTOS, TIPOS_ACTIVIDAD, TIPOS_DEBER } from "../../domain/catalog";
import { MATERIAS_LISTA } from "../../domain/clasificador.js";
import { isoWeekday, todayISO } from "../../domain/dates";
import type { TipoActividad, TipoDeber } from "../../domain/types";
import { store } from "../../data/store";
import { attempt, delBtn, emptyLi, esc, formValues, kidColor, optionsHtml, qs, toast } from "../dom";
import { deberItem } from "../items";
import type { View } from "../router";

let root: HTMLElement;
let hijoSel: string | null = null;

export const hijosView: View = {
  id: "hijos",
  label: "Hijos",

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
          <details>
            <summary>Añadir actividad o clase</summary>
            <form id="formActividad" autocomplete="off">
              <div class="row">
                <label for="aTitulo">Actividad <input id="aTitulo" name="titulo" required maxlength="80" placeholder="Natación"></label>
                <label for="aTipo">Tipo <select id="aTipo" name="tipo">${optionsHtml(Object.entries(TIPOS_ACTIVIDAD), "extraescolar")}</select></label>
                <label for="aLugar">Lugar <input id="aLugar" name="lugar" maxlength="80"></label>
              </div>
              <div class="days" role="group" aria-label="Días">${DIAS_CORTOS.map((d, i) => `<label for="dia${i + 1}"><input type="checkbox" id="dia${i + 1}" name="dia" value="${i + 1}">${d}</label>`).join("")}</div>
              <div class="row">
                <label for="aInicio">Empieza <input id="aInicio" name="horaInicio" type="time" required></label>
                <label for="aFin">Termina <input id="aFin" name="horaFin" type="time"></label>
              </div>
              <label for="aLlevar">Qué llevar <input id="aLlevar" name="llevar" maxlength="120" placeholder="Toalla, gorro, merienda"></label>
              <label class="check" for="aMeOcupa"><input type="checkbox" id="aMeOcupa" name="meOcupa" checked> Me ocupa a mí (llevar, recoger o acompañar): cuenta como ocupado en mi agenda</label>
              <button class="btn" type="submit">Guardar actividad</button>
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
      const b = (e.target as HTMLElement).closest<HTMLElement>("[data-kid]");
      if (b) {
        hijoSel = b.dataset.kid ?? null;
        this.update();
      }
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

    qs<HTMLFormElement>("#formActividad", el).addEventListener("submit", async (e) => {
      e.preventDefault();
      const form = e.target as HTMLFormElement;
      const v = formValues(form);
      const dias = Array.from(form.querySelectorAll<HTMLInputElement>('input[name="dia"]:checked')).map((i) => Number(i.value));
      if (!hijoSel) return;
      if (!dias.length) return toast("Elige al menos un día.");
      if (v.horaFin && v.horaFin <= v.horaInicio) return toast("La hora de fin debe ser posterior al inicio.");
      const ok = await attempt(
        () => store.add("actividades", {
          hijoId: hijoSel as string, titulo: v.titulo, tipo: v.tipo as TipoActividad, dias, horaInicio: v.horaInicio,
          horaFin: v.horaFin || null, lugar: v.lugar, llevar: v.llevar, meOcupa: qs<HTMLInputElement>("#aMeOcupa", form).checked,
        }),
        "Actividad guardada",
      );
      if (ok) form.reset();
    });

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

    const today = todayISO();
    const wdHoy = isoWeekday(today);
    qs("#kidTitle", root).textContent = `Horario de ${kid.nombre}${kid.grado ? ` · ${kid.grado}` : ""}`;
    qs("#kidWeek", root).innerHTML = DIAS_CORTOS.map((label, i) => {
      const wd = i + 1;
      const acts = store.data.actividades.filter((a) => a.hijoId === kid.id && a.dias.includes(wd)).sort((a, b) => a.horaInicio.localeCompare(b.horaInicio));
      return `<div class="day-col${wd === wdHoy ? " is-today" : ""}"><h3>${label}</h3>${
        acts.map((a) => `<div class="slot" style="border-color:${esc(kidColor(kid))}"><strong>${esc(a.horaInicio)}</strong> ${esc(a.titulo)}${a.lugar ? `<div class="muted">${esc(a.lugar)}</div>` : ""}${a.meOcupa ? `<div class="muted">Te ocupa</div>` : ""}${delBtn("actividades", a.id, "Quitar")}</div>`).join("") || `<span class="muted small">—</span>`
      }</div>`;
    }).join("");

    const deberes = store.data.deberes
      .filter((d) => d.hijoId === kid.id)
      .sort((a, b) => Number(a.estado === "hecha") - Number(b.estado === "hecha") || a.entrega.localeCompare(b.entrega));
    qs("#kidDeberes", root).innerHTML = deberes.length ? deberes.map((d) => deberItem(d, today, false)).join("") : emptyLi("Sin deberes ni exámenes registrados.");
  },
};

/** Al borrar un hijo se borran su horario y deberes; sus gastos y tareas quedan sin asignar. */
async function removeKidCascade(kidId: string): Promise<void> {
  for (const a of store.data.actividades.filter((x) => x.hijoId === kidId)) await store.remove("actividades", a.id);
  for (const d of store.data.deberes.filter((x) => x.hijoId === kidId)) await store.remove("deberes", d.id);
  for (const g of store.data.gastos.filter((x) => x.hijoId === kidId)) await store.update("gastos", g.id, { hijoId: null });
  for (const t of store.data.tareas.filter((x) => x.hijoId === kidId)) await store.update("tareas", t.id, { hijoId: null });
  await store.remove("hijos", kidId);
  hijoSel = null;
}
