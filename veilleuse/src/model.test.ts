import { describe, expect, it } from 'vitest';
import { createEntry, describeTags, fromLegacy, sortTags } from './model';

const meta = { id: 'abc', at: 1000, createdAt: 1000, updatedAt: 2000, deletedAt: null };

describe('saisies', () => {
  it('range les étiquettes dans un ordre fixe, sans doublon', () => {
    expect(sortTags(['poop', 'feed', 'poop', 'pee'])).toEqual(['feed', 'pee', 'poop']);
    expect(createEntry(['pee', 'feed'], 1000).tags).toEqual(['feed', 'pee']);
  });

  it('décrit une saisie en toutes lettres', () => {
    expect(describeTags(['feed', 'pee', 'poop'])).toBe('Tétée, pipi, caca');
  });
});

describe('conversion des données de la première version', () => {
  it('tétée chronométrée, biberon, couches', () => {
    expect(fromLegacy({ ...meta, type: 'breast', sides: ['L', 'R'], leftMs: 1, rightMs: 2, durationMs: 3 })).toEqual({
      ...meta,
      tags: ['feed'],
    });
    expect(fromLegacy({ ...meta, type: 'bottle', ml: 90 })?.tags).toEqual(['bottle']);
    expect(fromLegacy({ ...meta, type: 'diaper', pee: true, poop: true })?.tags).toEqual(['pee', 'poop']);
    expect(fromLegacy({ ...meta, type: 'diaper', pee: false, poop: true })?.tags).toEqual(['poop']);
  });

  it('garde la suppression logique et laisse intactes les saisies déjà converties', () => {
    expect(fromLegacy({ ...meta, type: 'bottle', ml: 60, deletedAt: 3000 })?.deletedAt).toBe(3000);
    const entry = { ...meta, tags: ['pee'] };
    expect(fromLegacy(entry)).toBe(entry);
  });

  it('écarte un enregistrement inconnu', () => {
    expect(fromLegacy({ ...meta, type: 'autre' })).toBeNull();
    expect(fromLegacy({ ...meta, type: 'diaper', pee: false, poop: false })).toBeNull();
  });
});
