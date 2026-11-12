/**
 * Gastos: registrar o editar (a mano o con ticket), gastos fijos del mes y movimientos.
 * El balance, el promedio y el ideal viven en la pantalla Balance (views/balance.ts).
 */
import { CATEGORIAS, DIAS_CORTOS, METODOS, MONEDAS } from "../../domain/catalog";
import { addMonths, fmtDate, fmtMonth, monthOf, todayISO } from "../../domain/dates";
import { estadoDelMes, FRECUENCIAS } from "../../domain/fijos";
import type { Frecuencia, Gasto, GastoFijo, Metodo, Moneda, Naturaleza } from "../../domain/types";
import { store } from "../../data/store";
import { attempt, chip, delBtn, emptyLi, esc, fmtMoney, formValues, kidChip, kidOptions, optionsHtml, qs, toast } from "../dom";
import { gastoItem } from "../items";
import { ICONS } from "../icons";
import type { View } from "../router";
import { gastosDelMes, totalEn } from "../selectors";
import { buscarGastos, paginar } from "../../domain/busqueda";
import { analizarRecibo } from "../../domain/clasificador.js";
import { leerTicket } from "../../domain/ticket";
import { describirProgreso, reconocerTexto } from "../../integrations/ocr";
import { abrirRevisionTicket } from "../ticketSheet";
import { mesCorto, mesNavHtml, pintarMesNav, subnavDinero } from "../dinero";

let root: HTMLElement;
const ui = {
  mes: monthOf(todayISO()),
  metodo: "efectivo" as Metodo,
  moneda: null as Moneda | null,
  naturaleza: "variable" as Naturaleza,
  editandoGasto: null as string | null,
  editandoFijo: null as string | null,
  buscar: "",
  pagina: 1,
};
const POR_PAGINA = 15;

const segButtons = (attr: string, entries: Array<[string, string]>, selected: string): string =>
  entries.map(([v, l]) => `<button type="button" data-${attr}="${v}" aria-pressed="${v === selected}">${esc(l)}</button>`).join("");

