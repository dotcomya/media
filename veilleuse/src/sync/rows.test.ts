import { describe, expect, it } from 'vitest';
import { createEntry, type Profile, type Weight } from '../model';
import { fromRow, profileRowId, toRow } from './rows';

const FAMILY = 'K7QM-2XRP-HW4D';

describe('lignes du serveur', () => {
  it('fait l’aller-retour d’une tétée avec sein et durée', () => {
    const feed = createEntry(['feed', 'pee'], 1000, undefined, 2000, { sides: ['right', 'left'], durationMin: 14 });
    const row = toRow(FAMILY, feed);
    expect(row.tags).toEqual(['feed', 'pee', 'side:left', 'side:right', 'min:14']);
    expect(fromRow(row)).toEqual(feed);
  });

  it('fait l’aller-retour d’un biberon (volume dans la colonne ml)', () => {
    const bottle = createEntry(['bottle'], 1000, 120, 2000);
    expect(toRow(FAMILY, bottle)).toMatchObject({ tags: ['bottle'], ml: 120 });
    expect(fromRow(toRow(FAMILY, bottle))).toEqual(bottle);
  });

  it('lit une ligne d’une version précédente (étiquettes seules)', () => {
    const row = { id: 'x', family: FAMILY, at: 5, tags: ['poop', 'feed'], ml: null, created_at: 1, updated_at: 2, deleted_at: null };
    expect(fromRow(row)).toEqual({ id: 'x', at: 5, tags: ['feed', 'poop'], createdAt: 1, updatedAt: 2, deletedAt: null });
  });

  it('fait l’aller-retour d’une pesée', () => {
    const weight: Weight = { kind: 'weight', id: 'w1', at: 1000, grams: 4250, createdAt: 1, updatedAt: 2, deletedAt: null };
    expect(toRow(FAMILY, weight).tags).toEqual(['weight', 'g:4250']);
    expect(fromRow(toRow(FAMILY, weight))).toEqual(weight);
  });

  it('écrit un seul profil par famille, au format UUID', () => {
    const profile: Profile = {
      kind: 'profile',
      id: 'profile',
      babyName: 'Lou: la petite',
      birthDate: '2026-10-01',
      sex: 'girl',
      feedIntervalMin: 180,
      createdAt: 1,
      updatedAt: 2,
      deletedAt: null,
    };
    const row = toRow(FAMILY, profile);
    expect(row.id).toBe(profileRowId(FAMILY));
    expect(row.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(profileRowId('AAAA-BBBB-CCCC')).not.toBe(row.id);
    expect(fromRow(row)).toEqual(profile);
  });
});
