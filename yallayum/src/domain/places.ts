// Lieux reconnus par la recherche : villes, arrondissements, quartiers, gares.
//
// En production, ce référentiel vient d'un géocodeur (BAN pour les adresses
// françaises, un fournisseur commercial ou Photon pour les lieux) mis en cache
// côté serveur. Ce jeu initial couvre la zone de démonstration et montre les
// règles : homonymes (Saint-Denis 93 / La Réunion), arrondissements écrits de
// dix façons, zones non couvertes annoncées comme telles.

import { bboxAround, distanceMeters } from './geo';
import { normalize } from './text';
import type { BBox, LatLng } from './types';

export type PlaceKind = 'city' | 'district' | 'neighbourhood' | 'station';

export interface Place {
  id: string;
  name: string;
  /** Précision affichée pour lever une ambiguïté : « Seine-Saint-Denis », « La Réunion ». */
  context: string;
  kind: PlaceKind;
  center: LatLng;
  /** Rayon utile en mètres, pour cadrer la carte. */
  radius: number;
  aliases: string[];
  /** Population approximative : départage les homonymes en l'absence de position. */
  population?: number;
}

const P = (
  id: string,
  name: string,
  context: string,
  kind: PlaceKind,
  lat: number,
  lng: number,
  radius: number,
  aliases: string[] = [],
  population?: number,
): Place => ({ id, name, context, kind, center: { lat, lng }, radius, aliases, population });

const ARRONDISSEMENT_CENTERS: [number, number][] = [
  [48.8625, 2.3364],
  [48.8683, 2.3428],
  [48.863, 2.3601],
  [48.8543, 2.3576],
  [48.8445, 2.3497],
  [48.8491, 2.3328],
  [48.8562, 2.3122],
  [48.8727, 2.3125],
  [48.877, 2.3375],
  [48.8761, 2.3608],
  [48.8591, 2.38],
  [48.8409, 2.388],
  [48.8283, 2.3622],
  [48.8292, 2.3266],
  [48.8401, 2.2928],
  [48.8603, 2.262],
  [48.8873, 2.3067],
  [48.8925, 2.3484],
  [48.8871, 2.3848],
  [48.8634, 2.4011],
];

const ARRONDISSEMENTS = ARRONDISSEMENT_CENTERS.map(([lat, lng], i) => [i + 1, lat, lng] as const);

function arrondissementAliases(n: number): string[] {
  const ord = n === 1 ? ['1er', '1ere', 'premier'] : [`${n}e`, `${n}eme`, `${n}em`, `${n}ieme`];
  const cp = `750${String(n).padStart(2, '0')}`;
  return [...ord.flatMap((o) => [o, `paris ${o}`]), `paris ${n}`, cp, `${o2(n)} arrondissement`];
}

function o2(n: number): string {
  return n === 1 ? '1er' : `${n}e`;
}