export const gastosView: View = {
  id: "gastos",
  label: "Dinero",
  icon: ICONS.gastos,

  mount(el) {
    root = el;
    el.innerHTML = `
      ${subnavDinero("gastos")}
      <a class="card resumen-mes" href="#balance" id="resumenMes"></a>

      <div class="card" id="gastoCard">
        <details id="detGasto" open>
        <summary class="summary-h2"><span id="gastoTitulo">Registrar gasto</span></summary>
        <div class="ticket-scan">
          <label class="btn ghost" for="gTicket">${ICONS.camara}<span>Escanear ticket</span>
            <input id="gTicket" type="file" accept="image/*"></label>
          <span class="small muted">Foto o captura: separa cada artículo como gasto.</span>
        </div>
        <div id="gTicketEstado" class="small muted" role="status" aria-live="polite"></div>
        <form id="formGasto" autocomplete="off">
          <div class="row">
            <label for="gMonto">Monto <input id="gMonto" name="monto" type="number" inputmode="decimal" min="0.01" step="0.01" required placeholder="350"></label>
            <label for="gFecha">Fecha <input id="gFecha" name="fecha" type="date" required></label>
          </div>
          <div class="toggles">
            <div class="seg" id="gMoneda" role="group" aria-label="Moneda"></div>
            <div class="seg" id="gMetodo" role="group" aria-label="Método de pago">${segButtons("metodo", Object.entries(METODOS), ui.metodo)}</div>
            <div class="seg" id="gNaturaleza" role="group" aria-label="Tipo de gasto">${segButtons("naturaleza", [["variable", "Variable"], ["fijo", "Base"]], ui.naturaleza)}</div>
          </div>
          <div class="row">
            <label for="gCategoria">Categoría <select id="gCategoria" name="categoria">${optionsHtml(CATEGORIAS.map((c) => [c, c]), "Alimentación")}</select></label>
            <label for="gHijo">Para (opcional) <select id="gHijo" name="hijoId"></select></label>
          </div>
          <label for="gDesc">Descripción <input id="gDesc" name="descripcion" maxlength="160" placeholder="Almuerzo, agromercado, recarga…"></label>
          <div class="actions">
            <button class="btn" type="submit" id="gGuardar">Guardar gasto</button>
            <button class="btn ghost" type="button" id="gCancelar" hidden>Cancelar edición</button>
          </div>
        </form>
        </details>
      </div>

      <div class="card" id="fijosCard">
        <div class="card-head"><h2>Gastos fijos</h2><span class="small muted" id="fijosMes"></span></div>
        <ul class="list" id="listaFijos"></ul>
        <details id="detFijosResto" hidden>
          <summary id="fijosRestoSummary"></summary>
          <ul class="list" id="listaFijosResto"></ul>
        </details>
        <details id="detFijo">
          <summary id="fijoSummary">Añadir gasto fijo</summary>
          <p class="small muted">Tus compromisos de cada mes: clases, colegiatura, renta, niñera… Marca cada pago con «Registrar pago».</p>
          <form id="formFijo" autocomplete="off">
            <div class="row">
              <label for="fNombre">Concepto <input id="fNombre" name="nombre" required maxlength="80" placeholder="Inglés"></label>
              <label for="fMonto">Importe <input id="fMonto" name="monto" type="number" inputmode="decimal" min="0.01" step="0.01" required></label>
              <label for="fMoneda">Moneda <select id="fMoneda" name="moneda">${optionsHtml(MONEDAS.map((m) => [m, m]), store.config.monedaPrincipal)}</select></label>
            </div>
            <div class="row">
              <label for="fFrecuencia">Frecuencia <select id="fFrecuencia" name="frecuencia">${optionsHtml(Object.entries(FRECUENCIAS), "mensual")}</select></label>
              <label for="fDia"><span id="fDiaLabel">Día de pago</span> <select id="fDia" name="diaPago"></select></label>
              <label for="fMetodo">Se paga con <select id="fMetodo" name="metodo">${optionsHtml(Object.entries(METODOS), "efectivo")}</select></label>
            </div>
            <label for="fCategoria">Categoría <select id="fCategoria" name="categoria">${optionsHtml(CATEGORIAS.map((c) => [c, c]), "Educación")}</select></label>
            <fieldset class="fieldset"><legend>De quién (opcional)</legend><div class="days" id="fHijos"></div></fieldset>
            <label class="check" for="fActivo"><input type="checkbox" id="fActivo" name="activo" checked> Activo (desmárcalo si se pausa, por ejemplo en vacaciones)</label>
            <div class="actions">
              <button class="btn" type="submit" id="fGuardar">Guardar gasto fijo</button>
              <button class="btn ghost" type="button" id="fCancelar" hidden>Cancelar edición</button>
            </div>
          </form>
        </details>
      </div>

      <div class="card" id="movCard">
        <div class="card-head"><h2 id="movTitulo">Movimientos</h2><span class="small muted" id="movTotal"></span></div>
        ${mesNavHtml("m")}
        <input id="movBuscar" type="search" placeholder="Buscar: fogón, Alain, 300, banca…" aria-label="Buscar movimientos" autocomplete="off">
        <ul class="list" id="listaGastos"></ul>
        <div class="pager" id="movPager"></div>
      </div>
      `;

    qs<HTMLInputElement>("#gFecha", el).value = todayISO();
    renderDiasPago("mensual", 1);

    el.addEventListener("click", (e) => {
      const t = e.target as HTMLElement;
      const b = t.closest<HTMLElement>("[data-metodo], [data-moneda], [data-naturaleza]");
      if (b) {
        if (b.dataset.metodo) ui.metodo = b.dataset.metodo as Metodo;
        if (b.dataset.moneda) ui.moneda = b.dataset.moneda as Moneda;
        if (b.dataset.naturaleza) ui.naturaleza = b.dataset.naturaleza as Naturaleza;
        renderToggles();
        return;
      }
      const eg = t.closest<HTMLElement>("[data-edit-gasto]");
      const g = eg ? store.byId("gastos", eg.dataset.editGasto) : undefined;
      if (g) return editarGasto(g);
      const ef = t.closest<HTMLElement>("[data-edit-fijo]");
      const f = ef ? store.byId("fijos", ef.dataset.editFijo) : undefined;
      if (f) return editarFijo(f);
    });

    qs<HTMLFormElement>("#formGasto", el).addEventListener("submit", (e) => {
      e.preventDefault();
      void guardarGasto(e.target as HTMLFormElement);
    });
    qs<HTMLButtonElement>("#gCancelar", el).addEventListener("click", () => salirEdicionGasto());
    qs<HTMLInputElement>("#gTicket", el).addEventListener("change", (e) => {
      const input = e.target as HTMLInputElement;
      const file = input.files?.[0];
      input.value = "";
      if (file) void escanearTicket(file);
    });

    qs<HTMLFormElement>("#formFijo", el).addEventListener("submit", (e) => {
      e.preventDefault();
      void guardarFijo(e.target as HTMLFormElement);
    });
    qs<HTMLButtonElement>("#fCancelar", el).addEventListener("click", () => salirEdicionFijo());
    qs<HTMLSelectElement>("#fFrecuencia", el).addEventListener("change", (e) => renderDiasPago((e.target as HTMLSelectElement).value as Frecuencia));

    const irA = (ym: string): void => {
      ui.mes = ym;
      ui.pagina = 1;
      renderMovimientos();
    };
    qs<HTMLInputElement>("#mMes", el).addEventListener("change", (e) => {
      const v = (e.target as HTMLInputElement).value;
      if (v) irA(v);
    });
    qs("#mPrev", el).addEventListener("click", () => irA(addMonths(ui.mes, -1)));
    qs("#mNext", el).addEventListener("click", () => irA(addMonths(ui.mes, 1)));
    qs<HTMLInputElement>("#movBuscar", el).addEventListener("input", (e) => {
      ui.buscar = (e.target as HTMLInputElement).value;
      ui.pagina = 1;
      renderMovimientos();
    });
    qs("#movPager", el).addEventListener("click", (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-pagina]");
      if (!b) return;
      ui.pagina = Number(b.dataset.pagina);
      renderMovimientos();
      qs("#movCard", el).scrollIntoView({ behavior: "smooth", block: "start" });
    });
  },

  update() {
    renderToggles();
    const sel = qs<HTMLSelectElement>("#gHijo", root);
    const current = sel.value;
    sel.innerHTML = optionsHtml(kidOptions(store.data.hijos), current);
    renderHijosFijo();
    renderResumenMes();
    renderFijos();
    renderMovimientos();
  },
};

