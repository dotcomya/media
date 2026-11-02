// Plan de marquage : peu d'événements, définis, versionnés, sans donnée personnelle.
//
// Principes :
// - aucune position précise, jamais : la distance est envoyée par tranche ;
// - aucun texte libre brut : la requête est nettoyée (chiffres, e-mails) et
//   tronquée, et n'est conservée que pour les recherches sans résultat ;
// - deux régimes : « audience » (mesure strictement nécessaire, configurée
//   selon les conditions d'exemption de la CNIL, sans recoupement ni
//   identifiant publicitaire) et « analytics » (sur consentement) ;
// - aucun SDK publicitaire : un comportement de recherche halal peut révéler
//   une conviction religieuse, donnée sensible au sens de l'article 9 du RGPD.

export type ConsentRegime = 'audience' | 'analytics';

type PropType =
  | { type: 'enum'; values: readonly string[] }
  | { type: 'bool' }
  | { type: 'int'; max: number }
  | { type: 'id' }
  | { type: 'query' };

export interface EventSpec {
  version: number;
  regime: ConsentRegime;
  /** Définition métier, reprise dans le dictionnaire de données. */
  definition: string;
  props: Record<string, PropType>;
}

const DISTANCE_BUCKETS = ['<500m', '500m-1km', '1-3km', '3-10km', '>10km', 'inconnue'] as const;
const SOURCES = ['map', 'list', 'carousel', 'search', 'collection', 'deeplink', 'similar', 'favorites'] as const;
const LEVELS = ['certified', 'team_verified', 'declared', 'unconfirmed'] as const;

export const EVENTS = {
  app_open: { version: 1, regime: 'audience', definition: "Ouverture ou retour au premier plan de l'application.", props: { cold_start: { type: 'bool' } } },
  location_permission_result: {
    version: 1,
    regime: 'audience',
    definition: 'Réponse à la demande de position (système ou choix de ville).',
    props: { result: { type: 'enum', values: ['granted', 'denied', 'unavailable', 'city_chosen', 'dismissed'] } },
  },
  search_submitted: {
    version: 1,
    regime: 'audience',
    definition: 'Recherche validée (saisie, suggestion ou puce). La requête n’est gardée que si zéro résultat.',
    props: {
      results: { type: 'int', max: 500 },
      zero_query: { type: 'query' },
      understood_place: { type: 'bool' },
      understood_cuisine: { type: 'bool' },
      understood_occasion: { type: 'bool' },
    },
  },
  filter_applied: {
    version: 2,
    regime: 'audience',
    definition: 'Filtre ajouté ou retiré.',
    props: {
      filter: { type: 'enum', values: ['cuisines', 'occasions', 'priceMax', 'openNow', 'openAt', 'radius', 'halalMin', 'certifiers', 'amenities', 'alcoholFree', 'collection', 'all'] },
      action: { type: 'enum', values: ['add', 'remove', 'clear_all'] },
      results: { type: 'int', max: 500 },
    },
  },
  map_area_searched: { version: 1, regime: 'audience', definition: 'Bouton « Rechercher dans cette zone ».', props: { results: { type: 'int', max: 500 } } },
  restaurant_impression: {
    version: 1,
    regime: 'analytics',
    definition: 'Carte de résultat visible au moins une seconde à 50 % (échantillonné).',
    props: { restaurant_id: { type: 'id' }, position: { type: 'int', max: 100 }, sponsored: { type: 'bool' }, source: { type: 'enum', values: SOURCES } },
  },
  restaurant_opened: {
    version: 1,
    regime: 'audience',
    definition: 'Fiche détaillée ouverte.',
    props: { restaurant_id: { type: 'id' }, source: { type: 'enum', values: SOURCES }, sponsored: { type: 'bool' }, distance: { type: 'enum', values: DISTANCE_BUCKETS } },
  },
  halal_info_expanded: {
    version: 1,
    regime: 'audience',
    definition: 'Détail de l’information halal déplié sur une fiche.',
    props: { restaurant_id: { type: 'id' }, level: { type: 'enum', values: LEVELS } },
  },
  route_clicked: {
    version: 1,
    regime: 'audience',
    definition: 'Intention de visite : ouverture d’une application de navigation. Ne prouve pas la visite.',
    props: { restaurant_id: { type: 'id' }, app: { type: 'enum', values: ['apple', 'google', 'waze', 'citymapper', 'other'] }, distance: { type: 'enum', values: DISTANCE_BUCKETS } },
  },
  phone_clicked: { version: 1, regime: 'audience', definition: 'Intention de visite : appel.', props: { restaurant_id: { type: 'id' } } },
  booking_clicked: { version: 1, regime: 'audience', definition: 'Intention de visite : réservation externe.', props: { restaurant_id: { type: 'id' } } },
  share_clicked: {
    version: 2,
    regime: 'audience',
    definition: 'Intention de visite : partage d’une fiche (restaurant_id) ou d’une collection (collection_id).',
    props: { restaurant_id: { type: 'id' }, collection_id: { type: 'id' }, target: { type: 'enum', values: ['restaurant', 'collection'] } },
  },
  favorite_added: { version: 1, regime: 'audience', definition: 'Adresse enregistrée.', props: { restaurant_id: { type: 'id' }, signed_in: { type: 'bool' } } },
  report_submitted: {
    version: 1,
    regime: 'audience',
    definition: 'Contribution envoyée (proposition ou signalement).',
    props: { kind: { type: 'enum', values: ['new_restaurant', 'closed_permanently', 'moved', 'hours', 'halal_info', 'photos', 'contact', 'duplicate', 'other'] } },
  },
  loyalty_card_opened: { version: 1, regime: 'audience', definition: 'Écran « Ma carte » affiché.', props: { activated: { type: 'bool' } } },
  loyalty_transaction_result: {
    version: 1,
    regime: 'audience',
    definition: 'Résultat d’un passage en caisse (côté client, après synchronisation).',
    props: { status: { type: 'enum', values: ['credited', 'duplicate', 'rejected', 'pending'] } },
  },
} as const satisfies Record<string, EventSpec>;

