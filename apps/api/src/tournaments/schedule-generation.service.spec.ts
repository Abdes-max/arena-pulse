import { BadRequestException, ConflictException } from '@nestjs/common';
import {
  CompetitionPhaseType,
  MatchStatus,
} from '../../generated/prisma/client';
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
  match: {
    create: jest.Mock;
    findMany: jest.Mock;
    deleteMany: jest.Mock;
    count: jest.Mock;
  };
  timeSlot: {
    create: jest.Mock;
    deleteMany: jest.Mock;
    findMany: jest.Mock;
    update: jest.Mock;
  };
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
      count: jest.fn().mockResolvedValue(0),
    },
    timeSlot: {
      create: jest.fn().mockImplementation(({ data }: TimeSlotCreateArgs) => ({
        id: `slot-${++timeSlotCounter}`,
        ...data,
      })),
      deleteMany: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockImplementation((args: unknown) => args),
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
    const knownFields = [
      { id: 'field-1' },
      { id: 'field-2' },
      { id: 'field-3' },
    ];
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

  it('replaces a not-yet-played calendar when generating again', async () => {
    prisma.match.findMany.mockResolvedValueOnce([
      { id: 'old-1', timeSlotId: 'old-slot-1', status: MatchStatus.SCHEDULED },
    ]);
    prisma.group.findMany.mockResolvedValue([
      { id: 'group-1', teams: [team('a'), team('b')] },
    ]);

    await service.generate('org-1', 'tournament-1', 'phase-1', {
      fieldIds: ['field-1'],
      startDateTime: '2026-08-01T09:00:00.000Z',
    });

    expect(prisma.match.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['old-1'] } },
    });
    expect(prisma.timeSlot.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['old-slot-1'] } },
    });
    expect(prisma.match.create).toHaveBeenCalledTimes(1);
  });

  it('refuses to regenerate once a match of the phase has started', async () => {
    prisma.match.findMany.mockResolvedValueOnce([
      { id: 'old-1', timeSlotId: 'old-slot-1', status: MatchStatus.LIVE },
    ]);

    await expect(
      service.generate('org-1', 'tournament-1', 'phase-1', {
        fieldIds: ['field-1'],
        startDateTime: '2026-08-01T09:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.match.deleteMany).not.toHaveBeenCalled();
  });

  describe('shift', () => {
    const slot = (id: string, fieldId: string, start: string, end: string) => ({
      id,
      fieldId,
      startTime: new Date(start),
      endTime: new Date(end),
    });

    it('moves every upcoming match of the phase by the given minutes', async () => {
      prisma.match.findMany.mockResolvedValueOnce([
        {
          timeSlot: slot(
            's1',
            'field-1',
            '2026-08-01T09:00:00.000Z',
            '2026-08-01T09:15:00.000Z',
          ),
        },
        {
          timeSlot: slot(
            's2',
            'field-2',
            '2026-08-01T09:00:00.000Z',
            '2026-08-01T09:15:00.000Z',
          ),
        },
      ]);

      await service.shift('org-1', 'tournament-1', 'phase-1', { minutes: 5 });

      expect(prisma.timeSlot.update).toHaveBeenCalledWith({
        where: { id: 's1' },
        data: {
          startTime: new Date('2026-08-01T09:05:00.000Z'),
          endTime: new Date('2026-08-01T09:20:00.000Z'),
        },
      });
      expect(prisma.timeSlot.update).toHaveBeenCalledTimes(2);
    });

    it('rejects a shift that would overlap another slot on the same field', async () => {
      prisma.match.findMany.mockResolvedValueOnce([
        {
          timeSlot: slot(
            's1',
            'field-1',
            '2026-08-01T09:00:00.000Z',
            '2026-08-01T09:15:00.000Z',
          ),
        },
      ]);
      prisma.timeSlot.findMany.mockResolvedValue([
        slot(
          'other',
          'field-1',
          '2026-08-01T08:40:00.000Z',
          '2026-08-01T08:55:00.000Z',
        ),
      ]);

      await expect(
        service.shift('org-1', 'tournament-1', 'phase-1', { minutes: -10 }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.timeSlot.update).not.toHaveBeenCalled();
    });

    it('rejects when no upcoming match is left to move', async () => {
      await expect(
        service.shift('org-1', 'tournament-1', 'phase-1', { minutes: 5 }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
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

  it('never schedules a team in two simultaneous matches when there are more fields than matches per round', async () => {
    prisma.group.findMany.mockResolvedValue([
      {
        id: 'group-1',
        teams: ['a', 'b', 'c', 'd'].map((id) => team(id)),
      },
    ]);

    // 2 matches per round on 3 fields: field-cursor scheduling used to start a
    // round-2 match on the third field alongside round 1.
    await service.generate('org-1', 'tournament-1', 'phase-1', {
      fieldIds: ['field-1', 'field-2', 'field-3'],
      startDateTime: '2026-08-01T09:00:00.000Z',
    });

    const startTimes = timeSlotCreateCalls(prisma).map((data) =>
      data.startTime.getTime(),
    );
    const teamsByStart = new Map<number, string[]>();
    matchCreateCalls(prisma).forEach((data, index) => {
      const teams = teamsByStart.get(startTimes[index]) ?? [];
      teams.push(data.homeTeamId, data.awayTeamId);
      teamsByStart.set(startTimes[index], teams);
    });
    expect(matchCreateCalls(prisma)).toHaveLength(6);
    for (const teams of teamsByStart.values()) {
      expect(new Set(teams).size).toBe(teams.length);
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
