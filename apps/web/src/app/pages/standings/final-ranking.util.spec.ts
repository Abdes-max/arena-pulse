import { describe, expect, it } from 'vitest';
import { CompetitionPhase, Match } from 'shared-models';
import { computeFinalRanking } from './final-ranking.util';

function team(id: string, name: string) {
  return { id, name };
}

function match(overrides: Partial<Match> & { id: string; round: number }): Match {
  return {
    groupId: null,
    knockoutBracketId: 'bracket-1',
    bracketSlot: 0,
    isThirdPlaceMatch: false,
    status: 'COMPLETED',
    homeTeam: null,
    awayTeam: null,
    forfeitedTeam: null,
    timeSlot: null,
    officials: [],
    score: null,
    ...overrides,
  };
}

function phase(id: string, name: string, size = 4): CompetitionPhase {
  return {
    id,
    name,
    type: 'KNOCKOUT',
    position: 0,
    groups: [],
    knockoutBracket: { id: 'bracket-1', phaseId: id, name, size, hasRankingMatch: true },
  };
}

describe('computeFinalRanking', () => {
  it('ranks a 4-team bracket with a ranking match: winner, finalist, 3rd, 4th', () => {
    const matches: Match[] = [
      match({
        id: 'sf1',
        round: 1,
        homeTeam: team('a', 'Alpha'),
        awayTeam: team('b', 'Beta'),
        score: {
          homeScore: 2,
          awayScore: 1,
          homePenaltyScore: null,
          awayPenaltyScore: null,
          isValidated: true,
          validatedAt: null,
        },
      }),
      match({
        id: 'sf2',
        round: 1,
        bracketSlot: 1,
        homeTeam: team('c', 'Gamma'),
        awayTeam: team('d', 'Delta'),
        score: {
          homeScore: 0,
          awayScore: 2,
          homePenaltyScore: null,
          awayPenaltyScore: null,
          isValidated: true,
          validatedAt: null,
        },
      }),
      match({
        id: 'final',
        round: 2,
        homeTeam: team('a', 'Alpha'),
        awayTeam: team('d', 'Delta'),
        score: {
          homeScore: 1,
          awayScore: 3,
          homePenaltyScore: null,
          awayPenaltyScore: null,
          isValidated: true,
          validatedAt: null,
        },
      }),
      match({
        id: 'third',
        round: 2,
        isThirdPlaceMatch: true,
        homeTeam: team('b', 'Beta'),
        awayTeam: team('c', 'Gamma'),
        score: {
          homeScore: 2,
          awayScore: 0,
          homePenaltyScore: null,
          awayPenaltyScore: null,
          isValidated: true,
          validatedAt: null,
        },
      }),
    ];

    const ranking = computeFinalRanking([{ phase: phase('p1', 'Finale'), matches }]);

    expect(ranking.map((row) => [row.teamName, row.stageLabel, row.position])).toEqual([
      ['Delta', 'Vainqueur', 1],
      ['Alpha', 'Finaliste', 2],
      ['Beta', '3e place', 3],
      ['Gamma', '4e place', 4],
    ]);
  });

  it('ranks semifinal losers below the final when there is no ranking match', () => {
    const matches: Match[] = [
      match({
        id: 'sf1',
        round: 1,
        homeTeam: team('a', 'Alpha'),
        awayTeam: team('b', 'Beta'),
        score: {
          homeScore: 2,
          awayScore: 1,
          homePenaltyScore: null,
          awayPenaltyScore: null,
          isValidated: true,
          validatedAt: null,
        },
      }),
      match({
        id: 'sf2',
        round: 1,
        bracketSlot: 1,
        homeTeam: team('c', 'Gamma'),
        awayTeam: team('d', 'Delta'),
        score: {
          homeScore: 0,
          awayScore: 2,
          homePenaltyScore: null,
          awayPenaltyScore: null,
          isValidated: true,
          validatedAt: null,
        },
      }),
      match({
        id: 'final',
        round: 2,
        homeTeam: team('a', 'Alpha'),
        awayTeam: team('d', 'Delta'),
        score: {
          homeScore: 1,
          awayScore: 3,
          homePenaltyScore: null,
          awayPenaltyScore: null,
          isValidated: true,
          validatedAt: null,
        },
      }),
    ];

    const ranking = computeFinalRanking([{ phase: phase('p1', 'Finale'), matches }]);

    expect(ranking.map((row) => [row.teamName, row.stageLabel])).toEqual([
      ['Delta', 'Vainqueur'],
      ['Alpha', 'Finaliste'],
      ['Beta', 'Demi-finaliste éliminé'],
      ['Gamma', 'Demi-finaliste éliminé'],
    ]);
  });

  it('ranks a higher-value bracket entirely above a lesser one, regardless of stage', () => {
    const championsFinal = match({
      id: 'cl-final',
      round: 1,
      homeTeam: team('a', 'Alpha'),
      awayTeam: team('b', 'Beta'),
      score: {
        homeScore: 0,
        awayScore: 1,
        homePenaltyScore: null,
        awayPenaltyScore: null,
        isValidated: true,
        validatedAt: null,
      },
    });
    const europaFinal = match({
      id: 'el-final',
      round: 1,
      homeTeam: team('e', 'Epsilon'),
      awayTeam: team('f', 'Zeta'),
      score: {
        homeScore: 2,
        awayScore: 0,
        homePenaltyScore: null,
        awayPenaltyScore: null,
        isValidated: true,
        validatedAt: null,
      },
    });

    const ranking = computeFinalRanking([
      { phase: phase('champions', 'Champions League', 2), matches: [championsFinal] },
      { phase: phase('europa', 'Europa League', 2), matches: [europaFinal] },
    ]);

    // Beta (Champions runner-up... here winner) and Alpha (Champions
    // finalist) both outrank Epsilon (Europa winner), since bracket order
    // dominates stage reached.
    expect(ranking.map((row) => row.teamName)).toEqual(['Beta', 'Alpha', 'Epsilon', 'Zeta']);
  });

  it('omits a team from an in-progress round that has no subsequent match yet', () => {
    const matches: Match[] = [
      match({
        id: 'sf1',
        round: 1,
        homeTeam: team('a', 'Alpha'),
        awayTeam: team('b', 'Beta'),
        score: {
          homeScore: 2,
          awayScore: 1,
          homePenaltyScore: null,
          awayPenaltyScore: null,
          isValidated: true,
          validatedAt: null,
        },
      }),
      match({
        id: 'sf2',
        round: 1,
        bracketSlot: 1,
        homeTeam: team('c', 'Gamma'),
        awayTeam: team('d', 'Delta'),
        score: null,
      }),
    ];

    const ranking = computeFinalRanking([{ phase: phase('p1', 'Finale'), matches }]);

    // Beta lost its semifinal, so it's ranked as eliminated; Alpha's fate
    // isn't decided yet (no final generated), so it doesn't appear at all.
    expect(ranking.map((row) => row.teamName)).toEqual(['Beta']);
  });
});
