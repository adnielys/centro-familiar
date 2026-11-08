/** Navegación por hash (#hoy, #agenda…) entre vistas montadas una sola vez. */
import { store } from "../data/store";

export interface View {
  id: string;
  label: string;
  /** Crea el esqueleto estático (formularios) una sola vez. */
  mount(root: HTMLElement): void;
  /** Repinta las partes dinámicas con el estado actual. */
  update(): void;
  /** Se llama al entrar en la vista (opcional). */
  onShow?(): void;
}

export function startRouter(views: readonly View[], nav: HTMLElement, main: HTMLElement): void {
  const sections = new Map<string, HTMLElement>();
  nav.innerHTML = views.map((v) => `<a href="#${v.id}" data-tab="${v.id}">${v.label}</a>`).join("");
  for (const v of views) {
    const section = document.createElement("section");
    section.className = "view";
    section.id = `view-${v.id}`;
    section.hidden = true;
    main.appendChild(section);
    v.mount(section);
    sections.set(v.id, section);
  }

  let active = views[0];
  const show = (): void => {
    const id = location.hash.slice(1);
    active = views.find((v) => v.id === id) ?? views[0];
    sections.forEach((s, id2) => (s.hidden = id2 !== active.id));
    nav.querySelectorAll<HTMLAnchorElement>("a").forEach((a) => {
      if (a.dataset.tab === active.id) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });
    nav.querySelector<HTMLElement>(`[data-tab="${active.id}"]`)?.scrollIntoView({ block: "nearest", inline: "nearest" });
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
