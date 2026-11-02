// Formats français : dates, prix, durées relatives.

import { daysBetween } from './hours';
import { PRICE_LEVELS } from './taxonomy';
import type { ISODate, PriceInfo } from './types';

const MONTHS_LONG = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

/** « 12 mars 2026 », « 1er avril 2026 ». */
export function formatDate(date: ISODate): string {
  const [y, m, d] = date.split('-').map(Number);
  return `${d === 1 ? '1er' : d} ${MONTHS_LONG[m - 1]} ${y}`;
}

/** « 03/2026 » pour les mentions compactes. */
export function formatMonthYear(date: ISODate): string {
  const [y, m] = date.split('-');
  return `${m}/${y}`;
}

/** « aujourd'hui », « il y a 3 jours », « il y a 2 mois », « il y a plus d'un an ». */
export function formatAgo(date: ISODate, today: ISODate): string {
  const days = daysBetween(date, today);
  if (days <= 0) return "aujourd'hui";
  if (days === 1) return 'hier';
  if (days < 30) return `il y a ${days} jours`;
  const months = Math.round(days / 30.4);
  if (months < 12) return months === 1 ? 'il y a 1 mois' : `il y a ${months} mois`;
  return months < 24 ? 'il y a plus d’un an' : `il y a ${Math.floor(months / 12)} ans`;
}

/** « dans 3 mois », pour les échéances de revérification. */
export function formatIn(date: ISODate, today: ISODate): string {
  const days = daysBetween(today, date);
  if (days < 0) return `échu ${formatAgo(date, today)}`;
  if (days === 0) return "aujourd'hui";
  if (days < 30) return `dans ${days} jour${days > 1 ? 's' : ''}`;
  const months = Math.round(days / 30.4);
  return `dans ${months} mois`;
}

/** « €€ · 15 à 30 € » ; la fourchette observée prime quand elle existe. */
export function formatPrice(p?: PriceInfo): string {
  if (!p) return 'Prix non renseigné';
  const level = PRICE_LEVELS[p.level];
  if (p.min !== undefined && p.max !== undefined) return `${level.symbol} · ${p.min}–${p.max} €`;
  return `${level.symbol} · ${level.range}`;
}

export function formatCount(n: number, one: string, many: string): string {
  return `${n.toLocaleString('fr-FR')} ${n > 1 ? many : one}`;
}
