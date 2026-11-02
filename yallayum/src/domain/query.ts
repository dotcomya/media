// Compréhension de la recherche : « burger à Saint-Denis ouvert après 23h ».
//
// Pas de modèle de langage pour une recherche simple : un lexique (lieux,
// cuisines, plats, envies, services) et quelques motifs suffisent, sont
// prévisibles et testables. Tout ce qui est compris s'affiche en puces
// modifiables (« Compris : Saint-Denis · Burger · Ouvert à 23h ») ; le reste
// sert à chercher un nom de restaurant.

import { distanceMeters } from './geo';
import { PLACES, placeKeys, placesNamed, searchPlaces, type Place } from './places';
import { AMENITIES, CUISINES, OCCASIONS, priceLevelForBudget, cuisine, occasion, amenity } from './taxonomy';
import { normalize, typoBudget, editDistance } from './text';
import type { LatLng, PriceLevel, Restaurant } from './types';

export type ChipKind = 'place' | 'near_me' | 'cuisine' | 'occasion' | 'amenity' | 'price' | 'open_now' | 'open_at' | 'text';

export interface Chip {
  kind: ChipKind;
  label: string;
  /** Identifiant de taxonomie ou de lieu, pour retirer la puce. */
  id?: string;
}

export interface Interpretation {
  raw: string;
  place?: Place;
  /** Homonymes du lieu retenu, proposés en un geste. */
  placeAlternatives: Place[];
  nearMe: boolean;
  cuisines: string[];
  occasions: string[];
  amenities: string[];
  priceMax?: PriceLevel;
  openNow: boolean;
  openAt?: string;
  /** Mots de plats reconnus (« tajine ») : servent aussi au classement textuel. */
  dishTerms: string[];
  /** Reste de la requête, cherché dans les noms. */
  text: string;
  chips: Chip[];
  /** Mots volontairement ignorés (« halal », « resto »). */
  ignored: string[];
}

type Entry =
  | { kind: 'place'; key: string }
  | { kind: 'cuisine'; key: string; id: string; dish: boolean }
  | { kind: 'occasion'; key: string; id: string }
  | { kind: 'amenity'; key: string; id: string }
  | { kind: 'open_now'; key: string }
  | { kind: 'late'; key: string }
  | { kind: 'near_me'; key: string }
  | { kind: 'price'; key: string; level: PriceLevel }
  | { kind: 'noise'; key: string };

const NOISE = ['halal', 'resto', 'restos', 'restaurant', 'restaurants', 'manger', 'bouffer', 'miam', 'yum', 'cuisine', 'un', 'une', 'des', 'le', 'la', 'les', 'de', 'du', 'a', 'au', 'aux', 'en', 'dans', 'sur', 'pour', 'avec', 'et', 'vers', 'cote', 'quartier', 'bon', 'bonne', 'bons', 'meilleur', 'meilleurs', 'top', 'spot', 'spots', 'adresse', 'adresses', 'endroit', 'ou', 'quelque', 'chose', 'truc', 'ce', 'soir', 'midi'];

function buildLexicon(): Map<string, Entry> {
  const lex = new Map<string, Entry>();
  const add = (e: Entry) => {
    if (!lex.has(e.key)) lex.set(e.key, e);
  };
  // Ordre de priorité : services et horaires, envies, cuisines, lieux, bruit.
  for (const k of ['ouvert', 'ouvert maintenant', 'ouvert now', 'ouvert actuellement', 'encore ouvert', 'ouverts']) add({ kind: 'open_now', key: k });
  for (const k of ['tard', 'tard le soir', 'ouvert tard', 'late', 'nuit', 'de nuit', 'apres minuit']) add({ kind: 'late', key: k });
  for (const k of ['autour de moi', 'pres de moi', 'a cote de moi', 'proche de moi', 'ici', 'a proximite', 'a cote', 'pres d ici']) add({ kind: 'near_me', key: k });
  for (const k of ['pas cher', 'pas chere', 'petit budget', 'petit prix', 'petits prix', 'budget', 'economique', 'bon marche']) add({ kind: 'price', key: k, level: 1 });
  for (const k of ['abordable', 'prix moyen']) add({ kind: 'price', key: k, level: 2 });
  for (const a of AMENITIES) for (const s of a.synonyms) add({ kind: 'amenity', key: normalize(s), id: a.id });
  for (const o of OCCASIONS) for (const s of [o.label, ...o.synonyms]) add({ kind: 'occasion', key: normalize(s), id: o.id });
  for (const c of CUISINES) {
    const labelKey = normalize(c.label);
    add({ kind: 'cuisine', key: labelKey, id: c.id, dish: false });
    for (const s of c.synonyms) {
      const key = normalize(s);
      // Un synonyme qui n'est pas un adjectif de cuisine est un plat (« tajine », « ramen »).
      const dish = !/(ais|aise|ain|aine|ien|ienne|ois|oise|que)$/.test(key) || key.includes(' ');
      add({ kind: 'cuisine', key, id: c.id, dish });
    }
  }
  for (const key of placeKeys()) add({ kind: 'place', key });
  for (const k of NOISE) add({ kind: 'noise', key: k });
  return lex;
}

