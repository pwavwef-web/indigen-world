import {
  FieldValue,
  getFirestore,
  type DocumentSnapshot,
  type Firestore,
  type Query,
} from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
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
import {
  canonicalPartOfSpeech,
  parseTranslations,
  partOfSpeechLabel,
} from './lexical-kinds.js';

/**
 * The guided word queue.
 *
 * `wordQueue` is fifteen thousand English words in frequency order, each with an
 * example sentence, waiting for somebody to say what they are in Kasem. It
 * exists because the open contribution form asks a question almost nobody can
 * answer on demand — "what would you like to add to the dictionary?" — and a
 * blank box in front of a volunteer produces a blank dictionary. A word with a
 * sentence under it produces an answer in about fifteen seconds.
 *
 * Three callables and one trigger:
 *
 *   nextQueueWords         hands a member a batch they have not already dealt
 *                          with, in frequency order.
 *   skipQueueWord          the pressure valve. Cheap, unjudged, and the reason
 *                          the flow is tolerable for more than five minutes.
 *   submitWordTranslation  an answer, which becomes an ordinary Collection
 *                          contribution in the ordinary review desk.
 *   onWordQueueContributionWritten
 *                          moves the row's counters when the review desk moves
 *                          the contribution, in either direction.
 *
 * ── Why a queue answer is not its own kind of record ──────────────────────
 * The tempting shortcut was a `wordTranslations` collection with its own little
 * review screen. It would have been quicker and it would have been a second
 * review desk to staff, a second publication path to keep in step with
 * consent withdrawal, and a second set of rules to get wrong. So a queue answer
 * is built with `buildCollectionSubmissionDocument` and
 * `buildCollectionContributionReceipt` — the exact functions the open form
 * uses — and arrives in the exact same place, carrying the prompt it was
 * answering so a reviewer can see the question as well as the answer.
 */

const REGION = 'us-central1';
const ENFORCE_APP_CHECK = process.env.ENFORCE_APP_CHECK === 'true';

const CALLABLE_OPTIONS = {
  region: REGION,
  enforceAppCheck: ENFORCE_APP_CHECK,
  consumeAppCheckToken: ENFORCE_APP_CHECK,
  invoker: 'public' as const,
};

export const WORD_QUEUE_COLLECTION = 'wordQueue';
export const WORD_QUEUE_PROGRESS_COLLECTION = 'wordQueueProgress';

/**
 * The ledger that makes the approval trigger idempotent.
 *
 * One document per contribution, holding the last counter state this backend
 * applied for it. See `applyQueueOutcome` for why the state does not live on
 * the contribution itself.
 */
export const WORD_QUEUE_CLAIM_COLLECTION = 'wordQueueClaims';

export const DEFAULT_QUEUE_BATCH = 20;
export const MAX_QUEUE_BATCH = 50;

/**
 * How many ids one member's progress document may carry per list.
 *
 * Two thousand answered and two thousand skipped is roughly forty times what
 * the most prolific contributor on the platform has produced in a year, and at
 * an average id length of about a dozen characters the pair costs well under
 * 100 KB — comfortably inside Firestore's 1 MB per-document ceiling with room
 * for the ceiling to be approached from the other direction (a future field, a
 * longer id scheme) without anything breaking.
 *
 * At the cap the OLDEST ids are dropped. That is the right end to lose: a word
 * somebody skipped eighteen months and two thousand words ago is a word they
 * may well know by now, and re-offering it is a small kindness rather than a
 * bug. Losing the newest instead would re-offer whatever they just skipped,
 * which is the one thing the list exists to prevent.
 */
export const MAX_PROGRESS_IDS = 2000;

/**
 * The most queue rows one `nextQueueWords` call will read.
 *
 * A member who has skipped a thousand of the commonest words has to be paged
 * past them, and the query cannot express "not in this list" — Firestore's
 * `not-in` caps at ten values. So the filtering is done here, over a bounded
 * scan, and a member who exhausts it gets a short batch rather than a slow one.
 * Six hundred reads is the ceiling for the worst case; the common case is one
 * page of eighty.
 */
const MAX_QUEUE_SCAN = 600;

type JsonRecord = Record<string, any>;

function nowIso(): string {
  return new Date().toISOString();
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function count(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : 0;
}

function asRecord(raw: unknown, message: string): JsonRecord {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new HttpsError('invalid-argument', message);
  }
  return raw as JsonRecord;
}

