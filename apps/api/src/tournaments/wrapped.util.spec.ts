import { MatchOutcomeInput } from './match-outcome.util';
import {
  computeMatchStats,
  findBiggestUpset,
  MIN_MATCHES_FOR_DEFENSE_RANKING,
  RatingHistoryEntry,
  WrappedMatchInput,
} from './wrapped.util';

function match(
  overrides: Partial<WrappedMatchInput> & { id: string },
): WrappedMatchInput {
  return {
    homeTeamName: 'Home',
    awayTeamName: 'Away',
    homeScore: 0,
    awayScore: 0,
    homePenaltyScore: null,
    awayPenaltyScore: null,
    fieldName: null,
    startTime: null,
    ...overrides,
  };
}

describe('computeMatchStats', () => {
  it('sums goals and averages across every played match', () => {
    const stats = computeMatchStats([
      match({
        id: 'm1',
        homeTeamName: 'A',
        awayTeamName: 'B',
        homeScore: 3,
        awayScore: 1,
      }),
      match({
        id: 'm2',
        homeTeamName: 'A',
        awayTeamName: 'C',
        homeScore: 0,
        awayScore: 0,
      }),
    ]);
    expect(stats.matchesPlayed).toBe(2);
    expect(stats.totalGoals).toBe(4);
    expect(stats.averageGoalsPerMatch).toBeCloseTo(2, 5);
  });

  it('classifies outcomes into home/away/draw/shootout', () => {
    const stats = computeMatchStats([
      match({
        id: 'home-win',
        homeTeamName: 'A',
        awayTeamName: 'B',
        homeScore: 2,
        awayScore: 1,
      }),
      match({
        id: 'away-win',
        homeTeamName: 'A',
        awayTeamName: 'B',
        homeScore: 0,
        awayScore: 1,
      }),
      match({
        id: 'draw',
        homeTeamName: 'A',
        awayTeamName: 'B',
        homeScore: 2,
        awayScore: 2,
      }),
      match({
        id: 'shootout',
        homeTeamName: 'A',
        awayTeamName: 'B',
        homeScore: 1,
        awayScore: 1,
        homePenaltyScore: 4,
        awayPenaltyScore: 3,
      }),
    ]);
    expect(stats.outcomes).toEqual({
      homeWin: 1,
      awayWin: 1,
      draw: 1,
      shootout: 1,
    });
  });

  it('finds the highest-scoring match, the biggest win margin and the closest decided match', () => {
    const stats = computeMatchStats([
      match({
        id: 'thriller',
        homeTeamName: 'A',
        awayTeamName: 'B',
        homeScore: 7,
        awayScore: 6,
      }),
      match({
        id: 'blowout',
        homeTeamName: 'A',
        awayTeamName: 'C',
        homeScore: 9,
        awayScore: 0,
      }),
      match({
        id: 'nailbiter',
        homeTeamName: 'B',
        awayTeamName: 'C',
        homeScore: 2,
        awayScore: 1,
      }),
      match({
        id: 'goalless-draw',
        homeTeamName: 'A',
        awayTeamName: 'B',
        homeScore: 0,
        awayScore: 0,
      }),
    ]);
    expect(stats.highestScoringMatch?.matchId).toBe('thriller');
    expect(stats.biggestWinMargin?.matchId).toBe('blowout');
    // "nailbiter" (margin 1) beats "thriller" (margin 1) only by insertion
    // order when tied -- both have margin 1, so assert the margin instead of
    // a specific id to avoid coupling the test to that tie-break.
    expect(
      Math.abs(stats.closestMatch!.homeScore - stats.closestMatch!.awayScore),
    ).toBe(1);
  });

  it('ranks a penalty shootout as the closest possible match (margin 0) without counting it as a draw', () => {
    const stats = computeMatchStats([
      match({
        id: 'shootout',
        homeTeamName: 'A',
        awayTeamName: 'B',
        homeScore: 1,
        awayScore: 1,
        homePenaltyScore: 5,
        awayPenaltyScore: 4,
      }),
      match({
        id: 'one-nil',
        homeTeamName: 'A',
        awayTeamName: 'C',
        homeScore: 1,
        awayScore: 0,
      }),
    ]);
    expect(stats.closestMatch?.matchId).toBe('shootout');
  });

  it('groups matches by field name and by kickoff hour', () => {
    const stats = computeMatchStats([
      match({
        id: 'm1',
        fieldName: 'Terrain 1',
        startTime: new Date('2026-09-05T10:00:00Z'),
        homeScore: 1,
        awayScore: 0,
      }),
      match({
        id: 'm2',
        fieldName: 'Terrain 1',
        startTime: new Date('2026-09-05T10:30:00Z'),
        homeScore: 1,
        awayScore: 0,
      }),
      match({
        id: 'm3',
        fieldName: 'Terrain 2',
        startTime: new Date('2026-09-05T14:00:00Z'),
        homeScore: 1,
        awayScore: 0,
      }),
    ]);
    expect(stats.venues).toEqual([
      { name: 'Terrain 1', count: 2 },
      { name: 'Terrain 2', count: 1 },
    ]);
    expect(stats.matchesByHour.map((h) => h.name)).toEqual(['10', '14']);
  });

  it('ranks top attack by goals scored and top defense by goals conceded, gating defense on a minimum of matches played', () => {
    const stats = computeMatchStats([
      match({
        id: 'm1',
        homeTeamName: 'Sieve FC',
        awayTeamName: 'Wall FC',
        homeScore: 0,
        awayScore: 1,
      }),
      match({
        id: 'm2',
        homeTeamName: 'Sieve FC',
        awayTeamName: 'Wall FC',
        homeScore: 0,
        awayScore: 1,
      }),
      // One-off team with a perfect defensive record on a single match --
      // must NOT outrank Wall FC, which has actually proven it over enough
      // matches to qualify.
      match({
        id: 'm3',
        homeTeamName: 'One Match Wonders',
        awayTeamName: 'Sieve FC',
        homeScore: 1,
        awayScore: 0,
      }),
      match({
        id: 'm4',
        homeTeamName: 'Sieve FC',
        awayTeamName: 'Wall FC',
        homeScore: 0,
        awayScore: 1,
      }),
    ]);
    expect(stats.topAttack[0]).toMatchObject({ teamName: 'Wall FC', goals: 3 });
    expect(MIN_MATCHES_FOR_DEFENSE_RANKING).toBe(3);
    expect(
      stats.topDefense.find((row) => row.teamName === 'One Match Wonders'),
    ).toBeUndefined();
    expect(stats.topDefense[0]).toMatchObject({
      teamName: 'Wall FC',
      goals: 0,
      matchesPlayed: 3,
    });
  });
});

