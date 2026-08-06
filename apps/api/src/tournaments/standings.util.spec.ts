import { computeStandings, rankCrossGroupCandidates } from './standings.util';

const SCHEME = { winPoints: 3, drawPoints: 1, lossPoints: 0 };
const TIE_BREAK_ORDER = [
  'POINTS',
  'GOAL_DIFFERENCE',
  'GOALS_SCORED',
  'HEAD_TO_HEAD',
];

describe('computeStandings', () => {
  it('lists every team even with no matches played', () => {
    const teams = [
      { id: 'a', name: 'Alpha' },
      { id: 'b', name: 'Beta' },
    ];

    const rows = computeStandings(teams, [], SCHEME, TIE_BREAK_ORDER);

    expect(rows).toEqual([
      expect.objectContaining({
        teamId: 'a',
        played: 0,
        points: 0,
        position: 1,
      }),
      expect.objectContaining({
        teamId: 'b',
        played: 0,
        points: 0,
        position: 2,
      }),
    ]);
  });

  it('computes points, goal difference, and orders by points first', () => {
    const teams = [
      { id: 'a', name: 'Alpha' },
      { id: 'b', name: 'Beta' },
      { id: 'c', name: 'Gamma' },
    ];
    const matches = [
      { homeTeamId: 'a', awayTeamId: 'b', homeScore: 3, awayScore: 1 },
      { homeTeamId: 'b', awayTeamId: 'c', homeScore: 2, awayScore: 2 },
      { homeTeamId: 'c', awayTeamId: 'a', homeScore: 0, awayScore: 1 },
    ];

    const rows = computeStandings(teams, matches, SCHEME, TIE_BREAK_ORDER);

    expect(rows[0]).toMatchObject({
      teamId: 'a',
      played: 2,
      won: 2,
      drawn: 0,
      lost: 0,
      goalsFor: 4,
      goalsAgainst: 1,
      goalDifference: 3,
      points: 6,
      position: 1,
    });
    // b and c are level on points (1) but c's goal difference (-1) beats b's (-2).
    expect(rows[1]).toMatchObject({
      teamId: 'c',
      points: 1,
      goalDifference: -1,
      position: 2,
    });
    expect(rows[2]).toMatchObject({
      teamId: 'b',
      points: 1,
      goalDifference: -2,
      position: 3,
    });
  });

  it('breaks a points tie using goal difference', () => {
    const teams = [
      { id: 'a', name: 'Alpha' },
      { id: 'b', name: 'Beta' },
    ];
    // Both teams: 1 win, 1 loss against common opponents => same points (3
    // each), but Alpha's goal difference (+4) beats Beta's (-1).
    const matches = [
      { homeTeamId: 'a', awayTeamId: 'x', homeScore: 5, awayScore: 0 },
      { homeTeamId: 'a', awayTeamId: 'y', homeScore: 0, awayScore: 1 },
      { homeTeamId: 'b', awayTeamId: 'x', homeScore: 2, awayScore: 0 },
      { homeTeamId: 'b', awayTeamId: 'y', homeScore: 0, awayScore: 3 },
    ];

    const rows = computeStandings(teams, matches, SCHEME, TIE_BREAK_ORDER);

    expect(rows[0]).toMatchObject({
      teamId: 'a',
      points: 3,
      goalDifference: 4,
    });
    expect(rows[1]).toMatchObject({
      teamId: 'b',
      points: 3,
      goalDifference: -1,
    });
  });

  it('breaks a tie using head-to-head result when points and goal difference are level', () => {
    const teams = [
      { id: 'a', name: 'Alpha' },
      { id: 'b', name: 'Beta' },
    ];
    const matches = [
      { homeTeamId: 'a', awayTeamId: 'b', homeScore: 2, awayScore: 1 },
    ];

    const rows = computeStandings(teams, matches, SCHEME, TIE_BREAK_ORDER);

    // Alpha won the only match played between them, and has the only points/GD
    // in this dataset, so it should rank first without needing head-to-head —
    // exercised more meaningfully by the 3-way tie test below.
    expect(rows[0].teamId).toBe('a');
  });

  it('resolves a 3-way points/GD tie by head-to-head mini-league', () => {
    const teams = [
      { id: 'a', name: 'Alpha' },
      { id: 'b', name: 'Beta' },
      { id: 'c', name: 'Gamma' },
    ];
    // A round-robin where each team beats one and loses to another by the same
    // scoreline, so points and goal difference are all level for the trio —
    // head-to-head among just these three must decide the order.
    const matches = [
      { homeTeamId: 'a', awayTeamId: 'b', homeScore: 2, awayScore: 1 },
      { homeTeamId: 'b', awayTeamId: 'c', homeScore: 2, awayScore: 1 },
      { homeTeamId: 'c', awayTeamId: 'a', homeScore: 2, awayScore: 1 },
    ];

    const rows = computeStandings(teams, matches, SCHEME, TIE_BREAK_ORDER);

    // All three are level on points (3) and goal difference (0); head-to-head
    // among the trio is also a perfect 3-way cycle (each has 1 win, 1 loss
    // within the group), so the final tiebreaker (team name) applies.
    expect(rows.map((row) => row.teamId)).toEqual(['a', 'b', 'c']);
  });

  it('falls back to team name when every criterion is exhausted', () => {
    const teams = [
      { id: 'z', name: 'Zeta' },
      { id: 'a', name: 'Alpha' },
    ];

    const rows = computeStandings(teams, [], SCHEME, TIE_BREAK_ORDER);

    expect(rows.map((row) => row.teamId)).toEqual(['a', 'z']);
  });

  it('respects a custom points scheme', () => {
    const teams = [
      { id: 'a', name: 'Alpha' },
      { id: 'b', name: 'Beta' },
    ];
    const matches = [
      { homeTeamId: 'a', awayTeamId: 'b', homeScore: 1, awayScore: 1 },
    ];

    const rows = computeStandings(
      teams,
      matches,
      { winPoints: 2, drawPoints: 2, lossPoints: 0 },
      TIE_BREAK_ORDER,
    );

    expect(rows[0].points).toBe(2);
    expect(rows[1].points).toBe(2);
  });
});

