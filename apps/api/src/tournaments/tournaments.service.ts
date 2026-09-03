import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import { join } from 'path';
import type Stripe from 'stripe';
import {
  CompetitionPhaseType,
  Organization,
  Prisma,
  PublicTheme,
  Sport,
  Tournament,
  TournamentPublicationOrderStatus,
  TournamentStatus,
} from '../../generated/prisma/client';
import { matchesImageMagicBytes } from '../common/utils/image-magic-bytes.util';
import { DEFAULT_MAIL_LANGUAGE, MailLanguage } from '../mail/mail-language';
import { MailService } from '../mail/mail.service';
import { OrganizationsService } from '../organizations/organizations.service';
import { PrismaService } from '../prisma/prisma.service';
import { StripeService } from '../payments/stripe.service';
import {
  IAP_PRODUCT_IDS,
  IapProductId,
  RevenueCatService,
  RevenueCatWebhookEvent,
} from '../payments/revenuecat.service';
import { ConfirmIapPurchaseDto } from './dto/confirm-iap-purchase.dto';
import { CreateTournamentDto } from './dto/create-tournament.dto';
import { DuplicateTournamentDto } from './dto/duplicate-tournament.dto';
import { UpdateTournamentDto } from './dto/update-tournament.dto';
import { generateSlug } from './slug.util';

type TournamentWithSport = Tournament & { sport: Sport };
type TournamentWithSportAndVenue = TournamentWithSport & {
  venues: { name: string; address: string | null }[];
};
type TournamentWithSportVenueAndOrganization = TournamentWithSportAndVenue & {
  organization: Pick<Organization, 'name'>;
};

export interface PublicTournamentSearchParams {
  q?: string;
  sportId?: string;
  location?: string;
  dateFrom?: string;
  page?: number;
  pageSize?: number;
}

// Extension derived from the validated mimetype, never from the client's
// original filename -- same rationale as TeamsService's own logo upload.
const TOURNAMENT_LOGO_ALLOWED_MIME_TYPES: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};
const TOURNAMENT_LOGO_MAX_SIZE_BYTES = 2 * 1024 * 1024;

@Injectable()
export class TournamentsService {
  private readonly logger = new Logger(TournamentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stripeService: StripeService,
    private readonly revenueCatService: RevenueCatService,
    private readonly configService: ConfigService,
    private readonly organizationsService: OrganizationsService,
    private readonly mailService: MailService,
  ) {}

  async create(organizationId: string, dto: CreateTournamentDto) {
    await this.assertSportExists(dto.sportId);
    // A brand-new tournament always has 0 teams, so hasPremiumFeatures'
    // team-count check would never apply here -- checked directly against
    // the organization's subscription instead. Choosing the default theme
    // is always free (see assertPremiumFeaturesUnlocked's own comment on
    // why this only gates *changing* it).
    if (dto.theme && dto.theme !== PublicTheme.INK_SIGNAL) {
      const hasActiveSubscription =
        await this.organizationsService.hasActiveSubscription(organizationId);
      if (!hasActiveSubscription) {
        throw new ForbiddenException(
          `Le choix du thème est réservé aux tournois de plus de ${this.freeMaxTeams()} équipes ou à une organisation avec un abonnement annuel actif. Créez d'abord le tournoi avec le thème par défaut, puis ajoutez vos équipes.`,
        );
      }
    }
    const tournament = await this.prisma.tournament.create({
      data: {
        organizationId,
        sportId: dto.sportId,
        name: dto.name,
        slug: generateSlug(dto.name),
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
        isOnline: dto.isOnline ?? false,
        isListed: dto.isListed ?? true,
        theme: dto.theme,
      },
      include: { sport: true },
    });
    return this.toDetail(tournament);
  }

  async list(organizationId: string, statusFilter?: string) {
    const status = this.parseStatusFilter(statusFilter);
    const tournaments = await this.prisma.tournament.findMany({
      where: { organizationId, ...(status ? { status } : {}) },
      include: { sport: true },
      orderBy: { createdAt: 'desc' },
    });
    return tournaments.map((tournament) => this.toSummary(tournament));
  }

  async getDetail(organizationId: string, tournamentId: string) {
    const tournament = await this.getOrThrow(organizationId, tournamentId);
    return this.toDetail(tournament);
  }

  async update(
    organizationId: string,
    tournamentId: string,
    dto: UpdateTournamentDto,
  ) {
    const tournament = await this.getOrThrow(organizationId, tournamentId);
    this.assertEditable(tournament);
    if (dto.sportId) {
      await this.assertSportExists(dto.sportId);
    }
    if (dto.theme && dto.theme !== PublicTheme.INK_SIGNAL) {
      await this.assertPremiumFeaturesUnlocked(organizationId, tournamentId);
    }

    const updated = await this.prisma.tournament.update({
      where: { id: tournamentId },
      data: {
        name: dto.name,
        sportId: dto.sportId,
        startDate:
          dto.startDate !== undefined
            ? dto.startDate
              ? new Date(dto.startDate)
              : null
            : undefined,
        endDate:
          dto.endDate !== undefined
            ? dto.endDate
              ? new Date(dto.endDate)
              : null
            : undefined,
        isOnline: dto.isOnline,
        teamsCanReferee: dto.teamsCanReferee,
        isListed: dto.isListed,
        theme: dto.theme,
        description: dto.description,
        rules: dto.rules,
        practicalInfo: dto.practicalInfo,
      },
      include: { sport: true },
    });
    return this.toDetail(updated);
  }

  /** Every TournamentPublicationOrder row ever created for this tournament, most recent first -- usually 0 or 1, but a PENDING_PAYMENT order left behind by an abandoned checkout can coexist with the PAID one that actually unlocked publication. */
  async listPublicationOrders(organizationId: string, tournamentId: string) {
    await this.getOrThrow(organizationId, tournamentId);
    const orders = await this.prisma.tournamentPublicationOrder.findMany({
      where: { tournamentId },
      orderBy: { createdAt: 'desc' },
    });
    return orders.map((order) => ({
      id: order.id,
      status: order.status,
      categoriesCount: order.categoriesCount,
      teamsCount: order.teamsCount,
      amountCents: order.amountCents,
      currency: order.currency,
      createdAt: order.createdAt,
      paidAt: order.paidAt,
      // Stripe's own hosted receipt -- see applyPaidPublicationSession.
      // Null for a $0 free-tier order or a still-PENDING_PAYMENT one.
      stripeReceiptUrl: order.stripeReceiptUrl,
    }));
  }

