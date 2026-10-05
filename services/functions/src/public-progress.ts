import { getFirestore, Timestamp, type Firestore, type Query } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';

/**
 * Public launch progress: the verified totals behind indigenworld.com/progress,
 * and the sanitized feed that lets that page show an approval arriving.
 *
 * ── What counts ───────────────────────────────────────────────────────────
 * One record counts once, in exactly one category, while it is publicly
 * readable as reviewed work. The predicates below are the canonical rules:
 *
 *   lexicon        dictionaryEntries  isPublished (merged entries are not)
 *   pronunciation  dictionaryEntries  isPublished with a public audioUrl
 *   expressions    expressionEntries  isPublished, any kind except proverb
 *   proverbs       expressionEntries  isPublished with expressionKind proverb
 *   sentences      kasemSentences     the public projection firestore.rules
 *                                     serves: confirmed, projectionVersion 2,
 *                                     consent not expired
 *   grammar        grammarRules       status published
 *   music          publishedContent   published, collectionKind music (all routes)
 *   literature…    publishedContent   published, that collectionKind, and NOT
 *   (audiobooks, video)               publicationRoute 'open'
 *
 * ── Why open posts are left out ───────────────────────────────────────────
 * `open-publishing.ts` publishes ordinary TribeStudio posts with "no
 * verification, no queue, no reviewer", and the seeded song that uses the
 * same route says its lines "have not been independently reviewed". The page
 * says it shows verified contributions, so a route that is unreviewed by
 * design cannot fill a reviewed-work vessel. Songs instead measure the public
 * music library, including open publications, and are labelled published.
 * Campaign, collection-review and admin library
 * publications count, as do older records that predate the route field.
 *
 * ── Why a recount and not an increment ────────────────────────────────────
 * Firestore triggers are delivered at least once and in no guaranteed order.
 * Every write that changes whether a record counts therefore recounts the
 * affected category with server-side count() aggregations (one read-only
 * transaction per category, so a category made of two counts is read at one
 * instant), and stores the total with the Firestore read time of that count:
 *
 *   * a redelivered event recounts the same number, so nothing is counted twice;
 *   * two concurrent approvals are both inside whichever recount reads last;
 *   * a slow, older count arriving late is discarded by its read time, so it
 *     can never roll a newer total back.
 *
 * The total is truth independent of the page: nothing here waits for an
 * animation, and nothing on the page can write.
 *
 * ── What the public sees ──────────────────────────────────────────────────
 * One document, `publicProgress/current`: a total per category and a short
 * ring of recent changes, each { category, delta, total, revision, time }.
 * No record id, contributor, text, media, reviewer or note is ever copied in.
 * `revision` rises with every change and is the page's cursor: everything at
 * or below the revision it first read is history and is never replayed.
 *
 * ── What a trigger cannot see ─────────────────────────────────────────────
 * A sentence whose consent expires leaves the public projection without any
 * write, and a trigger that fails loses its event. `reconcilePublicProgress`
 * recounts every category on a schedule and corrects the totals silently:
 * those changes carry no event, so the page updates the number without
 * presenting an old approval as happening now.
 */

const REGION = 'us-central1';

export const PUBLIC_PROGRESS_DOC = 'publicProgress/current';
export const PUBLIC_PROGRESS_SCHEMA_VERSION = 1;
/** The page reads at most this many recent changes; older ones are history. */
export const MAX_PUBLIC_EVENTS = 24;

export const PROGRESS_CATEGORIES = [
  'lexicon',
  'expressions',
  'sentences',
  'literature',
  'music',
  'audiobooks',
  'video',
  'grammar',
  'proverbs',
  'pronunciation',
] as const;
export type ProgressCategory = (typeof PROGRESS_CATEGORIES)[number];

export const PROGRESS_SOURCES = [
  'dictionaryEntries',
  'expressionEntries',
  'kasemSentences',
  'grammarRules',
  'publishedContent',
] as const;
export type ProgressSource = (typeof PROGRESS_SOURCES)[number];

export const SOURCE_OF: Record<ProgressCategory, ProgressSource> = {
  lexicon: 'dictionaryEntries',
  pronunciation: 'dictionaryEntries',
  expressions: 'expressionEntries',
  proverbs: 'expressionEntries',
  sentences: 'kasemSentences',
  grammar: 'grammarRules',
  literature: 'publishedContent',
  music: 'publishedContent',
  audiobooks: 'publishedContent',
  video: 'publishedContent',
};

/** The publishedContent collectionKind each media category counts. */
const CONTENT_KIND: Partial<Record<ProgressCategory, string>> = {
  literature: 'literature',
  music: 'music',
  audiobooks: 'audiobooks',
  video: 'video',
};

