// État de l'app : un objet unique en mémoire, recopié en IndexedDB à chaque action.
// L'interface est mise à jour immédiatement ; l'écriture en base suit en tâche de fond.

import { useEffect, useState } from 'preact/hooks';
import * as db from './db';
import { formatClock } from './lib/format';
import { vibrate } from './lib/haptics';
import {
  DEFAULT_SETTINGS,
  PROFILE_ID,
  createEntry,
  isEntry,
  profileFrom,
  sortTags,
  tidyEntry,
  uuid,
  type Entry,
  type FeedDetails,
  type Item,
  type Profile,
  type Settings,
  type Side,
  type Tag,
  type Weight,
} from './model';
import { isSharing, scheduleSync, startSync, type SyncStatus } from './sync/engine';

export interface Toast {
  id: number;
  message: string;
  undo?: () => void;
}

interface State {
  ready: boolean;
  /** Saisies non supprimées. */
  entries: Entry[];
  /** Pesées non supprimées. */
  weights: Weight[];
  /** Le bébé (partagé entre les deux téléphones) ; à défaut, tiré des anciens réglages. */
  profile: Profile;
  /** Profil réellement enregistré (null tant que personne ne l'a modifié). */
  savedProfile: Profile | null;
  settings: Settings;
  toast: Toast | null;
  /** Le navigateur s'est-il engagé à conserver les données ? null = inconnu. */
  persisted: boolean | null;
  /** Partage avec l'autre parent. */
  sync: { status: SyncStatus; family: string | null; lastSyncAt: number | null };
}

let state: State = {
  ready: false,
  entries: [],
  weights: [],
  profile: profileFrom(null, DEFAULT_SETTINGS),
  savedProfile: null,
  settings: DEFAULT_SETTINGS,
  toast: null,
  persisted: null,
  sync: { status: 'off', family: null, lastSyncAt: null },
};
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
    const snapshot = await db.loadAll();
    setState({ ...snapshot, profile: profileFrom(snapshot.savedProfile, snapshot.settings), ready: true });
  } catch (error) {
    console.error(error);
    setState({ ready: true });
    showToast('Stockage indisponible : les données ne seront pas gardées');
    return;
  }
  void startSync({
    onChanges: applyRemote,
    onStatus: (status, family, lastSyncAt) => setState({ sync: { status, family, lastSyncAt } }),
  });
  setState({ persisted: await db.requestPersistence().catch(() => false) });
}

/** Remplace nos versions par celles reçues (ou retire les supprimées). */
function merged<T extends Item>(current: T[], changed: T[]): T[] {
  const ids = new Set(changed.map((item) => item.id));
  return [...current.filter((item) => !ids.has(item.id)), ...changed.filter((item) => item.deletedAt === null)];
}

/** Reçu de l'autre parent : saisies, pesées, profil. */
function applyRemote(changed: Item[]): void {
  const savedProfile = changed.find((item): item is Profile => item.kind === 'profile') ?? state.savedProfile;
  setState({
    entries: merged(state.entries, changed.filter(isEntry)),
    weights: merged(state.weights, changed.filter((item): item is Weight => item.kind === 'weight')),
    savedProfile,
    profile: profileFrom(savedProfile, state.settings),
  });
}

