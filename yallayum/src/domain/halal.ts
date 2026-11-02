// Information halal : du dossier de preuves au badge affiché.
//
// Le badge n'est jamais saisi à la main : il est dérivé, à chaque lecture, des
// déclarations validées et de leurs dates. Une certification expirée cesse
// donc d'être affichée le jour même, sans attendre une intervention ; le
// traitement quotidien (db/schema.sql, expire_halal_claims) trace l'événement
// au journal d'audit et ouvre une tâche de revérification.
//
// Rien ici ne dépend d'une mise en avant commerciale : une campagne
// sponsorisée n'entre jamais dans ce calcul.

import { daysBetween } from './hours';
import type { Certifier, HalalClaim, HalalClaimKind, HalalScope, ISODate } from './types';

/** Niveaux affichés, du plus étayé au moins étayé. */
export type TrustLevel = 'certified' | 'team_verified' | 'declared' | 'unconfirmed';

export const TRUST_ORDER: TrustLevel[] = ['certified', 'team_verified', 'declared', 'unconfirmed'];

export interface TrustLevelInfo {
  rank: number;
  label: string;
  /** Pour les puces et marqueurs, quand la place manque. */
  short: string;
  /** Explication en une phrase, sans promesse de certitude. */
  explanation: string;
}

export const TRUST_LEVELS: Record<TrustLevel, TrustLevelInfo> = {
  certified: {
    rank: 3,
    label: 'Certifié par un organisme',
    short: 'Certifié',
    explanation:
      "Un organisme de certification atteste cet établissement. Nous avons contrôlé le certificat et sa date de validité ; l'organisme reste responsable de ses contrôles.",
  },
  team_verified: {
    rank: 2,
    label: 'Vérifié par YallaYum',
    short: 'Vérifié',
    explanation:
      "Notre équipe a contrôlé des justificatifs (factures et certificats des fournisseurs, visite). Ce n'est pas une certification d'organisme.",
  },
  declared: {
    rank: 1,
    label: 'Déclaré par le restaurant',
    short: 'Déclaré',
    explanation:
      "Le restaurant nous a déclaré servir halal. Nous n'avons pas encore contrôlé de justificatif : demande des précisions sur place si c'est important pour toi.",
  },
  unconfirmed: {
    rank: 0,
    label: 'Info halal à confirmer',
    short: 'À confirmer',
    explanation:
      "Adresse référencée sans justificatif récent. Nous la revérifions ; en attendant, renseigne-toi sur place.",
  },
};

export const SCOPE_LABELS: Record<HalalScope, string> = {
  whole_menu: 'Toute la carte',
  meat_poultry: 'Viandes et volailles',
  partial: 'Une partie de la carte',
};

export const METHOD_LABELS: Record<HalalClaim['method'], string> = {
  certificate_check: 'Certificat contrôlé',
  on_site_visit: 'Visite sur place',
  supplier_documents: 'Justificatifs des fournisseurs',
  phone: 'Échange téléphonique',
  email: 'Déclaration écrite',
  legacy_import: 'Reprise de la base historique',
};

export interface HalalConfig {
  /** Durée de validité d'une vérification de l'équipe. */
  teamVerificationDays: number;
  /** Durée de validité d'une déclaration du restaurant. */
  declarationDays: number;
  /** Part de la validité au-delà de laquelle la preuve « vieillit ». */
  agingRatio: number;
}

export const DEFAULT_HALAL_CONFIG: HalalConfig = {
  teamVerificationDays: 365,
  declarationDays: 365,
  agingRatio: 0.75,
};

export type Freshness = 'fresh' | 'aging' | 'none';

export interface HalalStatus {
  level: TrustLevel;
  /** Déclaration qui fonde le niveau affiché. */
  claim?: HalalClaim;
  certifier?: Certifier;
  scope?: HalalScope;
  scopeNote?: string;
  lastCheckedAt?: ISODate;
  /** Date après laquelle ce niveau ne sera plus affiché sans nouvelle preuve. */
  validUntil?: ISODate;
  freshness: Freshness;
  /** Vérification en cours, décidée par l'équipe. */
  underReview: boolean;
  /** Certification expirée retirée du badge, pour le back-office et l'audit. */
  expiredCertification?: HalalClaim;
}

