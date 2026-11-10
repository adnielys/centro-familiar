/**
 * Lectura de tickets de compra con varios artículos (Walmart, Soriana, una mipyme…).
 * Función pura sobre el texto del OCR: separa cada artículo con su importe, detecta
 * descuentos, total y comercio, y descarta las líneas de pago/impuestos.
 */
import type { Gasto, ISODate, Metodo, Moneda } from "./types";

export interface ArticuloTicket {
  descripcion: string;
  monto: number;
}

export interface LecturaTicket {
  comercio: string | null;
  articulos: ArticuloTicket[];
  /** Total impreso en el ticket (o subtotal si no hay total). */
  total: number | null;
  suma: number;
  /** total − suma: impuestos, redondeos o artículos que el OCR no leyó. */
  diferencia: number;
}

/**
 * Importe al final de la línea: 1,234.50 · 1.234,50 · $25.00 · 25,00 A · 5.00- · 6 240.0 · 12 100.00
 * Los tickets de cajas cubanas separan los miles con espacio y a veces imprimen un solo decimal.
 * El grupo con espacio admite 1–2 cifras delante ("6 240.0") para no pegar una cantidad o un
 * formato al precio ("Coca cola 600 370.00" es 370, no 600 370).
 */
const PRECIO_FINAL = /(-?)\$?\s?(?<![\d.,])(\d{1,2}(?: \d{3})+[.,]\d{1,2}|\d{1,3}(?:[.,]\d{3})+[.,]\d{1,2}|\d+[.,]\d{1,2})\s*(-?)\s*[A-Z*]{0,2}\s*$/i;

/** Líneas que no son artículos (pagos, totales, impuestos, datos del ticket). */
const NO_ARTICULO = /\b(sub\s?-?total|total|iva|i\.v\.a|impuesto|tax|ieps|cambio|su cambio|efectivo|cash|tarjeta|card|visa|master\s?card|amex|debito|credito|pago|pagado|recibido|vuelto|change|saldo|balance|puntos|monedero|ahorr\w*|articulos|items|propina|redondeo|aprob\w*|autoriz\w*|referencia|folio|transac\w*|rfc|tel\b|telefono|caja|cajero|tienda|sucursal|gracias)\b/;
const DESCUENTO = /\b(desc\w*|rebaja|promo\w*|ahorro|cupon|bonificacion|rollback)\b/;
const TOTAL = /\b(total(?! de articulos)|importe total|total a pagar)\b/;
const SUBTOTAL = /\bsub\s?-?total\b/;
/** Líneas de cantidad/peso que acompañan a un artículo: "2 @ 12.50", "1.250 kg x 30.00", "3 X $10". */
const CANTIDAD = /(^|\s)(\d+(?:[.,]\d+)?)\s*(?:@|x|kg|lb|pza|pz|un)\b/i;

