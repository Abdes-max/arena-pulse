import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DashboardStatsService } from './dashboard-stats.service';

type PrismaMock = {
  tournament: { findMany: jest.Mock; findUnique: jest.Mock };
  category: { findMany: jest.Mock };
  player: { count: jest.Mock };
  referee: { count: jest.Mock };
  match: { findMany: jest.Mock };
  registration: { findMany: jest.Mock };
};

function createPrismaMock(): PrismaMock {
  return {
    tournament: { findMany: jest.fn(), findUnique: jest.fn() },
    category: { findMany: jest.fn() },
    player: { count: jest.fn().mockResolvedValue(0) },
    referee: { count: jest.fn().mockResolvedValue(0) },
    match: { findMany: jest.fn().mockResolvedValue([]) },
    registration: { findMany: jest.fn().mockResolvedValue([]) },
  };
}

function orgMatch(
  tournamentId: string,
  status: string,
  score: { home: number; away: number; validatedAt: string } | null,
  viaBracket = false,
) {
  const path = { phase: { category: { tournamentId } } };
  return {
    status,
    group: viaBracket ? null : path,
    knockoutBracket: viaBracket ? path : null,
    score: score
      ? {
          homeScore: score.home,
          awayScore: score.away,
          isValidated: true,
          validatedAt: new Date(score.validatedAt),
        }
      : null,
  };
}