function requiredId(value: unknown, field: string): string {
  const id = text(value);
  if (!id || id.length > 200 || id.includes('/')) {
    throw new HttpsError('invalid-argument', `${field} is required.`);
  }
  return id;
}

function optionalText(value: unknown, field: string, max: number): string {
  if (value == null) return '';
  if (typeof value !== 'string' || value.trim().length > max) {
    throw new HttpsError('invalid-argument', `${field} must be at most ${max} characters.`);
  }
  return value.trim();
}

// ---------------------------------------------------------------------------
// The word, as the phone sees it
// ---------------------------------------------------------------------------

/**
 * The Tatoeba credit a sentence carries, or null where it carries none.
 *
 * The example sentences are Tatoeba under CC BY 2.0 FR, which requires
 * attribution wherever the sentence is shown. That obligation is met by
 * shipping the credit alongside every sentence a member is served, so the
 * client cannot fail to have it — the previous design, "the client knows to go
 * and look it up", is how attribution silently stops happening.
 *
 * Rows seeded with `sentenceSource: 'unattributed'` return null, and null must
 * render as NO credit rather than as a blank or a guessed one. Inventing a
 * contributor for a sentence nobody contributed would be a worse licensing
 * failure than omitting one that was never owed.
 */
export interface QueueWordAttribution {
  readonly tatoebaId: string;
  readonly contributor: string;
  readonly licence: string;
}

export function queueWordAttribution(row: JsonRecord): QueueWordAttribution | null {
  if (text(row.sentenceSource).toLowerCase() !== 'tatoeba') return null;
  const tatoebaId = text(row.tatoebaId) || (
    typeof row.tatoebaId === 'number' ? String(row.tatoebaId) : ''
  );
  if (!tatoebaId) return null;
  return {
    tatoebaId,
    contributor: text(row.tatoebaContributor),
    licence: text(row.licence) || 'CC BY 2.0 FR',
  };
}

export interface QueueWord {
  readonly id: string;
  readonly word: string;
  readonly sentence: string;
  readonly sentenceSource: string;
  readonly attribution: QueueWordAttribution | null;
  readonly tier: string;
  readonly rank: number;
  readonly pendingCount: number;
}

/** Only the fields a member needs to answer the word; counters ride along so the client can grey out a busy one. */
export function projectQueueWord(id: string, row: JsonRecord): QueueWord {
  return {
    id,
    word: text(row.word),
    sentence: text(row.sentence),
    sentenceSource: text(row.sentenceSource) || 'unattributed',
    attribution: queueWordAttribution(row),
    tier: text(row.tier) || 'extended',
    rank: count(row.rank),
    pendingCount: count(row.pendingCount),
  };
}

/**
 * The provenance line stored on the contribution, in prose a reviewer can read.
 *
 * The same licensing rule as `queueWordAttribution`, applied at the other end
 * of the pipeline: an attributed sentence names its Tatoeba id, its contributor
 * and its licence, and an unattributed one says plainly that there is no
 * third-party credit rather than leaving a reader to assume the omission was an
 * oversight.
 */
export function wordQueueSourceLine(row: JsonRecord): string {
  const word = text(row.word) || 'a queued word';
  const attribution = queueWordAttribution(row);
  if (!attribution) {
    return `Answered from the Indigen World word queue (“${word}”). `
      + 'The example sentence carries no third-party credit.';
  }
  const by = attribution.contributor ? ` by ${attribution.contributor}` : '';
  return `Answered from the Indigen World word queue (“${word}”). `
    + `Example sentence #${attribution.tatoebaId}${by} from Tatoeba, ${attribution.licence}.`;
}

/**
 * The prompt, stamped onto the submission so the review desk shows the question.
 *
 * A reviewer looking at "kʋm — water" has no way to judge it without knowing
 * what was asked; with the sentence in front of them they can see whether the
 * member answered the word or the sentence. Attribution fields stay null when
 * the row had none — the same rule as everywhere else in this file.
 */
export function wordQueuePromptStamp(wordId: string, row: JsonRecord): JsonRecord {
  const attribution = queueWordAttribution(row);
  return {
    wordId,
    word: text(row.word),
    sentence: text(row.sentence),
    sentenceSource: text(row.sentenceSource) || 'unattributed',
    tatoebaId: attribution?.tatoebaId ?? null,
    tatoebaContributor: attribution?.contributor || null,
    licence: attribution?.licence ?? null,
    tier: text(row.tier) || 'extended',
    rank: count(row.rank),
  };
}

