/**
 * Piezas compartidas por las dos pantallas de dinero: Gastos (registrar) y Balance (revisar).
 */
import { fmtMonth } from "../domain/dates";
import { esc, numberFmt } from "./dom";

/** Selector superior para pasar de una pantalla a la otra. */
export const subnavDinero = (activa: "gastos" | "balance"): string => `
  <nav class="seg wide subnav" aria-label="Dinero">
    <a href="#gastos"${activa === "gastos" ? ' aria-current="page"' : ""}>Gastos</a>
    <a href="#balance"${activa === "balance" ? ' aria-current="page"' : ""}>Balance</a>
  </nav>`;

/** "noviembre de 2026" → "noviembre". */
export const mesCorto = (ym: string): string => fmtMonth(ym).replace(/ de \d{4}$/, "");

/**
 * Flechas ‹ mes › con el selector de mes en el centro. El nombre del mes lo pinta la app (en
 * español); el <input type="month"> va invisible encima para abrir el calendario al tocarlo.
 */
export const mesNavHtml = (prefijo: string): string => `
  <div class="mes-nav">
    <button class="icon-btn" type="button" id="${prefijo}Prev" aria-label="Mes anterior">‹</button>
    <label class="mes-picker" for="${prefijo}Mes"><span id="${prefijo}MesTexto"></span>
      <input id="${prefijo}Mes" type="month" aria-label="Elegir mes"></label>
    <button class="icon-btn" type="button" id="${prefijo}Next" aria-label="Mes siguiente">›</button>
  </div>`;

/** Pone el mes en el selector (valor y texto visible). */
export function pintarMesNav(root: HTMLElement, prefijo: string, ym: string): void {
  (root.querySelector(`#${prefijo}Mes`) as HTMLInputElement).value = ym;
  (root.querySelector(`#${prefijo}MesTexto`) as HTMLElement).textContent = fmtMonth(ym);
}

/** Barras horizontales ordenadas de mayor a menor. */
export function barras(totales: Record<string, number>, moneda: string): string {
  const entradas = Object.entries(totales).sort((a, b) => b[1] - a[1]);
  if (!entradas.length) return `<div class="empty">Sin datos en ${esc(moneda)}.</div>`;
  const max = entradas[0][1] || 1;
  return entradas.map(([k, v]) => `<div class="bar-row"><span>${esc(k)}</span><div class="bar-track"><div class="bar-fill" style="width:${((v / max) * 100).toFixed(1)}%"></div></div><span class="amount">${esc(numberFmt.format(v))}</span></div>`).join("");
}
