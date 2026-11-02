// Assemble les tuiles et glyphes filtrés (scripts/tiles.mjs) en un seul
// paquet gzip + base64, injecté dans l'artefact sous window.__YY_MAP__.
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const CACHE = new URL('../.cache/', import.meta.url);

export function buildPack() {
  const tilesDir = new URL('tiles/', CACHE);
  const glyphsDir = new URL('glyphs/', CACHE);
  if (!existsSync(new URL('meta.json', tilesDir))) throw new Error('Tuiles absentes : lancer « npm run tiles » d’abord.');
  const meta = JSON.parse(readFileSync(new URL('meta.json', tilesDir), 'utf8'));
  const files = {};
  const chunks = [];
  let offset = 0;
  const add = (key, buf) => {
    files[key] = [offset, buf.length];
    chunks.push(buf);
    offset += buf.length;
  };
  for (const name of readdirSync(tilesDir).filter((f) => f.endsWith('.pbf'))) {
    const [z, x, y] = name.replace('.pbf', '').split('-');
    add(`t/${z}/${x}/${y}`, readFileSync(new URL(name, tilesDir)));
  }
  for (const name of readdirSync(glyphsDir).filter((f) => f.endsWith('.pbf'))) {
    const m = name.match(/^(.*)-(\d+-\d+)\.pbf$/);
    add(`g/${m[1]}/${m[2]}`, readFileSync(new URL(name, glyphsDir)));
  }
  const header = Buffer.from(JSON.stringify({ meta: { bbox: meta.bbox, minzoom: meta.minzoom, maxzoom: meta.maxzoom }, files }));
  const len = Buffer.alloc(4);
  len.writeUInt32LE(header.length);
  const raw = Buffer.concat([len, header, ...chunks]);
  const b64 = gzipSync(raw, { level: 9 }).toString('base64');
  writeFileSync(new URL('mappack.js', CACHE), `window.__YY_MAP__=${JSON.stringify(b64)};`);
  return { raw: raw.length, b64: b64.length };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { raw, b64 } = buildPack();
  console.log(`paquet carte : ${(raw / 1e6).toFixed(2)} Mo bruts → ${(b64 / 1e6).toFixed(2)} Mo en base64`);
}
