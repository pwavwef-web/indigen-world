import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { getFirestore, type DocumentReference, type Transaction } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { logger } from 'firebase-functions';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { requireAuth } from './auth.js';
import { consumeRateLimit } from './rate-limit.js';
import { ARKESEL_API_KEY, isSmsConfigured, normalizeGhanaPhone, sendSmsToMsisdn } from './sms.js';
import {
  CONTRIBUTOR_CALL_OPTIONS,
  auditEntry,
  boundedText,
  guarded,
  maskTail,
  requireActiveContributor,
  requireFinance,
} from './contributor-common.js';
import {
  emptyCheck,
  runStatementCheck,
  statementCheckEnabled,
  type AutomatedCheck,
  type CheckState,
} from './contributor-statement-check.js';

/**
 * Contributor payout details and their verification.
 *
 * ── Two methods, two kinds of proof ───────────────────────────────────────
 * A **bank account** is verified by a finance reviewer looking at a statement
 * the contributor uploads. An optional automated check (see
 * contributor-statement-check.ts) compares three fields and files the result
 * as evidence; it never verifies anything by itself.
 *
 * A **MoMo wallet** has two separate facts, and the product keeps them apart
 * because they are proved by different things:
 *   1. control of the phone number — proved by a one-time code sent over the
 *      existing Arkesel integration and answered here;
 *   2. ownership of the wallet and its registered name — which an SMS code
 *      cannot prove, and for which this codebase has no provider-backed lookup.
 *      That stays `pending` until a finance reviewer decides it.
 *
 * ── Status vocabulary (per method) ────────────────────────────────────────
 *   not_started   no details on file (the section is absent)
 *   pending       submitted, waiting for a finance reviewer
 *   verified      a finance reviewer confirmed it
 *   needs_action  the reviewer needs something from the contributor
 *   rejected      the reviewer refused it; the reason says why
 *
 * Any change to verified details resets that method to `pending` and asks for
 * the evidence again: new bank details need a new statement, a new MoMo number
 * needs a new code and a new review. A finance decision names the version of
 * the details it was made against, so a decision can never land on details
 * the contributor changed after the reviewer opened them.
 *
 * ── Where things live ─────────────────────────────────────────────────────
 *   contributorPayoutProfiles/{uid}      the profile; server-only (rules deny)
 *   contributorMomoChallenges/{uid}      a pending code, hashed; server-only
 *   contributor-payout-statements/{uid}/{uploadId}/{file}
 *                                        Storage; the owner may create once,
 *                                        nobody may read from a client
 *   auditLogs                            every submission, decision and
 *                                        statement view
 *
 * Full account and wallet numbers leave this file only for finance reviewers.
 * Contributors see them masked after saving.
 */

export const PROFILES = 'contributorPayoutProfiles';
export const MOMO_CHALLENGES = 'contributorMomoChallenges';
export const PAYMENT_REQUESTS = 'contributorPaymentRequests';
export const STATEMENT_PREFIX = 'contributor-payout-statements';
export const STATEMENT_MAX_BYTES = 10 * 1024 * 1024;
export const STATEMENT_MIN_BYTES = 1024;
export const STATEMENT_TYPES: Readonly<Record<string, string>> = {
  'application/pdf': 'PDF',
  'image/jpeg': 'JPEG image',
  'image/png': 'PNG image',
};
export const HISTORY_LIMIT = 30;
export const STATEMENT_LINK_TTL_MS = 5 * 60_000;

export const MOMO_CODE_TTL_MS = 10 * 60_000;
export const MOMO_MAX_ATTEMPTS = 5;
export const MOMO_RESEND_COOLDOWN_MS = 60_000;
export const MOMO_STARTS_PER_HOUR = 5;
export const MOMO_CODES_PER_NUMBER_PER_HOUR = 3;
export const MOMO_CONFIRMS_PER_HOUR = 20;
const HOUR_MS = 60 * 60_000;

export type SectionStatus = 'pending' | 'verified' | 'needs_action' | 'rejected';
export type VerificationStatus = 'not_started' | SectionStatus;
export type Decision = 'verify' | 'needs_action' | 'reject';
export type PayoutMethod = 'bank' | 'momo';
export type MomoNetwork = 'mtn' | 'telecel' | 'at';

export const MOMO_NETWORKS: Readonly<Record<MomoNetwork, string>> = {
  mtn: 'MTN MoMo',
  telecel: 'Telecel Cash',
  at: 'AT Money (AirtelTigo)',
};

export interface StatementRef {
  path: string;
  contentType: string;
  sizeBytes: number;
  sha256: string;
  uploadedAt: string;
}

export interface BankSection {
  bankName: string;
  accountName: string;
  accountNumber: string;
  branch: string;
  currency: 'GHS';
  status: SectionStatus;
  statusReason: string;
  nextStep: string;
  statement: StatementRef | null;
  automatedCheck: AutomatedCheck;
  version: number;
  submittedAt: string;
  decidedAt: string | null;
  decidedBy: string | null;
  /** Saved by the first payment release, before statements were required. */
  legacy: boolean;
}

export interface MomoSection {
  network: MomoNetwork;
  walletNumber: string;
  registeredName: string;
  /** Control of the number, proved by a one-time code. Always set: an unconfirmed number is never saved here. */
  phoneVerifiedAt: string;
  /** Ownership and registered name, decided by a finance reviewer. */
  ownershipStatus: SectionStatus;
  statusReason: string;
  nextStep: string;
  version: number;
  submittedAt: string;
  decidedAt: string | null;
  decidedBy: string | null;
}

export interface HistoryEvent {
  at: string;
  method: PayoutMethod;
  action: string;
  status: string;
  note: string;
  actor: 'contributor' | 'finance' | 'system';
  /** The reviewer's uid. Finance views only. */
  actorId?: string;
}

export interface PayoutProfile {
  contributorId: string;
  schemaVersion: 2;
  preferredMethod: PayoutMethod | null;
  bank: BankSection | null;
  momo: MomoSection | null;
  history: HistoryEvent[];
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Normalisation: one shape, whatever was stored
// ---------------------------------------------------------------------------

const SECTION_STATUSES: readonly SectionStatus[] = ['pending', 'verified', 'needs_action', 'rejected'];

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function sectionStatus(value: unknown, fallback: SectionStatus = 'pending'): SectionStatus {
  return SECTION_STATUSES.includes(value as SectionStatus) ? value as SectionStatus : fallback;
}

function checkOf(value: unknown): AutomatedCheck {
  if (!value || typeof value !== 'object') return emptyCheck('not_run');
  const record = value as Record<string, unknown>;
  const states: readonly CheckState[] = ['off', 'not_run', 'consistent', 'mismatch', 'uncertain', 'unreadable', 'unavailable'];
  return {
    state: states.includes(record.state as CheckState) ? record.state as CheckState : 'not_run',
    fields: record.fields && typeof record.fields === 'object' ? record.fields as AutomatedCheck['fields'] : null,
    evidence: record.evidence && typeof record.evidence === 'object' ? record.evidence as AutomatedCheck['evidence'] : null,
    model: typeof record.model === 'string' ? record.model : null,
    ranAt: typeof record.ranAt === 'string' ? record.ranAt : null,
    unavailableReason: typeof record.unavailableReason === 'string' ? record.unavailableReason : null,
  };
}

function statementOf(value: unknown): StatementRef | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  if (typeof record.path !== 'string' || !record.path) return null;
  return {
    path: record.path,
    contentType: str(record.contentType),
    sizeBytes: Number(record.sizeBytes) || 0,
    sha256: str(record.sha256),
    uploadedAt: str(record.uploadedAt),
  };
}

