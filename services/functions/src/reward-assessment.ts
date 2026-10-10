import { createHash } from 'node:crypto';
import { getFirestore, type DocumentSnapshot, type Firestore, type Transaction } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { requireAuth, requireRole } from './auth.js';
import { CONTRIBUTOR_CALL_OPTIONS, boundedText, guarded } from './contributor-common.js';
import { expressionFromSubmission } from './expressions.js';
import { canonicalCollectionKind } from './publication.js';
import { consumeRateLimit } from './rate-limit.js';
import { LedgerError, commitLedger, entryId, ledgerEntryRef, openLedger, post } from './points-ledger.js';
import {
  type AwardComputation,
  type AwardPolicyConfig,
  type BandId,
  type CategoryPolicy,
  type Dimension,
  type DimensionScores,
  type PolicyRecord,
  type QualityBand,
  type RewardCategory,
  DIMENSIONS,
  PolicyError,
  REWARD_CATEGORIES,
  computeAward,
} from './reward-policy.js';
import { type RewardSystem, loadRewardSystem, rewardAudit } from './reward-system.js';

/**
 * Training-data assessment and reward settlement for contributions.
 *
 * ── Three separate decisions ───────────────────────────────────────────────
 *   publication review   `submissions/{id}.status`, decided on the
 *                        Contributions desk (decideSubmission). Unchanged.
 *   training-data        `contributionAssessments/{submissionId}` — is this
 *   assessment           revision useful, high-quality training data for its
 *                        curated dataset? Proposed by deterministic checks and
 *                        the Python worker (with Kawuri's suggestions),
 *                        DECIDED by a fluent validator on the Rewards desk.
 *   reward settlement    a ledger entry, written in the same transaction as the
 *                        validator's confirmation, once per contribution, with
 *                        later authorised changes as adjustments.
 *
 * An expression can be training-ready without being published, and published
 * without being training-ready. "Training-ready" means eligible for the
 * curated dataset; it never means Kawuri has been trained on it.
 *
 * ── What automation may and may not do ─────────────────────────────────────
 * The worker proposes dimension scores, flags and a band. It cannot certify
 * its own linguistic guesses, so every assessment in this release routes to a
 * validator (`requireValidatorConfirmation` is locked on). If the worker is
 * off, down, or uncertain, the assessment still reaches a validator with that
 * stated — never a silent full award and never a silent zero.
 */

export const ASSESSMENTS = 'contributionAssessments';
export const JOBS = 'contributionAssessmentJobs';
export const AWARDS = 'contributionAwards';
export const MAX_JOB_ATTEMPTS = 3;
/** The worker contract version the backend accepts (see services/assessment-worker). */
export const RESULT_SCHEMA_VERSION = 1;

export const ASSESSMENT_STATUSES = [
  'queued', 'assessing', 'needs_clarification', 'validator_review', 'eligible', 'ineligible', 'awarded', 'superseded',
] as const;
export type AssessmentStatus = (typeof ASSESSMENT_STATUSES)[number];

export const CONTRIBUTOR_STATUS: Record<AssessmentStatus, { label: string; detail: string }> = {
  queued: { label: 'Assessing', detail: 'Automatic checks are queued. A validator will still read it.' },
  assessing: { label: 'Assessing', detail: 'Automatic checks are running. A validator will still read it.' },
  needs_clarification: { label: 'Needs clarification', detail: 'A validator has a question before deciding.' },
  validator_review: { label: 'Under validator review', detail: 'A fluent validator is checking this as training data.' },
  eligible: { label: 'Eligible', detail: 'Confirmed as training data. Points settle shortly.' },
  ineligible: { label: 'Not eligible', detail: 'Not accepted as training data. The reason is below.' },
  awarded: { label: 'Points awarded', detail: 'Confirmed by a validator and added to your available points.' },
  superseded: { label: 'Replaced by your edit', detail: 'Your newer revision is assessed instead.' },
};

export const INELIGIBLE_REASONS: Record<string, string> = {
  'duplicate': 'It repeats a record that is already in the dataset.',
  'inaccurate': 'The Kasem or the meaning could not be confirmed as accurate.',
  'not-useful': 'It does not add useful training data for this task.',
  'missing-permission': 'Training permission or provenance is missing.',
  'unusable-media': 'The recording or file cannot be used.',
  'off-task': 'It does not match the assigned prompt.',
  'other': 'See the validator’s note.',
};

/* ── Pure helpers ──────────────────────────────────────────────────────────── */

type Json = Record<string, unknown>;

/** One contribution across all of its revisions: the identity awards are keyed by. */
export function contributionKeyFor(submissionId: string, submission: Json): string {
  const portal = submission.contributorPortal as Json | undefined;
  if (portal && typeof portal.work === 'string' && typeof portal.item === 'string') {
    return createHash('sha256').update(`${portal.contributorId}/${portal.work}/${portal.item}`).digest('hex');
  }
  return typeof submission.contributionKey === 'string' && submission.contributionKey ? submission.contributionKey : submissionId;
}

export function rewardCategoryFor(submission: Json): RewardCategory | null {
  const kind = canonicalCollectionKind(submission.collectionKind ?? submission.category);
  return kind && (REWARD_CATEGORIES as readonly string[]).includes(kind) ? kind as RewardCategory : null;
}

/** Contributions the reward system pays for today: invited-portal work by its own author. */
export function isRewardable(submission: Json | undefined): boolean {
  const portal = submission?.contributorPortal as Json | undefined;
  return Boolean(portal && typeof submission?.authUid === 'string' && portal.contributorId === submission.authUid);
}

export interface Gate { id: string; status: 'pass' | 'fail' | 'needs-review'; detail: string }

/** Hard eligibility gates the backend checks itself; they are never scores. */
export function eligibilityGates(submission: Json, category: CategoryPolicy | null): Gate[] {
  const permissions = (submission.permissions ?? {}) as Json;
  const gates: Gate[] = [];
  gates.push(permissions.aiTraining === true && typeof permissions.consentVersion === 'string' && permissions.consentVersion
    ? { id: 'training-permission', status: 'pass', detail: `Training permission granted under ${permissions.consentVersion}.` }
    : { id: 'training-permission', status: 'fail', detail: 'Training permission was not granted for this revision.' });
  gates.push(['WITHDRAWN', 'DELETED'].includes(String(submission.status))
    ? { id: 'not-withdrawn', status: 'fail', detail: 'The contributor withdrew this contribution.' }
    : { id: 'not-withdrawn', status: 'pass', detail: 'Not withdrawn.' });
  gates.push(category?.enabled
    ? { id: 'category-rewarded', status: 'pass', detail: `${category.label} is a rewarded category.` }
    : { id: 'category-rewarded', status: 'fail', detail: 'This category is not rewarded under the current policy.' });
  const media = submission.media as Json | undefined;
  if (category?.requirements.audio) {
    gates.push(media && ['audio', 'video'].includes(String(media.mediaType))
      ? { id: 'media-present', status: 'pass', detail: 'A recording is attached.' }
      : { id: 'media-present', status: 'fail', detail: 'This category needs a recording.' });
  }
  return gates;
}