const LEVEL_OF_KIND: Record<HalalClaimKind, TrustLevel> = {
  certification: 'certified',
  team_verification: 'team_verified',
  establishment_declaration: 'declared',
};

/** Fin de validité d'une déclaration validée. */
export function claimValidUntil(claim: HalalClaim, cfg: HalalConfig = DEFAULT_HALAL_CONFIG): ISODate | undefined {
  if (claim.kind === 'certification') return claim.validUntil;
  const days = claim.kind === 'team_verification' ? cfg.teamVerificationDays : cfg.declarationDays;
  const fromEvidence = addDaysIso(claim.evidenceDate, days);
  return claim.validUntil && claim.validUntil < fromEvidence ? claim.validUntil : fromEvidence;
}

function addDaysIso(date: ISODate, days: number): ISODate {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Une déclaration compte-t-elle aujourd'hui ? */
export function isClaimActive(claim: HalalClaim, today: ISODate, cfg: HalalConfig = DEFAULT_HALAL_CONFIG): boolean {
  if (claim.reviewStatus !== 'approved') return false;
  if (claim.evidenceDate > today) return false;
  // Une certification sans date de fin n'est pas affichable : on ne la suppose pas éternelle.
  if (claim.kind === 'certification' && !claim.validUntil) return false;
  const until = claimValidUntil(claim, cfg);
  return until !== undefined && today <= until;
}

export function deriveHalalStatus(
  claims: HalalClaim[],
  today: ISODate,
  certifiers: Certifier[] = [],
  cfg: HalalConfig = DEFAULT_HALAL_CONFIG,
): HalalStatus {
  const active = claims.filter((c) => isClaimActive(c, today, cfg));
  const underReview = claims.some((c) => c.underReview && c.reviewStatus === 'approved');
  const expiredCertification = claims
    .filter((c) => c.kind === 'certification' && c.reviewStatus === 'approved' && c.validUntil && c.validUntil < today)
    .sort((a, b) => (b.validUntil ?? '').localeCompare(a.validUntil ?? ''))[0];

  if (active.length === 0) {
    return { level: 'unconfirmed', freshness: 'none', underReview, expiredCertification };
  }

  // Le niveau le plus étayé l'emporte ; à niveau égal, la preuve la plus récente.
  const best = [...active].sort(
    (a, b) =>
      TRUST_LEVELS[LEVEL_OF_KIND[b.kind]].rank - TRUST_LEVELS[LEVEL_OF_KIND[a.kind]].rank ||
      b.evidenceDate.localeCompare(a.evidenceDate),
  )[0];

  const validUntil = claimValidUntil(best, cfg);
  const lastCheckedAt = active.map((c) => c.reviewedAt ?? c.evidenceDate).sort().at(-1);
  let freshness: Freshness = 'fresh';
  if (validUntil) {
    const total = Math.max(1, daysBetween(best.evidenceDate, validUntil));
    const elapsed = daysBetween(best.evidenceDate, today);
    if (elapsed / total >= cfg.agingRatio) freshness = 'aging';
  }

  return {
    level: LEVEL_OF_KIND[best.kind],
    claim: best,
    certifier: best.certifierId ? certifiers.find((c) => c.id === best.certifierId) : undefined,
    scope: best.scope,
    scopeNote: best.scopeNote,
    lastCheckedAt,
    validUntil,
    freshness,
    underReview,
    expiredCertification,
  };
}

/** Niveau minimal demandé dans les filtres. */
export type HalalFilterLevel = 'any' | 'declared' | 'team_verified' | 'certified';

export function meetsHalalLevel(level: TrustLevel, min: HalalFilterLevel): boolean {
  if (min === 'any') return true;
  return TRUST_LEVELS[level].rank >= TRUST_LEVELS[min].rank;
}

/** Libellé détaillé pour la fiche : « Certifié par Organisme Alpha ». */
export function halalHeadline(status: HalalStatus): string {
  if (status.level === 'certified' && status.certifier) return `Certifié par ${status.certifier.name}`;
  return TRUST_LEVELS[status.level].label;
}
