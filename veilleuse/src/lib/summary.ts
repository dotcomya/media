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

/**
 * Pour chaque saisie, l'heure du prochain repas à ce moment-là : dernier repas
 * (tétée ou biberon) jusqu'à cette saisie incluse, + 2 h 30. id → ms.
 */
export function nextFeedByEntry(entries: Entry[], interval = FEED_INTERVAL_MS): Map<string, number> {
  const result = new Map<string, number>();
  let lastFeedAt: number | null = null;
  for (const entry of entries.filter((e) => e.deletedAt === null).sort((a, b) => a.at - b.at)) {
    if (isFeed(entry)) lastFeedAt = entry.at;
    if (lastFeedAt !== null) result.set(entry.id, lastFeedAt + interval);
  }
  return result;
}
