import { TAGS, isFeed, type Entry, type Tag } from '../model';
import { HOUR, MINUTE, addDays, isInDay } from './time';

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

/** Une journée en chiffres : saisies par étiquette, repas, lait donné au biberon. */
export interface DayStats {
  day: number;
  counts: DaySummary;
  /** Saisies avec une tétée ou un biberon (une tétée complétée d'un biberon compte pour un repas). */
  meals: number;
  ml: number;
  /** Nombre de saisies : 0 = rien de noté ce jour-là. */
  total: number;
}

export function dayStats(entries: Entry[], dayStart: number): DayStats {
  const list = entriesOfDay(entries, dayStart);
  return {
    day: dayStart,
    counts: summarizeDay(entries, dayStart),
    meals: list.filter(isFeed).length,
    ml: list.reduce((sum, e) => sum + (e.tags.includes('bottle') ? (e.ml ?? 0) : 0), 0),
    total: list.length,
  };
}

/** Moyennes par jour (repas, lait, et chaque étiquette). */
export type DayAverage = Record<Tag | 'meals' | 'ml', number>;

export interface WeekStats {
  /** Les 7 derniers jours, du plus récent (aujourd'hui) au plus ancien. */
  days: DayStats[];
  /** Moyenne sur les jours terminés où quelque chose a été noté ; null s'il n'y en a pas. */
  average: DayAverage | null;
  /** Temps entre deux repas sur la semaine : moyenne et plus longue pause, null s'il n'y a pas assez de repas. */
  gaps: { mean: number; longest: number } | null;
}

// Au-delà, c'est sans doute un oubli de saisie plutôt qu'une vraie pause entre deux repas.
const MAX_GAP_MS = 12 * HOUR;

export function weekStats(entries: Entry[], today: number): WeekStats {
  const days = Array.from({ length: 7 }, (_, i) => dayStats(entries, addDays(today, -i)));
  const complete = days.slice(1).filter((d) => d.total > 0);
  const mean = (pick: (d: DayStats) => number) => complete.reduce((sum, d) => sum + pick(d), 0) / complete.length;
  const average = complete.length
    ? ({
        meals: mean((d) => d.meals),
        ml: mean((d) => d.ml),
        ...Object.fromEntries(TAGS.map((tag) => [tag, mean((d) => d.counts[tag])])),
      } as DayAverage)
    : null;

  const start = addDays(today, -6);
  const feeds = entries
    .filter((e) => e.deletedAt === null && isFeed(e) && e.at >= start && e.at < addDays(today, 1))
    .map((e) => e.at)
    .sort((a, b) => a - b);
  const spans = feeds.slice(1).map((t, i) => t - feeds[i]).filter((span) => span > 0 && span <= MAX_GAP_MS);
  const gaps = spans.length
    ? { mean: spans.reduce((a, b) => a + b, 0) / spans.length, longest: Math.max(...spans) }
    : null;

  return { days, average, gaps };
}
