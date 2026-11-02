// Jeu de données de démonstration.
//
// TOUT EST FICTIF : établissements, organismes de certification, numéros
// (plage 01 99 00 xx xx réservée par l'ARCEP aux œuvres de fiction), dates.
// Les rues, quartiers et communes sont réels pour que la carte ait du sens ;
// les numéros de rue sont inventés. Aucune image ne représente un lieu réel :
// les visuels sont des illustrations génératives, signalées comme telles.
//
// Les dates sont relatives au jour d'ouverture du prototype, pour que les
// échéances (certificat expiré hier, horaires vérifiés il y a 8 mois…)
// restent vraies quel que soit le moment de la démonstration.

import { PLACES } from '../domain/places';
import type {
  Brand,
  Certifier,
  HalalClaim,
  HalalScope,
  ISODate,
  OccasionTag,
  OpeningHours,
  PriceLevel,
  Restaurant,
  WeeklyRange,
  Weekday,
} from '../domain/types';

export const DEMO_NOTICE =
  'Données de démonstration : établissements, organismes et numéros fictifs. Rues et quartiers réels.';

const TODAY = new Date();

export function daysFromToday(n: number): ISODate {
  const d = new Date(Date.UTC(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate() + n));
  return d.toISOString().slice(0, 10);
}

const ago = (n: number) => daysFromToday(-n);

export const CERTIFIERS: Certifier[] = [
  { id: 'alpha', name: 'Organisme Alpha (fictif)', shortName: 'Alpha' },
  { id: 'beta', name: 'Organisme Bêta (fictif)', shortName: 'Bêta' },
];

export const BRANDS: Brand[] = [{ id: 'smash-club', name: 'Smash Club' }];

// ─── Horaires types ─────────────────────────────────────────────────────────

const ALL: Weekday[] = [1, 2, 3, 4, 5, 6, 7];
const range = (days: Weekday[], opens: string, closes: string): WeeklyRange[] => days.map((day) => ({ day, opens, closes }));

const PRESETS: Record<string, WeeklyRange[]> = {
  midiSoir: [...range([1, 2, 3, 4, 5, 6], '12:00', '14:30'), ...range([1, 2, 3, 4, 5, 6], '19:00', '22:30')],
  continu: range(ALL, '11:30', '23:00'),
  nuit: [...range([1, 2, 3, 4], '18:00', '01:00'), ...range([5, 6], '18:00', '02:00'), ...range([7], '18:00', '00:00')],
  streetTard: range(ALL, '11:00', '02:00'),
  brunch: range([2, 3, 4, 5, 6, 7], '09:30', '16:00'),
  salonDeThe: range([2, 3, 4, 5, 6, 7], '10:00', '19:30'),
  gastro: [...range([2, 3, 4, 5, 6], '19:00', '22:30'), ...range([5, 6], '12:00', '14:00')],
  dejeuner: range([1, 2, 3, 4, 5], '11:30', '15:00'),
  semaineTard: [...range([1, 2, 3, 4, 5, 6], '12:00', '15:00'), ...range([1, 2, 3, 4, 5, 6, 7], '18:30', '23:30')],
};

function hours(preset: keyof typeof PRESETS, verifiedDaysAgo: number, special: OpeningHours['special'] = []): OpeningHours {
  return { weekly: PRESETS[preset], special, verifiedAt: ago(verifiedDaysAgo), source: verifiedDaysAgo > 300 ? 'legacy_import' : 'team_phone' };
}

// ─── Information halal ──────────────────────────────────────────────────────

let claimSeq = 0;
const claimId = () => `hc-${++claimSeq}`;

function cert(certifierId: string, evidenceDaysAgo: number, validForDays: number, scope: HalalScope = 'whole_menu', scopeNote?: string): HalalClaim {
  return {
    id: claimId(),
    kind: 'certification',
    scope,
    scopeNote,
    certifierId,
    certificateRef: `${certifierId.toUpperCase()}-${2000 + claimSeq}`,
    method: 'certificate_check',
    evidenceDate: ago(evidenceDaysAgo),
    validUntil: daysFromToday(validForDays - evidenceDaysAgo),
    reviewStatus: 'approved',
    reviewedAt: ago(Math.max(0, evidenceDaysAgo - 2)),
  };
}

function team(evidenceDaysAgo: number, scope: HalalScope = 'whole_menu', method: HalalClaim['method'] = 'supplier_documents', scopeNote?: string): HalalClaim {
  return { id: claimId(), kind: 'team_verification', scope, scopeNote, method, evidenceDate: ago(evidenceDaysAgo), reviewStatus: 'approved', reviewedAt: ago(evidenceDaysAgo) };
}

function decl(evidenceDaysAgo: number, scope: HalalScope = 'whole_menu', method: HalalClaim['method'] = 'phone', scopeNote?: string): HalalClaim {
  return { id: claimId(), kind: 'establishment_declaration', scope, scopeNote, method, evidenceDate: ago(evidenceDaysAgo), reviewStatus: 'approved', reviewedAt: ago(evidenceDaysAgo) };
}

// ─── Construction des fiches ────────────────────────────────────────────────

interface Spec {
  id: string;
  name: string;
  brandId?: string;
  /** Quartier d'ancrage et décalage en mètres (est, nord). */
  near: string;
  dx: number;
  dy: number;
  street: string;
  postcode: string;
  district: string;
  neighbourhood?: string;
  city?: string;
  cuisines: string[];
  occasions?: [string, 1 | 2][];
  amenities?: string[];
  alcohol?: Restaurant['alcohol'];
  price?: [PriceLevel, number?, number?];
  hours?: OpeningHours;
  claims: HalalClaim[];
  description: string;
  pick?: boolean;
  publishedDaysAgo?: number;
  phone?: string;
  booking?: boolean;
  menu?: boolean;
  partner?: boolean;
  sponsored?: boolean;
  operating?: Restaurant['operating'];
  publication?: Restaurant['publication'];
  temporarilyClosedForDays?: number;
  successorId?: string;
  previousSlugs?: string[];
  illustrations?: number;
}

const placeCenter = (id: string) => {
  const p = PLACES.find((x) => x.id === id);
  if (!p) throw new Error(`Lieu inconnu : ${id}`);
  return p.center;
};

