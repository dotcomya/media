// Contributions des utilisateurs : propositions d'adresses et signalements.
//
// Aucune contribution ne modifie une fiche publiée. Acceptée, elle devient
// une proposition de modification appliquée au brouillon, puis publiée par
// un éditeur ; si elle touche à l'information halal, seul un vérificateur
// peut la valider. Les accusations ne sont jamais affichées publiquement.

import type { ISODateTime } from './types';
import { can, type Actor } from './rbac';

export type ContributionKind =
  | 'new_restaurant'
  | 'closed_permanently'
  | 'moved'
  | 'hours'
  | 'halal_info'
  | 'photos'
  | 'contact'
  | 'duplicate'
  | 'other';

export const CONTRIBUTION_LABELS: Record<ContributionKind, string> = {
  new_restaurant: 'Nouvelle adresse',
  closed_permanently: 'Fermé définitivement',
  moved: 'A déménagé',
  hours: 'Horaires',
  halal_info: 'Information halal',
  photos: 'Photos',
  contact: 'Coordonnées',
  duplicate: 'Doublon',
  other: 'Autre',
};

export type ContributionStatus = 'received' | 'in_review' | 'needs_info' | 'accepted' | 'rejected' | 'duplicate';

export const CONTRIBUTION_STATUS_LABELS: Record<ContributionStatus, string> = {
  received: 'Reçu',
  in_review: 'En cours d’examen',
  needs_info: 'Précisions demandées',
  accepted: 'Pris en compte',
  rejected: 'Non retenu',
  duplicate: 'Déjà signalé',
};

export const CONTRIBUTION_TRANSITIONS: Record<ContributionStatus, ContributionStatus[]> = {
  received: ['in_review', 'duplicate', 'rejected'],
  in_review: ['needs_info', 'accepted', 'rejected', 'duplicate'],
  needs_info: ['in_review', 'rejected'],
  accepted: [],
  rejected: [],
  duplicate: [],
};

export interface Contribution {
  id: string;
  kind: ContributionKind;
  restaurantId?: string;
  /** Champs proposés (nom, adresse, horaires…), jamais appliqués tels quels. */
  payload: Record<string, unknown>;
  /** Source de l'information halal déclarée par le contributeur. */
  halalSource?: string;
  message?: string;
  status: ContributionStatus;
  createdAt: ISODateTime;
  /** Compte du contributeur, ou rien pour un invité. */
  userId?: string;
  history: { at: ISODateTime; status: ContributionStatus; actorId?: string; note?: string }[];
}

export interface ChangeProposal {
  id: string;
  contributionId: string;
  restaurantId?: string;
  changes: Record<string, unknown>;
  /** Rôle requis pour l'appliquer au brouillon. */
  requires: 'restaurant.edit' | 'halal.review';
  status: 'pending' | 'applied' | 'discarded';
}

export function isHalalRelated(c: Pick<Contribution, 'kind' | 'payload'>): boolean {
  return c.kind === 'halal_info' || 'halal' in c.payload;
}

export class ModerationError extends Error {}

export function moveContribution(
  c: Contribution,
  to: ContributionStatus,
  actor: Actor,
  at: ISODateTime,
  note?: string,
): Contribution {
  if (!can(actor, 'contribution.moderate')) throw new ModerationError('Droit insuffisant');
  if (!CONTRIBUTION_TRANSITIONS[c.status].includes(to)) {
    throw new ModerationError(`${CONTRIBUTION_STATUS_LABELS[c.status]} → ${CONTRIBUTION_STATUS_LABELS[to]} : impossible`);
  }
  if ((to === 'rejected' || to === 'needs_info') && !note?.trim()) throw new ModerationError('Motif obligatoire');
  return { ...c, status: to, history: [...c.history, { at, status: to, actorId: actor.id, note }] };
}

/**
 * Accepter une contribution produit une proposition de modification, pas une
 * publication. Le statut public de la fiche ne change pas.
 */
export function acceptContribution(c: Contribution, actor: Actor, at: ISODateTime): { contribution: Contribution; proposal: ChangeProposal } {
  const contribution = moveContribution(c.status === 'received' ? moveContribution(c, 'in_review', actor, at) : c, 'accepted', actor, at);
  return {
    contribution,
    proposal: {
      id: `cp-${c.id}`,
      contributionId: c.id,
      restaurantId: c.restaurantId,
      changes: c.payload,
      requires: isHalalRelated(c) ? 'halal.review' : 'restaurant.edit',
      status: 'pending',
    },
  };
}

/** Une contribution d'invité doit-elle être retenue ? Garde-fous simples contre le spam. */
export function validateSubmission(c: Pick<Contribution, 'kind' | 'payload' | 'message' | 'restaurantId'>): string[] {
  const errors: string[] = [];
  if (c.kind === 'new_restaurant') {
    if (!String(c.payload.name ?? '').trim()) errors.push('Le nom est obligatoire.');
    if (!String(c.payload.address ?? '').trim()) errors.push("L'adresse est obligatoire.");
  } else if (!c.restaurantId) {
    errors.push('Le signalement doit viser une fiche.');
  }
  if ((c.message ?? '').length > 2000) errors.push('Message trop long (2 000 caractères au plus).');
  if (/(https?:\/\/\S+.*){3,}/.test(c.message ?? '')) errors.push('Trop de liens dans le message.');
  return errors;
}
