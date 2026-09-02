import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { requireAuth } from './auth.js';
import { consumeRateLimit } from './rate-limit.js';
import {
  COLLECTION_KINDS,
  collectionKindForSubmission,
  type CollectionKind,
} from './publication.js';
import {
  canonicalLexicalKind,
  normaliseTranslations,
  type LexicalKind,
} from './lexical-kinds.js';

const REGION = 'us-central1';
export const COLLECTION_CAMPAIGN_ID = 'collection-contributions';

// App Check enforcement follows the other callable functions in this project.
const ENFORCE_APP_CHECK = process.env.ENFORCE_APP_CHECK === 'true';

/** A file the member uploaded into their own private submission prefix. */
export interface CollectionContributionMedia {
  storagePath: string;
  mimeType: string;
  sizeBytes: number;
  mediaType: 'image' | 'audio' | 'video' | 'document';
}

export interface CollectionContributionInput {
  collectionKind: CollectionKind;
  /**
   * Whether this is a word, a phrase, an idiom or a proverb — see
   * LEXICAL_KINDS. Only the dictionary path reads it; everything else carries
   * the default so no reader has to hold a null check for a field it never
   * consults.
   */
  lexicalKind: LexicalKind;
  title: string;
  body: string;
  /**
   * Every meaning the member gave, already split, trimmed and de-duplicated.
   *
   * Held beside `body` rather than replacing it: `body` is the text the member
   * typed and is what a reviewer should see, while this is the machine-readable
   * reading of it. A dictionary contribution that predates this field derives
   * its list from `body`, so nothing published before today changes shape.
   */
  translations: string[];
  format: string;
  dialect: string;
  source: string;
  mediaUrl: string;
  media: CollectionContributionMedia | null;
  /**
   * Optional artwork for the recording — a song's cover.
   *
   * Separate from [media] because it is a second file with a second set of
   * rules: it is always a picture, it is small, and it means nothing on its own.
   * It travels to publication as the submission's `media.thumbnailPath`, which
   * is the field the publication workflow already knows how to make public.
   */
  cover: CollectionContributionMedia | null;
  notes: string;
  relatedEntryId: string | null;
  /**
   * Whether anyone under 18 features in the work.
   *
   * Null where the question was not put. The mobile forms ask it only where a
   * person is actually the subject, so a dictionary word or a song no longer
   * carries an answer nobody was asked for — and a reviewer can tell an
   * undeclared submission from one declared clear.
   */
  involvesMinors: boolean | null;
  usesThirdPartyMaterial: boolean;
  participantConsentConfirmed: boolean;
  kasemExample: string;
  englishExample: string;
  rightsConfirmed: true;
  publicationPermission: boolean;
}

/** Largest single upload accepted, matching the Storage rules' own ceiling. */
const MAX_UPLOAD_BYTES = 500 * 1024 * 1024;

/**
 * Cover art gets a ceiling of its own, two orders of magnitude below the one a
 * master recording needs. A picture that big is a mistake — a photograph
 * straight off a phone camera, or the wrong file entirely — and a member on a
 * metered village connection should hear about it before the upload, not after
 * paying for it.
 */
const MAX_COVER_BYTES = 8 * 1024 * 1024;

const MEDIA_TYPES = ['image', 'audio', 'video', 'document'] as const;

/**
 * Validates the reference to an uploaded file.
 *
 * The path is checked against the caller's own prefix rather than trusted:
 * Storage rules stop a member writing into somebody else's folder, but nothing
 * stops them *naming* one here, and a submission that pointed a reviewer at
 * another member's private upload would be a disclosure the rules never saw.
 *
 * [label] and [maxBytes] exist so cover art can be put through this exact check
 * and still fail with its own message and its own ceiling. The alternative was
 * a second near-identical parser, which is how one of the two copies eventually
 * loses the prefix check.
 */
