import { BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BracketsService } from './brackets.service';
import { PhaseScoresService } from './phase-scores.service';
import { RealtimeService } from './realtime.service';
import { TournamentsService } from './tournaments.service';

const POOL_PHASE = {
  id: 'pool-phase',
  type: 'GROUP_STAGE',
  isSeedPhase: false,
  scoresValidatedAt: null as Date | null,
};

describe('PhaseScoresService', () => {
  let prisma: Record<string, Record<string, jest.Mock>> & {
    $transaction?: jest.Mock;
  };
  let bracketsService: {
    tryResolveFirstRound: jest.Mock;
    resetBracketToPlaceholders: jest.Mock;
  };
  let realtimeService: { emit: jest.Mock };
  let service: PhaseScoresService;

  beforeEach(() => {
    prisma = {
      match: { findUnique: jest.fn(), findMany: jest.fn(), count: jest.fn() },
      competitionPhase: {
        findFirst: jest.fn().mockResolvedValue({ ...POOL_PHASE }),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({ scoresValidatedAt: new Date() }),
      },
      qualificationRule: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { targetPhaseId: 'ko-phase', group: { phaseId: 'pool-phase' } },
          ]),
      },
      crossGroupQualificationRule: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      knockoutBracket: {
        findMany: jest.fn().mockResolvedValue([{ id: 'bracket-1' }]),
      },
      group: { findMany: jest.fn().mockResolvedValue([{ id: 'group-a' }]) },
    };
    bracketsService = {
      tryResolveFirstRound: jest.fn(),
      resetBracketToPlaceholders: jest.fn().mockResolvedValue(['m1', 'm2']),
    };
    realtimeService = { emit: jest.fn() };
    service = new PhaseScoresService(
      prisma as unknown as PrismaService,
      {
        assertTournamentIsEditable: jest.fn().mockResolvedValue({}),
      } as unknown as TournamentsService,
      bracketsService as unknown as BracketsService,
      realtimeService as unknown as RealtimeService,
    );
  });

  describe('assertMatchScorable', () => {
    it('locks a pool match once its phase is validated', async () => {
      prisma.match.findUnique.mockResolvedValue({
        homeTeamId: 'a',
        awayTeamId: 'b',
        group: { phase: { scoresValidatedAt: new Date() } },
        knockoutBracket: null,
      });
      await expect(service.assertMatchScorable('m')).rejects.toThrow(
        ConflictException,
      );
    });

    it('lets a pool match be scored while its phase is open', async () => {
      prisma.match.findUnique.mockResolvedValue({
        homeTeamId: 'a',
        awayTeamId: 'b',
        group: { phase: { scoresValidatedAt: null } },
        knockoutBracket: null,
      });
      await expect(service.assertMatchScorable('m')).resolves.toBeUndefined();
    });

    it('refuses a knockout match until the feeding pools are validated', async () => {
      prisma.match.findUnique.mockResolvedValue({
        homeTeamId: 'a',
        awayTeamId: 'b',
        group: null,
        knockoutBracket: { phaseId: 'ko-phase' },
      });
      prisma.competitionPhase.findMany.mockResolvedValue([
        { id: 'pool-phase', scoresValidatedAt: null },
      ]);
      prisma.qualificationRule.findMany.mockResolvedValue([
        { group: { phaseId: 'pool-phase' } },
      ]);
      await expect(service.assertMatchScorable('m')).rejects.toMatchObject({
        response: { code: 'POOL_SCORES_NOT_VALIDATED' },
      });
    });

    it('refuses a knockout match whose teams are still unknown', async () => {
      prisma.match.findUnique.mockResolvedValue({
        homeTeamId: null,
        awayTeamId: 'b',
        group: null,
        knockoutBracket: { phaseId: 'ko-phase' },
      });
      await expect(service.assertMatchScorable('m')).rejects.toThrow(
        ConflictException,
      );
    });

    it('accepts a knockout match with both teams and validated pools', async () => {
      prisma.match.findUnique.mockResolvedValue({
        homeTeamId: 'a',
        awayTeamId: 'b',
        group: null,
        knockoutBracket: { phaseId: 'ko-phase' },
      });
      prisma.competitionPhase.findMany.mockResolvedValue([
        { id: 'pool-phase', scoresValidatedAt: new Date() },
      ]);
      await expect(service.assertMatchScorable('m')).resolves.toBeUndefined();
    });
  });

  describe('validatePoolScores', () => {
    it('refuses while a pool match has no validated score', async () => {
      prisma.match.findMany.mockResolvedValue([
        { status: 'COMPLETED' },
        { status: 'LIVE' },
      ]);
      await expect(
        service.validatePoolScores('org', 'tournament', 'pool-phase'),
      ).rejects.toMatchObject({
        response: { code: 'POOL_MATCHES_UNFINISHED' },
      });
      expect(prisma.competitionPhase.update).not.toHaveBeenCalled();
    });

    it('refuses a phase that feeds nothing', async () => {
      prisma.qualificationRule.findMany.mockResolvedValue([]);
      await expect(
        service.validatePoolScores('org', 'tournament', 'pool-phase'),
      ).rejects.toThrow(BadRequestException);
    });

    it('locks the phase and draws the bracket once every match is finished', async () => {
      prisma.match.findMany.mockResolvedValue([
        { status: 'COMPLETED' },
        { status: 'FORFEITED' },
      ]);
      // sourcePhases(ko-phase): the pool phase, now validated.
      prisma.competitionPhase.findMany.mockResolvedValue([
        { id: 'pool-phase', scoresValidatedAt: new Date() },
      ]);
      await service.validatePoolScores('org', 'tournament', 'pool-phase');

      expect(prisma.competitionPhase.update).toHaveBeenCalledWith({
        where: { id: 'pool-phase' },
        data: { scoresValidatedAt: expect.any(Date) as Date },
      });
      expect(bracketsService.tryResolveFirstRound).toHaveBeenCalledWith(
        'org',
        'tournament',
        'group-a',
      );
    });
  });

  describe('reopenPoolScores', () => {
    beforeEach(() => {
      prisma.competitionPhase.findFirst.mockResolvedValue({
        ...POOL_PHASE,
        scoresValidatedAt: new Date(),
      });
    });

    it('asks for confirmation when the bracket already has scores', async () => {
      prisma.match.count.mockResolvedValue(2);
      await expect(
        service.reopenPoolScores('org', 'tournament', 'pool-phase', false),
      ).rejects.toMatchObject({
        response: { code: 'KNOCKOUT_PROGRESS_EXISTS', count: 2 },
      });
      expect(bracketsService.resetBracketToPlaceholders).not.toHaveBeenCalled();
    });

    it('resets the bracket and unlocks the pools', async () => {
      prisma.match.count.mockResolvedValue(2);
      const result = await service.reopenPoolScores(
        'org',
        'tournament',
        'pool-phase',
        true,
      );

      expect(bracketsService.resetBracketToPlaceholders).toHaveBeenCalledWith(
        'org',
        'tournament',
        'bracket-1',
      );
      expect(prisma.competitionPhase.update).toHaveBeenCalledWith({
        where: { id: 'pool-phase' },
        data: { scoresValidatedAt: null },
      });
      expect(result.resetMatches).toBe(2);
      expect(realtimeService.emit).toHaveBeenCalledTimes(2);
    });

    it('reopens without confirmation when nothing was played in the bracket', async () => {
      prisma.match.count.mockResolvedValue(0);
      await expect(
        service.reopenPoolScores('org', 'tournament', 'pool-phase', false),
      ).resolves.toMatchObject({ scoresValidatedAt: null });
    });
  });
});