/** Lance l'app sur des données d'exemple, sans rien lire ni écrire sur le téléphone. */
export function initDemo(entries: Entry[], settings: Settings, weights: Weight[] = [], savedProfile: Profile | null = null): void {
  demo = true;
  setState({ entries, weights, settings, savedProfile, profile: profileFrom(savedProfile, settings), ready: true });
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

/** Écrit un élément ici (et dans la file d'envoi si le partage est actif). */
function upsertItem(item: Item): void {
  if (item.kind === 'profile') setState({ savedProfile: item, profile: item });
  else if (item.kind === 'weight') setState({ weights: merged(state.weights, [item]) });
  else setState({ entries: merged(state.entries, [item]) });
  const sharing = isSharing();
  persist(() => db.putItem(item, sharing));
  if (sharing) scheduleSync();
}

const upsert = (entry: Entry): void => upsertItem(entry);

function softDelete<T extends Entry | Weight>(item: T): void {
  const now = Date.now();
  upsertItem({ ...item, deletedAt: now, updatedAt: now });
}

export interface EntryDetails extends FeedDetails {
  /** Biberon : volume en ml. */
  ml?: number;
}

/** Enregistre ce qui a été coché (volume d'un biberon, sein et durée d'une tétée), à l'heure donnée. */
export function addEntry(tags: Tag[], details: EntryDetails = {}, at = Date.now()): Entry {
  const { ml, ...feed } = details;
  const entry = createEntry(tags, at, ml, Date.now(), feed);
  upsert(entry);
  if (entry.ml) updateSettings({ lastBottleMl: entry.ml });
  vibrate([15, 40, 15]);
  showToast(`Ajouté à ${formatClock(at)}`, () => softDelete(entry));
  return entry;
}

export function saveEntry(entry: Entry): void {
  const tags = sortTags(entry.tags);
  upsert(tidyEntry({ ...entry, tags, updatedAt: Date.now() }));
  vibrate();
  showToast('Modifié');
}

export function deleteEntry(entry: Entry): void {
  softDelete(entry);
  vibrate();
  showToast('Supprimé', () => upsert({ ...entry, deletedAt: null, updatedAt: Date.now() }));
}

// --- Tétée chronométrée (sur ce téléphone) --------------------------------

export function startFeed(tags: Tag[], sides: Side[], startedAt = Date.now()): void {
  vibrate(15);
  updateSettings({ activeFeed: { startedAt, sides, tags: sortTags([...tags, 'feed']) } });
}

export function setFeedSides(sides: Side[]): void {
  if (state.settings.activeFeed) updateSettings({ activeFeed: { ...state.settings.activeFeed, sides } });
}

export function cancelFeed(): void {
  const active = state.settings.activeFeed;
  if (!active) return;
  updateSettings({ activeFeed: null });
  showToast('Chrono annulé', () => updateSettings({ activeFeed: active }));
}

/** Arrête le chrono : la tétée est ajoutée à son heure de début, avec sa durée. */
export function finishFeed(): Entry | null {
  const active = state.settings.activeFeed;
  if (!active) return null;
  const durationMin = Math.max(1, Math.round((Date.now() - active.startedAt) / 60_000));
  updateSettings({ activeFeed: null });
  return addEntry(active.tags, { sides: active.sides, durationMin }, active.startedAt);
}

// --- Poids ------------------------------------------------------------------

export function addWeight(grams: number, at: number): void {
  const now = Date.now();
  const weight: Weight = { kind: 'weight', id: uuid(), at, grams, createdAt: now, updatedAt: now, deletedAt: null };
  upsertItem(weight);
  vibrate([15, 40, 15]);
  showToast('Poids ajouté', () => softDelete(weight));
}

export function saveWeight(weight: Weight): void {
  upsertItem({ ...weight, updatedAt: Date.now() });
  showToast('Poids modifié');
}

export function deleteWeight(weight: Weight): void {
  softDelete(weight);
  showToast('Poids supprimé', () => upsertItem({ ...weight, deletedAt: null, updatedAt: Date.now() }));
}

// --- Bébé (partagé) -------------------------------------------------------

export function updateProfile(patch: Partial<Pick<Profile, 'babyName' | 'birthDate' | 'sex' | 'feedIntervalMin'>>): void {
  const now = Date.now();
  upsertItem({ ...state.profile, ...patch, id: PROFILE_ID, createdAt: state.profile.createdAt || now, updatedAt: now });
}

// --- Réglages -------------------------------------------------------------

export function updateSettings(patch: Partial<Settings>): void {
  const settings = { ...state.settings, ...patch };
  setState({ settings });
  persist(() => db.saveSettings(settings));
}
