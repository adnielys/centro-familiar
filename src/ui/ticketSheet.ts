/**
 * Revisión de un ticket escaneado: cada artículo leído es una línea editable
 * (incluir, descripción, importe, categoría) y se guarda como uno o varios gastos.
 */
import { CATEGORIAS, METODOS, MONEDAS } from "../domain/catalog";
import { categoriaDeTexto, idDeRegla, patronDeAprendizaje } from "../domain/clasificador.js";
import { todayISO } from "../domain/dates";
import { categoriaPorDefecto, gastosDeTicket, MODOS_TICKET, type LecturaTicket, type LineaRevisada, type ModoTicket } from "../domain/ticket";
import type { Metodo, Moneda } from "../domain/types";
import { store } from "../data/store";
import { attempt, esc, fmtMoney, optionsHtml, qs, seg, toast } from "./dom";
import { openSheet } from "./sheet";

const DIFERENCIA = "Impuestos y ajustes";

interface Sugerencias {
  fecha: string;
  moneda: Moneda;
  metodo: Metodo;
}

interface LineaUI extends LineaRevisada {
  sugerida: string;
}

export function abrirRevisionTicket(lectura: LecturaTicket, texto: string, sugerido: Sugerencias): void {
  const reglas = store.data.reglas;
  const porDefecto = categoriaPorDefecto(lectura);
  const lineas: LineaUI[] = lectura.articulos.map((a) => {
    const { categoria } = categoriaDeTexto(a.descripcion, reglas);
    const elegida = categoria === "Otros" ? porDefecto : categoria;
    return { ...a, categoria: elegida, sugerida: elegida, incluida: true };
  });
  if (lectura.diferencia > 0.009) {
    lineas.push({ descripcion: DIFERENCIA, monto: lectura.diferencia, categoria: "Otros", sugerida: "Otros", incluida: false });
  }
  const estado = { modo: "articulos" as ModoTicket, moneda: sugerido.moneda, metodo: sugerido.metodo };

  const sheet = openSheet({
    title: `Ticket${lectura.comercio ? `: ${lectura.comercio}` : ""}`,
    subtitle: `${lectura.articulos.length} artículo(s) leídos${lectura.total !== null ? ` · total impreso ${lectura.total.toFixed(2)}` : ""}`,
    body: `
      <form id="tkForm" autocomplete="off" class="stack">
        ${avisoCuadre(lectura)}
        <label for="tkFecha">Fecha <input id="tkFecha" type="date" value="${esc(sugerido.fecha)}" required></label>
        ${seg("moneda", MONEDAS.map((m) => [m, m]), estado.moneda)}
        ${seg("metodo", Object.entries(METODOS), estado.metodo)}
        <ul class="tk-list" id="tkLista">${lineas.map(lineaHtml).join("")}</ul>
        <div>
          <div class="small muted">Registrar como</div>
          ${seg("modo", MODOS_TICKET, estado.modo)}
        </div>
        <div class="tk-total"><span>Seleccionado</span><strong id="tkSuma"></strong></div>
        <button class="btn block" type="submit" id="tkGuardar">Guardar</button>
        <details><summary class="small muted">Texto leído del ticket</summary><pre>${esc(texto)}</pre></details>
      </form>`,
  });

  const form = qs<HTMLFormElement>("#tkForm", sheet.el);

  const leerLineas = (): void => {
    form.querySelectorAll<HTMLElement>("[data-linea]").forEach((li) => {
      const l = lineas[Number(li.dataset.linea)];
      l.incluida = qs<HTMLInputElement>("[data-incluir]", li).checked;
      l.descripcion = qs<HTMLInputElement>("[data-desc]", li).value;
      l.monto = Math.round(Number(qs<HTMLInputElement>("[data-monto]", li).value) * 100) / 100 || 0;
      l.categoria = qs<HTMLSelectElement>("[data-cat]", li).value;
      li.classList.toggle("off", !l.incluida);
    });
  };

  const refrescarResumen = (): void => {
    leerLineas();
    const comunes = { fecha: todayISO(), moneda: estado.moneda, metodo: estado.metodo, comercio: lectura.comercio };
    const gastos = gastosDeTicket(lineas, estado.modo, comunes);
    const suma = gastos.reduce((s, g) => s + g.monto, 0);
    qs("#tkSuma", form).textContent = fmtMoney(suma, estado.moneda);
    const boton = qs<HTMLButtonElement>("#tkGuardar", form);
    boton.disabled = gastos.length === 0;
    boton.textContent = gastos.length === 1 ? "Guardar 1 gasto" : `Guardar ${gastos.length} gastos`;
  };

  form.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-seg]");
    if (!b) return;
    const clave = b.dataset.seg as "modo" | "moneda" | "metodo";
    (estado as Record<string, string>)[clave] = b.dataset.value ?? "";
    form.querySelectorAll<HTMLButtonElement>(`[data-seg="${clave}"]`).forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    refrescarResumen();
  });
  form.addEventListener("input", refrescarResumen);
  form.addEventListener("change", refrescarResumen);

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    leerLineas();
    const fecha = qs<HTMLInputElement>("#tkFecha", form).value || todayISO();
    const gastos = gastosDeTicket(lineas, estado.modo, { fecha, moneda: estado.moneda, metodo: estado.metodo, comercio: lectura.comercio });
    if (!gastos.length) return toast("Marca al menos un artículo con importe.");
    void attempt(async () => {
      const ids: string[] = [];
      for (const g of gastos) ids.push((await store.add("gastos", g)).id);
      await aprenderCategorias(lineas);
      sheet.close();
      const total = gastos.reduce((s, g) => s + g.monto, 0);
      toast(`${gastos.length} gasto(s) guardado(s) · ${fmtMoney(total, estado.moneda)}`, {
        label: "Deshacer",
        fn: () => void attempt(async () => { for (const id of ids) await store.remove("gastos", id); }, "Ticket deshecho"),
      });
    });
  });

  refrescarResumen();
}

