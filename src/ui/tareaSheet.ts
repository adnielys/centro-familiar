/**
 * Hoja para crear o editar una tarea: una caja de texto y botones opcionales
 * (fecha, hora, costo, repetición, hijos, prioridad) que despliegan su campo.
 */
import { comprobar } from "../domain/agenda";
import { AREAS, CATEGORIAS, METODOS, MONEDAS, PRIORIDADES } from "../domain/catalog";
import { addDays, fmtDate, toHHMM, toMinutes, todayISO } from "../domain/dates";
import { REPETICIONES, tareaVacia } from "../domain/tareas";
import type { Area, Frecuencia, Metodo, Moneda, Prioridad, Tarea } from "../domain/types";
import { store } from "../data/store";
import { fuentesAgenda } from "./agendaContext";
import { attempt, esc, fmtMoney, numberFmt, optionsHtml, qs, toast } from "./dom";
import { ICONS } from "./icons";
import { navigate } from "./router";
import { openSheet } from "./sheet";

const DURACIONES: Array<[string, string]> = [["15", "15 min"], ["30", "30 min"], ["45", "45 min"], ["60", "1 h"], ["90", "1 h 30"], ["120", "2 h"], ["180", "3 h"]];
type Panel = "fecha" | "hora" | "costo" | "repite" | "hijos" | "prioridad";

const seg = (name: string, entries: ReadonlyArray<readonly [string, string]>, selected: string): string =>
  `<div class="seg wide" role="group">${entries.map(([v, l]) => `<button type="button" data-seg="${name}" data-value="${v}" aria-pressed="${v === selected}">${esc(l)}</button>`).join("")}</div>`;

