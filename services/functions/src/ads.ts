import { logger } from 'firebase-functions';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import type { DocumentSnapshot, Firestore, Transaction } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { HttpsError, onCall, onRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { requireAuth, requireRole } from './auth.js';
import { mintDownloadUrl } from './published-media.js';
import { consumeRateLimit } from './rate-limit.js';
import {
  PAYSTACK_SECRET_KEY,
  PaystackError,
  adPaymentReference,
  initializeTransaction,
  isPaystackConfigured,
  isPaystackTestMode,
  paystackPublicKey,
  verifyTransaction,
  verifyWebhookSignature,
} from './paystack.js';

const REGION = 'us-central1';

// App Check enforcement follows the other callable functions in this project.
const ENFORCE_APP_CHECK = process.env.ENFORCE_APP_CHECK === 'true';

/**
 * The Storage prefix an advertiser's creative must live in.
 *
 * Checked rather than trusted, exactly as the Collection contributions are:
 * Storage rules stop one member writing into another's folder, but nothing
 * stops them *naming* one here, and a campaign that pointed a reviewer at
 * somebody else's private upload would be a disclosure the rules never saw.
 */
const AD_CAMPAIGN_PREFIX = 'ad-campaigns';

/** Money is integer pesewas everywhere. */
const PESEWAS_PER_CEDI = 100;
const MIN_DAILY_BUDGET_PESEWAS = 5 * PESEWAS_PER_CEDI;
const MAX_DAILY_BUDGET_PESEWAS = 5000 * PESEWAS_PER_CEDI;
const MIN_DURATION_DAYS = 1;
const MAX_DURATION_DAYS = 90;

/**
 * Ghana's levy stack on digital services, applied as one visible line.
 *
 * Computed HERE and never accepted from the client: a total that a phone can
 * choose is a total a phone can choose to be zero.
 */
const TAX_RATE = 0.06;

/** Largest creative accepted, matching the Storage rules' own ceiling. */
const MAX_CREATIVE_BYTES = 500 * 1024 * 1024;

const OBJECTIVES = new Set(['awareness', 'visits', 'messages']);
const PLACEMENTS = new Set(['community', 'explore', 'collection']);
const CREATIVE_MEDIA_TYPES = new Set(['image', 'video']);

/**
 * Statuses an owner may still edit from.
 *
 * Once a campaign is in review or running, its copy and its creative are what
 * were reviewed. Changing them from the phone afterwards would be a way to get
 * unreviewed material in front of the community.
 */
const EDITABLE_STATUSES = new Set(['DRAFT', 'PENDING_PAYMENT']);

/** Statuses an owner may still call off. */
const CANCELLABLE_STATUSES = new Set([
  'DRAFT',
  'PENDING_PAYMENT',
  'IN_REVIEW',
  'ACTIVE',
  'PAUSED',
]);

interface AdCreative {
  storagePath: string;
  mimeType: string;
  sizeBytes: number;
  mediaType: 'image' | 'video';
}

interface AdCampaignInput {
  name: string;
  objective: string;
  headline: string;
  body: string;
  ctaLabel: string;
  ctaUrl: string;
  placements: string[];
  regions: string[];
  dailyBudgetPesewas: number;
  durationDays: number;
  subtotalPesewas: number;
  taxPesewas: number;
  totalBudgetPesewas: number;
  creative: AdCreative;
}

function nowIso(): string {
  return new Date().toISOString();
}

function requiredText(
  data: Record<string, unknown>,
  key: string,
  min: number,
  max: number,
): string {
  const value = data[key];
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (trimmed.length < min || trimmed.length > max) {
    throw new HttpsError(
      'invalid-argument',
      `${key} must be between ${min} and ${max} characters.`,
    );
  }
  return trimmed;
}

function optionalText(data: Record<string, unknown>, key: string, max: number): string {
  const value = data[key];
  if (value == null) return '';
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (trimmed.length > max) {
    throw new HttpsError('invalid-argument', `${key} must be at most ${max} characters.`);
  }
  return trimmed;
}

function integerInRange(
  data: Record<string, unknown>,
  key: string,
  min: number,
  max: number,
): number {
  const value = data[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new HttpsError('invalid-argument', `${key} must be a number.`);
  }
  const rounded = Math.round(value);
  if (rounded < min || rounded > max) {
    throw new HttpsError(
      'invalid-argument',
      `${key} must be between ${min} and ${max}.`,
    );
  }
  return rounded;
}

function stringList(
  data: Record<string, unknown>,
  key: string,
  allowed: Set<string> | null,
  max: number,
): string[] {
  const raw = data[key];
  if (!Array.isArray(raw)) {
    throw new HttpsError('invalid-argument', `${key} must be a list.`);
  }
  const seen = new Set<string>();
  for (const entry of raw) {
    if (typeof entry !== 'string') continue;
    const trimmed = entry.trim();
    if (!trimmed || trimmed.length > 80) continue;
    if (allowed && !allowed.has(trimmed)) {
      throw new HttpsError('invalid-argument', `${key} contains an unknown value.`);
    }
    seen.add(trimmed);
  }
  if (seen.size === 0) {
    throw new HttpsError('invalid-argument', `${key} needs at least one value.`);
  }
  if (seen.size > max) {
    throw new HttpsError('invalid-argument', `${key} accepts at most ${max} values.`);
  }
  return [...seen];
}

function parseCreative(raw: unknown, uid: string): AdCreative {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new HttpsError('failed-precondition', 'Add the image or video people will see.');
  }
  const data = raw as Record<string, unknown>;
  const storagePath = typeof data.storagePath === 'string' ? data.storagePath.trim() : '';
  const expectedPrefix = `creator-submissions/${uid}/${AD_CAMPAIGN_PREFIX}/`;
  if (!storagePath.startsWith(expectedPrefix) || storagePath.includes('..')) {
    throw new HttpsError(
      'permission-denied',
      'The creative is not in your own upload folder.',
    );
  }
  const mediaType = typeof data.mediaType === 'string' ? data.mediaType : '';
  if (!CREATIVE_MEDIA_TYPES.has(mediaType)) {
    throw new HttpsError('invalid-argument', 'An advert creative must be an image or a video.');
  }
  const sizeBytes = typeof data.sizeBytes === 'number' ? Math.round(data.sizeBytes) : 0;
  if (sizeBytes < 0 || sizeBytes > MAX_CREATIVE_BYTES) {
    throw new HttpsError('invalid-argument', 'That creative is too large.');
  }
  return {
    storagePath,
    mimeType:
      typeof data.mimeType === 'string' && data.mimeType
        ? data.mimeType
        : 'application/octet-stream',
    sizeBytes,
    mediaType: mediaType as AdCreative['mediaType'],
  };
}

