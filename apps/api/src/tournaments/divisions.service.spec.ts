import { ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CategoriesService } from './categories.service';
import { DivisionsService } from './divisions.service';
import { TournamentsService } from './tournaments.service';

type PrismaMock = {
  division: {
    findFirst: jest.Mock;
    findUnique: jest.Mock;
    findMany: jest.Mock;
    create: jest.Mock;
  };
};

function createPrismaMock(): PrismaMock {
  return {
    division: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
    },
  };
}

describe('DivisionsService', () => {
  let prisma: PrismaMock;
  let tournamentsService: {
    assertTournamentIsEditable: jest.Mock;
    assertTournamentExists: jest.Mock;
  };
  let categoriesService: { assertCategoryExists: jest.Mock };
  let service: DivisionsService;

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
    service = new DivisionsService(
      prisma as unknown as PrismaService,
      tournamentsService as unknown as TournamentsService,
      categoriesService as unknown as CategoriesService,
    );
  });

  it('rejects creating a division for a category outside the tournament', async () => {
    categoriesService.assertCategoryExists.mockRejectedValue(
      new NotFoundException(),
    );

    await expect(
      service.create('org-1', 'tournament-1', 'category-1', {
        name: 'Poule A',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.division.create).not.toHaveBeenCalled();
  });

  it('rejects a duplicate division name within the same category', async () => {
    prisma.division.findFirst.mockResolvedValue({ id: 'existing-division' });

    await expect(
      service.create('org-1', 'tournament-1', 'category-1', {
        name: 'Poule A',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('creates a division', async () => {
    prisma.division.findFirst.mockResolvedValue(null);
    prisma.division.create.mockResolvedValue({
      id: 'division-1',
      name: 'Poule A',
      colorHex: '#FF0000',
      position: 0,
    });

    const result = await service.create('org-1', 'tournament-1', 'category-1', {
      name: 'Poule A',
      colorHex: '#FF0000',
    });

    expect(result).toEqual({
      id: 'division-1',
      name: 'Poule A',
      colorHex: '#FF0000',
      position: 0,
    });
  });

  it('rejects mutating a division that belongs to another tournament', async () => {
    prisma.division.findUnique.mockResolvedValue({
      id: 'division-1',
      categoryId: 'category-1',
      category: { tournamentId: 'other-tournament' },
    });

    await expect(
      service.update('org-1', 'tournament-1', 'division-1', { name: 'X' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.remove('org-1', 'tournament-1', 'division-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
