import { describe, expect, it } from 'vitest';
import { formatAgo, formatClock, formatDayTitle } from './format';
import { addDays, startOfDay } from './time';

const min = (n: number) => n * 60_000;

describe('formats', () => {
  it('temps écoulé, lisible d’un coup d’œil', () => {
    expect(formatAgo(min(0.5))).toBe("à l'instant");
    expect(formatAgo(min(40))).toBe('il y a 40 min');
    expect(formatAgo(min(130))).toBe('il y a 2 h 10');
    expect(formatAgo(min(125))).toBe('il y a 2 h 05');
    expect(formatAgo(min(180))).toBe('il y a 3 h');
    expect(formatAgo(min(60 * 28))).toBe('il y a 1 j 4 h');
  });

  it('heures en 24 h', () => {
    expect(formatClock(new Date(2026, 9, 21, 3, 7).getTime())).toBe('03:07');
    expect(formatClock(new Date(2026, 9, 21, 22, 45).getTime())).toBe('22:45');
  });

  it('titres de journée', () => {
    const now = new Date(2026, 9, 21, 15, 0).getTime();
    const today = startOfDay(now);
    expect(formatDayTitle(today, now)).toBe("Aujourd'hui");
    expect(formatDayTitle(addDays(today, -1), now)).toBe('Hier');
    expect(formatDayTitle(addDays(today, -2), now)).toBe('Lundi 19 octobre');
  });
});
