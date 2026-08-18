import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type Stripe from 'stripe';
import {
  TournamentPublicationOrderStatus,
  TournamentStatus,
} from '../../generated/prisma/client';
import type { MailService } from '../mail/mail.service';
import type { OrganizationsService } from '../organizations/organizations.service';
import { PrismaService } from '../prisma/prisma.service';
import { StripeService } from '../payments/stripe.service';
import { TournamentsService } from './tournaments.service';

type PrismaMock = {
  sport: { findUnique: jest.Mock };
  tournament: {
    create: jest.Mock;
    findMany: jest.Mock;
    findUnique: jest.Mock;
    update: jest.Mock;
  };
  category: { findMany: jest.Mock; create: jest.Mock; count: jest.Mock };
  team: { count: jest.Mock };
  division: { create: jest.Mock };
  tournamentAdministrator: { findMany: jest.Mock; create: jest.Mock };
  tournamentAdministratorPermission: { create: jest.Mock };
  tournamentPublicationOrder: {
    findFirst: jest.Mock;
    findMany: jest.Mock;
    findUnique: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
  };
  $transaction: jest.Mock;
};

function createPrismaMock(): PrismaMock {
  const prisma: PrismaMock = {
    sport: { findUnique: jest.fn() },
    tournament: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    category: { findMany: jest.fn(), create: jest.fn(), count: jest.fn() },
    team: { count: jest.fn() },
    division: { create: jest.fn() },
    tournamentAdministrator: { findMany: jest.fn(), create: jest.fn() },
    tournamentAdministratorPermission: { create: jest.fn() },
    tournamentPublicationOrder: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn(async (arg: unknown) => {
      if (typeof arg === 'function') {
        return (arg as (tx: PrismaMock) => unknown)(prisma);
      }
      return Promise.all(arg as Promise<unknown>[]);
    }),
  };
  return prisma;
}

function createConfigServiceMock(
  overrides: Record<string, string> = {},
): ConfigService {
  return {
    get: jest.fn((key: string, defaultValue?: string) =>
      Object.prototype.hasOwnProperty.call(overrides, key)
        ? overrides[key]
        : defaultValue,
    ),
  } as unknown as ConfigService;
}

// Deliberately untyped (not `: StripeService`) so its jest.fn() members stay
// plain mocks rather than class methods -- matches PrismaMock above, and
// avoids eslint's unbound-method rule firing on `expect(stripeService.x)...`.
function createStripeServiceMock() {
  return {
    createCheckoutSession: jest.fn().mockResolvedValue({
      id: 'cs_test_publish_123',
      url: 'https://checkout.stripe.example/cs_test_publish_123',
    }),
    constructWebhookEvent: jest.fn(),
    retrieveCheckoutSession: jest.fn(),
  };
}

// Same untyped-mock rationale as createStripeServiceMock above.
function createOrganizationsServiceMock() {
  return {
    hasActiveSubscription: jest.fn().mockResolvedValue(false),
    getAdminEmails: jest.fn().mockResolvedValue([]),
    assertNotSuspended: jest.fn().mockResolvedValue(undefined),
  };
}

// Same untyped-mock rationale as createStripeServiceMock above.
function createMailServiceMock() {
  return {
    sendPublicationReceiptEmail: jest.fn().mockResolvedValue(undefined),
  };
}

const SPORT = { id: 'sport-1', name: 'Football' };

