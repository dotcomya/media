import { describe, expect, it } from 'vitest';
import { breastData, createEvent, type AppEvent } from '../model';
import { eventsOfDay, summarizeDay } from './summary';
import { addDays, startOfDay } from './time';

const min = (n: number) => n * 60_000;
// Les tests tournent en Europe/Paris (vite.config.ts).
const at = (day: number, h: number, m = 0) => new Date(2026, 9, day, h, m).getTime();
const day21 = startOfDay(at(21, 12));

const breast = (ts: number, l: number, r: number): AppEvent =>
  createEvent(breastData(r && l ? ['L', 'R'] : l ? ['L'] : ['R'], min(l), min(r)), ts);
const bottle = (ts: number, ml: number): AppEvent => createEvent({ type: 'bottle', ml }, ts);
const diaper = (ts: number, pee: boolean, poop: boolean): AppEvent => createEvent({ type: 'diaper', pee, poop }, ts);

describe('résumé journalier', () => {
  const events: AppEvent[] = [
    breast(at(20, 23, 50), 10, 10), // veille : exclue même si elle déborde sur minuit
    breast(at(21, 0, 0), 12, 8), // minuit pile : incluse
    breast(at(21, 3, 15), 15, 0),
    bottle(at(21, 6, 0), 90),
    bottle(at(21, 18, 30), 120),
    diaper(at(21, 7, 0), true, false),
    diaper(at(21, 9, 0), false, true),
    diaper(at(21, 13, 0), true, true), // couche mixte : 1 pipi et 1 caca
    diaper(at(21, 23, 59), true, false),
    diaper(at(22, 0, 0), true, false), // lendemain
  ];

  it('compte tétées, temps au sein, biberons, pipis et cacas', () => {
    expect(summarizeDay(events, day21)).toEqual({
      feeds: 2,
      breastMs: min(35),
      bottles: 2,
      bottleMl: 210,
      diapers: 4,
      pees: 3,
      poops: 2,
    });
  });

  it('ignore les entrées supprimées', () => {
    const deleted = { ...bottle(at(21, 10, 0), 150), deletedAt: at(21, 10, 5) };
    expect(summarizeDay([...events, deleted], day21).bottleMl).toBe(210);
  });

  it('renvoie des zéros pour une journée vide', () => {
    expect(summarizeDay(events, addDays(day21, 5))).toEqual({
      feeds: 0,
      breastMs: 0,
      bottles: 0,
      bottleMl: 0,
      diapers: 0,
      pees: 0,
      poops: 0,
    });
  });

  it('gère le jour de 25 h du passage à l’heure d’hiver', () => {
    // Dimanche 25/10/2026 : 3 h redevient 2 h, la journée dure 25 h.
    const day25 = startOfDay(at(25, 12));
    expect(addDays(day25, 1) - day25).toBe(25 * 60 * min(1));
    const late = diaper(at(25, 23, 30), true, false);
    expect(summarizeDay([late], day25).pees).toBe(1);
    expect(summarizeDay([late], addDays(day25, 1)).pees).toBe(0);
  });

  it('liste les événements du jour du plus récent au plus ancien', () => {
    const list = eventsOfDay(events, day21);
    expect(list).toHaveLength(8);
    expect(list[0].at).toBe(at(21, 23, 59));
    expect(list[7].at).toBe(at(21, 0, 0));
  });
});