// ---------------------------------------------------------------------------
// The member's own progress
// ---------------------------------------------------------------------------

export interface QueueProgress {
  readonly answered: readonly string[];
  readonly skipped: readonly string[];
}

/** Defensive read of one progress list: a document written by nobody but us, read as if it were not. */
export function progressIds(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.length > 0)
    : [];
}

/**
 * Appends an id, keeping the list unique and bounded.
 *
 * Already-present ids are left exactly where they are rather than moved to the
 * end. That makes the function idempotent, which is what lets `skipQueueWord`
 * tell a genuine skip from a retry of one — the caller compares the returned
 * length with the one it passed in, and only charges the counter when the list
 * actually grew.
 */
export function appendProgressId(
  ids: readonly string[],
  id: string,
  cap: number = MAX_PROGRESS_IDS,
): string[] {
  if (ids.includes(id)) return [...ids];
  const next = [...ids, id];
  return next.length > cap ? next.slice(next.length - cap) : next;
}

function progressDocument(uid: string, progress: QueueProgress): JsonRecord {
  return {
    uid,
    answered: [...progress.answered],
    skipped: [...progress.skipped],
    updatedAt: FieldValue.serverTimestamp(),
  };
}

async function readProgress(db: Firestore, uid: string): Promise<QueueProgress> {
  const snap = await db.collection(WORD_QUEUE_PROGRESS_COLLECTION).doc(uid).get();
  return {
    answered: progressIds(snap.get('answered')),
    skipped: progressIds(snap.get('skipped')),
  };
}

// ---------------------------------------------------------------------------
// Choosing a batch
// ---------------------------------------------------------------------------

export interface WordQueueRow {
  readonly id: string;
  readonly data: JsonRecord;
}

export interface QueueBatch {
  readonly words: QueueWord[];
  /** How many of the chosen words nobody else is currently working on. */
  readonly freshCount: number;
}

/**
 * Picks the words to hand out, from rows already in rank order.
 *
 * Two rules, and the second is the interesting one:
 *
 *   1. Anything in the member's answered or skipped list is dropped. Doing this
 *      on the server rather than on the phone is the whole point of reading the
 *      progress document here: a member three hundred words in was otherwise
 *      being sent a batch of twenty and shown four, over a connection where
 *      the other sixteen cost real money.
 *
 *   2. Words with `pendingCount > 0` — somebody has answered them and review
 *      has not finished — are DEPRIORITISED, not excluded. Excluding them was
 *      the first design and it is wrong in exactly the case that matters: near
 *      the end of a tier, or on a quiet day with two active contributors, the
 *      queue would go empty while thousands of words sat waiting on a review
 *      backlog nobody was clearing. Two people occasionally translating the
 *      same word is a trivial cost — the reviewer sees two answers and picks,
 *      or approves both as alternates, which is genuinely useful data. A queue
 *      that runs dry is a contributor who closes the app.
 *
 * Rank order survives both rules because the partition is stable, so the fresh
 * words come back in frequency order and the pending ones follow in frequency
 * order behind them.
 */
export function selectQueueBatch(
  rows: readonly WordQueueRow[],
  progress: QueueProgress,
  limit: number,
): QueueBatch {
  const seen = new Set<string>([...progress.answered, ...progress.skipped]);
  const fresh: QueueWord[] = [];
  const pending: QueueWord[] = [];
  for (const row of rows) {
    if (seen.has(row.id)) continue;
    const word = projectQueueWord(row.id, row.data);
    (word.pendingCount > 0 ? pending : fresh).push(word);
  }
  const words = [...fresh, ...pending].slice(0, Math.max(0, limit));
  return {
    words,
    freshCount: Math.min(fresh.length, words.length),
  };
}

export function parseQueueBatchLimit(raw: unknown): number {
  if (raw == null) return DEFAULT_QUEUE_BATCH;
  const record = typeof raw === 'object' && !Array.isArray(raw) ? raw as JsonRecord : {};
  const value = record.limit;
  if (value == null) return DEFAULT_QUEUE_BATCH;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new HttpsError('invalid-argument', 'limit must be a number.');
  }
  return Math.min(MAX_QUEUE_BATCH, Math.max(1, Math.trunc(value)));
}

// ---------------------------------------------------------------------------
// Counters, and the one place that owns them
// ---------------------------------------------------------------------------

/**
 * What a contribution currently means for its word's counters.
 *
 * `none` is the state before this backend has ever counted the contribution,
 * which is not the same as `released`: it is the difference between "we have
 * not looked" and "we looked, and it no longer counts".
 */
