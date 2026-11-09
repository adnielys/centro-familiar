/**
 * Gastos: registrar/editar, gastos fijos (compromisos recurrentes) y análisis fijo vs variable.
 */
import { CATEGORIAS, DIAS_CORTOS, METODOS, MONEDAS } from "../../domain/catalog";
import { daysInMonth, fmtDate, fmtMonth, monthOf, todayISO } from "../../domain/dates";
import { estadoDelMes, FRECUENCIAS, historico, resumenDelMes } from "../../domain/fijos";
import type { Frecuencia, Gasto, GastoFijo, Metodo, Moneda, Naturaleza } from "../../domain/types";
import { store } from "../../data/store";
import { barrasApiladas } from "../charts";
import { attempt, chip, delBtn, emptyLi, esc, fmtMoney, formValues, kidChip, kidOptions, numberFmt, optionsHtml, qs, toast } from "../dom";
import { gastoItem } from "../items";
import { ICONS } from "../icons";
import type { View } from "../router";
import { gastosDelMes, sumarPor, totalEn } from "../selectors";

let root: HTMLElement;
const ui = {
  mes: monthOf(todayISO()),
  metodo: "efectivo" as Metodo,
  moneda: null as Moneda | null,
  naturaleza: "variable" as Naturaleza,
  editandoGasto: null as string | null,
  editandoFijo: null as string | null,
};

const segButtons = (attr: string, entries: Array<[string, string]>, selected: string): string =>
  entries.map(([v, l]) => `<button type="button" data-${attr}="${v}" aria-pressed="${v === selected}">${esc(l)}</button>`).join("");

function bars(totals: Record<string, number>, cur: string): string {
  const entries = Object.entries(totals).sort((a, b) => b[1] - a[1]);
  if (!entries.length) return `<div class="empty">Sin datos en ${esc(cur)}.</div>`;
  const max = entries[0][1] || 1;
  return entries.map(([k, v]) => `<div class="bar-row"><span>${esc(k)}</span><div class="bar-track"><div class="bar-fill" style="width:${((v / max) * 100).toFixed(1)}%"></div></div><span class="amount">${esc(numberFmt.format(v))}</span></div>`).join("");
}

