import { ConflictException, NotFoundException } from '@nestjs/common';
import { FieldsService } from './fields.service';
import { PrismaService } from '../prisma/prisma.service';
import { TournamentsService } from './tournaments.service';
import { VenuesService } from './venues.service';

type PrismaMock = {
  field: {
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
    field: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };
}

describe('FieldsService', () => {
  let prisma: PrismaMock;
  let tournamentsService: {
    assertTournamentIsEditable: jest.Mock;
    assertTournamentExists: jest.Mock;
  };
  let venuesService: { assertVenueExists: jest.Mock };
  let service: FieldsService;

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
    venuesService = {
      assertVenueExists: jest.fn().mockResolvedValue({ id: 'venue-1' }),
    };
    service = new FieldsService(
      prisma as unknown as PrismaService,
      tournamentsService as unknown as TournamentsService,
      venuesService as unknown as VenuesService,
    );
  });

  it('rejects creating a field when the tournament is archived', async () => {
    tournamentsService.assertTournamentIsEditable.mockRejectedValue(
      new Error('archived'),
    );

    await expect(
      service.create('org-1', 'tournament-1', 'venue-1', { name: 'Pelouse 1' }),
    ).rejects.toThrow('archived');
    expect(prisma.field.create).not.toHaveBeenCalled();
  });

  it('rejects a duplicate field name within the same venue', async () => {
    prisma.field.findFirst.mockResolvedValue({ id: 'existing-field' });

    await expect(
      service.create('org-1', 'tournament-1', 'venue-1', { name: 'Pelouse 1' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('creates a field after validating the venue belongs to the tournament', async () => {
    prisma.field.findFirst.mockResolvedValue(null);
    prisma.field.create.mockResolvedValue({
      id: 'field-1',
      name: 'Pelouse 1',
      surface: null,
      position: 0,
    });

    await service.create('org-1', 'tournament-1', 'venue-1', {
      name: 'Pelouse 1',
    });

    expect(venuesService.assertVenueExists).toHaveBeenCalledWith(
      'tournament-1',
      'venue-1',
    );
  });

  it('rejects updating/removing a field that belongs to another tournament', async () => {
    prisma.field.findUnique.mockResolvedValue({
      id: 'field-1',
      venueId: 'venue-1',
      venue: { tournamentId: 'other-tournament' },
    });

    await expect(
      service.update('org-1', 'tournament-1', 'field-1', { name: 'X' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.remove('org-1', 'tournament-1', 'field-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('assertFieldExists rejects a field from another tournament', async () => {
    prisma.field.findUnique.mockResolvedValue({
      id: 'field-1',
      venue: { tournamentId: 'other-tournament' },
    });

    await expect(
      service.assertFieldExists('tournament-1', 'field-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
