import { ConflictException, NotFoundException } from '@nestjs/common';
import { CompetitionPhaseType } from '../../generated/prisma/client';
import { CategoriesService } from './categories.service';
import { PhasesService } from './phases.service';
import { PrismaService } from '../prisma/prisma.service';
import { TournamentsService } from './tournaments.service';

type PrismaMock = {
  competitionPhase: {
    findFirst: jest.Mock;
    findUnique: jest.Mock;
    findMany: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };
};

function createPrismaMock(): PrismaMock {
  return {
    competitionPhase: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };
}

describe('PhasesService', () => {
  let prisma: PrismaMock;
  let tournamentsService: {
    assertTournamentIsEditable: jest.Mock;
    assertTournamentExists: jest.Mock;
  };
  let categoriesService: { assertCategoryExists: jest.Mock };
  let service: PhasesService;

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
    categoriesService = {
      assertCategoryExists: jest.fn().mockResolvedValue({ id: 'category-1' }),
    };
    service = new PhasesService(
      prisma as unknown as PrismaService,
      tournamentsService as unknown as TournamentsService,
      categoriesService as unknown as CategoriesService,
    );
  });

  it('rejects creating a phase when the tournament is archived', async () => {
    tournamentsService.assertTournamentIsEditable.mockRejectedValue(
      new Error('archived'),
    );

    await expect(
      service.create('org-1', 'tournament-1', 'category-1', {
        name: 'Phase de poules',
        type: CompetitionPhaseType.GROUP_STAGE,
      }),
    ).rejects.toThrow('archived');
    expect(prisma.competitionPhase.create).not.toHaveBeenCalled();
  });

  it('rejects a duplicate phase name within the same category', async () => {
    prisma.competitionPhase.findFirst.mockResolvedValue({
      id: 'existing-phase',
    });

    await expect(
      service.create('org-1', 'tournament-1', 'category-1', {
        name: 'Phase de poules',
        type: CompetitionPhaseType.GROUP_STAGE,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('creates a phase after validating the category belongs to the tournament', async () => {
    prisma.competitionPhase.findFirst.mockResolvedValue(null);
    prisma.competitionPhase.create.mockResolvedValue({
      id: 'phase-1',
      name: 'Phase de poules',
      type: CompetitionPhaseType.GROUP_STAGE,
      position: 0,
    });

    const result = await service.create('org-1', 'tournament-1', 'category-1', {
      name: 'Phase de poules',
      type: CompetitionPhaseType.GROUP_STAGE,
    });

    expect(categoriesService.assertCategoryExists).toHaveBeenCalledWith(
      'tournament-1',
      'category-1',
    );
    expect(result).toEqual({
      id: 'phase-1',
      name: 'Phase de poules',
      type: CompetitionPhaseType.GROUP_STAGE,
      position: 0,
      groups: [],
      knockoutBracket: null,
    });
  });

  it('rejects updating/removing a phase that belongs to another tournament', async () => {
    prisma.competitionPhase.findUnique.mockResolvedValue({
      id: 'phase-1',
      categoryId: 'category-1',
      category: { tournamentId: 'other-tournament' },
    });

    await expect(
      service.update('org-1', 'tournament-1', 'phase-1', { name: 'X' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.remove('org-1', 'tournament-1', 'phase-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('assertPhaseExists rejects a phase from another tournament', async () => {
    prisma.competitionPhase.findUnique.mockResolvedValue({
      id: 'phase-1',
      category: { tournamentId: 'other-tournament' },
    });

    await expect(
      service.assertPhaseExists('tournament-1', 'phase-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