function bankOf(value: unknown): BankSection | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  if (!str(record.accountNumber)) return null;
  return {
    bankName: str(record.bankName),
    accountName: str(record.accountName),
    accountNumber: str(record.accountNumber),
    branch: str(record.branch),
    currency: 'GHS',
    status: sectionStatus(record.status),
    statusReason: str(record.statusReason),
    nextStep: str(record.nextStep),
    statement: statementOf(record.statement),
    automatedCheck: checkOf(record.automatedCheck),
    version: Number(record.version) || 1,
    submittedAt: str(record.submittedAt),
    decidedAt: typeof record.decidedAt === 'string' ? record.decidedAt : null,
    decidedBy: typeof record.decidedBy === 'string' ? record.decidedBy : null,
    legacy: record.legacy === true,
  };
}

function momoOf(value: unknown): MomoSection | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const network = record.network as MomoNetwork;
  if (!str(record.walletNumber) || !(network in MOMO_NETWORKS)) return null;
  return {
    network,
    walletNumber: str(record.walletNumber),
    registeredName: str(record.registeredName),
    phoneVerifiedAt: str(record.phoneVerifiedAt),
    ownershipStatus: sectionStatus(record.ownershipStatus),
    statusReason: str(record.statusReason),
    nextStep: str(record.nextStep),
    version: Number(record.version) || 1,
    submittedAt: str(record.submittedAt),
    decidedAt: typeof record.decidedAt === 'string' ? record.decidedAt : null,
    decidedBy: typeof record.decidedBy === 'string' ? record.decidedBy : null,
  };
}

/**
 * Reads a stored profile in any shape this backend has ever written.
 *
 * The first payment release (2026-09-22) stored a flat, bank-only document:
 * `bankName, accountName, accountNumber, branch, verificationStatus,
 * verificationNote, verifiedAt, verifiedBy`. Those callables were never
 * deployed, so production is not expected to hold any, but a document of that
 * shape keeps its details and its status here — a verified account is not
 * silently downgraded — and is marked `legacy` so reviewers can see it was
 * accepted without a statement. The next save writes the current shape.
 */
export function normaliseProfile(uid: string, data: Record<string, unknown> | undefined): PayoutProfile {
  const empty: PayoutProfile = {
    contributorId: uid, schemaVersion: 2, preferredMethod: null, bank: null, momo: null,
    history: [], createdAt: '', updatedAt: '',
  };
  if (!data) return empty;
  if (data.schemaVersion === 2) {
    const bank = bankOf(data.bank);
    const momo = momoOf(data.momo);
    const preferred = data.preferredMethod === 'bank' || data.preferredMethod === 'momo' ? data.preferredMethod : null;
    return {
      ...empty,
      preferredMethod: preferred === 'bank' && !bank ? (momo ? 'momo' : null)
        : preferred === 'momo' && !momo ? (bank ? 'bank' : null) : preferred,
      bank,
      momo,
      history: Array.isArray(data.history) ? (data.history as HistoryEvent[]).slice(0, HISTORY_LIMIT) : [],
      createdAt: str(data.createdAt),
      updatedAt: str(data.updatedAt),
    };
  }
  if (str(data.accountNumber)) {
    const legacyStatus = data.verificationStatus === 'verified' ? 'verified'
      : data.verificationStatus === 'rejected' ? 'rejected' : 'pending';
    return {
      ...empty,
      preferredMethod: 'bank',
      bank: {
        bankName: str(data.bankName),
        accountName: str(data.accountName),
        accountNumber: str(data.accountNumber),
        branch: str(data.branch),
        currency: 'GHS',
        status: legacyStatus,
        statusReason: str(data.verificationNote),
        nextStep: '',
        statement: null,
        automatedCheck: emptyCheck('not_run'),
        version: 1,
        submittedAt: str(data.updatedAt) || str(data.createdAt),
        decidedAt: typeof data.verifiedAt === 'string' ? data.verifiedAt : null,
        decidedBy: typeof data.verifiedBy === 'string' ? data.verifiedBy : null,
        legacy: true,
      },
      createdAt: str(data.createdAt),
      updatedAt: str(data.updatedAt),
    };
  }
  return empty;
}

/** The profile as it is written back: always the current shape. */
export function storedProfile(profile: PayoutProfile): Record<string, unknown> {
  return {
    contributorId: profile.contributorId,
    schemaVersion: 2,
    preferredMethod: profile.preferredMethod,
    bank: profile.bank,
    momo: profile.momo,
    history: profile.history.slice(0, HISTORY_LIMIT),
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
  };
}

export function withHistory(profile: PayoutProfile, event: HistoryEvent): PayoutProfile {
  return { ...profile, history: [event, ...profile.history].slice(0, HISTORY_LIMIT) };
}

// ---------------------------------------------------------------------------
// Status transitions. Pure, so every rule is tested without Firestore.
// ---------------------------------------------------------------------------

export interface BankDetails {
  bankName: string;
  accountName: string;
  accountNumber: string;
  branch: string;
}

/**
 * Every submission is a fresh claim: new version, pending, reason cleared,
 * previous decision cleared. That is what makes "changing verified details
 * resets verification" hold without a special case.
 */
export function bankAfterSubmission(
  previous: BankSection | null,
  details: BankDetails,
  statement: StatementRef,
  now: string,
  checkEnabled: boolean,
): BankSection {
  return {
    ...details,
    currency: 'GHS',
    status: 'pending',
    statusReason: '',
    nextStep: '',
    statement,
    automatedCheck: emptyCheck(checkEnabled ? 'not_run' : 'off'),
    version: (previous?.version ?? 0) + 1,
    submittedAt: now,
    decidedAt: null,
    decidedBy: null,
    legacy: false,
  };
}

/**
 * A confirmed code for the wallet already on file refreshes the proof of
 * control and changes nothing else. Any other number, network or registered
 * name is a new wallet: new version, and ownership back to `pending`.
 */
export function momoAfterConfirmation(
  previous: MomoSection | null,
  confirmed: { network: MomoNetwork; walletNumber: string; registeredName: string },
  now: string,
): { momo: MomoSection; changed: boolean } {
  if (previous
    && previous.walletNumber === confirmed.walletNumber
    && previous.network === confirmed.network
    && previous.registeredName === confirmed.registeredName) {
    return { momo: { ...previous, phoneVerifiedAt: now }, changed: false };
  }
  return {
    momo: {
      ...confirmed,
      phoneVerifiedAt: now,
      ownershipStatus: 'pending',
      statusReason: '',
      nextStep: '',
      version: (previous?.version ?? 0) + 1,
      submittedAt: now,
      decidedAt: null,
      decidedBy: null,
    },
    changed: true,
  };
}

const DECISION_STATUS: Readonly<Record<Decision, SectionStatus>> = {
  verify: 'verified',
  needs_action: 'needs_action',
  reject: 'rejected',
};

export function statusLabel(status: VerificationStatus): string {
  return {
    not_started: 'not started',
    pending: 'pending review',
    verified: 'verified',
    needs_action: 'needs action',
    rejected: 'rejected',
  }[status];
}

