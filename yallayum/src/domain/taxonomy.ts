// Taxonomies éditables côté back-office. Ici, la version initiale proposée.
//
// Les cuisines sont rangées par famille (origine, format, moment, style) et
// hiérarchisées : choisir « Asiatique » inclut japonaise, coréenne, thaï…
// Chaque entrée porte une teinte (0–360, espace OKLCH) qui colore dynamiquement
// la surface de la fiche sélectionnée, et une icône.

import type { PriceLevel } from './types';

export type CuisineFamily = 'origine' | 'format' | 'moment' | 'style';

export interface Cuisine {
  id: string;
  label: string;
  family: CuisineFamily;
  parent?: string;
  hue: number;
  icon: IconName;
  /** Termes de recherche reconnus, sans accents ni majuscules. */
  synonyms: string[];
}

export type IconName =
  | 'burger'
  | 'taco'
  | 'sandwich'
  | 'skewer'
  | 'tagine'
  | 'bowl'
  | 'curry'
  | 'sushi'
  | 'pizza'
  | 'croissant'
  | 'cake'
  | 'leaf'
  | 'cloche'
  | 'plate';

export const CUISINES: Cuisine[] = [
  // Origine
  { id: 'maghrebine', label: 'Maghreb', family: 'origine', hue: 45, icon: 'tagine', synonyms: ['maghreb', 'maghrebin', 'maghrebine'] },
  { id: 'marocaine', label: 'Marocaine', family: 'origine', parent: 'maghrebine', hue: 38, icon: 'tagine', synonyms: ['marocain', 'marocaine', 'maroc', 'tajine', 'tagine', 'pastilla', 'couscous'] },
  { id: 'algerienne', label: 'Algérienne', family: 'origine', parent: 'maghrebine', hue: 52, icon: 'tagine', synonyms: ['algerien', 'algerienne', 'algerie', 'chorba', 'rechta'] },
  { id: 'tunisienne', label: 'Tunisienne', family: 'origine', parent: 'maghrebine', hue: 30, icon: 'tagine', synonyms: ['tunisien', 'tunisienne', 'tunisie', 'brik', 'lablabi'] },
  { id: 'moyen-orient', label: 'Moyen-Orient', family: 'origine', hue: 140, icon: 'skewer', synonyms: ['moyen orient', 'oriental', 'levantin'] },
  { id: 'libanaise', label: 'Libanaise', family: 'origine', parent: 'moyen-orient', hue: 145, icon: 'skewer', synonyms: ['libanais', 'libanaise', 'liban', 'mezze', 'houmous', 'falafel', 'manakish', 'chawarma', 'shawarma'] },
  { id: 'syrienne', label: 'Syrienne', family: 'origine', parent: 'moyen-orient', hue: 130, icon: 'skewer', synonyms: ['syrien', 'syrienne', 'syrie'] },
  { id: 'turque', label: 'Turque', family: 'origine', hue: 18, icon: 'skewer', synonyms: ['turc', 'turque', 'turquie', 'pide', 'lahmacun', 'iskender', 'kebab', 'doner'] },
  { id: 'africaine', label: 'Afrique subsaharienne', family: 'origine', hue: 72, icon: 'bowl', synonyms: ['africain', 'africaine', 'afro', 'afrique'] },
  { id: 'senegalaise', label: 'Sénégalaise', family: 'origine', parent: 'africaine', hue: 78, icon: 'bowl', synonyms: ['senegalais', 'senegalaise', 'senegal', 'yassa', 'thieboudienne', 'mafe'] },
  { id: 'ivoirienne', label: 'Ivoirienne', family: 'origine', parent: 'africaine', hue: 66, icon: 'bowl', synonyms: ['ivoirien', 'ivoirienne', 'alloco', 'attieke', 'garba'] },
  { id: 'ethiopienne', label: 'Éthiopienne', family: 'origine', parent: 'africaine', hue: 58, icon: 'bowl', synonyms: ['ethiopien', 'ethiopienne', 'injera'] },
  { id: 'sous-continent', label: 'Inde et Pakistan', family: 'origine', hue: 62, icon: 'curry', synonyms: ['indo pakistanais', 'indo', 'sous continent'] },
  { id: 'indienne', label: 'Indienne', family: 'origine', parent: 'sous-continent', hue: 60, icon: 'curry', synonyms: ['indien', 'indienne', 'inde', 'curry', 'biryani', 'naan', 'butter chicken', 'tandoori'] },
  { id: 'pakistanaise', label: 'Pakistanaise', family: 'origine', parent: 'sous-continent', hue: 100, icon: 'curry', synonyms: ['pakistanais', 'pakistanaise', 'pakistan', 'karahi', 'nihari'] },
  { id: 'asiatique', label: 'Asiatique', family: 'origine', hue: 12, icon: 'bowl', synonyms: ['asiatique', 'asie', 'wok'] },
  { id: 'japonaise', label: 'Japonaise', family: 'origine', parent: 'asiatique', hue: 22, icon: 'sushi', synonyms: ['japonais', 'japonaise', 'japon', 'sushi', 'sushis', 'ramen', 'maki', 'yakitori'] },
  { id: 'coreenne', label: 'Coréenne', family: 'origine', parent: 'asiatique', hue: 355, icon: 'bowl', synonyms: ['coreen', 'coreenne', 'coree', 'bibimbap', 'korean', 'fried chicken coreen'] },
  { id: 'thai', label: 'Thaïlandaise', family: 'origine', parent: 'asiatique', hue: 120, icon: 'bowl', synonyms: ['thai', 'thailandais', 'thailandaise', 'pad thai'] },
  { id: 'chinoise', label: 'Chinoise', family: 'origine', parent: 'asiatique', hue: 8, icon: 'bowl', synonyms: ['chinois', 'chinoise', 'chine', 'dim sum', 'nouilles'] },
  { id: 'francaise', label: 'Française', family: 'origine', hue: 250, icon: 'plate', synonyms: ['francais', 'francaise', 'bistrot', 'bistro', 'brasserie', 'cuisine francaise'] },
  { id: 'italienne', label: 'Italienne', family: 'origine', hue: 28, icon: 'pizza', synonyms: ['italien', 'italienne', 'italie', 'pates', 'pasta', 'trattoria'] },
  { id: 'americaine', label: 'Américaine', family: 'origine', hue: 15, icon: 'burger', synonyms: ['americain', 'americaine', 'diner', 'bbq', 'barbecue'] },
  { id: 'latino', label: 'Amérique latine', family: 'origine', hue: 95, icon: 'taco', synonyms: ['mexicain', 'mexicaine', 'bresilien', 'peruvien', 'latino'] },
  // Format
  { id: 'burger', label: 'Burger', family: 'format', hue: 40, icon: 'burger', synonyms: ['burger', 'burgers', 'smash', 'smash burger', 'cheeseburger', 'hamburger'] },
  { id: 'tacos', label: 'Tacos', family: 'format', hue: 85, icon: 'taco', synonyms: ['tacos', 'french tacos', 'taco'] },
  { id: 'sandwich', label: 'Sandwich', family: 'format', hue: 70, icon: 'sandwich', synonyms: ['sandwich', 'sandwichs', 'sandwicherie', 'wrap', 'snack'] },
  { id: 'grillades', label: 'Grillades', family: 'format', hue: 25, icon: 'skewer', synonyms: ['grillade', 'grillades', 'grill', 'brochette', 'brochettes', 'braise', 'viande', 'steakhouse', 'boucherie'] },
  { id: 'pizza', label: 'Pizza', family: 'format', hue: 30, icon: 'pizza', synonyms: ['pizza', 'pizzas', 'pizzeria'] },
  { id: 'poulet', label: 'Poulet frit', family: 'format', hue: 48, icon: 'burger', synonyms: ['poulet', 'poulet frit', 'chicken', 'fried chicken', 'wings', 'tenders'] },
  // Moment
  { id: 'brunch', label: 'Brunch', family: 'moment', hue: 88, icon: 'croissant', synonyms: ['brunch', 'brunchs', 'petit dej', 'petit dejeuner', 'pancakes', 'pancake', 'oeufs'] },
  { id: 'patisserie', label: 'Pâtisserie et salon de thé', family: 'moment', hue: 340, icon: 'cake', synonyms: ['patisserie', 'patisseries', 'dessert', 'desserts', 'gateau', 'salon de the', 'gaufre', 'glace'] },
  // Style
  { id: 'gastronomique', label: 'Gastronomique', family: 'style', hue: 290, icon: 'cloche', synonyms: ['gastro', 'gastronomique', 'raffine', 'chic', 'haut de gamme', 'etoile'] },
  { id: 'healthy', label: 'Healthy', family: 'style', hue: 150, icon: 'leaf', synonyms: ['healthy', 'sain', 'poke', 'bowl', 'salade', 'salades', 'vegetal'] },
];

