import { logger } from 'firebase-functions';
import {
  ANDROID_PUBLISHER_SCOPE,
  GoogleApiAuthError,
  callGoogleApi,
} from './google-api-auth.js';
import type { PlaySubscriptionPurchase } from './subscription-catalog.js';

/**
 * Talking to Google Play about what somebody actually bought.
 *
 * ── The one rule ──────────────────────────────────────────────────────────
 * A purchase token from a phone is a *claim*, never a fact. Nothing in this
 * project grants a benefit because an app said a purchase happened; the token
 * is taken to Google, Google says what it is worth, and that answer is what
 * gets written down. The client-side `in_app_purchase` verification data is
 * treated exactly the way an unsigned amount from a checkout screen is treated
 * in `ads.ts`: as an input to a server-side check, not as a result.
 *
 * ── Why v2 ────────────────────────────────────────────────────────────────
 * `purchases.subscriptionsv2` is the only endpoint that reports the full
 * lifecycle — grace period, on hold, paused, pending — as first-class states.
 * The v1 endpoint expresses the same situations as a scattering of nullable
 * timestamps that every implementation reads slightly differently, and reading
 * them slightly differently is how somebody loses access during a grace period
 * they were entitled to.
 */

const BASE_URL = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications';

/**
 * The application id purchases are made against.
 *
 * The production flavour's id, which is NOT the Gradle namespace
 * (`world.indigen.mobile`) — Play created the listing as
 * `com.indigenworld.indigen` and that is what every Play API call must name.
 * Read from the environment so the staging flavour can be pointed at its own
 * listing without a code change.
 */
export function androidPackageName(): string {
  return (process.env.ANDROID_PACKAGE_NAME ?? '').trim();
}

export function isPlayBillingConfigured(): boolean {
  return androidPackageName().length > 0;
}

/**
 * What Google says about one purchase token.
 *
 * Returns `null` for "could not ask" and `'gone'` for "Google says this token
 * is not a purchase". The two are not the same and must not be collapsed: an
 * API outage should leave an existing entitlement alone, while a token Google
 * has never heard of should not create one.
 */
export async function fetchSubscriptionPurchase(
  purchaseToken: string,
): Promise<PlaySubscriptionPurchase | null | 'gone'> {
  const packageName = androidPackageName();
  if (!packageName) return null;

  const url =
    `${BASE_URL}/${encodeURIComponent(packageName)}`
    + `/purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`;

  try {
    const result = await callGoogleApi<PlaySubscriptionPurchase>({
      url,
      scope: ANDROID_PUBLISHER_SCOPE,
    });
    if (result.ok) return result.data;
    // 400 is Play's answer for a malformed or foreign token; 404 for one that
    // does not exist. Both mean "this is not a purchase of ours".
    if (result.status === 400 || result.status === 404) return 'gone';
    if (result.status === 401 || result.status === 403) {
      logger.error(
        'Play refused the Developer API call. The runtime service account is '
          + 'probably not invited into Play Console, or has no access to this app.',
      );
    }
    return null;
  } catch (error) {
    if (error instanceof GoogleApiAuthError) {
      logger.warn('Play Billing is not configured for this deployment');
      return null;
    }
    throw error;
  }
}

/**
 * Tells Play the purchase has been delivered.
 *
 * Not optional and not cosmetic: a subscription that is not acknowledged within
 * three days is **automatically refunded and revoked** by Google. It is the one
 * call in this file whose absence loses real money, which is why it is made
 * from the server the moment an entitlement is written rather than from the app
 * when it happens to come back to the foreground.
 *
 * Acknowledging twice is harmless — Play answers the second one without
 * changing anything — so this is safe to call from both the purchase flow and
 * the notification handler.
 */
export async function acknowledgeSubscription(input: {
  productId: string;
  purchaseToken: string;
}): Promise<boolean> {
  const packageName = androidPackageName();
  if (!packageName || !input.productId) return false;

  const url =
    `${BASE_URL}/${encodeURIComponent(packageName)}`
    + `/purchases/subscriptions/${encodeURIComponent(input.productId)}`
    + `/tokens/${encodeURIComponent(input.purchaseToken)}:acknowledge`;

  try {
    const result = await callGoogleApi<Record<string, never>>({
      url,
      scope: ANDROID_PUBLISHER_SCOPE,
      method: 'POST',
      body: {},
    });
    if (!result.ok) {
      logger.warn('Could not acknowledge a Play subscription', {
        productId: input.productId,
        status: result.status,
      });
    }
    return result.ok;
  } catch (error) {
    if (error instanceof GoogleApiAuthError) return false;
    throw error;
  }
}

/** The payload Play publishes to the RTDN Pub/Sub topic. */
export interface PlayDeveloperNotification {
  version?: string;
  packageName?: string;
  eventTimeMillis?: string;
  subscriptionNotification?: {
    version?: string;
    notificationType?: number;
    purchaseToken?: string;
    subscriptionId?: string;
  };
  voidedPurchaseNotification?: {
    purchaseToken?: string;
    orderId?: string;
    productType?: number;
    refundType?: number;
  };
  oneTimeProductNotification?: {
    version?: string;
    notificationType?: number;
    purchaseToken?: string;
    sku?: string;
  };
  testNotification?: { version?: string };
}

/**
 * Reads a Pub/Sub message body into a notification.
 *
 * Play base64-encodes the JSON into `message.data`, and firebase-functions
 * hands that over already decoded in some shapes and not in others depending on
 * how the message was published — so both are accepted rather than assuming.
 * A body that will not parse returns null and is logged; throwing would make
 * Pub/Sub redeliver a message that can never succeed, forever.
 */
export function parseDeveloperNotification(
  raw: string | Record<string, unknown> | undefined,
): PlayDeveloperNotification | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw === 'object') return raw as PlayDeveloperNotification;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === 'object') {
      return parsed as PlayDeveloperNotification;
    }
    return null;
  } catch {
    logger.warn('A Play developer notification did not parse as JSON');
    return null;
  }
}
