/**
 * Completar / reabrir tareas. Si la tarea tiene costo, se pregunta cuánto se pagó y se crea el gasto;
 * si se repite, se crea la siguiente de la serie (con su bloque de agenda, si lo tenía).
 */
import { CATEGORIAS, METODOS, MONEDAS } from "../domain/catalog";
import { fmtDate, fmtMonth, monthOf, toISODate, todayISO } from "../domain/dates";
import { enPeriodoActual } from "../domain/periodos";
import { gastoDeTarea, planCompletar, type Pago } from "../domain/tareas";
import type { Metodo, Moneda, Tarea } from "../domain/types";
import { store } from "../data/store";
import { attempt, esc, fmtMoney, optionsHtml, qs, seg, toast } from "./dom";
import { openSheet } from "./sheet";

/** Importes pagados anteriormente en la misma serie de tareas, del más antiguo al más reciente. */
export function pagosDeLaSerie(t: Tarea): Array<{ monto: number; fecha: string }> {
  const serie = t.serieId ?? t.id;
  return store.data.tareas
    .filter((x) => x.id !== t.id && (x.serieId === serie || x.id === serie) && x.gastoId)
    .map((x) => store.byId("gastos", x.gastoId))
    .filter((g): g is NonNullable<typeof g> => Boolean(g))
    .sort((a, b) => a.fecha.localeCompare(b.fecha))
    .map((g) => ({ monto: g.monto, fecha: g.fecha }));
}

async function completar(t: Tarea, pago: Pago | null): Promise<void> {
  const historial = pagosDeLaSerie(t).map((p) => p.monto);
  const plan = planCompletar(t, todayISO(), new Date().toISOString(), pago, historial);
  let gastoId: string | null = null;
  let siguienteId = t.siguienteId;
  if (plan.gasto) gastoId = (await store.add("gastos", plan.gasto)).id;
  if (plan.siguiente) {
    const siguiente = await store.add("tareas", plan.siguiente);
    siguienteId = siguiente.id;
    const bloque = store.data.bloques.find((b) => b.tareaId === t.id);
    if (bloque && siguiente.vence) {
      await store.add("bloques", { titulo: bloque.titulo, fecha: siguiente.vence, inicio: bloque.inicio, fin: bloque.fin, tareaId: siguiente.id });
    }
  }
  await store.update("tareas", t.id, { ...plan.patch, gastoId, siguienteId });
  const partes = [gastoId && pago ? `gasto de ${fmtMoney(pago.monto, pago.moneda)} registrado` : "", plan.siguiente?.vence ? `próxima: ${fmtDate(plan.siguiente.vence)}` : ""].filter(Boolean);
  const deshacer = (): void => {
    const actual = store.byId("tareas", t.id);
    if (actual) void attempt(() => reabrir(actual, true), "Deshecho");
  };
  toast(partes.length ? `Hecha · ${partes.join(" · ")}` : "Tarea hecha", { label: "Deshacer", fn: deshacer });
}

/** Mensaje cuando la tarea aún no es del periodo actual. */
export function motivoBloqueo(t: Tarea, hoy = todayISO()): string | null {
  if (enPeriodoActual(t, hoy) || !t.vence) return null;
  return t.repetir === "semanal" ? `Es de la semana del ${fmtDate(t.vence)}: podrás marcarla esa semana.` : `Es de ${fmtMonth(monthOf(t.vence))}: podrás marcarla cuando llegue ese mes.`;
}

async function reabrir(t: Tarea, borrarGasto: boolean): Promise<void> {
  if (borrarGasto && t.gastoId) await store.remove("gastos", t.gastoId);
  await store.update("tareas", t.id, { estado: "pendiente", completada: null, gastoId: borrarGasto ? null : t.gastoId });
}

