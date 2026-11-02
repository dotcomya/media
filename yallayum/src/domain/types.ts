// Vocabulaire canonique de YallaYum.
//
// Ces types sont la source de vérité partagée par l'application mobile, le
// back-office, l'API et le schéma SQL (db/schema.sql) : un statut ou un niveau
// de preuve porte le même nom partout. Aucun type ne dépend du navigateur.

/** Date civile 'AAAA-MM-JJ', interprétée dans le fuseau de l'établissement. */
export type ISODate = string;
/** Horodatage ISO 8601 avec fuseau (ex. 2026-10-27T21:40:00Z). */
export type ISODateTime = string;

export interface LatLng {
  lat: number;
  lng: number;
}

/** [ouest, sud, est, nord] en degrés WGS 84. */
export type BBox = [number, number, number, number];

// ─── Publication et exploitation ────────────────────────────────────────────

/** Cycle de vie éditorial d'une fiche. Seule « published » est visible du public. */
export type PublicationStatus = 'draft' | 'in_review' | 'published' | 'suspended' | 'archived';

/**
 * Situation réelle de l'établissement, indépendante de la publication.
 * Une fiche publiée mais fermée définitivement sort de la découverte ; son lien
 * profond explique la fermeture au lieu de renvoyer une erreur.
 */
export type OperatingStatus = 'operating' | 'temporarily_closed' | 'permanently_closed' | 'moved';

// ─── Adresse et horaires ────────────────────────────────────────────────────

export interface Address {
  street: string;
  postcode: string;
  city: string;
  /** Arrondissement ou commune affichée (« Paris 11e », « Saint-Denis »). */
  district: string;
  /** Quartier d'usage (« Oberkampf », « Château-Rouge »). */
  neighbourhood?: string;
  country: string;
}

/** Jour ISO : 1 = lundi … 7 = dimanche. */
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

/**
 * Plage d'ouverture en heure locale. Une fermeture inférieure ou égale à
 * l'ouverture traverse minuit (18:00 → 02:00) : la plage appartient au jour
 * où elle commence.
 */
export interface TimeRange {
  opens: string;
  closes: string;
}

export interface WeeklyRange extends TimeRange {
  day: Weekday;
}

/** Exception datée : remplace les plages hebdomadaires qui commencent ce jour-là. */
export interface SpecialDay {
  date: ISODate;
  closed: boolean;
  ranges?: TimeRange[];
  /** « Jour férié », « Congés annuels »… */
  label?: string;
}

export type HoursSource = 'restaurant' | 'team_visit' | 'team_phone' | 'website' | 'community' | 'legacy_import';

export interface OpeningHours {
  weekly: WeeklyRange[];
  special: SpecialDay[];
  /** Dernière confirmation des horaires par une source fiable. */
  verifiedAt?: ISODate;
  source: HoursSource;
}

// ─── Information halal ──────────────────────────────────────────────────────

/**
 * Nature de la preuve. Les quatre notions ne se confondent jamais :
 * - certification : un organisme atteste, certificat contrôlé par l'équipe ;
 * - team_verification : l'équipe a contrôlé des justificatifs, sans organisme ;
 * - establishment_declaration : le restaurant déclare, sans justificatif contrôlé.
 * Une adresse simplement listée n'a aucune déclaration validée.
 */
export type HalalClaimKind = 'certification' | 'team_verification' | 'establishment_declaration';

/** Ce que couvre la déclaration. */
export type HalalScope = 'whole_menu' | 'meat_poultry' | 'partial';

export type ClaimReviewStatus = 'pending' | 'approved' | 'rejected' | 'revoked';

export type EvidenceMethod =
  | 'certificate_check'
  | 'on_site_visit'
  | 'supplier_documents'
  | 'phone'
  | 'email'
  | 'legacy_import';

