import { BadRequestException } from '@nestjs/common';
import { CompetitionPhaseType } from '../../generated/prisma/client';
import { PhasesService } from './phases.service';
import { PrismaService } from '../prisma/prisma.service';
import { ScheduleGenerationService } from './schedule-generation.service';
import { TournamentsService } from './tournaments.service';

type PrismaMock = {
  field: { findMany: jest.Mock };
  group: { findMany: jest.Mock };
  referee: { findMany: jest.Mock };
  team: { findMany: jest.Mock };
  competitionPhase: { update: jest.Mock };
  match: { create: jest.Mock; findMany: jest.Mock; deleteMany: jest.Mock };
  timeSlot: { create: jest.Mock; deleteMany: jest.Mock };
  matchOfficial: { create: jest.Mock; deleteMany: jest.Mock };
  $transaction: jest.Mock;
};

interface MatchCreateArgs {
  data: {
    groupId: string;
    homeTeamId: string;
    awayTeamId: string;
    timeSlotId: string;
    round: number;
  };
}

interface TimeSlotCreateArgs {
  data: { fieldId: string; startTime: Date; endTime: Date };
}

interface MatchOfficialCreateArgs {
  data: { matchId: string; refereeId?: string; refereeingTeamId?: string };
}

function createPrismaMock(): PrismaMock {
  let timeSlotCounter = 0;
  let matchCounter = 0;

  const mock: PrismaMock = {
    field: { findMany: jest.fn() },
    group: { findMany: jest.fn() },
    referee: { findMany: jest.fn().mockResolvedValue([]) },
    team: { findMany: jest.fn().mockResolvedValue([]) },
    competitionPhase: { update: jest.fn() },
    match: {
      create: jest.fn().mockImplementation(({ data }: MatchCreateArgs) => ({
        id: `match-${++matchCounter}`,
        ...data,
      })),
      findMany: jest.fn().mockResolvedValue([]),
      deleteMany: jest.fn(),
    },
    timeSlot: {
      create: jest.fn().mockImplementation(({ data }: TimeSlotCreateArgs) => ({
        id: `slot-${++timeSlotCounter}`,
        ...data,
      })),
      deleteMany: jest.fn(),
    },
    matchOfficial: { create: jest.fn(), deleteMany: jest.fn() },
    $transaction: jest.fn(),
  };
  mock.$transaction.mockImplementation((arg: unknown) =>
    Array.isArray(arg)
      ? Promise.all(arg)
      : (arg as (tx: PrismaMock) => unknown)(mock),
  );
  return mock;
}

function matchCreateCalls(prisma: PrismaMock): MatchCreateArgs['data'][] {
  return (prisma.match.create.mock.calls as [MatchCreateArgs][]).map(
    ([{ data }]) => data,
  );
}

function timeSlotCreateCalls(prisma: PrismaMock): TimeSlotCreateArgs['data'][] {
  return (prisma.timeSlot.create.mock.calls as [TimeSlotCreateArgs][]).map(
    ([{ data }]) => data,
  );
}

function matchOfficialCreateCalls(
  prisma: PrismaMock,
): MatchOfficialCreateArgs['data'][] {
  return (
    prisma.matchOfficial.create.mock.calls as [MatchOfficialCreateArgs][]
  ).map(([{ data }]) => data);
}

function team(id: string) {
  return { id, position: 0 };
}