function slugify(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

let phoneSeq = 10;

function build(s: Spec): Restaurant {
  const c = placeCenter(s.near);
  const lat = c.lat + s.dy / 111_320;
  const lng = c.lng + s.dx / (111_320 * Math.cos((c.lat * Math.PI) / 180));
  const slug = slugify(s.name);
  const occasions: OccasionTag[] = (s.occasions ?? []).map(([id, strength]) => ({ id, strength }));
  const n = s.illustrations ?? 3;
  return {
    id: s.id,
    slug,
    previousSlugs: s.previousSlugs,
    name: s.name,
    brandId: s.brandId,
    description: s.description,
    publication: s.publication ?? 'published',
    operating: s.operating ?? 'operating',
    temporarilyClosedUntil: s.temporarilyClosedForDays ? daysFromToday(s.temporarilyClosedForDays) : undefined,
    successorId: s.successorId,
    location: { lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)) },
    address: {
      street: s.street,
      postcode: s.postcode,
      city: s.city ?? 'Paris',
      district: s.district,
      neighbourhood: s.neighbourhood,
      country: 'FR',
    },
    timezone: 'Europe/Paris',
    cuisines: s.cuisines,
    occasions,
    amenities: s.amenities ?? ['sur_place'],
    alcohol: s.alcohol ?? 'not_served',
    price: s.price ? { level: s.price[0], min: s.price[1], max: s.price[2], observedAt: s.price[1] ? ago(40) : undefined } : undefined,
    hours: s.hours,
    contact: {
      phone: s.phone ?? `01 99 00 ${String(phoneSeq++).padStart(2, '0')} ${String((phoneSeq * 7) % 100).padStart(2, '0')}`,
      bookingUrl: s.booking ? 'https://example.com/reservation' : undefined,
      menuUrl: s.menu ? 'https://example.com/menu' : undefined,
      menuCheckedAt: s.menu ? ago(35) : undefined,
    },
    media: Array.from({ length: n }, (_, i) => ({
      id: `${s.id}-m${i}`,
      kind: 'illustration' as const,
      subject: i === 0 ? ('dish' as const) : i === 1 ? ('room' as const) : ('dish' as const),
      alt: `Illustration générique, pas une photo du lieu`,
      seed: hash(`${s.id}-${i}`),
    })),
    halalClaims: s.claims,
    editorialPick: s.pick ?? false,
    publishedAt: ago(s.publishedDaysAgo ?? 200),
    updatedAt: ago(Math.min(s.publishedDaysAgo ?? 200, 30)),
    loyaltyPartnerId: s.partner ? `p-${s.id}` : undefined,
    sponsored: s.sponsored ? { id: `camp-${s.id}`, from: ago(10), to: daysFromToday(20), label: 'Sponsorisé' } : undefined,
    version: 3,
  };
}

function hash(s: string): number {
  let h = 2166136261;
  for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return h;
}

