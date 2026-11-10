import { Injectable } from '@nestjs/common';
import {
  MatchStatus,
  OrganizationSubscriptionStatus,
  RegistrationStatus,
  TournamentPublicationOrderStatus,
  TournamentStatus,
} from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StatsQueryDto } from './dto/stats-query.dto';
import { dateFilter, resolveStatsRange } from './stats-period.util';

@Injectable()
export class SuperAdminStatsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Dashboard summary cards -- entirely new aggregation queries (nothing to
   * reuse: no groupBy/aggregate call exists anywhere else in the codebase
   * as of this feature). Revenue is the sum of the three independent money
   * sources (Registration, TournamentPublicationOrder,
   * OrganizationSubscription) in their "actually collected" statuses --
   * matches SuperAdminPaymentsService's merge logic.
   *
   * With a period, every figure is the activity inside it: accounts,
   * organizations and tournaments created, matches played (last update of a
   * completed match), money collected (paidAt). Active subscriptions stay a
   * snapshot of today, since "active" has no meaning over a past window.
   */
  async getStats(query: StatsQueryDto = {}) {
    const range = resolveStatsRange(query.period, query.from, query.to);
    const created = dateFilter(range);
    const paid = dateFilter(range);

    const [
      totalUsers,
      totalOrganizations,
      tournamentsByStatus,
      matchesPlayed,
      activeSubscriptions,
      registrationRevenue,
      publicationRevenue,
      subscriptionRevenue,
    ] = await Promise.all([
      this.prisma.user.count({ where: { createdAt: created } }),
      this.prisma.organization.count({ where: { createdAt: created } }),
      this.prisma.tournament.groupBy({
        by: ['status'],
        where: { createdAt: created },
        _count: { _all: true },
      }),
      this.prisma.match.count({
        where: {
          status: { in: [MatchStatus.COMPLETED, MatchStatus.FORFEITED] },
          updatedAt: created,
        },
      }),
      this.prisma.organizationSubscription.count({
        where: {
          status: OrganizationSubscriptionStatus.ACTIVE,
          expiresAt: { gt: new Date() },
        },
      }),
      this.prisma.registration.aggregate({
        where: { status: RegistrationStatus.PAID, paidAt: paid },
        _sum: { amountCents: true },
      }),
      this.prisma.tournamentPublicationOrder.aggregate({
        where: { status: TournamentPublicationOrderStatus.PAID, paidAt: paid },
        _sum: { amountCents: true },
      }),
      this.prisma.organizationSubscription.aggregate({
        where: { status: OrganizationSubscriptionStatus.ACTIVE, paidAt: paid },
        _sum: { amountCents: true },
      }),
    ]);

    const tournamentsByStatusMap: Record<TournamentStatus, number> = {
      DRAFT: 0,
      PUBLISHED: 0,
      UNPUBLISHED: 0,
      ARCHIVED: 0,
    };
    for (const row of tournamentsByStatus) {
      tournamentsByStatusMap[row.status] = row._count._all;
    }

    return {
      // Null when the figures cover everything.
      period: range
        ? {
            from: range.from?.toISOString() ?? null,
            to: range.to?.toISOString() ?? null,
          }
        : null,
      totalUsers,
      totalOrganizations,
      tournamentsByStatus: tournamentsByStatusMap,
      matchesPlayed,
      activeSubscriptions,
      // Every currency is 'eur' in practice (see Registration/publication/
      // subscription schema comments) -- summed as raw cents, not
      // currency-aware, same simplification the rest of the app already
      // makes (no multi-currency support exists anywhere yet).
      revenueCents:
        (registrationRevenue._sum.amountCents ?? 0) +
        (publicationRevenue._sum.amountCents ?? 0) +
        (subscriptionRevenue._sum.amountCents ?? 0),
    };
  }
}
