// Génère src/lib/whoWeight.ts : poids pour l'âge, normes de croissance de l'enfant de l'OMS (2006).
// Source : fichier weianthro.txt du logiciel WHO Anthro (paramètres L, M, S par jour d'âge),
// https://github.com/WorldHealthOrganization/anthro/blob/master/data-raw/growthstandards/weianthro.txt
// Usage : node scripts/who.mjs chemin/vers/weianthro.txt
import { readFileSync, writeFileSync } from 'node:fs';

const WEEKS = 104;
const [, , source] = process.argv;
if (!source) throw new Error('Usage : node scripts/who.mjs chemin/vers/weianthro.txt');

const rows = readFileSync(source, 'utf8')
  .trim()
  .split('\n')
  .slice(1)
  .map((line) => line.split('\t').map(Number));
const bySex = { boy: 1, girl: 2 };
const table = Object.fromEntries(
  Object.entries(bySex).map(([sex, code]) => {
    const byDay = new Map(rows.filter((r) => r[0] === code).map((r) => [r[1], r.slice(2)]));
    return [sex, Array.from({ length: WEEKS + 1 }, (_, week) => byDay.get(week * 7))];
  }),
);

const format = (list) => list.map(([l, m, s]) => `[${l}, ${m}, ${s}]`).join(',\n    ');
writeFileSync(
  new URL('../src/lib/whoWeight.ts', import.meta.url),
  `// Poids pour l'âge, normes de croissance de l'enfant de l'OMS (2006) : paramètres L, M, S
// (Box-Cox), une ligne par semaine d'âge, de la naissance à ${WEEKS} semaines.
// Source : WHO Anthro, weianthro.txt. Fichier généré par scripts/who.mjs : ne pas modifier à la main.

export const WHO_WEIGHT_WEEKS = ${WEEKS};

export const WHO_WEIGHT_LMS: Record<'girl' | 'boy', [number, number, number][]> = {
  girl: [
    ${format(table.girl)},
  ],
  boy: [
    ${format(table.boy)},
  ],
};
`,
);
console.log('src/lib/whoWeight.ts écrit');
