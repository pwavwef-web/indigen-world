/**
 * Everyday Kasem expressions: the contribution anybody can make today.
 *
 * A contributor sends one expression — a greeting, a blessing, an idiom, a
 * saying — with the five things a reviewer needs to judge it and a learner
 * needs to use it: the phrase in Kasem, what it means, when it is said, who it
 * came from, and the consent that lets it be shared. A reviewer approves it or
 * says why not, and the contributor can see which of those has happened.
 *
 * ── An expression is not a dictionary word ───────────────────────────────
 * Until this module, expressions were filed as dictionary contributions with
 * `lexicalKind: 'phrase'` and published into `dictionaryEntries`. There the
 * whole phrase became a headword: it was given a `headwordKey`, numbered
 * against homographs, counted in a contributor's accepted *words*, and offered
 * to every dictionary reader beside `bakeira` as though "how was your journey"
 * were one more noun. None of that is true of an expression, and the parts that
 * make an expression worth having — the situation it is said in, who says it
 * to whom, where it came from — had nowhere to live on a dictionary row.
 *
 * So an expression is its own kind, `collectionKind: 'expressions'`, reviewed
 * through the same desk as everything else and published into
 * `expressionEntries` (see `publicationDestinationFor`). It is never split,
 * never numbered, never counted as a word.
 *
 * ── Why this does not go through `submitCollectionContribution` ──────────
 * That callable's parser treats context as optional and the source as a single
 * free-text line, which is right for a song and wrong here: an expression
 * without its context is a phrase nobody can use, and one without a source is
 * one nobody can check. This module asks for both, records the source as
 * structured fields, and fixes the consent wording per kind of source so the
 * record says exactly what the contributor agreed to. The documents it writes
 * are built by the shared builders, so the review desk, withdrawal and the
 * contributor's receipt all see the same shape as every other contribution.
 */
import { getFirestore } from 'firebase-admin/firestore';
import { submissionRetry, checkSubmissionRetry } from './submission-retry.js';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { requireAuth } from './auth.js';
import { consumeRateLimit } from './rate-limit.js';
import {
  COLLECTION_CAMPAIGN_ID,
  buildCollectionCampaignDocument,
  buildCollectionContributionReceipt,
  buildCollectionSubmissionDocument,
  type CollectionContributionInput,
} from './collection-contributions.js';
import { NO_FORMS } from './kasem-morphology.js';
import { expressionEntryId } from './publication.js';

const REGION = 'us-central1';
const ENFORCE_APP_CHECK = process.env.ENFORCE_APP_CHECK === 'true';

type JsonRecord = Record<string, any>;

/** What kind of expression it is. The ids are the pipeline's lexical kinds. */
export const EXPRESSION_KINDS = ['phrase', 'idiom', 'proverb'] as const;
export type ExpressionKind = (typeof EXPRESSION_KINDS)[number];

export const EXPRESSION_KIND_LABELS: Record<ExpressionKind, string> = {
  phrase: 'Everyday phrase or greeting',
  idiom: 'Idiom',
  proverb: 'Proverb or saying',
};

/**
 * Who the contributor learned the expression from.
 *
 * `invited-speaker` is never accepted from a client: it is what the invited
 * contributor workspace records for its own translations, where the speaker
 * is the contributor and the assignment is the source.
 */
export const EXPRESSION_SOURCE_TYPES = [
  'self',
  'family',
  'elder',
  'community',
  'written',
  'recording',
] as const;
export type ExpressionSourceType = (typeof EXPRESSION_SOURCE_TYPES)[number] | 'invited-speaker';

export const EXPRESSION_SOURCE_LABELS: Record<ExpressionSourceType, string> = {
  self: 'I say it myself',
  family: 'A family member',
  elder: 'An elder or knowledge holder',
  community: 'Someone in my community',
  written: 'A book or written source',
  recording: 'A recording or broadcast',
  'invited-speaker': 'Invited Kasem speaker',
};

