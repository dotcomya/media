// État de l'app : un objet unique en mémoire, recopié en IndexedDB à chaque action.
// L'interface est mise à jour immédiatement ; l'écriture en base suit en tâche de fond.

import { useEffect, useState } from 'preact/hooks';
import * as db from './db';
import { finishFeed, isPaused, pauseFeed, resumeFeed, startFeed, switchSide, type ActiveFeed } from './lib/feeding';
import { diaperLabel, formatDuration } from './lib/format';
import { vibrate } from './lib/haptics';
import {
  DEFAULT_SETTINGS,
  breastData,
  createEvent,
  uuid,
  type AppEvent,
  type BreastEvent,
  type EventData,
  type Settings,
  type Side,
} from './model';

export interface Toast {
  id: number;
  message: string;
  undo?: () => void;
}

interface State {
  ready: boolean;
  /** Événements non supprimés. */
  events: AppEvent[];
  activeFeed: ActiveFeed | null;
  settings: Settings;
  toast: Toast | null;
  /** Le navigateur s'est-il engagé à conserver les données ? null = inconnu. */
  persisted: boolean | null;
}

let state: State = {
  ready: false,
  events: [],
  activeFeed: null,
  settings: DEFAULT_SETTINGS,
  toast: null,
  persisted: null,
};
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

function persist(write: Promise<unknown>): void {
  write.catch((error) => {
    console.error(error);
    showToast("Échec de l'enregistrement sur le téléphone");
  });
}

// --- Toast « Enregistré · Annuler » ---------------------------------------

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

// --- Événements -----------------------------------------------------------

function upsert(event: AppEvent): void {
  const others = state.events.filter((e) => e.id !== event.id);
  setState({ events: event.deletedAt === null ? [...others, event] : others });
  persist(db.putEvent(event));
}

function softDelete(event: AppEvent): void {
  const now = Date.now();
  upsert({ ...event, deletedAt: now, updatedAt: now });
}

function restore(event: AppEvent): void {
  upsert({ ...event, deletedAt: null, updatedAt: Date.now() });
}

export function addEvent(data: EventData, at: number, message = 'Enregistré'): void {
  const event = createEvent(data, at) as AppEvent;
  upsert(event);
  vibrate();
  showToast(message, () => softDelete(event));
}

export function saveEvent(event: AppEvent): void {
  upsert({ ...event, updatedAt: Date.now() });
  vibrate();
  showToast('Modifié');
}

export function deleteEvent(event: AppEvent): void {
  softDelete(event);
  vibrate();
  showToast('Supprimé', () => restore(event));
}

export function logDiaper(pee: boolean, poop: boolean): void {
  addEvent({ type: 'diaper', pee, poop }, Date.now(), `${diaperLabel(pee, poop)} enregistré`);
}

export function logBottle(ml: number): void {
  addEvent({ type: 'bottle', ml }, Date.now(), `Biberon de ${ml} ml enregistré`);
  updateSettings({ lastBottleMl: ml });
}

// --- Tétée en cours -------------------------------------------------------

function setFeed(feed: ActiveFeed | null): void {
  setState({ activeFeed: feed });
  persist(db.saveActiveFeed(feed));
}

export function startFeedOn(side: Side): void {
  // Un « Annuler » encore affiché viserait la tétée précédente : on le retire.
  setState({ toast: null });
  setFeed(startFeed(side, Date.now(), uuid()));
  vibrate();
}

export function switchFeedSide(): void {
  if (!state.activeFeed) return;
  setFeed(switchSide(state.activeFeed, Date.now()));
  vibrate();
}

export function toggleFeedPause(): void {
  const feed = state.activeFeed;
  if (!feed) return;
  setFeed(isPaused(feed) ? resumeFeed(feed, Date.now()) : pauseFeed(feed, Date.now()));
  vibrate();
}

/** Termine la tétée. `durations` remplace les durées mesurées (chrono oublié). */
export function finishActiveFeed(durations?: { leftMs: number; rightMs: number }): void {
  const feed = state.activeFeed;
  if (!feed) return;
  const now = Date.now();
  let data = finishFeed(feed, now);
  if (durations) data = { ...data, ...breastData(data.sides, durations.leftMs, durations.rightMs) };
  const event: BreastEvent = { ...data, id: feed.id, createdAt: now, updatedAt: now, deletedAt: null };

  setState({ activeFeed: null, events: [...state.events, event] });
  persist(db.commitFeed(event));
  vibrate([20, 60, 20]);
  showToast(`Tétée enregistrée · ${formatDuration(event.durationMs)}`, () => {
    // La tétée n'était pas finie : on l'efface et le chrono reprend là où il en était.
    softDelete(event);
    setFeed(feed);
  });
}

export function discardActiveFeed(): void {
  const feed = state.activeFeed;
  if (!feed) return;
  setFeed(null);
  vibrate();
  showToast('Tétée abandonnée', () => setFeed(feed));
}

// --- Réglages -------------------------------------------------------------

export function updateSettings(patch: Partial<Settings>): void {
  const settings = { ...state.settings, ...patch };
  setState({ settings });
  persist(db.saveSettings(settings));
}
