// Cycle de vie d'une fiche : brouillon → relecture → publiée → suspendue → archivée.
//
// Les transitions sont fermées : tout changement passe par `transition()`,
// qui vérifie le droit de l'auteur, exige un motif pour les décisions
// sensibles et produit l'entrée du journal d'audit. L'archivage est
// récupérable (retour en brouillon), jamais une suppression silencieuse.

import { can, type Actor, type Permission } from './rbac';
import type { ISODateTime, OperatingStatus, PublicationStatus, Restaurant } from './types';

export const PUBLICATION_LABELS: Record<PublicationStatus, string> = {
  draft: 'Brouillon',
  in_review: 'En relecture',
  published: 'Publiée',
  suspended: 'Suspendue',
  archived: 'Archivée',
};

export const OPERATING_LABELS: Record<OperatingStatus, string> = {
  operating: 'En activité',
  temporarily_closed: 'Fermée temporairement',
  permanently_closed: 'Fermée définitivement',
  moved: 'A déménagé',
};

interface Rule {
  to: PublicationStatus;
  permission: Permission;
  reasonRequired: boolean;
}

export const TRANSITIONS: Record<PublicationStatus, Rule[]> = {
  draft: [
    { to: 'in_review', permission: 'restaurant.edit', reasonRequired: false },
    { to: 'archived', permission: 'restaurant.edit', reasonRequired: true },
  ],
  in_review: [
    { to: 'draft', permission: 'restaurant.edit', reasonRequired: true },
    { to: 'published', permission: 'restaurant.publish', reasonRequired: false },
    { to: 'archived', permission: 'restaurant.publish', reasonRequired: true },
  ],
  published: [
    { to: 'suspended', permission: 'restaurant.publish', reasonRequired: true },
    { to: 'archived', permission: 'restaurant.publish', reasonRequired: true },
  ],
  suspended: [
    { to: 'published', permission: 'restaurant.publish', reasonRequired: true },
    { to: 'archived', permission: 'restaurant.publish', reasonRequired: true },
  ],
  archived: [{ to: 'draft', permission: 'restaurant.publish', reasonRequired: true }],
};

export interface AuditEntry {
  id: string;
  at: ISODateTime;
  actorId: string;
  actorRole: Actor['role'];
  action: string;
  entity: 'restaurant' | 'halal_claim' | 'contribution' | 'loyalty_transaction' | 'user' | 'content';
  entityId: string;
  reason?: string;
  before?: unknown;
  after?: unknown;
}

export class TransitionError extends Error {
  constructor(
    message: string,
    public readonly code: 'not_allowed' | 'forbidden' | 'reason_required',
  ) {
    super(message);
  }
}

export function allowedTransitions(r: Restaurant, actor: Actor): PublicationStatus[] {
  return TRANSITIONS[r.publication].filter((t) => can(actor, t.permission, { restaurantId: r.id })).map((t) => t.to);
}

export function transition(
  r: Restaurant,
  to: PublicationStatus,
  actor: Actor,
  at: ISODateTime,
  reason?: string,
): { restaurant: Restaurant; audit: AuditEntry } {
  const rule = TRANSITIONS[r.publication].find((t) => t.to === to);
  if (!rule) throw new TransitionError(`${PUBLICATION_LABELS[r.publication]} → ${PUBLICATION_LABELS[to]} : transition impossible`, 'not_allowed');
  if (!can(actor, rule.permission, { restaurantId: r.id })) throw new TransitionError('Droit insuffisant', 'forbidden');
  if (rule.reasonRequired && !reason?.trim()) throw new TransitionError('Motif obligatoire', 'reason_required');
  const restaurant: Restaurant = {
    ...r,
    publication: to,
    publishedAt: to === 'published' && !r.publishedAt ? at.slice(0, 10) : r.publishedAt,
    updatedAt: at.slice(0, 10),
    version: r.version + 1,
  };
  return {
    restaurant,
    audit: {
      id: `audit-${r.id}-${r.version + 1}`,
      at,
      actorId: actor.id,
      actorRole: actor.role,
      action: `publication.${to}`,
      entity: 'restaurant',
      entityId: r.id,
      reason,
      before: { publication: r.publication },
      after: { publication: to },
    },
  };
}

/**
 * Visible dans la découverte (carte, liste, recherche, collections) ?
 * Une fiche fermée définitivement, déménagée, archivée ou suspendue n'y figure
 * jamais : elle ne peut donc pas sortir comme « ouverte ».
 */
export function isDiscoverable(r: Pick<Restaurant, 'publication' | 'operating'>): boolean {
  return r.publication === 'published' && (r.operating === 'operating' || r.operating === 'temporarily_closed');
}
