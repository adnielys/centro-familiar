/**
 * Punto de entrada: carga datos locales, monta las vistas y registra acciones globales
 * (borrado en dos toques, marcar como hecho, agendar una tarea).
 */
import "./styles.css";
import { registerSW } from "virtual:pwa-register";
import { fmtLongDate, todayISO } from "./domain/dates";
import type { CollectionName } from "./domain/types";
import { COLLECTION_NAMES } from "./domain/types";
import { store } from "./data/store";
import { attempt, confirmTap, qs, toast } from "./ui/dom";
import { pagarFijo } from "./ui/fijosActions";
import { ICONS } from "./ui/icons";
import { startRouter } from "./ui/router";
import { alternarTarea } from "./ui/tareaActions";
import { abrirTareaSheet } from "./ui/tareaSheet";
import { agendaView, agendarTarea } from "./ui/views/agenda";
import { ajustesView } from "./ui/views/ajustes";
import { gastosView } from "./ui/views/gastos";
import { hijosView } from "./ui/views/hijos";
import { hoyView } from "./ui/views/hoy";
import { registrarView } from "./ui/views/registrar";
import { tareasView } from "./ui/views/tareas";

const isCollection = (x: string | undefined): x is CollectionName => COLLECTION_NAMES.includes(x as CollectionName);

/** Borrado en dos toques: el primero arma el botón, el segundo confirma. */
function bindDelete(): void {
  document.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-del]");
    if (!btn) return;
    const col = btn.dataset.del;
    const id = btn.dataset.id;
    if (!isCollection(col) || !id || !confirmTap(btn)) return;
    void attempt(() => store.remove(col, id), "Eliminado");
  });
}

/** Casillas de "hecho": las tareas pasan por su flujo (pago, repetición); los deberes se marcan directo. */
function bindToggle(): void {
  document.addEventListener("change", (e) => {
    const el = e.target as HTMLInputElement;
    const col = el.dataset?.toggle;
    const id = el.dataset?.id;
    if (!id) return;
    if (col === "tareas") {
      const tarea = store.byId("tareas", id);
      if (tarea) alternarTarea(tarea, el.checked, el);
    } else if (col === "deberes") {
      void attempt(() => store.update("deberes", id, { estado: el.checked ? "hecha" : "pendiente" }));
    }
  });
}

/** "Editar" de una tarea en cualquier lista abre la hoja de edición. */
function bindEditarTarea(): void {
  document.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>("[data-edit-tarea]");
    const tarea = btn ? store.byId("tareas", btn.dataset.editTarea) : undefined;
    if (tarea) abrirTareaSheet(tarea);
  });
}

/** "Registrar pago" de un gasto fijo (Hoy y Gastos), en dos toques mostrando el importe. */
function bindPagarFijo(): void {
  document.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-pagar-fijo]");
    const fijo = btn ? store.byId("fijos", btn.dataset.pagarFijo) : undefined;
    if (!btn || !fijo) return;
    if (!confirmTap(btn, `¿Pagar ${fijo.monto} ${fijo.moneda}?`)) return;
    void attempt(() => pagarFijo(fijo), `Pago registrado: ${fijo.nombre}`);
  });
}

function bindAgendar(): void {
  document.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>("[data-agendar]");
    const tarea = btn ? store.byId("tareas", btn.dataset.agendar) : undefined;
    if (tarea) agendarTarea(tarea);
  });
}

async function main(): Promise<void> {
  qs("#todayLabel").textContent = fmtLongDate(todayISO());
  try {
    await store.init();
  } catch (e) {
    console.error(e);
    qs("#appMain").innerHTML = `<div class="card"><h2>No se pudo abrir el almacenamiento</h2><p>Este navegador no permite guardar datos (¿modo privado?). Ábrela en una ventana normal.</p></div>`;
    return;
  }
  bindDelete();
  bindToggle();
  bindAgendar();
  bindPagarFijo();
  bindEditarTarea();
  qs("#topActions").innerHTML = `
    <a class="icon-btn round" href="#hijos" data-tab="hijos" aria-label="Familia">${ICONS.familia}</a>
    <a class="icon-btn round" href="#ajustes" data-tab="ajustes" aria-label="Ajustes">${ICONS.ajustes}</a>`;
  startRouter([hoyView, agendaView, tareasView, gastosView, registrarView, hijosView, ajustesView], {
    nav: qs("#nav"),
    main: qs("#appMain"),
    plusIndex: 2,
    onPlus: () => abrirTareaSheet(),
  });

  // Pide almacenamiento persistente para que el sistema no borre los datos por falta de espacio.
  void navigator.storage?.persist?.();

  registerSW({
    onOfflineReady: () => toast("Lista para usarse sin conexión"),
  });

  // A medianoche (o al volver a la app otro día) refresca "hoy".
  let dia = todayISO();
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && todayISO() !== dia) {
      dia = todayISO();
      qs("#todayLabel").textContent = fmtLongDate(dia);
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    }
  });
}

void main();
