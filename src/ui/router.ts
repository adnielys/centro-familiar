/**
 * Navegación por hash (#hoy, #agenda…) entre vistas montadas una sola vez.
 * Barra inferior con las vistas principales y un botón central de acción (+);
 * el resto de vistas (Familia, Ajustes, Registrar) se abren desde la cabecera u otros enlaces.
 */
import { store } from "../data/store";
import { ICONS } from "./icons";

export interface View {
  id: string;
  label: string;
  /** Icono de la barra inferior; sin icono, la vista no aparece en la barra. */
  icon?: string;
  /** Pestaña de la barra que se marca al estar en esta vista (si no tiene icono propio). */
  tab?: string;
  /** Crea el esqueleto estático (formularios) una sola vez. */
  mount(root: HTMLElement): void;
  /** Repinta las partes dinámicas con el estado actual. */
  update(): void;
  /** Se llama al entrar en la vista (opcional). */
  onShow?(): void;
}

export interface RouterOptions {
  nav: HTMLElement;
  main: HTMLElement;
  /** Posición del botón central (+) entre los elementos de la barra. */
  plusIndex: number;
  onPlus: () => void;
}

export function startRouter(views: readonly View[], opts: RouterOptions): void {
  const sections = new Map<string, HTMLElement>();
  const enBarra = views.filter((v) => v.icon);
  const items = enBarra.map((v) => `<a href="#${v.id}" data-tab="${v.id}">${v.icon}<span>${v.label}</span></a>`);
  items.splice(opts.plusIndex, 0, `<button type="button" class="nav-plus" id="navPlus" aria-label="Nueva tarea o registro">${ICONS.mas}</button>`);
  opts.nav.innerHTML = items.join("");
  opts.nav.querySelector("#navPlus")?.addEventListener("click", opts.onPlus);

  for (const v of views) {
    const section = document.createElement("section");
    section.className = "view";
    section.id = `view-${v.id}`;
    section.hidden = true;
    opts.main.appendChild(section);
    v.mount(section);
    sections.set(v.id, section);
  }

  let active = views[0];
  const show = (): void => {
    const id = location.hash.slice(1);
    active = views.find((v) => v.id === id) ?? views[0];
    sections.forEach((s, id2) => (s.hidden = id2 !== active.id));
    document.querySelectorAll<HTMLAnchorElement>("[data-tab]").forEach((a) => {
      if (a.dataset.tab === (active.tab ?? active.id)) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });
    window.scrollTo({ top: 0 });
    active.onShow?.();
    active.update();
  };

  window.addEventListener("hashchange", show);
  store.subscribe(() => active.update());
  show();
}

export const navigate = (id: string): void => {
  if (location.hash.slice(1) === id) window.dispatchEvent(new HashChangeEvent("hashchange"));
  else location.hash = id;
};
