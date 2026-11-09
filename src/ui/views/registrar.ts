/**
 * Registro rápido sin IA: texto libre u OCR local → propuesta editable → guardar y aprender.
 * Las tareas con hora se agendan también como bloque, comprobando la disponibilidad.
 */
import { comprobar } from "../../domain/agenda";
import { REPETICIONES } from "../../domain/tareas";
import { AREAS, CATEGORIAS, METODOS, MONEDAS, PRIORIDADES, TIPOS_DEBER } from "../../domain/catalog";
import { analizarRecibo, analizarTexto, idDeRegla, MATERIAS_LISTA, patronDeAprendizaje, type ContextoClasificador, type DatosPropuesta, type Propuesta, type TipoPropuesta } from "../../domain/clasificador.js";
import { addDays, fmtDate, toHHMM, toMinutes, todayISO } from "../../domain/dates";
import type { Area, Frecuencia, Metodo, Moneda, Prioridad, TipoDeber } from "../../domain/types";
import { store } from "../../data/store";
import { describirProgreso, reconocerTexto, type OcrProgress } from "../../integrations/ocr";
import { fuentesAgenda } from "../agendaContext";
import { attempt, delBtn, emptyLi, esc, formValues, kidOptions, optionsHtml, qs, toast } from "../dom";
import type { View } from "../router";

interface PropuestaUI extends Propuesta {
  uid: string;
  /** Categoría sugerida originalmente (para aprender si el usuario la corrige). */
  sugerida: string | null;
}

const TIPO_LABEL: Record<TipoPropuesta, string> = { gasto: "Gasto", tarea: "Tarea", deber: "Deber o examen" };
const FIELD_LABELS: Record<string, string> = {
  monto: "Monto", moneda: "Moneda", naturaleza: "Tipo de gasto", metodo: "Método", categoria: "Categoría", descripcion: "Descripción", fecha: "Fecha", hijoId: "Hijo",
  titulo: "Tarea", area: "Área", prioridad: "Prioridad", vence: "Fecha", hora: "Hora (para agendar)", duracion: "Duración", costoMonto: "Cuesta", costoMoneda: "Moneda", repetir: "Se repite", costoTipo: "Importe", materia: "Materia", tipo: "Tipo", entrega: "Para el día",
};
const DURACION_DEFECTO = 60;
const DURACIONES: Array<[string, string]> = [["15", "15 min"], ["30", "30 min"], ["45", "45 min"], ["60", "1 h"], ["90", "1 h 30"], ["120", "2 h"], ["180", "3 h"]];
let root: HTMLElement;
let propuestas: PropuestaUI[] = [];
let seq = 0;

const contexto = (): ContextoClasificador => ({ hoy: todayISO(), hijos: store.data.hijos, reglas: store.data.reglas, monedaPorDefecto: store.config.monedaPrincipal });

function agregar(resultados: Propuesta[]): void {
  const conDefectos = resultados.map(completarPropuesta);
  propuestas = conDefectos.map((r) => ({ ...r, uid: `p${++seq}`, sugerida: r.tipo === "gasto" ? String(r.datos.categoria ?? "") : null })).concat(propuestas);
  renderPropuestas();
}
/** Valores por defecto y vínculo con gastos fijos (sin IA: coincidencia de nombre). */
function completarPropuesta(r: Propuesta): Propuesta {
  if (r.tipo === "tarea") {
    return { ...r, datos: { ...r.datos, duracion: r.datos.duracion || DURACION_DEFECTO, costoMoneda: r.datos.costoMoneda || store.config.monedaPrincipal } };
  }
  if (r.tipo !== "gasto") return r;
  const fijo = fijoCoincidente(String(r.datos.descripcion ?? ""), String(r.datos.moneda ?? ""));
  if (!fijo) return { ...r, datos: { ...r.datos, naturaleza: "variable", fijoId: null } };
  return {
    ...r,
    datos: { ...r.datos, naturaleza: "fijo", fijoId: fijo.id, categoria: fijo.categoria, hijoId: r.datos.hijoId || (fijo.hijoIds.length === 1 ? fijo.hijoIds[0] : null) },
    explicacion: `Coincide con el gasto fijo «${fijo.nombre}»: se registrará como su pago.`,
  };
}

const norm = (s: string): string => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