  /**
   * Publishing is gated behind a one-time Stripe payment computed from a
   * team-count tier (feat/044, see
   * docs/architecture/adr/0006-paid-tournament-publication.md), topped up
   * rather than re-charged in full as the tournament grows: re-runs on
   * every call, including on an already-PUBLISHED tournament (feat/XXX --
   * "toujours revérifier lors d'une republication". Previously a second
   * call was rejected outright with ConflictException, which meant a
   * tournament that grew past its paid tier after publishing -- more teams
   * added later -- had no way to ever be charged for the upgrade; the old
   * `alreadyPaid` shortcut only ever checked "has ANY order ever been
   * paid", not "does a paid order cover the CURRENT team count's tier").
   * assertTeamAdditionAllowed (see below) is the first line of defense --
   * it blocks a team being added past the paid tier in the first place --
   * this is the second: whatever the current team count actually is,
   * publish()/republish always charges exactly the gap between what's
   * required now and what's already been paid, never less, never double.
   * An organization with an active annual subscription pays nothing here
   * regardless of team count, same as before.
   */
  async publish(organizationId: string, tournamentId: string) {
    await this.organizationsService.assertNotSuspended(organizationId);
    const tournament = await this.getOrThrow(organizationId, tournamentId);
    this.assertEditable(tournament);
    await this.assertReadyToPublish(tournamentId);

    const [categoriesCount, teamsCount, hasActiveSubscription, paidTotal] =
      await Promise.all([
        this.prisma.category.count({ where: { tournamentId } }),
        this.prisma.team.count({ where: { tournamentId } }),
        this.organizationsService.hasActiveSubscription(organizationId),
        this.prisma.tournamentPublicationOrder.aggregate({
          where: {
            tournamentId,
            status: TournamentPublicationOrderStatus.PAID,
          },
          _sum: { amountCents: true },
        }),
      ]);
    // Every PAID order's amountCents is itself already a gap/top-up amount
    // (requiredCents - alreadyPaidCents at the time it was charged, see
    // amountCents below and payForTeamAdditionTier/payForTournamentTier's
    // own identical pattern) -- so what's actually been paid so far is the
    // SUM of every PAID order, never just the largest one. Summing the
    // wrong way (_max) used to under-count as soon as a tournament crossed
    // a second tier (e.g. FREE->STANDARD->LARGE): the LARGE top-up's own
    // amount could be smaller than the STANDARD order that preceded it,
    // making the system think less had been paid than actually had, and
    // demanding a second, overlapping payment for the same tier.
    // Prisma's aggregate _sum is null specifically when zero rows match --
    // distinct from a real $0 order, which is exactly the very-first-publish
    // case below still needs to tell apart from "already published, still
    // within the tier already paid for".
    const hasPriorPaidOrder = paidTotal._sum.amountCents !== null;
    const alreadyPaidCents = paidTotal._sum.amountCents ?? 0;
    const requiredCents = hasActiveSubscription
      ? 0
      : this.computePublicationFeeCents(teamsCount);
    const currency = 'eur';

    // A prior paid order already covers the current tier -- nothing new to
    // charge or record, just (re-)confirm PUBLISHED. Doesn't short-circuit
    // the very first publish of a genuinely free tournament (no prior order
    // exists yet there) -- that one still falls through and records its own
    // $0 PAID order below, same as always.
    if (hasPriorPaidOrder && requiredCents <= alreadyPaidCents) {
      return this.setStatus(tournamentId, TournamentStatus.PUBLISHED);
    }

    const amountCents = Math.max(0, requiredCents - alreadyPaidCents);

    if (amountCents <= 0) {
      await this.prisma.tournamentPublicationOrder.create({
        data: {
          tournamentId,
          status: TournamentPublicationOrderStatus.PAID,
          categoriesCount,
          teamsCount,
          amountCents,
          currency,
          paidAt: new Date(),
        },
      });
      return this.setStatus(tournamentId, TournamentStatus.PUBLISHED);
    }

    return this.createPendingPublicationCheckout(tournament, {
      categoriesCount,
      teamsCount,
      amountCents,
      currency,
    });
  }

  /**
   * Shared by publish() and payForTeamAdditionTier() below -- creates the
   * PENDING_PAYMENT order row and its Stripe Checkout session. Split out
   * once a second caller needed the exact same "create order, start
   * checkout, stamp the session id back onto it" sequence.
   */
  private async createPendingPublicationCheckout(
    tournament: Pick<Tournament, 'id' | 'name'>,
    data: {
      categoriesCount: number;
      teamsCount: number;
      amountCents: number;
      currency: string;
    },
  ): Promise<{ status: 'PENDING_PAYMENT'; checkoutUrl: string }> {
    const order = await this.prisma.tournamentPublicationOrder.create({
      data: { tournamentId: tournament.id, ...data },
    });

    const webUrl = this.configService.get<string>(
      'ADMIN_WEB_URL',
      'http://localhost:4200',
    );
    const session = await this.stripeService.createCheckoutSession({
      amountCents: data.amountCents,
      currency: data.currency,
      productName: `Publication du tournoi — ${tournament.name}`,
      successUrl: `${webUrl}/admin/tournaments/${tournament.id}/publish/success?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${webUrl}/admin/tournaments/${tournament.id}?publishCancelled=1`,
      metadata: { tournamentPublicationOrderId: order.id },
    });

    await this.prisma.tournamentPublicationOrder.update({
      where: { id: order.id },
      data: { stripeCheckoutSessionId: session.id },
    });

    return { status: 'PENDING_PAYMENT', checkoutUrl: session.url! };
  }

  /**
   * Pays (or free-confirms) the tier an already-PUBLISHED tournament would
   * need if `additionalTeams` more teams were added -- the team(s)
   * themselves are NOT created here, that's still TeamsService.create()'s
   * job. Exists specifically for the "you're blocked, upgrade to unblock"
   * dialog (apps/web's team-list.page.ts): assertTeamAdditionAllowed below
   * blocks the addition BEFORE it happens, so by the time the organizer
   * clicks "upgrade", the tournament's stored team count hasn't actually
   * grown yet -- calling plain publish() again would price against that
   * still-too-low count and silently do nothing. This prices against
   * teamsCount + additionalTeams instead, same "charge only the gap" logic
   * as publish() otherwise.
   */
  async payForTeamAdditionTier(
    organizationId: string,
    tournamentId: string,
    additionalTeams: number,
  ): Promise<
    { status: 'PUBLISHED' } | { status: 'PENDING_PAYMENT'; checkoutUrl: string }
  > {
    await this.organizationsService.assertNotSuspended(organizationId);
    const tournament = await this.getOrThrow(organizationId, tournamentId);
    this.assertEditable(tournament);

    const [categoriesCount, teamsCount, hasActiveSubscription, paidTotal] =
      await Promise.all([
        this.prisma.category.count({ where: { tournamentId } }),
        this.prisma.team.count({ where: { tournamentId } }),
        this.organizationsService.hasActiveSubscription(organizationId),
        this.prisma.tournamentPublicationOrder.aggregate({
          where: {
            tournamentId,
            status: TournamentPublicationOrderStatus.PAID,
          },
          _sum: { amountCents: true },
        }),
      ]);
    // See publish()'s own comment on why this is a SUM of every PAID order,
    // not just the largest one.
    const alreadyPaidCents = paidTotal._sum.amountCents ?? 0;
    const prospectiveTeamsCount = teamsCount + additionalTeams;
    const requiredCents = hasActiveSubscription
      ? 0
      : this.computePublicationFeeCents(prospectiveTeamsCount);
    const currency = 'eur';

    if (requiredCents <= alreadyPaidCents) {
      // Already covered (e.g. tier prices are unset/0 in this environment,
      // or the org just gained an active subscription) -- nothing to
      // charge, and no order to record: publish()/republish already owns
      // recording the tournament's actual paid history, this endpoint only
      // ever pre-pays for a *prospective* count that may never even be
      // reached if the organizer changes their mind.
      return { status: 'PUBLISHED' };
    }

    const amountCents = requiredCents - alreadyPaidCents;
    return this.createPendingPublicationCheckout(tournament, {
      categoriesCount,
      teamsCount: prospectiveTeamsCount,
      amountCents,
      currency,
    });
  }

