/**
 * Agenda: ver el día (ocupado / libre) y agendar bloques comprobando la disponibilidad al instante.
 */
import { comprobar, huecosLibres, minutosLibres, ocupacionesDelDia, type FuenteOcupacion, type Ocupacion } from "../../domain/agenda";
import { addDays, fmtDate, fmtDuration, fmtLongDate, nowMinutes, toHHMM, toMinutes, todayISO } from "../../domain/dates";
import type { ISODate, Tarea } from "../../domain/types";
import { store } from "../../data/store";
import { googleCalendar } from "../../integrations/googleCalendar";
import { fuentesAgenda } from "../agendaContext";
import { attempt, esc, formValues, optionsHtml, qs, toast } from "../dom";
import { ICONS } from "../icons";
import { navigate, type View } from "../router";

const DURACIONES: Array<[string, string]> = [["15", "15 min"], ["30", "30 min"], ["45", "45 min"], ["60", "1 h"], ["90", "1 h 30"], ["120", "2 h"], ["180", "3 h"], ["240", "4 h"]];
const FUENTE_LABEL: Record<FuenteOcupacion, string> = { trabajo: "Trabajo", hijos: "Niños", bloque: "Agendado", google: "Google" };
const ROUND = 15;

const ui = {
  fecha: todayISO(),
  tareaId: null as string | null,
  googleLoading: false,
  /** Días cuya descarga falló: no se reintentan solos (evita bucles); sí al reconectar. */
  googleFallidos: new Set<ISODate>(),
};

let root: HTMLElement;

/** Abre la agenda con una tarea lista para agendar en el siguiente hueco libre. */
export function agendarTarea(t: Tarea): void {
  ui.tareaId = t.id;
  ui.fecha = t.vence && t.vence >= todayISO() ? t.vence : todayISO();
  navigate("agenda");
  const form = qs<HTMLFormElement>("#formBloque", root);
  (form.elements.namedItem("titulo") as HTMLInputElement).value = t.titulo;
  (form.elements.namedItem("fecha") as HTMLInputElement).value = ui.fecha;
  suggestStart(form);
  renderVerdict();
}

/** Primer hueco del día (desde ahora si es hoy) donde quepa la duración elegida. */
function suggestStart(form: HTMLFormElement): void {
  const v = formValues(form);
  const dur = Number(v.duracion) || 60;
  const fecha = v.fecha || ui.fecha;
  const desde = fecha === todayISO() ? Math.ceil(nowMinutes() / ROUND) * ROUND : undefined;
  const hueco = huecosLibres(fecha, fuentesAgenda(), dur, desde)[0];
  if (hueco) (form.elements.namedItem("inicio") as HTMLInputElement).value = toHHMM(hueco.inicio);
}

