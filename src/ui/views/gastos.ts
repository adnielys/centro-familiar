import { CATEGORIAS, METODOS, MONEDAS } from "../../domain/catalog";
import { daysInMonth, fmtDate, fmtMonth, monthOf, todayISO } from "../../domain/dates";
import type { Metodo, Moneda } from "../../domain/types";
import { store } from "../../data/store";
import { attempt, emptyLi, esc, formValues, kidOptions, numberFmt, optionsHtml, qs, toast } from "../dom";
import { gastoItem } from "../items";
import type { View } from "../router";
import { gastosDelMes, sumarPor, totalEn } from "../selectors";

let root: HTMLElement;
const ui = { mes: monthOf(todayISO()), metodo: "efectivo" as Metodo, moneda: null as Moneda | null };

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
  label: "Gastos",

  mount(el) {
    root = el;
    el.innerHTML = `
      <div class="card">
        <h2>Registrar gasto</h2>
        <form id="formGasto" autocomplete="off">
          <div class="row">
            <label for="gMonto">Monto <input id="gMonto" name="monto" type="number" inputmode="decimal" min="0.01" step="0.01" required placeholder="350"></label>
            <label for="gFecha">Fecha <input id="gFecha" name="fecha" type="date" required></label>
          </div>
          <div class="toggles">
            <div class="seg" id="gMoneda" role="group" aria-label="Moneda"></div>
            <div class="seg" id="gMetodo" role="group" aria-label="Método de pago">${segButtons("metodo", Object.entries(METODOS), ui.metodo)}</div>
          </div>
          <div class="row">
            <label for="gCategoria">Categoría <select id="gCategoria" name="categoria">${optionsHtml(CATEGORIAS.map((c) => [c, c]), "Alimentación")}</select></label>
            <label for="gHijo">Para (opcional) <select id="gHijo" name="hijoId"></select></label>
          </div>
          <label for="gDesc">Descripción <input id="gDesc" name="descripcion" maxlength="160" placeholder="Almuerzo, agromercado, recarga…"></label>
          <button class="btn" type="submit">Guardar gasto</button>
        </form>
      </div>
      <div class="card">
        <div class="card-head">
          <h2>Resumen del mes</h2>
          <div class="toggles">
            <label for="gMes">Mes <input id="gMes" type="month"></label>
            <label for="gPrincipal">Gráficos en <select id="gPrincipal">${optionsHtml(MONEDAS.map((m) => [m, m]), store.config.monedaPrincipal)}</select></label>
          </div>
        </div>
        <div class="tiles" id="gastoTiles"></div>
        <div class="grid2">
          <div class="subcard"><h3>Por categoría</h3><div class="bars" id="gastoCategorias"></div></div>
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

    el.addEventListener("click", (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>("[data-metodo], [data-moneda]");
      if (!b) return;
      if (b.dataset.metodo) ui.metodo = b.dataset.metodo as Metodo;
      if (b.dataset.moneda) ui.moneda = b.dataset.moneda as Moneda;
      renderToggles();
    });

    qs<HTMLFormElement>("#formGasto", el).addEventListener("submit", async (e) => {
      e.preventDefault();
      const v = formValues(e.target as HTMLFormElement);
      const monto = Math.round(Number(v.monto) * 100) / 100;
      if (!(monto > 0)) return toast("El monto debe ser mayor que cero.");
      const ok = await attempt(
        () => store.add("gastos", { monto, moneda: ui.moneda ?? store.config.monedaPrincipal, metodo: ui.metodo, categoria: v.categoria, descripcion: v.descripcion, fecha: v.fecha, hijoId: v.hijoId || null, origen: "manual" }),
        "Gasto guardado",
      );
      if (ok) {
        qs<HTMLInputElement>("#gMonto", el).value = "";
        qs<HTMLInputElement>("#gDesc", el).value = "";
      }
    });

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

    qs("#gastoCategorias", root).innerHTML = bars(sumarPor(enBase, (g) => g.categoria), cur);
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
          return head + gastoItem(g, false);
        }).join("")
      : emptyLi("No hay gastos en este mes.");
  },
};

function renderToggles(): void {
  const moneda = ui.moneda ?? store.config.monedaPrincipal;
  qs("#gMoneda", root).innerHTML = segButtons("moneda", MONEDAS.map((m) => [m, m]), moneda);
  root.querySelectorAll<HTMLButtonElement>("[data-metodo]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.metodo === ui.metodo)));
}