type RecordData = Record<string, unknown> | null | undefined;

/**
 * Whether one canonical record counts toward a category. Pure.
 *
 * Kept in exact step with `countPlan` below: the trigger decides whether to
 * recount with this, and the recount measures with those queries, so a record
 * this says counts is a record those queries find.
 */
export function countsToward(category: ProgressCategory, data: RecordData, nowMs: number): boolean {
  if (!data) return false;
  switch (category) {
    case 'lexicon':
      return data.isPublished === true;
    case 'pronunciation':
      // `audioUrl > ''` in the count query: any non-empty string.
      return data.isPublished === true && typeof data.audioUrl === 'string' && data.audioUrl.length > 0;
    case 'expressions':
      return data.isPublished === true && data.expressionKind !== 'proverb';
    case 'proverbs':
      return data.isPublished === true && data.expressionKind === 'proverb';
    case 'sentences':
      return data.status === 'confirmed'
        && data.projectionVersion === 2
        && !(typeof data.expiresAtMillis === 'number' && data.expiresAtMillis <= nowMs);
    case 'grammar':
      return data.status === 'published';
    default:
      return data.publicationStatus === 'published'
        && data.collectionKind === CONTENT_KIND[category]
        && (category === 'music' || data.publicationRoute !== 'open');
  }
}

/** The categories whose count one write to `source` can have changed. Pure. */
export function changedCategories(
  source: ProgressSource,
  before: RecordData,
  after: RecordData,
  nowMs: number,
): ProgressCategory[] {
  return PROGRESS_CATEGORIES.filter((category) => SOURCE_OF[category] === source
    && countsToward(category, before, nowMs) !== countsToward(category, after, nowMs));
}

interface CountPlan {
  add: Query[];
  subtract: Query[];
}

/** The count() queries that measure one category. */
export function countPlan(db: Firestore, category: ProgressCategory, nowMs: number): CountPlan {
  switch (category) {
    case 'lexicon':
      return { add: [db.collection('dictionaryEntries').where('isPublished', '==', true)], subtract: [] };
    case 'pronunciation':
      return {
        add: [db.collection('dictionaryEntries').where('isPublished', '==', true).where('audioUrl', '>', '')],
        subtract: [],
      };
    case 'expressions': {
      const published = db.collection('expressionEntries').where('isPublished', '==', true);
      return { add: [published], subtract: [published.where('expressionKind', '==', 'proverb')] };
    }
    case 'proverbs':
      return {
        add: [db.collection('expressionEntries').where('isPublished', '==', true).where('expressionKind', '==', 'proverb')],
        subtract: [],
      };
    case 'sentences': {
      const projected = db.collection('kasemSentences')
        .where('status', '==', 'confirmed')
        .where('projectionVersion', '==', 2);
      return { add: [projected], subtract: [projected.where('expiresAtMillis', '<=', nowMs)] };
    }
    case 'grammar':
      return { add: [db.collection('grammarRules').where('status', '==', 'published')], subtract: [] };
    default: {
      const published = db.collection('publishedContent')
        .where('publicationStatus', '==', 'published')
        .where('collectionKind', '==', CONTENT_KIND[category]);
      return { add: [published], subtract: category === 'music' ? [] : [published.where('publicationRoute', '==', 'open')] };
    }
  }
}

export interface CategoryCount {
  category: ProgressCategory;
  total: number;
  readTime: Timestamp;
}

/** Counts one category at a single instant: its queries share one read-only transaction. */
export async function countCategory(db: Firestore, category: ProgressCategory, nowMs: number): Promise<CategoryCount> {
  const plan = countPlan(db, category, nowMs);
  return db.runTransaction(async (tx) => {
    const added = await Promise.all(plan.add.map((query) => tx.get(query.count())));
    const subtracted = await Promise.all(plan.subtract.map((query) => tx.get(query.count())));
    const sum = (snapshots: typeof added) => snapshots.reduce((total, snapshot) => total + snapshot.data().count, 0);
    return { category, total: Math.max(0, sum(added) - sum(subtracted)), readTime: added[0].readTime };
  }, { readOnly: true });
}

export interface StoredCategory {
  total: number;
  countedAt: Timestamp;
  changedAt: Timestamp | null;
}

export interface PublicProgressEvent {
  id: string;
  revision: number;
  category: ProgressCategory;
  delta: number;
  total: number;
  kind: 'approval' | 'correction';
  at: Timestamp;
}

