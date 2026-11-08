/**
 * Google Calendar (solo lectura) directamente desde el navegador, sin backend:
 * Google Identity Services entrega un token de acceso de 1 hora y se consultan los eventos con hora.
 *
 * Requisito: un OAuth Client ID de tipo "Aplicación web" con el dominio de la app como origen autorizado.
 * Limitación conocida: sin backend no hay refresh token; tras 1 hora se vuelve a pulsar "Conectar".
 */
import type { Ocupacion } from "../domain/agenda";
import { addDays, toISODate } from "../domain/dates";
import type { ISODate } from "../domain/types";

const GIS_SRC = "https://accounts.google.com/gsi/client";
const SCOPE = "https://www.googleapis.com/auth/calendar.readonly";
const API = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
}
interface TokenClient {
  requestAccessToken(opts?: { prompt?: string }): void;
}
declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient(cfg: { client_id: string; scope: string; callback: (r: TokenResponse) => void; error_callback?: (e: { type: string }) => void }): TokenClient;
          revoke(token: string, done?: () => void): void;
        };
      };
    };
  }
}

interface GoogleEvent {
  summary?: string;
  transparency?: string;
  status?: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
}

let token: { value: string; expiresAt: number } | null = null;
let gisPromise: Promise<void> | null = null;
const cache = new Map<ISODate, Ocupacion[]>();

function loadGis(): Promise<void> {
  gisPromise ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = GIS_SRC;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      gisPromise = null;
      reject(new Error("No se pudo cargar el inicio de sesión de Google."));
    };
    document.head.appendChild(s);
  });
  return gisPromise;
}

export const googleCalendar = {
  isConnected(): boolean {
    return Boolean(token && token.expiresAt > Date.now());
  },

  /** Abre el consentimiento de Google. Debe llamarse desde un clic (los navegadores bloquean popups automáticos). */
  async connect(clientId: string): Promise<void> {
    if (!clientId) throw new Error("Configura primero el Client ID de Google en Ajustes.");
    await loadGis();
    const oauth = window.google?.accounts.oauth2;
    if (!oauth) throw new Error("Google no respondió.");
    await new Promise<void>((resolve, reject) => {
      const client = oauth.initTokenClient({
        client_id: clientId,
        scope: SCOPE,
        callback: (r) => {
          if (r.error || !r.access_token) return reject(new Error(`Google rechazó el acceso (${r.error ?? "sin token"}).`));
          token = { value: r.access_token, expiresAt: Date.now() + ((r.expires_in ?? 3600) - 60) * 1000 };
          cache.clear();
          resolve();
        },
        error_callback: (e) => reject(new Error(e.type === "popup_closed" ? "Se cerró la ventana de Google." : "No se pudo abrir Google.")),
      });
      client.requestAccessToken({ prompt: "" });
    });
  },

  disconnect(): void {
    if (token) window.google?.accounts.oauth2.revoke(token.value);
    token = null;
    cache.clear();
  },

  /** Ocupaciones ya descargadas para una fecha (síncrono, para el motor de agenda). */
  ocupaciones(fecha: ISODate): Ocupacion[] {
    return cache.get(fecha) ?? [];
  },

  hasDay(fecha: ISODate): boolean {
    return cache.has(fecha);
  },

  /** Descarga los eventos de [desde, desde + dias) y los deja en caché por día. */
  async cargar(desde: ISODate, dias: number): Promise<void> {
    if (!this.isConnected() || !token) return;
    const [y, m, d] = desde.split("-").map(Number);
    const timeMin = new Date(y, m - 1, d).toISOString();
    const timeMax = new Date(y, m - 1, d + dias).toISOString();
    const url = `${API}?${new URLSearchParams({ timeMin, timeMax, singleEvents: "true", orderBy: "startTime", maxResults: "250" })}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token.value}` } });
    if (res.status === 401) {
      token = null;
      throw new Error("La sesión de Google caducó. Pulsa Conectar de nuevo.");
    }
    if (!res.ok) throw new Error(`Google Calendar respondió ${res.status}.`);
    const { items = [] } = (await res.json()) as { items?: GoogleEvent[] };
    for (let i = 0; i < dias; i++) cache.set(addDays(desde, i), []);
    for (const ev of items) for (const [fecha, occ] of splitByDay(ev)) cache.get(fecha)?.push(occ);
  },
};

/** Convierte un evento con hora en ocupaciones por día (un evento puede cruzar medianoche). */
function splitByDay(ev: GoogleEvent): Array<[ISODate, Ocupacion]> {
  if (!ev.start.dateTime || !ev.end.dateTime || ev.transparency === "transparent" || ev.status === "cancelled") return [];
  const start = new Date(ev.start.dateTime);
  const end = new Date(ev.end.dateTime);
  const out: Array<[ISODate, Ocupacion]> = [];
  for (let day = new Date(start.getFullYear(), start.getMonth(), start.getDate()); day < end; day.setDate(day.getDate() + 1)) {
    const dayStart = day.getTime();
    const dayEnd = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1).getTime(); // respeta cambios de horario
    const s = Math.max(start.getTime(), dayStart);
    const e = Math.min(end.getTime(), dayEnd);
    if (e <= s) continue;
    out.push([toISODate(day), { inicio: Math.round((s - dayStart) / 60000), fin: Math.round((e - dayStart) / 60000), fuente: "google", titulo: ev.summary || "Evento de Google" }]);
  }
  return out;
}
