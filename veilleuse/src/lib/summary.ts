import type { AppEvent } from '../model';
import { isInDay } from './time';

export interface DaySummary {
  /** Tétées au sein. */
  feeds: number;
  breastMs: number;
  bottles: number;
  bottleMl: number;
  diapers: number;
  pees: number;
  poops: number;
}

/** Événements non supprimés d'une journée, du plus récent au plus ancien. */
export function eventsOfDay<T extends AppEvent>(events: T[], dayStart: number): T[] {
  return events.filter((e) => e.deletedAt === null && isInDay(e.at, dayStart)).sort((a, b) => b.at - a.at);
}

/** Résumé d'une journée. Une tétée compte pour le jour où elle a commencé. */
export function summarizeDay(events: AppEvent[], dayStart: number): DaySummary {
  const summary: DaySummary = { feeds: 0, breastMs: 0, bottles: 0, bottleMl: 0, diapers: 0, pees: 0, poops: 0 };
  for (const e of eventsOfDay(events, dayStart)) {
    if (e.type === 'breast') {
      summary.feeds++;
      summary.breastMs += e.durationMs;
    } else if (e.type === 'bottle') {
      summary.bottles++;
      summary.bottleMl += e.ml;
    } else {
      summary.diapers++;
      if (e.pee) summary.pees++;
      if (e.poop) summary.poops++;
    }
  }
  return summary;
}
