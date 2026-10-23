import { describe, expect, it } from 'vitest';
import { createEntry } from '../model';
import { newFamilyCode, newerRemote, normalizeFamilyCode } from './merge';

describe('fusion des deux téléphones', () => {
  const mine = createEntry(['feed'], 1000, undefined, 5000);
  const local = new Map([[mine.id, mine]]);

  it('garde une saisie inconnue et une version plus récente', () => {
    const other = createEntry(['pee'], 2000, undefined, 6000);
    const edited = { ...mine, tags: ['feed', 'pee'] as const, updatedAt: 7000 };
    expect(newerRemote(local, [other, { ...edited, tags: [...edited.tags] }]).map((e) => e.id)).toEqual([other.id, mine.id]);
  });

  it('ignore une version plus ancienne ou identique', () => {
    expect(newerRemote(local, [{ ...mine, updatedAt: 4000 }, { ...mine }])).toEqual([]);
  });

  it('propage une suppression plus récente', () => {
    const deleted = { ...mine, deletedAt: 8000, updatedAt: 8000 };
    expect(newerRemote(local, [deleted])).toEqual([deleted]);
  });
});

describe('code famille', () => {
  it('est lisible et se recopie sans ambiguïté', () => {
    const code = newFamilyCode();
    expect(code).toMatch(/^[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/);
    expect(normalizeFamilyCode(code.toLowerCase().replace(/-/g, ' '))).toBe(code);
  });

  it('refuse un code incomplet ou avec des caractères ambigus', () => {
    expect(normalizeFamilyCode('ABCD-EFGH')).toBeNull();
    expect(normalizeFamilyCode('ABCD-EFGH-IJK0')).toBeNull();
  });
});