export function parseContributionMedia(
  raw: unknown,
  uid: string,
  options: { label?: string; maxBytes?: number } = {},
): CollectionContributionMedia | null {
  const label = options.label ?? 'media';
  const maxBytes = options.maxBytes ?? MAX_UPLOAD_BYTES;
  if (raw == null) return null;
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new HttpsError('invalid-argument', `${label} must be an object.`);
  }
  const data = raw as Record<string, unknown>;
  const storagePath = typeof data.storagePath === 'string' ? data.storagePath.trim() : '';
  const expectedPrefix = `creator-submissions/${uid}/${COLLECTION_CAMPAIGN_ID}/`;
  if (!storagePath.startsWith(expectedPrefix) || storagePath.includes('..')) {
    throw new HttpsError('permission-denied', 'The uploaded file is not in your own submission folder.');
  }
  const mediaType = typeof data.mediaType === 'string' ? data.mediaType : '';
  if (!(MEDIA_TYPES as readonly string[]).includes(mediaType)) {
    throw new HttpsError('invalid-argument', 'mediaType must be image, audio, video, or document.');
  }
  const sizeBytes = typeof data.sizeBytes === 'number' ? Math.round(data.sizeBytes) : 0;
  if (sizeBytes < 0 || sizeBytes > maxBytes) {
    throw new HttpsError(
      'invalid-argument',
      `The ${label} file is too large (${Math.round(maxBytes / (1024 * 1024))} MB maximum).`,
    );
  }
  return {
    storagePath,
    mimeType: typeof data.mimeType === 'string' && data.mimeType ? data.mimeType : 'application/octet-stream',
    sizeBytes,
    mediaType: mediaType as CollectionContributionMedia['mediaType'],
  };
}

/**
 * The same check, plus the two things that make a file cover art rather than
 * simply another upload: it is declared an image, and it says so in its own
 * MIME type. Both are asked because they can disagree — a client that picks an
 * `.mp3` into the artwork slot would otherwise put an audio file where the
 * player expects a picture, and the lock screen would show nothing while the
 * bytes were downloaded to find that out.
 */
export function parseContributionCover(
  raw: unknown,
  uid: string,
): CollectionContributionMedia | null {
  const cover = parseContributionMedia(raw, uid, { label: 'cover', maxBytes: MAX_COVER_BYTES });
  if (!cover) return null;
  if (cover.mediaType !== 'image' || !cover.mimeType.toLowerCase().startsWith('image/')) {
    throw new HttpsError('invalid-argument', 'The cover must be an image file.');
  }
  return cover;
}

/**
 * Where the cover ends up, or null.
 *
 * A cover with no recording is nothing: the submission carries no `media`
 * object for a text-only contribution, and inventing one so a picture had
 * somewhere to sit would make a poem look like a song whose audio failed to
 * upload. Asked in one place because the receipt and the canonical submission
 * must agree — two copies of this rule would drift the first time one changed.
 */
export function contributionCoverPath(input: CollectionContributionInput): string | null {
  if (!input.media || !input.cover) return null;
  return input.cover.storagePath;
}

function nowIso(): string {
  return new Date().toISOString();
}

function requiredText(data: Record<string, unknown>, key: string, max: number): string {
  const value = data[key];
  if (typeof value !== 'string' || value.trim().length === 0 || value.trim().length > max) {
    throw new HttpsError('invalid-argument', `${key} is required and must be at most ${max} characters.`);
  }
  return value.trim();
}

function optionalText(data: Record<string, unknown>, key: string, max: number): string {
  const value = data[key];
  if (value == null) return '';
  if (typeof value !== 'string' || value.trim().length > max) {
    throw new HttpsError('invalid-argument', `${key} must be at most ${max} characters.`);
  }
  return value.trim();
}

function requiredBoolean(data: Record<string, unknown>, key: string): boolean {
  const value = data[key];
  if (typeof value !== 'boolean') {
    throw new HttpsError('invalid-argument', `${key} is required and must be true or false.`);
  }
  return value;
}

