import { describe, expect, it } from 'vitest';
import { createEntry, type Entry } from '../model';
import { FEED_INTERVAL_MS, dayStats, entriesOfDay, nextFeedByEntry, summarizeDay, weekStats } from './summary';
import { addDays, startOfDay } from './time';

// Les tests tournent en Europe/Paris (vite.config.ts).
const at = (day: number, h: number, m = 0) => new Date(2026, 9, day, h, m).getTime();
const day21 = startOfDay(at(21, 12));

describe('résumé journalier', () => {
  const entries: Entry[] = [
    createEntry(['feed'], at(20, 23, 50)), // veille
    createEntry(['feed', 'pee'], at(21, 0, 0)), // minuit pile : inclus
    createEntry(['feed'], at(21, 3, 15)),
    createEntry(['bottle'], at(21, 6, 0)),
    createEntry(['pee', 'poop'], at(21, 13, 0)), // pipi et caca cochés ensemble
    createEntry(['bottle', 'poop'], at(21, 18, 30)),
    createEntry(['pee'], at(21, 23, 59)),
    createEntry(['pee'], at(22, 0, 0)), // lendemain
  ];

  it('compte les saisies de la journée par étiquette', () => {
    expect(summarizeDay(entries, day21)).toEqual({ feed: 2, bottle: 2, pee: 3, poop: 2 });
  });

  it('ignore les saisies supprimées', () => {
    const deleted = { ...createEntry(['bottle'], at(21, 10, 0)), deletedAt: at(21, 10, 5) };
    expect(summarizeDay([...entries, deleted], day21).bottle).toBe(2);
  });

  it('renvoie des zéros pour une journée vide', () => {
    expect(summarizeDay(entries, addDays(day21, 5))).toEqual({ feed: 0, bottle: 0, pee: 0, poop: 0 });
  });

  it('gère le jour de 25 h du passage à l’heure d’hiver', () => {
    // Dimanche 25/10/2026 : 3 h redevient 2 h, la journée dure 25 h.
    const day25 = startOfDay(at(25, 12));
    expect(addDays(day25, 1) - day25).toBe(25 * 3_600_000);
    const late = createEntry(['pee'], at(25, 23, 30));
    expect(summarizeDay([late], day25).pee).toBe(1);
    expect(summarizeDay([late], addDays(day25, 1)).pee).toBe(0);
  });

  it('liste les saisies du jour de la plus récente à la plus ancienne', () => {
    const list = entriesOfDay(entries, day21);
    expect(list).toHaveLength(6);
    expect(list[0].at).toBe(at(21, 23, 59));
    expect(list[5].at).toBe(at(21, 0, 0));
  });
});

describe('prochain repas, ligne par ligne', () => {
  it('chaque ligne affiche le dernier repas jusqu’à elle + 2 h 30', () => {
    const pee = createEntry(['pee'], at(21, 9, 0)); // avant tout repas : rien à afficher
    const feed = createEntry(['feed', 'pee'], at(21, 10, 0));
    const poop = createEntry(['poop'], at(21, 11, 15)); // une couche reprend le repas précédent
    const bottle = createEntry(['bottle'], at(21, 12, 40));
    const next = nextFeedByEntry([bottle, poop, feed, pee]);
    expect(next.has(pee.id)).toBe(false);
    expect(next.get(feed.id)).toBe(at(21, 12, 30));
    expect(next.get(poop.id)).toBe(at(21, 12, 30));
    expect(next.get(bottle.id)).toBe(at(21, 15, 10));
  });

  it('suit le délai de 2 h 30 et ignore les repas supprimés', () => {
    expect(FEED_INTERVAL_MS).toBe(150 * 60_000);
    const feed = createEntry(['feed'], at(21, 14, 0));
    const deleted = { ...createEntry(['bottle'], at(21, 15, 0)), deletedAt: at(21, 15, 1) };
    const pee = createEntry(['pee'], at(21, 15, 30));
    expect(nextFeedByEntry([feed, deleted, pee]).get(pee.id)).toBe(at(21, 16, 30));
  });

  it('enchaîne d’un jour à l’autre', () => {
    const lateFeed = createEntry(['feed'], at(20, 23, 0));
    const morningPee = createEntry(['pee'], at(21, 0, 30));
    expect(nextFeedByEntry([lateFeed, morningPee]).get(morningPee.id)).toBe(at(21, 1, 30));
  });
});

describe('temps entre deux repas réglable', () => {
  it('3 h au lieu de 2 h 30', () => {
    const feed = createEntry(['feed'], at(21, 14, 0));
    expect(nextFeedByEntry([feed], 180 * 60_000).get(feed.id)).toBe(at(21, 17, 0));
  });
});

describe('bilan du jour', () => {
  it('compte les repas (une tétée + biberon = un repas) et le lait donné', () => {
    const entries = [
      createEntry(['feed'], at(21, 1, 0)),
      createEntry(['feed', 'bottle'], at(21, 4, 0), 60), // tétée complétée d'un biberon
      createEntry(['bottle', 'pee'], at(21, 7, 0), 120),
      createEntry(['pee', 'poop'], at(21, 8, 0)),
    ];
    expect(dayStats(entries, day21)).toEqual({
      day: day21,
      counts: { feed: 2, bottle: 2, pee: 2, poop: 1 },
      meals: 3,
      ml: 180,
      total: 4,
    });
  });
});

describe('bilan des 7 jours', () => {
  const today = day21;
  // Deux jours complets notés (19 et 20), un jour vide (18), et aujourd'hui en cours.
  const entries = [
    createEntry(['feed'], at(19, 2, 0)),
    createEntry(['bottle'], at(19, 5, 0), 90),
    createEntry(['pee'], at(19, 6, 0)),
    createEntry(['feed', 'pee'], at(20, 1, 0)),
    createEntry(['feed'], at(20, 4, 0)),
    createEntry(['bottle', 'poop'], at(20, 8, 0), 150),
    createEntry(['bottle'], at(21, 0, 30), 100),
    createEntry(['feed'], at(14, 3, 0)), // il y a 7 jours : hors bilan
  ];
  const week = weekStats(entries, today);

  it('liste 7 jours, aujourd’hui en premier', () => {
    expect(week.days.map((d) => d.day)).toEqual([0, 1, 2, 3, 4, 5, 6].map((i) => addDays(today, -i)));
    expect(week.days[0].meals).toBe(1);
    expect(week.days[3].total).toBe(0);
  });

  it('fait la moyenne sur les jours terminés et notés seulement', () => {
    expect(week.average).toEqual({ meals: 2.5, ml: 120, feed: 1.5, bottle: 1, pee: 1, poop: 0.5 });
  });

  it('mesure les pauses entre repas, en écartant les trous de plus de 12 h', () => {
    // Repas : 19 → 2 h, 5 h ; 20 → 1 h, 4 h, 8 h ; 21 → 0 h 30. Pauses : 3 h, (20 h), 3 h, 4 h, (16 h 30).
    expect(week.gaps).toEqual({ mean: (10 / 3) * 3_600_000, longest: 4 * 3_600_000 });
  });

  it('reste vide sans données', () => {
    expect(weekStats([], today)).toMatchObject({ average: null, gaps: null });
  });
});
