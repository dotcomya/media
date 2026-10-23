import { TAGS, isFeed, type Entry, type Tag } from '../model';
import { HOUR, MINUTE, isInDay } from './time';

/** Délai conseillé entre deux repas (tétée ou biberon). */
export const FEED_INTERVAL_MS = 2 * HOUR + 30 * MINUTE;

/** Nombre de saisies de la journée contenant chaque étiquette. */
export type DaySummary = Record<Tag, number>;

/** Saisies non supprimées d'une journée, de la plus récente à la plus ancienne. */
export function entriesOfDay(entries: Entry[], dayStart: number): Entry[] {
  return entries.filter((e) => e.deletedAt === null && isInDay(e.at, dayStart)).sort((a, b) => b.at - a.at);
}

export function summarizeDay(entries: Entry[], dayStart: number): DaySummary {
  const summary = Object.fromEntries(TAGS.map((tag) => [tag, 0])) as DaySummary;
  for (const entry of entriesOfDay(entries, dayStart)) for (const tag of entry.tags) summary[tag]++;
  return summary;
}

/** Heure de la dernière saisie de chaque étiquette, tous jours confondus. */
export function lastByTag(entries: Entry[]): Partial<Record<Tag, number>> {
  const last: Partial<Record<Tag, number>> = {};
  for (const entry of entries) {
    if (entry.deletedAt !== null) continue;
    for (const tag of entry.tags) if ((last[tag] ?? -Infinity) < entry.at) last[tag] = entry.at;
  }
  return last;
}

export interface NextFeed {
  /** Dernier repas (tétée ou biberon). */
  last: Entry;
  /** Heure prévue du prochain : dernier repas + 2 h 30. */
  at: number;
}

export function nextFeed(entries: Entry[], interval = FEED_INTERVAL_MS): NextFeed | null {
  let last: Entry | null = null;
  for (const entry of entries) {
    if (entry.deletedAt === null && isFeed(entry) && (!last || entry.at > last.at)) last = entry;
  }
  return last && { last, at: last.at + interval };
}

/** Pour chaque repas, le temps écoulé depuis le repas précédent (id → ms). */
export function feedGaps(entries: Entry[]): Map<string, number> {
  const feeds = entries.filter((e) => e.deletedAt === null && isFeed(e)).sort((a, b) => a.at - b.at);
  return new Map(feeds.slice(1).map((feed, i) => [feed.id, feed.at - feeds[i].at]));
}
