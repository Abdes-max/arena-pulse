import { Injectable } from '@nestjs/common';
import {
  MatchStatus,
  OrganizationSubscriptionStatus,
  RegistrationStatus,
  TournamentPublicationOrderStatus,
  TournamentStatus,
} from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

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
   */
  async getStats() {
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
      this.prisma.user.count(),
      this.prisma.organization.count(),
      this.prisma.tournament.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),
      this.prisma.match.count({
        where: {
          status: { in: [MatchStatus.COMPLETED, MatchStatus.FORFEITED] },
        },
      }),
      this.prisma.organizationSubscription.count({
        where: {
          status: OrganizationSubscriptionStatus.ACTIVE,
          expiresAt: { gt: new Date() },
        },
      }),
      this.prisma.registration.aggregate({
        where: { status: RegistrationStatus.PAID },
        _sum: { amountCents: true },
      }),
      this.prisma.tournamentPublicationOrder.aggregate({
        where: { status: TournamentPublicationOrderStatus.PAID },
        _sum: { amountCents: true },
      }),
      this.prisma.organizationSubscription.aggregate({
        where: { status: OrganizationSubscriptionStatus.ACTIVE },
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
