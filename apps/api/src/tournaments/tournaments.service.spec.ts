import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { TournamentStatus } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TournamentsService } from './tournaments.service';

type PrismaMock = {
  sport: { findUnique: jest.Mock };
  tournament: {
    create: jest.Mock;
    findMany: jest.Mock;
    findUnique: jest.Mock;
    update: jest.Mock;
  };
  category: { findMany: jest.Mock; create: jest.Mock };
  division: { create: jest.Mock };
  tournamentAdministrator: { findMany: jest.Mock; create: jest.Mock };
  tournamentAdministratorPermission: { create: jest.Mock };
  $transaction: jest.Mock;
};

function createPrismaMock(): PrismaMock {
  const prisma: PrismaMock = {
    sport: { findUnique: jest.fn() },
    tournament: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    category: { findMany: jest.fn(), create: jest.fn() },
    division: { create: jest.fn() },
    tournamentAdministrator: { findMany: jest.fn(), create: jest.fn() },
    tournamentAdministratorPermission: { create: jest.fn() },
    $transaction: jest.fn(async (arg: unknown) => {
      if (typeof arg === 'function') {
        return (arg as (tx: PrismaMock) => unknown)(prisma);
      }
      return Promise.all(arg as Promise<unknown>[]);
    }),
  };
  return prisma;
}

const SPORT = { id: 'sport-1', name: 'Football' };

