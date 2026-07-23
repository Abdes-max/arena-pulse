import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { CompetitionPhaseType } from '../../generated/prisma/client';
import { GroupsService } from './groups.service';
import { PhasesService } from './phases.service';
import { PrismaService } from '../prisma/prisma.service';
import { TournamentsService } from './tournaments.service';

type PrismaMock = {
  group: {
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
    group: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };
}

describe('GroupsService', () => {
  let prisma: PrismaMock;
  let tournamentsService: {
    assertTournamentIsEditable: jest.Mock;
    assertTournamentExists: jest.Mock;
  };
  let phasesService: { assertPhaseExists: jest.Mock };
  let service: GroupsService;

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
    phasesService = {
      assertPhaseExists: jest.fn().mockResolvedValue({
        id: 'phase-1',
        type: CompetitionPhaseType.GROUP_STAGE,
      }),
    };
    service = new GroupsService(
      prisma as unknown as PrismaService,
      tournamentsService as unknown as TournamentsService,
      phasesService as unknown as PhasesService,
    );
  });

  it('rejects creating a group when the tournament is archived', async () => {
    tournamentsService.assertTournamentIsEditable.mockRejectedValue(
      new Error('archived'),
    );

    await expect(
      service.create('org-1', 'tournament-1', 'phase-1', { name: 'Poule A' }),
    ).rejects.toThrow('archived');
    expect(prisma.group.create).not.toHaveBeenCalled();
  });

  it('rejects creating a group on a knockout-type phase', async () => {
    phasesService.assertPhaseExists.mockResolvedValue({
      id: 'phase-1',
      type: CompetitionPhaseType.KNOCKOUT,
    });

    await expect(
      service.create('org-1', 'tournament-1', 'phase-1', { name: 'Poule A' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.group.create).not.toHaveBeenCalled();
  });

  it('rejects a duplicate group name within the same phase', async () => {
    prisma.group.findFirst.mockResolvedValue({ id: 'existing-group' });

    await expect(
      service.create('org-1', 'tournament-1', 'phase-1', { name: 'Poule A' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('creates a group on a group-stage phase', async () => {
    prisma.group.findFirst.mockResolvedValue(null);
    prisma.group.create.mockResolvedValue({
      id: 'group-1',
      phaseId: 'phase-1',
      name: 'Poule A',
      position: 0,
    });

    const result = await service.create('org-1', 'tournament-1', 'phase-1', {
      name: 'Poule A',
    });

    expect(result).toEqual({
      id: 'group-1',
      phaseId: 'phase-1',
      name: 'Poule A',
      position: 0,
    });
  });

  it('rejects updating/removing a group that belongs to another tournament', async () => {
    prisma.group.findUnique.mockResolvedValue({
      id: 'group-1',
      phaseId: 'phase-1',
      phase: { category: { tournamentId: 'other-tournament' } },
    });

    await expect(
      service.update('org-1', 'tournament-1', 'group-1', { name: 'X' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.remove('org-1', 'tournament-1', 'group-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('assertGroupExists rejects a group from another tournament', async () => {
    prisma.group.findUnique.mockResolvedValue({
      id: 'group-1',
      phase: { category: { tournamentId: 'other-tournament' } },
    });

    await expect(
      service.assertGroupExists('tournament-1', 'group-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
