// Recette métier : les cas limites obligatoires du cahier des charges (§ 13),
// écrits « Étant donné / Quand / Alors ». Les cas d'interface (1, 8, 9, 10,
// 16, 17) ont en plus leur version de bout en bout dans e2e/.

import { describe, expect, it } from 'vitest';
import { saveVersioned, VersionConflictError } from './concurrency';
import { resolveRestaurantLink } from './deeplink';
import { EMPTY_FILTERS } from './filters';
import { deriveHalalStatus } from './halal';
import { openStatus } from './hours';
import { cardToken, demoSigner, earn, balance, DEMO_PROGRAM, type LoyaltyTx } from './loyalty';
import { acceptContribution, type Contribution } from './moderation';
import { placeBBox, PLACES } from './places';
import { planAccountDeletion } from './privacy';
import { isDiscoverable } from './publication';
import { can, visibleTo, type Actor } from './rbac';
import { search, type SearchRequest } from './search';
import { claim, everyDay, hours, parisTime, restaurant } from './testing';
import type { Certifier } from './types';

const CERTIFIERS: Certifier[] = [{ id: 'alpha', name: 'Organisme Alpha', shortName: 'Alpha' }];
const PARIS = PLACES.find((p) => p.id === 'paris')!;
const REPUBLIQUE = PLACES.find((p) => p.id === 'republique')!;

function req(overrides: Partial<SearchRequest> = {}): SearchRequest {
  return {
    area: placeBBox(PARIS),
    origin: PARIS.center,
    originIsUser: false,
    text: '',
    dishTerms: [],
    filters: EMPTY_FILTERS,
    sort: 'relevance',
    now: parisTime('2026-10-27', '20:00'),
    ...overrides,
  };
}

describe('1. GPS refusé', () => {
  it("Étant donné une personne qui refuse la position, quand elle choisit « Paris », alors elle voit des résultats sans compte", () => {
    const catalog = [restaurant({ id: 'a' }), restaurant({ id: 'b', location: { lat: 48.88, lng: 2.35 } })];
    // Aucune origine utilisateur : la zone vient du lieu choisi.
    const res = search(catalog, req({ origin: PARIS.center, originIsUser: false }), CERTIFIERS);
    expect(res.results.map((r) => r.restaurant.id).sort()).toEqual(['a', 'b']);
  });
});

describe('2. Zéro résultat dans la zone', () => {
  it("Étant donné une zone sans adresse correspondante, quand on cherche, alors aucun résultat inventé et des corrections chiffrées", () => {
    const catalog = [
      restaurant({ id: 'burger-loin', cuisines: ['burger'], location: { lat: 48.8975, lng: 2.3445 } }),
      restaurant({ id: 'libanais-proche', cuisines: ['libanaise'], location: REPUBLIQUE.center }),
    ];
    const res = search(catalog, req({ area: placeBBox(REPUBLIQUE), origin: REPUBLIQUE.center, filters: { ...EMPTY_FILTERS, cuisines: ['burger'] } }), CERTIFIERS);
    expect(res.results).toHaveLength(0);
    expect(res.areaEmpty).toBe(false);
    const fixes = res.diagnosis!.fixes;
    expect(fixes.find((f) => f.kind === 'remove' && f.key === 'cuisines')?.count).toBe(1);
    // Chaque correction proposée ramène réellement au moins un résultat.
    expect(fixes.every((f) => f.count > 0)).toBe(true);
  });

  it("Étant donné une zone vide de toute adresse, alors la réponse le dit (areaEmpty)", () => {
    const res = search([restaurant({ location: { lat: 45.76, lng: 4.83 } })], req(), CERTIFIERS);
    expect(res.areaEmpty).toBe(true);
    expect(res.results).toHaveLength(0);
  });
});

