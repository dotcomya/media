import { describe, expect, it } from 'vitest';
import {
  PERCENTILES,
  ageInWeeks,
  formatAge,
  formatPercentile,
  lmsAt,
  parseWeight,
  percentileOf,
  weightAtZ,
} from './growth';

const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).getTime();
const p = (sex: 'girl' | 'boy', weeks: number, z: number) => Math.round(weightAtZ(lmsAt(sex, weeks), z) * 10) / 10;

describe('courbes de poids OMS', () => {
  it('retrouve les valeurs publiées par l’OMS à la naissance', () => {
    // Tables OMS « Weight-for-age, birth to 13 weeks » : 3e / 50e / 97e percentiles.
    expect([p('girl', 0, -1.880794), p('girl', 0, 0), p('girl', 0, 1.880794)]).toEqual([2.4, 3.2, 4.2]);
    expect([p('boy', 0, -1.880794), p('boy', 0, 0), p('boy', 0, 1.880794)]).toEqual([2.5, 3.3, 4.3]);
  });

  it('retrouve la médiane à 13 semaines et à 1 an', () => {
    expect(p('boy', 13, 0)).toBe(6.4);
    expect(p('girl', 13, 0)).toBe(5.8);
    expect(p('girl', 52, 0)).toBe(8.9); // 364 jours
  });

  it('interpole entre deux semaines', () => {
    const mid = lmsAt('girl', 1.5)[1];
    expect(mid).toBeCloseTo((lmsAt('girl', 1)[1] + lmsAt('girl', 2)[1]) / 2, 6);
  });

  it('place un poids sur son percentile, et chaque courbe sur le sien', () => {
    expect(Math.round(percentileOf('boy', 0, 3.3464))).toBe(50);
    for (const { p: target, z } of PERCENTILES) {
      expect(percentileOf('girl', 8, weightAtZ(lmsAt('girl', 8), z))).toBeCloseTo(target, 3);
    }
    expect(formatPercentile(48.4)).toBe('48e percentile');
    expect(formatPercentile(0.6)).toBe('sous le 1er percentile');
  });

  it('compte l’âge en semaines depuis la naissance', () => {
    expect(ageInWeeks('2026-10-01', at(2026, 10, 1))).toBe(0);
    expect(ageInWeeks('2026-10-01', at(2026, 10, 15, 23))).toBe(2);
    // Passage à l'heure d'hiver le 25/10 : toujours des jours entiers.
    expect(ageInWeeks('2026-10-01', at(2026, 11, 5, 0))).toBe(5);
    expect(formatAge(5 + 3 / 7)).toBe('5 sem. 3 j');
    expect(formatAge(0)).toBe('naissance');
  });

  it('comprend un poids tapé en kg ou en g', () => {
    expect(parseWeight('4,25')).toBe(4250);
    expect(parseWeight('4.255')).toBe(4255);
    expect(parseWeight('4250')).toBe(4250);
    expect(parseWeight(' 3,9 kg')).toBe(3900);
    expect(parseWeight('0,4')).toBeNull();
    expect(parseWeight('abc')).toBeNull();
  });
});