export type EventName = keyof typeof EVENTS;

export interface TrackedEvent {
  name: EventName;
  version: number;
  regime: ConsentRegime;
  props: Record<string, string | number | boolean>;
  /** Horodatage tronqué à la minute. */
  at: string;
}

export interface Consent {
  analytics: boolean;
}

/** Tranche de distance : la seule forme sous laquelle une distance quitte le téléphone. */
export function distanceBucket(meters?: number): (typeof DISTANCE_BUCKETS)[number] {
  if (meters === undefined) return 'inconnue';
  if (meters < 500) return '<500m';
  if (meters < 1000) return '500m-1km';
  if (meters < 3000) return '1-3km';
  if (meters < 10000) return '3-10km';
  return '>10km';
}

/** Retire ce qui pourrait identifier quelqu'un dans une requête : e-mails, numéros. */
export function scrubQuery(q: string): string {
  return q
    .replace(/\S+@\S+/g, '[email]')
    .replace(/\+?\d[\d .-]{5,}\d/g, '[numéro]')
    .slice(0, 60)
    .trim();
}

/**
 * Construit l'événement à envoyer, ou null s'il ne doit pas partir :
 * consentement absent, propriété inconnue ou invalide (on préfère perdre un
 * événement que d'envoyer une donnée imprévue).
 */
export function buildEvent(name: EventName, props: Record<string, unknown>, consent: Consent, at: Date): TrackedEvent | null {
  const spec: EventSpec = EVENTS[name];
  if (spec.regime === 'analytics' && !consent.analytics) return null;
  const clean: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(props)) {
    const p = spec.props[key];
    if (!p || value === undefined) continue;
    switch (p.type) {
      case 'bool':
        if (typeof value !== 'boolean') return null;
        clean[key] = value;
        break;
      case 'int':
        if (typeof value !== 'number' || !Number.isFinite(value)) return null;
        clean[key] = Math.max(0, Math.min(p.max, Math.round(value)));
        break;
      case 'enum':
        if (typeof value !== 'string' || !p.values.includes(value)) return null;
        clean[key] = value;
        break;
      case 'id':
        if (typeof value !== 'string' || !/^[a-z0-9-]{1,64}$/.test(value)) return null;
        clean[key] = value;
        break;
      case 'query':
        if (typeof value !== 'string') return null;
        clean[key] = scrubQuery(value);
        break;
    }
  }
  const minute = new Date(Math.floor(at.getTime() / 60_000) * 60_000).toISOString();
  return { name, version: spec.version, regime: spec.regime, props: clean, at: minute };
}
