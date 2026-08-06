import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CompetitionPhaseType } from '../../generated/prisma/client';
import { CrossGroupQualificationRulesService } from './cross-group-qualification-rules.service';
import { PhasesService } from './phases.service';
import { PrismaService } from '../prisma/prisma.service';
import { StandingsService } from './standings.service';
import { TournamentsService } from './tournaments.service';

type PrismaMock = {
  crossGroupQualificationRule: {
    findUnique: jest.Mock;
    findMany: jest.Mock;
    create: jest.Mock;
    delete: jest.Mock;
  };
  group: { findMany: jest.Mock };
  standingRule: { findUnique: jest.Mock };
};

function createPrismaMock(): PrismaMock {
  return {
    crossGroupQualificationRule: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
    },
    group: { findMany: jest.fn() },
    standingRule: { findUnique: jest.fn() },
  };
}

describe('CrossGroupQualificationRulesService', () => {
  let prisma: PrismaMock;
  let tournamentsService: {
    assertTournamentIsEditable: jest.Mock;
    assertTournamentExists: jest.Mock;
  };
  let phasesService: { assertPhaseExists: jest.Mock };
  let standingsService: { getStandings: jest.Mock };
  let service: CrossGroupQualificationRulesService;

  const sourcePhase = {
    id: 'phase-1',
    categoryId: 'category-1',
    type: CompetitionPhaseType.GROUP_STAGE,
  };
  const targetPhase = {
    id: 'phase-2',
    categoryId: 'category-1',
    type: CompetitionPhaseType.KNOCKOUT,
  };

  beforeEach(() => {
    prisma = createPrismaMock();
    tournamentsService = {
      assertTournamentIsEditable: jest
        .fn()
        .mockResolvedValue({ id: 'tournament-1' }),
      assertTournamentExists: jest
        .fn()
        .mockResolvedValue({ id: 'tournament-1' }),
    };
    phasesService = {
      assertPhaseExists: jest
        .fn()
        .mockImplementation((_, phaseId) =>
          Promise.resolve(phaseId === 'phase-1' ? sourcePhase : targetPhase),
        ),
    };
    standingsService = { getStandings: jest.fn() };
    service = new CrossGroupQualificationRulesService(
      prisma as unknown as PrismaService,
      tournamentsService as unknown as TournamentsService,
      phasesService as unknown as PhasesService,
      standingsService as unknown as StandingsService,
    );
  });

  describe('create', () => {
    it('rejects creating a rule when the tournament is archived', async () => {
      tournamentsService.assertTournamentIsEditable.mockRejectedValue(
        new Error('archived'),
      );

      await expect(
        service.create('org-1', 'tournament-1', 'phase-1', {
          position: 3,
          bestCount: 8,
          targetPhaseId: 'phase-2',
        }),
      ).rejects.toThrow('archived');
      expect(prisma.crossGroupQualificationRule.create).not.toHaveBeenCalled();
    });

    it('rejects a source phase that is not a group stage', async () => {
      phasesService.assertPhaseExists.mockResolvedValueOnce({
        id: 'phase-1',
        categoryId: 'category-1',
        type: CompetitionPhaseType.KNOCKOUT,
      });

      await expect(
        service.create('org-1', 'tournament-1', 'phase-1', {
          position: 3,
          bestCount: 8,
          targetPhaseId: 'phase-2',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a target phase from a different category', async () => {
      phasesService.assertPhaseExists
        .mockResolvedValueOnce(sourcePhase)
        .mockResolvedValueOnce({
          id: 'phase-2',
          categoryId: 'other-category',
          type: CompetitionPhaseType.KNOCKOUT,
        });

      await expect(
        service.create('org-1', 'tournament-1', 'phase-1', {
          position: 3,
          bestCount: 8,
          targetPhaseId: 'phase-2',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a target phase equal to the source phase', async () => {
      phasesService.assertPhaseExists
        .mockResolvedValueOnce(sourcePhase)
        .mockResolvedValueOnce(sourcePhase);

      await expect(
        service.create('org-1', 'tournament-1', 'phase-1', {
          position: 3,
          bestCount: 8,
          targetPhaseId: 'phase-1',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('creates a valid cross-group qualification rule', async () => {
      prisma.crossGroupQualificationRule.create.mockResolvedValue({
        id: 'rule-1',
        phaseId: 'phase-1',
        position: 3,
        bestCount: 8,
        targetPhaseId: 'phase-2',
        targetPhase: { name: 'Round of 16' },
      });

      const result = await service.create('org-1', 'tournament-1', 'phase-1', {
        position: 3,
        bestCount: 8,
        targetPhaseId: 'phase-2',
      });

      expect(result).toEqual({
        id: 'rule-1',
        phaseId: 'phase-1',
        position: 3,
        bestCount: 8,
        targetPhaseId: 'phase-2',
        targetPhaseName: 'Round of 16',
      });
    });
  });

  describe('remove', () => {
    it('rejects removing a rule that belongs to another tournament', async () => {
      prisma.crossGroupQualificationRule.findUnique.mockResolvedValue({
        id: 'rule-1',
        phase: { category: { tournamentId: 'other-tournament' } },
      });

      await expect(
        service.remove('org-1', 'tournament-1', 'rule-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.crossGroupQualificationRule.delete).not.toHaveBeenCalled();
    });

    it('removes a rule that belongs to the tournament', async () => {
      prisma.crossGroupQualificationRule.findUnique.mockResolvedValue({
        id: 'rule-1',
        phase: { category: { tournamentId: 'tournament-1' } },
      });

      await service.remove('org-1', 'tournament-1', 'rule-1');

      expect(prisma.crossGroupQualificationRule.delete).toHaveBeenCalledWith({
        where: { id: 'rule-1' },
      });
    });
  });

  describe('collectQualifiedTeams', () => {
    function row(teamId: string, points: number, position: number) {
      return {
        teamId,
        teamName: teamId,
        played: 2,
        won: 0,
        drawn: 0,
        lost: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        goalDifference: 0,
        points,
        position,
      };
    }

    it('ranks the best N candidates at a position across every pool of the rule', async () => {
      prisma.crossGroupQualificationRule.findMany.mockResolvedValue([
        { id: 'rule-1', phaseId: 'phase-1', position: 3, bestCount: 1 },
      ]);
      prisma.group.findMany.mockResolvedValue([
        { id: 'group-a', name: 'Poule A' },
        { id: 'group-b', name: 'Poule B' },
      ]);
      prisma.standingRule.findUnique.mockResolvedValue({
        tieBreakOrder: ['POINTS'],
      });
      standingsService.getStandings.mockImplementation(
        (_org: string, _tournament: string, groupId: string) =>
          Promise.resolve({
            rows:
              groupId === 'group-a'
                ? [row('a1', 6, 1), row('a2', 3, 2), row('a3', 0, 3)]
                : [row('b1', 6, 1), row('b2', 3, 2), row('b3', 2, 3)],
          }),
      );

      const result = await service.collectQualifiedTeams(
        'org-1',
        'tournament-1',
        'phase-2',
      );

      expect(result).toEqual([
        { teamId: 'b3', position: 1, groupName: 'Poule B (3e)' },
      ]);
    });

    it('skips a rule whose source phase has no groups', async () => {
      prisma.crossGroupQualificationRule.findMany.mockResolvedValue([
        { id: 'rule-1', phaseId: 'phase-1', position: 3, bestCount: 8 },
      ]);
      prisma.group.findMany.mockResolvedValue([]);

      const result = await service.collectQualifiedTeams(
        'org-1',
        'tournament-1',
        'phase-2',
      );

      expect(result).toEqual([]);
      expect(standingsService.getStandings).not.toHaveBeenCalled();
    });
  });
});