const CUISINE_BY_ID = new Map(CUISINES.map((c) => [c.id, c]));

export function cuisine(id: string): Cuisine | undefined {
  return CUISINE_BY_ID.get(id);
}

/** L'identifiant et tous ses descendants : filtrer « Asiatique » inclut « Japonaise ». */
export function cuisineWithDescendants(id: string): string[] {
  const out = [id];
  for (const c of CUISINES) if (c.parent === id) out.push(...cuisineWithDescendants(c.id));
  return out;
}

export const CUISINE_FAMILIES: { id: CuisineFamily; label: string }[] = [
  { id: 'origine', label: 'Origine' },
  { id: 'format', label: 'Format' },
  { id: 'moment', label: 'Moment' },
  { id: 'style', label: 'Style' },
];

// ─── Envies : occasions et ambiances ────────────────────────────────────────
// Les qualificatifs subjectifs sont posés par la rédaction (jamais déduits
// automatiquement), avec une force 1 ou 2 qui sert au classement.

export interface Occasion {
  id: string;
  label: string;
  kind: 'occasion' | 'ambiance';
  synonyms: string[];
}

export const OCCASIONS: Occasion[] = [
  { id: 'date', label: 'Pour un date', kind: 'occasion', synonyms: ['date', 'romantique', 'en amoureux', 'amoureux', 'couple', 'diner a deux', 'a deux', 'tete a tete'] },
  { id: 'amis', label: 'Entre amis', kind: 'occasion', synonyms: ['entre amis', 'amis', 'potes', 'entre potes', 'groupe', 'bande', 'anniversaire'] },
  { id: 'famille', label: 'En famille', kind: 'occasion', synonyms: ['famille', 'en famille', 'enfants', 'kids', 'kid friendly', 'bebe', 'parents'] },
  { id: 'rapide', label: 'Déjeuner rapide', kind: 'occasion', synonyms: ['rapide', 'sur le pouce', 'pause dej', 'pause dejeuner', 'dejeuner rapide', 'vite', 'midi'] },
  { id: 'business', label: 'Déjeuner pro', kind: 'occasion', synonyms: ['business', 'pro', 'dejeuner pro', 'client', 'reunion'] },
  { id: 'special', label: 'Sortie spéciale', kind: 'occasion', synonyms: ['special', 'occasion speciale', 'fete', 'celebrer', 'evenement'] },
  { id: 'cosy', label: 'Cosy', kind: 'ambiance', synonyms: ['cosy', 'cozy', 'chaleureux', 'calme', 'intime'] },
  { id: 'street', label: 'Street food', kind: 'ambiance', synonyms: ['street', 'street food', 'streetfood', 'casual'] },
  { id: 'chill', label: 'Décontracté', kind: 'ambiance', synonyms: ['chill', 'detente', 'decontracte', 'tranquille', 'posey'] },
  { id: 'festif', label: 'Animé', kind: 'ambiance', synonyms: ['anime', 'festif', 'ambiance', 'musique', 'vivant'] },
];