/**
 * Validates one campaign and computes what it costs.
 *
 * Exported for unit tests, and pure: it reads nothing and writes nothing.
 */
export function parseAdCampaignInput(raw: unknown, uid: string): AdCampaignInput {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new HttpsError('invalid-argument', 'Campaign details are required.');
  }
  const data = raw as Record<string, unknown>;

  const objective = optionalText(data, 'objective', 40);
  if (!OBJECTIVES.has(objective)) {
    throw new HttpsError('invalid-argument', 'Choose what the advert is for.');
  }

  const ctaUrl = optionalText(data, 'ctaUrl', 2000);
  if (objective === 'visits') {
    if (!ctaUrl) {
      throw new HttpsError('failed-precondition', 'Add the web address people should land on.');
    }
    let url: URL;
    try {
      url = new URL(ctaUrl);
    } catch {
      throw new HttpsError('invalid-argument', 'The link must be a complete web address.');
    }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      throw new HttpsError('invalid-argument', 'The link must use http or https.');
    }
  }

  const dailyBudgetPesewas = integerInRange(
    data,
    'dailyBudgetPesewas',
    MIN_DAILY_BUDGET_PESEWAS,
    MAX_DAILY_BUDGET_PESEWAS,
  );
  const durationDays = integerInRange(
    data,
    'durationDays',
    MIN_DURATION_DAYS,
    MAX_DURATION_DAYS,
  );
  // Priced here, never accepted from the caller.
  const subtotalPesewas = dailyBudgetPesewas * durationDays;
  const taxPesewas = Math.round(subtotalPesewas * TAX_RATE);

  return {
    name: requiredText(data, 'name', 3, 120),
    objective,
    headline: requiredText(data, 'headline', 3, 60),
    body: requiredText(data, 'body', 1, 240),
    ctaLabel: optionalText(data, 'ctaLabel', 24),
    ctaUrl: objective === 'visits' ? ctaUrl : '',
    placements: stringList(data, 'placements', PLACEMENTS, PLACEMENTS.size),
    regions: stringList(data, 'regions', null, 12),
    dailyBudgetPesewas,
    durationDays,
    subtotalPesewas,
    taxPesewas,
    totalBudgetPesewas: subtotalPesewas + taxPesewas,
    creative: parseCreative(data.creative, uid),
  };
}

/** The fields a create and an edit both write. */
function campaignFields(input: AdCampaignInput): Record<string, unknown> {
  return {
    name: input.name,
    objective: input.objective,
    headline: input.headline,
    body: input.body,
    ctaLabel: input.ctaLabel,
    ctaUrl: input.ctaUrl,
    placements: input.placements,
    regions: input.regions,
    dailyBudgetPesewas: input.dailyBudgetPesewas,
    durationDays: input.durationDays,
    subtotalPesewas: input.subtotalPesewas,
    taxPesewas: input.taxPesewas,
    totalBudgetPesewas: input.totalBudgetPesewas,
    currency: 'GHS',
    creative: {
      storagePath: input.creative.storagePath,
      mimeType: input.creative.mimeType,
      sizeBytes: input.creative.sizeBytes,
      mediaType: input.creative.mediaType,
      // Filled by the publication step once a paid campaign is approved. Until
      // then the creative stays private to its owner and to staff.
      previewUrl: null,
    },
  };
}

/**
 * Creates an advertising campaign and parks it at PENDING_PAYMENT.
 *
 * No money moves here. Creating a campaign records what it will cost and stops;
 * paying for it is [startAdPayment] and [confirmAdPayment], which are the only
 * two things that can move a campaign out of PENDING_PAYMENT.
 */