describe('3. Établissement fermé définitivement', () => {
  const closed = restaurant({ id: 'ferme', slug: 'le-ferme', operating: 'permanently_closed', cuisines: ['turque'] });
  const sibling = restaurant({ id: 'voisin', slug: 'le-voisin', cuisines: ['turque'], location: { lat: 48.868, lng: 2.364 } });

  it('Quand on cherche, alors il ne sort pas de la découverte', () => {
    const res = search([closed, sibling], req(), CERTIFIERS);
    expect(res.results.map((r) => r.restaurant.id)).toEqual(['voisin']);
    expect(isDiscoverable(closed)).toBe(false);
  });

  it("Quand on calcule son ouverture à une heure d'ouverture, alors il n'est jamais « ouvert »", () => {
    expect(openStatus(closed, parisTime('2026-10-27', '20:00')).state).toBe('closed');
  });

  it("Quand on ouvre son lien profond, alors la fermeture est expliquée avec des adresses proches", () => {
    const link = resolveRestaurantLink('le-ferme', [closed, sibling]);
    expect(link.kind).toBe('permanently_closed');
    if (link.kind === 'permanently_closed') expect(link.alternatives.map((a) => a.id)).toEqual(['voisin']);
  });

  it("Étant donné une fiche supprimée logiquement (archivée), alors elle n'est ni visible ni ouverte", () => {
    const archived = restaurant({ publication: 'archived' });
    expect(isDiscoverable(archived)).toBe(false);
    expect(openStatus(archived, parisTime('2026-10-27', '20:00')).state).toBe('closed');
    expect(resolveRestaurantLink(archived.slug, [archived]).kind).toBe('unavailable');
  });
});

describe("4. Deux adresses d'une même chaîne", () => {
  it('Alors deux fiches physiques distinctes, avec coordonnées et horaires propres', () => {
    const a = restaurant({ id: 'smash-rep', brandId: 'smash', location: REPUBLIQUE.center, hours: hours(everyDay('11:30', '23:00')) });
    const b = restaurant({ id: 'smash-sd', brandId: 'smash', location: { lat: 48.9362, lng: 2.3574 }, hours: hours(everyDay('11:30', '02:00')) });
    const at = parisTime('2026-10-27', '23:30');
    expect(openStatus(a, at).state).toBe('closed');
    expect(openStatus(b, at).state).toBe('open');
    const area = req({ area: [2.3, 48.84, 2.4, 48.95], now: at });
    expect(search([a, b], area, CERTIFIERS).results.map((r) => r.restaurant.id).sort()).toEqual(['smash-rep', 'smash-sd']);
  });
});

describe('5. Statut halal non documenté', () => {
  it("Étant donné aucune déclaration validée, alors aucun badge « certifié » et le niveau reste explicite", () => {
    const status = deriveHalalStatus([], '2026-10-27', CERTIFIERS);
    expect(status.level).toBe('unconfirmed');
  });

  it("Étant donné une simple déclaration du restaurant, alors le niveau est « déclaré », jamais « certifié »", () => {
    const status = deriveHalalStatus([claim({ kind: 'establishment_declaration', evidenceDate: '2026-06-29' })], '2026-10-27', CERTIFIERS);
    expect(status.level).toBe('declared');
  });

  it("Étant donné une certification déclarée sans date de fin, alors elle n'est pas affichée comme certification", () => {
    const status = deriveHalalStatus([claim({ kind: 'certification', certifierId: 'alpha', validUntil: undefined })], '2026-10-27', CERTIFIERS);
    expect(status.level).toBe('unconfirmed');
  });

  it("Étant donné une déclaration en attente de revue, alors elle ne compte pas", () => {
    const status = deriveHalalStatus([claim({ reviewStatus: 'pending' })], '2026-10-27', CERTIFIERS);
    expect(status.level).toBe('unconfirmed');
  });
});

describe('6. Certification expirée', () => {
  const claims = [
    claim({ kind: 'certification', certifierId: 'alpha', evidenceDate: '2025-10-01', validUntil: '2026-09-30', method: 'certificate_check' }),
    claim({ kind: 'team_verification', evidenceDate: '2026-02-10', method: 'supplier_documents' }),
  ];

  it('Avant expiration, alors « Certifié par Organisme Alpha »', () => {
    const s = deriveHalalStatus(claims, '2026-09-30', CERTIFIERS);
    expect(s.level).toBe('certified');
    expect(s.certifier?.name).toBe('Organisme Alpha');
  });

  it("Le lendemain de l'expiration, alors le badge passe automatiquement au niveau suivant et l'expiration est signalée", () => {
    const s = deriveHalalStatus(claims, '2026-10-01', CERTIFIERS);
    expect(s.level).toBe('team_verified');
    expect(s.expiredCertification?.validUntil).toBe('2026-09-30');
  });

  it("Et le filtre « Certifié uniquement » l'écarte", () => {
    const r = restaurant({ halalClaims: claims });
    const res = search([r], req({ filters: { ...EMPTY_FILTERS, halalMin: 'certified' }, now: parisTime('2026-10-27', '20:00') }), CERTIFIERS);
    expect(res.results).toHaveLength(0);
  });
});