/** Gasto fijo activo cuyo nombre aparece en la descripción (o al revés), en la misma moneda. */
function fijoCoincidente(descripcion: string, moneda: string) {
  const d = norm(descripcion);
  if (d.length < 3) return undefined;
  return store.data.fijos.find((f) => f.activo && f.moneda === moneda && (d.includes(norm(f.nombre)) || norm(f.nombre).includes(d)));
}

function quitar(uid: string): void {
  propuestas = propuestas.filter((p) => p.uid !== uid);
  renderPropuestas();
}
const buscar = (uid: string): PropuestaUI | undefined => propuestas.find((p) => p.uid === uid);

export const registrarView: View = {
  id: "registrar",
  label: "Registrar",

  mount(el) {
    root = el;
    el.innerHTML = `
      <div class="card">
        <h2>Registro rápido</h2>
        <p class="small muted">Escríbelo como lo dirías: «350 almuerzo efectivo», «20 usd zapatos Leo ayer por banca», «200 pan, 1500 pollo», «examen de mate de Ana el jueves», «llamar al plomero mañana a las 10». Todo se procesa en tu teléfono, sin IA.</p>
        <form id="formCaptura" autocomplete="off">
          <label for="capTexto">Texto <textarea id="capTexto" rows="3" placeholder="350 almuerzo efectivo"></textarea></label>
          <div class="toggles">
            <button class="btn" type="submit">Analizar texto</button>
            <label class="btn ghost" for="capFoto">Foto o captura</label>
            <input id="capFoto" class="visually-hidden" type="file" accept="image/*">
          </div>
        </form>
        <div id="ocrEstado" class="small muted" role="status" aria-live="polite"></div>
        <p class="small muted">Consejo: en una captura de Banca Remota puedes mantener pulsado el texto, copiarlo y pegarlo aquí. Es más rápido y exacto que la foto.</p>
      </div>
      <div id="propuestas" class="view"></div>
      <div class="card">
        <div class="card-head"><h2>Reglas aprendidas</h2><span class="small muted">Se crean cuando corriges una categoría</span></div>
        <ul class="list" id="listaReglas"></ul>
      </div>`;

    qs<HTMLFormElement>("#formCaptura", el).addEventListener("submit", (e) => {
      e.preventDefault();
      const area = qs<HTMLTextAreaElement>("#capTexto", el);
      const texto = area.value.trim();
      if (!texto) return toast("Escribe algo para analizar.");
      // Texto pegado de una captura (varias líneas con importe/beneficiario) → se trata como recibo.
      const pareceRecibo = texto.split("\n").length >= 3 && /(importe|monto|total|beneficiario|transferencia|transacci)/i.test(texto);
      const resultados = pareceRecibo ? [analizarRecibo(texto, contexto())] : analizarTexto(texto, contexto());
      if (!resultados.length) return toast("No entendí el texto.");
      agregar(resultados);
      area.value = "";
    });

    qs<HTMLInputElement>("#capFoto", el).addEventListener("change", (e) => {
      const input = e.target as HTMLInputElement;
      const file = input.files?.[0];
      input.value = "";
      if (file) void handleImage(file);
    });

    const propuestasEl = qs("#propuestas", el);
    propuestasEl.addEventListener("submit", (e) => {
      const form = (e.target as HTMLElement).closest<HTMLFormElement>("[data-proposal]");
      if (!form) return;
      e.preventDefault();
      void guardar(form.dataset.proposal as string);
    });
    propuestasEl.addEventListener("click", (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>("[data-action]");
      if (!b?.dataset.uid) return;
      if (b.dataset.action === "descartar") quitar(b.dataset.uid);
      if (b.dataset.action === "tipo") convertir(b.dataset.uid, b.dataset.tipo as TipoPropuesta);
    });
    propuestasEl.addEventListener("input", (e) => {
      const form = (e.target as HTMLElement).closest<HTMLFormElement>("[data-proposal]");
      if (form) renderAgendaCheck(form);
    });
  },

  update() {
    const reglas = [...store.data.reglas].sort((a, b) => a.patron.localeCompare(b.patron));
    qs("#listaReglas", root).innerHTML = reglas.length
      ? reglas.map((r) => `<li><div class="grow"><span class="title">«${esc(r.patron)}»</span> → ${esc(r.categoria)}</div>${delBtn("reglas", r.id, "Olvidar")}</li>`).join("")
      : emptyLi("Aún no hay reglas propias: se usa el diccionario incorporado hasta que corrijas alguna categoría.");
  },
};

/* ---------------------------- Formularios de propuesta ---------------------------- */

