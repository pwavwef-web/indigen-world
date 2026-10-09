import { createHash } from 'node:crypto';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { requireAuth } from './auth.js';
import { publicCreditName } from './expressions.js';
import { SENSE_DOMAINS } from './lexical-senses.js';
import { consumeRateLimit } from './rate-limit.js';
import { WORD_QUEUE_COLLECTION } from './word-queue.js';

/**
 * The language loop.
 *
 * Everything else in the app used to end where the dictionary ran out: a reel
 * with a word nobody had recorded, a search that found nothing, a topic with
 * three words in it, Kawuri saying "the dictionary does not have this word
 * yet". Each was a dead end, and each was standing in front of the one thing
 * that fixes it — the word queue.
 *
 * This file is the connective tissue:
 *
 *   queueWordIdFor        the one id a word has, however it was reached, so a
 *                         search and a topic page asking for "goat" open the
 *                         same queue item and their answers pile up together.
 *   requestQueueWord      adds a missing word to the queue, or finds the row
 *                         that is already there, and counts the demand.
 *   PUBLISH_AS            what a reviewer may decide an answer becomes, and
 *                         the record each non-headword choice is written as.
 *   queueStatesFor        where a word Kawuri could not verify stands.
 *
 * ── What is deliberately not stored ────────────────────────────────────────
 * The public queue row never names who asked for a word. Demand is a count;
 * who asked lives in `wordRequests`, readable only by the asker and by staff,
 * and exists so one member asking twice counts once.
 */

const REGION = 'us-central1';
const ENFORCE_APP_CHECK = process.env.ENFORCE_APP_CHECK === 'true';

const CALLABLE_OPTIONS = {
  region: REGION,
  enforceAppCheck: ENFORCE_APP_CHECK,
  consumeAppCheckToken: ENFORCE_APP_CHECK,
  invoker: 'public' as const,
};

type JsonRecord = Record<string, unknown>;

export const WORD_REQUESTS_COLLECTION = 'wordRequests';
export const LANGUAGE_RESOURCES_COLLECTION = 'languageResources';

/** The generic public credit, used when a contributor asked not to be named. */
export const ANONYMOUS_CREDIT = 'Indigen World contributor';

function text(value: unknown, max = 4000): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}

// ---------------------------------------------------------------------------
// One word, one id
// ---------------------------------------------------------------------------

/**
 * The queue id of an English word.
 *
 * Must stay byte-for-byte the function `wordQueueId` in
 * `scripts/build-word-queue.mjs`: the seeded rows were written with it, so a
 * request for a seeded word has to land on the seeded row rather than beside
 * it. A test holds the two together.
 */
export function queueWordIdFor(word: string): string {
  const lower = word.toLowerCase();
  const slug = lower.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const digest = createHash('sha1').update(lower).digest('hex').slice(0, 6);
  return `${slug || 'word'}-${digest}`;
}

export const MAX_REQUESTED_WORD_LENGTH = 40;
export const MAX_REQUESTED_WORDS = 3;

/**
 * The English word a member asked for, as the queue will hold it.
 *
 * Lowercased, because the queue is keyed on the lowercase form and "Goat" and
 * "goat" are one request. English letters only: the queue asks for the Kasem
 * of an English word, and a Kasem spelling typed into the search box is a
 * different kind of gap — one the open contribution form is for.
 */
