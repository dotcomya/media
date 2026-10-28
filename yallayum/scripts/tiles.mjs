// Prépare les tuiles vectorielles de démonstration (Paris et proche couronne).
//
// Source : OpenFreeMap (schéma OpenMapTiles, données © OpenStreetMap, ODbL).
// On ne garde que ce que dessine le style YallaYum (eau, parcs, voirie, noms
// de rues, quartiers, stations) et on retire les centaines de traductions de
// noms : une tuile de 1 Mo tombe à quelques dizaines de Ko. Le résultat sert
// au prototype hors ligne et à l'artefact en fichier unique, où aucun serveur
// de tuiles n'est joignable. En production, les tuiles viennent du fournisseur
// retenu (voir docs/08-architecture.md).
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { VectorTile } from '@mapbox/vector-tile';
import { PbfReader } from 'pbf';

const require = createRequire(import.meta.url);
const vtpbf = require('vt-pbf');

export const BBOX = [2.225, 48.805, 2.47, 48.945]; // ouest, sud, est, nord
export const MIN_ZOOM = 10;
export const MAX_ZOOM = 14;
const OUT = new URL('../.cache/tiles/', import.meta.url);
export const FONTS = ['Noto Sans Regular', 'Noto Sans Bold'];
export const GLYPH_RANGES = ['0-255', '256-511', '8192-8447'];

/** Couches et attributs conservés, par couche OpenMapTiles. */
const KEEP = {
  water: ['class', 'brunnel'],
  waterway: ['class', 'brunnel', 'name'],
  landcover: ['class', 'subclass'],
  park: ['class', 'name'],
  landuse: ['class'],
  transportation: ['class', 'subclass', 'brunnel', 'ramp', 'oneway'],
  transportation_name: ['class', 'subclass', 'name', 'brunnel'],
  place: ['class', 'name', 'rank'],
  poi: ['class', 'subclass', 'name', 'rank'],
  water_name: ['class', 'name'],
};
const LANDUSE = new Set(['cemetery', 'hospital', 'university', 'stadium']);
const STATION = new Set(['subway', 'railway', 'tram_stop', 'station', 'halt']);
/** Classes de voies conservées selon le zoom : la rue n'apparaît qu'au zoom 14. */
const ROADS_BY_ZOOM = [
  [14, ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'minor', 'rail']],
  [13, ['motorway', 'trunk', 'primary', 'secondary', 'tertiary']],
  [12, ['motorway', 'trunk', 'primary', 'secondary']],
  [0, ['motorway', 'trunk', 'primary']],
].map(([z, classes]) => [z, new Set(classes)]);
const NAMED_ROADS = new Set(['trunk', 'primary', 'secondary', 'tertiary', 'minor']);

function roadsAt(z) {
  return ROADS_BY_ZOOM.find(([min]) => z >= min)[1];
}
/** Résolution des tuiles réencodées : 1024 unités, soit ~1,6 m par unité au zoom 14 à Paris. */
const EXTENT = 1024;

function keepFeature(layer, props, z) {
  if (layer === 'landuse') return LANDUSE.has(props.class);
  if (layer === 'poi') return props.class === 'railway' && STATION.has(props.subclass ?? 'station');
  // Au zoom 14, OpenMapTiles décrit chaque pelouse : seuls les bois restent, les parcs ont leur couche.
  if (layer === 'landcover') return z >= 14 ? props.class === 'wood' : ['grass', 'wood'].includes(props.class);
  if (layer === 'transportation') return roadsAt(z).has(props.class);
  if (layer === 'place') return !['isolated_dwelling', 'hamlet'].includes(props.class);
  if (layer === 'transportation_name') return NAMED_ROADS.has(props.class);
  return true;
}

/** Ramène la géométrie à EXTENT unités et supprime les points devenus identiques. */
function requantize(rings, extent) {
  const k = EXTENT / extent;
  return rings
    .map((ring) => {
      const out = [];
      for (const p of ring) {
        const x = Math.round(p.x * k);
        const y = Math.round(p.y * k);
        const last = out[out.length - 1];
        if (!last || last.x !== x || last.y !== y) out.push({ x, y });
      }
      return out;
    })
    .filter((ring) => ring.length > 0);
}

