/**
 * Cliente de la API de tasas de elTOQUE (TRMI). Fuente: https://tasas.eltoque.com
 * - Directo: GET /v1/trmi con "Authorization: Bearer <token>" y una ventana < 24 h.
 * - Proxy: GET <proxyUrl>?date_from=…&date_to=… (el proxy añade el token; ver proxy/eltoque-worker.js).
 * Sus condiciones piden citar a elTOQUE donde se muestre la tasa.
 */
import { parseTasaUSD, ventanaDeHoy } from "../domain/cambio";
import { todayISO } from "../domain/dates";
import type { Config } from "../domain/types";
import { store } from "../data/store";
import { esNativo, getJSON, type RespuestaJSON } from "../platform/http";

const API = "https://tasas.eltoque.com/v1/trmi";

export class ErrorTasa extends Error {}

export const tieneFuenteAutomatica = (c: Config["cambio"]): boolean => Boolean(c.eltoqueToken || c.proxyUrl);

/** Consulta la TRMI de hoy y devuelve el valor del USD en CUP. */
export async function consultarTasaUSD(cambio: Config["cambio"], ahora = new Date()): Promise<number> {
  const params = new URLSearchParams(ventanaDeHoy(ahora));
  const usarProxy = Boolean(cambio.proxyUrl);
  if (!usarProxy && !cambio.eltoqueToken) throw new ErrorTasa("Configura tu token de elTOQUE o un proxy en Ajustes.");
  const url = `${usarProxy ? cambio.proxyUrl.replace(/\/$/, "") : API}?${params}`;
  const headers: Record<string, string> = usarProxy ? {} : { Authorization: `Bearer ${cambio.eltoqueToken.trim()}`, Accept: "application/json" };
  let res: RespuestaJSON;
  try {
    res = await getJSON(url, headers);
  } catch {
    throw new ErrorTasa(usarProxy
      ? "No se pudo conectar con tu proxy. Revisa la URL o tu conexión."
      : esNativo()
        ? "No se pudo conectar con elTOQUE. Revisa tu conexión."
        : "El navegador no pudo conectar con elTOQUE (sin conexión o la API no admite llamadas directas desde apps web). Usa el proxy o la tasa manual.");
  }
  if (res.status === 401 || res.status === 403) throw new ErrorTasa("elTOQUE rechazó el token. Revisa que esté bien copiado.");
  if (res.status === 429) throw new ErrorTasa("Demasiadas consultas a elTOQUE. Inténtalo en unos minutos.");
  if (res.status < 200 || res.status >= 300) throw new ErrorTasa(`elTOQUE respondió ${res.status}.`);
  const usd = parseTasaUSD(res.data);
  if (!usd) throw new ErrorTasa("La respuesta de elTOQUE no trae la tasa del USD.");
  return usd;
}

/** Consulta y guarda la tasa de hoy (id = fecha). */
export async function actualizarTasaDeHoy(): Promise<number> {
  const usd = await consultarTasaUSD(store.config.cambio);
  const fecha = todayISO();
  await store.put("tasas", { id: fecha, fecha, usd, fuente: "eltoque", actualizado: new Date().toISOString() });
  return usd;
}

/** Al abrir la app: si hay fuente automática y aún no hay tasa de hoy, la pide en silencio. */
export async function actualizarSiHaceFalta(): Promise<void> {
  if (!tieneFuenteAutomatica(store.config.cambio) || !navigator.onLine) return;
  const hoy = store.byId("tasas", todayISO());
  if (hoy && hoy.fuente === "eltoque") return;
  try {
    await actualizarTasaDeHoy();
  } catch (e) {
    console.warn("Tasa elTOQUE:", e);
  }
}

export async function guardarTasaManual(usd: number): Promise<void> {
  const fecha = todayISO();
  await store.put("tasas", { id: fecha, fecha, usd: Math.round(usd * 100) / 100, fuente: "manual", actualizado: new Date().toISOString() });
}
