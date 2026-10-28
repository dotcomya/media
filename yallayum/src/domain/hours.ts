// Horaires d'ouverture : « ouvert maintenant », plages après minuit, exceptions.
//
// Règles :
// - tout calcul se fait à l'heure locale de l'établissement (son fuseau), pas
//   à celle du téléphone ;
// - une plage dont la fermeture est ≤ à l'ouverture traverse minuit et
//   appartient au jour où elle commence (vendredi 18:00 → 02:00 couvre samedi 01:30) ;
// - une exception datée remplace les plages qui commencent ce jour-là, pas le
//   débordement de la veille ;
// - une fiche non publiée, fermée définitivement ou déménagée n'est jamais
//   « ouverte », quels que soient ses horaires ;
// - sans horaires, l'état est « inconnu » : jamais « ouvert » par défaut.

import type { ISODate, OpeningHours, Restaurant, TimeRange, Weekday } from './types';

export type OpenState = 'open' | 'closed' | 'unknown';

/** confirmed : vérifiés récemment ; stale : anciens ; none : aucun horaire. */
export type HoursConfidence = 'confirmed' | 'stale' | 'none';

export type ClosedReason =
  | 'permanently_closed'
  | 'moved'
  | 'temporarily_closed'
  | 'not_published'
  | 'special_day'
  | 'outside_hours';

export interface OpenStatus {
  state: OpenState;
  confidence: HoursConfidence;
  reason?: ClosedReason;
  /** Heure locale de fermeture, si ouvert. */
  closesAt?: string;
  /** Ferme dans moins de `closingSoonMinutes`. */
  closingSoon?: boolean;
  /** Prochaine ouverture, si fermé : décalage en jours et heure locale. */
  nextOpening?: { dayOffset: number; time: string };
  /** Libellé court prêt à afficher. */
  label: string;
}

export interface HoursConfig {
  /** Au-delà, des horaires sont « à confirmer ». */
  staleAfterDays: number;
  closingSoonMinutes: number;
}

export const DEFAULT_HOURS_CONFIG: HoursConfig = { staleAfterDays: 180, closingSoonMinutes: 30 };

export interface LocalClock {
  date: ISODate;
  weekday: Weekday;
  /** Minutes écoulées depuis minuit, heure locale. */
  minutes: number;
}

const WEEKDAY_EN: Record<string, Weekday> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

/** Date, jour et minute locale d'un instant dans un fuseau donné (changements d'heure compris). */
export function localClock(instant: Date, timeZone: string): LocalClock {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
    hourCycle: 'h23',
  }).formatToParts(instant);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    weekday: WEEKDAY_EN[get('weekday')],
    minutes: Number(get('hour')) * 60 + Number(get('minute')),
  };
}

/**
 * Instant correspondant à une heure murale dans un fuseau (« samedi 00:30 à
 * Paris »). Essaie les décalages possibles et garde celui qui retombe juste.
 */
export function zonedInstant(date: ISODate, time: string, timeZone: string): Date {
  const base = Date.parse(`${date}T${time}:00Z`);
  for (let offsetMin = -14 * 60; offsetMin <= 14 * 60; offsetMin += 15) {
    const candidate = new Date(base - offsetMin * 60_000);
    const c = localClock(candidate, timeZone);
    if (c.date === date && c.minutes === parseTime(time)) return candidate;
  }
  // Heure inexistante (passage à l'heure d'été) : on prend la minute suivante valide.
  return new Date(base);
}

