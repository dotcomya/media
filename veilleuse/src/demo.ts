// Données d'exemple pour l'aperçu : hier et aujourd'hui, autour de « maintenant ».
import { DEFAULT_SETTINGS, createEntry, type Tag } from './model';
import { initDemo } from './store';
import { MINUTE, addDays, startOfDay } from './lib/time';

const YESTERDAY: [string, Tag[], number?][] = [
  ['00:40', ['feed', 'pee']],
  ['03:15', ['feed']],
  ['05:50', ['feed', 'pee', 'poop']],
  ['08:30', ['bottle'], 90],
  ['09:10', ['pee']],
  ['11:05', ['feed', 'pee']],
  ['13:40', ['feed']],
  ['14:20', ['poop']],
  ['16:10', ['bottle', 'pee'], 120],
  ['18:45', ['feed']],
  ['21:20', ['feed', 'pee']],
  ['23:50', ['feed']],
];

// Aujourd'hui : en minutes avant « maintenant ».
const TODAY: [number, Tag[], number?][] = [
  [35, ['feed', 'pee']],
  [100, ['poop']],
  [185, ['bottle'], 90],
  [330, ['feed', 'pee']],
  [480, ['feed']],
];

export function startDemo(): void {
  const now = Date.now();
  const yesterday = addDays(startOfDay(now), -1);
  const at = (hhmm: string) => {
    const [h, m] = hhmm.split(':').map(Number);
    return yesterday + (h * 60 + m) * MINUTE;
  };
  initDemo(
    [
      ...YESTERDAY.map(([time, tags, ml]) => createEntry(tags, at(time), ml)),
      ...TODAY.map(([ago, tags, ml]) => createEntry(tags, now - ago * MINUTE, ml)),
    ],
    { ...DEFAULT_SETTINGS, babyName: 'Lou' },
  );
}