/** A finance decision on one method, validated against the version the reviewer saw. */
export function decideSection<T extends BankSection | MomoSection>(
  method: PayoutMethod,
  section: T,
  input: { decision: Decision; reason: string; nextStep: string; version: number; actor: string; now: string },
): T {
  if (!Number.isInteger(input.version) || input.version !== section.version) {
    throw new HttpsError('aborted', 'These payment details changed after you opened them. Reload and review the latest version.');
  }
  const current = method === 'bank' ? (section as BankSection).status : (section as MomoSection).ownershipStatus;
  const next = DECISION_STATUS[input.decision];
  if (!next) throw new HttpsError('invalid-argument', 'Choose verify, needs action or reject.');
  if (current === next) {
    throw new HttpsError('failed-precondition', `These details are already ${statusLabel(next)}.`);
  }
  if (next !== 'verified' && input.reason.length < 5) {
    throw new HttpsError('invalid-argument', 'Give the contributor a reason of at least five characters.');
  }
  if (next === 'needs_action' && input.nextStep.length < 5) {
    throw new HttpsError('invalid-argument', 'Tell the contributor what to do next.');
  }
  if (method === 'bank' && next === 'verified' && !(section as BankSection).statement) {
    throw new HttpsError(
      'failed-precondition',
      'A bank account cannot be verified without a statement on file. Mark it as needing action and ask for one.',
    );
  }
  const statusPatch = method === 'bank' ? { status: next } : { ownershipStatus: next };
  return {
    ...section,
    ...statusPatch,
    statusReason: next === 'verified' ? '' : input.reason,
    nextStep: next === 'verified' ? '' : input.nextStep,
    decidedAt: input.now,
    decidedBy: input.actor,
  } as T;
}

/** Whether payment can be sent to this method. */
export function methodVerified(profile: PayoutProfile, method: PayoutMethod): boolean {
  if (method === 'bank') return profile.bank?.status === 'verified';
  return Boolean(profile.momo?.phoneVerifiedAt) && profile.momo?.ownershipStatus === 'verified';
}

// ---------------------------------------------------------------------------
// One-time codes. Pure helpers; the callables below hold the I/O.
// ---------------------------------------------------------------------------

export function hashWithSalt(value: string, salt: string): string {
  return createHash('sha256').update(`${salt}:${value}`).digest('hex');
}

function constantTimeEquals(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Keyed so the same number yields the same value without being reversible into it. */
export function numberFingerprint(msisdn: string): string {
  return createHash('sha256')
    .update(`${process.env.PHONE_HASH_PEPPER ?? 'indigen'}:momo:${msisdn}`)
    .digest('hex');
}

export interface StoredChallenge {
  codeHash: string;
  salt: string;
  attempts: number;
  expiresAtMs: number;
  lastSentAtMs: number;
}

export type CodeCheck =
  | { outcome: 'ok' }
  | { outcome: 'expired' }
  | { outcome: 'locked' }
  | { outcome: 'wrong'; attemptsLeft: number };

export function checkCode(challenge: StoredChallenge, code: string, nowMs: number): CodeCheck {
  if (!Number.isFinite(challenge.expiresAtMs) || challenge.expiresAtMs <= nowMs) return { outcome: 'expired' };
  if (challenge.attempts >= MOMO_MAX_ATTEMPTS) return { outcome: 'locked' };
  if (!constantTimeEquals(hashWithSalt(code, challenge.salt), challenge.codeHash)) {
    return { outcome: 'wrong', attemptsLeft: Math.max(0, MOMO_MAX_ATTEMPTS - challenge.attempts - 1) };
  }
  return { outcome: 'ok' };
}

export function resendWaitMs(lastSentAtMs: number | null | undefined, nowMs: number): number {
  if (typeof lastSentAtMs !== 'number' || !Number.isFinite(lastSentAtMs)) return 0;
  return Math.max(0, MOMO_RESEND_COOLDOWN_MS - (nowMs - lastSentAtMs));
}

export function momoCodeMessage(code: string): string {
  return `Indigen World: ${code} is your code to confirm this MoMo number for contributor payments. `
    + 'It expires in 10 minutes. Never share it; our team will never ask you for it.';
}

// ---------------------------------------------------------------------------
// Views. The contributor never receives a full number or reviewer identity.
// ---------------------------------------------------------------------------

export interface ChallengeView {
  network: MomoNetwork;
  walletNumberMasked: string;
  registeredName: string;
  expiresAt: string;
  resendAvailableAt: string;
  attemptsLeft: number;
}

export function challengeView(data: Record<string, unknown> | undefined, nowMs: number): ChallengeView | null {
  if (!data) return null;
  const expiresAtMs = Number(data.expiresAtMs);
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= nowMs) return null;
  const attempts = Number(data.attempts) || 0;
  if (attempts >= MOMO_MAX_ATTEMPTS) return null;
  const pending = (data.pending ?? {}) as Record<string, unknown>;
  const network = pending.network as MomoNetwork;
  return {
    network: network in MOMO_NETWORKS ? network : 'mtn',
    walletNumberMasked: maskTail(str(pending.walletNumber)),
    registeredName: str(pending.registeredName),
    expiresAt: new Date(expiresAtMs).toISOString(),
    resendAvailableAt: new Date(Number(data.lastSentAtMs) + MOMO_RESEND_COOLDOWN_MS).toISOString(),
    attemptsLeft: MOMO_MAX_ATTEMPTS - attempts,
  };
}

function contributorCheckView(check: AutomatedCheck) {
  return { state: check.state, fields: check.fields, ranAt: check.ranAt };
}

export function contributorPaymentView(profile: PayoutProfile, challenge: ChallengeView | null) {
  const bank = profile.bank;
  const momo = profile.momo;
  const bankStatus: VerificationStatus = bank ? bank.status : 'not_started';
  const momoStatus: VerificationStatus = momo ? momo.ownershipStatus : 'not_started';
  return {
    preferredMethod: profile.preferredMethod,
    payoutReady: methodVerified(profile, 'bank') || methodVerified(profile, 'momo'),
    bank: bank ? {
      bankName: bank.bankName,
      accountName: bank.accountName,
      accountNumberMasked: maskTail(bank.accountNumber),
      branch: bank.branch,
      currency: bank.currency,
      status: bankStatus,
      statusReason: bank.statusReason,
      nextStep: bank.nextStep,
      statement: bank.statement ? {
        contentType: bank.statement.contentType,
        sizeBytes: bank.statement.sizeBytes,
        uploadedAt: bank.statement.uploadedAt,
      } : null,
      automatedCheck: contributorCheckView(bank.automatedCheck),
      submittedAt: bank.submittedAt,
      decidedAt: bank.decidedAt,
      legacy: bank.legacy,
    } : null,
    momo: momo ? {
      network: momo.network,
      networkLabel: MOMO_NETWORKS[momo.network],
      walletNumberMasked: maskTail(momo.walletNumber),
      registeredName: momo.registeredName,
      phoneVerifiedAt: momo.phoneVerifiedAt,
      ownershipStatus: momoStatus,
      statusReason: momo.statusReason,
      nextStep: momo.nextStep,
      submittedAt: momo.submittedAt,
      decidedAt: momo.decidedAt,
    } : null,
    momoChallenge: challenge,
    history: profile.history.map((event) => ({
      at: event.at, method: event.method, action: event.action, status: event.status, note: event.note, actor: event.actor,
    })),
    // Read by the TribeStudio build that shipped on 2026-09-23 until hosting
    // is redeployed with this release; the number is masked here too.
    legacyProfile: bank ? {
      bankName: bank.bankName,
      accountName: bank.accountName,
      accountNumber: maskTail(bank.accountNumber),
      branch: bank.branch,
      currency: 'GHS',
      verificationStatus: bank.status === 'needs_action' ? 'rejected' : bank.status,
      verificationNote: bank.statusReason,
      updatedAt: profile.updatedAt,
    } : null,
  };
}

