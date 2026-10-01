import { ConfigService } from '@nestjs/config';
import { RevenueCatService, RevenueCatSubscriber } from './revenuecat.service';

function createConfigServiceMock(
  overrides: Record<string, string> = {},
): ConfigService {
  return {
    getOrThrow: jest.fn((key: string) => {
      if (Object.prototype.hasOwnProperty.call(overrides, key)) {
        return overrides[key];
      }
      throw new Error(`Missing config: ${key}`);
    }),
  } as unknown as ConfigService;
}

function subscriberResponse(subscriber: Partial<RevenueCatSubscriber>) {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve({ subscriber }),
  };
}

function emptySubscriber(): Partial<RevenueCatSubscriber> {
  return {
    original_app_user_id: 'user-1',
    non_subscriptions: {},
    subscriptions: {},
  };
}

function subscriberWithActiveAnnual(): Partial<RevenueCatSubscriber> {
  return {
    original_app_user_id: 'user-1',
    non_subscriptions: {},
    subscriptions: {
      annual_subscription: {
        expires_date: '2027-01-01',
        purchase_date: '2026-01-01',
        store: 'app_store',
        store_transaction_id: 'txn-1',
        is_sandbox: true,
        unsubscribe_detected_at: null,
        refunded_at: null,
      },
    },
  };
}

describe('RevenueCatService', () => {
  let service: RevenueCatService;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    service = new RevenueCatService(
      createConfigServiceMock({ REVENUECAT_SECRET_API_KEY: 'rc_secret_test' }),
    );
    fetchMock = jest.fn();
    global.fetch = fetchMock;
  });

  describe('fetchSubscriber', () => {
    it('calls the RevenueCat subscriber endpoint with the bearer API key and returns the subscriber', async () => {
      fetchMock.mockResolvedValue(subscriberResponse(emptySubscriber()));

      const subscriber = await service.fetchSubscriber('user-1');

      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.revenuecat.com/v1/subscribers/user-1',
        { headers: { Authorization: 'Bearer rc_secret_test' } },
      );
      expect(subscriber.original_app_user_id).toBe('user-1');
    });

    it('throws when RevenueCat responds with a non-2xx status', async () => {
      fetchMock.mockResolvedValue({ ok: false, status: 404 });

      await expect(service.fetchSubscriber('user-1')).rejects.toThrow(
        'RevenueCat subscriber lookup failed: 404',
      );
    });
  });

  // Regression coverage for the 2026-09-29 App Review rejection ("Could not
  // confirm your subscription") -- see this method's own doc comment on
  // RevenueCatService for the full story. delayMs: 0 throughout so these
  // tests don't actually wait between attempts.
  describe('fetchSubscriberUntil', () => {
    it('returns on the very first fetch when isReady is already true, without a second call', async () => {
      fetchMock.mockResolvedValue(
        subscriberResponse(subscriberWithActiveAnnual()),
      );

      const subscriber = await service.fetchSubscriberUntil(
        'user-1',
        (s) => !!s.subscriptions['annual_subscription'],
        { attempts: 5, delayMs: 0 },
      );

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(
        subscriber.subscriptions['annual_subscription']?.expires_date,
      ).toBe('2027-01-01');
    });

    it("retries through RevenueCat's read-after-write lag and returns the state once isReady is true", async () => {
      fetchMock
        .mockResolvedValueOnce(subscriberResponse(emptySubscriber()))
        .mockResolvedValueOnce(subscriberResponse(emptySubscriber()))
        .mockResolvedValueOnce(
          subscriberResponse(subscriberWithActiveAnnual()),
        );

      const subscriber = await service.fetchSubscriberUntil(
        'user-1',
        (s) => !!s.subscriptions['annual_subscription'],
        { attempts: 5, delayMs: 0 },
      );

      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(subscriber.subscriptions['annual_subscription']).toBeDefined();
    });

    it('gives up once attempts are exhausted and returns the last (still not-ready) state', async () => {
      fetchMock.mockResolvedValue(subscriberResponse(emptySubscriber()));

      const subscriber = await service.fetchSubscriberUntil(
        'user-1',
        (s) => !!s.subscriptions['annual_subscription'],
        { attempts: 3, delayMs: 0 },
      );

      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(subscriber.subscriptions['annual_subscription']).toBeUndefined();
    });
  });
});
