// État du back-office et règles d'écriture.
//
// En production, chaque action ci-dessous est un appel à l'API admin, qui
// re-vérifie les droits, verrouille par version et journalise. Ici, le même
// socle métier (src/domain) tourne dans le navigateur sur une copie locale des
// données de démonstration, conservée dans localStorage ('yy:admin').
// Toute écriture passe par `commit()`, qui ajoute une entrée au journal
// d'audit : il n'existe aucun chemin d'écriture sans trace.

import { CERTIFIERS, COLLECTIONS, LOYALTY_PARTNERS, RESTAURANTS, daysFromToday, type EditorialCollection } from '../data/demo';
import { claimValidUntil, deriveHalalStatus, type TrustLevel } from '../domain/halal';
import { localClock } from '../domain/hours';
import { DEMO_PROGRAM, type LoyaltyProgram, type LoyaltyTx } from '../domain/loyalty';
import type { ChangeProposal, Contribution } from '../domain/moderation';
import type { AuditEntry } from '../domain/publication';
import type { Actor, Role } from '../domain/rbac';
import type { Certifier, ISODate, Restaurant } from '../domain/types';
import { createStore, storage } from '../app/store';

// ─── Types propres au back-office ───────────────────────────────────────────

/** Modifications acceptées, en attente de publication sur la fiche. */
export interface PendingChange {
  proposalId: string;
  contributionId: string;
  changes: Record<string, unknown>;
  requires: ChangeProposal['requires'];
  appliedAt: string;
  appliedBy: string;
}

export interface AdminRestaurant extends Restaurant {
  /** Brouillon de modifications issu des contributions : invisible du public. */
  pending?: PendingChange[];
  /** Référence de l'ancienne base, pour rejouer un import. */
  legacyRef?: string;
}

export interface EvidenceDoc {
  claimId: string;
  restaurantId: string;
  fileName: string;
  sha256: string;
  size: number;
  uploadedAt: string;
  uploadedBy: string;
}

export type TaskReason = 'certification_expired' | 'evidence_expired' | 'expiring_soon' | 'no_evidence' | 'report';

export interface ReviewTask {
  id: string;
  restaurantId: string;
  claimId?: string;
  reason: TaskReason;
  createdAt: string;
  status: 'open' | 'done';
}

export interface ProposalRecord extends ChangeProposal {
  createdAt: string;
}

/** Tentative de crédit refusée, vue par le serveur (sert aux alertes de fraude). */
export interface ScanAttempt {
  id: string;
  at: string;
  partnerId: string;
  cardId: string;
  outcome: 'credited' | 'duplicate' | 'cooldown' | 'expired_token' | 'invalid_token' | 'daily_cap';
}

export interface AdminCollection extends EditorialCollection {
  order: number;
  /** Date de mise en ligne ; absente = en ligne. */
  scheduledAt?: ISODate;
}

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  mfa: boolean;
  status: 'active' | 'invited' | 'revoked';
  restaurantIds?: string[];
  partnerIds?: string[];
}

export interface PrivacyRequest {
  id: string;
  kind: 'export' | 'deletion';
  email: string;
  createdAt: string;
  status: 'open' | 'done';
}

export interface Partner {
  id: string;
  restaurantId: string;
  name: string;
  active: boolean;
}

export interface AdminData {
  schema: 1;
  seededAt: string;
  restaurants: AdminRestaurant[];
  certifiers: Certifier[];
  contributions: Contribution[];
  proposals: ProposalRecord[];
  audit: AuditEntry[];
  tasks: ReviewTask[];
  evidence: EvidenceDoc[];
  ledger: LoyaltyTx[];
  attempts: ScanAttempt[];
  program: LoyaltyProgram;
  partners: Partner[];
  collections: AdminCollection[];
  users: AdminUser[];
  privacy: PrivacyRequest[];
  lastDailyCheck?: string;
}

export type Screen =
  | 'dashboard'
  | 'restaurants'
  | 'editor'
  | 'halal'
  | 'contributions'
  | 'import'
  | 'content'
  | 'loyalty'
  | 'audit'
  | 'access'
  | 'owner'
  | 'owner-stats';

/** Préréglage de liste, posé par un clic sur un chiffre du tableau de bord. */
export interface ListPreset {
  publication?: Restaurant['publication'];
  operating?: Restaurant['operating'];
  quality?: 'no_photo' | 'no_hours' | 'stale_hours' | 'no_price' | 'no_menu';
  halal?: 'expired' | 'expiring' | 'unconfirmed';
  duplicates?: boolean;
  city?: string;
  label?: string;
}

