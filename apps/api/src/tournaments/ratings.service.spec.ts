import { PrismaService } from '../prisma/prisma.service';
import {
  DEFAULT_RATING,
  DEFAULT_RATING_DEVIATION,
  DEFAULT_VOLATILITY,
} from './glicko2.util';
import { MatchForRating, RatingsService } from './ratings.service';

type PrismaMock = {
  teamRating: {
    upsert: jest.Mock;
    update: jest.Mock;
    findMany: jest.Mock;
  };
};

function createPrismaMock(): PrismaMock {
  return {
    teamRating: {
      upsert: jest.fn(),
      update: jest.fn().mockResolvedValue(undefined),
      findMany: jest.fn().mockResolvedValue([]),
    },
  };
}

interface RatingRowOverrides {
  teamName?: string;
  rating?: number;
  ratingDeviation?: number;
  matchesPlayed?: number;
}

function ratingRow(overrides: RatingRowOverrides = {}) {
  return {
    id: `rating-${overrides.teamName ?? 'x'}`,
    organizationId: 'org-1',
    teamName: 'Team',
    rating: DEFAULT_RATING,
    ratingDeviation: DEFAULT_RATING_DEVIATION,
    volatility: DEFAULT_VOLATILITY,
    matchesPlayed: 0,
    ...overrides,
  };
}

function matchFixture(overrides: Partial<MatchForRating> = {}): MatchForRating {
  return {
    homeTeamId: 'home-team',
    awayTeamId: 'away-team',
    forfeitedTeamId: null,
    status: 'COMPLETED',
    score: {
      homeScore: 2,
      awayScore: 1,
      homePenaltyScore: null,
      awayPenaltyScore: null,
      isValidated: true,
    },
    homeTeam: { id: 'home-team', name: 'Alpha' },
    awayTeam: { id: 'away-team', name: 'Beta' },
    ...overrides,
  };
}

describe('RatingsService', () => {
  let prisma: PrismaMock;
  let service: RatingsService;

  beforeEach(() => {
    prisma = createPrismaMock();
    service = new RatingsService(prisma as unknown as PrismaService);
  });

  function mockUpsertReturningDefaults(rating = DEFAULT_RATING): void {
    prisma.teamRating.upsert.mockImplementation(
      ({
        where,
      }: {
        where: { organizationId_teamName: { teamName: string } };
      }) =>
        Promise.resolve(
          ratingRow({
            teamName: where.organizationId_teamName.teamName,
            rating,
          }),
        ),
    );
  }

  it('increases the winner rating and decreases the loser rating symmetrically', async () => {
    mockUpsertReturningDefaults();

    await service.recordMatchResult('org-1', matchFixture());

    expect(prisma.teamRating.update).toHaveBeenCalledTimes(2);
    const [homeCall, awayCall] = prisma.teamRating.update.mock.calls as {
      0: { data: { rating: number; matchesPlayed: unknown } };
    }[];
    expect(homeCall[0].data.rating).toBeGreaterThan(DEFAULT_RATING);
    expect(awayCall[0].data.rating).toBeLessThan(DEFAULT_RATING);
    expect(homeCall[0].data.matchesPlayed).toEqual({ increment: 1 });
  });

  it('applies an equal 0.5/0.5 score on a genuine draw (no penalty shootout)', async () => {
    mockUpsertReturningDefaults();

    await service.recordMatchResult(
      'org-1',
      matchFixture({
        score: {
          homeScore: 1,
          awayScore: 1,
          homePenaltyScore: null,
          awayPenaltyScore: null,
          isValidated: true,
        },
      }),
    );

    const [homeCall] = prisma.teamRating.update.mock.calls as {
      0: { data: { rating: number } };
    }[];
    expect(homeCall[0].data.rating).toBeCloseTo(DEFAULT_RATING, 6);
  });

  it('resolves the winner from a forfeit rather than the (absent) score', async () => {
    mockUpsertReturningDefaults();

    await service.recordMatchResult(
      'org-1',
      matchFixture({
        status: 'FORFEITED',
        forfeitedTeamId: 'away-team',
        score: null,
      }),
    );

    const [homeCall, awayCall] = prisma.teamRating.update.mock.calls as {
      0: { data: { rating: number } };
    }[];
    expect(homeCall[0].data.rating).toBeGreaterThan(DEFAULT_RATING);
    expect(awayCall[0].data.rating).toBeLessThan(DEFAULT_RATING);
  });

  it('is a no-op when either team is not yet known (placeholder match)', async () => {
    await service.recordMatchResult('org-1', matchFixture({ awayTeam: null }));

    expect(prisma.teamRating.upsert).not.toHaveBeenCalled();
    expect(prisma.teamRating.update).not.toHaveBeenCalled();
  });

  it('finds-or-creates a rating row keyed by organization + exact team name', async () => {
    mockUpsertReturningDefaults();

    await service.recordMatchResult('org-1', matchFixture());

    expect(prisma.teamRating.upsert).toHaveBeenCalledWith({
      where: {
        organizationId_teamName: { organizationId: 'org-1', teamName: 'Alpha' },
      },
      update: {},
      create: {
        organizationId: 'org-1',
        teamName: 'Alpha',
        rating: DEFAULT_RATING,
        ratingDeviation: DEFAULT_RATING_DEVIATION,
        volatility: DEFAULT_VOLATILITY,
      },
    });
  });

  describe('getRatingsForTeamNames', () => {
    it('returns defaults for names with no existing row', async () => {
      prisma.teamRating.findMany.mockResolvedValue([]);

      const result = await service.getRatingsForTeamNames('org-1', ['Gamma']);

      expect(result.get('Gamma')).toEqual({
        rating: DEFAULT_RATING,
        ratingDeviation: DEFAULT_RATING_DEVIATION,
        matchesPlayed: 0,
      });
    });

    it('returns the stored values for a matched team name', async () => {
      prisma.teamRating.findMany.mockResolvedValue([
        ratingRow({
          teamName: 'Alpha',
          rating: 1600,
          ratingDeviation: 120,
          matchesPlayed: 5,
        }),
      ]);

      const result = await service.getRatingsForTeamNames('org-1', ['Alpha']);

      expect(result.get('Alpha')).toEqual({
        rating: 1600,
        ratingDeviation: 120,
        matchesPlayed: 5,
      });
    });
  });
});