export function parseCollectionContributionInput(
  raw: unknown,
  uid = '',
): CollectionContributionInput {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new HttpsError('invalid-argument', 'Contribution details are required.');
  }
  const data = raw as Record<string, unknown>;
  const kind = data.collectionKind;
  if (typeof kind !== 'string' || !(COLLECTION_KINDS as readonly string[]).includes(kind)) {
    throw new HttpsError(
      'invalid-argument',
      `collectionKind must be one of: ${COLLECTION_KINDS.join(', ')}.`,
    );
  }
  if (data.rightsConfirmed !== true) {
    throw new HttpsError('failed-precondition', 'Permission to share this work for community review is required.');
  }
  if (typeof data.publicationPermission !== 'boolean') {
    throw new HttpsError('invalid-argument', 'Choose whether approved work may be published.');
  }
  // Optional now: a form that never puts the question sends null rather than
  // a manufactured "no".
  const involvesMinors =
    data.involvesMinors == null ? null : requiredBoolean(data, 'involvesMinors');
  const usesThirdPartyMaterial = requiredBoolean(data, 'usesThirdPartyMaterial');
  const participantConsentConfirmed = requiredBoolean(data, 'participantConsentConfirmed');
  if (!participantConsentConfirmed) {
    throw new HttpsError(
      'failed-precondition',
      'Participant consent must be confirmed before community review.',
    );
  }

  const mediaUrl = optionalText(data, 'mediaUrl', 2000);
  if (mediaUrl) {
    let url: URL;
    try {
      url = new URL(mediaUrl);
    } catch {
      throw new HttpsError('invalid-argument', 'mediaUrl must be a complete web address.');
    }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      throw new HttpsError('invalid-argument', 'mediaUrl must use http or https.');
    }
  }

  const relatedEntryId = optionalText(data, 'relatedEntryId', 200) || null;
  const media = parseContributionMedia(data.media, uid);
  const cover = parseContributionCover(data.cover, uid);
  // A song, a narration or a film *is* its recording. Accepting one without
  // the file would put an empty item in the review queue that nobody can
  // assess.
  if (!media && !mediaUrl && (kind === 'music' || kind === 'audiobooks' || kind === 'video')) {
    throw new HttpsError('failed-precondition', 'Upload the recording before submitting.');
  }

  const body = requiredText(data, 'body', 12_000);
  // Back-compatibility, and the only reason this is conditional: an older
  // client sends no `translations` at all. For a dictionary word the typed body
  // *is* the list of meanings, so reading it through the same parser turns
  // "water, rain" into two translations instead of one headword nobody can
  // search for. For a song the body is lyrics, and splitting lyrics on commas
  // would be vandalism — so every other kind gets an empty list unless the
  // client asked for one explicitly.
  const translations = data.translations != null
    ? normaliseTranslations(data.translations)
    : (kind === 'dictionary' ? normaliseTranslations(body) : []);

  return {
    collectionKind: kind as CollectionKind,
    lexicalKind: canonicalLexicalKind(data.lexicalKind),
    title: requiredText(data, 'title', 180),
    body,
    translations,
    format: requiredText(data, 'format', 80),
    dialect: requiredText(data, 'dialect', 80),
    source: requiredText(data, 'source', 1200),
    mediaUrl,
    media,
    cover,
    notes: optionalText(data, 'notes', 4000),
    relatedEntryId,
    involvesMinors,
    usesThirdPartyMaterial,
    participantConsentConfirmed,
    kasemExample: optionalText(data, 'kasemExample', 4000),
    englishExample: optionalText(data, 'englishExample', 4000),
    rightsConfirmed: true,
    publicationPermission: data.publicationPermission,
  };
}

