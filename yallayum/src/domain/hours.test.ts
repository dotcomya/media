import { describe, expect, it } from 'vitest';
import { localClock, openStatus, weekTable } from './hours';
import { everyDay, hours, parisTime, restaurant } from './testing';

describe('Horaires', () => {
  it('Le calcul se fait au fuseau de l’établissement, changement d’heure compris', () => {
    // Dimanche 26 octobre 2025, 02:30 à Paris : heure d'hiver retrouvée.
    const c = localClock(new Date('2026-03-29T01:30:00Z'), 'Europe/Paris');
    expect(c.minutes).toBe(3 * 60 + 30);
    const r = restaurant({ timezone: 'America/New_York', hours: hours(everyDay('12:00', '22:00')) });
    // 20:00 à Paris = 15:00 à New York → ouvert.
    expect(openStatus(r, parisTime('2026-10-27', '20:00')).state).toBe('open');
  });

  it('Une exception « fermé » remplace la journée, mais pas le débordement de la veille', () => {
    const r = restaurant({
      hours: hours([{ day: 5, opens: '18:00', closes: '02:00' }, { day: 6, opens: '18:00', closes: '02:00' }], '2026-09-01', [
        { date: '2026-10-31', closed: true, label: 'Congés' },
      ]),
    });
    expect(openStatus(r, parisTime('2026-10-31', '01:00')).state).toBe('open');
    const evening = openStatus(r, parisTime('2026-10-31', '20:00'));
    expect(evening.state).toBe('closed');
    expect(evening.reason).toBe('special_day');
  });

  it('Sans horaires : « inconnu », jamais « ouvert »', () => {
    const s = openStatus(restaurant({ hours: undefined }), parisTime('2026-10-27', '20:00'));
    expect(s.state).toBe('unknown');
    expect(s.label).toBe('Horaires non renseignés');
  });

  it('Horaires anciens : ouvert, mais « à confirmer »', () => {
    const r = restaurant({ hours: hours(everyDay('12:00', '23:00'), '2025-01-01') });
    const s = openStatus(r, parisTime('2026-10-27', '20:00'));
    expect(s.confidence).toBe('stale');
    expect(s.label).toContain('à confirmer');
  });

  it('Prochaine ouverture : « ouvre demain à 12:00 »', () => {
    const r = restaurant({ hours: hours(everyDay('12:00', '15:00')) });
    expect(openStatus(r, parisTime('2026-10-27', '20:00')).label).toBe('Fermé · ouvre demain à 12:00');
  });

  it('Fermeture temporaire datée', () => {
    const r = restaurant({ operating: 'temporarily_closed', temporarilyClosedUntil: '2026-11-03' });
    expect(openStatus(r, parisTime('2026-10-27', '20:00')).label).toBe("Fermé temporairement jusqu'au 3 nov.");
  });

  it('Tableau de la semaine, du lundi au dimanche', () => {
    const rows = weekTable(hours([{ day: 1, opens: '12:00', closes: '14:30' }, { day: 1, opens: '19:00', closes: '23:00' }]), 1);
    expect(rows[0]).toMatchObject({ label: 'Lundi', text: '12:00–14:30, 19:00–23:00', isToday: true });
    expect(rows[6].text).toBe('Fermé');
  });
});
