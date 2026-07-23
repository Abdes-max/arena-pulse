import { BadRequestException, NotFoundException } from '@nestjs/common';
import { GroupsService } from './groups.service';
import { PhasesService } from './phases.service';
import { PrismaService } from '../prisma/prisma.service';
import { QualificationRulesService } from './qualification-rules.service';
import { TournamentsService } from './tournaments.service';

type PrismaMock = {
  qualificationRule: {
    findUnique: jest.Mock;
    findMany: jest.Mock;
    create: jest.Mock;
    delete: jest.Mock;
  };
};

function createPrismaMock(): PrismaMock {
  return {
    qualificationRule: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
    },
  };
}

describe('QualificationRulesService', () => {
  let prisma: PrismaMock;
  let tournamentsService: {
    assertTournamentIsEditable: jest.Mock;
    assertTournamentExists: jest.Mock;
  };
  let groupsService: { assertGroupExists: jest.Mock };
  let phasesService: { assertPhaseExists: jest.Mock };
  let service: QualificationRulesService;

  const group = {
    id: 'group-1',
    phaseId: 'phase-1',
    phase: { categoryId: 'category-1' },
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
    groupsService = { assertGroupExists: jest.fn().mockResolvedValue(group) };
    phasesService = {
      assertPhaseExists: jest
        .fn()
        .mockResolvedValue({ id: 'phase-2', categoryId: 'category-1' }),
    };
    service = new QualificationRulesService(
      prisma as unknown as PrismaService,
      tournamentsService as unknown as TournamentsService,
      groupsService as unknown as GroupsService,
      phasesService as unknown as PhasesService,
    );
  });

  it('rejects creating a rule when the tournament is archived', async () => {
    tournamentsService.assertTournamentIsEditable.mockRejectedValue(
      new Error('archived'),
    );

    await expect(
      service.create('org-1', 'tournament-1', 'group-1', {
        fromPosition: 1,
        toPosition: 2,
        targetPhaseId: 'phase-2',
      }),
    ).rejects.toThrow('archived');
    expect(prisma.qualificationRule.create).not.toHaveBeenCalled();
  });

  it('rejects toPosition below fromPosition', async () => {
    await expect(
      service.create('org-1', 'tournament-1', 'group-1', {
        fromPosition: 3,
        toPosition: 1,
        targetPhaseId: 'phase-2',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.qualificationRule.create).not.toHaveBeenCalled();
  });

  it('rejects a target phase from a different category', async () => {
    phasesService.assertPhaseExists.mockResolvedValue({
      id: 'phase-2',
      categoryId: 'other-category',
    });

    await expect(
      service.create('org-1', 'tournament-1', 'group-1', {
        fromPosition: 1,
        toPosition: 2,
        targetPhaseId: 'phase-2',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a target phase equal to the source phase', async () => {
    phasesService.assertPhaseExists.mockResolvedValue({
      id: 'phase-1',
      categoryId: 'category-1',
    });

    await expect(
      service.create('org-1', 'tournament-1', 'group-1', {
        fromPosition: 1,
        toPosition: 2,
        targetPhaseId: 'phase-1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('creates a valid qualification rule', async () => {
    prisma.qualificationRule.create.mockResolvedValue({
      id: 'rule-1',
      groupId: 'group-1',
      fromPosition: 1,
      toPosition: 2,
      targetPhaseId: 'phase-2',
      targetPhase: { name: 'Champions League' },
    });

    const result = await service.create('org-1', 'tournament-1', 'group-1', {
      fromPosition: 1,
      toPosition: 2,
      targetPhaseId: 'phase-2',
    });

    expect(result).toEqual({
      id: 'rule-1',
      groupId: 'group-1',
      fromPosition: 1,
      toPosition: 2,
      targetPhaseId: 'phase-2',
      targetPhaseName: 'Champions League',
    });
  });

  it('rejects removing a rule that belongs to another tournament', async () => {
    prisma.qualificationRule.findUnique.mockResolvedValue({
      id: 'rule-1',
      group: { phase: { category: { tournamentId: 'other-tournament' } } },
    });

    await expect(
      service.remove('org-1', 'tournament-1', 'rule-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