function studioTypeFor(kind: CollectionKind): 'writing' | 'audio' | 'translation' | 'video' {
  if (kind === 'music' || kind === 'audiobooks') return 'audio';
  if (kind === 'dictionary') return 'translation';
  if (kind === 'video') return 'video';
  return 'writing';
}

/** Pure canonical Submission projection used by the callable and unit tests. */
export function buildCollectionSubmissionDocument(
  id: string,
  uid: string,
  input: CollectionContributionInput,
  now: string,
): Record<string, unknown> {
  return {
    id,
    authUid: uid,
    campaign: { collection: 'campaigns', id: COLLECTION_CAMPAIGN_ID },
    creator: { collection: 'creatorProfiles', id: uid },
    collectionContribution: { collection: 'collectionContributions', id },
    relatedEntryId: input.relatedEntryId,
    status: 'SUBMITTED',
    studioType: studioTypeFor(input.collectionKind),
    title: input.title,
    category: input.collectionKind,
    collectionKind: input.collectionKind,
    // Carried on the canonical submission, not only on the receipt, because the
    // review desk is where the difference matters: a reviewer assessing a
    // proverb is being asked a different question from one checking a noun, and
    // until now both arrived looking like "a dictionary contribution".
    lexicalKind: input.lexicalKind,
    translations: input.translations,
    format: input.format,
    kasemExample: input.kasemExample,
    englishExample: input.englishExample,
    primaryLanguage: 'xsm',
    dialect: input.dialect,
    // The public mobile details currently render description. Retain body too,
    // so future clients can distinguish an excerpt from the complete work.
    description: input.body,
    body: input.body,
    tags: [input.collectionKind, input.format.toLowerCase()],
    targetAudience: 'Indigen World community library',
    sourceReferences: input.source,
    translationNotes: input.notes,
    englishSummary: input.collectionKind === 'dictionary' ? input.title : '',
    culturalContext: '',
    externalPostUrl: input.mediaUrl || null,
    // Spread rather than a null field: Firestore rejects `undefined`, and a
    // written `media: null` would make a text-only contribution look like one
    // whose upload failed.
    ...(input.media
      ? {
          media: {
            storagePath: input.media.storagePath,
            mimeType: input.media.mimeType,
            sizeBytes: input.media.sizeBytes,
            mediaType: input.media.mediaType,
            // The cover rides in as the recording's thumbnail because that is
            // the field the publication workflow already carries out to the
            // public bucket — it becomes `publishedContent.thumbnailUrl`, which
            // is what the player draws on the Now Playing and lock screens. A
            // cover sent without a recording is dropped here (see
            // contributionCoverPath): there is nothing for it to be the cover
            // of.
            thumbnailPath: contributionCoverPath(input),
            captionsPath: null,
          },
        }
      : {}),
    participants: [],
    disclosures: {
      involvesMinors: input.involvesMinors,
      usesThirdPartyMaterial: input.usesThirdPartyMaterial,
      sourceInfo: input.source,
    },
    attestations: {
      ownsOrHasRights: true,
      participantsConsented: input.participantConsentConfirmed,
      noUnlawfulCopyright: true,
    },
    permissions: {
      review: true,
      publication: input.publicationPermission,
      promotion: false,
      aiTraining: false,
      consentVersion: 'collection-contribution-v1',
      recordedAt: now,
    },
    moderation: {
      reviewer: null,
      decidedAt: null,
      feedback: '',
      revisionDeadline: null,
      scores: {},
      publishedContent: null,
    },
    rewardEligible: false,
    schemaVersion: 1,
    lifecycle: { createdAt: now, updatedAt: now, version: 1 },
  };
}

/**
 * The campaign every Collection contribution hangs off, created on first use.
 *
 * Shared with the word queue for the same reason as the receipt below: two
 * writers bootstrapping the same document with two slightly different sets of
 * fields is a bug that only shows up on an empty project, which is exactly
 * where nobody is looking.
 */