export const PLACES: Place[] = [
  P('paris', 'Paris', 'Île-de-France', 'city', 48.8566, 2.3522, 5200, ['paname', 'ville de paris'], 2_100_000),
  ...ARRONDISSEMENTS.map(([n, lat, lng]) =>
    P(`paris-${n}`, `Paris ${o2(n)}`, `${o2(n)} arrondissement`, 'district', lat, lng, 1300, arrondissementAliases(n)),
  ),
  // Quartiers
  P('republique', 'République', 'Paris 3e, 10e, 11e', 'neighbourhood', 48.8674, 2.3636, 600, ['place de la republique']),
  P('bastille', 'Bastille', 'Paris 4e, 11e, 12e', 'neighbourhood', 48.8532, 2.3692, 600),
  P('oberkampf', 'Oberkampf', 'Paris 11e', 'neighbourhood', 48.8649, 2.377, 550, ['parmentier']),
  P('belleville', 'Belleville', 'Paris 10e, 11e, 19e, 20e', 'neighbourhood', 48.8722, 2.3768, 700),
  P('menilmontant', 'Ménilmontant', 'Paris 20e', 'neighbourhood', 48.8665, 2.3836, 600, ['menil']),
  P('marais', 'Le Marais', 'Paris 3e, 4e', 'neighbourhood', 48.859, 2.36, 650, ['marais']),
  P('barbes', 'Barbès', 'Paris 18e', 'neighbourhood', 48.8838, 2.3497, 500, ['barbes rochechouart']),
  P('chateau-rouge', 'Château-Rouge', 'Paris 18e', 'neighbourhood', 48.8871, 2.3494, 450, ['goutte d or', 'la goutte d or']),
  P('la-chapelle', 'La Chapelle', 'Paris 10e, 18e', 'neighbourhood', 48.8845, 2.36, 500, ['little jaffna']),
  P('pigalle', 'Pigalle', 'Paris 9e, 18e', 'neighbourhood', 48.882, 2.3376, 450, ['sopi', 'south pigalle']),
  P('montmartre', 'Montmartre', 'Paris 18e', 'neighbourhood', 48.8867, 2.3431, 600, ['abbesses']),
  P('strasbourg-saint-denis', 'Strasbourg-Saint-Denis', 'Paris 2e, 10e', 'neighbourhood', 48.8696, 2.354, 450, ['saint denis paris', 'faubourg saint denis', 'sentier']),
  P('grands-boulevards', 'Grands Boulevards', 'Paris 2e, 9e', 'neighbourhood', 48.8716, 2.3431, 550, ['bonne nouvelle']),
  P('opera', 'Opéra', 'Paris 9e', 'neighbourhood', 48.8708, 2.3317, 550, ['opera', 'saint lazare']),
  P('chatelet', 'Châtelet', 'Paris 1er', 'neighbourhood', 48.8605, 2.347, 500, ['les halles', 'chatelet les halles']),
  P('saint-michel', 'Saint-Michel', 'Paris 5e, 6e', 'neighbourhood', 48.8525, 2.3441, 450, ['quartier latin']),
  P('saint-germain', 'Saint-Germain-des-Prés', 'Paris 6e', 'neighbourhood', 48.854, 2.3336, 500, ['saint germain', 'odeon']),
  P('montparnasse', 'Montparnasse', 'Paris 14e, 15e', 'neighbourhood', 48.8422, 2.321, 600),
  P('batignolles', 'Batignolles', 'Paris 17e', 'neighbourhood', 48.8851, 2.3195, 600),
  P('bercy', 'Bercy', 'Paris 12e', 'neighbourhood', 48.84, 2.382, 600),
  P('nation', 'Nation', 'Paris 11e, 12e, 20e', 'neighbourhood', 48.8483, 2.3958, 550),
  P('canal-saint-martin', 'Canal Saint-Martin', 'Paris 10e', 'neighbourhood', 48.871, 2.365, 550, ['canal']),
  P('place-d-italie', "Place d'Italie", 'Paris 13e', 'neighbourhood', 48.831, 2.3555, 550, ['italie']),
  P('olympiades', 'Olympiades', 'Paris 13e', 'neighbourhood', 48.827, 2.366, 500, ['quartier asiatique', 'chinatown']),
  // Gares : repères pour les nouveaux arrivants
  P('gare-du-nord', 'Gare du Nord', 'Paris 10e', 'station', 48.8809, 2.3553, 450),
  P('gare-de-lyon', 'Gare de Lyon', 'Paris 12e', 'station', 48.8443, 2.3744, 450),
  P('gare-de-l-est', "Gare de l'Est", 'Paris 10e', 'station', 48.8766, 2.3592, 400),
  // Proche couronne
  P('saint-denis-93', 'Saint-Denis', 'Seine-Saint-Denis', 'city', 48.9362, 2.3574, 1800, ['saint denis', 'st denis', '93200', 'stade de france'], 113_000),
  P('saint-ouen', 'Saint-Ouen', 'Seine-Saint-Denis', 'city', 48.9118, 2.334, 1300, ['st ouen', 'puces'], 52_000),
  P('aubervilliers', 'Aubervilliers', 'Seine-Saint-Denis', 'city', 48.9146, 2.3821, 1400, ['auber'], 88_000),
  P('pantin', 'Pantin', 'Seine-Saint-Denis', 'city', 48.8944, 2.4093, 1300, [], 59_000),
  P('montreuil-93', 'Montreuil', 'Seine-Saint-Denis', 'city', 48.8638, 2.4485, 1600, ['montreuil'], 111_000),
  P('bagnolet', 'Bagnolet', 'Seine-Saint-Denis', 'city', 48.869, 2.418, 1000, [], 36_000),
  P('vincennes', 'Vincennes', 'Val-de-Marne', 'city', 48.8474, 2.439, 1100, [], 49_000),
  P('ivry', 'Ivry-sur-Seine', 'Val-de-Marne', 'city', 48.8131, 2.385, 1300, ['ivry'], 64_000),
  P('boulogne', 'Boulogne-Billancourt', 'Hauts-de-Seine', 'city', 48.8397, 2.2399, 1500, ['boulogne'], 121_000),
  P('levallois', 'Levallois-Perret', 'Hauts-de-Seine', 'city', 48.895, 2.287, 1000, ['levallois'], 66_000),
  P('clichy', 'Clichy', 'Hauts-de-Seine', 'city', 48.9045, 2.306, 1000, [], 63_000),
  // Homonymes et villes hors zone de démonstration
  P('saint-denis-974', 'Saint-Denis', 'La Réunion', 'city', -20.8823, 55.4504, 4000, ['saint denis', 'st denis', '97400'], 153_000),
  P('montreuil-62', 'Montreuil-sur-Mer', 'Pas-de-Calais', 'city', 50.4638, 1.7636, 1200, ['montreuil'], 2_000),
  P('lyon', 'Lyon', 'Rhône', 'city', 45.764, 4.8357, 5000, [], 520_000),
  P('marseille', 'Marseille', 'Bouches-du-Rhône', 'city', 43.2965, 5.3698, 8000, [], 870_000),
  P('lille', 'Lille', 'Nord', 'city', 50.6292, 3.0573, 4000, [], 236_000),
  P('roubaix', 'Roubaix', 'Nord', 'city', 50.6942, 3.1746, 3000, [], 99_000),
  P('toulouse', 'Toulouse', 'Haute-Garonne', 'city', 43.6047, 1.4442, 6000, [], 500_000),
  P('bordeaux', 'Bordeaux', 'Gironde', 'city', 44.8378, -0.5792, 5000, [], 260_000),
  P('nice', 'Nice', 'Alpes-Maritimes', 'city', 43.7102, 7.262, 5000, [], 342_000),
  P('strasbourg', 'Strasbourg', 'Bas-Rhin', 'city', 48.5734, 7.7521, 5000, [], 290_000),
  P('nantes', 'Nantes', 'Loire-Atlantique', 'city', 47.2184, -1.5536, 5000, [], 320_000),
  P('montpellier', 'Montpellier', 'Hérault', 'city', 43.6108, 3.8767, 5000, [], 300_000),
  P('grenoble', 'Grenoble', 'Isère', 'city', 45.1885, 5.7245, 4000, [], 158_000),
];