function lon2x(lon, z) {
  return Math.floor(((lon + 180) / 360) * 2 ** z);
}
function lat2y(lat, z) {
  const r = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.asinh(Math.tan(r)) / Math.PI) / 2) * 2 ** z);
}

export function tileRange(z) {
  return { x0: lon2x(BBOX[0], z), x1: lon2x(BBOX[2], z), y0: lat2y(BBOX[3], z), y1: lat2y(BBOX[1], z) };
}

function filterTile(buffer, z) {
  const tile = new VectorTile(new PbfReader(buffer));
  const layers = {};
  for (const [name, attrs] of Object.entries(KEEP)) {
    const src = tile.layers[name];
    if (!src) continue;
    const features = [];
    for (let i = 0; i < src.length; i++) {
      const f = src.feature(i);
      if (!keepFeature(name, f.properties, z)) continue;
      const properties = {};
      for (const a of attrs) {
        let v = f.properties[a];
        if (a === 'name') v = f.properties['name:fr'] ?? f.properties['name:latin'] ?? v;
        if (v !== undefined && v !== null && v !== '') properties[a] = v;
      }
      const geometry = requantize(f.loadGeometry(), src.extent);
      if (f.type === 2 && geometry.every((r) => r.length < 2)) continue;
      if (f.type === 3 && geometry.every((r) => r.length < 4)) continue;
      features.push({ type: f.type, properties, loadGeometry: () => geometry, id: undefined });
    }
    if (features.length) {
      layers[name] = { name, version: 2, extent: EXTENT, length: features.length, feature: (i) => features[i] };
    }
  }
  return Buffer.from(vtpbf.fromVectorTileJs({ layers }));
}

async function main() {
  const tilejson = await (await fetch('https://tiles.openfreemap.org/planet')).json();
  const template = tilejson.tiles[0];
  mkdirSync(OUT, { recursive: true });
  let raw = 0;
  let kept = 0;
  let count = 0;
  for (let z = MIN_ZOOM; z <= MAX_ZOOM; z++) {
    const { x0, x1, y0, y1 } = tileRange(z);
    const jobs = [];
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        jobs.push({ z, x, y });
      }
    }
    // Petits lots pour ménager le serveur public d'OpenFreeMap.
    for (let i = 0; i < jobs.length; i += 6) {
      await Promise.all(
        jobs.slice(i, i + 6).map(async ({ z, x, y }) => {
          const file = new URL(`${z}-${x}-${y}.pbf`, OUT);
          if (existsSync(file)) {
            kept += readFileSync(file).length;
            count++;
            return;
          }
          const url = template.replace('{z}', z).replace('{x}', x).replace('{y}', y);
          for (let attempt = 0; attempt < 4; attempt++) {
            try {
              const res = await fetch(url);
              if (!res.ok) throw new Error(`${res.status} ${url}`);
              const buf = Buffer.from(await res.arrayBuffer());
              raw += buf.length;
              const out = filterTile(buf, z);
              kept += out.length;
              count++;
              writeFileSync(file, out);
              return;
            } catch (err) {
              if (attempt === 3) throw err;
              await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
            }
          }
        }),
      );
    }
    console.log(`z${z} ok`);
  }
  // Polices des libellés de carte (glyphes MapLibre) : latin, latin étendu (œ), ponctuation (’ –).
  const glyphs = new URL('../glyphs/', OUT);
  mkdirSync(glyphs, { recursive: true });
  for (const font of FONTS) {
    for (const range of GLYPH_RANGES) {
      const file = new URL(`${encodeURIComponent(font)}-${range}.pbf`, glyphs);
      if (existsSync(file)) continue;
      const res = await fetch(`https://tiles.openfreemap.org/fonts/${encodeURIComponent(font)}/${range}.pbf`);
      if (!res.ok) throw new Error(`${res.status} glyphes ${font} ${range}`);
      writeFileSync(file, Buffer.from(await res.arrayBuffer()));
    }
  }
  writeFileSync(
    new URL('meta.json', OUT),
    JSON.stringify({ bbox: BBOX, minzoom: MIN_ZOOM, maxzoom: MAX_ZOOM, source: template, fetchedAt: new Date().toISOString() }, null, 2),
  );
  console.log(`${count} tuiles · brut ${(raw / 1e6).toFixed(1)} Mo → gardé ${(kept / 1e6).toFixed(2)} Mo`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