export function buildCollectionCampaignDocument(now: string): Record<string, unknown> {
  return {
    id: COLLECTION_CAMPAIGN_ID,
    slug: COLLECTION_CAMPAIGN_ID,
    title: 'Community Collection contributions',
    initiative: 'Project Kassena',
    description: 'Mobile contributions for Music, Dictionary, Literature, and Audiobooks.',
    brief: 'Community-supplied cultural knowledge reviewed before publication.',
    categories: [...COLLECTION_KINDS],
    eligibility: 'Signed-in community members',
    geographies: [],
    status: 'SUBMISSIONS_OPEN',
    consentRequirements: ['review', 'publication'],
    termsVersion: 'collection-contribution-v1',
    visibility: 'internal',
    schemaVersion: 1,
    lifecycle: { createdAt: now, updatedAt: now, version: 1 },
  };
}

/**
 * The contributor's own copy of what they sent.
 *
 * Extracted from the callable rather than left inline because a second entry
 * point now creates contributions — the guided word queue in word-queue.ts —
 * and a queue answer has to land in the same review desk, with the same shape,
 * as one typed into the open form. The alternative was a parallel writer that
 * happened to agree with this one on the day it was written and would have
 * stopped agreeing the first time a field was added here.
 *
 * Server timestamps are minted inside, so both callers get identical ordering
 * semantics; anything a particular route wants to add (the queue stamps the
 * prompt the member was answering) is spread over the result by that route.
 */
export function buildCollectionContributionReceipt(
  id: string,
  submissionId: string,
  uid: string,
  input: CollectionContributionInput,
): Record<string, unknown> {
  return {
    id,
    submissionId,
    authUid: uid,
    category: input.collectionKind,
    collectionKind: input.collectionKind,
    lexicalKind: input.lexicalKind,
    title: input.title,
    body: input.body,
    translations: input.translations,
    format: input.format,
    dialect: input.dialect,
    source: input.source,
    mediaUrl: input.mediaUrl,
    mediaStoragePath: input.media?.storagePath ?? null,
    mediaType: input.media?.mediaType ?? null,
    // Mirrored so the contributor's own receipt shows the same artwork the
    // reviewer sees, without reading the canonical submission they are not
    // allowed to read.
    coverStoragePath: contributionCoverPath(input),
    notes: input.notes,
    relatedEntryId: input.relatedEntryId,
    involvesMinors: input.involvesMinors,
    usesThirdPartyMaterial: input.usesThirdPartyMaterial,
    participantConsentConfirmed: input.participantConsentConfirmed,
    kasemExample: input.kasemExample,
    englishExample: input.englishExample,
    rightsConfirmed: true,
    publicationPermission: input.publicationPermission,
    status: 'submitted',
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    schemaVersion: 1,
  };
}

/**
 * Accepts one of the four lightweight mobile contributions and atomically
 * creates both its user-visible receipt and a canonical reviewed Submission.
 */
