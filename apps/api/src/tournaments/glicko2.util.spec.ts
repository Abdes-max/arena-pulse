import { updateGlicko2 } from './glicko2.util';

describe('updateGlicko2', () => {
  it("matches Glickman's published worked example", () => {
    // "Example of the Glicko-2 system" (Mark Glickman): a player rated
    // 1500/RD 200/volatility 0.06 plays three opponents in one period and
    // wins against the first, loses to the other two.
    const player = { rating: 1500, ratingDeviation: 200, volatility: 0.06 };
    const results = [
      {
        opponent: { rating: 1400, ratingDeviation: 30, volatility: 0.06 },
        score: 1 as const,
      },
      {
        opponent: { rating: 1550, ratingDeviation: 100, volatility: 0.06 },
        score: 0 as const,
      },
      {
        opponent: { rating: 1700, ratingDeviation: 300, volatility: 0.06 },
        score: 0 as const,
      },
    ];

    const updated = updateGlicko2(player, results);

    expect(updated.rating).toBeCloseTo(1464.06, 1);
    expect(updated.ratingDeviation).toBeCloseTo(151.52, 1);
    expect(updated.volatility).toBeCloseTo(0.05999, 4);
  });

  it('inflates RD but leaves rating and volatility unchanged with no games played', () => {
    const player = { rating: 1500, ratingDeviation: 200, volatility: 0.06 };

    const updated = updateGlicko2(player, []);

    expect(updated.rating).toBe(1500);
    expect(updated.volatility).toBe(0.06);
    expect(updated.ratingDeviation).toBeGreaterThan(200);
  });

  it("increases the winner's rating and decreases the loser's symmetrically from the same pre-match snapshot", () => {
    const teamA = { rating: 1500, ratingDeviation: 100, volatility: 0.06 };
    const teamB = { rating: 1500, ratingDeviation: 100, volatility: 0.06 };

    const updatedA = updateGlicko2(teamA, [{ opponent: teamB, score: 1 }]);
    const updatedB = updateGlicko2(teamB, [{ opponent: teamA, score: 0 }]);

    expect(updatedA.rating).toBeGreaterThan(teamA.rating);
    expect(updatedB.rating).toBeLessThan(teamB.rating);
  });

  it('leaves both ratings unchanged on a draw between equally-rated teams', () => {
    const teamA = { rating: 1500, ratingDeviation: 100, volatility: 0.06 };
    const teamB = { rating: 1500, ratingDeviation: 100, volatility: 0.06 };

    const updatedA = updateGlicko2(teamA, [{ opponent: teamB, score: 0.5 }]);

    expect(updatedA.rating).toBeCloseTo(1500, 6);
  });
});