export type QueueOutcome = 'none' | 'pending' | 'approved' | 'released';

const OUTCOME_WEIGHT: Readonly<Record<QueueOutcome, { pending: number; approved: number }>> = {
  none: { pending: 0, approved: 0 },
  pending: { pending: 1, approved: 0 },
  approved: { pending: 0, approved: 1 },
  released: { pending: 0, approved: 0 },
};

/**
 * The contribution statuses that map onto each counter state.
 *
 * `needs_revision` is deliberately absent from the pending set even though the
 * work is not finished: a Collection contribution cannot be sent for revision
 * (decideSubmission refuses it), so a row in that state is a legacy artefact
 * and holding a pending count open for it would pin a word out of the queue
 * for ever.
 */
const PENDING_STATUSES = new Set(['submitted', 'resubmitted', 'under_review']);
const APPROVED_STATUSES = new Set(['approved', 'scheduled', 'published']);
const RELEASED_STATUSES = new Set(['rejected', 'archived', 'withdrawn', 'needs_revision']);

/** Null for a status this backend does not recognise — an unknown state is not a reason to move a counter. */
export function queueOutcomeForStatus(status: unknown): QueueOutcome | null {
  const normalised = text(status).toLowerCase();
  if (!normalised) return null;
  if (PENDING_STATUSES.has(normalised)) return 'pending';
  if (APPROVED_STATUSES.has(normalised)) return 'approved';
  if (RELEASED_STATUSES.has(normalised)) return 'released';
  return null;
}

function asOutcome(value: unknown): QueueOutcome {
  const normalised = text(value).toLowerCase();
  return normalised === 'pending' || normalised === 'approved' || normalised === 'released'
    ? normalised
    : 'none';
}

export interface QueueRowState {
  readonly pendingCount: number;
  readonly approvedCount: number;
  readonly status: string;
}

/**
 * The row as it should look after one contribution moves from [from] to [to].
 *
 * Returns null when there is nothing to do, which is the idempotency guarantee:
 * an at-least-once trigger that fires four times for one approval computes a
 * delta on the first and nothing on the other three, because the ledger already
 * says `approved`.
 *
 * Absolute values rather than `FieldValue.increment`, because the caller has
 * read the row inside a transaction anyway and a clamp at zero is worth having.
 * A counter that has drifted negative — and they do drift, through a manual
 * console edit or a re-seed — would otherwise keep a translated word out of
 * `status: 'translated'` permanently.
 *
 * `status` moves to `translated` only on a real approved translation, and back
 * to `open` if the last one is withdrawn: a word whose only answer was rejected
 * is a word nobody has translated. `retired` is never overwritten — that state
 * means a human took the word out of circulation, and no counter should undo
 * that.
 */
export function nextQueueRowState(
  row: JsonRecord,
  from: QueueOutcome,
  to: QueueOutcome,
): QueueRowState | null {
  if (from === to) return null;
  const before = OUTCOME_WEIGHT[from];
  const after = OUTCOME_WEIGHT[to];
  const pendingCount = Math.max(0, count(row.pendingCount) + after.pending - before.pending);
  const approvedCount = Math.max(0, count(row.approvedCount) + after.approved - before.approved);
  const current = text(row.status).toLowerCase() || 'open';
  return {
    pendingCount,
    approvedCount,
    status: current === 'retired' ? 'retired' : (approvedCount > 0 ? 'translated' : 'open'),
  };
}

function claimDocument(contributionId: string, wordId: string, outcome: QueueOutcome): JsonRecord {
  return {
    id: contributionId,
    wordId,
    outcome,
    updatedAt: FieldValue.serverTimestamp(),
  };
}

/**
 * Moves one word's counters to reflect one contribution's current state.
 *
 * ── Why the ledger is a separate collection ──────────────────────────────
 * The obvious place for "what have we already counted for this contribution"
 * is a field on the contribution itself. That was the first design and it is
 * a trap: writing the field back re-fires every trigger watching
 * `collectionContributions`, and this is not the only one — contributor scoring
 * awards points off the same approval event. A self-write here would hand that
 * trigger a second identical approval to score. `wordQueueClaims/{contributionId}`
 * has no triggers on it, so the loop does not exist and neither does the
 * collision.
 */
