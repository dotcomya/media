import { openDB, type DBSchema } from 'idb';
import { DEFAULT_SETTINGS, createEntry, fromLegacy, type Entry, type Settings } from './model';

interface Schema extends DBSchema {
  events: { key: string; value: Entry; indexes: { at: number; updatedAt: number } };
  kv: { key: string; value: unknown };
}

// Ouverte au premier accès seulement (l'aperçu de démonstration n'y touche jamais).
let dbPromise: ReturnType<typeof openDB<Schema>> | undefined;
const getDb = () => (dbPromise ??= openDB<Schema>('veilleuse', 2, {
  async upgrade(db, oldVersion, _newVersion, tx) {
    if (oldVersion < 1) {
      const events = db.createObjectStore('events', { keyPath: 'id' });
      events.createIndex('at', 'at');
      // Servira à la synchronisation : « tout ce qui a changé depuis… ».
      events.createIndex('updatedAt', 'updatedAt');
      db.createObjectStore('kv');
      return;
    }
    if (oldVersion < 2) {
      // Version 1 : tétées chronométrées, biberons en ml, couches → saisies étiquetées.
      const events = tx.objectStore('events');
      let cursor = await events.openCursor();
      while (cursor) {
        const entry = fromLegacy(cursor.value as unknown as Record<string, unknown>);
        await (entry ? cursor.update(entry) : cursor.delete());
        cursor = await cursor.continue();
      }
      // Une tétée en cours devient une saisie « Tétée » à son heure de début.
      const kv = tx.objectStore('kv');
      const feed = (await kv.get('activeFeed')) as { startedAt?: number } | undefined;
      if (feed?.startedAt) await events.put(createEntry(['feed'], feed.startedAt));
      await kv.delete('activeFeed');
    }
  },
}));

export interface Snapshot {
  entries: Entry[];
  settings: Settings;
}

/** Charge tout : quelques milliers de saisies au plus, cela tient sans peine en mémoire. */
export async function loadAll(): Promise<Snapshot> {
  const db = await getDb();
  const [entries, settings] = await Promise.all([db.getAllFromIndex('events', 'at'), db.get('kv', 'settings')]);
  return {
    entries: entries.filter((e) => e.deletedAt === null),
    settings: { ...DEFAULT_SETTINGS, ...(settings as Partial<Settings> | undefined) },
  };
}

/**
 * Écrit une saisie (création, modification ou suppression logique). Avec `outbox`,
 * la note aussi, dans la même transaction, comme « à envoyer » à l'autre téléphone.
 */
export async function putEntry(entry: Entry, outbox = false): Promise<void> {
  const tx = (await getDb()).transaction(['events', 'kv'], 'readwrite');
  const writes: Promise<unknown>[] = [tx.objectStore('events').put(entry)];
  if (outbox) {
    const kv = tx.objectStore('kv');
    const pending = ((await kv.get('outbox')) as Outbox | undefined) ?? {};
    writes.push(kv.put({ ...pending, [entry.id]: entry.updatedAt }, 'outbox'));
  }
  await Promise.all([...writes, tx.done]);
}

/** Saisies reçues de l'autre téléphone. */
export async function putEntries(entries: Entry[]): Promise<void> {
  const tx = (await getDb()).transaction('events', 'readwrite');
  await Promise.all([...entries.map((e) => tx.store.put(e)), tx.done]);
}

/** Saisies à envoyer : id → updatedAt de la version à envoyer. */
export type Outbox = Record<string, number>;

export async function getOutbox(): Promise<Outbox> {
  return (((await getDb()).get('kv', 'outbox')) as Promise<Outbox | undefined>).then((o) => o ?? {});
}

/** Met toutes ces saisies dans la file d'envoi (au moment de rejoindre un partage). */
export async function queueAll(entries: Entry[]): Promise<void> {
  const tx = (await getDb()).transaction('kv', 'readwrite');
  const pending = ((await tx.store.get('outbox')) as Outbox | undefined) ?? {};
  for (const e of entries) pending[e.id] = e.updatedAt;
  await Promise.all([tx.store.put(pending, 'outbox'), tx.done]);
}

/** Retire de la file les versions envoyées (une saisie modifiée entre-temps y reste). */
export async function clearOutbox(sent: Outbox): Promise<void> {
  const tx = (await getDb()).transaction('kv', 'readwrite');
  const pending = ((await tx.store.get('outbox')) as Outbox | undefined) ?? {};
  for (const [id, updatedAt] of Object.entries(sent)) if (pending[id] === updatedAt) delete pending[id];
  await Promise.all([tx.store.put(pending, 'outbox'), tx.done]);
}

export interface SyncState {
  /** Code famille partagé par les deux parents ; null = pas de partage sur ce téléphone. */
  family: string | null;
  /** Repère serveur de la dernière réception. */
  cursor: string | null;
}

export async function getSyncState(): Promise<SyncState> {
  const saved = (await (await getDb()).get('kv', 'sync')) as SyncState | undefined;
  return saved ?? { family: null, cursor: null };
}

export async function saveSyncState(state: SyncState): Promise<void> {
  await (await getDb()).put('kv', state, 'sync');
}

/** Toutes les saisies, y compris supprimées : pour l'export. */
export async function allEntries(): Promise<Entry[]> {
  return (await getDb()).getAllFromIndex('events', 'at');
}

export async function saveSettings(settings: Settings): Promise<void> {
  await (await getDb()).put('kv', settings, 'settings');
}

/** Demande au navigateur de ne pas effacer les données en cas de manque d'espace. */
export async function requestPersistence(): Promise<boolean> {
  if (!navigator.storage?.persist) return false;
  if (await navigator.storage.persisted()) return true;
  return navigator.storage.persist();
}
