export interface RoundRobinFixture {
  round: number;
  homeTeamId: string;
  awayTeamId: string;
}

/**
 * Classic "circle method" single round-robin: n teams produce n-1 rounds
 * (n rounds with one bye per round if n is odd), each team facing every
 * other exactly once.
 */
export function generateRoundRobinFixtures(
  teamIds: string[],
): RoundRobinFixture[] {
  if (teamIds.length < 2) {
    return [];
  }

  const BYE = null;
  const slots: (string | null)[] = [...teamIds];
  if (slots.length % 2 !== 0) {
    slots.push(BYE);
  }

  const roundCount = slots.length - 1;
  const fixtures: RoundRobinFixture[] = [];

  for (let round = 0; round < roundCount; round++) {
    for (let i = 0; i < slots.length / 2; i++) {
      const home = slots[i];
      const away = slots[slots.length - 1 - i];
      if (home !== BYE && away !== BYE) {
        fixtures.push({ round: round + 1, homeTeamId: home, awayTeamId: away });
      }
    }
    const last = slots.pop()!;
    slots.splice(1, 0, last);
  }

  return fixtures;
}