/** The submission content the worker may see. No names, e-mail or phone numbers. */
export function workerInput(submission: Json, category: RewardCategory) {
  const media = submission.media as Json | undefined;
  const base = {
    category,
    dialect: String(submission.dialect ?? ''),
    media: media && typeof media.storagePath === 'string'
      ? { storagePath: media.storagePath, mimeType: String(media.mimeType ?? ''), sizeBytes: Number(media.sizeBytes ?? 0), mediaType: String(media.mediaType ?? '') }
      : null,
    permissions: {
      aiTraining: (submission.permissions as Json | undefined)?.aiTraining === true,
      publication: (submission.permissions as Json | undefined)?.publication === true,
      consentVersion: String((submission.permissions as Json | undefined)?.consentVersion ?? ''),
    },
  };
  if (category === 'expressions') {
    const e = expressionFromSubmission(submission as Record<string, unknown>);
    return { ...base, dialect: e.dialect || base.dialect, kasemText: e.phrase, alternatives: e.alternatives, englishMeaning: e.meaning,
      literalTranslation: e.literalTranslation, context: e.context, sourceType: e.source.type, transcript: '' };
  }
  return { ...base, kasemText: String(submission.body ?? ''), alternatives: [], englishMeaning: String(submission.title ?? ''),
    literalTranslation: String(submission.literalTranslation ?? ''), context: String(submission.usageContext ?? ''),
    sourceType: String((submission.disclosures as Json | undefined)?.sourceInfo ?? ''), transcript: String(submission.transcript ?? '') };
}

/* ── Worker result validation ──────────────────────────────────────────────── */

const BASES = ['reference', 'model-proposal', 'deterministic', 'validator', 'not-applicable', 'unavailable'] as const;
const MODEL_STATUSES = ['ok', 'unavailable', 'disabled', 'invalid-output', 'skipped'] as const;

export interface WorkerResult {
  schemaVersion: 1;
  submissionId: string;
  revisionId: string;
  contributionKey: string;
  category: RewardCategory;
  evaluator: { worker: string; version: string; model: string | null; modelStatus: (typeof MODEL_STATUSES)[number]; policyId: string; policyVersion: number };
  eligibility: Gate[];
  dimensions: Record<Dimension, { score: number | null; basis: (typeof BASES)[number]; notes: string[] }>;
  overallScore: number | null;
  recommendedBand: BandId | 'below-threshold' | null;
  proposedPoints: number | null;
  duplicates: { kind: 'exact' | 'near'; scope: 'accepted' | 'pending-other-account' | 'pending-same-account'; ref: string; similarity: number }[];
  orthography: { original: string; normalizedNfc: string; changed: boolean; rulesApplied: string; findings: { rule: string; severity: 'info' | 'warning'; message: string }[] };
  alignment: { status: 'aligned' | 'uncertain' | 'not-applicable' | 'unavailable'; notes: string[] };
  audio: null | { status: 'usable' | 'issues' | 'unavailable' | 'not-applicable'; durationSeconds: number | null; speechSeconds: number | null; clippingRatio: number | null; silenceRatio: number | null; notes: string[] };
  uncertainty: { aspect: string; detail: string }[];
  reasons: string[];
  clarifications: string[];
  evidence: { ref: string; kind: 'trusted-reference' | 'orthography-rule' | 'accepted-record' | 'model-finding' | 'measurement'; summary: string }[];
  kawuri: { status: (typeof MODEL_STATUSES)[number]; findings: { aspect: string; observation: string; selfReportedConfidence: 'low' | 'medium' | 'high' }[] };
  routing: 'validator-review';
  completedAt: string;
}

class ResultError extends Error {}

function str(value: unknown, path: string, max = 2000): string {
  if (typeof value !== 'string' || value.length > max) throw new ResultError(`${path} must be a string ≤ ${max}.`);
  return value;
}
function oneOf<T extends string>(value: unknown, allowed: readonly T[], path: string): T {
  if (!allowed.includes(value as T)) throw new ResultError(`${path} must be one of ${allowed.join(', ')}.`);
  return value as T;
}
function num(value: unknown, path: string, min: number, max: number, nullable = false): number | null {
  if (value === null && nullable) return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw new ResultError(`${path} must be a number in [${min}, ${max}].`);
  return value;
}
function list<T>(value: unknown, path: string, max: number, each: (item: unknown, path: string) => T): T[] {
  if (!Array.isArray(value) || value.length > max) throw new ResultError(`${path} must be a list of at most ${max}.`);
  return value.map((item, index) => each(item, `${path}[${index}]`));
}
function obj(value: unknown, path: string): Json {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ResultError(`${path} must be an object.`);
  return value as Json;
}
function exact(value: Json, keys: string[], path: string) {
  const extra = Object.keys(value).filter(key => !keys.includes(key));
  if (extra.length) throw new ResultError(`${path} has unexpected fields: ${extra.join(', ')}.`);
}

/**
 * Strict validation of a worker result. Unknown fields, out-of-range numbers
 * and mismatched identities are refused: a worker bug or a manipulated job
 * document must not become a points decision.
 */
