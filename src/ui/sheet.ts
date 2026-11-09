/**
 * Hoja inferior (bottom sheet) reutilizable: se cierra con el fondo, con ✕ o con Escape,
 * bloquea el scroll de la página y devuelve el foco al cerrar.
 */
import { ICONS } from "./icons";
import { esc } from "./dom";

export interface Sheet {
  el: HTMLElement;
  close(): void;
}

let seq = 0;

export function openSheet(opts: { title: string; subtitle?: string; body: string; onClose?: () => void }): Sheet {
  const id = `sheet-${++seq}`;
  const previo = document.activeElement as HTMLElement | null;
  const backdrop = document.createElement("div");
  backdrop.className = "sheet-backdrop";
  backdrop.innerHTML = `
    <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="${id}-t">
      <div class="sheet-head">
        <div class="grow"><h2 id="${id}-t">${esc(opts.title)}</h2>${opts.subtitle ? `<div class="small muted">${esc(opts.subtitle)}</div>` : ""}</div>
        <button class="icon-btn round" type="button" data-sheet-close aria-label="Cerrar">${ICONS.cerrar}</button>
      </div>
      <div class="sheet-body">${opts.body}</div>
    </div>`;
  document.body.appendChild(backdrop);
  document.body.classList.add("sheet-open");

  let closed = false;
  const close = (): void => {
    if (closed) return;
    closed = true;
    document.removeEventListener("keydown", onKey);
    backdrop.remove();
    if (!document.querySelector(".sheet-backdrop")) document.body.classList.remove("sheet-open");
    opts.onClose?.();
    previo?.focus?.();
  };
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === "Escape") close();
  };
  document.addEventListener("keydown", onKey);
  backdrop.addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    if (t === backdrop || t.closest("[data-sheet-close]")) close();
  });

  const el = backdrop.querySelector<HTMLElement>(".sheet") as HTMLElement;
  requestAnimationFrame(() => backdrop.classList.add("open"));
  return { el, close };
}
