// Modèle de données : une saisie = un instant + ce qui s'est passé (étiquettes).
// Pensé pour une synchronisation future : UUID, createdAt / updatedAt, suppression logique.

export const TAGS = ['feed', 'bottle', 'pee', 'poop'] as const;
export type Tag = (typeof TAGS)[number];

export const TAG_LABELS: Record<Tag, string> = { feed: 'Tétée', bottle: 'Biberon', pee: 'Pipi', poop: 'Caca' };
export const TAG_EMOJI: Record<Tag, string> = { feed: '🤱', bottle: '🍼', pee: '💧', poop: '💩' };

/** Une tétée ou un biberon : ce qui fait courir le délai jusqu'au prochain repas. */
export const FEED_TAGS: readonly Tag[] = ['feed', 'bottle'];
export const isFeed = (entry: Pick<Entry, 'tags'>): boolean => entry.tags.some((tag) => FEED_TAGS.includes(tag));

export const SIDES = ['left', 'right'] as const;
/** Sein donné pendant une tétée. */
export type Side = (typeof SIDES)[number];
export const SIDE_LABELS: Record<Side, string> = { left: 'Gauche', right: 'Droit' };
export const SIDE_SHORT: Record<Side, string> = { left: 'G', right: 'D' };

/** Détails facultatifs d'une tétée. */
export interface FeedDetails {
  sides?: Side[];
  /** Tétée chronométrée : durée en minutes. */
  durationMin?: number;
}

export interface Entry extends FeedDetails {
  /** Les saisies n'ont pas de « kind » (contrairement aux poids et au profil, rangés au même endroit). */
  kind?: undefined;
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

/** Une pesée. */
export interface Weight {
  kind: 'weight';
  id: string;
  /** Date de la pesée, en ms depuis l'epoch. */
  at: number;
  grams: number;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
}

export type Sex = 'girl' | 'boy';
export const SEX_LABELS: Record<Sex, string> = { girl: 'Fille', boy: 'Garçon' };

/** Le bébé, partagé entre les deux téléphones : prénom, naissance, sexe (pour les courbes), rythme des repas. */
export interface Profile {
  kind: 'profile';
  id: typeof PROFILE_ID;
  babyName: string;
  /** « 2026-10-01 » ; null tant qu'elle n'est pas renseignée. */
  birthDate: string | null;
  sex: Sex | null;
  /** Temps entre deux repas, en minutes : sert à afficher le prochain repas et à régler le réveil. */
  feedIntervalMin: number;
  createdAt: number;
  updatedAt: number;
  deletedAt: null;
}

export const PROFILE_ID = 'profile' as const;

/** Tout ce qui est enregistré et synchronisé. */
export type Item = Entry | Weight | Profile;
export const isEntry = (item: Item): item is Entry => item.kind === undefined;

/** Tétée en cours, chronométrée sur ce téléphone. */
export interface ActiveFeed {
  startedAt: number;
  sides: Side[];
  /** Autres étiquettes cochées avec la tétée (ex. pipi). */
  tags: Tag[];
}

export interface Settings {
  /** Ancien emplacement du prénom, repris tant que le profil partagé n'existe pas. */
  babyName: string;
  /** Le raccourci « Réveil tétée » est créé : l'app le lance directement. */
  alarmReady: boolean;
  /** Lancer le réveil à chaque tétée ou biberon validé. */
  autoAlarm: boolean;
  /** Volume proposé par défaut pour le prochain biberon. */
  lastBottleMl: number;
  /** Ancien emplacement du temps entre deux repas (voir Profile). */
  feedIntervalMin: number;
  /** Fin du dernier minuteur lancé depuis ce téléphone (l'app ne peut pas l'arrêter elle-même). */
  timerUntil: number | null;
  activeFeed: ActiveFeed | null;
}

export const DEFAULT_SETTINGS: Settings = {
  babyName: '',
  alarmReady: false,
  autoAlarm: true,
  lastBottleMl: 90,
  feedIntervalMin: 150,
  timerUntil: null,
  activeFeed: null,
};

/** Profil effectif : celui enregistré, sinon les anciens réglages de ce téléphone. */
export function profileFrom(saved: Profile | null, settings: Settings): Profile {
  return (
    saved ?? {
      kind: 'profile',
      id: PROFILE_ID,
      babyName: settings.babyName,
      birthDate: null,
      sex: null,
      feedIntervalMin: settings.feedIntervalMin,
      createdAt: 0,
      // 0 : n'importe quel profil reçu de l'autre téléphone l'emporte.
      updatedAt: 0,
      deletedAt: null,
    }
  );
}

/** Choix proposés pour le temps entre deux repas, en minutes. */
export const FEED_INTERVALS_MIN = [120, 150, 180, 210, 240];

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

export const sortSides = (sides: Iterable<Side>): Side[] => {
  const set = new Set(sides);
  return SIDES.filter((side) => set.has(side));
};

/** Garde le volume seulement pour un biberon, le sein et la durée seulement pour une tétée. */
export function tidyEntry(entry: Entry): Entry {
  const { ml, sides, durationMin, ...rest } = entry;
  const result: Entry = rest;
  if (entry.tags.includes('bottle') && ml) result.ml = ml;
  if (entry.tags.includes('feed')) {
    const kept = sortSides(sides ?? []);
    if (kept.length) result.sides = kept;
    if (durationMin && durationMin > 0) result.durationMin = Math.round(durationMin);
  }
  return result;
}

export function createEntry(tags: Iterable<Tag>, at: number, ml?: number, now = Date.now(), feed: FeedDetails = {}): Entry {
  return tidyEntry({ id: uuid(), at, tags: sortTags(tags), ml, ...feed, createdAt: now, updatedAt: now, deletedAt: null });
}

/** « G 12′ » sous l'emoji de la tétée ; vide sans détail. */
export function feedBadge(entry: FeedDetails): string {
  const sides = (entry.sides ?? []).map((side) => SIDE_SHORT[side]).join('');
  return [sides, entry.durationMin ? `${entry.durationMin}′` : ''].filter(Boolean).join(' ');
}

/** « Tétée (gauche, 12 min), biberon 90 ml, pipi » */
export function describeEntry(entry: Pick<Entry, 'tags' | 'ml' | 'sides' | 'durationMin'>): string {
  const feed = () => {
    const sides = (entry.sides ?? []).map((side) => SIDE_LABELS[side].toLowerCase()).join(' et ');
    const details = [sides, entry.durationMin ? `${entry.durationMin} min` : ''].filter(Boolean).join(', ');
    return details ? `tétée (${details})` : 'tétée';
  };
  const text = entry.tags
    .map((tag) =>
      tag === 'feed' ? feed() : tag === 'bottle' && entry.ml ? `biberon ${entry.ml} ml` : TAG_LABELS[tag].toLowerCase(),
    )
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
  return tidyEntry({ ...entry, ml: typeof record.ml === 'number' ? record.ml : undefined });
}
