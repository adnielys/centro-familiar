/**
 * Balance: revisar un mes (el actual o uno anterior), compararlo con el promedio de los meses
 * cerrados y con el gasto ideal por categoría. Registrar gastos vive en la pantalla Gastos.
 */
import { MONEDAS } from "../../domain/catalog";
import { addMonths, daysInMonth, fmtDate, fmtMonth, monthOf, todayISO } from "../../domain/dates";
import { balanceDelMes, resumenDe, type Balance } from "../../domain/balance";
import { tasaActual, totalCombinado } from "../../domain/cambio";
import { historico, mesesHasta, resumenDelMes } from "../../domain/fijos";
import {
  AJUSTES_IDEAL, idealPorCategoria, mesesCerrados, promedioDeMeses, RANGOS_PROMEDIO, redondearArriba, ritmo, variablePorCategoria,
  type IdealCategoria,
} from "../../domain/presupuesto";
import type { Moneda } from "../../domain/types";
import { store } from "../../data/store";
import { barrasApiladas } from "../charts";
import { attempt, chip, confirmTap, delBtn, esc, fmtMoney, numberFmt, optionsHtml, qs, toast } from "../dom";
import type { View } from "../router";
import { gastosDelMes, sumarPor, totalEn } from "../selectors";
import { barras, mesCorto, mesNavHtml, pintarMesNav, subnavDinero } from "../dinero";

let root: HTMLElement;
const ui = { mes: monthOf(todayISO()) };

const fmt = (n: number): string => numberFmt.format(n);
const lista = (xs: readonly string[]): string => xs.length > 1 ? `${xs.slice(0, -1).join(", ")} y ${xs[xs.length - 1]}` : xs.join("");

