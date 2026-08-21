import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type Stripe from 'stripe';
import {
  OrganizationRole,
  OrganizationSubscriptionStatus,
} from '../../generated/prisma/client';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { StripeService } from '../payments/stripe.service';
import { OrganizationsService } from './organizations.service';

type PrismaMock = {
  organization: { findUnique: jest.Mock };
  organizationMember: {
    findUnique: jest.Mock;
    findMany: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
    count: jest.Mock;
  };
  organizationSubscription: {
    findFirst: jest.Mock;
    findMany: jest.Mock;
    findUnique: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
  };
};

function createPrismaMock(): PrismaMock {
  return {
    organization: { findUnique: jest.fn() },
    organizationMember: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    organizationSubscription: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };
}

// Deliberately untyped, same rationale as tournaments.service.spec.ts.
function createMailServiceMock() {
  return {
    sendInvitationEmail: jest.fn().mockResolvedValue(undefined),
    sendAccountCreatedEmail: jest.fn().mockResolvedValue(undefined),
    sendPublicationReceiptEmail: jest.fn().mockResolvedValue(undefined),
    sendSubscriptionReceiptEmail: jest.fn().mockResolvedValue(undefined),
  };
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

// Deliberately untyped, same rationale as tournaments.service.spec.ts.
function createStripeServiceMock() {
  return {
    createCheckoutSession: jest.fn().mockResolvedValue({
      id: 'cs_test_subscription_123',
      url: 'https://checkout.stripe.example/cs_test_subscription_123',
    }),
    constructWebhookEvent: jest.fn(),
    retrieveCheckoutSession: jest.fn(),
  };
}

function checkoutCompletedEvent(sessionId: string): Stripe.Event {
  return {
    type: 'checkout.session.completed',
    data: { object: { id: sessionId, payment_intent: 'pi_123' } },
  } as unknown as Stripe.Event;
}

describe('OrganizationsService', () => {
  let prisma: PrismaMock;
  let stripeService: ReturnType<typeof createStripeServiceMock>;
  let mailService: ReturnType<typeof createMailServiceMock>;
  let service: OrganizationsService;

  beforeEach(() => {
    prisma = createPrismaMock();
    stripeService = createStripeServiceMock();
    mailService = createMailServiceMock();
    // Default: not suspended -- assertNotSuspended() (called at the top of
    // subscribe()) reads this for every test unless overridden.
    prisma.organization.findUnique.mockResolvedValue({
      id: 'org-1',
      suspendedAt: null,
    });
    service = new OrganizationsService(
      prisma as unknown as PrismaService,
      stripeService as unknown as StripeService,
      createConfigServiceMock(),
      mailService as unknown as MailService,
    );
  });

  it('rejects changing an unknown member (or one from another org)', async () => {
    prisma.organizationMember.findUnique.mockResolvedValue(null);
    await expect(
      service.changeRole('org-1', 'member-1', OrganizationRole.ORG_MEMBER),
    ).rejects.toBeInstanceOf(NotFoundException);

    prisma.organizationMember.findUnique.mockResolvedValue({
      organizationId: 'org-2',
      role: OrganizationRole.ORG_ADMIN,
    });
    await expect(
      service.changeRole('org-1', 'member-1', OrganizationRole.ORG_MEMBER),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('blocks demoting the last admin', async () => {
    prisma.organizationMember.findUnique.mockResolvedValue({
      id: 'member-1',
      organizationId: 'org-1',
      role: OrganizationRole.ORG_ADMIN,
    });
    prisma.organizationMember.count.mockResolvedValue(0);

    await expect(
      service.changeRole('org-1', 'member-1', OrganizationRole.ORG_MEMBER),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.organizationMember.update).not.toHaveBeenCalled();
  });

  it('allows demoting an admin when another admin remains', async () => {
    prisma.organizationMember.findUnique.mockResolvedValue({
      id: 'member-1',
      organizationId: 'org-1',
      role: OrganizationRole.ORG_ADMIN,
    });
    prisma.organizationMember.count.mockResolvedValue(1);
    prisma.organizationMember.update.mockResolvedValue({
      userId: 'user-1',
      role: OrganizationRole.ORG_MEMBER,
    });

    const result = await service.changeRole(
      'org-1',
      'member-1',
      OrganizationRole.ORG_MEMBER,
    );
    expect(result).toEqual({
      userId: 'user-1',
      role: OrganizationRole.ORG_MEMBER,
    });
  });

  it('blocks removing the last admin', async () => {
    prisma.organizationMember.findUnique.mockResolvedValue({
      id: 'member-1',
      organizationId: 'org-1',
      role: OrganizationRole.ORG_ADMIN,
    });
    prisma.organizationMember.count.mockResolvedValue(0);

    await expect(
      service.removeMember('org-1', 'member-1'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.organizationMember.delete).not.toHaveBeenCalled();
  });

  it('allows removing a non-admin member freely', async () => {
    prisma.organizationMember.findUnique.mockResolvedValue({
      id: 'member-2',
      organizationId: 'org-1',
      role: OrganizationRole.ORG_MEMBER,
    });

    await service.removeMember('org-1', 'member-2');
    expect(prisma.organizationMember.count).not.toHaveBeenCalled();
    expect(prisma.organizationMember.delete).toHaveBeenCalledWith({
      where: { id: 'member-2' },
    });
  });

  it('getAdminEmails returns only ORG_ADMIN emails', async () => {
    prisma.organizationMember.findMany.mockResolvedValue([
      { user: { email: 'admin@example.com' } },
    ]);

    const emails = await service.getAdminEmails('org-1');

    expect(emails).toEqual(['admin@example.com']);
    expect(prisma.organizationMember.findMany).toHaveBeenCalledWith({
      where: { organizationId: 'org-1', role: OrganizationRole.ORG_ADMIN },
      include: { user: true },
    });
  });

  describe('assertNotSuspended', () => {
    it('rejects a suspended organization and passes through an active one', async () => {
      prisma.organization.findUnique.mockResolvedValueOnce({
        id: 'org-1',
        suspendedAt: new Date('2026-08-15'),
      });
      await expect(service.assertNotSuspended('org-1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );

      prisma.organization.findUnique.mockResolvedValueOnce({
        id: 'org-1',
        suspendedAt: null,
      });
      await expect(
        service.assertNotSuspended('org-1'),
      ).resolves.toBeUndefined();
    });

    it('subscribe() rejects for a suspended organization before checking for an existing subscription', async () => {
      prisma.organization.findUnique.mockResolvedValue({
        id: 'org-1',
        suspendedAt: new Date('2026-08-15'),
      });

      await expect(service.subscribe('org-1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(prisma.organizationSubscription.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('annual subscription', () => {
    it('hasActiveSubscription is false with no row and true with an unexpired ACTIVE row', async () => {
      prisma.organizationSubscription.findFirst.mockResolvedValueOnce(null);
      expect(await service.hasActiveSubscription('org-1')).toBe(false);

      prisma.organizationSubscription.findFirst.mockResolvedValueOnce({
        id: 'sub-1',
      });
      expect(await service.hasActiveSubscription('org-1')).toBe(true);
    });

    it('subscribe activates immediately without a checkout session when the price is 0', async () => {
      prisma.organizationSubscription.findFirst.mockResolvedValue(null); // hasActiveSubscription check
      const expiresAt = new Date('2027-08-13');
      prisma.organizationSubscription.create.mockResolvedValue({
        id: 'sub-1',
        status: OrganizationSubscriptionStatus.ACTIVE,
        expiresAt,
      });

      const result = await service.subscribe('org-1');

      expect(result).toEqual({ status: 'ACTIVE', expiresAt });
      expect(stripeService.createCheckoutSession).not.toHaveBeenCalled();
      const [[createCall]] = prisma.organizationSubscription.create.mock
        .calls as [[{ data: { status: string; amountCents: number } }]];
      expect(createCall.data.status).toBe(
        OrganizationSubscriptionStatus.ACTIVE,
      );
      expect(createCall.data.amountCents).toBe(0);
    });

    it('subscribe creates a Stripe checkout session and a PENDING_PAYMENT row when the price is positive', async () => {
      const paidService = new OrganizationsService(
        prisma as unknown as PrismaService,
        stripeService as unknown as StripeService,
        createConfigServiceMock({
          ORGANIZATION_ANNUAL_SUBSCRIPTION_PRICE_CENTS: '20000',
        }),
        mailService as unknown as MailService,
      );
      prisma.organizationSubscription.findFirst.mockResolvedValue(null);
      prisma.organizationSubscription.create.mockResolvedValue({
        id: 'sub-1',
      });

      const result = await paidService.subscribe('org-1');

      expect(stripeService.createCheckoutSession).toHaveBeenCalledWith(
        expect.objectContaining({
          amountCents: 20000,
          currency: 'eur',
          // Lets an organizer redeem a launch-offer coupon on Stripe's own
          // checkout page -- see stripe.service.ts's
          // CreateCheckoutSessionParams.allowPromotionCodes.
          allowPromotionCodes: true,
        }),
      );
      expect(result).toEqual({
        status: 'PENDING_PAYMENT',
        checkoutUrl: 'https://checkout.stripe.example/cs_test_subscription_123',
      });
      expect(prisma.organizationSubscription.update).toHaveBeenCalledWith({
        where: { id: 'sub-1' },
        data: { stripeCheckoutSessionId: 'cs_test_subscription_123' },
      });
    });

    it('subscribe rejects when the organization already has an active subscription', async () => {
      prisma.organizationSubscription.findFirst.mockResolvedValue({
        id: 'sub-existing',
      });

      await expect(service.subscribe('org-1')).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(prisma.organizationSubscription.create).not.toHaveBeenCalled();
    });

    it('handleSubscriptionStripeEvent activates a matching PENDING_PAYMENT row', async () => {
      prisma.organizationSubscription.findUnique.mockResolvedValue({
        id: 'sub-1',
        status: OrganizationSubscriptionStatus.PENDING_PAYMENT,
      });
      prisma.organizationSubscription.update.mockResolvedValue({
        organizationId: 'org-1',
        amountCents: 20000,
        currency: 'eur',
        expiresAt: new Date('2027-08-14'),
      });
      // Not asserted on here (see the next test for that) -- just needs to
      // not throw now that the beforeEach default makes
      // sendSubscriptionReceipt's organization.findUnique() succeed and
      // fall through to getAdminEmails().
      prisma.organizationMember.findMany.mockResolvedValue([]);

      await service.handleSubscriptionStripeEvent(
        checkoutCompletedEvent('cs_test_subscription_123'),
      );

      expect(prisma.organizationSubscription.update).toHaveBeenCalledTimes(1);
      const [[updateCall]] = prisma.organizationSubscription.update.mock
        .calls as [
        [{ data: { status: string; stripePaymentIntentId: string } }],
      ];
      expect(updateCall.data.status).toBe(
        OrganizationSubscriptionStatus.ACTIVE,
      );
      expect(updateCall.data.stripePaymentIntentId).toBe('pi_123');
    });

    it('handleSubscriptionStripeEvent emails every org admin a receipt', async () => {
      const expiresAt = new Date('2027-08-14');
      prisma.organizationSubscription.findUnique.mockResolvedValue({
        id: 'sub-1',
        status: OrganizationSubscriptionStatus.PENDING_PAYMENT,
      });
      prisma.organizationSubscription.update.mockResolvedValue({
        organizationId: 'org-1',
        amountCents: 20000,
        currency: 'eur',
        expiresAt,
      });
      prisma.organization.findUnique.mockResolvedValue({
        id: 'org-1',
        name: 'Ada Tournaments',
      });
      prisma.organizationMember.findMany.mockResolvedValue([
        { user: { email: 'admin1@example.com' } },
        { user: { email: 'admin2@example.com' } },
      ]);

      await service.handleSubscriptionStripeEvent(
        checkoutCompletedEvent('cs_test_subscription_123'),
      );

      expect(mailService.sendSubscriptionReceiptEmail).toHaveBeenCalledTimes(2);
      expect(mailService.sendSubscriptionReceiptEmail).toHaveBeenCalledWith(
        'admin1@example.com',
        'Ada Tournaments',
        20000,
        'eur',
        expiresAt,
        'fr',
      );
    });

    it('handleSubscriptionStripeEvent still activates the subscription even if the receipt email fails', async () => {
      prisma.organizationSubscription.findUnique.mockResolvedValue({
        id: 'sub-1',
        status: OrganizationSubscriptionStatus.PENDING_PAYMENT,
      });
      prisma.organizationSubscription.update.mockResolvedValue({
        organizationId: 'org-1',
        amountCents: 20000,
        currency: 'eur',
        expiresAt: new Date('2027-08-14'),
      });
      prisma.organization.findUnique.mockResolvedValue({
        id: 'org-1',
        name: 'Ada Tournaments',
      });
      prisma.organizationMember.findMany.mockResolvedValue([
        { user: { email: 'admin1@example.com' } },
      ]);
      mailService.sendSubscriptionReceiptEmail.mockRejectedValue(
        new Error('SMTP unreachable'),
      );

      await expect(
        service.handleSubscriptionStripeEvent(
          checkoutCompletedEvent('cs_test_subscription_123'),
        ),
      ).resolves.toBeUndefined();
    });

    it("handleSubscriptionStripeEvent is a no-op for an unknown session (e.g. a tournament publication's)", async () => {
      prisma.organizationSubscription.findUnique.mockResolvedValue(null);

      await service.handleSubscriptionStripeEvent(
        checkoutCompletedEvent('cs_not_ours'),
      );

      expect(prisma.organizationSubscription.update).not.toHaveBeenCalled();
    });

    it('handleSubscriptionStripeEvent is a no-op for an already-ACTIVE row (retried webhook)', async () => {
      prisma.organizationSubscription.findUnique.mockResolvedValue({
        id: 'sub-1',
        status: OrganizationSubscriptionStatus.ACTIVE,
      });

      await service.handleSubscriptionStripeEvent(
        checkoutCompletedEvent('cs_test_subscription_123'),
      );

      expect(prisma.organizationSubscription.update).not.toHaveBeenCalled();
    });

    it('confirmSubscriptionPayment is a silent no-op when no subscription matches the session id', async () => {
      prisma.organizationSubscription.findUnique.mockResolvedValue(null);
      prisma.organizationSubscription.findFirst.mockResolvedValue(null);

      const result = await service.confirmSubscriptionPayment(
        'org-1',
        'cs_not_ours',
      );

      expect(stripeService.retrieveCheckoutSession).not.toHaveBeenCalled();
      expect(result.status).toBe('NONE');
    });

    it('confirmSubscriptionPayment is a silent no-op when the subscription belongs to a different organization', async () => {
      prisma.organizationSubscription.findUnique.mockResolvedValue({
        id: 'sub-1',
        organizationId: 'other-org',
        status: OrganizationSubscriptionStatus.PENDING_PAYMENT,
      });
      prisma.organizationSubscription.findFirst.mockResolvedValue(null);

      await service.confirmSubscriptionPayment(
        'org-1',
        'cs_test_subscription_123',
      );

      expect(stripeService.retrieveCheckoutSession).not.toHaveBeenCalled();
    });

    it('confirmSubscriptionPayment does not apply the session when Stripe reports it is not yet paid', async () => {
      prisma.organizationSubscription.findUnique.mockResolvedValue({
        id: 'sub-1',
        organizationId: 'org-1',
        status: OrganizationSubscriptionStatus.PENDING_PAYMENT,
      });
      prisma.organizationSubscription.findFirst.mockResolvedValue(null);
      stripeService.retrieveCheckoutSession.mockResolvedValue({
        id: 'cs_test_subscription_123',
        payment_status: 'unpaid',
      });

      await service.confirmSubscriptionPayment(
        'org-1',
        'cs_test_subscription_123',
      );

      expect(prisma.organizationSubscription.update).not.toHaveBeenCalled();
    });

    it('confirmSubscriptionPayment retrieves the session from Stripe and activates it when paid', async () => {
      prisma.organizationSubscription.findUnique.mockResolvedValue({
        id: 'sub-1',
        organizationId: 'org-1',
        status: OrganizationSubscriptionStatus.PENDING_PAYMENT,
      });
      stripeService.retrieveCheckoutSession.mockResolvedValue({
        id: 'cs_test_subscription_123',
        payment_status: 'paid',
        payment_intent: 'pi_123',
      });
      const expiresAt = new Date('2027-08-14');
      prisma.organizationSubscription.update.mockResolvedValue({
        organizationId: 'org-1',
        amountCents: 20000,
        currency: 'eur',
        expiresAt,
      });
      prisma.organizationMember.findMany.mockResolvedValue([]);
      prisma.organizationSubscription.findFirst.mockResolvedValueOnce({
        organizationId: 'org-1',
        status: OrganizationSubscriptionStatus.ACTIVE,
        startsAt: new Date('2026-08-14'),
        expiresAt,
      });

      const result = await service.confirmSubscriptionPayment(
        'org-1',
        'cs_test_subscription_123',
      );

      expect(stripeService.retrieveCheckoutSession).toHaveBeenCalledWith(
        'cs_test_subscription_123',
      );
      expect(prisma.organizationSubscription.update).toHaveBeenCalled();
      expect(result.status).toBe('ACTIVE');
    });

    it('confirmSubscriptionPayment records the actual (post-discount) amount Stripe charged, not the pre-discount ask', async () => {
      prisma.organizationSubscription.findUnique.mockResolvedValue({
        id: 'sub-1',
        organizationId: 'org-1',
        status: OrganizationSubscriptionStatus.PENDING_PAYMENT,
        // Pre-discount price the row was created with at checkout-session
        // creation time (subscribe()) -- a coupon redeemed on Stripe's
        // checkout page means the actual charge, below, is lower.
        amountCents: 20000,
      });
      stripeService.retrieveCheckoutSession.mockResolvedValue({
        id: 'cs_test_subscription_123',
        payment_status: 'paid',
        payment_intent: 'pi_123',
        // A 30%-off launch-offer coupon applied at checkout.
        amount_total: 14000,
      });
      prisma.organizationSubscription.update.mockResolvedValue({
        organizationId: 'org-1',
        amountCents: 14000,
        currency: 'eur',
        expiresAt: new Date('2027-08-14'),
      });
      prisma.organizationMember.findMany.mockResolvedValue([]);
      prisma.organizationSubscription.findFirst.mockResolvedValueOnce({
        organizationId: 'org-1',
        status: OrganizationSubscriptionStatus.ACTIVE,
        startsAt: new Date('2026-08-14'),
        expiresAt: new Date('2027-08-14'),
      });

      await service.confirmSubscriptionPayment(
        'org-1',
        'cs_test_subscription_123',
      );

      const [[updateCall]] = prisma.organizationSubscription.update.mock
        .calls as [[{ data: { amountCents: number } }]];
      expect(updateCall.data.amountCents).toBe(14000);
    });

    it('getSubscriptionStatus reports ACTIVE, then PENDING_PAYMENT, then NONE', async () => {
      prisma.organizationSubscription.findFirst.mockResolvedValueOnce({
        status: OrganizationSubscriptionStatus.ACTIVE,
        startsAt: new Date('2026-08-13'),
        expiresAt: new Date('2027-08-13'),
      });
      expect(await service.getSubscriptionStatus('org-1')).toMatchObject({
        status: 'ACTIVE',
      });

      prisma.organizationSubscription.findFirst
        .mockResolvedValueOnce(null) // no active row
        .mockResolvedValueOnce({
          status: OrganizationSubscriptionStatus.PENDING_PAYMENT,
          amountCents: 20000,
          currency: 'eur',
        });
      expect(await service.getSubscriptionStatus('org-1')).toMatchObject({
        status: 'PENDING_PAYMENT',
        amountCents: 20000,
      });

      prisma.organizationSubscription.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);
      expect(await service.getSubscriptionStatus('org-1')).toEqual({
        status: 'NONE',
      });
    });

    it('listSubscriptionHistory scopes the query to the given organization and maps every row', async () => {
      const paidAt = new Date('2026-08-01');
      prisma.organizationSubscription.findMany.mockResolvedValue([
        {
          id: 'sub-1',
          status: OrganizationSubscriptionStatus.ACTIVE,
          amountCents: 20000,
          currency: 'eur',
          startsAt: paidAt,
          expiresAt: new Date('2027-08-01'),
          createdAt: paidAt,
          paidAt,
        },
      ]);

      const history = await service.listSubscriptionHistory('org-1');

      expect(prisma.organizationSubscription.findMany).toHaveBeenCalledWith({
        where: { organizationId: 'org-1' },
        orderBy: { createdAt: 'desc' },
      });
      expect(history).toEqual([
        {
          id: 'sub-1',
          status: OrganizationSubscriptionStatus.ACTIVE,
          amountCents: 20000,
          currency: 'eur',
          startsAt: paidAt,
          expiresAt: new Date('2027-08-01'),
          createdAt: paidAt,
          paidAt,
        },
      ]);
    });
  });
});
