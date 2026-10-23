// Génère les icônes PNG et les écrans de lancement iOS, sans dépendance :
// un croissant de lune ambre sur fond sombre, dessiné pixel par pixel.
// Usage : npm run icons
import { mkdirSync, writeFileSync } from 'node:fs';
import { crc32, deflateSync } from 'node:zlib';

const BG = [0x17, 0x11, 0x0e];
const TILE = [0x2a, 0x1d, 0x15];
const MOON = [0xf2, 0xa2, 0x5c];

function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

function png(width, height, pixel) {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = y * (width * 3 + 1);
    for (let x = 0; x < width; x++) raw.set(pixel(x + 0.5, y + 0.5), row + 1 + x * 3);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8); // 8 bits, RVB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const clamp01 = (v) => Math.min(1, Math.max(0, v));

/** Croissant centré en (cx, cy), de rayon r (en pixels) : disque moins un disque décalé, plus une étoile. */
function moonPixel(cx, cy, r, background) {
  return (x, y) => {
    const dOuter = Math.hypot(x - cx, y - cy) - r;
    const dInner = Math.hypot(x - (cx + 0.42 * r), y - (cy - 0.3 * r)) - 0.82 * r;
    const crescent = Math.max(dOuter, -dInner); // distance signée au croissant
    const star = Math.hypot(x - (cx + 0.62 * r), y - (cy + 0.1 * r)) - 0.11 * r;
    const coverage = clamp01(0.5 - Math.min(crescent, star));
    return mix(background(x, y), MOON, coverage);
  };
}

const solid = (color) => () => color;

function icon(size, scale, background) {
  return png(size, size, moonPixel(size * 0.53, size * 0.52, size * scale, background));
}

mkdirSync('public/icons', { recursive: true });
mkdirSync('public/splash', { recursive: true });
writeFileSync('public/icons/icon-192.png', icon(192, 0.34, solid(TILE)));
writeFileSync('public/icons/icon-512.png', icon(512, 0.34, solid(TILE)));
// Icône « maskable » : le dessin tient dans la zone sûre (cercle de 40 % du côté).
writeFileSync('public/icons/icon-maskable-512.png', icon(512, 0.26, solid(TILE)));
writeFileSync('public/icons/apple-touch-icon.png', icon(180, 0.34, solid(TILE)));

// Écrans de lancement iOS (portrait) : sans eux, l'app installée s'ouvre sur un écran blanc.
// [largeur CSS, hauteur CSS, densité]
const SPLASH = [
  [375, 667, 2],
  [414, 736, 3],
  [375, 812, 3],
  [414, 896, 2],
  [414, 896, 3],
  [390, 844, 3],
  [428, 926, 3],
  [393, 852, 3],
  [430, 932, 3],
  [402, 874, 3],
  [440, 956, 3],
  [420, 912, 3],
];
for (const [w, h, dpr] of SPLASH) {
  const [W, H] = [w * dpr, h * dpr];
  writeFileSync(`public/splash/${W}x${H}.png`, png(W, H, moonPixel(W * 0.53, H * 0.47, 36 * dpr, solid(BG))));
}

console.log('Icônes et écrans de lancement générés.');