export const submitCollectionContribution = onCall(
  {
    region: REGION,
    enforceAppCheck: ENFORCE_APP_CHECK,
    consumeAppCheckToken: ENFORCE_APP_CHECK,
    invoker: 'public',
  },
  async (req) => {
    const uid = requireAuth(req);
    await consumeRateLimit('submitCollectionContribution', uid, 10);
    const input = parseCollectionContributionInput(req.data, uid);
    const db = getFirestore();
    const contributionRef = db.collection('collectionContributions').doc();
    const submissionRef = db.collection('submissions').doc(contributionRef.id);
    const campaignRef = db.collection('campaigns').doc(COLLECTION_CAMPAIGN_ID);
    const auditRef = db.collection('auditLogs').doc();
    const notificationRef = db.collection('notifications').doc();
    const now = nowIso();

    await db.runTransaction(async (tx) => {
      const campaign = await tx.get(campaignRef);
      if (!campaign.exists) {
        tx.set(campaignRef, buildCollectionCampaignDocument(now));
      }

      tx.set(contributionRef, buildCollectionContributionReceipt(
        contributionRef.id,
        submissionRef.id,
        uid,
        input,
      ));
      tx.set(submissionRef, buildCollectionSubmissionDocument(
        submissionRef.id,
        uid,
        input,
        now,
      ));
      tx.set(notificationRef, {
        id: notificationRef.id,
        recipient: { collection: 'creatorProfiles', id: uid },
        authUid: uid,
        type: 'review_decision',
        title: 'Collection contribution received',
        body: `${input.title} is waiting for community review.`,
        link: '/contribute',
        read: false,
        channels: ['in_app'],
        schemaVersion: 1,
        lifecycle: { createdAt: now, updatedAt: now, version: 1 },
      });
      tx.set(auditRef, {
        id: auditRef.id,
        actor: { collection: 'creatorProfiles', id: uid },
        action: 'collection.contribution.submit',
        target: { collection: 'collectionContributions', id: contributionRef.id },
        outcome: 'success',
        source: 'functions',
        before: null,
        after: { status: 'submitted', submissionId: submissionRef.id },
        metadata: { collectionKind: input.collectionKind },
        occurredAt: now,
      });
    });

    return {
      contributionId: contributionRef.id,
      submissionId: submissionRef.id,
      status: 'SUBMITTED' as const,
    };
  },
);

/**
 * Lets the original contributor withdraw a queued item or revoke a previously
 * granted publication. Queue, canonical submission, public projection, audit,
 * and notification changes commit atomically, so a successful response never
 * leaves public content live after consent has been revoked.
 */
