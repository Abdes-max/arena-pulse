import { ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CategoriesService } from './categories.service';
import { TournamentsService } from './tournaments.service';

type PrismaMock = {
  category: {
    findFirst: jest.Mock;
    findUnique: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };
};

function createPrismaMock(): PrismaMock {
  return {
    category: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };
}

describe('CategoriesService', () => {
  let prisma: PrismaMock;
  let tournamentsService: {
    assertTournamentIsEditable: jest.Mock;
    assertTournamentExists: jest.Mock;
  };
  let service: CategoriesService;

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
    service = new CategoriesService(
      prisma as unknown as PrismaService,
      tournamentsService as unknown as TournamentsService,
    );
  });

  it('rejects creating a category when the tournament is archived', async () => {
    tournamentsService.assertTournamentIsEditable.mockRejectedValue(
      new Error('archived'),
    );

    await expect(
      service.create('org-1', 'tournament-1', { name: 'U10' }),
    ).rejects.toThrow('archived');
    expect(prisma.category.create).not.toHaveBeenCalled();
  });

  it('rejects a duplicate category name within the same tournament', async () => {
    prisma.category.findFirst.mockResolvedValue({ id: 'existing-category' });

    await expect(
      service.create('org-1', 'tournament-1', { name: 'U10' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('creates a category with a default position', async () => {
    prisma.category.findFirst.mockResolvedValue(null);
    prisma.category.create.mockResolvedValue({
      id: 'category-1',
      name: 'U10',
      position: 0,
    });

    const result = await service.create('org-1', 'tournament-1', {
      name: 'U10',
    });

    expect(result.divisions).toEqual([]);
    expect(prisma.category.create).toHaveBeenCalledWith({
      data: { tournamentId: 'tournament-1', name: 'U10', position: 0 },
    });
  });

  it('rejects updating/removing a category that belongs to a different tournament', async () => {
    prisma.category.findUnique.mockResolvedValue({
      id: 'category-1',
      tournamentId: 'other-tournament',
    });

    await expect(
      service.update('org-1', 'tournament-1', 'category-1', { name: 'U12' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.remove('org-1', 'tournament-1', 'category-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('assertCategoryExists rejects a category from another tournament', async () => {
    prisma.category.findUnique.mockResolvedValue({
      id: 'category-1',
      tournamentId: 'other-tournament',
    });

    await expect(
      service.assertCategoryExists('tournament-1', 'category-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
