// Synchronisation entre les téléphones des parents. Chaque téléphone garde tout en local
// (l'app marche hors ligne) ; il envoie ses changements et reçoit ceux de l'autre, au
// démarrage, toutes les 20 s quand l'app est ouverte, au retour du réseau et après chaque saisie.

import * as db from '../db';
import type { Entry } from '../model';
import { newerRemote } from './merge';
import { pullEntries, pushEntries, syncAvailable } from './remote';

export type SyncStatus = 'off' | 'syncing' | 'ok' | 'offline' | 'error';

export interface SyncHooks {
  /** Saisies reçues de l'autre téléphone (déjà écrites en local). */
  onChanges: (entries: Entry[]) => void;
  onStatus: (status: SyncStatus, family: string | null, lastSyncAt: number | null) => void;
}

const POLL_MS = 20_000;
const SAVE_DELAY_MS = 800;
const PAGE = 500;
// On relit 5 s en arrière : une écriture validée un peu en retard sur le serveur n'est pas perdue.
const OVERLAP_MS = 5_000;

let hooks: SyncHooks | null = null;
let state: db.SyncState = { family: null, cursor: null };
let lastSyncAt: number | null = null;
let running: Promise<void> | null = null;
let again = false;
let saveTimer: ReturnType<typeof setTimeout> | undefined;

export const isSharing = (): boolean => syncAvailable && state.family !== null;

function report(status: SyncStatus): void {
  hooks?.onStatus(isSharing() ? status : 'off', state.family, lastSyncAt);
}

export async function startSync(syncHooks: SyncHooks): Promise<void> {
  hooks = syncHooks;
  if (!syncAvailable) return report('off');
  state = await db.getSyncState();
  report('ok');
  const syncIfVisible = () => document.visibilityState === 'visible' && void syncNow();
  window.addEventListener('online', () => void syncNow());
  document.addEventListener('visibilitychange', syncIfVisible);
  setInterval(syncIfVisible, POLL_MS);
  void syncNow();
}

/** Après une saisie locale : envoi groupé un instant plus tard. */
export function scheduleSync(): void {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => void syncNow(), SAVE_DELAY_MS);
}

export function syncNow(): Promise<void> {
  if (!isSharing()) return Promise.resolve();
  if (running) {
    again = true;
    return running;
  }
  running = run().finally(() => {
    running = null;
    if (again) {
      again = false;
      void syncNow();
    }
  });
  return running;
}

async function run(): Promise<void> {
  const family = state.family!;
  if (!navigator.onLine) return report('offline');
  report('syncing');
  try {
    // 1. Envoyer ce qui a changé ici.
    const outbox = await db.getOutbox();
    if (Object.keys(outbox).length) {
      const all = new Map((await db.allEntries()).map((e) => [e.id, e]));
      const toSend = Object.keys(outbox).flatMap((id) => all.get(id) ?? []);
      for (let i = 0; i < toSend.length; i += PAGE) await pushEntries(family, toSend.slice(i, i + PAGE));
      await db.clearOutbox(outbox);
    }

    // 2. Recevoir ce qui a changé ailleurs.
    let since = state.cursor ? new Date(Date.parse(state.cursor) - OVERLAP_MS).toISOString() : null;
    let latest = state.cursor;
    const received: Entry[] = [];
    for (;;) {
      const page = await pullEntries(family, since, PAGE);
      received.push(...page.entries);
      if (page.last && (!latest || page.last > latest)) latest = page.last;
      if (page.entries.length < PAGE) break;
      since = page.last;
    }
    const local = new Map((await db.allEntries()).map((e) => [e.id, e]));
    const changed = newerRemote(local, received);
    if (changed.length) {
      await db.putEntries(changed);
      hooks?.onChanges(changed);
    }
    if (latest !== state.cursor && state.family === family) {
      state = { family, cursor: latest };
      await db.saveSyncState(state);
    }
    lastSyncAt = Date.now();
    report('ok');
  } catch (error) {
    console.error(error);
    report(navigator.onLine ? 'error' : 'offline');
  }
}

/** Rejoint (ou crée) un partage : tout ce qui est déjà sur ce téléphone est envoyé. */
export async function joinFamily(family: string): Promise<void> {
  state = { family, cursor: null };
  await db.saveSyncState(state);
  await db.queueAll(await db.allEntries());
  await syncNow();
}

/** Arrête le partage sur ce téléphone ; ses données restent. */
export async function leaveFamily(): Promise<void> {
  state = { family: null, cursor: null };
  lastSyncAt = null;
  await db.saveSyncState(state);
  report('off');
}
