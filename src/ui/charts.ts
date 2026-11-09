/** Gráficos SVG ligeros (sin librerías), coloreados con las variables del tema. */
import { esc, numberFmt } from "./dom";

export interface Serie {
  label: string;
  /** Valores apilados en orden (abajo → arriba). */
  valores: number[];
}

/**
 * Barras apiladas verticales. `colores` y `nombres` describen cada capa (p. ej. fijo, variable).
 * Escala común con la barra más alta; el total va sobre cada barra.
 */
export function barrasApiladas(series: readonly Serie[], colores: readonly string[], nombres: readonly string[], resaltar?: number): string {
  const W = 340, H = 180, top = 22, bottom = 22, gap = 10;
  const max = Math.max(1, ...series.map((s) => s.valores.reduce((a, b) => a + b, 0)));
  const bw = (W - gap * (series.length + 1)) / series.length;
  const scale = (v: number): number => (v / max) * (H - top - bottom);
  const corto = (n: number): string => (n >= 10000 ? `${Math.round(n / 1000)}k` : numberFmt.format(Math.round(n)).replace(/,00$/, ""));

  const bars = series.map((s, i) => {
    const x = gap + i * (bw + gap);
    let y = H - bottom;
    const total = s.valores.reduce((a, b) => a + b, 0);
    const rects = s.valores.map((v, k) => {
      const h = scale(v);
      y -= h;
      return h > 0 ? `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="3" fill="${colores[k]}"><title>${esc(nombres[k])}: ${esc(numberFmt.format(v))}</title></rect>` : "";
    }).join("");
    const weight = i === resaltar ? "700" : "500";
    return `${rects}
      ${total ? `<text x="${(x + bw / 2).toFixed(1)}" y="${(y - 5).toFixed(1)}" text-anchor="middle" font-size="10" font-weight="${weight}" fill="var(--ink)">${esc(corto(total))}</text>` : ""}
      <text x="${(x + bw / 2).toFixed(1)}" y="${H - 6}" text-anchor="middle" font-size="10" font-weight="${weight}" fill="var(--muted)">${esc(s.label)}</text>`;
  }).join("");

  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(nombres.join(" y "))} por mes">
    <line x1="0" x2="${W}" y1="${H - bottom}" y2="${H - bottom}" stroke="var(--line)"/>
    ${bars}
  </svg>`;
}