  /** Reverse of tierCodeForFeeCents -- the flat price of a given tier, regardless of team count. FREE is always 0. */
  private tierPriceCents(tier: 'STANDARD' | 'LARGE'): number {
    const key =
      tier === 'STANDARD'
        ? 'TOURNAMENT_PUBLICATION_TIER_MID_PRICE_CENTS'
        : 'TOURNAMENT_PUBLICATION_TIER_HIGH_PRICE_CENTS';
    return Number(this.configService.get<string>(key, '0'));
  }

  /**
   * Directly pays for a chosen plan tier (apps/web's new "Plan" section,
   * card-list-with-a-confirm-popup -- distinct from
   * payForTeamAdditionTier's own trigger, which is computed from a
   * prospective team count instead of picked outright). Works before the
   * tournament has ever been published too (assertEditable, not a PUBLISHED
   * check) -- pre-paying for a higher tier ahead of publish() just means
   * publish() itself finds the gap already covered and charges nothing.
   */
  async payForTournamentTier(
    organizationId: string,
    tournamentId: string,
    tier: 'STANDARD' | 'LARGE',
  ): Promise<
    { status: 'PUBLISHED' } | { status: 'PENDING_PAYMENT'; checkoutUrl: string }
  > {
    await this.organizationsService.assertNotSuspended(organizationId);
    const tournament = await this.getOrThrow(organizationId, tournamentId);
    this.assertEditable(tournament);

    const [categoriesCount, teamsCount, paidTotal] = await Promise.all([
      this.prisma.category.count({ where: { tournamentId } }),
      this.prisma.team.count({ where: { tournamentId } }),
      this.prisma.tournamentPublicationOrder.aggregate({
        where: { tournamentId, status: TournamentPublicationOrderStatus.PAID },
        _sum: { amountCents: true },
      }),
    ]);
    // See publish()'s own comment on why this is a SUM of every PAID order,
    // not just the largest one.
    const alreadyPaidCents = paidTotal._sum.amountCents ?? 0;
    const requiredCents = this.tierPriceCents(tier);
    const currency = 'eur';

    if (requiredCents <= alreadyPaidCents) {
      return { status: 'PUBLISHED' };
    }

    const amountCents = requiredCents - alreadyPaidCents;
    return this.createPendingPublicationCheckout(tournament, {
      categoriesCount,
      teamsCount,
      amountCents,
      currency,
    });
  }

  /** Called by PaymentsWebhookController after Stripe signature verification. */
  async handlePublicationStripeEvent(event: Stripe.Event): Promise<void> {
    if (event.type !== 'checkout.session.completed') {
      return;
    }
    await this.applyPaidPublicationSession(event.data.object);
  }

  /**
   * Called from the organizer's own browser landing on /publish/success
   * (session_id is already in that URL's query string) -- verifies the
   * session directly against Stripe instead of just polling the tournament
   * and hoping the webhook already updated it. See
   * StripeService.retrieveCheckoutSession's doc comment for why this
   * matters beyond local dev too. A session that isn't ours, isn't paid
   * yet, or was already applied (by the webhook, or a previous call here)
   * is a silent no-op -- this always just returns the tournament's current
   * state either way, never an error, so the success page can call it
   * unconditionally.
   */
  async confirmPublicationPayment(
    organizationId: string,
    tournamentId: string,
    stripeCheckoutSessionId: string,
    lang: MailLanguage = DEFAULT_MAIL_LANGUAGE,
  ) {
    const order = await this.prisma.tournamentPublicationOrder.findUnique({
      where: { stripeCheckoutSessionId },
    });
    if (
      order &&
      order.tournamentId === tournamentId &&
      order.status === TournamentPublicationOrderStatus.PENDING_PAYMENT
    ) {
      const session = await this.stripeService.retrieveCheckoutSession(
        stripeCheckoutSessionId,
      );
      if (session.payment_status === 'paid') {
        await this.applyPaidPublicationSession(session, lang);
      }
    }
    const tournament = await this.getOrThrow(organizationId, tournamentId);
    return this.toDetail(tournament);
  }

  /**
   * Shared by the webhook handler and confirmPublicationPayment above --
   * same "mark paid + publish + email the receipt" side effects regardless
   * of which one first learns the session is genuinely paid. `lang`
   * defaults to French for the webhook path -- see the identical note on
   * OrganizationsService.applyPaidSubscriptionSession.
   */
  private async applyPaidPublicationSession(
    session: Stripe.Checkout.Session,
    lang: MailLanguage = DEFAULT_MAIL_LANGUAGE,
  ): Promise<void> {
    const order = await this.prisma.tournamentPublicationOrder.findUnique({
      where: { stripeCheckoutSessionId: session.id },
      include: { tournament: true },
    });
    // Idempotent: a retried webhook delivery, a confirm call racing the
    // webhook, or an event/session for a checkout this service didn't
    // create (e.g. a player registration's), is a silent no-op rather than
    // an error -- same guarantee as RegistrationsService.handleStripeEvent.
    if (
      !order ||
      order.status !== TournamentPublicationOrderStatus.PENDING_PAYMENT
    ) {
      return;
    }

    const paymentIntentId =
      typeof session.payment_intent === 'string'
        ? session.payment_intent
        : (session.payment_intent?.id ?? null);
    // Best-effort (own try/catch, not the transaction below) -- a Stripe
    // API hiccup fetching the receipt is never worth blocking "mark paid +
    // publish" over. Null for the $0 free-tier path too, which never has a
    // paymentIntentId (see publish()'s own amountCents<=0 branch, no Stripe
    // Checkout session at all there).
    let stripeReceiptUrl: string | null = null;
    if (paymentIntentId) {
      try {
        stripeReceiptUrl =
          await this.stripeService.retrieveChargeReceiptUrl(paymentIntentId);
      } catch (error) {
        this.logger.warn(
          `Failed to retrieve Stripe receipt URL for payment intent ${paymentIntentId}: ${(error as Error).message}`,
        );
      }
    }

    await this.prisma.$transaction([
      this.prisma.tournamentPublicationOrder.update({
        where: { id: order.id },
        data: {
          status: TournamentPublicationOrderStatus.PAID,
          paidAt: new Date(),
          stripePaymentIntentId: paymentIntentId,
          stripeReceiptUrl,
        },
      }),
      this.prisma.tournament.update({
        where: { id: order.tournamentId },
        data: { status: TournamentStatus.PUBLISHED },
      }),
    ]);

    await this.sendPublicationReceipt(order, stripeReceiptUrl, lang);
  }