const SPECS: Spec[] = [
  {
    id: 'braises-belleville', name: 'Les Braises de Belleville', near: 'belleville', dx: 60, dy: -120,
    street: '48 boulevard de Belleville', postcode: '75020', district: 'Paris 20e', neighbourhood: 'Belleville',
    cuisines: ['turque', 'grillades'], occasions: [['amis', 2], ['street', 2], ['rapide', 1]], amenities: ['sur_place', 'emporter', 'groupes', 'terrasse'],
    price: [1, 9, 15], hours: hours('nuit', 40), claims: [cert('alpha', 120, 365)], pick: true, menu: true,
    description: 'Brochettes au charbon de bois, pide sorti du four à la commande et sauce au yaourt maison. Grandes tables au fond pour les bandes, comptoir pour les pressés.',
  },
  {
    id: 'smash-republique', name: 'Smash Club République', brandId: 'smash-club', near: 'republique', dx: -140, dy: 90,
    street: '12 rue du Faubourg du Temple', postcode: '75010', district: 'Paris 10e', neighbourhood: 'République',
    cuisines: ['burger', 'americaine'], occasions: [['amis', 2], ['street', 2], ['rapide', 2]], amenities: ['sur_place', 'emporter', 'livraison'],
    price: [1, 11, 16], hours: hours('continu', 25), claims: [team(60, 'whole_menu', 'supplier_documents', 'Bœuf et poulet ; certificats des deux fournisseurs contrôlés.')], partner: true, menu: true,
    description: 'Smash burgers écrasés à la plancha, cheddar fondu, pain brioché du boulanger voisin. Le « Double République » se mange à deux mains.',
  },
  {
    id: 'smash-saint-denis', name: 'Smash Club Saint-Denis', brandId: 'smash-club', near: 'saint-denis-93', dx: 120, dy: -260,
    street: '31 rue de la République', postcode: '93200', district: 'Saint-Denis', city: 'Saint-Denis', neighbourhood: 'Centre-ville',
    cuisines: ['burger', 'americaine'], occasions: [['amis', 2], ['street', 2]], amenities: ['sur_place', 'emporter', 'groupes'],
    price: [1, 10, 15], hours: hours('streetTard', 50), claims: [team(60, 'whole_menu', 'supplier_documents')], partner: true,
    description: 'La même recette que République, en plus grand et ouvert jusqu’à 2 h. Salle du fond réservable pour les anniversaires.',
  },
  {
    id: 'maison-cedre', name: 'Maison Cèdre', near: 'marais', dx: 120, dy: 260,
    street: '22 rue de Bretagne', postcode: '75003', district: 'Paris 3e', neighbourhood: 'Haut-Marais',
    cuisines: ['libanaise'], occasions: [['date', 2], ['cosy', 2], ['special', 1]], amenities: ['sur_place', 'reservation', 'vegetarien', 'pmr'],
    price: [3, 32, 45], hours: hours('midiSoir', 20), claims: [cert('beta', 90, 365)], pick: true, booking: true, menu: true,
    description: 'Mezze à partager en lumière basse : moutabal fumé, kebbé nayé, fattouch croquant. Réserver la banquette du fond pour un dîner à deux.',
  },
  {
    id: 'teranga-express', name: 'Teranga Express', near: 'chateau-rouge', dx: 40, dy: -50,
    street: '14 rue Dejean', postcode: '75018', district: 'Paris 18e', neighbourhood: 'Château-Rouge',
    cuisines: ['senegalaise'], occasions: [['rapide', 2], ['street', 1]], amenities: ['sur_place', 'emporter'],
    price: [1, 9, 13], hours: hours('continu', 330), claims: [decl(120, 'whole_menu', 'legacy_import')],
    description: 'Thiéboudienne le vendredi, yassa poulet tous les jours, bissap glacé maison. Portions généreuses, service au comptoir.',
  },
  {
    id: 'chez-awa', name: 'Chez Awa', near: 'barbes', dx: 90, dy: 140,
    street: '7 rue de la Goutte d’Or', postcode: '75018', district: 'Paris 18e', neighbourhood: 'Goutte d’Or',
    cuisines: ['ivoirienne'], occasions: [['famille', 1], ['chill', 2]], amenities: ['sur_place', 'emporter', 'chaise_bebe'],
    price: [1, 10, 15], hours: hours('semaineTard', 60), claims: [decl(80, 'meat_poultry', 'phone', 'Viandes et volailles ; poisson à la carte.')], pick: true,
    description: 'Alloco doré, attiéké poisson braisé et garba du midi. Awa cuisine, sa fille tient la salle : on se sent à la maison.',
  },
  {
    id: 'mezze-lab', name: 'Mezzé Lab', near: 'oberkampf', dx: 80, dy: 40,
    street: '96 rue Oberkampf', postcode: '75011', district: 'Paris 11e', neighbourhood: 'Oberkampf',
    cuisines: ['libanaise', 'healthy'], occasions: [['amis', 1], ['rapide', 1], ['chill', 2]], amenities: ['sur_place', 'emporter', 'vegetarien', 'wifi'],
    price: [2, 15, 22], hours: hours('continu', 35), claims: [team(150, 'whole_menu', 'on_site_visit')], menu: true,
    description: 'Bowls de mezze à composer : houmous à la betterave, poulet shish taouk, boulgour aux herbes. Coin calme à l’étage pour travailler le midi.',
  },
  {
    id: 'kyoto-bowl', name: 'Kyoto Bowl', near: 'opera', dx: 260, dy: -230,
    street: '41 rue Sainte-Anne', postcode: '75002', district: 'Paris 2e', neighbourhood: 'Quartier japonais',
    cuisines: ['japonaise'], occasions: [['rapide', 2], ['chill', 1]], amenities: ['sur_place', 'emporter'],
    price: [2, 14, 19], hours: hours('semaineTard', 45), claims: [team(70, 'whole_menu', 'supplier_documents', 'Bouillon de poulet maison ; pas de mirin ni saké en cuisine.')],
    description: 'Ramen au bouillon de poulet blanc mijoté douze heures, gyoza grillés, onigiri du jour. File rapide le midi, comptoir face aux cuisiniers.',
  },
  {
    id: 'seoul-fried', name: 'Seoul Fried', near: 'strasbourg-saint-denis', dx: 90, dy: 60,
    street: '58 boulevard de Strasbourg', postcode: '75010', district: 'Paris 10e', neighbourhood: 'Strasbourg-Saint-Denis',
    cuisines: ['coreenne', 'poulet'], occasions: [['amis', 2], ['street', 2], ['festif', 1]], amenities: ['sur_place', 'emporter', 'groupes'],
    price: [2, 14, 20], hours: hours('nuit', 30), claims: [decl(40, 'whole_menu', 'email')], previousSlugs: ['seoul-fried-paris'], publishedDaysAgo: 18,
    description: 'Poulet frit coréen double cuisson, sauce yangnyeom ou soja-ail, tteokbokki qui piquent. Musique forte, néons, tables hautes.',
  },
  {
    id: 'tandoor-royal', name: 'Tandoor Royal', near: 'la-chapelle', dx: -30, dy: -60,
    street: '186 rue du Faubourg Saint-Denis', postcode: '75010', district: 'Paris 10e', neighbourhood: 'La Chapelle',
    cuisines: ['indienne'], occasions: [['famille', 2], ['amis', 1]], amenities: ['sur_place', 'emporter', 'groupes', 'chaise_bebe', 'poussette', 'vegetarien'],
    price: [1, 11, 18], hours: hours('continu', 15), claims: [cert('alpha', 60, 365)], menu: true,
    description: 'Naan au fromage sorti du tandoor, butter chicken doux pour les enfants, biryani d’agneau pour les grands. Salle spacieuse, poussettes bienvenues.',
  },
  {
    id: 'lahore-grill', name: 'Lahore Grill', near: 'gare-du-nord', dx: 160, dy: -110,
    street: '9 rue de Dunkerque', postcode: '75010', district: 'Paris 10e', neighbourhood: 'Gare du Nord',
    cuisines: ['pakistanaise', 'grillades'], occasions: [['rapide', 2], ['amis', 1]], amenities: ['sur_place', 'emporter'],
    price: [1, 10, 14], hours: hours('continu', 90), claims: [team(200, 'whole_menu', 'on_site_visit')],
    description: 'Seekh kebab, karahi de poulet au wok de fonte et chai au lait. Idéal avant un train : servi en dix minutes.',
  },
  {
    id: 'dar-lalla', name: 'Dar Lalla', near: 'menilmontant', dx: 70, dy: 30,
    street: '63 rue de Ménilmontant', postcode: '75020', district: 'Paris 20e', neighbourhood: 'Ménilmontant',
    cuisines: ['marocaine'], occasions: [['famille', 2], ['cosy', 2], ['date', 1]], amenities: ['sur_place', 'reservation', 'groupes', 'chaise_bebe'],
    price: [2, 18, 28], hours: hours('midiSoir', 30), claims: [cert('alpha', 30, 365)], partner: true, booking: true, menu: true,
    description: 'Tajine de poulet citron confit, couscous sept légumes le vendredi, pastilla au poulet sucrée-salée. Salon marocain au sous-sol pour les grandes tablées.',
  },
  {
    id: 'table-ifrane', name: 'La Table d’Ifrane', near: 'pigalle', dx: 160, dy: -220,
    street: '24 rue des Martyrs', postcode: '75009', district: 'Paris 9e', neighbourhood: 'SoPi',
    cuisines: ['marocaine', 'gastronomique'], occasions: [['date', 2], ['special', 2], ['cosy', 1]], amenities: ['sur_place', 'reservation'],
    price: [3, 42, 58], hours: hours('gastro', 20), claims: [team(45, 'whole_menu', 'on_site_visit', 'Visite en cuisine et factures des fournisseurs contrôlées.')], pick: true, booking: true, menu: true, publishedDaysAgo: 34,
    description: 'Une cheffe revisite la cuisine de Fès en menu de six temps : pigeon façon pastilla, agneau de lait aux dattes, sorbet amlou. Réservation conseillée.',
  },
  {
    id: 'bistrot-amine', name: 'Le Bistrot d’Amine', near: 'batignolles', dx: 60, dy: -80,
    street: '17 rue des Dames', postcode: '75017', district: 'Paris 17e', neighbourhood: 'Batignolles',
    cuisines: ['francaise'], occasions: [['date', 2], ['business', 2], ['cosy', 1]], amenities: ['sur_place', 'reservation', 'terrasse'],
    price: [3, 30, 42], hours: hours('midiSoir', 55), claims: [cert('beta', 150, 365)], booking: true, menu: true,
    description: 'Bœuf bourguignon sans vin, blanquette de veau, île flottante : les classiques de bistrot, tous halal. Ardoise du jour et terrasse sur une rue calme.',
  },
  {
    id: 'nonna-ya', name: 'Nonna Ya', near: 'bastille', dx: 230, dy: 140,
    street: '33 rue de la Roquette', postcode: '75011', district: 'Paris 11e', neighbourhood: 'Bastille',
    cuisines: ['italienne', 'pizza'], occasions: [['famille', 2], ['amis', 2]], amenities: ['sur_place', 'emporter', 'terrasse', 'chaise_bebe', 'groupes'],
    price: [2, 14, 24], hours: hours('semaineTard', 70), claims: [decl(210, 'meat_poultry', 'email', 'Charcuterie de bœuf et de dinde ; mozzarella sans présure animale non vérifiée.')],
    description: 'Pizza napolitaine à pâte longue, bresaola de bœuf, pâtes fraîches du jour. Les enfants regardent le pizzaïolo lancer la pâte.',
  },
  {
    id: 'sunny-side', name: 'Sunny Side', near: 'canal-saint-martin', dx: 40, dy: 90,
    street: '11 rue Beaurepaire', postcode: '75010', district: 'Paris 10e', neighbourhood: 'Canal Saint-Martin',
    cuisines: ['brunch'], occasions: [['amis', 2], ['famille', 1], ['chill', 2]], amenities: ['sur_place', 'chaise_bebe', 'poussette', 'vegetarien', 'reservation'],
    price: [2, 22, 29], hours: hours('brunch', 28), claims: [team(110, 'whole_menu', 'supplier_documents', 'Bacon de dinde et saucisses de bœuf certifiés chez le fournisseur.')], partner: true, booking: true, pick: true,
    description: 'Pancakes soufflés, shakshuka au four, œufs Bénédicte au bacon de dinde. Réservez le dimanche : la file déborde sur le canal.',
  },
  {
    id: 'patisserie-saba', name: 'Pâtisserie Saba', near: 'belleville', dx: -210, dy: 140,
    street: '81 rue de Belleville', postcode: '75019', district: 'Paris 19e', neighbourhood: 'Belleville',
    cuisines: ['patisserie'], occasions: [['chill', 1], ['famille', 1]], amenities: ['sur_place', 'emporter'],
    price: [1, 4, 9], hours: hours('salonDeThe', 60), claims: [team(90, 'whole_menu', 'supplier_documents', 'Gélatine bovine certifiée ; aucun alcool dans les entremets.')],
    description: 'Baklava à la pistache d’Antep, kunafa chaude au fromage, entremets sans gélatine porcine. Thé à la menthe servi en salle.',
  },
  {
    id: 'green-bowl', name: 'Green Bowl Factory', near: 'chatelet', dx: 180, dy: 230,
    street: '52 rue Montorgueil', postcode: '75002', district: 'Paris 2e', neighbourhood: 'Montorgueil',
    cuisines: ['healthy'], occasions: [['rapide', 2], ['business', 1]], amenities: ['sur_place', 'emporter', 'vegetarien'],
    price: [1, 12, 15], hours: hours('dejeuner', 20), claims: [decl(30, 'meat_poultry', 'email')],
    description: 'Poke bowls au poulet mariné ou au saumon, base riz complet ou chou kale. Commande sur borne, prêt en cinq minutes.',
  },
  {
    id: 'tacos-brothers', name: 'Tacos Brothers', near: 'saint-denis-93', dx: -220, dy: 160,
    street: '5 boulevard Jules-Guesde', postcode: '93200', district: 'Saint-Denis', city: 'Saint-Denis',
    cuisines: ['tacos'], occasions: [['street', 2], ['amis', 1]], amenities: ['sur_place', 'emporter', 'livraison'],
    price: [1, 8, 12], hours: hours('streetTard', 260), claims: [decl(260, 'whole_menu', 'phone')],
    description: 'French tacos XXL gratinés, sauce fromagère maison et frites croustillantes. Le spot d’après-match, ouvert tard.',
  },
  {
    id: 'wings-supreme', name: 'Wings Suprême', near: 'aubervilliers', dx: 80, dy: -60,
    street: '102 avenue Jean-Jaurès', postcode: '93300', district: 'Aubervilliers', city: 'Aubervilliers',
    cuisines: ['poulet', 'americaine'], occasions: [['street', 2], ['amis', 1]], amenities: ['sur_place', 'emporter'],
    price: [1, 8, 13], hours: hours('streetTard', 420), claims: [],
    description: 'Wings glacées au miel épicé, tenders panés au corn flakes, coleslaw. Fiche reprise de l’ancienne base : information halal en cours de revérification.',
  },
  {
    id: 'istanbul-kitchen', name: 'Istanbul Kitchen', near: 'strasbourg-saint-denis', dx: 40, dy: 330,
    street: '71 rue du Faubourg Saint-Denis', postcode: '75010', district: 'Paris 10e', neighbourhood: 'Faubourg Saint-Denis',
    cuisines: ['turque'], occasions: [['rapide', 2], ['street', 1]], amenities: ['sur_place', 'emporter'],
    price: [1, 9, 14], hours: hours('semaineTard', 35),
    claims: [
      { ...cert('alpha', 366, 365), id: 'hc-istanbul-cert' },
      team(200, 'whole_menu', 'supplier_documents'),
    ],
    description: 'Lahmacun fin et croustillant, pide aux œufs, iskender nappé de beurre noisette. Certificat de l’organisme arrivé à échéance : nouvelle preuve demandée.',
  },
  {
    id: 'comptoir-anatolie', name: 'Le Comptoir d’Anatolie', near: 'montreuil-93', dx: -380, dy: 120,
    street: '88 rue de Paris', postcode: '93100', district: 'Montreuil', city: 'Montreuil',
    cuisines: ['turque', 'grillades'], occasions: [['famille', 2], ['amis', 2]], amenities: ['sur_place', 'groupes', 'chaise_bebe', 'poussette', 'pmr', 'salle_priere'],
    price: [2, 16, 25], hours: hours('continu', 22), claims: [cert('alpha', 75, 365)], partner: true, menu: true,
    description: 'Grill ouvert au centre de la salle, mezze froids en vitrine, tables de douze. Accès de plain-pied et espace de prière à l’étage.',
  },
  {
    id: 'aldiyar', name: 'Aldiyar', near: 'pigalle', dx: -260, dy: 60,
    street: '6 rue Frochot', postcode: '75009', district: 'Paris 9e', neighbourhood: 'Pigalle',
    cuisines: ['syrienne'], occasions: [['cosy', 2], ['date', 1]], amenities: ['sur_place', 'vegetarien'],
    price: [2, 18, 26], hours: hours('midiSoir', 140), claims: [team(170, 'whole_menu', 'on_site_visit')], pick: true, publishedDaysAgo: 12,
    description: 'Fatteh au yaourt et pois chiches, kebbé à la grenade, chawarma d’Alep roulé minute. Petite salle aux murs de pierre.',
  },
  {
    id: 'habesha', name: 'Habesha', near: 'nation', dx: -200, dy: 180,
    street: '29 avenue Philippe-Auguste', postcode: '75011', district: 'Paris 11e', neighbourhood: 'Nation',
    cuisines: ['ethiopienne'], occasions: [['amis', 2], ['date', 1]], amenities: ['sur_place', 'vegetarien', 'groupes'],
    price: [2, 16, 22], hours: hours('midiSoir', 100), claims: [decl(95, 'whole_menu', 'phone')], pick: true,
    description: 'Injera à partager à la main, doro wat au piment berbéré, plateau végétarien de lentilles et blettes. Cérémonie du café le samedi.',
  },
  {
    id: 'petit-tunis', name: 'Le Petit Tunis', near: 'belleville', dx: 120, dy: -330,
    street: '12 rue Ramponeau', postcode: '75020', district: 'Paris 20e', neighbourhood: 'Belleville',
    cuisines: ['tunisienne', 'sandwich'], occasions: [['rapide', 2], ['street', 2]], amenities: ['sur_place', 'emporter'],
    price: [1, 6, 11], hours: hours('continu', 260), claims: [decl(300, 'whole_menu', 'legacy_import')],
    description: 'Fricassé tunisien, brik à l’œuf coulant, lablabi fumant l’hiver. Moins de 10 € et dix minutes chrono.',
  },
  {
    id: 'chorba-co', name: 'Chorba & Co', near: 'barbes', dx: -120, dy: -40,
    street: '28 boulevard de la Chapelle', postcode: '75018', district: 'Paris 18e', neighbourhood: 'Barbès',
    cuisines: ['algerienne'], occasions: [['famille', 2], ['rapide', 1]], amenities: ['sur_place', 'emporter', 'chaise_bebe'],
    price: [1, 9, 16], hours: hours('continu', 50), claims: [team(130, 'whole_menu', 'supplier_documents')],
    description: 'Chorba frik, rechta du mercredi, mhadjeb au comptoir. Cuisine de grand-mère algéroise, prix d’étudiant.',
  },
  {
    id: 'o-mafe', name: 'Ô Mafé', near: 'saint-denis-93', dx: 300, dy: 90,
    street: '14 rue Gabriel-Péri', postcode: '93200', district: 'Saint-Denis', city: 'Saint-Denis',
    cuisines: ['senegalaise'], occasions: [['famille', 1], ['chill', 1]], amenities: ['sur_place', 'emporter'],
    price: [1, 10, 14], hours: hours('semaineTard', 40), claims: [cert('alpha', 200, 365)],
    description: 'Mafé d’agneau à la pâte d’arachide, yassa au citron vert, jus de gingembre qui réveille. Cantine du quartier de la basilique.',
  },
  {
    id: 'lanzhou-nouilles', name: 'Lanzhou Nouilles Tirées', near: 'olympiades', dx: 60, dy: 120,
    street: '62 avenue de Choisy', postcode: '75013', district: 'Paris 13e', neighbourhood: 'Quartier asiatique',
    cuisines: ['chinoise'], occasions: [['rapide', 2], ['chill', 1]], amenities: ['sur_place', 'emporter'],
    price: [1, 11, 15], hours: hours('continu', 65), claims: [team(80, 'whole_menu', 'on_site_visit', 'Cuisine hui de Lanzhou ; bœuf du fournisseur certifié.')], pick: true,
    description: 'Les nouilles sont tirées à la main sous vos yeux, en neuf épaisseurs au choix. Bouillon de bœuf clair, radis, huile pimentée.',
  },
  {
    id: 'bao-street', name: 'Bao Street', near: 'olympiades', dx: -150, dy: -90,
    street: '17 avenue d’Ivry', postcode: '75013', district: 'Paris 13e', neighbourhood: 'Quartier asiatique',
    cuisines: ['asiatique', 'thai'], occasions: [['street', 2], ['rapide', 1]], amenities: ['emporter', 'sur_place'],
    price: [1, 9, 14], hours: hours('semaineTard', 230), claims: [decl(240, 'meat_poultry', 'phone')],
    description: 'Bao au poulet caramélisé, pad thaï au bœuf, thé glacé au jasmin. Quelques tabourets, beaucoup de vente à emporter.',
  },
  {
    id: 'thai-lotus', name: 'Thaï Lotus', near: 'place-d-italie', dx: 140, dy: -90,
    street: '41 avenue d’Italie', postcode: '75013', district: 'Paris 13e', neighbourhood: 'Place d’Italie',
    cuisines: ['thai'], occasions: [['date', 1], ['cosy', 1]], amenities: ['sur_place', 'reservation', 'vegetarien'],
    price: [2, 17, 26], hours: hours('midiSoir', 75), claims: [decl(70, 'meat_poultry', 'email')], booking: true,
    description: 'Curry vert au poulet, larb de bœuf aux herbes fraîches, mangue au riz gluant. Lumière douce, service attentionné.',
  },
  {
    id: 'charolais-levallois', name: 'Le Charolais', near: 'levallois', dx: 80, dy: -120,
    street: '45 rue Anatole-France', postcode: '92300', district: 'Levallois-Perret', city: 'Levallois-Perret',
    cuisines: ['grillades', 'francaise'], occasions: [['business', 2], ['date', 1], ['special', 1]], amenities: ['sur_place', 'reservation', 'pmr'],
    price: [3, 35, 55], hours: hours('midiSoir', 18), claims: [cert('beta', 40, 365)], booking: true, menu: true,
    description: 'Côte de bœuf maturée par le boucher de la maison, frites au couteau, sauce au poivre. Salle feutrée pour déjeuners d’affaires.',
  },
  {
    id: 'maison-yasmine', name: 'Maison Yasmine', near: 'saint-germain', dx: 70, dy: 60,
    street: '9 rue de Buci', postcode: '75006', district: 'Paris 6e', neighbourhood: 'Saint-Germain-des-Prés',
    cuisines: ['gastronomique', 'francaise'], occasions: [['date', 2], ['special', 2]], amenities: ['sur_place', 'reservation'],
    price: [4, 65, 95], hours: hours('gastro', 12), claims: [team(25, 'whole_menu', 'on_site_visit', 'Visite en cuisine ; aucun alcool dans les préparations.')], pick: true, booking: true, menu: true, publishedDaysAgo: 9,
    description: 'Menu dégustation franco-méditerranéen en huit temps, accords de jus et kombuchas maison. Pour une demande en mariage ou un anniversaire qui compte.',
  },
  {
    id: 'burger-garage', name: 'Burger Garage', near: 'bagnolet', dx: -160, dy: -40,
    street: '27 avenue Gallieni', postcode: '93170', district: 'Bagnolet', city: 'Bagnolet',
    cuisines: ['burger'], occasions: [['famille', 2], ['amis', 1]], amenities: ['sur_place', 'emporter', 'chaise_bebe', 'groupes'],
    price: [1, 10, 15], hours: hours('continu', 30), claims: [decl(50, 'whole_menu', 'email')], sponsored: true,
    description: 'Burgers au steak haché du jour, menu enfant avec jouet, salle façon garage américain. Parking juste devant.',
  },
  {
    id: 'pizza-napoli-ivry', name: 'Napoli Express', near: 'ivry', dx: 120, dy: 200,
    street: '40 avenue Georges-Gosnat', postcode: '94200', district: 'Ivry-sur-Seine', city: 'Ivry-sur-Seine',
    cuisines: ['pizza', 'italienne'], occasions: [['famille', 1], ['rapide', 1]], amenities: ['emporter', 'livraison', 'sur_place'],
    price: [1, 9, 14], hours: hours('semaineTard', 160), claims: [decl(160, 'meat_poultry', 'phone')],
    description: 'Pizzas cuites au feu de bois, merguez de bœuf, pepperoni de dinde. Livraison via partenaire dans un rayon de 3 km.',
  },
  {
    id: 'brunch-club-montreuil', name: 'Brunch Club Montreuil', near: 'montreuil-93', dx: 160, dy: -220,
    street: '3 boulevard Rouget-de-Lisle', postcode: '93100', district: 'Montreuil', city: 'Montreuil',
    cuisines: ['brunch'], occasions: [['famille', 2], ['chill', 2]], amenities: ['sur_place', 'chaise_bebe', 'poussette', 'terrasse', 'vegetarien'],
    price: [2, 19, 26], hours: hours('brunch', 60), claims: [team(140, 'whole_menu', 'supplier_documents')],
    description: 'Formule brunch avec jus pressé, granola maison et œufs brouillés au beurre. Coin jeux pour les petits, terrasse aux beaux jours.',
  },
  {
    id: 'panini-faubourg', name: 'Le Panini du Faubourg', near: 'gare-de-l-est', dx: 60, dy: -260,
    street: '120 rue du Faubourg Saint-Martin', postcode: '75010', district: 'Paris 10e', neighbourhood: 'Gare de l’Est',
    cuisines: ['sandwich', 'turque'], occasions: [['rapide', 2], ['street', 1]], amenities: ['emporter'],
    price: [1, 6, 9], hours: undefined, claims: [],
    description: 'Paninis, sandwichs grecs et assiettes rapides. Fiche incomplète : horaires et information halal à confirmer.',
  },
  {
    id: 'beit-zaatar', name: 'Beit Zaatar', near: 'montparnasse', dx: 120, dy: 140,
    street: '18 rue d’Odessa', postcode: '75014', district: 'Paris 14e', neighbourhood: 'Montparnasse',
    cuisines: ['libanaise'], occasions: [['rapide', 2], ['chill', 1]], amenities: ['sur_place', 'emporter', 'vegetarien'],
    price: [1, 7, 13], hours: hours('continu', 26), claims: [cert('alpha', 100, 365)], partner: true, menu: true,
    description: 'Manakish au zaatar et fromage akkawi sortis du four à pain, labné à l’huile d’olive. Petit-déjeuner libanais dès l’ouverture.',
  },
  {
    id: 'biryani-house', name: 'Biryani House', near: 'gare-de-l-est', dx: -120, dy: 90,
    street: '4 rue de Strasbourg', postcode: '75010', district: 'Paris 10e', neighbourhood: 'Gare de l’Est',
    cuisines: ['indienne', 'pakistanaise'], occasions: [['rapide', 1], ['amis', 1]], amenities: ['sur_place', 'emporter'],
    price: [1, 10, 15], hours: hours('continu', 190), claims: [team(250, 'whole_menu', 'on_site_visit')],
    description: 'Biryani hyderabadi en dum, raïta au concombre, mango lassi épais. Horaires vérifiés il y a plus de six mois.',
  },
  {
    id: 'sakura-boulogne', name: 'Sakura Sushi', near: 'boulogne', dx: 200, dy: 120,
    street: '64 avenue Jean-Baptiste-Clément', postcode: '92100', district: 'Boulogne-Billancourt', city: 'Boulogne-Billancourt',
    cuisines: ['japonaise'], occasions: [['date', 1], ['famille', 1]], amenities: ['sur_place', 'emporter', 'livraison'],
    price: [2, 18, 30], hours: hours('midiSoir', 85), claims: [decl(85, 'whole_menu', 'email', 'Pas de mirin ; sauce soja certifiée sans alcool.')],
    description: 'Sushis et chirashi, poulet teriyaki sans mirin, mochis glacés. Plateaux à partager pour quatre.',
  },
  {
    id: 'taco-loco', name: 'Taco Loco', near: 'pigalle', dx: 120, dy: 120,
    street: '15 rue Houdon', postcode: '75018', district: 'Paris 18e', neighbourhood: 'Abbesses',
    cuisines: ['latino'], occasions: [['amis', 2], ['festif', 2]], amenities: ['sur_place', 'groupes'],
    price: [2, 15, 24], hours: hours('nuit', 110), claims: [decl(110, 'meat_poultry', 'phone')], publishedDaysAgo: 27,
    description: 'Tacos al pastor à la dinde, birria de bœuf à tremper, aguas frescas à l’hibiscus. Mariachis le jeudi.',
  },
  {
    id: 'route-93', name: 'Route 93 Diner', near: 'saint-ouen', dx: 140, dy: -120,
    street: '73 rue des Rosiers', postcode: '93400', district: 'Saint-Ouen', city: 'Saint-Ouen', neighbourhood: 'Puces',
    cuisines: ['americaine', 'burger'], occasions: [['amis', 2], ['famille', 1]], amenities: ['sur_place', 'terrasse', 'groupes', 'chaise_bebe'],
    price: [2, 15, 23], hours: hours('continu', 33), claims: [team(95, 'whole_menu', 'supplier_documents')],
    description: 'Diner chromé près des Puces : milkshakes épais, burgers au bacon de bœuf, banquettes rouges pour huit.',
  },
  {
    id: 'chocolat-dattes', name: 'Chocolat & Dattes', near: 'marais', dx: -60, dy: -170,
    street: '35 rue des Rosiers', postcode: '75004', district: 'Paris 4e', neighbourhood: 'Marais',
    cuisines: ['patisserie'], occasions: [['date', 1], ['chill', 2]], amenities: ['sur_place', 'emporter'],
    price: [1, 5, 12], hours: hours('salonDeThe', 48), claims: [team(60, 'whole_menu', 'supplier_documents')],
    description: 'Tarte au chocolat et dattes medjool, chocolat chaud à la cardamome. Trois tables, des confiseries à offrir.',
  },
  {
    id: 'comptoir-healthy-opera', name: 'Le Comptoir Healthy', near: 'opera', dx: -130, dy: 80,
    street: '8 rue de la Chaussée-d’Antin', postcode: '75009', district: 'Paris 9e', neighbourhood: 'Opéra',
    cuisines: ['healthy'], occasions: [['business', 2], ['rapide', 2]], amenities: ['sur_place', 'emporter', 'vegetarien', 'wifi'],
    price: [2, 14, 19], hours: hours('dejeuner', 40), claims: [decl(65, 'meat_poultry', 'email')],
    description: 'Salades composées, poulet rôti aux herbes, soupes de saison. Tables pour quatre et prises électriques.',
  },
  {
    id: 'grill-bercy', name: 'Grill de Bercy', near: 'bercy', dx: 330, dy: -560,
    street: '22 cour Saint-Émilion', postcode: '75012', district: 'Paris 12e', neighbourhood: 'Bercy Village',
    cuisines: ['grillades'], occasions: [['amis', 2], ['famille', 1]], amenities: ['sur_place', 'groupes', 'terrasse', 'pmr', 'reservation'],
    price: [2, 20, 32], hours: hours('semaineTard', 58), claims: [team(120, 'whole_menu', 'on_site_visit')], booking: true,
    description: 'Mixed grill pour quatre, côtelettes d’agneau, légumes rôtis à la braise. Terrasse piétonne, tables de dix sur réservation.',
  },
  {
    id: 'couscous-dimanche', name: 'Le Couscous du Dimanche', near: 'pantin', dx: 60, dy: -90,
    street: '49 avenue Jean-Lolive', postcode: '93500', district: 'Pantin', city: 'Pantin',
    cuisines: ['algerienne', 'marocaine'], occasions: [['famille', 2]], amenities: ['sur_place', 'groupes'],
    price: [2, 16, 22], hours: undefined, claims: [decl(400, 'whole_menu', 'legacy_import')],
    description: 'Couscous royal au mouton et merguez maison, servi en grands plats. Horaires non communiqués : appelez avant de venir.',
  },
  {
    id: 'marche-afro', name: 'Le Marché Afro', near: 'montmartre', dx: 160, dy: 1150,
    street: '30 boulevard Ney', postcode: '75018', district: 'Paris 18e', neighbourhood: 'Porte de Clignancourt',
    cuisines: ['africaine', 'ivoirienne', 'senegalaise'], occasions: [['amis', 1], ['street', 2]], amenities: ['emporter', 'sur_place'],
    price: [1, 8, 13], hours: hours('continu', 120), claims: [decl(120, 'whole_menu', 'phone')],
    description: 'Comptoir panafricain : poulet DG, attiéké, beignets haricots. Plats du jour affichés sur une ardoise.',
  },
  {
    id: 'bistro-vincennes', name: 'Bistro du Château', near: 'vincennes', dx: -120, dy: 140,
    street: '12 rue du Midi', postcode: '94300', district: 'Vincennes', city: 'Vincennes',
    cuisines: ['francaise'], occasions: [['date', 2], ['famille', 1]], amenities: ['sur_place', 'reservation', 'chaise_bebe', 'terrasse'],
    price: [3, 28, 40], hours: hours('midiSoir', 66), claims: [cert('beta', 220, 365)], booking: true,
    description: 'Cuisine de marché à deux pas du château : magret de canard halal, risotto aux cèpes, tarte tatin. Terrasse chauffée.',
  },
  // ─── Cas limites ──────────────────────────────────────────────────────────
  {
    id: 'kebab-royal-ferme', name: 'Kebab Royal Oberkampf', near: 'oberkampf', dx: -180, dy: -60,
    street: '61 rue Oberkampf', postcode: '75011', district: 'Paris 11e', neighbourhood: 'Oberkampf',
    cuisines: ['turque', 'sandwich'], occasions: [['street', 2]], amenities: ['emporter'],
    price: [1, 7, 10], hours: hours('streetTard', 500), claims: [decl(500, 'whole_menu', 'legacy_import')], operating: 'permanently_closed',
    description: 'Fermé définitivement. La fiche reste accessible par son lien pour l’expliquer et proposer des adresses proches.',
  },
  {
    id: 'seoul-fried-ancienne', name: 'Seoul Fried (ancienne adresse)', near: 'strasbourg-saint-denis', dx: -120, dy: -90,
    street: '140 rue Saint-Denis', postcode: '75002', district: 'Paris 2e',
    cuisines: ['coreenne', 'poulet'], claims: [decl(400, 'whole_menu', 'legacy_import')], operating: 'moved', successorId: 'seoul-fried',
    hours: hours('nuit', 400),
    description: 'A déménagé boulevard de Strasbourg.',
  },
  {
    id: 'nour-temporaire', name: 'Nour', near: 'republique', dx: 260, dy: -180,
    street: '5 rue Jean-Pierre-Timbaud', postcode: '75011', district: 'Paris 11e', neighbourhood: 'République',
    cuisines: ['libanaise', 'syrienne'], occasions: [['cosy', 2], ['date', 1]], amenities: ['sur_place', 'reservation'],
    price: [2, 18, 26], hours: hours('midiSoir', 20), claims: [cert('alpha', 50, 365)], operating: 'temporarily_closed', temporarilyClosedForDays: 9,
    description: 'Mezze et grillades levantines. Fermé pour travaux, réouverture annoncée par le restaurant.',
  },
  {
    id: 'brouillon-nouveau', name: 'Spot en préparation', near: 'canal-saint-martin', dx: -200, dy: 200,
    street: '2 quai de Valmy', postcode: '75010', district: 'Paris 10e',
    cuisines: ['burger'], claims: [], publication: 'draft', hours: hours('continu', 5),
    description: 'Brouillon : invisible dans l’application tant qu’il n’est pas publié.',
  },
];

