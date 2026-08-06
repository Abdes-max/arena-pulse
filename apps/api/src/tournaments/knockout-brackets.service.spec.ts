import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { CompetitionPhaseType } from '../../generated/prisma/client';
import { KnockoutBracketsService } from './knockout-brackets.service';
import { PhasesService } from './phases.service';
import { PrismaService } from '../prisma/prisma.service';
import { TournamentsService } from './tournaments.service';

type PrismaMock = {
  knockoutBracket: {
    findUnique: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };
};

function createPrismaMock(): PrismaMock {
  return {
    knockoutBracket: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };
}

describe('KnockoutBracketsService', () => {
  let prisma: PrismaMock;
  let tournamentsService: {
    assertTournamentIsEditable: jest.Mock;
    assertTournamentExists: jest.Mock;
  };
  let phasesService: { assertPhaseExists: jest.Mock };
  let service: KnockoutBracketsService;

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
        type: CompetitionPhaseType.KNOCKOUT,
      }),
    };
    service = new KnockoutBracketsService(
      prisma as unknown as PrismaService,
      tournamentsService as unknown as TournamentsService,
      phasesService as unknown as PhasesService,
    );
  });

  it('rejects creating a bracket when the tournament is archived', async () => {
    tournamentsService.assertTournamentIsEditable.mockRejectedValue(
      new Error('archived'),
    );

    await expect(
      service.create('org-1', 'tournament-1', 'phase-1', {
        name: 'Champions League',
        size: 8,
      }),
    ).rejects.toThrow('archived');
    expect(prisma.knockoutBracket.create).not.toHaveBeenCalled();
  });

  it('rejects creating a bracket on a group-stage phase', async () => {
    phasesService.assertPhaseExists.mockResolvedValue({
      id: 'phase-1',
      type: CompetitionPhaseType.GROUP_STAGE,
    });

    await expect(
      service.create('org-1', 'tournament-1', 'phase-1', {
        name: 'Champions League',
        size: 8,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.knockoutBracket.create).not.toHaveBeenCalled();
  });

  it('rejects creating a second bracket on the same phase', async () => {
    prisma.knockoutBracket.findUnique.mockResolvedValue({
      id: 'existing-bracket',
    });

    await expect(
      service.create('org-1', 'tournament-1', 'phase-1', {
        name: 'Champions League',
        size: 8,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('creates a bracket on a knockout phase', async () => {
    prisma.knockoutBracket.findUnique.mockResolvedValue(null);
    prisma.knockoutBracket.create.mockResolvedValue({
      id: 'bracket-1',
      phaseId: 'phase-1',
      name: 'Champions League',
      size: 8,
      hasRankingMatch: true,
    });

    const result = await service.create('org-1', 'tournament-1', 'phase-1', {
      name: 'Champions League',
      size: 8,
      hasRankingMatch: true,
    });

    expect(result).toEqual({
      id: 'bracket-1',
      phaseId: 'phase-1',
      name: 'Champions League',
      size: 8,
      hasRankingMatch: true,
      plannedFieldIds: undefined,
      plannedStartDateTime: null,
    });
  });

  it('rejects updating/removing a bracket that belongs to another tournament', async () => {
    prisma.knockoutBracket.findUnique.mockResolvedValue({
      id: 'bracket-1',
      phase: { category: { tournamentId: 'other-tournament' } },
    });

    await expect(
      service.update('org-1', 'tournament-1', 'bracket-1', { name: 'X' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.remove('org-1', 'tournament-1', 'bracket-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
