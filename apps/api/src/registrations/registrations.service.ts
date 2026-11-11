import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import Stripe from 'stripe';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { CategoriesService } from '../tournaments/categories.service';
import { TournamentsService } from '../tournaments/tournaments.service';
import { StripeService } from '../payments/stripe.service';
import { MailService } from '../mail/mail.service';
import { CreateRegistrationDto } from './dto/create-registration.dto';
import { RegistrationSettingsDto } from './dto/registration-settings.dto';
import {
  ParticipantType,
  RegistrationPaymentStatus,
  RegistrationStatus,
} from '../../generated/prisma/client';
import { SuperAdminNotificationService } from '../super-admin/notifications/super-admin-notification.service';

export interface CreateRegistrationResult {
  registrationId: string;
  status: RegistrationStatus;
  /** Always null now: pre-registrations are never paid online. */
  checkoutUrl: string | null;
}

/** Registrations that hold (or wait for) a place: confirmed ones and the legacy paid ones. */
const PLACE_HOLDING = [RegistrationStatus.CONFIRMED, RegistrationStatus.PAID];

/**
 * Pre-registrations: a player account sends a request (a team and its roster,
 * or themselves for an individual sport), the organizer confirms it, turns it
 * down or puts it on the waiting list, and ticks the payment by hand -- money
 * is collected by the organizer (on site, transfer...), never online. The team
 * only appears in the tournament once confirmed.
 *
 * The former online-payment flow (Stripe checkout) is gone from new
 * registrations; its webhook/confirm handlers stay for the sessions created
 * before.
 */
@Injectable()
export class RegistrationsService {
  private readonly logger = new Logger(RegistrationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tournamentsService: TournamentsService,
    private readonly categoriesService: CategoriesService,
    private readonly stripeService: StripeService,
    private readonly configService: ConfigService,
    @Optional() private readonly mailService?: MailService,
    @Optional()
    private readonly superAdminNotifications?: SuperAdminNotificationService,
  ) {}

  // ---------------------------------------------------------------- public

  /** What the public registration block shows: open or not, price, places left. */
  async getRegistrationInfo(slug: string) {
    const published = await this.tournamentsService.getPublicBySlug(slug);
    const tournament = await this.prisma.tournament.findUniqueOrThrow({
      where: { id: published.tournamentId },
      include: { sport: true, categories: { orderBy: { position: 'asc' } } },
    });
    const taken = await this.placesTaken(tournament.id);
    return {
      open: this.isOpen(tournament),
      registrationsOpen: tournament.registrationsOpen,
      opensAt: tournament.registrationOpensAt,
      closesAt: tournament.registrationClosesAt,
      paymentInfo: tournament.registrationPaymentInfo,
      participantType: tournament.sport.participantType,
      categories: tournament.categories.map((category) => ({
        id: category.id,
        name: category.name,
        feeCents: category.registrationFeeCents,
        currency: category.registrationFeeCurrency ?? 'eur',
        maxTeams: category.maxTeams,
        remaining:
          category.maxTeams === null
            ? null
            : Math.max(0, category.maxTeams - (taken.get(category.id) ?? 0)),
      })),
    };
  }

