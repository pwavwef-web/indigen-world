import { logger } from 'firebase-functions';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import type { Firestore, Transaction } from 'firebase-admin/firestore';
import { HttpsError, onCall, onRequest } from 'firebase-functions/v2/https';
import { requireAuth, requireRole } from './auth.js';
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
    const decision = String(data.decision ?? '') as AdDecision;
    if (!(decision in AD_DECISIONS)) {
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

    return db.runTransaction(async (tx: Transaction) => {
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
  },
);
