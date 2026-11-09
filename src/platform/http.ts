/**
 * HTTP independiente de la plataforma.
 * - Web: fetch (sujeto a CORS).
 * - App nativa (Capacitor): CapacitorHttp hace la petición desde iOS, sin CORS.
 * Devuelve siempre { status, data } para que el llamador no dependa del transporte.
 */
import { Capacitor, CapacitorHttp } from "@capacitor/core";

export interface RespuestaJSON {
  status: number;
  data: unknown;
}

export class ErrorDeRed extends Error {}

export const esNativo = (): boolean => Capacitor.isNativePlatform();

export async function getJSON(url: string, headers: Record<string, string> = {}): Promise<RespuestaJSON> {
  try {
    if (esNativo()) {
      const res = await CapacitorHttp.get({ url, headers, responseType: "json" });
      const data = typeof res.data === "string" ? safeParse(res.data) : res.data;
      return { status: res.status, data };
    }
    const res = await fetch(url, { headers });
    return { status: res.status, data: await res.json().catch(() => null) };
  } catch (e) {
    throw new ErrorDeRed(e instanceof Error ? e.message : String(e));
  }
}

function safeParse(texto: string): unknown {
  try {
    return JSON.parse(texto);
  } catch {
    return null;
  }
}