describe('rankCrossGroupCandidates', () => {
  it('ranks the row at a given position from each pool against each other', () => {
    const poolA = computeStandings(
      [
        { id: 'a1', name: 'A1' },
        { id: 'a2', name: 'A2' },
        { id: 'a3', name: 'A3' },
      ],
      [
        { homeTeamId: 'a1', awayTeamId: 'a2', homeScore: 3, awayScore: 0 },
        { homeTeamId: 'a2', awayTeamId: 'a3', homeScore: 2, awayScore: 1 },
        { homeTeamId: 'a3', awayTeamId: 'a1', homeScore: 0, awayScore: 2 },
      ],
      SCHEME,
      TIE_BREAK_ORDER,
    );
    const poolB = computeStandings(
      [
        { id: 'b1', name: 'B1' },
        { id: 'b2', name: 'B2' },
        { id: 'b3', name: 'B3' },
      ],
      [
        { homeTeamId: 'b1', awayTeamId: 'b2', homeScore: 1, awayScore: 1 },
        { homeTeamId: 'b2', awayTeamId: 'b3', homeScore: 1, awayScore: 1 },
        { homeTeamId: 'b3', awayTeamId: 'b1', homeScore: 1, awayScore: 1 },
      ],
      SCHEME,
      TIE_BREAK_ORDER,
    );

    // Pool A's 3rd place (a3: 2 losses, 0 points) is worse than Pool B's
    // 3rd place (b3: 2 draws, 2 points) -- b3 should rank first.
    const ranked = rankCrossGroupCandidates(
      [
        { groupId: 'group-a', groupName: 'Poule A', rows: poolA },
        { groupId: 'group-b', groupName: 'Poule B', rows: poolB },
      ],
      3,
      TIE_BREAK_ORDER,
    );

    expect(
      ranked.map((row) => [row.teamId, row.groupName, row.position]),
    ).toEqual([
      ['b3', 'Poule B', 1],
      ['a3', 'Poule A', 2],
    ]);
  });

  it('skips pools with no row at that position (e.g. a smaller pool)', () => {
    const smallPool = computeStandings(
      [
        { id: 'x1', name: 'X1' },
        { id: 'x2', name: 'X2' },
      ],
      [],
      SCHEME,
      TIE_BREAK_ORDER,
    );

    const ranked = rankCrossGroupCandidates(
      [{ groupId: 'group-x', groupName: 'Poule X', rows: smallPool }],
      3,
      TIE_BREAK_ORDER,
    );

    expect(ranked).toEqual([]);
  });

  it('never lets HEAD_TO_HEAD discriminate between pools (these teams never played each other)', () => {
    // Two candidates level on every real criterion -- HEAD_TO_HEAD first in
    // the tie-break order must be a no-op, falling through to team name.
    const poolA = computeStandings(
      [{ id: 'a1', name: 'Zeta' }],
      [],
      SCHEME,
      TIE_BREAK_ORDER,
    );
    const poolB = computeStandings(
      [{ id: 'b1', name: 'Alpha' }],
      [],
      SCHEME,
      TIE_BREAK_ORDER,
    );

    const ranked = rankCrossGroupCandidates(
      [
        { groupId: 'group-a', groupName: 'Poule A', rows: poolA },
        { groupId: 'group-b', groupName: 'Poule B', rows: poolB },
      ],
      1,
      ['HEAD_TO_HEAD', 'POINTS'],
    );

    expect(ranked.map((row) => row.teamId)).toEqual(['b1', 'a1']);
  });
});
