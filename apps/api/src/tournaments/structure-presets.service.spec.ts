import { BadRequestException, ConflictException } from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { PrismaService } from '../prisma/prisma.service';
import { ScheduleGenerationService } from './schedule-generation.service';
import { StructurePresetsService } from './structure-presets.service';
import { TournamentsService } from './tournaments.service';

type PrismaMock = {
  competitionPhase: { count: jest.Mock; create: jest.Mock };
  group: { create: jest.Mock };
  standingRule: { create: jest.Mock };
  team: { findMany: jest.Mock; update: jest.Mock };
  knockoutBracket: { create: jest.Mock };
  qualificationRule: { create: jest.Mock };
  field: { findMany: jest.Mock };
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
    field: { findMany: jest.fn() },
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
  teamCount: 8,
  poolCount: 2,
  qualifiersPerPool: 2,
  fieldIds: ['field-1'],
  startDateTime: '2026-09-01T09:00:00.000Z',
  knockoutFieldIds: ['field-1'],
  knockoutStartDateTime: '2026-09-02T09:00:00.000Z',
};

describe('StructurePresetsService', () => {
  let prisma: PrismaMock;
  let tournamentsService: { assertTournamentIsEditable: jest.Mock };
  let categoriesService: { assertCategoryExists: jest.Mock };
  let scheduleGenerationService: { generate: jest.Mock };
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
    scheduleGenerationService = { generate: jest.fn().mockResolvedValue([]) };
    service = new StructurePresetsService(
      prisma as unknown as PrismaService,
      tournamentsService as unknown as TournamentsService,
      categoriesService as unknown as CategoriesService,
      scheduleGenerationService as unknown as ScheduleGenerationService,
    );
    prisma.field.findMany.mockResolvedValue([{ id: 'field-1' }]);
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

  it('rejects when qualifiersPerPool exceeds the smallest pool size', async () => {
    // 8 teams / 3 pools -> smallest pool has 2 teams, can't qualify 3.
    await expect(
      service.create('org-1', 'tournament-1', 'category-1', {
        ...BASE_DTO,
        teamCount: 8,
        poolCount: 3,
        qualifiersPerPool: 3,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects when the resulting bracket size is not a power of two', async () => {
    // 3 pools x 2 qualifiers = 6 -- not a power of two.
    prisma.team.findMany.mockResolvedValue(
      Array.from({ length: 9 }, (_, i) => team(`team-${i + 1}`, i)),
    );
    await expect(
      service.create('org-1', 'tournament-1', 'category-1', {
        ...BASE_DTO,
        teamCount: 9,
        poolCount: 3,
        qualifiersPerPool: 2,
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

  it('rejects when a field does not belong to the tournament', async () => {
    prisma.field.findMany.mockResolvedValue([]);

    await expect(
      service.create('org-1', 'tournament-1', 'category-1', BASE_DTO),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('creates the pool phase, balanced pools, knockout phase/bracket, qualification rules, and generates the pool calendar', async () => {
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
        plannedFieldIds: ['field-1'],
        plannedStartDateTime: new Date('2026-09-02T09:00:00.000Z'),
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

    expect(scheduleGenerationService.generate).toHaveBeenCalledWith(
      'org-1',
      'tournament-1',
      'phase-1',
      {
        fieldIds: ['field-1'],
        startDateTime: '2026-09-01T09:00:00.000Z',
        matchDurationMinutes: undefined,
        breakDurationMinutes: undefined,
        refereesPerMatch: undefined,
      },
    );

    expect(result).toEqual({
      groupPhaseId: 'phase-1',
      knockoutPhaseId: 'phase-2',
      bracketSize: 4,
    });
  });
});
