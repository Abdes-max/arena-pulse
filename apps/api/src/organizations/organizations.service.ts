import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type Stripe from 'stripe';
import {
  OrganizationRole,
  OrganizationSubscriptionStatus,
} from '../../generated/prisma/client';
import { DEFAULT_MAIL_LANGUAGE, MailLanguage } from '../mail/mail-language';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { StripeService } from '../payments/stripe.service';
import {
  IAP_PRODUCT_IDS,
  RevenueCatService,
  RevenueCatWebhookEvent,
} from '../payments/revenuecat.service';

const SUBSCRIPTION_DURATION_YEARS = 1;

@Injectable()
export class OrganizationsService {
  private readonly logger = new Logger(OrganizationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stripeService: StripeService,
    private readonly revenueCatService: RevenueCatService,
    private readonly configService: ConfigService,
    private readonly mailService: MailService,
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

  /**
   * Used to notify every admin of an organization about something that
   * concerns the organization as a whole (a payment receipt, not a single
   * member's action) -- there's no dedicated "contact email" field on
   * Organization, so this is the canonical way to resolve who to email.
   */
  async getAdminEmails(organizationId: string): Promise<string[]> {
    const admins = await this.prisma.organizationMember.findMany({
      where: { organizationId, role: OrganizationRole.ORG_ADMIN },
      include: { user: true },
    });
    return admins.map((admin) => admin.user.email);
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
   * A super admin can suspend an organization (see SuperAdminOrganizationsService)
   * to block it from publishing/subscribing without touching its data or
   * blocking member login -- called at the top of both money-moving entry
   * points (this service's subscribe() and TournamentsService.publish()).
   */
  async assertNotSuspended(organizationId: string): Promise<void> {
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
    });
    if (!organization) {
      throw new NotFoundException('Organisation introuvable.');
    }
    if (organization.suspendedAt) {
      throw new ForbiddenException(
        'Cette organisation est suspendue, contactez le support.',
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

  /** Every OrganizationSubscription row ever created for this organization, most recent first -- unlike getSubscriptionStatus() this isn't filtered down to "the current one", it's the full payment history for the receipts screen. */
  async listSubscriptionHistory(organizationId: string) {
    const subscriptions = await this.prisma.organizationSubscription.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
    });
    return subscriptions.map((subscription) => ({
      id: subscription.id,
      status: subscription.status,
      amountCents: subscription.amountCents,
      currency: subscription.currency,
      startsAt: subscription.startsAt,
      expiresAt: subscription.expiresAt,
      createdAt: subscription.createdAt,
      paidAt: subscription.paidAt,
    }));
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
    await this.assertNotSuspended(organizationId);
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
      // Lets an organizer enter a coupon code (e.g. a launch-offer
      // percentage off) on Stripe's own checkout page -- see
      // CreateCheckoutSessionParams.allowPromotionCodes for where that
      // coupon actually gets created and managed.
      allowPromotionCodes: true,
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
    await this.applyPaidSubscriptionSession(event.data.object);
  }

  /**
   * Called from the organizer's own browser landing on
   * /organization/subscription/success (session_id is already in that
   * URL's query string) -- verifies the session directly against Stripe
   * instead of just polling the subscription status and hoping the webhook
   * already updated it. See StripeService.retrieveCheckoutSession's doc
   * comment for why this matters beyond local dev too. A session that isn't
   * paid yet, or was already applied (by the webhook, or a previous call
   * here), is a silent no-op -- this always just returns the current
   * subscription status either way, never an error, so the success page
   * can call it unconditionally.
   */
  async confirmSubscriptionPayment(
    organizationId: string,
    stripeCheckoutSessionId: string,
    lang: MailLanguage = DEFAULT_MAIL_LANGUAGE,
  ) {
    const subscription = await this.prisma.organizationSubscription.findUnique({
      where: { stripeCheckoutSessionId },
    });
    if (
      subscription &&
      subscription.organizationId === organizationId &&
      subscription.status === OrganizationSubscriptionStatus.PENDING_PAYMENT
    ) {
      const session = await this.stripeService.retrieveCheckoutSession(
        stripeCheckoutSessionId,
      );
      if (session.payment_status === 'paid') {
        await this.applyPaidSubscriptionSession(session, lang);
      }
    }
    return this.getSubscriptionStatus(organizationId);
  }

  /**
   * Shared by the webhook handler and confirmSubscriptionPayment above --
   * same "mark active + email the receipt" side effects regardless of which
   * one first learns the session is genuinely paid. `lang` defaults to
   * French for the webhook path (no triggering browser request to read a
   * language from, see [[i18n-emails-transactionnels]]) -- in practice
   * confirmSubscriptionPayment usually wins the race anyway (it's called
   * directly by the organizer's browser landing on /subscription/success),
   * so the webhook-wins-first case is the rare fallback, not the norm.
   */
  private async applyPaidSubscriptionSession(
    session: Stripe.Checkout.Session,
    lang: MailLanguage = DEFAULT_MAIL_LANGUAGE,
  ): Promise<void> {
    const subscription = await this.prisma.organizationSubscription.findUnique({
      where: { stripeCheckoutSessionId: session.id },
    });
    // Idempotent: a retried webhook delivery, a confirm call racing the
    // webhook, or an event/session for a checkout this service didn't
    // create (e.g. a tournament publication's), is a silent no-op rather
    // than an error -- same guarantee as
    // TournamentsService.applyPaidPublicationSession.
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

    const updated = await this.prisma.organizationSubscription.update({
      where: { id: subscription.id },
      data: {
        status: OrganizationSubscriptionStatus.ACTIVE,
        paidAt: new Date(),
        stripePaymentIntentId: paymentIntentId,
        // subscription.amountCents (set at checkout-session creation, see
        // subscribe() above) is the pre-discount sticker price -- with
        // allowPromotionCodes now enabled, the amount actually charged can
        // be lower. session.amount_total is Stripe's own post-discount
        // total for this session, so it's what the receipt email and the
        // payment-history screen (listSubscriptionHistory) should show,
        // not the original ask. Falls back to the pre-discount value only
        // in the defensive case Stripe ever omits it on a paid session.
        amountCents: session.amount_total ?? subscription.amountCents,
        ...this.activePeriod(),
      },
    });

    await this.sendSubscriptionReceipt(updated, lang);
  }

  /**
   * Best-effort, non-blocking (same rationale as
   * InvitationsService.invite's mail try/catch): the subscription is
   * already ACTIVE regardless of whether the receipt email makes it out.
   */
  private async sendSubscriptionReceipt(
    subscription: {
      organizationId: string;
      amountCents: number;
      currency: string;
      expiresAt: Date | null;
    },
    lang: MailLanguage,
  ): Promise<void> {
    const organization = await this.prisma.organization.findUnique({
      where: { id: subscription.organizationId },
    });
    if (!organization || !subscription.expiresAt) {
      return;
    }
    const adminEmails = await this.getAdminEmails(subscription.organizationId);
    for (const email of adminEmails) {
      try {
        await this.mailService.sendSubscriptionReceiptEmail(
          email,
          organization.name,
          subscription.amountCents,
          subscription.currency,
          subscription.expiresAt,
          lang,
        );
      } catch (error) {
        this.logger.warn(
          `Failed to send subscription receipt email to ${email}: ${(error as Error).message}`,
        );
      }
    }
  }

  private activePeriod(): { startsAt: Date; expiresAt: Date } {
    const startsAt = new Date();
    const expiresAt = new Date(startsAt);
    expiresAt.setFullYear(
      expiresAt.getFullYear() + SUBSCRIPTION_DURATION_YEARS,
    );
    return { startsAt, expiresAt };
  }

  /**
   * iOS counterpart of subscribe() above (App Review guideline 3.1.1 --
   * see docs/architecture/adr/0008-ios-distribution.md and
   * TournamentsService.confirmPublicationPaymentViaIap's identical
   * reasoning). Unlike the Stripe path's "manual renewal only, no
   * auto-charge at expiry" (this file's own subscribe() comment), a
   * StoreKit auto-renewing subscription genuinely DOES keep renewing on
   * Apple's own schedule unless the organizer cancels it -- expiresAt here
   * is only the *current* period's end, extended forward automatically by
   * handleRevenueCatSubscriptionWebhookEvent's RENEWAL case below, not a
   * hard 1-year cutoff the way activePeriod() is for the manual Stripe path.
   */
  async confirmSubscriptionPaymentViaIap(
    organizationId: string,
    userId: string,
    lang: MailLanguage = DEFAULT_MAIL_LANGUAGE,
  ) {
    await this.assertNotSuspended(organizationId);
    if (await this.hasActiveSubscription(organizationId)) {
      throw new ConflictException(
        'Cette organisation a déjà un abonnement annuel actif.',
      );
    }

    const subscriber = await this.revenueCatService.fetchSubscriber(userId);
    const entry = subscriber.subscriptions[IAP_PRODUCT_IDS.ANNUAL_SUBSCRIPTION];
    if (!entry || entry.refunded_at || !entry.expires_date) {
      throw new ConflictException(
        "Aucun abonnement actif correspondant n'a été trouvé auprès d'Apple. Réessayez dans quelques instants.",
      );
    }
    const expiresAt = new Date(entry.expires_date);
    if (expiresAt <= new Date()) {
      throw new ConflictException('Cet abonnement Apple est déjà expiré.');
    }

    await this.applyPaidSubscriptionViaIap(
      organizationId,
      entry.store_transaction_id,
      expiresAt,
      lang,
    );
    return this.getSubscriptionStatus(organizationId);
  }

  /**
   * Shared by confirmSubscriptionPaymentViaIap above and
   * handleRevenueCatSubscriptionWebhookEvent's INITIAL_PURCHASE/RENEWAL
   * cases below -- same duality as applyPaidSubscriptionSession's own
   * confirm-call/webhook pair for Stripe. `revenueCatTransactionId` here is
   * RevenueCat's store_transaction_id/original_transaction_id for the
   * *current period* -- a renewal gets a new transaction id each time, so
   * this always creates a fresh row rather than updating expiresAt on an
   * existing one, matching how a fresh TournamentPublicationOrder-style
   * receipt is expected per payment (listSubscriptionHistory already shows
   * every row, not just the latest).
   */
  private async applyPaidSubscriptionViaIap(
    organizationId: string,
    revenueCatTransactionId: string,
    expiresAt: Date,
    lang: MailLanguage,
  ): Promise<void> {
    const alreadyRecorded =
      await this.prisma.organizationSubscription.findUnique({
        where: { revenueCatTransactionId },
      });
    if (alreadyRecorded) {
      return;
    }

    const amountCents = Number(
      this.configService.get<string>(
        'ORGANIZATION_ANNUAL_SUBSCRIPTION_PRICE_CENTS',
        '0',
      ),
    );
    const subscription = await this.prisma.organizationSubscription.create({
      data: {
        organizationId,
        status: OrganizationSubscriptionStatus.ACTIVE,
        amountCents,
        currency: 'eur',
        revenueCatTransactionId,
        startsAt: new Date(),
        expiresAt,
        paidAt: new Date(),
      },
    });

    await this.sendSubscriptionReceipt(subscription, lang);
  }

  /**
   * Called by PaymentsWebhookController after RevenueCat signature
   * verification -- mirrors handleSubscriptionStripeEvent, but also
   * handles RENEWAL (unlike Stripe's manual-only subscription, StoreKit
   * genuinely auto-renews -- see confirmSubscriptionPaymentViaIap's own
   * comment). Every other event type/product id is a silent no-op, same
   * tolerance as TournamentsService.handleRevenueCatWebhookEvent.
   */
  async handleRevenueCatSubscriptionWebhookEvent(
    event: RevenueCatWebhookEvent,
  ): Promise<void> {
    const {
      type,
      product_id: productId,
      app_user_id: userId,
      expiration_at_ms: expirationAtMs,
      transaction_id: transactionId,
    } = event.event;
    if (productId !== IAP_PRODUCT_IDS.ANNUAL_SUBSCRIPTION) {
      return;
    }
    if (type !== 'INITIAL_PURCHASE' && type !== 'RENEWAL') {
      // EXPIRATION/CANCELLATION need no action -- same "never un-publishes
      // anything already live" posture as this file's own ADR 0006 note on
      // an expiring Stripe subscription; hasActiveSubscription's own
      // expiresAt check already stops covering *future* publish() calls
      // once this period genuinely lapses, with no separate write needed
      // here to make that true.
      return;
    }
    if (!expirationAtMs) {
      this.logger.warn(
        `RevenueCat ${type} webhook for user ${userId} has no expiration_at_ms -- cannot record.`,
      );
      return;
    }

    // No organizationId is carried on the webhook event itself (RevenueCat
    // only knows app_user_id) -- userId is this app's own User.id (see
    // confirmSubscriptionPaymentViaIap's own comment), resolved back to
    // their organization the same way the rest of the app derives it.
    const membership = await this.prisma.organizationMember.findFirst({
      where: { userId, role: OrganizationRole.ORG_ADMIN },
      orderBy: { createdAt: 'asc' },
    });
    if (!membership) {
      this.logger.warn(
        `RevenueCat ${type} webhook for user ${userId} (transaction ${transactionId}): no ORG_ADMIN membership found, cannot attribute to an organization.`,
      );
      return;
    }

    await this.applyPaidSubscriptionViaIap(
      membership.organizationId,
      transactionId,
      new Date(expirationAtMs),
      DEFAULT_MAIL_LANGUAGE,
    );
  }
}
