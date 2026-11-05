import { Injectable, NotFoundException } from '@nestjs/common';
import {
  MatchStatus,
  RegistrationStatus,
  TournamentStatus,
} from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { computeMatchStats, WrappedMatchInput } from './wrapped.util';

// How many past months the organization dashboard's "matches played"
// chart covers, current month included.
export const DASHBOARD_MONTHS = 6;
// Rows shown in the organization dashboard's per-tournament breakdown.
export const DASHBOARD_TOP_TOURNAMENTS = 6;

export interface RegistrationTotals {
  paid: number;
  pending: number;
  cancelled: number;
  revenueCents: number;
  currency: string;
}

/**
 * Admin-side "dashboard" numbers -- one organization-wide summary shown above
 * the tournament list, one per-tournament breakdown on its own "Statistiques"
 * tab. Read-only aggregation over data that already exists (same validated-
 * score source and computeMatchStats helper as the public Wrapped recap), and
 * deliberately not premium-gated: unlike Wrapped, it's the organizer's own
 * working view, not a shareable showcase.
 */
@Injectable()
export class DashboardStatsService {
  constructor(private readonly prisma: PrismaService) {}

  async getOrganizationStats(organizationId: string, now = new Date()) {
    const matchWhere = {
      OR: [
        { group: { phase: { category: { tournament: { organizationId } } } } },
        {
          knockoutBracket: {
            phase: { category: { tournament: { organizationId } } },
          },
        },
      ],
    };
    const monthsStart = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth() - (DASHBOARD_MONTHS - 1),
        1,
      ),
    );

    const [tournaments, playersCount, matches, registrations] =
      await Promise.all([
        this.prisma.tournament.findMany({
          where: { organizationId },
          select: {
            id: true,
            name: true,
            status: true,
            startDate: true,
            _count: { select: { teams: true } },
          },
        }),
        this.prisma.player.count({
          where: { team: { tournament: { organizationId } } },
        }),
        this.prisma.match.findMany({
          where: matchWhere,
          select: {
            status: true,
            group: {
              select: {
                phase: {
                  select: { category: { select: { tournamentId: true } } },
                },
              },
            },
            knockoutBracket: {
              select: {
                phase: {
                  select: { category: { select: { tournamentId: true } } },
                },
              },
            },
            score: {
              select: {
                homeScore: true,
                awayScore: true,
                isValidated: true,
                validatedAt: true,
              },
            },
          },
        }),
        this.prisma.registration.findMany({
          where: { tournament: { organizationId } },
          select: { status: true, amountCents: true, currency: true },
        }),
      ]);

    const byStatus: Record<TournamentStatus, number> = {
      DRAFT: 0,
      PUBLISHED: 0,
      UNPUBLISHED: 0,
      ARCHIVED: 0,
    };
    for (const tournament of tournaments) {
      byStatus[tournament.status] += 1;
    }

    const perTournament = new Map<string, { total: number; played: number }>();
    const playedByMonth = new Map<string, number>();
    for (let offset = 0; offset < DASHBOARD_MONTHS; offset++) {
      const month = new Date(
        Date.UTC(
          monthsStart.getUTCFullYear(),
          monthsStart.getUTCMonth() + offset,
          1,
        ),
      );
      playedByMonth.set(month.toISOString().slice(0, 7), 0);
    }
    let played = 0;
    let live = 0;
    let totalGoals = 0;
    for (const match of matches) {
      const tournamentId =
        match.group?.phase.category.tournamentId ??
        match.knockoutBracket?.phase.category.tournamentId;
      const counts = tournamentId
        ? (perTournament.get(tournamentId) ?? { total: 0, played: 0 })
        : null;
      if (counts && tournamentId) {
        counts.total += 1;
        perTournament.set(tournamentId, counts);
      }
      if (match.status === MatchStatus.LIVE) {
        live += 1;
      }
      if (match.score?.isValidated) {
        played += 1;
        totalGoals += match.score.homeScore + match.score.awayScore;
        if (counts) {
          counts.played += 1;
        }
        const month = match.score.validatedAt?.toISOString().slice(0, 7);
        if (month && playedByMonth.has(month)) {
          playedByMonth.set(month, playedByMonth.get(month)! + 1);
        }
      }
    }

    const today = Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
    );
    const upcoming = tournaments
      .filter(
        (tournament) =>
          tournament.status !== TournamentStatus.ARCHIVED &&
          tournament.startDate !== null &&
          tournament.startDate.getTime() >= today,
      )
      .sort((a, b) => a.startDate!.getTime() - b.startDate!.getTime())[0];

    const topTournaments = tournaments
      .filter((tournament) => tournament.status !== TournamentStatus.ARCHIVED)
      .map((tournament) => ({
        id: tournament.id,
        name: tournament.name,
        status: tournament.status,
        teamsCount: tournament._count.teams,
        matchesTotal: perTournament.get(tournament.id)?.total ?? 0,
        matchesPlayed: perTournament.get(tournament.id)?.played ?? 0,
      }))
      .sort(
        (a, b) =>
          b.teamsCount - a.teamsCount || b.matchesTotal - a.matchesTotal,
      )
      .slice(0, DASHBOARD_TOP_TOURNAMENTS);

    return {
      tournaments: { total: tournaments.length, byStatus },
      teamsCount: tournaments.reduce((sum, t) => sum + t._count.teams, 0),
      playersCount,
      matches: { total: matches.length, played, live },
      totalGoals,
      registrations: this.registrationTotals(registrations),
      upcoming: upcoming
        ? {
            id: upcoming.id,
            name: upcoming.name,
            startDate: upcoming.startDate,
          }
        : null,
      topTournaments,
      matchesPlayedByMonth: [...playedByMonth.entries()].map(
        ([month, count]) => ({
          month,
          count,
        }),
      ),
    };
  }

  async getTournamentStats(organizationId: string, tournamentId: string) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { id: tournamentId },
      select: { organizationId: true },
    });
    if (!tournament || tournament.organizationId !== organizationId) {
      throw new NotFoundException('Tournoi introuvable.');
    }

    const [categories, playersCount, refereesCount, matches, registrations] =
      await Promise.all([
        this.prisma.category.findMany({
          where: { tournamentId },
          orderBy: { position: 'asc' },
          select: { name: true, _count: { select: { teams: true } } },
        }),
        this.prisma.player.count({ where: { team: { tournamentId } } }),
        this.prisma.referee.count({ where: { tournamentId } }),
        this.prisma.match.findMany({
          where: {
            OR: [
              { group: { phase: { category: { tournamentId } } } },
              { knockoutBracket: { phase: { category: { tournamentId } } } },
            ],
          },
          select: {
            id: true,
            status: true,
            homeTeam: { select: { name: true } },
            awayTeam: { select: { name: true } },
            timeSlot: {
              select: { startTime: true, field: { select: { name: true } } },
            },
            score: {
              select: {
                homeScore: true,
                awayScore: true,
                homePenaltyScore: true,
                awayPenaltyScore: true,
                isValidated: true,
              },
            },
          },
        }),
        this.prisma.registration.findMany({
          where: { tournamentId },
          select: { status: true, amountCents: true, currency: true },
        }),
      ]);

    const byStatus: Record<MatchStatus, number> = {
      SCHEDULED: 0,
      LIVE: 0,
      COMPLETED: 0,
      POSTPONED: 0,
      CANCELLED: 0,
      FORFEITED: 0,
    };
    let validated = 0;
    let awaitingValidation = 0;
    let scheduled = 0;
    const statsInput: WrappedMatchInput[] = [];
    for (const match of matches) {
      byStatus[match.status] += 1;
      if (match.timeSlot) {
        scheduled += 1;
      }
      if (!match.score) {
        continue;
      }
      if (!match.score.isValidated) {
        awaitingValidation += 1;
        continue;
      }
      validated += 1;
      statsInput.push({
        id: match.id,
        homeTeamName: match.homeTeam?.name ?? null,
        awayTeamName: match.awayTeam?.name ?? null,
        homeScore: match.score.homeScore,
        awayScore: match.score.awayScore,
        homePenaltyScore: match.score.homePenaltyScore,
        awayPenaltyScore: match.score.awayPenaltyScore,
        fieldName: match.timeSlot?.field?.name ?? null,
        startTime: match.timeSlot?.startTime ?? null,
      });
    }
    const matchStats = computeMatchStats(statsInput);

    return {
      teamsCount: categories.reduce((sum, c) => sum + c._count.teams, 0),
      playersCount,
      categoriesCount: categories.length,
      refereesCount,
      teamsByCategory: categories.map((category) => ({
        name: category.name,
        count: category._count.teams,
      })),
      matches: {
        total: matches.length,
        scheduled,
        validated,
        awaitingValidation,
        byStatus,
      },
      goals: {
        total: matchStats.totalGoals,
        averagePerMatch: matchStats.averageGoalsPerMatch,
        highestScoringMatch: matchStats.highestScoringMatch,
        biggestWinMargin: matchStats.biggestWinMargin,
      },
      outcomes: matchStats.outcomes,
      topAttack: matchStats.topAttack,
      topDefense: matchStats.topDefense,
      fields: matchStats.venues,
      matchesByHour: matchStats.matchesByHour,
      registrations: this.registrationTotals(registrations),
    };
  }

  private registrationTotals(
    registrations: {
      status: RegistrationStatus;
      amountCents: number;
      currency: string;
    }[],
  ): RegistrationTotals {
    const totals: RegistrationTotals = {
      paid: 0,
      pending: 0,
      cancelled: 0,
      revenueCents: 0,
      currency: 'eur',
    };
    for (const registration of registrations) {
      if (registration.status === RegistrationStatus.PAID) {
        totals.paid += 1;
        totals.revenueCents += registration.amountCents;
        totals.currency = registration.currency;
      } else if (registration.status === RegistrationStatus.PENDING_PAYMENT) {
        totals.pending += 1;
      } else {
        totals.cancelled += 1;
      }
    }
    return totals;
  }
}
