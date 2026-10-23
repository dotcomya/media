// Logique pure du chrono de tétée. Aucune minuterie ici : l'état ne contient
// que des horodatages, persistés en base, et le temps écoulé se recalcule à
// partir de « maintenant ». Le chrono reste donc exact si l'app est fermée,
// mise en arrière-plan ou si le téléphone est verrouillé.

import { breastData, type BreastEvent, type Side } from '../model';

export interface ActiveFeed {
  id: string;
  startedAt: number;
  /** Sein en cours. */
  side: Side;
  /** Seins utilisés dans l'ordre (deux entrées consécutives ne sont jamais identiques). */
  sides: Side[];
  /** Début du segment en cours sur `side` ; null pendant une pause. */
  segmentStart: number | null;
  pausedAt: number | null;
  /** Temps cumulé des segments terminés, par sein. */
  leftMs: number;
  rightMs: number;
}

export interface FeedTimes {
  leftMs: number;
  rightMs: number;
  totalMs: number;
  /** Temps cumulé sur le sein en cours. */
  currentMs: number;
  /** Durée de la pause en cours (0 si pas en pause). */
  pausedMs: number;
}

/** Au-delà, on propose d'ajuster la durée à la fin (oubli d'arrêt du chrono). */
export const LONG_FEED_MS = 60 * 60_000;

export const otherSide = (side: Side): Side => (side === 'L' ? 'R' : 'L');

export const isPaused = (feed: ActiveFeed): boolean => feed.segmentStart === null;

export function startFeed(side: Side, now: number, id: string): ActiveFeed {
  return { id, startedAt: now, side, sides: [side], segmentStart: now, pausedAt: null, leftMs: 0, rightMs: 0 };
}

/** Ajoute le segment en cours au cumul de son sein et arrête le comptage. */
function closeSegment(feed: ActiveFeed, now: number): ActiveFeed {
  if (feed.segmentStart === null) return feed;
  // max(0) : protège contre une horloge du téléphone remise en arrière.
  const ms = Math.max(0, now - feed.segmentStart);
  return {
    ...feed,
    segmentStart: null,
    leftMs: feed.leftMs + (feed.side === 'L' ? ms : 0),
    rightMs: feed.rightMs + (feed.side === 'R' ? ms : 0),
  };
}

export function pauseFeed(feed: ActiveFeed, now: number): ActiveFeed {
  if (isPaused(feed)) return feed;
  return { ...closeSegment(feed, now), pausedAt: now };
}

export function resumeFeed(feed: ActiveFeed, now: number): ActiveFeed {
  if (!isPaused(feed)) return feed;
  return { ...feed, segmentStart: now, pausedAt: null };
}

/** Arrête le sein en cours et démarre l'autre (reprend aussi après une pause). */
export function switchSide(feed: ActiveFeed, now: number): ActiveFeed {
  const side = otherSide(feed.side);
  const closed = closeSegment(feed, now);
  return { ...closed, side, sides: [...closed.sides, side], segmentStart: now, pausedAt: null };
}

export function feedTimes(feed: ActiveFeed, now: number): FeedTimes {
  const running = feed.segmentStart === null ? 0 : Math.max(0, now - feed.segmentStart);
  const leftMs = feed.leftMs + (feed.side === 'L' ? running : 0);
  const rightMs = feed.rightMs + (feed.side === 'R' ? running : 0);
  return {
    leftMs,
    rightMs,
    totalMs: leftMs + rightMs,
    currentMs: feed.side === 'L' ? leftMs : rightMs,
    pausedMs: feed.pausedAt === null ? 0 : Math.max(0, now - feed.pausedAt),
  };
}

export const isLongFeed = (feed: ActiveFeed, now: number): boolean => feedTimes(feed, now).totalMs > LONG_FEED_MS;

/** Données de la tétée terminée : seins utilisés, durée par sein, durée totale, heure de début. */
export function finishFeed(feed: ActiveFeed, now: number): Omit<BreastEvent, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'> {
  const { leftMs, rightMs } = feedTimes(feed, now);
  return { ...breastData(feed.sides, leftMs, rightMs), at: feed.startedAt };
}

/** Sein à proposer : l'opposé du dernier sein donné lors de la tétée la plus récente. */
export function suggestedSide(feeds: Pick<BreastEvent, 'at' | 'sides'>[]): Side | null {
  let latest: Pick<BreastEvent, 'at' | 'sides'> | null = null;
  for (const feed of feeds) if (!latest || feed.at > latest.at) latest = feed;
  const last = latest?.sides[latest.sides.length - 1];
  return last ? otherSide(last) : null;
}