  async createForPlayer(
    slug: string,
    categoryId: string,
    playerAccountId: string,
    dto: CreateRegistrationDto,
  ): Promise<CreateRegistrationResult> {
    const published = await this.tournamentsService.getPublicBySlug(slug);
    const tournament = await this.prisma.tournament.findUniqueOrThrow({
      where: { id: published.tournamentId },
      include: { sport: true, organization: true },
    });
    if (!this.isOpen(tournament)) {
      throw new ConflictException(
        'Les inscriptions ne sont pas ouvertes pour ce tournoi.',
      );
    }
    const category = await this.categoriesService.assertCategoryExists(
      tournament.id,
      categoryId,
    );

    // Individual sport: one player, the "team" is named after them.
    const individual =
      tournament.sport.participantType === ParticipantType.INDIVIDUAL;
    if (individual && dto.players.length !== 1) {
      throw new BadRequestException(
        'Une inscription individuelle concerne un seul joueur.',
      );
    }
    const teamName = individual
      ? `${dto.players[0].firstName} ${dto.players[0].lastName}`.trim()
      : dto.teamName?.trim();
    if (!teamName) {
      throw new BadRequestException("Le nom de l'équipe est obligatoire.");
    }
    await this.assertTeamNameAvailable(tournament.id, teamName);

    const taken = (await this.placesTaken(tournament.id)).get(category.id) ?? 0;
    const full = category.maxTeams !== null && taken >= category.maxTeams;
    const status = full
      ? RegistrationStatus.WAITLIST
      : RegistrationStatus.PENDING;

    const registration = await this.prisma.registration.create({
      data: {
        tournamentId: tournament.id,
        categoryId: category.id,
        playerAccountId,
        teamName,
        managerEmail: dto.managerEmail,
        managerPhone: dto.managerPhone,
        amountCents: category.registrationFeeCents ?? 0,
        currency: category.registrationFeeCurrency ?? 'eur',
        status,
        paymentStatus: category.registrationFeeCents
          ? RegistrationPaymentStatus.UNPAID
          : RegistrationPaymentStatus.EXEMPT,
        players: {
          create: dto.players.map((player) => ({
            firstName: player.firstName,
            lastName: player.lastName,
            jerseyNumber: player.jerseyNumber,
          })),
        },
      },
    });

    void this.mail(dto.managerEmail, {
      subject: `Pré-inscription reçue : ${tournament.name}`,
      title:
        status === RegistrationStatus.WAITLIST
          ? "Votre pré-inscription est sur liste d'attente (catégorie complète)."
          : "Votre pré-inscription est bien reçue. L'organisateur va la valider.",
      rows: [
        { label: 'Tournoi', value: tournament.name },
        { label: 'Catégorie', value: category.name },
        { label: individual ? 'Joueur' : 'Équipe', value: teamName },
        ...(tournament.registrationPaymentInfo
          ? [{ label: 'Paiement', value: tournament.registrationPaymentInfo }]
          : []),
      ],
    });
    void this.notifyOrganizers(tournament.organizationId, {
      subject: `Nouvelle pré-inscription : ${tournament.name}`,
      title: 'Une nouvelle pré-inscription attend votre validation.',
      rows: [
        { label: 'Tournoi', value: tournament.name },
        { label: 'Catégorie', value: category.name },
        { label: individual ? 'Joueur' : 'Équipe', value: teamName },
        { label: 'Contact', value: dto.managerEmail },
      ],
      link: {
        url: `${this.webUrl()}/admin/tournaments/${tournament.id}/registrations`,
        label: 'Voir les inscriptions',
      },
    });

    return { registrationId: registration.id, status, checkoutUrl: null };
  }

  /** A player withdraws a request that isn't confirmed yet. */
  async cancelForPlayer(playerAccountId: string, registrationId: string) {
    const registration = await this.prisma.registration.findUnique({
      where: { id: registrationId },
    });
    if (!registration || registration.playerAccountId !== playerAccountId) {
      throw new NotFoundException('Inscription introuvable.');
    }
    const cancellable: RegistrationStatus[] = [
      RegistrationStatus.PENDING,
      RegistrationStatus.WAITLIST,
    ];
    if (!cancellable.includes(registration.status)) {
      throw new ConflictException(
        "Cette inscription est déjà traitée : contactez l'organisateur pour l'annuler.",
      );
    }
    await this.prisma.registration.update({
      where: { id: registrationId },
      data: { status: RegistrationStatus.CANCELLED, decidedAt: new Date() },
    });
    return this.listForPlayer(playerAccountId);
  }

  // ------------------------------------------------------------- organizer

