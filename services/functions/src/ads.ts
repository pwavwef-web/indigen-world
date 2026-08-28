import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { requireAuth } from './auth.js';
import { consumeRateLimit } from './rate-limit.js';

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
 * No money moves. Paystack is not wired yet, and this function deliberately
 * does not pretend otherwise: it records the amount owed, marks the campaign
 * unpaid, and stops. When the payment provider lands, the only thing that
 * changes is what moves a campaign out of PENDING_PAYMENT.
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
        amountPesewas: input.totalBudgetPesewas,
        paidAt: null,
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
      type: 'review_decision',
      title: 'Campaign saved',
      body: `“${input.name}” is waiting for payment. Nothing has been charged.`,
      link: '/ads',
      read: false,
      channels: ['in_app'],
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
