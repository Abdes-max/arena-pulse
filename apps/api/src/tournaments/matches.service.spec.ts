import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { MatchesService } from './matches.service';
import { PrismaService } from '../prisma/prisma.service';
import { RecapRenderService } from '../recap/recap-render.service';
import { RefereesService } from './referees.service';
import { TeamsService } from './teams.service';
import { TournamentsService } from './tournaments.service';

type PrismaMock = {
  match: {
    findUnique: jest.Mock;
    findUniqueOrThrow: jest.Mock;
    findMany: jest.Mock;
    update: jest.Mock;
  };
  timeSlot: { findUnique: jest.Mock };
  matchOfficial: {
    create: jest.Mock;
    delete: jest.Mock;
    findUnique: jest.Mock;
    findMany: jest.Mock;
  };
};

function createPrismaMock(): PrismaMock {
  return {
    match: {
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn(),
    },
    timeSlot: { findUnique: jest.fn() },
    matchOfficial: {
      create: jest.fn(),
      delete: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
    },
  };
}

const TOURNAMENT_ID = 'tournament-1';

function baseMatch(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'match-1',
    groupId: 'group-1',
    homeTeamId: 'team-home',
    awayTeamId: 'team-away',
    timeSlotId: 'slot-current',
    round: 1,
    status: 'SCHEDULED',
    group: { phase: { category: { tournamentId: TOURNAMENT_ID } } },
    officials: [],
    timeSlot: {
      id: 'slot-current',
      startTime: new Date('2026-08-01T09:00:00.000Z'),
      endTime: new Date('2026-08-01T09:15:00.000Z'),
    },
    ...overrides,
  };
}

