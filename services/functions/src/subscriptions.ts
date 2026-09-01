import { createHash } from 'node:crypto';
import { getFirestore } from 'firebase-admin/firestore';
import type { DocumentReference, Firestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { onMessagePublished } from 'firebase-functions/v2/pubsub';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { requireAuth } from './auth.js';
import { assertDeviceIntegrity } from './play-integrity.js';
import {
  acknowledgeSubscription,
  fetchSubscriptionPurchase,
  isPlayBillingConfigured,
  parseDeveloperNotification,
} from './play-billing.js';
import { consumeRateLimit } from './rate-limit.js';
import {
  type Entitlement,
  type PlaySubscriptionPurchase,
  type TierBenefits,
  NO_ENTITLEMENT,
  SUBSCRIPTION_PRODUCTS,
  TIER_BENEFITS,
  TIER_RANK,
  benefitsFor,
  entitlementFromPurchase,
  isEntitled,
  needsAcknowledgement,
  rtdnName,
} from './subscription-catalog.js';

/**
 * Subscriptions, bought through Google Play and settled here.
 *
 * ── Where the truth lives ─────────────────────────────────────────────────
 * In three collections, and the split matters:
 *
 *   * `entitlements/{uid}` — what a member is owed. The member may read their
 *     own; nobody may write one. It carries no purchase token, because a
 *     purchase token is a bearer credential and this document is readable by a
 *     phone.
 *   * `subscriptionPurchases/{hash}` — one document per Play purchase token,
 *     keyed by its SHA-256 because a raw token is longer and stranger than a
 *     Firestore id may be. Server-only, and the only place a token is stored.
 *   * `playAccountIndex/{obfuscatedAccountId}` — the reverse map from the
 *     opaque id Play carries on a purchase back to a uid. Server-only.
 *
 * ── Why the index exists ──────────────────────────────────────────────────
 * A renewal notification arrives with a purchase token and nothing else. If
 * that token was first seen here it is already in `subscriptionPurchases` and
 * the uid comes straight off it. But a purchase made on a reinstalled app, or
 * one whose registration call never completed, has no such record — and Play's
 * own `obfuscatedExternalAccountId` is then the only thread back to a person.
 * So `preparePlayPurchase` writes that thread down *before* the buy flow
 * starts, which is the one moment at which both halves are known.
 */

const REGION = 'us-central1';
const ENFORCE_APP_CHECK = process.env.ENFORCE_APP_CHECK === 'true';

/** Play's Pub/Sub topic for real-time developer notifications. */
const RTDN_TOPIC = process.env.PLAY_RTDN_TOPIC || 'play-billing-rtdn';

const ENTITLEMENTS = 'entitlements';
const PURCHASES = 'subscriptionPurchases';
const ACCOUNT_INDEX = 'playAccountIndex';

function nowIso(): string {
  return new Date().toISOString();
}

/** The document id for a purchase token. Never the token itself. */
function purchaseDocId(purchaseToken: string): string {
  return createHash('sha256').update(purchaseToken).digest('hex');
}

/**
 * The opaque account id attached to a Play purchase.
 *
 * A SHA-256 of the uid: stable for the life of the account, exactly 64
 * characters (Play's limit), and carrying nothing about the person. Play's
 * fraud and abuse monitoring uses it to spot one payment instrument spraying
 * across many accounts, which is the whole reason to send it — an app that
 * omits it gets a materially worse verdict from Play's own protections.
 */
export function obfuscatedAccountIdFor(uid: string): string {
  return createHash('sha256').update(`indigen:${uid}`).digest('hex');
}

// ---------------------------------------------------------------------------
// Reading an entitlement
// ---------------------------------------------------------------------------

function entitlementFromDoc(data: Record<string, unknown> | undefined): Entitlement {
  if (!data) return NO_ENTITLEMENT;
  return {
    tier: (data.tier as Entitlement['tier']) ?? 'none',
    status: (data.status as Entitlement['status']) ?? 'none',
    productId: String(data.productId ?? ''),
    basePlanId: String(data.basePlanId ?? ''),
    offerId: String(data.offerId ?? ''),
    source: (data.source as Entitlement['source']) ?? 'play',
    autoRenewing: data.autoRenewing === true,
    startedAt: String(data.startedAt ?? ''),
    expiresAt: String(data.expiresAt ?? ''),
    testPurchase: data.testPurchase === true,
    regionCode: String(data.regionCode ?? ''),
  };
}

/** What this member is owed right now. Never throws; absent means `none`. */
export async function entitlementFor(uid: string): Promise<Entitlement> {
  if (!uid) return NO_ENTITLEMENT;
  try {
    const snap = await getFirestore().collection(ENTITLEMENTS).doc(uid).get();
    return entitlementFromDoc(snap.data());
  } catch (error) {
    // A benefits lookup must never be the thing that breaks a feature. A read
    // that fails is treated as "no subscription", which is the safe direction:
    // it degrades a paying member to the free limits rather than handing an
    // unpaid one the paid ones.
    logger.warn('Could not read an entitlement; falling back to free', {
      uid,
      errorType: error instanceof Error ? error.name : 'unknown',
    });
    return NO_ENTITLEMENT;
  }
}

/**
 * The benefits in force for a member, for the features that gate on them.
 *
 * This is the function `kawuri.ts` and anything else server-side should call.
 * Guests have no uid and get the free row, which is exactly right.
 */
export async function benefitsForUid(uid: string | undefined): Promise<TierBenefits> {
  if (!uid) return TIER_BENEFITS.none;
  return benefitsFor(await entitlementFor(uid), Date.now());
}

// ---------------------------------------------------------------------------
// Settling a purchase
// ---------------------------------------------------------------------------

interface SettlementResult {
  uid: string | null;
  entitlement: Entitlement;
  /** False when the purchase was ignored as stale. */
  applied: boolean;
}

/**
 * Takes one purchase token to Google and writes down whatever comes back.
 *
 * The single path. `registerPlayPurchase`, the notification handler and the
 * nightly sweep all end up here, so a purchase is settled the same way however
 * this backend heard about it — and settling twice is harmless, which is what
 * lets the three of them race without coordination.
 */
async function settlePurchase(input: {
  purchaseToken: string;
  /** Supplied by the buying app; absent when a notification brought us here. */
  uid?: string;
}): Promise<SettlementResult> {
  const db = getFirestore();
  const docId = purchaseDocId(input.purchaseToken);
  const purchaseRef = db.collection(PURCHASES).doc(docId);

  const purchase = await fetchSubscriptionPurchase(input.purchaseToken);
  if (purchase === null) {
    // Could not ask Google. Change nothing.
    return { uid: input.uid ?? null, entitlement: NO_ENTITLEMENT, applied: false };
  }
  if (purchase === 'gone') {
    logger.warn('Play does not recognise a purchase token', { docId });
    await purchaseRef.set(
      { docId, state: 'unknown_to_play', updatedAt: nowIso() },
      { merge: true },
    );
    return { uid: input.uid ?? null, entitlement: NO_ENTITLEMENT, applied: false };
  }

  const uid = await resolveUid({ db, purchaseRef, purchase, supplied: input.uid });
  const entitlement = entitlementFromPurchase(purchase);

  await purchaseRef.set(
    {
      docId,
      uid: uid ?? null,
      productId: entitlement.productId,
      basePlanId: entitlement.basePlanId,
      offerId: entitlement.offerId,
      status: entitlement.status,
      expiresAt: entitlement.expiresAt,
      startedAt: entitlement.startedAt,
      autoRenewing: entitlement.autoRenewing,
      testPurchase: entitlement.testPurchase,
      regionCode: entitlement.regionCode,
      latestOrderId: purchase.latestOrderId ?? '',
      // The token itself, in the one collection no client can read. Kept
      // because every later call to Play needs it and a hash cannot be undone.
      purchaseToken: input.purchaseToken,
      updatedAt: nowIso(),
    },
    { merge: true },
  );

  // Acknowledge before writing the entitlement, and unconditionally: an
  // unacknowledged subscription is refunded and revoked by Google after three
  // days, so this is the call that must not be skipped on any path.
  if (needsAcknowledgement(purchase) && entitlement.productId) {
    await acknowledgeSubscription({
      productId: entitlement.productId,
      purchaseToken: input.purchaseToken,
    });
  }

  if (!uid) {
    logger.warn('Settled a purchase with no member to attach it to', { docId });
    return { uid: null, entitlement, applied: false };
  }

  const applied = await writeEntitlement({ db, uid, docId, entitlement });
  return { uid, entitlement, applied };
}

/** Finds the member a purchase belongs to, in order of how sure we can be. */
async function resolveUid(input: {
  db: Firestore;
  purchaseRef: DocumentReference;
  purchase: PlaySubscriptionPurchase;
  supplied: string | undefined;
}): Promise<string | null> {
  // 1. This token has been settled before. Its owner does not change.
  const existing = await input.purchaseRef.get();
  const known = existing.get('uid');
  if (typeof known === 'string' && known.length > 0) return known;

  // 2. A signed-in app is telling us, and we believe it — the caller was
  //    authenticated by the callable before this ran.
  if (input.supplied) return input.supplied;

  // 3. A notification for a token nobody registered. The obfuscated id written
  //    before the buy flow started is the only remaining thread.
  const accountId = input.purchase.externalAccountIdentifiers?.obfuscatedExternalAccountId;
  if (accountId) {
    const indexed = await input.db.collection(ACCOUNT_INDEX).doc(accountId).get();
    const uid = indexed.get('uid');
    if (typeof uid === 'string' && uid.length > 0) return uid;
  }

  return null;
}

/**
 * Writes the entitlement, unless an older token is trying to overwrite a newer.
 *
 * An upgrade from Plus to Patron leaves the old token behind, and Play then
 * sends an EXPIRED notification *for the old token* — often after the new one
 * has already been settled. Applying it blindly is how somebody who has just
 * paid more ends up with nothing, so a purchase that grants nothing is only
 * allowed to overwrite an entitlement that is already spent.
 */
async function writeEntitlement(input: {
  db: Firestore;
  uid: string;
  docId: string;
  entitlement: Entitlement;
}): Promise<boolean> {
  const ref = input.db.collection(ENTITLEMENTS).doc(input.uid);

  return input.db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const current = entitlementFromDoc(snap.data());
    const currentToken = snap.get('purchaseDocId');
    const now = Date.now();

    const incomingIsLive = isEntitled(input.entitlement, now);
    const currentIsLive = isEntitled(current, now);
    const sameToken = currentToken === input.docId;

    if (!sameToken && !incomingIsLive && currentIsLive) {
      logger.info('Ignored a spent purchase against a live entitlement', {
        uid: input.uid,
        docId: input.docId,
      });
      return false;
    }
    // A live purchase from a different token only wins if it is at least as
    // good. Two live subscriptions on one account is not a shape Play produces
    // on purpose, but it is one a member can reach by buying on a second Google
    // account, and the answer there is to keep the better of the two.
    if (
      !sameToken
      && incomingIsLive
      && currentIsLive
      && TIER_RANK[input.entitlement.tier] < TIER_RANK[current.tier]
    ) {
      return false;
    }

    const benefits = TIER_BENEFITS[incomingIsLive ? input.entitlement.tier : 'none'];
    tx.set(
      ref,
      {
        uid: input.uid,
        ...input.entitlement,
        // Denormalised so Security Rules can check a claimed badge with one
        // read, and so the app can draw the right mark without a second table.
        supporterMark: benefits.supporterMark,
        entitled: incomingIsLive,
        purchaseDocId: input.docId,
        updatedAt: nowIso(),
      },
      { merge: true },
    );
    return true;
  });
}

