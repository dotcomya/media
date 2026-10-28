// Rôles et droits du back-office, vérifiés côté serveur (ici : même logique,
// partagée, pour que l'interface n'affiche que ce qui sera accepté).
//
// Un restaurateur ne voit et ne propose de changements que pour ses propres
// établissements ; il ne publie rien qui touche à la confiance halal.

export type Role = 'super_admin' | 'editor' | 'verifier' | 'support' | 'restaurateur';

export type Permission =
  | 'restaurant.read'
  | 'restaurant.edit'
  | 'restaurant.publish'
  | 'restaurant.propose_change'
  | 'halal.review'
  | 'halal.evidence.read'
  | 'contribution.moderate'
  | 'content.edit'
  | 'content.publish'
  | 'import.run'
  | 'loyalty.read'
  | 'loyalty.adjust'
  | 'stats.read'
  | 'user.manage'
  | 'audit.read'
  | 'privacy.requests';

export const ROLE_LABELS: Record<Role, string> = {
  super_admin: 'Super admin',
  editor: 'Éditeur',
  verifier: 'Vérificateur',
  support: 'Support',
  restaurateur: 'Restaurateur',
};

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  super_admin: [
    'restaurant.read', 'restaurant.edit', 'restaurant.publish', 'halal.review', 'halal.evidence.read',
    'contribution.moderate', 'content.edit', 'content.publish', 'import.run', 'loyalty.read', 'loyalty.adjust',
    'stats.read', 'user.manage', 'audit.read', 'privacy.requests',
  ],
  editor: ['restaurant.read', 'restaurant.edit', 'restaurant.publish', 'contribution.moderate', 'content.edit', 'content.publish', 'import.run', 'stats.read'],
  verifier: ['restaurant.read', 'halal.review', 'halal.evidence.read', 'contribution.moderate', 'stats.read', 'audit.read'],
  support: ['restaurant.read', 'contribution.moderate', 'loyalty.read', 'privacy.requests'],
  restaurateur: ['restaurant.read', 'restaurant.propose_change', 'stats.read', 'loyalty.read'],
};

/** Droits qui exigent une session MFA pour les rôles internes. */
const SENSITIVE: Permission[] = [
  'restaurant.publish', 'halal.review', 'halal.evidence.read', 'loyalty.adjust', 'user.manage', 'import.run', 'privacy.requests',
];

export interface Actor {
  id: string;
  role: Role;
  /** Établissements rattachés (restaurateur uniquement), après preuve de représentation. */
  restaurantIds?: string[];
  /** Partenaires fidélité rattachés (restaurateur uniquement). */
  partnerIds?: string[];
  mfa: boolean;
}

export interface Scope {
  restaurantId?: string;
  partnerId?: string;
}

export function can(actor: Actor, permission: Permission, scope: Scope = {}): boolean {
  if (!ROLE_PERMISSIONS[actor.role].includes(permission)) return false;
  if (actor.role === 'restaurateur') {
    // Lecture globale du catalogue public : oui. Tout le reste : seulement le sien.
    if (permission === 'restaurant.read' && !scope.restaurantId && !scope.partnerId) return true;
    if (scope.restaurantId && !actor.restaurantIds?.includes(scope.restaurantId)) return false;
    if (scope.partnerId && !actor.partnerIds?.includes(scope.partnerId)) return false;
    if (!scope.restaurantId && !scope.partnerId && permission !== 'restaurant.read') return false;
    return true;
  }
  if (SENSITIVE.includes(permission) && !actor.mfa) return false;
  return true;
}

/** Filtre une liste aux éléments que l'acteur peut lire (ex. transactions de fidélité). */
export function visibleTo<T extends { partnerId?: string; restaurantId?: string }>(actor: Actor, items: T[], permission: Permission): T[] {
  return items.filter((x) => can(actor, permission, { partnerId: x.partnerId, restaurantId: x.restaurantId }));
}