let LEXICON: Map<string, Entry> | undefined;
let FUZZY_KEYS: string[] | undefined;

function lexicon(): Map<string, Entry> {
  LEXICON ??= buildLexicon();
  return LEXICON;
}

/** Clés d'un seul mot éligibles à la tolérance aux fautes. */
function fuzzyKeys(): string[] {
  FUZZY_KEYS ??= [...lexicon().entries()]
    .filter(([k, e]) => !k.includes(' ') && k.length >= 4 && e.kind !== 'noise' && e.kind !== 'place')
    .map(([k]) => k);
  return FUZZY_KEYS;
}

const MAX_NGRAM = 4;

export interface InterpretOptions {
  /** Position de la personne, pour départager les homonymes. */
  origin?: LatLng;
}

export function interpret(raw: string, opts: InterpretOptions = {}): Interpretation {
  const out: Interpretation = {
    raw,
    placeAlternatives: [],
    nearMe: false,
    cuisines: [],
    occasions: [],
    amenities: [],
    openNow: false,
    dishTerms: [],
    text: '',
    chips: [],
    ignored: [],
  };
  let q = normalize(raw);

  // Motifs chiffrés avant le découpage en mots.
  q = q.replace(/\b(?:ouvert )?(?:apres|a partir de|vers) (\d{1,2}) ?h ?(\d{2})?\b/g, (_, h: string, m?: string) => {
    out.openAt = `${String(Number(h) % 24).padStart(2, '0')}:${m ?? '00'}`;
    return ' ';
  });
  // « 15e » reste un arrondissement : un prix exige « € », « eur » ou « euros ».
  q = q.replace(/\b(?:(?:moins de|max|maximum|pas plus de|budget de|budget|a) )?(\d{1,3}) ?(?:€|eur\b|euros?\b)(?: par personne| par pers| pp)?/g, (_, n: string) => {
    out.priceMax = priceLevelForBudget(Number(n));
    return ' ';
  });
  q = q.replace(/\b(\d{1,2}) ?(?:personnes|pers|potes|amis)\b/g, (_, n: string) => {
    if (Number(n) >= 6) out.amenities.push('groupes');
    return ' ';
  });
  q = q.replace(/(€{1,4})/g, (m: string) => {
    out.priceMax = Math.min(4, m.length) as PriceLevel;
    return ' ';
  });

  const words = q.split(' ').filter(Boolean);
  const lex = lexicon();
  const leftovers: string[] = [];
  let i = 0;
  while (i < words.length) {
    let matched = false;
    for (let n = Math.min(MAX_NGRAM, words.length - i); n >= 1; n--) {
      const phrase = words.slice(i, i + n).join(' ');
      const entry = lex.get(phrase);
      if (entry) {
        apply(out, entry, phrase, opts);
        i += n;
        matched = true;
        break;
      }
    }
    if (matched) continue;
    const w = words[i];
    const fuzzy = typoBudget(w) > 0 ? fuzzyKeys().find((k) => editDistance(w, k, typoBudget(k)) <= typoBudget(k)) : undefined;
    if (fuzzy) apply(out, lex.get(fuzzy)!, fuzzy, opts);
    else leftovers.push(w);
    i++;
  }

  out.text = leftovers.join(' ');
  out.cuisines = [...new Set(out.cuisines)];
  out.occasions = [...new Set(out.occasions)];
  out.amenities = [...new Set(out.amenities)];
  out.chips = buildChips(out);
  return out;
}

function apply(out: Interpretation, e: Entry, phrase: string, opts: InterpretOptions) {
  switch (e.kind) {
    case 'place': {
      if (out.place) return;
      const candidates = placesNamed(phrase);
      const ranked = rankHomonyms(candidates, opts.origin);
      out.place = ranked[0];
      out.placeAlternatives = ranked.slice(1);
      return;
    }
    case 'cuisine':
      out.cuisines.push(e.id);
      if (e.dish) out.dishTerms.push(phrase);
      return;
    case 'occasion':
      out.occasions.push(e.id);
      return;
    case 'amenity':
      out.amenities.push(e.id);
      return;
    case 'open_now':
      out.openNow = true;
      return;
    case 'late':
      out.openAt ??= '23:00';
      return;
    case 'near_me':
      out.nearMe = true;
      return;
    case 'price':
      out.priceMax = e.level;
      return;
    case 'noise':
      out.ignored.push(phrase);
  }
}