/**
 * Mirrors the badge onto the public profile.
 *
 * Separate from [writeEntitlement] and deliberately best-effort: a member with
 * no community profile is a perfectly ordinary member, and a subscription must
 * not fail to register because they have never claimed a handle.
 */
async function mirrorSupporterMark(uid: string, mark: string): Promise<void> {
  try {
    const ref = getFirestore().collection('communityProfiles').doc(uid);
    const snap = await ref.get();
    if (!snap.exists) return;
    if (String(snap.get('supporterMark') ?? '') === mark) return;
    await ref.update({ supporterMark: mark, updatedAt: nowIso() });
  } catch (error) {
    logger.warn('Could not mirror a supporter mark onto the profile', {
      uid,
      errorType: error instanceof Error ? error.name : 'unknown',
    });
  }
}

/** Settles and then mirrors, which is what every entry point actually wants. */
async function settleAndMirror(input: {
  purchaseToken: string;
  uid?: string;
}): Promise<SettlementResult> {
  const result = await settlePurchase(input);
  if (result.uid && result.applied) {
    const benefits = benefitsFor(result.entitlement, Date.now());
    await mirrorSupporterMark(result.uid, benefits.supporterMark);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Callables
// ---------------------------------------------------------------------------

/**
 * What the paywall needs before it can show anything.
 *
 * Returns the product ids to ask Play about and the caller's current
 * entitlement, but no prices — those come from Play on the device, in the
 * member's own currency. See `subscription-catalog.ts`.
 */
export const getSubscriptionOptions = onCall(
  {
    region: REGION,
    enforceAppCheck: ENFORCE_APP_CHECK,
    consumeAppCheckToken: ENFORCE_APP_CHECK,
    invoker: 'public',
  },
  async (req) => {
    const uid = req.auth?.uid ?? '';
    const entitlement = uid ? await entitlementFor(uid) : NO_ENTITLEMENT;
    const now = Date.now();

    return {
      configured: isPlayBillingConfigured(),
      products: SUBSCRIPTION_PRODUCTS.map((product) => ({
        tier: product.tier,
        productId: product.productId,
        name: product.name,
        basePlanIds: product.plans.map((plan) => plan.basePlanId),
      })),
      benefits: TIER_BENEFITS,
      entitlement,
      entitled: isEntitled(entitlement, now),
      benefitsInForce: benefitsFor(entitlement, now),
    };
  },
);

/**
 * Called immediately before the Play purchase sheet opens.
 *
 * Two jobs, and both have to happen before money moves. It hands the app the
 * account id to attach to the purchase, and it writes the reverse map so a
 * notification about that purchase can find its way back to this member even if
 * the app never gets to call `registerPlayPurchase` — a crash, a lost network,
 * a phone that dies at the wrong moment.
 */
export const preparePlayPurchase = onCall(
  {
    region: REGION,
    enforceAppCheck: ENFORCE_APP_CHECK,
    consumeAppCheckToken: ENFORCE_APP_CHECK,
    invoker: 'public',
  },
  async (req) => {
    const uid = requireAuth(req);
    await consumeRateLimit('preparePlayPurchase', uid, 30);
    if (!isPlayBillingConfigured()) {
      throw new HttpsError(
        'failed-precondition',
        'Subscriptions are not set up on this build yet.',
      );
    }
    // A device Play has already judged badly is a device that should not be
    // starting a purchase. In monitor mode this is a no-op.
    await assertDeviceIntegrity(uid, 'preparePlayPurchase');

    const accountId = obfuscatedAccountIdFor(uid);
    await getFirestore().collection(ACCOUNT_INDEX).doc(accountId).set(
      { uid, obfuscatedAccountId: accountId, updatedAt: nowIso() },
      { merge: true },
    );

    return { obfuscatedAccountId: accountId };
  },
);

/**
 * The app has a purchase. Turn it into an entitlement.
 *
 * Returns the settled entitlement rather than a bare acknowledgement so the
 * paywall can close on the real answer instead of optimistically drawing a tier
 * that Play might still be holding as pending.
 */
export const registerPlayPurchase = onCall(
  {
    region: REGION,
    enforceAppCheck: ENFORCE_APP_CHECK,
    consumeAppCheckToken: ENFORCE_APP_CHECK,
    invoker: 'public',
    timeoutSeconds: 60,
  },
  async (req) => {
    const uid = requireAuth(req);
    await consumeRateLimit('registerPlayPurchase', uid, 30);
    if (!isPlayBillingConfigured()) {
      throw new HttpsError(
        'failed-precondition',
        'Subscriptions are not set up on this build yet.',
      );
    }

    const data = (req.data ?? {}) as Record<string, unknown>;
    const purchaseToken = typeof data.purchaseToken === 'string'
      ? data.purchaseToken.trim()
      : '';
    if (purchaseToken.length === 0 || purchaseToken.length > 4096) {
      throw new HttpsError('invalid-argument', 'A purchase token is required.');
    }

    const result = await settleAndMirror({ purchaseToken, uid });
    if (result.uid && result.uid !== uid) {
      // The token belongs to somebody else. Say nothing about whom.
      throw new HttpsError(
        'permission-denied',
        'That purchase is already registered to another account.',
      );
    }

    const entitlement = await entitlementFor(uid);
    const now = Date.now();
    return {
      entitlement,
      entitled: isEntitled(entitlement, now),
      benefitsInForce: benefitsFor(entitlement, now),
    };
  },
);

/**
 * Re-reads the caller's subscription from Play.
 *
 * What "Restore purchases" calls, and what the app calls when it comes back to
 * the foreground on a stale entitlement. Works from the stored token, so it
 * needs nothing from the phone — a reinstalled app with no local purchase
 * history still gets its subscription back.
 */
export const refreshSubscription = onCall(
  {
    region: REGION,
    enforceAppCheck: ENFORCE_APP_CHECK,
    consumeAppCheckToken: ENFORCE_APP_CHECK,
    invoker: 'public',
    timeoutSeconds: 60,
  },
  async (req) => {
    const uid = requireAuth(req);
    await consumeRateLimit('refreshSubscription', uid, 20);

    const db = getFirestore();
    const snap = await db.collection(ENTITLEMENTS).doc(uid).get();
    const docId = snap.get('purchaseDocId');
    if (typeof docId === 'string' && docId.length > 0) {
      const purchase = await db.collection(PURCHASES).doc(docId).get();
      const token = purchase.get('purchaseToken');
      if (typeof token === 'string' && token.length > 0) {
        await settleAndMirror({ purchaseToken: token, uid });
      }
    }

    const entitlement = await entitlementFor(uid);
    const now = Date.now();
    return {
      entitlement,
      entitled: isEntitled(entitlement, now),
      benefitsInForce: benefitsFor(entitlement, now),
    };
  },
);

// ---------------------------------------------------------------------------
// Real-time developer notifications
// ---------------------------------------------------------------------------

/**
 * Play telling us something changed.
 *
 * ── Why the notification's contents are barely read ───────────────────────
 * Because Play's own guidance is that a notification is a prompt to go and
 * look, not a statement of fact. Every type — renewed, cancelled, on hold,
 * recovered, revoked — is handled by fetching the purchase again and writing
 * down whatever Google says it is now. That is one code path instead of
 * fourteen, and it cannot drift out of step with the states Play adds later.
 *
 * The one exception is a voided purchase (a refund or chargeback), which
 * arrives on its own field and is not a subscription state at all.
 */
/**
 * The JSON Play published, however this runtime chose to hand it over.
 *
 * `message.json` is a getter that parses `message.data` and *throws* on a body
 * that is not JSON — including on the empty body a manually published test
 * message can carry — so it is tried inside a guard and the base64 field is the
 * fallback rather than the other way round.
 */
function readMessageBody(
  message: { data?: string; json?: unknown },
): string | Record<string, unknown> | undefined {
  try {
    const parsed = message.json;
    if (parsed && typeof parsed === 'object') {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Fall through to the raw bytes.
  }
  if (typeof message.data === 'string' && message.data.length > 0) {
    return Buffer.from(message.data, 'base64').toString('utf8');
  }
  return undefined;
}

export const playBillingNotification = onMessagePublished(
  { topic: RTDN_TOPIC, region: REGION, retry: false },
  async (event) => {
    const notification = parseDeveloperNotification(readMessageBody(event.data.message));
    if (!notification) return;

    if (notification.testNotification) {
      logger.info('Play sent a test notification; the topic is wired up.');
      return;
    }

    const subscription = notification.subscriptionNotification;
    if (subscription?.purchaseToken) {
      logger.info('Play subscription notification', {
        type: rtdnName(Number(subscription.notificationType ?? 0)),
        subscriptionId: subscription.subscriptionId,
      });
      await settleAndMirror({ purchaseToken: subscription.purchaseToken });
      return;
    }

    const voided = notification.voidedPurchaseNotification;
    if (voided?.purchaseToken) {
      // A refund. Re-reading gives Play's own word for the aftermath, which is
      // better than assuming a refund always means "expired now".
      logger.warn('A Play purchase was voided', { orderId: voided.orderId });
      await settleAndMirror({ purchaseToken: voided.purchaseToken });
    }
  },
);

/**
 * Stamps the supporter mark onto a profile the moment it is created.
 *
 * ── The gap this closes ───────────────────────────────────────────────────
 * [mirrorSupporterMark] can only write to a profile that exists, and somebody
 * can perfectly well subscribe first and claim a community handle afterwards.
 * Without this, their mark would stay blank until the next notification Play
 * happened to send — which for a yearly plan is a year. Worse, the Security
 * Rules read the *profile's* mark to decide whether a post may claim one, so a
 * blank mirror is not only a missing badge: it is a subscriber being told they
 * may not use what they paid for.
 */
export const onCommunityProfileCreated = onDocumentCreated(
  { document: 'communityProfiles/{uid}', region: REGION },
  async (event) => {
    const uid = event.params.uid;
    const entitlement = await entitlementFor(uid);
    const mark = benefitsFor(entitlement, Date.now()).supporterMark;
    if (!mark) return;
    await mirrorSupporterMark(uid, mark);
  },
);

/**
 * The nightly sweep.
 *
 * Notifications are delivered at least once, which is not the same as always:
 * a topic misconfiguration, a deploy at the wrong minute or a Pub/Sub outage
 * all lose messages, and every one of them loses them in the direction of
 * somebody keeping benefits they have stopped paying for. So once a day every
 * entitlement that claims to be live but has passed its expiry is taken back to
 * Play and asked again.
 */
export const reconcileSubscriptions = onSchedule(
  {
    schedule: 'every day 03:15',
    timeZone: 'Africa/Accra',
    region: REGION,
    timeoutSeconds: 540,
  },
  async () => {
    if (!isPlayBillingConfigured()) return;
    const db = getFirestore();

    const stale = await db
      .collection(ENTITLEMENTS)
      .where('entitled', '==', true)
      .where('expiresAt', '<', nowIso())
      .limit(400)
      .get();

    logger.info('Reconciling subscriptions past their expiry', {
      count: stale.size,
    });

    for (const doc of stale.docs) {
      const docId = doc.get('purchaseDocId');
      if (typeof docId !== 'string' || docId.length === 0) continue;
      const purchase = await db.collection(PURCHASES).doc(docId).get();
      const token = purchase.get('purchaseToken');
      if (typeof token !== 'string' || token.length === 0) continue;
      await settleAndMirror({ purchaseToken: token, uid: doc.id });
    }
  },
);