async function applyQueueOutcome(
  db: Firestore,
  wordId: string,
  contributionId: string,
  outcome: QueueOutcome,
): Promise<QueueRowState | null> {
  const wordRef = db.collection(WORD_QUEUE_COLLECTION).doc(wordId);
  const claimRef = db.collection(WORD_QUEUE_CLAIM_COLLECTION).doc(contributionId);

  return db.runTransaction(async (tx) => {
    const [claimSnap, wordSnap] = await tx.getAll(claimRef, wordRef);
    const from = asOutcome(claimSnap.exists ? claimSnap.get('outcome') : null);
    if (from === outcome) return null;

    // A claim whose word has been deleted still has to be settled, or the
    // ledger goes on asserting a count against a row that no longer exists and
    // a re-seeded word inherits a phantom pending.
    if (!wordSnap.exists) {
      tx.set(claimRef, claimDocument(contributionId, wordId, outcome), { merge: true });
      return null;
    }

    const next = nextQueueRowState(wordSnap.data() ?? {}, from, outcome);
    if (next) {
      tx.update(wordRef, { ...next, updatedAt: FieldValue.serverTimestamp() });
    }
    tx.set(claimRef, claimDocument(contributionId, wordId, outcome), { merge: true });
    return next;
  });
}

// ---------------------------------------------------------------------------
// nextQueueWords
// ---------------------------------------------------------------------------

/**
 * Hands the member the next words they have not dealt with, in frequency order.
 *
 * The serving query is the one the deployed composite index was built for —
 * `where('status','==','open').orderBy('rank')` — because the seed ranks the
 * thousand commonest words 1..1000 and everything else from 1000 up, so rank
 * order *is* frequency order and no second sort field is needed.
 */
export const nextQueueWords = onCall(CALLABLE_OPTIONS, async (req) => {
  const uid = requireAuth(req);
  await consumeRateLimit('nextQueueWords', uid, 60);
  const limit = parseQueueBatchLimit(req.data);

  const db = getFirestore();
  const progress = await readProgress(db, uid);

  const pageSize = Math.min(Math.max(limit * 4, 100), 250);
  const rows: WordQueueRow[] = [];
  let cursor: DocumentSnapshot | null = null;
  let exhausted = false;
  let batch = selectQueueBatch(rows, progress, limit);

  while (batch.freshCount < limit && rows.length < MAX_QUEUE_SCAN) {
    let query: Query = db.collection(WORD_QUEUE_COLLECTION)
      .where('status', '==', 'open')
      .orderBy('rank')
      .limit(pageSize);
    if (cursor) query = query.startAfter(cursor);
    const snap = await query.get();
    if (snap.empty) {
      exhausted = true;
      break;
    }
    cursor = snap.docs[snap.docs.length - 1];
    for (const doc of snap.docs) rows.push({ id: doc.id, data: doc.data() });
    batch = selectQueueBatch(rows, progress, limit);
    if (snap.size < pageSize) {
      exhausted = true;
      break;
    }
  }

  return {
    words: batch.words,
    limit,
    freshCount: batch.freshCount,
    answeredCount: progress.answered.length,
    skippedCount: progress.skipped.length,
    // True only when the scan reached the actual end of the open rows, so the
    // client can say "you have answered everything" rather than "nothing came
    // back, try again" — which are very different messages to a volunteer.
    exhausted: exhausted && batch.words.length === 0,
  };
});

// ---------------------------------------------------------------------------
// skipQueueWord
// ---------------------------------------------------------------------------

const SKIP_REASONS = new Set(['unknown', 'unsure']);

function parseSkipReason(value: unknown): 'unknown' | 'unsure' {
  const reason = text(value).toLowerCase();
  if (!reason) return 'unknown';
  if (!SKIP_REASONS.has(reason)) {
    throw new HttpsError('invalid-argument', 'reason must be unknown or unsure.');
  }
  return reason as 'unknown' | 'unsure';
}

/**
 * "I don't know this one."
 *
 * Skipping is the feature that makes the rest of the flow survivable. A member
 * who cannot skip has to either invent a translation or close the app, and the
 * first of those is worse for the dictionary than the second. So it costs one
 * tap, records nothing that reads as a judgement, and returns nothing the
 * client has to think about.
 *
 * The skip count is real signal though, and the reason is kept in aggregate:
 * a word a hundred people marked `unknown` is a word that may not be in Kasem
 * at all, while a hundred `unsure` marks say the word is known but the sentence
 * is bad. Neither is stored against the member.
 */
