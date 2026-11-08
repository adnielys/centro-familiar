import { huecosLibres, minutosLibres, ocupacionesDelDia } from "../../domain/agenda";
import { MONEDAS } from "../../domain/catalog";
import { fmtDuration, fmtMonth, monthOf, nowMinutes, toHHMM, todayISO } from "../../domain/dates";
import { store } from "../../data/store";
import { fuentesAgenda } from "../agendaContext";
import { emptyLi, esc, numberFmt, qs } from "../dom";
import { actividadItem, deberItem, gastoItem, tareaItem } from "../items";
import type { View } from "../router";
import { actividadesDelDia, deberesProximos, gastosDelMes, tareasUrgentes, totalEn } from "../selectors";

let root: HTMLElement;

export const hoyView: View = {
  id: "hoy",
  label: "Hoy",

  mount(el) {
    root = el;
    el.innerHTML = `
      <div class="tiles" id="hoyTiles"></div>
      <div class="grid2">
        <div class="card"><div class="card-head"><h2>Lo que queda hoy</h2><a class="small" href="#agenda">Agenda</a></div><ul class="list" id="hoyProximo"></ul></div>
        <div class="card"><div class="card-head"><h2>Tareas vencidas y de hoy</h2></div><ul class="list" id="hoyTareas"></ul></div>
        <div class="card"><div class="card-head"><h2>Los niños hoy</h2></div><ul class="list" id="hoyNinos"></ul></div>
        <div class="card"><div class="card-head"><h2>Deberes y exámenes (7 días)</h2></div><ul class="list" id="hoyDeberes"></ul></div>
        <div class="card"><div class="card-head"><h2>Últimos gastos</h2><a class="small" href="#registrar">Registrar</a></div><ul class="list" id="hoyGastos"></ul></div>
      </div>`;
  },

  update() {
    const today = todayISO();
    const now = nowMinutes();
    const f = fuentesAgenda();
    const libres = huecosLibres(today, f, 15, now);
    const urgentes = tareasUrgentes(today);
    const vencidas = urgentes.filter((t) => t.vence !== null && t.vence < today).length;
    const deberes = deberesProximos(today);
    const delMes = gastosDelMes(monthOf(today));
    const mes = fmtMonth(monthOf(today));
    const proximoHueco = libres[0];

    qs("#hoyTiles", root).innerHTML = `
      <div class="tile"><div class="num">${esc(fmtDuration(minutosLibres(libres)))}</div><div class="lbl">Tiempo libre hoy${proximoHueco ? ` · próximo ${toHHMM(proximoHueco.inicio)}` : ""}</div></div>
      <div class="tile${vencidas ? " alert" : ""}"><div class="num">${urgentes.length}</div><div class="lbl">Tareas para hoy${vencidas ? ` · ${vencidas} vencidas` : ""}</div></div>
      <div class="tile"><div class="num">${deberes.length}</div><div class="lbl">Deberes y exámenes esta semana</div></div>
      ${MONEDAS.map((m) => `<div class="tile"><div class="num">${esc(numberFmt.format(totalEn(delMes, m)))}</div><div class="lbl">${m} gastados en ${esc(mes)}</div></div>`).join("")}`;

    const restantes = ocupacionesDelDia(today, f).filter((o) => o.fin > now);
    const proximo = [
      ...restantes.map((o) => ({ t: o.inicio, html: `<li><span class="time">${toHHMM(o.inicio)}</span><div class="grow"><div class="title">${esc(o.titulo)}</div><div class="small muted">hasta ${toHHMM(o.fin)}</div></div></li>` })),
      ...libres.map((h) => ({ t: h.inicio, html: `<li class="free-row"><span class="time">${toHHMM(h.inicio)}</span><div class="grow"><div class="title">Libre</div><div class="small muted">${fmtDuration(h.fin - h.inicio)} · hasta ${toHHMM(h.fin)}</div></div></li>` })),
    ].sort((a, b) => a.t - b.t);
    qs("#hoyProximo", root).innerHTML = proximo.length ? proximo.map((x) => x.html).join("") : emptyLi("Nada más por hoy.");

    qs("#hoyTareas", root).innerHTML = urgentes.length ? urgentes.map((t) => tareaItem(t, today, { agendar: true })).join("") : emptyLi("Nada vencido ni para hoy.");
    const ninos = actividadesDelDia(today);
    qs("#hoyNinos", root).innerHTML = ninos.length ? ninos.map(actividadItem).join("")
      : emptyLi(store.data.hijos.length ? "Hoy no hay actividades en el horario." : "Añade a tus hijos y sus horarios en la pestaña Hijos.");
    qs("#hoyDeberes", root).innerHTML = deberes.length ? deberes.map((d) => deberItem(d, today, true)).join("") : emptyLi("Sin deberes ni exámenes en los próximos 7 días.");
    const ultimos = [...store.data.gastos].sort((a, b) => (b.fecha + (b.creado ?? "")).localeCompare(a.fecha + (a.creado ?? ""))).slice(0, 5);
    qs("#hoyGastos", root).innerHTML = ultimos.length ? ultimos.map((g) => gastoItem(g)).join("") : emptyLi("Aún no hay gastos registrados.");
  },
};