/**
 * What the contributor confirms about the source, fixed per kind of source.
 *
 * Held here rather than sent by the client so the stored statement is the one
 * the server showed, word for word, and cannot be edited on the way in. The
 * TribeStudio form renders the same sentences.
 */
export const EXPRESSION_SOURCE_CONSENT: Record<ExpressionSourceType, string> = {
  self: 'It is my own everyday Kasem, and I am free to share it.',
  family: 'The person I learned it from agreed that I may share it.',
  elder: 'The person I learned it from agreed that I may share it.',
  community: 'The person I learned it from agreed that I may share it.',
  written: 'I have named the source, and I am sharing a short expression from it, not a longer passage.',
  recording: 'I have named the source, and I am sharing a short expression from it, not a longer passage.',
  'invited-speaker': 'Translated by an invited Kasem speaker for an assigned set.',
};

/** Confirmed on every expression, whatever its source. */
export const EXPRESSION_EVERYDAY_STATEMENT =
  'It is an everyday expression — nothing sacred, secret, private or restricted.';

export const EXPRESSION_CONSENT_VERSION = 'expression-campaign-v1';

/** Where an invited contributor's translation came from, as readers are told. */
export const INVITED_SOURCE_DETAIL = 'From an assigned set of everyday expressions';

export const MAX_PHRASE_LENGTH = 300;
export const MAX_MEANING_LENGTH = 1000;
export const MAX_LITERAL_LENGTH = 1000;
export const MAX_CONTEXT_LENGTH = 1500;
export const MAX_SOURCE_DETAIL_LENGTH = 600;
export const MAX_SPEAKER_NAME_LENGTH = 120;
export const MAX_DIALECT_LENGTH = 80;
export const MAX_ALTERNATIVES = 12;

/** One expression, as the contributor described it. */
export interface ExpressionRecord {
  phrase: string;
  alternatives: string[];
  meaning: string;
  literalTranslation: string;
  context: string;
  kind: ExpressionKind;
  dialect: string;
  source: { type: ExpressionSourceType; detail: string; speakerName: string };
}

/** What `submitExpression` accepts, after validation. */
export interface ExpressionContribution {
  expression: ExpressionRecord;
  publicationPermission: boolean;
  aiTraining: boolean;
  /** The declined expression of theirs this one corrects, if any. */
  revisionOf: string | null;
}

function field(data: JsonRecord, key: string, max: number, missing: string, tooLong: string): string {
  const value = data[key];
  if (typeof value !== 'string' || !value.trim()) throw new HttpsError('invalid-argument', missing);
  const trimmed = value.trim();
  if (trimmed.length > max) throw new HttpsError('invalid-argument', tooLong);
  return trimmed;
}

function optionalField(data: JsonRecord, key: string, max: number, tooLong: string): string {
  const value = data[key];
  if (value == null) return '';
  if (typeof value !== 'string') throw new HttpsError('invalid-argument', tooLong);
  const trimmed = value.trim();
  if (trimmed.length > max) throw new HttpsError('invalid-argument', tooLong);
  return trimmed;
}

function sameText(a: string, b: string): boolean {
  return a.toLocaleLowerCase().replace(/\s+/g, ' ') === b.toLocaleLowerCase().replace(/\s+/g, ' ');
}

/**
 * Validates one expression from the open campaign.
 *
 * Every refusal says what to do in the contributor's terms rather than naming
 * a field, because the person reading it is at a form, not in a debugger.
 */
