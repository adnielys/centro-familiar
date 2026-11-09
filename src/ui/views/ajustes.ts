import { DIAS_CORTOS, MONEDAS } from "../../domain/catalog";
import { tasaActual } from "../../domain/cambio";
import { fmtDate, todayISO } from "../../domain/dates";
import type { Moneda } from "../../domain/types";
import { exportBackup, importBackup } from "../../data/backup";
import { store } from "../../data/store";
import { googleCalendar } from "../../integrations/googleCalendar";
import { actualizarTasaDeHoy, guardarTasaManual } from "../../integrations/eltoque";
import { attempt, downloadBlob, esc, formValues, numberFmt, optionsHtml, qs, toast } from "../dom";
import type { View } from "../router";
import { esNativo } from "../../platform/http";
import { avisosDisponibles, pedirPermisoAvisos, sincronizarAvisos } from "../../platform/notificaciones";

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

      <div class="card" id="avisosCard" ${avisosDisponibles() ? "" : "hidden"}>
        <h2>Avisos</h2>
        <form id="formAvisos" autocomplete="off">
          <p class="small muted">El iPhone te avisa el día que vence una tarea con fecha o un gasto fijo, aunque la app esté cerrada.</p>
          <label class="check" for="avActivo"><input type="checkbox" id="avActivo" name="avActivo"> Recibir avisos</label>
          <label for="avHora">Hora del aviso <input id="avHora" name="avHora" type="time" required></label>
          <button class="btn" type="submit">Guardar avisos</button>
          <p class="small muted" id="avEstado"></p>
        </form>
      </div>

      <div class="card" id="cambioCard">
        <h2>Tipo de cambio (USD → CUP)</h2>
        <div id="tasaEstado"></div>
        <form id="formTasaManual" autocomplete="off" class="row">
          <label for="tasaManual">Tasa de hoy: 1 USD = … CUP <input id="tasaManual" type="number" inputmode="decimal" min="1" step="0.01" placeholder="470"></label>
          <button class="btn ghost" type="submit">Guardar tasa manual</button>
        </form>
        <details id="detEltoque">
          <summary>Actualizar sola desde elTOQUE</summary>
          <div class="stack">
            <p class="small muted">1) Pide tu token gratis en <a href="https://tasas-token.eltoque.com/" target="_blank" rel="noopener">tasas-token.eltoque.com</a>. 2) Pégalo aquí. La app consulta la tasa de elTOQUE una vez al día al abrirse. Si tu teléfono no puede conectar directo, usa un proxy (instrucciones en el README del proyecto) y deja el token solo en el proxy.</p>
            <form id="formEltoque" autocomplete="off" class="stack">
              <label for="eltToken">Token de elTOQUE <input id="eltToken" name="token" type="password" spellcheck="false" autocomplete="off" placeholder="eyJhbGciOi…"></label>
              <label for="eltProxy">URL de proxy (opcional) <input id="eltProxy" name="proxy" type="url" spellcheck="false" placeholder="https://tasas.tu-cuenta.workers.dev"></label>
              <div class="actions">
                <button class="btn" type="submit">Guardar</button>
                <button class="btn ghost" type="button" id="eltActualizar">Actualizar ahora</button>
              </div>
              <div class="small" id="eltEstado" role="status"></div>
            </form>
          </div>
        </details>
        <ul class="list compact" id="tasasRecientes"></ul>
        <p class="small muted">Cada gasto se convierte con la tasa del día en que lo hiciste. Tasa automática: TRMI de <a href="https://eltoque.com/tasas-de-cambio-de-moneda-en-cuba-hoy" target="_blank" rel="noopener">elTOQUE</a>.</p>
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

      <div class="card" ${esNativo() ? "hidden" : ""}>
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

    qs<HTMLFormElement>("#formAvisos", el).addEventListener("submit", (e) => {
      e.preventDefault();
      const form = e.target as HTMLFormElement;
      const activo = qs<HTMLInputElement>("#avActivo", form).checked;
      const hora = formValues(form).avHora;
      void attempt(async () => {
        if (activo && !(await pedirPermisoAvisos())) {
          throw new Error("Permiso denegado. Actívalo en Ajustes del iPhone → Centro Familiar → Notificaciones.");
        }
        await store.saveConfig({ avisos: { activo, hora } });
        const n = await sincronizarAvisos();
        qs("#avEstado", form).textContent = activo ? `${n} aviso(s) programado(s).` : "Avisos desactivados.";
      }, "Avisos guardados");
    });

    qs<HTMLFormElement>("#formTasaManual", el).addEventListener("submit", (e) => {
      e.preventDefault();
      const usd = Number(qs<HTMLInputElement>("#tasaManual", el).value);
      if (!(usd > 0)) return toast("Escribe cuántos CUP vale 1 USD.");
      void attempt(() => guardarTasaManual(usd), `Tasa guardada: 1 USD = ${numberFmt.format(usd)} CUP`).then(() => {
        qs<HTMLInputElement>("#tasaManual", el).value = "";
      });
    });
    qs<HTMLFormElement>("#formEltoque", el).addEventListener("submit", (e) => {
      e.preventDefault();
      const v = formValues(e.target as HTMLFormElement);
      if (v.proxy && !/^https:\/\//.test(v.proxy)) return toast("La URL del proxy debe empezar por https://");
      void attempt(() => store.saveConfig({ cambio: { eltoqueToken: v.token, proxyUrl: v.proxy } }), "Configuración de elTOQUE guardada");
    });
    qs<HTMLButtonElement>("#eltActualizar", el).addEventListener("click", async () => {
      const estado = qs("#eltEstado", el);
      estado.className = "small muted";
      estado.textContent = "Consultando elTOQUE…";
      try {
        const usd = await actualizarTasaDeHoy();
        estado.className = "small ok-text";
        estado.textContent = `✓ 1 USD = ${numberFmt.format(usd)} CUP (elTOQUE, hoy)`;
      } catch (err) {
        estado.className = "small bad-text";
        estado.textContent = err instanceof Error ? err.message : "No se pudo consultar elTOQUE.";
      }
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
    renderTasas();
    const { googleClientId } = store.config;
    qs("#gEstado", root).innerHTML = !googleClientId
      ? `<span class="muted">No configurado.</span>`
      : googleCalendar.isConnected()
        ? `<span class="chip ok">Conectado</span>`
        : `<span class="muted">Configurado, sin conectar.</span>`;
    const standalone = esNativo() || window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    qs("#installState", root).textContent = standalone ? "✓ Estás usando la app instalada." : "Ahora mismo la estás usando desde el navegador.";
  },
};

function renderTasas(): void {
  const hoy = todayISO();
  const actual = tasaActual(store.data.tasas, hoy);
  qs("#tasaEstado", root).innerHTML = actual
    ? `<div class="bal-total">1 USD = ${esc(numberFmt.format(actual.usd))} <span class="small muted">CUP</span></div>
       <div class="small muted">${actual.fuente === "eltoque" ? "Fuente: elTOQUE (TRMI)" : "Tasa manual"} · ${actual.fecha === hoy ? "hoy" : esc(fmtDate(actual.fecha))}${actual.fecha !== hoy ? " · no hay tasa de hoy, se usa la última" : ""}</div>`
    : `<p class="small muted">Aún no hay tasa. Escríbela a mano o configura elTOQUE para ver tus gastos sumados en una sola moneda.</p>`;
  const recientes = [...store.data.tasas].sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, 7);
  qs("#tasasRecientes", root).innerHTML = recientes.map((t) => `<li><div class="grow item-head"><span>${esc(fmtDate(t.fecha))} <span class="small muted">· ${t.fuente === "eltoque" ? "elTOQUE" : "manual"}</span></span><span class="amount">${esc(numberFmt.format(t.usd))} CUP</span></div></li>`).join("");
}

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
  qs<HTMLInputElement>("#eltToken", root).value = c.cambio.eltoqueToken;
  qs<HTMLInputElement>("#eltProxy", root).value = c.cambio.proxyUrl;
  qs<HTMLInputElement>("#avActivo", root).checked = c.avisos.activo;
  qs<HTMLInputElement>("#avHora", root).value = c.avisos.hora;
}
