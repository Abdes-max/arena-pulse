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
import { CreateTournamentDto } from './dto/create-tournament.dto';
import { DuplicateTournamentDto } from './dto/duplicate-tournament.dto';
import { UpdateTournamentDto } from './dto/update-tournament.dto';
import { generateSlug } from './slug.util';

type TournamentWithSport = Tournament & { sport: Sport };
type TournamentWithSportAndVenue = TournamentWithSport & {
  venues: { name: string; address: string | null }[];
};

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
    }));
  }

  /**
   * Publishing is gated behind a one-time Stripe payment computed from a
   * team-count tier (feat/044, see
   * docs/architecture/adr/0006-paid-tournament-publication.md) -- unless
   * either (a) a TournamentPublicationOrder for this tournament already
   * reached PAID, in which case a later publish (e.g. after an unpublish) is
   * free: the payment unlocks PUBLISHED for the tournament's lifetime, it
   * isn't billed again as the team count grows -- or (b) the organization
   * holds an active annual subscription, which covers every publish() call
   * for free while it's active (an order is still recorded, at 0, for a
   * uniform history/audit trail).
   */
  async publish(organizationId: string, tournamentId: string) {
    await this.organizationsService.assertNotSuspended(organizationId);
    const tournament = await this.getOrThrow(organizationId, tournamentId);
    this.assertEditable(tournament);
    if (tournament.status === TournamentStatus.PUBLISHED) {
      throw new ConflictException('Ce tournoi est déjà publié.');
    }

    const alreadyPaid = await this.prisma.tournamentPublicationOrder.findFirst({
      where: {
        tournamentId,
        status: TournamentPublicationOrderStatus.PAID,
      },
    });
    if (alreadyPaid) {
      return this.setStatus(tournamentId, TournamentStatus.PUBLISHED);
    }

    const [categoriesCount, teamsCount, hasActiveSubscription] =
      await Promise.all([
        this.prisma.category.count({ where: { tournamentId } }),
        this.prisma.team.count({ where: { tournamentId } }),
        this.organizationsService.hasActiveSubscription(organizationId),
      ]);
    const amountCents = hasActiveSubscription
      ? 0
      : this.computePublicationFeeCents(teamsCount);
    const currency = 'eur';

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

    const order = await this.prisma.tournamentPublicationOrder.create({
      data: {
        tournamentId,
        categoriesCount,
        teamsCount,
        amountCents,
        currency,
      },
    });

    const webUrl = this.configService.get<string>(
      'ADMIN_WEB_URL',
      'http://localhost:4200',
    );
    const session = await this.stripeService.createCheckoutSession({
      amountCents,
      currency,
      productName: `Publication du tournoi — ${tournament.name}`,
      successUrl: `${webUrl}/admin/tournaments/${tournamentId}/publish/success?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${webUrl}/admin/tournaments/${tournamentId}?publishCancelled=1`,
      metadata: { tournamentPublicationOrderId: order.id },
    });

    await this.prisma.tournamentPublicationOrder.update({
      where: { id: order.id },
      data: { stripeCheckoutSessionId: session.id },
    });

    return { status: 'PENDING_PAYMENT', checkoutUrl: session.url! };
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

    await this.prisma.$transaction([
      this.prisma.tournamentPublicationOrder.update({
        where: { id: order.id },
        data: {
          status: TournamentPublicationOrderStatus.PAID,
          paidAt: new Date(),
          stripePaymentIntentId: paymentIntentId,
        },
      }),
      this.prisma.tournament.update({
        where: { id: order.tournamentId },
        data: { status: TournamentStatus.PUBLISHED },
      }),
    ]);

    await this.sendPublicationReceipt(order, lang);
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
          lang,
        );
      } catch (error) {
        this.logger.warn(
          `Failed to send publication receipt email to ${email}: ${(error as Error).message}`,
        );
      }
    }
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