const OCCASION_BY_ID = new Map(OCCASIONS.map((o) => [o.id, o]));

export function occasion(id: string): Occasion | undefined {
  return OCCASION_BY_ID.get(id);
}

// ─── Équipements et services ────────────────────────────────────────────────
// Une case n'est cochée que si l'information est confirmée : l'absence de case
// veut dire « non confirmé », pas « absent ».

export interface Amenity {
  id: string;
  label: string;
  synonyms: string[];
}

export const AMENITIES: Amenity[] = [
  { id: 'sur_place', label: 'Sur place', synonyms: ['sur place'] },
  { id: 'emporter', label: 'À emporter', synonyms: ['a emporter', 'emporter', 'take away', 'takeaway'] },
  { id: 'livraison', label: 'Livraison via partenaire', synonyms: ['livraison', 'livre', 'delivery'] },
  { id: 'reservation', label: 'Réservation possible', synonyms: ['reservation', 'reserver', 'reservable'] },
  { id: 'groupes', label: 'Tables de 6 et plus', synonyms: ['grande table', 'groupe de 6', 'six personnes', '6 personnes', 'grande tablee'] },
  { id: 'terrasse', label: 'Terrasse', synonyms: ['terrasse', 'exterieur', 'dehors'] },
  { id: 'pmr', label: 'Accès fauteuil roulant', synonyms: ['pmr', 'accessible', 'fauteuil', 'handicap', 'acces pmr'] },
  { id: 'chaise_bebe', label: 'Chaise haute', synonyms: ['chaise haute', 'chaise bebe'] },
  { id: 'poussette', label: 'Place pour poussette', synonyms: ['poussette'] },
  { id: 'vegetarien', label: 'Options végétariennes', synonyms: ['vegetarien', 'vegetarienne', 'veggie', 'vege'] },
  { id: 'wifi', label: 'Wi-Fi', synonyms: ['wifi', 'wi fi'] },
  { id: 'salle_priere', label: 'Espace de prière', synonyms: ['salle de priere', 'priere'] },
];

const AMENITY_BY_ID = new Map(AMENITIES.map((a) => [a.id, a]));

export function amenity(id: string): Amenity | undefined {
  return AMENITY_BY_ID.get(id);
}

// ─── Prix ───────────────────────────────────────────────────────────────────

export const PRICE_LEVELS: Record<PriceLevel, { symbol: string; label: string; range: string; max: number }> = {
  1: { symbol: '€', label: 'Petit budget', range: 'moins de 15 €', max: 15 },
  2: { symbol: '€€', label: 'Abordable', range: '15 à 30 €', max: 30 },
  3: { symbol: '€€€', label: 'Plus chic', range: '30 à 50 €', max: 50 },
  4: { symbol: '€€€€', label: 'Grande occasion', range: 'plus de 50 €', max: Infinity },
};

/** Niveau de prix maximal compatible avec un budget par personne. */
export function priceLevelForBudget(euros: number): PriceLevel {
  if (euros <= 15) return 1;
  if (euros <= 30) return 2;
  if (euros <= 50) return 3;
  return 4;
}