export interface UiState {
  role: Role;
  mfa: boolean;
  screen: Screen;
  editingId?: string;
  halalId?: string;
  contributionId?: string;
  preset?: ListPreset;
  menuOpen: boolean;
  toast?: { text: string; nonce: number; tone?: 'ok' | 'bad' };
}

// ─── Acteurs de démonstration ───────────────────────────────────────────────

export const ACTORS: Record<Role, Actor & { name: string }> = {
  super_admin: { id: 'u-amel', name: 'Amel · super admin', role: 'super_admin', mfa: true },
  editor: { id: 'u-karim', name: 'Karim · éditeur', role: 'editor', mfa: true },
  verifier: { id: 'u-sofia', name: 'Sofia · vérificatrice', role: 'verifier', mfa: true },
  support: { id: 'u-yanis', name: 'Yanis · support', role: 'support', mfa: true },
  restaurateur: {
    id: 'u-smash',
    name: 'Smash Club · restaurateur',
    role: 'restaurateur',
    mfa: false,
    restaurantIds: ['smash-republique', 'smash-saint-denis'],
    partnerIds: ['p-smash-republique', 'p-smash-saint-denis'],
  },
};

export function actorFor(ui: Pick<UiState, 'role' | 'mfa'>): Actor & { name: string } {
  const a = ACTORS[ui.role];
  return { ...a, mfa: ui.role === 'restaurateur' ? false : ui.mfa };
}

// ─── Temps ──────────────────────────────────────────────────────────────────

export const nowIso = () => new Date().toISOString();
export const todayIso = (): ISODate => localClock(new Date(), 'Europe/Paris').date;
const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

// ─── Données initiales ──────────────────────────────────────────────────────

function seedContributions(): Contribution[] {
  const c = (
    id: string,
    kind: Contribution['kind'],
    hours: number,
    rest: Partial<Contribution>,
  ): Contribution => ({
    id,
    kind,
    payload: {},
    status: 'received',
    createdAt: hoursAgo(hours),
    history: [{ at: hoursAgo(hours), status: 'received' }],
    ...rest,
  });
  return [
    c('k-demo-1', 'contact', 5, {
      restaurantId: 'nonna-ya',
      payload: { 'contact.phone': '01 99 00 77 12' },
      message: 'Le numéro affiché ne répond plus, celui-ci est sur la vitrine.',
    }),
    c('k-demo-2', 'closed_permanently', 20, {
      restaurantId: 'tacos-brothers',
      payload: { operating: 'permanently_closed' },
      message: 'Rideau baissé depuis trois semaines, panneau « à louer ».',
    }),
    c('k-demo-3', 'halal_info', 30, {
      restaurantId: 'wings-supreme',
      payload: { halal: 'Certificat de l’Organisme Alpha (fictif) affiché en vitrine, daté de cette année' },
      halalSource: 'Photo du certificat en vitrine',
      message: 'J’ai vu le certificat en passant, il a l’air à jour.',
    }),
    c('k-demo-4', 'new_restaurant', 48, {
      payload: { name: 'Le Comptoir de Fès', address: '12 rue de Belleville, 75020 Paris', cuisine: 'marocaine' },
      halalSource: 'Le gérant me l’a dit',
      message: 'Petit comptoir à tajines ouvert récemment.',
    }),
    c('k-demo-5', 'hours', 60, {
      restaurantId: 'couscous-dimanche',
      payload: { 'hours.text': 'Mar–dim 12:00–15:00 et 19:00–23:00' },
      message: 'Horaires affichés sur la porte.',
    }),
    c('k-demo-6', 'duplicate', 72, {
      restaurantId: 'smash-saint-denis',
      payload: { duplicateOf: 'smash-republique' },
      message: 'C’est le même que Smash Club République ?',
    }),
    c('k-demo-7', 'photos', 90, {
      restaurantId: 'sunny-side',
      payload: { photos: 3 },
      message: 'Trois photos de mon brunch, vous pouvez les utiliser.',
    }),
    c('k-demo-8', 'other', 100, {
      restaurantId: 'charolais-levallois',
      message: 'Gagnez 500 € par jour https://exemple.invalid/a https://exemple.invalid/b https://exemple.invalid/c',
    }),
  ];
}