export const agendaView: View = {
  id: "agenda",
  label: "Agenda",
  icon: ICONS.agenda,

  mount(el) {
    root = el;
    el.innerHTML = `
      <div class="card">
        <div class="day-nav">
          <button class="icon-btn big" type="button" data-day="-1" aria-label="Día anterior">‹</button>
          <div class="grow center"><h2 id="agTitulo"></h2><div class="small muted" id="agResumen"></div></div>
          <button class="icon-btn big" type="button" data-day="1" aria-label="Día siguiente">›</button>
        </div>
        <div class="toggles center">
          <input id="agFecha" type="date" aria-label="Elegir día">
          <button class="btn ghost" type="button" data-day="hoy">Hoy</button>
        </div>
        <div id="agGoogle" class="small"></div>
      </div>

      <div class="card">
        <h2>Agendar</h2>
        <form id="formBloque" autocomplete="off">
          <label for="bTitulo">Qué vas a hacer
            <input id="bTitulo" name="titulo" required maxlength="120" list="bTareas" placeholder="Llamar al plomero">
            <datalist id="bTareas"></datalist>
          </label>
          <div class="row">
            <label for="bFecha">Día <input id="bFecha" name="fecha" type="date" required></label>
            <label for="bInicio">Empieza <input id="bInicio" name="inicio" type="time" step="300" required></label>
            <label for="bDuracion">Duración <select id="bDuracion" name="duracion">${optionsHtml(DURACIONES, "60")}</select></label>
          </div>
          <div id="veredicto" class="verdict" role="status" aria-live="polite"></div>
          <div class="actions">
            <button class="btn" type="submit" id="bGuardar">Agendar</button>
            <button class="btn ghost" type="button" data-action="sugerir">Buscar hueco libre</button>
          </div>
        </form>
      </div>

      <div class="card">
        <div class="card-head"><h2>Tu día</h2><div class="legend small" id="agLeyenda"></div></div>
        <ol class="timeline" id="agTimeline"></ol>
      </div>`;

    const form = qs<HTMLFormElement>("#formBloque", el);
    (form.elements.namedItem("fecha") as HTMLInputElement).value = ui.fecha;

    el.addEventListener("click", (e) => {
      const t = (e.target as HTMLElement).closest<HTMLElement>("[data-day], [data-action], [data-slot]");
      if (!t) return;
      if (t.dataset.day) {
        ui.fecha = t.dataset.day === "hoy" ? todayISO() : addDays(ui.fecha, Number(t.dataset.day));
        (form.elements.namedItem("fecha") as HTMLInputElement).value = ui.fecha;
        this.update();
        renderVerdict();
      } else if (t.dataset.slot) {
        (form.elements.namedItem("fecha") as HTMLInputElement).value = ui.fecha;
        (form.elements.namedItem("inicio") as HTMLInputElement).value = t.dataset.slot;
        renderVerdict();
        qs<HTMLInputElement>("#bTitulo", el).focus();
      } else if (t.dataset.action === "sugerir") {
        suggestStart(form);
        renderVerdict();
      } else if (t.dataset.action === "usar-alternativa") {
        (form.elements.namedItem("fecha") as HTMLInputElement).value = t.dataset.fecha ?? ui.fecha;
        (form.elements.namedItem("inicio") as HTMLInputElement).value = t.dataset.inicio ?? "";
        renderVerdict();
      } else if (t.dataset.action === "google-conectar") {
        void connectGoogle();
      }
    });

    qs<HTMLInputElement>("#agFecha", el).addEventListener("change", (e) => {
      const v = (e.target as HTMLInputElement).value;
      if (!v) return;
      ui.fecha = v;
      (form.elements.namedItem("fecha") as HTMLInputElement).value = v;
      this.update();
      renderVerdict();
    });

    form.addEventListener("input", (e) => {
      if ((e.target as HTMLElement).id === "bTitulo") syncTaskFromTitle(form);
      renderVerdict();
    });
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      void saveBlock(form);
    });
  },

  onShow() {
    void ensureGoogleDay(ui.fecha);
  },

  update() {
    const f = fuentesAgenda();
    const today = todayISO();
    const desde = ui.fecha === today ? nowMinutes() : undefined;
    const libres = huecosLibres(ui.fecha, f, 15, desde);
    qs("#agTitulo", root).textContent = ui.fecha === today ? `Hoy, ${fmtLongDate(ui.fecha)}` : capitalize(fmtLongDate(ui.fecha));
    qs("#agResumen", root).textContent = `${fmtDuration(minutosLibres(libres))} libres${ui.fecha === today ? " desde ahora" : ""} · jornada ${store.config.jornada.inicio}–${store.config.jornada.fin}`;
    qs<HTMLInputElement>("#agFecha", root).value = ui.fecha;
    qs("#agLeyenda", root).innerHTML = (["trabajo", "hijos", "bloque", "google"] as FuenteOcupacion[])
      .map((s) => `<span><span class="dot src-${s}"></span>${FUENTE_LABEL[s]}</span>`).join("");
    qs("#bTareas", root).innerHTML = store.data.tareas.filter((t) => t.estado === "pendiente").map((t) => `<option value="${esc(t.titulo)}"></option>`).join("");
    renderTimeline(ocupacionesDelDia(ui.fecha, f), huecosLibres(ui.fecha, f, 15));
    renderGoogleStatus();
    void ensureGoogleDay(ui.fecha);
  },
};

function renderTimeline(occ: Ocupacion[], libres: Array<{ inicio: number; fin: number }>): void {
  const now = ui.fecha === todayISO() ? nowMinutes() : -1;
  type Item = { inicio: number; html: string };
  const items: Item[] = [
    ...occ.map((o) => ({
      inicio: o.inicio,
      html: `<li class="tl-item busy src-${o.fuente}${o.fin <= now ? " past" : ""}">
        <span class="tl-time">${toHHMM(o.inicio)}<br><span class="muted">${toHHMM(o.fin)}</span></span>
        <div class="grow"><div class="title">${esc(o.titulo)}</div><div class="small muted">${FUENTE_LABEL[o.fuente]} · ${fmtDuration(o.fin - o.inicio)}</div></div>
        ${o.fuente === "bloque" && o.refId ? `<button class="icon-btn" type="button" data-del="bloques" data-id="${esc(o.refId)}">Quitar</button>` : ""}
      </li>`,
    })),
    ...libres.map((h) => ({
      inicio: h.inicio,
      html: `<li class="tl-item free${h.fin <= now ? " past" : ""}">
        <span class="tl-time">${toHHMM(h.inicio)}<br><span class="muted">${toHHMM(h.fin)}</span></span>
        <div class="grow"><div class="title">Libre</div><div class="small muted">${fmtDuration(h.fin - h.inicio)}</div></div>
        ${h.fin > now ? `<button class="icon-btn accent" type="button" data-slot="${toHHMM(Math.max(h.inicio, Math.ceil(now / ROUND) * ROUND))}">Agendar aquí</button>` : ""}
      </li>`,
    })),
  ].sort((a, b) => a.inicio - b.inicio);
  qs("#agTimeline", root).innerHTML = items.length ? items.map((i) => i.html).join("") : `<li class="empty">Sin jornada configurada.</li>`;
}

