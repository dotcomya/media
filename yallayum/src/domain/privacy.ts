// Suppression de compte et portabilité.
//
// Supprimer un compte efface ce qui n'a plus de raison d'être conservé et
// anonymise ce que la loi ou un litige en cours oblige à garder. Les
// transactions de fidélité ne disparaissent pas : elles sont rattachées à un
// identifiant aléatoire, sans lien possible avec la personne.

export interface AccountData {
  userId: string;
  hasFavorites: boolean;
  hasCollections: boolean;
  searchHistory: number;
  contributions: number;
  loyaltyCardId?: string;
  loyaltyTransactions: number;
  /** Litige ouvert sur une transaction : conservation jusqu'à sa clôture. */
  openDisputes: number;
  devices: number;
}

export interface DeletionStep {
  what: string;
  action: 'delete' | 'anonymize' | 'retain';
  why: string;
  /** Durée de conservation après la demande, en jours, pour « retain ». */
  retainDays?: number;
}

/** Durées proposées, à valider par le DPO : elles dépendent du contrat fidélité final. */
export const RETENTION = {
  loyaltyLedgerDays: 365 * 10, // pièces comptables si la récompense a une valeur financière (Code de commerce, L123-22)
  disputeDays: 365 * 5, // prescription de droit commun
  securityLogsDays: 365,
} as const;

export function planAccountDeletion(d: AccountData): DeletionStep[] {
  const steps: DeletionStep[] = [
    { what: 'Profil, e-mail, identifiants de connexion', action: 'delete', why: 'Plus aucune finalité après la suppression.' },
    { what: 'Préférences et consentements', action: 'delete', why: 'Liés au compte uniquement.' },
  ];
  if (d.hasFavorites || d.hasCollections) steps.push({ what: 'Favoris et collections personnelles', action: 'delete', why: 'Données de confort, sans obligation de conservation.' });
  if (d.searchHistory) steps.push({ what: `Historique de recherche (${d.searchHistory})`, action: 'delete', why: 'Historique stocké pour la personne seulement.' });
  if (d.devices) steps.push({ what: 'Jetons de notification des appareils', action: 'delete', why: 'Plus aucun envoi possible.' });
  if (d.contributions) {
    steps.push({ what: `Contributions envoyées (${d.contributions})`, action: 'anonymize', why: 'Les corrections publiées restent utiles ; le lien avec la personne est rompu.' });
  }
  if (d.loyaltyCardId) {
    steps.push({ what: 'Carte de fidélité', action: 'delete', why: 'Désactivée immédiatement : son QR ne sera plus accepté.' });
    if (d.loyaltyTransactions) {
      steps.push({
        what: `Transactions de fidélité (${d.loyaltyTransactions})`,
        action: 'retain',
        why: 'Rapprochement avec les partenaires et obligations comptables ; rattachées à un identifiant aléatoire.',
        retainDays: RETENTION.loyaltyLedgerDays,
      });
    }
  }
  if (d.openDisputes) {
    steps.push({ what: `Litiges en cours (${d.openDisputes})`, action: 'retain', why: 'Nécessaires à la défense des droits jusqu’à clôture.', retainDays: RETENTION.disputeDays });
  }
  steps.push({ what: 'Journaux de sécurité', action: 'retain', why: 'Détection des fraudes et des accès illégitimes, sans contenu personnel.', retainDays: RETENTION.securityLogsDays });
  return steps;
}
