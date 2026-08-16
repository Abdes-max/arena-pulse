import { BadRequestException, ConflictException } from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { StructurePresetFormat } from './dto/create-structure-preset.dto';
import { PrismaService } from '../prisma/prisma.service';
import { StructurePresetsService } from './structure-presets.service';
import { TournamentsService } from './tournaments.service';

type PrismaMock = {
  competitionPhase: { count: jest.Mock; create: jest.Mock };
  group: { create: jest.Mock };
  standingRule: { create: jest.Mock };
  team: { findMany: jest.Mock; update: jest.Mock };
  knockoutBracket: { create: jest.Mock };
  qualificationRule: { create: jest.Mock };
  crossGroupQualificationRule: { create: jest.Mock };
  $transaction: jest.Mock;
};

function team(id: string, position: number) {
  return { id, position, groupId: null };
}

function createPrismaMock(): PrismaMock {
  const mock: PrismaMock = {
    competitionPhase: {
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn(),
    },
    group: { create: jest.fn() },
    standingRule: { create: jest.fn() },
    team: { findMany: jest.fn().mockResolvedValue([]), update: jest.fn() },
    knockoutBracket: { create: jest.fn() },
    qualificationRule: { create: jest.fn() },
    crossGroupQualificationRule: { create: jest.fn() },
    $transaction: jest.fn(),
  };
  mock.$transaction.mockImplementation(
    (callback: (tx: PrismaMock) => unknown) => callback(mock),
  );
  let phaseCounter = 0;
  mock.competitionPhase.create.mockImplementation(({ data }) => {
    phaseCounter += 1;
    return Promise.resolve({ id: `phase-${phaseCounter}`, ...data });
  });
  let groupCounter = 0;
  mock.group.create.mockImplementation(({ data }) => {
    groupCounter += 1;
    return Promise.resolve({ id: `group-${groupCounter}`, ...data });
  });
  return mock;
}

const BASE_DTO = {
  format: StructurePresetFormat.POOLS_AND_KNOCKOUT,
  teamCount: 8,
  poolCount: 2,
  tiers: [{ name: 'Tableau final', qualifiersPerPool: 2 }],
};

