import { ConflictException, NotFoundException } from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { DivisionsService } from './divisions.service';
import { PrismaService } from '../prisma/prisma.service';
import { TeamsService } from './teams.service';
import { TournamentsService } from './tournaments.service';

type PrismaMock = {
  team: {
    findFirst: jest.Mock;
    findUnique: jest.Mock;
    findMany: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
    deleteMany: jest.Mock;
  };
  category: { findFirst: jest.Mock };
  division: { findFirst: jest.Mock };
};

function createPrismaMock(): PrismaMock {
  return {
    team: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
    },
    category: { findFirst: jest.fn() },
    division: { findFirst: jest.fn() },
  };
}

describe('TeamsService', () => {
  let prisma: PrismaMock;
  let tournamentsService: {
    assertTournamentIsEditable: jest.Mock;
    assertTournamentExists: jest.Mock;
  };
  let categoriesService: { assertCategoryExists: jest.Mock };
  let divisionsService: { assertDivisionExists: jest.Mock };
  let service: TeamsService;

  const category = {
    id: 'category-1',
    tournamentId: 'tournament-1',
    name: 'U10',
  };
  const division = {
    id: 'division-1',
    categoryId: 'category-1',
    name: 'Poule A',
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
    categoriesService = {
      assertCategoryExists: jest.fn().mockResolvedValue(category),
    };
    divisionsService = {
      assertDivisionExists: jest.fn().mockResolvedValue(division),
    };
    service = new TeamsService(
      prisma as unknown as PrismaService,
      tournamentsService as unknown as TournamentsService,
      categoriesService as unknown as CategoriesService,
      divisionsService as unknown as DivisionsService,
    );
  });

  describe('create', () => {
    it('rejects when the tournament is archived', async () => {
      tournamentsService.assertTournamentIsEditable.mockRejectedValue(
        new Error('archived'),
      );

      await expect(
        service.create('org-1', 'tournament-1', {
          name: 'Les Aigles',
          categoryId: 'category-1',
        }),
      ).rejects.toThrow('archived');
      expect(prisma.team.create).not.toHaveBeenCalled();
    });

    it('rejects a duplicate team name within the tournament', async () => {
      prisma.team.findFirst.mockResolvedValue({ id: 'existing-team' });

      await expect(
        service.create('org-1', 'tournament-1', {
          name: 'Les Aigles',
          categoryId: 'category-1',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('creates a team without a division', async () => {
      prisma.team.findFirst.mockResolvedValue(null);
      prisma.team.create.mockResolvedValue({
        id: 'team-1',
        name: 'Les Aigles',
        categoryId: 'category-1',
        divisionId: null,
        managerName: null,
        managerEmail: null,
        managerPhone: null,
        position: 0,
      });

      const result = await service.create('org-1', 'tournament-1', {
        name: 'Les Aigles',
        categoryId: 'category-1',
      });

      expect(divisionsService.assertDivisionExists).not.toHaveBeenCalled();
      expect(result).toEqual({
        id: 'team-1',
        name: 'Les Aigles',
        categoryId: 'category-1',
        categoryName: 'U10',
        divisionId: null,
        divisionName: null,
        managerName: null,
        managerEmail: null,
        managerPhone: null,
        position: 0,
      });
    });

    it('validates the division belongs to the given category', async () => {
      prisma.team.findFirst.mockResolvedValue(null);
      prisma.team.create.mockResolvedValue({
        id: 'team-1',
        name: 'Les Aigles',
        categoryId: 'category-1',
        divisionId: 'division-1',
        managerName: null,
        managerEmail: null,
        managerPhone: null,
        position: 0,
      });

      await service.create('org-1', 'tournament-1', {
        name: 'Les Aigles',
        categoryId: 'category-1',
        divisionId: 'division-1',
      });

      expect(divisionsService.assertDivisionExists).toHaveBeenCalledWith(
        'category-1',
        'division-1',
      );
    });
  });

  describe('update', () => {
    const existingTeam = {
      id: 'team-1',
      tournamentId: 'tournament-1',
      name: 'Les Aigles',
      categoryId: 'category-1',
      divisionId: 'division-1',
      category,
      division,
    };

    it('rejects a team from another tournament', async () => {
      prisma.team.findUnique.mockResolvedValue({
        ...existingTeam,
        tournamentId: 'other',
      });

      await expect(
        service.update('org-1', 'tournament-1', 'team-1', { name: 'X' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('clears the division when divisionId is an empty string', async () => {
      prisma.team.findUnique.mockResolvedValue(existingTeam);
      prisma.team.update.mockResolvedValue({
        ...existingTeam,
        divisionId: null,
      });

      const result = await service.update('org-1', 'tournament-1', 'team-1', {
        divisionId: '',
      });

      const [[callArg]] = prisma.team.update.mock.calls as [
        [{ where: { id: string }; data: { divisionId: string | null } }],
      ];
      expect(callArg.where).toEqual({ id: 'team-1' });
      expect(callArg.data.divisionId).toBeNull();
      expect(result.divisionId).toBeNull();
      expect(result.divisionName).toBeNull();
    });
  });

  describe('bulkRemove', () => {
    it('rejects when the tournament is archived', async () => {
      tournamentsService.assertTournamentIsEditable.mockRejectedValue(
        new Error('archived'),
      );

      await expect(
        service.bulkRemove('org-1', 'tournament-1', { teamIds: ['team-1'] }),
      ).rejects.toThrow('archived');
      expect(prisma.team.deleteMany).not.toHaveBeenCalled();
    });

    it('deletes only teams scoped to this tournament', async () => {
      await service.bulkRemove('org-1', 'tournament-1', {
        teamIds: ['team-1', 'team-2'],
      });

      expect(prisma.team.deleteMany).toHaveBeenCalledWith({
        where: {
          tournamentId: 'tournament-1',
          id: { in: ['team-1', 'team-2'] },
        },
      });
    });
  });

  describe('importFromCsv', () => {
    it('creates valid rows and reports errors for the rest', async () => {
      const csv =
        'nom;categorie;division\n' +
        'Les Aigles;U10;\n' +
        'Les Lions;Inconnue;\n' +
        'Les Ours;U10;PouleZ';

      prisma.category.findFirst
        .mockResolvedValueOnce({ id: 'category-1', name: 'U10' })
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'category-1', name: 'U10' });
      prisma.division.findFirst.mockResolvedValueOnce(null);
      prisma.team.findFirst.mockResolvedValue(null);
      prisma.team.create.mockResolvedValue({
        id: 'team-1',
        name: 'Les Aigles',
        categoryId: 'category-1',
        divisionId: null,
        managerName: null,
        managerEmail: null,
        managerPhone: null,
        position: 0,
      });

      const result = await service.importFromCsv('org-1', 'tournament-1', csv);

      expect(result.created).toHaveLength(1);
      expect(result.errors).toEqual([
        { line: 3, message: 'Catégorie "Inconnue" introuvable.' },
        {
          line: 4,
          message: 'Division "PouleZ" introuvable dans la catégorie "U10".',
        },
      ]);
    });

    it('rejects when the tournament is archived', async () => {
      tournamentsService.assertTournamentIsEditable.mockRejectedValue(
        new Error('archived'),
      );

      await expect(
        service.importFromCsv(
          'org-1',
          'tournament-1',
          'nom;categorie;division',
        ),
      ).rejects.toThrow('archived');
    });
  });

  describe('exportToCsv', () => {
    it('serializes all teams for the tournament', async () => {
      prisma.team.findMany.mockResolvedValue([
        {
          name: 'Les Aigles',
          category: { name: 'U10' },
          division: { name: 'Poule A' },
        },
        { name: 'Les Lions', category: { name: 'U12' }, division: null },
      ]);

      const csv = await service.exportToCsv('org-1', 'tournament-1');

      expect(csv).toBe(
        'nom;categorie;division\r\nLes Aigles;U10;Poule A\r\nLes Lions;U12;',
      );
    });
  });
});
