# Centro Familiar

PWA (aplicación web instalable) para gestionar **tareas, agenda y tiempo libre, gastos (CUP/USD, efectivo y Banca Remota) y las actividades de los hijos**. Funciona en **iPhone y Android** con un solo código, sin App Store, sin Mac y sin IA: todo se procesa en el teléfono.

## Funciones

| Pestaña | Qué hace |
|---|---|
| **Hoy** | Tiempo libre que te queda, lo próximo de la agenda, tareas vencidas, actividades de los niños, deberes y gastos del mes por moneda. |
| **Agenda** | Tu día con lo ocupado (trabajo, niños, bloques, Google Calendar) y los huecos libres. Al agendar te dice al momento si estás libre o con qué chocas, y te propone el siguiente hueco. |
| **Registrar** | Texto libre («350 almuerzo efectivo», «examen de mate de Ana el jueves», «llamar al plomero mañana a las 10») o foto/captura con OCR local. Propone, tú confirmas, y aprende de tus correcciones. |
| **Dinero → Escanear ticket** | Foto o captura de un ticket con varios artículos (Walmart, mipyme…): OCR local, separa cada artículo con su importe, aplica descuentos, compara con el total impreso y propone categoría. Se guarda por artículo, por categoría o como un solo gasto (`src/domain/ticket.ts`). |
| **Tareas / Gastos / Hijos** | Gestión manual completa: horarios semanales, deberes, resúmenes por categoría, método y hijo. |
| **Ajustes** | Jornada y horario de trabajo, moneda, Google Calendar, copia de seguridad. |

## Arquitectura

```
src/
  domain/        Lógica pura, sin DOM ni red (100 % testeada)
    agenda.ts         Motor de disponibilidad: ocupaciones, conflictos, huecos, siguiente hueco
    clasificador.js   Parser determinista: intención, monto, moneda, método, fechas, horas, categoría
    dates.ts, catalog.ts, types.ts
  data/          Persistencia local
    db.ts             IndexedDB (idb)
    store.ts          Estado + persistencia + suscripción a cambios
    backup.ts         Exportar/importar JSON
  integrations/
    ocr.ts            Tesseract (WebAssembly) bajo demanda, imagen preprocesada en canvas
    googleCalendar.ts Google Identity Services + Calendar API (solo lectura, sin backend)
  platform/      Diferencias web / app nativa (Capacitor)
    http.ts           fetch en web; CapacitorHttp en iOS (sin CORS)
    notificaciones.ts Avisos locales programados (solo app nativa)
  ui/            Vistas (mount una vez + update en cada cambio), router por hash, utilidades
ios/             Proyecto Xcode generado por Capacitor (Swift Package Manager)
tests/           Vitest: todo el dominio
```

Decisiones:
- **Sin framework de UI**: vanilla TypeScript con vistas de dos fases (`mount` / `update`): bundle de ~30 KB gzip.
- **Local-first**: los datos viven en IndexedDB del teléfono. El service worker (Workbox) permite usarla sin conexión.
- **Sin IA**: clasificación por reglas (regex + diccionarios + reglas aprendidas). El OCR es Tesseract local.

## Desarrollo

Requisitos: Node 22+.

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # tests del dominio
npm run typecheck
npm run build      # genera dist/
npm run preview    # sirve dist/ como en producción (con service worker)
```

Para probar en el móvil durante el desarrollo: `npm run dev -- --host` y abre la IP de tu PC desde el teléfono (misma wifi). El service worker y la instalación requieren HTTPS, así que para instalarla de verdad usa el despliegue.

## Publicar (gratis, con HTTPS)

### Opción A: GitHub Pages
1. Crea un repositorio y sube el proyecto a la rama `main`.
2. Cada push a `main` ejecuta tests y build y publica `dist/` en la rama `gh-pages`.
3. La app queda en `https://<usuario>.github.io/<repo>/` (si no se activa sola: **Settings → Pages → Branch: gh-pages / root**).

### Opción B: GitLab Pages
1. Sube el proyecto a GitLab (rama por defecto).
2. El pipeline `.gitlab-ci.yml` publica en `https://<usuario>.gitlab.io/<repo>/` (ver **Deploy → Pages**).

### Opción C: Netlify o Cloudflare Pages
Conecta el repo con build `npm run build` y carpeta `dist`.

## Instalar en el teléfono

- **iPhone**: abre la URL en **Safari** → Compartir → **Añadir a pantalla de inicio**.
- **Android**: abre en **Chrome** → menú ⋮ → **Instalar aplicación**.

Se abre a pantalla completa con su icono y funciona sin conexión. Las actualizaciones se aplican solas al abrirla con conexión.

> Los datos quedan en ese teléfono. Usa **Ajustes → Exportar copia** periódicamente, y para pasar datos a otro dispositivo.

## Google Calendar (opcional)

