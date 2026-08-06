import { Match, CompetitionPhase } from './models';
import {
  eliminatedAtLabel,
  groupMatchesByPhaseSection,
  roundLabel,
  roundLabelPlural,
} from './round-label.util';

function match(overrides: Partial<Match> & { id: string; round: number }): Match {
  return {
    groupId: null,
    knockoutBracketId: 'bracket-1',
    bracketSlot: 0,
    isThirdPlaceMatch: false,
    status: 'SCHEDULED',
    homeTeam: null,
    awayTeam: null,
    homeSourceLabel: null,
    awaySourceLabel: null,
    forfeitedTeam: null,
    timeSlot: null,
    officials: [],
    score: null,
    ...overrides,
  };
}

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

  describe('groupMatchesByPhaseSection', () => {
    it('puts every group-stage match under a single "Phase de poules" section', () => {
      const phase: Pick<CompetitionPhase, 'type' | 'knockoutBracket'> = {
        type: 'GROUP_STAGE',
        knockoutBracket: null,
      };
      const matches = [match({ id: 'a', round: 1 }), match({ id: 'b', round: 2 })];

      expect(groupMatchesByPhaseSection(phase, matches)).toEqual([
        { label: 'Phase de poules', matches },
      ]);
    });

    it('returns no sections when there are no matches', () => {
      const phase: Pick<CompetitionPhase, 'type' | 'knockoutBracket'> = {
        type: 'GROUP_STAGE',
        knockoutBracket: null,
      };
      expect(groupMatchesByPhaseSection(phase, [])).toEqual([]);
    });

    it('groups a knockout phase into one section per round, full French wording', () => {
      const phase: Pick<CompetitionPhase, 'type' | 'knockoutBracket'> = {
        type: 'KNOCKOUT',
        knockoutBracket: {
          id: 'b1',
          phaseId: 'p1',
          name: 'Tableau',
          size: 4,
          hasRankingMatch: false,
        },
      };
      const matches = [
        match({ id: 'sf1', round: 1 }),
        match({ id: 'sf2', round: 1 }),
        match({ id: 'final', round: 2 }),
      ];

      expect(
        groupMatchesByPhaseSection(phase, matches).map((s) => [s.label, s.matches.length]),
      ).toEqual([
        ['Demi-finale', 2],
        ['Finale', 1],
      ]);
    });

    it('splits the 3rd-place match into its own trailing section', () => {
      const phase: Pick<CompetitionPhase, 'type' | 'knockoutBracket'> = {
        type: 'KNOCKOUT',
        knockoutBracket: {
          id: 'b1',
          phaseId: 'p1',
          name: 'Tableau',
          size: 4,
          hasRankingMatch: true,
        },
      };
      const matches = [
        match({ id: 'final', round: 2 }),
        match({ id: 'third', round: 2, isThirdPlaceMatch: true }),
      ];

      const sections = groupMatchesByPhaseSection(phase, matches);
      expect(sections.map((s) => s.label)).toEqual(['Finale', 'Pour la 3e place']);
      expect(sections[1].matches.map((m) => m.id)).toEqual(['third']);
    });
  });
});