function outcome(overrides: Partial<MatchOutcomeInput>): MatchOutcomeInput {
  return {
    homeTeamId: 'home',
    awayTeamId: 'away',
    forfeitedTeamId: null,
    status: 'COMPLETED',
    score: {
      homeScore: 1,
      awayScore: 0,
      homePenaltyScore: null,
      awayPenaltyScore: null,
      isValidated: true,
    },
    ...overrides,
  };
}

function history(
  overrides: Partial<RatingHistoryEntry> & { matchId: string },
): RatingHistoryEntry {
  return {
    homeTeamName: 'Home',
    awayTeamName: 'Away',
    outcome: outcome({}),
    inScope: true,
    ...overrides,
  };
}

describe('findBiggestUpset', () => {
  it('returns null when nothing in scope has a decided winner', () => {
    expect(
      findBiggestUpset([
        history({
          matchId: 'm1',
          outcome: outcome({
            score: {
              homeScore: 1,
              awayScore: 1,
              homePenaltyScore: null,
              awayPenaltyScore: null,
              isValidated: true,
            },
          }),
        }),
      ]),
    ).toBeNull();
  });

  it('returns null when the higher-rated team always wins (no upset)', () => {
    // Two brand-new teams (both default 1500) — "Favourite" wins every match
    // first, building a lead, then always wins again: never an upset.
    const entries: RatingHistoryEntry[] = [
      history({
        matchId: 'warmup-1',
        homeTeamName: 'Favourite',
        awayTeamName: 'Filler',
        inScope: false,
      }),
      history({
        matchId: 'warmup-2',
        homeTeamName: 'Favourite',
        awayTeamName: 'Filler',
        inScope: false,
      }),
      history({
        matchId: 'final',
        homeTeamName: 'Favourite',
        awayTeamName: 'Underdog',
        inScope: true,
      }),
    ];
    expect(findBiggestUpset(entries)).toBeNull();
  });

  it('detects the lower-rated team winning as an upset, using the pre-match rating gap', () => {
    const entries: RatingHistoryEntry[] = [
      // Build up "Giant"'s rating with warm-up wins (out of tournament scope)
      // before the in-scope upset, so it's rated well above default.
      history({
        matchId: 'warmup-1',
        homeTeamName: 'Giant',
        awayTeamName: 'Filler A',
        inScope: false,
      }),
      history({
        matchId: 'warmup-2',
        homeTeamName: 'Giant',
        awayTeamName: 'Filler B',
        inScope: false,
      }),
      history({
        matchId: 'upset',
        homeTeamName: 'Underdog',
        awayTeamName: 'Giant',
        outcome: outcome({
          homeTeamId: 'home',
          awayTeamId: 'away',
          score: {
            homeScore: 2,
            awayScore: 1,
            homePenaltyScore: null,
            awayPenaltyScore: null,
            isValidated: true,
          },
        }),
        inScope: true,
      }),
    ];
    const upset = findBiggestUpset(entries);
    expect(upset?.winnerTeamName).toBe('Underdog');
    expect(upset?.loserTeamName).toBe('Giant');
    expect(upset?.gap).toBeGreaterThan(0);
  });

  it('ignores an upset-shaped result on a match outside the tournament in scope', () => {
    const entries: RatingHistoryEntry[] = [
      // Giant beats Filler first (out of scope) -- Giant's rating rises
      // above the 1500 default before the in-scope match below is reached.
      history({
        matchId: 'warmup',
        homeTeamName: 'Giant',
        awayTeamName: 'Filler',
        inScope: false,
      }),
      // Giant (now rated above default) beats a still-fresh Underdog
      // (1500): the higher-rated side wins, not an upset.
      history({
        matchId: 'in-scope-favourite-win',
        homeTeamName: 'Giant',
        awayTeamName: 'Underdog',
        inScope: true,
      }),
      // This result, taken alone, has exactly the shape of an upset (the
      // team that just lost above turns around and wins big) -- but it
      // happens on a different, out-of-scope match *after* the in-scope one,
      // so it can neither be reported itself nor retroactively change the
      // in-scope match's already-fixed pre-match snapshot.
      history({
        matchId: 'later-out-of-scope-upset',
        homeTeamName: 'Underdog',
        awayTeamName: 'Giant',
        outcome: outcome({
          score: {
            homeScore: 3,
            awayScore: 0,
            homePenaltyScore: null,
            awayPenaltyScore: null,
            isValidated: true,
          },
        }),
        inScope: false,
      }),
    ];
    expect(findBiggestUpset(entries)).toBeNull();
  });
});