function seedLedger(): { ledger: LoyaltyTx[]; attempts: ScanAttempt[] } {
  const ledger: LoyaltyTx[] = [];
  const attempts: ScanAttempt[] = [];
  const cards = ['card-a71k2q', 'card-b02m9z', 'card-c55t1r', 'card-d88p4w'];
  let n = 0;
  LOYALTY_PARTNERS.forEach((p, pi) => {
    for (let i = 0; i < 4; i++) {
      const at = hoursAgo(6 + pi * 9 + i * 31);
      const cardId = cards[(pi + i) % cards.length];
      const id = `tx-demo-${++n}`;
      ledger.push({ id, cardId, partnerId: p.id, kind: 'earn', points: 10, at, idempotencyKey: `earn:${p.id}:YY1.${cardId}.${n}.demo`, merchantUserId: `caisse-${pi + 1}` });
      attempts.push({ id: `sa-${n}`, at, partnerId: p.id, cardId, outcome: 'credited' });
    }
  });
  // Motif suspect : une carte présentée en rafale chez un même partenaire.
  const burstPartner = LOYALTY_PARTNERS[2]?.id ?? LOYALTY_PARTNERS[0].id;
  const outcomes: ScanAttempt['outcome'][] = ['credited', 'cooldown', 'duplicate', 'cooldown', 'expired_token', 'cooldown'];
  outcomes.forEach((outcome, i) => {
    const at = minutesAgo(95 - i * 3);
    attempts.push({ id: `sa-burst-${i}`, at, partnerId: burstPartner, cardId: 'card-x9f2kk', outcome });
    if (outcome === 'credited') {
      ledger.push({ id: 'tx-demo-burst', cardId: 'card-x9f2kk', partnerId: burstPartner, kind: 'earn', points: 10, at, idempotencyKey: `earn:${burstPartner}:YY1.card-x9f2kk.burst.demo`, merchantUserId: 'caisse-3' });
    }
  });
  // Jeton rejoué sur un autre partenaire quelques minutes plus tard.
  attempts.push({ id: 'sa-replay', at: minutesAgo(70), partnerId: LOYALTY_PARTNERS[3]?.id ?? burstPartner, cardId: 'card-x9f2kk', outcome: 'invalid_token' });
  return { ledger, attempts };
}

function seedRestaurants(): AdminRestaurant[] {
  const list: AdminRestaurant[] = RESTAURANTS.map((r) => structuredClone(r));
  // Brouillon importé de l'ancienne base, presque superposé à une fiche publiée : doublon probable.
  const braises = list.find((r) => r.id === 'braises-belleville');
  if (braises) {
    list.push({
      ...structuredClone(braises),
      id: 'import-braises-belleville',
      slug: 'les-braises-belleville',
      name: 'Les Braises Belleville',
      publication: 'draft',
      editorialPick: false,
      halalClaims: [
        {
          id: 'hc-import-1',
          kind: 'establishment_declaration',
          scope: 'whole_menu',
          method: 'legacy_import',
          evidenceDate: daysFromToday(-480),
          reviewStatus: 'pending',
        },
      ],
      location: { lat: braises.location.lat + 0.0001, lng: braises.location.lng + 0.00015 },
      legacyRef: 'YY-0412',
      publishedAt: undefined,
      loyaltyPartnerId: undefined,
      version: 1,
    });
  }
  return list;
}

export function seed(): AdminData {
  const { ledger, attempts } = seedLedger();
  return {
    schema: 1,
    seededAt: nowIso(),
    restaurants: seedRestaurants(),
    certifiers: structuredClone(CERTIFIERS),
    contributions: seedContributions(),
    proposals: [],
    audit: [
      {
        id: 'audit-seed',
        at: hoursAgo(120),
        actorId: 'systeme',
        actorRole: 'super_admin',
        action: 'import.legacy',
        entity: 'restaurant',
        entityId: 'catalogue',
        reason: 'Reprise initiale des données de démonstration',
      },
    ],
    tasks: [],
    evidence: [],
    ledger,
    attempts,
    program: structuredClone(DEMO_PROGRAM),
    partners: LOYALTY_PARTNERS.map((p) => ({ ...p })),
    collections: COLLECTIONS.map((c, i) => ({ ...structuredClone(c), order: i })),
    users: [
      { id: 'u-amel', name: 'Amel', email: 'amel@yallayum.example', role: 'super_admin', mfa: true, status: 'active' },
      { id: 'u-karim', name: 'Karim', email: 'karim@yallayum.example', role: 'editor', mfa: true, status: 'active' },
      { id: 'u-sofia', name: 'Sofia', email: 'sofia@yallayum.example', role: 'verifier', mfa: true, status: 'active' },
      { id: 'u-yanis', name: 'Yanis', email: 'yanis@yallayum.example', role: 'support', mfa: false, status: 'active' },
      {
        id: 'u-smash',
        name: 'Gérant Smash Club',
        email: 'gerant@smashclub.example',
        role: 'restaurateur',
        mfa: false,
        status: 'active',
        restaurantIds: ['smash-republique', 'smash-saint-denis'],
        partnerIds: ['p-smash-republique', 'p-smash-saint-denis'],
      },
    ],
    privacy: [
      { id: 'pr-1', kind: 'export', email: 'lina@exemple.invalid', createdAt: hoursAgo(26), status: 'open' },
      { id: 'pr-2', kind: 'deletion', email: 'mehdi@exemple.invalid', createdAt: hoursAgo(50), status: 'open' },
    ],
  };
}