export interface HalalClaim {
  id: string;
  kind: HalalClaimKind;
  scope: HalalScope;
  /** Précision publique du périmètre (« Toutes les viandes ; pas de porc à la carte »). */
  scopeNote?: string;
  /** Organisme de certification, si kind = certification. */
  certifierId?: string;
  /** Référence publique du certificat quand l'organisme la publie. */
  certificateRef?: string;
  method: EvidenceMethod;
  /** Date de la preuve (visite, certificat, déclaration écrite). */
  evidenceDate: ISODate;
  /** Fin de validité : obligatoire pour une certification. */
  validUntil?: ISODate;
  reviewStatus: ClaimReviewStatus;
  reviewedAt?: ISODate;
  /** Vérification en cours, décidée par l'équipe (jamais automatique sur signalement). */
  underReview?: boolean;
}

export interface Certifier {
  id: string;
  name: string;
  shortName: string;
  website?: string;
}

// ─── Taxonomies ─────────────────────────────────────────────────────────────

/** Force d'une étiquette éditoriale : 2 = caractéristique du lieu, 1 = convient. */
export type TagStrength = 1 | 2;

export interface OccasionTag {
  id: string;
  strength: TagStrength;
}

/** Niveau de prix par personne : 1 = moins de 15 €, 4 = plus de 50 €. */
export type PriceLevel = 1 | 2 | 3 | 4;

export type AlcoholPolicy = 'not_served' | 'served' | 'unknown';

// ─── Médias ─────────────────────────────────────────────────────────────────

/**
 * « illustration » = visuel générique, toujours signalé comme tel à l'écran.
 * Jamais d'image générée présentée comme la photo d'un lieu réel.
 */
export type MediaKind = 'photo' | 'illustration';

export interface Media {
  id: string;
  kind: MediaKind;
  subject: 'dish' | 'room' | 'facade' | 'generic';
  alt: string;
  credit?: string;
  license?: string;
  /** Pour une illustration : graine du visuel génératif. */
  seed?: number;
}

// ─── Établissement ──────────────────────────────────────────────────────────

export interface Contact {
  phone?: string;
  website?: string;
  instagram?: string;
  bookingUrl?: string;
  menuUrl?: string;
  /** Date à laquelle le menu lié a été consulté par l'équipe. */
  menuCheckedAt?: ISODate;
}

export interface PriceInfo {
  level: PriceLevel;
  /** Fourchette observée, par personne, avec sa date : jamais inventée. */
  min?: number;
  max?: number;
  observedAt?: ISODate;
}

export interface SponsoredCampaign {
  id: string;
  /** Période d'affichage. */
  from: ISODate;
  to: ISODate;
  /** Libellé obligatoire, affiché partout où la fiche est mise en avant. */
  label: 'Sponsorisé';
}

export interface Restaurant {
  id: string;
  slug: string;
  /** Anciennes adresses de la fiche, redirigées. */
  previousSlugs?: string[];
  name: string;
  /** Enseigne : plusieurs établissements physiques peuvent la partager. */
  brandId?: string;
  description: string;
  publication: PublicationStatus;
  operating: OperatingStatus;
  temporarilyClosedUntil?: ISODate;
  /** Fiche qui remplace celle-ci après un déménagement. */
  successorId?: string;
  location: LatLng;
  address: Address;
  timezone: string;
  cuisines: string[];
  occasions: OccasionTag[];
  amenities: string[];
  alcohol: AlcoholPolicy;
  price?: PriceInfo;
  hours?: OpeningHours;
  contact: Contact;
  media: Media[];
  halalClaims: HalalClaim[];
  /** Coup de cœur de la rédaction. */
  editorialPick: boolean;
  publishedAt?: ISODate;
  updatedAt: ISODate;
  loyaltyPartnerId?: string;
  sponsored?: SponsoredCampaign;
  /** Version pour le verrouillage optimiste du back-office. */
  version: number;
}

export interface Brand {
  id: string;
  name: string;
}
