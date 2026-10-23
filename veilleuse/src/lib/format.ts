// Formats d'affichage en français, heures en 24 h.

import { MINUTE, addDays, startOfDay } from './time';

const pad = (n: number): string => String(n).padStart(2, '0');

/** « 14:05 » */
export function formatClock(ts: number): string {
  const d = new Date(ts);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Durée lisible d'un coup d'œil : « 40 min », « 2 h 10 », « 3 h », « 1 j 4 h ». */
export function formatSpan(ms: number): string {
  const minutes = Math.floor(Math.max(0, ms) / MINUTE);
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h < 24) return m ? `${h} h ${pad(m)}` : `${h} h`;
  const days = Math.floor(h / 24);
  return h % 24 ? `${days} j ${h % 24} h` : `${days} j`;
}

/** « à l'instant », « il y a 40 min », « il y a 2 h 10 » */
export function formatAgo(ms: number): string {
  return ms < MINUTE ? "à l'instant" : `il y a ${formatSpan(ms)}`;
}

/** « maintenant », « dans 40 min », « dans 1 h 12 » */
export function formatIn(ms: number): string {
  return ms < MINUTE ? 'maintenant' : `dans ${formatSpan(ms)}`;
}

export const capitalize = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** « mardi 21 octobre », ou « mardi 21 octobre 2026 » avec l'année. */
export function formatDate(ts: number, withYear = false): string {
  return new Date(ts).toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    ...(withYear ? { year: 'numeric' } : {}),
  });
}

/** Titre de journée : « Aujourd'hui », « Hier » ou « Mardi 21 octobre ». */
export function formatDayTitle(dayStart: number, now = Date.now()): string {
  const today = startOfDay(now);
  if (dayStart === today) return "Aujourd'hui";
  if (dayStart === addDays(today, -1)) return 'Hier';
  return capitalize(formatDate(dayStart, new Date(dayStart).getFullYear() !== new Date(now).getFullYear()));
}

/** Jour relatif court : « aujourd'hui », « hier », « mar. 21 oct. » */
export function formatRelativeDay(ts: number, now = Date.now()): string {
  const day = startOfDay(ts);
  const today = startOfDay(now);
  if (day === today) return "aujourd'hui";
  if (day === addDays(today, -1)) return 'hier';
  return new Date(ts).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
}
