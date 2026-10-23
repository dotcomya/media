import { TAGS, TAG_LABELS, type Entry } from '../model';
import { formatClock } from './format';

const HEADER = ['date', 'heure', ...TAGS.map((tag) => TAG_LABELS[tag].toLowerCase()), 'biberon_ml', 'id', 'cree_le', 'modifie_le'];

const pad = (n: number): string => String(n).padStart(2, '0');
const isoDate = (ts: number): string => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const localDateTime = (ts: number): string => `${isoDate(ts)} ${formatClock(ts)}:${pad(new Date(ts).getSeconds())}`;

/** CSV séparé par des points-virgules, avec BOM UTF-8 : s'ouvre directement dans Excel en français. */
export function toCsv(entries: Entry[]): string {
  const rows = entries
    .filter((e) => e.deletedAt === null)
    .sort((a, b) => a.at - b.at)
    .map((e) =>
      [
        isoDate(e.at),
        formatClock(e.at),
        ...TAGS.map((tag) => (e.tags.includes(tag) ? 'oui' : '')),
        e.ml ?? '',
        e.id,
        localDateTime(e.createdAt),
        localDateTime(e.updatedAt),
      ].join(';'),
    );
  return '﻿' + [HEADER.join(';'), ...rows].join('\r\n') + '\r\n';
}
