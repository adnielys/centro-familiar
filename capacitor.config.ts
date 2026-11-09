import type { CapacitorConfig } from "@capacitor/cli";

/** Configuración del contenedor nativo (iOS). La web sigue siendo la fuente única. */
const config: CapacitorConfig = {
  appId: "com.adnielys.centrofamiliar",
  appName: "Centro Familiar",
  webDir: "dist",
  ios: {
    // El CSS ya respeta las zonas seguras (env(safe-area-inset-*)); evitamos doble margen.
    contentInset: "never",
  },
  plugins: {
    CapacitorHttp: { enabled: false },
    LocalNotifications: { iconColor: "#4f7cff" },
  },
};

export default config;