export const balanceView: View = {
  id: "balance",
  label: "Balance",
  tab: "gastos",

  mount(el) {
    root = el;
    el.innerHTML = `
      ${subnavDinero("balance")}
      <div class="card" id="mesCard">
        ${mesNavHtml("b")}
        <div id="balEstado" class="mes-estado"></div>
      </div>

      <div class="card" id="balanceCard">
        <div class="card-head"><h2 id="balTitulo">Balance del mes</h2></div>
        <div id="balCombinado"></div>
        <div id="balMonedas" class="stack"></div>
        <div class="actions">
          <button class="btn" type="button" id="balCerrar">Cerrar mes</button>
          <button class="btn ghost" type="button" id="balCompartir">Compartir resumen</button>
        </div>
      </div>

      <div class="card" id="promCard">
        <div class="card-head"><h2>Promedio de tus cierres</h2></div>
        <div class="seg wide" id="promRango" role="group" aria-label="Meses a promediar"></div>
        <div id="promCuerpo" class="stack"></div>
      </div>

      <div class="card" id="idealCard">
        <div class="card-head"><h2>Ideal por categoría</h2><span class="small muted" id="idealMoneda"></span></div>
        <p class="small muted">Lo que sueles gastar en un mes normal, según tus cierres. Solo gasto variable: los fijos ya tienen su importe.</p>
        <div class="seg wide" id="idealAjuste" role="group" aria-label="Meta de ahorro"></div>
        <div id="idealLista"></div>
      </div>

      <div class="card">
        <div class="card-head">
          <h2>Análisis del mes</h2>
          <label for="gPrincipal">En <select id="gPrincipal">${optionsHtml(MONEDAS.map((m) => [m, m]), store.config.monedaPrincipal)}</select></label>
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

      <div class="card" id="cortesCard">
        <h2>Cortes de meses anteriores</h2>
        <ul class="list" id="listaCortes"></ul>
      </div>`;

    const irA = (ym: string): void => {
      ui.mes = ym;
      this.update();
    };
    qs<HTMLInputElement>("#bMes", el).addEventListener("change", (e) => {
      const v = (e.target as HTMLInputElement).value;
      if (v) irA(v);
    });
    qs("#bPrev", el).addEventListener("click", () => irA(addMonths(ui.mes, -1)));
    qs("#bNext", el).addEventListener("click", () => irA(addMonths(ui.mes, 1)));

    qs<HTMLButtonElement>("#balCerrar", el).addEventListener("click", (e) => {
      const btn = e.currentTarget as HTMLButtonElement;
      const yaCerrado = Boolean(store.byId("cortes", ui.mes));
      if (!confirmTap(btn, yaCerrado ? "¿Actualizar el corte?" : `¿Cerrar ${fmtMonth(ui.mes)}?`)) return;
      void attempt(() => cerrarMes(ui.mes), yaCerrado ? "Corte actualizado" : `Mes cerrado: ${fmtMonth(ui.mes)}`);
    });
    qs<HTMLButtonElement>("#balCompartir", el).addEventListener("click", () => void compartirResumen(ui.mes));
    qs<HTMLSelectElement>("#gPrincipal", el).addEventListener("change", (e) => {
      void attempt(() => store.saveConfig({ monedaPrincipal: (e.target as HTMLSelectElement).value as Moneda }));
    });

    el.addEventListener("click", (e) => {
      const t = e.target as HTMLElement;
      const ver = t.closest<HTMLElement>("[data-ver-mes]");
      if (ver?.dataset.verMes) {
        irA(ver.dataset.verMes);
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      const rango = t.closest<HTMLElement>("[data-rango]");
      if (rango) return void attempt(() => store.saveConfig({ presupuesto: { ...store.config.presupuesto, meses: Number(rango.dataset.rango) } }));
      const ajuste = t.closest<HTMLElement>("[data-ajuste]");
      if (ajuste) return void attempt(() => store.saveConfig({ presupuesto: { ...store.config.presupuesto, ajuste: Number(ajuste.dataset.ajuste) } }));
    });
  },

  update() {
    pintarMesNav(root, "b", ui.mes);
    renderEstado();
    renderBalance();
    renderPromedio();
    renderIdeal();
    renderAnalisis();
    renderCortes();
  },
};

/* ------------------------------ Mes y balance ------------------------------ */

const balances = (ym: string): Balance[] =>
  MONEDAS.map((m) => balanceDelMes({ gastos: store.data.gastos, tareas: store.data.tareas, fijos: store.data.fijos }, ym, m, todayISO()));

const tieneDatos = (b: Balance): boolean => b.movimientos > 0 || b.pendientes.length > 0 || b.anterior > 0;

/** Días del mes ya transcurridos: hoy si es el mes en curso, todos si ya pasó, 0 si es futuro. */
function diasTranscurridos(ym: string): number {
  const actual = monthOf(todayISO());
  if (ym < actual) return daysInMonth(ym);
  if (ym > actual) return 0;
  return Number(todayISO().slice(8, 10));
}

function renderEstado(): void {
  const ym = ui.mes;
  const corte = store.byId("cortes", ym);
  const actual = monthOf(todayISO());
  const texto = corte
    ? `${chip(`Cerrado el ${fmtDate(corte.cerrado.slice(0, 10))}`, "ok")} <span class="small muted">Los números son los actuales; el corte guarda la foto de ese día.</span>`
    : ym === actual ? `<span class="small muted">Mes en curso · día ${diasTranscurridos(ym)} de ${daysInMonth(ym)}</span>`
    : ym < actual ? chip("Mes terminado sin cerrar", "warn")
    : `<span class="small muted">Mes futuro</span>`;
  qs("#balEstado", root).innerHTML = texto;
  qs<HTMLButtonElement>("#bNext", root).disabled = ym >= actual;
}

function renderBalance(): void {
  const ym = ui.mes;
  const [prev] = mesesHasta(ym, 2);
  qs("#balTitulo", root).textContent = `Balance de ${mesCorto(ym)}`;
  qs("#balCerrar", root).textContent = store.byId("cortes", ym) ? "Actualizar corte" : "Cerrar mes";

  renderCombinado(ym);
  const bloques = balances(ym).filter(tieneDatos);
  qs("#balMonedas", root).innerHTML = bloques.length
    ? bloques.map((b) => {
        const variacion = b.variacion === null ? "" : `<span class="${b.variacion > 0 ? "up" : "down"}">${b.variacion > 0 ? "▲" : "▼"} ${Math.abs(b.variacion)}% vs ${esc(mesCorto(prev))}</span>`;
        return `<div class="subcard">
          <div class="item-head"><h3>${b.moneda}</h3>${variacion}</div>
          <div class="bal-total">${esc(fmt(b.total))} <span class="small muted">${b.moneda} gastados</span></div>
          <div class="bal-grid">
            <div><span class="dot dot-fijo"></span>Base <strong>${esc(fmt(b.base))}</strong></div>
            <div><span class="dot dot-variable"></span>Variable <strong>${esc(fmt(b.variable))}</strong></div>
            <div>Efectivo <strong>${esc(fmt(b.porMetodo.efectivo ?? 0))}</strong></div>
            <div>Banca Remota <strong>${esc(fmt(b.porMetodo.banca_remota ?? 0))}</strong></div>
          </div>
          ${b.pendientes.length ? `<h3 class="sub">Falta por pagar · ${esc(fmt(b.pendiente))} ${b.moneda}</h3>
            <ul class="list compact">${b.pendientes.map((p) => `<li><div class="grow item-head"><span>${esc(p.titulo)}${p.fecha ? ` <span class="small muted">· ${esc(fmtDate(p.fecha))}</span>` : ""}</span><span class="amount">${p.estimado ? "≈" : ""}${esc(fmt(p.monto))}</span></div></li>`).join("")}</ul>` : ""}
          ${b.mayores.length ? `<h3 class="sub">Mayores gastos variables</h3>
            <ul class="list compact">${b.mayores.map((g) => `<li><div class="grow item-head"><span>${esc(g.descripcion || g.categoria)} <span class="small muted">· ${esc(g.categoria)}</span></span><span class="amount">${esc(fmt(g.monto))}</span></div></li>`).join("")}</ul>` : ""}
        </div>`;
      }).join("")
    : `<div class="empty">Sin gastos ni pagos pendientes en ${esc(fmtMonth(ym))}.</div>`;
}

/** Todo el mes sumado en una sola moneda, convirtiendo cada gasto con la tasa de su día. */
function combinadoDelMes(ym: string): ReturnType<typeof totalCombinado> & { hayAmbas: boolean } {
  const delMes = store.data.gastos.filter((g) => monthOf(g.fecha) === ym);
  return { ...totalCombinado(delMes, store.data.tasas), hayAmbas: new Set(delMes.map((g) => g.moneda)).size > 1 };
}

function renderCombinado(ym: string): void {
  const box = qs("#balCombinado", root);
  const c = combinadoDelMes(ym);
  const tasa = tasaActual(store.data.tasas, todayISO());
  if (!c.hayAmbas) {
    box.innerHTML = "";
    return;
  }
  if (!tasa) {
    box.innerHTML = `<div class="notice small">Tienes gastos en CUP y en USD. Añade la tasa del día en <a href="#ajustes">Ajustes → Tipo de cambio</a> (o conecta elTOQUE) para verlos sumados.</div>`;
    return;
  }
  box.innerHTML = `<div class="combinado">
      <div><div class="small muted">Todo junto en CUP</div><div class="num">${esc(fmt(c.cup))}</div></div>
      <div><div class="small muted">Todo junto en USD</div><div class="num">${esc(fmt(c.usd))}</div></div>
    </div>
    <div class="small muted">Cada gasto convertido con la tasa de su día · hoy 1 USD = ${esc(fmt(tasa.usd))} CUP (${tasa.fuente === "eltoque" ? "elTOQUE" : "manual"})</div>`;
}

async function cerrarMes(ym: string): Promise<void> {
  const [cup, usd] = balances(ym);
  await store.put("cortes", { id: ym, ym, cerrado: new Date().toISOString(), monedas: { CUP: resumenDe(cup), USD: resumenDe(usd) }, nota: "" });
}

/* ------------------------------ Promedio e ideal ------------------------------ */

const segBotones = (attr: string, opciones: ReadonlyArray<readonly [number, string]>, actual: number): string =>
  opciones.map(([v, l]) => `<button type="button" data-${attr}="${v}" aria-pressed="${v === actual}">${esc(l)}</button>`).join("");

const cierres = (): string[] => mesesCerrados(store.data.cortes, ui.mes, store.config.presupuesto.meses);

function sinCierres(): string {
  return `<div class="empty">Aún no hay meses cerrados antes de ${esc(fmtMonth(ui.mes))}. Cuando termine un mes, pulsa «Cerrar mes» en su balance y aquí verás tu gasto medio y lo ideal por categoría.</div>`;
}

function renderPromedio(): void {
  const { meses: rango } = store.config.presupuesto;
  qs("#promRango", root).innerHTML = segBotones("rango", RANGOS_PROMEDIO.map((n) => [n, `Últimos ${n}`] as const), rango);
  const meses = cierres();
  const cuerpo = qs("#promCuerpo", root);
  if (!meses.length) {
    cuerpo.innerHTML = sinCierres();
    return;
  }
  const nombres = [...meses].reverse().map(mesCorto);
  const aviso = meses.length < rango ? ` · solo hay ${meses.length} ${meses.length === 1 ? "cierre" : "cierres"}` : "";
  const bloques = MONEDAS.map((m) => [m, promedioDeMeses(store.data.gastos, meses, m)] as const).filter(([, p]) => p);
  cuerpo.innerHTML = `
    <div class="small muted">${esc(lista(nombres))}${esc(aviso)}</div>
    ${bloques.length ? `<div class="tiles">${bloques.map(([m, p]) => p && `
      <div class="tile">
        <div class="num">${esc(fmt(p.total))} <span class="small muted">${m}/mes</span></div>
        <div class="lbl">Base ${esc(fmt(p.base))} · variable ${esc(fmt(p.variable))}</div>
        ${meses.length > 1 ? `<div class="lbl">El más caro: ${esc(mesCorto(p.maximo.ym))} (${esc(fmt(p.maximo.total))})</div>` : ""}
      </div>`).join("")}</div>` : `<div class="empty">Esos meses no tienen gastos.</div>`}`;
}

const MENSAJE: Record<string, (r: { gastado: number; ideal: number; proyeccion: number | null; moneda: Moneda; enCurso: boolean }) => string> = {
  pasado: ({ gastado, ideal }) => `Te pasaste en ${fmt(gastado - ideal)}`,
  atento: ({ proyeccion, moneda }) => `A este ritmo, unos ${fmt(redondearArriba(proyeccion ?? 0, moneda))} a fin de mes`,
  bien: ({ gastado, ideal, enCurso }) => (enCurso ? `Vas bien · quedan ${fmt(ideal - gastado)}` : "Dentro del ideal"),
};

function filaIdeal(c: IdealCategoria, gastado: number, dia: number, diasMes: number, moneda: Moneda): string {
  const r = ritmo(gastado, c.ideal, dia, diasMes, c.puntual);
  const enCurso = dia > 0 && dia < diasMes;
  const ancho = Math.min(100, (gastado / c.ideal) * 100);
  const marca = enCurso ? `<span class="ideal-mark" style="left:${((dia / diasMes) * 100).toFixed(1)}%"></span>` : "";
  return `<div class="ideal-row ${r.estado}">
    <div class="item-head"><span>${esc(c.categoria)}</span><span class="amount"><strong>${esc(fmt(gastado))}</strong> <span class="muted">/ ${esc(fmt(c.ideal))}</span></span></div>
    <div class="ideal-track"><div class="ideal-fill" style="width:${ancho.toFixed(1)}%"></div>${marca}</div>
    <div class="small muted">${esc(MENSAJE[r.estado]({ gastado, ideal: c.ideal, proyeccion: r.proyeccion, moneda, enCurso }))}</div>
  </div>`;
}

function renderIdeal(): void {
  const { ajuste } = store.config.presupuesto;
  const moneda = store.config.monedaPrincipal;
  qs("#idealMoneda", root).textContent = moneda;
  qs("#idealAjuste", root).innerHTML = segBotones("ajuste", AJUSTES_IDEAL.map((p) => [p, p ? `−${p} %` : "Normal"] as const), ajuste);
  const caja = qs("#idealLista", root);
  const meses = cierres();
  if (!meses.length) {
    caja.innerHTML = sinCierres();
    return;
  }
  const ideales = idealPorCategoria(store.data.gastos, meses, moneda, ajuste);
  if (!ideales.length) {
    caja.innerHTML = `<div class="empty">No hay gasto variable en ${moneda} en los meses cerrados.</div>`;
    return;
  }
  const gastado = variablePorCategoria(store.data.gastos, ui.mes, moneda);
  const dia = diasTranscurridos(ui.mes);
  const diasMes = daysInMonth(ui.mes);
  const conIdeal = new Set(ideales.map((c) => c.categoria));
  const sinIdeal = [...gastado].filter(([c]) => !conIdeal.has(c)).sort((a, b) => b[1] - a[1]);

  const totalIdeal = ideales.reduce((s, c) => s + c.ideal, 0);
  const totalGastado = [...gastado.values()].reduce((s, v) => s + v, 0);
  const quedan = totalIdeal - totalGastado;
  const enCurso = dia > 0 && dia < diasMes;
  const terminado = dia >= diasMes;

  caja.innerHTML = `
    ${ideales.map((c) => filaIdeal(c, gastado.get(c.categoria) ?? 0, dia, diasMes, moneda)).join("")}
    ${sinIdeal.length ? `<p class="small muted">Sin ideal (no sueles gastar en esto): ${esc(sinIdeal.map(([c, v]) => `${c} ${fmt(v)}`).join(", "))}</p>` : ""}
    <div class="ideal-total">
      <div class="item-head"><span>Total variable ideal</span><strong>${esc(fmtMoney(totalIdeal, moneda))}</strong></div>
      <div class="small muted">${terminado ? "Gastaste" : "Llevas"} ${esc(fmt(totalGastado))} · ${quedan >= 0 ? `${terminado ? "sobraron" : "quedan"} ${esc(fmt(quedan))}` : `te pasaste en ${esc(fmt(-quedan))}`}${enCurso && quedan > 0 ? ` para ${diasMes - dia} ${diasMes - dia === 1 ? "día" : "días"}` : ""}</div>
      ${enCurso ? `<div class="small muted"><span class="ideal-mark-leyenda"></span> lo que tocaría llevar a día ${dia}</div>` : ""}
    </div>`;
}

/* ------------------------------ Análisis del mes ------------------------------ */

function renderAnalisis(): void {
  const cur = store.config.monedaPrincipal;
  qs<HTMLSelectElement>("#gPrincipal", root).value = cur;
  const delMes = gastosDelMes(ui.mes);
  const enBase = delMes.filter((g) => g.moneda === cur);
  const dias = Math.max(diasTranscurridos(ui.mes), 1);

  qs("#gastoTiles", root).innerHTML = MONEDAS.map((m) => {
    const t = totalEn(delMes, m);
    const n = delMes.filter((g) => g.moneda === m).length;
    return `<div class="tile"><div class="num">${esc(fmt(t))} <span class="small muted">${m}</span></div><div class="lbl">${esc(fmt(t / dias))} ${m}/día · ${n} movimientos</div></div>`;
  }).join("");

  const r = resumenDelMes(store.data.gastos, store.data.fijos, ui.mes, cur);
  qs("#natTiles", root).innerHTML = `
    <div class="tile"><div class="num">${esc(fmt(r.fijoPagado))}</div><div class="lbl">Base pagado${r.fijoPrevisto ? ` de ${esc(fmt(r.fijoPrevisto))} previstos` : ""} (${cur})</div></div>
    <div class="tile${r.pctVariable >= 50 ? " alert" : ""}"><div class="num">${esc(fmt(r.variable))}</div><div class="lbl">Variable (${cur}) · ${r.pctVariable}% del gasto</div></div>`;
  const [sf, sv] = Array.from(qs("#natSplit", root).children) as HTMLElement[];
  sf.style.width = `${r.total ? 100 - r.pctVariable : 0}%`;
  sv.style.width = `${r.total ? r.pctVariable : 0}%`;
  const hist = historico(store.data.gastos, ui.mes, cur, 6);
  qs("#natChart", root).innerHTML = hist.some((h) => h.fijo || h.variable)
    ? barrasApiladas(hist.map((h) => ({ label: fmtMonth(h.ym).slice(0, 3), valores: [h.fijo, h.variable] })), ["var(--fijo)", "var(--variable)"], ["Base", "Variable"], hist.length - 1)
    : `<div class="empty">Cuando registres gastos verás aquí la evolución de los últimos 6 meses.</div>`;
  const anteriores = hist.slice(0, -1).filter((h) => h.fijo || h.variable);
  const media = anteriores.length ? anteriores.reduce((s, h) => s + h.variable, 0) / anteriores.length : 0;
  qs("#natNota", root).textContent = media
    ? `Tu gasto variable medio de los meses anteriores es ${fmt(media)} ${cur}; este mes llevas ${fmt(r.variable)} (${r.variable > media ? "+" : ""}${Math.round(((r.variable - media) / media) * 100)}%).`
    : "";

  const variables = enBase.filter((g) => g.naturaleza !== "fijo");
  qs("#gastoCategorias", root).innerHTML = barras(sumarPor(variables, (g) => g.categoria), cur);
  const porMetodo = sumarPor(enBase, (g) => g.metodo);
  const total = totalEn(enBase, cur);
  const efectivo = porMetodo.efectivo ?? 0;
  const banca = porMetodo.banca_remota ?? 0;
  const [a, b] = Array.from(qs("#gastoSplit", root).children) as HTMLElement[];
  a.style.width = `${total ? (efectivo / total) * 100 : 0}%`;
  b.style.width = `${total ? (banca / total) * 100 : 0}%`;
  qs("#gastoSplitLegend", root).innerHTML = `<span><span class="dot" style="background:var(--accent)"></span>Efectivo ${esc(fmt(efectivo))}</span><span><span class="dot" style="background:var(--warn)"></span>Banca Remota ${esc(fmt(banca))}</span>`;
  const porHijo = sumarPor(enBase.filter((g) => g.hijoId), (g) => store.byId("hijos", g.hijoId)?.nombre ?? "Sin asignar");
  qs("#gastoHijos", root).innerHTML = Object.keys(porHijo).length ? barras(porHijo, cur) : `<div class="empty">Ningún gasto asignado a un hijo este mes.</div>`;
}

/* ------------------------------ Cortes ------------------------------ */

function renderCortes(): void {
  const cortes = [...store.data.cortes].sort((a, b) => b.ym.localeCompare(a.ym));
  qs("#cortesCard", root).hidden = !cortes.length;
  qs("#listaCortes", root).innerHTML = cortes.map((c, i) => {
    const anterior = cortes[i + 1];
    const lineas = MONEDAS.filter((m) => c.monedas[m]?.total || c.monedas[m]?.pendiente).map((m) => {
      const r = c.monedas[m];
      const prevTotal = anterior?.monedas[m]?.total;
      const delta = prevTotal ? Math.round(((r.total - prevTotal) / prevTotal) * 100) : null;
      return `<div class="small">${m}: <strong>${esc(fmt(r.total))}</strong> · base ${esc(fmt(r.base))} · variable ${esc(fmt(r.variable))}${delta === null ? "" : ` · <span class="${delta > 0 ? "up" : "down"}">${delta > 0 ? "▲" : "▼"} ${Math.abs(delta)}%</span>`}</div>`;
    }).join("");
    return `<li><div class="grow">
      <div class="item-head"><span class="title">${esc(fmtMonth(c.ym))}</span><span class="small muted">cerrado ${esc(fmtDate(c.cerrado.slice(0, 10)))}</span></div>
      ${lineas || `<div class="small muted">Sin gastos.</div>`}
      <div class="item-foot"><span class="item-actions"><button class="icon-btn accent" type="button" data-ver-mes="${esc(c.ym)}">Ver</button>${delBtn("cortes", c.id, "Reabrir")}</span></div>
    </div></li>`;
  }).join("");
}

/* ------------------------------ Compartir ------------------------------ */

/** Texto del balance para compartir (WhatsApp, notas…). */
function textoResumen(ym: string): string {
  const lineas = [`Balance de ${fmtMonth(ym)}`];
  const comb = combinadoDelMes(ym);
  if (comb.hayAmbas && store.data.tasas.length) lineas.push(`Todo junto: ${fmtMoney(comb.cup, "CUP")} ≈ ${fmtMoney(comb.usd, "USD")} (tasa de cada día; fuente elTOQUE/manual)`);
  for (const b of balances(ym).filter(tieneDatos)) {
    lineas.push("", `${b.moneda}: ${fmtMoney(b.total, b.moneda)} gastados${b.variacion === null ? "" : ` (${b.variacion > 0 ? "+" : ""}${b.variacion}% vs mes anterior)`}`);
    lineas.push(`• Base: ${fmt(b.base)} · Variable: ${fmt(b.variable)}`);
    lineas.push(`• Efectivo: ${fmt(b.porMetodo.efectivo ?? 0)} · Banca Remota: ${fmt(b.porMetodo.banca_remota ?? 0)}`);
    if (b.categorias.length) lineas.push(`• Por categoría: ${b.categorias.slice(0, 5).map(([c, v]) => `${c} ${fmt(v)}`).join(", ")}`);
    if (b.pendientes.length) lineas.push(`• Falta por pagar: ${fmt(b.pendiente)} (${b.pendientes.map((p) => p.titulo).join(", ")})`);
  }
  return lineas.join("\n");
}

async function compartirResumen(ym: string): Promise<void> {
  const text = textoResumen(ym);
  try {
    if (navigator.share) {
      await navigator.share({ title: `Balance de ${fmtMonth(ym)}`, text });
      return;
    }
    await navigator.clipboard.writeText(text);
    toast("Resumen copiado");
  } catch (e) {
    if ((e as Error)?.name !== "AbortError") toast("No se pudo compartir. Inténtalo de nuevo.");
  }
}