export function financeProfileView(profile: PayoutProfile) {
  return {
    id: profile.contributorId,
    contributorId: profile.contributorId,
    preferredMethod: profile.preferredMethod,
    bank: profile.bank ? {
      ...profile.bank,
      statement: profile.bank.statement ? {
        contentType: profile.bank.statement.contentType,
        sizeBytes: profile.bank.statement.sizeBytes,
        uploadedAt: profile.bank.statement.uploadedAt,
        sha256: profile.bank.statement.sha256,
      } : null,
    } : null,
    momo: profile.momo ? { ...profile.momo, networkLabel: MOMO_NETWORKS[profile.momo.network] } : null,
    history: profile.history,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
  };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export function bankDetailsFrom(raw: Record<string, unknown>): BankDetails {
  const accountNumber = boundedText(raw.accountNumber, 60, 'Account number').replace(/[\s-]/g, '');
  if (!/^[A-Za-z0-9]{6,34}$/.test(accountNumber)) {
    throw new HttpsError('invalid-argument', 'Enter the account number using letters and digits only (6–34 characters).');
  }
  return {
    bankName: boundedText(raw.bankName, 120, 'Bank name', { min: 2 }),
    accountName: boundedText(raw.accountName, 160, 'Account holder name', { min: 2 }),
    accountNumber,
    branch: boundedText(raw.branch, 160, 'Branch', { optional: true }),
  };
}

export function momoDetailsFrom(raw: Record<string, unknown>): { network: MomoNetwork; walletNumber: string; msisdn: string; registeredName: string } {
  const network = raw.network as MomoNetwork;
  if (!(typeof network === 'string' && network in MOMO_NETWORKS)) {
    throw new HttpsError('invalid-argument', 'Choose your MoMo network.');
  }
  const rawNumber = boundedText(raw.walletNumber, 40, 'Wallet number');
  if (!/^[+\d\s().-]+$/.test(rawNumber)) throw new HttpsError('invalid-argument', 'Enter the wallet number using digits only.');
  const msisdn = normalizeGhanaPhone(rawNumber);
  if (!msisdn) {
    throw new HttpsError('invalid-argument', 'Enter a Ghana mobile number, such as 024 123 4567 or +233 24 123 4567.');
  }
  const registeredName = boundedText(raw.registeredName, 120, 'Registered name', { min: 2 });
  if (!/^[\p{L}][\p{L}\s.'’-]*$/u.test(registeredName)) {
    throw new HttpsError('invalid-argument', 'Enter the registered name using letters only, exactly as your MoMo account shows it.');
  }
  return { network, walletNumber: `+${msisdn}`, msisdn, registeredName };
}

function statementRefFrom(uid: string, raw: unknown): { path: string; uploadId: string; fileName: string } {
  const record = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const uploadId = typeof record.uploadId === 'string' ? record.uploadId : '';
  const fileName = typeof record.fileName === 'string' ? record.fileName : '';
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(uploadId) || !/^[A-Za-z0-9._-]{1,120}$/.test(fileName) || fileName.startsWith('.')) {
    throw new HttpsError('invalid-argument', 'Upload your bank statement before submitting.');
  }
  return { path: `${STATEMENT_PREFIX}/${uid}/${uploadId}/${fileName}`, uploadId, fileName };
}

/** The first bytes a real PDF, PNG or JPEG starts with. */
export function contentMatchesType(bytes: Uint8Array, contentType: string): boolean {
  const starts = (...values: number[]) => values.every((value, index) => bytes[index] === value);
  if (contentType === 'application/pdf') return starts(0x25, 0x50, 0x44, 0x46, 0x2d);
  if (contentType === 'image/png') return starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
  if (contentType === 'image/jpeg') return starts(0xff, 0xd8, 0xff);
  return false;
}

// ---------------------------------------------------------------------------
// I/O helpers
// ---------------------------------------------------------------------------

function profileRef(uid: string): DocumentReference {
  return getFirestore().doc(`${PROFILES}/${uid}`);
}

async function readProfileTx(tx: Transaction, uid: string): Promise<{ ref: DocumentReference; profile: PayoutProfile }> {
  const ref = profileRef(uid);
  const snapshot = await tx.get(ref);
  return { ref, profile: normaliseProfile(uid, snapshot.data() as Record<string, unknown> | undefined) };
}

function writeProfileTx(tx: Transaction, ref: DocumentReference, profile: PayoutProfile, now: string): void {
  tx.set(ref, storedProfile({ ...profile, createdAt: profile.createdAt || now, updatedAt: now }));
}

async function inspectStatement(path: string): Promise<{ contentType: string; sizeBytes: number; sha256: string; bytes: Buffer; gcsUri: string }> {
  const bucket = getStorage().bucket();
  const file = bucket.file(path);
  let metadata: Record<string, unknown>;
  try {
    const [exists] = await file.exists();
    if (!exists) {
      throw new HttpsError('failed-precondition', 'Your statement upload could not be found. Choose the file again and resubmit.');
    }
    [metadata] = await file.getMetadata() as unknown as [Record<string, unknown>];
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    throw new HttpsError('unavailable', 'Your statement could not be read just now. Try again in a moment.');
  }
  const contentType = str(metadata.contentType);
  const sizeBytes = Number(metadata.size) || 0;
  if (!(contentType in STATEMENT_TYPES)) {
    throw new HttpsError('invalid-argument', 'Upload the statement as a PDF, JPEG or PNG file.');
  }
  if (sizeBytes < STATEMENT_MIN_BYTES || sizeBytes > STATEMENT_MAX_BYTES) {
    throw new HttpsError('invalid-argument', 'The statement must be between 1 KB and 10 MB.');
  }
  const [bytes] = await file.download();
  if (!contentMatchesType(bytes, contentType)) {
    await file.delete({ ignoreNotFound: true }).catch(() => undefined);
    throw new HttpsError('invalid-argument', 'That file is not a readable PDF, JPEG or PNG. Export or photograph the statement again.');
  }
  return {
    contentType,
    sizeBytes,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    bytes,
    gcsUri: `gs://${bucket.name}/${path}`,
  };
}

async function deleteStatementQuietly(path: string | null | undefined): Promise<void> {
  if (!path) return;
  await getStorage().bucket().file(path).delete({ ignoreNotFound: true }).catch(() => {
    logger.warn('A superseded payout statement could not be deleted', { reason: 'storage' });
  });
}

/** The contributor's own notification choices, with the defaults the portal documents. */
async function paymentNotificationChannels(uid: string): Promise<string[]> {
  const settings = await getFirestore().doc(`contributorSettings/${uid}`).get();
  const prefs = (settings.get('notifications') ?? {}) as Record<string, unknown>;
  return [
    'in_app',
    ...(prefs.paymentEmail === false ? [] : ['email']),
    ...(prefs.paymentSms === true ? ['sms'] : []),
  ];
}

function decisionNotification(method: PayoutMethod, status: SectionStatus, reason: string) {
  const subject = method === 'bank' ? 'bank account' : 'MoMo wallet';
  const titles: Record<SectionStatus, string> = {
    verified: `Your ${subject} is verified`,
    needs_action: `Your ${subject} needs attention`,
    rejected: `Your ${subject} could not be verified`,
    pending: `Your ${subject} is waiting for review`,
  };
  const body = status === 'verified'
    ? `A finance reviewer confirmed your ${subject} for contributor payments.`
    : reason.slice(0, 240);
  return { title: titles[status], body };
}

// ---------------------------------------------------------------------------
// Contributor callables
// ---------------------------------------------------------------------------

async function readContributorPayments(uid: string) {
  const db = getFirestore();
  const [profileSnap, challengeSnap, requests] = await Promise.all([
    profileRef(uid).get(),
    db.doc(`${MOMO_CHALLENGES}/${uid}`).get(),
    db.collection(PAYMENT_REQUESTS).where('contributorId', '==', uid).limit(100).get(),
  ]);
  const profile = normaliseProfile(uid, profileSnap.data() as Record<string, unknown> | undefined);
  const view = contributorPaymentView(profile, challengeView(challengeSnap.data() as Record<string, unknown> | undefined, Date.now()));
  return {
    ...view,
    // Legacy key: the 2026-09-23 build reads `profile` and `requests`.
    profile: view.legacyProfile,
    requests: requests.docs.map((entry) => ({
      id: entry.id,
      amountMinor: Number(entry.get('amountMinor')) || 0,
      currency: 'GHS',
      description: str(entry.get('description')),
      status: str(entry.get('status')),
      createdAt: str(entry.get('createdAt')),
      paidAt: typeof entry.get('paidAt') === 'string' ? entry.get('paidAt') : null,
      paymentReference: str(entry.get('paymentReference')),
      adminNote: str(entry.get('adminNote')),
    })).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    statementCheck: statementCheckEnabled() ? 'enabled' : 'off',
  };
}

export const getContributorPayments = onCall(CONTRIBUTOR_CALL_OPTIONS, guarded('getContributorPayments', async (req) => {
  const uid = requireAuth(req);
  await consumeRateLimit('getContributorPayments', uid, 60);
  await requireActiveContributor(uid);
  return readContributorPayments(uid);
}));

/**
 * Bank details and the statement that supports them, submitted together.
 *
 * The statement is uploaded straight to Storage first (the rules allow the
 * owner to create one object under their own prefix and nothing else), then
 * named here. This callable re-reads the object's real type, size and first
 * bytes — whatever the browser claimed — before anything is saved.
 */
export const submitBankVerification = onCall(
  { ...CONTRIBUTOR_CALL_OPTIONS, timeoutSeconds: 120, memory: '512MiB' },
  guarded('submitBankVerification', async (req) => {
    const uid = requireAuth(req);
    await consumeRateLimit('submitBankVerification', uid, 10, HOUR_MS);
    await requireActiveContributor(uid, { activated: true });
    const raw = (req.data ?? {}) as Record<string, unknown>;
    const details = bankDetailsFrom(raw);
    const upload = statementRefFrom(uid, raw.statement);
    const file = await inspectStatement(upload.path);
    const now = new Date().toISOString();
    const checkEnabled = statementCheckEnabled();
    const statement: StatementRef = {
      path: upload.path, contentType: file.contentType, sizeBytes: file.sizeBytes, sha256: file.sha256, uploadedAt: now,
    };

    const db = getFirestore();
    const auditRef = db.collection('auditLogs').doc();
    let superseded: string | null = null;
    let version = 0;
    let wasVerified = false;
    await db.runTransaction(async (tx) => {
      const { ref, profile } = await readProfileTx(tx, uid);
      const previous = profile.bank;
      wasVerified = previous?.status === 'verified';
      superseded = previous?.statement?.path && previous.statement.path !== upload.path ? previous.statement.path : null;
      const bank = bankAfterSubmission(previous, details, statement, now, checkEnabled);
      version = bank.version;
      let next: PayoutProfile = { ...profile, bank, preferredMethod: profile.preferredMethod ?? 'bank' };
      next = withHistory(next, {
        at: now, method: 'bank', action: wasVerified ? 'bank.resubmitted_after_verification' : 'bank.submitted',
        status: 'pending',
        note: wasVerified ? 'Verified details were changed, so verification starts again.' : 'Submitted for review with a statement.',
        actor: 'contributor',
      });
      writeProfileTx(tx, ref, next, now);
      tx.set(auditRef, {
        id: auditRef.id,
        ...auditEntry({
          actor: uid, action: 'contributor.payout.bank.submit', target: uid, targetCollection: PROFILES,
          before: previous ? { status: previous.status, version: previous.version } : null,
          after: { status: 'pending', version: bank.version },
          metadata: { statementSha256: file.sha256, statementType: file.contentType, resetFromVerified: wasVerified },
          at: now,
        }),
      });
    });
    await deleteStatementQuietly(superseded);

    if (checkEnabled) {
      const check = await runStatementCheck({ bytes: file.bytes, contentType: file.contentType, gcsUri: file.gcsUri, supplied: details, now });
      await applyCheckResult(uid, version, check);
    }
    return readContributorPayments(uid);
  }),
);

/** Files a check result against the version it ran on; a newer submission wins. */
async function applyCheckResult(uid: string, version: number, check: AutomatedCheck): Promise<void> {
  const db = getFirestore();
  await db.runTransaction(async (tx) => {
    const { ref, profile } = await readProfileTx(tx, uid);
    if (!profile.bank || profile.bank.version !== version) return;
    const now = new Date().toISOString();
    const next = withHistory({ ...profile, bank: { ...profile.bank, automatedCheck: check } }, {
      at: now, method: 'bank', action: 'bank.automated_check', status: profile.bank.status,
      note: `Automated statement check: ${check.state.replace('_', ' ')}. A finance reviewer still decides.`,
      actor: 'system',
    });
    writeProfileTx(tx, ref, next, now);
  });
}

export const removePayoutMethod = onCall(CONTRIBUTOR_CALL_OPTIONS, guarded('removePayoutMethod', async (req) => {
  const uid = requireAuth(req);
  await consumeRateLimit('removePayoutMethod', uid, 10, HOUR_MS);
  await requireActiveContributor(uid);
  const method = (req.data as Record<string, unknown> | undefined)?.method;
  if (method !== 'bank' && method !== 'momo') throw new HttpsError('invalid-argument', 'Choose which payment method to remove.');
  const db = getFirestore();
  const auditRef = db.collection('auditLogs').doc();
  const now = new Date().toISOString();
  let statementPath: string | null = null;
  await db.runTransaction(async (tx) => {
    const { ref, profile } = await readProfileTx(tx, uid);
    const section = method === 'bank' ? profile.bank : profile.momo;
    if (!section) throw new HttpsError('failed-precondition', 'There are no details to remove.');
    statementPath = method === 'bank' ? profile.bank?.statement?.path ?? null : null;
    const remaining: PayoutMethod | null = method === 'bank' ? (profile.momo ? 'momo' : null) : (profile.bank ? 'bank' : null);
    let next: PayoutProfile = {
      ...profile,
      bank: method === 'bank' ? null : profile.bank,
      momo: method === 'momo' ? null : profile.momo,
      preferredMethod: profile.preferredMethod === method ? remaining : profile.preferredMethod,
    };
    next = withHistory(next, { at: now, method, action: `${method}.removed`, status: 'not_started', note: 'Removed by the contributor.', actor: 'contributor' });
    writeProfileTx(tx, ref, next, now);
    tx.set(auditRef, { id: auditRef.id, ...auditEntry({ actor: uid, action: `contributor.payout.${method}.remove`, target: uid, targetCollection: PROFILES, at: now }) });
  });
  await deleteStatementQuietly(statementPath);
  return readContributorPayments(uid);
}));

export const setPreferredPayoutMethod = onCall(CONTRIBUTOR_CALL_OPTIONS, guarded('setPreferredPayoutMethod', async (req) => {
  const uid = requireAuth(req);
  await consumeRateLimit('setPreferredPayoutMethod', uid, 20, HOUR_MS);
  await requireActiveContributor(uid);
  const method = (req.data as Record<string, unknown> | undefined)?.method;
  if (method !== 'bank' && method !== 'momo') throw new HttpsError('invalid-argument', 'Choose bank or MoMo.');
  const now = new Date().toISOString();
  await getFirestore().runTransaction(async (tx) => {
    const { ref, profile } = await readProfileTx(tx, uid);
    if (!(method === 'bank' ? profile.bank : profile.momo)) {
      throw new HttpsError('failed-precondition', 'Add those details before choosing them for payment.');
    }
    writeProfileTx(tx, ref, { ...profile, preferredMethod: method }, now);
  });
  return readContributorPayments(uid);
}));

/**
 * Sends a one-time code to the wallet number over Arkesel.
 *
 * Limits, all enforced here: five sends an hour per contributor, three codes
 * an hour to any one number (so this cannot be used to flood a stranger's
 * phone from several accounts), one send a minute. The code and the number
 * are stored only as salted hashes beside the pending details; the code is
 * never returned, stored in the clear or logged.
 */
export const startMomoVerification = onCall(
  { ...CONTRIBUTOR_CALL_OPTIONS, secrets: [ARKESEL_API_KEY] },
  guarded('startMomoVerification', async (req) => {
    const uid = requireAuth(req);
    await requireActiveContributor(uid, { activated: true });
    const details = momoDetailsFrom((req.data ?? {}) as Record<string, unknown>);
    if (!isSmsConfigured()) {
      throw new HttpsError('failed-precondition', 'Verification codes cannot be sent right now because SMS is not configured. Please try again later.');
    }
    const db = getFirestore();
    const challengeRef = db.doc(`${MOMO_CHALLENGES}/${uid}`);
    const existing = await challengeRef.get();
    const nowMs = Date.now();
    const wait = resendWaitMs(existing.get('lastSentAtMs') as number | undefined, nowMs);
    if (wait > 0) {
      throw new HttpsError('resource-exhausted', `Wait ${Math.ceil(wait / 1000)} seconds before asking for another code.`, {
        retryAfterSeconds: Math.ceil(wait / 1000),
      });
    }
    await consumeRateLimit('startMomoVerification', uid, MOMO_STARTS_PER_HOUR, HOUR_MS, 1,
      'You have asked for several codes in the last hour. Try again later.');
    await consumeRateLimit('momoCodeToNumber', numberFingerprint(details.msisdn), MOMO_CODES_PER_NUMBER_PER_HOUR, HOUR_MS, 1,
      'Several codes were already sent to this number in the last hour. Try again later.');

    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const salt = randomBytes(16).toString('hex');
    const expiresAtMs = nowMs + MOMO_CODE_TTL_MS;
    await challengeRef.set({
      uid,
      codeHash: hashWithSalt(code, salt),
      salt,
      attempts: 0,
      expiresAtMs,
      lastSentAtMs: nowMs,
      msisdnHash: hashWithSalt(details.msisdn, salt),
      pending: { network: details.network, walletNumber: details.walletNumber, registeredName: details.registeredName },
      createdAt: new Date(nowMs).toISOString(),
    });
    const sent = await sendSmsToMsisdn(details.msisdn, momoCodeMessage(code));
    if (!sent.ok) {
      await challengeRef.delete();
      logger.warn('MoMo verification SMS was not accepted', { reason: sent.error ?? 'unknown' });
      throw new HttpsError('unavailable', 'The SMS provider did not accept the code for delivery. Check the number and try again in a minute.');
    }
    return {
      delivery: 'accepted',
      walletNumberMasked: maskTail(details.walletNumber),
      expiresAt: new Date(expiresAtMs).toISOString(),
      resendAvailableAt: new Date(nowMs + MOMO_RESEND_COOLDOWN_MS).toISOString(),
      attemptsLeft: MOMO_MAX_ATTEMPTS,
    };
  }),
);

/**
 * Answers the code. Success proves control of the phone number and nothing
 * more; the wallet goes to a finance reviewer for ownership and name.
 */
export const confirmMomoVerification = onCall(CONTRIBUTOR_CALL_OPTIONS, guarded('confirmMomoVerification', async (req) => {
  const uid = requireAuth(req);
  await consumeRateLimit('confirmMomoVerification', uid, MOMO_CONFIRMS_PER_HOUR, HOUR_MS);
  await requireActiveContributor(uid, { activated: true });
  const raw = (req.data as Record<string, unknown> | undefined)?.code;
  const code = typeof raw === 'string' ? raw.replace(/\D/g, '') : '';
  if (code.length !== 6) throw new HttpsError('invalid-argument', 'Enter the six-digit code from the SMS.');

  const db = getFirestore();
  const challengeRef = db.doc(`${MOMO_CHALLENGES}/${uid}`);
  const snapshot = await challengeRef.get();
  if (!snapshot.exists) throw new HttpsError('not-found', 'There is no code waiting. Ask for a new code.');
  const challenge: StoredChallenge = {
    codeHash: str(snapshot.get('codeHash')),
    salt: str(snapshot.get('salt')),
    attempts: Number(snapshot.get('attempts')) || 0,
    expiresAtMs: Number(snapshot.get('expiresAtMs')),
    lastSentAtMs: Number(snapshot.get('lastSentAtMs')),
  };
  const result = checkCode(challenge, code, Date.now());
  if (result.outcome === 'expired') {
    await challengeRef.delete();
    throw new HttpsError('deadline-exceeded', 'That code has expired. Ask for a new code.');
  }
  if (result.outcome === 'locked') {
    await challengeRef.delete();
    throw new HttpsError('resource-exhausted', 'Too many wrong codes. Ask for a new code.');
  }
  if (result.outcome === 'wrong') {
    if (result.attemptsLeft === 0) await challengeRef.delete();
    else await challengeRef.update({ attempts: challenge.attempts + 1 });
    throw new HttpsError('invalid-argument', result.attemptsLeft > 0
      ? `That code is not right. ${result.attemptsLeft} ${result.attemptsLeft === 1 ? 'try' : 'tries'} left.`
      : 'That code is not right, and no tries are left. Ask for a new code.', { attemptsLeft: result.attemptsLeft });
  }

  const pending = (snapshot.get('pending') ?? {}) as Record<string, unknown>;
  const confirmed = {
    network: pending.network as MomoNetwork,
    walletNumber: str(pending.walletNumber),
    registeredName: str(pending.registeredName),
  };
  if (!(confirmed.network in MOMO_NETWORKS) || !confirmed.walletNumber) {
    await challengeRef.delete();
    throw new HttpsError('failed-precondition', 'The pending details are incomplete. Start again.');
  }
  const now = new Date().toISOString();
  const auditRef = db.collection('auditLogs').doc();
  await db.runTransaction(async (tx) => {
    const current = await tx.get(challengeRef);
    if (!current.exists || current.get('codeHash') !== challenge.codeHash) {
      throw new HttpsError('aborted', 'A newer code was requested. Enter the latest code.');
    }
    const { ref, profile } = await readProfileTx(tx, uid);
    const { momo, changed } = momoAfterConfirmation(profile.momo, confirmed, now);
    let next: PayoutProfile = { ...profile, momo, preferredMethod: profile.preferredMethod ?? 'momo' };
    next = withHistory(next, {
      at: now, method: 'momo', action: changed ? 'momo.phone_verified' : 'momo.phone_reconfirmed',
      status: momo.ownershipStatus,
      note: changed
        ? 'Phone number control confirmed by one-time code. Wallet ownership and registered name wait for a finance reviewer.'
        : 'Phone number control confirmed again for the wallet already on file.',
      actor: 'contributor',
    });
    writeProfileTx(tx, ref, next, now);
    tx.delete(challengeRef);
    tx.set(auditRef, {
      id: auditRef.id,
      ...auditEntry({
        actor: uid, action: 'contributor.payout.momo.phone_verified', target: uid, targetCollection: PROFILES,
        before: profile.momo ? { version: profile.momo.version, ownershipStatus: profile.momo.ownershipStatus } : null,
        after: { version: momo.version, ownershipStatus: momo.ownershipStatus },
        metadata: { network: momo.network, numberChanged: changed },
        at: now,
      }),
    });
  });
  return readContributorPayments(uid);
}));

/**
 * Kept for the TribeStudio build released on 2026-09-23, which saves bank
 * details without a statement. It explains the change instead of failing.
 */
export const saveContributorPayoutProfile = onCall(CONTRIBUTOR_CALL_OPTIONS, guarded('saveContributorPayoutProfile', async (req) => {
  requireAuth(req);
  throw new HttpsError('failed-precondition', 'Payment details now include a verification step with a bank statement. Reload this page to continue.');
}));

export const requestContributorPayment = onCall(CONTRIBUTOR_CALL_OPTIONS, guarded('requestContributorPayment', async (req) => {
  const uid = requireAuth(req);
  await consumeRateLimit('requestContributorPayment', uid, 10);
  const amountMinor = Number((req.data as Record<string, unknown> | undefined)?.amountMinor);
  if (!Number.isInteger(amountMinor) || amountMinor < 100 || amountMinor > 100_000_000) {
    throw new HttpsError('invalid-argument', 'Payment amount must be between GHS 1 and GHS 1,000,000.');
  }
  const description = boundedText((req.data as Record<string, unknown> | undefined)?.description, 500, 'Description');
  const db = getFirestore();
  const requestRef = db.collection(PAYMENT_REQUESTS).doc();
  const accountRef = db.doc(`contributorAccounts/${uid}`);
  const now = new Date().toISOString();
  await db.runTransaction(async (tx) => {
    const account = await tx.get(accountRef);
    const { profile } = await readProfileTx(tx, uid);
    if (account.get('status') !== 'active') throw new HttpsError('permission-denied', 'An active contributor account is required.');
    const method: PayoutMethod | null = profile.preferredMethod && methodVerified(profile, profile.preferredMethod)
      ? profile.preferredMethod
      : methodVerified(profile, 'bank') ? 'bank' : methodVerified(profile, 'momo') ? 'momo' : null;
    if (!method) throw new HttpsError('failed-precondition', 'A verified bank account or MoMo wallet is required before requesting payment.');
    const prior = await tx.get(db.collection(PAYMENT_REQUESTS).where('contributorId', '==', uid).limit(100));
    if (prior.docs.some((entry) => ['submitted', 'approved'].includes(String(entry.get('status'))))) {
      throw new HttpsError('failed-precondition', 'You already have a payment request being processed.');
    }
    const snapshot = method === 'bank'
      ? { method, bankName: profile.bank!.bankName, accountName: profile.bank!.accountName, accountNumber: profile.bank!.accountNumber, branch: profile.bank!.branch }
      : { method, network: profile.momo!.network, walletNumber: profile.momo!.walletNumber, registeredName: profile.momo!.registeredName };
    tx.create(requestRef, {
      id: requestRef.id, contributorId: uid, amountMinor, currency: 'GHS', description, status: 'submitted',
      payoutMethod: method, payoutSnapshot: snapshot,
      // Kept for the admin desk released with the first payment workflow.
      bankSnapshot: method === 'bank' ? snapshot : null,
      profileUpdatedAt: profile.updatedAt,
      createdAt: now, updatedAt: now, decidedAt: null, decidedBy: null, paidAt: null, paymentReference: '', adminNote: '',
    });
  });
  return { requestId: requestRef.id };
}));

// ---------------------------------------------------------------------------
// Finance callables
// ---------------------------------------------------------------------------

export const listContributorPayments = onCall(CONTRIBUTOR_CALL_OPTIONS, guarded('listContributorPayments', async (req) => {
  const actor = requireFinance(req);
  await consumeRateLimit('listContributorPayments', actor, 60);
  const db = getFirestore();
  const [profiles, requests] = await Promise.all([
    db.collection(PROFILES).limit(500).get(),
    db.collection(PAYMENT_REQUESTS).limit(500).get(),
  ]);
  return {
    statementCheck: statementCheckEnabled() ? 'enabled' : 'off',
    profiles: profiles.docs
      .map((entry) => financeProfileView(normaliseProfile(entry.id, entry.data() as Record<string, unknown>)))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    requests: requests.docs.map((entry) => ({ id: entry.id, ...entry.data(), createdAt: str(entry.get('createdAt')) }))
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))),
  };
}));

