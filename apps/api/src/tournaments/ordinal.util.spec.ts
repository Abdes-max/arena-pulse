import { ordinal, roundLabel } from './ordinal.util';

describe('ordinal', () => {
  it('special-cases 1 as "1er"', () => {
    expect(ordinal(1)).toBe('1er');
  });

  it('uses "Ne" for every other position', () => {
    expect(ordinal(2)).toBe('2e');
    expect(ordinal(3)).toBe('3e');
    expect(ordinal(10)).toBe('10e');
  });
});

describe('roundLabel', () => {
  it('returns "Finale" for the final itself', () => {
    expect(roundLabel(0)).toBe('Finale');
  });

  it('returns the known round names by distance from the final', () => {
    expect(roundLabel(1)).toBe('Demi-finale');
    expect(roundLabel(2)).toBe('Quart de finale');
    expect(roundLabel(3)).toBe('Huitième de finale');
    expect(roundLabel(4)).toBe('Seizième de finale');
  });

  it('falls back to a fraction label beyond the known round names', () => {
    expect(roundLabel(7)).toBe('1/128 de finale');
  });
});
