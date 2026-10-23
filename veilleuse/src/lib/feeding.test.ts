import { describe, expect, it } from 'vitest';
import {
  LONG_FEED_MS,
  feedTimes,
  finishFeed,
  isLongFeed,
  isPaused,
  pauseFeed,
  resumeFeed,
  startFeed,
  suggestedSide,
  switchSide,
} from './feeding';

const T0 = Date.UTC(2026, 9, 21, 2, 0, 0); // 21/10/2026, 04:00 à Paris
const min = (n: number) => n * 60_000;

describe('chrono de tétée', () => {
  it('compte le temps sur le sein de départ', () => {
    const feed = startFeed('L', T0, 'id');
    expect(feedTimes(feed, T0 + min(7))).toEqual({
      leftMs: min(7),
      rightMs: 0,
      totalMs: min(7),
      currentMs: min(7),
      pausedMs: 0,
    });
  });

  it("se recalcule à partir des horodatages, sans dépendre d'une minuterie", () => {
    // Simule une app fermée 25 min : l'état persisté suffit à retrouver le temps exact.
    const persisted = JSON.parse(JSON.stringify(startFeed('R', T0, 'id')));
    expect(feedTimes(persisted, T0 + min(25)).rightMs).toBe(min(25));
  });

  it('changer de sein arrête le premier et lance le second', () => {
    let feed = startFeed('L', T0, 'id');
    feed = switchSide(feed, T0 + min(10));
    expect(feed.side).toBe('R');
    expect(feed.sides).toEqual(['L', 'R']);
    const t = feedTimes(feed, T0 + min(16));
    expect(t.leftMs).toBe(min(10));
    expect(t.rightMs).toBe(min(6));
    expect(t.currentMs).toBe(min(6));
    expect(t.totalMs).toBe(min(16));
  });

  it('cumule les allers-retours entre les seins', () => {
    let feed = startFeed('L', T0, 'id');
    feed = switchSide(feed, T0 + min(5)); // G 5
    feed = switchSide(feed, T0 + min(12)); // D 7
    const t = feedTimes(feed, T0 + min(15)); // G +3
    expect(feed.sides).toEqual(['L', 'R', 'L']);
    expect(t.leftMs).toBe(min(8));
    expect(t.rightMs).toBe(min(7));
    expect(t.currentMs).toBe(min(8));
  });

  it("la pause n'est comptée sur aucun sein", () => {
    let feed = startFeed('L', T0, 'id');
    feed = pauseFeed(feed, T0 + min(8));
    expect(isPaused(feed)).toBe(true);
    expect(feedTimes(feed, T0 + min(12))).toMatchObject({ leftMs: min(8), totalMs: min(8), pausedMs: min(4) });
    feed = resumeFeed(feed, T0 + min(12));
    expect(isPaused(feed)).toBe(false);
    expect(feedTimes(feed, T0 + min(15))).toMatchObject({ leftMs: min(11), pausedMs: 0 });
  });

  it('pause et reprise répétées sont sans effet', () => {
    let feed = startFeed('L', T0, 'id');
    feed = pauseFeed(feed, T0 + min(3));
    expect(pauseFeed(feed, T0 + min(5))).toBe(feed);
    feed = resumeFeed(feed, T0 + min(6));
    expect(resumeFeed(feed, T0 + min(7))).toBe(feed);
  });

  it('changer de sein pendant une pause reprend sur le nouveau sein', () => {
    let feed = startFeed('L', T0, 'id');
    feed = pauseFeed(feed, T0 + min(10)); // rot
    feed = switchSide(feed, T0 + min(13));
    expect(isPaused(feed)).toBe(false);
    const t = feedTimes(feed, T0 + min(20));
    expect(t.leftMs).toBe(min(10));
    expect(t.rightMs).toBe(min(7));
  });

  it('ignore une horloge remise en arrière', () => {
    const feed = startFeed('L', T0, 'id');
    expect(feedTimes(feed, T0 - min(5)).totalMs).toBe(0);
  });

  it('terminer enregistre seins, durées par sein, durée totale et heure de début', () => {
    let feed = startFeed('R', T0, 'id');
    feed = switchSide(feed, T0 + min(9));
    feed = pauseFeed(feed, T0 + min(14));
    expect(finishFeed(feed, T0 + min(30))).toEqual({
      type: 'breast',
      at: T0,
      sides: ['R', 'L'],
      leftMs: min(5),
      rightMs: min(9),
      durationMs: min(14),
    });
  });

  it('signale une tétée de plus de 60 min (oubli d’arrêt)', () => {
    const feed = startFeed('L', T0, 'id');
    expect(isLongFeed(feed, T0 + LONG_FEED_MS)).toBe(false);
    expect(isLongFeed(feed, T0 + LONG_FEED_MS + 1000)).toBe(true);
    // Le temps en pause ne compte pas.
    expect(isLongFeed(pauseFeed(feed, T0 + min(20)), T0 + min(120))).toBe(false);
  });
});

describe('sein suggéré', () => {
  it("propose l'opposé du dernier sein de la tétée la plus récente", () => {
    const feeds = [
      { at: T0 + min(180), sides: ['L' as const, 'R' as const] },
      { at: T0, sides: ['L' as const] },
    ];
    expect(suggestedSide(feeds)).toBe('L');
    expect(suggestedSide([{ at: T0, sides: ['R'] }])).toBe('L');
    expect(suggestedSide([{ at: T0, sides: ['L'] }])).toBe('R');
  });

  it('ne propose rien sans tétée', () => {
    expect(suggestedSide([])).toBeNull();
  });
});
