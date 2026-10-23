// Modèle de données : une saisie = un instant + ce qui s'est passé (étiquettes).
// Pensé pour une synchronisation future : UUID, createdAt / updatedAt, suppression logique.

export const TAGS = ['feed', 'bottle', 'pee', 'poop'] as const;
export type Tag = (typeof TAGS)[number];

export const TAG_LABELS: Record<Tag, string> = { feed: 'Tétée', bottle: 'Biberon', pee: 'Pipi', poop: 'Caca' };
export const TAG_EMOJI: Record<Tag, string> = { feed: '🤱', bottle: '🍼', pee: '💧', poop: '💩' };

/** Une tétée ou un biberon : ce qui fait courir le délai jusqu'au prochain repas. */
export const FEED_TAGS: readonly Tag[] = ['feed', 'bottle'];
export const isFeed = (entry: Pick<Entry, 'tags'>): boolean => entry.tags.some((tag) => FEED_TAGS.includes(tag));

export interface Entry {
  id: string;
  /** Heure de la saisie, en ms depuis l'epoch. */
  at: number;
  /** Ce qui s'est passé, dans l'ordre de TAGS (ex. ['feed', 'pee']). */
  tags: Tag[];
  /** Biberon : volume donné, en ml. */
  ml?: number;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
}

export interface Settings {
  babyName: string;
  /** Le raccourci « Réveil tétée » est créé : l'app le lance directement. */
  alarmReady: boolean;
  /** Lancer le réveil à chaque tétée ou biberon validé. */
  autoAlarm: boolean;
  /** Volume proposé par défaut pour le prochain biberon. */
  lastBottleMl: number;
}

export const DEFAULT_SETTINGS: Settings = { babyName: '', alarmReady: false, autoAlarm: true, lastBottleMl: 90 };

/** Curseur du volume d'un biberon, en ml. */
export const BOTTLE_ML = { min: 10, max: 250, step: 10 };

export function uuid(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  // Repli pour les navigateurs anciens : UUID v4 à partir de getRandomValues.
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const hex = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Étiquettes sans doublon, toujours dans le même ordre. */
export const sortTags = (tags: Iterable<Tag>): Tag[] => {
  const set = new Set(tags);
  return TAGS.filter((tag) => set.has(tag));
};

/** Garde le volume seulement pour un biberon. */
export function withVolume<T extends Pick<Entry, 'tags'>>(entry: T, ml: number | undefined): T & { ml?: number } {
  const { ml: _previous, ...rest } = entry as T & { ml?: number };
  return entry.tags.includes('bottle') && ml ? { ...(rest as T), ml } : (rest as T);
}

export function createEntry(tags: Iterable<Tag>, at: number, ml?: number, now = Date.now()): Entry {
  return withVolume({ id: uuid(), at, tags: sortTags(tags), createdAt: now, updatedAt: now, deletedAt: null }, ml);
}

/** « Tétée, biberon 90 ml, pipi » */
export function describeEntry(entry: Pick<Entry, 'tags' | 'ml'>): string {
  const text = entry.tags
    .map((tag) => (tag === 'bottle' && entry.ml ? `biberon ${entry.ml} ml` : TAG_LABELS[tag].toLowerCase()))
    .join(', ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function legacyTags(record: Record<string, unknown>): Tag[] {
  switch (record.type) {
    case 'breast':
      return ['feed'];
    case 'bottle':
      return ['bottle'];
    case 'diaper':
      return TAGS.filter((tag) => (tag === 'pee' && record.pee) || (tag === 'poop' && record.poop));
    default:
      return [];
  }
}

/**
 * Convertit une saisie de la première version (tétée chronométrée, biberon en ml,
 * couche) en saisie étiquetée. Renvoie null pour un enregistrement inconnu.
 */
export function fromLegacy(record: Record<string, unknown>): Entry | null {
  if (Array.isArray(record.tags)) return record as unknown as Entry;
  const tags = legacyTags(record);
  if (!tags.length || typeof record.id !== 'string' || typeof record.at !== 'number') return null;
  const entry: Entry = {
    id: record.id,
    at: record.at,
    tags,
    createdAt: Number(record.createdAt ?? record.at),
    updatedAt: Number(record.updatedAt ?? record.at),
    deletedAt: record.deletedAt == null ? null : Number(record.deletedAt),
  };
  return withVolume(entry, typeof record.ml === 'number' ? record.ml : undefined);
}
