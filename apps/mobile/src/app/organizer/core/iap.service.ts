import { Injectable } from '@angular/core';
import { PURCHASES_ERROR_CODE, Purchases } from '@revenuecat/purchases-capacitor';
import { environment } from '../../../environments/environment';
import { isIosNative } from '../../core/native-platform.util';
import { IapProductId } from './models';

/** Thrown by purchase() when the organizer dismissed StoreKit's native purchase sheet themselves -- a normal, silent outcome (never a bug, never shown as an error), distinct from every other rejection. */
export class IapCancelledError extends Error {
  constructor() {
    super('Purchase cancelled by the user');
    this.name = 'IapCancelledError';
  }
}

/**
 * Thin wrapper around RevenueCat's Capacitor SDK -- the iOS-only purchase
 * path this app uses instead of opening Stripe Checkout (App Review
 * guideline 3.1.1, see docs/architecture/adr/0008-ios-distribution.md and
 * apps/api/src/payments/revenuecat.service.ts's own module comment on why
 * RevenueCat rather than a from-scratch StoreKit integration). Every method
 * here is a no-op on Android/web (isIosNative() guard) -- those platforms
 * keep using Stripe Checkout via window.open(), unaffected by any of this.
 */
@Injectable({ providedIn: 'root' })
export class IapService {
  private configuredForUserId: string | null = null;

  /**
   * Configures the Purchases SDK with this organizer's own User.id as
   * RevenueCat's app_user_id -- must match exactly what the backend passes
   * to RevenueCatService.fetchSubscriber(userId) when independently
   * verifying a purchase, or a genuine purchase would look like it belongs
   * to nobody. Called from OrganizerAuthService right after the user's
   * identity is known (login/silentRefresh's loadProfile()), best-effort:
   * a configure failure here shouldn't block the rest of the app from
   * working, it just means a purchase attempt later will fail loudly with
   * its own clear error instead.
   */
  async configureForUser(userId: string): Promise<void> {
    if (!isIosNative() || this.configuredForUserId === userId) {
      return;
    }
    try {
      await Purchases.configure({ apiKey: environment.revenueCatApiKey, appUserID: userId });
      this.configuredForUserId = userId;
    } catch (error) {
      console.warn('RevenueCat configure failed', error);
    }
  }

  /**
   * Buys the given product via StoreKit, resolving once RevenueCat
   * confirms the purchase itself went through -- this does NOT unlock
   * anything server-side by itself; the caller still has to call
   * OrganizerTournamentsService.confirmPublicationPaymentViaIap right
   * after, same as this app never trusted a Stripe redirect's mere
   * existence either. Throws IapCancelledError specifically when the
   * organizer backed out of the native sheet themselves, the raw error
   * otherwise (network failure, product misconfigured in App Store
   * Connect, etc.).
   */
  async purchase(productId: IapProductId): Promise<void> {
    const { products } = await Purchases.getProducts({ productIdentifiers: [productId] });
    const product = products[0];
    if (!product) {
      throw new Error(`IAP product not found in App Store Connect: ${productId}`);
    }
    try {
      await Purchases.purchaseStoreProduct({ product });
    } catch (error) {
      // Capacitor plugin rejections aren't typed as PurchasesError at the
      // language level (a plain rejected value crossing the native
      // bridge), so this reads the two fields duck-typed rather than
      // assuming a specific class/instance.
      const purchasesError = error as { code?: string; userCancelled?: boolean };
      if (
        purchasesError.userCancelled === true ||
        purchasesError.code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR
      ) {
        throw new IapCancelledError();
      }
      throw error;
    }
  }
}