/** Homonymes : le plus proche de la personne, sinon le plus peuplé. */
export function rankHomonyms(candidates: Place[], origin?: LatLng): Place[] {
  return [...candidates].sort((a, b) =>
    origin
      ? distanceMeters(origin, a.center) - distanceMeters(origin, b.center)
      : (b.population ?? 0) - (a.population ?? 0),
  );
}

function buildChips(i: Interpretation): Chip[] {
  const chips: Chip[] = [];
  if (i.place) chips.push({ kind: 'place', label: i.place.name, id: i.place.id });
  if (i.nearMe) chips.push({ kind: 'near_me', label: 'Autour de moi' });
  for (const id of i.cuisines) chips.push({ kind: 'cuisine', label: cuisine(id)?.label ?? id, id });
  for (const id of i.occasions) chips.push({ kind: 'occasion', label: occasion(id)?.label ?? id, id });
  for (const id of i.amenities) chips.push({ kind: 'amenity', label: amenity(id)?.label ?? id, id });
  if (i.priceMax) chips.push({ kind: 'price', label: `Jusqu'à ${'€'.repeat(i.priceMax)}` });
  if (i.openNow) chips.push({ kind: 'open_now', label: 'Ouvert maintenant' });
  if (i.openAt) chips.push({ kind: 'open_at', label: i.openAt === '00:00' ? 'Ouvert à minuit' : `Ouvert à ${i.openAt.replace(':00', ' h').replace(/^0/, '')}` });
  if (i.text) chips.push({ kind: 'text', label: `« ${i.text} »` });
  return chips;
}

// ─── Correspondance textuelle ───────────────────────────────────────────────

/** Force de correspondance (0–1) entre les mots libres et un restaurant. */
export function textMatch(r: Restaurant, text: string, dishTerms: string[] = []): number {
  const q = normalize(text);
  let score = 0;
  if (q) {
    const name = normalize(r.name);
    if (name === q) score = 1;
    else if (name.startsWith(q)) score = 0.9;
    else if (name.includes(q)) score = 0.8;
    else {
      const words = q.split(' ');
      const nameWords = name.split(' ');
      const hits = words.filter((w) => nameWords.some((n) => n === w || (w.length >= 4 && editDistance(w, n, typoBudget(n)) <= typoBudget(n))));
      if (hits.length) score = 0.6 * (hits.length / words.length);
      else if (normalize(r.description).includes(q)) score = 0.3;
    }
  }
  if (dishTerms.length) {
    const desc = normalize(r.description);
    if (dishTerms.some((d) => desc.includes(d))) score = Math.max(score, 0.5);
  }
  return score;
}

// ─── Autocomplétion ─────────────────────────────────────────────────────────

export type SuggestionType = 'place' | 'restaurant' | 'cuisine' | 'occasion';

export interface Suggestion {
  type: SuggestionType;
  id: string;
  label: string;
  detail?: string;
}

export interface SuggestionGroups {
  places: Suggestion[];
  restaurants: Suggestion[];
  cuisines: Suggestion[];
  occasions: Suggestion[];
}

/**
 * Suggestions groupées par type, sur le dernier fragment saisi et sur la saisie
 * entière. `origin` (position, sinon centre de la carte) ordonne les lieux homonymes.
 */
export function autocomplete(input: string, catalog: Restaurant[], origin?: LatLng, limit = 4): SuggestionGroups {
  const q = normalize(input);
  const empty: SuggestionGroups = { places: [], restaurants: [], cuisines: [], occasions: [] };
  if (q.length < 2) return empty;
  const last = q.split(' ').at(-1) ?? q;
  const starts = (key: string) => key.startsWith(q) || (last.length >= 2 && key.startsWith(last)) || key.includes(` ${q}`);

  const places = searchPlaces(q, limit, origin).concat(q !== last ? searchPlaces(last, limit, origin) : []);
  const uniquePlaces = [...new Map(places.map((p) => [p.id, p])).values()].slice(0, limit);

  const restaurants = catalog
    .map((r) => ({ r, s: textMatch(r, q) }))
    .filter((x) => x.s >= 0.6)
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map(({ r }) => ({ type: 'restaurant' as const, id: r.id, label: r.name, detail: r.address.neighbourhood ?? r.address.district }));

  const cuisines = CUISINES.filter((c) => [c.label, ...c.synonyms].some((s) => starts(normalize(s))))
    .slice(0, limit)
    .map((c) => ({ type: 'cuisine' as const, id: c.id, label: c.label }));

  const occasions = OCCASIONS.filter((o) => [o.label, ...o.synonyms].some((s) => starts(normalize(s))))
    .slice(0, limit)
    .map((o) => ({ type: 'occasion' as const, id: o.id, label: o.label }));

  return {
    places: uniquePlaces.map((p) => ({ type: 'place', id: p.id, label: p.name, detail: p.context })),
    restaurants,
    cuisines,
    occasions,
  };
}

export function placeById(id: string): Place | undefined {
  return PLACES.find((p) => p.id === id);
}
