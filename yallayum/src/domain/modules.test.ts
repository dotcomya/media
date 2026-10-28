import { describe, expect, it } from 'vitest';
import { buildEvent, distanceBucket, scrubQuery } from './analytics';
import { allowedTransitions, transition, TransitionError } from './publication';
import { reverse, balance, redeem, DEMO_PROGRAM, type LoyaltyTx, nextReward } from './loyalty';
import { validateSubmission } from './moderation';
import { formatDistance } from './geo';
import { restaurant } from './testing';
import type { Actor } from './rbac';

const editor: Actor = { id: 'ed', role: 'editor', mfa: true };

describe('Publication', () => {
  it('Un éditeur sans MFA ne peut pas publier', () => {
    const r = restaurant({ publication: 'in_review' });
    expect(allowedTransitions(r, { ...editor, mfa: false })).not.toContain('published');
    expect(allowedTransitions(r, editor)).toContain('published');
  });

  it('Suspendre exige un motif et laisse une trace', () => {
    const r = restaurant();
    expect(() => transition(r, 'suspended', editor, '2026-10-27T10:00:00Z')).toThrow(TransitionError);
    const { restaurant: next, audit } = transition(r, 'suspended', editor, '2026-10-27T10:00:00Z', 'Doute sérieux sur le statut halal');
    expect(next.publication).toBe('suspended');
    expect(next.version).toBe(r.version + 1);
    expect(audit).toMatchObject({ action: 'publication.suspended', reason: 'Doute sérieux sur le statut halal' });
  });

  it('Un archivage se récupère (retour en brouillon)', () => {
    const r = restaurant({ publication: 'archived' });
    expect(allowedTransitions(r, editor)).toEqual(['draft']);
  });
});

describe('Fidélité', () => {
  const tx: LoyaltyTx = { id: 't1', cardId: 'c', partnerId: 'p', kind: 'earn', points: 10, at: '2026-10-27T19:00:00Z', idempotencyKey: 'k' };

  it('Une annulation est unique et ramène le solde', () => {
    const once = reverse([tx], 't1', 'erreur de caisse', new Date('2026-10-28T10:00:00Z'));
    const twice = reverse(once, 't1', 'erreur de caisse', new Date('2026-10-28T10:01:00Z'));
    expect(twice).toHaveLength(2);
    expect(balance(twice, 'c')).toBe(0);
  });

  it('Échanger exige le solde ; le bon a une date de fin', () => {
    expect(redeem([tx], 'c', DEMO_PROGRAM.rewards[0], new Date())).toMatchObject({ ok: false, missing: 40 });
    const rich = Array.from({ length: 5 }, (_, i) => ({ ...tx, id: `t${i}`, idempotencyKey: `k${i}` }));
    const res = redeem(rich, 'c', DEMO_PROGRAM.rewards[0], new Date('2026-10-27T19:00:00Z'));
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(balance(res.ledger, 'c')).toBe(0);
      expect(res.voucher.expiresAt.slice(0, 10)).toBe('2026-11-26');
    }
  });

  it('Progression vers la prochaine récompense', () => {
    expect(nextReward(DEMO_PROGRAM, 30)).toMatchObject({ progress: 0.6 });
  });
});

describe('Contributions', () => {
  it('Une proposition sans nom ni adresse est refusée avec des messages clairs', () => {
    expect(validateSubmission({ kind: 'new_restaurant', payload: {} })).toEqual(['Le nom est obligatoire.', "L'adresse est obligatoire."]);
    expect(validateSubmission({ kind: 'hours', payload: {} })).toEqual(['Le signalement doit viser une fiche.']);
  });
});

describe('Mesure d’audience', () => {
  it('Sans consentement, les événements « analytics » ne partent pas', () => {
    const at = new Date('2026-10-27T19:00:42Z');
    expect(buildEvent('restaurant_impression', { restaurant_id: 'r1', position: 1, sponsored: false, source: 'list' }, { analytics: false }, at)).toBeNull();
    const e = buildEvent('route_clicked', { restaurant_id: 'r1', app: 'google', distance: distanceBucket(820) }, { analytics: false }, at);
    expect(e).toMatchObject({ name: 'route_clicked', props: { distance: '500m-1km' }, at: '2026-10-27T19:00:00.000Z' });
  });

  it('Une propriété imprévue (coordonnées) est retirée ; une valeur invalide annule l’événement', () => {
    const at = new Date();
    const e = buildEvent('restaurant_opened', { restaurant_id: 'r1', source: 'map', lat: 48.86, lng: 2.36 }, { analytics: true }, at);
    expect(e?.props).toEqual({ restaurant_id: 'r1', source: 'map' });
    expect(buildEvent('restaurant_opened', { restaurant_id: 'r1', source: 'telepathie' }, { analytics: true }, at)).toBeNull();
  });

  it('Les requêtes sont nettoyées des e-mails et numéros', () => {
    expect(scrubQuery('burger 06 12 34 56 78 moi@exemple.fr')).toBe('burger [numéro] [email]');
  });
});

describe('Distances', () => {
  it('Arrondies et en français', () => {
    expect(formatDistance(320)).toBe('300 m');
    expect(formatDistance(1240)).toBe('1,2 km');
    expect(formatDistance(23_400)).toBe('23 km');
  });
});
