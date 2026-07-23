import { generateRoundRobinFixtures } from './round-robin.util';

describe('generateRoundRobinFixtures', () => {
  it('returns no fixtures for fewer than 2 teams', () => {
    expect(generateRoundRobinFixtures([])).toEqual([]);
    expect(generateRoundRobinFixtures(['a'])).toEqual([]);
  });

  it('produces n-1 rounds and n*(n-1)/2 matches for an even number of teams', () => {
    const fixtures = generateRoundRobinFixtures(['a', 'b', 'c', 'd']);

    expect(fixtures).toHaveLength(6);
    expect(new Set(fixtures.map((f) => f.round))).toEqual(new Set([1, 2, 3]));
  });

  it('has each team playing every other team exactly once', () => {
    const teams = ['a', 'b', 'c', 'd'];
    const fixtures = generateRoundRobinFixtures(teams);

    const pairsSeen = new Set<string>();
    for (const { homeTeamId, awayTeamId } of fixtures) {
      const key = [homeTeamId, awayTeamId].sort().join('-');
      expect(pairsSeen.has(key)).toBe(false);
      pairsSeen.add(key);
    }
    expect(pairsSeen.size).toBe((teams.length * (teams.length - 1)) / 2);
  });

  it('gives each team exactly one match per round (no team plays itself or twice)', () => {
    const fixtures = generateRoundRobinFixtures(['a', 'b', 'c', 'd']);
    const byRound = new Map<number, string[]>();
    for (const { round, homeTeamId, awayTeamId } of fixtures) {
      const teamsInRound = byRound.get(round) ?? [];
      teamsInRound.push(homeTeamId, awayTeamId);
      byRound.set(round, teamsInRound);
    }
    for (const teamsInRound of byRound.values()) {
      expect(new Set(teamsInRound).size).toBe(teamsInRound.length);
    }
  });

  it('handles an odd number of teams with one bye per round', () => {
    const fixtures = generateRoundRobinFixtures(['a', 'b', 'c']);

    // 3 teams -> padded to 4 slots -> 3 rounds, but one match per round is a bye (skipped)
    expect(fixtures).toHaveLength(3);
    expect(new Set(fixtures.map((f) => f.round))).toEqual(new Set([1, 2, 3]));

    const pairsSeen = new Set<string>();
    for (const { homeTeamId, awayTeamId } of fixtures) {
      pairsSeen.add([homeTeamId, awayTeamId].sort().join('-'));
    }
    expect(pairsSeen.size).toBe(3);
  });
});
