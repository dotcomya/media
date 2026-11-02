// Classement : interprétable, mesurable, réglable sans redéploiement.
//
// score = Σ poids × signal, chaque signal entre 0 et 1. Les poids viennent de
// la configuration produit (back-office) ; chaque résultat garde le détail de
// son score pour répondre à « Pourquoi ce résultat ? ».
//
// Ce qui n'entre jamais dans le score : le paiement. Une campagne sponsorisée
// occupe un emplacement séparé, étiqueté, et seulement si l'adresse respecte
// déjà tous les filtres. Le niveau de preuve halal n'est pas à vendre.

import { deriveHalalStatus, TRUST_LEVELS, type HalalStatus, DEFAULT_HALAL_CONFIG, type HalalConfig } from './halal';
import { DEFAULT_HOURS_CONFIG, localClock, openStatus, type HoursConfig, type OpenStatus } from './hours';
import { distanceMeters, formatDistance } from './geo';
import { textMatch } from './query';
import { occasion } from './taxonomy';
import type { Certifier, ISODate, LatLng, Restaurant } from './types';

export type Signal = 'text' | 'proximity' | 'occasion' | 'openness' | 'completeness' | 'freshness' | 'editorial';

export interface RankingConfig {
  weights: Record<Signal, number>;
  /** Distance (m) à laquelle le signal de proximité vaut 1/e. */
  proximityScale: number;
  /** Position (1 = première) de l'emplacement sponsorisé dans une page. */
  sponsoredSlot: number;
  pageSize: number;
}

export const DEFAULT_RANKING: RankingConfig = {
  weights: { text: 3, proximity: 2, occasion: 1.2, openness: 1, completeness: 0.8, freshness: 0.8, editorial: 0.5 },
  proximityScale: 1200,
  sponsoredSlot: 3,
  pageSize: 20,
};

export interface RankContext {
  now: Date;
  /** Point de référence : la position, sinon le centre du lieu cherché. */
  origin?: LatLng;
  originIsUser: boolean;
  text: string;
  dishTerms: string[];
  occasions: string[];
  certifiers: Certifier[];
  hoursConfig?: HoursConfig;
  halalConfig?: HalalConfig;
}

export interface Reason {
  signal: Signal;
  value: number;
  contribution: number;
  /** Phrase lisible, ou rien si le signal est trop faible pour être cité. */
  text?: string;
}

export interface Ranked {
  restaurant: Restaurant;
  score: number;
  reasons: Reason[];
  distance?: number;
  open: OpenStatus;
  halal: HalalStatus;
  /** Insertion payante : toujours affichée avec la mention « Sponsorisé ». */
  sponsored: boolean;
}

/** Part des informations utiles réellement renseignées. */
export function completeness(r: Restaurant, today: ISODate, hoursCfg: HoursConfig = DEFAULT_HOURS_CONFIG): number {
  const checks = [
    r.media.some((m) => m.kind === 'photo'),
    r.description.length >= 60,
    !!r.hours && !!r.hours.verifiedAt && (Date.parse(today) - Date.parse(r.hours.verifiedAt)) / 86_400_000 <= hoursCfg.staleAfterDays,
    !!r.price,
    !!(r.contact.phone || r.contact.website || r.contact.instagram),
    !!r.contact.menuUrl,
    r.amenities.length >= 2,
  ];
  return checks.filter(Boolean).length / checks.length;
}

function freshnessSignal(h: HalalStatus): number {
  if (h.level === 'unconfirmed') return 0;
  return (h.freshness === 'fresh' ? 1 : 0.5) * (0.55 + 0.15 * TRUST_LEVELS[h.level].rank);
}

function opennessSignal(s: OpenStatus): number {
  if (s.state === 'open') return s.confidence === 'confirmed' ? (s.closingSoon ? 0.6 : 1) : 0.7;
  if (s.state === 'unknown') return 0.4;
  return 0.1;
}

function monthsAgo(date: ISODate, today: ISODate): string {
  const days = Math.max(0, Math.round((Date.parse(today) - Date.parse(date)) / 86_400_000));
  if (days < 31) return 'ce mois-ci';
  const m = Math.round(days / 30.4);
  return m === 1 ? 'il y a 1 mois' : `il y a ${m} mois`;
}