export interface PublicProgressDocument {
  schemaVersion: number;
  revision: number;
  updatedAt: Timestamp;
  categories: Partial<Record<ProgressCategory, StoredCategory>>;
  events: PublicProgressEvent[];
}

export type RefreshSource = 'trigger' | 'reconcile';

function isCategory(value: unknown): value is ProgressCategory {
  return typeof value === 'string' && (PROGRESS_CATEGORIES as readonly string[]).includes(value);
}

function isAfter(a: Timestamp, b: Timestamp): boolean {
  return a.seconds > b.seconds || (a.seconds === b.seconds && a.nanoseconds > b.nanoseconds);
}

function asTimestamp(value: unknown): Timestamp | null {
  return value instanceof Timestamp ? value : null;
}

function wholeNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;
}

/** Reads a stored projection defensively; anything malformed is treated as absent. */
export function parseStoredProgress(raw: RecordData): PublicProgressDocument | null {
  if (!raw) return null;
  const categories: Partial<Record<ProgressCategory, StoredCategory>> = {};
  const storedCategories = raw.categories && typeof raw.categories === 'object'
    ? raw.categories as Record<string, unknown>
    : {};
  for (const [key, value] of Object.entries(storedCategories)) {
    if (!isCategory(key) || !value || typeof value !== 'object') continue;
    const entry = value as Record<string, unknown>;
    const total = wholeNumber(entry.total);
    const countedAt = asTimestamp(entry.countedAt);
    if (total === null || !countedAt) continue;
    categories[key] = { total, countedAt, changedAt: asTimestamp(entry.changedAt) };
  }
  const events = (Array.isArray(raw.events) ? raw.events : []).flatMap((value): PublicProgressEvent[] => {
    if (!value || typeof value !== 'object') return [];
    const event = value as Record<string, unknown>;
    const revision = wholeNumber(event.revision);
    const total = wholeNumber(event.total);
    const at = asTimestamp(event.at);
    if (revision === null || total === null || !at || !isCategory(event.category)
      || typeof event.delta !== 'number' || !Number.isInteger(event.delta) || event.delta === 0) return [];
    return [{
      id: `${revision}.${event.category}`,
      revision,
      category: event.category,
      delta: event.delta,
      total,
      kind: event.delta > 0 ? 'approval' : 'correction',
      at,
    }];
  });
  return {
    schemaVersion: PUBLIC_PROGRESS_SCHEMA_VERSION,
    revision: wholeNumber(raw.revision) ?? 0,
    updatedAt: asTimestamp(raw.updatedAt) ?? Timestamp.fromMillis(0),
    categories,
    events,
  };
}

export interface ProgressUpdatePlan {
  next: PublicProgressDocument;
  /** Changes published as events this time (always empty for a reconcile). */
  events: PublicProgressEvent[];
}

/**
 * Merges fresh counts into the stored projection. Pure.
 *
 * Returns null when nothing would change: every count is older than (or as
 * old as) the one already stored. A newer count with the same total is still
 * written, because its read time is what makes an older, slower count that
 * arrives afterwards recognisably stale.
 */
export function planProgressUpdate(
  stored: PublicProgressDocument | null,
  counts: CategoryCount[],
  source: RefreshSource,
): ProgressUpdatePlan | null {
  if (!counts.length) return null;
  const categories = { ...(stored?.categories ?? {}) };
  const changes: Array<{ category: ProgressCategory; delta: number; total: number; at: Timestamp }> = [];
  let advanced = false;
  let latest: Timestamp | null = null;
  for (const count of counts) {
    const previous = categories[count.category];
    if (previous && !isAfter(count.readTime, previous.countedAt)) continue;
    advanced = true;
    // A category seen for the first time is a baseline, never an approval:
    // the history it already holds must not arrive as one enormous delta.
    const delta = previous ? count.total - previous.total : 0;
    categories[count.category] = {
      total: count.total,
      countedAt: count.readTime,
      changedAt: delta !== 0 ? count.readTime : previous?.changedAt ?? null,
    };
    if (!latest || isAfter(count.readTime, latest)) latest = count.readTime;
    if (delta !== 0) changes.push({ category: count.category, delta, total: count.total, at: count.readTime });
  }
  if (!advanced || !latest) return null;

  const revision = (stored?.revision ?? 0) + (stored && !changes.length ? 0 : 1);
  // Only a write a trigger observed is announced. A first projection and a
  // reconcile only correct the numbers.
  const events: PublicProgressEvent[] = stored && source === 'trigger'
    ? changes.map((change) => ({
        id: `${revision}.${change.category}`,
        revision,
        category: change.category,
        delta: change.delta,
        total: change.total,
        kind: change.delta > 0 ? 'approval' : 'correction',
        at: change.at,
      }))
    : [];
  return {
    next: {
      schemaVersion: PUBLIC_PROGRESS_SCHEMA_VERSION,
      revision,
      updatedAt: changes.length || !stored ? latest : stored.updatedAt,
      categories,
      events: [...(stored?.events ?? []), ...events].slice(-MAX_PUBLIC_EVENTS),
    },
    events,
  };
}