export function validateWorkerResult(raw: unknown, expected: { submissionId: string; contributionKey: string; category: RewardCategory }): WorkerResult {
  const r = obj(raw, 'result');
  exact(r, ['schemaVersion', 'submissionId', 'revisionId', 'contributionKey', 'category', 'evaluator', 'eligibility', 'dimensions', 'overallScore',
    'recommendedBand', 'proposedPoints', 'duplicates', 'orthography', 'alignment', 'audio', 'uncertainty', 'reasons', 'clarifications', 'evidence',
    'kawuri', 'routing', 'completedAt'], 'result');
  if (r.schemaVersion !== RESULT_SCHEMA_VERSION) throw new ResultError('Unsupported schemaVersion.');
  if (r.submissionId !== expected.submissionId || r.contributionKey !== expected.contributionKey || r.category !== expected.category) {
    throw new ResultError('Result identity does not match the job.');
  }
  const ev = obj(r.evaluator, 'evaluator');
  exact(ev, ['worker', 'version', 'model', 'modelStatus', 'policyId', 'policyVersion'], 'evaluator');
  const dims = obj(r.dimensions, 'dimensions');
  exact(dims, [...DIMENSIONS], 'dimensions');
  const dimensions = Object.fromEntries(DIMENSIONS.map(d => {
    const v = obj(dims[d], `dimensions.${d}`);
    exact(v, ['score', 'basis', 'notes'], `dimensions.${d}`);
    const score = num(v.score, `dimensions.${d}.score`, 0, 100, true);
    if (score !== null && !Number.isInteger(score)) throw new ResultError(`dimensions.${d}.score must be whole.`);
    return [d, { score, basis: oneOf(v.basis, BASES, `dimensions.${d}.basis`), notes: list(v.notes, `dimensions.${d}.notes`, 12, (n, p) => str(n, p, 500)) }];
  })) as WorkerResult['dimensions'];
  // A model proposal is never "verified": accuracy may only rest on trusted references or a validator.
  if (dimensions.accuracy.basis === 'model-proposal' && dimensions.accuracy.score !== null && dimensions.accuracy.score > 79) {
    throw new ResultError('An accuracy score above 79 cannot rest on a model proposal alone.');
  }
  const orth = obj(r.orthography, 'orthography');
  exact(orth, ['original', 'normalizedNfc', 'changed', 'rulesApplied', 'findings'], 'orthography');
  const align = obj(r.alignment, 'alignment');
  exact(align, ['status', 'notes'], 'alignment');
  let audio: WorkerResult['audio'] = null;
  if (r.audio !== null) {
    const a = obj(r.audio, 'audio');
    exact(a, ['status', 'durationSeconds', 'speechSeconds', 'clippingRatio', 'silenceRatio', 'notes'], 'audio');
    audio = { status: oneOf(a.status, ['usable', 'issues', 'unavailable', 'not-applicable'] as const, 'audio.status'),
      durationSeconds: num(a.durationSeconds, 'audio.durationSeconds', 0, 36000, true), speechSeconds: num(a.speechSeconds, 'audio.speechSeconds', 0, 36000, true),
      clippingRatio: num(a.clippingRatio, 'audio.clippingRatio', 0, 1, true), silenceRatio: num(a.silenceRatio, 'audio.silenceRatio', 0, 1, true),
      notes: list(a.notes, 'audio.notes', 12, (n, p) => str(n, p, 500)) };
  }
  const kawuri = obj(r.kawuri, 'kawuri');
  exact(kawuri, ['status', 'findings'], 'kawuri');
  const band = r.recommendedBand === null ? null : oneOf(r.recommendedBand, ['standard', 'strong', 'exceptional', 'below-threshold'] as const, 'recommendedBand');
  if (r.routing !== 'validator-review') throw new ResultError('Every assessment routes to a validator in this release.');
  return {
    schemaVersion: 1, submissionId: expected.submissionId, revisionId: str(r.revisionId, 'revisionId', 200),
    contributionKey: expected.contributionKey, category: expected.category,
    evaluator: { worker: str(ev.worker, 'evaluator.worker', 80), version: str(ev.version, 'evaluator.version', 40),
      model: ev.model === null ? null : str(ev.model, 'evaluator.model', 80), modelStatus: oneOf(ev.modelStatus, MODEL_STATUSES, 'evaluator.modelStatus'),
      policyId: str(ev.policyId, 'evaluator.policyId', 120), policyVersion: num(ev.policyVersion, 'evaluator.policyVersion', 1, 1e6) as number },
    eligibility: list(r.eligibility, 'eligibility', 20, (g, p) => { const v = obj(g, p); exact(v, ['id', 'status', 'detail'], p);
      return { id: str(v.id, `${p}.id`, 60), status: oneOf(v.status, ['pass', 'fail', 'needs-review'] as const, `${p}.status`), detail: str(v.detail, `${p}.detail`, 500) }; }),
    dimensions,
    overallScore: num(r.overallScore, 'overallScore', 0, 100, true),
    recommendedBand: band,
    proposedPoints: r.proposedPoints === null ? null : num(r.proposedPoints, 'proposedPoints', 0, 10000) as number,
    duplicates: list(r.duplicates, 'duplicates', 20, (d, p) => { const v = obj(d, p); exact(v, ['kind', 'scope', 'ref', 'similarity'], p);
      return { kind: oneOf(v.kind, ['exact', 'near'] as const, `${p}.kind`), scope: oneOf(v.scope, ['accepted', 'pending-other-account', 'pending-same-account'] as const, `${p}.scope`),
        ref: str(v.ref, `${p}.ref`, 300), similarity: num(v.similarity, `${p}.similarity`, 0, 1) as number }; }),
    orthography: { original: str(orth.original, 'orthography.original', 5000), normalizedNfc: str(orth.normalizedNfc, 'orthography.normalizedNfc', 5000),
      changed: orth.changed === true, rulesApplied: str(orth.rulesApplied, 'orthography.rulesApplied', 60),
      findings: list(orth.findings, 'orthography.findings', 30, (f, p) => { const v = obj(f, p); exact(v, ['rule', 'severity', 'message'], p);
        return { rule: str(v.rule, `${p}.rule`, 80), severity: oneOf(v.severity, ['info', 'warning'] as const, `${p}.severity`), message: str(v.message, `${p}.message`, 500) }; }) },
    alignment: { status: oneOf(align.status, ['aligned', 'uncertain', 'not-applicable', 'unavailable'] as const, 'alignment.status'),
      notes: list(align.notes, 'alignment.notes', 12, (n, p) => str(n, p, 500)) },
    audio,
    uncertainty: list(r.uncertainty, 'uncertainty', 20, (u, p) => { const v = obj(u, p); exact(v, ['aspect', 'detail'], p);
      return { aspect: str(v.aspect, `${p}.aspect`, 40), detail: str(v.detail, `${p}.detail`, 500) }; }),
    reasons: list(r.reasons, 'reasons', 20, (n, p) => str(n, p, 500)),
    clarifications: list(r.clarifications, 'clarifications', 5, (n, p) => str(n, p, 300)),
    evidence: list(r.evidence, 'evidence', 30, (e, p) => { const v = obj(e, p); exact(v, ['ref', 'kind', 'summary'], p);
      return { ref: str(v.ref, `${p}.ref`, 300), kind: oneOf(v.kind, ['trusted-reference', 'orthography-rule', 'accepted-record', 'model-finding', 'measurement'] as const, `${p}.kind`),
        summary: str(v.summary, `${p}.summary`, 500) }; }),
    kawuri: { status: oneOf(kawuri.status, MODEL_STATUSES, 'kawuri.status'),
      findings: list(kawuri.findings, 'kawuri.findings', 12, (f, p) => { const v = obj(f, p); exact(v, ['aspect', 'observation', 'selfReportedConfidence'], p);
        return { aspect: str(v.aspect, `${p}.aspect`, 40), observation: str(v.observation, `${p}.observation`, 600),
          selfReportedConfidence: oneOf(v.selfReportedConfidence, ['low', 'medium', 'high'] as const, `${p}.selfReportedConfidence`) }; }) },
    routing: 'validator-review',
    completedAt: str(r.completedAt, 'completedAt', 40),
  };
}