export function addDays(date: ISODate, days: number): ISODate {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export function weekdayOf(date: ISODate): Weekday {
  const [y, m, d] = date.split('-').map(Number);
  const js = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return (js === 0 ? 7 : js) as Weekday;
}

export function daysBetween(from: ISODate, to: ISODate): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

/** '18:30' → 1110 ; '24:00' → 1440. */
export function parseTime(hm: string): number {
  const [h, m] = hm.split(':').map(Number);
  return h * 60 + m;
}

export function formatTime(minutes: number): string {
  const m = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** Plages qui commencent ce jour-là, en minutes depuis son minuit (la fin peut dépasser 1440). */
export function rangesStartingOn(hours: OpeningHours, date: ISODate): [number, number][] {
  const special = hours.special.find((s) => s.date === date);
  let ranges: TimeRange[];
  if (special) {
    ranges = special.closed ? [] : (special.ranges ?? []);
  } else {
    const day = weekdayOf(date);
    ranges = hours.weekly.filter((r) => r.day === day);
  }
  return ranges
    .map((r): [number, number] => {
      const start = parseTime(r.opens);
      let end = parseTime(r.closes);
      if (end <= start) end += 1440;
      return [start, end];
    })
    .sort((a, b) => a[0] - b[0]);
}

/**
 * Plages en minutes relatives au minuit de `date`, de la veille (débordements)
 * jusqu'à `daysAhead` jours plus tard.
 */
function timeline(hours: OpeningHours, date: ISODate, daysAhead: number): [number, number][] {
  const out: [number, number][] = [];
  for (let offset = -1; offset <= daysAhead; offset++) {
    for (const [s, e] of rangesStartingOn(hours, addDays(date, offset))) {
      out.push([s + offset * 1440, e + offset * 1440]);
    }
  }
  return out.sort((a, b) => a[0] - b[0]);
}

/**
 * Ouvert à cette minute locale de cette date ? (sans tenir compte du statut de la fiche)
 * `minutes` peut dépasser 1440 pour viser la nuit suivante (1500 = 01:00 le lendemain).
 */
export function isOpenAt(hours: OpeningHours, date: ISODate, minutes: number): boolean {
  return timeline(hours, date, 1).some(([s, e]) => minutes >= s && minutes < e);
}

export function hoursConfidence(hours: OpeningHours | undefined, today: ISODate, cfg: HoursConfig = DEFAULT_HOURS_CONFIG): HoursConfidence {
  if (!hours || (hours.weekly.length === 0 && hours.special.length === 0)) return 'none';
  if (!hours.verifiedAt) return 'stale';
  return daysBetween(hours.verifiedAt, today) <= cfg.staleAfterDays ? 'confirmed' : 'stale';
}

const DAY_NAMES = ['', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];

function dayWord(offset: number, date: ISODate): string {
  if (offset === 0) return '';
  if (offset === 1) return 'demain ';
  return `${DAY_NAMES[weekdayOf(addDays(date, offset))]} `;
}

type StatusInput = Pick<Restaurant, 'hours' | 'operating' | 'publication' | 'timezone' | 'temporarilyClosedUntil'>;

export function openStatus(r: StatusInput, now: Date, cfg: HoursConfig = DEFAULT_HOURS_CONFIG): OpenStatus {
  const clock = localClock(now, r.timezone);
  const confidence = hoursConfidence(r.hours, clock.date, cfg);

  if (r.publication !== 'published') {
    return { state: 'closed', confidence, reason: 'not_published', label: 'Fiche indisponible' };
  }
  if (r.operating === 'permanently_closed') {
    return { state: 'closed', confidence, reason: 'permanently_closed', label: 'Fermé définitivement' };
  }
  if (r.operating === 'moved') {
    return { state: 'closed', confidence, reason: 'moved', label: 'A déménagé' };
  }
  if (r.operating === 'temporarily_closed' && (!r.temporarilyClosedUntil || r.temporarilyClosedUntil >= clock.date)) {
    const until = r.temporarilyClosedUntil ? ` jusqu'au ${formatShortDate(r.temporarilyClosedUntil)}` : '';
    return { state: 'closed', confidence, reason: 'temporarily_closed', label: `Fermé temporairement${until}` };
  }
  if (!r.hours || confidence === 'none') {
    return { state: 'unknown', confidence: 'none', label: 'Horaires non renseignés' };
  }

  const ranges = timeline(r.hours, clock.date, 7);
  const current = ranges.find(([s, e]) => clock.minutes >= s && clock.minutes < e);
  const suffix = confidence === 'stale' ? ' · à confirmer' : '';

  if (current) {
    // Plages contiguës (12:00–15:00 puis 15:00–23:00) : on annonce la vraie fermeture.
    let end = current[1];
    for (const [s, e] of ranges) if (s <= end && e > end) end = e;
    const left = end - clock.minutes;
    const closingSoon = left <= cfg.closingSoonMinutes;
    const closesAt = formatTime(end);
    return {
      state: 'open',
      confidence,
      closesAt,
      closingSoon,
      label: `${closingSoon ? 'Ferme bientôt' : 'Ouvert'} · jusqu'à ${closesAt}${suffix}`,
    };
  }

  const next = ranges.find(([s]) => s > clock.minutes);
  const special = r.hours.special.find((s) => s.date === clock.date);
  const reason: ClosedReason = special ? 'special_day' : 'outside_hours';
  if (!next) {
    return { state: 'closed', confidence, reason, label: `Fermé${suffix}` };
  }
  const dayOffset = Math.floor(next[0] / 1440);
  const time = formatTime(next[0]);
  const why = special?.label ? ` (${special.label.toLowerCase()})` : '';
  return {
    state: 'closed',
    confidence,
    reason,
    nextOpening: { dayOffset, time },
    label: `Fermé${why} · ouvre ${dayWord(dayOffset, clock.date)}à ${time}${suffix}`,
  };
}

const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

export function formatShortDate(date: ISODate): string {
  const [, m, d] = date.split('-').map(Number);
  return `${d === 1 ? '1er' : d} ${MONTHS[m - 1]}`;
}

export interface WeekRow {
  day: Weekday;
  label: string;
  text: string;
  isToday: boolean;
}

const DAY_LABELS = ['', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

/** Tableau de la semaine pour la fiche, en commençant par lundi. */
export function weekTable(hours: OpeningHours, today: Weekday): WeekRow[] {
  return ([1, 2, 3, 4, 5, 6, 7] as Weekday[]).map((day) => {
    const ranges = hours.weekly.filter((r) => r.day === day).sort((a, b) => parseTime(a.opens) - parseTime(b.opens));
    const text = ranges.length ? ranges.map((r) => `${r.opens}–${r.closes}`).join(', ') : 'Fermé';
    return { day, label: DAY_LABELS[day], text, isToday: day === today };
  });
}

/** Exceptions à venir dans les `withinDays` prochains jours. */
export function upcomingExceptions(hours: OpeningHours, today: ISODate, withinDays = 14) {
  return hours.special
    .filter((s) => s.date >= today && daysBetween(today, s.date) <= withinDays)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((s) => ({
      date: s.date,
      label: s.label ?? 'Horaires exceptionnels',
      text: s.closed ? 'Fermé' : (s.ranges ?? []).map((r) => `${r.opens}–${r.closes}`).join(', '),
    }));
}