describe('7. Horaires de 18h à 2h', () => {
  const r = restaurant({ hours: hours([{ day: 5, opens: '18:00', closes: '02:00' }]) }); // vendredi

  it("Quand il est samedi 00:30, alors « ouvert » jusqu'à 02:00", () => {
    const s = openStatus(r, parisTime('2026-10-31', '00:30'));
    expect(s.state).toBe('open');
    expect(s.closesAt).toBe('02:00');
  });

  it('Quand il est samedi 02:00, alors fermé', () => {
    expect(openStatus(r, parisTime('2026-10-31', '02:00')).state).toBe('closed');
  });

  it("Quand le filtre « Ouvert maintenant » est actif samedi 01:45, alors l'adresse sort, signalée « ferme bientôt »", () => {
    const now = parisTime('2026-10-31', '01:45');
    const res = search([r], req({ filters: { ...EMPTY_FILTERS, openNow: true }, now }), CERTIFIERS);
    expect(res.results).toHaveLength(1);
    expect(res.results[0].open.closingSoon).toBe(true);
  });
});

describe('8 & 9. Ordre stable entre carte et liste', () => {
  it('Étant donné des scores identiques, quand on relance la même recherche, alors le même ordre (départage par identifiant)', () => {
    const catalog = ['c', 'a', 'b'].map((id) => restaurant({ id, location: REPUBLIQUE.center }));
    const first = search(catalog, req(), CERTIFIERS).results.map((r) => r.restaurant.id);
    const second = search([...catalog].reverse(), req(), CERTIFIERS).results.map((r) => r.restaurant.id);
    expect(first).toEqual(['a', 'b', 'c']);
    expect(second).toEqual(first);
  });
});

describe('11. Deux modifications concurrentes dans le back-office', () => {
  const fields = ['name', 'description', 'version'] as const;
  type Fiche = { name: string; description: string; version: number };
  const base: Fiche = { name: 'Les Braises', description: 'Grillades.', version: 4 };

  it("Quand B enregistre après A sur le même champ, alors conflit détecté et rien n'est écrasé", () => {
    const afterA: Fiche = { ...base, description: 'Grillades au charbon.', version: 5 };
    const mineB: Fiche = { ...base, description: 'Grillades et mezze.' };
    expect(() => saveVersioned(afterA, base, mineB, [...fields])).toThrow(VersionConflictError);
    try {
      saveVersioned(afterA, base, mineB, [...fields]);
    } catch (e) {
      const err = e as VersionConflictError<Fiche>;
      expect(err.merge.conflicts).toEqual(['description']);
      expect(err.current.description).toBe('Grillades au charbon.');
    }
  });

  it('Quand les champs diffèrent, alors la fusion proposée garde les deux changements', () => {
    const afterA: Fiche = { ...base, name: 'Les Braises de Belleville', version: 5 };
    const mineB: Fiche = { ...base, description: 'Grillades et mezze.' };
    try {
      saveVersioned(afterA, base, mineB, ['name', 'description']);
      expect.unreachable();
    } catch (e) {
      const err = e as VersionConflictError<Fiche>;
      expect(err.merge.conflicts).toEqual([]);
      expect(err.merge.merged).toMatchObject({ name: 'Les Braises de Belleville', description: 'Grillades et mezze.' });
    }
  });
});

