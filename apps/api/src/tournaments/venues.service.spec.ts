import { ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TournamentsService } from './tournaments.service';
import { VenuesService } from './venues.service';

type PrismaMock = {
  venue: {
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
    venue: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };
}

describe('VenuesService', () => {
  let prisma: PrismaMock;
  let tournamentsService: {
    assertTournamentIsEditable: jest.Mock;
    assertTournamentExists: jest.Mock;
  };
  let service: VenuesService;

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
    service = new VenuesService(
      prisma as unknown as PrismaService,
      tournamentsService as unknown as TournamentsService,
    );
  });

  it('rejects creating a venue when the tournament is archived', async () => {
    tournamentsService.assertTournamentIsEditable.mockRejectedValue(
      new Error('archived'),
    );

    await expect(
      service.create('org-1', 'tournament-1', { name: 'Stade Marius Requier' }),
    ).rejects.toThrow('archived');
    expect(prisma.venue.create).not.toHaveBeenCalled();
  });

  it('rejects a duplicate venue name within the same tournament', async () => {
    prisma.venue.findFirst.mockResolvedValue({ id: 'existing-venue' });

    await expect(
      service.create('org-1', 'tournament-1', { name: 'Stade' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('creates a venue with a default position', async () => {
    prisma.venue.findFirst.mockResolvedValue(null);
    prisma.venue.create.mockResolvedValue({
      id: 'venue-1',
      name: 'Stade',
      address: null,
      position: 0,
    });

    const result = await service.create('org-1', 'tournament-1', {
      name: 'Stade',
    });

    expect(result.fields).toEqual([]);
    expect(prisma.venue.create).toHaveBeenCalledWith({
      data: {
        tournamentId: 'tournament-1',
        name: 'Stade',
        address: undefined,
        position: 0,
      },
    });
  });

  it('rejects updating/removing a venue that belongs to a different tournament', async () => {
    prisma.venue.findUnique.mockResolvedValue({
      id: 'venue-1',
      tournamentId: 'other-tournament',
    });

    await expect(
      service.update('org-1', 'tournament-1', 'venue-1', { name: 'X' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.remove('org-1', 'tournament-1', 'venue-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('assertVenueExists rejects a venue from another tournament', async () => {
    prisma.venue.findUnique.mockResolvedValue({
      id: 'venue-1',
      tournamentId: 'other-tournament',
    });

    await expect(
      service.assertVenueExists('tournament-1', 'venue-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
