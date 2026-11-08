# Centro Familiar

PWA (aplicación web instalable) para gestionar **tareas, agenda y tiempo libre, gastos (CUP/USD, efectivo y Banca Remota) y las actividades de los hijos**. Funciona en **iPhone y Android** con un solo código, sin App Store, sin Mac y sin IA: todo se procesa en el teléfono.

## Funciones

| Pestaña | Qué hace |
|---|---|
| **Hoy** | Tiempo libre que te queda, lo próximo de la agenda, tareas vencidas, actividades de los niños, deberes y gastos del mes por moneda. |
| **Agenda** | Tu día con lo ocupado (trabajo, niños, bloques, Google Calendar) y los huecos libres. Al agendar te dice al momento si estás libre o con qué chocas, y te propone el siguiente hueco. |
| **Registrar** | Texto libre («350 almuerzo efectivo», «examen de mate de Ana el jueves», «llamar al plomero mañana a las 10») o foto/captura con OCR local. Propone, tú confirmas, y aprende de tus correcciones. |
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
  ui/            Vistas (mount una vez + update en cada cambio), router por hash, utilidades
tests/           Vitest: clasificador y agenda
```

Decisiones:
- **Sin framework de UI**: vanilla TypeScript con vistas de dos fases (`mount` / `update`): bundle de ~30 KB gzip.
- **Local-first**: los datos viven en IndexedDB del teléfono. El service worker (Workbox) permite usarla sin conexión.
- **Sin IA**: clasificación por reglas (regex + diccionarios + reglas aprendidas). El OCR es Tesseract local.

## Desarrollo

Requisitos: Node 20+.

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
2. En el repo: **Settings → Pages → Source: GitHub Actions**.
3. Cada push ejecuta tests y build y publica en `https://<usuario>.github.io/<repo>/`.

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

## Hoja de ruta

1. **Sincronización entre dispositivos**: backend NestJS + PostgreSQL (Docker) con API REST; el `store` ya centraliza las escrituras, así que se añade un adaptador de sincronización sin tocar las vistas. Permitiría también refresh tokens de Google y que agentes externos lean los datos.
2. **App nativa sin Mac**: empaquetar con **Capacitor** y compilar iOS en la nube (Codemagic o Ionic Appflow). Android: APK instalable directamente. iOS: requiere cuenta de Apple Developer (99 USD/año) para TestFlight.
3. Notificaciones de recordatorio (Web Push; en iOS solo con la app instalada, iOS 16.4+).