function field(p: PropuestaUI, name: string, control: string): string {
  const dudoso = p.confianza?.[name] === "baja" ? "dudoso" : "";
  return `<label class="${dudoso}" for="${p.uid}-${name}"><span>${FIELD_LABELS[name]}</span>${control}</label>`;
}

function fieldsHtml(p: PropuestaUI): string {
  const d = p.datos;
  const id = (n: string): string => `${p.uid}-${n}`;
  const val = (n: string): string => (d[n] === null || d[n] === undefined ? "" : String(d[n]));
  const input = (n: string, type = "text", extra = ""): string => `<input id="${id(n)}" name="${n}" type="${type}" value="${esc(val(n))}" ${extra}>`;
  const select = (n: string, entries: ReadonlyArray<readonly [string, string]>): string => `<select id="${id(n)}" name="${n}">${optionsHtml(entries, val(n))}</select>`;
  const kids = kidOptions(store.data.hijos);

  if (p.tipo === "gasto") {
    return `
      <div class="row">${field(p, "monto", input("monto", "number", 'inputmode="decimal" step="0.01" min="0.01" required'))}
        ${field(p, "moneda", select("moneda", MONEDAS.map((m) => [m, m])))}
        ${field(p, "fecha", input("fecha", "date", "required"))}</div>
      <div class="row">${field(p, "metodo", select("metodo", Object.entries(METODOS)))}
        ${field(p, "categoria", select("categoria", CATEGORIAS.map((c) => [c, c])))}
        ${field(p, "hijoId", select("hijoId", kids))}</div>
      <div class="row">${field(p, "descripcion", input("descripcion", "text", 'maxlength="160"'))}
        ${field(p, "naturaleza", select("naturaleza", [["variable", "Variable"], ["fijo", "Base (recurrente)"]]))}</div>
      <input type="hidden" name="fijoId" value="${esc(val("fijoId"))}">`;
  }
  if (p.tipo === "tarea") {
    return `
      ${field(p, "titulo", input("titulo", "text", 'maxlength="160" required'))}
      <div class="row">${field(p, "area", select("area", Object.entries(AREAS)))}
        ${field(p, "prioridad", select("prioridad", Object.entries(PRIORIDADES)))}
        ${field(p, "hijoId", select("hijoId", kids))}</div>
      <div class="row">${field(p, "vence", input("vence", "date"))}
        ${field(p, "hora", input("hora", "time", 'step="300"'))}
        ${field(p, "duracion", select("duracion", DURACIONES))}</div>
      <div class="row">${field(p, "costoMonto", input("costoMonto", "number", 'inputmode="decimal" min="0" step="0.01" placeholder="Sin costo"'))}
        ${field(p, "costoMoneda", select("costoMoneda", MONEDAS.map((m) => [m, m])))}
        ${field(p, "repetir", select("repetir", [["", "No se repite"], ...Object.entries(REPETICIONES)]))}</div>
      ${field(p, "costoTipo", select("costoTipo", [["fijo", "Siempre igual"], ["estimado", "Varía (estimado)"]]))}
      <input type="hidden" name="costoCategoria" value="${esc(val("costoCategoria") || "Otros")}">
      <div class="verdict" data-check role="status" aria-live="polite"></div>`;
  }
  return `
    <div class="row">${field(p, "hijoId", select("hijoId", kids))}
      ${field(p, "materia", select("materia", MATERIAS_LISTA.map((m) => [m, m])))}
      ${field(p, "tipo", select("tipo", Object.entries(TIPOS_DEBER)))}
      ${field(p, "entrega", input("entrega", "date", "required"))}</div>
    ${field(p, "descripcion", input("descripcion", "text", 'maxlength="160"'))}`;
}

function renderPropuestas(): void {
  const el = qs("#propuestas", root);
  el.innerHTML = propuestas.map((p) => `
    <form class="card proposal" data-proposal="${p.uid}" autocomplete="off">
      <div class="card-head">
        <h2>Revisa y guarda</h2>
        <div class="seg" role="group" aria-label="Tipo de registro">
          ${(Object.keys(TIPO_LABEL) as TipoPropuesta[]).map((t) => `<button type="button" data-action="tipo" data-uid="${p.uid}" data-tipo="${t}" aria-pressed="${t === p.tipo}">${TIPO_LABEL[t]}</button>`).join("")}
        </div>
      </div>
      ${fieldsHtml(p)}
      ${p.explicacion ? `<p class="small muted">${esc(p.explicacion)}</p>` : ""}
      ${p.origen === "ocr" ? `<details><summary>Texto leído de la imagen</summary><pre>${esc(p.texto)}</pre></details>` : ""}
      <div class="actions">
        <button class="btn" type="submit">Guardar ${TIPO_LABEL[p.tipo].toLowerCase()}</button>
        <button class="btn ghost" type="button" data-action="descartar" data-uid="${p.uid}">Descartar</button>
      </div>
    </form>`).join("");
  el.querySelectorAll<HTMLFormElement>("[data-proposal]").forEach(renderAgendaCheck);
}