/** A five-minute link to the statement on file. Every opening is audited. */
export const getPayoutStatementLink = onCall(CONTRIBUTOR_CALL_OPTIONS, guarded('getPayoutStatementLink', async (req) => {
  const actor = requireFinance(req);
  await consumeRateLimit('getPayoutStatementLink', actor, 60);
  const contributorId = boundedText((req.data as Record<string, unknown> | undefined)?.contributorId, 128, 'Contributor');
  if (!/^[A-Za-z0-9_-]+$/.test(contributorId)) throw new HttpsError('invalid-argument', 'Invalid contributor.');
  const db = getFirestore();
  const profile = normaliseProfile(contributorId, (await db.doc(`${PROFILES}/${contributorId}`).get()).data() as Record<string, unknown> | undefined);
  const statement = profile.bank?.statement;
  if (!statement) throw new HttpsError('not-found', 'No statement is on file for this contributor.');
  const expires = Date.now() + STATEMENT_LINK_TTL_MS;
  let url: string;
  try {
    [url] = await getStorage().bucket().file(statement.path).getSignedUrl({
      version: 'v4', action: 'read', expires, responseDisposition: 'inline', responseType: statement.contentType,
    });
  } catch (error) {
    logger.error('Payout statement link could not be signed; check roles/iam.serviceAccountTokenCreator on the runtime service account', {
      errorType: error instanceof Error ? error.name : 'unknown',
    });
    throw new HttpsError('failed-precondition', 'The statement could not be opened: the functions service account cannot sign links. Grant it roles/iam.serviceAccountTokenCreator on itself.');
  }
  const auditRef = db.collection('auditLogs').doc();
  await auditRef.set({
    id: auditRef.id,
    ...auditEntry({
      actor, action: 'contributor.payout.statement.view', target: contributorId, targetCollection: PROFILES,
      metadata: { statementSha256: statement.sha256, version: profile.bank?.version ?? null },
    }),
  });
  return { url, expiresAt: new Date(expires).toISOString(), contentType: statement.contentType };
}));

