// Filtres : des contraintes strictes, jamais des bonus de classement.
//
// Un restaurant qui ne remplit pas un filtre explicite ne sort pas dans les
// résultats. Seule exception, documentée : avec « Ouvert maintenant » (ou
// « Ouvert à 23:00 »), une adresse aux horaires inconnus ou anciens n'est ni
// affichée comme ouverte ni cachée en silence ; elle rejoint un groupe séparé
// « Horaires non confirmés », replié par défaut.

import { deriveHalalStatus, meetsHalalLevel, type HalalConfig, type HalalFilterLevel, DEFAULT_HALAL_CONFIG } from './halal';
import { DEFAULT_HOURS_CONFIG, hoursConfidence, isOpenAt, localClock, openStatus, parseTime, type HoursConfig } from './hours';
import { distanceMeters, formatDistance } from './geo';
import { amenity, cuisine, cuisineWithDescendants, occasion, PRICE_LEVELS } from './taxonomy';
import type { Certifier, LatLng, PriceLevel, Restaurant } from './types';

export interface Filters {
  cuisines: string[];
  occasions: string[];
  priceMax?: PriceLevel;
  openNow: boolean;
  /** « Ouvert à 23:00 » aujourd'hui, heure locale de l'établissement. */
  openAt?: string;
  /** Rayon à vol d'oiseau autour de l'origine (position ou lieu cherché). */
  radius?: number;
  halalMin: HalalFilterLevel;
  certifiers: string[];
  amenities: string[];
  alcoholFree: boolean;
  /** Collection éditoriale affichée sur la carte. */
  collection?: { id: string; title: string; restaurantIds: string[] };
}

export const EMPTY_FILTERS: Filters = {
  cuisines: [],
  occasions: [],
  openNow: false,
  halalMin: 'any',
  certifiers: [],
  amenities: [],
  alcoholFree: false,
};

export type FilterKey =
  | 'collection'
  | 'cuisines'
  | 'occasions'
  | 'priceMax'
  | 'openNow'
  | 'openAt'
  | 'radius'
  | 'halalMin'
  | 'certifiers'
  | 'amenities'
  | 'alcoholFree';

export function activeFilterKeys(f: Filters): FilterKey[] {
  const keys: FilterKey[] = [];
  if (f.collection) keys.push('collection');
  if (f.cuisines.length) keys.push('cuisines');
  if (f.occasions.length) keys.push('occasions');
  if (f.priceMax) keys.push('priceMax');
  if (f.openNow) keys.push('openNow');
  if (f.openAt) keys.push('openAt');
  if (f.radius) keys.push('radius');
  if (f.halalMin !== 'any') keys.push('halalMin');
  if (f.certifiers.length) keys.push('certifiers');
  if (f.amenities.length) keys.push('amenities');
  if (f.alcoholFree) keys.push('alcoholFree');
  return keys;
}

export function removeFilter(f: Filters, key: FilterKey): Filters {
  switch (key) {
    case 'cuisines':
    case 'occasions':
    case 'certifiers':
    case 'amenities':
      return { ...f, [key]: [] };
    case 'openNow':
    case 'alcoholFree':
      return { ...f, [key]: false };
    case 'halalMin':
      return { ...f, halalMin: 'any' };
    default:
      return { ...f, [key]: undefined };
  }
}

const HALAL_FILTER_LABELS: Record<HalalFilterLevel, string> = {
  any: 'Tous niveaux',
  declared: 'Déclaré ou mieux',
  team_verified: 'Vérifié ou certifié',
  certified: 'Certifié uniquement',
};

export function halalFilterLabel(level: HalalFilterLevel): string {
  return HALAL_FILTER_LABELS[level];
}

/** Libellé court d'un filtre actif, pour les puces et le diagnostic. */
export function filterLabel(key: FilterKey, f: Filters, certifiers: Certifier[] = []): string {
  switch (key) {
    case 'collection':
      return f.collection?.title ?? 'Collection';
    case 'cuisines':
      return f.cuisines.map((id) => cuisine(id)?.label ?? id).join(', ');
    case 'occasions':
      return f.occasions.map((id) => occasion(id)?.label ?? id).join(', ');
    case 'priceMax':
      return f.priceMax ? `Jusqu'à ${PRICE_LEVELS[f.priceMax].symbol}` : '';
    case 'openNow':
      return 'Ouvert maintenant';
    case 'openAt':
      return f.openAt === '00:00' ? 'Ouvert à minuit' : `Ouvert à ${f.openAt?.replace(':00', ' h').replace(/^0/, '')}`;
    case 'radius':
      return f.radius ? `Moins de ${formatDistance(f.radius)}` : '';
    case 'halalMin':
      return HALAL_FILTER_LABELS[f.halalMin];
    case 'certifiers':
      return f.certifiers.map((id) => certifiers.find((c) => c.id === id)?.shortName ?? id).join(', ');
    case 'amenities':
      return f.amenities.map((id) => amenity(id)?.label ?? id).join(', ');
    case 'alcoholFree':
      return "Sans alcool servi";
  }
}

export interface FilterContext {
  now: Date;
  origin?: LatLng;
  certifiers: Certifier[];
  hoursConfig?: HoursConfig;
  halalConfig?: HalalConfig;
}

export type Verdict = 'match' | 'uncertain' | 'no';

export interface Evaluation {
  verdict: Verdict;
  /** Filtres qui écartent l'adresse. */
  failed: FilterKey[];
}