export function parseExpressionContribution(raw: unknown): ExpressionContribution {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new HttpsError('invalid-argument', 'The expression details are missing.');
  }
  const data = raw as JsonRecord;
  if (data.culturalPermissionTier != null && data.culturalPermissionTier !== 'public') {
    throw new HttpsError(
      'failed-precondition',
      'Only everyday, public expressions can be shared here. Do not send sacred, secret or restricted knowledge.',
    );
  }

  const phrase = field(data, 'phrase', MAX_PHRASE_LENGTH,
    'Write the expression in Kasem.',
    `Keep the expression under ${MAX_PHRASE_LENGTH} characters. Longer stories belong in Literature.`);
  const meaning = field(data, 'meaning', MAX_MEANING_LENGTH,
    'Say what the expression means in English.',
    `Keep the meaning under ${MAX_MEANING_LENGTH} characters.`);
  if (sameText(phrase, meaning)) {
    throw new HttpsError(
      'invalid-argument',
      'The expression and its meaning are the same text. Write the expression in Kasem and its meaning in English.',
    );
  }
  const context = field(data, 'context', MAX_CONTEXT_LENGTH,
    'Say when the expression is used — who says it, to whom, or on what occasion.',
    `Keep the context under ${MAX_CONTEXT_LENGTH} characters.`);
  const literalTranslation = optionalField(data, 'literalTranslation', MAX_LITERAL_LENGTH,
    `Keep the word-for-word reading under ${MAX_LITERAL_LENGTH} characters.`);
  const dialect = field(data, 'dialect', MAX_DIALECT_LENGTH,
    'Choose the dialect, or “Not sure”.', 'Choose one of the listed dialects.');

  const kind = typeof data.expressionKind === 'string' ? data.expressionKind : 'phrase';
  if (!(EXPRESSION_KINDS as readonly string[]).includes(kind)) {
    throw new HttpsError('invalid-argument', 'Choose what kind of expression it is.');
  }

  const sourceType = data.sourceType;
  if (typeof sourceType !== 'string' || !(EXPRESSION_SOURCE_TYPES as readonly string[]).includes(sourceType)) {
    throw new HttpsError('invalid-argument', 'Choose who you learned the expression from.');
  }
  const sourceDetail = field(data, 'sourceDetail', MAX_SOURCE_DETAIL_LENGTH,
    'Say where you heard or learned the expression.',
    `Keep where you learned it under ${MAX_SOURCE_DETAIL_LENGTH} characters.`);
  const speakerName = optionalField(data, 'speakerName', MAX_SPEAKER_NAME_LENGTH,
    `Keep the speaker's name under ${MAX_SPEAKER_NAME_LENGTH} characters.`);

  if (data.speakerConsent !== true) {
    throw new HttpsError(
      'failed-precondition',
      `Confirm the source: ${EXPRESSION_SOURCE_CONSENT[sourceType as ExpressionSourceType]}`,
    );
  }
  if (data.everydayConfirmed !== true) {
    throw new HttpsError('failed-precondition', `Confirm: ${EXPRESSION_EVERYDAY_STATEMENT}`);
  }
  if (typeof data.publicationPermission !== 'boolean') {
    throw new HttpsError('invalid-argument', 'Choose whether the expression may be published after review.');
  }

  let revisionOf: string | null = null;
  if (data.revisionOf != null && data.revisionOf !== '') {
    if (typeof data.revisionOf !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(data.revisionOf)) {
      throw new HttpsError('invalid-argument', 'The expression being corrected is not recognised.');
    }
    revisionOf = data.revisionOf;
  }

  return {
    expression: {
      phrase,
      alternatives: [],
      meaning,
      literalTranslation,
      context,
      kind: kind as ExpressionKind,
      dialect,
      source: { type: sourceType as ExpressionSourceType, detail: sourceDetail, speakerName },
    },
    publicationPermission: data.publicationPermission,
    // Opt-in only. Anything but an explicit true is a no.
    aiTraining: data.aiTraining === true,
    revisionOf,
  };
}

/** The source as one reviewer-readable line, for the fields that hold one. */
export function expressionSourceLine(source: ExpressionRecord['source']): string {
  const speaker = source.speakerName ? ` (speaker: ${source.speakerName})` : '';
  return `${EXPRESSION_SOURCE_LABELS[source.type]}: ${source.detail}${speaker}`.slice(0, 1200);
}

/**
 * The expression as it is stored on the receipt and the canonical submission.
 *
 * Unanswered optional fields leave no key, for the reason given throughout
 * `collection-contributions.ts`: an empty string reads as a question answered
 * with nothing.
 */
