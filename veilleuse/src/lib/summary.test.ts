import { describe, expect, it } from 'vitest';
import { createEntry, type Entry } from '../model';
import { entriesOfDay, lastByTag, summarizeDay } from './summary';
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

describe('dernière fois, par étiquette', () => {
  it('prend la saisie la plus récente de chaque étiquette, tous jours confondus', () => {
    const entries = [
      createEntry(['feed', 'pee'], at(20, 22, 0)),
      createEntry(['feed'], at(21, 3, 0)),
      { ...createEntry(['feed'], at(21, 4, 0)), deletedAt: at(21, 4, 1) }, // supprimée
      createEntry(['poop'], at(19, 8, 0)),
    ];
    expect(lastByTag(entries)).toEqual({ feed: at(21, 3, 0), pee: at(20, 22, 0), poop: at(19, 8, 0) });
  });
});
