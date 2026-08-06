import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { BracketsService } from './brackets.service';
import { CategoriesService } from './categories.service';
import { CrossGroupQualificationRulesService } from './cross-group-qualification-rules.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from './realtime.service';
import { StandingsService } from './standings.service';
import { TournamentsService } from './tournaments.service';

type PrismaMock = {
  knockoutBracket: { findUnique: jest.Mock };
  competitionPhase: { findMany: jest.Mock; findFirst: jest.Mock };
  group: { findUnique: jest.Mock };
  match: {
    count: jest.Mock;
    create: jest.Mock;
    createMany: jest.Mock;
    findMany: jest.Mock;
    findFirst: jest.Mock;
    update: jest.Mock;
  };
  qualificationRule: { findMany: jest.Mock };
  crossGroupQualificationRule: { findMany: jest.Mock };
  timeSlot: { findMany: jest.Mock; create: jest.Mock };
  field: { findMany: jest.Mock };
  $transaction: jest.Mock;
};

function createPrismaMock(): PrismaMock {
  const mock: PrismaMock = {
    knockoutBracket: { findUnique: jest.fn() },
    competitionPhase: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn(),
    },
    group: { findUnique: jest.fn() },
    match: {
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn((args: { data: Record<string, unknown> }) => ({
        ...args.data,
        id: 'created-match',
        homeTeam: null,
        awayTeam: null,
        forfeitedTeam: null,
        timeSlot: null,
        officials: [],
        score: null,
      })),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn(),
      update: jest.fn((args: { data: Record<string, unknown> }) => ({
        ...args.data,
      })),
    },
    qualificationRule: { findMany: jest.fn().mockResolvedValue([]) },
    crossGroupQualificationRule: { findMany: jest.fn().mockResolvedValue([]) },
    // Only exercised when a round is reserved onto fields (generateMatches
    // with fieldIds, or tryAdvanceRound picking up such a reservation) --
    // no existing single-bracket test does either, so an empty result is
    // the correct default there.
    timeSlot: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn() },
    field: { findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn(),
  };
  mock.$transaction.mockImplementation(
    (callback: (tx: PrismaMock) => unknown) => callback(mock),
  );
  let timeSlotCounter = 0;
  mock.timeSlot.create.mockImplementation(
    ({ data }: { data: Record<string, unknown> }) => {
      timeSlotCounter += 1;
      return Promise.resolve({ id: `slot-${timeSlotCounter}`, ...data });
    },
  );
  return mock;
}

const TOURNAMENT_ID = 'tournament-1';

function bracketFixture(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'bracket-1',
    phaseId: 'phase-1',
    name: 'Champions League',
    size: 4,
    hasRankingMatch: false,
    phase: { category: { tournamentId: TOURNAMENT_ID } },
    ...overrides,
  };
}

function standingsFixture(teamIds: string[], isComplete = true) {
  return {
    rows: teamIds.map((teamId, index) => ({
      teamId,
      teamName: teamId,
      position: index + 1,
      played: 0,
      won: 0,
      drawn: 0,
      lost: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      goalDifference: 0,
      points: 0,
    })),
    isComplete,
    unresolvedTies: [] as { teams: { id: string; name: string }[] }[],
  };
}

// One CompetitionPhase row (type KNOCKOUT) with its bracket nested, the
// shape returned by the `competitionPhase.findMany({ include: {
// knockoutBracket: true } })` query generateAllMatches issues.
function knockoutPhaseFixture(
  overrides: Partial<Record<string, unknown>> = {},
) {
  return {
    id: 'phase-ko-1',
    name: 'Tableau final',
    position: 1,
    categoryId: 'category-1',
    matchDurationMinutes: 15,
    breakDurationMinutes: 5,
    category: { tournamentId: TOURNAMENT_ID },
    knockoutBracket: {
      id: 'bracket-1',
      phaseId: 'phase-ko-1',
      name: 'Tableau final',
      size: 2,
      hasRankingMatch: false,
    },
    ...overrides,
  };
}

