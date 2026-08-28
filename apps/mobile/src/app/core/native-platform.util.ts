import { Capacitor } from '@capacitor/core';

/**
 * True only in the actual native iOS build (Capacitor's `ios` platform),
 * never on Android or the plain web build. Used to gate any UI that would
 * let a user initiate a payment from inside the app without going through
 * Apple's In-App Purchase (App Review guideline 3.1.1) -- Stripe stays fully
 * intact on Android and web, only the iOS build hides these entry points.
 * See tournament-wizard.page.ts's submitPublish()/openSubscriptionManagement()
 * for where this is used, and docs/architecture/adr/0008-ios-distribution.md
 * for the wider App Review context (added 2026-08-28).
 */
export function isIosNative(): boolean {
  return Capacitor.getPlatform() === 'ios';
}