export const decidePayoutVerification = onCall(CONTRIBUTOR_CALL_OPTIONS, guarded('decidePayoutVerification', async (req) => {
  const actor = requireFinance(req);
  await consumeRateLimit('decidePayoutVerification', actor, 60);
  const raw = (req.data ?? {}) as Record<string, unknown>;
  const contributorId = boundedText(raw.contributorId, 128, 'Contributor');
  if (!/^[A-Za-z0-9_-]+$/.test(contributorId)) throw new HttpsError('invalid-argument', 'Invalid contributor.');
  if (contributorId === actor) throw new HttpsError('permission-denied', 'You cannot decide on your own payment details.');
  const method = raw.method;
  if (method !== 'bank' && method !== 'momo') throw new HttpsError('invalid-argument', 'Choose bank or MoMo.');
  const decision = raw.decision as Decision;
  if (!(decision in DECISION_STATUS)) throw new HttpsError('invalid-argument', 'Choose verify, needs action or reject.');
  const reason = boundedText(raw.reason, 1000, 'Reason', { optional: true, multiline: true });
  const nextStep = boundedText(raw.nextStep, 500, 'Next step', { optional: true, multiline: true });
  const version = Number(raw.version);

  const db = getFirestore();
  const channels = await paymentNotificationChannels(contributorId);
  const auditRef = db.collection('auditLogs').doc();
  const notificationRef = db.collection('notifications').doc();
  const now = new Date().toISOString();
  let status: SectionStatus = 'pending';
  await db.runTransaction(async (tx) => {
    const { ref, profile } = await readProfileTx(tx, contributorId);
    const section = method === 'bank' ? profile.bank : profile.momo;
    if (!section) throw new HttpsError('not-found', 'There are no details to decide on.');
    const previousStatus = method === 'bank' ? (section as BankSection).status : (section as MomoSection).ownershipStatus;
    const decided = decideSection(method, section, { decision, reason, nextStep, version, actor, now });
    status = method === 'bank' ? (decided as BankSection).status : (decided as MomoSection).ownershipStatus;
    let next: PayoutProfile = method === 'bank'
      ? { ...profile, bank: decided as BankSection }
      : { ...profile, momo: decided as MomoSection };
    next = withHistory(next, {
      at: now, method, action: `${method}.${decision}`, status,
      note: status === 'verified' ? (reason || 'Verified by a finance reviewer.') : reason,
      actor: 'finance', actorId: actor,
    });
    writeProfileTx(tx, ref, next, now);
    tx.set(auditRef, {
      id: auditRef.id,
      ...auditEntry({
        actor, action: `contributor.payout.${method}.${decision}`, target: contributorId, targetCollection: PROFILES,
        before: { status: previousStatus, version: section.version }, after: { status, version: section.version },
        metadata: { reason, nextStep, automatedCheck: method === 'bank' ? (section as BankSection).automatedCheck.state : null },
        at: now,
      }),
    });
    const message = decisionNotification(method, status, reason);
    tx.set(notificationRef, {
      id: notificationRef.id,
      recipient: { collection: 'contributors', id: contributorId },
      authUid: contributorId,
      type: 'payout_verification',
      title: message.title,
      body: message.body,
      link: '/contributor/account/payments',
      read: false,
      channels,
      priority: 'normal',
      schemaVersion: 1,
      lifecycle: { createdAt: now, updatedAt: now, version: 1 },
    });
  });
  return { contributorId, method, status };
}));

