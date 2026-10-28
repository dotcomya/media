// Visuels génératifs : une assiette vue du dessus ou une salle stylisée,
// dans la teinte de la cuisine. Ils remplacent les photos tant que les droits
// ne sont pas acquis, et sont TOUJOURS étiquetés « Illustration » à l'écran :
// jamais une image fabriquée présentée comme la photo d'un lieu réel.

export type Subject = 'dish' | 'room' | 'generic' | 'facade';

/** Générateur pseudo-aléatoire déterministe (mulberry32). */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** OKLCH → sRGB, pour que le canvas ne dépende pas du support navigateur d'oklch(). */
export function oklch(l: number, c: number, h: number, alpha = 1): string {
  const hr = (h * Math.PI) / 180;
  const a = c * Math.cos(hr);
  const b = c * Math.sin(hr);
  const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = l - 0.0894841775 * a - 1.291485548 * b;
  const L = l_ ** 3;
  const M = m_ ** 3;
  const S = s_ ** 3;
  const lin = [
    4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S,
    -1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S,
    -0.0041960863 * L - 0.7034186147 * M + 1.707614701 * S,
  ];
  const [r, g, bb] = lin.map((x) => {
    const v = x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(Math.max(0, x), 1 / 2.4) - 0.055;
    return Math.round(Math.max(0, Math.min(1, v)) * 255);
  });
  return `rgba(${r},${g},${bb},${alpha})`;
}

function blob(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, rand: () => number, points = 7) {
  const pts: [number, number][] = [];
  for (let i = 0; i < points; i++) {
    const ang = (i / points) * Math.PI * 2;
    const rr = r * (0.72 + rand() * 0.5);
    pts.push([cx + Math.cos(ang) * rr, cy + Math.sin(ang) * rr]);
  }
  ctx.beginPath();
  for (let i = 0; i <= points; i++) {
    const [x0, y0] = pts[i % points];
    const [x1, y1] = pts[(i + 1) % points];
    const mx = (x0 + x1) / 2;
    const my = (y0 + y1) / 2;
    if (i === 0) ctx.moveTo(mx, my);
    else ctx.quadraticCurveTo(x0, y0, mx, my);
  }
  ctx.closePath();
}

function grain(ctx: CanvasRenderingContext2D, w: number, h: number, rand: () => number, amount = 14) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rand() - 0.5) * amount;
    d[i] += n;
    d[i + 1] += n;
    d[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
}