/** Hoja «¿Cuánto pagaste?». Si se cierra sin elegir, `onCancel` deshace el check visual. */
function pedirPago(t: Tarea, onCancel: () => void): void {
  const costo = t.costo;
  if (!costo) return;
  let resuelto = false;
  const estimado = costo.tipo === "estimado";
  const previos = pagosDeLaSerie(t).slice(-3);
  const sheet = openSheet({
    title: estimado ? "¿Cuánto fue esta vez?" : "¿Cuánto pagaste?",
    subtitle: t.titulo,
    onClose: () => {
      if (!resuelto) onCancel();
    },
    body: `
      <form id="pagoForm" autocomplete="off" class="stack">
        <label for="pagoMonto">${estimado ? `Importe real (estimado ~${esc(fmtMoney(costo.monto, costo.moneda))})` : "Importe"}
          <input id="pagoMonto" class="big-input" name="monto" type="number" inputmode="decimal" min="0.01" step="0.01" value="${estimado ? "" : esc(costo.monto)}" placeholder="${esc(costo.monto)}" required>
        </label>
        ${estimado && previos.length ? `<p class="small muted">Últimos pagos: ${previos.map((p) => `${esc(fmtMoney(p.monto, costo.moneda))} (${esc(fmtDate(p.fecha))})`).join(" · ")}</p>` : ""}
        ${seg("moneda", MONEDAS.map((m) => [m, m]), costo.moneda)}
        ${seg("metodo", Object.entries(METODOS), costo.metodo)}
        <p class="small muted">Se registra en ${esc(costo.categoria)} como gasto ${t.repetir ? "base (recurrente)" : "variable"}.${t.repetir ? ` La próxima se crea sola${estimado ? " con el estimado actualizado" : ""}.` : ""}</p>
        <button class="btn block" type="submit">Pagado</button>
        <button class="btn ghost block" type="button" data-solo-hecha>Solo marcar hecha, sin gasto</button>
      </form>`,
  });
  const form = qs<HTMLFormElement>("#pagoForm", sheet.el);
  const valores = { moneda: costo.moneda as Moneda, metodo: costo.metodo as Metodo };
  form.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-seg]");
    if (b) {
      const k = b.dataset.seg as "moneda" | "metodo";
      (valores as Record<string, string>)[k] = b.dataset.value ?? "";
      form.querySelectorAll<HTMLButtonElement>(`[data-seg="${k}"]`).forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      return;
    }
    if ((e.target as HTMLElement).closest("[data-solo-hecha]")) {
      resuelto = true;
      sheet.close();
      void attempt(() => completar(t, null));
    }
  });
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const monto = Math.round(Number(qs<HTMLInputElement>("#pagoMonto", form).value) * 100) / 100;
    if (!(monto > 0)) return toast("Indica cuánto pagaste.");
    resuelto = true;
    sheet.close();
    void attempt(() => completar(t, { monto, moneda: valores.moneda, metodo: valores.metodo }));
  });
  requestAnimationFrame(() => qs<HTMLInputElement>("#pagoMonto", form).select());
}

/** Hoja para desmarcar una tarea pagada: borrar o conservar el gasto. */
function pedirDeshacer(t: Tarea, onCancel: () => void): void {
  const gasto = store.byId("gastos", t.gastoId);
  let resuelto = false;
  const sheet = openSheet({
    title: "¿Desmarcar la tarea?",
    subtitle: t.titulo,
    onClose: () => {
      if (!resuelto) onCancel();
    },
    body: `
      <div class="stack">
        ${gasto ? `<p>Al completarla se registró un gasto de <strong>${esc(fmtMoney(gasto.monto, gasto.moneda))}</strong> el ${esc(fmtDate(gasto.fecha))}.</p>` : ""}
        <button class="btn block danger" type="button" data-borrar>Desmarcar y borrar el gasto</button>
        <button class="btn ghost block" type="button" data-mantener>Desmarcar y conservar el gasto</button>
      </div>`,
  });
  sheet.el.addEventListener("click", (e) => {
    const t2 = e.target as HTMLElement;
    const borrar = t2.closest("[data-borrar]");
    if (!borrar && !t2.closest("[data-mantener]")) return;
    resuelto = true;
    sheet.close();
    void attempt(() => reabrir(t, Boolean(borrar)), borrar ? "Pago deshecho" : "Tarea pendiente de nuevo");
  });
}

/** Día (local) en que se completó la tarea; si no consta, hoy. */
const fechaCompletada = (t: Tarea): string => (t.completada ? toISODate(new Date(t.completada)) : todayISO());

