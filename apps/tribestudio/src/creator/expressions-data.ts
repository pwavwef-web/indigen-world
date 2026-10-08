/**
 * Reads and writes for the everyday-expressions page.
 *
 * Sending goes through `submitExpression`, which files the expression on the
 * same review desk as every other contribution and — once approved — publishes
 * it to `expressionEntries` as a whole expression. It never becomes a
 * dictionary headword; single words have their own desk.
 *
 * Status is read from the contributor's own receipts in
 * `collectionContributions`, the only record of the review a contributor is
 * allowed to read. The review desk updates the receipt with every decision,
 * so what this page shows is the reviewer's latest word.
 */
import { collection, getDocs, limit, query, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import type { ExpressionKind, ExpressionSourceType } from '@indigen-world/contracts/creator-models';
import { db, functions } from '../firebase';

export const EXPRESSION_KINDS: { id: ExpressionKind; label: string; hint: string }[] = [
  { id: 'phrase', label: 'Everyday phrase or greeting', hint: 'Greetings, thanks, blessings, things said at home or at the market.' },
  { id: 'idiom', label: 'Idiom', hint: 'Its meaning is not what its words say on their own.' },
  { id: 'proverb', label: 'Proverb or saying', hint: 'A saying with a lesson, often said at a particular moment.' },
];

export type ClientSourceType = Exclude<ExpressionSourceType, 'invited-speaker'>;

/**
 * Who the contributor learned it from, and what they confirm about sharing it.
 *
 * The consent sentences are the server's, word for word
 * (`EXPRESSION_SOURCE_CONSENT` in services/functions/src/expressions.ts): the
 * server stores its own copy against the source type, so the sentence a
 * contributor ticks here is the one on the record.
 */
export const EXPRESSION_SOURCES: { id: ClientSourceType; label: string; consent: string }[] = [
  { id: 'self', label: 'I say it myself', consent: 'It is my own everyday Kasem, and I am free to share it.' },
  { id: 'family', label: 'A family member', consent: 'The person I learned it from agreed that I may share it.' },
  { id: 'elder', label: 'An elder or knowledge holder', consent: 'The person I learned it from agreed that I may share it.' },
  { id: 'community', label: 'Someone in my community', consent: 'The person I learned it from agreed that I may share it.' },
  { id: 'written', label: 'A book or written source', consent: 'I have named the source, and I am sharing a short expression from it, not a longer passage.' },
  { id: 'recording', label: 'A recording or broadcast', consent: 'I have named the source, and I am sharing a short expression from it, not a longer passage.' },
];

export const EVERYDAY_STATEMENT = 'It is an everyday expression — nothing sacred, secret, private or restricted.';

export const EXPRESSION_DIALECTS = ['Navrongo', 'Paga', 'Chiana', 'Other', 'Not sure'];

export const MAX_PHRASE_LENGTH = 300;

export interface ExpressionDraft {
  requestId: string;
  phrase: string;
  kind: ExpressionKind;
  meaning: string;
  literalTranslation: string;
  context: string;
  dialect: string;
  sourceType: ClientSourceType | '';
  sourceDetail: string;
  speakerName: string;
  speakerConsent: boolean;
  everydayConfirmed: boolean;
  publish: 'yes' | 'no' | '';
  aiTraining: boolean;
  /** The declined expression this draft corrects, if any. */
  revisionOf: string;
}

export function emptyExpressionDraft(): ExpressionDraft {
  return {
    requestId: crypto.randomUUID(),
    phrase: '',
    kind: 'phrase',
    meaning: '',
    literalTranslation: '',
    context: '',
    dialect: '',
    sourceType: '',
    sourceDetail: '',
    speakerName: '',
    speakerConsent: false,
    everydayConfirmed: false,
    publish: '',
    aiTraining: false,
    revisionOf: '',
  };
}

/** The first thing still missing, in the order the form asks for it, or null. */
export function missingPiece(draft: ExpressionDraft): string | null {
  if (!draft.phrase.trim()) return 'Write the expression in Kasem.';
  if (draft.phrase.trim().length > MAX_PHRASE_LENGTH) return `Keep the expression under ${MAX_PHRASE_LENGTH} characters.`;
  if (!draft.meaning.trim()) return 'Say what the expression means in English.';
  if (draft.meaning.trim().toLocaleLowerCase() === draft.phrase.trim().toLocaleLowerCase()) {
    return 'The expression and its meaning are the same text. Write the expression in Kasem and its meaning in English.';
  }
  if (!draft.context.trim()) return 'Say when the expression is used.';
  if (!draft.dialect) return 'Choose the dialect, or “Not sure”.';
  if (!draft.sourceType) return 'Choose who you learned it from.';
  if (!draft.sourceDetail.trim()) return 'Say where you heard or learned it.';
  if (!draft.speakerConsent) return 'Confirm the source statement under “Consent”.';
  if (!draft.everydayConfirmed) return 'Confirm that it is an everyday expression.';
  if (!draft.publish) return 'Choose whether it may be published after review.';
  return null;
}

/**
 * Whether the phrase looks like one word on its own.
 *
 * Advice, never a gate — a single Kasem word can be a whole greeting. It is
 * there so somebody who meant to add a word is pointed at the desk that gives
 * words a full dictionary entry.
 */
export function looksLikeSingleWord(phrase: string): boolean {
  const trimmed = phrase.trim();
  return trimmed.length > 0 && !/\s/.test(trimmed);
}

export async function submitExpression(draft: ExpressionDraft): Promise<{ contributionId: string }> {
  const call = httpsCallable<Record<string, unknown>, { contributionId: string; submissionId: string }>(
    functions,
    'submitExpression',
  );
  const response = await call({
    requestId: draft.requestId,
    phrase: draft.phrase.trim(),
    expressionKind: draft.kind,
    meaning: draft.meaning.trim(),
    literalTranslation: draft.literalTranslation.trim(),
    context: draft.context.trim(),
    dialect: draft.dialect,
    sourceType: draft.sourceType,
    sourceDetail: draft.sourceDetail.trim(),
    speakerName: draft.speakerName.trim(),
    speakerConsent: draft.speakerConsent,
    everydayConfirmed: draft.everydayConfirmed,
    publicationPermission: draft.publish === 'yes',
    aiTraining: draft.aiTraining,
    culturalPermissionTier: 'public',
    ...(draft.revisionOf ? { revisionOf: draft.revisionOf } : {}),
  });
  return { contributionId: response.data.contributionId };
}

/** One of the contributor's expressions, with the review's latest word. */
export interface MyExpression {
  id: string;
  phrase: string;
  meaning: string;
  literalTranslation: string;
  context: string;
  kind: ExpressionKind;
  dialect: string;
  sourceType: ClientSourceType | 'invited-speaker';
  sourceDetail: string;
  speakerName: string;
  status: string;
  reviewFeedback: string;
  publicationPermission: boolean;
  aiTraining: boolean;
  revisionOf: string;
  createdAt: Date | null;
}

function dateOf(value: unknown): Date | null {
  if (value && typeof value === 'object' && 'toDate' in value && typeof (value as { toDate: unknown }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate();
  }
  if (typeof value === 'string' && value) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export function expressionFromReceipt(id: string, data: Record<string, unknown>): MyExpression {
  const expression = (data.expression && typeof data.expression === 'object' ? data.expression : {}) as Record<string, unknown>;
  const source = (expression.source && typeof expression.source === 'object' ? expression.source : {}) as Record<string, unknown>;
  const kind = text(expression.kind) || text(data.lexicalKind);
  return {
    id,
    phrase: text(expression.phrase) || text(data.body),
    meaning: text(expression.meaning) || text(data.title),
    literalTranslation: text(expression.literalTranslation),
    context: text(expression.context) || text(data.usageContext),
    kind: (['phrase', 'idiom', 'proverb'].includes(kind) ? kind : 'phrase') as ExpressionKind,
    dialect: text(expression.dialect) || text(data.dialect),
    sourceType: (text(source.type) || 'self') as MyExpression['sourceType'],
    sourceDetail: text(source.detail) || text(data.source),
    speakerName: text(source.speakerName),
    status: (text(data.status) || 'submitted').toLowerCase(),
    reviewFeedback: text(data.reviewFeedback),
    publicationPermission: data.publicationPermission === true,
    aiTraining: data.aiTraining === true,
    revisionOf: text(data.revisionOf),
    createdAt: dateOf(data.createdAt),
  };
}

/**
 * The contributor's expressions, newest first.
 *
 * Two equality filters and no ordering, so the query needs no composite
 * index; sorting happens here. Throws on failure so the page can offer a
 * retry instead of claiming the contributor has sent nothing.
 */
export async function fetchMyExpressions(uid: string): Promise<MyExpression[]> {
  const snap = await getDocs(
    query(
      collection(db, 'collectionContributions'),
      where('authUid', '==', uid),
      where('collectionKind', '==', 'expressions'),
      limit(100),
    ),
  );
  return snap.docs
    .map((doc) => expressionFromReceipt(doc.id, doc.data() as Record<string, unknown>))
    .sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0));
}

/** Withdraws an expression, or takes a published one down. Same callable as every contribution. */
export async function withdrawExpression(contributionId: string): Promise<void> {
  const call = httpsCallable<{ contributionId: string }, unknown>(functions, 'withdrawCollectionContribution');
  await call({ contributionId });
}

export type StatusTone = 'info' | 'ok' | 'warn' | 'neutral';

/**
 * What each review state means to the person who sent the expression.
 *
 * Every label says where the expression is and what happens next, because
 * "Submitted" alone leaves somebody wondering whether anybody has looked.
 */
export const EXPRESSION_STATUS: Record<string, { label: string; tone: StatusTone; next: string }> = {
  submitted: {
    label: 'Waiting for review',
    tone: 'info',
    next: 'A Kasem-speaking reviewer will check the spelling, the meaning and the context. Only you and the review team can see it.',
  },
  under_review: {
    label: 'With a specialist reviewer',
    tone: 'info',
    next: 'It has been passed to a specialist — an elder, a teacher or a rights reviewer — for a second look.',
  },
  approved: {
    label: 'Approved',
    tone: 'ok',
    next: 'A reviewer approved it. It will be published as an expression shortly.',
  },
  published: {
    label: 'Published',
    tone: 'ok',
    next: 'Published as an expression, credited to you. You can take it down at any time.',
  },
  rejected: {
    label: 'Not accepted',
    tone: 'warn',
    next: 'The reviewer explained why. You can correct it and send it again.',
  },
  archived: {
    label: 'Kept for the archive',
    tone: 'neutral',
    next: 'Approved, and kept for review and research only, because you chose not to publish it.',
  },
  withdrawn: {
    label: 'Withdrawn',
    tone: 'neutral',
    next: 'You withdrew it. It is not in the review queue or published anywhere.',
  },
};

export function statusOf(status: string) {
  return EXPRESSION_STATUS[status] ?? { label: status || 'Unknown', tone: 'neutral' as StatusTone, next: '' };
}

/** Statuses a contributor can still pull back, published ones included. */
export function canWithdrawExpression(status: string): boolean {
  return ['submitted', 'under_review', 'approved', 'published'].includes(status);
}

/** The form, filled in from a declined expression, ready to be corrected. */
export function draftFromDeclined(expression: MyExpression): ExpressionDraft {
  return {
    ...emptyExpressionDraft(),
    phrase: expression.phrase,
    kind: expression.kind,
    meaning: expression.meaning,
    literalTranslation: expression.literalTranslation,
    context: expression.context,
    dialect: EXPRESSION_DIALECTS.includes(expression.dialect) ? expression.dialect : '',
    sourceType: expression.sourceType === 'invited-speaker' ? '' : expression.sourceType,
    sourceDetail: expression.sourceDetail,
    speakerName: expression.speakerName,
    revisionOf: expression.id,
  };
}

const DRAFT_KEY = 'tribestudio:expression-draft';

/** The unsent draft kept in this browser, for this account only. */
export function loadExpressionDraft(uid: string): ExpressionDraft | null {
  try {
    const raw = window.localStorage.getItem(`${DRAFT_KEY}:${uid}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ExpressionDraft>;
    const draft = { ...emptyExpressionDraft(), ...parsed };
    return draft.phrase || draft.meaning || draft.context ? draft : null;
  } catch {
    return null;
  }
}

export function saveExpressionDraft(uid: string, draft: ExpressionDraft): void {
  try {
    window.localStorage.setItem(`${DRAFT_KEY}:${uid}`, JSON.stringify(draft));
  } catch {
    // Private windows and full storage: the draft simply is not kept.
  }
}

export function clearExpressionDraft(uid: string): void {
  try {
    window.localStorage.removeItem(`${DRAFT_KEY}:${uid}`);
  } catch {
    // Nothing to clear.
  }
}