export const gastosView: View = {
  id: "gastos",
  label: "Dinero",
  icon: ICONS.gastos,

  mount(el) {
    root = el;
    el.innerHTML = `
      <div class="card" id="gastoCard">
        <h2 id="gastoTitulo">Registrar gasto</h2>
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
      </div>

      <div class="card" id="fijosCard">
        <div class="card-head"><h2>Gastos fijos</h2><span class="small muted" id="fijosMes"></span></div>
        <p class="small muted">Tus compromisos de cada mes: clases, colegiatura, renta, niñera… Marca cada pago con «Registrar pago».</p>
        <ul class="list" id="listaFijos"></ul>
        <details id="detFijo">
          <summary id="fijoSummary">Añadir gasto fijo</summary>
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

      <div class="card">
        <div class="card-head">
          <h2>Resumen del mes</h2>
          <div class="toggles">
            <label for="gMes">Mes <input id="gMes" type="month"></label>
            <label for="gPrincipal">Análisis en <select id="gPrincipal">${optionsHtml(MONEDAS.map((m) => [m, m]), store.config.monedaPrincipal)}</select></label>
          </div>
        </div>
        <div class="tiles" id="gastoTiles"></div>

        <div class="subcard">
          <h3>Gasto base (recurrente) y gasto variable</h3>
          <p class="small muted">Base: lo que se repite cada mes (clases, luz, renta…), aunque el importe cambie. Variable: el resto, donde se ve si estás gastando de más.</p>
          <div class="tiles" id="natTiles"></div>
          <div class="split" id="natSplit"><span class="seg-fijo"></span><span class="seg-variable"></span></div>
          <div class="legend small"><span><span class="dot dot-fijo"></span>Base</span><span><span class="dot dot-variable"></span>Variable</span></div>
          <div id="natChart"></div>
          <p class="small muted" id="natNota"></p>
        </div>

        <div class="grid2">
          <div class="subcard"><h3>Gasto variable por categoría</h3><p class="small muted">Aquí se ve dónde se va el dinero extra.</p><div class="bars" id="gastoCategorias"></div></div>
          <div class="subcard">
            <h3>Por método de pago</h3>
            <div class="split" id="gastoSplit"><span></span><span></span></div>
            <div class="legend small" id="gastoSplitLegend"></div>
            <h3>Por hijo</h3>
            <div class="bars" id="gastoHijos"></div>
          </div>
        </div>
      </div>
      <div class="card"><h2>Movimientos del mes</h2><ul class="list" id="listaGastos"></ul></div>`;

    qs<HTMLInputElement>("#gFecha", el).value = todayISO();
    qs<HTMLInputElement>("#gMes", el).value = ui.mes;
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

    qs<HTMLFormElement>("#formFijo", el).addEventListener("submit", (e) => {
      e.preventDefault();
      void guardarFijo(e.target as HTMLFormElement);
    });
    qs<HTMLButtonElement>("#fCancelar", el).addEventListener("click", () => salirEdicionFijo());
    qs<HTMLSelectElement>("#fFrecuencia", el).addEventListener("change", (e) => renderDiasPago((e.target as HTMLSelectElement).value as Frecuencia));

    qs<HTMLInputElement>("#gMes", el).addEventListener("change", (e) => {
      const v = (e.target as HTMLInputElement).value;
      if (v) {
        ui.mes = v;
        this.update();
      }
    });
    qs<HTMLSelectElement>("#gPrincipal", el).addEventListener("change", (e) => {
      void attempt(() => store.saveConfig({ monedaPrincipal: (e.target as HTMLSelectElement).value as Moneda }));
    });
  },

  update() {
    renderToggles();
    const sel = qs<HTMLSelectElement>("#gHijo", root);
    const current = sel.value;
    sel.innerHTML = optionsHtml(kidOptions(store.data.hijos), current);
    renderHijosFijo();
    renderFijos();
    renderResumen();
  },
};

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
  qs("#gastoTitulo", root).textContent = "Registrar gasto";
  qs("#gGuardar", root).textContent = "Guardar gasto";
  qs("#gCancelar", root).hidden = true;
  renderToggles();
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
  const fijos = [...store.data.fijos].sort((a, b) => Number(b.activo) - Number(a.activo) || a.nombre.localeCompare(b.nombre));
  qs("#listaFijos", root).innerHTML = fijos.length
    ? fijos.map((f) => {
        const e = estadoDelMes(f, store.data.gastos, ym, hoy);
        const estado = !f.activo ? chip("Pausado")
          : e.completo ? chip(e.esperados > 1 ? `Pagado ${e.pagos}/${e.esperados}` : "Pagado", "ok")
          : e.vencido ? chip(`Vencido · ${fmtDate(e.proximo as string)}`, "bad")
          : chip(`${e.pagos ? `${e.pagos}/${e.esperados} · ` : ""}Vence ${fmtDate(e.proximo as string)}`, "warn");
        const kids = f.hijoIds.map((id) => kidChip(store.byId("hijos", id))).join("");
        return `<li>
          <div class="grow"><div class="title">${esc(f.nombre)}</div>
            <div class="chips">${estado}${chip(`${FRECUENCIAS[f.frecuencia]} · ${diaPagoTexto(f)}`)}${chip(f.categoria)}${kids}</div>
          </div>
          <div class="row-actions col">
            <span class="amount">${esc(fmtMoney(f.monto, f.moneda))}</span>
            <div class="row-actions">
              ${f.activo && !e.completo ? `<button class="icon-btn accent" type="button" data-pagar-fijo="${esc(f.id)}">Registrar pago</button>` : ""}
              <button class="icon-btn" type="button" data-edit-fijo="${esc(f.id)}">Editar</button>
              ${delBtn("fijos", f.id)}
            </div>
          </div></li>`;
      }).join("")
    : emptyLi("Aún no tienes gastos fijos. Añade las clases, la colegiatura o la renta para separarlos de los gastos del día a día.");
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

/* ------------------------------ Resumen y gráficos ------------------------------ */