describe('ScheduleGenerationService', () => {
  let prisma: PrismaMock;
  let tournamentsService: {
    assertTournamentIsEditable: jest.Mock;
    assertTournamentExists: jest.Mock;
  };
  let phasesService: { assertPhaseExists: jest.Mock };
  let service: ScheduleGenerationService;

  const basePhase = {
    id: 'phase-1',
    categoryId: 'category-1',
    type: CompetitionPhaseType.GROUP_STAGE,
    matchDurationMinutes: 15,
    breakDurationMinutes: 5,
    refereesPerMatch: 1,
  };

  beforeEach(() => {
    prisma = createPrismaMock();
    tournamentsService = {
      assertTournamentIsEditable: jest
        .fn()
        .mockResolvedValue({ id: 'tournament-1', teamsCanReferee: false }),
      assertTournamentExists: jest
        .fn()
        .mockResolvedValue({ id: 'tournament-1' }),
    };
    phasesService = {
      assertPhaseExists: jest.fn().mockResolvedValue({ ...basePhase }),
    };
    const knownFields = [{ id: 'field-1' }, { id: 'field-2' }];
    prisma.field.findMany.mockImplementation(
      ({ where }: { where: { id: { in: string[] } } }) =>
        Promise.resolve(
          knownFields.filter((field) => where.id.in.includes(field.id)),
        ),
    );
    service = new ScheduleGenerationService(
      prisma as unknown as PrismaService,
      tournamentsService as unknown as TournamentsService,
      phasesService as unknown as PhasesService,
    );
  });

  it('rejects generation when the tournament is archived', async () => {
    tournamentsService.assertTournamentIsEditable.mockRejectedValue(
      new Error('archived'),
    );

    await expect(
      service.generate('org-1', 'tournament-1', 'phase-1', {
        fieldIds: ['field-1'],
        startDateTime: '2026-08-01T09:00:00.000Z',
      }),
    ).rejects.toThrow('archived');
  });

  it('rejects generation on a knockout-type phase', async () => {
    phasesService.assertPhaseExists.mockResolvedValue({
      ...basePhase,
      type: CompetitionPhaseType.KNOCKOUT,
    });

    await expect(
      service.generate('org-1', 'tournament-1', 'phase-1', {
        fieldIds: ['field-1'],
        startDateTime: '2026-08-01T09:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a fieldId that does not belong to the tournament', async () => {
    prisma.field.findMany.mockResolvedValue([{ id: 'field-1' }]);

    await expect(
      service.generate('org-1', 'tournament-1', 'phase-1', {
        fieldIds: ['field-1', 'field-unknown'],
        startDateTime: '2026-08-01T09:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('generates n*(n-1)/2 matches across n-1 rounds for a single group of 4 teams', async () => {
    prisma.group.findMany.mockResolvedValue([
      {
        id: 'group-1',
        teams: [team('a'), team('b'), team('c'), team('d')],
      },
    ]);

    await service.generate('org-1', 'tournament-1', 'phase-1', {
      fieldIds: ['field-1'],
      startDateTime: '2026-08-01T09:00:00.000Z',
    });

    expect(prisma.match.create).toHaveBeenCalledTimes(6);
    expect(new Set(matchCreateCalls(prisma).map((data) => data.round))).toEqual(
      new Set([1, 2, 3]),
    );
  });

  it('merges fixtures from multiple groups in the same phase, sorted by round', async () => {
    prisma.group.findMany.mockResolvedValue([
      { id: 'group-1', teams: [team('a'), team('b')] },
      { id: 'group-2', teams: [team('c'), team('d')] },
    ]);

    await service.generate('org-1', 'tournament-1', 'phase-1', {
      fieldIds: ['field-1'],
      startDateTime: '2026-08-01T09:00:00.000Z',
    });

    // 1 round-robin match per group (2 teams each) = 2 matches total, both round 1
    expect(prisma.match.create).toHaveBeenCalledTimes(2);
    const groupIds = matchCreateCalls(prisma).map((data) => data.groupId);
    expect(new Set(groupIds)).toEqual(new Set(['group-1', 'group-2']));
  });

  it('distributes matches across fields with independent, increasing time cursors', async () => {
    prisma.group.findMany.mockResolvedValue([
      { id: 'group-1', teams: [team('a'), team('b'), team('c'), team('d')] },
    ]);

    await service.generate('org-1', 'tournament-1', 'phase-1', {
      fieldIds: ['field-1', 'field-2'],
      startDateTime: '2026-08-01T09:00:00.000Z',
    });

    const slotsByField = new Map<string, Date[]>();
    for (const data of timeSlotCreateCalls(prisma)) {
      const times = slotsByField.get(data.fieldId) ?? [];
      times.push(data.startTime);
      slotsByField.set(data.fieldId, times);
    }
    for (const times of slotsByField.values()) {
      const sorted = [...times].sort((a, b) => a.getTime() - b.getTime());
      expect(times).toEqual(sorted);
      const unique = new Set(times.map((t) => t.getTime()));
      expect(unique.size).toBe(times.length);
    }
  });

  it('assigns referees round-robin from the tournament pool', async () => {
    prisma.group.findMany.mockResolvedValue([
      { id: 'group-1', teams: [team('a'), team('b')] },
    ]);
    prisma.referee.findMany.mockResolvedValue([
      { id: 'ref-1' },
      { id: 'ref-2' },
    ]);
    phasesService.assertPhaseExists.mockResolvedValue({
      ...basePhase,
      refereesPerMatch: 1,
    });

    await service.generate('org-1', 'tournament-1', 'phase-1', {
      fieldIds: ['field-1'],
      startDateTime: '2026-08-01T09:00:00.000Z',
    });

    expect(prisma.matchOfficial.create).toHaveBeenCalledTimes(1);
    expect(matchOfficialCreateCalls(prisma)[0]).toMatchObject({
      refereeId: 'ref-1',
    });
  });

  it('includes eligible teams as officials when teamsCanReferee is enabled, excluding the two playing teams', async () => {
    tournamentsService.assertTournamentIsEditable.mockResolvedValue({
      id: 'tournament-1',
      teamsCanReferee: true,
    });
    prisma.group.findMany.mockResolvedValue([
      { id: 'group-1', teams: [team('a'), team('b')] },
    ]);
    prisma.referee.findMany.mockResolvedValue([]);
    prisma.team.findMany.mockResolvedValue([
      { id: 'a' },
      { id: 'b' },
      { id: 'c' },
    ]);

    await service.generate('org-1', 'tournament-1', 'phase-1', {
      fieldIds: ['field-1'],
      startDateTime: '2026-08-01T09:00:00.000Z',
    });

    expect(prisma.matchOfficial.create).toHaveBeenCalledTimes(1);
    expect(matchOfficialCreateCalls(prisma)[0]).toMatchObject({
      refereeingTeamId: 'c',
    });
  });

  it('degrades gracefully when the referee pool is smaller than refereesPerMatch', async () => {
    prisma.group.findMany.mockResolvedValue([
      { id: 'group-1', teams: [team('a'), team('b')] },
    ]);
    prisma.referee.findMany.mockResolvedValue([{ id: 'ref-1' }]);
    phasesService.assertPhaseExists.mockResolvedValue({
      ...basePhase,
      refereesPerMatch: 3,
    });

    await expect(
      service.generate('org-1', 'tournament-1', 'phase-1', {
        fieldIds: ['field-1'],
        startDateTime: '2026-08-01T09:00:00.000Z',
      }),
    ).resolves.not.toThrow();
    expect(prisma.matchOfficial.create).toHaveBeenCalledTimes(1);
  });
});
