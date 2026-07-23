import { BadRequestException, NotFoundException } from '@nestjs/common';
import { FieldsService } from './fields.service';
import { PrismaService } from '../prisma/prisma.service';
import { TimeSlotsService } from './timeslots.service';
import { TournamentsService } from './tournaments.service';

type PrismaMock = {
  timeSlot: {
    findUnique: jest.Mock;
    findMany: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };
};

function createPrismaMock(): PrismaMock {
  return {
    timeSlot: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };
}

describe('TimeSlotsService', () => {
  let prisma: PrismaMock;
  let tournamentsService: {
    assertTournamentIsEditable: jest.Mock;
    assertTournamentExists: jest.Mock;
  };
  let fieldsService: { assertFieldExists: jest.Mock };
  let service: TimeSlotsService;

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
    fieldsService = {
      assertFieldExists: jest.fn().mockResolvedValue({ id: 'field-1' }),
    };
    service = new TimeSlotsService(
      prisma as unknown as PrismaService,
      tournamentsService as unknown as TournamentsService,
      fieldsService as unknown as FieldsService,
    );
  });

  it('rejects creating a time slot when the tournament is archived', async () => {
    tournamentsService.assertTournamentIsEditable.mockRejectedValue(
      new Error('archived'),
    );

    await expect(
      service.create('org-1', 'tournament-1', 'field-1', {
        startTime: '2026-05-01T10:00:00.000Z',
        endTime: '2026-05-01T11:00:00.000Z',
      }),
    ).rejects.toThrow('archived');
    expect(prisma.timeSlot.create).not.toHaveBeenCalled();
  });

  it('rejects a time slot whose end is before or equal to its start', async () => {
    await expect(
      service.create('org-1', 'tournament-1', 'field-1', {
        startTime: '2026-05-01T11:00:00.000Z',
        endTime: '2026-05-01T11:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.timeSlot.create).not.toHaveBeenCalled();
  });

  it('creates a time slot after validating the field belongs to the tournament', async () => {
    prisma.timeSlot.create.mockResolvedValue({
      id: 'slot-1',
      fieldId: 'field-1',
      startTime: new Date('2026-05-01T10:00:00.000Z'),
      endTime: new Date('2026-05-01T11:00:00.000Z'),
      label: null,
    });

    await service.create('org-1', 'tournament-1', 'field-1', {
      startTime: '2026-05-01T10:00:00.000Z',
      endTime: '2026-05-01T11:00:00.000Z',
    });

    expect(fieldsService.assertFieldExists).toHaveBeenCalledWith(
      'tournament-1',
      'field-1',
    );
  });

  it('rejects updating a time slot to an invalid range using its existing bounds', async () => {
    prisma.timeSlot.findUnique.mockResolvedValue({
      id: 'slot-1',
      fieldId: 'field-1',
      startTime: new Date('2026-05-01T10:00:00.000Z'),
      endTime: new Date('2026-05-01T11:00:00.000Z'),
      field: { venue: { tournamentId: 'tournament-1' } },
    });

    await expect(
      service.update('org-1', 'tournament-1', 'slot-1', {
        startTime: '2026-05-01T12:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects updating/removing a time slot that belongs to another tournament', async () => {
    prisma.timeSlot.findUnique.mockResolvedValue({
      id: 'slot-1',
      field: { venue: { tournamentId: 'other-tournament' } },
    });

    await expect(
      service.update('org-1', 'tournament-1', 'slot-1', { label: 'X' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.remove('org-1', 'tournament-1', 'slot-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