/** The server's own reading of the worker's scores; never trusts the worker's arithmetic. */
export function automatedEstimate(policy: AwardPolicyConfig, category: RewardCategory, result: WorkerResult) {
  const scores: DimensionScores = Object.fromEntries(DIMENSIONS.map(d => [d, result.dimensions[d].score])) as DimensionScores;
  try {
    const award = computeAward(policy, category, scores);
    return { award, matchesWorker: result.proposedPoints === null || result.proposedPoints === award.points };
  } catch (error) {
    if (error instanceof PolicyError) return { award: null, matchesWorker: result.proposedPoints === null };
    throw error;
  }
}

/** Where a job id comes from: the revision, the evaluator contract and the policy. Repeated events create nothing new. */
export function jobIdFor(submissionId: string, policyId: string, attempt = 1): string {
  const base = createHash('sha256').update(`${submissionId}|v${RESULT_SCHEMA_VERSION}|${policyId}`).digest('hex').slice(0, 32);
  return attempt > 1 ? `${base}_a${attempt}` : base;
}

/** What a contributor may see about one assessment: no raw model output, no validator identity. */
export function contributorAssessmentView(doc: { id: string; data: Json }) {
  const d = doc.data;
  const status = (ASSESSMENT_STATUSES as readonly string[]).includes(String(d.status)) ? d.status as AssessmentStatus : 'queued';
  const award = (d.award ?? null) as Json | null;
  const validator = (d.validator ?? null) as Json | null;
  const estimate = (d.estimate ?? null) as Json | null;
  const snapshot = (d.content ?? {}) as Json;
  return {
    id: doc.id,
    submissionId: String(d.submissionId ?? doc.id),
    category: String(d.category ?? ''),
    categoryLabel: String((d.policy as Json | undefined)?.categoryLabel ?? d.category ?? ''),
    title: String(snapshot.englishMeaning ?? '').slice(0, 160),
    kasem: String(snapshot.kasemText ?? '').slice(0, 160),
    status, statusLabel: d.reviewRequest && (d.reviewRequest as Json).open ? 'Review requested' : CONTRIBUTOR_STATUS[status].label,
    statusDetail: CONTRIBUTOR_STATUS[status].detail,
    points: status === 'awarded' && award ? Number(award.points ?? 0) : null,
    settledPoints: Number((d.settlement as Json | undefined)?.settledPoints ?? 0) || null,
    estimate: ['queued', 'assessing', 'validator_review'].includes(status) && estimate && typeof estimate.points === 'number'
      ? { points: Number(estimate.points), label: 'Estimate from automatic checks — not confirmed, not spendable' } : null,
    calculation: award ? String(award.calculation ?? '') : '',
    calc: award ? { basePoints: Number(award.basePoints ?? 0), effortPoints: Number(award.effortPoints ?? 0), multiplierBps: Number(award.multiplierBps ?? 0) } : null,
    band: award ? String(award.bandLabel ?? '') : '',
    feedback: validator ? String(validator.messageToContributor ?? '') : '',
    ineligibleReason: status === 'ineligible' && validator ? INELIGIBLE_REASONS[String(validator.ineligibleReason)] ?? '' : '',
    improvement: Array.isArray(d.improvement) ? (d.improvement as unknown[]).map(String).slice(0, 5) : [],
    clarification: status === 'needs_clarification' ? String((d.clarification as Json | undefined)?.message ?? '') : '',
    reviewRequestOpen: Boolean(d.reviewRequest && (d.reviewRequest as Json).open),
    canRequestReview: ['awarded', 'ineligible', 'eligible'].includes(status) && !(d.reviewRequest && (d.reviewRequest as Json).open),
    canRespond: status === 'needs_clarification',
    publicationStatus: String(d.publicationStatus ?? ''),
    createdAt: String(d.createdAt ?? ''),
    updatedAt: String(d.updatedAt ?? ''),
  };
}

/* ── Settlement ────────────────────────────────────────────────────────────── */

export interface SettlementOutcome { status: 'awarded' | 'eligible'; entryId: string | null; settledPoints: number; note: string }

/**
 * Settles a confirmed award inside the caller's transaction. All reads happen
 * here before any write, so call it before writing anything else.
 */
