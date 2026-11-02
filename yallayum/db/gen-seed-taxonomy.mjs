// Génère db/seed-taxonomy.sql à partir de src/domain/taxonomy.ts, pour que la
// base et les applications partent exactement des mêmes listes.
//
//   node db/gen-seed-taxonomy.mjs
//
// Node ≥ 22.18 importe le TypeScript directement (types effacés).
import { writeFileSync } from 'node:fs';
import { AMENITIES, CUISINES, OCCASIONS } from '../src/domain/taxonomy.ts';

const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const arr = (xs) => (xs.length ? `ARRAY[${xs.map(q).join(', ')}]` : `'{}'::text[]`);

// Parents avant enfants.
const cuisines = [...CUISINES].sort((a, b) => Number(!!a.parent) - Number(!!b.parent));

const lines = [
  '-- Généré par db/gen-seed-taxonomy.mjs depuis src/domain/taxonomy.ts — ne pas modifier à la main.',
  'BEGIN;',
  '',
  'INSERT INTO cuisines (id, label, family, parent_id, hue, icon, synonyms, sort_order) VALUES',
  cuisines
    .map((c) => `  (${q(c.id)}, ${q(c.label)}, ${q(c.family)}, ${c.parent ? q(c.parent) : 'NULL'}, ${c.hue}, ${q(c.icon)}, ${arr(c.synonyms)}, ${CUISINES.indexOf(c)})`)
    .join(',\n') + '\nON CONFLICT (id) DO UPDATE SET label = EXCLUDED.label, family = EXCLUDED.family, parent_id = EXCLUDED.parent_id, hue = EXCLUDED.hue, icon = EXCLUDED.icon, synonyms = EXCLUDED.synonyms, sort_order = EXCLUDED.sort_order;',
  '',
  'INSERT INTO occasions (id, label, kind, synonyms, sort_order) VALUES',
  OCCASIONS.map((o, i) => `  (${q(o.id)}, ${q(o.label)}, ${q(o.kind)}, ${arr(o.synonyms)}, ${i})`).join(',\n') +
    '\nON CONFLICT (id) DO UPDATE SET label = EXCLUDED.label, kind = EXCLUDED.kind, synonyms = EXCLUDED.synonyms, sort_order = EXCLUDED.sort_order;',
  '',
  'INSERT INTO amenities (id, label, synonyms, sort_order) VALUES',
  AMENITIES.map((a, i) => `  (${q(a.id)}, ${q(a.label)}, ${arr(a.synonyms)}, ${i})`).join(',\n') +
    '\nON CONFLICT (id) DO UPDATE SET label = EXCLUDED.label, synonyms = EXCLUDED.synonyms, sort_order = EXCLUDED.sort_order;',
  '',
  'COMMIT;',
  '',
];

writeFileSync(new URL('./seed-taxonomy.sql', import.meta.url), lines.join('\n'));
console.log(`seed-taxonomy.sql : ${CUISINES.length} cuisines, ${OCCASIONS.length} envies, ${AMENITIES.length} équipements`);