const SUPERMERCADOS = /\b(walmart|wal-mart|bodega aurrera|aurrera|soriana|chedraui|costco|sams|sam's|oxxo|la comer|heb|h-e-b|superama|mega|supermercado|mercado|mipyme|tienda)\b/i;

const normalizar = (s: string): string => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const letras = (s: string): number => (s.match(/[a-záéíóúñ]/gi) ?? []).length;
const redondear = (n: number): number => Math.round(n * 100) / 100;

/** "1,234.50" → 1234.5 · "1.234,50" → 1234.5 · "25,00" → 25 · "6 240.0" → 6240 */
export function parsePrecio(raw: string): number | null {
  const s = raw.replace(/[\s$]/g, "");
  const m = /^(\d{1,3}(?:[.,]\d{3})*|\d+)[.,](\d{1,2})$/.exec(s);
  if (!m) return null;
  const entero = Number(m[1].replace(/[.,]/g, ""));
  return Number.isFinite(entero) ? redondear(entero + Number(`0.${m[2]}`)) : null;
}

/** Limpia la descripción: quita códigos de barras, SKU, cantidades y símbolos sueltos. */
export function limpiarDescripcion(raw: string): string {
  const s = raw
    .replace(/^[\s—–\-.:;,]+|[\s—–\-.:;,]+$/g, "") // rayas y puntuación sueltas del OCR
    .replace(/\b\d{6,}\b/g, " ")          // códigos de barras / SKU
    .replace(/^\s*\d{1,4}\s+(?=[a-z])/i, " ") // código corto o cantidad al inicio
    .replace(/[|_*#=~<>]+/g, " ")
    .replace(/\s+[A-Z]\s*$/, " ")          // indicador de impuesto suelto al final
    .replace(/\s{2,}/g, " ")
    .trim();
  return capitalizar(s).slice(0, 60);
}

function capitalizar(s: string): string {
  const lower = s.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

export function leerTicket(texto: string): LecturaTicket {
  const lineas = String(texto ?? "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const articulos: ArticuloTicket[] = [];
  let total: number | null = null;
  let subtotal: number | null = null;
  let pendiente: string | null = null; // descripción sin precio que espera su importe en la línea siguiente

  for (const linea of lineas) {
    const n = normalizar(linea);
    const m = PRECIO_FINAL.exec(linea);
    const precio = m ? parsePrecio(m[2]) : null;
    const antes = m ? linea.slice(0, m.index) : linea;
    const negativo = Boolean(m && (m[1] === "-" || m[3] === "-"));

    if (precio !== null && TOTAL.test(n) && !SUBTOTAL.test(n)) {
      total ??= precio;
      pendiente = null;
      continue;
    }
    if (precio !== null && SUBTOTAL.test(n)) {
      subtotal ??= precio;
      pendiente = null;
      continue;
    }
    if (precio !== null && (negativo || DESCUENTO.test(n)) && articulos.length) {
      const ultimo = articulos[articulos.length - 1];
      ultimo.monto = redondear(Math.max(0, ultimo.monto - precio));
      continue;
    }
    if (NO_ARTICULO.test(n)) {
      pendiente = null;
      continue;
    }
    if (precio === null) {
      // Descripción en una línea y el precio en la siguiente (tickets estrechos).
      if (DESCUENTO.test(n)) continue;
      pendiente = letras(linea) >= 3 && !CANTIDAD.test(linea) ? linea : pendiente;
      continue;
    }
    const descripcionPropia = letras(antes.replace(CANTIDAD, " ")) >= 2 && !/^\s*[\d.,\s]*(?:@|x|kg|lb)/i.test(antes);
    const base = descripcionPropia ? antes : pendiente;
    pendiente = null;
    if (!base || precio <= 0) continue;
    const descripcion = limpiarDescripcion(base);
    if (letras(descripcion) < 2) continue;
    articulos.push({ descripcion, monto: precio });
  }

  const suma = redondear(articulos.reduce((s, a) => s + a.monto, 0));
  const referencia = total ?? subtotal;
  return {
    comercio: detectarComercio(lineas),
    articulos,
    total: referencia,
    suma,
    diferencia: referencia === null ? 0 : redondear(referencia - suma),
  };
}

function detectarComercio(lineas: readonly string[]): string | null {
  const conocido = lineas.slice(0, 8).map((l) => SUPERMERCADOS.exec(l)?.[0]).find(Boolean);
  if (conocido) return capitalizar(conocido);
  const primera = lineas.slice(0, 4).find((l) => letras(l) >= 4 && !PRECIO_FINAL.test(l) && !NO_ARTICULO.test(normalizar(l)));
  return primera ? capitalizar(primera.replace(/\s{2,}/g, " ")).slice(0, 40) : null;
}

/** Los supermercados venden sobre todo comida: categoría por defecto si el diccionario no reconoce el artículo. */
export const esSupermercado = (comercio: string | null): boolean => Boolean(comercio && SUPERMERCADOS.test(comercio));

/* ---------------------- De la lectura a los gastos ---------------------- */

export type ModoTicket = "articulos" | "categorias" | "uno";

export const MODOS_TICKET: ReadonlyArray<readonly [ModoTicket, string]> = [
  ["articulos", "Cada artículo"],
  ["categorias", "Por categoría"],
  ["uno", "Un solo gasto"],
];

export interface LineaRevisada {
  descripcion: string;
  monto: number;
  categoria: string;
  incluida: boolean;
}

export interface DatosComunesTicket {
  fecha: ISODate;
  moneda: Moneda;
  metodo: Metodo;
  comercio: string | null;
}

export type GastoDeTicket = Omit<Gasto, "id" | "creado">;

/** Convierte las líneas revisadas en gastos según el modo elegido. */
export function gastosDeTicket(lineas: readonly LineaRevisada[], modo: ModoTicket, c: DatosComunesTicket): GastoDeTicket[] {
  const validas = lineas.filter((l) => l.incluida && l.monto > 0 && l.descripcion.trim());
  if (!validas.length) return [];
  const sufijo = c.comercio ? ` · ${c.comercio}` : "";
  const gasto = (monto: number, categoria: string, descripcion: string): GastoDeTicket => ({
    monto: redondear(monto), moneda: c.moneda, metodo: c.metodo, categoria, descripcion: descripcion.slice(0, 160),
    fecha: c.fecha, hijoId: null, origen: "ocr", naturaleza: "variable", fijoId: null,
  });

  if (modo === "articulos") return validas.map((l) => gasto(l.monto, l.categoria, `${l.descripcion.trim()}${sufijo}`));

  const porCategoria = new Map<string, LineaRevisada[]>();
  for (const l of validas) porCategoria.set(l.categoria, [...(porCategoria.get(l.categoria) ?? []), l]);
  const resumen = (ls: readonly LineaRevisada[]) => {
    const nombres = ls.slice(0, 3).map((l) => l.descripcion.trim()).join(", ");
    return `${ls.length} art.: ${nombres}${ls.length > 3 ? "…" : ""}`;
  };

  if (modo === "categorias") {
    return [...porCategoria].map(([categoria, ls]) =>
      gasto(ls.reduce((s, l) => s + l.monto, 0), categoria, `${c.comercio ?? "Compra"} (${resumen(ls)})`));
  }
  // Un solo gasto: en la categoría donde más se gastó.
  const principal = [...porCategoria].sort((a, b) => sumaDe(b[1]) - sumaDe(a[1]))[0][0];
  return [gasto(sumaDe(validas), principal, `${c.comercio ?? "Compra"} (${resumen(validas)})`)];
}

const sumaDe = (ls: readonly LineaRevisada[]): number => ls.reduce((s, l) => s + l.monto, 0);