  /**
   * Best-effort, non-blocking (same rationale as
   * InvitationsService.invite's mail try/catch): the tournament is already
   * PUBLISHED regardless of whether the receipt email makes it out.
   */
  private async sendPublicationReceipt(
    order: {
      tournament: { name: string; organizationId: string };
      amountCents: number;
      currency: string;
    },
    stripeReceiptUrl: string | null,
    lang: MailLanguage,
  ): Promise<void> {
    const adminEmails = await this.organizationsService.getAdminEmails(
      order.tournament.organizationId,
    );
    for (const email of adminEmails) {
      try {
        await this.mailService.sendPublicationReceiptEmail(
          email,
          order.tournament.name,
          order.amountCents,
          order.currency,
          stripeReceiptUrl,
          lang,
        );
      } catch (error) {
        this.logger.warn(
          `Failed to send publication receipt email to ${email}: ${(error as Error).message}`,
        );
      }
    }
  }

  /**
   * Fixed StoreKit price for a tournament-tier IAP product, sourced from
   * the exact same .env-configured cents amounts as the Stripe path
   * (tierPriceCents) rather than a separate hardcoded number -- keeps the
   * price an organizer sees quoted in the app (computed from team count,
   * same UI copy as web) and the price actually charged by StoreKit in
   * sync automatically whenever the .env price changes, instead of two
   * numbers that could silently drift apart. The upgrade product's price
   * is the STANDARD->LARGE gap, mirroring publish()'s own delta-billing
   * math (`amountCents = requiredCents - alreadyPaidCents`) -- Apple has
   * no notion of crediting a prior purchase, so that gap has to be its own
   * fixed-price product (see the App Store Connect setup this requires,
   * revenuecat.service.ts's own module comment).
   */
  private iapProductPriceCents(productId: IapProductId): number {
    switch (productId) {
      case IAP_PRODUCT_IDS.TOURNAMENT_PUBLICATION_STANDARD:
        return this.tierPriceCents('STANDARD');
      case IAP_PRODUCT_IDS.TOURNAMENT_PUBLICATION_LARGE:
        return this.tierPriceCents('LARGE');
      case IAP_PRODUCT_IDS.TOURNAMENT_PUBLICATION_UPGRADE_STANDARD_TO_LARGE:
        return Math.max(
          0,
          this.tierPriceCents('LARGE') - this.tierPriceCents('STANDARD'),
        );
      default:
        return 0;
    }
  }

  /**
   * The iOS counterpart to publish()'s Stripe Checkout path (App Review
   * guideline 3.1.1 -- see docs/architecture/adr/0008-ios-distribution.md).
   * Unlike Stripe Checkout, a StoreKit purchase happens entirely on-device
   * first (via RevenueCat's SDK), so there's no server-created "pending
   * order" for the app to redirect into beforehand -- the app calls this
   * only *after* StoreKit reports success, and this method independently
   * re-verifies that purchase against RevenueCat's own records
   * (fetchSubscriber) rather than trusting the client's say-so, same
   * "never trust a client-reported payment" posture as
   * confirmPublicationPayment verifying against Stripe's API rather than
   * just the client's redirect. `userId` is the authenticated organizer's
   * own User.id, used as RevenueCat's app_user_id (configured client-side
   * at SDK init, see the mobile app's RevenueCat wiring) -- no separate
   * RevenueCat-specific identifier stored anywhere.
   */
  async confirmPublicationPaymentViaIap(
    organizationId: string,
    tournamentId: string,
    userId: string,
    dto: ConfirmIapPurchaseDto,
    lang: MailLanguage = DEFAULT_MAIL_LANGUAGE,
  ) {
    await this.organizationsService.assertNotSuspended(organizationId);
    const tournament = await this.getOrThrow(organizationId, tournamentId);
    this.assertEditable(tournament);

    const amountCents = this.iapProductPriceCents(dto.productId);
    if (amountCents <= 0) {
      throw new BadRequestException(
        'Ce produit ne correspond à aucun palier payant configuré.',
      );
    }

    const subscriber = await this.revenueCatService.fetchSubscriber(userId);
    const purchases = subscriber.non_subscriptions[dto.productId] ?? [];
    // Most recent purchase of this product not already recorded against
    // another order -- the DB's own @unique constraint on
    // revenueCatTransactionId is the real guard against double-spending a
    // single transaction across two orders; this just picks a sensible
    // candidate to try first (newest = most likely to be the purchase the
    // app is actually confirming right now).
    const existingTransactionIds = new Set(
      (
        await this.prisma.tournamentPublicationOrder.findMany({
          where: { revenueCatTransactionId: { not: null } },
          select: { revenueCatTransactionId: true },
        })
      ).map((order) => order.revenueCatTransactionId),
    );
    const purchase = [...purchases]
      .sort((a, b) => b.purchase_date.localeCompare(a.purchase_date))
      .find((entry) => !existingTransactionIds.has(entry.id));

    if (!purchase) {
      throw new BadRequestException(
        "Aucun achat correspondant n'a été trouvé auprès d'Apple. Réessayez dans quelques instants.",
      );
    }

    const [categoriesCount, teamsCount] = await Promise.all([
      this.prisma.category.count({ where: { tournamentId } }),
      this.prisma.team.count({ where: { tournamentId } }),
    ]);

    await this.applyPaidPublicationViaIap(
      tournament,
      purchase.id,
      amountCents,
      categoriesCount,
      teamsCount,
      lang,
    );
    return this.toDetail(await this.getOrThrow(organizationId, tournamentId));
  }