describe('DashboardStatsService', () => {
  let prisma: PrismaMock;
  let service: DashboardStatsService;

  beforeEach(() => {
    prisma = createPrismaMock();
    service = new DashboardStatsService(prisma as unknown as PrismaService);
  });

  describe('getOrganizationStats', () => {
    const now = new Date('2026-11-05T10:00:00Z');

    it('aggregates tournaments, matches, goals, registrations and months', async () => {
      prisma.tournament.findMany.mockResolvedValue([
        {
          id: 't1',
          name: 'Coupe',
          status: 'PUBLISHED',
          startDate: new Date('2026-11-20T00:00:00Z'),
          _count: { teams: 12 },
        },
        {
          id: 't2',
          name: 'Ancien',
          status: 'ARCHIVED',
          startDate: new Date('2026-12-01T00:00:00Z'),
          _count: { teams: 4 },
        },
        {
          id: 't3',
          name: 'Brouillon',
          status: 'DRAFT',
          startDate: new Date('2026-11-10T00:00:00Z'),
          _count: { teams: 2 },
        },
      ]);
      prisma.player.count.mockResolvedValue(90);
      prisma.match.findMany.mockResolvedValue([
        orgMatch('t1', 'COMPLETED', {
          home: 2,
          away: 1,
          validatedAt: '2026-11-02T10:00:00Z',
        }),
        orgMatch(
          't1',
          'COMPLETED',
          { home: 0, away: 3, validatedAt: '2026-09-15T10:00:00Z' },
          true,
        ),
        orgMatch('t1', 'LIVE', null),
        // Validated before the 6-month window: counted, but not charted.
        orgMatch('t2', 'COMPLETED', {
          home: 1,
          away: 1,
          validatedAt: '2025-01-15T10:00:00Z',
        }),
      ]);
      prisma.registration.findMany.mockResolvedValue([
        { status: 'PAID', amountCents: 2000, currency: 'eur' },
        { status: 'PAID', amountCents: 3000, currency: 'eur' },
        { status: 'PENDING_PAYMENT', amountCents: 2000, currency: 'eur' },
        { status: 'CANCELLED', amountCents: 2000, currency: 'eur' },
      ]);

      const stats = await service.getOrganizationStats('org-1', now);

      expect(stats.tournaments).toEqual({
        total: 3,
        byStatus: { DRAFT: 1, PUBLISHED: 1, UNPUBLISHED: 0, ARCHIVED: 1 },
      });
      expect(stats.teamsCount).toBe(18);
      expect(stats.playersCount).toBe(90);
      expect(stats.matches).toEqual({ total: 4, played: 3, live: 1 });
      expect(stats.totalGoals).toBe(8);
      expect(stats.registrations).toEqual({
        paid: 2,
        pending: 1,
        cancelled: 1,
        revenueCents: 5000,
        currency: 'eur',
      });
      // Archived t2 starts later but is skipped; t3 is the next one.
      expect(stats.upcoming).toEqual({
        id: 't3',
        name: 'Brouillon',
        startDate: new Date('2026-11-10T00:00:00Z'),
      });
      expect(stats.topTournaments.map((t) => t.id)).toEqual(['t1', 't3']);
      expect(stats.topTournaments[0]).toMatchObject({
        matchesTotal: 3,
        matchesPlayed: 2,
      });
      expect(stats.matchesPlayedByMonth).toEqual([
        { month: '2026-06', count: 0 },
        { month: '2026-07', count: 0 },
        { month: '2026-08', count: 0 },
        { month: '2026-09', count: 1 },
        { month: '2026-10', count: 0 },
        { month: '2026-11', count: 1 },
      ]);
    });

    it('returns zeros for an organization with nothing yet', async () => {
      prisma.tournament.findMany.mockResolvedValue([]);

      const stats = await service.getOrganizationStats('org-1', now);

      expect(stats.tournaments.total).toBe(0);
      expect(stats.upcoming).toBeNull();
      expect(stats.topTournaments).toEqual([]);
      expect(stats.matchesPlayedByMonth).toHaveLength(6);
    });
  });

  describe('getTournamentStats', () => {
    it('rejects a tournament from another organization', async () => {
      prisma.tournament.findUnique.mockResolvedValue({
        organizationId: 'org-2',
      });

      await expect(
        service.getTournamentStats('org-1', 't1'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.match.findMany).not.toHaveBeenCalled();
    });

    it('splits match progress and only counts validated scores as played', async () => {
      prisma.tournament.findUnique.mockResolvedValue({
        organizationId: 'org-1',
      });
      prisma.category.findMany.mockResolvedValue([
        { name: 'U11', _count: { teams: 6 } },
        { name: 'U13', _count: { teams: 4 } },
      ]);
      prisma.player.count.mockResolvedValue(70);
      prisma.referee.count.mockResolvedValue(3);
      const slot = (hour: number) => ({
        startTime: new Date(
          `2026-11-20T${String(hour).padStart(2, '0')}:00:00Z`,
        ),
        field: { name: 'Terrain 1' },
      });
      prisma.match.findMany.mockResolvedValue([
        {
          id: 'm1',
          status: 'COMPLETED',
          homeTeam: { name: 'A' },
          awayTeam: { name: 'B' },
          timeSlot: slot(10),
          score: {
            homeScore: 3,
            awayScore: 1,
            homePenaltyScore: null,
            awayPenaltyScore: null,
            isValidated: true,
          },
        },
        {
          id: 'm2',
          status: 'COMPLETED',
          homeTeam: { name: 'C' },
          awayTeam: { name: 'D' },
          timeSlot: slot(11),
          score: {
            homeScore: 9,
            awayScore: 9,
            homePenaltyScore: null,
            awayPenaltyScore: null,
            isValidated: false,
          },
        },
        {
          id: 'm3',
          status: 'SCHEDULED',
          homeTeam: { name: 'A' },
          awayTeam: { name: 'C' },
          timeSlot: null,
          score: null,
        },
      ]);
      prisma.registration.findMany.mockResolvedValue([
        { status: 'PAID', amountCents: 1500, currency: 'eur' },
      ]);

      const stats = await service.getTournamentStats('org-1', 't1');

      expect(stats.teamsCount).toBe(10);
      expect(stats.teamsByCategory).toEqual([
        { name: 'U11', count: 6 },
        { name: 'U13', count: 4 },
      ]);
      expect(stats.matches).toMatchObject({
        total: 3,
        scheduled: 2,
        validated: 1,
        awaitingValidation: 1,
      });
      expect(stats.matches.byStatus.COMPLETED).toBe(2);
      expect(stats.matches.byStatus.SCHEDULED).toBe(1);
      // The unvalidated 9-9 is left out of every goal figure.
      expect(stats.goals.total).toBe(4);
      expect(stats.goals.averagePerMatch).toBe(4);
      expect(stats.outcomes.homeWin).toBe(1);
      expect(stats.fields).toEqual([{ name: 'Terrain 1', count: 1 }]);
      expect(stats.registrations.revenueCents).toBe(1500);
    });
  });
});