describe('StructurePresetsService', () => {
  let prisma: PrismaMock;
  let tournamentsService: { assertTournamentIsEditable: jest.Mock };
  let categoriesService: { assertCategoryExists: jest.Mock };
  let service: StructurePresetsService;

  beforeEach(() => {
    prisma = createPrismaMock();
    tournamentsService = {
      assertTournamentIsEditable: jest
        .fn()
        .mockResolvedValue({ id: 'tournament-1' }),
    };
    categoriesService = {
      assertCategoryExists: jest.fn().mockResolvedValue({ id: 'category-1' }),
    };
    service = new StructurePresetsService(
      prisma as unknown as PrismaService,
      tournamentsService as unknown as TournamentsService,
      categoriesService as unknown as CategoriesService,
    );
    prisma.team.findMany.mockResolvedValue(
      Array.from({ length: 8 }, (_, i) => team(`team-${i + 1}`, i)),
    );
  });

  it('rejects when the tournament is not editable', async () => {
    tournamentsService.assertTournamentIsEditable.mockRejectedValue(
      new Error('archived'),
    );

    await expect(
      service.create('org-1', 'tournament-1', 'category-1', BASE_DTO),
    ).rejects.toThrow('archived');
  });

  it('rejects when the category already has phases', async () => {
    prisma.competitionPhase.count.mockResolvedValue(1);

    await expect(
      service.create('org-1', 'tournament-1', 'category-1', BASE_DTO),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects when pool count exceeds team count', async () => {
    await expect(
      service.create('org-1', 'tournament-1', 'category-1', {
        ...BASE_DTO,
        teamCount: 2,
        poolCount: 4,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects when the cumulative qualifiersPerPool across tiers exceeds the smallest pool size', async () => {
    // 8 teams / 3 pools -> smallest pool has 2 teams, can't qualify 3.
    await expect(
      service.create('org-1', 'tournament-1', 'category-1', {
        ...BASE_DTO,
        teamCount: 8,
        poolCount: 3,
        tiers: [{ name: 'Tableau final', qualifiersPerPool: 3 }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects when a tier resulting bracket size is not a power of two', async () => {
    // 3 pools x 2 qualifiers = 6 -- not a power of two.
    prisma.team.findMany.mockResolvedValue(
      Array.from({ length: 9 }, (_, i) => team(`team-${i + 1}`, i)),
    );
    await expect(
      service.create('org-1', 'tournament-1', 'category-1', {
        ...BASE_DTO,
        teamCount: 9,
        poolCount: 3,
        tiers: [{ name: 'Tableau final', qualifiersPerPool: 2 }],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects when the number of unassigned teams does not match teamCount', async () => {
    prisma.team.findMany.mockResolvedValue([
      team('team-1', 0),
      team('team-2', 1),
    ]);

    await expect(
      service.create('org-1', 'tournament-1', 'category-1', BASE_DTO),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  describe('bestOfPosition validation', () => {
    const DTO_48_TEAMS = {
      ...BASE_DTO,
      teamCount: 48,
      poolCount: 12,
      tiers: [{ name: 'Huitièmes de finale', qualifiersPerPool: 2 }],
    };

    beforeEach(() => {
      prisma.team.findMany.mockResolvedValue(
        Array.from({ length: 48 }, (_, i) => team(`team-${i + 1}`, i)),
      );
    });

    it('rejects a bestCount greater than the number of pools', async () => {
      await expect(
        service.create('org-1', 'tournament-1', 'category-1', {
          ...DTO_48_TEAMS,
          bestOfPosition: { position: 3, bestCount: 13 },
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a position overlapping the direct qualifiers', async () => {
      await expect(
        service.create('org-1', 'tournament-1', 'category-1', {
          ...DTO_48_TEAMS,
          bestOfPosition: { position: 2, bestCount: 8 },
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a position beyond the smallest pool size', async () => {
      await expect(
        service.create('org-1', 'tournament-1', 'category-1', {
          ...DTO_48_TEAMS,
          bestOfPosition: { position: 5, bestCount: 8 },
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('accepts the headline example (12 pools x 2 direct + 8 best-thirds = 32) and folds bestOfPosition into tier 0’s bracket size', async () => {
      const result = await service.create(
        'org-1',
        'tournament-1',
        'category-1',
        {
          ...DTO_48_TEAMS,
          bestOfPosition: { position: 3, bestCount: 8 },
        },
      );

      expect(prisma.knockoutBracket.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ size: 32 }) as unknown,
      });
      expect(prisma.crossGroupQualificationRule.create).toHaveBeenCalledWith({
        data: {
          phaseId: 'phase-1',
          position: 3,
          bestCount: 8,
          targetPhaseId: 'phase-2',
        },
      });
      expect(result.tiers).toEqual([
        { phaseId: 'phase-2', name: 'Huitièmes de finale', bracketSize: 32 },
      ]);
    });
  });

  it('creates the pool phase, balanced pools, one knockout tier per palier, and its qualification rules -- without scheduling any matches', async () => {
    const result = await service.create(
      'org-1',
      'tournament-1',
      'category-1',
      BASE_DTO,
    );

    expect(prisma.competitionPhase.create).toHaveBeenCalledTimes(2);
    expect(prisma.group.create).toHaveBeenCalledTimes(2);
    expect(prisma.group.create).toHaveBeenNthCalledWith(1, {
      data: { phaseId: 'phase-1', name: 'Poule A', position: 0 },
    });
    expect(prisma.group.create).toHaveBeenNthCalledWith(2, {
      data: { phaseId: 'phase-1', name: 'Poule B', position: 1 },
    });
    expect(prisma.standingRule.create).toHaveBeenCalledTimes(2);

    // 8 teams round-robin over 2 pools -> 4 each, alternating.
    expect(prisma.team.update).toHaveBeenCalledTimes(8);
    expect(prisma.team.update).toHaveBeenNthCalledWith(1, {
      where: { id: 'team-1' },
      data: { groupId: 'group-1' },
    });
    expect(prisma.team.update).toHaveBeenNthCalledWith(2, {
      where: { id: 'team-2' },
      data: { groupId: 'group-2' },
    });

    expect(prisma.knockoutBracket.create).toHaveBeenCalledWith({
      data: {
        phaseId: 'phase-2',
        name: 'Tableau final',
        size: 4,
        hasRankingMatch: false,
      },
    });
    expect(prisma.qualificationRule.create).toHaveBeenCalledTimes(2);
    expect(prisma.qualificationRule.create).toHaveBeenCalledWith({
      data: {
        groupId: 'group-1',
        fromPosition: 1,
        toPosition: 2,
        targetPhaseId: 'phase-2',
      },
    });
    expect(prisma.crossGroupQualificationRule.create).not.toHaveBeenCalled();

    expect(result).toEqual({
      groupPhaseId: 'phase-1',
      tiers: [{ phaseId: 'phase-2', name: 'Tableau final', bracketSize: 4 }],
    });
  });

  it('creates multiple tiers, each with its own phase/bracket and a slice of the standing positions', async () => {
    const result = await service.create('org-1', 'tournament-1', 'category-1', {
      ...BASE_DTO,
      teamCount: 8,
      poolCount: 2,
      tiers: [
        { name: 'Ligue des Champions', qualifiersPerPool: 1 },
        { name: 'Europa League', qualifiersPerPool: 1 },
      ],
    });

    expect(prisma.competitionPhase.create).toHaveBeenCalledTimes(3);
    expect(prisma.knockoutBracket.create).toHaveBeenCalledTimes(2);
    expect(prisma.knockoutBracket.create).toHaveBeenNthCalledWith(1, {
      data: {
        phaseId: 'phase-2',
        name: 'Ligue des Champions',
        size: 2,
        hasRankingMatch: false,
      },
    });
    expect(prisma.knockoutBracket.create).toHaveBeenNthCalledWith(2, {
      data: {
        phaseId: 'phase-3',
        name: 'Europa League',
        size: 2,
        hasRankingMatch: false,
      },
    });

    // Tier 1 (Champions League) claims position 1 in every pool, tier 2
    // (Europa League) claims position 2 -- no overlap.
    expect(prisma.qualificationRule.create).toHaveBeenCalledWith({
      data: {
        groupId: 'group-1',
        fromPosition: 1,
        toPosition: 1,
        targetPhaseId: 'phase-2',
      },
    });
    expect(prisma.qualificationRule.create).toHaveBeenCalledWith({
      data: {
        groupId: 'group-1',
        fromPosition: 2,
        toPosition: 2,
        targetPhaseId: 'phase-3',
      },
    });

    expect(result.tiers).toEqual([
      { phaseId: 'phase-2', name: 'Ligue des Champions', bracketSize: 2 },
      { phaseId: 'phase-3', name: 'Europa League', bracketSize: 2 },
    ]);
  });

  it('passes hasRankingMatch through to the bracket it creates, per tier', async () => {
    await service.create('org-1', 'tournament-1', 'category-1', {
      ...BASE_DTO,
      tiers: [
        { name: 'Tableau final', qualifiersPerPool: 2, hasRankingMatch: true },
      ],
    });

    expect(prisma.knockoutBracket.create).toHaveBeenCalledWith({
      data: {
        phaseId: 'phase-2',
        name: 'Tableau final',
        size: 4,
        hasRankingMatch: true,
      },
    });
  });

  describe('format: POOLS_ONLY', () => {
    const DTO = {
      format: StructurePresetFormat.POOLS_ONLY,
      teamCount: 8,
      poolCount: 2,
    };

    it('creates the pool phase and its pools, no knockout phase at all', async () => {
      const result = await service.create(
        'org-1',
        'tournament-1',
        'category-1',
        DTO,
      );

      expect(prisma.competitionPhase.create).toHaveBeenCalledTimes(1);
      expect(prisma.competitionPhase.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: 'Phase de poules',
        }) as unknown,
      });
      expect(prisma.group.create).toHaveBeenCalledTimes(2);
      expect(prisma.team.update).toHaveBeenCalledTimes(8);
      expect(prisma.knockoutBracket.create).not.toHaveBeenCalled();
      expect(prisma.qualificationRule.create).not.toHaveBeenCalled();
      expect(result).toEqual({ groupPhaseId: 'phase-1', tiers: [] });
    });

    it('does not require tiers to be present', async () => {
      await expect(
        service.create('org-1', 'tournament-1', 'category-1', DTO),
      ).resolves.toBeDefined();
    });
  });

  describe('format: KNOCKOUT_ONLY', () => {
    beforeEach(() => {
      prisma.team.findMany.mockResolvedValue(
        Array.from({ length: 8 }, (_, i) => team(`team-${i + 1}`, i)),
      );
    });

    it('creates a single seed pool with every team, a knockout phase, one bracket, and one qualification rule spanning every team', async () => {
      const result = await service.create(
        'org-1',
        'tournament-1',
        'category-1',
        {
          format: StructurePresetFormat.KNOCKOUT_ONLY,
          teamCount: 8,
        },
      );

      expect(prisma.competitionPhase.create).toHaveBeenNthCalledWith(1, {
        data: {
          categoryId: 'category-1',
          name: 'Équipes engagées',
          type: 'GROUP_STAGE',
          position: 0,
          isSeedPhase: true,
        },
      });
      expect(prisma.group.create).toHaveBeenCalledTimes(1);
      expect(prisma.group.create).toHaveBeenCalledWith({
        data: { phaseId: 'phase-1', name: 'Équipes engagées', position: 0 },
      });
      expect(prisma.team.update).toHaveBeenCalledTimes(8);
      expect(prisma.team.update).toHaveBeenNthCalledWith(1, {
        where: { id: 'team-1' },
        data: { groupId: 'group-1' },
      });

      expect(prisma.competitionPhase.create).toHaveBeenNthCalledWith(2, {
        data: {
          categoryId: 'category-1',
          name: 'Tableau final',
          type: 'KNOCKOUT',
          position: 1,
        },
      });
      expect(prisma.knockoutBracket.create).toHaveBeenCalledWith({
        data: {
          phaseId: 'phase-2',
          name: 'Tableau final',
          size: 8,
          hasRankingMatch: false,
        },
      });
      expect(prisma.qualificationRule.create).toHaveBeenCalledTimes(1);
      expect(prisma.qualificationRule.create).toHaveBeenCalledWith({
        data: {
          groupId: 'group-1',
          fromPosition: 1,
          toPosition: 8,
          targetPhaseId: 'phase-2',
        },
      });

      expect(result).toEqual({
        groupPhaseId: 'phase-1',
        tiers: [{ phaseId: 'phase-2', name: 'Tableau final', bracketSize: 8 }],
      });
    });

    it('passes hasRankingMatch through to the bracket it creates', async () => {
      await service.create('org-1', 'tournament-1', 'category-1', {
        format: StructurePresetFormat.KNOCKOUT_ONLY,
        teamCount: 8,
        hasRankingMatch: true,
      });

      expect(prisma.knockoutBracket.create).toHaveBeenCalledWith({
        data: {
          phaseId: 'phase-2',
          name: 'Tableau final',
          size: 8,
          hasRankingMatch: true,
        },
      });
    });

    it('uses knockoutName when provided instead of the default name', async () => {
      await service.create('org-1', 'tournament-1', 'category-1', {
        format: StructurePresetFormat.KNOCKOUT_ONLY,
        teamCount: 8,
        knockoutName: 'Coupe des Champions',
      });

      expect(prisma.competitionPhase.create).toHaveBeenNthCalledWith(2, {
        data: {
          categoryId: 'category-1',
          name: 'Coupe des Champions',
          type: 'KNOCKOUT',
          position: 1,
        },
      });
    });

    it('ignores match duration / break / referee / double round-robin settings on the seed phase', async () => {
      await service.create('org-1', 'tournament-1', 'category-1', {
        format: StructurePresetFormat.KNOCKOUT_ONLY,
        teamCount: 8,
        matchDurationMinutes: 20,
        breakDurationMinutes: 5,
        refereesPerMatch: 2,
        doubleRoundRobin: true,
      });

      expect(prisma.competitionPhase.create).toHaveBeenNthCalledWith(1, {
        data: {
          categoryId: 'category-1',
          name: 'Équipes engagées',
          type: 'GROUP_STAGE',
          position: 0,
          isSeedPhase: true,
        },
      });
    });

    it('rejects a team count that is not a power of two', async () => {
      prisma.team.findMany.mockResolvedValue(
        Array.from({ length: 6 }, (_, i) => team(`team-${i + 1}`, i)),
      );

      await expect(
        service.create('org-1', 'tournament-1', 'category-1', {
          format: StructurePresetFormat.KNOCKOUT_ONLY,
          teamCount: 6,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });
});
