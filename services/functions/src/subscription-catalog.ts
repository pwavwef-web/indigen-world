/**
 * What can be subscribed to, and what each subscription is worth.
 *
 * Firebase-free on purpose, exactly like `studio-video-policy.ts`: the rules
 * about who gets what are the part worth testing without an emulator, and the
 * mobile app carries a hand-kept mirror of this file
 * (`apps/mobile/lib/features/subscriptions/data/subscription_catalog.dart`).
 * The two must be changed together; `firebase/tests/playBilling.test.mjs`
 * pins the values on this side so a silent drift shows up as a failing test
 * rather than as a member paying for a benefit nobody grants them.
 *
 * ── What is deliberately NOT here ─────────────────────────────────────────
 * Prices. Not one. A price shown in the app must be the price Play will
 * actually charge, in the member's own currency, after Play's tax and regional
 * pricing have had their say — so the app reads it off `ProductDetails` and
 * this backend never has an opinion. A hardcoded "GH₵ 25" is a support ticket
 * waiting for the first member who opens the app in a different country.
 *
 * ── Product and base plan ids ─────────────────────────────────────────────
 * Play's own naming rules: a product id is lowercase letters, numbers,
 * underscores and periods; a base plan id is lowercase letters, numbers and
 * hyphens. These strings must match what is created in Play Console character
 * for character — a mismatch is a purchase that succeeds on Play and then
 * grants nothing here.
 */

/** The tiers, weakest first. `none` is what everybody starts as. */
export type SubscriptionTier = 'none' | 'plus' | 'patron' | 'creator';

/** Where an entitlement came from. Only Play exists today. */
export type EntitlementSource = 'play' | 'grant';

/**
 * The lifecycle Play reports, narrowed to what this project acts on.
 *
 * `grace` and `on_hold` are both "the card failed"; the difference is that
 * grace still has access and on-hold does not. Play draws that distinction and
 * so does this — dropping somebody's downloads the instant a renewal glitches
 * would be the wrong way to treat a member who has paid for a year.
 */
export type EntitlementStatus =
  | 'none'
  | 'active'
  | 'grace'
  | 'on_hold'
  | 'paused'
  | 'canceled'
  | 'expired'
  | 'pending';

export interface SubscriptionPlan {
  /** Play base plan id. */
  basePlanId: string;
  /** `P1M` or `P1Y` — informational, for sorting and copy. */
  billingPeriod: 'monthly' | 'yearly';
}

export interface SubscriptionProduct {
  tier: Exclude<SubscriptionTier, 'none'>;
  /** Play subscription (product) id. */
  productId: string;
  /** Shown in the paywall when Play has nothing to say. */
  name: string;
  plans: readonly SubscriptionPlan[];
}

export const SUBSCRIPTION_PRODUCTS: readonly SubscriptionProduct[] = [
  {
    tier: 'plus',
    productId: 'indigen_plus',
    name: 'Indigen Plus',
    plans: [
      { basePlanId: 'plus-monthly', billingPeriod: 'monthly' },
      { basePlanId: 'plus-yearly', billingPeriod: 'yearly' },
    ],
  },
  {
    tier: 'patron',
    productId: 'indigen_patron',
    name: 'Indigen Patron',
    plans: [
      { basePlanId: 'patron-monthly', billingPeriod: 'monthly' },
      { basePlanId: 'patron-yearly', billingPeriod: 'yearly' },
    ],
  },
  {
    tier: 'creator',
    productId: 'indigen_creator',
    name: 'Indigen Creator',
    plans: [
      { basePlanId: 'creator-monthly', billingPeriod: 'monthly' },
      { basePlanId: 'creator-yearly', billingPeriod: 'yearly' },
    ],
  },
];

/** Every product id Play should be asked about, in paywall order. */
export const SUBSCRIPTION_PRODUCT_IDS: readonly string[] =
  SUBSCRIPTION_PRODUCTS.map((product) => product.productId);

const TIER_BY_PRODUCT_ID = new Map<string, Exclude<SubscriptionTier, 'none'>>(
  SUBSCRIPTION_PRODUCTS.map((product) => [product.productId, product.tier]),
);

/** The tier a Play product id grants, or `none` for anything unrecognised. */
export function tierForProductId(productId: string | undefined): SubscriptionTier {
  if (!productId) return 'none';
  return TIER_BY_PRODUCT_ID.get(productId) ?? 'none';
}

/** Ranking, so an upgrade can be told from a downgrade. */
export const TIER_RANK: Record<SubscriptionTier, number> = {
  none: 0,
  plus: 1,
  patron: 2,
  creator: 3,
};

/** The mark a subscriber's name carries. Its own axis, never `verifiedKind`. */
export type SupporterMark = '' | 'supporter' | 'patron' | 'studio';

