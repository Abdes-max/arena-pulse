import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type Stripe from 'stripe';
import {
  OrganizationRole,
  OrganizationSubscriptionStatus,
} from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StripeService } from '../payments/stripe.service';

const SUBSCRIPTION_DURATION_YEARS = 1;

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stripeService: StripeService,
    private readonly configService: ConfigService,
  ) {}

  async listMembers(organizationId: string) {
    const members = await this.prisma.organizationMember.findMany({
      where: { organizationId },
      include: { user: true },
      orderBy: { createdAt: 'asc' },
    });
    return members.map((member) => ({
      id: member.id,
      userId: member.userId,
      email: member.user.email,
      firstName: member.user.firstName,
      lastName: member.user.lastName,
      role: member.role,
      joinedAt: member.createdAt,
    }));
  }

  async changeRole(
    organizationId: string,
    memberId: string,
    role: OrganizationRole,
  ) {
    const member = await this.getMemberOrThrow(organizationId, memberId);
    if (
      member.role === OrganizationRole.ORG_ADMIN &&
      role !== OrganizationRole.ORG_ADMIN
    ) {
      await this.assertNotLastAdmin(organizationId, memberId);
    }
    const updated = await this.prisma.organizationMember.update({
      where: { id: memberId },
      data: { role },
    });
    return { userId: updated.userId, role: updated.role };
  }

  async removeMember(organizationId: string, memberId: string): Promise<void> {
    const member = await this.getMemberOrThrow(organizationId, memberId);
    if (member.role === OrganizationRole.ORG_ADMIN) {
      await this.assertNotLastAdmin(organizationId, memberId);
    }
    await this.prisma.organizationMember.delete({ where: { id: memberId } });
  }

  private async getMemberOrThrow(organizationId: string, memberId: string) {
    const member = await this.prisma.organizationMember.findUnique({
      where: { id: memberId },
    });
    if (!member || member.organizationId !== organizationId) {
      throw new NotFoundException('Membre introuvable.');
    }
    return member;
  }

  private async assertNotLastAdmin(
    organizationId: string,
    excludingMemberId: string,
  ): Promise<void> {
    const remainingAdmins = await this.prisma.organizationMember.count({
      where: {
        organizationId,
        role: OrganizationRole.ORG_ADMIN,
        id: { not: excludingMemberId },
      },
    });
    if (remainingAdmins === 0) {
      throw new ConflictException(
        "Impossible de retirer le dernier administrateur de l'organisation.",
      );
    }
  }

  /**
   * Alternative to paying per publication (TournamentsService.publish()):
   * one active subscription per organization covers every tournament it
   * publishes for a year, regardless of team count/tier -- see
   * docs/architecture/adr/0006-paid-tournament-publication.md.
   */
  async hasActiveSubscription(organizationId: string): Promise<boolean> {
    const active = await this.prisma.organizationSubscription.findFirst({
      where: {
        organizationId,
        status: OrganizationSubscriptionStatus.ACTIVE,
        expiresAt: { gt: new Date() },
      },
    });
    return active !== null;
  }

  async getSubscriptionStatus(organizationId: string) {
    const active = await this.prisma.organizationSubscription.findFirst({
      where: {
        organizationId,
        status: OrganizationSubscriptionStatus.ACTIVE,
        expiresAt: { gt: new Date() },
      },
      orderBy: { expiresAt: 'desc' },
    });
    if (active) {
      return {
        status: 'ACTIVE' as const,
        startsAt: active.startsAt,
        expiresAt: active.expiresAt,
      };
    }
    const pending = await this.prisma.organizationSubscription.findFirst({
      where: {
        organizationId,
        status: OrganizationSubscriptionStatus.PENDING_PAYMENT,
      },
      orderBy: { createdAt: 'desc' },
    });
    if (pending) {
      return {
        status: 'PENDING_PAYMENT' as const,
        amountCents: pending.amountCents,
        currency: pending.currency,
      };
    }
    return { status: 'NONE' as const };
  }

  /**
   * Manual renewal only for now (no auto-charge at expiry) -- a call here
   * while a subscription is already active is rejected rather than
   * stacking/extending, keeping "one active row at a time" simple.
   */
  async subscribe(organizationId: string) {
    if (await this.hasActiveSubscription(organizationId)) {
      throw new ConflictException(
        'Cette organisation a déjà un abonnement annuel actif.',
      );
    }

    const amountCents = Number(
      this.configService.get<string>(
        'ORGANIZATION_ANNUAL_SUBSCRIPTION_PRICE_CENTS',
        '0',
      ),
    );
    const currency = 'eur';

    if (amountCents <= 0) {
      const subscription = await this.prisma.organizationSubscription.create({
        data: {
          organizationId,
          status: OrganizationSubscriptionStatus.ACTIVE,
          amountCents,
          currency,
          ...this.activePeriod(),
        },
      });
      return { status: 'ACTIVE' as const, expiresAt: subscription.expiresAt };
    }

    const subscription = await this.prisma.organizationSubscription.create({
      data: { organizationId, amountCents, currency },
    });

    const webUrl = this.configService.get<string>(
      'ADMIN_WEB_URL',
      'http://localhost:4200',
    );
    const session = await this.stripeService.createCheckoutSession({
      amountCents,
      currency,
      productName: 'Abonnement annuel TournArena',
      successUrl: `${webUrl}/admin/organization/subscription/success?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${webUrl}/admin/organization/subscription?subscribeCancelled=1`,
      metadata: { organizationSubscriptionId: subscription.id },
    });

    await this.prisma.organizationSubscription.update({
      where: { id: subscription.id },
      data: { stripeCheckoutSessionId: session.id },
    });

    return { status: 'PENDING_PAYMENT' as const, checkoutUrl: session.url! };
  }

  /** Called by PaymentsWebhookController after Stripe signature verification. */
  async handleSubscriptionStripeEvent(event: Stripe.Event): Promise<void> {
    if (event.type !== 'checkout.session.completed') {
      return;
    }
    const session = event.data.object;
    const subscription = await this.prisma.organizationSubscription.findUnique({
      where: { stripeCheckoutSessionId: session.id },
    });
    // Idempotent: a retried webhook delivery, or an event for a session this
    // service didn't create (e.g. a tournament publication's), is a silent
    // no-op rather than an error -- same guarantee as
    // TournamentsService.handlePublicationStripeEvent.
    if (
      !subscription ||
      subscription.status !== OrganizationSubscriptionStatus.PENDING_PAYMENT
    ) {
      return;
    }

    const paymentIntentId =
      typeof session.payment_intent === 'string'
        ? session.payment_intent
        : (session.payment_intent?.id ?? null);

    await this.prisma.organizationSubscription.update({
      where: { id: subscription.id },
      data: {
        status: OrganizationSubscriptionStatus.ACTIVE,
        paidAt: new Date(),
        stripePaymentIntentId: paymentIntentId,
        ...this.activePeriod(),
      },
    });
  }

  private activePeriod(): { startsAt: Date; expiresAt: Date } {
    const startsAt = new Date();
    const expiresAt = new Date(startsAt);
    expiresAt.setFullYear(
      expiresAt.getFullYear() + SUBSCRIPTION_DURATION_YEARS,
    );
    return { startsAt, expiresAt };
  }
}
