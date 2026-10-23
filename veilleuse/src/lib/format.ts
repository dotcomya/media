// Formats d'affichage en français, heures en 24 h.

import type { Side } from '../model';
import { MINUTE, addDays, startOfDay } from './time';

const pad = (n: number): string => String(n).padStart(2, '0');

/** « 14:05 » */
export function formatClock(ts: number): string {
  const d = new Date(ts);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** « à l'instant », « il y a 40 min », « il y a 2 h 10 », « il y a 3 h », « il y a 1 j 4 h » */
export function formatAgo(ms: number): string {
  const minutes = Math.floor(Math.max(0, ms) / MINUTE);
  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h < 24) return m ? `il y a ${h} h ${pad(m)}` : `il y a ${h} h`;
  const days = Math.floor(h / 24);
  return h % 24 ? `il y a ${days} j ${h % 24} h` : `il y a ${days} j`;
}

/** Durée arrondie à la minute : « 12 min », « 1 h 05 ». */
export function formatDuration(ms: number): string {
  const minutes = Math.round(Math.max(0, ms) / MINUTE);
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${pad(minutes % 60)}`;
}

/** Chrono : « 07:22 », « 1:02:03 ». */
export function formatChrono(ms: number): string {
  const s = Math.floor(Math.max(0, ms) / 1000);
  const h = Math.floor(s / 3600);
  const mmss = `${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
  return h ? `${h}:${mmss}` : mmss;
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

export const sideName = (side: Side): string => (side === 'L' ? 'gauche' : 'droit');
export const sideLetter = (side: Side): string => (side === 'L' ? 'G' : 'D');

/** « sein droit », « gauche puis droit » */
export function formatSides(sides: Side[]): string {
  if (sides.length === 1) return `sein ${sideName(sides[0])}`;
  return sides.map(sideName).join(' puis ');
}


export const diaperLabel = (pee: boolean, poop: boolean): string =>
  pee && poop ? 'Pipi + caca' : poop ? 'Caca' : 'Pipi';