/** Abre la hoja. Sin tarea: crear. Con tarea: editar. */
export function abrirTareaSheet(t?: Tarea): void {
  const base = t ?? { ...tareaVacia(), id: "" };
  const bloque = t ? store.data.bloques.find((b) => b.tareaId === t.id) : undefined;
  const estado = {
    moneda: (base.costo?.moneda ?? store.config.monedaPrincipal) as Moneda,
    metodo: (base.costo?.metodo ?? "efectivo") as Metodo,
    repetir: (base.repetir ?? "") as Frecuencia | "",
    prioridad: base.prioridad as Prioridad,
  };

  const sheet = openSheet({
    title: t ? "Editar tarea" : "Nueva tarea",
    body: `
      <form id="tsForm" autocomplete="off" class="stack">
        <input id="tsTitulo" class="big-input" name="titulo" maxlength="160" placeholder="¿Qué hay que hacer?" value="${esc(base.titulo)}" aria-label="Qué hay que hacer" required>
        <div class="chip-row" id="tsChips">
          ${(["fecha", "hora", "costo", "repite", "hijos", "prioridad"] as Panel[]).map((p) => `<button type="button" class="chip-btn" data-panel="${p}"></button>`).join("")}
        </div>

        <div class="panel" data-for="fecha" hidden>
          <label for="tsVence">Fecha <input id="tsVence" name="vence" type="date" value="${esc(base.vence ?? "")}"></label>
          <div class="actions">
            <button type="button" class="icon-btn accent" data-fecha="0">Hoy</button>
            <button type="button" class="icon-btn accent" data-fecha="1">Mañana</button>
            <button type="button" class="icon-btn" data-fecha="">Sin fecha</button>
          </div>
        </div>

        <div class="panel" data-for="hora" hidden>
          <div class="row">
            <label for="tsHora">Hora <input id="tsHora" name="hora" type="time" step="300" value="${esc(bloque?.inicio ?? "")}"></label>
            <label for="tsDur">Duración <select id="tsDur" name="duracion">${optionsHtml(DURACIONES, bloque ? String(toMinutes(bloque.fin) - toMinutes(bloque.inicio)) : "60")}</select></label>
          </div>
          <div class="verdict" id="tsVeredicto"></div>
        </div>

        <div class="panel" data-for="costo" hidden>
          <label for="tsMonto">Cuánto cuesta (aproximado) <input id="tsMonto" name="monto" type="number" inputmode="decimal" min="0" step="0.01" value="${esc(base.costo?.monto ?? "")}" placeholder="1500"></label>
          ${seg("moneda", MONEDAS.map((m) => [m, m]), estado.moneda)}
          ${seg("metodo", Object.entries(METODOS), estado.metodo)}
          <label for="tsCategoria">Categoría <select id="tsCategoria" name="categoria">${optionsHtml(CATEGORIAS.map((c) => [c, c]), base.costo?.categoria ?? "Otros")}</select></label>
        </div>

        <div class="panel" data-for="repite" hidden>
          <span class="small muted">Se repite</span>
          ${seg("repetir", [["", "No"], ["semanal", "Semanal"], ["quincenal", "Quincenal"], ["mensual", "Mensual"]], estado.repetir)}
        </div>

        <div class="panel" data-for="hijos" hidden>
          <div class="days">${store.data.hijos.length
            ? store.data.hijos.map((k) => `<label for="ts-h-${esc(k.id)}"><input type="checkbox" id="ts-h-${esc(k.id)}" name="hijo" value="${esc(k.id)}"${base.hijoIds.includes(k.id) ? " checked" : ""}>${esc(k.nombre)}</label>`).join("")
            : `<span class="small muted">Añade a tus hijos desde Familia.</span>`}</div>
        </div>

        <div class="panel" data-for="prioridad" hidden>
          ${seg("prioridad", Object.entries(PRIORIDADES), estado.prioridad)}
          <label for="tsArea">Área <select id="tsArea" name="area">${optionsHtml(Object.entries(AREAS), base.area)}</select></label>
        </div>

        <p class="small muted" id="tsNota"></p>
        <button class="btn block" type="submit">${t ? "Guardar cambios" : "Guardar tarea"}</button>
        ${t ? "" : `<div class="quick-links">
          <button type="button" class="link-btn" data-ir="texto">${ICONS.texto} Registrar un gasto</button>
          <button type="button" class="link-btn" data-ir="foto">${ICONS.camara} Foto de ticket</button>
        </div>`}
      </form>`,
  });

  const form = qs<HTMLFormElement>("#tsForm", sheet.el);
  const input = <T extends HTMLInputElement | HTMLSelectElement>(id: string): T => qs<T>(`#${id}`, form);

  /** Texto de cada chip según el valor actual; "on" si tiene valor. */
  function refrescar(): void {
    const vence = input<HTMLInputElement>("tsVence").value;
    const hora = input<HTMLInputElement>("tsHora").value;
    const monto = Number(input<HTMLInputElement>("tsMonto").value);
    const hijos = Array.from(form.querySelectorAll<HTMLInputElement>('input[name="hijo"]:checked')).map((i) => store.byId("hijos", i.value)?.nombre).filter(Boolean);
    const textos: Record<Panel, [string, boolean]> = {
      fecha: [vence ? (vence === todayISO() ? "Hoy" : fmtDate(vence)) : "Fecha", Boolean(vence)],
      hora: [hora || "Hora", Boolean(hora)],
      costo: [monto > 0 ? `${numberFmt.format(monto)} ${estado.moneda}` : "Cuesta", monto > 0],
      repite: [estado.repetir ? REPETICIONES[estado.repetir] : "Se repite", Boolean(estado.repetir)],
      hijos: [hijos.length ? hijos.join(", ") : "Hijos", hijos.length > 0],
      prioridad: [estado.prioridad === "media" ? "Prioridad" : `Prioridad ${PRIORIDADES[estado.prioridad].toLowerCase()}`, estado.prioridad !== "media"],
    };
    form.querySelectorAll<HTMLButtonElement>("[data-panel]").forEach((b) => {
      const [texto, on] = textos[b.dataset.panel as Panel];
      b.textContent = texto;
      b.classList.toggle("on", on);
      b.setAttribute("aria-expanded", String(!form.querySelector<HTMLElement>(`[data-for="${b.dataset.panel}"]`)?.hidden));
    });
    qs("#tsNota", form).textContent = monto > 0
      ? estado.repetir
        ? `Al marcarla hecha te pregunto cuánto pagaste y lo registro como gasto fijo. La siguiente se crea sola.`
        : `Al marcarla hecha te pregunto cuánto pagaste y lo registro como gasto.`
      : "";
    renderVeredicto(vence, hora);
  }

  function renderVeredicto(vence: string, hora: string): void {
    const box = qs("#tsVeredicto", form);
    if (!hora) {
      box.className = "verdict";
      box.textContent = "Con hora, la tarea se agenda en tu calendario.";
      return;
    }
    const fecha = vence || todayISO();
    const inicio = toMinutes(hora);
    const fin = inicio + Number(input<HTMLSelectElement>("tsDur").value || 60);
    const r = comprobar(fecha, inicio, fin, fuentesAgenda(), bloque?.id);
    box.className = r.libre ? "verdict ok" : "verdict bad";
    box.textContent = r.libre
      ? `✓ Libre de ${toHHMM(inicio)} a ${toHHMM(fin)}`
      : `✗ ${"choques" in r ? `Choca con ${r.choques.map((c) => c.titulo).join(", ")}` : "Fuera de tu jornada"}${r.alternativa ? `. Libre desde ${toHHMM(r.alternativa.inicio)}${r.alternativa.fecha !== fecha ? ` (${fmtDate(r.alternativa.fecha)})` : ""}` : ""}`;
  }

  // Abre por defecto los paneles que ya tienen datos al editar.
  const abrir = (p: Panel, open: boolean): void => {
    const panel = form.querySelector<HTMLElement>(`[data-for="${p}"]`);
    if (panel) panel.hidden = !open;
  };
  if (base.vence) abrir("fecha", true);
  if (bloque) abrir("hora", true);
  if (base.costo) abrir("costo", true);
  if (base.repetir) abrir("repite", true);

  form.addEventListener("click", (e) => {
    const el = e.target as HTMLElement;
    const chipBtn = el.closest<HTMLButtonElement>("[data-panel]");
    if (chipBtn) {
      const p = chipBtn.dataset.panel as Panel;
      const panel = form.querySelector<HTMLElement>(`[data-for="${p}"]`);
      abrir(p, Boolean(panel?.hidden));
      if (p === "costo" && !panel?.hidden) input<HTMLInputElement>("tsMonto").focus();
      refrescar();
      return;
    }
    const segBtn = el.closest<HTMLButtonElement>("[data-seg]");
    if (segBtn) {
      const k = segBtn.dataset.seg as keyof typeof estado;
      (estado as Record<string, string>)[k] = segBtn.dataset.value ?? "";
      form.querySelectorAll<HTMLButtonElement>(`[data-seg="${k}"]`).forEach((x) => x.setAttribute("aria-pressed", String(x === segBtn)));
      refrescar();
      return;
    }
    const f = el.closest<HTMLButtonElement>("[data-fecha]");
    if (f) {
      input<HTMLInputElement>("tsVence").value = f.dataset.fecha === "" ? "" : addDays(todayISO(), Number(f.dataset.fecha));
      refrescar();
      return;
    }
    const ir = el.closest<HTMLButtonElement>("[data-ir]");
    if (ir) {
      sheet.close();
      navigate("registrar");
      if (ir.dataset.ir === "foto") document.querySelector<HTMLInputElement>("#capFoto")?.click();
      else setTimeout(() => document.querySelector<HTMLTextAreaElement>("#capTexto")?.focus(), 50);
    }
  });
  form.addEventListener("input", refrescar);
  form.addEventListener("change", refrescar);
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    void guardar();
  });

  async function guardar(): Promise<void> {
    const titulo = input<HTMLInputElement>("tsTitulo").value.trim();
    if (!titulo) return toast("Escribe qué hay que hacer.");
    const monto = Math.round(Number(input<HTMLInputElement>("tsMonto").value) * 100) / 100;
    const hijoIds = Array.from(form.querySelectorAll<HTMLInputElement>('input[name="hijo"]:checked')).map((i) => i.value);
    const hora = input<HTMLInputElement>("tsHora").value;
    let vence = input<HTMLInputElement>("tsVence").value || null;
    if (!vence && (hora || estado.repetir)) vence = todayISO(); // una tarea agendada o periódica necesita fecha
    let area = input<HTMLSelectElement>("tsArea").value as Area;
    if (area === "personal" && hijoIds.length) area = "hijos";
    const datos = {
      titulo, area, prioridad: estado.prioridad, vence, hijoIds,
      costo: monto > 0 ? { monto, moneda: estado.moneda, metodo: estado.metodo, categoria: input<HTMLSelectElement>("tsCategoria").value } : null,
      repetir: estado.repetir || null,
    };
    const ok = await attempt(async () => {
      const id = t ? (await store.update("tareas", t.id, datos), t.id) : (await store.add("tareas", { ...datos, estado: "pendiente", completada: null, gastoId: null, siguienteId: null })).id;
      await sincronizarBloque(id, titulo, vence, hora, Number(input<HTMLSelectElement>("tsDur").value || 60));
    }, t ? "Cambios guardados" : datos.costo ? `Tarea guardada · costo ${fmtMoney(datos.costo.monto, datos.costo.moneda)}` : "Tarea guardada");
    if (ok) sheet.close();
  }

  refrescar();
  if (!t) requestAnimationFrame(() => input<HTMLInputElement>("tsTitulo").focus());
}

/** Crea, actualiza o borra el bloque de agenda vinculado a la tarea según tenga hora. */
async function sincronizarBloque(tareaId: string, titulo: string, fecha: string | null, hora: string, duracion: number): Promise<void> {
  const existente = store.data.bloques.find((b) => b.tareaId === tareaId);
  if (!hora) {
    if (existente) await store.remove("bloques", existente.id);
    return;
  }
  const fin = toHHMM(Math.min(toMinutes(hora) + duracion, 24 * 60 - 1));
  const datos = { titulo, fecha: fecha ?? todayISO(), inicio: hora, fin, tareaId };
  if (existente) await store.update("bloques", existente.id, datos);
  else await store.add("bloques", datos);
}