function avisoCuadre(l: LecturaTicket): string {
  if (l.total === null) return `<p class="small muted">No encontré el total impreso: revisa que estén todos los artículos.</p>`;
  if (Math.abs(l.diferencia) < 0.01) return `<p class="small ok-text">✓ La suma de los artículos coincide con el total del ticket.</p>`;
  return l.diferencia > 0
    ? `<div class="notice">Los artículos suman ${l.suma.toFixed(2)} y el ticket dice ${l.total.toFixed(2)}. La diferencia (${l.diferencia.toFixed(2)}) puede ser impuestos o líneas que no se leyeron: la añadí al final, desmarcada.</div>`
    : `<div class="notice">Los artículos suman ${l.suma.toFixed(2)}, más que el total del ticket (${l.total.toFixed(2)}). Revisa los importes: alguno se leyó mal.</div>`;
}

function lineaHtml(l: LineaUI, i: number): string {
  return `
    <li class="tk-item${l.incluida ? "" : " off"}" data-linea="${i}">
      <input type="checkbox" data-incluir aria-label="Incluir" ${l.incluida ? "checked" : ""}>
      <input class="tk-desc" data-desc value="${esc(l.descripcion)}" aria-label="Descripción" maxlength="80">
      <input class="tk-monto" data-monto type="number" inputmode="decimal" min="0" step="0.01" value="${l.monto.toFixed(2)}" aria-label="Importe">
      <select class="tk-cat" data-cat aria-label="Categoría">${optionsHtml(CATEGORIAS.map((c) => [c, c]), l.categoria)}</select>
    </li>`;
}

/** Si el usuario corrigió la categoría de un artículo, se aprende para el próximo ticket. */
async function aprenderCategorias(lineas: readonly LineaUI[]): Promise<void> {
  for (const l of lineas) {
    if (!l.incluida || l.categoria === l.sugerida || l.categoria === "Otros" || l.descripcion === DIFERENCIA) continue;
    const patron = patronDeAprendizaje(l.descripcion);
    if (patron) await store.put("reglas", { id: idDeRegla(patron), patron, categoria: l.categoria, actualizado: new Date().toISOString() });
  }
}