/**
 * Everything a tier is actually worth, in one place.
 *
 * ── Why the free tier has numbers too ─────────────────────────────────────
 * Because "free" is a plan, not the absence of one. Kawuri already costs real
 * money per message and already has to have a ceiling; writing that ceiling
 * here next to the paid ones is what stops the free limit being an accident of
 * whatever was hardcoded in `kawuri.ts` on the day.
 */
export interface TierBenefits {
  /** Adverts are not served into any feed. */
  adFree: boolean;
  /** Kawuri messages per rolling day. */
  kawuriDailyMessages: number;
  /** How many collection tracks may be kept offline at once. 0 disables it. */
  offlineDownloadLimit: number;
  /** The badge beside the member's name. */
  supporterMark: SupporterMark;
  /**
   * Raised TribeStudio quotas — AI video minutes, larger uploads, campaign
   * tooling. Read by the Studio, not by the phone.
   */
  creatorTools: boolean;
}

export const TIER_BENEFITS: Record<SubscriptionTier, TierBenefits> = {
  none: {
    adFree: false,
    // Twenty is roughly a long sitting with the guide. Enough to be genuinely
    // useful signed out, low enough that a scripted client is capped early.
    kawuriDailyMessages: 20,
    offlineDownloadLimit: 0,
    supporterMark: '',
    creatorTools: false,
  },
  plus: {
    adFree: true,
    kawuriDailyMessages: 200,
    offlineDownloadLimit: 50,
    supporterMark: 'supporter',
    creatorTools: false,
  },
  patron: {
    adFree: true,
    kawuriDailyMessages: 400,
    offlineDownloadLimit: 200,
    supporterMark: 'patron',
    creatorTools: false,
  },
  creator: {
    adFree: true,
    kawuriDailyMessages: 600,
    offlineDownloadLimit: 500,
    supporterMark: 'studio',
    creatorTools: true,
  },
};

/** Statuses that still carry the benefits of the tier. */
const ENTITLED_STATUSES: ReadonlySet<EntitlementStatus> = new Set<EntitlementStatus>([
  'active',
  // The renewal failed and Play is retrying. Access continues by design.
  'grace',
  // Cancelled but not yet expired: paid for, so still owed.
  'canceled',
]);

export interface Entitlement {
  tier: SubscriptionTier;
  status: EntitlementStatus;
  productId: string;
  basePlanId: string;
  offerId: string;
  source: EntitlementSource;
  autoRenewing: boolean;
  /** ISO 8601, or `''` when there is no subscription at all. */
  startedAt: string;
  expiresAt: string;
  /** A Play sandbox purchase. Never counted as revenue, always honoured. */
  testPurchase: boolean;
  regionCode: string;
}

export const NO_ENTITLEMENT: Entitlement = {
  tier: 'none',
  status: 'none',
  productId: '',
  basePlanId: '',
  offerId: '',
  source: 'play',
  autoRenewing: false,
  startedAt: '',
  expiresAt: '',
  testPurchase: false,
  regionCode: '',
};

/**
 * Whether an entitlement is worth anything right now.
 *
 * Two conditions and both matter. The status has to be one that still carries
 * benefits, and the expiry has to be in the future — a document that says
 * `active` and expired three weeks ago is a renewal notification this backend
 * never received, and trusting the word over the date is how a free year
 * happens.
 */
export function isEntitled(entitlement: Entitlement, now: number): boolean {
  if (entitlement.tier === 'none') return false;
  if (!ENTITLED_STATUSES.has(entitlement.status)) return false;
  if (!entitlement.expiresAt) return false;
  const expiry = Date.parse(entitlement.expiresAt);
  return Number.isFinite(expiry) && expiry > now;
}

/** The benefits actually in force, which is `none`'s row when nothing is. */
export function benefitsFor(entitlement: Entitlement, now: number): TierBenefits {
  return TIER_BENEFITS[isEntitled(entitlement, now) ? entitlement.tier : 'none'];
}

/**
 * Play's `subscriptionState` in this project's words.
 *
 * `PENDING` is a purchase that has not been paid for yet — a pending mobile
 * money or cash transaction, which in Ghana is a normal way to buy something
 * and not an error state.
 */
export function statusFromPlayState(state: string | undefined): EntitlementStatus {
  switch (state) {
    case 'SUBSCRIPTION_STATE_ACTIVE':
      return 'active';
    case 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD':
      return 'grace';
    case 'SUBSCRIPTION_STATE_ON_HOLD':
      return 'on_hold';
    case 'SUBSCRIPTION_STATE_PAUSED':
      return 'paused';
    case 'SUBSCRIPTION_STATE_CANCELED':
      return 'canceled';
    case 'SUBSCRIPTION_STATE_EXPIRED':
      return 'expired';
    case 'SUBSCRIPTION_STATE_PENDING':
    case 'SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED':
      return 'pending';
    default:
      return 'none';
  }
}