  async getSettings(organizationId: string, tournamentId: string) {
    await this.tournamentsService.assertTournamentExists(
      organizationId,
      tournamentId,
    );
    const tournament = await this.prisma.tournament.findUniqueOrThrow({
      where: { id: tournamentId },
      include: { sport: true },
    });
    return this.toSettings(tournament);
  }

  async updateSettings(
    organizationId: string,
    tournamentId: string,
    dto: RegistrationSettingsDto,
  ) {
    await this.tournamentsService.assertTournamentIsEditable(
      organizationId,
      tournamentId,
    );
    const tournament = await this.prisma.tournament.update({
      where: { id: tournamentId },
      data: {
        registrationsOpen: dto.open,
        ...(dto.opensAt !== undefined && {
          registrationOpensAt: dto.opensAt ? new Date(dto.opensAt) : null,
        }),
        ...(dto.closesAt !== undefined && {
          registrationClosesAt: dto.closesAt ? new Date(dto.closesAt) : null,
        }),
        ...(dto.paymentInfo !== undefined && {
          registrationPaymentInfo: dto.paymentInfo?.trim() || null,
        }),
      },
      include: { sport: true },
    });
    return this.toSettings(tournament);
  }

  async listForOrganizer(organizationId: string, tournamentId: string) {
    await this.tournamentsService.assertTournamentExists(
      organizationId,
      tournamentId,
    );
    const registrations = await this.prisma.registration.findMany({
      where: { tournamentId },
      include: { category: true, playerAccount: true, players: true },
      orderBy: { createdAt: 'desc' },
    });
    return registrations.map((registration) => ({
      id: registration.id,
      teamName: registration.teamName,
      categoryId: registration.categoryId,
      categoryName: registration.category.name,
      managerEmail: registration.managerEmail,
      managerPhone: registration.managerPhone,
      status: registration.status,
      paymentStatus: registration.paymentStatus,
      rejectionReason: registration.rejectionReason,
      amountCents: registration.amountCents,
      currency: registration.currency,
      teamId: registration.teamId,
      createdAt: registration.createdAt,
      decidedAt: registration.decidedAt,
      paidAt: registration.paidAt,
      registrant: {
        firstName: registration.playerAccount.firstName,
        lastName: registration.playerAccount.lastName,
        email: registration.playerAccount.email,
      },
      players: registration.players.map((player) => ({
        firstName: player.firstName,
        lastName: player.lastName,
        jerseyNumber: player.jerseyNumber,
      })),
    }));
  }

  /** Accepts the request: the team (and roster) joins the tournament. */
  async confirm(
    organizationId: string,
    tournamentId: string,
    registrationId: string,
  ) {
    const registration = await this.getForOrganizer(
      organizationId,
      tournamentId,
      registrationId,
    );
    const confirmable: RegistrationStatus[] = [
      RegistrationStatus.PENDING,
      RegistrationStatus.WAITLIST,
      RegistrationStatus.REJECTED,
    ];
    if (!confirmable.includes(registration.status)) {
      throw new ConflictException(
        'Cette inscription ne peut pas être confirmée.',
      );
    }
    const category = await this.prisma.category.findUniqueOrThrow({
      where: { id: registration.categoryId },
    });
    if (
      category.maxTeams !== null &&
      ((await this.placesTaken(tournamentId)).get(category.id) ?? 0) >=
        category.maxTeams
    ) {
      throw new ConflictException({
        message: `La catégorie ${category.name} est complète (${category.maxTeams} places).`,
        code: 'CATEGORY_FULL',
      });
    }
    // Only real teams here: this request itself is still pending.
    await this.assertTeamNameAvailable(
      tournamentId,
      registration.teamName,
      false,
    );
    await this.materialize(registration.id, RegistrationStatus.CONFIRMED);
    await this.decisionMail(
      registration.id,
      'Votre inscription est confirmée.',
    );
    return this.listForOrganizer(organizationId, tournamentId);
  }

