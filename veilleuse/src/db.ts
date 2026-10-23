import { openDB, type DBSchema } from 'idb';
import type { ActiveFeed } from './lib/feeding';
import { DEFAULT_SETTINGS, type AppEvent, type Settings } from './model';

interface Schema extends DBSchema {
  events: { key: string; value: AppEvent; indexes: { at: number; updatedAt: number } };
  kv: { key: 'activeFeed' | 'settings'; value: ActiveFeed | Settings };
}

const dbPromise = openDB<Schema>('veilleuse', 1, {
  upgrade(db) {
    const events = db.createObjectStore('events', { keyPath: 'id' });
    events.createIndex('at', 'at');
    // Servira à la synchronisation : « tout ce qui a changé depuis… ».
    events.createIndex('updatedAt', 'updatedAt');
    db.createObjectStore('kv');
  },
});

export interface Snapshot {
  events: AppEvent[];
  activeFeed: ActiveFeed | null;
  settings: Settings;
}

/** Charge tout : quelques milliers d'entrées au plus, cela tient sans peine en mémoire. */
export async function loadAll(): Promise<Snapshot> {
  const db = await dbPromise;
  const [events, activeFeed, settings] = await Promise.all([
    db.getAllFromIndex('events', 'at'),
    db.get('kv', 'activeFeed') as Promise<ActiveFeed | undefined>,
    db.get('kv', 'settings') as Promise<Settings | undefined>,
  ]);
  return {
    events: events.filter((e) => e.deletedAt === null),
    activeFeed: activeFeed ?? null,
    settings: { ...DEFAULT_SETTINGS, ...settings },
  };
}

/** Écrit un événement (création, modification ou suppression logique). */
export async function putEvent(event: AppEvent): Promise<void> {
  await (await dbPromise).put('events', event);
}

/** Toutes les entrées, y compris supprimées : pour l'export. */
export async function allEvents(): Promise<AppEvent[]> {
  return (await dbPromise).getAllFromIndex('events', 'at');
}

export async function saveActiveFeed(feed: ActiveFeed | null): Promise<void> {
  const db = await dbPromise;
  if (feed) await db.put('kv', feed, 'activeFeed');
  else await db.delete('kv', 'activeFeed');
}

/** Enregistre la tétée terminée et efface le chrono dans une même transaction. */
export async function commitFeed(event: AppEvent): Promise<void> {
  const tx = (await dbPromise).transaction(['events', 'kv'], 'readwrite');
  await Promise.all([tx.objectStore('events').put(event), tx.objectStore('kv').delete('activeFeed'), tx.done]);
}

export async function saveSettings(settings: Settings): Promise<void> {
  await (await dbPromise).put('kv', settings, 'settings');
}

/** Demande au navigateur de ne pas effacer les données en cas de manque d'espace. */
export async function requestPersistence(): Promise<boolean> {
  if (!navigator.storage?.persist) return false;
  if (await navigator.storage.persisted()) return true;
  return navigator.storage.persist();
}
