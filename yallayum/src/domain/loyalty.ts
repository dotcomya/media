// Carte de fidélité transversale — module à auditer avant mise en service.
//
// Flux principal retenu (docs/04-regles-metier.md, § Fidélité) : le
// commerçant scanne le QR de la carte du client. Ce QR change toutes les
// 30 secondes (jeton signé : carte + pas de temps + signature), ce qui rend
// inutile la capture d'écran partagée. Chaque crédit porte une clé
// d'idempotence : scanner deux fois le même jeton renvoie la transaction
// d'origine, jamais un second crédit.
//
// Aucune règle économique n'est supposée : taux, seuils, financement et
// expiration sont des paramètres du programme, à fixer avec le fondateur et
// les partenaires. Les valeurs de démonstration sont marquées `provisional`.

import type { ISODateTime } from './types';

export type ProgramStatus = 'disabled' | 'pilot' | 'live';

export type EarnRule =
  | { mode: 'per_visit'; points: number }
  | { mode: 'per_amount'; pointsPerEuro: number; minAmountCents: number };

export interface Reward {
  id: string;
  threshold: number;
  label: string;
  /** Qui paie la récompense : à contractualiser, jamais implicite. */
  fundedBy: 'partner' | 'yallayum' | 'shared';
  /** Validité du bon une fois débloqué. */
  validityDays: number;
}

export interface LoyaltyProgram {
  status: ProgramStatus;
  /** Paramètres non validés : l'interface l'affiche. */
  provisional: boolean;
  earn: EarnRule;
  /** Délai minimal entre deux crédits d'une même carte chez un même partenaire. */
  cooldownMinutes: number;
  /** Nombre maximal de crédits par carte, par partenaire et par jour. */
  dailyCapPerPartner: number;
  qrStepSeconds: number;
  /** Pas de temps tolérés en retard (réseau lent à la caisse). */
  qrSkewSteps: number;
  rewards: Reward[];
}

export const DEMO_PROGRAM: LoyaltyProgram = {
  status: 'pilot',
  provisional: true,
  earn: { mode: 'per_visit', points: 10 },
  cooldownMinutes: 120,
  dailyCapPerPartner: 1,
  qrStepSeconds: 30,
  qrSkewSteps: 1,
  rewards: [
    { id: 'boisson', threshold: 50, label: 'Une boisson offerte', fundedBy: 'partner', validityDays: 30 },
    { id: 'dessert', threshold: 100, label: 'Un dessert offert', fundedBy: 'partner', validityDays: 30 },
  ],
};

/** Signature des jetons. En production : HMAC-SHA256 côté serveur, secret par carte. */
export interface Signer {
  sign(payload: string): string;
}

/**
 * Signataire de démonstration (FNV-1a), NON cryptographique : il permet au
 * prototype de fonctionner hors ligne, rien de plus.
 */
export function demoSigner(secret: string): Signer {
  return {
    sign(payload) {
      let h = 0x811c9dc5;
      for (const ch of `${secret}|${payload}`) {
        h ^= ch.charCodeAt(0);
        h = Math.imul(h, 0x01000193) >>> 0;
      }
      return h.toString(36).padStart(7, '0');
    },
  };
}

export function timeStep(at: Date, program: LoyaltyProgram): number {
  return Math.floor(at.getTime() / 1000 / program.qrStepSeconds);
}

/** Secondes avant le prochain jeton (anneau de décompte autour du QR). */
export function secondsLeft(at: Date, program: LoyaltyProgram): number {
  const s = at.getTime() / 1000;
  return program.qrStepSeconds - (s % program.qrStepSeconds);
}

export function cardToken(cardId: string, at: Date, program: LoyaltyProgram, signer: Signer): string {
  const step = timeStep(at, program);
  return `YY1.${cardId}.${step}.${signer.sign(`${cardId}.${step}`)}`;
}

export type TokenCheck =
  | { ok: true; cardId: string; step: number }
  | { ok: false; reason: 'malformed' | 'bad_signature' | 'expired' | 'future' };