/** The exact public shape: nothing but category keys, numbers and times. */
export function publicProgressFields(doc: PublicProgressDocument): Record<string, unknown> {
  return {
    schemaVersion: doc.schemaVersion,
    revision: doc.revision,
    updatedAt: doc.updatedAt,
    categories: Object.fromEntries(Object.entries(doc.categories).map(([category, value]) => [category, {
      total: value.total,
      countedAt: value.countedAt,
      changedAt: value.changedAt,
    }])),
    events: doc.events.map((event) => ({
      id: event.id,
      revision: event.revision,
      category: event.category,
      delta: event.delta,
      total: event.total,
      kind: event.kind,
      at: event.at,
    })),
  };
}

export interface RefreshOutcome {
  written: boolean;
  revision: number | null;
  events: PublicProgressEvent[];
  failed: ProgressCategory[];
}

/**
 * Recounts `categories` and records any change. A missing projection is
 * created from every category at once, with no events, so the first page load
 * after a deploy shows history as history.
 */
export async function refreshPublicProgress(
  db: Firestore,
  categories: readonly ProgressCategory[],
  source: RefreshSource,
  nowMs = Date.now(),
): Promise<RefreshOutcome> {
  const ref = db.doc(PUBLIC_PROGRESS_DOC);
  const exists = (await ref.get()).exists;
  const targets = exists ? [...new Set(categories)] : [...PROGRESS_CATEGORIES];
  const settled = await Promise.allSettled(targets.map((category) => countCategory(db, category, nowMs)));
  const counts: CategoryCount[] = [];
  const failed: ProgressCategory[] = [];
  settled.forEach((result, index) => {
    if (result.status === 'fulfilled') counts.push(result.value);
    else {
      failed.push(targets[index]);
      // Usually a composite index still building after a deploy. That
      // category keeps its last good total; the others still update.
      logger.warn('Public progress count failed', {
        category: targets[index],
        errorType: result.reason instanceof Error ? result.reason.name : 'unknown',
        message: result.reason instanceof Error ? result.reason.message.slice(0, 200) : undefined,
      });
    }
  });
  if (!counts.length) return { written: false, revision: null, events: [], failed };

  return db.runTransaction(async (tx) => {
    const snapshot = await tx.get(ref);
    const plan = planProgressUpdate(parseStoredProgress(snapshot.data()), counts, source);
    if (!plan) return { written: false, revision: null, events: [], failed };
    tx.set(ref, publicProgressFields(plan.next));
    return { written: true, revision: plan.next.revision, events: plan.events, failed };
  });
}

const TRIGGER_OPTIONS = { region: REGION, maxInstances: 5, timeoutSeconds: 60 } as const;

function progressTrigger(source: ProgressSource) {
  return onDocumentWritten({ ...TRIGGER_OPTIONS, document: `${source}/{recordId}` }, async (event) => {
    const nowMs = Date.now();
    const categories = changedCategories(source, event.data?.before?.data(), event.data?.after?.data(), nowMs);
    if (!categories.length) return;
    try {
      await refreshPublicProgress(getFirestore(), categories, 'trigger', nowMs);
    } catch (error) {
      // The scheduled reconcile restores the exact total; only the live
      // arrival animation for this change is lost.
      logger.warn('Public progress refresh failed', {
        source,
        categories,
        errorType: error instanceof Error ? error.name : 'unknown',
      });
    }
  });
}

export const onDictionaryEntryProgress = progressTrigger('dictionaryEntries');
export const onExpressionEntryProgress = progressTrigger('expressionEntries');
export const onKasemSentenceProgress = progressTrigger('kasemSentences');
export const onGrammarRuleProgress = progressTrigger('grammarRules');
export const onPublishedContentProgress = progressTrigger('publishedContent');

export const reconcilePublicProgress = onSchedule(
  { schedule: 'every 15 minutes', timeZone: 'Etc/UTC', region: REGION, retryCount: 1, maxInstances: 1 },
  async () => {
    const outcome = await refreshPublicProgress(getFirestore(), PROGRESS_CATEGORIES, 'reconcile');
    if (outcome.failed.length) logger.warn('Public progress reconcile incomplete', { failed: outcome.failed });
  },
);
