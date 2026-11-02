import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import { PERCENTILES, ageInWeeks, formatKg, lmsAt, weightAtZ } from '../lib/growth';
import { WHO_WEIGHT_WEEKS } from '../lib/whoWeight';
import type { Sex, Weight } from '../model';

const PAD = { top: 16, right: 34, bottom: 30, left: 30 };
const LABEL_GAP = 11;

interface Props {
  sex: Sex;
  birthDate: string;
  /** Pesées, de la plus ancienne à la plus récente. */
  weights: Weight[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

/**
 * Courbe de poids : les percentiles de l'OMS en fond (zones et lignes discrètes), les
 * pesées de bébé par-dessus, reliées, à la couleur de l'app. Âge en semaines, poids en kg.
 */
export function WeightChart({ sex, birthDate, weights, selectedId, onSelect }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(320);
  useLayoutEffect(() => {
    const el = box.current!;
    const update = () => setWidth(el.clientWidth || 320);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const height = Math.round(Math.min(300, Math.max(220, width * 0.7)));

  const points = weights.map((w) => ({ w, x: ageInWeeks(birthDate, w.at), y: w.grams / 1000 }));
  // De la naissance à un peu après aujourd'hui (au moins 13 semaines), graduations rondes.
  const need = Math.max(13, ageInWeeks(birthDate, Date.now()) + 2, ...points.map((p) => p.x + 1));
  const xStep = need <= 16 ? 2 : need <= 40 ? 4 : 8;
  const xMax = Math.min(WHO_WEIGHT_WEEKS, Math.ceil(need / xStep) * xStep);

  const samples: number[] = [];
  for (let w = 0; w <= xMax; w += 0.5) samples.push(w);
  const curves = PERCENTILES.map(({ p, z }) => ({ p, pts: samples.map((w) => [w, weightAtZ(lmsAt(sex, w), z)] as const) }));
  const lowest = Math.min(curves[0].pts[0][1], ...points.map((p) => p.y));
  const highest = Math.max(curves[curves.length - 1].pts[samples.length - 1][1], ...points.map((p) => p.y));
  const yStep = highest - lowest > 7 ? 2 : 1;
  const yMin = Math.max(0, Math.floor(lowest / yStep) * yStep);
  const yMax = Math.ceil(highest / yStep) * yStep;

  const sx = (w: number) => PAD.left + (w / xMax) * (width - PAD.left - PAD.right);
  const sy = (kg: number) => PAD.top + (1 - (kg - yMin) / (yMax - yMin)) * (height - PAD.top - PAD.bottom);
  const line = (pts: readonly (readonly [number, number])[]) =>
    pts.map(([w, kg], i) => `${i ? 'L' : 'M'}${sx(w).toFixed(1)},${sy(kg).toFixed(1)}`).join('');
  const band = (lo: number, hi: number) =>
    `${line(curves[lo].pts)}${line([...curves[hi].pts].reverse()).replace(/^M/, 'L')}Z`;

  const xTicks = Array.from({ length: xMax / xStep + 1 }, (_, i) => i * xStep);
  const yTicks = Array.from({ length: (yMax - yMin) / yStep + 1 }, (_, i) => yMin + i * yStep);

  // Étiquettes des percentiles en bout de courbe, écartées si elles se chevauchent.
  const labels = curves.map((c) => ({ p: c.p, y: sy(c.pts[c.pts.length - 1][1]) }));
  for (let i = labels.length - 2; i >= 0; i--) labels[i].y = Math.max(labels[i].y, labels[i + 1].y + LABEL_GAP);

  const selected = points.find((p) => p.w.id === selectedId) ?? points[points.length - 1];

  return (
    <div class="weight-chart" ref={box}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Courbe de poids de bébé sur les courbes de l'OMS">
        <g class="chart-grid">
          {yTicks.map((kg) => (
            <g key={kg}>
              <line x1={PAD.left} x2={width - PAD.right} y1={sy(kg)} y2={sy(kg)} />
              <text x={PAD.left - 6} y={sy(kg) + 4} text-anchor="end">
                {kg}
              </text>
            </g>
          ))}
          {xTicks.map((w) => (
            <text key={w} x={sx(w)} y={height - PAD.bottom + 16} text-anchor="middle">
              {w}
            </text>
          ))}
          <text x={PAD.left - 6} y={PAD.top - 6} text-anchor="end" class="chart-unit">
            kg
          </text>
          <text x={width - PAD.right} y={height - 2} text-anchor="end" class="chart-unit">
            âge en semaines
          </text>
        </g>

        <path class="who-band who-band-outer" d={band(0, 4)} />
        <path class="who-band who-band-inner" d={band(1, 3)} />
        {curves.map((c) => (
          <path key={c.p} class={`who-line${c.p === 50 ? ' is-median' : c.p === 3 || c.p === 97 ? ' is-outer' : ''}`} d={line(c.pts)} />
        ))}
        <g class="chart-labels">
          {labels.map((l) => (
            <text key={l.p} x={width - PAD.right + 5} y={l.y + 3.5}>
              {l.p}e
            </text>
          ))}
        </g>

        {points.length > 1 && <path class="baby-line" d={line(points.map((p) => [p.x, p.y] as const))} />}
        {points.map((p) => (
          <circle key={p.w.id} class={`baby-dot${p === selected ? ' is-selected' : ''}`} cx={sx(p.x)} cy={sy(p.y)} r={p === selected ? 6 : 4.5} />
        ))}
        {/* Zones de toucher plus grandes que les points. */}
        {points.map((p) => (
          <circle
            key={`hit-${p.w.id}`}
            class="baby-hit"
            cx={sx(p.x)}
            cy={sy(p.y)}
            r={16}
            role="button"
            tabIndex={0}
            aria-label={`Pesée : ${formatKg(p.w.grams)}`}
            onClick={() => onSelect(p.w.id)}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onSelect(p.w.id)}
          />
        ))}
      </svg>
    </div>
  );
}
