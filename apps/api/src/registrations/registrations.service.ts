import { ConflictException, Injectable } from '@nestjs/common';
import Stripe from 'stripe';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { CategoriesService } from '../tournaments/categories.service';
import { TournamentsService } from '../tournaments/tournaments.service';
import { StripeService } from '../payments/stripe.service';
import { CreateRegistrationDto } from './dto/create-registration.dto';
import { RegistrationStatus } from '../../generated/prisma/client';

export interface CreateRegistrationResult {
  registrationId: string;
  status: RegistrationStatus;
  checkoutUrl: string | null;
}

@Injectable()
export class RegistrationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tournamentsService: TournamentsService,
    private readonly categoriesService: CategoriesService,
    private readonly stripeService: StripeService,
    private readonly configService: ConfigService,
  ) {}

  async createForPlayer(
    slug: string,
    categoryId: string,
    playerAccountId: string,
    dto: CreateRegistrationDto,
  ): Promise<CreateRegistrationResult> {
    const tournament = await this.tournamentsService.getPublicBySlug(slug);
    const category = await this.categoriesService.assertCategoryExists(
      tournament.tournamentId,
      categoryId,
    );
    await this.assertTeamNameAvailable(tournament.tournamentId, dto.teamName);

    const amountCents = category.registrationFeeCents ?? 0;
    const currency = category.registrationFeeCurrency ?? 'eur';

    const registration = await this.prisma.registration.create({
      data: {
        tournamentId: tournament.tournamentId,
        categoryId: category.id,
        playerAccountId,
        teamName: dto.teamName,
        managerEmail: dto.managerEmail,
        managerPhone: dto.managerPhone,
        amountCents,
        currency,
        players: {
          create: dto.players.map((player) => ({
            firstName: player.firstName,
            lastName: player.lastName,
            jerseyNumber: player.jerseyNumber,
          })),
        },
      },
    });

    if (amountCents <= 0) {
      await this.materialize(registration.id);
      return {
        registrationId: registration.id,
        status: RegistrationStatus.PAID,
        checkoutUrl: null,
      };
    }

    const webUrl = this.configService.get<string>(
      'ADMIN_WEB_URL',
      'http://localhost:4200',
    );
    const session = await this.stripeService.createCheckoutSession({
      amountCents,
      currency,
      productName: `Inscription — ${category.name} — ${dto.teamName}`,
      successUrl: `${webUrl}/${slug}/register/success?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${webUrl}/${slug}/register?cancelled=1`,
      metadata: { registrationId: registration.id },
    });

    await this.prisma.registration.update({
      where: { id: registration.id },
      data: { stripeCheckoutSessionId: session.id },
    });

    return {
      registrationId: registration.id,
      status: RegistrationStatus.PENDING_PAYMENT,
      checkoutUrl: session.url,
    };
  }

  /** Called by PaymentsWebhookController after Stripe signature verification. */
  async handleStripeEvent(event: Stripe.Event): Promise<void> {
    if (event.type !== 'checkout.session.completed') {
      return;
    }
    const session = event.data.object;
    const registration = await this.prisma.registration.findUnique({
      where: { stripeCheckoutSessionId: session.id },
    });
    // Idempotent: a retried webhook delivery, or an event for a session this
    // service didn't create, is a silent no-op rather than an error.
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

    await this.materialize(registration.id, paymentIntentId);
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
      amountCents: registration.amountCents,
      currency: registration.currency,
      teamId: registration.teamId,
      createdAt: registration.createdAt,
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

  /** Marks PAID and creates the real Team + Player rows from the submitted roster. */
  private async materialize(
    registrationId: string,
    stripePaymentIntentId: string | null = null,
  ): Promise<void> {
    const registration = await this.prisma.registration.findUniqueOrThrow({
      where: { id: registrationId },
      include: { players: true },
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
          status: RegistrationStatus.PAID,
          paidAt: new Date(),
          teamId: team.id,
          stripePaymentIntentId,
        },
      });
    });
  }

  private async assertTeamNameAvailable(
    tournamentId: string,
    name: string,
  ): Promise<void> {
    const existing = await this.prisma.team.findFirst({
      where: { tournamentId, name },
    });
    if (existing) {
      throw new ConflictException(
        'Une équipe porte déjà ce nom pour ce tournoi.',
      );
    }
  }
}