function renderResumen(): void {
  const cur = store.config.monedaPrincipal;
  qs<HTMLSelectElement>("#gPrincipal", root).value = cur;
  const delMes = gastosDelMes(ui.mes);
  const enBase = delMes.filter((g) => g.moneda === cur);
  const dias = ui.mes === monthOf(todayISO()) ? new Date().getDate() : daysInMonth(ui.mes);

  qs("#gastoTiles", root).innerHTML = MONEDAS.map((m) => {
    const t = totalEn(delMes, m);
    const n = delMes.filter((g) => g.moneda === m).length;
    return `<div class="tile"><div class="num">${esc(numberFmt.format(t))} <span class="small muted">${m}</span></div><div class="lbl">${esc(numberFmt.format(t / Math.max(dias, 1)))} ${m}/día · ${n} movimientos · ${esc(fmtMonth(ui.mes))}</div></div>`;
  }).join("");

  // Fijo vs variable
  const r = resumenDelMes(store.data.gastos, store.data.fijos, ui.mes, cur);
  qs("#natTiles", root).innerHTML = `
    <div class="tile"><div class="num">${esc(numberFmt.format(r.fijoPagado))}</div><div class="lbl">Base pagado${r.fijoPrevisto ? ` de ${esc(numberFmt.format(r.fijoPrevisto))} previstos` : ""} (${cur})</div></div>
    <div class="tile${r.pctVariable >= 50 ? " alert" : ""}"><div class="num">${esc(numberFmt.format(r.variable))}</div><div class="lbl">Variable (${cur}) · ${r.pctVariable}% del gasto</div></div>`;
  const [sf, sv] = Array.from(qs("#natSplit", root).children) as HTMLElement[];
  sf.style.width = `${r.total ? 100 - r.pctVariable : 0}%`;
  sv.style.width = `${r.total ? r.pctVariable : 0}%`;
  const hist = historico(store.data.gastos, ui.mes, cur, 6);
  const mesCorto = (ym: string): string => fmtMonth(ym).slice(0, 3);
  qs("#natChart", root).innerHTML = hist.some((h) => h.fijo || h.variable)
    ? barrasApiladas(hist.map((h) => ({ label: mesCorto(h.ym), valores: [h.fijo, h.variable] })), ["var(--fijo)", "var(--variable)"], ["Base", "Variable"], hist.length - 1)
    : `<div class="empty">Cuando registres gastos verás aquí la evolución de los últimos 6 meses.</div>`;
  const anteriores = hist.slice(0, -1).filter((h) => h.fijo || h.variable);
  const media = anteriores.length ? anteriores.reduce((s, h) => s + h.variable, 0) / anteriores.length : 0;
  qs("#natNota", root).textContent = media
    ? `Tu gasto variable medio de los meses anteriores es ${numberFmt.format(media)} ${cur}; este mes llevas ${numberFmt.format(r.variable)} (${r.variable > media ? "+" : ""}${Math.round(((r.variable - media) / media) * 100)}%).`
    : "";

  // Variable por categoría, método e hijo
  const variables = enBase.filter((g) => g.naturaleza !== "fijo");
  qs("#gastoCategorias", root).innerHTML = bars(sumarPor(variables, (g) => g.categoria), cur);
  const porMetodo = sumarPor(enBase, (g) => g.metodo);
  const total = totalEn(enBase, cur);
  const efectivo = porMetodo.efectivo ?? 0;
  const banca = porMetodo.banca_remota ?? 0;
  const [a, b] = Array.from(qs("#gastoSplit", root).children) as HTMLElement[];
  a.style.width = `${total ? (efectivo / total) * 100 : 0}%`;
  b.style.width = `${total ? (banca / total) * 100 : 0}%`;
  qs("#gastoSplitLegend", root).innerHTML = `<span><span class="dot" style="background:var(--accent)"></span>Efectivo ${esc(numberFmt.format(efectivo))}</span><span><span class="dot" style="background:var(--warn)"></span>Banca Remota ${esc(numberFmt.format(banca))}</span>`;
  const porHijo = sumarPor(enBase.filter((g) => g.hijoId), (g) => store.byId("hijos", g.hijoId)?.nombre ?? "Sin asignar");
  qs("#gastoHijos", root).innerHTML = Object.keys(porHijo).length ? bars(porHijo, cur) : `<div class="empty">Ningún gasto asignado a un hijo este mes.</div>`;

  let lastDate: string | null = null;
  qs("#listaGastos", root).innerHTML = delMes.length
    ? delMes.map((g) => {
        const head = g.fecha !== lastDate ? `<li class="date-head">${esc(fmtDate(g.fecha))}</li>` : "";
        lastDate = g.fecha;
        return head + gastoItem(g, { fecha: false, editar: true });
      }).join("")
    : emptyLi("No hay gastos en este mes.");
}
