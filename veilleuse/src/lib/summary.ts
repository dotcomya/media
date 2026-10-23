import { TAGS, type Entry, type Tag } from '../model';
import { isInDay } from './time';

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