describe('MatchesService', () => {
  let prisma: PrismaMock;
  let tournamentsService: {
    assertTournamentIsEditable: jest.Mock;
    assertTournamentExists: jest.Mock;
  };
  let teamsService: { assertTeamExists: jest.Mock };
  let refereesService: { assertRefereeExists: jest.Mock };
  let recapRenderService: { renderMatchRecap: jest.Mock };
  let service: MatchesService;

  beforeEach(() => {
    prisma = createPrismaMock();
    tournamentsService = {
      assertTournamentIsEditable: jest
        .fn()
        .mockResolvedValue({ id: TOURNAMENT_ID }),
      assertTournamentExists: jest.fn().mockResolvedValue({
        id: TOURNAMENT_ID,
        name: 'Tournoi Été 2026',
        theme: 'INK_SIGNAL',
      }),
    };
    teamsService = { assertTeamExists: jest.fn() };
    refereesService = { assertRefereeExists: jest.fn() };
    recapRenderService = {
      renderMatchRecap: jest.fn().mockResolvedValue(Buffer.from('mp4')),
    };
    service = new MatchesService(
      prisma as unknown as PrismaService,
      tournamentsService as unknown as TournamentsService,
      teamsService as unknown as TeamsService,
      refereesService as unknown as RefereesService,
      recapRenderService as unknown as RecapRenderService,
    );
  });

  describe('moveMatch', () => {
    it('rejects when the tournament is archived', async () => {
      tournamentsService.assertTournamentIsEditable.mockRejectedValue(
        new Error('archived'),
      );

      await expect(
        service.moveMatch('org-1', TOURNAMENT_ID, 'match-1', {
          timeSlotId: 'slot-target',
        }),
      ).rejects.toThrow('archived');
    });

    it('rejects a match belonging to another tournament', async () => {
      prisma.match.findUnique.mockResolvedValue(
        baseMatch({
          group: { phase: { category: { tournamentId: 'other' } } },
        }),
      );

      await expect(
        service.moveMatch('org-1', TOURNAMENT_ID, 'match-1', {
          timeSlotId: 'slot-target',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('detaches a match from its slot when timeSlotId is null', async () => {
      prisma.match.findUnique.mockResolvedValue(baseMatch());
      prisma.match.update.mockResolvedValue({
        ...baseMatch({ timeSlotId: null, timeSlot: null }),
      });

      await service.moveMatch('org-1', TOURNAMENT_ID, 'match-1', {
        timeSlotId: null,
      });

      expect(prisma.match.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { timeSlotId: null } }),
      );
    });

    it('rejects moving into a slot already occupied by another match', async () => {
      prisma.match.findUnique.mockResolvedValue(baseMatch());
      prisma.timeSlot.findUnique.mockResolvedValue({
        id: 'slot-target',
        startTime: new Date('2026-08-01T10:00:00.000Z'),
        endTime: new Date('2026-08-01T10:15:00.000Z'),
        field: { venue: { tournamentId: TOURNAMENT_ID } },
        match: { id: 'match-other' },
      });

      await expect(
        service.moveMatch('org-1', TOURNAMENT_ID, 'match-1', {
          timeSlotId: 'slot-target',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects a target slot from another tournament', async () => {
      prisma.match.findUnique.mockResolvedValue(baseMatch());
      prisma.timeSlot.findUnique.mockResolvedValue({
        id: 'slot-target',
        startTime: new Date('2026-08-01T10:00:00.000Z'),
        endTime: new Date('2026-08-01T10:15:00.000Z'),
        field: { venue: { tournamentId: 'other-tournament' } },
        match: null,
      });

      await expect(
        service.moveMatch('org-1', TOURNAMENT_ID, 'match-1', {
          timeSlotId: 'slot-target',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects moving when a playing team already has an overlapping match', async () => {
      prisma.match.findUnique.mockResolvedValue(baseMatch());
      prisma.timeSlot.findUnique.mockResolvedValue({
        id: 'slot-target',
        startTime: new Date('2026-08-01T10:00:00.000Z'),
        endTime: new Date('2026-08-01T10:15:00.000Z'),
        field: { venue: { tournamentId: TOURNAMENT_ID } },
        match: null,
      });
      prisma.match.findMany.mockResolvedValue([
        {
          id: 'match-other',
          timeSlot: {
            startTime: new Date('2026-08-01T10:05:00.000Z'),
            endTime: new Date('2026-08-01T10:20:00.000Z'),
          },
        },
      ]);

      await expect(
        service.moveMatch('org-1', TOURNAMENT_ID, 'match-1', {
          timeSlotId: 'slot-target',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects moving when an assigned official already has an overlapping match', async () => {
      prisma.match.findUnique.mockResolvedValue(
        baseMatch({
          officials: [{ refereeId: 'ref-1', refereeingTeamId: null }],
        }),
      );
      prisma.timeSlot.findUnique.mockResolvedValue({
        id: 'slot-target',
        startTime: new Date('2026-08-01T10:00:00.000Z'),
        endTime: new Date('2026-08-01T10:15:00.000Z'),
        field: { venue: { tournamentId: TOURNAMENT_ID } },
        match: null,
      });
      prisma.match.findMany.mockResolvedValue([]);
      prisma.matchOfficial.findMany.mockResolvedValue([
        {
          match: {
            timeSlot: {
              startTime: new Date('2026-08-01T10:10:00.000Z'),
              endTime: new Date('2026-08-01T10:25:00.000Z'),
            },
          },
        },
      ]);

      await expect(
        service.moveMatch('org-1', TOURNAMENT_ID, 'match-1', {
          timeSlotId: 'slot-target',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('moves a match into a free, non-conflicting slot', async () => {
      prisma.match.findUnique.mockResolvedValue(baseMatch());
      prisma.timeSlot.findUnique.mockResolvedValue({
        id: 'slot-target',
        startTime: new Date('2026-08-01T10:00:00.000Z'),
        endTime: new Date('2026-08-01T10:15:00.000Z'),
        field: { venue: { tournamentId: TOURNAMENT_ID } },
        match: null,
      });
      prisma.match.findMany.mockResolvedValue([]);
      prisma.matchOfficial.findMany.mockResolvedValue([]);
      prisma.match.update.mockResolvedValue(
        baseMatch({ timeSlotId: 'slot-target' }),
      );

      await expect(
        service.moveMatch('org-1', TOURNAMENT_ID, 'match-1', {
          timeSlotId: 'slot-target',
        }),
      ).resolves.not.toThrow();
      expect(prisma.match.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { timeSlotId: 'slot-target' } }),
      );
    });
  });

  describe('addOfficial', () => {
    it('rejects when neither refereeId nor refereeingTeamId is provided', async () => {
      prisma.match.findUnique.mockResolvedValue(baseMatch());

      await expect(
        service.addOfficial('org-1', TOURNAMENT_ID, 'match-1', {}),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects when both refereeId and refereeingTeamId are provided', async () => {
      prisma.match.findUnique.mockResolvedValue(baseMatch());

      await expect(
        service.addOfficial('org-1', TOURNAMENT_ID, 'match-1', {
          refereeId: 'ref-1',
          refereeingTeamId: 'team-third',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a team officiating its own match', async () => {
      prisma.match.findUnique.mockResolvedValue(baseMatch());
      teamsService.assertTeamExists.mockResolvedValue({ id: 'team-home' });

      await expect(
        service.addOfficial('org-1', TOURNAMENT_ID, 'match-1', {
          refereeingTeamId: 'team-home',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a referee already engaged on an overlapping match', async () => {
      prisma.match.findUnique.mockResolvedValue(baseMatch());
      refereesService.assertRefereeExists.mockResolvedValue({ id: 'ref-1' });
      prisma.matchOfficial.findMany.mockResolvedValue([
        {
          match: {
            timeSlot: {
              startTime: new Date('2026-08-01T09:05:00.000Z'),
              endTime: new Date('2026-08-01T09:20:00.000Z'),
            },
          },
        },
      ]);

      await expect(
        service.addOfficial('org-1', TOURNAMENT_ID, 'match-1', {
          refereeId: 'ref-1',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('adds a referee with no conflicts', async () => {
      prisma.match.findUnique.mockResolvedValue(baseMatch());
      refereesService.assertRefereeExists.mockResolvedValue({ id: 'ref-1' });
      prisma.matchOfficial.findMany.mockResolvedValue([]);
      prisma.match.findUniqueOrThrow.mockResolvedValue(baseMatch());

      await expect(
        service.addOfficial('org-1', TOURNAMENT_ID, 'match-1', {
          refereeId: 'ref-1',
        }),
      ).resolves.not.toThrow();
      expect(prisma.matchOfficial.create).toHaveBeenCalledWith({
        data: {
          matchId: 'match-1',
          refereeId: 'ref-1',
          refereeingTeamId: undefined,
        },
      });
    });
  });

  describe('removeOfficial', () => {
    it('rejects an official belonging to another tournament', async () => {
      prisma.matchOfficial.findUnique.mockResolvedValue({
        id: 'official-1',
        match: { group: { phase: { category: { tournamentId: 'other' } } } },
      });

      await expect(
        service.removeOfficial('org-1', TOURNAMENT_ID, 'official-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.matchOfficial.delete).not.toHaveBeenCalled();
    });

    it('removes an official belonging to this tournament', async () => {
      prisma.matchOfficial.findUnique.mockResolvedValue({
        id: 'official-1',
        match: {
          group: { phase: { category: { tournamentId: TOURNAMENT_ID } } },
        },
      });

      await service.removeOfficial('org-1', TOURNAMENT_ID, 'official-1');

      expect(prisma.matchOfficial.delete).toHaveBeenCalledWith({
        where: { id: 'official-1' },
      });
    });
  });

  describe('renderRecap', () => {
    function completedMatch(overrides: Partial<Record<string, unknown>> = {}) {
      return baseMatch({
        status: 'COMPLETED',
        homeTeam: { id: 'team-home', name: 'FC Lumière' },
        awayTeam: { id: 'team-away', name: 'AS Tonnerre' },
        score: { homeScore: 3, awayScore: 1, isValidated: true },
        timeSlot: {
          ...baseMatch().timeSlot,
          field: { venue: { name: 'Complexe Sportif Nord' } },
        },
        ...overrides,
      });
    }

    it('rejects a match belonging to another tournament', async () => {
      prisma.match.findUnique.mockResolvedValue(
        completedMatch({
          group: { phase: { category: { tournamentId: 'other' } } },
        }),
      );

      await expect(
        service.renderRecap('org-1', TOURNAMENT_ID, 'match-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects a match that is not completed', async () => {
      prisma.match.findUnique.mockResolvedValue(
        completedMatch({ status: 'SCHEDULED' }),
      );

      await expect(
        service.renderRecap('org-1', TOURNAMENT_ID, 'match-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(recapRenderService.renderMatchRecap).not.toHaveBeenCalled();
    });

    it('rejects a completed match with an unvalidated score', async () => {
      prisma.match.findUnique.mockResolvedValue(
        completedMatch({
          score: { homeScore: 3, awayScore: 1, isValidated: false },
        }),
      );

      await expect(
        service.renderRecap('org-1', TOURNAMENT_ID, 'match-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(recapRenderService.renderMatchRecap).not.toHaveBeenCalled();
    });

    it('rejects a match missing an assigned team', async () => {
      prisma.match.findUnique.mockResolvedValue(
        completedMatch({ awayTeam: null }),
      );

      await expect(
        service.renderRecap('org-1', TOURNAMENT_ID, 'match-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(recapRenderService.renderMatchRecap).not.toHaveBeenCalled();
    });

    it('renders a recap for a completed match with a validated score', async () => {
      prisma.match.findUnique.mockResolvedValue(completedMatch());

      const result = await service.renderRecap(
        'org-1',
        TOURNAMENT_ID,
        'match-1',
      );

      expect(recapRenderService.renderMatchRecap).toHaveBeenCalledWith({
        tournamentName: 'Tournoi Été 2026',
        venueName: 'Complexe Sportif Nord',
        theme: 'INK_SIGNAL',
        homeTeamName: 'FC Lumière',
        awayTeamName: 'AS Tonnerre',
        homeScore: 3,
        awayScore: 1,
      });
      expect(result).toEqual(Buffer.from('mp4'));
    });
  });
});