  /**
   * Shared by confirmPublicationPaymentViaIap above and the RevenueCat
   * webhook handler below -- same "record a PAID order + publish + email
   * the receipt" side effects regardless of which one first learns the
   * purchase is genuine, same duality as applyPaidPublicationSession's own
   * confirm-call/webhook pair for Stripe.
   */
  private async applyPaidPublicationViaIap(
    tournament: Pick<Tournament, 'id' | 'name' | 'organizationId'>,
    revenueCatTransactionId: string,
    amountCents: number,
    categoriesCount: number,
    teamsCount: number,
    lang: MailLanguage,
  ): Promise<void> {
    // Idempotent: a retried webhook delivery, or a confirm call racing the
    // webhook for the very same transaction, no-ops via the @unique
    // constraint on revenueCatTransactionId rather than a raced double
    // "PAID + PUBLISHED" write.
    const alreadyRecorded =
      await this.prisma.tournamentPublicationOrder.findUnique({
        where: { revenueCatTransactionId },
      });
    if (alreadyRecorded) {
      return;
    }

    await this.prisma.$transaction([
      this.prisma.tournamentPublicationOrder.create({
        data: {
          tournamentId: tournament.id,
          status: TournamentPublicationOrderStatus.PAID,
          categoriesCount,
          teamsCount,
          amountCents,
          currency: 'eur',
          revenueCatTransactionId,
          paidAt: new Date(),
        },
      }),
      this.prisma.tournament.update({
        where: { id: tournament.id },
        data: { status: TournamentStatus.PUBLISHED },
      }),
    ]);

    await this.sendPublicationReceipt(
      { tournament, amountCents, currency: 'eur' },
      null,
      lang,
    );
  }

  /**
   * Called by PaymentsWebhookController after RevenueCat signature
   * verification -- the durable confirmation path (mirrors
   * handlePublicationStripeEvent), independent of whether the app's own
   * confirmPublicationPaymentViaIap call already landed first. Only
   * NON_RENEWING_PURCHASE (RevenueCat's event type for a one-time IAP,
   * which every tournament-tier product is) and only the tournament-tier
   * product ids are handled here -- ANNUAL_SUBSCRIPTION events are
   * OrganizationsService.handleRevenueCatSubscriptionWebhookEvent's job,
   * and every other event type/product id (renewals, cancellations of a
   * subscription this service doesn't own, RevenueCat's own TEST event)
   * is a silent no-op, same tolerance as handlePublicationStripeEvent's
   * own event.type filter.
   */
  async handleRevenueCatWebhookEvent(
    event: RevenueCatWebhookEvent,
  ): Promise<void> {
    const { type, product_id: productId, app_user_id: userId } = event.event;
    if (
      type !== 'NON_RENEWING_PURCHASE' &&
      type !== 'INITIAL_PURCHASE' // RevenueCat's sandbox test purchases arrive as this type instead
    ) {
      return;
    }
    const tournamentTierProductIds: string[] = [
      IAP_PRODUCT_IDS.TOURNAMENT_PUBLICATION_STANDARD,
      IAP_PRODUCT_IDS.TOURNAMENT_PUBLICATION_LARGE,
      IAP_PRODUCT_IDS.TOURNAMENT_PUBLICATION_UPGRADE_STANDARD_TO_LARGE,
    ];
    if (!tournamentTierProductIds.includes(productId)) {
      return;
    }

    // No tournamentId is carried on the webhook event itself (RevenueCat
    // only knows app_user_id/product_id/transaction_id, nothing about this
    // app's own domain) -- confirmPublicationPaymentViaIap already applied
    // the exact same purchase by the time this webhook typically arrives
    // (the app's own confirm call is synchronous, right after StoreKit
    // returns), so this only needs to be a safety net: re-fetch the
    // subscriber and, if this exact transaction was somehow never
    // recorded, there's no tournament context left to publish -- log and
    // move on rather than guessing which tournament it was for. Prevented
    // in the overwhelmingly common case by the app's own synchronous
    // confirm call always running first.
    const alreadyRecorded =
      await this.prisma.tournamentPublicationOrder.findUnique({
        where: { revenueCatTransactionId: event.event.transaction_id },
      });
    if (alreadyRecorded) {
      return;
    }
    this.logger.warn(
      `RevenueCat webhook for transaction ${event.event.transaction_id} (user ${userId}, product ${productId}) arrived with no matching order -- the app's own confirm-iap call should have recorded it first. Not applied: no tournament context available from the webhook payload alone.`,
    );
  }

  async unpublish(organizationId: string, tournamentId: string) {
    const tournament = await this.getOrThrow(organizationId, tournamentId);
    this.assertEditable(tournament);
    if (tournament.status !== TournamentStatus.PUBLISHED) {
      throw new ConflictException('Seul un tournoi publié peut être dépublié.');
    }
    return this.setStatus(tournamentId, TournamentStatus.UNPUBLISHED);
  }

  async archive(organizationId: string, tournamentId: string) {
    const tournament = await this.getOrThrow(organizationId, tournamentId);
    if (tournament.status === TournamentStatus.ARCHIVED) {
      throw new ConflictException('Ce tournoi est déjà archivé.');
    }
    const updated = await this.prisma.tournament.update({
      where: { id: tournamentId },
      data: { status: TournamentStatus.ARCHIVED, archivedAt: new Date() },
      include: { sport: true },
    });
    return this.toDetail(updated);
  }

  async unarchive(organizationId: string, tournamentId: string) {
    const tournament = await this.getOrThrow(organizationId, tournamentId);
    if (tournament.status !== TournamentStatus.ARCHIVED) {
      throw new ConflictException(
        'Seul un tournoi archivé peut être désarchivé.',
      );
    }
    // Always back to DRAFT — the previous status isn't remembered, matching
    // the rule that a duplicated tournament also always starts as DRAFT.
    const updated = await this.prisma.tournament.update({
      where: { id: tournamentId },
      data: { status: TournamentStatus.DRAFT, archivedAt: null },
      include: { sport: true },
    });
    return this.toDetail(updated);
  }

  async duplicate(
    organizationId: string,
    tournamentId: string,
    dto: DuplicateTournamentDto,
  ) {
    const source = await this.getOrThrow(organizationId, tournamentId);
    const newName = dto.name ?? `${source.name} (copie)`;

    const clone = await this.prisma.$transaction(async (tx) => {
      const newTournament = await tx.tournament.create({
        data: {
          organizationId,
          sportId: source.sportId,
          name: newName,
          slug: generateSlug(newName),
          startDate: source.startDate,
          endDate: source.endDate,
          isOnline: source.isOnline,
          isListed: source.isListed,
          theme: source.theme,
          status: TournamentStatus.DRAFT,
        },
      });

      const categories = await tx.category.findMany({
        where: { tournamentId: source.id },
        include: { divisions: true },
      });
      for (const category of categories) {
        const newCategory = await tx.category.create({
          data: {
            tournamentId: newTournament.id,
            name: category.name,
            position: category.position,
          },
        });
        for (const division of category.divisions) {
          await tx.division.create({
            data: {
              categoryId: newCategory.id,
              name: division.name,
              colorHex: division.colorHex,
              position: division.position,
            },
          });
        }
      }

      const administrators = await tx.tournamentAdministrator.findMany({
        where: { tournamentId: source.id },
        include: { permissions: true },
      });
      for (const administrator of administrators) {
        const newAdministrator = await tx.tournamentAdministrator.create({
          data: {
            tournamentId: newTournament.id,
            userId: administrator.userId,
          },
        });
        for (const grant of administrator.permissions) {
          await tx.tournamentAdministratorPermission.create({
            data: {
              tournamentAdministratorId: newAdministrator.id,
              permissionId: grant.permissionId,
            },
          });
        }
      }

      return newTournament;
    });

    return this.getDetail(organizationId, clone.id);
  }