export const submitAdCampaign = onCall(
  {
    region: REGION,
    enforceAppCheck: ENFORCE_APP_CHECK,
    consumeAppCheckToken: ENFORCE_APP_CHECK,
    invoker: 'public',
  },
  async (req) => {
    const uid = requireAuth(req);
    await consumeRateLimit('submitAdCampaign', uid, 20);
    const input = parseAdCampaignInput(req.data, uid);

    const db = getFirestore();
    const campaignRef = db.collection('adCampaigns').doc();
    const auditRef = db.collection('auditLogs').doc();
    const notificationRef = db.collection('notifications').doc();
    const now = nowIso();

    const batch = db.batch();
    batch.set(campaignRef, {
      id: campaignRef.id,
      ownerUid: uid,
      ...campaignFields(input),
      status: 'PENDING_PAYMENT',
      payment: {
        provider: 'paystack',
        status: 'unpaid',
        reference: null,
        // Bumped per checkout. Paystack refuses a reference it has already
        // seen, so an abandoned checkout must not be able to lock a campaign
        // out of ever being paid for.
        attempts: 0,
        amountPesewas: input.totalBudgetPesewas,
        paidAt: null,
        channel: null,
      },
      // Server-owned. A client that could write these could invent its own
      // performance report.
      metrics: { impressions: 0, clicks: 0 },
      reviewer: null,
      reviewFeedback: '',
      startsAt: null,
      endsAt: null,
      schemaVersion: 1,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    batch.set(notificationRef, {
      id: notificationRef.id,
      recipient: { collection: 'creatorProfiles', id: uid },
      authUid: uid,
      type: 'ad_campaign',
      title: 'Campaign saved',
      body: `“${input.name}” is waiting for payment. Nothing has been charged.`,
      link: `/ads/${campaignRef.id}`,
      read: false,
      channels: ['in_app', 'push'],
      schemaVersion: 1,
      lifecycle: { createdAt: now, updatedAt: now, version: 1 },
    });
    batch.set(auditRef, {
      id: auditRef.id,
      actor: { collection: 'creatorProfiles', id: uid },
      action: 'ads.campaign.create',
      target: { collection: 'adCampaigns', id: campaignRef.id },
      outcome: 'success',
      source: 'functions',
      before: null,
      after: { status: 'PENDING_PAYMENT', totalBudgetPesewas: input.totalBudgetPesewas },
      metadata: { objective: input.objective, placements: input.placements },
      occurredAt: now,
    });
    await batch.commit();

    return {
      campaignId: campaignRef.id,
      status: 'PENDING_PAYMENT' as const,
      totalBudgetPesewas: input.totalBudgetPesewas,
    };
  },
);

/** Edits a campaign that has not yet been reviewed or started running. */
export const updateAdCampaign = onCall(
  {
    region: REGION,
    enforceAppCheck: ENFORCE_APP_CHECK,
    consumeAppCheckToken: ENFORCE_APP_CHECK,
    invoker: 'public',
  },
  async (req) => {
    const uid = requireAuth(req);
    await consumeRateLimit('updateAdCampaign', uid, 60);
    const data = (req.data ?? {}) as Record<string, unknown>;
    const campaignId = requiredText(data, 'campaignId', 1, 200);
    const input = parseAdCampaignInput(req.data, uid);

    const db = getFirestore();
    const campaignRef = db.collection('adCampaigns').doc(campaignId);
    const auditRef = db.collection('auditLogs').doc();

    return db.runTransaction(async (tx) => {
      const snap = await tx.get(campaignRef);
      if (!snap.exists) {
        throw new HttpsError('not-found', 'Campaign not found.');
      }
      if (snap.get('ownerUid') !== uid) {
        throw new HttpsError('permission-denied', 'Only the owner can edit this campaign.');
      }
      const previousStatus: string = snap.get('status') ?? 'DRAFT';
      if (!EDITABLE_STATUSES.has(previousStatus)) {
        throw new HttpsError(
          'failed-precondition',
          'A campaign that is in review or running can no longer be edited.',
        );
      }

      tx.update(campaignRef, {
        ...campaignFields(input),
        'payment.amountPesewas': input.totalBudgetPesewas,
        updatedAt: FieldValue.serverTimestamp(),
      });
      tx.set(auditRef, {
        id: auditRef.id,
        actor: { collection: 'creatorProfiles', id: uid },
        action: 'ads.campaign.update',
        target: { collection: 'adCampaigns', id: campaignId },
        outcome: 'success',
        source: 'functions',
        before: { totalBudgetPesewas: snap.get('totalBudgetPesewas') ?? null },
        after: { totalBudgetPesewas: input.totalBudgetPesewas },
        metadata: { status: previousStatus },
        occurredAt: nowIso(),
      });

      return { campaignId, status: previousStatus, totalBudgetPesewas: input.totalBudgetPesewas };
    });
  },
);

/** The owner calls a campaign off. Terminal. */
export const cancelAdCampaign = onCall(
  {
    region: REGION,
    enforceAppCheck: ENFORCE_APP_CHECK,
    consumeAppCheckToken: ENFORCE_APP_CHECK,
    invoker: 'public',
  },
  async (req) => {
    const uid = requireAuth(req);
    await consumeRateLimit('cancelAdCampaign', uid, 60);
    const data = (req.data ?? {}) as Record<string, unknown>;
    const campaignId = requiredText(data, 'campaignId', 1, 200);

    const db = getFirestore();
    const campaignRef = db.collection('adCampaigns').doc(campaignId);
    const auditRef = db.collection('auditLogs').doc();

    return db.runTransaction(async (tx) => {
      const snap = await tx.get(campaignRef);
      if (!snap.exists) {
        throw new HttpsError('not-found', 'Campaign not found.');
      }
      if (snap.get('ownerUid') !== uid) {
        throw new HttpsError('permission-denied', 'Only the owner can cancel this campaign.');
      }
      const previousStatus: string = snap.get('status') ?? 'DRAFT';
      if (previousStatus === 'CANCELLED') {
        return { campaignId, status: 'CANCELLED' as const, alreadyCancelled: true };
      }
      if (!CANCELLABLE_STATUSES.has(previousStatus)) {
        throw new HttpsError(
          'failed-precondition',
          'This campaign has already finished.',
        );
      }

      tx.update(campaignRef, {
        status: 'CANCELLED',
        cancelledAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      // Cancelling is terminal, so the public projection goes with it — in this
      // same commit, so an advert cannot still be served after its owner has
      // been told it is off. The campaign document stays for the record.
      tx.delete(adPlacementRef(db, campaignId));
      tx.set(auditRef, {
        id: auditRef.id,
        actor: { collection: 'creatorProfiles', id: uid },
        action: 'ads.campaign.cancel',
        target: { collection: 'adCampaigns', id: campaignId },
        outcome: 'success',
        source: 'functions',
        before: { status: previousStatus },
        after: { status: 'CANCELLED' },
        metadata: {},
        occurredAt: nowIso(),
      });

      return { campaignId, status: 'CANCELLED' as const, alreadyCancelled: false };
    });
  },
);

// ═══════════════════════════════════════════════════════════════════════════
// Payment
// ═══════════════════════════════════════════════════════════════════════════
//
// Three entry points, and none of them takes an amount from the client:
//
//   startAdPayment    opens a Paystack transaction for the total this backend
//                     already computed and stored, and returns the page to
//                     send the payer to.
//   confirmAdPayment  the owner asking "did that go through?" — verified
//                     against Paystack, never against what the app says.
//   paystackWebhook   Paystack telling us the same thing unprompted, so a
//                     campaign is still settled when somebody pays and then
//                     closes the app before it comes back.
//
// The last two do the same work through `settlePaidCampaign`, which is
// idempotent: whichever arrives first marks the campaign paid, and the other
// finds it already done and says so.

/** Statuses a campaign may still be paid for. */
const PAYABLE_STATUSES = new Set(['DRAFT', 'PENDING_PAYMENT']);

function paymentField(snapshot: FirebaseFirestore.DocumentSnapshot, key: string): unknown {
  const payment = snapshot.get('payment');
  return payment && typeof payment === 'object'
    ? (payment as Record<string, unknown>)[key]
    : undefined;
}

/**
 * Marks a campaign paid and sends it to review.
 *
 * Runs inside a transaction and checks the amount Paystack says it collected
 * against the amount the campaign is for. A short payment is recorded and
 * flagged rather than silently accepted: the money is real either way, and a
 * campaign that quietly went to review on half its budget would be a hole
 * nobody could see from the outside.
 */
async function settlePaidCampaign(
  db: Firestore,
  campaignId: string,
  verified: { reference: string; amountPesewas: number; paidAt: string | null; channel: string | null },
): Promise<{ status: string; alreadyPaid: boolean }> {
  const campaignRef = db.collection('adCampaigns').doc(campaignId);
  const auditRef = db.collection('auditLogs').doc();
  const notificationRef = db.collection('notifications').doc();
  const now = nowIso();

  return db.runTransaction(async (tx: Transaction) => {
    const snap = await tx.get(campaignRef);
    if (!snap.exists) {
      throw new HttpsError('not-found', 'Campaign not found.');
    }
    if (paymentField(snap, 'status') === 'paid') {
      return { status: String(snap.get('status') ?? 'IN_REVIEW'), alreadyPaid: true };
    }

    const owed = Number(snap.get('totalBudgetPesewas') ?? 0);
    const underpaid = verified.amountPesewas < owed;

    tx.update(campaignRef, {
      status: underpaid ? 'PENDING_PAYMENT' : 'IN_REVIEW',
      payment: {
        provider: 'paystack',
        status: underpaid ? 'underpaid' : 'paid',
        reference: verified.reference,
        attempts: Number(paymentField(snap, 'attempts') ?? 0),
        amountPesewas: owed,
        amountPaidPesewas: verified.amountPesewas,
        paidAt: verified.paidAt,
        channel: verified.channel,
      },
      updatedAt: FieldValue.serverTimestamp(),
    });

    tx.set(notificationRef, {
      id: notificationRef.id,
      recipient: { collection: 'creatorProfiles', id: snap.get('ownerUid') },
      authUid: snap.get('ownerUid'),
      type: 'ad_payment',
      title: underpaid ? 'Payment came up short' : 'Payment received',
      body: underpaid
        ? `“${snap.get('name')}” is still waiting: less than the full amount came through.`
        : `“${snap.get('name')}” is paid for and now with our reviewers.`,
      link: `/ads/${campaignId}`,
      read: false,
      // A receipt is worth reaching somebody on their phone and in their
      // inbox: money has moved, and "it is in the app somewhere" is not an
      // acceptable answer to whether it arrived.
      channels: ['in_app', 'email', 'push'],
      schemaVersion: 1,
      lifecycle: { createdAt: now, updatedAt: now, version: 1 },
    });

    tx.set(auditRef, {
      id: auditRef.id,
      actor: { collection: 'creatorProfiles', id: snap.get('ownerUid') },
      action: 'ads.campaign.paid',
      target: { collection: 'adCampaigns', id: campaignId },
      outcome: underpaid ? 'failure' : 'success',
      source: 'functions',
      before: { status: snap.get('status'), payment: 'unpaid' },
      after: {
        status: underpaid ? 'PENDING_PAYMENT' : 'IN_REVIEW',
        amountPaidPesewas: verified.amountPesewas,
        owedPesewas: owed,
      },
      metadata: { reference: verified.reference, channel: verified.channel },
      occurredAt: now,
    });

    return {
      status: underpaid ? 'PENDING_PAYMENT' : 'IN_REVIEW',
      alreadyPaid: false,
    };
  });
}

/**
 * Opens a Paystack checkout for a campaign the caller owns.
 *
 * Returns the authorisation URL rather than any kind of card form: card
 * details never touch this app or this backend, which is the whole point of
 * handing the payment page to the provider.
 */
export const startAdPayment = onCall(
  {
    region: REGION,
    enforceAppCheck: ENFORCE_APP_CHECK,
    consumeAppCheckToken: ENFORCE_APP_CHECK,
    invoker: 'public',
    secrets: [PAYSTACK_SECRET_KEY],
  },
  async (req) => {
    const uid = requireAuth(req);
    await consumeRateLimit('startAdPayment', uid, 30);
    if (!isPaystackConfigured()) {
      throw new HttpsError('failed-precondition', 'Payments are not set up yet.');
    }

    const data = (req.data ?? {}) as Record<string, unknown>;
    const campaignId = requiredText(data, 'campaignId', 1, 200);
    const db = getFirestore();
    const campaignRef = db.collection('adCampaigns').doc(campaignId);
    const snap = await campaignRef.get();

    if (!snap.exists) throw new HttpsError('not-found', 'Campaign not found.');
    if (snap.get('ownerUid') !== uid) {
      throw new HttpsError('permission-denied', 'Only the owner can pay for this campaign.');
    }
    if (paymentField(snap, 'status') === 'paid') {
      throw new HttpsError('failed-precondition', 'This campaign is already paid for.');
    }
    if (!PAYABLE_STATUSES.has(String(snap.get('status') ?? ''))) {
      throw new HttpsError('failed-precondition', 'This campaign is past the point of paying for.');
    }

    const amountPesewas = Number(snap.get('totalBudgetPesewas') ?? 0);
    if (!Number.isInteger(amountPesewas) || amountPesewas <= 0) {
      throw new HttpsError('failed-precondition', 'This campaign has no amount to charge.');
    }

    // Paystack needs somebody to send the receipt to. The auth token's email is
    // the one the account is actually reachable at, and it is not something the
    // caller can choose.
    const email =
      (typeof req.auth?.token?.email === 'string' && req.auth.token.email) ||
      `${uid}@advertisers.indigenworld.com`;

    const attempt = Number(paymentField(snap, 'attempts') ?? 0) + 1;
    const reference = adPaymentReference(campaignId, attempt);

    let initialised;
    try {
      initialised = await initializeTransaction({
        email,
        amountPesewas,
        reference,
        metadata: {
          campaignId,
          ownerUid: uid,
          campaignName: snap.get('name') ?? '',
        },
      });
    } catch (error) {
      if (error instanceof PaystackError) {
        throw new HttpsError('unavailable', error.message);
      }
      throw error;
    }

    await campaignRef.update({
      'payment.reference': initialised.reference,
      'payment.attempts': attempt,
      'payment.status': 'pending',
      updatedAt: FieldValue.serverTimestamp(),
    });

    return {
      campaignId,
      reference: initialised.reference,
      authorizationUrl: initialised.authorizationUrl,
      accessCode: initialised.accessCode,
      amountPesewas,
      // Public by design — it is what a checkout page embeds — and the app uses
      // it to say out loud when it is running against test keys.
      publicKey: paystackPublicKey(),
      testMode: isPaystackTestMode(),
    };
  },
);

/**
 * Checks a checkout the owner has come back from.
 *
 * The app calls this when it returns to the foreground after sending somebody
 * to Paystack. It is the same settlement the webhook performs, so whichever
 * gets there first wins and the other reports that it was already done.
 */
export const confirmAdPayment = onCall(
  {
    region: REGION,
    enforceAppCheck: ENFORCE_APP_CHECK,
    consumeAppCheckToken: ENFORCE_APP_CHECK,
    invoker: 'public',
    secrets: [PAYSTACK_SECRET_KEY],
  },
  async (req) => {
    const uid = requireAuth(req);
    await consumeRateLimit('confirmAdPayment', uid, 60);
    if (!isPaystackConfigured()) {
      throw new HttpsError('failed-precondition', 'Payments are not set up yet.');
    }

    const data = (req.data ?? {}) as Record<string, unknown>;
    const campaignId = requiredText(data, 'campaignId', 1, 200);
    const db = getFirestore();
    const snap = await db.collection('adCampaigns').doc(campaignId).get();

    if (!snap.exists) throw new HttpsError('not-found', 'Campaign not found.');
    if (snap.get('ownerUid') !== uid) {
      throw new HttpsError('permission-denied', 'Only the owner can check this payment.');
    }
    if (paymentField(snap, 'status') === 'paid') {
      return { campaignId, paid: true, status: snap.get('status'), alreadyPaid: true };
    }

    // The reference comes off the campaign, never off the request: a caller who
    // could name the reference could name somebody else's successful one.
    const reference = paymentField(snap, 'reference');
    if (typeof reference !== 'string' || !reference) {
      throw new HttpsError('failed-precondition', 'This campaign has no checkout to check.');
    }

    let verified;
    try {
      verified = await verifyTransaction(reference);
    } catch (error) {
      if (error instanceof PaystackError) {
        throw new HttpsError('unavailable', error.message);
      }
      throw error;
    }

    if (verified.status !== 'success') {
      return {
        campaignId,
        paid: false,
        status: snap.get('status'),
        paymentStatus: verified.status,
        alreadyPaid: false,
      };
    }

    const settled = await settlePaidCampaign(db, campaignId, {
      reference: verified.reference,
      amountPesewas: verified.amountPesewas,
      paidAt: verified.paidAt,
      channel: verified.channel,
    });

    return {
      campaignId,
      paid: settled.status === 'IN_REVIEW',
      status: settled.status,
      alreadyPaid: settled.alreadyPaid,
    };
  },
);

/**
 * Paystack's own notification that a charge succeeded.
 *
 * Unauthenticated by necessity and therefore signature-checked before a single
 * field of the body is read. `rawBody` rather than `body`: the signature is
 * over the bytes Paystack sent, and a re-serialised object differs from those
 * bytes by key order alone.
 *
 * Always answers 200 once the signature is good. A webhook that returns 500
 * because a campaign has since been cancelled is a webhook Paystack will retry
 * for hours over something that is not going to change.
 */
export const paystackWebhook = onRequest(
  {
    region: REGION,
    invoker: 'public',
    timeoutSeconds: 30,
    secrets: [PAYSTACK_SECRET_KEY],
  },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.set('Allow', 'POST').status(405).json({ error: 'method-not-allowed' });
      return;
    }
    const signature = req.get('x-paystack-signature') ?? undefined;
    if (!verifyWebhookSignature(req.rawBody ?? Buffer.from(''), signature)) {
      logger.warn('Rejected a Paystack webhook with a bad signature');
      res.status(401).json({ error: 'bad-signature' });
      return;
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const event = typeof body.event === 'string' ? body.event : '';
    const payload = (body.data ?? {}) as Record<string, unknown>;

    if (event !== 'charge.success') {
      // Everything else — failed charges, transfers, refunds — is acknowledged
      // and ignored rather than retried at us forever.
      res.status(200).json({ received: true, handled: false });
      return;
    }

    const metadata = (payload.metadata ?? {}) as Record<string, unknown>;
    const campaignId =
      typeof metadata.campaignId === 'string' ? metadata.campaignId : '';
    const reference = typeof payload.reference === 'string' ? payload.reference : '';
    if (!campaignId || !reference) {
      logger.warn('Paystack charge.success carried no campaign', { reference });
      res.status(200).json({ received: true, handled: false });
      return;
    }

    try {
      // Verified rather than believed, even though the signature is good: the
      // amount that settles a campaign should come from the endpoint that
      // knows it, not from a body that merely arrived with the right hash.
      const verified = await verifyTransaction(reference);
      if (verified.status !== 'success') {
        res.status(200).json({ received: true, handled: false });
        return;
      }
      const settled = await settlePaidCampaign(getFirestore(), campaignId, {
        reference: verified.reference,
        amountPesewas: verified.amountPesewas,
        paidAt: verified.paidAt,
        channel: verified.channel,
      });
      res.status(200).json({ received: true, handled: true, status: settled.status });
    } catch (error) {
      logger.error('Could not settle a paid campaign', {
        campaignId,
        reference,
        error: String(error),
      });
      // Still a 200: the charge is real and recorded at Paystack, and the app's
      // own confirm call will settle it on the next look.
      res.status(200).json({ received: true, handled: false });
    }
  },
);


// ═══════════════════════════════════════════════════════════════════════════
// Serving
// ═══════════════════════════════════════════════════════════════════════════
//
// ── Why a second collection ────────────────────────────────────────────────
//
// `adCampaigns` is the campaign: budget, payment state, owner, reviewer, the
// impression count. None of that is a reader's business, and its rules say so —
// owner and staff only. But an advert has to be readable by whoever is
// scrolling, guests included, so what actually runs is projected into
// `adPlacements/{campaignId}`: the headline, the artwork, the link and the
// audience it was bought for, and nothing else. A field that is not in the
// projection is a field that cannot leak out of it.
//
// ── Going up needs Storage, coming down does not ───────────────────────────
//
// Taking an advert down is a Firestore write and nothing more, so it rides
// inside the same transaction as the status change and is atomic with it: the
// moment a campaign stops being ACTIVE it has already stopped being readable.
// Putting one up has to copy a file between Storage prefixes, so it happens
// after the transaction commits — the same discipline `finalisePublishedMedia`
// follows, because media I/O must never be the reason a reviewer's decision
// fails.
//
// ── Delete or deactivate ───────────────────────────────────────────────────
//
// One rule, applied everywhere: a stop that can be undone deactivates, a stop
// that cannot deletes. PAUSE flips `active` to false and leaves the document
// alone, so RESUME is a single write that never re-copies artwork which is
// already public. REJECT, CANCELLED and COMPLETED delete it, because the
// projection is derived state that will never serve again and the campaign
// document — with its audit trail — remains the accountable record of what ran.

/** The public, server-written projection of a campaign that may be served. */
const AD_PLACEMENTS = 'adPlacements';

function adPlacementRef(db: Firestore, campaignId: string) {
  return db.collection(AD_PLACEMENTS).doc(campaignId);
}

function creativeField(snapshot: DocumentSnapshot, key: string): unknown {
  const creative = snapshot.get('creative');
  return creative && typeof creative === 'object'
    ? (creative as Record<string, unknown>)[key]
    : undefined;
}

function textOf(snapshot: DocumentSnapshot, key: string): string {
  const value = snapshot.get(key);
  return typeof value === 'string' ? value : '';
}

function listOf(snapshot: DocumentSnapshot, key: string): string[] {
  const value = snapshot.get(key);
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

/**
 * Copies an approved creative out of the advertiser's private folder and into
 * the world-readable `ad-creatives/` prefix, returning its download URL.
 *
 * The uploaded file lives under `creator-submissions/{uid}/`, which Storage
 * keeps owner-only — correctly, since it is unreviewed material right up until
 * a reviewer approves it. Copying rather than moving leaves the original where
 * the audit trail expects to find it, and the URL is minted by the same
 * `mintDownloadUrl` the published Explore media uses, so an advert and a reel
 * reach the phone as the same kind of link.
 *
 * Returns null when the upload has gone missing. That is a campaign which
 * cannot be served, not a decision which should have failed.
 */
async function copyAdCreative(
  campaignId: string,
  storagePath: string,
  mimeType: string,
): Promise<string | null> {
  const bucket = getStorage().bucket();
  const source = bucket.file(storagePath);
  const [exists] = await source.exists();
  if (!exists) return null;

  const destination = `ad-creatives/${campaignId}/original`;
  await source.copy(bucket.file(destination));
  return mintDownloadUrl(bucket, destination, mimeType);
}

/**
 * Publishes — or republishes — the public projection of a running campaign.
 *
 * Runs after the review transaction has committed, for APPROVE and RESUME
 * alike. The creative is copied only when `creative.previewUrl` is not already
 * set: a resumed campaign's artwork is already public at a URL the projection
 * has been handing out, and copying it again would mint a second token for a
 * file that is byte-for-byte the one already being served.
 *
 * The status is re-read here rather than trusted from the decision that called
 * us. Between the commit and this line a campaign can have been paused or
 * cancelled, and this is the write that would put it back in front of people.
 *
 * ── Why the projection is written in a transaction ─────────────────────────
 *
 * Re-reading the status once at the top of this function was not enough, and
 * the gap was not theoretical: the read is followed by [copyAdCreative], which
 * copies the creative between Storage prefixes and mints a URL, and for a video
 * measured in hundreds of megabytes that is seconds rather than milliseconds.
 * A PAUSE, a REJECT or a `cancelAdCampaign` landing inside that window did its
 * work correctly — flipped `active` off, or deleted the projection — and then
 * this function's unconditional `set` put the advert straight back with
 * `active: true`. A campaign its owner had been told was cancelled carried on
 * being served, which is the exact thing the atomic take-down above exists to
 * prevent.
 *
 * Reading the campaign inside the transaction puts it in the transaction's
 * conflict set, so any of those three writes forces a retry and the retry sees
 * the status that actually won. The Storage copy deliberately stays outside:
 * a transaction body can run several times, and copying a file is not
 * something to do twice.
 */
async function publishAdPlacement(db: Firestore, campaignId: string): Promise<void> {
  const campaignRef = db.collection('adCampaigns').doc(campaignId);
  const snap = await campaignRef.get();
  if (!snap.exists) return;
  if (snap.get('status') !== 'ACTIVE') return;

  const existing = creativeField(snap, 'previewUrl');
  let creativeUrl = typeof existing === 'string' && existing ? existing : null;
  if (!creativeUrl) {
    const storagePath = String(creativeField(snap, 'storagePath') ?? '');
    const mimeType = String(creativeField(snap, 'mimeType') ?? 'application/octet-stream');
    creativeUrl = storagePath ? await copyAdCreative(campaignId, storagePath, mimeType) : null;
    if (creativeUrl) {
      await campaignRef.update({
        'creative.previewUrl': creativeUrl,
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
  }
  if (!creativeUrl) {
    // No artwork, no advert. Better a campaign that visibly never appeared than
    // a placement carrying a headline and an empty frame.
    logger.error('Approved a campaign whose creative could not be published', { campaignId });
    return;
  }

  const publishedUrl = creativeUrl;
  await db.runTransaction(async (tx: Transaction) => {
    const fresh = await tx.get(campaignRef);
    if (!fresh.exists || fresh.get('status') !== 'ACTIVE') return;

    // Projected from `fresh` rather than from the snapshot read before the
    // copy, so the advert that goes up says what the campaign says now.
    tx.set(adPlacementRef(db, campaignId), {
      campaignId,
      headline: textOf(fresh, 'headline'),
      body: textOf(fresh, 'body'),
      ctaLabel: textOf(fresh, 'ctaLabel'),
      ctaUrl: textOf(fresh, 'ctaUrl'),
      objective: textOf(fresh, 'objective'),
      placements: listOf(fresh, 'placements'),
      regions: listOf(fresh, 'regions'),
      creativeUrl: publishedUrl,
      mediaType: String(creativeField(fresh, 'mediaType') ?? 'image'),
      // Copied verbatim as the ISO strings the campaign already stores, so the
      // two documents can never disagree about when a run ends. `updatedAt` is
      // a server timestamp, matching the campaign document it is projected
      // from.
      startsAt: fresh.get('startsAt') ?? null,
      endsAt: fresh.get('endsAt') ?? null,
      active: true,
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
}

/**
 * Takes a paused advert out of the feed while keeping its projection.
 *
 * Written with merge rather than update so a pause bites even on a campaign
 * whose projection was never written — approval's Storage copy can fail, and a
 * pause that threw not-found would leave a reviewer believing they had stopped
 * something they had not.
 */
function deactivateAdPlacement(tx: Transaction, db: Firestore, campaignId: string): void {
  tx.set(
    adPlacementRef(db, campaignId),
    { active: false, updatedAt: FieldValue.serverTimestamp() },
    { merge: true },
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Review
// ═══════════════════════════════════════════════════════════════════════════

/** What a reviewer may do to a campaign, and where each decision leaves it. */
const AD_DECISIONS = {
  APPROVE: 'ACTIVE',
  REJECT: 'REJECTED',
  PAUSE: 'PAUSED',
  RESUME: 'ACTIVE',
} as const;

type AdDecision = keyof typeof AD_DECISIONS;

/**
 * Whether [key] is a decision a reviewer may actually take.
 *
 * `Object.hasOwn` rather than `in`, for the reason spelled out on
 * [isAdEventKind]. Reachable only by a validator here, so the damage was a 500
 * rather than a bad write — `AD_DECISION_PRECONDITIONS['constructor']` is a
 * function, and calling `.has` on it throws — but it is the same hole and it
 * closes the same way.
 */
function isAdDecision(key: string): key is AdDecision {
  return Object.hasOwn(AD_DECISIONS, key);
}

/** Which decisions make sense from where a campaign currently is. */
const AD_DECISION_PRECONDITIONS: Record<AdDecision, ReadonlySet<string>> = {
  APPROVE: new Set(['IN_REVIEW']),
  REJECT: new Set(['IN_REVIEW', 'ACTIVE', 'PAUSED']),
  PAUSE: new Set(['ACTIVE']),
  RESUME: new Set(['PAUSED']),
};

/** A rejection with no reason is a rejection nobody can act on. */
const AD_DECISIONS_NEEDING_FEEDBACK: ReadonlySet<AdDecision> = new Set(['REJECT']);

function adDecisionCopy(
  decision: AdDecision,
  name: string,
  feedback: string,
): { title: string; body: string } {
  switch (decision) {
    case 'APPROVE':
      return {
        title: 'Advert approved',
        body: `“${name}” has been approved and is now running.`,
      };
    case 'REJECT':
      return {
        title: 'Advert not approved',
        body: `“${name}” was not approved. ${feedback}`.trim(),
      };
    case 'PAUSE':
      return {
        title: 'Advert paused',
        body: feedback
          ? `“${name}” has been paused. ${feedback}`
          : `“${name}” has been paused.`,
      };
    case 'RESUME':
      return {
        title: 'Advert running again',
        body: `“${name}” is running again.`,
      };
  }
}

/**
 * Records a reviewer's decision on an advertising campaign.
 *
 * The counterpart to `decideSubmission` for the other thing members send in.
 * Role-gated to validators and above — the same claim the Security Rules check
 * — and every transition is written with the campaign's previous state in the
 * audit log, because "who let this run" is a question somebody will eventually
 * ask about an advert.
 *
 * A campaign is only ever reviewed after it is paid for. Approving an unpaid
 * one would put an advert in front of the community that nobody has been
 * charged for, so the precondition is checked here rather than assumed from
 * the status alone.
 */
export const decideAdCampaign = onCall(
  {
    region: REGION,
    enforceAppCheck: ENFORCE_APP_CHECK,
    consumeAppCheckToken: ENFORCE_APP_CHECK,
    invoker: 'public',
  },
  async (req) => {
    const uid = requireAuth(req);
    requireRole(req, 'validator');
    await consumeRateLimit('decideAdCampaign', uid, 120);

    const data = (req.data ?? {}) as Record<string, unknown>;
    const campaignId = requiredText(data, 'campaignId', 1, 200);
    const decision = String(data.decision ?? '');
    if (!isAdDecision(decision)) {
      throw new HttpsError('invalid-argument', `Unknown decision: ${String(data.decision)}.`);
    }
    const feedback = optionalText(data, 'feedback', 1000);
    if (AD_DECISIONS_NEEDING_FEEDBACK.has(decision) && feedback.length === 0) {
      throw new HttpsError(
        'invalid-argument',
        'Tell the advertiser why, so they can do something about it.',
      );
    }

    const db = getFirestore();
    const campaignRef = db.collection('adCampaigns').doc(campaignId);
    const auditRef = db.collection('auditLogs').doc();
    const notificationRef = db.collection('notifications').doc();
    const now = nowIso();

    const result = await db.runTransaction(async (tx: Transaction) => {
      const snap = await tx.get(campaignRef);
      if (!snap.exists) throw new HttpsError('not-found', 'Campaign not found.');

      const previousStatus = String(snap.get('status') ?? 'DRAFT');
      if (!AD_DECISION_PRECONDITIONS[decision].has(previousStatus)) {
        throw new HttpsError(
          'failed-precondition',
          `A campaign that is ${previousStatus.toLowerCase().replace(/_/g, ' ')} cannot be ${decision.toLowerCase()}d.`,
        );
      }
      if (decision === 'APPROVE' && paymentField(snap, 'status') !== 'paid') {
        throw new HttpsError(
          'failed-precondition',
          'This campaign has not been paid for yet.',
        );
      }

      const nextStatus = AD_DECISIONS[decision];
      const ownerUid = snap.get('ownerUid');
      const name = String(snap.get('name') ?? 'Your campaign');
      const durationDays = Number(snap.get('durationDays') ?? 0);

      // A run starts when it is approved, not when it was paid for: a campaign
      // held up in review must not lose the days it spent waiting.
      const startsAt = decision === 'APPROVE' ? now : snap.get('startsAt') ?? null;
      const endsAt =
        decision === 'APPROVE' && durationDays > 0
          ? new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000).toISOString()
          : snap.get('endsAt') ?? null;

      tx.update(campaignRef, {
        status: nextStatus,
        reviewer: { id: uid, decidedAt: now },
        reviewFeedback: feedback,
        startsAt,
        endsAt,
        updatedAt: FieldValue.serverTimestamp(),
      });

      // Coming down is atomic with the status change: a rejected advert can
      // never run again, so its projection goes; a paused one is expected back,
      // so it is only switched off. Going up is the post-commit step below.
      if (decision === 'REJECT') {
        tx.delete(adPlacementRef(db, campaignId));
      } else if (decision === 'PAUSE') {
        deactivateAdPlacement(tx, db, campaignId);
      }

      const copy = adDecisionCopy(decision, name, feedback);
      tx.set(notificationRef, {
        id: notificationRef.id,
        recipient: { collection: 'creatorProfiles', id: ownerUid },
        authUid: ownerUid,
        type: 'ad_review_decision',
        title: copy.title,
        body: copy.body,
        link: `/ads/${campaignId}`,
        read: false,
        // The answer to something they paid for and are waiting on.
        channels: ['in_app', 'email', 'push'],
        schemaVersion: 1,
        lifecycle: { createdAt: now, updatedAt: now, version: 1 },
      });

      tx.set(auditRef, {
        id: auditRef.id,
        actor: { collection: 'contributors', id: uid },
        action: 'ads.campaign.review',
        target: { collection: 'adCampaigns', id: campaignId },
        outcome: 'success',
        source: 'functions',
        before: { status: previousStatus },
        after: { status: nextStatus },
        metadata: { decision, hasFeedback: feedback.length > 0 },
        occurredAt: now,
      });

      return { campaignId, status: nextStatus, previousStatus };
    });

    // Post-commit: copy the creative into the public prefix and write the
    // projection that actually puts the advert in a feed. A failure here is
    // logged and swallowed rather than thrown, exactly as the submission
    // workflow does: the decision is recorded, the advertiser has been told,
    // and the money question is settled. Approving again after a fix republishes
    // from the same code path, so nothing here needs to be undone first.
    if (result.status === 'ACTIVE') {
      try {
        await publishAdPlacement(db, campaignId);
      } catch (error) {
        logger.error('publishAdPlacement failed', { campaignId, error: String(error) });
      }
    }

    return result;
  },
);


// ═══════════════════════════════════════════════════════════════════════════
// Delivery reporting
// ═══════════════════════════════════════════════════════════════════════════

/** What a phone may report about an advert, and where the count lands. */
const AD_EVENT_FIELDS = {
  impression: 'metrics.impressions',
  click: 'metrics.clicks',
} as const;

type AdEventKind = keyof typeof AD_EVENT_FIELDS;

/**
 * Whether [key] is one of the events this backend actually counts.
 *
 * `Object.hasOwn` and not `key in AD_EVENT_FIELDS`, which was the bug: `in`
 * walks the prototype chain, so `'toString'`, `'constructor'` and `'__proto__'`
 * all satisfied it. The lookup that followed then returned a function or
 * `Object.prototype` instead of a field path, and that went straight into the
 * `update` call below as a computed key — `"function toString() { [native
 * code] }"`. `recordAdEvent` takes no authentication at all, so this was an
 * unauthenticated caller choosing what a Firestore field path says about
 * somebody else's campaign document.
 */
function isAdEventKind(key: string): key is AdEventKind {
  return Object.hasOwn(AD_EVENT_FIELDS, key);
}

/**
 * A phone reporting that it put an advert on screen, or that somebody tapped it.
 *
 * ── Why this one is not authenticated ──────────────────────────────────────
 *
 * A guest scrolling Explore sees the same adverts a signed-in member does, and
 * an advertiser who paid to reach that guest is owed the count. Requiring auth
 * here would quietly under-report every campaign by however much of its
 * audience had not signed up yet.
 *
 * ── What a forged count can and cannot do ──────────────────────────────────
 *
 * These numbers are a report, not a ledger, and that is the whole reason this
 * is safe to leave open. Nothing in this backend spends against them: a
 * campaign is charged once, up front, for its entire run, and
 * `expireAdCampaigns` ends it on the calendar rather than on the count. So the
 * worst a flood of invented impressions does is make somebody's own report look
 * better than reality. It cannot drain a rival's budget or push their advert
 * out of the feed, which is exactly what a spend-per-impression model would
 * have exposed here. What is left — a distorted report — is held down by App
 * Check and by a rate limit keyed per campaign, so no one caller can move one
 * campaign's counters faster than a real audience would.
 */
export const recordAdEvent = onCall(
  {
    region: REGION,
    enforceAppCheck: ENFORCE_APP_CHECK,
    consumeAppCheckToken: ENFORCE_APP_CHECK,
    invoker: 'public',
  },
  async (req) => {
    const data = (req.data ?? {}) as Record<string, unknown>;
    const campaignId = requiredText(data, 'campaignId', 1, 200);
    const kind = String(data.kind ?? '');
    if (!isAdEventKind(kind)) {
      throw new HttpsError('invalid-argument', `Unknown advert event: ${String(data.kind)}.`);
    }

    // Keyed by campaign as well as caller: an anonymous reporter has no
    // identity worth keying on alone, and it is the campaign's counters that
    // are being protected. 600 a minute is far above what a real audience
    // produces for one advert on an app this size — if one ever genuinely
    // sustains it, this counter wants sharding before the limit wants raising.
    const actor = req.auth?.uid ?? 'anonymous';
    await consumeRateLimit('recordAdEvent', `${campaignId}_${actor}`, 600);

    const db = getFirestore();
    const campaignRef = db.collection('adCampaigns').doc(campaignId);
    const snap = await campaignRef.get();
    if (!snap.exists) throw new HttpsError('not-found', 'Campaign not found.');
    if (snap.get('status') !== 'ACTIVE') {
      // Counting against a paused, finished or rejected campaign would report
      // delivery for days the advertiser was not being shown to anybody.
      throw new HttpsError('failed-precondition', 'That advert is not running.');
    }

    // Deliberately does not touch `updatedAt`: that field answers "when did
    // this campaign last change", and an impression changes nothing about it.
    await campaignRef.update({ [AD_EVENT_FIELDS[kind]]: FieldValue.increment(1) });

    return { campaignId, kind, recorded: true };
  },
);


// ═══════════════════════════════════════════════════════════════════════════
// Housekeeping
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Ends the campaigns whose last day has passed.
 *
 * COMPLETED has been in the status enum from the start and nothing ever wrote
 * it: until now an approved campaign stayed ACTIVE for good and its `endsAt`
 * was a date nobody enforced. This is the sweep that enforces it.
 *
 * The first scheduled function in this project, so a deployment note: Cloud
 * Scheduler must be enabled on the Firebase project (it needs Blaze, and the
 * API is switched on the first time a scheduled function deploys). If the
 * sweep ever looks like it is not running, check that the job exists in Cloud
 * Scheduler before suspecting this code.
 *
 * Daily rather than hourly by choice. An advert that lingers a few hours past
 * midnight of its last day costs the advertiser nothing — the run was prepaid
 * by the day — while an hourly sweep would be twenty-four times the reads for
 * the same outcome.
 */
export const expireAdCampaigns = onSchedule(
  {
    region: REGION,
    schedule: 'every day 03:00',
    // Accra is where the advertisers and the audience are; a campaign should
    // end at the end of the day they bought, not the end of a day in Utah.
    timeZone: 'Africa/Accra',
  },
  async () => {
    const db = getFirestore();
    const now = nowIso();

    // Filtered on status alone and finished in memory. `endsAt` is an ISO
    // string, and Firestore inequalities reach across types, so an
    // `endsAt <= now` filter would also sweep up the nulls that sort ahead of
    // every string. It would want a composite index too, for a set that is
    // small by construction: the ACTIVE campaigns are the ones being paid for.
    const running = await db.collection('adCampaigns').where('status', '==', 'ACTIVE').get();

    let completed = 0;
    for (const campaign of running.docs) {
      const endsAt = campaign.get('endsAt');
      if (typeof endsAt !== 'string' || !endsAt || endsAt > now) continue;

      const ownerUid = campaign.get('ownerUid');
      const name = String(campaign.get('name') ?? 'Your campaign');
      const auditRef = db.collection('auditLogs').doc();
      const notificationRef = db.collection('notifications').doc();

      // One batch per campaign: a single document that cannot be written must
      // not stop every campaign behind it in the sweep from ending.
      const batch = db.batch();
      batch.update(campaign.ref, {
        status: 'COMPLETED',
        completedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      // Finished is terminal, so the projection goes rather than going quiet.
      batch.delete(adPlacementRef(db, campaign.id));
      batch.set(notificationRef, {
        id: notificationRef.id,
        recipient: { collection: 'creatorProfiles', id: ownerUid },
        authUid: ownerUid,
        type: 'ad_campaign',
        title: 'Advert finished',
        body: `“${name}” has finished its run. Nothing further will be charged.`,
        link: `/ads/${campaign.id}`,
        read: false,
        // No email: the run ending on the day it was bought to end is expected
        // news, unlike a payment or a review decision.
        channels: ['in_app', 'push'],
        schemaVersion: 1,
        lifecycle: { createdAt: now, updatedAt: now, version: 1 },
      });
      batch.set(auditRef, {
        id: auditRef.id,
        // Nobody decided this one; the calendar did.
        actor: { collection: 'system', id: 'expireAdCampaigns' },
        action: 'ads.campaign.complete',
        target: { collection: 'adCampaigns', id: campaign.id },
        outcome: 'success',
        source: 'functions',
        before: { status: 'ACTIVE' },
        after: { status: 'COMPLETED' },
        metadata: { endsAt },
        occurredAt: now,
      });

      try {
        await batch.commit();
        completed += 1;
      } catch (error) {
        logger.error('Could not complete an expired campaign', {
          campaignId: campaign.id,
          error: String(error),
        });
      }
    }

    if (completed > 0) {
      logger.info('Completed expired ad campaigns', { completed, checked: running.size });
    }
  },
);
