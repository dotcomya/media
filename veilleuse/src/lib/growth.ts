// Courbes de poids de l'OMS : à partir des paramètres L, M, S (méthode LMS de Cole),
// le poids d'un percentile donné à un âge donné, et le percentile d'un poids mesuré.
import type { Sex } from '../model';
import { DAY } from './time';
import { WHO_WEIGHT_LMS, WHO_WEIGHT_WEEKS } from './whoWeight';

/** Courbes tracées : basses (3e, 15e), médiane (50e), hautes (85e, 97e). */
export const PERCENTILES = [
  { p: 3, z: -1.880794 },
  { p: 15, z: -1.036433 },
  { p: 50, z: 0 },
  { p: 85, z: 1.036433 },
  { p: 97, z: 1.880794 },
] as const;

type Lms = [number, number, number];

/** Paramètres à un âge en semaines (interpolés entre deux semaines), bornés à la table. */
export function lmsAt(sex: Sex, weeks: number): Lms {
  const table = WHO_WEIGHT_LMS[sex];
  const w = Math.min(Math.max(weeks, 0), WHO_WEIGHT_WEEKS);
  const i = Math.min(Math.floor(w), WHO_WEIGHT_WEEKS - 1);
  const t = w - i;
  const [a, b] = [table[i], table[i + 1]];
  return [0, 1, 2].map((k) => a[k] + (b[k] - a[k]) * t) as Lms;
}

/** Poids (kg) au z-score donné. */
export function weightAtZ([l, m, s]: Lms, z: number): number {
  return l === 0 ? m * Math.exp(s * z) : m * (1 + l * s * z) ** (1 / l);
}

/** z-score d'un poids (kg). */
export function zOfWeight([l, m, s]: Lms, kg: number): number {
  return l === 0 ? Math.log(kg / m) / s : ((kg / m) ** l - 1) / (l * s);
}

/** Fonction de répartition de la loi normale (approximation d'Abramowitz et Stegun, erreur < 1e-7). */
function normalCdf(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989422804014327 * Math.exp((-z * z) / 2);
  const tail = d * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return z >= 0 ? 1 - tail : tail;
}

/** Percentile (0 à 100) d'un poids à un âge donné. */
export function percentileOf(sex: Sex, weeks: number, kg: number): number {
  return 100 * normalCdf(zOfWeight(lmsAt(sex, weeks), kg));
}

/** « 48e percentile », « 1er percentile », « sous le 1er percentile »… */
export function formatPercentile(p: number): string {
  if (p < 1) return 'sous le 1er percentile';
  if (p > 99) return 'au-dessus du 99e percentile';
  const n = Math.round(p);
  return `${n}${n === 1 ? 'er' : 'e'} percentile`;
}

/** « 2026-10-01 » → minuit (heure locale) ce jour-là. */
export function parseDate(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).getTime();
}

/** Minuit d'un instant → « 2026-10-01 » (pour un champ date). */
export function toDateValue(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Âge en semaines (décimales comprises) à une date, depuis la date de naissance. */
export function ageInWeeks(birthDate: string, at: number): number {
  const birth = parseDate(birthDate);
  const days = Math.round((parseDate(toDateValue(at)) - birth) / DAY);
  return days / 7;
}

/** « 5 sem. 3 j », « 2 j », « naissance » */
export function formatAge(weeks: number): string {
  const days = Math.round(weeks * 7);
  if (days <= 0) return 'naissance';
  const w = Math.floor(days / 7);
  const d = days % 7;
  return [w ? `${w} sem.` : '', d ? `${d} j` : ''].filter(Boolean).join(' ');
}

/** « 4,25 kg » */
export const formatKg = (grams: number): string =>
  `${(grams / 1000).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 3 })} kg`;

/**
 * Poids tapé par le parent → grammes : « 4,25 » ou « 4.25 » (kg), « 4250 » (g).
 * null si ce n'est pas un poids plausible pour un bébé (1 à 25 kg).
 */
export function parseWeight(input: string): number | null {
  const n = Number(input.trim().replace(/\s/g, '').replace(',', '.').replace(/kg$|g$/i, ''));
  if (!Number.isFinite(n) || n <= 0) return null;
  const grams = Math.round(n > 100 ? n : n * 1000);
  return grams >= 1000 && grams <= 25000 ? grams : null;
}
