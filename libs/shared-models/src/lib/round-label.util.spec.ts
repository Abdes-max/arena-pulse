import { eliminatedAtLabel, roundLabel, roundLabelPlural } from './round-label.util';

describe('round-label.util', () => {
  describe('roundLabel', () => {
    it('names each round by its distance from the final', () => {
      expect(roundLabel(0)).toBe('Finale');
      expect(roundLabel(1)).toBe('Demi-finale');
      expect(roundLabel(2)).toBe('Quart de finale');
      expect(roundLabel(3)).toBe('Huitième de finale');
      expect(roundLabel(4)).toBe('Seizième de finale');
      expect(roundLabel(5)).toBe('Trente-deuxième de finale');
      expect(roundLabel(6)).toBe('Soixante-quatrième de finale');
    });

    it('falls back to a computed fraction beyond the named rounds', () => {
      expect(roundLabel(7)).toBe('1/128 de finale');
    });
  });

  describe('roundLabelPlural', () => {
    it('pluralizes the leading ordinal word, not "finale"', () => {
      expect(roundLabelPlural(0)).toBe('Finale');
      expect(roundLabelPlural(1)).toBe('Demi-finales');
      expect(roundLabelPlural(2)).toBe('Quarts de finale');
      expect(roundLabelPlural(3)).toBe('Huitièmes de finale');
      expect(roundLabelPlural(5)).toBe('Trente-deuxièmes de finale');
    });
  });

  describe('eliminatedAtLabel', () => {
    it('describes a team eliminated in that round', () => {
      expect(eliminatedAtLabel(1)).toBe('Demi-finaliste éliminé');
      expect(eliminatedAtLabel(2)).toBe('Quart de finaliste éliminé');
      expect(eliminatedAtLabel(3)).toBe('Huitième de finaliste éliminé');
      expect(eliminatedAtLabel(4)).toBe('Seizième de finaliste éliminé');
    });
  });
});