  /** Used by the categories/divisions/administrators services before any write. */
  async assertTournamentIsEditable(
    organizationId: string,
    tournamentId: string,
  ): Promise<Tournament> {
    const tournament = await this.getOrThrow(organizationId, tournamentId);
    this.assertEditable(tournament);
    return tournament;
  }

  async assertTournamentExists(
    organizationId: string,
    tournamentId: string,
  ): Promise<Tournament> {
    return this.getOrThrow(organizationId, tournamentId);
  }

  /**
   * Stored on local disk under UPLOADS_DIR (default ./uploads), served
   * statically by the API itself at /uploads (see main.ts) -- same layout
   * as TeamsService.uploadLogo, just its own tournament-logos subfolder.
   */
  async uploadLogo(
    organizationId: string,
    tournamentId: string,
    file: Express.Multer.File,
  ) {
    const tournament = await this.assertTournamentIsEditable(
      organizationId,
      tournamentId,
    );
    await this.assertPremiumFeaturesUnlocked(organizationId, tournamentId);

    const logoUrl = await this.saveLogoBuffer(
      tournamentId,
      file.buffer,
      file.mimetype,
      file.size,
    );
    await this.deleteLogoFile(tournament.logoUrl);

    const updated = await this.prisma.tournament.update({
      where: { id: tournamentId },
      data: { logoUrl },
      include: { sport: true },
    });
    return this.toDetail(updated);
  }

  async removeLogo(organizationId: string, tournamentId: string) {
    const tournament = await this.assertTournamentIsEditable(
      organizationId,
      tournamentId,
    );
    await this.deleteLogoFile(tournament.logoUrl);

    const updated = await this.prisma.tournament.update({
      where: { id: tournamentId },
      data: { logoUrl: null },
      include: { sport: true },
    });
    return this.toDetail(updated);
  }

  private async saveLogoBuffer(
    tournamentId: string,
    buffer: Buffer,
    mimetype: string,
    sizeBytes: number,
  ): Promise<string> {
    const extension = TOURNAMENT_LOGO_ALLOWED_MIME_TYPES[mimetype];
    if (!extension) {
      throw new BadRequestException(
        "Format d'image non supporté (PNG, JPEG ou WebP uniquement).",
      );
    }
    if (sizeBytes > TOURNAMENT_LOGO_MAX_SIZE_BYTES) {
      throw new BadRequestException('Le logo ne doit pas dépasser 2 Mo.');
    }
    if (!matchesImageMagicBytes(buffer, mimetype)) {
      throw new BadRequestException(
        "Le contenu du fichier ne correspond pas au format d'image déclaré.",
      );
    }

    const logosDir = join(this.uploadsDir(), 'tournament-logos');
    await fs.mkdir(logosDir, { recursive: true });
    const filename = `${tournamentId}-${randomUUID()}.${extension}`;
    await fs.writeFile(join(logosDir, filename), buffer);
    return `/uploads/tournament-logos/${filename}`;
  }

  private uploadsDir(): string {
    return this.configService.get<string>('UPLOADS_DIR', './uploads');
  }