export function verifyCardToken(token: string, at: Date, program: LoyaltyProgram, signer: Signer): TokenCheck {
  const parts = token.split('.');
  if (parts.length !== 4 || parts[0] !== 'YY1') return { ok: false, reason: 'malformed' };
  const [, cardId, stepText, sig] = parts;
  const step = Number(stepText);
  if (!cardId || !Number.isInteger(step)) return { ok: false, reason: 'malformed' };
  if (signer.sign(`${cardId}.${step}`) !== sig) return { ok: false, reason: 'bad_signature' };
  const now = timeStep(at, program);
  if (step > now + 1) return { ok: false, reason: 'future' };
  if (step < now - program.qrSkewSteps) return { ok: false, reason: 'expired' };
  return { ok: true, cardId, step };
}

export type TxKind = 'earn' | 'redeem' | 'reversal' | 'adjustment';

export interface LoyaltyTx {
  id: string;
  cardId: string;
  partnerId: string;
  kind: TxKind;
  /** Positif au crédit, négatif au débit. */
  points: number;
  amountCents?: number;
  at: ISODateTime;
  idempotencyKey: string;
  merchantUserId?: string;
  /** Transaction annulée par celle-ci. */
  reversesId?: string;
  reason?: string;
}

export type RejectReason =
  | 'program_disabled'
  | 'partner_inactive'
  | 'invalid_token'
  | 'expired_token'
  | 'cooldown'
  | 'daily_cap'
  | 'amount_required'
  | 'amount_too_low';

export type EarnOutcome =
  | { status: 'credited'; tx: LoyaltyTx }
  | { status: 'duplicate'; tx: LoyaltyTx }
  | { status: 'rejected'; reason: RejectReason; cardId?: string };

export const REJECT_MESSAGES: Record<RejectReason, string> = {
  program_disabled: "Le programme de fidélité n'est pas encore actif.",
  partner_inactive: "Ce restaurant n'est pas (ou plus) partenaire.",
  invalid_token: 'QR non reconnu. Demande au client de rafraîchir sa carte.',
  expired_token: 'QR expiré. Le client doit afficher le nouveau code.',
  cooldown: 'Passage déjà enregistré récemment pour cette carte.',
  daily_cap: 'Plafond de passages atteint pour aujourd’hui.',
  amount_required: 'Montant de l’addition requis.',
  amount_too_low: 'Montant inférieur au minimum du programme.',
};

export interface EarnRequest {
  token: string;
  partnerId: string;
  partnerActive: boolean;
  merchantUserId: string;
  amountCents?: number;
  at: Date;
}

function pointsFor(rule: EarnRule, amountCents?: number): number | RejectReason {
  if (rule.mode === 'per_visit') return rule.points;
  if (amountCents === undefined) return 'amount_required';
  if (amountCents < rule.minAmountCents) return 'amount_too_low';
  return Math.floor((amountCents / 100) * rule.pointsPerEuro);
}

/** Crédite un passage. Fonction pure : renvoie le nouveau grand livre. */
export function earn(
  ledger: LoyaltyTx[],
  req: EarnRequest,
  program: LoyaltyProgram,
  signer: Signer,
): { outcome: EarnOutcome; ledger: LoyaltyTx[] } {
  const key = `earn:${req.partnerId}:${req.token}`;
  const existing = ledger.find((t) => t.idempotencyKey === key);
  if (existing) return { outcome: { status: 'duplicate', tx: existing }, ledger };

  const reject = (reason: RejectReason, cardId?: string) => ({ outcome: { status: 'rejected' as const, reason, cardId }, ledger });
  if (program.status === 'disabled') return reject('program_disabled');
  if (!req.partnerActive) return reject('partner_inactive');

  const check = verifyCardToken(req.token, req.at, program, signer);
  if (!check.ok) return reject(check.reason === 'expired' ? 'expired_token' : 'invalid_token');

  const earned = ledger.filter((t) => t.cardId === check.cardId && t.partnerId === req.partnerId && t.kind === 'earn' && !isReversed(ledger, t.id));
  const last = earned.map((t) => Date.parse(t.at)).sort((a, b) => b - a)[0];
  if (last !== undefined && req.at.getTime() - last < program.cooldownMinutes * 60_000) return reject('cooldown', check.cardId);
  const day = req.at.toISOString().slice(0, 10);
  if (earned.filter((t) => t.at.slice(0, 10) === day).length >= program.dailyCapPerPartner) return reject('daily_cap', check.cardId);

  const points = pointsFor(program.earn, req.amountCents);
  if (typeof points === 'string') return reject(points, check.cardId);

  const tx: LoyaltyTx = {
    id: `tx-${ledger.length + 1}-${check.step}`,
    cardId: check.cardId,
    partnerId: req.partnerId,
    kind: 'earn',
    points,
    amountCents: req.amountCents,
    at: req.at.toISOString(),
    idempotencyKey: key,
    merchantUserId: req.merchantUserId,
  };
  return { outcome: { status: 'credited', tx }, ledger: [...ledger, tx] };
}

