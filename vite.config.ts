import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// base relativa: funciona igual en la raíz de un dominio o en /<repo>/ de GitHub/GitLab Pages.
export default defineConfig({
  base: "./",
  plugins: [
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icons/apple-touch-icon.png"],
      manifest: {
        name: "Centro Familiar",
        short_name: "Familia",
        description: "Tareas, agenda, gastos y actividades de los niños.",
        lang: "es",
        start_url: "./",
        scope: "./",
        display: "standalone",
        orientation: "portrait",
        background_color: "#F2F5F4",
        theme_color: "#1F6F78",
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,png,svg,webmanifest}"],
        // El motor OCR se descarga bajo demanda desde su CDN y se guarda en caché para usarlo sin conexión.
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.hostname === "cdn.jsdelivr.net",
            handler: "CacheFirst",
            options: { cacheName: "ocr-engine", expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 90 } },
          },
        ],
      },
    }),
  ],
  test: { environment: "node", include: ["tests/**/*.test.ts"] },
});