/** Évalue une adresse contre chaque filtre, séparément, pour pouvoir diagnostiquer. */
export function evaluate(r: Restaurant, f: Filters, ctx: FilterContext): Evaluation {
  const failed: FilterKey[] = [];
  let uncertain = false;
  const hoursCfg = ctx.hoursConfig ?? DEFAULT_HOURS_CONFIG;

  if (f.collection && !f.collection.restaurantIds.includes(r.id)) failed.push('collection');

  if (f.cuisines.length) {
    const wanted = new Set(f.cuisines.flatMap(cuisineWithDescendants));
    if (!r.cuisines.some((c) => wanted.has(c))) failed.push('cuisines');
  }
  // Plusieurs envies : il suffit d'en satisfaire une (« date » ou « cosy »).
  if (f.occasions.length && !r.occasions.some((o) => f.occasions.includes(o.id))) failed.push('occasions');

  // Prix inconnu : écarté, faute de pouvoir tenir la promesse du budget.
  if (f.priceMax && (!r.price || r.price.level > f.priceMax)) failed.push('priceMax');

  if (f.openNow) {
    const s = openStatus(r, ctx.now, hoursCfg);
    if (s.state === 'closed') failed.push('openNow');
    else if (s.state === 'unknown' || s.confidence !== 'confirmed') uncertain = true;
  }

  if (f.openAt) {
    const clock = localClock(ctx.now, r.timezone);
    const conf = hoursConfidence(r.hours, clock.date, hoursCfg);
    const live = r.publication === 'published' && (r.operating === 'operating');
    if (!live) failed.push('openAt');
    else if (!r.hours || conf === 'none') uncertain = true;
    else if (!isOpenAt(r.hours, clock.date, openAtMinutes(f.openAt))) failed.push('openAt');
    else if (conf !== 'confirmed') uncertain = true;
  }

  if (f.radius && ctx.origin && distanceMeters(ctx.origin, r.location) > f.radius) failed.push('radius');

  if (f.halalMin !== 'any' || f.certifiers.length) {
    const today = localClock(ctx.now, r.timezone).date;
    const status = deriveHalalStatus(r.halalClaims, today, ctx.certifiers, ctx.halalConfig ?? DEFAULT_HALAL_CONFIG);
    if (!meetsHalalLevel(status.level, f.halalMin)) failed.push('halalMin');
    if (f.certifiers.length && !(status.level === 'certified' && status.claim?.certifierId && f.certifiers.includes(status.claim.certifierId))) {
      failed.push('certifiers');
    }
  }

  // Équipements : tous requis, et seulement s'ils sont confirmés sur la fiche.
  if (f.amenities.length && !f.amenities.every((a) => r.amenities.includes(a))) failed.push('amenities');
  if (f.alcoholFree && r.alcohol !== 'not_served') failed.push('alcoholFree');

  return { verdict: failed.length ? 'no' : uncertain ? 'uncertain' : 'match', failed };
}

/** « Ouvert à 1h » vise la nuit qui vient, pas la nuit passée. */
export function openAtMinutes(hm: string): number {
  const m = parseTime(hm);
  return m < 6 * 60 ? m + 1440 : m;
}

export interface FilterResult {
  matches: Restaurant[];
  /** Ouverture non confirmée, quand un filtre d'ouverture est actif. */
  uncertain: Restaurant[];
}

export function applyFilters(list: Restaurant[], f: Filters, ctx: FilterContext): FilterResult {
  const matches: Restaurant[] = [];
  const uncertain: Restaurant[] = [];
  for (const r of list) {
    const { verdict } = evaluate(r, f, ctx);
    if (verdict === 'match') matches.push(r);
    else if (verdict === 'uncertain') uncertain.push(r);
  }
  return { matches, uncertain };
}

// ─── Diagnostic des recherches sans résultat ────────────────────────────────

export type FixKind = 'remove' | 'expand' | 'show_uncertain';

export interface Fix {
  kind: FixKind;
  key?: FilterKey;
  label: string;
  /** Nombre réel de résultats obtenus en appliquant la correction. */
  count: number;
}

export interface Diagnosis {
  fixes: Fix[];
  /** Combinaison absente de tout le catalogue : le dire plutôt que d'élargir sans fin. */
  impossible: boolean;
  /** Filtre le plus restrictif dans la zone. */
  culprit?: FilterKey;
}

/**
 * Propose au plus trois corrections chiffrées : retirer un filtre, élargir la
 * zone, montrer les adresses aux horaires non confirmés.
 */
export function diagnose(
  input: { inArea: Restaurant[]; wider: Restaurant[]; catalog: Restaurant[] },
  f: Filters,
  ctx: FilterContext,
): Diagnosis {
  const keys = activeFilterKeys(f);
  const fixes: Fix[] = [];
  const removalCounts = new Map<FilterKey, number>();

  for (const key of keys) {
    const relaxed = removeFilter(f, key);
    const count = applyFilters(input.inArea, relaxed, ctx).matches.length;
    removalCounts.set(key, count);
    if (count > 0) fixes.push({ kind: 'remove', key, label: `Retirer « ${filterLabel(key, f, ctx.certifiers)} »`, count });
  }

  const widerCount = applyFilters(input.wider, f, ctx).matches.length;
  if (widerCount > 0) fixes.push({ kind: 'expand', label: 'Élargir la zone', count: widerCount });

  const uncertainCount = applyFilters(input.inArea, f, ctx).uncertain.length;
  if (uncertainCount > 0) {
    fixes.push({ kind: 'show_uncertain', label: 'Voir les horaires non confirmés', count: uncertainCount });
  }

  const impossible = keys.length > 1 && applyFilters(input.catalog, f, ctx).matches.length === 0;
  const culprit = [...removalCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];

  // Élargir d'abord quand c'est possible : on garde ce que la personne a demandé.
  const order: Record<FixKind, number> = { expand: 0, remove: 1, show_uncertain: 2 };
  fixes.sort((a, b) => order[a.kind] - order[b.kind] || b.count - a.count);
  return { fixes: fixes.slice(0, 3), impossible, culprit };
}