export function isReversed(ledger: LoyaltyTx[], txId: string): boolean {
  return ledger.some((t) => t.kind === 'reversal' && t.reversesId === txId);
}

/** Annule une transaction (litige, erreur de caisse). Idempotent : une seule annulation par transaction. */
export function reverse(ledger: LoyaltyTx[], txId: string, reason: string, at: Date): LoyaltyTx[] {
  const original = ledger.find((t) => t.id === txId);
  if (!original || original.kind === 'reversal' || isReversed(ledger, txId)) return ledger;
  return [
    ...ledger,
    {
      id: `rev-${txId}`,
      cardId: original.cardId,
      partnerId: original.partnerId,
      kind: 'reversal',
      points: -original.points,
      at: at.toISOString(),
      idempotencyKey: `reversal:${txId}`,
      reversesId: txId,
      reason,
    },
  ];
}

export function balance(ledger: LoyaltyTx[], cardId: string): number {
  return ledger.filter((t) => t.cardId === cardId).reduce((s, t) => s + t.points, 0);
}

export interface Voucher {
  id: string;
  rewardId: string;
  cardId: string;
  issuedAt: ISODateTime;
  expiresAt: ISODateTime;
  usedAt?: ISODateTime;
}

export type VoucherState = 'available' | 'used' | 'expired';

export function voucherState(v: Voucher, at: Date): VoucherState {
  if (v.usedAt) return 'used';
  return Date.parse(v.expiresAt) < at.getTime() ? 'expired' : 'available';
}

/** Échange des points contre un bon, si le solde le permet. */
export function redeem(
  ledger: LoyaltyTx[],
  cardId: string,
  reward: Reward,
  at: Date,
): { ok: true; ledger: LoyaltyTx[]; voucher: Voucher } | { ok: false; missing: number } {
  const current = balance(ledger, cardId);
  if (current < reward.threshold) return { ok: false, missing: reward.threshold - current };
  const id = `v-${cardId}-${ledger.length + 1}`;
  const tx: LoyaltyTx = {
    id: `tx-${id}`,
    cardId,
    partnerId: 'yallayum',
    kind: 'redeem',
    points: -reward.threshold,
    at: at.toISOString(),
    idempotencyKey: `redeem:${id}`,
  };
  const voucher: Voucher = {
    id,
    rewardId: reward.id,
    cardId,
    issuedAt: at.toISOString(),
    expiresAt: new Date(at.getTime() + reward.validityDays * 86_400_000).toISOString(),
  };
  return { ok: true, ledger: [...ledger, tx], voucher };
}

/** Prochaine récompense atteignable et progression (0–1). */
export function nextReward(program: LoyaltyProgram, points: number): { reward?: Reward; progress: number } {
  const reward = [...program.rewards].sort((a, b) => a.threshold - b.threshold).find((r) => r.threshold > points);
  if (!reward) return { reward: undefined, progress: 1 };
  return { reward, progress: Math.max(0, Math.min(1, points / reward.threshold)) };
}