describe('BracketsService', () => {
  let prisma: PrismaMock;
  let tournamentsService: {
    assertTournamentIsEditable: jest.Mock;
    assertTournamentExists: jest.Mock;
  };
  let categoriesService: { assertCategoryExists: jest.Mock };
  let standingsService: { getStandings: jest.Mock };
  let crossGroupQualificationRulesService: { resolveSlots: jest.Mock };
  let realtimeService: { emit: jest.Mock };
  let service: BracketsService;

  beforeEach(() => {
    prisma = createPrismaMock();
    tournamentsService = {
      assertTournamentIsEditable: jest
        .fn()
        .mockResolvedValue({ id: TOURNAMENT_ID }),
      assertTournamentExists: jest
        .fn()
        .mockResolvedValue({ id: TOURNAMENT_ID }),
    };
    categoriesService = {
      assertCategoryExists: jest.fn().mockResolvedValue({ id: 'category-1' }),
    };
    standingsService = { getStandings: jest.fn() };
    crossGroupQualificationRulesService = {
      resolveSlots: jest.fn().mockResolvedValue([]),
    };
    realtimeService = { emit: jest.fn() };
    service = new BracketsService(
      prisma as unknown as PrismaService,
      tournamentsService as unknown as TournamentsService,
      categoriesService as unknown as CategoriesService,
      standingsService as unknown as StandingsService,
      realtimeService as unknown as RealtimeService,
      crossGroupQualificationRulesService as unknown as CrossGroupQualificationRulesService,
    );
  });

  describe('generateMatches', () => {
    it('rejects a bracket from another tournament', async () => {
      prisma.knockoutBracket.findUnique.mockResolvedValue(
        bracketFixture({ phase: { category: { tournamentId: 'other' } } }),
      );

      await expect(
        service.generateMatches('org-1', TOURNAMENT_ID, 'bracket-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects when matches already exist for this bracket', async () => {
      prisma.knockoutBracket.findUnique.mockResolvedValue(bracketFixture());
      prisma.match.count.mockResolvedValue(4);

      await expect(
        service.generateMatches('org-1', TOURNAMENT_ID, 'bracket-1'),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects a bracket size that is not a power of two', async () => {
      prisma.knockoutBracket.findUnique.mockResolvedValue(
        bracketFixture({ size: 6 }),
      );

      await expect(
        service.generateMatches('org-1', TOURNAMENT_ID, 'bracket-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects when the number of qualified teams does not match the bracket size', async () => {
      prisma.knockoutBracket.findUnique.mockResolvedValue(
        bracketFixture({ size: 4 }),
      );
      prisma.qualificationRule.findMany.mockResolvedValue([
        {
          groupId: 'group-a',
          fromPosition: 1,
          toPosition: 2,
          group: { name: 'Poule A' },
        },
      ]);
      standingsService.getStandings.mockResolvedValue(
        standingsFixture(['t1', 't2']),
      );

      await expect(
        service.generateMatches('org-1', TOURNAMENT_ID, 'bracket-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('seeds round 1 with the standard bracket pairing for a 4-team bracket, and creates round 2 as an undetermined placeholder', async () => {
      prisma.knockoutBracket.findUnique.mockResolvedValue(
        bracketFixture({ size: 4 }),
      );
      prisma.qualificationRule.findMany.mockResolvedValue([
        {
          groupId: 'group-a',
          fromPosition: 1,
          toPosition: 2,
          group: { name: 'Poule A' },
        },
        {
          groupId: 'group-b',
          fromPosition: 1,
          toPosition: 2,
          group: { name: 'Poule B' },
        },
      ]);
      standingsService.getStandings.mockImplementation(
        (_org: string, _tournament: string, groupId: string) =>
          Promise.resolve(
            standingsFixture(
              groupId === 'group-a' ? ['a1', 'a2'] : ['b1', 'b2'],
            ),
          ),
      );

      await service.generateMatches('org-1', TOURNAMENT_ID, 'bracket-1');

      // Seed order is [1,4,2,3]: seed1=a1, seed2=b1, seed3=a2, seed4=b2 (all
      // rank-1s first, then all rank-2s, alphabetical by group name within a
      // rank) => pairs (a1 v b2) and (b1 v a2).
      expect(prisma.match.create).toHaveBeenCalledWith({
        data: {
          knockoutBracketId: 'bracket-1',
          round: 1,
          bracketSlot: 0,
          isThirdPlaceMatch: false,
          homeTeamId: 'a1',
          awayTeamId: 'b2',
          homeSourceLabel: null,
          awaySourceLabel: null,
        },
        include: expect.anything() as unknown,
      });
      expect(prisma.match.create).toHaveBeenCalledWith({
        data: {
          knockoutBracketId: 'bracket-1',
          round: 1,
          bracketSlot: 1,
          isThirdPlaceMatch: false,
          homeTeamId: 'b1',
          awayTeamId: 'a2',
          homeSourceLabel: null,
          awaySourceLabel: null,
        },
        include: expect.anything() as unknown,
      });
      // The final (round 2) is created up front too, but with no opponents
      // yet -- that's the whole point: the organizer can see/schedule the
      // full bracket immediately, not just round 1. It gets a descriptive
      // placeholder label instead of a real team ("round 1" of a 4-team
      // bracket is the semifinal stage).
      expect(prisma.match.create).toHaveBeenCalledWith({
        data: {
          knockoutBracketId: 'bracket-1',
          round: 2,
          bracketSlot: 0,
          isThirdPlaceMatch: false,
          homeTeamId: null,
          awayTeamId: null,
          homeSourceLabel: 'Vainqueur Demi-finale 1',
          awaySourceLabel: 'Vainqueur Demi-finale 2',
        },
        include: expect.anything() as unknown,
      });
      expect(prisma.match.create).toHaveBeenCalledTimes(3);
    });

    it('withholds a position covered by an unresolved tie even though the pool is complete', async () => {
      prisma.knockoutBracket.findUnique.mockResolvedValue(
        bracketFixture({ size: 2 }),
      );
      prisma.qualificationRule.findMany.mockResolvedValue([
        {
          groupId: 'group-a',
          fromPosition: 1,
          toPosition: 2,
          group: { name: 'Poule A' },
        },
      ]);
      standingsService.getStandings.mockResolvedValue({
        ...standingsFixture(['a1', 'a2']),
        unresolvedTies: [
          {
            teams: [
              { id: 'a1', name: 'a1' },
              { id: 'a2', name: 'a2' },
            ],
          },
        ],
      });

      await service.generateMatches('org-1', TOURNAMENT_ID, 'bracket-1');

      // Both a1 and a2 sit at a position covered by the unresolved tie --
      // neither gets assigned, even though the pool itself is complete;
      // only the descriptive placeholder label is shown until the
      // organizer picks who's actually 1st vs 2nd.
      expect(prisma.match.create).toHaveBeenCalledWith({
        data: {
          knockoutBracketId: 'bracket-1',
          round: 1,
          bracketSlot: 0,
          isThirdPlaceMatch: false,
          homeTeamId: null,
          awayTeamId: null,
          homeSourceLabel: '1er Poule A',
          awaySourceLabel: '2e Poule A',
        },
        include: expect.anything() as unknown,
      });
    });

    it('appends cross-group (best-of-position) qualifiers after the direct per-group qualifiers', async () => {
      prisma.knockoutBracket.findUnique.mockResolvedValue(
        bracketFixture({ size: 4 }),
      );
      prisma.qualificationRule.findMany.mockResolvedValue([
        {
          groupId: 'group-a',
          fromPosition: 1,
          toPosition: 1,
          group: { name: 'Poule A' },
        },
      ]);
      standingsService.getStandings.mockResolvedValue(standingsFixture(['a1']));
      crossGroupQualificationRulesService.resolveSlots.mockResolvedValue([
        { teamId: 'x1', label: '1er meilleur 3e' },
        { teamId: 'x2', label: '2e meilleur 3e' },
        { teamId: 'x3', label: '3e meilleur 3e' },
      ]);

      await service.generateMatches('org-1', TOURNAMENT_ID, 'bracket-1');

      expect(
        crossGroupQualificationRulesService.resolveSlots,
      ).toHaveBeenCalledWith('org-1', TOURNAMENT_ID, 'phase-1');
      // Direct qualifier a1 comes first, then the 3 cross-group qualifiers in
      // their own rank order -- seed order [1,4,2,3] pairs slot0 = (a1, x3)
      // and slot1 = (x1, x2).
      expect(prisma.match.create).toHaveBeenCalledWith({
        data: {
          knockoutBracketId: 'bracket-1',
          round: 1,
          bracketSlot: 0,
          isThirdPlaceMatch: false,
          homeTeamId: 'a1',
          awayTeamId: 'x3',
          homeSourceLabel: null,
          awaySourceLabel: null,
        },
        include: expect.anything() as unknown,
      });
      expect(prisma.match.create).toHaveBeenCalledWith({
        data: {
          knockoutBracketId: 'bracket-1',
          round: 1,
          bracketSlot: 1,
          isThirdPlaceMatch: false,
          homeTeamId: 'x1',
          awayTeamId: 'x2',
          homeSourceLabel: null,
          awaySourceLabel: null,
        },
        include: expect.anything() as unknown,
      });
    });

    it('creates round-1 matches with placeholder labels instead of real teams while the feeding pools are still incomplete', async () => {
      prisma.knockoutBracket.findUnique.mockResolvedValue(
        bracketFixture({ size: 4 }),
      );
      prisma.qualificationRule.findMany.mockResolvedValue([
        {
          groupId: 'group-a',
          fromPosition: 1,
          toPosition: 2,
          group: { name: 'Poule A' },
        },
        {
          groupId: 'group-b',
          fromPosition: 1,
          toPosition: 2,
          group: { name: 'Poule B' },
        },
      ]);
      // Neither pool has finished -- computeStandings would still rank every
      // team (even 0 matches played), so without checking isComplete this
      // would wrongly seed round 1 with premature "current" standings.
      standingsService.getStandings.mockResolvedValue(
        standingsFixture(['a1', 'a2'], false),
      );

      await service.generateMatches('org-1', TOURNAMENT_ID, 'bracket-1');

      // Sorted (position, groupName): 1er Poule A, 1er Poule B, 2e Poule A,
      // 2e Poule B -- seed order [1,4,2,3] pairs slot0 = (1er A, 2e B) and
      // slot1 = (1er B, 2e A), same seeding as if teams were already known.
      expect(prisma.match.create).toHaveBeenCalledWith({
        data: {
          knockoutBracketId: 'bracket-1',
          round: 1,
          bracketSlot: 0,
          isThirdPlaceMatch: false,
          homeTeamId: null,
          awayTeamId: null,
          homeSourceLabel: '1er Poule A',
          awaySourceLabel: '2e Poule B',
        },
        include: expect.anything() as unknown,
      });
      expect(prisma.match.create).toHaveBeenCalledWith({
        data: {
          knockoutBracketId: 'bracket-1',
          round: 1,
          bracketSlot: 1,
          isThirdPlaceMatch: false,
          homeTeamId: null,
          awayTeamId: null,
          homeSourceLabel: '1er Poule B',
          awaySourceLabel: '2e Poule A',
        },
        include: expect.anything() as unknown,
      });
    });
  });

  describe('generateAllMatches', () => {
    function mockTwoTiers(): void {
      prisma.field.findMany.mockResolvedValue([{ id: 'field-1' }]);
      prisma.competitionPhase.findMany.mockResolvedValue([
        knockoutPhaseFixture(),
        knockoutPhaseFixture({
          id: 'phase-ko-2',
          name: 'Tier 2',
          position: 2,
          knockoutBracket: {
            id: 'bracket-2',
            phaseId: 'phase-ko-2',
            name: 'Tier 2',
            size: 2,
            hasRankingMatch: false,
          },
        }),
      ]);
      prisma.competitionPhase.findFirst.mockResolvedValue({
        id: 'phase-pool-1',
      });
      prisma.match.findFirst.mockResolvedValue({
        timeSlot: { endTime: new Date('2026-09-01T10:00:00.000Z') },
      });
      prisma.qualificationRule.findMany.mockImplementation(
        ({ where }: { where: { targetPhaseId: string } }) =>
          Promise.resolve(
            where.targetPhaseId === 'phase-ko-1'
              ? [
                  {
                    groupId: 'group-a',
                    fromPosition: 1,
                    toPosition: 1,
                    group: { name: 'Poule A' },
                  },
                  {
                    groupId: 'group-b',
                    fromPosition: 1,
                    toPosition: 1,
                    group: { name: 'Poule B' },
                  },
                ]
              : [
                  {
                    groupId: 'group-a',
                    fromPosition: 2,
                    toPosition: 2,
                    group: { name: 'Poule A' },
                  },
                  {
                    groupId: 'group-b',
                    fromPosition: 2,
                    toPosition: 2,
                    group: { name: 'Poule B' },
                  },
                ],
          ),
      );
      standingsService.getStandings.mockImplementation(
        (_org: string, _tournament: string, groupId: string) =>
          Promise.resolve(
            groupId === 'group-a'
              ? standingsFixture(['a1', 'a2'])
              : standingsFixture(['b1', 'b2']),
          ),
      );
    }

    it('rejects when the category has no knockout phase', async () => {
      await expect(
        service.generateAllMatches('org-1', TOURNAMENT_ID, 'category-1', {
          fieldIds: ['field-1'],
          breakAfterPoolsMinutes: 30,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects when a knockout phase has no bracket yet', async () => {
      prisma.competitionPhase.findMany.mockResolvedValue([
        knockoutPhaseFixture({ knockoutBracket: null }),
      ]);

      await expect(
        service.generateAllMatches('org-1', TOURNAMENT_ID, 'category-1', {
          fieldIds: ['field-1'],
          breakAfterPoolsMinutes: 30,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects when the category has no pool phase', async () => {
      prisma.field.findMany.mockResolvedValue([{ id: 'field-1' }]);
      prisma.competitionPhase.findMany.mockResolvedValue([
        knockoutPhaseFixture(),
      ]);
      prisma.competitionPhase.findFirst.mockResolvedValue(null);

      await expect(
        service.generateAllMatches('org-1', TOURNAMENT_ID, 'category-1', {
          fieldIds: ['field-1'],
          breakAfterPoolsMinutes: 30,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects when the pool phase has no scheduled match yet', async () => {
      prisma.field.findMany.mockResolvedValue([{ id: 'field-1' }]);
      prisma.competitionPhase.findMany.mockResolvedValue([
        knockoutPhaseFixture(),
      ]);
      prisma.competitionPhase.findFirst.mockResolvedValue({
        id: 'phase-pool-1',
      });
      prisma.match.findFirst.mockResolvedValue(null);

      await expect(
        service.generateAllMatches('org-1', TOURNAMENT_ID, 'category-1', {
          fieldIds: ['field-1'],
          breakAfterPoolsMinutes: 30,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('collects every bracket validation failure into a single error instead of stopping at the first', async () => {
      prisma.field.findMany.mockResolvedValue([{ id: 'field-1' }]);
      prisma.competitionPhase.findMany.mockResolvedValue([
        knockoutPhaseFixture({
          knockoutBracket: {
            id: 'bracket-1',
            phaseId: 'phase-ko-1',
            name: 'Tier 1',
            size: 6, // not a power of two
            hasRankingMatch: false,
          },
        }),
        knockoutPhaseFixture({
          id: 'phase-ko-2',
          name: 'Tier 2',
          position: 2,
          knockoutBracket: {
            id: 'bracket-2',
            phaseId: 'phase-ko-2',
            name: 'Tier 2',
            size: 4,
            hasRankingMatch: false,
          },
        }),
      ]);
      prisma.competitionPhase.findFirst.mockResolvedValue({
        id: 'phase-pool-1',
      });
      prisma.match.findFirst.mockResolvedValue({
        timeSlot: { endTime: new Date('2026-09-01T10:00:00.000Z') },
      });
      // Tier 2 is a valid power of two but no qualification rules exist for
      // it, so 0 qualified teams -- also fails, alongside tier 1's size.
      prisma.qualificationRule.findMany.mockResolvedValue([]);

      const error = await service
        .generateAllMatches('org-1', TOURNAMENT_ID, 'category-1', {
          fieldIds: ['field-1'],
          breakAfterPoolsMinutes: 30,
        })
        .catch((e: unknown) => e as BadRequestException);

      expect(error).toBeInstanceOf(BadRequestException);
      const message = (error as BadRequestException).message;
      expect(message).toContain('Tier 1');
      expect(message).toContain('Tier 2');
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('shares one field cursor across tiers, continuing where the previous tier left off', async () => {
      mockTwoTiers();

      await service.generateAllMatches('org-1', TOURNAMENT_ID, 'category-1', {
        fieldIds: ['field-1'],
        breakAfterPoolsMinutes: 30,
      });

      // Pool phase's last match ends at 10:00, +30min pause => tier 1 starts
      // at 10:30 (15min match + 5min break = 20min slot) => tier 2 continues
      // on the same field at 10:50, not restarting at 10:30.
      expect(prisma.timeSlot.create).toHaveBeenNthCalledWith(1, {
        data: {
          fieldId: 'field-1',
          startTime: new Date('2026-09-01T10:30:00.000Z'),
          endTime: new Date('2026-09-01T10:45:00.000Z'),
        },
      });
      expect(prisma.timeSlot.create).toHaveBeenNthCalledWith(2, {
        data: {
          fieldId: 'field-1',
          startTime: new Date('2026-09-01T10:50:00.000Z'),
          endTime: new Date('2026-09-01T11:05:00.000Z'),
        },
      });
      expect(prisma.timeSlot.create).toHaveBeenCalledTimes(2);
    });

    it('returns the combined matches created for every tier', async () => {
      mockTwoTiers();

      const result = await service.generateAllMatches(
        'org-1',
        TOURNAMENT_ID,
        'category-1',
        { fieldIds: ['field-1'], breakAfterPoolsMinutes: 30 },
      );

      expect(prisma.match.create).toHaveBeenCalledTimes(2);
      expect(prisma.match.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          knockoutBracketId: 'bracket-1',
        }) as unknown,
        include: expect.anything() as unknown,
      });
      expect(prisma.match.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          knockoutBracketId: 'bracket-2',
        }) as unknown,
        include: expect.anything() as unknown,
      });
      expect(result).toHaveLength(2);
    });

    it('schedules every tier’s round at the same distance from its own final together, before moving to the next round -- a smaller tier joins in once the shared distance reaches its own first round', async () => {
      prisma.field.findMany.mockResolvedValue([{ id: 'field-1' }]);
      prisma.competitionPhase.findMany.mockResolvedValue([
        knockoutPhaseFixture({
          id: 'phase-ko-a',
          name: 'LDC',
          position: 1,
          knockoutBracket: {
            id: 'bracket-a',
            phaseId: 'phase-ko-a',
            name: 'LDC',
            size: 4,
            hasRankingMatch: false,
          },
        }),
        knockoutPhaseFixture({
          id: 'phase-ko-b',
          name: 'EP',
          position: 2,
          knockoutBracket: {
            id: 'bracket-b',
            phaseId: 'phase-ko-b',
            name: 'EP',
            size: 4,
            hasRankingMatch: false,
          },
        }),
        knockoutPhaseFixture({
          id: 'phase-ko-c',
          name: 'CF',
          position: 3,
          knockoutBracket: {
            id: 'bracket-c',
            phaseId: 'phase-ko-c',
            name: 'CF',
            size: 2,
            hasRankingMatch: false,
          },
        }),
      ]);
      prisma.competitionPhase.findFirst.mockResolvedValue({
        id: 'phase-pool-1',
      });
      prisma.match.findFirst.mockResolvedValue({
        timeSlot: { endTime: new Date('2026-09-01T10:00:00.000Z') },
      });
      prisma.qualificationRule.findMany.mockImplementation(
        (args: { where: { targetPhaseId: string } }) => {
          const rulesByTarget: Record<string, unknown[]> = {
            'phase-ko-a': [
              {
                groupId: 'group-a',
                fromPosition: 1,
                toPosition: 4,
                group: { name: 'Poule A' },
              },
            ],
            'phase-ko-b': [
              {
                groupId: 'group-b',
                fromPosition: 1,
                toPosition: 4,
                group: { name: 'Poule B' },
              },
            ],
            'phase-ko-c': [
              {
                groupId: 'group-c',
                fromPosition: 1,
                toPosition: 2,
                group: { name: 'Poule C' },
              },
            ],
          };
          return Promise.resolve(rulesByTarget[args.where.targetPhaseId] ?? []);
        },
      );
      standingsService.getStandings.mockImplementation(
        (_org: string, _tournament: string, groupId: string) => {
          const teamsByGroup: Record<string, string[]> = {
            'group-a': ['a1', 'a2', 'a3', 'a4'],
            'group-b': ['b1', 'b2', 'b3', 'b4'],
            'group-c': ['c1', 'c2'],
          };
          return Promise.resolve(
            standingsFixture(teamsByGroup[groupId] ?? [], true),
          );
        },
      );

      await service.generateAllMatches('org-1', TOURNAMENT_ID, 'category-1', {
        fieldIds: ['field-1'],
        breakAfterPoolsMinutes: 30,
      });

      // LDC and EP both have a "1/2" (round 1 of a 4-team bracket) round;
      // CF (2-team bracket) has no round at that distance from its own
      // final -- its single round *is* the final, so it only appears once
      // the shared distance reaches 0, alongside LDC's and EP's finals.
      const creationOrder = prisma.match.create.mock.calls.map(
        ([args]: [{ data: { knockoutBracketId: string; round: number } }]) => [
          args.data.knockoutBracketId,
          args.data.round,
        ],
      );
      expect(creationOrder).toEqual([
        ['bracket-a', 1],
        ['bracket-a', 1],
        ['bracket-b', 1],
        ['bracket-b', 1],
        ['bracket-a', 2],
        ['bracket-b', 2],
        ['bracket-c', 1],
      ]);
    });
  });

  describe('tryResolveFirstRound', () => {
    it('does nothing when the pool itself is not complete', async () => {
      prisma.group.findUnique.mockResolvedValue({ phaseId: 'phase-pool-1' });
      standingsService.getStandings.mockResolvedValue(
        standingsFixture(['a1', 'a2'], false),
      );

      await service.tryResolveFirstRound('org-1', TOURNAMENT_ID, 'group-a');

      expect(prisma.qualificationRule.findMany).not.toHaveBeenCalled();
      expect(
        prisma.crossGroupQualificationRule.findMany,
      ).not.toHaveBeenCalled();
    });

    it('does nothing when this pool does not feed any knockout phase', async () => {
      prisma.group.findUnique.mockResolvedValue({ phaseId: 'phase-pool-1' });
      standingsService.getStandings.mockResolvedValue(
        standingsFixture(['a1', 'a2'], true),
      );
      prisma.qualificationRule.findMany.mockResolvedValue([]);
      prisma.crossGroupQualificationRule.findMany.mockResolvedValue([]);

      await service.tryResolveFirstRound('org-1', TOURNAMENT_ID, 'group-a');

      expect(prisma.knockoutBracket.findUnique).not.toHaveBeenCalled();
    });

    function mockOneDirectTarget(groupBComplete: boolean): void {
      prisma.group.findUnique.mockResolvedValue({ phaseId: 'phase-pool-1' });
      prisma.qualificationRule.findMany.mockImplementation(
        (args: { where: { group?: unknown; targetPhaseId?: string } }) =>
          Promise.resolve(
            args.where.group
              ? [{ targetPhaseId: 'phase-ko-1' }]
              : [
                  {
                    groupId: 'group-a',
                    fromPosition: 1,
                    toPosition: 1,
                    group: { name: 'Poule A' },
                  },
                  {
                    groupId: 'group-b',
                    fromPosition: 1,
                    toPosition: 1,
                    group: { name: 'Poule B' },
                  },
                ],
          ),
      );
      prisma.crossGroupQualificationRule.findMany.mockResolvedValue([]);
      standingsService.getStandings.mockImplementation(
        (_org: string, _tournament: string, groupId: string) =>
          Promise.resolve(
            groupId === 'group-a'
              ? standingsFixture(['a1'], true)
              : standingsFixture(['b1'], groupBComplete),
          ),
      );
      prisma.knockoutBracket.findUnique.mockResolvedValue({
        id: 'bracket-1',
        phaseId: 'phase-ko-1',
        size: 2,
        hasRankingMatch: false,
        phase: { category: { tournamentId: TOURNAMENT_ID } },
      });
      prisma.match.findMany.mockResolvedValue([
        { id: 'match-1', bracketSlot: 0, homeTeamId: null, awayTeamId: null },
      ]);
    }

    it('resolves round-1 matches for real once every feeding pool is complete', async () => {
      mockOneDirectTarget(true);

      await service.tryResolveFirstRound('org-1', TOURNAMENT_ID, 'group-a');

      // Sorted (position, groupName): 1er Poule A (a1), 1er Poule B (b1) --
      // seedOrder(2) = [1,2] pairs slot0 = (a1, b1).
      expect(prisma.match.update).toHaveBeenCalledWith({
        where: { id: 'match-1' },
        data: {
          homeTeamId: 'a1',
          awayTeamId: 'b1',
          homeSourceLabel: null,
          awaySourceLabel: null,
        },
      });
      expect(realtimeService.emit).toHaveBeenCalledWith({
        tournamentId: TOURNAMENT_ID,
        type: 'match-updated',
        matchId: 'match-1',
      });
    });

    it('leaves round 1 untouched while another feeding pool is still incomplete', async () => {
      mockOneDirectTarget(false);

      await service.tryResolveFirstRound('org-1', TOURNAMENT_ID, 'group-a');

      expect(prisma.match.update).not.toHaveBeenCalled();
      expect(realtimeService.emit).not.toHaveBeenCalled();
    });

    it('is idempotent -- does nothing when round 1 has no pending (already-resolved) matches', async () => {
      mockOneDirectTarget(true);
      prisma.match.findMany.mockResolvedValue([]);

      await service.tryResolveFirstRound('org-1', TOURNAMENT_ID, 'group-a');

      expect(prisma.match.update).not.toHaveBeenCalled();
    });
  });

  describe('tryAdvanceRound', () => {
    it('does nothing when the round is already the final', async () => {
      prisma.knockoutBracket.findUnique.mockResolvedValue({
        size: 2,
        hasRankingMatch: false,
      });

      await service.tryAdvanceRound('bracket-1', 1);

      expect(prisma.match.findMany).not.toHaveBeenCalled();
    });

    it('does nothing when the round is not fully decided', async () => {
      prisma.knockoutBracket.findUnique.mockResolvedValue({
        size: 4,
        hasRankingMatch: false,
      });
      prisma.match.findMany.mockResolvedValue([
        {
          homeTeamId: 'a',
          awayTeamId: 'b',
          forfeitedTeamId: null,
          status: 'COMPLETED',
          score: {
            homeScore: 1,
            awayScore: 0,
            homePenaltyScore: null,
            awayPenaltyScore: null,
            isValidated: true,
          },
        },
        {
          homeTeamId: 'c',
          awayTeamId: 'd',
          forfeitedTeamId: null,
          status: 'SCHEDULED',
          score: null,
        },
      ]);

      await service.tryAdvanceRound('bracket-1', 1);

      expect(prisma.match.update).not.toHaveBeenCalled();
    });

    it('does nothing when the next round is already decided (idempotent)', async () => {
      prisma.knockoutBracket.findUnique.mockResolvedValue({
        size: 4,
        hasRankingMatch: false,
      });
      // Round 1 (the query filtered to isThirdPlaceMatch: false) is fully
      // decided; round 2's placeholder was already filled in by a previous
      // call -- both teams are non-null, so this must be a no-op.
      prisma.match.findMany.mockImplementation(
        (args: { where: { round: number; isThirdPlaceMatch?: boolean } }) =>
          Promise.resolve(
            args.where.isThirdPlaceMatch === false
              ? [
                  {
                    homeTeamId: 'a',
                    awayTeamId: 'b',
                    forfeitedTeamId: null,
                    status: 'COMPLETED',
                    score: {
                      homeScore: 1,
                      awayScore: 0,
                      homePenaltyScore: null,
                      awayPenaltyScore: null,
                      isValidated: true,
                    },
                  },
                  {
                    homeTeamId: 'c',
                    awayTeamId: 'd',
                    forfeitedTeamId: null,
                    status: 'COMPLETED',
                    score: {
                      homeScore: 2,
                      awayScore: 1,
                      homePenaltyScore: null,
                      awayPenaltyScore: null,
                      isValidated: true,
                    },
                  },
                ]
              : [
                  {
                    id: 'final-match',
                    bracketSlot: 0,
                    isThirdPlaceMatch: false,
                    homeTeamId: 'a',
                    awayTeamId: 'c',
                  },
                ],
          ),
      );

      await service.tryAdvanceRound('bracket-1', 1);

      expect(prisma.match.update).not.toHaveBeenCalled();
    });

    it('fills in the final once both semifinal-round matches are decided', async () => {
      prisma.knockoutBracket.findUnique.mockResolvedValue({
        size: 4,
        hasRankingMatch: false,
        phase: { category: { tournamentId: TOURNAMENT_ID } },
      });
      prisma.match.findMany.mockImplementation(
        (args: { where: { round: number; isThirdPlaceMatch?: boolean } }) =>
          Promise.resolve(
            args.where.isThirdPlaceMatch === false
              ? [
                  {
                    homeTeamId: 'a',
                    awayTeamId: 'b',
                    forfeitedTeamId: null,
                    status: 'COMPLETED',
                    score: {
                      homeScore: 1,
                      awayScore: 0,
                      homePenaltyScore: null,
                      awayPenaltyScore: null,
                      isValidated: true,
                    },
                  },
                  {
                    homeTeamId: 'c',
                    awayTeamId: 'd',
                    forfeitedTeamId: null,
                    status: 'COMPLETED',
                    score: {
                      homeScore: 2,
                      awayScore: 1,
                      homePenaltyScore: null,
                      awayPenaltyScore: null,
                      isValidated: true,
                    },
                  },
                ]
              : // Created up front by generateMatches, still undetermined.
                [
                  {
                    id: 'final-match',
                    bracketSlot: 0,
                    isThirdPlaceMatch: false,
                    homeTeamId: null,
                    awayTeamId: null,
                  },
                ],
          ),
      );

      await service.tryAdvanceRound('bracket-1', 1);

      expect(prisma.match.update).toHaveBeenCalledWith({
        where: { id: 'final-match' },
        data: {
          homeTeamId: 'a',
          awayTeamId: 'c',
          homeSourceLabel: null,
          awaySourceLabel: null,
        },
      });
      expect(prisma.match.update).toHaveBeenCalledTimes(1);
    });

    it('also fills in the 3rd-place match when the bracket has a ranking match', async () => {
      prisma.knockoutBracket.findUnique.mockResolvedValue({
        size: 4,
        hasRankingMatch: true,
        phase: { category: { tournamentId: TOURNAMENT_ID } },
      });
      prisma.match.findMany.mockImplementation(
        (args: { where: { round: number; isThirdPlaceMatch?: boolean } }) =>
          Promise.resolve(
            args.where.isThirdPlaceMatch === false
              ? [
                  {
                    homeTeamId: 'a',
                    awayTeamId: 'b',
                    forfeitedTeamId: null,
                    status: 'COMPLETED',
                    score: {
                      homeScore: 1,
                      awayScore: 0,
                      homePenaltyScore: null,
                      awayPenaltyScore: null,
                      isValidated: true,
                    },
                  },
                  {
                    homeTeamId: 'c',
                    awayTeamId: 'd',
                    forfeitedTeamId: null,
                    status: 'COMPLETED',
                    score: {
                      homeScore: 2,
                      awayScore: 1,
                      homePenaltyScore: null,
                      awayPenaltyScore: null,
                      isValidated: true,
                    },
                  },
                ]
              : [
                  {
                    id: 'final-match',
                    bracketSlot: 0,
                    isThirdPlaceMatch: false,
                    homeTeamId: null,
                    awayTeamId: null,
                  },
                  {
                    id: 'third-place-match',
                    bracketSlot: 0,
                    isThirdPlaceMatch: true,
                    homeTeamId: null,
                    awayTeamId: null,
                  },
                ],
          ),
      );

      await service.tryAdvanceRound('bracket-1', 1);

      expect(prisma.match.update).toHaveBeenCalledWith({
        where: { id: 'final-match' },
        data: {
          homeTeamId: 'a',
          awayTeamId: 'c',
          homeSourceLabel: null,
          awaySourceLabel: null,
        },
      });
      expect(prisma.match.update).toHaveBeenCalledWith({
        where: { id: 'third-place-match' },
        data: {
          homeTeamId: 'b',
          awayTeamId: 'd',
          homeSourceLabel: null,
          awaySourceLabel: null,
        },
      });
      expect(prisma.match.update).toHaveBeenCalledTimes(2);
    });

    it('treats the non-forfeiting team as the winner of a forfeited match', async () => {
      prisma.knockoutBracket.findUnique.mockResolvedValue({
        size: 4,
        hasRankingMatch: false,
        phase: { category: { tournamentId: TOURNAMENT_ID } },
      });
      prisma.match.findMany.mockImplementation(
        (args: { where: { round: number; isThirdPlaceMatch?: boolean } }) =>
          Promise.resolve(
            args.where.isThirdPlaceMatch === false
              ? [
                  {
                    homeTeamId: 'a',
                    awayTeamId: 'b',
                    forfeitedTeamId: 'a',
                    status: 'FORFEITED',
                    score: null,
                  },
                  {
                    homeTeamId: 'c',
                    awayTeamId: 'd',
                    forfeitedTeamId: null,
                    status: 'COMPLETED',
                    score: {
                      homeScore: 2,
                      awayScore: 1,
                      homePenaltyScore: null,
                      awayPenaltyScore: null,
                      isValidated: true,
                    },
                  },
                ]
              : [
                  {
                    id: 'final-match',
                    bracketSlot: 0,
                    isThirdPlaceMatch: false,
                    homeTeamId: null,
                    awayTeamId: null,
                  },
                ],
          ),
      );

      await service.tryAdvanceRound('bracket-1', 1);

      expect(prisma.match.update).toHaveBeenCalledWith({
        where: { id: 'final-match' },
        data: {
          homeTeamId: 'b',
          awayTeamId: 'c',
          homeSourceLabel: null,
          awaySourceLabel: null,
        },
      });
    });
  });
});