export const skipQueueWord = onCall(CALLABLE_OPTIONS, async (req) => {
  const uid = requireAuth(req);
  await consumeRateLimit('skipQueueWord', uid, 180);
  const data = asRecord(req.data, 'wordId is required.');
  const wordId = requiredId(data.wordId, 'wordId');
  const reason = parseSkipReason(data.reason);

  const db = getFirestore();
  const wordRef = db.collection(WORD_QUEUE_COLLECTION).doc(wordId);
  const progressRef = db.collection(WORD_QUEUE_PROGRESS_COLLECTION).doc(uid);

  return db.runTransaction(async (tx) => {
    const [wordSnap, progressSnap] = await tx.getAll(wordRef, progressRef);
    if (!wordSnap.exists) {
      throw new HttpsError('not-found', 'That word is not in the queue.');
    }
    const skipped = progressIds(progressSnap.get('skipped'));
    const nextSkipped = appendProgressId(skipped, wordId);
    // A retry over a bad connection must not charge the counter twice.
    if (nextSkipped.length === skipped.length) {
      return { wordId, skipped: true, alreadySkipped: true };
    }

    tx.update(wordRef, {
      skipCount: FieldValue.increment(1),
      [`skipReasons.${reason}`]: FieldValue.increment(1),
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.set(progressRef, progressDocument(uid, {
      answered: progressIds(progressSnap.get('answered')),
      skipped: nextSkipped,
    }), { merge: true });

    return { wordId, skipped: true, alreadySkipped: false };
  });
});

// ---------------------------------------------------------------------------
// submitWordTranslation
// ---------------------------------------------------------------------------

export interface WordTranslationInput {
  readonly wordId: string;
  readonly translations: string[];
  readonly partOfSpeech: string;
  readonly partOfSpeechLabel: string;
  readonly dialect: string;
  readonly notes: string;
  readonly kasemExample: string;
  readonly englishExample: string;
  readonly publicationPermission: boolean;
}

/** Pure payload validation, so the whole shape can be exercised without Firestore. */
export function parseWordTranslationInput(raw: unknown): WordTranslationInput {
  const data = asRecord(raw, 'A word and its translation are required.');
  const wordId = requiredId(data.wordId, 'wordId');

  if (typeof data.translations !== 'string' && !Array.isArray(data.translations)) {
    throw new HttpsError('invalid-argument', 'translations must be text.');
  }
  const rawTranslations = Array.isArray(data.translations)
    ? data.translations.filter((item): item is string => typeof item === 'string').join(', ')
    : data.translations;
  if (rawTranslations.length > 2000) {
    throw new HttpsError('invalid-argument', 'translations must be at most 2000 characters.');
  }
  const translations = parseTranslations(rawTranslations);
  if (translations.length === 0) {
    throw new HttpsError('invalid-argument', 'Give at least one translation.');
  }

  // Rejected rather than defaulted to `unknown`. The client renders this from
  // PARTS_OF_SPEECH, so an unrecognised id means the client and this backend
  // have drifted apart, and silently storing "unknown" would hide that until
  // somebody noticed a thousand entries with no word class.
  const partOfSpeech = canonicalPartOfSpeech(data.partOfSpeech);
  if (!partOfSpeech) {
    throw new HttpsError('invalid-argument', 'Choose a word class from the list.');
  }

  const dialect = optionalText(data.dialect, 'dialect', 80);
  if (!dialect) {
    throw new HttpsError('invalid-argument', 'dialect is required.');
  }

  return {
    wordId,
    translations,
    partOfSpeech,
    partOfSpeechLabel: partOfSpeechLabel(partOfSpeech),
    dialect,
    notes: optionalText(data.notes, 'notes', 4000),
    kasemExample: optionalText(data.kasemExample, 'kasemExample', 4000),
    englishExample: optionalText(data.englishExample, 'englishExample', 4000),
    // Default true: a member working through a public dictionary backlog is
    // offering the answer to the dictionary, and asking the consent question
    // again on every single word would be theatre rather than choice. A client
    // that wants to withhold it still can, and the review desk honours that —
    // decideSubmission refuses to publish without it.
    publicationPermission: data.publicationPermission !== false,
  };
}

/**
 * A queue answer, expressed as an ordinary Collection contribution.
 *
 * The direction is worth stating plainly because it is easy to get backwards:
 * the queue holds ENGLISH words, so the prompt is English and what the member
 * types is Kasem. That maps onto the existing dictionary shape as
 * `title` = the English word and `body` = the Kasem, which is exactly what the
 * publication branch in creators.ts already reads (`englishText: title`,
 * `kasemText: body`). `body` is the joined list rather than the first
 * translation so a reviewer reads everything the member offered; the split
 * list travels beside it in `translations`.
 */
export function buildWordQueueContributionInput(
  row: JsonRecord,
  input: WordTranslationInput,
): CollectionContributionInput {
  return {
    collectionKind: 'dictionary',
    lexicalKind: 'word',
    title: text(row.word),
    body: input.translations.join(', '),
    translations: input.translations,
    format: input.partOfSpeechLabel,
    dialect: input.dialect,
    source: wordQueueSourceLine(row),
    mediaUrl: '',
    media: null,
    cover: null,
    notes: input.notes,
    relatedEntryId: null,
    // The question is not put, and a manufactured "no" would be a false
    // declaration: nobody features in a word.
    involvesMinors: null,
    usesThirdPartyMaterial: false,
    participantConsentConfirmed: true,
    kasemExample: input.kasemExample,
    englishExample: input.englishExample,
    rightsConfirmed: true,
    publicationPermission: input.publicationPermission,
  };
}

/**
 * Answers one queued word.
 *
 * Everything commits in one transaction: the contribution, its canonical
 * submission, the counter, the member's progress and the idempotency ledger.
 * The ledger entry is written here, at `pending`, rather than being left for
 * the trigger — so `pendingCount` moves the instant the member taps send (the
 * next batch already deprioritises the word), and the trigger's first firing
 * finds the ledger agreeing with the status and does nothing at all.
 */
export const submitWordTranslation = onCall(CALLABLE_OPTIONS, async (req) => {
  const uid = requireAuth(req);
  await consumeRateLimit('submitWordTranslation', uid, 60);
  const input = parseWordTranslationInput(req.data);

  const db = getFirestore();
  const wordRef = db.collection(WORD_QUEUE_COLLECTION).doc(input.wordId);
  const progressRef = db.collection(WORD_QUEUE_PROGRESS_COLLECTION).doc(uid);
  const campaignRef = db.collection('campaigns').doc(COLLECTION_CAMPAIGN_ID);
  const contributionRef = db.collection('collectionContributions').doc();
  const submissionRef = db.collection('submissions').doc(contributionRef.id);
  const claimRef = db.collection(WORD_QUEUE_CLAIM_COLLECTION).doc(contributionRef.id);
  const auditRef = db.collection('auditLogs').doc();
  const notificationRef = db.collection('notifications').doc();
  const now = nowIso();

  return db.runTransaction(async (tx) => {
    const [wordSnap, progressSnap, campaignSnap] = await tx.getAll(
      wordRef,
      progressRef,
      campaignRef,
    );
    if (!wordSnap.exists) {
      throw new HttpsError('not-found', 'That word is not in the queue.');
    }
    const row = wordSnap.data() ?? {};
    const status = text(row.status).toLowerCase() || 'open';
    if (status !== 'open') {
      throw new HttpsError(
        'failed-precondition',
        status === 'retired'
          ? 'That word has been taken out of the queue.'
          : 'That word already has an approved translation.',
      );
    }

    const answered = progressIds(progressSnap.get('answered'));
    const nextAnswered = appendProgressId(answered, input.wordId);
    if (nextAnswered.length === answered.length) {
      throw new HttpsError('already-exists', 'You have already answered this word.');
    }

    if (!campaignSnap.exists) {
      tx.set(campaignRef, buildCollectionCampaignDocument(now));
    }

    const contribution = buildWordQueueContributionInput(row, input);
    const prompt = wordQueuePromptStamp(input.wordId, row);

    tx.set(contributionRef, {
      ...buildCollectionContributionReceipt(
        contributionRef.id,
        submissionRef.id,
        uid,
        contribution,
      ),
      // Top-level rather than only inside `wordQueuePrompt`, because this is
      // the field the approval trigger reads on every write of this document
      // and a nested read costs the same but reads worse.
      wordQueueId: input.wordId,
      wordQueuePrompt: prompt,
      partOfSpeechId: input.partOfSpeech,
    });
    tx.set(submissionRef, {
      ...buildCollectionSubmissionDocument(submissionRef.id, uid, contribution, now),
      wordQueueId: input.wordId,
      wordQueuePrompt: prompt,
      partOfSpeechId: input.partOfSpeech,
    });

    tx.update(wordRef, {
      pendingCount: Math.max(0, count(row.pendingCount) + 1),
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.set(claimRef, claimDocument(contributionRef.id, input.wordId, 'pending'), { merge: true });
    tx.set(progressRef, progressDocument(uid, {
      answered: nextAnswered,
      skipped: progressIds(progressSnap.get('skipped')),
    }), { merge: true });

    tx.set(notificationRef, {
      id: notificationRef.id,
      recipient: { collection: 'creatorProfiles', id: uid },
      authUid: uid,
      type: 'review_decision',
      title: 'Translation received',
      body: `“${contribution.title}” is waiting for community review.`,
      link: '/contribute',
      read: false,
      channels: ['in_app'],
      schemaVersion: 1,
      lifecycle: { createdAt: now, updatedAt: now, version: 1 },
    });
    tx.set(auditRef, {
      id: auditRef.id,
      actor: { collection: 'creatorProfiles', id: uid },
      action: 'wordQueue.translation.submit',
      target: { collection: WORD_QUEUE_COLLECTION, id: input.wordId },
      outcome: 'success',
      source: 'functions',
      before: { status, pendingCount: count(row.pendingCount) },
      after: { status, pendingCount: count(row.pendingCount) + 1 },
      metadata: {
        contributionId: contributionRef.id,
        submissionId: submissionRef.id,
        partOfSpeech: input.partOfSpeech,
        translationCount: input.translations.length,
      },
      occurredAt: now,
    });

    return {
      wordId: input.wordId,
      contributionId: contributionRef.id,
      submissionId: submissionRef.id,
      translations: input.translations,
      status: 'SUBMITTED' as const,
    };
  });
});

// ---------------------------------------------------------------------------
// Closing the loop
// ---------------------------------------------------------------------------

/**
 * Keeps a queued word's counters in step with its contribution's review state.
 *
 * ── Why a trigger and not a line in decideSubmission ──────────────────────
 * Approval is not the only thing that has to move these counters. A rejection,
 * an archive and a contributor's own withdrawal all release the word back to
 * the queue, and those happen in three different functions — `decideSubmission`
 * and `withdrawCollectionContribution` today, and whatever is written next.
 * Putting the counter move inline meant remembering it in every one of them,
 * and the failure mode of forgetting is silent: the word simply never comes
 * back, and nobody finds out because a word that is not offered is a word
 * nobody misses.
 *
 * Watching the contribution's status instead means every route through the
 * review desk is covered by construction, including routes that do not exist
 * yet.
 *
 * ── Which document path, and why it matters right now ─────────────────────
 * This watches `collectionContributions`, NOT `submissions`. Contributor
 * scoring is being built against the same approval event, and `submissions`
 * already carries `onSubmissionWritten` for open publishing — so the quieter
 * path is the one to take. Anything this writes goes to `wordQueue` and
 * `wordQueueClaims` and nowhere else; it never touches contributor points and
 * never writes back to the document that triggered it.
 */
export const onWordQueueContributionWritten = onDocumentWritten(
  { document: 'collectionContributions/{contributionId}', region: REGION },
  async (event) => {
    const contributionId = event.params.contributionId;
    const before = event.data?.before?.exists ? event.data.before.data() ?? null : null;
    const after = event.data?.after?.exists ? event.data.after.data() ?? null : null;

    const wordId = text(after?.wordQueueId) || text(before?.wordQueueId);
    if (!wordId) return;

    // A deleted contribution releases its word. Nothing deletes these today,
    // but a counter that survives its contribution is a word pinned out of the
    // queue with no document left to explain why.
    const outcome = after ? queueOutcomeForStatus(after.status) : 'released';
    if (!outcome) return;

    // The cheap guard for the common re-fire: the document was rewritten (a
    // feedback string, a publication target) without its status moving. The
    // ledger would catch this anyway; catching it here saves a transaction.
    if (before && after && queueOutcomeForStatus(before.status) === outcome) return;

    try {
      const next = await applyQueueOutcome(getFirestore(), wordId, contributionId, outcome);
      if (next) {
        logger.info('wordQueue counters moved', {
          wordId,
          contributionId,
          outcome,
          status: next.status,
        });
      }
    } catch (error) {
      // Rethrown so the platform retries: a lost counter move leaves a word
      // either double-counted or pinned, and both are worse than a retry.
      logger.error('wordQueue counter update failed', {
        wordId,
        contributionId,
        outcome,
        errorType: error instanceof Error ? error.name : 'unknown',
      });
      throw error;
    }
  },
);
