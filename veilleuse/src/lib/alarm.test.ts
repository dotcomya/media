import { describe, expect, it } from 'vitest';
import { ALARM_SHORTCUT, alarmUrl } from './alarm';

describe('alarme iPhone', () => {
  it('lance le raccourci « Alarme tétée » avec l’heure du prochain repas', () => {
    const url = alarmUrl(new Date(2026, 9, 23, 21, 6).getTime());
    expect(url).toBe('shortcuts://run-shortcut?name=Alarme%20t%C3%A9t%C3%A9e&input=text&text=21%3A06');
    const parsed = new URL(url);
    expect(parsed.searchParams.get('name')).toBe(ALARM_SHORTCUT);
    expect(parsed.searchParams.get('text')).toBe('21:06');
  });
});
