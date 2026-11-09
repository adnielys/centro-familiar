# Centro Familiar — guía para Claude Code

App personal (web instalable + iOS + Android) para gestionar tareas, agenda/tiempo libre, gastos en CUP y USD (efectivo y Banca Remota) y actividades de los hijos.
Responde siempre en **español**. Trabaja como senior: clean code, funciones pequeñas, nombres de dominio en español, tests para toda la lógica.

## Principios (no negociables)
- **Sin IA en la app**: clasificación por reglas (regex + diccionarios + reglas aprendidas), OCR local con Tesseract. No añadir llamadas a LLMs.
- **Local-first**: los datos viven en IndexedDB del dispositivo. No hay backend. Nunca subas datos ni secretos al repo (el token de elTOQUE se guarda solo en el teléfono).
- **Dominio puro y testeado**: toda lógica de negocio va en `src/domain/` sin DOM ni red, con su test en `tests/`. La UI solo orquesta.
- **Dependencias con versión exacta** y publicadas hace más de 2 semanas.
- La app la usa una persona desde el móvil (390 px, modo oscuro). Comprueba cada cambio de UI en ese tamaño.

## Comandos
```bash
npm ci
npm test            # vitest (dominio)
npm run typecheck
npm run build       # tsc + vite → dist/
npm run preview     # sirve dist/ (con service worker)
npx cap sync        # copia dist/ a ios/ y android/
```
Antes de hacer commit: `npm run typecheck && npm test && npm run build` en verde.

## Arquitectura
```
src/domain/        lógica pura: agenda, fijos, tareas, periodos, balance, busqueda, cambio, recordatorios, ticket, clasificador.js (+ .d.ts)
src/data/          IndexedDB (db.ts, DB_VERSION), store.ts (estado + subscribe + saveConfig), migrations.ts, backup.ts
src/integrations/  ocr.ts (Tesseract bajo demanda), eltoque.ts (tasa USD→CUP), googleCalendar.ts
src/platform/      http.ts (fetch / CapacitorHttp), notificaciones.ts (avisos locales, solo nativo)
src/ui/            router por hash, vistas mount/update, sheet.ts (hoja inferior), dom.ts (utilidades), *Actions.ts
ios/ android/      proyectos Capacitor 8.5.3 (no editar los generados en public/ ni capacitor.config.json)
```
- Vistas: `mount(el)` una vez + `update()` en cada cambio del store. Eventos globales con atributos `data-*` en `main.ts`.
- Entidades y `Config` en `src/domain/types.ts`. Un campo nuevo de Config necesita valor en `DEFAULT_CONFIG` y merge en `mergeConfig` (store.ts). Cambios de forma de datos → migración en `migrations.ts` con test.
- Nativo vs web: `esNativo()` de `platform/http.ts`. En nativo no se registra el service worker.
- Zonas seguras en CSS: usa `var(--sat|--sab|--sal|--sar)` (definidas en `:root`), no `env()` directo.

## Despliegue
- Web: push a `main` → workflow **Deploy** publica `dist/` en GitHub Pages: https://adnielys.github.io/centro-familiar/
- iOS: workflow **iOS** (macOS, Xcode 26) → artefacto `.ipa` sin firmar; **iOS TestFlight** (manual, necesita secretos de App Store Connect).
- Android: workflow **Android** → artefacto `CentroFamiliar-apk` firmado con `android/app/debug.keystore` (versionado a propósito para que las actualizaciones instalen encima). AAB de Play solo con secretos `ANDROID_KEYSTORE_*`.
- Commits con autor `Adnielys <adnielys.rojas89@gmail.com>`, mensajes en español.

## Estado y pendientes
- Hecho: tareas con coste (fijo/estimado) y repetición, gastos fijos, balance y cortes mensuales, agenda con ocupado/libre, Google Calendar (solo web), elTOQUE, escaneo de tickets con artículos, avisos locales, apps iOS/Android.
- Pendiente / ideas: sincronización entre dispositivos (backend NestJS + PostgreSQL), firma iOS (Sideloadly o TestFlight, a decidir), publicar en Google Play.
- Limitaciones conocidas: el login de Google (popup) no funciona dentro de las apps nativas; los datos de la web y de la app nativa están separados (pasar con Exportar/Importar).
