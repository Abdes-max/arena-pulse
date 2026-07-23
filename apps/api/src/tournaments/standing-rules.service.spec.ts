import { NotFoundException } from '@nestjs/common';
import { GroupsService } from './groups.service';
import { PrismaService } from '../prisma/prisma.service';
import { StandingRulesService } from './standing-rules.service';
import { TournamentsService } from './tournaments.service';

type PrismaMock = {
  standingRule: { findUnique: jest.Mock; update: jest.Mock };
};

function createPrismaMock(): PrismaMock {
  return {
    standingRule: { findUnique: jest.fn(), update: jest.fn() },
  };
}

describe('StandingRulesService', () => {
  let prisma: PrismaMock;
  let tournamentsService: {
    assertTournamentIsEditable: jest.Mock;
    assertTournamentExists: jest.Mock;
  };
  let groupsService: { assertGroupExists: jest.Mock };
  let service: StandingRulesService;

  const rule = {
    groupId: 'group-1',
    winPoints: 3,
    drawPoints: 1,
    lossPoints: 0,
    tieBreakOrder: [
      'POINTS',
      'GOAL_DIFFERENCE',
      'GOALS_SCORED',
      'HEAD_TO_HEAD',
    ],
    supplementaryStandingEnabled: false,
    penaltyShootoutEnabled: false,
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
    groupsService = {
      assertGroupExists: jest.fn().mockResolvedValue({ id: 'group-1' }),
    };
    service = new StandingRulesService(
      prisma as unknown as PrismaService,
      tournamentsService as unknown as TournamentsService,
      groupsService as unknown as GroupsService,
    );
  });

  it('returns the standing rule for a group', async () => {
    prisma.standingRule.findUnique.mockResolvedValue(rule);

    const result = await service.get('org-1', 'tournament-1', 'group-1');

    expect(groupsService.assertGroupExists).toHaveBeenCalledWith(
      'tournament-1',
      'group-1',
    );
    expect(result).toEqual(rule);
  });

  it('throws if the group has no standing rule (should not happen in practice)', async () => {
    prisma.standingRule.findUnique.mockResolvedValue(null);

    await expect(
      service.get('org-1', 'tournament-1', 'group-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects updating the standing rule when the tournament is archived', async () => {
    tournamentsService.assertTournamentIsEditable.mockRejectedValue(
      new Error('archived'),
    );

    await expect(
      service.update('org-1', 'tournament-1', 'group-1', { winPoints: 5 }),
    ).rejects.toThrow('archived');
    expect(prisma.standingRule.update).not.toHaveBeenCalled();
  });

  it('updates the standing rule', async () => {
    prisma.standingRule.findUnique.mockResolvedValue(rule);
    prisma.standingRule.update.mockResolvedValue({ ...rule, winPoints: 5 });

    const result = await service.update('org-1', 'tournament-1', 'group-1', {
      winPoints: 5,
    });

    expect(prisma.standingRule.update).toHaveBeenCalledWith({
      where: { groupId: 'group-1' },
      data: {
        winPoints: 5,
        drawPoints: undefined,
        lossPoints: undefined,
        tieBreakOrder: undefined,
        supplementaryStandingEnabled: undefined,
        penaltyShootoutEnabled: undefined,
      },
    });
    expect(result.winPoints).toBe(5);
  });
});
