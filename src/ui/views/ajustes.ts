import { DIAS_CORTOS, MONEDAS } from "../../domain/catalog";
import { todayISO } from "../../domain/dates";
import type { Moneda } from "../../domain/types";
import { exportBackup, importBackup } from "../../data/backup";
import { store } from "../../data/store";
import { googleCalendar } from "../../integrations/googleCalendar";
import { attempt, downloadBlob, formValues, optionsHtml, qs, toast } from "../dom";
import type { View } from "../router";

let root: HTMLElement;

export const ajustesView: View = {
  id: "ajustes",
  label: "Ajustes",

  mount(el) {
    root = el;
    el.innerHTML = `
      <div class="card">
        <h2>Mi tiempo</h2>
        <form id="formTiempo" autocomplete="off">
          <p class="small muted">La jornada es la parte del día en la que se puede agendar. Fuera del horario de trabajo y de lo ya ocupado, todo es tiempo libre.</p>
          <div class="row">
            <label for="jInicio">Mi día empieza <input id="jInicio" name="jInicio" type="time" required></label>
            <label for="jFin">Mi día termina <input id="jFin" name="jFin" type="time" required></label>
          </div>
          <label class="check" for="wActivo"><input type="checkbox" id="wActivo" name="wActivo"> Tengo horario de trabajo (cuenta como ocupado)</label>
          <div class="days" role="group" aria-label="Días de trabajo">${DIAS_CORTOS.map((d, i) => `<label for="wd${i + 1}"><input type="checkbox" id="wd${i + 1}" name="wdia" value="${i + 1}">${d}</label>`).join("")}</div>
          <div class="row">
            <label for="wInicio">Trabajo desde <input id="wInicio" name="wInicio" type="time"></label>
            <label for="wFin">Trabajo hasta <input id="wFin" name="wFin" type="time"></label>
          </div>
          <button class="btn" type="submit">Guardar horario</button>
        </form>
      </div>

      <div class="card">
        <h2>Moneda</h2>
        <label for="aMoneda">Moneda habitual (por defecto al registrar) <select id="aMoneda">${optionsHtml(MONEDAS.map((m) => [m, m]), store.config.monedaPrincipal)}</select></label>
      </div>

      <div class="card">
        <h2>Google Calendar</h2>
        <p class="small muted">Para que tus eventos de Google cuenten como ocupado, crea un <strong>OAuth Client ID</strong> de tipo «Aplicación web» en Google Cloud Console, con la dirección de esta app como origen autorizado. Los pasos están en el README del proyecto. Solo lectura; el permiso dura 1 hora y se renueva con «Conectar».</p>
        <form id="formGoogle" autocomplete="off">
          <label for="gClient">Client ID <input id="gClient" name="clientId" placeholder="123456-abc.apps.googleusercontent.com" spellcheck="false"></label>
          <div class="actions">
            <button class="btn" type="submit">Guardar</button>
            <button class="btn ghost" type="button" id="gConectar">Conectar ahora</button>
          </div>
          <div class="small" id="gEstado"></div>
        </form>
      </div>

      <div class="card">
        <h2>Copia de seguridad</h2>
        <p class="small muted">Tus datos viven solo en este teléfono. Exporta una copia de vez en cuando, o para pasarlos a otro móvil.</p>
        <div class="actions">
          <button class="btn" type="button" id="bExport">Exportar copia</button>
          <label class="btn ghost" for="bImport">Importar copia</label>
          <input id="bImport" class="visually-hidden" type="file" accept="application/json,.json">
        </div>
      </div>

      <div class="card">
        <h2>Instalar en el teléfono</h2>
        <ul class="steps small">
          <li><strong>iPhone:</strong> abre esta dirección en <strong>Safari</strong> → botón Compartir → «Añadir a pantalla de inicio».</li>
          <li><strong>Android:</strong> abre en <strong>Chrome</strong> → menú ⋮ → «Instalar aplicación».</li>
        </ul>
        <p class="small muted" id="installState"></p>
      </div>`;

    qs<HTMLFormElement>("#formTiempo", el).addEventListener("submit", (e) => {
      e.preventDefault();
      const form = e.target as HTMLFormElement;
      const v = formValues(form);
      const dias = Array.from(form.querySelectorAll<HTMLInputElement>('input[name="wdia"]:checked')).map((i) => Number(i.value));
      if (v.jFin <= v.jInicio) return toast("El final del día debe ser posterior al inicio.");
      const activo = qs<HTMLInputElement>("#wActivo", form).checked;
      if (activo && v.wFin <= v.wInicio) return toast("El final del trabajo debe ser posterior al inicio.");
      void attempt(() => store.saveConfig({ jornada: { inicio: v.jInicio, fin: v.jFin }, trabajo: { activo, dias, inicio: v.wInicio, fin: v.wFin } }), "Horario guardado");
    });

    qs<HTMLSelectElement>("#aMoneda", el).addEventListener("change", (e) => {
      void attempt(() => store.saveConfig({ monedaPrincipal: (e.target as HTMLSelectElement).value as Moneda }), "Moneda guardada");
    });

    qs<HTMLFormElement>("#formGoogle", el).addEventListener("submit", (e) => {
      e.preventDefault();
      const clientId = formValues(e.target as HTMLFormElement).clientId;
      if (clientId && !/\.apps\.googleusercontent\.com$/.test(clientId)) return toast("El Client ID debe terminar en .apps.googleusercontent.com");
      void attempt(() => store.saveConfig({ googleClientId: clientId }), clientId ? "Client ID guardado" : "Google Calendar desactivado");
    });
    qs<HTMLButtonElement>("#gConectar", el).addEventListener("click", () => {
      void attempt(async () => {
        await googleCalendar.connect(store.config.googleClientId);
        await googleCalendar.cargar(todayISO(), 7);
      }, "Google Calendar conectado").then(() => this.update());
    });

    qs<HTMLButtonElement>("#bExport", el).addEventListener("click", () => {
      downloadBlob(exportBackup(), `centro-familiar-${todayISO()}.json`);
    });
    qs<HTMLInputElement>("#bImport", el).addEventListener("change", (e) => {
      const input = e.target as HTMLInputElement;
      const file = input.files?.[0];
      input.value = "";
      if (file) void attempt(() => importBackup(file), "Copia importada");
    });
  },

  onShow() {
    fillForms();
  },

  update() {
    const { googleClientId } = store.config;
    qs("#gEstado", root).innerHTML = !googleClientId
      ? `<span class="muted">No configurado.</span>`
      : googleCalendar.isConnected()
        ? `<span class="chip ok">Conectado</span>`
        : `<span class="muted">Configurado, sin conectar.</span>`;
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    qs("#installState", root).textContent = standalone ? "✓ Estás usando la app instalada." : "Ahora mismo la estás usando desde el navegador.";
  },
};

/** Rellena los formularios con la configuración guardada (solo al entrar, para no pisar lo que se está editando). */
function fillForms(): void {
  const c = store.config;
  const form = qs<HTMLFormElement>("#formTiempo", root);
  qs<HTMLInputElement>("#jInicio", form).value = c.jornada.inicio;
  qs<HTMLInputElement>("#jFin", form).value = c.jornada.fin;
  qs<HTMLInputElement>("#wActivo", form).checked = c.trabajo.activo;
  qs<HTMLInputElement>("#wInicio", form).value = c.trabajo.inicio;
  qs<HTMLInputElement>("#wFin", form).value = c.trabajo.fin;
  form.querySelectorAll<HTMLInputElement>('input[name="wdia"]').forEach((i) => (i.checked = c.trabajo.dias.includes(Number(i.value))));
  qs<HTMLSelectElement>("#aMoneda", root).value = c.monedaPrincipal;
  qs<HTMLInputElement>("#gClient", root).value = c.googleClientId;
}