/** En tareas con hora: dice si estás libre en ese horario. */
function renderAgendaCheck(form: HTMLFormElement): void {
  const box = form.querySelector<HTMLElement>("[data-check]");
  if (!box) return;
  const v = formValues(form);
  if (!v.hora) {
    box.className = "verdict";
    box.textContent = "Añade una hora si quieres agendarla en tu calendario.";
    return;
  }
  const fecha = v.vence || todayISO();
  const inicio = toMinutes(v.hora);
  const fin = inicio + (Number(v.duracion) || DURACION_DEFECTO);
  const r = comprobar(fecha, inicio, fin, fuentesAgenda());
  if (r.libre) {
    box.className = "verdict ok";
    box.textContent = `✓ Libre el ${fmtDate(fecha)} de ${toHHMM(inicio)} a ${toHHMM(fin)}. Se agendará al guardar.`;
    return;
  }
  const motivo = "choques" in r ? `choca con ${r.choques.map((c) => `${c.titulo} (${toHHMM(c.inicio)}–${toHHMM(c.fin)})`).join(", ")}` : "está fuera de tu jornada";
  const alt = r.alternativa ? ` Siguiente hueco: ${fmtDate(r.alternativa.fecha)} ${toHHMM(r.alternativa.inicio)}.` : "";
  box.className = "verdict bad";
  box.textContent = `✗ Ese horario ${motivo}.${alt} Se agendará igualmente si guardas.`;
}

function leerFormulario(p: PropuestaUI): DatosPropuesta {
  const form = root.querySelector<HTMLFormElement>(`[data-proposal="${p.uid}"]`);
  return form ? { ...p.datos, ...formValues(form) } : p.datos;
}

/** Cambia el tipo de una propuesta conservando texto, fecha y hijo. */
function convertir(uid: string, nuevo: TipoPropuesta): void {
  const p = buscar(uid);
  if (!p || p.tipo === nuevo) return;
  const d = leerFormulario(p);
  const texto = String(d.descripcion || d.titulo || "");
  const fecha = (d.fecha || d.vence || d.entrega || null) as string | null;
  const hoy = todayISO();
  const hijoId = (d.hijoId || null) as string | null;
  const datos: Record<TipoPropuesta, DatosPropuesta> = {
    gasto: { hijoId, monto: Number(d.monto) || null, moneda: String(d.moneda || store.config.monedaPrincipal), metodo: String(d.metodo || "efectivo"), categoria: String(d.categoria || "Otros"), descripcion: texto, fecha: fecha && fecha <= hoy ? fecha : hoy },
    tarea: { hijoId, titulo: texto, area: hijoId ? "hijos" : "personal", prioridad: "media", vence: fecha && fecha >= hoy ? fecha : null, hora: null, duracion: 60 },
    deber: { hijoId, materia: String(d.materia || "General"), tipo: "deber", entrega: fecha && fecha >= hoy ? fecha : addDays(hoy, 1), descripcion: texto },
  };
  Object.assign(p, { tipo: nuevo, datos: datos[nuevo], confianza: {}, explicacion: "", sugerida: nuevo === "gasto" ? String(datos.gasto.categoria) : null });
  renderPropuestas();
}

/* ---------------------------- Guardado y aprendizaje ---------------------------- */

