import type { AppEvent } from '../model';
import { formatClock } from './format';

const HEADER = ['date', 'heure', 'type', 'seins', 'gauche_min', 'droit_min', 'total_min', 'biberon_ml', 'pipi', 'caca', 'id', 'cree_le', 'modifie_le'];

const pad = (n: number): string => String(n).padStart(2, '0');
const isoDate = (ts: number): string => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const localDateTime = (ts: number): string => `${isoDate(ts)} ${formatClock(ts)}:${pad(new Date(ts).getSeconds())}`;
// Virgule décimale : le CSV s'ouvre directement dans un tableur réglé en français.
const minutes = (ms: number): string => (ms / 60_000).toFixed(1).replace('.', ',');
const yes = (b: boolean): string => (b ? 'oui' : '');

function cell(value: string | number): string {
  const s = String(value);
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function row(e: AppEvent): (string | number)[] {
  const common = [isoDate(e.at), formatClock(e.at)];
  const meta = [e.id, localDateTime(e.createdAt), localDateTime(e.updatedAt)];
  switch (e.type) {
    case 'breast': {
      const sides = e.sides.map((s) => (s === 'L' ? 'G' : 'D')).join(' puis ');
      return [...common, 'tétée', sides, minutes(e.leftMs), minutes(e.rightMs), minutes(e.durationMs), '', '', '', ...meta];
    }
    case 'bottle':
      return [...common, 'biberon', '', '', '', '', e.ml, '', '', ...meta];
    case 'diaper':
      return [...common, 'couche', '', '', '', '', '', yes(e.pee), yes(e.poop), ...meta];
  }
}

/** CSV séparé par des points-virgules, avec BOM UTF-8 pour Excel. */
export function toCsv(events: AppEvent[]): string {
  const rows = events
    .filter((e) => e.deletedAt === null)
    .sort((a, b) => a.at - b.at)
    .map((e) => row(e).map(cell).join(';'));
  return '﻿' + [HEADER.join(';'), ...rows].join('\r\n') + '\r\n';
}
