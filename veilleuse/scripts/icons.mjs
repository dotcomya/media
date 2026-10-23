// Génère les icônes PNG et les écrans de lancement iOS de Nous 3, sans dépendance :
// le logo (deux parents et un bébé, blottis) dessiné pixel par pixel.
// Usage : npm run icons
import { mkdirSync, writeFileSync } from 'node:fs';
import { crc32, deflateSync } from 'node:zlib';

const CREAM = [0xf6, 0xec, 0xe1]; // fond des icônes
const CACAO = [0x17, 0x11, 0x0e]; // fond des écrans de lancement (même fond que l'app)
const TERRACOTTA = [0xcf, 0x7a, 0x55];
const PEACH = [0xeb, 0xa3, 0x83];
const SAGE = [0x93, 0xa8, 0x85];

// Même dessin que src/components/Logo.tsx, en unités de 64.
const SHAPES = [
  { cx: 24.6, cy: 27.5, r: 13.1, color: TERRACOTTA },
  { cx: 39.4, cy: 27.5, r: 14.5, color: 'ground' },
  { cx: 39.4, cy: 27.5, r: 13.1, color: PEACH },
  { cx: 32, cy: 42.6, r: 9.4, color: 'ground' },
  { cx: 32, cy: 42.6, r: 8, color: SAGE },
];

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

/** Logo de `size` pixels de côté (carré de 64 unités), placé en (left, top), sur `ground`. */
function logoPixel(left, top, size, ground) {
  const unit = size / 64;
  return (x, y) => {
    let color = ground;
    for (const shape of SHAPES) {
      const distance = Math.hypot(x - (left + shape.cx * unit), y - (top + shape.cy * unit)) - shape.r * unit;
      const coverage = clamp01(0.5 - distance); // anticrénelage sur un pixel
      if (coverage > 0) color = mix(color, shape.color === 'ground' ? ground : shape.color, coverage);
    }
    return color;
  };
}

/** Icône carrée : le logo centré, occupant `scale` du côté. */
function icon(size, scale) {
  const logo = size * scale;
  return png(size, size, logoPixel((size - logo) / 2, (size - logo) / 2, logo, CREAM));
}

mkdirSync('public/icons', { recursive: true });
mkdirSync('public/splash', { recursive: true });
writeFileSync('public/icons/icon-192.png', icon(192, 0.92));
writeFileSync('public/icons/icon-512.png', icon(512, 0.92));
// Icône « maskable » : le dessin tient dans la zone sûre (cercle de 40 % du côté).
writeFileSync('public/icons/icon-maskable-512.png', icon(512, 0.7));
writeFileSync('public/icons/apple-touch-icon.png', icon(180, 0.92));

// Écrans de lancement iOS (portrait), sombres : l'app ne s'ouvre jamais sur un flash blanc.
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
  const logo = 120 * dpr;
  writeFileSync(`public/splash/${W}x${H}.png`, png(W, H, logoPixel((W - logo) / 2, H * 0.44 - logo / 2, logo, CACAO)));
}

console.log('Icônes et écrans de lancement générés.');
