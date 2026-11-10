import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BracketsService } from './brackets.service';
import { RatingsService } from './ratings.service';
import { RealtimeService } from './realtime.service';
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
// A phase of a goals sport (football): no sets, nothing changes.
const GOALS_PHASE = {
  setsToWin: null,
  category: {
    tournamentId: TOURNAMENT_ID,
    tournament: { sport: { scoreFormat: 'GOALS', defaultSetsToWin: null } },
  },
};

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
    knockoutBracketId: null,
    knockoutBracket: null,
    group: {
      phase: GOALS_PHASE,
      standingRule: null,
    },
    ...overrides,
  };
}

describe('ScoresService', () => {
  let prisma: PrismaMock;
  let tournamentsService: { assertTournamentIsEditable: jest.Mock };
  let bracketsService: {
    tryAdvanceRound: jest.Mock;
    tryResolveFirstRound: jest.Mock;
  };
  let ratingsService: { recordMatchResult: jest.Mock };
  let realtimeService: { emit: jest.Mock };
  let service: ScoresService;

  beforeEach(() => {
    prisma = createPrismaMock();
    tournamentsService = {
      assertTournamentIsEditable: jest
        .fn()
        .mockResolvedValue({ id: TOURNAMENT_ID }),
    };
    bracketsService = {
      tryAdvanceRound: jest.fn(),
      tryResolveFirstRound: jest.fn(),
    };
    ratingsService = { recordMatchResult: jest.fn() };
    realtimeService = { emit: jest.fn() };
    service = new ScoresService(
      prisma as unknown as PrismaService,
      tournamentsService as unknown as TournamentsService,
      bracketsService as unknown as BracketsService,
      ratingsService as unknown as RatingsService,
      realtimeService as unknown as RealtimeService,
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
            phase: GOALS_PHASE,
            standingRule: { penaltyShootoutEnabled: true },
          },
        }),
      );

      await expect(
        service.validateScore('org-1', TOURNAMENT_ID, 'match-1', USER_ID),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('requires a penalty shootout for a knockout draw regardless of any group standing rule', async () => {
      prisma.match.findUnique.mockResolvedValue(
        baseMatch({
          groupId: null,
          group: null,
          knockoutBracketId: 'bracket-1',
          knockoutBracket: {
            phase: GOALS_PHASE,
          },
          score: {
            homeScore: 1,
            awayScore: 1,
            homePenaltyScore: null,
            awayPenaltyScore: null,
          },
        }),
      );

      await expect(
        service.validateScore('org-1', TOURNAMENT_ID, 'match-1', USER_ID),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('triggers bracket round advancement when a knockout match is validated', async () => {
      prisma.match.findUnique.mockResolvedValue(
        baseMatch({
          knockoutBracketId: 'bracket-1',
          knockoutBracket: {
            phase: GOALS_PHASE,
          },
          round: 1,
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

      expect(bracketsService.tryAdvanceRound).toHaveBeenCalledWith(
        'bracket-1',
        1,
      );
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

    it('records the match result for ratings after validating', async () => {
      const completed = baseMatch({
        status: 'COMPLETED',
        homeTeam: { id: 'team-home', name: 'Home' },
        awayTeam: { id: 'team-away', name: 'Away' },
      });
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
      prisma.match.update.mockResolvedValue(completed);

      await service.validateScore('org-1', TOURNAMENT_ID, 'match-1', USER_ID);

      expect(ratingsService.recordMatchResult).toHaveBeenCalledWith(
        'org-1',
        completed,
      );
    });
  });

  describe('upsertScores', () => {
    const score = {
      homeScore: 1,
      awayScore: 1,
      homePenaltyScore: null,
      awayPenaltyScore: null,
    };

    beforeEach(() => {
      prisma.match.findUnique.mockImplementation(
        ({ where }: { where: { id: string } }) =>
          Promise.resolve(baseMatch({ id: where.id, score })),
      );
      prisma.match.update.mockImplementation(
        ({ where }: { where: { id: string } }) =>
          Promise.resolve(baseMatch({ id: where.id, status: 'COMPLETED' })),
      );
    });

    it('saves and validates every match of the rotation', async () => {
      const results = await service.upsertScores(
        'org-1',
        TOURNAMENT_ID,
        {
          validate: true,
          scores: [
            { matchId: 'match-1', homeScore: 1, awayScore: 1 },
            { matchId: 'match-2', homeScore: 3, awayScore: 0 },
          ],
        },
        USER_ID,
      );

      expect(prisma.matchScore.upsert).toHaveBeenCalledTimes(2);
      expect(prisma.matchScore.update).toHaveBeenCalledTimes(2);
      expect(results).toHaveLength(2);
      expect(realtimeService.emit).toHaveBeenCalled();
    });

    it('only saves running scores when not validating', async () => {
      await service.upsertScores(
        'org-1',
        TOURNAMENT_ID,
        { scores: [{ matchId: 'match-1', homeScore: 0, awayScore: 0 }] },
        USER_ID,
      );

      expect(prisma.matchScore.upsert).toHaveBeenCalledTimes(1);
      expect(prisma.matchScore.update).not.toHaveBeenCalled();
    });

    it('writes nothing when one entry cannot be validated', async () => {
      prisma.match.findUnique.mockImplementation(
        ({ where }: { where: { id: string } }) =>
          Promise.resolve(
            where.id === 'match-2'
              ? baseMatch({
                  id: 'match-2',
                  knockoutBracketId: 'bracket-1',
                  knockoutBracket: {
                    phase: GOALS_PHASE,
                  },
                  group: null,
                })
              : baseMatch({ id: where.id }),
          ),
      );

      await expect(
        service.upsertScores(
          'org-1',
          TOURNAMENT_ID,
          {
            validate: true,
            scores: [
              { matchId: 'match-1', homeScore: 2, awayScore: 0 },
              // A knockout draw without a shootout can't be a final result.
              { matchId: 'match-2', homeScore: 1, awayScore: 1 },
            ],
          },
          USER_ID,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.matchScore.upsert).not.toHaveBeenCalled();
    });

    it('rejects the same match twice', async () => {
      await expect(
        service.upsertScores(
          'org-1',
          TOURNAMENT_ID,
          {
            scores: [
              { matchId: 'match-1', homeScore: 1, awayScore: 0 },
              { matchId: 'match-1', homeScore: 2, awayScore: 0 },
            ],
          },
          USER_ID,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
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
      expect(bracketsService.tryAdvanceRound).not.toHaveBeenCalled();
      expect(prisma.match.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: 'FORFEITED', forfeitedTeamId: 'team-away' },
        }),
      );
    });

    it('triggers bracket round advancement when a knockout match is forfeited', async () => {
      prisma.match.findUnique.mockResolvedValue(
        baseMatch({
          knockoutBracketId: 'bracket-1',
          knockoutBracket: {
            phase: GOALS_PHASE,
          },
          round: 2,
        }),
      );
      prisma.match.findUniqueOrThrow.mockResolvedValue(
        baseMatch({
          status: 'FORFEITED',
          forfeitedTeamId: 'team-away',
          knockoutBracketId: 'bracket-1',
          round: 2,
        }),
      );

      await service.declareForfeit('org-1', TOURNAMENT_ID, 'match-1', {
        teamId: 'team-away',
      });

      expect(bracketsService.tryAdvanceRound).toHaveBeenCalledWith(
        'bracket-1',
        2,
      );
    });

    it('records the match result for ratings after a forfeit', async () => {
      const forfeited = baseMatch({
        status: 'FORFEITED',
        forfeitedTeamId: 'team-away',
        homeTeam: { id: 'team-home', name: 'Home' },
        awayTeam: { id: 'team-away', name: 'Away' },
      });
      prisma.match.findUnique.mockResolvedValue(baseMatch());
      prisma.match.findUniqueOrThrow.mockResolvedValue(forfeited);

      await service.declareForfeit('org-1', TOURNAMENT_ID, 'match-1', {
        teamId: 'team-away',
      });

      expect(ratingsService.recordMatchResult).toHaveBeenCalledWith(
        'org-1',
        forfeited,
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

  describe('sets sports (padel)', () => {
    const padelPhase = {
      setsToWin: null,
      category: {
        tournamentId: TOURNAMENT_ID,
        tournament: { sport: { scoreFormat: 'SETS', defaultSetsToWin: 2 } },
      },
    };
    const padelMatch = (overrides: Partial<Record<string, unknown>> = {}) =>
      baseMatch({
        group: { phase: padelPhase, standingRule: null },
        ...overrides,
      });

    it('stores the sets and recomputes the score as sets won, ignoring what the client sent', async () => {
      prisma.match.findUnique.mockResolvedValue(padelMatch());
      prisma.match.update.mockResolvedValue(padelMatch({ status: 'LIVE' }));

      await service.upsertScore(
        'org-1',
        TOURNAMENT_ID,
        'match-1',
        {
          homeScore: 9,
          awayScore: 9,
          sets: [
            { home: 4, away: 6 },
            { home: 6, away: 4 },
            { home: 10, away: 7 },
          ],
        },
        USER_ID,
      );

      expect(prisma.matchScore.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          update: expect.objectContaining({
            homeScore: 2,
            awayScore: 1,
            sets: [
              { home: 4, away: 6 },
              { home: 6, away: 4 },
              { home: 10, away: 7 },
            ],
          }),
        }),
      );
    });

    it('requires the sets detail', async () => {
      prisma.match.findUnique.mockResolvedValue(padelMatch());

      await expect(
        service.upsertScore(
          'org-1',
          TOURNAMENT_ID,
          'match-1',
          { homeScore: 2, awayScore: 0 },
          USER_ID,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses a shootout', async () => {
      prisma.match.findUnique.mockResolvedValue(padelMatch());

      await expect(
        service.upsertScore(
          'org-1',
          TOURNAMENT_ID,
          'match-1',
          {
            homeScore: 1,
            awayScore: 1,
            homePenaltyScore: 4,
            awayPenaltyScore: 3,
            sets: [{ home: 6, away: 4 }],
          },
          USER_ID,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses an unfinished match when validating a rotation', async () => {
      prisma.match.findUnique.mockResolvedValue(padelMatch());

      await expect(
        service.upsertScores(
          'org-1',
          TOURNAMENT_ID,
          {
            validate: true,
            scores: [
              {
                matchId: 'match-1',
                homeScore: 1,
                awayScore: 0,
                sets: [{ home: 6, away: 4 }],
              },
            ],
          },
          USER_ID,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.matchScore.upsert).not.toHaveBeenCalled();
    });

    it('refuses to validate a stored score that is not a finished match', async () => {
      prisma.match.findUnique.mockResolvedValue(
        padelMatch({
          score: {
            homeScore: 1,
            awayScore: 0,
            homePenaltyScore: null,
            awayPenaltyScore: null,
            sets: [{ home: 6, away: 4 }],
          },
        }),
      );

      await expect(
        service.validateScore('org-1', TOURNAMENT_ID, 'match-1', USER_ID),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('lets a phase play more sets than the sport default', async () => {
      const finalPhase = { ...padelPhase, setsToWin: 3 };
      prisma.match.findUnique.mockResolvedValue(
        padelMatch({ group: { phase: finalPhase, standingRule: null } }),
      );
      prisma.match.update.mockResolvedValue(padelMatch({ status: 'LIVE' }));

      await service.upsertScore(
        'org-1',
        TOURNAMENT_ID,
        'match-1',
        {
          homeScore: 0,
          awayScore: 0,
          sets: [
            { home: 6, away: 4 },
            { home: 6, away: 4 },
            { home: 4, away: 6 },
          ],
        },
        USER_ID,
      );

      expect(prisma.matchScore.upsert).toHaveBeenCalled();
    });
  });

  it('refuses sets for a goals sport', async () => {
    prisma.match.findUnique.mockResolvedValue(baseMatch());

    await expect(
      service.upsertScore(
        'org-1',
        TOURNAMENT_ID,
        'match-1',
        { homeScore: 1, awayScore: 0, sets: [{ home: 6, away: 4 }] },
        USER_ID,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