export async function settleAward(db: Firestore, tx: Transaction, input: {
  assessmentId: string; assessmentRevision: number; contributionKey: string; contributorId: string; points: number;
  allowReduction: boolean; actor: { kind: 'validator' | 'finance' | 'system'; id: string }; policy: { id: string; version: number }; now: string;
}): Promise<{ outcome: SettlementOutcome; commit: () => void }> {
  const awardRef = db.collection(AWARDS).doc(input.contributionKey);
  const legacyCreditRef = db.doc(`contributorAccounts/${input.contributorId}/rewardCredits/${input.contributionKey}`);
  const baseEntryId = entryId('award', input.contributionKey);
  const [award, legacyCredit, baseEntry] = await Promise.all([tx.get(awardRef), tx.get(legacyCreditRef), tx.get(ledgerEntryRef(db, baseEntryId))]);
  const session = await openLedger(db, tx, input.contributorId, input.now);
  const settled = award.exists ? Number(award.get('settledPoints') ?? 0) : 0;
  const noop = (outcome: SettlementOutcome) => ({ outcome, commit: () => commitLedger(session) });
  if (!award.exists && legacyCredit.exists) {
    // Paid under the flat legacy rule (before or during rollout). Never paid again.
    const legacyPoints = Number(legacyCredit.get('points') ?? 0);
    return { outcome: { status: 'awarded', entryId: null, settledPoints: legacyPoints, note: `Already paid ${legacyPoints} points under the previous flat rule; not paid again.` },
      commit: () => {
        tx.set(awardRef, { contributionKey: input.contributionKey, contributorId: input.contributorId, settledPoints: legacyPoints, source: 'legacy-flat',
          lastAssessmentId: input.assessmentId, updatedAt: input.now, history: [{ at: input.now, points: legacyPoints, source: 'legacy-flat' }] });
        commitLedger(session);
      } };
  }
  if (!award.exists && baseEntry.exists) {
    // A ledger award exists without its summary: only possible if a previous run
    // failed between documents, which a transaction prevents. Refuse rather than guess.
    throw new HttpsError('aborted', 'This contribution’s award record is inconsistent. Finance must reconcile it before settling.');
  }
  let delta = input.points - settled;
  if (delta < 0 && !input.allowReduction) delta = 0;
  if (delta === 0) {
    return noop({ status: 'awarded', entryId: null, settledPoints: settled, note: settled ? 'No change to the settled award.' : 'No points due.' });
  }
  const id = award.exists ? entryId('awardadj', `${input.contributionKey}:${input.assessmentId}:${input.assessmentRevision}`) : baseEntryId;
  const existing = award.exists ? await tx.get(ledgerEntryRef(db, id)) : null;
  if (existing?.exists) return noop({ status: 'awarded', entryId: id, settledPoints: settled, note: 'Already settled.' });
  try {
    post(session, { id, type: award.exists ? 'award_adjustment' : 'award', points: delta,
      reason: award.exists ? `Authorised award change for contribution ${input.contributionKey.slice(0, 12)}.` : 'Validator-confirmed training data.',
      actor: input.actor, policy: input.policy,
      refs: { assessmentId: input.assessmentId, contributionKey: input.contributionKey, assessmentRevision: input.assessmentRevision } });
  } catch (error) {
    if (error instanceof LedgerError) {
      return noop({ status: 'eligible', entryId: null, settledPoints: settled, note: `Not settled: ${error.message} Finance must review.` });
    }
    throw error;
  }
  const next = settled + delta;
  return {
    outcome: { status: 'awarded', entryId: id, settledPoints: next, note: award.exists ? `Adjusted by ${delta > 0 ? '+' : ''}${delta}.` : 'Settled.' },
    commit: () => {
      tx.set(awardRef, { contributionKey: input.contributionKey, contributorId: input.contributorId, settledPoints: next, source: 'assessed',
        lastAssessmentId: input.assessmentId, updatedAt: input.now,
        history: [...((award.get('history') as unknown[] | undefined) ?? []).slice(-19), { at: input.now, points: next, delta, entryId: id, assessmentId: input.assessmentId }] });
      commitLedger(session);
    },
  };
}

/* ── Triggers ──────────────────────────────────────────────────────────────── */

function policySnapshot(record: PolicyRecord<AwardPolicyConfig>, category: RewardCategory) {
  const c = record.config.categories[category];
  return { id: record.id, version: record.version, categoryLabel: c.label, category: c, bands: record.config.bands };
}

/**
 * Opens an assessment for each rewardable revision, queues the worker job when
 * the worker is on, and reacts to withdrawal or a consent change. Idempotent:
 * re-delivered events find the assessment and the job already there.
 */
export const onSubmissionForReward = onDocumentWritten(
  { document: 'submissions/{submissionId}', region: 'us-central1' }, async event => {
    const submissionId = event.params.submissionId;
    const db = getFirestore();
    const assessmentRef = db.collection(ASSESSMENTS).doc(submissionId);
    await db.runTransaction(async tx => {
      const [snap, assessment] = await Promise.all([tx.get(db.doc(`submissions/${submissionId}`)), tx.get(assessmentRef)]);
      const submission = snap.data();
      const now = new Date().toISOString();
      if (!snap.exists || !submission) {
        if (assessment.exists && !['awarded', 'ineligible', 'superseded'].includes(String(assessment.get('status')))) {
          tx.update(assessmentRef, { status: 'ineligible', updatedAt: now, revision: Number(assessment.get('revision') ?? 0) + 1,
            validator: { decision: 'system', ineligibleReason: 'missing-permission', messageToContributor: 'The contribution was removed.', at: now } });
        }
        return;
      }
      if (!isRewardable(submission)) return;
      const category = rewardCategoryFor(submission);
      if (!category) return;
      const system = await loadRewardSystem(db, tx);
      const categoryPolicy = system.award.config.categories[category];
      const gates = eligibilityGates(submission, categoryPolicy);
      const consentFailed = gates.some(g => ['training-permission', 'not-withdrawn'].includes(g.id) && g.status === 'fail');
      if (assessment.exists) {
        const status = String(assessment.get('status'));
        const patch: Json = { publicationStatus: String(submission.status ?? ''), gates, updatedAt: now };
        if (consentFailed && status === 'awarded') {
          patch.financeAttention = 'Training permission was withdrawn after the award settled. No automatic clawback; Finance decides.';
          tx.delete(db.doc(`contributorTrainingPairs/${submissionId}`));
        } else if (consentFailed && !['ineligible', 'superseded'].includes(status)) {
          Object.assign(patch, { status: 'ineligible', revision: Number(assessment.get('revision') ?? 0) + 1,
            validator: { decision: 'system', ineligibleReason: 'missing-permission', messageToContributor: 'Training permission is no longer granted.', at: now } });
          tx.delete(db.doc(`contributorTrainingPairs/${submissionId}`));
        }
        tx.update(assessmentRef, patch);
        return;
      }
      const contributionKey = contributionKeyFor(submissionId, submission);
      const previousId = typeof submission.revisionOf === 'string' ? submission.revisionOf : '';
      const previous = previousId ? await tx.get(db.collection(ASSESSMENTS).doc(previousId)) : null;
      const input = workerInput(submission, category);
      const blocked = gates.some(g => g.status === 'fail');
      const queue = !blocked && system.flags.assessmentWorker === 'on';
      const jobId = jobIdFor(submissionId, system.award.id);
      tx.create(assessmentRef, {
        id: submissionId, submissionId, revisionId: submissionId, contributionKey, contributorId: String(submission.authUid),
        category, revisionOf: previousId || null, publicationStatus: String(submission.status ?? ''),
        status: blocked ? 'ineligible' : queue ? 'queued' : 'validator_review',
        gates, content: { kasemText: input.kasemText, englishMeaning: input.englishMeaning, alternatives: input.alternatives,
          context: input.context, literalTranslation: input.literalTranslation, dialect: input.dialect, media: input.media,
          consentVersion: input.permissions.consentVersion },
        policy: policySnapshot(system.award, category),
        automated: queue ? { status: 'queued', jobId } : { status: 'not-run', reason: blocked ? 'An eligibility gate failed.' : 'The assessment worker is switched off; a validator assesses directly.' },
        estimate: null, validator: blocked ? { decision: 'system', ineligibleReason: gates.find(g => g.status === 'fail')?.id === 'training-permission' ? 'missing-permission' : 'other',
          messageToContributor: gates.find(g => g.status === 'fail')?.detail ?? '', at: now } : null,
        award: null, reviewRequest: null, clarification: null, improvement: [], revision: 1, createdAt: now, updatedAt: now,
      });
      if (queue) {
        tx.create(db.collection(JOBS).doc(jobId), { id: jobId, assessmentId: submissionId, submissionId, contributionKey,
          contributorId: String(submission.authUid), category, attempt: 1, status: 'queued', createdAt: now, leaseUntil: null,
          input, policy: policySnapshot(system.award, category), result: null, error: null });
      }
      if (previous?.exists && !['awarded', 'superseded', 'ineligible'].includes(String(previous.get('status')))) {
        tx.update(previous.ref, { status: 'superseded', supersededBy: submissionId, updatedAt: now, revision: Number(previous.get('revision') ?? 0) + 1 });
      }
    });
  });