/* ------------------------------ Resumen del mes (enlace al balance) ------------------------------ */

function renderResumenMes(): void {
  const ym = monthOf(todayISO());
  const delMes = gastosDelMes(ym);
  const totales = MONEDAS.filter((m) => delMes.some((g) => g.moneda === m)).map((m) => fmtMoney(totalEn(delMes, m), m));
  const pendientes = store.data.fijos.filter((f) => f.activo && !estadoDelMes(f, store.data.gastos, ym, todayISO()).completo).length;
  qs("#resumenMes", root).innerHTML = `
    <div class="grow">
      <div class="small muted">Gastado en ${esc(mesCorto(ym))}</div>
      <div class="resumen-num">${totales.length ? totales.map(esc).join(" · ") : "Nada todavía"}</div>
      ${pendientes ? `<div class="small muted">${pendientes} ${pendientes === 1 ? "gasto fijo pendiente" : "gastos fijos pendientes"}</div>` : ""}
    </div>
    <span class="resumen-link">Ver balance ›</span>`;
}

/* ------------------------------ Movimientos (buscar + paginar) ------------------------------ */

/** Sin búsqueda: los del mes elegido. Con búsqueda: en todos los meses, más recientes primero. */
function renderMovimientos(): void {
  const buscando = ui.buscar.trim().length > 0;
  pintarMesNav(root, "m", ui.mes);
  qs<HTMLButtonElement>("#mNext", root).disabled = ui.mes >= monthOf(todayISO());
  qs("#movCard .mes-nav", root).hidden = buscando;
  const base = buscando
    ? [...store.data.gastos].sort((a, b) => b.fecha.localeCompare(a.fecha) || (b.creado ?? "").localeCompare(a.creado ?? ""))
    : gastosDelMes(ui.mes);
  const resultados = buscarGastos(base, ui.buscar, (id) => store.byId("hijos", id)?.nombre ?? "");
  const pag = paginar(resultados, ui.pagina, POR_PAGINA);
  ui.pagina = pag.pagina;

  qs("#movTitulo", root).textContent = buscando ? "Resultados" : "Movimientos";
  qs("#movTotal", root).textContent = pag.total ? `${pag.total} ${pag.total === 1 ? "movimiento" : "movimientos"}` : "";

  let lastDate: string | null = null;
  qs("#listaGastos", root).innerHTML = pag.items.length
    ? pag.items.map((g) => {
        const head = g.fecha !== lastDate ? `<li class="date-head">${esc(fmtDate(g.fecha))}${g.fecha.slice(0, 4) !== todayISO().slice(0, 4) ? ` ${g.fecha.slice(0, 4)}` : ""}</li>` : "";
        lastDate = g.fecha;
        return head + gastoItem(g, { fecha: false, editar: true });
      }).join("")
    : emptyLi(buscando ? "Nada coincide con la búsqueda." : `No hay gastos en ${fmtMonth(ui.mes)}.`);

  qs("#movPager", root).innerHTML = pag.paginas > 1
    ? `<button class="btn ghost" type="button" data-pagina="${pag.pagina - 1}" ${pag.pagina === 1 ? "disabled" : ""}>‹ Anterior</button>
       <span class="small muted">${pag.desde}–${pag.hasta} de ${pag.total}</span>
       <button class="btn ghost" type="button" data-pagina="${pag.pagina + 1}" ${pag.pagina === pag.paginas ? "disabled" : ""}>Siguiente ›</button>`
    : "";
}

