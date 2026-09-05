import { createHash } from 'node:crypto';
import { parseAttestedSentence, glossTokens, canonicalConstruction, type AttestedSentence } from './kasem-corpus.js';

export const MIN_REVIEWERS = 2;
export const PURPOSES = ['publication', 'providerRetrieval', 'modelTraining', 'evaluation', 'audio'] as const;
export type Purpose = typeof PURPOSES[number];
export type Permissions = Record<Purpose, boolean> & {
  review: boolean; version: string; sourceConfirmed: boolean; licence: string;
  status: 'active' | 'withdrawn'; expiresAt: string | null;
};
export interface UsageContext {
  status: 'specified' | 'unspecified'; situation: string; preceding: string; intent: string; register: string;
}
export interface Annotation {
  start: number; end: number; gloss: string; kind: 'lexical' | 'grammatical' | 'unknown';
  senseId: string; role: string; hypotheses: string[];
}
export interface EvidenceExample extends AttestedSentence {
  originalKasem: string; originalEnglish: string; annotations: Annotation[];
  context: UsageContext; sourceType: 'speaker' | 'literature' | 'model'; source: string;
  naturalness: string; audioPath: string;
  audioGeneration?: string;
}
export const LABELS = {
  meaning: ['faithful', 'partial', 'different', 'cannot-judge'],
  grammar: ['acceptable', 'unacceptable', 'context-dependent', 'cannot-judge'],
  naturalness: ['natural', 'awkward', 'unnatural', 'cannot-judge'],
  contextFit: ['fits', 'does-not-fit', 'context-missing', 'cannot-judge'],
} as const;
export type Judgment = { [K in keyof typeof LABELS]: typeof LABELS[K][number] } & {
  explanation: string; annotationApproved: boolean;
};
export interface EvidenceReview {
  reviewerId: string; revision: number; dialectCompetent: boolean; judgments: Judgment[];
  preference: 'first' | 'second' | 'tie' | 'context-dependent' | 'cannot-judge'; createdAt: string;
}
export interface EvidenceNote {
  id: string; schemaVersion: 2; revision: number; authorUid: string; title: string;
  explanation: string; mode: 'sentence' | 'comparison' | 'correction'; examples: EvidenceExample[];
  permissions: Permissions; groups: string[]; comparisonNote: string;
  question: string; answer: string; modelVersion: string; promptVersion: string;
  createdAt: string; updatedAt: string; status: string; reviews: EvidenceReview[];
  reservedSplit: '' | 'validation' | 'test';
  datasetSplit?: '' | 'train' | 'validation' | 'test';
  requestFingerprint?: string;
}
export function object(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
}
export function field(raw: unknown, name: string, max: number, required = false): string {
  if (raw === undefined || raw === null) { if (required) throw new Error(`${name} is required.`); return ''; }
  if (typeof raw !== 'string') throw new Error(`${name} must be text.`);
  if (raw.length > max) throw new Error(`${name} must be ${max} characters or fewer.`);
  if (required && !raw.trim()) throw new Error(`${name} is required.`);
  return raw.normalize('NFC').trim();
}
export function hash(raw: string): string { return createHash('sha256').update(raw).digest('hex'); }
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b, 'en')).map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}
/** Review and permission changes invalidate a release; split reservations do not. */
export function evidenceFingerprint(note: EvidenceNote): string {
  const { reservedSplit: _reserved, datasetSplit: _split, ...content } = note;
  return hash(stableStringify(content));
}
export function parseContext(raw: unknown): UsageContext {
  const d = object(raw), situation = field(d.situation, 'Situation', 1200), preceding = field(d.preceding, 'Preceding conversation', 1600);
  return { status: situation || preceding ? 'specified' : 'unspecified', situation, preceding,
    intent: field(d.intent, 'Intent', 120), register: field(d.register, 'Register', 120) };
}
export function parsePermissions(raw: unknown, legacy = false): Permissions {
  const d = object(raw);
  for (const key of ['review', 'sourceConfirmed', ...PURPOSES]) if (d[key] !== undefined && typeof d[key] !== 'boolean') throw new Error(`${key} must be a permission choice.`);
  if (!legacy && d.review !== true) throw new Error('Permission for community review is required.');
  if (!legacy && d.sourceConfirmed !== true) throw new Error('Confirm that you may contribute this material.');
  const expiresAt = field(d.expiresAt, 'Permission expiry', 40);
  if (expiresAt && !Number.isFinite(Date.parse(expiresAt))) throw new Error('Permission expiry must be an ISO date.');
  return { review: d.review === true, sourceConfirmed: d.sourceConfirmed === true,
    publication: d.publication === true, providerRetrieval: d.providerRetrieval === true,
    modelTraining: d.modelTraining === true, evaluation: d.evaluation === true, audio: d.audio === true,
    version: legacy ? 'legacy-unrecorded' : 'kasem-evidence-v2', licence: field(d.licence, 'Licence/source terms', 400),
    status: 'active', expiresAt: expiresAt || null };
}
export function allowed(note: EvidenceNote, purpose: Purpose, asOf: string): boolean {
  const p = note.permissions;
  return p.status === 'active' && p.review && p.sourceConfirmed && p[purpose]
    && (!p.expiresAt || Date.parse(p.expiresAt) > Date.parse(asOf));
}
export function parseExample(raw: unknown, sharedContext?: unknown): EvidenceExample {
  const d = object(raw), parsed = parseAttestedSentence(d);
  if (d.constructions !== undefined && (!Array.isArray(d.constructions) || d.constructions.some(tag => !canonicalConstruction(tag)))) throw new Error('Choose known sentence construction tags.');
  if (!parsed.ok) throw new Error(parsed.reason);
  const tokenCount = glossTokens(parsed.sentence.kasem).length;
  if (tokenCount > 40) throw new Error('Keep each sentence to 40 tokens or fewer.');
  const annotations: Annotation[] = [];
  if (d.annotations !== undefined && !Array.isArray(d.annotations)) throw new Error('Annotations must be a list.');
  if (Array.isArray(d.annotations)) {
    if (d.annotations.length > 80) throw new Error('Use at most 80 annotations.');
    for (const rawAnnotation of d.annotations) {
      const a = object(rawAnnotation);
      if (!Number.isInteger(a.start) || !Number.isInteger(a.end) || (a.start as number) < 0 || (a.end as number) <= (a.start as number) || (a.end as number) > tokenCount) throw new Error('Annotation spans must address existing tokens (end exclusive).');
      if (!['lexical', 'grammatical', 'unknown'].includes(String(a.kind))) throw new Error('Choose an annotation kind.');
      if (a.hypotheses !== undefined && (!Array.isArray(a.hypotheses) || a.hypotheses.length > 5)) throw new Error('Use at most five annotation hypotheses.');
      annotations.push({ start: a.start as number, end: a.end as number, kind: a.kind as Annotation['kind'],
        gloss: field(a.gloss, 'Annotation gloss', 200), senseId: field(a.senseId, 'Sense ID', 100), role: field(a.role, 'Phrase role', 80),
        hypotheses: (Array.isArray(a.hypotheses) ? a.hypotheses : []).map(v => field(v, 'Hypothesis', 200)) });
    }
  }
  const sourceType = d.sourceType ?? 'speaker';
  if (!['speaker', 'literature', 'model'].includes(String(sourceType))) throw new Error('Choose a source type.');
  const naturalness = field(d.naturalness, 'Speaker naturalness judgment', 40) || 'cannot-judge';
  if (!(LABELS.naturalness as readonly string[]).includes(naturalness)) throw new Error('Choose a naturalness judgment.');
  return { ...parsed.sentence, dialect: parsed.sentence.dialect || 'unknown', originalKasem: d.kasem as string, originalEnglish: d.english as string,
    annotations, context: parseContext(d.context ?? sharedContext), sourceType: sourceType as EvidenceExample['sourceType'],
    source: field(d.source, 'Source', 1000, sourceType !== 'speaker'), naturalness, audioPath: field(d.audioPath, 'Audio path', 300) };
}
export function parseNote(raw: unknown, id: string, authorUid: string, now: string, legacy = false): EvidenceNote {
  const d = object(raw);
  if (!Array.isArray(d.examples) || !d.examples.length || d.examples.length > 6) throw new Error('Provide between one and six examples.');
  const mode = d.mode ?? 'sentence';
  if (!['sentence', 'comparison', 'correction'].includes(String(mode))) throw new Error('Choose a contribution type.');
  if (mode === 'comparison' && d.examples.length !== 2) throw new Error('A comparison needs exactly two versions.');
  const examples = d.examples.map(row => parseExample(row, d.context)), permissions = parsePermissions(d.permissions, legacy);
  if (mode === 'comparison' && stableStringify(examples[0].context) !== stableStringify(examples[1].context)) throw new Error('Comparison versions must share the same situation.');
  for (const e of examples) if (e.audioPath && (!permissions.audio || !e.audioPath.startsWith(`grammarAudio/${authorUid}/`) || e.audioPath.includes('..'))) throw new Error('Audio needs permission and must belong to this contributor.');
  if (d.groups !== undefined && (!Array.isArray(d.groups) || d.groups.length > 20)) throw new Error('Use at most 20 evidence groups.');
  const groups = (Array.isArray(d.groups) ? d.groups : []).map(v => field(v, 'Evidence group', 150, true));
  return { id, schemaVersion: 2, revision: 1, authorUid, title: field(d.title, 'Title', 180) || examples[0].english,
    explanation: field(d.explanation, 'Explanation', 2000), mode: mode as EvidenceNote['mode'], examples, permissions,
    groups: [...new Set([`note:${id}`, ...groups])], comparisonNote: field(d.comparisonNote, 'Comparison explanation', 2000),
    question: field(d.question, 'Original question', 2000), answer: field(d.answer, 'Original answer', 8000),
    modelVersion: field(d.modelVersion, 'Model version', 120), promptVersion: field(d.promptVersion, 'Prompt version', 120),
    createdAt: now, updatedAt: now, status: 'submitted', reviews: [], reservedSplit: '' };
}
export function parseReview(raw: unknown, note: EvidenceNote, uid: string, now: string): EvidenceReview {
  const d = object(raw);
  if (uid === note.authorUid) throw new Error('The contributor cannot independently review their own note.');
  if (d.revision !== note.revision) throw new Error('This sentence has changed. Open its latest revision.');
  if (d.dialectCompetent !== true) throw new Error('Confirm you can judge this dialect, or leave this review for another speaker.');
  if (!Array.isArray(d.judgments) || d.judgments.length !== note.examples.length) throw new Error('Judge each example separately.');
  const judgments = d.judgments.map(row => {
    const r = object(row);
    for (const [key, labels] of Object.entries(LABELS)) if (!(labels as readonly unknown[]).includes(r[key])) throw new Error(`Choose a ${key} judgment for every example.`);
    const explanation = field(r.explanation, 'Review explanation', 2000);
    if (['partial', 'different'].includes(String(r.meaning)) || r.grammar === 'unacceptable' || ['awkward', 'unnatural'].includes(String(r.naturalness)) || r.contextFit === 'does-not-fit') {
      if (explanation.length < 10) throw new Error('Explain each concern in at least 10 characters.');
    }
    return { meaning: r.meaning, grammar: r.grammar, naturalness: r.naturalness, contextFit: r.contextFit, explanation, annotationApproved: r.annotationApproved === true } as Judgment;
  });
  const preference = d.preference ?? 'cannot-judge';
  if (!['first', 'second', 'tie', 'context-dependent', 'cannot-judge'].includes(String(preference))) throw new Error('Choose a comparison preference.');
  return { reviewerId: uid, revision: note.revision, dialectCompetent: true, judgments, preference: preference as EvidenceReview['preference'], createdAt: now };
}
export function independentReviews(note: EvidenceNote): EvidenceReview[] {
  return [...new Map(note.reviews.filter(r => r.revision === note.revision && r.reviewerId !== note.authorUid && r.dialectCompetent).map(r => [r.reviewerId, r])).values()];
}
export function positive(j: Judgment): boolean { return j.meaning === 'faithful' && j.grammar === 'acceptable' && j.naturalness === 'natural' && j.contextFit === 'fits'; }
export function exampleQuality(note: EvidenceNote, index: number) {
  const judgments = independentReviews(note).map(r => r.judgments[index]).filter(Boolean), confirmations = judgments.filter(positive).length;
  const disputed = Object.keys(LABELS).some(key => new Set(judgments.map(j => j[key as keyof typeof LABELS]).filter(v => !['cannot-judge', 'context-missing'].includes(v))).size > 1);
  return { approved: confirmations >= MIN_REVIEWERS && !disputed, disputed, confirmations,
    annotationsApproved: judgments.filter(j => positive(j) && j.annotationApproved).length >= MIN_REVIEWERS && !disputed };
}
export function addReview(note: EvidenceNote, review: EvidenceReview): EvidenceNote {
  if (note.permissions.status !== 'active') throw new Error('This contribution has been withdrawn.');
  if (note.reviews.some(r => r.reviewerId === review.reviewerId && r.revision === review.revision)) throw new Error('You have already reviewed this revision.');
  const next = { ...note, reviews: [...note.reviews, review], updatedAt: review.createdAt }, qualities = next.examples.map((_, i) => exampleQuality(next, i));
  next.status = qualities.some(q => q.disputed) ? 'disputed' : independentReviews(next).length < MIN_REVIEWERS ? 'submitted' : qualities.every(q => q.approved) ? 'confirmed' : 'reviewed';
  return next;
}
export function publicSentences(note: EvidenceNote, asOf: string): Record<string, unknown>[] {
  if (!allowed(note, 'publication', asOf)) return [];
  return note.examples.flatMap((e, index) => {
    const q = exampleQuality(note, index);
    if (!q.approved) return [];
    return [{ id: `${note.id}-${index}`, evidenceId: note.id, revision: note.revision, schemaVersion: 2, projectionVersion: 2,
      status: 'confirmed', kasem: e.kasem, english: e.english, literal: '', gloss: [], note: q.annotationsApproved ? e.note : '',
      dialect: e.dialect, context: e.context, constructions: e.constructions, annotations: q.annotationsApproved ? e.annotations : [],
      confirmations: q.confirmations, providerRetrieval: allowed(note, 'providerRetrieval', asOf), reservedSplit: note.reservedSplit,
      expiresAt: note.permissions.expiresAt, expiresAtMillis: note.permissions.expiresAt ? Date.parse(note.permissions.expiresAt) : null }];
  });
}
export function migrateLegacy(id: string, raw: Record<string, unknown>, now: string): EvidenceNote {
  const examples = Array.isArray(raw.examples) && raw.examples.length ? raw.examples : [raw];
  return { ...parseNote({ ...raw, mode: 'sentence', permissions: {}, examples }, id,
    typeof raw.authUid === 'string' ? raw.authUid : typeof raw.contributorUid === 'string' ? raw.contributorUid : 'legacy-unknown', now, true), status: 'needs-permission' };
}