  /** Best-effort: a file already gone (or never existing) is not an error. */
  private async deleteLogoFile(logoUrl: string | null): Promise<void> {
    if (!logoUrl) {
      return;
    }
    const filename = logoUrl.split('/').pop();
    if (!filename) {
      return;
    }
    try {
      await fs.unlink(join(this.uploadsDir(), 'tournament-logos', filename));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }

  /**
   * Public directory: every PUBLISHED *and* isListed tournament across every
   * organization. isListed is the organizer's own opt-out of discoverability
   * only — a tournament with isListed: false is still fully reachable by
   * anyone who has its direct slug link (see getPublicBySlug below, which is
   * not gated by this field), it just doesn't appear here. Most recent
   * first, capped well below "everything" so a homepage card list stays a
   * list, not a dump.
   */
  async listPublished(limit = 20) {
    const tournaments = await this.prisma.tournament.findMany({
      where: { status: TournamentStatus.PUBLISHED, isListed: true },
      include: {
        sport: true,
        // Cards show one location line, not a venue-by-venue breakdown --
        // first by display position is as good a pick as any when a
        // tournament spans several.
        venues: { orderBy: { position: 'asc' }, take: 1 },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return tournaments.map((tournament) => this.toPublicListItem(tournament));
  }

  /**
   * Public directory search — every filter is optional and AND-combined.
   * Same isListed/PUBLISHED gate as listPublished above, this is just the
   * filterable/paginated sibling of it (a dedicated method rather than
   * extending listPublished itself, so its existing simple contract —
   * PublicTournamentSummary[], no pagination envelope — stays untouched for
   * its current callers, the landing page and the mobile home screen).
   */
  async searchPublished(params: PublicTournamentSearchParams) {
    const page = params.page && params.page > 0 ? Math.floor(params.page) : 1;
    const pageSize =
      params.pageSize && params.pageSize > 0
        ? Math.min(Math.floor(params.pageSize), 50)
        : 20;

    const where: Prisma.TournamentWhereInput = {
      status: TournamentStatus.PUBLISHED,
      isListed: true,
      ...(params.sportId ? { sportId: params.sportId } : {}),
      ...(params.q
        ? { name: { contains: params.q, mode: 'insensitive' } }
        : {}),
      ...(params.dateFrom
        ? { startDate: { gte: new Date(params.dateFrom) } }
        : {}),
      ...(params.location
        ? {
            venues: {
              some: {
                OR: [
                  { name: { contains: params.location, mode: 'insensitive' } },
                  {
                    address: {
                      contains: params.location,
                      mode: 'insensitive',
                    },
                  },
                ],
              },
            },
          }
        : {}),
    };

    const [tournaments, total] = await Promise.all([
      this.prisma.tournament.findMany({
        where,
        include: {
          sport: true,
          organization: { select: { name: true } },
          venues: { orderBy: { position: 'asc' }, take: 1 },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.tournament.count({ where }),
    ]);

    return {
      items: tournaments.map((tournament) =>
        this.toPublicDirectoryItem(tournament),
      ),
      total,
    };
  }

  /**
   * Public-site lookup: no organizationId (visitors don't know it), and only
   * a PUBLISHED tournament is findable — everything else (draft, unpublished,
   * archived, or no such slug) reads identically as "not found" so the public
   * site never leaks whether a private tournament exists.
   */
  async getPublicBySlug(slug: string) {
    const tournament = await this.prisma.tournament.findUnique({
      where: { slug },
      include: { sport: true },
    });
    if (!tournament || tournament.status !== TournamentStatus.PUBLISHED) {
      throw new NotFoundException('Tournoi introuvable.');
    }
    return {
      organizationId: tournament.organizationId,
      tournamentId: tournament.id,
      ...this.toSummary(tournament),
      // Not on toSummary() itself -- that would also load onto every row of
      // the admin's own tournament list (list() above uses toSummary too),
      // wasteful for a list view. This is the only public endpoint
      // (PublicService.getTournament) that needs the full text.
      description: tournament.description,
      rules: tournament.rules,
      practicalInfo: tournament.practicalInfo,
    };
  }

  private async getOrThrow(
    organizationId: string,
    tournamentId: string,
  ): Promise<TournamentWithSport> {
    const tournament = await this.prisma.tournament.findUnique({
      where: { id: tournamentId },
      include: { sport: true },
    });
    if (!tournament || tournament.organizationId !== organizationId) {
      throw new NotFoundException('Tournoi introuvable.');
    }
    return tournament;
  }

  private assertEditable(tournament: { status: TournamentStatus }): void {
    if (tournament.status === TournamentStatus.ARCHIVED) {
      throw new ConflictException(
        'Ce tournoi est archivé, désarchivez-le avant de le modifier.',
      );
    }
  }

  /**
   * Publishing requires a structure to have been chosen for at least one
   * category, and -- for whichever of those categories has a real (non-seed)
   * pool phase -- a calendar generated for it (feat/XXX, product request:
   * "la publication doit être possible uniquement si on a choisi la
   * structure et que le calendrier des poules au moins est généré"). A pure
   * KNOCKOUT_ONLY category has no pool phase to schedule ahead of time at
   * all (see tournament-creation.service.ts's own comment on the mobile
   * side, and ScheduleController's own "only a pool phase" guard) -- its
   * seed phase existing is enough, there's no calendar step to demand there.
   */
  private async assertReadyToPublish(tournamentId: string): Promise<void> {
    const categories = await this.prisma.category.findMany({
      where: { tournamentId },
      select: { id: true },
    });
    if (categories.length === 0) {
      throw new ConflictException({
        message:
          'Ajoutez au moins une catégorie et structurez-la (poules ou tableau) avant de publier.',
        code: 'PUBLISH_NO_CATEGORY',
      });
    }
    const categoryIds = categories.map((category) => category.id);

    const phaseCount = await this.prisma.competitionPhase.count({
      where: { categoryId: { in: categoryIds } },
    });
    if (phaseCount === 0) {
      throw new ConflictException({
        message:
          'Choisissez une structure (poules ou tableau) avant de publier.',
        code: 'PUBLISH_NO_STRUCTURE',
      });
    }

    const realGroupStagePhases = await this.prisma.competitionPhase.findMany({
      where: {
        categoryId: { in: categoryIds },
        type: CompetitionPhaseType.GROUP_STAGE,
        isSeedPhase: false,
      },
      select: { id: true },
    });
    if (realGroupStagePhases.length === 0) {
      // Pure KNOCKOUT_ONLY (or some other structure with no real pool
      // phase) -- nothing to schedule ahead of time, see this method's own
      // doc comment.
      return;
    }
    const matchCount = await this.prisma.match.count({
      where: {
        group: {
          phaseId: { in: realGroupStagePhases.map((phase) => phase.id) },
        },
      },
    });
    if (matchCount === 0) {
      throw new ConflictException({
        message: 'Générez le calendrier des poules avant de publier.',
        code: 'PUBLISH_NO_CALENDAR',
      });
    }
  }

  private async assertSportExists(sportId: string): Promise<void> {
    const sport = await this.prisma.sport.findUnique({
      where: { id: sportId },
    });
    if (!sport) {
      throw new BadRequestException('Sport introuvable.');
    }
  }

  private parseStatusFilter(
    statusFilter?: string,
  ): TournamentStatus | undefined {
    if (statusFilter === undefined) {
      return undefined;
    }
    if (
      !Object.values(TournamentStatus).includes(
        statusFilter as TournamentStatus,
      )
    ) {
      throw new BadRequestException(`Statut invalide : ${statusFilter}`);
    }
    return statusFilter as TournamentStatus;
  }

  /**
   * Tiered by team count alone (feat/044, replaces the per-category/per-team
   * rate of feat/039 -- see
   * docs/architecture/adr/0006-paid-tournament-publication.md): free up to
   * the free-tier max, a flat mid price up to the mid-tier max, a flat high
   * price beyond that (unlimited teams). Both tier prices default to 0
   * (unset in .env) so publishing stays free until the project owner
   * explicitly sets a price, same posture already taken for
   * STRIPE_SECRET_KEY. The tier boundaries themselves also have defaults
   * (8 / 48 teams) matching the product decision, but stay configurable.
   */
  private computePublicationFeeCents(teamsCount: number): number {
    const freeMaxTeams = this.freeMaxTeams();
    const midMaxTeams = Number(
      this.configService.get<string>(
        'TOURNAMENT_PUBLICATION_TIER_MID_MAX_TEAMS',
        '48',
      ),
    );
    if (teamsCount <= freeMaxTeams) {
      return 0;
    }
    if (teamsCount <= midMaxTeams) {
      return Number(
        this.configService.get<string>(
          'TOURNAMENT_PUBLICATION_TIER_MID_PRICE_CENTS',
          '0',
        ),
      );
    }
    return Number(
      this.configService.get<string>(
        'TOURNAMENT_PUBLICATION_TIER_HIGH_PRICE_CENTS',
        '0',
      ),
    );
  }

  /** Public so TeamsService can compose its own premium-gating messages with the same boundary. */
  freeMaxTeams(): number {
    return Number(
      this.configService.get<string>(
        'TOURNAMENT_PUBLICATION_TIER_FREE_MAX_TEAMS',
        '8',
      ),
    );
  }

  /**
   * Public so the premium-features endpoint (below) can hand the actual
   * configured tier prices to the frontend -- apps/web's "Plan" section
   * (tournament-form.page.ts) needs the real cents amounts to render its
   * card list and to tell which tier a tournament's highest-paid order
   * actually corresponds to, rather than hardcoding the landing page's own
   * marketing copy prices as if they were guaranteed to match .env.
   */
  publicationTierConfig(): {
    freeMaxTeams: number;
    midMaxTeams: number;
    midPriceCents: number;
    highPriceCents: number;
  } {
    return {
      freeMaxTeams: this.freeMaxTeams(),
      midMaxTeams: Number(
        this.configService.get<string>(
          'TOURNAMENT_PUBLICATION_TIER_MID_MAX_TEAMS',
          '48',
        ),
      ),
      midPriceCents: this.tierPriceCents('STANDARD'),
      highPriceCents: this.tierPriceCents('LARGE'),
    };
  }

  /**
   * The total amount actually paid so far toward this tournament's
   * publication, 0 if none -- what publish() (and assertTeamAdditionAllowed
   * below) compare the currently-required tier price against. A SUM of
   * every PAID order, not the largest one -- see publish()'s own comment on
   * why (each order is itself already a gap/top-up amount, so only the sum
   * reflects what's actually been paid toward the current tier).
   */
  private async totalPaidPublicationFeeCents(
    tournamentId: string,
  ): Promise<number> {
    const paidTotal = await this.prisma.tournamentPublicationOrder.aggregate({
      where: { tournamentId, status: TournamentPublicationOrderStatus.PAID },
      _sum: { amountCents: true },
    });
    return paidTotal._sum.amountCents ?? 0;
  }

  /**
   * Semantic tier code for a given publication fee -- matches the 3 tiers
   * named on the landing page's pricing section (Découverte/Standard/Grand
   * format, apps/web's public.pricing.* i18n). Names/prices themselves stay
   * frontend-owned (i18n) -- this is just enough for a client to know which
   * one it's talking about without re-deriving the tier boundaries itself.
   */
  private tierCodeForFeeCents(cents: number): 'FREE' | 'STANDARD' | 'LARGE' {
    if (cents <= 0) {
      return 'FREE';
    }
    const highPriceCents = Number(
      this.configService.get<string>(
        'TOURNAMENT_PUBLICATION_TIER_HIGH_PRICE_CENTS',
        '0',
      ),
    );
    return cents >= highPriceCents && highPriceCents > 0 ? 'LARGE' : 'STANDARD';
  }

  /**
   * Blocks TeamsService.create()/importFromCsv() from pushing an already-
   * PUBLISHED tournament's team count into a pricing tier that hasn't been
   * paid for yet (feat/XXX -- "bloquer l'ajout d'équipe si déjà publié").
   * A no-op for a tournament that isn't published (DRAFT/UNPUBLISHED) --
   * team count is free to change there, the tier is only priced and locked
   * in at publish() time. `additionalCount` lets a bulk CSV import check
   * the whole batch up front rather than failing midway through.
   *
   * The thrown ForbiddenException carries a structured body (not just a
   * message) so the frontend can show a real upsell dialog -- "you're on
   * $currentTier, upgrade to $requiredTier or subscribe annually" -- instead
   * of a plain error banner (feat/XXX, product request after a real
   * organizer hit this blind).
   */
  async assertTeamAdditionAllowed(
    organizationId: string,
    tournamentId: string,
    additionalCount = 1,
  ): Promise<void> {
    const tournament = await this.getOrThrow(organizationId, tournamentId);
    if (tournament.status !== TournamentStatus.PUBLISHED) {
      return;
    }
    if (await this.organizationsService.hasActiveSubscription(organizationId)) {
      return;
    }
    const [teamsCount, alreadyPaidCents] = await Promise.all([
      this.prisma.team.count({ where: { tournamentId } }),
      this.totalPaidPublicationFeeCents(tournamentId),
    ]);
    const nextRequiredCents = this.computePublicationFeeCents(
      teamsCount + additionalCount,
    );
    if (nextRequiredCents > alreadyPaidCents) {
      throw new ForbiddenException({
        message:
          "Cette ou ces équipe(s) supplémentaire(s) feraient passer ce tournoi déjà publié à un palier tarifaire supérieur -- mettez à jour le paiement de publication avant d'ajouter d'autres équipes.",
        code: 'PUBLICATION_TIER_EXCEEDED',
        currentTier: this.tierCodeForFeeCents(alreadyPaidCents),
        requiredTier: this.tierCodeForFeeCents(nextRequiredCents),
        upgradeAmountCents: nextRequiredCents - alreadyPaidCents,
        currency: 'eur',
      });
    }
  }

  /**
   * Team logos, tournament logo, custom theme, QR code and PDF export are
   * premium touches reserved for tournaments past the free publication tier
   * (see docs/product/pull-request-plan.md) -- unlocked once the
   * tournament's *current* team count crosses the same
   * TOURNAMENT_PUBLICATION_TIER_FREE_MAX_TEAMS boundary already used to
   * price publication itself (computePublicationFeeCents), or
   * unconditionally for an organization holding an active annual
   * subscription (which already covers every publication regardless of
   * team count). Live-checked, not "has this tournament's publication
   * actually been paid for" -- an organizer sees these unlock the moment
   * their roster crosses the threshold, even before publishing, and they'd
   * stay unlocked on an already-published tournament even if teams are
   * later removed (no reason to claw back access retroactively).
   */
  async hasPremiumFeatures(
    organizationId: string,
    tournamentId: string,
  ): Promise<boolean> {
    const [teamsCount, hasActiveSubscription] = await Promise.all([
      this.prisma.team.count({ where: { tournamentId } }),
      this.organizationsService.hasActiveSubscription(organizationId),
    ]);
    return hasActiveSubscription || teamsCount > this.freeMaxTeams();
  }

  async assertPremiumFeaturesUnlocked(
    organizationId: string,
    tournamentId: string,
  ): Promise<void> {
    if (!(await this.hasPremiumFeatures(organizationId, tournamentId))) {
      throw new ForbiddenException(
        `Cette fonctionnalité est réservée aux tournois de plus de ${this.freeMaxTeams()} équipes ou à une organisation avec un abonnement annuel actif.`,
      );
    }
  }

  private async setStatus(tournamentId: string, status: TournamentStatus) {
    const updated = await this.prisma.tournament.update({
      where: { id: tournamentId },
      data: { status },
      include: { sport: true },
    });
    return this.toDetail(updated);
  }

  private toSummary(tournament: TournamentWithSport) {
    return {
      id: tournament.id,
      name: tournament.name,
      slug: tournament.slug,
      status: tournament.status,
      sportId: tournament.sportId,
      sportName: tournament.sport.name,
      startDate: tournament.startDate,
      endDate: tournament.endDate,
      isOnline: tournament.isOnline,
      theme: tournament.theme,
      logoUrl: tournament.logoUrl,
      createdAt: tournament.createdAt,
    };
  }

  private toPublicListItem(tournament: TournamentWithSportAndVenue) {
    const venue = tournament.venues[0] as
      { name: string; address: string | null } | undefined;
    return {
      id: tournament.id,
      name: tournament.name,
      slug: tournament.slug,
      sportName: tournament.sport.name,
      startDate: tournament.startDate,
      endDate: tournament.endDate,
      isOnline: tournament.isOnline,
      logoUrl: tournament.logoUrl,
      location: tournament.isOnline
        ? null
        : (venue?.address ?? venue?.name ?? null),
    };
  }

  private toPublicDirectoryItem(
    tournament: TournamentWithSportVenueAndOrganization,
  ) {
    return {
      ...this.toPublicListItem(tournament),
      organizerName: tournament.organization.name,
    };
  }

  private toDetail(tournament: TournamentWithSport) {
    return {
      ...this.toSummary(tournament),
      organizationId: tournament.organizationId,
      archivedAt: tournament.archivedAt,
      updatedAt: tournament.updatedAt,
      teamsCanReferee: tournament.teamsCanReferee,
      isListed: tournament.isListed,
      description: tournament.description,
      rules: tournament.rules,
      practicalInfo: tournament.practicalInfo,
    };
  }
}
