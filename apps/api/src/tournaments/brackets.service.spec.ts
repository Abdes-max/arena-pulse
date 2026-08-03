import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { BracketsService } from './brackets.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from './realtime.service';
import { StandingsService } from './standings.service';
import { TournamentsService } from './tournaments.service';

type PrismaMock = {
  knockoutBracket: { findUnique: jest.Mock };
  match: {
    count: jest.Mock;
    create: jest.Mock;
    createMany: jest.Mock;
    findMany: jest.Mock;
    update: jest.Mock;
  };
  qualificationRule: { findMany: jest.Mock };
  timeSlot: { findMany: jest.Mock; create: jest.Mock };
  field: { findMany: jest.Mock };
  $transaction: jest.Mock;
};

function createPrismaMock(): PrismaMock {
  return {
    knockoutBracket: { findUnique: jest.fn() },
    match: {
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn((args: { data: Record<string, unknown> }) => ({
        ...args.data,
        id: 'created-match',
        homeTeam: null,
        awayTeam: null,
        forfeitedTeam: null,
        timeSlot: null,
        officials: [],
        score: null,
      })),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn(),
    },
    qualificationRule: { findMany: jest.fn().mockResolvedValue([]) },
    // Only exercised when a round is reserved onto fields (generateMatches
    // with fieldIds, or tryAdvanceRound picking up such a reservation) --
    // no existing test does either, so an empty result is the correct default.
    timeSlot: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn() },
    field: { findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
  };
}

const TOURNAMENT_ID = 'tournament-1';

function bracketFixture(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'bracket-1',
    phaseId: 'phase-1',
    name: 'Champions League',
    size: 4,
    hasRankingMatch: false,
    phase: { category: { tournamentId: TOURNAMENT_ID } },
    ...overrides,
  };
}

function standingsFixture(teamIds: string[]) {
  return {
    rows: teamIds.map((teamId, index) => ({
      teamId,
      teamName: teamId,
      position: index + 1,
      played: 0,
      won: 0,
      drawn: 0,
      lost: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      goalDifference: 0,
      points: 0,
    })),
    isComplete: true,
  };
}

