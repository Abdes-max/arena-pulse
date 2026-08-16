import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { promises as fs } from 'fs';
import { CategoriesService } from './categories.service';
import { DivisionsService } from './divisions.service';
import { GroupsService } from './groups.service';
import { PrismaService } from '../prisma/prisma.service';
import { TeamsService } from './teams.service';
import { TournamentsService } from './tournaments.service';

// TeamsService writes/reads the local filesystem for logo uploads -- mocked
// entirely so these stay unit tests, not e2e-with-a-real-disk tests.
jest.mock('fs', () => ({
  promises: {
    mkdir: jest.fn().mockResolvedValue(undefined),
    writeFile: jest.fn().mockResolvedValue(undefined),
    unlink: jest.fn().mockResolvedValue(undefined),
  },
}));
const fsMock = fs as unknown as {
  mkdir: jest.Mock;
  writeFile: jest.Mock;
  unlink: jest.Mock;
};

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
  let groupsService: { assertGroupExists: jest.Mock };
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
    groupsService = {
      assertGroupExists: jest.fn(),
    };
    fsMock.mkdir.mockClear();
    fsMock.writeFile.mockClear();
    fsMock.unlink.mockClear();
    const configService = {
      get: jest.fn(
        (_key: string, defaultValue?: string) => defaultValue ?? './uploads',
      ),
    };
    service = new TeamsService(
      prisma as unknown as PrismaService,
      tournamentsService as unknown as TournamentsService,
      categoriesService as unknown as CategoriesService,
      divisionsService as unknown as DivisionsService,
      groupsService as unknown as GroupsService,
      configService as unknown as ConfigService,
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
        groupId: null,
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
        groupId: null,
        groupName: null,
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
      prisma.team.findMany.mockResolvedValue([]);

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

    it("deletes each removed team's logo file, if any", async () => {
      prisma.team.findMany.mockResolvedValue([
        { logoUrl: '/uploads/team-logos/team-1-abc.png' },
        { logoUrl: null },
      ]);

      await service.bulkRemove('org-1', 'tournament-1', {
        teamIds: ['team-1', 'team-2'],
      });

      expect(fsMock.unlink).toHaveBeenCalledTimes(1);
      expect(fsMock.unlink).toHaveBeenCalledWith(
        expect.stringContaining('team-1-abc.png'),
      );
    });
  });

  describe('remove', () => {
    it("deletes the team's logo file when it has one", async () => {
      prisma.team.findUnique.mockResolvedValue({
        id: 'team-1',
        tournamentId: 'tournament-1',
        category,
        division: null,
        group: null,
        logoUrl: '/uploads/team-logos/team-1-abc.png',
      });

      await service.remove('org-1', 'tournament-1', 'team-1');

      expect(prisma.team.delete).toHaveBeenCalledWith({
        where: { id: 'team-1' },
      });
      expect(fsMock.unlink).toHaveBeenCalledWith(
        expect.stringContaining('team-1-abc.png'),
      );
    });

    it('does not touch the filesystem when the team has no logo', async () => {
      prisma.team.findUnique.mockResolvedValue({
        id: 'team-1',
        tournamentId: 'tournament-1',
        category,
        division: null,
        group: null,
        logoUrl: null,
      });

      await service.remove('org-1', 'tournament-1', 'team-1');

      expect(fsMock.unlink).not.toHaveBeenCalled();
    });
  });

  describe('uploadLogo', () => {
    const teamRow = {
      id: 'team-1',
      tournamentId: 'tournament-1',
      category,
      division: null,
      group: null,
      logoUrl: null as string | null,
    };

    function pngFile(overrides: Partial<Express.Multer.File> = {}) {
      return {
        mimetype: 'image/png',
        size: 1024,
        buffer: Buffer.from('fake-png'),
        ...overrides,
      } as Express.Multer.File;
    }

    it('rejects an unsupported mimetype without touching the filesystem', async () => {
      prisma.team.findUnique.mockResolvedValue(teamRow);

      await expect(
        service.uploadLogo(
          'org-1',
          'tournament-1',
          'team-1',
          pngFile({ mimetype: 'image/svg+xml' }),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(fsMock.writeFile).not.toHaveBeenCalled();
    });

    it('rejects a file over the 2 MB limit', async () => {
      prisma.team.findUnique.mockResolvedValue(teamRow);

      await expect(
        service.uploadLogo(
          'org-1',
          'tournament-1',
          'team-1',
          pngFile({ size: 3 * 1024 * 1024 }),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(fsMock.writeFile).not.toHaveBeenCalled();
    });

    it('writes the file and sets logoUrl to a public /uploads path', async () => {
      prisma.team.findUnique.mockResolvedValue(teamRow);
      prisma.team.update.mockImplementation(
        ({ data }: { data: { logoUrl: string } }) => ({
          ...teamRow,
          logoUrl: data.logoUrl,
        }),
      );

      const result = await service.uploadLogo(
        'org-1',
        'tournament-1',
        'team-1',
        pngFile(),
      );

      expect(fsMock.mkdir).toHaveBeenCalled();
      expect(fsMock.writeFile).toHaveBeenCalledTimes(1);
      expect(fsMock.unlink).not.toHaveBeenCalled(); // no previous logo
      expect(result.logoUrl).toMatch(/^\/uploads\/team-logos\/team-1-.+\.png$/);
    });

    it('deletes the previous logo file when replacing an existing one', async () => {
      prisma.team.findUnique.mockResolvedValue({
        ...teamRow,
        logoUrl: '/uploads/team-logos/team-1-old.png',
      });
      prisma.team.update.mockResolvedValue({
        ...teamRow,
        logoUrl: '/uploads/team-logos/new.png',
      });

      await service.uploadLogo('org-1', 'tournament-1', 'team-1', pngFile());

      expect(fsMock.unlink).toHaveBeenCalledWith(
        expect.stringContaining('team-1-old.png'),
      );
    });
  });

  describe('removeLogo', () => {
    it('clears logoUrl and deletes the file', async () => {
      prisma.team.findUnique.mockResolvedValue({
        id: 'team-1',
        tournamentId: 'tournament-1',
        category,
        division: null,
        group: null,
        logoUrl: '/uploads/team-logos/team-1-abc.png',
      });
      prisma.team.update.mockResolvedValue({ logoUrl: null });

      await service.removeLogo('org-1', 'tournament-1', 'team-1');

      expect(fsMock.unlink).toHaveBeenCalledWith(
        expect.stringContaining('team-1-abc.png'),
      );
      expect(prisma.team.update).toHaveBeenCalledWith({
        where: { id: 'team-1' },
        data: { logoUrl: null },
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

    it('sets manager fields from the CSV columns', async () => {
      const csv =
        'nom;categorie;division;responsable;email_responsable;telephone_responsable;logo\n' +
        'Les Aigles;U10;;Jean Dupont;jean@example.com;0600000000;';

      prisma.category.findFirst.mockResolvedValue({
        id: 'category-1',
        name: 'U10',
      });
      prisma.team.findFirst.mockResolvedValue(null);
      prisma.team.create.mockResolvedValue({
        id: 'team-1',
        name: 'Les Aigles',
        categoryId: 'category-1',
        divisionId: null,
        managerName: 'Jean Dupont',
        managerEmail: 'jean@example.com',
        managerPhone: '0600000000',
        logoUrl: null,
        position: 0,
      });

      await service.importFromCsv('org-1', 'tournament-1', csv);

      expect(prisma.team.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            managerName: 'Jean Dupont',
            managerEmail: 'jean@example.com',
            managerPhone: '0600000000',
          }) as unknown,
        }),
      );
    });

    it('references an existing /uploads/team-logos path as-is, without fetching', async () => {
      const csv =
        'nom;categorie;division;responsable;email_responsable;telephone_responsable;logo\n' +
        'Les Aigles;U10;;;;;/uploads/team-logos/existing.png';

      prisma.category.findFirst.mockResolvedValue({
        id: 'category-1',
        name: 'U10',
      });
      prisma.team.findFirst.mockResolvedValue(null);
      prisma.team.create.mockResolvedValue({
        id: 'team-1',
        name: 'Les Aigles',
        categoryId: 'category-1',
        divisionId: null,
        logoUrl: null,
        position: 0,
      });
      prisma.team.update.mockResolvedValue({
        id: 'team-1',
        name: 'Les Aigles',
        categoryId: 'category-1',
        divisionId: null,
        logoUrl: '/uploads/team-logos/existing.png',
        position: 0,
      });
      const fetchMock = jest.fn();
      global.fetch = fetchMock;

      const result = await service.importFromCsv('org-1', 'tournament-1', csv);

      expect(fetchMock).not.toHaveBeenCalled();
      expect(prisma.team.update).toHaveBeenCalledWith({
        where: { id: 'team-1' },
        data: { logoUrl: '/uploads/team-logos/existing.png' },
      });
      expect(result.warnings).toEqual([]);
    });

    it('fetches and stores an http(s) logo URL', async () => {
      const csv =
        'nom;categorie;division;responsable;email_responsable;telephone_responsable;logo\n' +
        'Les Aigles;U10;;;;;https://example.com/logo.png';

      prisma.category.findFirst.mockResolvedValue({
        id: 'category-1',
        name: 'U10',
      });
      prisma.team.findFirst.mockResolvedValue(null);
      prisma.team.create.mockResolvedValue({
        id: 'team-1',
        name: 'Les Aigles',
        categoryId: 'category-1',
        divisionId: null,
        logoUrl: null,
        position: 0,
      });
      prisma.team.update.mockImplementation(
        ({ data }: { data: { logoUrl: string } }) => ({
          id: 'team-1',
          logoUrl: data.logoUrl,
        }),
      );
      const fetchMock = jest.fn().mockResolvedValue({
        ok: true,
        headers: { get: () => 'image/png' },
        arrayBuffer: () => Promise.resolve(Buffer.from('fake-png').buffer),
      });
      global.fetch = fetchMock;

      const result = await service.importFromCsv('org-1', 'tournament-1', csv);

      expect(fetchMock).toHaveBeenCalledWith(
        'https://example.com/logo.png',
        expect.anything(),
      );
      expect(fsMock.writeFile).toHaveBeenCalledTimes(1);
      expect(prisma.team.update).toHaveBeenCalledWith({
        where: { id: 'team-1' },
        data: {
          logoUrl: expect.stringMatching(
            /^\/uploads\/team-logos\/team-1-.+\.png$/,
          ) as unknown,
        },
      });
      expect(result.warnings).toEqual([]);
    });

    it('creates the team and reports a warning when the logo URL fails to fetch', async () => {
      const csv =
        'nom;categorie;division;responsable;email_responsable;telephone_responsable;logo\n' +
        'Les Aigles;U10;;;;;https://example.com/broken.png';

      prisma.category.findFirst.mockResolvedValue({
        id: 'category-1',
        name: 'U10',
      });
      prisma.team.findFirst.mockResolvedValue(null);
      prisma.team.create.mockResolvedValue({
        id: 'team-1',
        name: 'Les Aigles',
        categoryId: 'category-1',
        divisionId: null,
        logoUrl: null,
        position: 0,
      });
      const fetchMock = jest.fn().mockResolvedValue({ ok: false, status: 404 });
      global.fetch = fetchMock;

      const result = await service.importFromCsv('org-1', 'tournament-1', csv);

      expect(result.created).toHaveLength(1);
      expect(prisma.team.update).not.toHaveBeenCalled();
      expect(result.warnings).toEqual([
        {
          line: 2,
          message: expect.stringContaining(
            'https://example.com/broken.png',
          ) as unknown,
        },
      ]);
    });
  });

  describe('exportToCsv', () => {
    it('serializes all teams for the tournament, including manager and logo columns', async () => {
      prisma.team.findMany.mockResolvedValue([
        {
          name: 'Les Aigles',
          category: { name: 'U10' },
          division: { name: 'Poule A' },
          managerName: 'Jean Dupont',
          managerEmail: 'jean@example.com',
          managerPhone: '0600000000',
          logoUrl: '/uploads/team-logos/aigles.png',
        },
        {
          name: 'Les Lions',
          category: { name: 'U12' },
          division: null,
          managerName: null,
          managerEmail: null,
          managerPhone: null,
          logoUrl: null,
        },
      ]);

      const csv = await service.exportToCsv('org-1', 'tournament-1');

      expect(csv).toBe(
        'nom;categorie;division;responsable;email_responsable;telephone_responsable;logo\r\n' +
          'Les Aigles;U10;Poule A;Jean Dupont;jean@example.com;0600000000;/uploads/team-logos/aigles.png\r\n' +
          'Les Lions;U12;;;;;',
      );
    });
  });

  describe('assignGroup', () => {
    const existingTeam = {
      id: 'team-1',
      tournamentId: 'tournament-1',
      categoryId: 'category-1',
      category,
      division: null,
      group: null,
    };

    it('rejects assigning a group from a different category', async () => {
      prisma.team.findUnique.mockResolvedValue(existingTeam);
      groupsService.assertGroupExists.mockResolvedValue({
        id: 'group-1',
        phase: { categoryId: 'other-category' },
      });

      await expect(
        service.assignGroup('org-1', 'tournament-1', 'team-1', {
          groupId: 'group-1',
        }),
      ).rejects.toThrow(/appartient pas/);
    });

    it('assigns a group belonging to the same category', async () => {
      prisma.team.findUnique.mockResolvedValue(existingTeam);
      groupsService.assertGroupExists.mockResolvedValue({
        id: 'group-1',
        name: 'Poule A',
        phase: { categoryId: 'category-1' },
      });
      prisma.team.update.mockResolvedValue({
        ...existingTeam,
        groupId: 'group-1',
      });

      const result = await service.assignGroup(
        'org-1',
        'tournament-1',
        'team-1',
        {
          groupId: 'group-1',
        },
      );

      expect(prisma.team.update).toHaveBeenCalledWith({
        where: { id: 'team-1' },
        data: { groupId: 'group-1' },
      });
      expect(result.groupId).toBe('group-1');
      expect(result.groupName).toBe('Poule A');
    });

    it('clears the group when groupId is null', async () => {
      prisma.team.findUnique.mockResolvedValue({
        ...existingTeam,
        groupId: 'group-1',
      });
      prisma.team.update.mockResolvedValue({ ...existingTeam, groupId: null });

      const result = await service.assignGroup(
        'org-1',
        'tournament-1',
        'team-1',
        {
          groupId: null,
        },
      );

      expect(groupsService.assertGroupExists).not.toHaveBeenCalled();
      expect(prisma.team.update).toHaveBeenCalledWith({
        where: { id: 'team-1' },
        data: { groupId: null },
      });
      expect(result.groupId).toBeNull();
    });
  });
});