Para que tus eventos cuenten como ocupado:
1. En [Google Cloud Console](https://console.cloud.google.com/) crea un proyecto y habilita **Google Calendar API**.
2. **Pantalla de consentimiento de OAuth**: tipo *Externo*, en modo prueba, y añádete como usuario de prueba.
3. **Credenciales → Crear credenciales → ID de cliente de OAuth → Aplicación web**. En *Orígenes de JavaScript autorizados* añade tu dominio (p. ej. `https://usuario.github.io`).
4. Copia el Client ID en **Ajustes → Google Calendar** y pulsa **Conectar**.

Es solo lectura. Al no haber backend, el permiso dura 1 hora y se renueva con «Conectar» (Agenda o Ajustes).

## Tipo de cambio (elTOQUE)

La app suma tus gastos en CUP y USD en una sola moneda usando la **TRMI de elTOQUE** (o una tasa manual). Cada gasto se convierte con la tasa **del día en que se hizo**.

1. Pide tu token gratis en <https://tasas-token.eltoque.com/>.
2. **Ajustes → Tipo de cambio → Actualizar sola desde elTOQUE**: pega el token y toca *Actualizar ahora*. La app consulta una vez al día al abrirse (`GET https://tasas.eltoque.com/v1/trmi`, ventana < 24 h).
3. Si aparece «El navegador no pudo conectar con elTOQUE», la API no admite llamadas directas desde apps web (CORS). Despliega el proxy:
   - Cloudflare → Workers & Pages → Create Worker → pega [`proxy/eltoque-worker.js`](proxy/eltoque-worker.js) → Deploy.
   - Settings → Variables and Secrets → Secret `ELTOQUE_TOKEN` = tu token (y opcional `ALLOWED_ORIGIN` = `https://adnielys.github.io`).
   - Copia la URL `https://….workers.dev` en *URL de proxy* y deja el token vacío en la app.
4. Sin token también funciona: escribe la tasa del día a mano.

Según las condiciones de elTOQUE, donde se muestra la tasa automática se cita a elTOQUE como fuente.

## App iOS (sin Mac)

La misma app web va empaquetada con **Capacitor 8** en `ios/`. GitHub compila en un Mac en la nube (gratis en repos públicos), así que no hace falta Mac.

En la app nativa, además de todo lo de la web:
- **Avisos** (Ajustes → Avisos): el iPhone avisa a la hora elegida el día que vence una tarea con fecha o un gasto fijo, con la app cerrada. Se reprograman solos al cambiar los datos (máximo 60, límite de iOS).
- **elTOQUE sin proxy**: la consulta sale desde iOS (CapacitorHttp), sin el bloqueo CORS del navegador.
- Sin service worker (los archivos ya van dentro de la app). Los datos de la app nativa son **independientes** de los de la web instalada: pásalos con Ajustes → Exportar / Importar.
- Limitación: el inicio de sesión de Google Calendar (ventana emergente) no funciona dentro de la app; úsalo desde la versión web.

### Compilación automática

Cada push a `main` lanza el workflow **iOS** (`.github/workflows/ios.yml`): tests → build web → `cap sync` → `xcodebuild` sin firma → artefacto `CentroFamiliar-ipa` (pestaña Actions → la ejecución → *Artifacts*).

Apple no deja instalar nada sin firma. Dos caminos:

**Opción 1 — Gratis, con tu Apple ID (desde Windows)**
1. Descarga el artefacto y descomprímelo: obtienes `CentroFamiliar-sin-firmar.ipa`.
2. Instala [Sideloadly](https://sideloadly.io) (o AltStore) en un PC con Windows e iTunes/iCloud de la web de Apple.
3. Conecta el iPhone por cable, arrastra el `.ipa`, escribe tu Apple ID y pulsa *Start*.
4. En el iPhone: Ajustes → General → VPN y gestión de dispositivos → confía en tu Apple ID. En iOS 16+ activa también Ajustes → Privacidad y seguridad → **Modo desarrollador**.
5. La firma gratuita **caduca a los 7 días**: hay que repetir el paso 3 (los datos se conservan si reinstalas encima).

**Opción 2 — TestFlight (Apple Developer, 99 USD/año)**
1. Date de alta en developer.apple.com. En App Store Connect crea la app con el bundle ID `com.adnielys.centrofamiliar`.
2. App Store Connect → Usuarios y acceso → Integraciones → **Claves de API**: crea una con rol *App Manager*, descarga el `.p8` y anota *Key ID* e *Issuer ID*.
3. En GitHub → Settings → Secrets and variables → Actions crea: `APPLE_TEAM_ID`, `ASC_KEY_ID`, `ASC_ISSUER_ID` y `ASC_KEY_P8_BASE64` (el `.p8` en base64: `base64 -w0 AuthKey_XXXX.p8` o `[Convert]::ToBase64String([IO.File]::ReadAllBytes("AuthKey_XXXX.p8"))` en PowerShell).
4. Actions → **iOS TestFlight** → *Run workflow*. Firma automáticamente en la nube de Apple y sube la versión; en unos minutos aparece en la app TestFlight del iPhone. Sin caducidad de 7 días (cada build dura 90 días).

### Desarrollo nativo

```bash
npm run build && npx cap sync ios   # copia dist/ al proyecto iOS
```
`ios/App/App/public` y `capacitor.config.json` se generan en cada `sync` (no se versionan). Icono: `ios/App/App/Assets.xcassets/AppIcon.appiconset` (1024×1024, sin transparencia).

## Hoja de ruta

1. **Sincronización entre dispositivos**: backend NestJS + PostgreSQL (Docker) con API REST; el `store` ya centraliza las escrituras, así que se añade un adaptador de sincronización sin tocar las vistas. Permitiría también refresh tokens de Google y que agentes externos lean los datos.
2. **Android nativo**: `npx cap add android` + workflow que genere un APK instalable directamente.
3. Avisos en la versión web (Web Push; requiere servidor).
