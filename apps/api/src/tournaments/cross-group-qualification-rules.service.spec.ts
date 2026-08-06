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
    update: jest.Mock;
  };
  group: { findMany: jest.Mock; findUnique: jest.Mock };
  standingRule: { findUnique: jest.Mock };
};

function createPrismaMock(): PrismaMock {
  return {
    crossGroupQualificationRule: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
      update: jest.fn(),
    },
    group: { findMany: jest.fn(), findUnique: jest.fn() },
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

  describe('resolveSlots', () => {
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

    it('ranks the best N candidates at a position across every pool of the rule once every source pool is complete', async () => {
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
            isComplete: true,
            rows:
              groupId === 'group-a'
                ? [row('a1', 6, 1), row('a2', 3, 2), row('a3', 0, 3)]
                : [row('b1', 6, 1), row('b2', 3, 2), row('b3', 2, 3)],
          }),
      );

      const result = await service.resolveSlots(
        'org-1',
        'tournament-1',
        'phase-2',
      );

      expect(result).toEqual([{ teamId: 'b3', label: '1er meilleur 3e' }]);
    });

    it('returns generic placeholder labels without a real team while any source pool is incomplete', async () => {
      prisma.crossGroupQualificationRule.findMany.mockResolvedValue([
        { id: 'rule-1', phaseId: 'phase-1', position: 3, bestCount: 2 },
      ]);
      prisma.group.findMany.mockResolvedValue([
        { id: 'group-a', name: 'Poule A' },
        { id: 'group-b', name: 'Poule B' },
      ]);
      standingsService.getStandings.mockImplementation(
        (_org: string, _tournament: string, groupId: string) =>
          Promise.resolve({
            isComplete: groupId === 'group-a',
            rows: [],
          }),
      );

      const result = await service.resolveSlots(
        'org-1',
        'tournament-1',
        'phase-2',
      );

      // Never names a specific pool -- which pool ends up "best 3rd" is
      // genuinely unknown until every source pool is complete.
      expect(result).toEqual([
        { teamId: null, label: '1er meilleur 3e' },
        { teamId: null, label: '2e meilleur 3e' },
      ]);
      expect(prisma.standingRule.findUnique).not.toHaveBeenCalled();
    });

    it('withholds a candidate whose slot is covered by an unresolved tie, keeping the placeholder label', async () => {
      prisma.crossGroupQualificationRule.findMany.mockResolvedValue([
        {
          id: 'rule-1',
          phaseId: 'phase-1',
          position: 3,
          bestCount: 1,
          manualTieBreakOrder: [],
        },
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
            isComplete: true,
            // a3 and b3 are level on points -- both fight for the single slot.
            rows:
              groupId === 'group-a'
                ? [row('a1', 9, 1), row('a2', 6, 2), row('a3', 3, 3)]
                : [row('b1', 6, 1), row('b2', 3, 2), row('b3', 3, 3)],
          }),
      );

      const result = await service.resolveSlots(
        'org-1',
        'tournament-1',
        'phase-2',
      );

      expect(result).toEqual([{ teamId: null, label: '1er meilleur 3e' }]);
    });

    it('skips a rule whose source phase has no groups', async () => {
      prisma.crossGroupQualificationRule.findMany.mockResolvedValue([
        { id: 'rule-1', phaseId: 'phase-1', position: 3, bestCount: 8 },
      ]);
      prisma.group.findMany.mockResolvedValue([]);

      const result = await service.resolveSlots(
        'org-1',
        'tournament-1',
        'phase-2',
      );

      expect(result).toEqual([]);
      expect(standingsService.getStandings).not.toHaveBeenCalled();
    });
  });

  describe('getGroupQualifications', () => {
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

    it('returns no rules for a group that does not exist', async () => {
      prisma.group.findUnique.mockResolvedValue(null);

      const result = await service.getGroupQualifications(
        'org-1',
        'tournament-1',
        'group-a',
      );

      expect(result).toEqual([]);
      expect(
        prisma.crossGroupQualificationRule.findMany,
      ).not.toHaveBeenCalled();
    });

    it("ranks off CURRENT standings even while a sibling pool isn't complete, unlike resolveSlots", async () => {
      prisma.group.findUnique.mockResolvedValue({ phaseId: 'phase-1' });
      prisma.crossGroupQualificationRule.findMany.mockResolvedValue([
        {
          id: 'rule-1',
          phaseId: 'phase-1',
          position: 3,
          bestCount: 1,
          targetPhaseId: 'phase-2',
          targetPhase: { name: 'Round of 16' },
        },
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
            // group-b is still mid-pool -- unlike resolveSlots, this must
            // still rank and show a provisional qualifier for group-a.
            isComplete: groupId === 'group-a',
            // a3 (5 pts) outranks b3 (2 pts) for the single best-3rd slot.
            rows:
              groupId === 'group-a'
                ? [row('a1', 9, 1), row('a2', 6, 2), row('a3', 5, 3)]
                : [row('b1', 6, 1), row('b2', 3, 2), row('b3', 2, 3)],
          }),
      );

      const result = await service.getGroupQualifications(
        'org-1',
        'tournament-1',
        'group-a',
      );

      expect(result).toEqual([
        {
          ruleId: 'rule-1',
          fromPosition: 3,
          toPosition: 3,
          targetPhaseId: 'phase-2',
          targetPhaseName: 'Round of 16',
          qualifiedTeams: [{ id: 'a3', name: 'a3', position: 3 }],
        },
      ]);
    });

    it("excludes the rule's entry for a group whose own candidate isn't among the best N", async () => {
      prisma.group.findUnique.mockResolvedValue({ phaseId: 'phase-1' });
      prisma.crossGroupQualificationRule.findMany.mockResolvedValue([
        {
          id: 'rule-1',
          phaseId: 'phase-1',
          position: 3,
          bestCount: 1,
          targetPhaseId: 'phase-2',
          targetPhase: { name: 'Round of 16' },
        },
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
            isComplete: true,
            rows:
              groupId === 'group-a'
                ? [row('a1', 6, 1), row('a2', 3, 2), row('a3', 0, 3)]
                : [row('b1', 6, 1), row('b2', 3, 2), row('b3', 2, 3)],
          }),
      );

      // group-a's 3rd place (0 pts) loses out to group-b's (2 pts) for the
      // single best-3rd slot -- group-a's own qualifications must come back
      // empty for this rule, not include a1/a2 (never at position 3) either.
      const result = await service.getGroupQualifications(
        'org-1',
        'tournament-1',
        'group-a',
      );

      expect(result).toEqual([
        {
          ruleId: 'rule-1',
          fromPosition: 3,
          toPosition: 3,
          targetPhaseId: 'phase-2',
          targetPhaseName: 'Round of 16',
          qualifiedTeams: [],
        },
      ]);
    });
  });

  describe('getUnresolvedTies', () => {
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

    it('surfaces a tie that overlaps the bestCount cutoff', async () => {
      prisma.crossGroupQualificationRule.findMany.mockResolvedValue([
        {
          id: 'rule-1',
          phaseId: 'phase-1',
          position: 3,
          bestCount: 1,
          manualTieBreakOrder: [],
          targetPhaseId: 'phase-2',
          targetPhase: { name: 'Round of 16' },
        },
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
            isComplete: true,
            // a3 and b3 are level on points -- both fight for the single slot.
            rows:
              groupId === 'group-a'
                ? [row('a1', 9, 1), row('a2', 6, 2), row('a3', 3, 3)]
                : [row('b1', 6, 1), row('b2', 3, 2), row('b3', 3, 3)],
          }),
      );

      const result = await service.getUnresolvedTies(
        'org-1',
        'tournament-1',
        'phase-1',
      );

      expect(result).toEqual([
        {
          ruleId: 'rule-1',
          targetPhaseName: 'Round of 16',
          position: 3,
          ties: [
            {
              teams: [
                { id: 'a3', name: 'a3', groupName: 'Poule A' },
                { id: 'b3', name: 'b3', groupName: 'Poule B' },
              ],
            },
          ],
        },
      ]);
    });

    it('omits a tie entirely below the cutoff (both candidates already eliminated)', async () => {
      prisma.crossGroupQualificationRule.findMany.mockResolvedValue([
        {
          id: 'rule-1',
          phaseId: 'phase-1',
          position: 3,
          bestCount: 1,
          manualTieBreakOrder: [],
          targetPhaseId: 'phase-2',
          targetPhase: { name: 'Round of 16' },
        },
      ]);
      prisma.group.findMany.mockResolvedValue([
        { id: 'group-a', name: 'Poule A' },
        { id: 'group-b', name: 'Poule B' },
        { id: 'group-c', name: 'Poule C' },
      ]);
      prisma.standingRule.findUnique.mockResolvedValue({
        tieBreakOrder: ['POINTS'],
      });
      standingsService.getStandings.mockImplementation(
        (_org: string, _tournament: string, groupId: string) => {
          const rowsByGroup: Record<string, ReturnType<typeof row>[]> = {
            'group-a': [row('a1', 9, 1), row('a2', 6, 2), row('a3', 9, 3)],
            'group-b': [row('b1', 6, 1), row('b2', 3, 2), row('b3', 1, 3)],
            'group-c': [row('c1', 6, 1), row('c2', 3, 2), row('c3', 1, 3)],
          };
          return Promise.resolve({
            isComplete: true,
            rows: rowsByGroup[groupId],
          });
        },
      );

      const result = await service.getUnresolvedTies(
        'org-1',
        'tournament-1',
        'phase-1',
      );

      // a3 (9 pts) wins the single slot outright; b3/c3 (1 pt each) are tied
      // for 2nd but nothing depends on their order with bestCount 1.
      expect(result).toEqual([]);
    });
  });

  describe('setManualTieBreakChoice', () => {
    it("appends the picked team to the rule's stored manual order", async () => {
      prisma.crossGroupQualificationRule.findUnique.mockResolvedValue({
        id: 'rule-1',
        manualTieBreakOrder: ['b3'],
        phase: { category: { tournamentId: 'tournament-1' } },
      });

      await service.setManualTieBreakChoice(
        'org-1',
        'tournament-1',
        'rule-1',
        'a3',
      );

      expect(prisma.crossGroupQualificationRule.update).toHaveBeenCalledWith({
        where: { id: 'rule-1' },
        data: { manualTieBreakOrder: ['b3', 'a3'] },
      });
    });

    it('rejects a rule from another tournament', async () => {
      prisma.crossGroupQualificationRule.findUnique.mockResolvedValue({
        id: 'rule-1',
        manualTieBreakOrder: [],
        phase: { category: { tournamentId: 'other-tournament' } },
      });

      await expect(
        service.setManualTieBreakChoice(
          'org-1',
          'tournament-1',
          'rule-1',
          'a3',
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.crossGroupQualificationRule.update).not.toHaveBeenCalled();
    });
  });

  describe('clearManualTieBreakOrder', () => {
    it("resets the rule's stored manual order back to empty", async () => {
      prisma.crossGroupQualificationRule.findUnique.mockResolvedValue({
        id: 'rule-1',
        manualTieBreakOrder: ['a3'],
        phase: { category: { tournamentId: 'tournament-1' } },
      });

      await service.clearManualTieBreakOrder('org-1', 'tournament-1', 'rule-1');

      expect(prisma.crossGroupQualificationRule.update).toHaveBeenCalledWith({
        where: { id: 'rule-1' },
        data: { manualTieBreakOrder: [] },
      });
    });
  });
});