export function storableExpression(expression: ExpressionRecord): JsonRecord {
  return {
    phrase: expression.phrase,
    ...(expression.alternatives.length > 0 ? { alternatives: expression.alternatives } : {}),
    meaning: expression.meaning,
    ...(expression.literalTranslation ? { literalTranslation: expression.literalTranslation } : {}),
    ...(expression.context ? { context: expression.context } : {}),
    kind: expression.kind,
    dialect: expression.dialect,
    source: {
      type: expression.source.type,
      detail: expression.source.detail,
      ...(expression.source.speakerName ? { speakerName: expression.source.speakerName } : {}),
    },
    consent: {
      source: EXPRESSION_SOURCE_CONSENT[expression.source.type],
      everyday: EXPRESSION_EVERYDAY_STATEMENT,
    },
  };
}

/**
 * The shared pipeline's input for an expression.
 *
 * `title` is the English and `body` the Kasem, the direction the whole review
 * pipeline reads a lexical contribution in. Everything that belongs to words
 * alone — forms, senses, IPA — is empty by construction.
 */
export function collectionInputForExpression(
  expression: ExpressionRecord,
  publicationPermission: boolean,
): CollectionContributionInput {
  return {
    collectionKind: 'expressions',
    lexicalKind: expression.kind,
    title: expression.meaning,
    body: expression.phrase,
    translations: [expression.phrase, ...expression.alternatives],
    format: EXPRESSION_KIND_LABELS[expression.kind],
    dialect: expression.dialect,
    source: expressionSourceLine(expression.source),
    literalTranslation: expression.literalTranslation,
    usageContext: expression.context,
    frenchTranslation: '',
    mediaUrl: '',
    media: null,
    cover: null,
    notes: '',
    relatedEntryId: null,
    // Nobody is filmed or photographed, so the question is not put.
    involvesMinors: null,
    usesThirdPartyMaterial:
      expression.source.type === 'written' || expression.source.type === 'recording',
    participantConsentConfirmed: true,
    kasemExample: '',
    englishExample: '',
    forms: NO_FORMS,
    ipa: '',
    kasemDefinition: '',
    etymology: '',
    alsoUsedAs: [],
    senses: [],
    rightsConfirmed: true,
    publicationPermission,
  };
}

/** The canonical submission a reviewer reads. */
export function buildExpressionSubmissionDocument(
  id: string,
  uid: string,
  contribution: ExpressionContribution,
  now: string,
  consentVersion = EXPRESSION_CONSENT_VERSION,
): JsonRecord {
  const input = collectionInputForExpression(contribution.expression, contribution.publicationPermission);
  const base = buildCollectionSubmissionDocument(id, uid, input, now);
  return {
    ...base,
    expression: storableExpression(contribution.expression),
    permissions: {
      ...(base.permissions as JsonRecord),
      aiTraining: contribution.aiTraining,
      consentVersion,
    },
    ...(contribution.revisionOf ? { revisionOf: contribution.revisionOf } : {}),
  };
}

/** The contributor's own copy, which is what their status list reads. */
export function buildExpressionReceipt(
  id: string,
  uid: string,
  contribution: ExpressionContribution,
): JsonRecord {
  const input = collectionInputForExpression(contribution.expression, contribution.publicationPermission);
  return {
    ...buildCollectionContributionReceipt(id, id, uid, input),
    expression: storableExpression(contribution.expression),
    aiTraining: contribution.aiTraining,
    ...(contribution.revisionOf ? { revisionOf: contribution.revisionOf } : {}),
  };
}

function text(value: unknown, max = 2000): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function textList(value: unknown, max: number): string[] {
  return Array.isArray(value)
    ? value.map((item) => text(item)).filter((item) => item.length > 0).slice(0, max)
    : [];
}

/**
 * The expression a submission carries.
 *
 * New submissions hold it in `expression`. An invited contributor's
 * translation filed before that field existed is read from the fields it did
 * have: the English prompt in `title`, the Kasem in `body`, the other ways of
 * saying it in `alternativeExpressions` and the usage note in `usageContext`.
 */