export function rankOne(r: Restaurant, ctx: RankContext, cfg: RankingConfig = DEFAULT_RANKING): Ranked {
  const today = localClock(ctx.now, r.timezone).date;
  const halal = deriveHalalStatus(r.halalClaims, today, ctx.certifiers, ctx.halalConfig ?? DEFAULT_HALAL_CONFIG);
  const open = openStatus(r, ctx.now, ctx.hoursConfig ?? DEFAULT_HOURS_CONFIG);
  const distance = ctx.origin ? distanceMeters(ctx.origin, r.location) : undefined;

  const values: Record<Signal, number> = {
    text: ctx.text || ctx.dishTerms.length ? textMatch(r, ctx.text, ctx.dishTerms) : 0,
    proximity: distance === undefined ? 0 : Math.exp(-distance / cfg.proximityScale),
    occasion: ctx.occasions.length
      ? Math.max(0, ...r.occasions.filter((o) => ctx.occasions.includes(o.id)).map((o) => o.strength / 2))
      : 0,
    openness: opennessSignal(open),
    completeness: completeness(r, today, ctx.hoursConfig),
    freshness: freshnessSignal(halal),
    editorial: r.editorialPick ? 1 : 0,
  };

  const reasons: Reason[] = (Object.keys(values) as Signal[]).map((signal) => {
    const value = values[signal];
    const contribution = value * cfg.weights[signal];
    let text: string | undefined;
    switch (signal) {
      case 'text':
        if (value >= 0.8) text = 'Correspond au nom cherché';
        else if (value >= 0.3) text = 'Correspond à ta recherche';
        break;
      case 'proximity':
        if (distance !== undefined && value >= 0.3) {
          text = `À ${formatDistance(distance)} ${ctx.originIsUser ? 'de toi' : 'du centre de la zone'}, à vol d'oiseau`;
        }
        break;
      case 'occasion': {
        const best = r.occasions.filter((o) => ctx.occasions.includes(o.id)).sort((a, b) => b.strength - a.strength)[0];
        if (best) text = `${best.strength === 2 ? 'Idéal' : 'Convient'} : ${occasion(best.id)?.label.toLowerCase()}`;
        break;
      }
      case 'openness':
        if (open.state === 'open' && open.confidence === 'confirmed') text = 'Ouvert maintenant, horaires confirmés';
        break;
      case 'completeness':
        if (value >= 0.7) text = 'Fiche complète';
        break;
      case 'freshness':
        if (halal.lastCheckedAt && value > 0) text = `Info halal vérifiée ${monthsAgo(halal.lastCheckedAt, today)}`;
        break;
      case 'editorial':
        if (value) text = 'Coup de cœur de la rédaction';
        break;
    }
    return { signal, value, contribution, text };
  });

  const score = reasons.reduce((s, x) => s + x.contribution, 0);
  return { restaurant: r, score, reasons, distance, open, halal, sponsored: false };
}

export type SortKey = 'relevance' | 'distance' | 'price' | 'newest';

export const SORT_LABELS: Record<SortKey, string> = {
  relevance: 'Pertinence',
  distance: 'Distance',
  price: 'Budget',
  newest: 'Nouveautés',
};

/** Ordre stable : à égalité, l'identifiant départage (carte et liste restent synchrones). */
export function sortRanked(list: Ranked[], key: SortKey): Ranked[] {
  const byId = (a: Ranked, b: Ranked) => a.restaurant.id.localeCompare(b.restaurant.id);
  const cmp: Record<SortKey, (a: Ranked, b: Ranked) => number> = {
    relevance: (a, b) => b.score - a.score || byId(a, b),
    distance: (a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity) || byId(a, b),
    price: (a, b) => (a.restaurant.price?.level ?? 9) - (b.restaurant.price?.level ?? 9) || b.score - a.score || byId(a, b),
    newest: (a, b) => (b.restaurant.publishedAt ?? '').localeCompare(a.restaurant.publishedAt ?? '') || byId(a, b),
  };
  return [...list].sort(cmp[key]);
}

export function rank(list: Restaurant[], ctx: RankContext, sort: SortKey = 'relevance', cfg: RankingConfig = DEFAULT_RANKING): Ranked[] {
  return sortRanked(
    list.map((r) => rankOne(r, ctx, cfg)),
    sort,
  );
}

/** Campagne active à cette date ? */
export function isCampaignActive(r: Restaurant, today: ISODate): boolean {
  return !!r.sponsored && r.sponsored.from <= today && today <= r.sponsored.to;
}

/**
 * Emplacement sponsorisé.
 * - les candidates respectent déjà tous les filtres (même pipeline que l'organique) ;
 * - au plus une adresse sous campagne est remontée à l'emplacement prévu, si elle
 *   se classait plus bas ; elle est déplacée, jamais dupliquée ;
 * - toute adresse sous campagne active est étiquetée « Sponsorisé », même quand
 *   elle se classe seule au-dessus de l'emplacement : la relation commerciale
 *   est toujours visible (Code de la consommation, art. L111-7, à confirmer
 *   par un avis juridique).
 */
export function insertSponsored(organic: Ranked[], today: ISODate, cfg: RankingConfig = DEFAULT_RANKING): Ranked[] {
  const slot = cfg.sponsoredSlot - 1;
  const labelled = organic.map((x) => (isCampaignActive(x.restaurant, today) ? { ...x, sponsored: true } : x));
  const already = labelled.slice(0, slot + 1).some((x) => x.sponsored);
  const candidate = labelled
    .map((x, i) => ({ x, i }))
    .filter(({ x, i }) => i > slot && x.sponsored)
    .sort((a, b) => b.x.score - a.x.score)[0];
  if (already || !candidate || labelled.length <= slot) return labelled;
  const rest = labelled.filter((_, i) => i !== candidate.i);
  rest.splice(slot, 0, candidate.x);
  return rest;
}