/** Comprueba el horario del formulario y explica el resultado. */
function renderVerdict(): void {
  const form = qs<HTMLFormElement>("#formBloque", root);
  const v = formValues(form);
  const box = qs("#veredicto", root);
  const btn = qs<HTMLButtonElement>("#bGuardar", root);
  if (!v.fecha || !v.inicio) {
    box.innerHTML = "";
    box.className = "verdict";
    btn.textContent = "Agendar";
    return;
  }
  const inicio = toMinutes(v.inicio);
  const fin = inicio + (Number(v.duracion) || 60);
  if (fin > 24 * 60) {
    box.className = "verdict bad";
    box.textContent = "El bloque no puede pasar de medianoche.";
    return;
  }
  const r = comprobar(v.fecha, inicio, fin, fuentesAgenda());
  const rango = `${toHHMM(inicio)}–${toHHMM(fin)}`;
  if (r.libre) {
    box.className = "verdict ok";
    box.innerHTML = `✓ Estás libre ${v.fecha === todayISO() ? "hoy" : `el ${esc(fmtDate(v.fecha))}`} de ${rango}.`;
    btn.textContent = "Agendar";
    return;
  }
  const motivo = "choques" in r
    ? `Ocupado: ${r.choques.map((c) => `<strong>${esc(c.titulo)}</strong> ${toHHMM(c.inicio)}–${toHHMM(c.fin)}`).join(", ")}.`
    : `Fuera de tu jornada (${store.config.jornada.inicio}–${store.config.jornada.fin}).`;
  const alt = r.alternativa
    ? ` Siguiente hueco libre: ${r.alternativa.fecha === v.fecha ? "" : `${esc(fmtDate(r.alternativa.fecha))} `}${toHHMM(r.alternativa.inicio)}–${toHHMM(r.alternativa.fin)}
       <button class="icon-btn accent" type="button" data-action="usar-alternativa" data-fecha="${r.alternativa.fecha}" data-inicio="${toHHMM(r.alternativa.inicio)}">Usar</button>`
    : " No hay huecos de esa duración en los próximos 14 días.";
  box.className = "verdict bad";
  box.innerHTML = `✗ ${motivo}${alt}`;
  btn.textContent = "Agendar aunque choque";
}

/** Si el título coincide con una tarea pendiente, el bloque queda vinculado a ella. */
function syncTaskFromTitle(form: HTMLFormElement): void {
  const titulo = formValues(form).titulo;
  ui.tareaId = store.data.tareas.find((t) => t.estado === "pendiente" && t.titulo === titulo)?.id ?? null;
}

async function saveBlock(form: HTMLFormElement): Promise<void> {
  const v = formValues(form);
  if (!v.titulo) return toast("Escribe qué vas a hacer.");
  const inicio = toMinutes(v.inicio);
  const fin = inicio + (Number(v.duracion) || 60);
  if (fin > 24 * 60) return toast("El bloque no puede pasar de medianoche.");
  const tareaId = ui.tareaId;
  const ok = await attempt(async () => {
    await store.add("bloques", { titulo: v.titulo, fecha: v.fecha, inicio: v.inicio, fin: toHHMM(fin), tareaId });
    const tarea = store.byId("tareas", tareaId);
    if (tarea && !tarea.vence) await store.update("tareas", tarea.id, { vence: v.fecha });
  }, `Agendado: ${v.titulo} · ${v.inicio}`);
  if (!ok) return;
  ui.tareaId = null;
  ui.fecha = v.fecha;
  (form.elements.namedItem("titulo") as HTMLInputElement).value = "";
  agendaView.update();
  renderVerdict();
}

function renderGoogleStatus(): void {
  const el = qs("#agGoogle", root);
  if (!store.config.googleClientId) {
    el.innerHTML = `<span class="muted">Google Calendar no está configurado (Ajustes).</span>`;
  } else if (googleCalendar.isConnected()) {
    el.innerHTML = `<span class="chip ok">Google Calendar conectado</span>${ui.googleLoading ? ` <span class="muted">actualizando…</span>` : ""}`;
  } else {
    el.innerHTML = `<button class="btn ghost" type="button" data-action="google-conectar">Conectar Google Calendar</button>`;
  }
}

async function connectGoogle(): Promise<void> {
  const ok = await attempt(() => googleCalendar.connect(store.config.googleClientId), "Google Calendar conectado");
  if (ok) await ensureGoogleDay(ui.fecha, true);
}

/** Descarga una semana de eventos de Google si el día no está en caché. */
async function ensureGoogleDay(fecha: ISODate, force = false): Promise<void> {
  if (!googleCalendar.isConnected() || ui.googleLoading) return;
  if (!force && (googleCalendar.hasDay(fecha) || ui.googleFallidos.has(fecha))) return;
  if (force) ui.googleFallidos.clear();
  ui.googleLoading = true;
  renderGoogleStatus();
  const ok = await attempt(() => googleCalendar.cargar(fecha, 7));
  if (!ok) ui.googleFallidos.add(fecha);
  ui.googleLoading = false;
  agendaView.update();
  renderVerdict();
}

const capitalize = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
