import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type Stripe from 'stripe';
import {
  Sport,
  Tournament,
  TournamentPublicationOrderStatus,
  TournamentStatus,
} from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StripeService } from '../payments/stripe.service';
import { CreateTournamentDto } from './dto/create-tournament.dto';
import { DuplicateTournamentDto } from './dto/duplicate-tournament.dto';
import { UpdateTournamentDto } from './dto/update-tournament.dto';
import { generateSlug } from './slug.util';

type TournamentWithSport = Tournament & { sport: Sport };

@Injectable()
export class TournamentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stripeService: StripeService,
    private readonly configService: ConfigService,
  ) {}

  async create(organizationId: string, dto: CreateTournamentDto) {
    await this.assertSportExists(dto.sportId);
    const tournament = await this.prisma.tournament.create({
      data: {
        organizationId,
        sportId: dto.sportId,
        name: dto.name,
        slug: generateSlug(dto.name),
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
        isOnline: dto.isOnline ?? false,
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
        theme: dto.theme,
      },
      include: { sport: true },
    });
    return this.toDetail(updated);
  }

  /**
   * Publishing is gated behind a one-time Stripe payment computed from the
   * tournament's current category/team counts (feat/039, see
   * docs/architecture/adr/0006-paid-tournament-publication.md) -- unless a
   * TournamentPublicationOrder for this tournament already reached PAID, in
   * which case a later publish (e.g. after an unpublish) is free: the
   * payment unlocks PUBLISHED for the tournament's lifetime, it isn't billed
   * again as categories/teams grow.
   */
  async publish(organizationId: string, tournamentId: string) {
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

    const [categoriesCount, teamsCount] = await Promise.all([
      this.prisma.category.count({ where: { tournamentId } }),
      this.prisma.team.count({ where: { tournamentId } }),
    ]);
    const amountCents = this.computePublicationFeeCents(
      categoriesCount,
      teamsCount,
    );
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
    const session = event.data.object;
    const order = await this.prisma.tournamentPublicationOrder.findUnique({
      where: { stripeCheckoutSessionId: session.id },
    });
    // Idempotent: a retried webhook delivery, or an event for a session this
    // service didn't create (e.g. a player registration's), is a silent
    // no-op rather than an error -- same guarantee as
    // RegistrationsService.handleStripeEvent.
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
   * No base fee -- see docs/architecture/adr/0006-paid-tournament-publication.md.
   * Both rates default to 0 (unset in .env) so publishing stays free until
   * the project owner explicitly sets a price, same posture already taken
   * for STRIPE_SECRET_KEY.
   */
  private computePublicationFeeCents(
    categoriesCount: number,
    teamsCount: number,
  ): number {
    const perCategoryCents = Number(
      this.configService.get<string>(
        'TOURNAMENT_PUBLICATION_FEE_PER_CATEGORY_CENTS',
        '0',
      ),
    );
    const perTeamCents = Number(
      this.configService.get<string>(
        'TOURNAMENT_PUBLICATION_FEE_PER_TEAM_CENTS',
        '0',
      ),
    );
    return categoriesCount * perCategoryCents + teamsCount * perTeamCents;
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
      createdAt: tournament.createdAt,
    };
  }

  private toDetail(tournament: TournamentWithSport) {
    return {
      ...this.toSummary(tournament),
      organizationId: tournament.organizationId,
      archivedAt: tournament.archivedAt,
      updatedAt: tournament.updatedAt,
      teamsCanReferee: tournament.teamsCanReferee,
    };
  }
}
