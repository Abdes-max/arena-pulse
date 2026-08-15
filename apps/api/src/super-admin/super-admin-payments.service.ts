import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SuperAdminAuditLogService } from './super-admin-audit-log.service';

export type SuperAdminPaymentType =
  'REGISTRATION' | 'PUBLICATION' | 'SUBSCRIPTION';

export interface SuperAdminPaymentRow {
  id: string;
  type: SuperAdminPaymentType;
  organizationId: string;
  organizationName: string;
  amountCents: number;
  currency: string;
  status: string;
  paidAt: Date | null;
  createdAt: Date;
  note: string | null;
}

// Maps each payment type to its Prisma model name (SuperAdminAuditLogService's
// targetType convention) and back -- kept in one place so the controller's
// :type route param and the audit log's targetType never drift apart.
const TARGET_TYPE_BY_PAYMENT_TYPE: Record<SuperAdminPaymentType, string> = {
  REGISTRATION: 'Registration',
  PUBLICATION: 'TournamentPublicationOrder',
  SUBSCRIPTION: 'OrganizationSubscription',
};

@Injectable()
export class SuperAdminPaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: SuperAdminAuditLogService,
  ) {}

  /**
   * Merges the three independent money sources into one shape, sorted by
   * date -- there is no unified Payment table in the schema (see
   * SuperAdminStatsService's comment), so this is a fan-out of three
   * findMany() calls plus an in-memory sort/merge. Deliberately not
   * filtered to "collected" statuses only (unlike SuperAdminStatsService's
   * revenue total) -- PENDING_PAYMENT rows are exactly what the "annotate a
   * stuck payment" action needs to find.
   */
  async list(): Promise<SuperAdminPaymentRow[]> {
    const [registrations, publicationOrders, subscriptions] = await Promise.all(
      [
        this.prisma.registration.findMany({
          include: { tournament: { include: { organization: true } } },
          orderBy: { createdAt: 'desc' },
        }),
        this.prisma.tournamentPublicationOrder.findMany({
          include: { tournament: { include: { organization: true } } },
          orderBy: { createdAt: 'desc' },
        }),
        this.prisma.organizationSubscription.findMany({
          include: { organization: true },
          orderBy: { createdAt: 'desc' },
        }),
      ],
    );

    const rows: Omit<SuperAdminPaymentRow, 'note'>[] = [
      ...registrations.map((registration) => ({
        id: registration.id,
        type: 'REGISTRATION' as const,
        organizationId: registration.tournament.organizationId,
        organizationName: registration.tournament.organization.name,
        amountCents: registration.amountCents,
        currency: registration.currency,
        status: registration.status,
        paidAt: registration.paidAt,
        createdAt: registration.createdAt,
      })),
      ...publicationOrders.map((order) => ({
        id: order.id,
        type: 'PUBLICATION' as const,
        organizationId: order.tournament.organizationId,
        organizationName: order.tournament.organization.name,
        amountCents: order.amountCents,
        currency: order.currency,
        status: order.status,
        paidAt: order.paidAt,
        createdAt: order.createdAt,
      })),
      ...subscriptions.map((subscription) => ({
        id: subscription.id,
        type: 'SUBSCRIPTION' as const,
        organizationId: subscription.organizationId,
        organizationName: subscription.organization.name,
        amountCents: subscription.amountCents,
        currency: subscription.currency,
        status: subscription.status,
        paidAt: subscription.paidAt,
        createdAt: subscription.createdAt,
      })),
    ];

    const notesByType = new Map<SuperAdminPaymentType, Map<string, string>>();
    for (const type of Object.keys(
      TARGET_TYPE_BY_PAYMENT_TYPE,
    ) as SuperAdminPaymentType[]) {
      const ids = rows.filter((row) => row.type === type).map((row) => row.id);
      notesByType.set(
        type,
        await this.auditLog.latestNotesByTarget(
          TARGET_TYPE_BY_PAYMENT_TYPE[type],
          ids,
        ),
      );
    }

    return rows
      .map((row) => ({
        ...row,
        note: notesByType.get(row.type)?.get(row.id) ?? null,
      }))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  /**
   * Attaches an internal note to a payment row -- never touches Stripe or
   * the row's own status, purely a record that an operator resolved
   * something manually (e.g. a payment confirmed in the Stripe dashboard
   * whose webhook never arrived). See SuperAdminAuditLogService.
   */
  async annotate(
    type: string,
    id: string,
    note: string,
    superAdminId: string,
  ): Promise<void> {
    const targetType =
      TARGET_TYPE_BY_PAYMENT_TYPE[type as SuperAdminPaymentType];
    if (!targetType) {
      throw new BadRequestException('Type de paiement inconnu.');
    }
    const exists = await this.rowExists(type as SuperAdminPaymentType, id);
    if (!exists) {
      throw new NotFoundException('Paiement introuvable.');
    }
    await this.auditLog.record({
      superAdminId,
      action: 'ANNOTATE_PAYMENT',
      targetType,
      targetId: id,
      note,
    });
  }

  private async rowExists(
    type: SuperAdminPaymentType,
    id: string,
  ): Promise<boolean> {
    switch (type) {
      case 'REGISTRATION':
        return (
          (await this.prisma.registration.findUnique({ where: { id } })) !==
          null
        );
      case 'PUBLICATION':
        return (
          (await this.prisma.tournamentPublicationOrder.findUnique({
            where: { id },
          })) !== null
        );
      case 'SUBSCRIPTION':
        return (
          (await this.prisma.organizationSubscription.findUnique({
            where: { id },
          })) !== null
        );
      default:
        return false;
    }
  }
}