function tournamentFixture(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'tournament-1',
    organizationId: 'org-1',
    sportId: SPORT.id,
    sport: SPORT,
    name: 'Coupe de printemps',
    status: TournamentStatus.DRAFT,
    startDate: null,
    endDate: null,
    isOnline: false,
    archivedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('TournamentsService', () => {
  let prisma: PrismaMock;
  let service: TournamentsService;

  beforeEach(() => {
    prisma = createPrismaMock();
    service = new TournamentsService(prisma as unknown as PrismaService);
  });

  describe('create', () => {
    it('rejects an unknown sport', async () => {
      prisma.sport.findUnique.mockResolvedValue(null);

      await expect(
        service.create('org-1', { name: 'Coupe', sportId: 'unknown-sport' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.tournament.create).not.toHaveBeenCalled();
    });

    it('creates a DRAFT tournament for a known sport', async () => {
      prisma.sport.findUnique.mockResolvedValue(SPORT);
      prisma.tournament.create.mockResolvedValue(tournamentFixture());

      const result = await service.create('org-1', {
        name: 'Coupe de printemps',
        sportId: SPORT.id,
      });

      expect(result.status).toBe(TournamentStatus.DRAFT);
      expect(result.sportName).toBe('Football');
    });
  });

  describe('update / editability', () => {
    it('rejects any update on an archived tournament', async () => {
      prisma.tournament.findUnique.mockResolvedValue(
        tournamentFixture({ status: TournamentStatus.ARCHIVED }),
      );

      await expect(
        service.update('org-1', 'tournament-1', { name: 'Nouveau nom' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.tournament.update).not.toHaveBeenCalled();
    });

    it('rejects access to a tournament from another organization', async () => {
      prisma.tournament.findUnique.mockResolvedValue(
        tournamentFixture({ organizationId: 'org-2' }),
      );

      await expect(
        service.getDetail('org-1', 'tournament-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('publish / unpublish / archive / unarchive', () => {
    it('rejects publishing an already-published tournament', async () => {
      prisma.tournament.findUnique.mockResolvedValue(
        tournamentFixture({ status: TournamentStatus.PUBLISHED }),
      );

      await expect(
        service.publish('org-1', 'tournament-1'),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects unpublishing a tournament that is not published', async () => {
      prisma.tournament.findUnique.mockResolvedValue(
        tournamentFixture({ status: TournamentStatus.DRAFT }),
      );

      await expect(
        service.unpublish('org-1', 'tournament-1'),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('archives a tournament and stamps archivedAt', async () => {
      prisma.tournament.findUnique.mockResolvedValue(tournamentFixture());
      prisma.tournament.update.mockResolvedValue(
        tournamentFixture({
          status: TournamentStatus.ARCHIVED,
          archivedAt: new Date(),
        }),
      );

      const result = await service.archive('org-1', 'tournament-1');

      expect(result.status).toBe(TournamentStatus.ARCHIVED);
      const [[updateCall]] = prisma.tournament.update.mock.calls as [
        [{ data: { status: TournamentStatus; archivedAt: Date } }],
      ];
      expect(updateCall.data.status).toBe(TournamentStatus.ARCHIVED);
      expect(updateCall.data.archivedAt).toBeInstanceOf(Date);
    });

    it('rejects archiving an already-archived tournament', async () => {
      prisma.tournament.findUnique.mockResolvedValue(
        tournamentFixture({ status: TournamentStatus.ARCHIVED }),
      );

      await expect(
        service.archive('org-1', 'tournament-1'),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('unarchive always returns to DRAFT regardless of the prior status', async () => {
      prisma.tournament.findUnique.mockResolvedValue(
        tournamentFixture({ status: TournamentStatus.ARCHIVED }),
      );
      prisma.tournament.update.mockResolvedValue(
        tournamentFixture({ status: TournamentStatus.DRAFT, archivedAt: null }),
      );

      const result = await service.unarchive('org-1', 'tournament-1');

      expect(result.status).toBe(TournamentStatus.DRAFT);
      expect(prisma.tournament.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: TournamentStatus.DRAFT, archivedAt: null },
        }),
      );
    });

    it('rejects unarchiving a tournament that is not archived', async () => {
      prisma.tournament.findUnique.mockResolvedValue(
        tournamentFixture({ status: TournamentStatus.DRAFT }),
      );

      await expect(
        service.unarchive('org-1', 'tournament-1'),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('duplicate', () => {
    it('copies categories, divisions and administrators, and the clone is always DRAFT', async () => {
      const source = tournamentFixture({
        status: TournamentStatus.ARCHIVED,
        name: 'Édition 2025',
      });
      const clone = tournamentFixture({
        id: 'tournament-clone',
        name: 'Édition 2025 (copie)',
        status: TournamentStatus.DRAFT,
      });
      prisma.tournament.findUnique
        .mockResolvedValueOnce(source)
        .mockResolvedValueOnce(clone);
      prisma.tournament.create.mockResolvedValue(clone);
      prisma.category.findMany.mockResolvedValue([
        {
          id: 'category-1',
          name: 'U10',
          position: 0,
          divisions: [
            { id: 'division-1', name: 'A', colorHex: '#FF0000', position: 0 },
          ],
        },
      ]);
      prisma.category.create.mockResolvedValue({ id: 'new-category-1' });
      prisma.tournamentAdministrator.findMany.mockResolvedValue([
        {
          id: 'admin-1',
          userId: 'user-1',
          permissions: [{ permissionId: 'perm-1' }],
        },
      ]);
      prisma.tournamentAdministrator.create.mockResolvedValue({
        id: 'new-admin-1',
      });

      const result = await service.duplicate('org-1', 'tournament-1', {});

      expect(result.name).toBe('Édition 2025 (copie)');
      const [[createCall]] = prisma.tournament.create.mock.calls as [
        [{ data: { status: TournamentStatus } }],
      ];
      expect(createCall.data.status).toBe(TournamentStatus.DRAFT);
      const [[divisionCreateCall]] = prisma.division.create.mock.calls as [
        [{ data: { categoryId: string; name: string } }],
      ];
      expect(divisionCreateCall.data.categoryId).toBe('new-category-1');
      expect(divisionCreateCall.data.name).toBe('A');
      expect(
        prisma.tournamentAdministratorPermission.create,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            tournamentAdministratorId: 'new-admin-1',
            permissionId: 'perm-1',
          },
        }),
      );
    });

    it('uses a custom name when provided instead of the default suffix', async () => {
      prisma.tournament.findUnique.mockResolvedValue(tournamentFixture());
      prisma.tournament.create.mockResolvedValue(
        tournamentFixture({ id: 'tournament-clone' }),
      );
      prisma.category.findMany.mockResolvedValue([]);
      prisma.tournamentAdministrator.findMany.mockResolvedValue([]);

      await service.duplicate('org-1', 'tournament-1', {
        name: 'Édition 2026',
      });

      const [[createCall]] = prisma.tournament.create.mock.calls as [
        [{ data: { name: string } }],
      ];
      expect(createCall.data.name).toBe('Édition 2026');
    });
  });
});