export const RESTAURANTS: Restaurant[] = SPECS.map(build);

// ─── Contenus éditoriaux ────────────────────────────────────────────────────

export interface EditorialCollection {
  id: string;
  title: string;
  kicker: string;
  intro: string;
  /** Critères explicites, affichés tels quels. */
  criteria: string[];
  /** Sélection manuelle, ou règle calculée sur le catalogue. */
  restaurantIds?: string[];
  rule?: 'newest' | 'late_night';
  hue: number;
}

export const COLLECTIONS: EditorialCollection[] = [
  {
    id: 'date',
    title: 'Pour un date',
    kicker: 'Sélection de la rédaction',
    intro: 'Lumière basse, réservation possible, des plats qui se partagent. Pour impressionner sans en faire trop.',
    criteria: ['Envie « date » posée par la rédaction', 'Réservation possible', 'Visité ou vérifié dans l’année'],
    restaurantIds: ['maison-cedre', 'table-ifrane', 'bistrot-amine', 'maison-yasmine', 'aldiyar', 'bistro-vincennes'],
    hue: 350,
  },
  {
    id: 'dej-rapide',
    title: 'Déjeuner en 45 minutes',
    kicker: 'Pause déj',
    intro: 'Servi vite, mangé sans se presser, moins de 15 € le plus souvent.',
    criteria: ['Envie « déjeuner rapide »', 'Ouvert le midi en semaine', 'Budget € ou €€'],
    restaurantIds: ['green-bowl', 'beit-zaatar', 'kyoto-bowl', 'lahore-grill', 'petit-tunis', 'lanzhou-nouilles', 'comptoir-healthy-opera', 'teranga-express'],
    hue: 150,
  },
  {
    id: 'tablees',
    title: 'Grandes tablées',
    kicker: 'Entre amis',
    intro: 'Des tables de six et plus, confirmées par le restaurant. Pour l’anniversaire ou le match.',
    criteria: ['Tables de 6 et plus confirmées', 'Envie « entre amis »'],
    restaurantIds: ['braises-belleville', 'comptoir-anatolie', 'grill-bercy', 'route-93', 'seoul-fried', 'smash-saint-denis', 'tandoor-royal'],
    hue: 30,
  },
  {
    id: 'brunch',
    title: 'Brunchs du week-end',
    kicker: 'Samedi, dimanche',
    intro: 'Œufs, pancakes et charcuteries halal vérifiées chez le fournisseur.',
    criteria: ['Cuisine « brunch » ou petit-déjeuner', 'Ouvert le week-end'],
    restaurantIds: ['sunny-side', 'brunch-club-montreuil', 'beit-zaatar', 'patisserie-saba'],
    hue: 85,
  },
  {
    id: 'nouveautes',
    title: 'Nouvelles adresses',
    kicker: 'Moins de 60 jours',
    intro: 'Fraîchement référencées, avec la même exigence que les autres.',
    criteria: ['Publiées depuis moins de 60 jours'],
    rule: 'newest',
    hue: 200,
  },
  {
    id: 'apres-minuit',
    title: 'Ouvert après minuit',
    kicker: 'Fringale tardive',
    intro: 'Ouverts à 1 h du matin cette nuit, horaires confirmés seulement.',
    criteria: ['Ouvert à 01:00 la nuit qui vient', 'Horaires confirmés il y a moins de 6 mois'],
    rule: 'late_night',
    hue: 265,
  },
  {
    id: 'pepites',
    title: 'Pépites à découvrir',
    kicker: 'Hors des sentiers',
    intro: 'Des cuisines qu’on voit trop peu, choisies par l’équipe.',
    criteria: ['Coup de cœur de la rédaction', 'Cuisine peu représentée dans le catalogue'],
    restaurantIds: ['habesha', 'lanzhou-nouilles', 'chez-awa', 'aldiyar', 'table-ifrane'],
    hue: 60,
  },
];