export function parseRequestedWord(raw: unknown): string {
  const word = typeof raw === 'string'
    ? raw.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase()
    : '';
  if (!word) {
    throw new HttpsError('invalid-argument', 'Type the English word you are looking for.');
  }
  if (word.length > MAX_REQUESTED_WORD_LENGTH || word.split(' ').length > MAX_REQUESTED_WORDS) {
    throw new HttpsError('invalid-argument', 'Ask for one word, or a short phrase of up to three words.');
  }
  if (!/^[a-z](?:[a-z' -]*[a-z])?$/.test(word)) {
    throw new HttpsError(
      'invalid-argument',
      'Use English letters only. The word queue asks for the Kasem of an English word.',
    );
  }
  return word;
}

const TOPIC_IDS = new Set(SENSE_DOMAINS.map((domain) => domain.id));

/** A topic is one of the dictionary's subject fields, or nothing. */
export function parseRequestTopic(raw: unknown): string | null {
  const topic = text(raw, 40).toLowerCase();
  if (!topic) return null;
  if (!TOPIC_IDS.has(topic)) {
    throw new HttpsError('invalid-argument', 'That topic is not one the dictionary uses.');
  }
  return topic;
}

export const REQUEST_SOURCES = ['search', 'topic', 'kawuri', 'explore'] as const;
export type RequestSource = (typeof REQUEST_SOURCES)[number];

export function parseRequestSource(raw: unknown): RequestSource {
  const source = text(raw, 20).toLowerCase();
  return (REQUEST_SOURCES as readonly string[]).includes(source) ? source as RequestSource : 'search';
}

/**
 * Where a requested word sits in the queue.
 *
 * Inside the thousand commonest words, deliberately. A request is the only
 * signal the queue has that a real person went looking for a word and did not
 * find it, which is worth more than a frequency list compiled from somebody
 * else's language; it should reach the members answering the queue this week,
 * not after fourteen thousand other words.
 */
export const REQUESTED_WORD_RANK = 150;

/** A queue row for a word nobody had seeded, created by a member's request. */
export function requestedQueueRow(word: string, topic: string | null, now: string): JsonRecord {
  return {
    id: queueWordIdFor(word),
    word,
    lookup: word,
    // No example sentence: the member asked for the word, not for a sense of
    // it, and inventing an English sentence to go with it would pick a sense
    // on their behalf. The queue card shows the word on its own.
    sentence: '',
    sentenceSource: 'none',
    tatoebaId: null,
    tatoebaContributor: null,
    licence: null,
    tier: 'requested',
    rank: REQUESTED_WORD_RANK,
    status: 'open',
    approvedCount: 0,
    pendingCount: 0,
    skipCount: 0,
    requestCount: 1,
    topics: topic ? [topic] : [],
    source: 'request',
    createdAt: now,
    lastRequestedAt: now,
  };
}

/**
 * "Help add this word."
 *
 * Finds the queue row for an English word, creating it when there is none,
 * and returns its id — the thing every entry point opens. Idempotent for one
 * member: asking again for the same word from another screen counts once, but
 * a new topic is still recorded, because "goat" asked for from Animals and
 * from Farming is one word that belongs on both pages.
 *
 * The answer tells the caller what state the word is in, because a request
 * for a word that already has a verified translation is a member who searched
 * the wrong way, and the right response is the entry rather than a form.
 */
export const requestQueueWord = onCall(CALLABLE_OPTIONS, async (req) => {
  const uid = requireAuth(req);
  await consumeRateLimit('requestQueueWord', uid, 20);
  const data = record(req.data);
  const word = parseRequestedWord(data.word);
  const topic = parseRequestTopic(data.topic);
  const source = parseRequestSource(data.source);
  const wordId = queueWordIdFor(word);

  const db = getFirestore();
  const wordRef = db.collection(WORD_QUEUE_COLLECTION).doc(wordId);
  const requestRef = db.collection(WORD_REQUESTS_COLLECTION).doc(`${uid}_${wordId}`);

  return db.runTransaction(async (tx) => {
    const [wordSnap, requestSnap] = await tx.getAll(wordRef, requestRef);
    const now = new Date().toISOString();
    const firstFromMember = !requestSnap.exists;
    if (firstFromMember) {
      tx.set(requestRef, { uid, wordId, word, topic, source, createdAt: now });
    } else if (topic) {
      tx.update(requestRef, { topics: FieldValue.arrayUnion(topic), updatedAt: now });
    }

    if (!wordSnap.exists) {
      tx.set(wordRef, { ...requestedQueueRow(word, topic, now), updatedAt: FieldValue.serverTimestamp() });
      return { wordId, word, status: 'open', created: true };
    }

    const status = text(wordSnap.get('status')).toLowerCase() || 'open';
    if (status === 'open') {
      tx.update(wordRef, {
        ...(firstFromMember ? { requestCount: FieldValue.increment(1) } : {}),
        ...(topic ? { topics: FieldValue.arrayUnion(topic) } : {}),
        lastRequestedAt: now,
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    return { wordId, word: text(wordSnap.get('word')) || word, status, created: false };
  });
});

// ---------------------------------------------------------------------------
// What an answer becomes
// ---------------------------------------------------------------------------

/**
 * The reviewer's choice for an answered word.
 *
 * A word queue answer used to have exactly one destination — a dictionary
 * headword — so a reviewer holding a fine idiom, or a lovely example sentence
 * under a word the dictionary already has, could only publish it as a
 * headword it is not, or reject good work. Now the reviewer says what it is:
 *
 *   headword          a dictionary entry (what every answer used to become)
 *   variant           a dictionary entry marked as a regional form of one the
 *                     dictionary already holds, with the region it is from
 *   expression        an expression, published beside the others
 *   example           an example sentence for a word, shown on its entry
 *   translation-pair  an English sentence and its Kasem, for the parallel
 *                     sentences Kawuri and the lessons draw on
 *   training          kept as reviewed material for testing and training
 *                     Indigen's language tools, never published — and only
 *                     when the contributor agreed to that use
 */
export const PUBLISH_AS = ['headword', 'variant', 'expression', 'example', 'translation-pair', 'training'] as const;
export type PublishAs = (typeof PUBLISH_AS)[number];

export const PUBLISH_AS_LABELS: Readonly<Record<PublishAs, string>> = {
  headword: 'A dictionary word',
  variant: 'A regional variant of a dictionary word',
  expression: 'An expression',
  example: 'An example sentence',
  'translation-pair': 'A translation pair',
  training: 'Training material (not published)',
};

export function parsePublishAs(raw: unknown): PublishAs {
  const value = text(raw, 30).toLowerCase();
  if (!value) return 'headword';
  if (!(PUBLISH_AS as readonly string[]).includes(value)) {
    throw new HttpsError('invalid-argument', `publishAs must be one of ${PUBLISH_AS.join(', ')}.`);
  }
  return value as PublishAs;
}

/**
 * The two choices written as a language resource. Training material is not
 * one of them: it goes to `contributorTrainingPairs`, the admin-only store the
 * contributor portal already keeps consented pairs in, so there is one place
 * training data lives and one place its consent is checked.
 */
export type LanguageResourceKind = 'example' | 'translation-pair';

/** The resource kind a choice is written as, or null when it goes somewhere else. */
export function languageResourceKindFor(publishAs: PublishAs): LanguageResourceKind | null {
  return publishAs === 'example' || publishAs === 'translation-pair' ? publishAs : null;
}

export const TRAINING_PAIRS_COLLECTION = 'contributorTrainingPairs';

/**
 * A reviewed queue answer kept as training material.
 *
 * The same shape the contributor portal writes, so everything that reads the
 * store reads these too. Never public (the rules allow admins only), and
 * never written without the contributor's consent — see [publishAsProblem].
 */
export function buildQueueTrainingPair(input: {
  submissionId: string;
  submission: JsonRecord;
  reviewedAt: string;
}): JsonRecord {
  const submission = input.submission;
  const permissions = record(submission.permissions);
  const prompt = record(submission.wordQueuePrompt);
  return {
    id: input.submissionId,
    language: text(submission.primaryLanguage) || 'xsm',
    english: text(submission.title, 180),
    kasem: text(submission.body, 2000),
    alternatives: Array.isArray(submission.translations)
      ? submission.translations.filter((item): item is string => typeof item === 'string').slice(0, 20)
      : [],
    englishSentence: text(prompt.sentence) || null,
    kasemSentence: text(submission.kasemExample) || null,
    dialect: text(submission.dialect, 80) || null,
    sourceSubmission: input.submissionId,
    contributorId: text(submission.authUid),
    consentVersion: text(permissions.consentVersion) || null,
    reviewedAt: input.reviewedAt,
    kind: 'word-queue',
  };
}

/**
 * Whether a choice may be made for this submission, and why not when it may not.
 *
 * Consent decides, not the reviewer: training use needs the contributor's
 * yes, and anything published needs their publication permission (which the
 * publish step checks for every kind already). An example or a pair also
 * needs a sentence to be one.
 */
export function publishAsProblem(publishAs: PublishAs, submission: JsonRecord): string | null {
  const permissions = record(submission.permissions);
  if (publishAs === 'training' && permissions.aiTraining !== true) {
    return 'The contributor did not agree to their answer being used to test or train language tools.';
  }
  if (publishAs === 'example' && !text(submission.kasemExample)) {
    return 'There is no Kasem sentence in this answer to use as an example.';
  }
  if (publishAs === 'translation-pair') {
    const prompt = record(submission.wordQueuePrompt);
    if (!text(submission.kasemExample) || !(text(prompt.sentence) || text(submission.englishExample))) {
      return 'A translation pair needs an English sentence and its Kasem; this answer does not have both.';
    }
  }
  return null;
}

/**
 * The name a contributor is publicly credited by.
 *
 * Their own choice first: a member who asked not to be named is credited
 * generically wherever their answer is published. Otherwise their display
 * name, and never an e-mail address — see [publicCreditName].
 */
export function contributorCredit(submission: JsonRecord, displayName: string): string {
  const preference = text(record(submission.attribution).preference).toLowerCase();
  return preference === 'anonymous' ? ANONYMOUS_CREDIT : publicCreditName(displayName);
}

export function languageResourceId(submissionId: string): string {
  return `lr_${submissionId}`;
}

export interface LanguageResourceInput {
  submissionId: string;
  contributionId: string;
  submission: JsonRecord;
  kind: LanguageResourceKind;
  /** True for a PUBLISH, false for an approval that is not yet public. */
  publish: boolean;
  /** The entry an example belongs to, when the reviewer named one. */
  entryId: string | null;
  displayName: string;
  existing: JsonRecord | null;
  now: string;
}

/**
 * A reviewed answer kept as an example sentence or a translation pair.
 *
 * Provenance travels with it: which queue word it answered, the submission
 * and contribution it came from, where the member started (Explore, search,
 * a topic, Kawuri), and the licence of the English sentence — Tatoeba's
 * CC BY 2.0 FR requires its credit wherever that sentence is shown, and a
 * resource that dropped it would republish the sentence without it.
 *
 * Public fields only. The reviewer is recorded in the audit log, not here;
 * the contributor is credited by the name they allowed.
 */
export function buildLanguageResourceDocument(input: LanguageResourceInput): JsonRecord {
  const submission = input.submission;
  const prompt = record(submission.wordQueuePrompt);
  const permissions = record(submission.permissions);
  const published = input.publish;
  const existing = input.existing ?? null;
  const sentenceCredit = text(prompt.sentenceSource) === 'tatoeba'
    ? {
        source: 'Tatoeba',
        id: prompt.tatoebaId ?? null,
        contributor: text(prompt.tatoebaContributor) || null,
        licence: text(prompt.licence) || 'CC BY 2.0 FR',
      }
    : null;
  return {
    id: languageResourceId(input.submissionId),
    kind: input.kind,
    isPublished: published,
    language: text(submission.primaryLanguage) || 'xsm',
    dialect: text(submission.dialect, 80),
    english: text(submission.title, 180),
    kasem: text(submission.body, 2000),
    englishSentence: text(prompt.sentence) || text(submission.englishExample),
    englishSentenceCredit: sentenceCredit,
    kasemSentence: text(submission.kasemExample),
    entryId: input.entryId,
    credit: contributorCredit(submission, input.displayName),
    // How a withdrawal finds and unpublishes this record, the same pointer
    // dictionary and expression entries carry.
    sourceContribution: { collection: 'collectionContributions', id: input.contributionId },
    provenance: {
      source: text(submission.wordQueueId) ? 'word-queue' : 'contribution',
      wordQueueId: text(submission.wordQueueId) || null,
      queueWord: text(prompt.word) || null,
      origin: text(submission.wordQueueOrigin) || null,
      submissionId: input.submissionId,
      contributionId: input.contributionId,
    },
    consent: {
      publication: permissions.publication === true,
      aiTraining: permissions.aiTraining === true,
      consentVersion: text(permissions.consentVersion) || null,
    },
    reviewed: true,
    createdAt: existing?.createdAt ?? input.now,
    updatedAt: input.now,
    publishedAt: published ? (existing?.publishedAt ?? input.now) : (existing?.publishedAt ?? null),
  };
}

// ---------------------------------------------------------------------------
// Where a word Kawuri could not verify stands
// ---------------------------------------------------------------------------

export type UnverifiedState = 'waiting-review' | 'unanswered' | 'translated' | 'not-in-queue';

export interface UnverifiedWord {
  term: string;
  /** The queue row to open, when there is one — or the id a request would create. */
  wordQueueId: string;
  state: UnverifiedState;
}

/** A queue row's state as Kawuri reports it. Pure, for the tests. */
export function unverifiedStateFor(row: JsonRecord | null): UnverifiedState {
  if (!row) return 'not-in-queue';
  const status = text(row.status).toLowerCase() || 'open';
  if (status === 'translated') return 'translated';
  if (status !== 'open') return 'not-in-queue';
  return Number(row.pendingCount ?? 0) > 0 ? 'waiting-review' : 'unanswered';
}

/**
 * The queue state of each term the dictionary could not answer.
 *
 * Only English terms can be queue words, so anything [parseRequestedWord]
 * refuses — a Kasem spelling somebody asked the meaning of — is dropped
 * rather than reported. At most three, which is more than any one question
 * asks about.
 */
export async function queueStatesFor(terms: readonly string[]): Promise<UnverifiedWord[]> {
  const words: string[] = [];
  for (const term of terms) {
    try {
      const word = parseRequestedWord(term);
      if (!words.includes(word)) words.push(word);
    } catch {
      // Not an English word the queue could hold.
    }
    if (words.length >= 3) break;
  }
  if (words.length === 0) return [];
  try {
    const db = getFirestore();
    const refs = words.map((word) => db.collection(WORD_QUEUE_COLLECTION).doc(queueWordIdFor(word)));
    const snaps = await db.getAll(...refs);
    return words.map((term, index) => ({
      term,
      wordQueueId: queueWordIdFor(term),
      state: unverifiedStateFor(snaps[index]?.exists ? (snaps[index]!.data() ?? null) : null),
    }));
  } catch (error) {
    logger.warn('Queue state lookup failed', { errorType: error instanceof Error ? error.name : 'unknown' });
    return words.map((term) => ({ term, wordQueueId: queueWordIdFor(term), state: 'not-in-queue' as const }));
  }
}

/**
 * The line Kawuri's instruction gains when a word it cannot verify has
 * answers waiting. The answers themselves are never passed to the model:
 * unreviewed Kasem cannot be quoted by a model that was never shown it.
 */
export function unverifiedBriefing(words: readonly UnverifiedWord[]): string {
  const waiting = words.filter((word) => word.state === 'waiting-review').map((word) => `"${word.term}"`);
  const open = words.filter((word) => word.state === 'unanswered' || word.state === 'not-in-queue').map((word) => `"${word.term}"`);
  if (waiting.length === 0 && open.length === 0) return '';
  const lines = ['NOT YET VERIFIED —'];
  if (waiting.length) {
    lines.push(`Members have sent translations of ${waiting.join(', ')} and they are waiting for a reviewer. Say plainly that the answer is not verified yet. You have not been shown those translations and must not guess them.`);
  }
  if (open.length) {
    lines.push(`Nobody has verified ${open.join(', ')} yet.`);
  }
  lines.push('The app shows the member a "Help add this word" button under your answer; you may mention that they can answer it there if they know it from a speaker.');
  return lines.join(' ');
}

/**
 * A word-queue answer, dressed as the expression a reviewer decided it is.
 *
 * The expression path reads its fields from `submission.expression` first,
 * so this supplies them: the Kasem the member typed is the phrase, the English
 * it answered is the meaning, and the source is the member themselves —
 * without this, the expression reader's fallbacks would credit an invited
 * speaker who never took part. An answer the member flagged as an idiom is
 * published as one.
 */
export function queueAnswerAsExpression(submission: JsonRecord): JsonRecord {
  return {
    ...submission,
    expression: {
      phrase: text(submission.body, 2000),
      meaning: text(submission.title, 500),
      kind: text(submission.sentenceFit) === 'idiom' ? 'idiom' : 'phrase',
      dialect: text(submission.dialect, 80),
      source: { type: 'self', detail: 'Answered in the Indigen World word queue' },
    },
  };
}
