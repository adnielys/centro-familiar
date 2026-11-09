/**
 * Persistencia local en IndexedDB (un object store por colección + "config").
 * Los datos viven en el dispositivo; la copia de seguridad (backup.ts) permite moverlos.
 */
import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import { COLLECTION_NAMES, type CollectionName, type Collections, type Config } from "../domain/types";

const DB_NAME = "centro-familiar";
/** v2: "fijos"; v3: "cortes"; v4: "tasas". */
const DB_VERSION = 4;

type Schema = DBSchema & {
  [K in CollectionName]: { key: string; value: Collections[K] };
} & {
  config: { key: string; value: Config };
};

let dbPromise: Promise<IDBPDatabase<Schema>> | null = null;

export function openDatabase(): Promise<IDBPDatabase<Schema>> {
  dbPromise ??= openDB<Schema>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      for (const name of COLLECTION_NAMES) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("config")) db.createObjectStore("config");
    },
  });
  return dbPromise;
}

export const dbApi = {
  async getAll<K extends CollectionName>(col: K): Promise<Collections[K][]> {
    const db = await openDatabase();
    return (await db.getAll(col as never)) as Collections[K][];
  },
  async put<K extends CollectionName>(col: K, value: Collections[K]): Promise<void> {
    const db = await openDatabase();
    await db.put(col as never, value as never);
  },
  async delete(col: CollectionName, id: string): Promise<void> {
    const db = await openDatabase();
    await db.delete(col as never, id);
  },
  async clear(col: CollectionName): Promise<void> {
    const db = await openDatabase();
    await db.clear(col as never);
  },
  async getConfig(): Promise<Config | undefined> {
    const db = await openDatabase();
    return db.get("config", "general");
  },
  async putConfig(config: Config): Promise<void> {
    const db = await openDatabase();
    await db.put("config", config, "general");
  },
};
