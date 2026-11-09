/**
 * Avisos locales en la app nativa (Capacitor LocalNotifications).
 * Cada vez que cambian los datos se reprograma el conjunto completo (idempotente):
 * se cancelan los avisos pendientes y se programan los que calcula el dominio.
 * En la web no hace nada: el navegador no permite avisos programados sin servidor.
 */
import { nowMinutes, todayISO } from "../domain/dates";
import { planificarRecordatorios } from "../domain/recordatorios";
import { store } from "../data/store";
import { esNativo } from "./http";

const ESPERA_MS = 1500;

export const avisosDisponibles = (): boolean => esNativo();

async function plugin() {
  const { LocalNotifications } = await import("@capacitor/local-notifications");
  return LocalNotifications;
}

/** Pide permiso al sistema. Devuelve true si se concedió. */
export async function pedirPermisoAvisos(): Promise<boolean> {
  if (!avisosDisponibles()) return false;
  const ln = await plugin();
  const actual = await ln.checkPermissions();
  if (actual.display === "granted") return true;
  const pedido = await ln.requestPermissions();
  return pedido.display === "granted";
}

/** Reprograma todos los avisos según los datos actuales. */
export async function sincronizarAvisos(): Promise<number> {
  if (!avisosDisponibles()) return 0;
  const ln = await plugin();
  const pendientes = await ln.getPending();
  if (pendientes.notifications.length) {
    await ln.cancel({ notifications: pendientes.notifications.map((n) => ({ id: n.id })) });
  }
  const { activo, hora } = store.config.avisos;
  if (!activo || (await ln.checkPermissions()).display !== "granted") return 0;

  const plan = planificarRecordatorios({
    tareas: store.data.tareas,
    fijos: store.data.fijos,
    gastos: store.data.gastos,
    hoy: todayISO(),
    ahoraMin: nowMinutes(),
    hora,
  });
  if (plan.length) {
    await ln.schedule({
      notifications: plan.map((r) => ({
        id: r.id,
        title: r.titulo,
        body: r.cuerpo,
        schedule: { at: new Date(r.cuando), allowWhileIdle: true },
        extra: { clave: r.clave },
      })),
    });
  }
  return plan.length;
}

/** Mantiene los avisos al día: tras cada cambio de datos (agrupando ráfagas) y al volver a la app. */
export function iniciarAvisos(): void {
  if (!avisosDisponibles()) return;
  let temporizador: ReturnType<typeof setTimeout> | undefined;
  const programar = () => {
    clearTimeout(temporizador);
    temporizador = setTimeout(() => void sincronizarAvisos().catch((e) => console.warn("Avisos:", e)), ESPERA_MS);
  };
  store.subscribe(programar);
  document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && programar());
  programar();
}
