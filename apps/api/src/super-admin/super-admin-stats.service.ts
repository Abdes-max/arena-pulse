import { Injectable } from '@nestjs/common';
import {
  MatchStatus,
  OrganizationSubscriptionStatus,
  Prisma,
  RegistrationStatus,
  TournamentPublicationOrderStatus,
  TournamentStatus,
} from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StatsQueryDto } from './dto/stats-query.dto';
import { dateFilter, resolveStatsRange } from './stats-period.util';
import { REAL_USER_WHERE, TEST_USER_WHERE } from './test-data.util';

const PLAYED_STATUSES = [MatchStatus.COMPLETED, MatchStatus.FORFEITED];
const TO_PLAY_STATUSES = [MatchStatus.SCHEDULED, MatchStatus.LIVE];
const RECENT_COUNT = 5;

@Injectable()
export class SuperAdminStatsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Dashboard figures. Revenue is the sum of the three independent money
   * sources (Registration, TournamentPublicationOrder,
   * OrganizationSubscription) in their "actually collected" statuses --
   * matches SuperAdminPaymentsService's merge logic.
   *
   * Demo / test organizations (Organization.isTest) and the accounts that
   * only belong to them are left out unless `includeTest` is "true", so the
   * numbers describe real customers; `testData` always says how many
   * records that leaves out.
   *
   * With a period, every figure is the activity inside it: accounts,
   * organizations and tournaments created, matches played (last update of a
   * completed match), money collected (paidAt). Active subscriptions stay a
   * snapshot of today, since "active" has no meaning over a past window.
   */
  async getStats(query: StatsQueryDto = {}) {
    const range = resolveStatsRange(query.period, query.from, query.to);
    const includeTest = query.includeTest === 'true';
    const created = dateFilter(range);
    const paid = dateFilter(range);

    const organizationWhere: Prisma.OrganizationWhereInput = includeTest
      ? {}
      : { isTest: false };
    const tournamentWhere: Prisma.TournamentWhereInput = {
      organization: organizationWhere,
    };
    const userWhere: Prisma.UserWhereInput = includeTest ? {} : REAL_USER_WHERE;
    const matchWhere = (
      extra: Prisma.MatchWhereInput,
    ): Prisma.MatchWhereInput => ({
      AND: [
        {
          OR: [
            { group: { phase: { category: { tournament: tournamentWhere } } } },
            {
              knockoutBracket: {
                phase: { category: { tournament: tournamentWhere } },
              },
            },
          ],
        },
        extra,
      ],
    });

    const [
      totalUsers,
      verifiedUsers,
      totalOrganizations,
      suspendedOrganizations,
      tournamentsByStatus,
      teams,
      matchesPlayed,
      matchesToPlay,
      activeSubscriptions,
      paidRegistrations,
      registrationRevenue,
      publicationRevenue,
      subscriptionRevenue,
      testUsers,
      testOrganizations,
      testTournaments,
      recentOrganizations,
      recentTournaments,
    ] = await Promise.all([
      this.prisma.user.count({ where: { ...userWhere, createdAt: created } }),
      this.prisma.user.count({
        where: {
          ...userWhere,
          createdAt: created,
          emailVerifiedAt: { not: null },
        },
      }),
      this.prisma.organization.count({
        where: { ...organizationWhere, createdAt: created },
      }),
      this.prisma.organization.count({
        where: {
          ...organizationWhere,
          createdAt: created,
          suspendedAt: { not: null },
        },
      }),
      this.prisma.tournament.groupBy({
        by: ['status'],
        where: { ...tournamentWhere, createdAt: created },
        _count: { _all: true },
      }),
      this.prisma.team.count({
        where: { tournament: tournamentWhere, createdAt: created },
      }),
      this.prisma.match.count({
        where: matchWhere({
          status: { in: PLAYED_STATUSES },
          updatedAt: created,
        }),
      }),
      this.prisma.match.count({
        where: matchWhere({ status: { in: TO_PLAY_STATUSES } }),
      }),
      this.prisma.organizationSubscription.count({
        where: {
          status: OrganizationSubscriptionStatus.ACTIVE,
          expiresAt: { gt: new Date() },
          organization: organizationWhere,
        },
      }),
      this.prisma.registration.count({
        where: {
          status: RegistrationStatus.PAID,
          paidAt: paid,
          tournament: tournamentWhere,
        },
      }),
      this.prisma.registration.aggregate({
        where: {
          status: RegistrationStatus.PAID,
          paidAt: paid,
          tournament: tournamentWhere,
        },
        _sum: { amountCents: true },
      }),
      this.prisma.tournamentPublicationOrder.aggregate({
        where: {
          status: TournamentPublicationOrderStatus.PAID,
          paidAt: paid,
          tournament: tournamentWhere,
        },
        _sum: { amountCents: true },
      }),
      this.prisma.organizationSubscription.aggregate({
        where: {
          status: OrganizationSubscriptionStatus.ACTIVE,
          paidAt: paid,
          organization: organizationWhere,
        },
        _sum: { amountCents: true },
      }),
      this.prisma.user.count({ where: TEST_USER_WHERE }),
      this.prisma.organization.count({ where: { isTest: true } }),
      this.prisma.tournament.count({
        where: { organization: { isTest: true } },
      }),
      this.prisma.organization.findMany({
        where: organizationWhere,
        orderBy: { createdAt: 'desc' },
        take: RECENT_COUNT,
        select: { id: true, name: true, createdAt: true, isTest: true },
      }),
      this.prisma.tournament.findMany({
        where: tournamentWhere,
        orderBy: { createdAt: 'desc' },
        take: RECENT_COUNT,
        select: {
          id: true,
          name: true,
          slug: true,
          status: true,
          createdAt: true,
          organization: { select: { name: true } },
        },
      }),
    ]);

    const byStatus: Record<TournamentStatus, number> = {
      DRAFT: 0,
      PUBLISHED: 0,
      UNPUBLISHED: 0,
      ARCHIVED: 0,
    };
    for (const row of tournamentsByStatus) {
      byStatus[row.status] = row._count._all;
    }

    // Every currency is 'eur' in practice (see Registration/publication/
    // subscription schema comments) -- summed as raw cents, not
    // currency-aware, same simplification the rest of the app already
    // makes (no multi-currency support exists anywhere yet).
    const registrationCents = registrationRevenue._sum.amountCents ?? 0;
    const publicationCents = publicationRevenue._sum.amountCents ?? 0;
    const subscriptionCents = subscriptionRevenue._sum.amountCents ?? 0;

    return {
      // Null when the figures cover everything.
      period: range
        ? {
            from: range.from?.toISOString() ?? null,
            to: range.to?.toISOString() ?? null,
          }
        : null,
      includeTest,
      users: {
        total: totalUsers,
        verified: verifiedUsers,
        unverified: totalUsers - verifiedUsers,
      },
      organizations: {
        total: totalOrganizations,
        suspended: suspendedOrganizations,
      },
      subscriptions: { active: activeSubscriptions },
      tournaments: {
        total: Object.values(byStatus).reduce((sum, count) => sum + count, 0),
        byStatus,
      },
      teams,
      matches: { played: matchesPlayed, toPlay: matchesToPlay },
      registrations: { paid: paidRegistrations },
      revenue: {
        totalCents: registrationCents + publicationCents + subscriptionCents,
        publicationCents,
        subscriptionCents,
        registrationCents,
      },
      // What includeTest=false leaves out (all time, not period-bound).
      testData: {
        users: testUsers,
        organizations: testOrganizations,
        tournaments: testTournaments,
      },
      recent: {
        organizations: recentOrganizations.map((organization) => ({
          id: organization.id,
          name: organization.name,
          createdAt: organization.createdAt.toISOString(),
          isTest: organization.isTest,
        })),
        tournaments: recentTournaments.map((tournament) => ({
          id: tournament.id,
          name: tournament.name,
          slug: tournament.slug,
          status: tournament.status,
          organizationName: tournament.organization.name,
          createdAt: tournament.createdAt.toISOString(),
        })),
      },
    };
  }
}