describe('12. Contribution utilisateur', () => {
  const editor: Actor = { id: 'ed', role: 'editor', mfa: true };
  const c: Contribution = {
    id: 'k1',
    kind: 'halal_info',
    restaurantId: 'r-1',
    payload: { halal: 'certificat affiché en vitrine' },
    status: 'received',
    createdAt: '2026-10-27T10:00:00Z',
    history: [],
  };

  it("Quand elle est acceptée, alors elle devient une proposition en attente, sans publication", () => {
    const r = restaurant({ id: 'r-1' });
    const { contribution, proposal } = acceptContribution(c, editor, '2026-10-27T11:00:00Z');
    expect(contribution.status).toBe('accepted');
    expect(proposal.status).toBe('pending');
    // La fiche publique est inchangée : seule une proposition existe.
    expect(r.halalClaims).toHaveLength(1);
  });

  it('Et si elle touche au halal, seul un vérificateur peut l’appliquer', () => {
    const { proposal } = acceptContribution(c, editor, '2026-10-27T11:00:00Z');
    expect(proposal.requires).toBe('halal.review');
    expect(can(editor, 'halal.review')).toBe(false);
    expect(can({ id: 'v', role: 'verifier', mfa: true }, 'halal.review')).toBe(true);
  });
});

describe('13. Restaurateur partenaire', () => {
  const owner: Actor = { id: 'u1', role: 'restaurateur', restaurantIds: ['r-mine'], partnerIds: ['p-mine'], mfa: false };

  it("Alors il n'accède qu'aux données de son établissement", () => {
    expect(can(owner, 'stats.read', { restaurantId: 'r-mine' })).toBe(true);
    expect(can(owner, 'stats.read', { restaurantId: 'r-concurrent' })).toBe(false);
    expect(can(owner, 'restaurant.publish', { restaurantId: 'r-mine' })).toBe(false);
    const txs = [
      { id: 't1', partnerId: 'p-mine' },
      { id: 't2', partnerId: 'p-autre' },
    ];
    expect(visibleTo(owner, txs, 'loyalty.read').map((t) => t.id)).toEqual(['t1']);
  });
});

describe('14. Scan de fidélité répété', () => {
  const signer = demoSigner('secret-carte');
  const at = new Date('2026-10-27T19:00:00Z');
  const token = cardToken('card-1', at, DEMO_PROGRAM, signer);
  const scan = (ledger: LoyaltyTx[], when: Date, tok = token) =>
    earn(ledger, { token: tok, partnerId: 'p1', partnerActive: true, merchantUserId: 'm1', at: when }, DEMO_PROGRAM, signer);

  it('Quand le même QR est scanné deux fois, alors un seul crédit et la transaction d’origine est renvoyée', () => {
    const first = scan([], at);
    expect(first.outcome.status).toBe('credited');
    const second = scan(first.ledger, new Date(at.getTime() + 5000));
    expect(second.outcome.status).toBe('duplicate');
    expect(second.ledger).toHaveLength(1);
    expect(balance(second.ledger, 'card-1')).toBe(DEMO_PROGRAM.earn.mode === 'per_visit' ? DEMO_PROGRAM.earn.points : 0);
  });

  it('Quand un nouveau QR de la même carte est scanné 2 minutes après, alors refus « cooldown », tracé', () => {
    const first = scan([], at);
    const later = new Date(at.getTime() + 120_000);
    const again = scan(first.ledger, later, cardToken('card-1', later, DEMO_PROGRAM, signer));
    expect(again.outcome).toMatchObject({ status: 'rejected', reason: 'cooldown', cardId: 'card-1' });
  });

  it('Quand un QR périmé (capture d’écran) est présenté, alors refus', () => {
    const late = new Date(at.getTime() + 5 * 60_000);
    expect(scan([], late).outcome).toMatchObject({ status: 'rejected', reason: 'expired_token' });
  });

  it('Quand un QR est falsifié, alors refus', () => {
    const forged = token.replace(/\.[^.]+$/, '.zzzzzzz');
    expect(scan([], at, forged).outcome).toMatchObject({ status: 'rejected', reason: 'invalid_token' });
  });
});