describe('BracketsService', () => {
  let prisma: PrismaMock;
  let tournamentsService: {
    assertTournamentIsEditable: jest.Mock;
    assertTournamentExists: jest.Mock;
  };
  let standingsService: { getStandings: jest.Mock };
  let service: BracketsService;

  beforeEach(() => {
    prisma = createPrismaMock();
    tournamentsService = {
      assertTournamentIsEditable: jest
        .fn()
        .mockResolvedValue({ id: TOURNAMENT_ID }),
      assertTournamentExists: jest
        .fn()
        .mockResolvedValue({ id: TOURNAMENT_ID }),
    };
    standingsService = { getStandings: jest.fn() };
    service = new BracketsService(
      prisma as unknown as PrismaService,
      tournamentsService as unknown as TournamentsService,
      standingsService as unknown as StandingsService,
      { emit: jest.fn() } as unknown as RealtimeService,
    );
  });

  describe('generateMatches', () => {
    it('rejects a bracket from another tournament', async () => {
      prisma.knockoutBracket.findUnique.mockResolvedValue(
        bracketFixture({ phase: { category: { tournamentId: 'other' } } }),
      );

      await expect(
        service.generateMatches('org-1', TOURNAMENT_ID, 'bracket-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects when matches already exist for this bracket', async () => {
      prisma.knockoutBracket.findUnique.mockResolvedValue(bracketFixture());
      prisma.match.count.mockResolvedValue(4);

      await expect(
        service.generateMatches('org-1', TOURNAMENT_ID, 'bracket-1'),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects a bracket size that is not a power of two', async () => {
      prisma.knockoutBracket.findUnique.mockResolvedValue(
        bracketFixture({ size: 6 }),
      );

      await expect(
        service.generateMatches('org-1', TOURNAMENT_ID, 'bracket-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects when the number of qualified teams does not match the bracket size', async () => {
      prisma.knockoutBracket.findUnique.mockResolvedValue(
        bracketFixture({ size: 4 }),
      );
      prisma.qualificationRule.findMany.mockResolvedValue([
        {
          groupId: 'group-a',
          fromPosition: 1,
          toPosition: 2,
          group: { name: 'Poule A' },
        },
      ]);
      standingsService.getStandings.mockResolvedValue(
        standingsFixture(['t1', 't2']),
      );

      await expect(
        service.generateMatches('org-1', TOURNAMENT_ID, 'bracket-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('seeds round 1 with the standard bracket pairing for a 4-team bracket, and creates round 2 as an undetermined placeholder', async () => {
      prisma.knockoutBracket.findUnique.mockResolvedValue(
        bracketFixture({ size: 4 }),
      );
      prisma.qualificationRule.findMany.mockResolvedValue([
        {
          groupId: 'group-a',
          fromPosition: 1,
          toPosition: 2,
          group: { name: 'Poule A' },
        },
        {
          groupId: 'group-b',
          fromPosition: 1,
          toPosition: 2,
          group: { name: 'Poule B' },
        },
      ]);
      standingsService.getStandings.mockImplementation(
        (_org: string, _tournament: string, groupId: string) =>
          Promise.resolve(
            standingsFixture(
              groupId === 'group-a' ? ['a1', 'a2'] : ['b1', 'b2'],
            ),
          ),
      );

      await service.generateMatches('org-1', TOURNAMENT_ID, 'bracket-1');

      // Seed order is [1,4,2,3]: seed1=a1, seed2=b1, seed3=a2, seed4=b2 (all
      // rank-1s first, then all rank-2s, alphabetical by group name within a
      // rank) => pairs (a1 v b2) and (b1 v a2).
      expect(prisma.match.create).toHaveBeenCalledWith({
        data: {
          knockoutBracketId: 'bracket-1',
          round: 1,
          bracketSlot: 0,
          isThirdPlaceMatch: false,
          homeTeamId: 'a1',
          awayTeamId: 'b2',
        },
        include: expect.anything() as unknown,
      });
      expect(prisma.match.create).toHaveBeenCalledWith({
        data: {
          knockoutBracketId: 'bracket-1',
          round: 1,
          bracketSlot: 1,
          isThirdPlaceMatch: false,
          homeTeamId: 'b1',
          awayTeamId: 'a2',
        },
        include: expect.anything() as unknown,
      });
      // The final (round 2) is created up front too, but with no opponents
      // yet -- that's the whole point: the organizer can see/schedule the
      // full bracket immediately, not just round 1.
      expect(prisma.match.create).toHaveBeenCalledWith({
        data: {
          knockoutBracketId: 'bracket-1',
          round: 2,
          bracketSlot: 0,
          isThirdPlaceMatch: false,
          homeTeamId: null,
          awayTeamId: null,
        },
        include: expect.anything() as unknown,
      });
      expect(prisma.match.create).toHaveBeenCalledTimes(3);
    });
  });

  describe('tryAdvanceRound', () => {
    it('does nothing when the round is already the final', async () => {
      prisma.knockoutBracket.findUnique.mockResolvedValue({
        size: 2,
        hasRankingMatch: false,
      });

      await service.tryAdvanceRound('bracket-1', 1);

      expect(prisma.match.findMany).not.toHaveBeenCalled();
    });

    it('does nothing when the round is not fully decided', async () => {
      prisma.knockoutBracket.findUnique.mockResolvedValue({
        size: 4,
        hasRankingMatch: false,
      });
      prisma.match.findMany.mockResolvedValue([
        {
          homeTeamId: 'a',
          awayTeamId: 'b',
          forfeitedTeamId: null,
          status: 'COMPLETED',
          score: {
            homeScore: 1,
            awayScore: 0,
            homePenaltyScore: null,
            awayPenaltyScore: null,
            isValidated: true,
          },
        },
        {
          homeTeamId: 'c',
          awayTeamId: 'd',
          forfeitedTeamId: null,
          status: 'SCHEDULED',
          score: null,
        },
      ]);

      await service.tryAdvanceRound('bracket-1', 1);

      expect(prisma.match.update).not.toHaveBeenCalled();
    });

    it('does nothing when the next round is already decided (idempotent)', async () => {
      prisma.knockoutBracket.findUnique.mockResolvedValue({
        size: 4,
        hasRankingMatch: false,
      });
      // Round 1 (the query filtered to isThirdPlaceMatch: false) is fully
      // decided; round 2's placeholder was already filled in by a previous
      // call -- both teams are non-null, so this must be a no-op.
      prisma.match.findMany.mockImplementation(
        (args: { where: { round: number; isThirdPlaceMatch?: boolean } }) =>
          Promise.resolve(
            args.where.isThirdPlaceMatch === false
              ? [
                  {
                    homeTeamId: 'a',
                    awayTeamId: 'b',
                    forfeitedTeamId: null,
                    status: 'COMPLETED',
                    score: {
                      homeScore: 1,
                      awayScore: 0,
                      homePenaltyScore: null,
                      awayPenaltyScore: null,
                      isValidated: true,
                    },
                  },
                  {
                    homeTeamId: 'c',
                    awayTeamId: 'd',
                    forfeitedTeamId: null,
                    status: 'COMPLETED',
                    score: {
                      homeScore: 2,
                      awayScore: 1,
                      homePenaltyScore: null,
                      awayPenaltyScore: null,
                      isValidated: true,
                    },
                  },
                ]
              : [
                  {
                    id: 'final-match',
                    bracketSlot: 0,
                    isThirdPlaceMatch: false,
                    homeTeamId: 'a',
                    awayTeamId: 'c',
                  },
                ],
          ),
      );

      await service.tryAdvanceRound('bracket-1', 1);

      expect(prisma.match.update).not.toHaveBeenCalled();
    });

    it('fills in the final once both semifinal-round matches are decided', async () => {
      prisma.knockoutBracket.findUnique.mockResolvedValue({
        size: 4,
        hasRankingMatch: false,
        phase: { category: { tournamentId: TOURNAMENT_ID } },
      });
      prisma.match.findMany.mockImplementation(
        (args: { where: { round: number; isThirdPlaceMatch?: boolean } }) =>
          Promise.resolve(
            args.where.isThirdPlaceMatch === false
              ? [
                  {
                    homeTeamId: 'a',
                    awayTeamId: 'b',
                    forfeitedTeamId: null,
                    status: 'COMPLETED',
                    score: {
                      homeScore: 1,
                      awayScore: 0,
                      homePenaltyScore: null,
                      awayPenaltyScore: null,
                      isValidated: true,
                    },
                  },
                  {
                    homeTeamId: 'c',
                    awayTeamId: 'd',
                    forfeitedTeamId: null,
                    status: 'COMPLETED',
                    score: {
                      homeScore: 2,
                      awayScore: 1,
                      homePenaltyScore: null,
                      awayPenaltyScore: null,
                      isValidated: true,
                    },
                  },
                ]
              : // Created up front by generateMatches, still undetermined.
                [
                  {
                    id: 'final-match',
                    bracketSlot: 0,
                    isThirdPlaceMatch: false,
                    homeTeamId: null,
                    awayTeamId: null,
                  },
                ],
          ),
      );

      await service.tryAdvanceRound('bracket-1', 1);

      expect(prisma.match.update).toHaveBeenCalledWith({
        where: { id: 'final-match' },
        data: { homeTeamId: 'a', awayTeamId: 'c' },
      });
      expect(prisma.match.update).toHaveBeenCalledTimes(1);
    });

    it('also fills in the 3rd-place match when the bracket has a ranking match', async () => {
      prisma.knockoutBracket.findUnique.mockResolvedValue({
        size: 4,
        hasRankingMatch: true,
        phase: { category: { tournamentId: TOURNAMENT_ID } },
      });
      prisma.match.findMany.mockImplementation(
        (args: { where: { round: number; isThirdPlaceMatch?: boolean } }) =>
          Promise.resolve(
            args.where.isThirdPlaceMatch === false
              ? [
                  {
                    homeTeamId: 'a',
                    awayTeamId: 'b',
                    forfeitedTeamId: null,
                    status: 'COMPLETED',
                    score: {
                      homeScore: 1,
                      awayScore: 0,
                      homePenaltyScore: null,
                      awayPenaltyScore: null,
                      isValidated: true,
                    },
                  },
                  {
                    homeTeamId: 'c',
                    awayTeamId: 'd',
                    forfeitedTeamId: null,
                    status: 'COMPLETED',
                    score: {
                      homeScore: 2,
                      awayScore: 1,
                      homePenaltyScore: null,
                      awayPenaltyScore: null,
                      isValidated: true,
                    },
                  },
                ]
              : [
                  {
                    id: 'final-match',
                    bracketSlot: 0,
                    isThirdPlaceMatch: false,
                    homeTeamId: null,
                    awayTeamId: null,
                  },
                  {
                    id: 'third-place-match',
                    bracketSlot: 0,
                    isThirdPlaceMatch: true,
                    homeTeamId: null,
                    awayTeamId: null,
                  },
                ],
          ),
      );

      await service.tryAdvanceRound('bracket-1', 1);

      expect(prisma.match.update).toHaveBeenCalledWith({
        where: { id: 'final-match' },
        data: { homeTeamId: 'a', awayTeamId: 'c' },
      });
      expect(prisma.match.update).toHaveBeenCalledWith({
        where: { id: 'third-place-match' },
        data: { homeTeamId: 'b', awayTeamId: 'd' },
      });
      expect(prisma.match.update).toHaveBeenCalledTimes(2);
    });

    it('treats the non-forfeiting team as the winner of a forfeited match', async () => {
      prisma.knockoutBracket.findUnique.mockResolvedValue({
        size: 4,
        hasRankingMatch: false,
        phase: { category: { tournamentId: TOURNAMENT_ID } },
      });
      prisma.match.findMany.mockImplementation(
        (args: { where: { round: number; isThirdPlaceMatch?: boolean } }) =>
          Promise.resolve(
            args.where.isThirdPlaceMatch === false
              ? [
                  {
                    homeTeamId: 'a',
                    awayTeamId: 'b',
                    forfeitedTeamId: 'a',
                    status: 'FORFEITED',
                    score: null,
                  },
                  {
                    homeTeamId: 'c',
                    awayTeamId: 'd',
                    forfeitedTeamId: null,
                    status: 'COMPLETED',
                    score: {
                      homeScore: 2,
                      awayScore: 1,
                      homePenaltyScore: null,
                      awayPenaltyScore: null,
                      isValidated: true,
                    },
                  },
                ]
              : [
                  {
                    id: 'final-match',
                    bracketSlot: 0,
                    isThirdPlaceMatch: false,
                    homeTeamId: null,
                    awayTeamId: null,
                  },
                ],
          ),
      );

      await service.tryAdvanceRound('bracket-1', 1);

      expect(prisma.match.update).toHaveBeenCalledWith({
        where: { id: 'final-match' },
        data: { homeTeamId: 'b', awayTeamId: 'c' },
      });
    });
  });
});