/** Takes a finished worker job into its assessment after strict validation. */
export const onAssessmentJobWritten = onDocumentWritten(
  { document: `${JOBS}/{jobId}`, region: 'us-central1' }, async event => {
    const after = event.data?.after;
    if (!after?.exists) return;
    const status = String(after.get('status'));
    if (!['running', 'completed', 'failed'].includes(status)) return;
    const db = getFirestore();
    const job = after.data() as Json;
    const assessmentRef = db.collection(ASSESSMENTS).doc(String(job.assessmentId));
    await db.runTransaction(async tx => {
      const [assessment, system] = await Promise.all([tx.get(assessmentRef), loadRewardSystem(db, tx)]);
      if (!assessment.exists) return;
      const automated = assessment.get('automated') as Json | undefined;
      // Only the job the assessment currently points at, and only once.
      if (automated?.jobId !== after.id || automated?.status !== 'queued') return;
      const now = new Date().toISOString();
      const current = String(assessment.get('status'));
      if (status === 'running') {
        if (current === 'queued') tx.update(assessmentRef, { status: 'assessing', updatedAt: now });
        return;
      }
      const nextStatus = ['queued', 'assessing'].includes(current) ? 'validator_review' : current;
      const revision = Number(assessment.get('revision') ?? 0) + 1;
      if (status === 'failed') {
        const attempt = Number(job.attempt ?? 1);
        if (attempt < MAX_JOB_ATTEMPTS && job.retryable !== false) return; // the sweep retries it
        tx.update(assessmentRef, { status: nextStatus, revision, updatedAt: now,
          automated: { status: 'unavailable', jobId: after.id, reason: 'The assessment worker could not finish. A validator assesses directly; nothing was assumed.',
            error: String(job.error ?? '').slice(0, 300) } });
        return;
      }
      let result: WorkerResult;
      try {
        result = validateWorkerResult(job.result, { submissionId: String(job.submissionId), contributionKey: String(job.contributionKey), category: job.category as RewardCategory });
      } catch (error) {
        logger.warn('Assessment worker result refused', { jobId: after.id, reason: (error as Error).message });
        tx.update(assessmentRef, { status: nextStatus, revision, updatedAt: now,
          automated: { status: 'unavailable', jobId: after.id, reason: 'The worker result failed validation and was discarded. A validator assesses directly.' } });
        return;
      }
      const estimate = automatedEstimate(system.award.config, result.category, result);
      tx.update(assessmentRef, {
        status: nextStatus, revision, updatedAt: now,
        automated: { status: 'completed', jobId: after.id, result, serverAgreesWithWorkerPoints: estimate.matchesWorker },
        estimate: estimate.award ? { points: estimate.award.points, band: estimate.award.band, score: estimate.award.score,
          calculation: estimate.award.calculation, basis: 'automated-recommendation' } : null,
        improvement: result.clarifications.slice(0, 5),
      });
    });
  });

/** Re-queues stalled jobs; after the last attempt the assessment goes to a validator, stated as such. */
export const sweepAssessmentJobs = onSchedule({ schedule: 'every 15 minutes', region: 'us-central1' }, async () => {
  const db = getFirestore();
  const cutoff = new Date(Date.now() - 10 * 60_000).toISOString();
  const stale = await db.collection(JOBS).where('status', 'in', ['queued', 'running', 'failed']).where('createdAt', '<', cutoff).limit(100).get();
  for (const job of stale.docs) {
    await db.runTransaction(async tx => {
      const fresh = await tx.get(job.ref);
      const data = fresh.data() as Json | undefined;
      if (!data || !['queued', 'running', 'failed'].includes(String(data.status))) return;
      if (data.status === 'running' && typeof data.leaseUntil === 'string' && data.leaseUntil > new Date().toISOString()) return;
      const attempt = Number(data.attempt ?? 1);
      const assessmentRef = db.collection(ASSESSMENTS).doc(String(data.assessmentId));
      const assessment = await tx.get(assessmentRef);
      const now = new Date().toISOString();
      tx.update(job.ref, { status: 'abandoned', abandonedAt: now });
      if (attempt >= MAX_JOB_ATTEMPTS || data.retryable === false) {
        if (assessment.exists && ['queued', 'assessing'].includes(String(assessment.get('status')))) {
          tx.update(assessmentRef, { status: 'validator_review', updatedAt: now, revision: Number(assessment.get('revision') ?? 0) + 1,
            automated: { status: 'unavailable', jobId: job.id, reason: 'The assessment worker did not respond after several attempts. A validator assesses directly.' } });
        }
        return;
      }
      const nextId = jobIdFor(String(data.submissionId), String((data.policy as Json).id), attempt + 1);
      tx.create(db.collection(JOBS).doc(nextId), { ...data, id: nextId, attempt: attempt + 1, status: 'queued', createdAt: now, leaseUntil: null, result: null, error: null });
      if (assessment.exists) tx.update(assessmentRef, { 'automated.jobId': nextId, updatedAt: now });
    });
  }
});

/* ── Validator decision ────────────────────────────────────────────────────── */

function parseScores(raw: unknown): DimensionScores {
  const input = (raw && typeof raw === 'object' ? raw : {}) as Json;
  const scores: DimensionScores = {};
  for (const d of DIMENSIONS) {
    const value = input[d];
    if (value === null || value === undefined || value === '') { scores[d] = null; continue; }
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 100) throw new HttpsError('invalid-argument', `The ${d} score must be a whole number from 0 to 100.`);
    scores[d] = value;
  }
  return scores;
}

