import { NotFoundException } from '@nestjs/common';
import { PlayersService } from './players.service';
import { PrismaService } from '../prisma/prisma.service';
import { TeamsService } from './teams.service';
import { TournamentsService } from './tournaments.service';

type PrismaMock = {
  player: {
    findUnique: jest.Mock;
    findMany: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
  };
};

function createPrismaMock(): PrismaMock {
  return {
    player: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };
}

describe('PlayersService', () => {
  let prisma: PrismaMock;
  let tournamentsService: {
    assertTournamentIsEditable: jest.Mock;
    assertTournamentExists: jest.Mock;
  };
  let teamsService: { assertTeamExists: jest.Mock };
  let service: PlayersService;

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
    teamsService = {
      assertTeamExists: jest.fn().mockResolvedValue({ id: 'team-1' }),
    };
    service = new PlayersService(
      prisma as unknown as PrismaService,
      tournamentsService as unknown as TournamentsService,
      teamsService as unknown as TeamsService,
    );
  });

  it('rejects creating a player when the tournament is archived', async () => {
    tournamentsService.assertTournamentIsEditable.mockRejectedValue(
      new Error('archived'),
    );

    await expect(
      service.create('org-1', 'tournament-1', 'team-1', {
        firstName: 'Ada',
        lastName: 'Lovelace',
      }),
    ).rejects.toThrow('archived');
    expect(prisma.player.create).not.toHaveBeenCalled();
  });

  it('validates the team belongs to the tournament before creating a player', async () => {
    prisma.player.create.mockResolvedValue({
      id: 'player-1',
      firstName: 'Ada',
      lastName: 'Lovelace',
      jerseyNumber: null,
      isCaptain: false,
    });

    await service.create('org-1', 'tournament-1', 'team-1', {
      firstName: 'Ada',
      lastName: 'Lovelace',
    });

    expect(teamsService.assertTeamExists).toHaveBeenCalledWith(
      'tournament-1',
      'team-1',
    );
  });

  it('defaults isCaptain to false when not provided', async () => {
    prisma.player.create.mockResolvedValue({
      id: 'player-1',
      firstName: 'Ada',
      lastName: 'Lovelace',
      jerseyNumber: 10,
      isCaptain: false,
    });

    const result = await service.create('org-1', 'tournament-1', 'team-1', {
      firstName: 'Ada',
      lastName: 'Lovelace',
      jerseyNumber: 10,
    });

    expect(prisma.player.create).toHaveBeenCalledWith({
      data: {
        teamId: 'team-1',
        firstName: 'Ada',
        lastName: 'Lovelace',
        jerseyNumber: 10,
        isCaptain: false,
      },
    });
    expect(result).toEqual({
      id: 'player-1',
      firstName: 'Ada',
      lastName: 'Lovelace',
      jerseyNumber: 10,
      isCaptain: false,
    });
  });

  it('rejects updating/removing a player from another team', async () => {
    prisma.player.findUnique.mockResolvedValue({
      id: 'player-1',
      teamId: 'other-team',
    });

    await expect(
      service.update('org-1', 'tournament-1', 'team-1', 'player-1', {
        firstName: 'X',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.remove('org-1', 'tournament-1', 'team-1', 'player-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