async function vincularGasto(t: Tarea, pago: Pago, categoria?: string): Promise<void> {
  const gasto = await store.add("gastos", gastoDeTarea(t, pago, fechaCompletada(t), categoria));
  await store.update("tareas", t.id, { gastoId: gasto.id });
}

/** Hoja para registrar el gasto de una tarea ya hecha (con la fecha en que se completó). */
export function registrarGastoDeHecha(t: Tarea): void {
  const costo = t.costo;
  const valores = { moneda: (costo?.moneda ?? store.config.monedaPrincipal) as Moneda, metodo: (costo?.metodo ?? "efectivo") as Metodo };
  const sheet = openSheet({
    title: "Registrar gasto",
    subtitle: `${t.titulo} · hecha el ${fmtDate(fechaCompletada(t))}`,
    body: `
      <form id="rgForm" autocomplete="off" class="stack">
        <label for="rgMonto">Importe
          <input id="rgMonto" class="big-input" type="number" inputmode="decimal" min="0.01" step="0.01" value="${costo && costo.tipo === "fijo" ? esc(costo.monto) : ""}" placeholder="${esc(costo?.monto ?? "")}" required>
        </label>
        ${seg("moneda", MONEDAS.map((m) => [m, m]), valores.moneda)}
        ${seg("metodo", Object.entries(METODOS), valores.metodo)}
        <label for="rgCategoria">Categoría <select id="rgCategoria">${optionsHtml(CATEGORIAS.map((c) => [c, c]), costo?.categoria ?? "Otros")}</select></label>
        <p class="small muted">Se registra con fecha ${esc(fmtDate(fechaCompletada(t)))} como gasto ${t.repetir ? "base (recurrente)" : "variable"}.</p>
        <button class="btn block" type="submit">Registrar gasto</button>
      </form>`,
  });
  const form = qs<HTMLFormElement>("#rgForm", sheet.el);
  form.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-seg]");
    if (!b) return;
    const k = b.dataset.seg as "moneda" | "metodo";
    (valores as Record<string, string>)[k] = b.dataset.value ?? "";
    form.querySelectorAll<HTMLButtonElement>(`[data-seg="${k}"]`).forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
  });
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const monto = Math.round(Number(qs<HTMLInputElement>("#rgMonto", form).value) * 100) / 100;
    if (!(monto > 0)) return toast("Indica el importe.");
    sheet.close();
    void attempt(() => vincularGasto(t, { monto, ...valores }, qs<HTMLSelectElement>("#rgCategoria", form).value), `Gasto registrado: ${fmtMoney(monto, valores.moneda)}`);
  });
  requestAnimationFrame(() => qs<HTMLInputElement>("#rgMonto", form).focus());
}

/** Registra de una vez el gasto de las tareas hechas con costo fijo; devuelve cuántas. */
export async function registrarTodosLosFijos(tareas: readonly Tarea[]): Promise<number> {
  const conCostoFijo = tareas.filter((t) => t.costo?.tipo === "fijo");
  for (const t of conCostoFijo) {
    const c = t.costo!;
    await vincularGasto(t, { monto: c.monto, moneda: c.moneda, metodo: c.metodo });
  }
  return conCostoFijo.length;
}

/** Punto de entrada del check de una tarea (desde cualquier lista). */
export function alternarTarea(t: Tarea, marcada: boolean, checkbox: HTMLInputElement): void {
  if (marcada) {
    const bloqueo = motivoBloqueo(t);
    if (bloqueo) {
      checkbox.checked = false;
      toast(bloqueo);
      return;
    }
    if (t.costo?.tipo === "estimado") pedirPago(t, () => (checkbox.checked = false));
    else if (t.costo) void attempt(() => completar(t, { monto: t.costo!.monto, moneda: t.costo!.moneda, metodo: t.costo!.metodo }));
    else void attempt(() => completar(t, null));
    return;
  }
  if (t.gastoId && store.byId("gastos", t.gastoId)) pedirDeshacer(t, () => (checkbox.checked = true));
  else void attempt(() => reabrir(t, false), "Tarea pendiente de nuevo");
}
