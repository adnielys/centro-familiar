/**
 * Store de la aplicación: estado en memoria + persistencia en IndexedDB + notificación de cambios.
 * Las vistas leen `store.data` / `store.config` y se suscriben con `store.subscribe`.
 */
import { COLLECTION_NAMES, DEFAULT_CONFIG, type Actividad, type Gasto, type CollectionName, type Collections, type Config } from "../domain/types";
import { dbApi } from "./db";
import { migrarActividad, migrarGasto } from "./migrations";

type Listener = () => void;
type DataState = { [K in CollectionName]: Collections[K][] };
/** Datos de una entidad nueva: sin id (lo genera el store). */
export type NewEntity<K extends CollectionName> = Omit<Collections[K], "id" | "creado">;

const newId = (): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

const emptyData = (): DataState => Object.fromEntries(COLLECTION_NAMES.map((c) => [c, []])) as unknown as DataState;

class Store {
  data: DataState = emptyData();
  config: Config = structuredClone(DEFAULT_CONFIG);
  private listeners = new Set<Listener>();

  async init(): Promise<void> {
    const entries = await Promise.all(COLLECTION_NAMES.map(async (c) => [c, await dbApi.getAll(c)] as const));
    this.data = Object.fromEntries(entries) as unknown as DataState;
    await this.migrate();
    const saved = await dbApi.getConfig();
    this.config = mergeConfig(saved);
    this.emit();
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  byId<K extends CollectionName>(col: K, id: string | null | undefined): Collections[K] | undefined {
    return id ? (this.data[col] as Collections[K][]).find((x) => x.id === id) : undefined;
  }

  async add<K extends CollectionName>(col: K, value: NewEntity<K>): Promise<Collections[K]> {
    const entity = { ...value, id: newId(), creado: new Date().toISOString() } as unknown as Collections[K];
    await dbApi.put(col, entity);
    (this.data[col] as Collections[K][]).push(entity);
    this.emit();
    return entity;
  }

  /** Crea o reemplaza una entidad con id conocido (p. ej. reglas con id derivado del patrón). */
  async put<K extends CollectionName>(col: K, entity: Collections[K]): Promise<void> {
    await dbApi.put(col, entity);
    const list = this.data[col] as Collections[K][];
    const i = list.findIndex((x) => x.id === entity.id);
    if (i >= 0) list[i] = entity;
    else list.push(entity);
    this.emit();
  }

  async update<K extends CollectionName>(col: K, id: string, patch: Partial<Collections[K]>): Promise<void> {
    const current = this.byId(col, id);
    if (!current) throw new Error(`No existe ${col}/${id}`);
    await this.put(col, { ...current, ...patch, id });
  }

  async remove(col: CollectionName, id: string): Promise<void> {
    await dbApi.delete(col, id);
    (this.data[col] as { id: string }[]) = (this.data[col] as { id: string }[]).filter((x) => x.id !== id);
    this.emit();
  }

  async saveConfig(patch: Partial<Config>): Promise<void> {
    this.config = mergeConfig({ ...this.config, ...patch });
    await dbApi.putConfig(this.config);
    this.emit();
  }

  /** Sustituye todos los datos (importar copia de seguridad). */
  async replaceAll(data: Partial<DataState>, config?: Partial<Config>): Promise<void> {
    for (const col of COLLECTION_NAMES) {
      await dbApi.clear(col);
      for (const item of data[col] ?? []) await dbApi.put(col, item as never);
    }
    if (config) await dbApi.putConfig(mergeConfig(config));
    await this.init();
  }

  /** Aplica migraciones de datos antiguos y persiste solo lo que cambió. */
  private async migrate(): Promise<void> {
    const actividades: Actividad[] = [];
    for (const raw of this.data.actividades) {
      const { actividad, cambiada } = migrarActividad(raw);
      if (cambiada) await dbApi.put("actividades", actividad);
      actividades.push(actividad);
    }
    this.data.actividades = actividades;

    const gastos: Gasto[] = [];
    for (const raw of this.data.gastos) {
      const { gasto, cambiada } = migrarGasto(raw);
      if (cambiada) await dbApi.put("gastos", gasto);
      gastos.push(gasto);
    }
    this.data.gastos = gastos;
  }

  private emit(): void {
    this.listeners.forEach((fn) => fn());
  }
}

/** Completa una configuración guardada (posiblemente de una versión anterior) con los valores por defecto. */
function mergeConfig(saved: Partial<Config> | undefined): Config {
  const d = DEFAULT_CONFIG;
  return {
    ...d,
    ...saved,
    jornada: { ...d.jornada, ...saved?.jornada },
    trabajo: { ...d.trabajo, ...saved?.trabajo },
  };
}

export const store = new Store();