export const rerunPayoutStatementCheck = onCall(
  { ...CONTRIBUTOR_CALL_OPTIONS, timeoutSeconds: 120, memory: '512MiB' },
  guarded('rerunPayoutStatementCheck', async (req) => {
    const actor = requireFinance(req);
    await consumeRateLimit('rerunPayoutStatementCheck', actor, 20);
    if (!statementCheckEnabled()) {
      throw new HttpsError('failed-precondition', 'Automated statement checks are switched off for this deployment (CONTRIBUTOR_STATEMENT_CHECK).');
    }
    const contributorId = boundedText((req.data as Record<string, unknown> | undefined)?.contributorId, 128, 'Contributor');
    if (!/^[A-Za-z0-9_-]+$/.test(contributorId)) throw new HttpsError('invalid-argument', 'Invalid contributor.');
    const profile = normaliseProfile(contributorId, (await profileRef(contributorId).get()).data() as Record<string, unknown> | undefined);
    const bank = profile.bank;
    if (!bank?.statement) throw new HttpsError('failed-precondition', 'No statement is on file to check.');
    const file = await inspectStatement(bank.statement.path);
    const check = await runStatementCheck({
      bytes: file.bytes, contentType: file.contentType, gcsUri: file.gcsUri,
      supplied: { bankName: bank.bankName, accountName: bank.accountName, accountNumber: bank.accountNumber },
    });
    await applyCheckResult(contributorId, bank.version, check);
    const auditRef = getFirestore().collection('auditLogs').doc();
    await auditRef.set({
      id: auditRef.id,
      ...auditEntry({ actor, action: 'contributor.payout.bank.check_rerun', target: contributorId, targetCollection: PROFILES, metadata: { state: check.state } }),
    });
    return { state: check.state };
  }),
);