function tournamentFixture(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'tournament-1',
    organizationId: 'org-1',
    sportId: SPORT.id,
    sport: SPORT,
    name: 'Coupe de printemps',
    status: TournamentStatus.DRAFT,
    startDate: null,
    endDate: null,
    isOnline: false,
    archivedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('TournamentsService', () => {
  let prisma: PrismaMock;
  let stripeService: ReturnType<typeof createStripeServiceMock>;
  let organizationsService: ReturnType<typeof createOrganizationsServiceMock>;
  let mailService: ReturnType<typeof createMailServiceMock>;
  let service: TournamentsService;

  beforeEach(() => {
    prisma = createPrismaMock();
    stripeService = createStripeServiceMock();
    organizationsService = createOrganizationsServiceMock();
    mailService = createMailServiceMock();
    // Zero-cents defaults, matching production until the project owner sets
    // real fees -- individual publish-pricing tests below override this.
    service = new TournamentsService(
      prisma as unknown as PrismaService,
      stripeService as unknown as StripeService,
      createConfigServiceMock(),
      organizationsService as unknown as OrganizationsService,
      mailService as unknown as MailService,
    );
  });

  describe('create', () => {
    it('rejects an unknown sport', async () => {
      prisma.sport.findUnique.mockResolvedValue(null);

      await expect(
        service.create('org-1', { name: 'Coupe', sportId: 'unknown-sport' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.tournament.create).not.toHaveBeenCalled();
    });

    it('creates a DRAFT tournament for a known sport', async () => {
      prisma.sport.findUnique.mockResolvedValue(SPORT);
      prisma.tournament.create.mockResolvedValue(tournamentFixture());

      const result = await service.create('org-1', {
        name: 'Coupe de printemps',
        sportId: SPORT.id,
      });

      expect(result.status).toBe(TournamentStatus.DRAFT);
      expect(result.sportName).toBe('Football');
      const calls = prisma.tournament.create.mock.calls as {
        data: { slug: string };
      }[][];
      expect(calls[0][0].data.slug).toMatch(/^coupe-de-printemps-[0-9a-f]{8}$/);
    });
  });

  describe('update / editability', () => {
    it('rejects any update on an archived tournament', async () => {
      prisma.tournament.findUnique.mockResolvedValue(
        tournamentFixture({ status: TournamentStatus.ARCHIVED }),
      );

      await expect(
        service.update('org-1', 'tournament-1', { name: 'Nouveau nom' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.tournament.update).not.toHaveBeenCalled();
    });

    it('rejects access to a tournament from another organization', async () => {
      prisma.tournament.findUnique.mockResolvedValue(
        tournamentFixture({ organizationId: 'org-2' }),
      );

      await expect(
        service.getDetail('org-1', 'tournament-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('listPublicationOrders', () => {
    it('rejects a tournament belonging to another organization', async () => {
      prisma.tournament.findUnique.mockResolvedValue(
        tournamentFixture({ organizationId: 'org-2' }),
      );

      await expect(
        service.listPublicationOrders('org-1', 'tournament-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.tournamentPublicationOrder.findMany).not.toHaveBeenCalled();
    });

    it('lists every order for the tournament, most recent first', async () => {
      prisma.tournament.findUnique.mockResolvedValue(tournamentFixture());
      const paidAt = new Date('2026-08-01');
      prisma.tournamentPublicationOrder.findMany.mockResolvedValue([
        {
          id: 'order-1',
          status: TournamentPublicationOrderStatus.PAID,
          categoriesCount: 2,
          teamsCount: 10,
          amountCents: 2500,
          currency: 'eur',
          createdAt: paidAt,
          paidAt,
        },
      ]);

      const orders = await service.listPublicationOrders(
        'org-1',
        'tournament-1',
      );

      expect(prisma.tournamentPublicationOrder.findMany).toHaveBeenCalledWith({
        where: { tournamentId: 'tournament-1' },
        orderBy: { createdAt: 'desc' },
      });
      expect(orders).toEqual([
        {
          id: 'order-1',
          status: TournamentPublicationOrderStatus.PAID,
          categoriesCount: 2,
          teamsCount: 10,
          amountCents: 2500,
          currency: 'eur',
          createdAt: paidAt,
          paidAt,
        },
      ]);
    });
  });

  describe('publish / unpublish / archive / unarchive', () => {
    it('rejects publishing an already-published tournament', async () => {
      prisma.tournament.findUnique.mockResolvedValue(
        tournamentFixture({ status: TournamentStatus.PUBLISHED }),
      );

      await expect(
        service.publish('org-1', 'tournament-1'),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects publishing for a suspended organization, before even loading the tournament', async () => {
      organizationsService.assertNotSuspended.mockRejectedValue(
        new ForbiddenException(
          'Cette organisation est suspendue, contactez le support.',
        ),
      );

      await expect(
        service.publish('org-1', 'tournament-1'),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.tournament.findUnique).not.toHaveBeenCalled();
    });

    it('publishes for free and records a PAID order when the computed fee is 0', async () => {
      prisma.tournament.findUnique.mockResolvedValue(tournamentFixture());
      prisma.tournamentPublicationOrder.findFirst.mockResolvedValue(null);
      prisma.category.count.mockResolvedValue(0);
      prisma.team.count.mockResolvedValue(0);
      prisma.tournament.update.mockResolvedValue(
        tournamentFixture({ status: TournamentStatus.PUBLISHED }),
      );

      const result = await service.publish('org-1', 'tournament-1');

      expect(result).toMatchObject({ status: TournamentStatus.PUBLISHED });
      const [[createCall]] = prisma.tournamentPublicationOrder.create.mock
        .calls as [[{ data: { status: string; amountCents: number } }]];
      expect(createCall.data.status).toBe(
        TournamentPublicationOrderStatus.PAID,
      );
      expect(createCall.data.amountCents).toBe(0);
      expect(stripeService.createCheckoutSession).not.toHaveBeenCalled();
    });

    it('creates a Stripe checkout session and does not publish yet when the team count lands in a paid tier', async () => {
      const paidService = new TournamentsService(
        prisma as unknown as PrismaService,
        stripeService as unknown as StripeService,
        createConfigServiceMock({
          TOURNAMENT_PUBLICATION_TIER_MID_PRICE_CENTS: '2500',
        }),
        organizationsService as unknown as OrganizationsService,
        mailService as unknown as MailService,
      );
      prisma.tournament.findUnique.mockResolvedValue(tournamentFixture());
      prisma.tournamentPublicationOrder.findFirst.mockResolvedValue(null);
      prisma.category.count.mockResolvedValue(2);
      prisma.team.count.mockResolvedValue(10); // between the 8/48 tier bounds
      prisma.tournamentPublicationOrder.create.mockResolvedValue({
        id: 'order-1',
      });

      const result = await paidService.publish('org-1', 'tournament-1');

      expect(stripeService.createCheckoutSession).toHaveBeenCalledWith(
        expect.objectContaining({ amountCents: 2500, currency: 'eur' }),
      );
      expect(result).toEqual({
        status: 'PENDING_PAYMENT',
        checkoutUrl: 'https://checkout.stripe.example/cs_test_publish_123',
      });
      expect(prisma.tournament.update).not.toHaveBeenCalled();
    });

    it.each([
      [8, 0], // free tier upper bound
      [9, 2500], // just above it -> mid tier
      [48, 2500], // mid tier upper bound
      [49, 8000], // just above it -> high tier
    ])(
      'computes the tiered fee for %i teams as %i cents',
      async (teamsCount, expectedAmountCents) => {
        const paidService = new TournamentsService(
          prisma as unknown as PrismaService,
          stripeService as unknown as StripeService,
          createConfigServiceMock({
            TOURNAMENT_PUBLICATION_TIER_MID_PRICE_CENTS: '2500',
            TOURNAMENT_PUBLICATION_TIER_HIGH_PRICE_CENTS: '8000',
          }),
          organizationsService as unknown as OrganizationsService,
          mailService as unknown as MailService,
        );
        prisma.tournament.findUnique.mockResolvedValue(tournamentFixture());
        prisma.tournamentPublicationOrder.findFirst.mockResolvedValue(null);
        prisma.category.count.mockResolvedValue(1);
        prisma.team.count.mockResolvedValue(teamsCount);
        prisma.tournamentPublicationOrder.create.mockResolvedValue({
          id: 'order-1',
        });
        prisma.tournament.update.mockResolvedValue(
          tournamentFixture({ status: TournamentStatus.PUBLISHED }),
        );

        await paidService.publish('org-1', 'tournament-1');

        if (expectedAmountCents === 0) {
          expect(stripeService.createCheckoutSession).not.toHaveBeenCalled();
        } else {
          expect(stripeService.createCheckoutSession).toHaveBeenCalledWith(
            expect.objectContaining({ amountCents: expectedAmountCents }),
          );
        }
      },
    );

    it('publishes for free without charging when the organization has an active subscription', async () => {
      organizationsService.hasActiveSubscription.mockResolvedValue(true);
      prisma.tournament.findUnique.mockResolvedValue(tournamentFixture());
      prisma.tournamentPublicationOrder.findFirst.mockResolvedValue(null);
      prisma.category.count.mockResolvedValue(3);
      prisma.team.count.mockResolvedValue(50); // would be the high tier otherwise
      prisma.tournament.update.mockResolvedValue(
        tournamentFixture({ status: TournamentStatus.PUBLISHED }),
      );

      const result = await service.publish('org-1', 'tournament-1');

      expect(result).toMatchObject({ status: TournamentStatus.PUBLISHED });
      const [[createCall]] = prisma.tournamentPublicationOrder.create.mock
        .calls as [[{ data: { status: string; amountCents: number } }]];
      expect(createCall.data.amountCents).toBe(0);
      expect(stripeService.createCheckoutSession).not.toHaveBeenCalled();
    });

    it('skips payment and publishes directly when a PAID order already exists (republish)', async () => {
      prisma.tournament.findUnique.mockResolvedValue(tournamentFixture());
      prisma.tournamentPublicationOrder.findFirst.mockResolvedValue({
        id: 'order-1',
        status: TournamentPublicationOrderStatus.PAID,
      });
      prisma.tournament.update.mockResolvedValue(
        tournamentFixture({ status: TournamentStatus.PUBLISHED }),
      );

      const result = await service.publish('org-1', 'tournament-1');

      expect(result).toMatchObject({ status: TournamentStatus.PUBLISHED });
      expect(prisma.category.count).not.toHaveBeenCalled();
      expect(prisma.tournamentPublicationOrder.create).not.toHaveBeenCalled();
      expect(stripeService.createCheckoutSession).not.toHaveBeenCalled();
    });

    it('rejects unpublishing a tournament that is not published', async () => {
      prisma.tournament.findUnique.mockResolvedValue(
        tournamentFixture({ status: TournamentStatus.DRAFT }),
      );

      await expect(
        service.unpublish('org-1', 'tournament-1'),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('archives a tournament and stamps archivedAt', async () => {
      prisma.tournament.findUnique.mockResolvedValue(tournamentFixture());
      prisma.tournament.update.mockResolvedValue(
        tournamentFixture({
          status: TournamentStatus.ARCHIVED,
          archivedAt: new Date(),
        }),
      );

      const result = await service.archive('org-1', 'tournament-1');

      expect(result.status).toBe(TournamentStatus.ARCHIVED);
      const [[updateCall]] = prisma.tournament.update.mock.calls as [
        [{ data: { status: TournamentStatus; archivedAt: Date } }],
      ];
      expect(updateCall.data.status).toBe(TournamentStatus.ARCHIVED);
      expect(updateCall.data.archivedAt).toBeInstanceOf(Date);
    });

    it('rejects archiving an already-archived tournament', async () => {
      prisma.tournament.findUnique.mockResolvedValue(
        tournamentFixture({ status: TournamentStatus.ARCHIVED }),
      );

      await expect(
        service.archive('org-1', 'tournament-1'),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('unarchive always returns to DRAFT regardless of the prior status', async () => {
      prisma.tournament.findUnique.mockResolvedValue(
        tournamentFixture({ status: TournamentStatus.ARCHIVED }),
      );
      prisma.tournament.update.mockResolvedValue(
        tournamentFixture({ status: TournamentStatus.DRAFT, archivedAt: null }),
      );

      const result = await service.unarchive('org-1', 'tournament-1');

      expect(result.status).toBe(TournamentStatus.DRAFT);
      expect(prisma.tournament.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: TournamentStatus.DRAFT, archivedAt: null },
        }),
      );
    });

    it('rejects unarchiving a tournament that is not archived', async () => {
      prisma.tournament.findUnique.mockResolvedValue(
        tournamentFixture({ status: TournamentStatus.DRAFT }),
      );

      await expect(
        service.unarchive('org-1', 'tournament-1'),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('handlePublicationStripeEvent', () => {
    function checkoutCompletedEvent(sessionId: string): Stripe.Event {
      return {
        type: 'checkout.session.completed',
        data: { object: { id: sessionId, payment_intent: 'pi_123' } },
      } as unknown as Stripe.Event;
    }

    it('emails every org admin a receipt once the order is confirmed PAID', async () => {
      prisma.tournamentPublicationOrder.findUnique.mockResolvedValue({
        id: 'order-1',
        status: TournamentPublicationOrderStatus.PENDING_PAYMENT,
        tournamentId: 'tournament-1',
        amountCents: 2500,
        currency: 'eur',
        tournament: { name: 'Coupe de printemps', organizationId: 'org-1' },
      });
      prisma.tournamentPublicationOrder.update.mockResolvedValue({});
      prisma.tournament.update.mockResolvedValue({});
      organizationsService.getAdminEmails.mockResolvedValue([
        'admin1@example.com',
        'admin2@example.com',
      ]);

      await service.handlePublicationStripeEvent(
        checkoutCompletedEvent('cs_test_publish_123'),
      );

      expect(organizationsService.getAdminEmails).toHaveBeenCalledWith('org-1');
      expect(mailService.sendPublicationReceiptEmail).toHaveBeenCalledTimes(2);
      expect(mailService.sendPublicationReceiptEmail).toHaveBeenCalledWith(
        'admin1@example.com',
        'Coupe de printemps',
        2500,
        'eur',
        'fr',
      );
    });

    it('still confirms the payment even if the receipt email fails', async () => {
      prisma.tournamentPublicationOrder.findUnique.mockResolvedValue({
        id: 'order-1',
        status: TournamentPublicationOrderStatus.PENDING_PAYMENT,
        tournamentId: 'tournament-1',
        amountCents: 2500,
        currency: 'eur',
        tournament: { name: 'Coupe de printemps', organizationId: 'org-1' },
      });
      prisma.tournamentPublicationOrder.update.mockResolvedValue({});
      prisma.tournament.update.mockResolvedValue({});
      organizationsService.getAdminEmails.mockResolvedValue([
        'admin1@example.com',
      ]);
      mailService.sendPublicationReceiptEmail.mockRejectedValue(
        new Error('SMTP unreachable'),
      );

      await expect(
        service.handlePublicationStripeEvent(
          checkoutCompletedEvent('cs_test_publish_123'),
        ),
      ).resolves.toBeUndefined();
      expect(prisma.tournamentPublicationOrder.update).toHaveBeenCalled();
    });

    it('does not email anyone for an unknown session or an already-PAID order', async () => {
      prisma.tournamentPublicationOrder.findUnique.mockResolvedValue(null);

      await service.handlePublicationStripeEvent(
        checkoutCompletedEvent('cs_not_ours'),
      );

      expect(mailService.sendPublicationReceiptEmail).not.toHaveBeenCalled();
    });
  });

  describe('confirmPublicationPayment', () => {
    it('is a silent no-op when no order matches the session id, and just returns the tournament', async () => {
      prisma.tournamentPublicationOrder.findUnique.mockResolvedValue(null);
      prisma.tournament.findUnique.mockResolvedValue(tournamentFixture());

      const result = await service.confirmPublicationPayment(
        'org-1',
        'tournament-1',
        'cs_not_ours',
      );

      expect(stripeService.retrieveCheckoutSession).not.toHaveBeenCalled();
      expect(result.id).toBe('tournament-1');
    });

    it('is a silent no-op when the order belongs to a different tournament', async () => {
      prisma.tournamentPublicationOrder.findUnique.mockResolvedValue({
        id: 'order-1',
        status: TournamentPublicationOrderStatus.PENDING_PAYMENT,
        tournamentId: 'other-tournament',
        amountCents: 2500,
        currency: 'eur',
        tournament: { name: 'Autre', organizationId: 'org-1' },
      });
      prisma.tournament.findUnique.mockResolvedValue(tournamentFixture());

      await service.confirmPublicationPayment(
        'org-1',
        'tournament-1',
        'cs_test_publish_123',
      );

      expect(stripeService.retrieveCheckoutSession).not.toHaveBeenCalled();
    });

    it('is a silent no-op when the order is already PAID', async () => {
      prisma.tournamentPublicationOrder.findUnique.mockResolvedValue({
        id: 'order-1',
        status: TournamentPublicationOrderStatus.PAID,
        tournamentId: 'tournament-1',
        amountCents: 2500,
        currency: 'eur',
        tournament: { name: 'Coupe de printemps', organizationId: 'org-1' },
      });
      prisma.tournament.findUnique.mockResolvedValue(tournamentFixture());

      await service.confirmPublicationPayment(
        'org-1',
        'tournament-1',
        'cs_test_publish_123',
      );

      expect(stripeService.retrieveCheckoutSession).not.toHaveBeenCalled();
    });

    it('does not apply the session when Stripe reports it is not yet paid', async () => {
      prisma.tournamentPublicationOrder.findUnique.mockResolvedValue({
        id: 'order-1',
        status: TournamentPublicationOrderStatus.PENDING_PAYMENT,
        tournamentId: 'tournament-1',
        amountCents: 2500,
        currency: 'eur',
        tournament: { name: 'Coupe de printemps', organizationId: 'org-1' },
      });
      stripeService.retrieveCheckoutSession.mockResolvedValue({
        id: 'cs_test_publish_123',
        payment_status: 'unpaid',
      });
      prisma.tournament.findUnique.mockResolvedValue(tournamentFixture());

      await service.confirmPublicationPayment(
        'org-1',
        'tournament-1',
        'cs_test_publish_123',
      );

      expect(prisma.tournamentPublicationOrder.update).not.toHaveBeenCalled();
    });

    it('retrieves the session from Stripe and applies it when paid, emailing the receipt', async () => {
      prisma.tournamentPublicationOrder.findUnique.mockResolvedValue({
        id: 'order-1',
        status: TournamentPublicationOrderStatus.PENDING_PAYMENT,
        tournamentId: 'tournament-1',
        amountCents: 2500,
        currency: 'eur',
        tournament: { name: 'Coupe de printemps', organizationId: 'org-1' },
      });
      stripeService.retrieveCheckoutSession.mockResolvedValue({
        id: 'cs_test_publish_123',
        payment_status: 'paid',
        payment_intent: 'pi_123',
      });
      prisma.tournamentPublicationOrder.update.mockResolvedValue({});
      prisma.tournament.update.mockResolvedValue({});
      prisma.tournament.findUnique.mockResolvedValue(
        tournamentFixture({ status: TournamentStatus.PUBLISHED }),
      );
      organizationsService.getAdminEmails.mockResolvedValue([
        'admin1@example.com',
      ]);

      const result = await service.confirmPublicationPayment(
        'org-1',
        'tournament-1',
        'cs_test_publish_123',
      );

      expect(stripeService.retrieveCheckoutSession).toHaveBeenCalledWith(
        'cs_test_publish_123',
      );
      expect(prisma.tournamentPublicationOrder.update).toHaveBeenCalled();
      expect(mailService.sendPublicationReceiptEmail).toHaveBeenCalledWith(
        'admin1@example.com',
        'Coupe de printemps',
        2500,
        'eur',
        'fr',
      );
      expect(result.status).toBe(TournamentStatus.PUBLISHED);
    });
  });

  describe('duplicate', () => {
    it('copies categories, divisions and administrators, and the clone is always DRAFT', async () => {
      const source = tournamentFixture({
        status: TournamentStatus.ARCHIVED,
        name: 'Édition 2025',
      });
      const clone = tournamentFixture({
        id: 'tournament-clone',
        name: 'Édition 2025 (copie)',
        status: TournamentStatus.DRAFT,
      });
      prisma.tournament.findUnique
        .mockResolvedValueOnce(source)
        .mockResolvedValueOnce(clone);
      prisma.tournament.create.mockResolvedValue(clone);
      prisma.category.findMany.mockResolvedValue([
        {
          id: 'category-1',
          name: 'U10',
          position: 0,
          divisions: [
            { id: 'division-1', name: 'A', colorHex: '#FF0000', position: 0 },
          ],
        },
      ]);
      prisma.category.create.mockResolvedValue({ id: 'new-category-1' });
      prisma.tournamentAdministrator.findMany.mockResolvedValue([
        {
          id: 'admin-1',
          userId: 'user-1',
          permissions: [{ permissionId: 'perm-1' }],
        },
      ]);
      prisma.tournamentAdministrator.create.mockResolvedValue({
        id: 'new-admin-1',
      });

      const result = await service.duplicate('org-1', 'tournament-1', {});

      expect(result.name).toBe('Édition 2025 (copie)');
      const [[createCall]] = prisma.tournament.create.mock.calls as [
        [{ data: { status: TournamentStatus } }],
      ];
      expect(createCall.data.status).toBe(TournamentStatus.DRAFT);
      const [[divisionCreateCall]] = prisma.division.create.mock.calls as [
        [{ data: { categoryId: string; name: string } }],
      ];
      expect(divisionCreateCall.data.categoryId).toBe('new-category-1');
      expect(divisionCreateCall.data.name).toBe('A');
      expect(
        prisma.tournamentAdministratorPermission.create,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            tournamentAdministratorId: 'new-admin-1',
            permissionId: 'perm-1',
          },
        }),
      );
    });

    it('uses a custom name when provided instead of the default suffix', async () => {
      prisma.tournament.findUnique.mockResolvedValue(tournamentFixture());
      prisma.tournament.create.mockResolvedValue(
        tournamentFixture({ id: 'tournament-clone' }),
      );
      prisma.category.findMany.mockResolvedValue([]);
      prisma.tournamentAdministrator.findMany.mockResolvedValue([]);

      await service.duplicate('org-1', 'tournament-1', {
        name: 'Édition 2026',
      });

      const [[createCall]] = prisma.tournament.create.mock.calls as [
        [{ data: { name: string } }],
      ];
      expect(createCall.data.name).toBe('Édition 2026');
    });
  });

  describe('listPublished', () => {
    it('filters on PUBLISHED status and returns a card-ready shape', async () => {
      prisma.tournament.findMany.mockResolvedValue([
        tournamentFixture({
          status: TournamentStatus.PUBLISHED,
          slug: 'coupe-de-printemps',
          venues: [{ name: 'Gymnase municipal', address: '1 rue du Stade' }],
        }),
      ]);

      const result = await service.listPublished();

      expect(prisma.tournament.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: TournamentStatus.PUBLISHED },
        }),
      );
      expect(result).toEqual([
        expect.objectContaining({
          slug: 'coupe-de-printemps',
          sportName: SPORT.name,
          location: '1 rue du Stade',
        }),
      ]);
    });

    it('falls back to the venue name when it has no address', async () => {
      prisma.tournament.findMany.mockResolvedValue([
        tournamentFixture({
          status: TournamentStatus.PUBLISHED,
          venues: [{ name: 'Gymnase municipal', address: null }],
        }),
      ]);

      const [result] = await service.listPublished();

      expect(result.location).toBe('Gymnase municipal');
    });

    it('omits the location entirely for an online tournament, even with a venue', async () => {
      prisma.tournament.findMany.mockResolvedValue([
        tournamentFixture({
          status: TournamentStatus.PUBLISHED,
          isOnline: true,
          venues: [{ name: 'Gymnase municipal', address: '1 rue du Stade' }],
        }),
      ]);

      const [result] = await service.listPublished();

      expect(result.location).toBeNull();
    });

    it('returns null location when there is no venue at all', async () => {
      prisma.tournament.findMany.mockResolvedValue([
        tournamentFixture({ status: TournamentStatus.PUBLISHED, venues: [] }),
      ]);

      const [result] = await service.listPublished();

      expect(result.location).toBeNull();
    });
  });
});
