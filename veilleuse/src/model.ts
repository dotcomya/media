// Modèle de données. Pensé pour une synchronisation future :
// UUID, createdAt / updatedAt sur chaque entrée, suppression logique (deletedAt).

export type Side = 'L' | 'R';

interface BaseEvent {
  id: string;
  /** Heure de l'événement (début pour une tétée), en ms depuis l'epoch. */
  at: number;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
}

export interface BreastEvent extends BaseEvent {
  type: 'breast';
  /** Seins utilisés dans l'ordre, ex. ['L', 'R'] ; le dernier élément est le dernier sein donné. */
  sides: Side[];
  leftMs: number;
  rightMs: number;
  /** Durée totale au sein, pauses exclues (= leftMs + rightMs). */
  durationMs: number;
}

export interface BottleEvent extends BaseEvent {
  type: 'bottle';
  ml: number;
}

export interface DiaperEvent extends BaseEvent {
  type: 'diaper';
  pee: boolean;
  poop: boolean;
}

export type AppEvent = BreastEvent | BottleEvent | DiaperEvent;
export type EventType = AppEvent['type'];

/** Champs propres à chaque type, sans les métadonnées. */
export type EventData =
  | Omit<BreastEvent, keyof BaseEvent>
  | Omit<BottleEvent, keyof BaseEvent>
  | Omit<DiaperEvent, keyof BaseEvent>;

export interface Settings {
  babyName: string;
  lastBottleMl: number;
}

export const DEFAULT_SETTINGS: Settings = { babyName: '', lastBottleMl: 60 };

export function uuid(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  // Repli pour les navigateurs anciens : UUID v4 à partir de getRandomValues.
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const hex = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Crée un événement complet à partir de ses données propres. */
export function createEvent<T extends EventData>(data: T, at: number, now = Date.now()): T & BaseEvent {
  return { ...data, id: uuid(), at, createdAt: now, updatedAt: now, deletedAt: null };
}

export function breastData(sides: Side[], leftMs: number, rightMs: number): Omit<BreastEvent, keyof BaseEvent> {
  return { type: 'breast', sides, leftMs, rightMs, durationMs: leftMs + rightMs };
}

export function lastSide(e: BreastEvent): Side | null {
  return e.sides[e.sides.length - 1] ?? null;
}