function drawDish(ctx: CanvasRenderingContext2D, w: number, h: number, hue: number, rand: () => number) {
  const ang = rand() * Math.PI;
  const g = ctx.createLinearGradient(0, 0, Math.cos(ang) * w, Math.sin(ang) * h + h);
  g.addColorStop(0, oklch(0.83, 0.07, hue + 15));
  g.addColorStop(1, oklch(0.66, 0.11, hue - 10));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // Nappe : fines rayures diagonales
  ctx.save();
  ctx.globalAlpha = 0.07;
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = Math.max(1, w / 160);
  for (let x = -h; x < w; x += w / 18) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + h, h);
    ctx.stroke();
  }
  ctx.restore();

  const s = Math.min(w, h);
  // Serviette à rayures braise, glissée sous l'assiette
  ctx.save();
  ctx.translate(w * (0.12 + rand() * 0.15), h * (0.75 + rand() * 0.1));
  ctx.rotate(-0.5 + rand() * 0.4);
  ctx.fillStyle = oklch(0.95, 0.02, 80);
  ctx.fillRect(-s * 0.22, -s * 0.12, s * 0.44, s * 0.24);
  ctx.fillStyle = oklch(0.66, 0.17, 38, 0.85);
  for (let i = 0; i < 3; i++) ctx.fillRect(-s * 0.22, -s * 0.09 + i * s * 0.07, s * 0.44, s * 0.018);
  ctx.restore();

  // Assiette
  const px = w * (0.5 + (rand() - 0.5) * 0.18);
  const py = h * (0.5 + (rand() - 0.5) * 0.14);
  const pr = s * (0.38 + rand() * 0.06);
  ctx.save();
  ctx.shadowColor = 'rgba(30,20,10,0.32)';
  ctx.shadowBlur = s * 0.08;
  ctx.shadowOffsetY = s * 0.03;
  ctx.fillStyle = '#FBF8F2';
  ctx.beginPath();
  ctx.arc(px, py, pr, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = 'rgba(60,40,20,0.08)';
  ctx.lineWidth = s * 0.012;
  ctx.beginPath();
  ctx.arc(px, py, pr * 0.8, 0, Math.PI * 2);
  ctx.stroke();

  // Garniture : base, plat principal, accent, herbes
  const colors = [
    oklch(0.86, 0.06, 85),
    oklch(0.6, 0.15, hue),
    oklch(0.47, 0.12, hue - 25),
    oklch(0.76, 0.14, hue + 45),
  ];
  blob(ctx, px, py, pr * 0.62, rand, 9);
  ctx.fillStyle = colors[0];
  ctx.fill();
  const pieces = 3 + Math.floor(rand() * 3);
  for (let i = 0; i < pieces; i++) {
    const a = rand() * Math.PI * 2;
    const d = pr * (0.1 + rand() * 0.32);
    blob(ctx, px + Math.cos(a) * d, py + Math.sin(a) * d, pr * (0.14 + rand() * 0.14), rand, 6 + Math.floor(rand() * 3));
    ctx.fillStyle = colors[1 + (i % 3)];
    ctx.fill();
  }
  // Herbes et graines
  for (let i = 0; i < 26; i++) {
    const a = rand() * Math.PI * 2;
    const d = pr * Math.sqrt(rand()) * 0.62;
    ctx.fillStyle = i % 3 === 0 ? oklch(0.95, 0.03, 90) : oklch(0.58, 0.14, 140);
    ctx.beginPath();
    ctx.ellipse(px + Math.cos(a) * d, py + Math.sin(a) * d, s * 0.008, s * 0.004, a, 0, Math.PI * 2);
    ctx.fill();
  }

  // Coupelle de sauce, à moitié hors champ
  const bx = px + pr * (0.95 + rand() * 0.2) * (rand() > 0.5 ? 1 : -1);
  const by = py - pr * (0.6 + rand() * 0.4);
  ctx.save();
  ctx.shadowColor = 'rgba(30,20,10,0.25)';
  ctx.shadowBlur = s * 0.05;
  ctx.fillStyle = '#F6F1E8';
  ctx.beginPath();
  ctx.arc(bx, by, pr * 0.34, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = oklch(0.52, 0.16, hue + 10);
  ctx.beginPath();
  ctx.arc(bx, by, pr * 0.25, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.beginPath();
  ctx.ellipse(bx - pr * 0.08, by - pr * 0.08, pr * 0.07, pr * 0.035, -0.6, 0, Math.PI * 2);
  ctx.fill();
}

function drawRoom(ctx: CanvasRenderingContext2D, w: number, h: number, hue: number, rand: () => number) {
  const wall = ctx.createLinearGradient(0, 0, 0, h);
  wall.addColorStop(0, oklch(0.5, 0.08, hue));
  wall.addColorStop(1, oklch(0.36, 0.07, hue - 15));
  ctx.fillStyle = wall;
  ctx.fillRect(0, 0, w, h);
  // Arches
  const n = 2 + Math.floor(rand() * 2);
  const aw = w / (n + 1);
  for (let i = 0; i < n; i++) {
    const x = aw * (i + 0.5) + aw * 0.25;
    const top = h * 0.16;
    const bottom = h * 0.66;
    const sky = ctx.createLinearGradient(0, top, 0, bottom);
    sky.addColorStop(0, oklch(0.88, 0.07, 70));
    sky.addColorStop(1, oklch(0.75, 0.1, 40));
    ctx.fillStyle = sky;
    ctx.beginPath();
    ctx.moveTo(x, bottom);
    ctx.lineTo(x, top + aw * 0.4);
    ctx.arc(x + aw * 0.4, top + aw * 0.4, aw * 0.4, Math.PI, 0);
    ctx.lineTo(x + aw * 0.8, bottom);
    ctx.closePath();
    ctx.fill();
  }
  // Sol
  ctx.fillStyle = oklch(0.3, 0.05, hue - 30);
  ctx.fillRect(0, h * 0.72, w, h * 0.28);
  // Lampes suspendues qui rayonnent
  for (let i = 0; i < 3; i++) {
    const lx = w * (0.2 + i * 0.3 + (rand() - 0.5) * 0.08);
    const ly = h * (0.22 + rand() * 0.08);
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = Math.max(1, w / 300);
    ctx.beginPath();
    ctx.moveTo(lx, 0);
    ctx.lineTo(lx, ly);
    ctx.stroke();
    const glow = ctx.createRadialGradient(lx, ly, 0, lx, ly, w * 0.18);
    glow.addColorStop(0, 'rgba(255,214,150,0.75)');
    glow.addColorStop(1, 'rgba(255,214,150,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(lx - w * 0.2, ly - w * 0.2, w * 0.4, w * 0.4);
    ctx.fillStyle = 'rgba(255,236,200,0.95)';
    ctx.beginPath();
    ctx.arc(lx, ly, w * 0.022, 0, Math.PI * 2);
    ctx.fill();
  }
  // Tables
  for (let i = 0; i < 2; i++) {
    const tx = w * (0.3 + i * 0.42);
    const ty = h * 0.76;
    ctx.fillStyle = oklch(0.72, 0.06, 60);
    ctx.beginPath();
    ctx.ellipse(tx, ty, w * 0.16, h * 0.035, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(tx - w * 0.008, ty, w * 0.016, h * 0.16);
  }
}

const cache = new Map<string, string>();

export interface IllustrationSpec {
  seed: number;
  hue: number;
  subject: Subject;
  width: number;
  height: number;
}

/** Image (data URL) du visuel, mise en cache par spécification. */
export function renderIllustration(spec: IllustrationSpec): string {
  const dpr = Math.min(2, typeof devicePixelRatio === 'number' ? devicePixelRatio : 1);
  const w = Math.round(spec.width * dpr);
  const h = Math.round(spec.height * dpr);
  const key = `${spec.seed}-${spec.hue}-${spec.subject}-${w}x${h}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  const rand = rng(spec.seed);
  if (spec.subject === 'room') drawRoom(ctx, w, h, spec.hue, rand);
  else drawDish(ctx, w, h, spec.hue, rand);
  // Lumière de fenêtre en haut à gauche
  const light = ctx.createRadialGradient(w * 0.1, h * 0.05, 0, w * 0.1, h * 0.05, Math.max(w, h));
  light.addColorStop(0, 'rgba(255,255,255,0.22)');
  light.addColorStop(0.6, 'rgba(255,255,255,0)');
  ctx.fillStyle = light;
  ctx.fillRect(0, 0, w, h);
  grain(ctx, w, h, rand);
  const url = canvas.toDataURL('image/jpeg', 0.86);
  cache.set(key, url);
  return url;
}