  async reject(
    organizationId: string,
    tournamentId: string,
    registrationId: string,
    reason: string | undefined,
  ) {
    const registration = await this.getForOrganizer(
      organizationId,
      tournamentId,
      registrationId,
    );
    await this.releaseTeam(registration);
    await this.prisma.registration.update({
      where: { id: registrationId },
      data: {
        status: RegistrationStatus.REJECTED,
        rejectionReason: reason?.trim() || null,
        decidedAt: new Date(),
      },
    });
    await this.decisionMail(
      registrationId,
      "Votre pré-inscription n'a pas été retenue.",
      reason?.trim() ? [{ label: 'Motif', value: reason.trim() }] : [],
    );
    return this.listForOrganizer(organizationId, tournamentId);
  }

  async waitlist(
    organizationId: string,
    tournamentId: string,
    registrationId: string,
  ) {
    const registration = await this.getForOrganizer(
      organizationId,
      tournamentId,
      registrationId,
    );
    await this.releaseTeam(registration);
    await this.prisma.registration.update({
      where: { id: registrationId },
      data: { status: RegistrationStatus.WAITLIST, decidedAt: new Date() },
    });
    await this.decisionMail(
      registrationId,
      "Votre pré-inscription est sur liste d'attente.",
    );
    return this.listForOrganizer(organizationId, tournamentId);
  }

  async setPayment(
    organizationId: string,
    tournamentId: string,
    registrationId: string,
    paymentStatus: RegistrationPaymentStatus,
  ) {
    await this.getForOrganizer(organizationId, tournamentId, registrationId);
    await this.prisma.registration.update({
      where: { id: registrationId },
      data: {
        paymentStatus,
        paidAt:
          paymentStatus === RegistrationPaymentStatus.PAID ? new Date() : null,
      },
    });
    return this.listForOrganizer(organizationId, tournamentId);
  }

  // ---------------------------------------------------------------- player

  async listForPlayer(playerAccountId: string) {
    const registrations = await this.prisma.registration.findMany({
      where: { playerAccountId },
      include: { category: true, tournament: true },
      orderBy: { createdAt: 'desc' },
    });
    return registrations.map((registration) => ({
      id: registration.id,
      teamName: registration.teamName,
      status: registration.status,
      paymentStatus: registration.paymentStatus,
      rejectionReason: registration.rejectionReason,
      amountCents: registration.amountCents,
      currency: registration.currency,
      createdAt: registration.createdAt,
      paidAt: registration.paidAt,
      tournament: {
        slug: registration.tournament.slug,
        name: registration.tournament.name,
      },
      category: {
        id: registration.category.id,
        name: registration.category.name,
      },
    }));
  }

  // --------------------------------------------- legacy online payments

  /** Called by PaymentsWebhookController after Stripe signature verification. */
  async handleStripeEvent(event: Stripe.Event): Promise<void> {
    if (event.type !== 'checkout.session.completed') {
      return;
    }
    await this.applyPaidRegistrationSession(event.data.object);
  }

  /** Former flow: a player back from Stripe checks their session directly. */
  async confirmRegistrationPayment(
    playerAccountId: string,
    stripeCheckoutSessionId: string,
  ): Promise<void> {
    const registration = await this.prisma.registration.findUnique({
      where: { stripeCheckoutSessionId },
    });
    if (
      !registration ||
      registration.playerAccountId !== playerAccountId ||
      registration.status !== RegistrationStatus.PENDING_PAYMENT
    ) {
      return;
    }
    const session = await this.stripeService.retrieveCheckoutSession(
      stripeCheckoutSessionId,
    );
    if (session.payment_status === 'paid') {
      await this.applyPaidRegistrationSession(session);
    }
  }