// ---------------------------------------------------------------------------
// Google Play Developer API — `purchases.subscriptionsv2`
// ---------------------------------------------------------------------------

/**
 * The slice of `SubscriptionPurchaseV2` this project reads.
 *
 * Every field is optional because every field genuinely can be missing: a
 * pending purchase has no line items worth reading, a one-off promotional grant
 * has no `autoRenewingPlan`, and a purchase made before an account identifier
 * was ever attached has no `externalAccountIdentifiers`. Typing them as
 * required and trusting Google to fill them in is how a renewal notification
 * turns into an unhandled exception at two in the morning.
 */
export interface PlaySubscriptionPurchase {
  subscriptionState?: string;
  latestOrderId?: string;
  startTime?: string;
  regionCode?: string;
  acknowledgementState?: string;
  testPurchase?: Record<string, unknown>;
  externalAccountIdentifiers?: {
    obfuscatedExternalAccountId?: string;
    obfuscatedExternalProfileId?: string;
  };
  lineItems?: readonly {
    productId?: string;
    expiryTime?: string;
    autoRenewingPlan?: { autoRenewEnabled?: boolean };
    offerDetails?: { basePlanId?: string; offerId?: string };
  }[];
}

/**
 * Turns one Play purchase into one entitlement.
 *
 * ── Why the *last* line item wins ─────────────────────────────────────────
 * A subscription that has been upgraded mid-term carries two line items: the
 * plan being left and the plan being moved to. Play orders them so the one in
 * force last is last, and taking `[0]` is the bug where somebody upgrades to
 * Patron and keeps getting Plus until the next renewal.
 *
 * Where several products are somehow present, the highest-ranked tier wins.
 * That is the generous reading, and generosity is the right default when the
 * alternative is charging somebody for Patron and giving them Plus.
 */
export function entitlementFromPurchase(
  purchase: PlaySubscriptionPurchase,
): Entitlement {
  const items = purchase.lineItems ?? [];
  if (items.length === 0) {
    return {
      ...NO_ENTITLEMENT,
      status: statusFromPlayState(purchase.subscriptionState),
      startedAt: purchase.startTime ?? '',
      regionCode: purchase.regionCode ?? '',
      testPurchase: purchase.testPurchase !== undefined,
    };
  }

  let best = items[items.length - 1];
  let bestRank = TIER_RANK[tierForProductId(best.productId)];
  for (const item of items) {
    const rank = TIER_RANK[tierForProductId(item.productId)];
    if (rank > bestRank) {
      best = item;
      bestRank = rank;
    }
  }

  return {
    tier: tierForProductId(best.productId),
    status: statusFromPlayState(purchase.subscriptionState),
    productId: best.productId ?? '',
    basePlanId: best.offerDetails?.basePlanId ?? '',
    offerId: best.offerDetails?.offerId ?? '',
    source: 'play',
    // Absent means "not an auto-renewing plan", which is exactly false.
    autoRenewing: best.autoRenewingPlan?.autoRenewEnabled === true,
    startedAt: purchase.startTime ?? '',
    expiresAt: best.expiryTime ?? '',
    testPurchase: purchase.testPurchase !== undefined,
    regionCode: purchase.regionCode ?? '',
  };
}

/** Whether Play is still waiting to be told the purchase was delivered. */
export function needsAcknowledgement(purchase: PlaySubscriptionPurchase): boolean {
  return purchase.acknowledgementState === 'ACKNOWLEDGEMENT_STATE_PENDING';
}

/**
 * Real-time developer notification types, as Play numbers them.
 *
 * Only the ones that change what somebody is owed are named. The rest arrive,
 * are logged and cause a re-read of the purchase anyway — which is the correct
 * handling for every one of them, known or not, because Play's own guidance is
 * that the notification is a hint to go and look, never a fact to act on.
 */
export const RTDN = {
  RECOVERED: 1,
  RENEWED: 2,
  CANCELED: 3,
  PURCHASED: 4,
  ON_HOLD: 5,
  IN_GRACE_PERIOD: 6,
  RESTARTED: 7,
  PRICE_CHANGE_CONFIRMED: 8,
  DEFERRED: 9,
  PAUSED: 10,
  PAUSE_SCHEDULE_CHANGED: 11,
  REVOKED: 12,
  EXPIRED: 13,
  PENDING_PURCHASE_CANCELED: 20,
} as const;

/** The name of a notification type, for a log line somebody has to read. */
export function rtdnName(type: number): string {
  const found = Object.entries(RTDN).find(([, value]) => value === type);
  return found ? found[0] : `UNKNOWN_${type}`;
}
