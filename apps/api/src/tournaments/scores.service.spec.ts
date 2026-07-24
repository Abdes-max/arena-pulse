import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ScoresService } from './scores.service';
import { TournamentsService } from './tournaments.service';

type PrismaMock = {
  match: {
    findUnique: jest.Mock;
    findUniqueOrThrow: jest.Mock;
    update: jest.Mock;
  };
  matchScore: {
    upsert: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
    deleteMany: jest.Mock;
  };
  $transaction: jest.Mock;
};

function createPrismaMock(): PrismaMock {
  return {
    match: {
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      update: jest.fn(),
    },
    matchScore: {
      upsert: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
    },
    $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
  };
}

const TOURNAMENT_ID = 'tournament-1';
const USER_ID = 'user-1';

function baseMatch(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'match-1',
    groupId: 'group-1',
    homeTeamId: 'team-home',
    awayTeamId: 'team-away',
    status: 'SCHEDULED',
    score: null,
    homeTeam: null,
    awayTeam: null,
    forfeitedTeam: null,
    timeSlot: null,
    officials: [],
    group: {
      phase: { category: { tournamentId: TOURNAMENT_ID } },
      standingRule: null,
    },
    ...overrides,
  };
}

describe('ScoresService', () => {
  let prisma: PrismaMock;
  let tournamentsService: { assertTournamentIsEditable: jest.Mock };
  let service: ScoresService;

  beforeEach(() => {
    prisma = createPrismaMock();
    tournamentsService = {
      assertTournamentIsEditable: jest
        .fn()
        .mockResolvedValue({ id: TOURNAMENT_ID }),
    };
    service = new ScoresService(
      prisma as unknown as PrismaService,
      tournamentsService as unknown as TournamentsService,
    );
  });

  describe('upsertScore', () => {
    it('rejects when the tournament is archived', async () => {
      tournamentsService.assertTournamentIsEditable.mockRejectedValue(
        new Error('archived'),
      );

      await expect(
        service.upsertScore(
          'org-1',
          TOURNAMENT_ID,
          'match-1',
          { homeScore: 1, awayScore: 0 },
          USER_ID,
        ),
      ).rejects.toThrow('archived');
    });

    it('rejects a match belonging to another tournament', async () => {
      prisma.match.findUnique.mockResolvedValue(
        baseMatch({
          group: {
            phase: { category: { tournamentId: 'other' } },
            standingRule: null,
          },
        }),
      );

      await expect(
        service.upsertScore(
          'org-1',
          TOURNAMENT_ID,
          'match-1',
          { homeScore: 1, awayScore: 0 },
          USER_ID,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects scoring a match declared forfeit', async () => {
      prisma.match.findUnique.mockResolvedValue(
        baseMatch({ status: 'FORFEITED' }),
      );

      await expect(
        service.upsertScore(
          'org-1',
          TOURNAMENT_ID,
          'match-1',
          { homeScore: 1, awayScore: 0 },
          USER_ID,
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects penalty scores provided for a non-draw', async () => {
      prisma.match.findUnique.mockResolvedValue(baseMatch());

      await expect(
        service.upsertScore(
          'org-1',
          TOURNAMENT_ID,
          'match-1',
          {
            homeScore: 2,
            awayScore: 1,
            homePenaltyScore: 4,
            awayPenaltyScore: 3,
          },
          USER_ID,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a lone penalty score without its counterpart', async () => {
      prisma.match.findUnique.mockResolvedValue(baseMatch());

      await expect(
        service.upsertScore(
          'org-1',
          TOURNAMENT_ID,
          'match-1',
          { homeScore: 1, awayScore: 1, homePenaltyScore: 4 },
          USER_ID,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('saves a provisional score and puts the match live', async () => {
      prisma.match.findUnique.mockResolvedValue(baseMatch());
      prisma.match.update.mockResolvedValue(baseMatch({ status: 'LIVE' }));

      await service.upsertScore(
        'org-1',
        TOURNAMENT_ID,
        'match-1',
        { homeScore: 2, awayScore: 1 },
        USER_ID,
      );

      expect(prisma.matchScore.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { matchId: 'match-1' },
          update: {
            homeScore: 2,
            awayScore: 1,
            homePenaltyScore: null,
            awayPenaltyScore: null,
            isValidated: false,
            validatedAt: null,
            validatedById: null,
            recordedById: USER_ID,
          },
        }),
      );
      expect(prisma.match.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'LIVE' } }),
      );
    });
  });

  describe('validateScore', () => {
    it('rejects when no score has been entered', async () => {
      prisma.match.findUnique.mockResolvedValue(baseMatch());

      await expect(
        service.validateScore('org-1', TOURNAMENT_ID, 'match-1', USER_ID),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('requires a penalty shootout for a draw when the group enables it', async () => {
      prisma.match.findUnique.mockResolvedValue(
        baseMatch({
          score: {
            homeScore: 1,
            awayScore: 1,
            homePenaltyScore: null,
            awayPenaltyScore: null,
          },
          group: {
            phase: { category: { tournamentId: TOURNAMENT_ID } },
            standingRule: { penaltyShootoutEnabled: true },
          },
        }),
      );

      await expect(
        service.validateScore('org-1', TOURNAMENT_ID, 'match-1', USER_ID),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a penalty shootout with no winner', async () => {
      prisma.match.findUnique.mockResolvedValue(
        baseMatch({
          score: {
            homeScore: 1,
            awayScore: 1,
            homePenaltyScore: 4,
            awayPenaltyScore: 4,
          },
        }),
      );

      await expect(
        service.validateScore('org-1', TOURNAMENT_ID, 'match-1', USER_ID),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('validates a regular-time score and completes the match', async () => {
      prisma.match.findUnique.mockResolvedValue(
        baseMatch({
          score: {
            homeScore: 2,
            awayScore: 1,
            homePenaltyScore: null,
            awayPenaltyScore: null,
          },
        }),
      );
      prisma.match.update.mockResolvedValue(baseMatch({ status: 'COMPLETED' }));

      await service.validateScore('org-1', TOURNAMENT_ID, 'match-1', USER_ID);

      expect(prisma.matchScore.update).toHaveBeenCalledWith({
        where: { matchId: 'match-1' },
        data: {
          isValidated: true,
          validatedAt: expect.any(Date) as Date,
          validatedById: USER_ID,
        },
      });
      expect(prisma.match.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'COMPLETED' } }),
      );
    });
  });

  describe('clearScore', () => {
    it('rejects when there is no score to clear', async () => {
      prisma.match.findUnique.mockResolvedValue(baseMatch());

      await expect(
        service.clearScore('org-1', TOURNAMENT_ID, 'match-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('deletes the score and reverts the match to scheduled', async () => {
      prisma.match.findUnique.mockResolvedValue(
        baseMatch({ score: { homeScore: 1, awayScore: 0 } }),
      );
      prisma.match.update.mockResolvedValue(baseMatch({ status: 'SCHEDULED' }));

      await service.clearScore('org-1', TOURNAMENT_ID, 'match-1');

      expect(prisma.matchScore.delete).toHaveBeenCalledWith({
        where: { matchId: 'match-1' },
      });
      expect(prisma.match.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'SCHEDULED' } }),
      );
    });
  });

  describe('declareForfeit', () => {
    it('rejects a team that is not part of the match', async () => {
      prisma.match.findUnique.mockResolvedValue(baseMatch());

      await expect(
        service.declareForfeit('org-1', TOURNAMENT_ID, 'match-1', {
          teamId: 'team-third',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('marks the match forfeited and clears any existing score', async () => {
      prisma.match.findUnique.mockResolvedValue(baseMatch());
      prisma.match.findUniqueOrThrow.mockResolvedValue(
        baseMatch({ status: 'FORFEITED', forfeitedTeamId: 'team-away' }),
      );

      await service.declareForfeit('org-1', TOURNAMENT_ID, 'match-1', {
        teamId: 'team-away',
      });

      expect(prisma.matchScore.deleteMany).toHaveBeenCalledWith({
        where: { matchId: 'match-1' },
      });
      expect(prisma.match.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: 'FORFEITED', forfeitedTeamId: 'team-away' },
        }),
      );
    });
  });

  describe('undoForfeit', () => {
    it('rejects a match that is not forfeited', async () => {
      prisma.match.findUnique.mockResolvedValue(
        baseMatch({ status: 'SCHEDULED' }),
      );

      await expect(
        service.undoForfeit('org-1', TOURNAMENT_ID, 'match-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('reverts a forfeited match back to scheduled', async () => {
      prisma.match.findUnique.mockResolvedValue(
        baseMatch({ status: 'FORFEITED' }),
      );
      prisma.match.update.mockResolvedValue(baseMatch({ status: 'SCHEDULED' }));

      await service.undoForfeit('org-1', TOURNAMENT_ID, 'match-1');

      expect(prisma.match.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: 'SCHEDULED', forfeitedTeamId: null },
        }),
      );
    });
  });
});