  private async applyPaidRegistrationSession(
    session: Stripe.Checkout.Session,
  ): Promise<void> {
    const registration = await this.prisma.registration.findUnique({
      where: { stripeCheckoutSessionId: session.id },
    });
    if (
      !registration ||
      registration.status !== RegistrationStatus.PENDING_PAYMENT
    ) {
      return;
    }
    const paymentIntentId =
      typeof session.payment_intent === 'string'
        ? session.payment_intent
        : (session.payment_intent?.id ?? null);
    await this.materialize(
      registration.id,
      RegistrationStatus.PAID,
      paymentIntentId,
    );
  }

  // --------------------------------------------------------------- helpers

  /** Open now: the switch is on and today is within the optional dates. */
  private isOpen(tournament: {
    registrationsOpen: boolean;
    registrationOpensAt: Date | null;
    registrationClosesAt: Date | null;
  }): boolean {
    const now = Date.now();
    return (
      tournament.registrationsOpen &&
      (!tournament.registrationOpensAt ||
        tournament.registrationOpensAt.getTime() <= now) &&
      (!tournament.registrationClosesAt ||
        tournament.registrationClosesAt.getTime() >= now)
    );
  }

  /** Places held per category (confirmed requests). */
  private async placesTaken(
    tournamentId: string,
  ): Promise<Map<string, number>> {
    const rows = await this.prisma.registration.groupBy({
      by: ['categoryId'],
      where: { tournamentId, status: { in: PLACE_HOLDING } },
      _count: { _all: true },
    });
    return new Map(rows.map((row) => [row.categoryId, row._count._all]));
  }

  private toSettings(tournament: {
    registrationsOpen: boolean;
    registrationOpensAt: Date | null;
    registrationClosesAt: Date | null;
    registrationPaymentInfo: string | null;
    sport: { participantType: ParticipantType };
  }) {
    return {
      open: tournament.registrationsOpen,
      openNow: this.isOpen(tournament),
      opensAt: tournament.registrationOpensAt,
      closesAt: tournament.registrationClosesAt,
      paymentInfo: tournament.registrationPaymentInfo,
      participantType: tournament.sport.participantType,
    };
  }

  private async getForOrganizer(
    organizationId: string,
    tournamentId: string,
    registrationId: string,
  ) {
    await this.tournamentsService.assertTournamentIsEditable(
      organizationId,
      tournamentId,
    );
    const registration = await this.prisma.registration.findUnique({
      where: { id: registrationId },
    });
    if (!registration || registration.tournamentId !== tournamentId) {
      throw new NotFoundException('Inscription introuvable.');
    }
    return registration;
  }

  /** A confirmed request taken back (refused / waiting list): its team leaves the tournament. */
  private async releaseTeam(registration: {
    id: string;
    teamId: string | null;
  }) {
    if (!registration.teamId) {
      return;
    }
    const matches = await this.prisma.match.count({
      where: {
        OR: [
          { homeTeamId: registration.teamId },
          { awayTeamId: registration.teamId },
        ],
      },
    });
    if (matches > 0) {
      throw new ConflictException(
        "Cette équipe a déjà des matchs au calendrier : retirez-la d'abord du calendrier.",
      );
    }
    await this.prisma.$transaction([
      this.prisma.registration.update({
        where: { id: registration.id },
        data: { teamId: null },
      }),
      this.prisma.team.delete({ where: { id: registration.teamId } }),
    ]);
  }

