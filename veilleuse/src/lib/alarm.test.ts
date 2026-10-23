import { describe, expect, it } from 'vitest';
import { ALARM_SHORTCUT, alarmUrl, minutesUntil } from './alarm';

const now = new Date(2026, 9, 23, 18, 36).getTime();
const min = (n: number) => n * 60_000;

describe('réveil iPhone', () => {
  it('lance le raccourci « Réveil tétée » avec les minutes jusqu’au prochain repas', () => {
    const url = alarmUrl(now + min(150), now);
    expect(url).toBe('shortcuts://run-shortcut?name=R%C3%A9veil%20t%C3%A9t%C3%A9e&input=text&text=150');
    const parsed = new URL(url);
    expect(parsed.searchParams.get('name')).toBe(ALARM_SHORTCUT);
    expect(parsed.searchParams.get('text')).toBe('150');
  });

  it('arrondit à la minute et ne descend jamais sous 1 minute', () => {
    expect(minutesUntil(now + min(42.6), now)).toBe(43);
    expect(minutesUntil(now - min(5), now)).toBe(1);
  });
});
