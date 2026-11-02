import { SIDE_LABELS, TAGS, TAG_LABELS, type Entry, type Weight } from '../model';
import { formatClock } from './format';

const HEADER = [
  'date',
  'heure',
  ...TAGS.map((tag) => TAG_LABELS[tag].toLowerCase()),
  'biberon_ml',
  'sein',
  'tetee_min',
  'poids_g',
  'id',
  'cree_le',
  'modifie_le',
];

const pad = (n: number): string => String(n).padStart(2, '0');
const isoDate = (ts: number): string => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const localDateTime = (ts: number): string => `${isoDate(ts)} ${formatClock(ts)}:${pad(new Date(ts).getSeconds())}`;

/**
 * CSV séparé par des points-virgules, avec BOM UTF-8 : s'ouvre directement dans Excel en français.
 * Une ligne par saisie, et une par pesée (colonne poids_g).
 */
export function toCsv(entries: Entry[], weights: Weight[] = []): string {
  const rows = [...entries, ...weights]
    .filter((item) => item.deletedAt === null)
    .sort((a, b) => a.at - b.at)
    .map((item) =>
      [
        isoDate(item.at),
        formatClock(item.at),
        ...TAGS.map((tag) => (item.kind === undefined && item.tags.includes(tag) ? 'oui' : '')),
        item.kind === undefined ? (item.ml ?? '') : '',
        item.kind === undefined ? (item.sides ?? []).map((side) => SIDE_LABELS[side].toLowerCase()).join(' + ') : '',
        item.kind === undefined ? (item.durationMin ?? '') : '',
        item.kind === 'weight' ? item.grams : '',
        item.id,
        localDateTime(item.createdAt),
        localDateTime(item.updatedAt),
      ].join(';'),
    );
  return '\uFEFF' + [HEADER.join(';'), ...rows].join('\r\n') + '\r\n';
}
