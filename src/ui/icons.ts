/** Iconos de línea (24×24, trazo) en SVG inline: sin dependencias y heredan el color del texto. */
const svg = (paths: string): string =>
  `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

export const ICONS = {
  hoy: svg('<path d="M5 12l7-7 7 7"/><path d="M7 10v9h10v-9"/>'),
  agenda: svg('<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M16 3v4M8 3v4M4 11h16"/>'),
  tareas: svg('<path d="M10 6h10M10 12h10M10 18h10"/><path d="M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2"/>'),
  gastos: svg('<path d="M19 8V6a1 1 0 0 0-1-1H6a2 2 0 0 0 0 4h13a1 1 0 0 1 1 1v3"/><path d="M20 16v3a1 1 0 0 1-1 1H6a2 2 0 0 1-2-2V7"/><path d="M21 12v4h-4a2 2 0 0 1 0-4h4"/>'),
  familia: svg('<circle cx="9" cy="7" r="3.5"/><path d="M3 20v-1.5a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4V20"/><path d="M16 3.5a3.5 3.5 0 0 1 0 7M21 20v-1.5a4 4 0 0 0-3-3.8"/>'),
  ajustes: svg('<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>'),
  mas: svg('<path d="M12 5v14M5 12h14"/>'),
  camara: svg('<path d="M5 7h2l2-2h6l2 2h2a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.5"/>'),
  texto: svg('<path d="M4 7V5h16v2M12 5v14M9 19h6"/>'),
  cerrar: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
} as const;
