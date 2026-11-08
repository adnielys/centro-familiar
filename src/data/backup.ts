/** Copia de seguridad en JSON: exportar para guardar o pasar a otro teléfono, e importar. */
import { COLLECTION_NAMES, type Config } from "../domain/types";
import { store } from "./store";

const FORMAT = "centro-familiar-backup";
const VERSION = 1;

export function exportBackup(): Blob {
  const payload = { format: FORMAT, version: VERSION, exportado: new Date().toISOString(), config: store.config, data: store.data };
  return new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
}

export async function importBackup(file: File): Promise<void> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    throw new Error("El archivo no es un JSON válido.");
  }
  if (!isBackup(parsed)) throw new Error("El archivo no es una copia del Centro Familiar.");
  const data = Object.fromEntries(COLLECTION_NAMES.map((c) => [c, Array.isArray(parsed.data[c]) ? parsed.data[c] : []]));
  await store.replaceAll(data, parsed.config);
}

interface Backup {
  format: string;
  version: number;
  config: Partial<Config>;
  data: Record<string, unknown[]>;
}

function isBackup(x: unknown): x is Backup {
  const b = x as Backup;
  return Boolean(b) && b.format === FORMAT && typeof b.data === "object" && b.data !== null;
}
