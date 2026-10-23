export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

/** Minuit (heure locale) du jour contenant `ts`. */
export function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Minuit `n` jours plus tard. Passe par Date pour gérer les jours de 23 h ou 25 h (changement d'heure). */
export function addDays(dayStart: number, n: number): number {
  const d = new Date(dayStart);
  d.setDate(d.getDate() + n);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export const isInDay = (ts: number, dayStart: number): boolean => ts >= dayStart && ts < addDays(dayStart, 1);

const pad = (n: number): string => String(n).padStart(2, '0');

/** Format attendu par <input type="datetime-local"> : « 2026-10-21T14:05 ». */
export function toDateTimeInput(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