export function expressionFromSubmission(submission: JsonRecord): ExpressionRecord {
  const stored = submission.expression && typeof submission.expression === 'object'
    ? submission.expression as JsonRecord
    : null;
  const source = stored?.source && typeof stored.source === 'object' ? stored.source as JsonRecord : null;
  const kind = text(stored?.kind ?? submission.lexicalKind);
  const sourceType = text(source?.type);
  return {
    phrase: text(stored?.phrase, MAX_PHRASE_LENGTH) || text(submission.body, 2000),
    alternatives: textList(stored?.alternatives ?? submission.alternativeExpressions, MAX_ALTERNATIVES)
      .filter((alternative) => alternative !== text(stored?.phrase ?? submission.body)),
    meaning: text(stored?.meaning) || text(submission.title),
    literalTranslation: text(stored?.literalTranslation ?? submission.literalTranslation),
    context: text(stored?.context ?? submission.usageContext, MAX_CONTEXT_LENGTH),
    kind: (EXPRESSION_KINDS as readonly string[]).includes(kind) ? kind as ExpressionKind : 'phrase',
    dialect: text(stored?.dialect ?? submission.dialect, MAX_DIALECT_LENGTH),
    source: {
      type: sourceType in EXPRESSION_SOURCE_LABELS ? sourceType as ExpressionSourceType : 'invited-speaker',
      detail: text(source?.detail, MAX_SOURCE_DETAIL_LENGTH)
        || (submission.contributorPortal ? INVITED_SOURCE_DETAIL : '')
        || text(submission.sourceReferences, MAX_SOURCE_DETAIL_LENGTH)
        || EXPRESSION_SOURCE_LABELS['invited-speaker'],
      speakerName: text(source?.speakerName, MAX_SPEAKER_NAME_LENGTH),
    },
  };
}

/**
 * The name an expression is publicly credited to.
 *
 * A studio profile made for an account with no display name is named after
 * its e-mail address, and a public credit must never publish one. Such an
 * account is credited generically until its owner sets a name.
 */
export function publicCreditName(displayName: string): string {
  const name = displayName.trim();
  return !name || name.includes('@') ? 'Indigen World contributor' : name;
}

export interface ExpressionEntryInput {
  submissionId: string;
  contributionId: string;
  submission: JsonRecord;
  existing: JsonRecord | null;
  creatorId: string;
  displayName: string;
  approvedBy: string;
  now: string;
}

/**
 * The public record of an approved expression, in `expressionEntries`.
 *
 * Public fields only. The contributor is credited by display name; the
 * speaker is named only where the contributor gave a name, which the form
 * says will be shown. No contact detail, internal note or consent wording
 * leaves the submission.
 *
 * A re-publish keeps the first publication date and creation time, the same
 * way `buildPublishedContentDocument` does.
 */
export function buildExpressionEntryDocument(input: ExpressionEntryInput): JsonRecord {
  const expression = expressionFromSubmission(input.submission);
  const existing = input.existing ?? null;
  const credit = publicCreditName(input.displayName);
  return {
    id: expressionEntryId(input.submissionId),
    language: text(input.submission.primaryLanguage) || 'xsm',
    dialect: expression.dialect,
    phrase: expression.phrase,
    ...(expression.alternatives.length > 0 ? { alternatives: expression.alternatives } : {}),
    meaning: expression.meaning,
    ...(expression.literalTranslation ? { literalTranslation: expression.literalTranslation } : {}),
    ...(expression.context ? { context: expression.context } : {}),
    expressionKind: expression.kind,
    source: {
      type: expression.source.type,
      detail: expression.source.detail,
      ...(expression.source.speakerName ? { speakerName: expression.source.speakerName } : {}),
    },
    contributor: { id: input.creatorId, displayName: credit },
    licenceDisplay: `© ${credit} · Published with permission by Indigen World`,
    authenticationStatus: 'reviewed',
    sourceContribution: { collection: 'collectionContributions', id: input.contributionId },
    submission: { collection: 'submissions', id: input.submissionId },
    isPublished: true,
    publishedAt: text(existing?.publishedAt) || input.now,
    approvedBy: input.approvedBy,
    createdAt: text(existing?.createdAt) || input.now,
    updatedAt: input.now,
    schemaVersion: 1,
  };
}

