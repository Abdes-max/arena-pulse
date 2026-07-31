import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { BracketsService } from './brackets.service';
import { PrismaService } from '../prisma/prisma.service';
import { StandingsService } from './standings.service';
import { TournamentsService } from './tournaments.service';

type PrismaMock = {
  knockoutBracket: { findUnique: jest.Mock };
  match: {
    count: jest.Mock;
    create: jest.Mock;
    createMany: jest.Mock;
    findMany: jest.Mock;
  };
  qualificationRule: { findMany: jest.Mock };
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
    },
    qualificationRule: { findMany: jest.fn().mockResolvedValue([]) },
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

    it('seeds round 1 with the standard bracket pairing for a 4-team bracket', async () => {
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
          homeTeamId: 'b1',
          awayTeamId: 'a2',
        },
        include: expect.anything() as unknown,
      });
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

      expect(prisma.match.createMany).not.toHaveBeenCalled();
    });

    it('does nothing when the next round already exists (idempotent)', async () => {
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
          status: 'COMPLETED',
          score: {
            homeScore: 2,
            awayScore: 1,
            homePenaltyScore: null,
            awayPenaltyScore: null,
            isValidated: true,
          },
        },
      ]);
      prisma.match.count.mockResolvedValue(1);

      await service.tryAdvanceRound('bracket-1', 1);

      expect(prisma.match.createMany).not.toHaveBeenCalled();
    });

    it('creates the final once both semifinal-round matches are decided', async () => {
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
          status: 'COMPLETED',
          score: {
            homeScore: 2,
            awayScore: 1,
            homePenaltyScore: null,
            awayPenaltyScore: null,
            isValidated: true,
          },
        },
      ]);
      prisma.match.count.mockResolvedValue(0);

      await service.tryAdvanceRound('bracket-1', 1);

      expect(prisma.match.createMany).toHaveBeenCalledWith({
        data: [
          {
            knockoutBracketId: 'bracket-1',
            round: 2,
            bracketSlot: 0,
            isThirdPlaceMatch: false,
            homeTeamId: 'a',
            awayTeamId: 'c',
          },
        ],
      });
    });

    it('also creates the 3rd-place match when the bracket has a ranking match', async () => {
      prisma.knockoutBracket.findUnique.mockResolvedValue({
        size: 4,
        hasRankingMatch: true,
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
          status: 'COMPLETED',
          score: {
            homeScore: 2,
            awayScore: 1,
            homePenaltyScore: null,
            awayPenaltyScore: null,
            isValidated: true,
          },
        },
      ]);
      prisma.match.count.mockResolvedValue(0);

      await service.tryAdvanceRound('bracket-1', 1);

      expect(prisma.match.createMany).toHaveBeenCalledWith({
        data: [
          {
            knockoutBracketId: 'bracket-1',
            round: 2,
            bracketSlot: 0,
            isThirdPlaceMatch: false,
            homeTeamId: 'a',
            awayTeamId: 'c',
          },
          {
            knockoutBracketId: 'bracket-1',
            round: 2,
            bracketSlot: 0,
            isThirdPlaceMatch: true,
            homeTeamId: 'b',
            awayTeamId: 'd',
          },
        ],
      });
    });

    it('treats the non-forfeiting team as the winner of a forfeited match', async () => {
      prisma.knockoutBracket.findUnique.mockResolvedValue({
        size: 2,
        hasRankingMatch: false,
      });
      // size 2 => totalRounds = 1, so round 1 IS the final; use size 4 instead
      // to actually exercise advancement with a forfeit involved.
      prisma.knockoutBracket.findUnique.mockResolvedValue({
        size: 4,
        hasRankingMatch: false,
      });
      prisma.match.findMany.mockResolvedValue([
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
      ]);
      prisma.match.count.mockResolvedValue(0);

      await service.tryAdvanceRound('bracket-1', 1);

      expect(prisma.match.createMany).toHaveBeenCalledWith({
        data: [
          {
            knockoutBracketId: 'bracket-1',
            round: 2,
            bracketSlot: 0,
            isThirdPlaceMatch: false,
            homeTeamId: 'b',
            awayTeamId: 'c',
          },
        ],
      });
    });
  });
});
