import { describe, expect, it } from 'vitest';
import { poolsKnockoutPresetError } from './structure-preset';

const tierName = (index: number) => `Palier ${index + 1}`;
const tier = (qualifiersPerPool: string, name = '') => ({ name, qualifiersPerPool });

describe('poolsKnockoutPresetError', () => {
  it('accepts 4 pools × 2 qualifiers (an 8-team bracket)', () => {
    expect(
      poolsKnockoutPresetError({
        teamCount: 16,
        poolCount: 4,
        tiers: [tier('2')],
        bestOfPosition: null,
        tierName,
      }),
    ).toBeNull();
  });

  it('accepts two tiers, each a power of two', () => {
    expect(
      poolsKnockoutPresetError({
        teamCount: 16,
        poolCount: 4,
        tiers: [tier('2', 'Or'), tier('1', 'Argent')],
        bestOfPosition: null,
        tierName,
      }),
    ).toBeNull();
  });

  it('adds the best-placed teams to the first tier only', () => {
    // 3 pools × 2 + the 2 best 3rds = 8.
    expect(
      poolsKnockoutPresetError({
        teamCount: 12,
        poolCount: 3,
        tiers: [tier('2')],
        bestOfPosition: { position: 3, count: 2 },
        tierName,
      }),
    ).toBeNull();
    expect(
      poolsKnockoutPresetError({
        teamCount: 12,
        poolCount: 3,
        tiers: [tier('2')],
        bestOfPosition: { position: 3, count: 1 },
        tierName,
      })?.key,
    ).toBe('tierBracketNotPowerOfTwoWithBest');
  });

  it('names a blank tier in the bracket-size error', () => {
    expect(
      poolsKnockoutPresetError({
        teamCount: 12,
        poolCount: 3,
        tiers: [tier('1', 'Or'), tier('1')],
        bestOfPosition: { position: 3, count: 1 },
        tierName,
      }),
    ).toEqual({
      key: 'tierBracketNotPowerOfTwo',
      params: { tierName: 'Palier 2', poolCount: 3, qualifiers: 1, bracketSize: 3 },
    });
  });

  it('refuses a best-of position already taken by direct qualifiers', () => {
    expect(
      poolsKnockoutPresetError({
        teamCount: 16,
        poolCount: 4,
        tiers: [tier('2')],
        bestOfPosition: { position: 2, count: 2 },
        tierName,
      })?.key,
    ).toBe('bestOfPositionOverlapsDirect');
  });

  it('refuses more best-placed teams than pools', () => {
    expect(
      poolsKnockoutPresetError({
        teamCount: 16,
        poolCount: 4,
        tiers: [tier('1')],
        bestOfPosition: { position: 2, count: 5 },
        tierName,
      })?.key,
    ).toBe('bestOfPositionExceedsPools');
  });

  it('refuses more qualifiers than the smallest pool holds', () => {
    expect(
      poolsKnockoutPresetError({
        teamCount: 8,
        poolCount: 4,
        tiers: [tier('2'), tier('1')],
        bestOfPosition: null,
        tierName,
      })?.key,
    ).toBe('tooManyQualifiersForSmallestPool');
  });

  it('waits for every field before judging', () => {
    expect(
      poolsKnockoutPresetError({
        teamCount: 16,
        poolCount: 4,
        tiers: [tier('2'), tier('')],
        bestOfPosition: null,
        tierName,
      }),
    ).toBeNull();
  });
});
