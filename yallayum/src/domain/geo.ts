// Géométrie : distances géodésiques et zones de recherche.
//
// Une distance calculée ici est « à vol d'oiseau » et s'affiche comme telle.
// Un temps de trajet ne vient que d'un service de routage (voir
// docs/06-recherche-classement.md) : jamais d'une division de cette distance
// par une vitesse moyenne présentée comme « 7 min à pied ».

import type { BBox, LatLng } from './types';

const EARTH_RADIUS_M = 6_371_008.8;

export function distanceMeters(a: LatLng, b: LatLng): number {
  const toRad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toRad;
  const dLng = (b.lng - a.lng) * toRad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * toRad) * Math.cos(b.lat * toRad) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function inBBox(p: LatLng, [w, s, e, n]: BBox): boolean {
  return p.lng >= w && p.lng <= e && p.lat >= s && p.lat <= n;
}

export function bboxCenter([w, s, e, n]: BBox): LatLng {
  return { lat: (s + n) / 2, lng: (w + e) / 2 };
}

/** Agrandit (ou réduit) une zone autour de son centre. */
export function scaleBBox([w, s, e, n]: BBox, factor: number): BBox {
  const cx = (w + e) / 2;
  const cy = (s + n) / 2;
  const hw = ((e - w) / 2) * factor;
  const hh = ((n - s) / 2) * factor;
  return [cx - hw, cy - hh, cx + hw, cy + hh];
}

/** Zone carrée de `radius` mètres autour d'un point. */
export function bboxAround(p: LatLng, radius: number): BBox {
  const dLat = radius / 111_320;
  const dLng = radius / (111_320 * Math.cos((p.lat * Math.PI) / 180));
  return [p.lng - dLng, p.lat - dLat, p.lng + dLng, p.lat + dLat];
}

export function bboxOf(points: LatLng[]): BBox | undefined {
  if (points.length === 0) return undefined;
  let w = Infinity;
  let s = Infinity;
  let e = -Infinity;
  let n = -Infinity;
  for (const p of points) {
    w = Math.min(w, p.lng);
    e = Math.max(e, p.lng);
    s = Math.min(s, p.lat);
    n = Math.max(n, p.lat);
  }
  return [w, s, e, n];
}

/** Demi-diagonale de la zone, en mètres : l'échelle « naturelle » de proximité. */
export function bboxRadius(b: BBox): number {
  return distanceMeters({ lat: b[1], lng: b[0] }, { lat: b[3], lng: b[2] }) / 2;
}

/** « 350 m », « 1,2 km », « 12 km ». */
export function formatDistance(meters: number): string {
  if (meters < 950) return `${Math.max(50, Math.round(meters / 50) * 50)} m`;
  if (meters < 9_950) return `${(meters / 1000).toFixed(1).replace('.', ',')} km`;
  return `${Math.round(meters / 1000)} km`;
}