export function placeBBox(place: Place): BBox {
  return bboxAround(place.center, place.radius);
}

interface IndexedName {
  place: Place;
  key: string;
}

const INDEX: IndexedName[] = PLACES.flatMap((place) =>
  [place.name, ...place.aliases].map((n) => ({ place, key: normalize(n) })),
);

/**
 * Lieux dont un nom commence par `prefix` (autocomplétion). À pertinence égale,
 * le plus proche de `origin` (position ou centre de la carte), sinon le plus peuplé.
 */
export function searchPlaces(prefix: string, limit = 5, origin?: LatLng): Place[] {
  const q = normalize(prefix);
  if (!q) return [];
  const seen = new Set<string>();
  const out: Place[] = [];
  const score = (e: IndexedName) => (e.key === q ? 0 : e.key.startsWith(q) ? 1 : e.key.includes(` ${q}`) ? 2 : 9);
  const tie = (a: IndexedName, b: IndexedName) =>
    origin
      ? distanceMeters(origin, a.place.center) - distanceMeters(origin, b.place.center)
      : (b.place.population ?? 0) - (a.place.population ?? 0);
  for (const e of [...INDEX].sort((a, b) => score(a) - score(b) || tie(a, b))) {
    if (score(e) === 9 || seen.has(e.place.id)) continue;
    seen.add(e.place.id);
    out.push(e.place);
    if (out.length >= limit) break;
  }
  return out;
}

/** Lieux dont un nom vaut exactement `phrase` normalisée : plusieurs = homonymes. */
export function placesNamed(phrase: string): Place[] {
  const q = normalize(phrase);
  const seen = new Set<string>();
  return INDEX.filter((e) => e.key === q && !seen.has(e.place.id) && seen.add(e.place.id)).map((e) => e.place);
}

/** Toutes les clés connues, pour le découpage de requête. */
export function placeKeys(): string[] {
  return [...new Set(INDEX.map((e) => e.key))];
}