export const withdrawCollectionContribution = onCall(
  {
    region: REGION,
    enforceAppCheck: ENFORCE_APP_CHECK,
    consumeAppCheckToken: ENFORCE_APP_CHECK,
    invoker: 'public',
  },
  async (req) => {
    const uid = requireAuth(req);
    await consumeRateLimit('withdrawCollectionContribution', uid, 30);
    if (!req.data || typeof req.data !== 'object' || Array.isArray(req.data)) {
      throw new HttpsError('invalid-argument', 'contributionId is required.');
    }
    const contributionId = requiredText(
      req.data as Record<string, unknown>,
      'contributionId',
      200,
    );

    const db = getFirestore();
    const contributionRef = db.collection('collectionContributions').doc(contributionId);
    const auditRef = db.collection('auditLogs').doc();
    const notificationRef = db.collection('notifications').doc();

    return db.runTransaction(async (tx) => {
      const contributionSnap = await tx.get(contributionRef);
      if (!contributionSnap.exists) {
        throw new HttpsError('not-found', 'Collection contribution not found.');
      }
      const contribution = contributionSnap.data() as Record<string, any>;
      if (contribution.authUid !== uid) {
        throw new HttpsError('permission-denied', 'Only the contributor can withdraw this work.');
      }
      if (contribution.id != null && contribution.id !== contributionId) {
        throw new HttpsError('failed-precondition', 'Contribution identity is inconsistent.');
      }
      const submissionId = typeof contribution.submissionId === 'string'
        ? contribution.submissionId.trim()
        : '';
      if (!submissionId) {
        throw new HttpsError('failed-precondition', 'Contribution is not linked to a submission.');
      }

      const submissionRef = db.collection('submissions').doc(submissionId);
      const submissionSnap = await tx.get(submissionRef);
      if (!submissionSnap.exists) {
        throw new HttpsError('failed-precondition', 'Linked submission was not found.');
      }
      const submission = submissionSnap.data() as Record<string, any>;
      if (submission.id !== submissionId
        || submission.authUid !== uid
        || submission.collectionContribution?.collection !== 'collectionContributions'
        || submission.collectionContribution?.id !== contributionId) {
        throw new HttpsError('failed-precondition', 'Contribution and submission links are inconsistent.');
      }

      const collectionKind = collectionKindForSubmission(submission);
      if (!collectionKind || contribution.collectionKind !== collectionKind) {
        throw new HttpsError('failed-precondition', 'Contribution collection kind is inconsistent.');
      }
      const publicRef = collectionKind === 'dictionary'
        ? db.collection('dictionaryEntries').doc(`collection_${submissionId}`)
        : db.collection('publishedContent').doc(`pub_${submissionId}`);
      const publicSnap = await tx.get(publicRef);
      if (publicSnap.exists) {
        const publicData = publicSnap.data() as Record<string, any>;
        const ownsPublicTarget = collectionKind === 'dictionary'
          ? publicData.sourceContribution?.collection === 'collectionContributions'
            && publicData.sourceContribution?.id === contributionId
          : publicData.submission?.collection === 'submissions'
            && publicData.submission?.id === submissionId;
        if (!ownsPublicTarget) {
          throw new HttpsError('failed-precondition', 'Publication target is inconsistent.');
        }
      }

      const publicWasLive = publicSnap.exists && (collectionKind === 'dictionary'
        ? publicSnap.get('isPublished') === true
        : publicSnap.get('publicationStatus') === 'published');
      const alreadyWithdrawn = contribution.status === 'withdrawn'
        && submission.status === 'WITHDRAWN'
        && !publicWasLive;
      if (alreadyWithdrawn) {
        return {
          contributionId,
          submissionId,
          previousStatus: 'withdrawn',
          status: 'WITHDRAWN' as const,
          unpublished: false,
          alreadyWithdrawn: true,
        };
      }

      const previousStatus = typeof contribution.status === 'string'
        ? contribution.status
        : String(submission.status ?? 'unknown').toLowerCase();
      const now = nowIso();
      tx.update(contributionRef, {
        status: 'withdrawn',
        publicationPermission: false,
        reviewDecision: 'WITHDRAW',
        withdrawnBy: uid,
        withdrawnAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      tx.update(submissionRef, {
        status: 'WITHDRAWN',
        'permissions.publication': false,
        'moderation.feedback': 'Withdrawn by the contributor.',
        'lifecycle.updatedAt': now,
        'lifecycle.version': FieldValue.increment(1),
      });
      if (publicSnap.exists) {
        if (collectionKind === 'dictionary') {
          tx.update(publicRef, {
            isPublished: false,
            withdrawnAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          });
        } else {
          tx.update(publicRef, {
            publicationStatus: 'unpublished',
            correctionState: 'removed',
            'lifecycle.updatedAt': now,
            'lifecycle.version': FieldValue.increment(1),
          });
        }
      }
      tx.set(notificationRef, {
        id: notificationRef.id,
        recipient: { collection: 'creatorProfiles', id: uid },
        authUid: uid,
        type: 'review_decision',
        title: 'Collection contribution withdrawn',
        body: `“${String(contribution.title ?? submission.title ?? 'Your contribution')}” is no longer available for review or publication.`,
        link: '/contribute',
        read: false,
        channels: ['in_app'],
        schemaVersion: 1,
        lifecycle: { createdAt: now, updatedAt: now, version: 1 },
      });
      tx.set(auditRef, {
        id: auditRef.id,
        actor: { collection: 'creatorProfiles', id: uid },
        action: 'collection.contribution.withdraw',
        target: { collection: 'collectionContributions', id: contributionId },
        outcome: 'success',
        source: 'functions',
        before: { status: previousStatus, publicationLive: publicWasLive },
        after: { status: 'withdrawn', publicationLive: false },
        metadata: {
          submissionId,
          collectionKind,
          publicationTarget: { collection: publicRef.parent.id, id: publicRef.id },
        },
        occurredAt: now,
      });

      return {
        contributionId,
        submissionId,
        previousStatus,
        status: 'WITHDRAWN' as const,
        unpublished: publicWasLive,
        alreadyWithdrawn: false,
      };
    });
  },
);