export const decideContributorPaymentRequest = onCall(CONTRIBUTOR_CALL_OPTIONS, guarded('decideContributorPaymentRequest', async (req) => {
  const actor = requireFinance(req);
  const raw = (req.data ?? {}) as Record<string, unknown>;
  const requestId = boundedText(raw.requestId, 128, 'Request');
  if (!/^[A-Za-z0-9_-]+$/.test(requestId)) throw new HttpsError('invalid-argument', 'Invalid request.');
  const action = boundedText(raw.action, 20, 'Action').toLowerCase();
  if (!['approve', 'reject', 'paid'].includes(action)) throw new HttpsError('invalid-argument', 'Unsupported payment action.');
  const adminNote = boundedText(raw.note, 1000, 'Note', { optional: true, multiline: true });
  const paymentReference = action === 'paid' ? boundedText(raw.paymentReference, 160, 'Payment reference') : '';
  const db = getFirestore();
  const ref = db.doc(`${PAYMENT_REQUESTS}/${requestId}`);
  const now = new Date().toISOString();
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError('not-found', 'Payment request not found.');
    const current = String(snap.get('status'));
    if ((action === 'approve' || action === 'reject') && current !== 'submitted') {
      throw new HttpsError('failed-precondition', 'Only submitted requests can be approved or rejected.');
    }
    if (action === 'paid' && current !== 'approved') {
      throw new HttpsError('failed-precondition', 'Approve the request before marking it paid.');
    }
    const status = action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'paid';
    tx.update(ref, {
      status, adminNote, updatedAt: now, decidedBy: actor,
      ...(status === 'paid' ? { paidAt: now, paymentReference } : { decidedAt: now }),
    });
    const auditRef = db.collection('auditLogs').doc();
    tx.set(auditRef, {
      id: auditRef.id,
      ...auditEntry({
        actor, action: `contributor.payment-request.${status}`, target: String(snap.get('contributorId')),
        before: { status: current }, after: { status },
        metadata: { requestId, amountMinor: snap.get('amountMinor'), paymentReference }, at: now,
      }),
    });
  });
  return { requestId };
}));