export const decideRewardAssessment = onCall(CONTRIBUTOR_CALL_OPTIONS, guarded('decideRewardAssessment', async req => {
  const actor = requireAuth(req);
  requireRole(req, 'validator');
  await consumeRateLimit('decideRewardAssessment', actor, 120);
  const data = (req.data ?? {}) as Json;
  const assessmentId = boundedText(data.assessmentId, 128, 'Assessment');
  if (!/^[A-Za-z0-9_-]+$/.test(assessmentId)) throw new HttpsError('invalid-argument', 'Invalid assessment.');
  const decision = String(data.decision);
  if (!['confirm', 'ineligible', 'clarify'].includes(decision)) throw new HttpsError('invalid-argument', 'Choose confirm, not eligible or ask for clarification.');
  const reason = boundedText(data.reason, 1000, 'Reason', { optional: true, multiline: true });
  const message = boundedText(data.messageToContributor, 1000, 'Message to the contributor', { optional: true, multiline: true });
  const expectedRevision = Number(data.expectedRevision);
  const db = getFirestore();
  const ref = db.collection(ASSESSMENTS).doc(assessmentId);
  const now = new Date().toISOString();
  const result = await db.runTransaction(async tx => {
    const [snap, system] = await Promise.all([tx.get(ref), loadRewardSystem(db, tx)]);
    if (!snap.exists) throw new HttpsError('not-found', 'Assessment not found.');
    const a = snap.data() as Json;
    if (a.contributorId === actor) throw new HttpsError('permission-denied', 'You cannot assess your own contribution.');
    if (Number.isFinite(expectedRevision) && expectedRevision !== Number(a.revision)) {
      throw new HttpsError('aborted', 'This assessment changed while you were reviewing it. Load the latest version.');
    }
    if (a.status === 'superseded') throw new HttpsError('failed-precondition', 'A newer revision replaced this one. Assess the newer revision.');
    const category = a.category as RewardCategory;
    const gates = (a.gates ?? []) as Gate[];
    const automated = a.automated as Json | undefined;
    const workerResult = automated?.status === 'completed' ? automated.result as WorkerResult : null;
    const wasAwarded = Boolean((a.settlement as Json | undefined)?.settledPoints) || a.status === 'awarded';
    const revision = Number(a.revision ?? 0) + 1;
    const audit = (action: string, after: Json) => {
      const auditRef = db.collection('auditLogs').doc();
      tx.set(auditRef, { id: auditRef.id, ...rewardAudit({ actor: { collection: 'staff', id: actor }, action: `contributor.reward.assessment.${action}`,
        target: { collection: ASSESSMENTS, id: assessmentId }, before: { status: a.status }, after, reason, at: now,
        metadata: { contributorId: a.contributorId, contributionKey: a.contributionKey, category } }) });
    };
    if (decision === 'clarify') {
      if (message.length < 10) throw new HttpsError('invalid-argument', 'Write the question for the contributor (at least 10 characters).');
      tx.update(ref, { status: 'needs_clarification', revision, updatedAt: now, reviewRequest: a.reviewRequest ? { ...(a.reviewRequest as Json), open: false } : null,
        clarification: { message, at: now, by: actor }, validator: { ...(a.validator as Json ?? {}), lastAction: 'clarify', at: now, actor } });
      audit('clarify', { status: 'needs_clarification' });
      return { status: 'needs_clarification' };
    }
    if (decision === 'ineligible') {
      const code = String(data.ineligibleReason);
      if (!(code in INELIGIBLE_REASONS)) throw new HttpsError('invalid-argument', 'Choose why it is not eligible.');
      if (message.length < 10) throw new HttpsError('invalid-argument', 'Tell the contributor why, with something they can act on (at least 10 characters).');
      tx.update(ref, { status: 'ineligible', revision, updatedAt: now, reviewRequest: a.reviewRequest ? { ...(a.reviewRequest as Json), open: false } : null,
        validator: { decision: 'ineligible', ineligibleReason: code, messageToContributor: message, reason, actor, at: now },
        ...(wasAwarded ? { financeAttention: 'Marked not eligible after points settled. No automatic clawback; Finance decides any adjustment.' } : {}) });
      if (system.flags.awardMode === 'assessed') tx.delete(db.doc(`contributorTrainingPairs/${assessmentId}`));
      audit('ineligible', { status: 'ineligible', ineligibleReason: code });
      return { status: 'ineligible' };
    }
    // confirm
    const failed = gates.filter(g => g.status === 'fail');
    if (failed.length) throw new HttpsError('failed-precondition', `An eligibility gate failed: ${failed.map(g => g.detail).join(' ')}`);
    const exactAccepted = workerResult?.duplicates.some(d => d.kind === 'exact' && d.scope === 'accepted');
    const resolution = String(data.duplicateResolution ?? '');
    if (exactAccepted && resolution !== 'distinct-variant') {
      throw new HttpsError('failed-precondition', 'The checks found an identical accepted record. Confirm it is a distinct, useful variant (with a reason) or mark it not eligible.');
    }
    if (exactAccepted && reason.length < 10) throw new HttpsError('invalid-argument', 'Explain why this is a distinct variant (at least 10 characters).');
    const scores = parseScores(data.scores);
    const effort = Number.isInteger(data.verifiedEffortQuantity) && Number(data.verifiedEffortQuantity) >= 0 ? Number(data.verifiedEffortQuantity) : 0;
    let award: AwardComputation;
    try { award = computeAward(system.award.config, category, scores, effort); }
    catch (error) { if (error instanceof PolicyError) throw new HttpsError('invalid-argument', error.message); throw error; }
    if (!award.band) {
      throw new HttpsError('failed-precondition', `A score of ${award.score} is below the lowest band, so there is no award. Ask for clarification or mark it not eligible.`);
    }
    const recommended = workerResult?.recommendedBand ?? null;
    const overrides = Boolean(recommended && recommended !== award.band);
    const settledBefore = Number((a.settlement as Json | undefined)?.settledPoints ?? 0);
    const reduces = wasAwarded && award.points < settledBefore;
    if ((overrides || reduces || wasAwarded) && reason.length < 10) {
      throw new HttpsError('invalid-argument', overrides ? 'Your band differs from the automatic recommendation. Give your reason (at least 10 characters).'
        : 'Changing a settled award needs a reason (at least 10 characters).');
    }
    const policyRef = { id: system.award.id, version: system.award.version };
    let settlement: { outcome: SettlementOutcome; commit: () => void } | null = null;
    if (system.flags.awardMode === 'assessed') {
      const contributorAccount = await tx.get(db.doc(`contributorAccounts/${a.contributorId}`));
      if (contributorAccount.get('status') === 'active') {
        settlement = await settleAward(db, tx, { assessmentId, assessmentRevision: revision, contributionKey: String(a.contributionKey),
          contributorId: String(a.contributorId), points: award.points, allowReduction: reduces, actor: { kind: 'validator', id: actor }, policy: policyRef, now });
      }
    }
    const status = settlement ? settlement.outcome.status : 'eligible';
    tx.update(ref, {
      status, revision, updatedAt: now,
      reviewRequest: a.reviewRequest ? { ...(a.reviewRequest as Json), open: false, resolvedAt: now } : null,
      validator: { decision: 'confirm', scores, verifiedEffortQuantity: effort, reason, messageToContributor: message, duplicateResolution: resolution || null,
        overridesRecommendation: overrides, actor, at: now },
      award: { ...award, policyId: policyRef.id, policyVersion: policyRef.version },
      calibration: { automatedBand: recommended, validatorBand: award.band, agreed: recommended ? recommended === award.band : null, modelStatus: workerResult?.evaluator.modelStatus ?? 'not-run' },
      settlement: settlement ? { settledPoints: settlement.outcome.settledPoints, entryId: settlement.outcome.entryId, note: settlement.outcome.note, at: now }
        : { settledPoints: settledBefore, entryId: null, note: system.flags.awardMode === 'assessed' ? 'The contributor account is not active; Finance must review.' : 'Assessed awards are not switched on yet; the previous flat rule still pays on approval.', at: now },
    });
    if (system.flags.awardMode === 'assessed') {
      // Training-ready: eligible for the curated dataset, decided here — independent of publication.
      tx.set(db.doc(`contributorTrainingPairs/${assessmentId}`), {
        id: assessmentId, language: 'xsm', english: (a.content as Json).englishMeaning, kasem: (a.content as Json).kasemText,
        alternatives: (a.content as Json).alternatives ?? [], context: (a.content as Json).context ?? '', dialect: (a.content as Json).dialect ?? '',
        literalTranslation: (a.content as Json).literalTranslation ?? '', sourceSubmission: assessmentId, contributorId: a.contributorId,
        kind: category === 'expressions' ? 'expression' : category, qualityBand: award.band, assessmentId, assessmentRevision: revision,
        trainingReady: true, reviewedAt: now, consentVersion: String((a.content as Json).consentVersion ?? ''),
      });
    }
    settlement?.commit();
    audit('confirm', { status, band: award.band, points: award.points, settled: settlement?.outcome.settledPoints ?? null });
    return { status, points: award.points, calculation: award.calculation, settlement: settlement?.outcome ?? null };
  });
  return { assessmentId, ...result };
}));

