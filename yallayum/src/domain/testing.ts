// Fabriques de données pour les tests du socle métier.

import type { HalalClaim, OpeningHours, Restaurant, WeeklyRange } from './types';

let seq = 0;

export function everyDay(opens: string, closes: string): WeeklyRange[] {
  return ([1, 2, 3, 4, 5, 6, 7] as const).map((day) => ({ day, opens, closes }));
}

export function hours(weekly: WeeklyRange[], verifiedAt = '2026-09-01', special: OpeningHours['special'] = []): OpeningHours {
  return { weekly, special, verifiedAt, source: 'team_phone' };
}

export function claim(overrides: Partial<HalalClaim> = {}): HalalClaim {
  return {
    id: `c${++seq}`,
    kind: 'establishment_declaration',
    scope: 'whole_menu',
    method: 'email',
    evidenceDate: '2026-06-01',
    reviewStatus: 'approved',
    ...overrides,
  };
}

export function restaurant(overrides: Partial<Restaurant> = {}): Restaurant {
  const id = overrides.id ?? `r${++seq}`;
  return {
    id,
    slug: overrides.slug ?? id,
    name: `Restaurant ${id}`,
    description: 'Une adresse de test avec une description suffisamment longue pour compter comme renseignée.',
    publication: 'published',
    operating: 'operating',
    location: { lat: 48.8674, lng: 2.3636 },
    address: { street: '1 rue de Test', postcode: '75011', city: 'Paris', district: 'Paris 11e', country: 'FR' },
    timezone: 'Europe/Paris',
    cuisines: ['libanaise'],
    occasions: [],
    amenities: [],
    alcohol: 'unknown',
    price: { level: 2 },
    hours: hours(everyDay('12:00', '23:00')),
    contact: {},
    media: [],
    halalClaims: [claim()],
    editorialPick: false,
    publishedAt: '2026-01-01',
    updatedAt: '2026-09-01',
    version: 1,
    ...overrides,
  };
}

/** Instant correspondant à une heure locale de Paris (CET/CEST pris en compte). */
export function parisTime(date: string, time: string): Date {
  const guess = new Date(`${date}T${time}:00Z`);
  // Décalage de Paris à cette date : on corrige jusqu'à retomber sur l'heure murale voulue.
  for (const offset of [1, 2]) {
    const d = new Date(guess.getTime() - offset * 3_600_000);
    const local = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d);
    if (local === time) return d;
  }
  throw new Error(`Heure introuvable : ${date} ${time}`);
}
