// La recherche de bout en bout : zone → fiches visibles → filtres stricts →
// classement → tri → emplacement sponsorisé → diagnostic si rien ne sort.
//
// Le même pipeline tourne côté serveur en production (avec PostGIS pour la
// zone, voir docs/06-recherche-classement.md) ; ici il sert le prototype et
// les tests de recette.

import { applyFilters, diagnose, type Diagnosis, type Filters } from './filters';
import { inBBox, scaleBBox } from './geo';
import { localClock } from './hours';
import { isDiscoverable } from './publication';
import { DEFAULT_RANKING, insertSponsored, rank, type Ranked, type RankingConfig, type SortKey } from './ranking';
import type { BBox, Certifier, LatLng, Restaurant } from './types';

export interface SearchRequest {
  /** Zone cherchée : la carte au moment où la personne a lancé la recherche. */
  area: BBox;
  origin?: LatLng;
  originIsUser: boolean;
  text: string;
  dishTerms: string[];
  filters: Filters;
  sort: SortKey;
  now: Date;
}

export interface SearchResponse {
  results: Ranked[];
  /** Adresses dont l'ouverture n'est pas confirmée (filtre d'ouverture actif). */
  uncertain: Ranked[];
  /** Aucune adresse référencée dans la zone, filtres ou pas. */
  areaEmpty: boolean;
  diagnosis?: Diagnosis;
}

export function search(
  catalog: Restaurant[],
  req: SearchRequest,
  certifiers: Certifier[],
  cfg: RankingConfig = DEFAULT_RANKING,
): SearchResponse {
  const visible = catalog.filter(isDiscoverable);
  const inArea = visible.filter((r) => inBBox(r.location, req.area));
  const fctx = { now: req.now, origin: req.origin, certifiers };
  const { matches, uncertain } = applyFilters(inArea, req.filters, fctx);

  // Une recherche par nom (« Les Braises ») doit trouver le nom, pas seulement la zone.
  const textual = req.text.trim().length > 0;
  const rctx = {
    now: req.now,
    origin: req.origin,
    originIsUser: req.originIsUser,
    text: req.text,
    dishTerms: req.dishTerms,
    occasions: req.filters.occasions,
    certifiers,
  };
  let ranked = rank(matches, rctx, req.sort, cfg);
  if (textual) ranked = ranked.filter((x) => x.reasons.find((r) => r.signal === 'text')!.value >= 0.3);

  const today = localClock(req.now, inArea[0]?.timezone ?? 'Europe/Paris').date;
  const results = req.sort === 'relevance' ? insertSponsored(ranked, today, cfg) : ranked;

  const response: SearchResponse = {
    results,
    uncertain: rank(uncertain, rctx, req.sort, cfg),
    areaEmpty: inArea.length === 0,
  };
  if (results.length === 0) {
    const wider = visible.filter((r) => inBBox(r.location, scaleBBox(req.area, 2.5)));
    response.diagnosis = diagnose({ inArea, wider, catalog: visible }, req.filters, fctx);
  }
  return response;
}
