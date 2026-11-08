/** Utilidades de interfaz compartidas por todas las vistas. */
import { COLORES_HIJO } from "../domain/catalog";
import { fmtDate } from "../domain/dates";
import type { CollectionName, Hijo, ISODate } from "../domain/types";

export function qs<T extends Element = HTMLElement>(selector: string, root: ParentNode = document): T {
  const el = root.querySelector<T>(selector);
  if (!el) throw new Error(`Elemento no encontrado: ${selector}`);
  return el;
}

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const esc = (s: unknown): string => String(s ?? "").replace(/[&<>"']/g, (c) => ESCAPES[c]);

export const optionsHtml = (entries: ReadonlyArray<readonly [string, string]>, selected: string | null | undefined): string =>
  entries.map(([v, l]) => `<option value="${esc(v)}"${v === (selected ?? "") ? " selected" : ""}>${esc(l)}</option>`).join("");

export const kidOptions = (hijos: readonly Hijo[], emptyLabel = "—"): Array<[string, string]> => [["", emptyLabel], ...hijos.map((k) => [k.id, k.nombre] as [string, string])];

export const numberFmt = new Intl.NumberFormat("es", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const fmtMoney = (n: number, cur: string): string => `${numberFmt.format(n)} ${cur}`;

/** Valores de un formulario como strings recortados. */
export function formValues(form: HTMLFormElement): Record<string, string> {
  const out: Record<string, string> = {};
  new FormData(form).forEach((v, k) => {
    out[k] = typeof v === "string" ? v.trim() : "";
  });
  return out;
}

export const kidColor = (kid: Hijo | undefined): string => kid?.color || COLORES_HIJO[0];
export const kidChip = (kid: Hijo | undefined): string => (kid ? `<span class="chip kid" style="background:${esc(kidColor(kid))}">${esc(kid.nombre)}</span>` : "");
export const chip = (text: string, tone: "" | "bad" | "warn" | "ok" = ""): string => `<span class="chip${tone ? ` ${tone}` : ""}">${esc(text)}</span>`;

export function dueChip(iso: ISODate | null, today: ISODate): string {
  if (!iso) return "";
  if (iso < today) return chip(`Vencida · ${fmtDate(iso)}`, "bad");
  if (iso === today) return chip("Hoy", "warn");
  return chip(fmtDate(iso));
}

export const emptyLi = (text: string): string => `<li class="empty">${esc(text)}</li>`;

/** Botón de borrado en dos toques (lo gestiona main.ts por delegación). */
export const delBtn = (col: CollectionName, id: string, label = "Borrar"): string =>
  `<button class="icon-btn" type="button" data-del="${col}" data-id="${esc(id)}">${esc(label)}</button>`;

let toastTimer: number | undefined;
export function toast(msg: string): void {
  const el = qs("#toast");
  el.textContent = msg;
  el.hidden = false;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    el.hidden = true;
  }, 2800);
}

/** Ejecuta una acción con aviso de error uniforme. Devuelve true si salió bien. */
export async function attempt(action: () => Promise<unknown>, okMsg?: string): Promise<boolean> {
  try {
    await action();
    if (okMsg) toast(okMsg);
    return true;
  } catch (e) {
    console.error(e);
    toast(e instanceof Error && e.message ? e.message : "Algo salió mal. Inténtalo de nuevo.");
    return false;
  }
}

/** Descarga un Blob como archivo (en iPhone abre la hoja de compartir/guardar). */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