describe('15. Suppression de compte', () => {
  it('Alors profil et favoris effacés, transactions financières conservées anonymisées', () => {
    const plan = planAccountDeletion({
      userId: 'u',
      hasFavorites: true,
      hasCollections: true,
      searchHistory: 12,
      contributions: 2,
      loyaltyCardId: 'card-1',
      loyaltyTransactions: 8,
      openDisputes: 0,
      devices: 1,
    });
    expect(plan.find((s) => s.what.startsWith('Favoris'))?.action).toBe('delete');
    const ledger = plan.find((s) => s.what.startsWith('Transactions'));
    expect(ledger?.action).toBe('retain');
    expect(ledger?.retainDays).toBeGreaterThan(365);
    expect(plan.find((s) => s.what.startsWith('Carte'))?.action).toBe('delete');
  });
});

describe('17. Lien profond', () => {
  it("Quand la fiche a changé d'adresse web, alors l'ancien lien mène à la fiche", () => {
    const r = restaurant({ slug: 'les-braises-belleville', previousSlugs: ['les-braises'] });
    expect(resolveRestaurantLink('les-braises', [r]).kind).toBe('renamed');
  });

  it('Quand le restaurant a déménagé, alors le lien mène au nouvel établissement', () => {
    const to = restaurant({ id: 'new', slug: 'nouveau' });
    const from = restaurant({ id: 'old', slug: 'ancien', operating: 'moved', successorId: 'new' });
    const link = resolveRestaurantLink('ancien', [from, to]);
    expect(link.kind).toBe('moved');
  });

  it("Quand le lien n'existe pas, alors « introuvable »", () => {
    expect(resolveRestaurantLink('nimporte-quoi', []).kind).toBe('not_found');
  });
});

describe('18. Fiche sponsorisée', () => {
  const now = parisTime('2026-10-27', '20:00');
  const campaign = { id: 'camp', from: '2026-10-01', to: '2026-11-30', label: 'Sponsorisé' as const };
  const organic = ['o1', 'o2', 'o3', 'o4'].map((id, i) =>
    restaurant({ id, location: { lat: REPUBLIQUE.center.lat + i * 0.0005, lng: REPUBLIQUE.center.lng }, editorialPick: true }),
  );
  const sponsored = restaurant({ id: 'sp', location: { lat: 48.88, lng: 2.34 }, sponsored: campaign, halalClaims: [claim({ kind: 'establishment_declaration' })] });

  it("Alors elle est insérée une fois, à l'emplacement prévu, marquée « Sponsorisé »", () => {
    const res = search([...organic, sponsored], req({ origin: REPUBLIQUE.center, now }), CERTIFIERS);
    const idx = res.results.findIndex((r) => r.restaurant.id === 'sp');
    expect(idx).toBe(2);
    expect(res.results[idx].sponsored).toBe(true);
    expect(res.results.filter((r) => r.restaurant.id === 'sp')).toHaveLength(1);
  });

  it('Et sa qualification halal reste indépendante : « déclaré » reste « déclaré »', () => {
    const res = search([...organic, sponsored], req({ origin: REPUBLIQUE.center, now }), CERTIFIERS);
    expect(res.results.find((r) => r.restaurant.id === 'sp')!.halal.level).toBe('declared');
  });

  it('Et si elle se classe seule au-dessus de l’emplacement, elle reste étiquetée, sans être déplacée', () => {
    const near = { ...sponsored, location: REPUBLIQUE.center, editorialPick: true };
    const res = search([...organic, near], req({ origin: REPUBLIQUE.center, now }), CERTIFIERS);
    const idx = res.results.findIndex((r) => r.restaurant.id === 'sp');
    expect(idx).toBeLessThan(2);
    expect(res.results[idx].sponsored).toBe(true);
  });

  it("Et si elle ne respecte pas un filtre (« Certifié uniquement »), alors elle n'apparaît pas", () => {
    const certifiedOrganic = organic.map((r) =>
      ({ ...r, halalClaims: [claim({ kind: 'certification', certifierId: 'alpha', evidenceDate: '2026-01-01', validUntil: '2027-01-01' })] }),
    );
    const res = search([...certifiedOrganic, sponsored], req({ origin: REPUBLIQUE.center, now, filters: { ...EMPTY_FILTERS, halalMin: 'certified' } }), CERTIFIERS);
    expect(res.results.map((r) => r.restaurant.id)).not.toContain('sp');
  });
});