  /** Creates the real Team + Player rows from the submitted roster. */
  private async materialize(
    registrationId: string,
    status: RegistrationStatus,
    stripePaymentIntentId: string | null = null,
  ): Promise<void> {
    const registration = await this.prisma.registration.findUniqueOrThrow({
      where: { id: registrationId },
      include: {
        players: true,
        tournament: { include: { organization: true } },
      },
    });

    await this.prisma.$transaction(async (tx) => {
      const team = await tx.team.create({
        data: {
          tournamentId: registration.tournamentId,
          categoryId: registration.categoryId,
          name: registration.teamName,
          managerEmail: registration.managerEmail,
          managerPhone: registration.managerPhone,
          players: {
            create: registration.players.map((player) => ({
              firstName: player.firstName,
              lastName: player.lastName,
              jerseyNumber: player.jerseyNumber,
            })),
          },
        },
      });
      await tx.registration.update({
        where: { id: registration.id },
        data: {
          status,
          teamId: team.id,
          decidedAt: new Date(),
          ...(status === RegistrationStatus.PAID && {
            paidAt: new Date(),
            paymentStatus: RegistrationPaymentStatus.PAID,
            stripePaymentIntentId,
          }),
        },
      });
    });

    if (status === RegistrationStatus.PAID) {
      // Super-admin notification (never throws, see SuperAdminNotificationService).
      this.superAdminNotifications
        ?.paymentReceived({
          kind: 'registration',
          amountCents: registration.amountCents,
          currency: registration.currency,
          organizationName: registration.tournament.organization.name,
          detail: `${registration.teamName} (${registration.tournament.name})`,
        })
        .catch((error: Error) =>
          this.logger.warn(
            `Failed to notify super-admins of registration ${registration.id}: ${error.message}`,
          ),
        );
    }
  }

  private async decisionMail(
    registrationId: string,
    title: string,
    extraRows: { label: string; value: string }[] = [],
  ): Promise<void> {
    const registration = await this.prisma.registration.findUniqueOrThrow({
      where: { id: registrationId },
      include: { tournament: true, category: true },
    });
    void this.mail(registration.managerEmail, {
      subject: `${registration.tournament.name} : votre inscription`,
      title,
      rows: [
        { label: 'Tournoi', value: registration.tournament.name },
        { label: 'Catégorie', value: registration.category.name },
        { label: 'Inscrit', value: registration.teamName },
        ...extraRows,
        ...(registration.tournament.registrationPaymentInfo &&
        registration.paymentStatus === RegistrationPaymentStatus.UNPAID
          ? [
              {
                label: 'Paiement',
                value: registration.tournament.registrationPaymentInfo,
              },
            ]
          : []),
      ],
      link: {
        url: `${this.webUrl()}/${registration.tournament.slug}`,
        label: 'Voir le tournoi',
      },
    });
  }

  /** Emails never block nor fail a registration. */
  private async mail(
    to: string,
    message: Parameters<MailService['sendInfoEmail']>[1],
  ): Promise<void> {
    try {
      await this.mailService?.sendInfoEmail(to, message);
    } catch (error) {
      this.logger.warn(
        `Registration email to ${to} failed: ${(error as Error).message}`,
      );
    }
  }

  private async notifyOrganizers(
    organizationId: string,
    message: Parameters<MailService['sendInfoEmail']>[1],
  ): Promise<void> {
    const members = await this.prisma.organizationMember.findMany({
      where: { organizationId, role: 'ORG_ADMIN' },
      include: { user: { select: { email: true } } },
    });
    for (const member of members) {
      await this.mail(member.user.email, message);
    }
  }

  private webUrl(): string {
    return this.configService.get<string>(
      'ADMIN_WEB_URL',
      'http://localhost:4200',
    );
  }

  private async assertTeamNameAvailable(
    tournamentId: string,
    name: string,
    includeRequests = true,
  ): Promise<void> {
    const existing = await this.prisma.team.findFirst({
      where: { tournamentId, name },
    });
    // A request still being processed holds its name too (its team only
    // exists once confirmed).
    const requested =
      includeRequests &&
      (await this.prisma.registration.findFirst({
        where: {
          tournamentId,
          teamName: name,
          status: {
            in: [
              RegistrationStatus.PENDING,
              RegistrationStatus.WAITLIST,
              RegistrationStatus.PENDING_PAYMENT,
            ],
          },
        },
      }));
    if (existing || requested) {
      throw new ConflictException(
        'Une équipe porte déjà ce nom pour ce tournoi.',
      );
    }
  }
}