async function guardar(uid: string): Promise<void> {
  const p = buscar(uid);
  if (!p) return;
  const form = qs<HTMLFormElement>(`[data-proposal="${uid}"]`, root);
  const v = formValues(form);
  const hijoId = v.hijoId || null;
  let accion: () => Promise<unknown>;

  if (p.tipo === "gasto") {
    const monto = Math.round(Number(v.monto) * 100) / 100;
    if (!(monto > 0)) return toast("Indica un monto mayor que cero.");
    if (!v.fecha) return toast("Indica la fecha del gasto.");
    const naturaleza = v.naturaleza === "fijo" ? "fijo" : "variable";
    const gasto = {
      monto, moneda: v.moneda as Moneda, metodo: v.metodo as Metodo, categoria: v.categoria, descripcion: v.descripcion, fecha: v.fecha, hijoId, origen: p.origen,
      naturaleza, fijoId: naturaleza === "fijo" ? v.fijoId || null : null,
    } as const;
    accion = async () => {
      await store.add("gastos", gasto);
      await aprender(p, gasto.categoria, gasto.descripcion);
    };
  } else if (p.tipo === "tarea") {
    if (!v.titulo) return toast("Escribe qué hay que hacer.");
    const fechaBloque = v.vence || todayISO();
    const costoMonto = Math.round(Number(v.costoMonto) * 100) / 100;
    const repetir = (v.repetir || null) as Frecuencia | null;
    accion = async () => {
      const tarea = await store.add("tareas", {
        titulo: v.titulo, area: v.area as Area, prioridad: v.prioridad as Prioridad,
        vence: v.hora || repetir ? fechaBloque : v.vence || null, hijoIds: hijoId ? [hijoId] : [], estado: "pendiente", completada: null,
        costo: costoMonto > 0 ? { tipo: v.costoTipo === "estimado" ? "estimado" : "fijo", monto: costoMonto, moneda: v.costoMoneda as Moneda, metodo: (p.datos.costoMetodo as Metodo) || "efectivo", categoria: v.costoCategoria || "Otros" } : null,
        repetir, gastoId: null, siguienteId: null, serieId: null,
      });
      if (v.hora) {
        const inicio = toMinutes(v.hora);
        await store.add("bloques", { titulo: v.titulo, fecha: fechaBloque, inicio: v.hora, fin: toHHMM(Math.min(inicio + (Number(v.duracion) || DURACION_DEFECTO), 24 * 60 - 1)), tareaId: tarea.id });
      }
    };
  } else {
    if (!hijoId) return toast(store.data.hijos.length ? "Elige de qué hijo es." : "Primero añade a tus hijos en la pestaña Hijos.");
    if (!v.entrega) return toast("Indica para qué día es.");
    accion = () => store.add("deberes", { hijoId, materia: v.materia, tipo: v.tipo as TipoDeber, entrega: v.entrega, descripcion: v.descripcion, estado: "pendiente" });
  }

  const msg = p.tipo === "tarea" && v.hora ? `Tarea guardada y agendada a las ${v.hora}` : `${TIPO_LABEL[p.tipo]} guardado`;
  if (await attempt(accion, msg)) quitar(uid);
}

/**
 * Aprende "primera palabra significativa de la descripción → categoría" cuando el usuario
 * corrige la categoría propuesta, o cuando la propuesta no tenía una clara.
 */
async function aprender(p: PropuestaUI, categoria: string, descripcion: string): Promise<void> {
  if (categoria === "Otros") return;
  const corrigio = categoria !== p.sugerida;
  const eraDudosa = p.confianza?.categoria === "baja";
  if (!corrigio && !eraDudosa) return;
  const patron = patronDeAprendizaje(descripcion);
  if (!patron) return;
  await store.put("reglas", { id: idDeRegla(patron), patron, categoria, actualizado: new Date().toISOString() });
  toast(`Aprendido: «${patron}» → ${categoria}`);
}

/* ---------------------------- OCR ---------------------------- */

function setOcrStatus(text: string, progress: number | null = null): void {
  qs("#ocrEstado", root).innerHTML = text ? `${esc(text)}${progress !== null ? `<div class="progress"><span style="width:${Math.round(progress * 100)}%"></span></div>` : ""}` : "";
}

async function handleImage(file: File): Promise<void> {
  setOcrStatus("Preparando la imagen…", 0);
  try {
    const texto = await reconocerTexto(file, (m: OcrProgress) => setOcrStatus(describirProgreso(m), m.progress ?? null));
    if (!texto.trim()) return setOcrStatus("No se encontró texto. Prueba con más luz o copia el texto de la captura y pégalo arriba.");
    agregar([analizarRecibo(texto, contexto())]);
    setOcrStatus("");
  } catch (e) {
    console.error(e);
    setOcrStatus("No se pudo leer la imagen. La primera vez necesita conexión para descargar el lector. También puedes copiar el texto de la captura y pegarlo arriba.");
  }
}