/** Where a signed-in contributor follows their expressions in TribeStudio. */
export const EXPRESSIONS_STUDIO_LINK = '/studio/expressions';

/**
 * Sends one expression for review.
 *
 * Creates the contributor's receipt, the canonical submission, an in-app
 * notice and an audit row in one transaction, exactly as a Collection
 * contribution does, so a success means the expression is in the review queue
 * and the contributor can already see it there.
 */
export const submitExpression = onCall(
  {
    region: REGION,
    enforceAppCheck: ENFORCE_APP_CHECK,
    consumeAppCheckToken: ENFORCE_APP_CHECK,
    invoker: 'public',
  },
  async (req) => {
    const uid = requireAuth(req);
    await consumeRateLimit('submitExpression', uid, 20);
    const contribution = parseExpressionContribution(req.data);
    const db = getFirestore();
    const retry = submissionRetry(uid, 'expression', req.data?.requestId, contribution);
    const contributionRef = retry ? db.collection('collectionContributions').doc(retry.id) : db.collection('collectionContributions').doc();
    const submissionRef = db.collection('submissions').doc(contributionRef.id);
    const campaignRef = db.collection('campaigns').doc(COLLECTION_CAMPAIGN_ID);
    const notificationRef = db.collection('notifications').doc();
    const auditRef = db.collection('auditLogs').doc();
    const now = new Date().toISOString();
    const { phrase } = contribution.expression;

    await db.runTransaction(async (tx) => {
      if (retry && checkSubmissionRetry((await tx.get(contributionRef)).data(), uid, retry.hash)) return;
      const campaign = await tx.get(campaignRef);
      const previousRef = contribution.revisionOf
        ? db.collection('collectionContributions').doc(contribution.revisionOf)
        : null;
      if (previousRef) {
        const previous = await tx.get(previousRef);
        if (!previous.exists
          || previous.get('authUid') !== uid
          || previous.get('collectionKind') !== 'expressions'
          || previous.get('status') !== 'rejected') {
          throw new HttpsError(
            'failed-precondition',
            'Only an expression of yours that was not accepted can be corrected and sent again.',
          );
        }
        // One correction per declined expression, so the review queue never
        // holds two competing fixes of the same thing.
        if (previous.get('correctedBy')) {
          throw new HttpsError(
            'failed-precondition',
            'This expression has already been corrected and sent again. Follow the correction instead.',
          );
        }
        tx.update(previousRef, { correctedBy: contributionRef.id });
      }
      if (!campaign.exists) tx.set(campaignRef, buildCollectionCampaignDocument(now));
      tx.set(contributionRef, { ...buildExpressionReceipt(contributionRef.id, uid, contribution), ...(retry ? { submissionRequestHash: retry.hash } : {}) });
      tx.set(submissionRef, buildExpressionSubmissionDocument(submissionRef.id, uid, contribution, now));
      tx.set(notificationRef, {
        id: notificationRef.id,
        recipient: { collection: 'creatorProfiles', id: uid },
        authUid: uid,
        type: 'review_decision',
        title: 'Expression received',
        body: `“${phrase}” is waiting for a reviewer. Only you and the review team can see it until it is approved.`,
        link: EXPRESSIONS_STUDIO_LINK,
        read: false,
        channels: ['in_app'],
        schemaVersion: 1,
        lifecycle: { createdAt: now, updatedAt: now, version: 1 },
      });
      tx.set(auditRef, {
        id: auditRef.id,
        actor: { collection: 'creatorProfiles', id: uid },
        action: 'expression.submit',
        target: { collection: 'collectionContributions', id: contributionRef.id },
        outcome: 'success',
        source: 'functions',
        before: null,
        after: { status: 'submitted', submissionId: submissionRef.id },
        metadata: {
          collectionKind: 'expressions',
          expressionKind: contribution.expression.kind,
          sourceType: contribution.expression.source.type,
          ...(contribution.revisionOf ? { revisionOf: contribution.revisionOf } : {}),
        },
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