// ─── Fusion avec ce que l'application a envoyé (même navigateur) ────────────

function mergeFromApp(data: AdminData): AdminData {
  const fromApp = storage.read<Contribution[]>('contributions', []);
  const known = new Set(data.contributions.map((c) => c.id));
  const contributions = [...data.contributions, ...fromApp.filter((c) => !known.has(c.id))];
  const loyalty = storage.read<{ ledger?: LoyaltyTx[] }>('loyalty', {});
  const knownTx = new Set(data.ledger.map((t) => t.id + t.cardId));
  const ledger = [...data.ledger, ...(loyalty.ledger ?? []).filter((t) => !knownTx.has(t.id + t.cardId))];
  return { ...data, contributions, ledger };
}

function load(): AdminData {
  const saved = storage.read<AdminData | null>('admin', null);
  const base = saved && saved.schema === 1 ? saved : seed();
  return mergeFromApp(base);
}

export const data = createStore<AdminData>(load());
export const ui = createStore<UiState>({
  role: storage.read<Role>('admin-role', 'super_admin'),
  mfa: true,
  screen: 'dashboard',
  menuOpen: false,
});

let saveTimer = 0;
data.subscribe(() => {
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => storage.write('admin', data.get()), 250);
});

export function resetDemo() {
  try {
    localStorage.removeItem('yy:admin');
  } catch {
    // Stockage refusé : on repart de zéro en mémoire.
  }
  data.set(mergeFromApp(seed()));
  toast('Données de démonstration réinitialisées.');
}

export function refreshFromApp() {
  data.set(mergeFromApp(data.get()));
}

// ─── Écriture tracée ────────────────────────────────────────────────────────

let auditSeq = 0;

export function auditEntry(
  actor: Actor,
  action: string,
  entity: AuditEntry['entity'],
  entityId: string,
  extra: { reason?: string; before?: unknown; after?: unknown } = {},
): AuditEntry {
  return { id: `audit-${Date.now().toString(36)}-${++auditSeq}`, at: nowIso(), actorId: actor.id, actorRole: actor.role, action, entity, entityId, ...extra };
}

/**
 * Applique une modification et l'inscrit au journal. Le journal est en ajout
 * seul : aucune fonction ne le modifie ni ne le vide (hors réinitialisation de démo).
 */
export function commit(patch: Partial<AdminData>, entries: AuditEntry | AuditEntry[]) {
  const list = Array.isArray(entries) ? entries : [entries];
  data.set((d) => ({ ...patch, audit: [...[...list].reverse(), ...d.audit] }));
}

export function updateRestaurant(next: AdminRestaurant, entries: AuditEntry | AuditEntry[]) {
  commit({ restaurants: data.get().restaurants.map((r) => (r.id === next.id ? next : r)) }, entries);
}

export function toast(text: string, tone?: 'ok' | 'bad') {
  ui.set({ toast: { text, nonce: Date.now(), tone } });
}

export function go(screen: Screen, extra: Partial<UiState> = {}) {
  ui.set({ screen, menuOpen: false, ...extra });
  window.scrollTo?.(0, 0);
}

// ─── Lectures utiles ────────────────────────────────────────────────────────

export function restaurant(id: string | undefined): AdminRestaurant | undefined {
  return id ? data.get().restaurants.find((r) => r.id === id) : undefined;
}

export function halalOf(r: Restaurant, today = todayIso()) {
  return deriveHalalStatus(r.halalClaims, today, data.get().certifiers);
}

export function halalLevel(r: Restaurant, today = todayIso()): TrustLevel {
  return halalOf(r, today).level;
}

/** Fin de validité du niveau affiché aujourd'hui (pour les échéances). */
export function displayedValidUntil(r: Restaurant, today = todayIso()): ISODate | undefined {
  const s = halalOf(r, today);
  return s.claim ? claimValidUntil(s.claim) : undefined;
}

export function partnerName(id: string): string {
  return data.get().partners.find((p) => p.id === id)?.name ?? id;
}

/** Lecture / écriture d'un chemin pointé (« contact.phone ») sur une copie. */
export function getPath(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), obj);
}

export function setPath<T extends object>(obj: T, path: string, value: unknown): T {
  const copy = structuredClone(obj) as Record<string, unknown>;
  const keys = path.split('.');
  let cur = copy;
  for (const k of keys.slice(0, -1)) {
    if (!cur[k] || typeof cur[k] !== 'object') cur[k] = {};
    cur = cur[k] as Record<string, unknown>;
  }
  cur[keys[keys.length - 1]] = value;
  return copy as T;
}
