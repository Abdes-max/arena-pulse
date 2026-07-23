import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RefereesService } from './referees.service';
import { TournamentsService } from './tournaments.service';

type PrismaMock = {
  referee: {
    findUnique: jest.Mock;
    findMany: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };
};

function createPrismaMock(): PrismaMock {
  return {
    referee: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };
}

describe('RefereesService', () => {
  let prisma: PrismaMock;
  let tournamentsService: {
    assertTournamentIsEditable: jest.Mock;
    assertTournamentExists: jest.Mock;
  };
  let service: RefereesService;

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
    service = new RefereesService(
      prisma as unknown as PrismaService,
      tournamentsService as unknown as TournamentsService,
    );
  });

  it('rejects creating a referee when the tournament is archived', async () => {
    tournamentsService.assertTournamentIsEditable.mockRejectedValue(
      new Error('archived'),
    );

    await expect(
      service.create('org-1', 'tournament-1', {
        firstName: 'Rui',
        lastName: 'Referee',
      }),
    ).rejects.toThrow('archived');
    expect(prisma.referee.create).not.toHaveBeenCalled();
  });

  it('creates a referee', async () => {
    prisma.referee.create.mockResolvedValue({
      id: 'referee-1',
      firstName: 'Rui',
      lastName: 'Referee',
      email: null,
      phone: null,
    });

    const result = await service.create('org-1', 'tournament-1', {
      firstName: 'Rui',
      lastName: 'Referee',
    });

    expect(result).toEqual({
      id: 'referee-1',
      firstName: 'Rui',
      lastName: 'Referee',
      email: null,
      phone: null,
    });
  });

  it('rejects updating/removing a referee that belongs to a different tournament', async () => {
    prisma.referee.findUnique.mockResolvedValue({
      id: 'referee-1',
      tournamentId: 'other-tournament',
    });

    await expect(
      service.update('org-1', 'tournament-1', 'referee-1', { firstName: 'X' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.remove('org-1', 'tournament-1', 'referee-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