/* ------------------------------ Gasto (crear / editar) ------------------------------ */

function renderToggles(): void {
  const moneda = ui.moneda ?? store.config.monedaPrincipal;
  qs("#gMoneda", root).innerHTML = segButtons("moneda", MONEDAS.map((m) => [m, m]), moneda);
  root.querySelectorAll<HTMLButtonElement>("[data-metodo]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.metodo === ui.metodo)));
  root.querySelectorAll<HTMLButtonElement>("[data-naturaleza]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.naturaleza === ui.naturaleza)));
}

function editarGasto(g: Gasto): void {
  ui.editandoGasto = g.id;
  ui.moneda = g.moneda;
  ui.metodo = g.metodo;
  ui.naturaleza = g.naturaleza;
  const form = qs<HTMLFormElement>("#formGasto", root);
  const set = (n: string, v: string): void => {
    (form.elements.namedItem(n) as HTMLInputElement | HTMLSelectElement).value = v;
  };
  set("monto", String(g.monto));
  set("fecha", g.fecha);
  set("categoria", g.categoria);
  set("hijoId", g.hijoId ?? "");
  set("descripcion", g.descripcion);
  renderToggles();
  qs<HTMLDetailsElement>("#detGasto", root).open = true;
  qs("#gastoTitulo", root).textContent = "Editar gasto";
  qs("#gGuardar", root).textContent = "Guardar cambios";
  qs("#gCancelar", root).hidden = false;
  qs("#gastoCard", root).scrollIntoView({ behavior: "smooth", block: "start" });
}

function salirEdicionGasto(): void {
  ui.editandoGasto = null;
  ui.naturaleza = "variable";
  const form = qs<HTMLFormElement>("#formGasto", root);
  form.reset();
  qs<HTMLInputElement>("#gFecha", root).value = todayISO();
  qs<HTMLDetailsElement>("#detGasto", root).open = false;
  qs("#gastoTitulo", root).textContent = "Registrar gasto";
  qs("#gGuardar", root).textContent = "Guardar gasto";
  qs("#gCancelar", root).hidden = true;
  renderToggles();
}

/* ---------------------------- Ticket escaneado ---------------------------- */

function estadoTicket(texto: string, progreso: number | null = null): void {
  qs("#gTicketEstado", root).innerHTML = texto
    ? `${esc(texto)}${progreso !== null ? `<div class="progress"><span style="width:${Math.round(progreso * 100)}%"></span></div>` : ""}`
    : "";
}

/** OCR local → artículos. Si no se distinguen artículos, rellena el formulario con el total. */
async function escanearTicket(file: File): Promise<void> {
  estadoTicket("Preparando la imagen…", 0);
  let texto: string;
  try {
    texto = await reconocerTexto(file, (p) => estadoTicket(describirProgreso(p), p.progress ?? null));
  } catch (e) {
    console.error(e);
    return estadoTicket("No se pudo leer la imagen. La primera vez necesita conexión para descargar el lector.");
  }
  if (!texto.trim()) return estadoTicket("No se encontró texto. Prueba con más luz, el ticket plano y sin sombras.");
  estadoTicket("");

  const ctx = { hoy: todayISO(), hijos: store.data.hijos, reglas: store.data.reglas, monedaPorDefecto: store.config.monedaPrincipal };
  const recibo = analizarRecibo(texto, ctx).datos;
  const lectura = leerTicket(texto);
  if (lectura.articulos.length) {
    abrirRevisionTicket(lectura, texto, {
      fecha: String(recibo.fecha ?? todayISO()),
      moneda: (recibo.moneda as Moneda) ?? store.config.monedaPrincipal,
      metodo: (recibo.metodo as Metodo) ?? "efectivo",
    });
    return;
  }
  // Sin artículos separables (p. ej. comprobante de Banca Remota): un solo gasto con el total.
  const form = qs<HTMLFormElement>("#formGasto", root);
  if (recibo.monto) qs<HTMLInputElement>("#gMonto", form).value = String(recibo.monto);
  if (recibo.fecha) qs<HTMLInputElement>("#gFecha", form).value = String(recibo.fecha);
  qs<HTMLInputElement>("#gDesc", form).value = String(recibo.descripcion ?? "");
  const categoria = String(recibo.categoria ?? "");
  if (CATEGORIAS.includes(categoria)) qs<HTMLSelectElement>("#gCategoria", form).value = categoria;
  ui.moneda = recibo.moneda as Moneda;
  ui.metodo = recibo.metodo as Metodo;
  renderToggles();
  estadoTicket("No distinguí artículos sueltos: rellené el gasto con el total. Revísalo y guarda.");
}

async function guardarGasto(form: HTMLFormElement): Promise<void> {
  const v = formValues(form);
  const monto = Math.round(Number(v.monto) * 100) / 100;
  if (!(monto > 0)) return toast("El monto debe ser mayor que cero.");
  const datos = {
    monto, moneda: ui.moneda ?? store.config.monedaPrincipal, metodo: ui.metodo, categoria: v.categoria,
    descripcion: v.descripcion, fecha: v.fecha, hijoId: v.hijoId || null, naturaleza: ui.naturaleza,
  };
  const id = ui.editandoGasto;
  const previo = store.byId("gastos", id);
  const ok = await attempt(
    () => id
      // Si deja de ser fijo, se desvincula de su gasto fijo.
      ? store.update("gastos", id, { ...datos, fijoId: datos.naturaleza === "fijo" ? previo?.fijoId ?? null : null })
      : store.add("gastos", { ...datos, origen: "manual", fijoId: null }),
    id ? "Cambios guardados" : "Gasto guardado",
  );
  if (!ok) return;
  if (id) salirEdicionGasto();
  else {
    qs<HTMLInputElement>("#gMonto", root).value = "";
    qs<HTMLInputElement>("#gDesc", root).value = "";
  }
}

/* ------------------------------ Gastos fijos ------------------------------ */

function renderDiasPago(frecuencia: Frecuencia, seleccionado?: number): void {
  const sel = qs<HTMLSelectElement>("#fDia", root);
  const actual = seleccionado ?? Number(sel.value);
  const semanal = frecuencia === "semanal";
  qs("#fDiaLabel", root).textContent = semanal ? "Día de la semana" : frecuencia === "quincenal" ? "Primer día de pago" : "Día del mes";
  const entries: Array<[string, string]> = semanal
    ? DIAS_CORTOS.map((d, i) => [String(i + 1), d])
    : Array.from({ length: frecuencia === "quincenal" ? 15 : 31 }, (_, i) => [String(i + 1), String(i + 1)]);
  const valor = entries.some(([v]) => Number(v) === actual) ? String(actual) : "1";
  sel.innerHTML = optionsHtml(entries, valor);
}

function renderHijosFijo(seleccion?: readonly string[]): void {
  const cont = qs("#fHijos", root);
  const marcados = seleccion ?? Array.from(cont.querySelectorAll<HTMLInputElement>("input:checked")).map((i) => i.value);
  cont.innerHTML = store.data.hijos.length
    ? store.data.hijos.map((k) => `<label for="fh-${esc(k.id)}"><input type="checkbox" id="fh-${esc(k.id)}" name="hijo" value="${esc(k.id)}"${marcados.includes(k.id) ? " checked" : ""}>${esc(k.nombre)}</label>`).join("")
    : `<span class="small muted">Añade a tus hijos en la pestaña Hijos.</span>`;
}

const diaPagoTexto = (f: GastoFijo): string =>
  f.frecuencia === "semanal" ? `cada ${DIAS_CORTOS[f.diaPago - 1].toLowerCase()}` : f.frecuencia === "quincenal" ? `días ${f.diaPago} y ${f.diaPago + 15}` : `día ${f.diaPago}`;

function renderFijos(): void {
  const hoy = todayISO();
  const ym = monthOf(hoy);
  qs("#fijosMes", root).textContent = fmtMonth(ym);
  const fijos = [...store.data.fijos]
    .map((f) => ({ f, e: estadoDelMes(f, store.data.gastos, ym, hoy) }))
    .sort((a, b) => Number(b.f.activo) - Number(a.f.activo) || (a.e.proximo ?? "9999").localeCompare(b.e.proximo ?? "9999") || a.f.nombre.localeCompare(b.f.nombre));
  // Arriba solo lo que falta por pagar este mes; lo pagado y lo pausado, plegado.
  const pendientes = fijos.filter(({ f, e }) => f.activo && !e.completo);
  const resto = fijos.filter((x) => !pendientes.includes(x));
  const item = ({ f, e }: (typeof fijos)[number]): string => {
    const estado = !f.activo ? chip("Pausado")
      : e.completo ? chip(e.esperados > 1 ? `Pagado ${e.pagos}/${e.esperados}` : "Pagado", "ok")
      : e.vencido ? chip(`Vencido · ${fmtDate(e.proximo as string)}`, "bad")
      : chip(`${e.pagos ? `${e.pagos}/${e.esperados} · ` : ""}Vence ${fmtDate(e.proximo as string)}`, "warn");
    const kids = f.hijoIds.map((id) => kidChip(store.byId("hijos", id))).join("");
    return `<li><div class="grow">
      <div class="item-head"><span class="title">${esc(f.nombre)}</span><span class="amount">${esc(fmtMoney(f.monto, f.moneda))}</span></div>
      <div class="chips">${estado}${chip(`${FRECUENCIAS[f.frecuencia]} · ${diaPagoTexto(f)}`)}${chip(f.categoria)}${kids}</div>
      <div class="item-foot">
        ${f.activo && !e.completo ? `<button class="icon-btn accent" type="button" data-pagar-fijo="${esc(f.id)}">Registrar pago</button>` : ""}
        <span class="item-actions">
          <button class="icon-btn" type="button" data-edit-fijo="${esc(f.id)}">Editar</button>
          ${delBtn("fijos", f.id)}
        </span>
      </div>
    </div></li>`;
  };
  qs("#listaFijos", root).innerHTML = !fijos.length
    ? emptyLi("Aún no tienes gastos fijos. Añade las clases, la colegiatura o la renta para separarlos de los gastos del día a día.")
    : pendientes.length ? pendientes.map(item).join("")
    : emptyLi("Todo pagado este mes.");
  const det = qs<HTMLDetailsElement>("#detFijosResto", root);
  det.hidden = !resto.length;
  qs("#fijosRestoSummary", root).textContent = `Pagados y pausados (${resto.length})`;
  qs("#listaFijosResto", root).innerHTML = resto.map(item).join("");
}

function editarFijo(f: GastoFijo): void {
  ui.editandoFijo = f.id;
  const form = qs<HTMLFormElement>("#formFijo", root);
  const set = (n: string, v: string): void => {
    (form.elements.namedItem(n) as HTMLInputElement | HTMLSelectElement).value = v;
  };
  set("nombre", f.nombre);
  set("monto", String(f.monto));
  set("moneda", f.moneda);
  set("frecuencia", f.frecuencia);
  renderDiasPago(f.frecuencia, f.diaPago);
  set("metodo", f.metodo);
  set("categoria", f.categoria);
  qs<HTMLInputElement>("#fActivo", form).checked = f.activo;
  renderHijosFijo(f.hijoIds);
  qs("#fijoSummary", root).textContent = `Editando: ${f.nombre}`;
  qs("#fGuardar", root).textContent = "Guardar cambios";
  qs("#fCancelar", root).hidden = false;
  const det = qs<HTMLDetailsElement>("#detFijo", root);
  det.open = true;
  det.scrollIntoView({ behavior: "smooth", block: "start" });
}

function salirEdicionFijo(): void {
  ui.editandoFijo = null;
  qs<HTMLFormElement>("#formFijo", root).reset();
  renderDiasPago("mensual", 1);
  renderHijosFijo([]);
  qs("#fijoSummary", root).textContent = "Añadir gasto fijo";
  qs("#fGuardar", root).textContent = "Guardar gasto fijo";
  qs("#fCancelar", root).hidden = true;
}

async function guardarFijo(form: HTMLFormElement): Promise<void> {
  const v = formValues(form);
  const monto = Math.round(Number(v.monto) * 100) / 100;
  if (!v.nombre) return toast("Escribe el concepto.");
  if (!(monto > 0)) return toast("El importe debe ser mayor que cero.");
  const datos: Omit<GastoFijo, "id" | "creado"> = {
    nombre: v.nombre, monto, moneda: v.moneda as Moneda, metodo: v.metodo as Metodo, categoria: v.categoria,
    frecuencia: v.frecuencia as Frecuencia, diaPago: Number(v.diaPago) || 1,
    hijoIds: Array.from(form.querySelectorAll<HTMLInputElement>('input[name="hijo"]:checked')).map((i) => i.value),
    activo: qs<HTMLInputElement>("#fActivo", form).checked,
  };
  const id = ui.editandoFijo;
  const ok = await attempt(() => (id ? store.update("fijos", id, datos) : store.add("fijos", datos)), id ? "Cambios guardados" : "Gasto fijo añadido");
  if (ok) {
    salirEdicionFijo();
    qs<HTMLDetailsElement>("#detFijo", root).open = false;
  }
}