export interface Article {
  id: string;
  title: string;
  kicker: string;
  readMinutes: number;
  body: string[];
  restaurantIds: string[];
  hue: number;
}

export const ARTICLES: Article[] = [
  {
    id: 'un-pays-un-plat-thieboudienne',
    kicker: 'Un pays, un plat, un resto',
    title: 'Le thiéboudienne, riz au poisson du Sénégal',
    readMinutes: 3,
    hue: 75,
    body: [
      'Plat national du Sénégal, le thiéboudienne se prépare en une seule marmite : le poisson farci au persil et à l’ail, les légumes, puis le riz qui cuit dans le bouillon tomaté.',
      'Le meilleur morceau est le xoon, la croûte de riz caramélisée au fond de la marmite. Demandez-la : on vous la sert souvent sans le dire.',
      'Deux adresses de la démo le servent, le vendredi surtout.',
    ],
    restaurantIds: ['teranga-express', 'o-mafe'],
  },
  {
    id: 'chateau-rouge-4-adresses',
    kicker: 'Guide de quartier',
    title: 'Château-Rouge et la Goutte d’Or en 4 adresses',
    readMinutes: 4,
    hue: 30,
    body: [
      'Entre le marché Dejean et la rue des Poissonniers, le quartier concentre des cuisines d’Afrique de l’Ouest et du Maghreb qu’on trouve rarement ailleurs à Paris.',
      'Commencez par un alloco chez Awa, finissez par une chorba à Barbès. Tout se fait à pied, en dix minutes.',
    ],
    restaurantIds: ['teranga-express', 'chez-awa', 'chorba-co', 'tandoor-royal'],
  },
  {
    id: 'trouve-sur-yallayum-lanzhou',
    kicker: 'Trouvé sur YallaYum',
    title: 'Lanzhou : les nouilles tirées à la main',
    readMinutes: 2,
    hue: 15,
    body: [
      'La cuisine hui, celle des musulmans de Chine, a inventé ces nouilles étirées à la main en quelques secondes devant le client.',
      'Le bouillon de bœuf doit être clair, le radis blanc, l’huile pimentée rouge vif, la coriandre verte : c’est la règle des cinq couleurs.',
    ],
    restaurantIds: ['lanzhou-nouilles'],
  },
];

export const LOYALTY_PARTNERS = RESTAURANTS.filter((r) => r.loyaltyPartnerId).map((r) => ({
  id: r.loyaltyPartnerId!,
  restaurantId: r.id,
  name: r.name,
  active: true,
}));
