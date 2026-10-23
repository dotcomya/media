// État de l'app : un objet unique en mémoire, recopié en IndexedDB à chaque action.
// L'interface est mise à jour immédiatement ; l'écriture en base suit en tâche de fond.

import { useEffect, useState } from 'preact/hooks';
import * as db from './db';
import { formatClock } from './lib/format';
import { vibrate } from './lib/haptics';
import { DEFAULT_SETTINGS, createEntry, sortTags, type Entry, type Settings, type Tag } from './model';

export interface Toast {
  id: number;
  message: string;
  undo?: () => void;
}

interface State {
  ready: boolean;
  /** Saisies non supprimées. */
  entries: Entry[];
  settings: Settings;
  toast: Toast | null;
  /** Le navigateur s'est-il engagé à conserver les données ? null = inconnu. */
  persisted: boolean | null;
}

let state: State = { ready: false, entries: [], settings: DEFAULT_SETTINGS, toast: null, persisted: null };
/** Aperçu de démonstration : données d'exemple en mémoire, rien n'est enregistré. */
let demo = false;
const listeners = new Set<() => void>();

function setState(patch: Partial<State>): void {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener());
}

export function useAppState(): State {
  const [, setTick] = useState(0);
  const rendered = state;
  useEffect(() => {
    const listener = () => setTick((n) => n + 1);
    listeners.add(listener);
    // L'état a pu changer entre le rendu et l'abonnement (base lue très vite depuis le cache).
    if (state !== rendered) listener();
    return () => listeners.delete(listener);
  }, []);
  return state;
}

export async function init(): Promise<void> {
  try {
    setState({ ...(await db.loadAll()), ready: true });
  } catch (error) {
    console.error(error);
    setState({ ready: true });
    showToast('Stockage indisponible : les données ne seront pas gardées');
    return;
  }
  setState({ persisted: await db.requestPersistence().catch(() => false) });
}

/** Lance l'app sur des données d'exemple, sans rien lire ni écrire sur le téléphone. */
export function initDemo(entries: Entry[], settings: Settings): void {
  demo = true;
  setState({ entries, settings, ready: true });
}

function persist(write: () => Promise<unknown>): void {
  if (demo) return;
  write().catch((error) => {
    console.error(error);
    showToast("Échec de l'enregistrement sur le téléphone");
  });
}

// --- Toast « Ajouté · Annuler » --------------------------------------------

const TOAST_MS = 5000;
let toastSeq = 0;
let toastTimer: ReturnType<typeof setTimeout> | undefined;

export function showToast(message: string, undo?: () => void): void {
  clearTimeout(toastTimer);
  const toast = { id: ++toastSeq, message, undo };
  setState({ toast });
  toastTimer = setTimeout(() => {
    if (state.toast?.id === toast.id) setState({ toast: null });
  }, TOAST_MS);
}

export function undoToast(): void {
  const undo = state.toast?.undo;
  setState({ toast: null });
  undo?.();
  vibrate();
}

// --- Saisies --------------------------------------------------------------

function upsert(entry: Entry): void {
  const others = state.entries.filter((e) => e.id !== entry.id);
  setState({ entries: entry.deletedAt === null ? [...others, entry] : others });
  persist(() => db.putEntry(entry));
}

function softDelete(entry: Entry): void {
  const now = Date.now();
  upsert({ ...entry, deletedAt: now, updatedAt: now });
}

/** Enregistre ce qui a été coché, horodaté maintenant. */
export function addEntry(tags: Tag[], at = Date.now()): void {
  const entry = createEntry(tags, at);
  upsert(entry);
  vibrate([15, 40, 15]);
  showToast(`Ajouté à ${formatClock(at)}`, () => softDelete(entry));
}

export function saveEntry(entry: Entry): void {
  upsert({ ...entry, tags: sortTags(entry.tags), updatedAt: Date.now() });
  vibrate();
  showToast('Modifié');
}

export function deleteEntry(entry: Entry): void {
  softDelete(entry);
  vibrate();
  showToast('Supprimé', () => upsert({ ...entry, deletedAt: null, updatedAt: Date.now() }));
}

// --- Réglages -------------------------------------------------------------

export function updateSettings(patch: Partial<Settings>): void {
  const settings = { ...state.settings, ...patch };
  setState({ settings });
  persist(() => db.saveSettings(settings));
}