/** The contributor answers a clarification or asks for a review. Never changes points by itself. */
export const respondToRewardAssessment = onCall(CONTRIBUTOR_CALL_OPTIONS, guarded('respondToRewardAssessment', async req => {
  const uid = requireAuth(req);
  await consumeRateLimit('respondToRewardAssessment', uid, 20);
  const data = (req.data ?? {}) as Json;
  const assessmentId = boundedText(data.assessmentId, 128, 'Assessment');
  const kind = String(data.kind);
  if (!['clarification', 'review'].includes(kind)) throw new HttpsError('invalid-argument', 'Unsupported response.');
  const message = boundedText(data.message, 1000, 'Message', { min: 10, multiline: true });
  const db = getFirestore();
  const ref = db.collection(ASSESSMENTS).doc(assessmentId);
  const now = new Date().toISOString();
  return db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists || snap.get('contributorId') !== uid) throw new HttpsError('not-found', 'Assessment not found.');
    const status = String(snap.get('status'));
    const responses = ((snap.get('contributorResponses') as unknown[] | undefined) ?? []).slice(-9);
    if (kind === 'clarification') {
      if (status !== 'needs_clarification') throw new HttpsError('failed-precondition', 'No question is waiting for your answer.');
      tx.update(ref, { status: 'validator_review', updatedAt: now, revision: Number(snap.get('revision') ?? 0) + 1,
        contributorResponses: [...responses, { kind, message, at: now }] });
      return { status: 'validator_review' };
    }
    if (!['awarded', 'ineligible', 'eligible'].includes(status)) throw new HttpsError('failed-precondition', 'A review can be requested once a decision has been made.');
    if ((snap.get('reviewRequest') as Json | null)?.open) throw new HttpsError('failed-precondition', 'A review is already open.');
    tx.update(ref, { status: 'validator_review', updatedAt: now, revision: Number(snap.get('revision') ?? 0) + 1,
      reviewRequest: { open: true, message, at: now, previousStatus: status }, contributorResponses: [...responses, { kind, message, at: now }] });
    return { status: 'validator_review' };
  });
}));

/** Settles assessments confirmed while flat awards were still on. Bounded; safe to repeat. */
export async function settleEligibleAwards(db: Firestore, limit = 200): Promise<{ settled: number; skipped: number }> {
  const rows = await db.collection(ASSESSMENTS).where('status', '==', 'eligible').limit(limit).get();
  let settled = 0, skipped = 0;
  for (const row of rows.docs) {
    const done = await db.runTransaction(async tx => {
      const [snap, system] = await Promise.all([tx.get(row.ref), loadRewardSystem(db, tx)]);
      if (snap.get('status') !== 'eligible' || system.flags.awardMode !== 'assessed') return false;
      const account = await tx.get(db.doc(`contributorAccounts/${snap.get('contributorId')}`));
      if (account.get('status') !== 'active') return false;
      const award = snap.get('award') as Json;
      const now = new Date().toISOString();
      const revision = Number(snap.get('revision') ?? 0) + 1;
      const result = await settleAward(db, tx, { assessmentId: row.id, assessmentRevision: revision, contributionKey: String(snap.get('contributionKey')),
        contributorId: String(snap.get('contributorId')), points: Number(award.points), allowReduction: false,
        actor: { kind: 'system', id: 'settleEligibleAwards' }, policy: { id: String(award.policyId), version: Number(award.policyVersion) }, now });
      tx.update(row.ref, { status: result.outcome.status, revision, updatedAt: now,
        settlement: { settledPoints: result.outcome.settledPoints, entryId: result.outcome.entryId, note: result.outcome.note, at: now } });
      result.commit();
      return result.outcome.status === 'awarded';
    });
    if (done) settled++; else skipped++;
  }
  return { settled, skipped };
}

export type { DocumentSnapshot, QualityBand, RewardSystem };
