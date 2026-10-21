import { createHash, randomBytes } from 'node:crypto';
import { getAuth } from 'firebase-admin/auth';
import { AggregateField, FieldValue, getFirestore, type DocumentData, type Firestore, type Transaction } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { logger } from 'firebase-functions';
import { onDocumentCreated, onDocumentWritten } from 'firebase-functions/v2/firestore';
import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { callerClaims, effectiveRole, isOwnerSuperAdmin, onStaffCall, roleSatisfies } from './auth.js';
import { CONTRIBUTOR_CALL_OPTIONS, boundedText, guarded, hasFinanceAccess } from './contributor-common.js';
import { sendMail } from './email.js';
import { renderReportPdf } from './finance-report-pdf.js';
import {
  ACCOUNT_TYPES, ADJUSTMENT_KINDS, CURRENCY_DIGITS, EDITABLE_FIELDS, FREQUENCIES, MAX_AMOUNT_MINOR, REPORT_KINDS, SOURCE_KINDS, TXN_STATUSES, TXN_TYPES,
  accountBalances, accraToday, addDays, addPeriod, balanceSeries, budgetImpact, budgetStatus, buildReport, committedMinor, convertToGhsMinor, daysBetween,
  diffFields, effectOf, formatGhs, fundingSources, incomeByCategory, insights, isCounting, monthOf, monthlySeries, queryLedger, reportCsv, spendingByCategory,
  summarise, typeLabel, withRunningBalances,
  type AccountType, type Attachment, type Budget, type Frequency, type FundingSourceKind, type LedgerQuery, type Report, type ReportKind, type Txn, type TxnStatus, type TxnType,
} from './finance-ledger.js';
import { consumeRateLimit } from './rate-limit.js';

/**
 * Indigen World's project money: the Financial Management, Monitoring and
 * Audit Centre behind the admin console's Finance section.
 *
 * One admin-only callable (`financeCentre`, dispatching on `operation`), four
 * Firestore triggers that log money the platform itself already confirmed,
 * and one daily job. All arithmetic is in finance-ledger.ts.
 *
 * ── Who may do what ────────────────────────────────────────────────────────
 * Finance administrator: the existing `finance` claim on an admin, or a super
 *   administrator. Approves, posts, reverses, manages accounts, categories,
 *   budgets, settings and editor/viewer access.
 * Finance editor (`financeRole: 'editor'` claim): records drafts, submits
 *   them for approval, uploads receipts, manages funding sources and
 *   recurring expenses, opens reconciliations.
 * Finance viewer (`financeRole: 'viewer'`): reads everything here, changes nothing.
 * Every collection below is closed to clients in firestore.rules; this file
 * is the only way in, and it checks the level on every call.
 *
 * ── Integrity ──────────────────────────────────────────────────────────────
 * Posted entries are immutable: only `reverse` (a linked negating entry) and
 * `correct` (reverse, then a new draft) change the books. Every state change
 * writes a `financeAudit` row in the same Firestore transaction. Creation is
 * idempotent on a client request key; an external payment reference can be
 * posted once per account; platform events are keyed by their own ids.
 */

const REGION = 'us-central1';
const TXNS = 'financeTransactions';
const AUDIT = 'financeAudit';
const ACCOUNTS = 'financeAccounts';
const CATEGORIES = 'financeCategories';
const SOURCES = 'financeFundingSources';
const BUDGETS = 'financeBudgets';
const RECURRING = 'financeRecurring';
const RECONCILIATIONS = 'financeReconciliations';
const REFERENCES = 'financeReferences';
const SETTINGS = 'financeSettings/main';
const COUNTERS = 'financeSettings/counters';
const DIGESTS = 'financeDigests';
const RECEIPT_PREFIX = 'finance-receipts';
const RECEIPT_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
const RECEIPT_MAX_BYTES = 10 * 1024 * 1024;

const db = (): Firestore => getFirestore();
const nowIso = () => new Date().toISOString();
const hash = (value: string, length = 24) => createHash('sha256').update(value).digest('hex').slice(0, length);

/* ==========================================================================
   Access
   ========================================================================== */

export type FinanceLevel = 'admin' | 'editor' | 'viewer';
const RANK: Record<FinanceLevel, number> = { viewer: 1, editor: 2, admin: 3 };

export function financeLevel(token: Record<string, unknown> | undefined): FinanceLevel | null {
  if (!token) return null;
  if (hasFinanceAccess(token)) return 'admin';
  if (token.financeRole === 'editor') return 'editor';
  if (token.financeRole === 'viewer') return 'viewer';
  return null;
}

interface Actor { uid: string; name: string; level: FinanceLevel; superAdmin: boolean }

function requireLevel(req: CallableRequest<unknown>, minimum: FinanceLevel): Actor {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in is required.');
  const token = callerClaims(req);
  const level = financeLevel(token);
  if (!level) throw new HttpsError('permission-denied', 'Project finance needs a finance role. A finance administrator can grant viewer or editor access.');
  if (RANK[level] < RANK[minimum]) {
    throw new HttpsError('permission-denied', minimum === 'admin'
      ? 'Only a finance administrator can do this.'
      : 'This needs finance editor access.');
  }
  const name = String(token?.name ?? token?.email ?? uid).slice(0, 120);
  return { uid, name, level, superAdmin: isOwnerSuperAdmin(token) };
}

/* ==========================================================================
   Records
   ========================================================================== */

export interface Account { id: string; name: string; type: AccountType; institution: string; identifier: string; currency: 'GHS'; notes: string; status: 'active' | 'archived'; systemKey: string | null; createdAt: string }
export interface Category { id: string; name: string; kind: 'income' | 'expense' | 'both'; description: string; active: boolean; system: boolean; order: number }
export interface FundingSource { id: string; name: string; kind: FundingSourceKind; purpose: string; contact: string; notes: string; status: 'active' | 'archived'; system: boolean; attachments: Attachment[]; createdAt: string }
export interface Recurring {
  id: string; name: string; vendor: string; amountMinor: number; currency: string; ghsEstimateMinor: number; frequency: Frequency; nextDueDate: string;
  anchorDay: number; paymentMethod: string; accountId: string | null; categoryId: string | null; status: 'active' | 'paused' | 'cancelled'; reminderDays: number;
  lastPaidDate: string | null; notes: string;
}
export interface Reconciliation {
  id: string; accountId: string; statementDate: string; statementBalanceMinor: number; recordedBalanceMinor: number; differenceMinor: number;
  status: 'matched' | 'open' | 'resolved'; note: string; resolution: string; adjustmentId: string | null; createdBy: { uid: string; name: string }; createdAt: string; resolvedAt: string | null;
}
type PlatformKey = 'ads' | 'shop' | 'redemptions' | 'payouts';
export const PLATFORM_KEYS: PlatformKey[] = ['ads', 'shop', 'redemptions', 'payouts'];
export interface Settings {
  autoPost: Record<PlatformKey, { post: boolean; accountId: string | null }>;
  notifyEmails: string[];
  requireSecondApprover: boolean;
  upcomingWindowDays: number;
  version: number;
}

const DEFAULT_SETTINGS: Settings = {
  autoPost: { ads: { post: false, accountId: null }, shop: { post: false, accountId: null }, redemptions: { post: false, accountId: null }, payouts: { post: false, accountId: null } },
  notifyEmails: [], requireSecondApprover: false, upcomingWindowDays: 30, version: 0,
};

/** Seeded once, then owned by finance administrators. Ids are stable so platform imports can name them. */
export const DEFAULT_CATEGORIES: Omit<Category, 'active' | 'system'>[] = [
  { id: 'project-funding', name: 'Project Funding', kind: 'income', description: 'Contributions from sponsors and supporters', order: 1 },
  { id: 'donations', name: 'Donations', kind: 'income', description: 'Gifts without conditions', order: 2 },
  { id: 'grants', name: 'Grants', kind: 'income', description: 'Grant awards, usually restricted', order: 3 },
  { id: 'advertising-revenue', name: 'Advertising Revenue', kind: 'income', description: 'Paid advertising campaigns (Paystack)', order: 4 },
  { id: 'shop-sales', name: 'Shop Sales', kind: 'income', description: 'Community shop orders (Paystack)', order: 5 },
  { id: 'membership-revenue', name: 'Membership Revenue', kind: 'income', description: 'Membership payouts received from app stores', order: 6 },
  { id: 'other-income', name: 'Other Income', kind: 'income', description: '', order: 7 },
  { id: 'ai-tools', name: 'AI Tools & Subscriptions', kind: 'expense', description: 'Claude, Gemini and other AI services', order: 10 },
  { id: 'cloud-hosting', name: 'Cloud Hosting & Infrastructure', kind: 'expense', description: 'Google Cloud, Firebase and similar', order: 11 },
  { id: 'software-development', name: 'Software Development', kind: 'expense', description: '', order: 12 },
  { id: 'domains-web', name: 'Domain Names & Web Services', kind: 'expense', description: '', order: 13 },
  { id: 'marketing', name: 'Marketing & Advertising', kind: 'expense', description: '', order: 14 },
  { id: 'contributor-payments', name: 'Contributor Payments', kind: 'expense', description: 'Payouts and airtime/data rewards to contributors', order: 15 },
  { id: 'research', name: 'Research & Data Collection', kind: 'expense', description: '', order: 16 },
  { id: 'operations', name: 'Operations & Administration', kind: 'expense', description: '', order: 17 },
  { id: 'transport', name: 'Transportation & Logistics', kind: 'expense', description: '', order: 18 },
  { id: 'equipment', name: 'Equipment & Assets', kind: 'expense', description: '', order: 19 },
  { id: 'legal-compliance', name: 'Legal & Compliance', kind: 'expense', description: '', order: 20 },
  { id: 'miscellaneous', name: 'Miscellaneous', kind: 'both', description: '', order: 21 },
];

const PLATFORM_SOURCES: Record<string, { name: string }> = {
  'platform-advertising': { name: 'Advertisers (platform payments)' },
  'platform-shop': { name: 'Shop customers (platform payments)' },
};

const str = (value: unknown, fallback = '') => typeof value === 'string' ? value : fallback;
const num = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;

export function normaliseTxn(id: string, d: DocumentData): Txn {
  return {
    id, number: str(d.number, id), type: (TXN_TYPES as readonly string[]).includes(d.type) ? d.type : 'expense',
    direction: d.direction === 'in' || d.direction === 'out' ? d.direction : null,
    adjustmentKind: (ADJUSTMENT_KINDS as readonly string[]).includes(d.adjustmentKind) ? d.adjustmentKind : null,
    amountMinor: num(d.amountMinor), currency: 'GHS', original: d.original ?? null, date: str(d.date), description: str(d.description),
    categoryId: d.categoryId ?? null, accountId: d.accountId ?? null, toAccountId: d.toAccountId ?? null, counterparty: str(d.counterparty),
    paymentMethod: str(d.paymentMethod), reference: str(d.reference), project: str(d.project), fundingSourceId: d.fundingSourceId ?? null,
    restricted: d.restricted === true, restrictionPurpose: str(d.restrictionPurpose), fundedBy: d.fundedBy ?? null, notes: str(d.notes),
    status: (TXN_STATUSES as readonly string[]).includes(d.status) ? d.status : 'draft', postingSequence: d.postingSequence ?? null,
    isReversal: d.isReversal === true, reversalOf: d.reversalOf ?? null, reversedBy: d.reversedBy ?? null, correctionOf: d.correctionOf ?? null,
    recurringId: d.recurringId ?? null, recurringDueDate: d.recurringDueDate ?? null, source: d.source ?? { kind: 'manual' },
    recordedBy: d.recordedBy ?? { uid: 'unknown', name: 'Unknown' }, authorisedBy: d.authorisedBy ?? null, attachments: Array.isArray(d.attachments) ? d.attachments : [],
    createdAt: str(d.createdAt), updatedAt: str(d.updatedAt), submittedAt: d.submittedAt ?? null, approvedAt: d.approvedAt ?? null,
    postedAt: d.postedAt ?? null, rejectedAt: d.rejectedAt ?? null, rejectionReason: str(d.rejectionReason), version: num(d.version) || 1,
  };
}

function normaliseSettings(d: DocumentData | undefined): Settings {
  const autoPost = { ...DEFAULT_SETTINGS.autoPost };
  for (const key of PLATFORM_KEYS) {
    const v = d?.autoPost?.[key];
    autoPost[key] = { post: v?.post === true, accountId: typeof v?.accountId === 'string' ? v.accountId : null };
  }
  return {
    autoPost, notifyEmails: Array.isArray(d?.notifyEmails) ? d!.notifyEmails.filter((e: unknown) => typeof e === 'string') : [],
    requireSecondApprover: d?.requireSecondApprover === true, upcomingWindowDays: num(d?.upcomingWindowDays) || 30, version: num(d?.version),
  };
}

interface Books {
  txns: Txn[]; accounts: Account[]; categories: Category[]; sources: FundingSource[]; budgets: Budget[]; recurring: Recurring[];
  reconciliations: Reconciliation[]; settings: Settings;
}

async function ensureCategories(): Promise<void> {
  const existing = await db().collection(CATEGORIES).limit(1).get();
  if (!existing.empty) return;
  const batch = db().batch();
  for (const c of DEFAULT_CATEGORIES) batch.set(db().collection(CATEGORIES).doc(c.id), { ...c, active: true, system: true, createdAt: nowIso() }, { merge: true });
  await batch.commit();
}

export async function loadBooks(): Promise<Books> {
  await ensureCategories();
  const [t, a, c, s, b, r, rec, settings] = await Promise.all([
    db().collection(TXNS).limit(50_000).get(), db().collection(ACCOUNTS).get(), db().collection(CATEGORIES).get(), db().collection(SOURCES).get(),
    db().collection(BUDGETS).get(), db().collection(RECURRING).get(), db().collection(RECONCILIATIONS).orderBy('createdAt', 'desc').limit(200).get(), db().doc(SETTINGS).get(),
  ]);
  return {
    txns: t.docs.map((d) => normaliseTxn(d.id, d.data())),
    accounts: a.docs.map((d) => ({ id: d.id, ...d.data() }) as Account).sort((x, y) => x.name.localeCompare(y.name)),
    categories: c.docs.map((d) => ({ id: d.id, ...d.data() }) as Category).sort((x, y) => (x.order ?? 99) - (y.order ?? 99) || x.name.localeCompare(y.name)),
    sources: [
      ...s.docs.map((d) => ({ id: d.id, attachments: [], ...d.data() }) as unknown as FundingSource),
      ...Object.entries(PLATFORM_SOURCES).filter(([id]) => !s.docs.some((d) => d.id === id))
        .map(([id, v]) => ({ id, name: v.name, kind: 'platform' as const, purpose: '', contact: '', notes: '', status: 'active' as const, system: true, attachments: [], createdAt: '' })),
    ].sort((x, y) => x.name.localeCompare(y.name)),
    budgets: b.docs.map((d) => ({ id: d.id, ...d.data() }) as Budget),
    recurring: r.docs.map((d) => ({ id: d.id, ...d.data() }) as Recurring).sort((x, y) => x.nextDueDate.localeCompare(y.nextDueDate)),
    reconciliations: rec.docs.map((d) => ({ id: d.id, ...d.data() }) as Reconciliation),
    settings: normaliseSettings(settings.data()),
  };
}

const namer = (books: Books) => ({
  category: (id: string | null) => id ? books.categories.find((c) => c.id === id)?.name ?? id : 'Uncategorised',
  source: (id: string | null) => id ? books.sources.find((s) => s.id === id)?.name ?? id : '—',
  account: (id: string | null) => id ? books.accounts.find((a) => a.id === id)?.name ?? id : 'Unassigned',
});

/* ==========================================================================
   Audit
   ========================================================================== */

interface AuditInput {
  targetType: 'transaction' | 'account' | 'category' | 'source' | 'budget' | 'recurring' | 'reconciliation' | 'settings' | 'role';
  targetId: string; action: string; actor: { uid: string; name: string }; statusBefore?: string | null; statusAfter?: string | null;
  changes?: { field: string; before: unknown; after: unknown }[]; reason?: string; metadata?: Record<string, unknown>; at?: string;
}

function writeAudit(tx: Transaction, input: AuditInput): void {
  const ref = db().collection(AUDIT).doc();
  tx.create(ref, {
    id: ref.id, targetType: input.targetType, targetId: input.targetId, action: input.action, actor: input.actor,
    statusBefore: input.statusBefore ?? null, statusAfter: input.statusAfter ?? null, changes: input.changes ?? [], reason: input.reason ?? '',
    metadata: input.metadata ?? {}, at: input.at ?? nowIso(),
  });
}

/* ==========================================================================
   Validation
   ========================================================================== */

const isDate = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
  && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
const ID = /^[A-Za-z0-9_-]{1,80}$/;
const optionalId = (value: unknown, field: string): string | null => {
  if (value == null || value === '') return null;
  if (typeof value !== 'string' || !ID.test(value)) throw new HttpsError('invalid-argument', `${field} is not valid.`);
  return value;
};

function amount(value: unknown, field = 'Amount'): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new HttpsError('invalid-argument', `${field} must be a positive amount in pesewas.`);
  if (n > MAX_AMOUNT_MINOR) throw new HttpsError('invalid-argument', `${field} is larger than any single entry this ledger accepts.`);
  return n;
}

type TxnFields = Pick<Txn, typeof EDITABLE_FIELDS[number]>;

/** Shapes and checks the fields a person may set; references to accounts, categories and sources are checked against the books. */
function parseTxnFields(raw: Record<string, unknown>, books: Books): TxnFields {
  const type = raw.type as TxnType;
  if (!(TXN_TYPES as readonly string[]).includes(type)) throw new HttpsError('invalid-argument', 'Choose a transaction type.');
  const direction = type === 'refund' || type === 'adjustment' ? raw.direction : null;
  if ((type === 'refund' || type === 'adjustment') && direction !== 'in' && direction !== 'out') {
    throw new HttpsError('invalid-argument', type === 'refund' ? 'Say whether the refund was received or paid out.' : 'Say whether the adjustment adds or removes money.');
  }
  const adjustmentKind = type === 'adjustment' ? raw.adjustmentKind : null;
  if (type === 'adjustment' && !(ADJUSTMENT_KINDS as readonly string[]).includes(String(adjustmentKind))) throw new HttpsError('invalid-argument', 'Choose opening balance, correction or reconciliation.');

  let original: Txn['original'] = null;
  let amountMinor: number;
  const originalRaw = raw.original as Record<string, unknown> | null | undefined;
  if (originalRaw && originalRaw.currency && originalRaw.currency !== 'GHS') {
    const currency = String(originalRaw.currency);
    if (CURRENCY_DIGITS[currency] === undefined) throw new HttpsError('invalid-argument', `Payments in ${currency} are not supported yet.`);
    const originalMinor = amount(originalRaw.amountMinor, 'Original amount');
    const rate = String(originalRaw.rate ?? '');
    try { amountMinor = convertToGhsMinor(originalMinor, currency, rate); }
    catch (error) { throw new HttpsError('invalid-argument', error instanceof Error ? error.message : 'Check the exchange rate.'); }
    if (amountMinor <= 0) throw new HttpsError('invalid-argument', 'The converted amount is below one pesewa.');
    original = { currency, amountMinor: originalMinor, rate: rate.trim() };
  } else {
    amountMinor = amount(raw.amountMinor);
  }

  if (!isDate(raw.date)) throw new HttpsError('invalid-argument', 'Enter the transaction date.');
  const description = boundedText(raw.description, 300, 'Description', { min: 3 });

  const categoryId = optionalId(raw.categoryId, 'Category');
  if (categoryId) {
    const category = books.categories.find((c) => c.id === categoryId);
    if (!category || !category.active) throw new HttpsError('invalid-argument', 'Choose an active category.');
    if (type === 'income' && category.kind === 'expense') throw new HttpsError('invalid-argument', 'That is an expense category; choose an income category.');
    if (type === 'expense' && category.kind === 'income') throw new HttpsError('invalid-argument', 'That is an income category; choose an expense category.');
  }
  const accountId = optionalId(raw.accountId, 'Account');
  const toAccountId = type === 'transfer' ? optionalId(raw.toAccountId, 'Destination account') : null;
  for (const id of [accountId, toAccountId]) {
    if (id && !books.accounts.some((a) => a.id === id && a.status === 'active')) throw new HttpsError('invalid-argument', 'Choose an active payment account.');
  }
  if (type === 'transfer' && accountId && toAccountId && accountId === toAccountId) throw new HttpsError('invalid-argument', 'A transfer needs two different accounts.');

  const fundingSourceId = type === 'income' || type === 'refund' ? optionalId(raw.fundingSourceId, 'Funding source') : null;
  const fundedBy = type === 'expense' ? optionalId(raw.fundedBy, 'Funding allocation') : null;
  for (const id of [fundingSourceId, fundedBy]) {
    if (id && !books.sources.some((s) => s.id === id)) throw new HttpsError('invalid-argument', 'Choose a funding source from the list.');
  }
  const restricted = type === 'income' && Boolean(fundingSourceId) && raw.restricted === true;
  return {
    type, direction: direction as Txn['direction'], adjustmentKind: adjustmentKind as Txn['adjustmentKind'], amountMinor, original, date: raw.date, description,
    categoryId, accountId, toAccountId,
    counterparty: boundedText(raw.counterparty, 160, 'Sender or recipient', { optional: true }),
    paymentMethod: boundedText(raw.paymentMethod, 60, 'Payment method', { optional: true }),
    reference: boundedText(raw.reference, 120, 'Reference', { optional: true }),
    project: boundedText(raw.project, 120, 'Project or department', { optional: true }),
    fundingSourceId, restricted,
    restrictionPurpose: restricted ? boundedText(raw.restrictionPurpose, 300, 'Restricted purpose', { min: 3 }) : '',
    fundedBy,
    notes: boundedText(raw.notes, 2000, 'Internal notes', { optional: true, multiline: true }),
  };
}

/** What must be present before an entry can be submitted, approved or posted. */
function completenessProblem(t: Txn, books: Books): string | null {
  if (!t.accountId) return t.type === 'transfer' ? 'Choose the account the money left.' : 'Choose the payment account.';
  if (t.type === 'transfer' && !t.toAccountId) return 'Choose the account the money went to.';
  if ((t.type === 'income' || t.type === 'expense') && !t.categoryId) return 'Every income and expense needs a category.';
  if (t.type === 'expense' && t.categoryId && books.categories.find((c) => c.id === t.categoryId)?.kind === 'income') return 'Choose an expense category.';
  return null;
}

/* ==========================================================================
   Numbering and posting
   ========================================================================== */

async function nextNumbers(tx: Transaction, want: { number?: boolean; posting?: boolean }): Promise<{ number?: string; posting?: number }> {
  const ref = db().doc(COUNTERS);
  const snap = await tx.get(ref);
  const current = { number: num(snap.get('number')), posting: num(snap.get('posting')) };
  const out: { number?: string; posting?: number } = {};
  const next = { ...current };
  if (want.number) { next.number += 1; out.number = `IWF-${String(next.number).padStart(6, '0')}`; }
  if (want.posting) { next.posting += 1; out.posting = next.posting; }
  tx.set(ref, next, { merge: true });
  return out;
}

const referenceKey = (accountId: string | null, reference: string) => hash(`${accountId ?? '-'}|${reference.trim().toLowerCase()}`, 32);

/**
 * Reads everything a posting needs to check. All reads happen before any
 * write, as Firestore transactions require.
 */
async function readForPosting(tx: Transaction, t: Txn) {
  const refDoc = t.reference ? await tx.get(db().collection(REFERENCES).doc(referenceKey(t.accountId, t.reference))) : null;
  const recurring = t.recurringId ? await tx.get(db().collection(RECURRING).doc(t.recurringId)) : null;
  return { refDoc, recurring };
}

function applyPosting(tx: Transaction, t: Txn, reads: Awaited<ReturnType<typeof readForPosting>>) {
  if (t.reference && reads.refDoc) {
    if (reads.refDoc.exists && reads.refDoc.get('released') !== true && reads.refDoc.get('txnId') !== t.id) {
      throw new HttpsError('already-exists', `Reference “${t.reference}” is already posted on this account as ${reads.refDoc.get('number')}. Reverse that entry first if it was wrong.`);
    }
    tx.set(reads.refDoc.ref, { txnId: t.id, number: t.number, accountId: t.accountId, reference: t.reference, released: false, at: nowIso() });
  }
  if (reads.recurring?.exists && t.recurringDueDate && reads.recurring.get('nextDueDate') === t.recurringDueDate) {
    const freq = reads.recurring.get('frequency') as Frequency;
    tx.update(reads.recurring.ref, { nextDueDate: addPeriod(t.recurringDueDate, freq, num(reads.recurring.get('anchorDay')) || undefined), lastPaidDate: t.date, updatedAt: nowIso() });
  }
}

/* ==========================================================================
   Platform money: logged from records the platform already confirmed
   ========================================================================== */

export interface PlatformEvent {
  platform: PlatformKey; key: string; type: 'income' | 'expense' | 'refund'; direction?: 'in' | 'out';
  amountMinor: number; date: string; description: string; categoryId: string; fundingSourceId: string | null;
  counterparty: string; paymentMethod: string; reference: string; platformRef: string; notes?: string;
}

export const platformTxnId = (key: string) => `plat-${hash(key, 28)}`;

/**
 * Adds one confirmed platform money movement to the ledger, once. With
 * auto-posting configured for that source (and an account chosen) it is
 * posted directly; otherwise it waits for a finance administrator to confirm
 * the account and approve it. Either way it never posts twice.
 */
export async function recordPlatformEvent(event: PlatformEvent): Promise<'created' | 'exists'> {
  if (!Number.isInteger(event.amountMinor) || event.amountMinor <= 0 || !isDate(event.date)) {
    logger.warn('Skipped a platform money event without a usable amount or date', { platform: event.platform, key: event.key });
    return 'exists';
  }
  await ensureCategories();
  const ref = db().collection(TXNS).doc(platformTxnId(event.key));
  const settingsRef = db().doc(SETTINGS);
  return db().runTransaction(async (tx) => {
    const [existing, settingsSnap] = await Promise.all([tx.get(ref), tx.get(settingsRef)]);
    if (existing.exists) return 'exists' as const;
    const settings = normaliseSettings(settingsSnap.data());
    const route = settings.autoPost[event.platform];
    const post = route.post && Boolean(route.accountId);
    const at = nowIso();
    const draft: Txn = normaliseTxn(ref.id, {
      type: event.type, direction: event.type === 'refund' ? event.direction ?? 'out' : null, amountMinor: event.amountMinor, date: event.date,
      description: event.description.slice(0, 300), categoryId: event.categoryId, accountId: route.accountId, counterparty: event.counterparty,
      paymentMethod: event.paymentMethod, reference: event.reference.slice(0, 120), fundingSourceId: event.fundingSourceId, notes: event.notes ?? '',
      status: post ? 'posted' : 'pending_approval', source: { kind: 'platform', platform: event.platform, ref: event.platformRef },
      recordedBy: { uid: 'system', name: 'Indigen World platform' }, createdAt: at, updatedAt: at, submittedAt: at, version: 1,
    });
    const reads = post ? await readForPosting(tx, draft) : null;
    const numbers = await nextNumbers(tx, { number: true, posting: post });
    const txn: Txn = { ...draft, number: numbers.number!, postingSequence: numbers.posting ?? null, ...(post ? { postedAt: at, approvedAt: at, authorisedBy: { uid: 'system', name: 'Auto-posting rule' } } : {}) };
    if (post && reads) {
      try { applyPosting(tx, txn, reads); }
      catch { txn.status = 'pending_approval'; txn.postingSequence = null; txn.postedAt = null; txn.approvedAt = null; txn.authorisedBy = null; txn.notes = `${txn.notes}\nNot auto-posted: its reference is already posted on this account.`.trim(); }
    }
    tx.create(ref, txn as unknown as DocumentData);
    writeAudit(tx, { targetType: 'transaction', targetId: ref.id, action: 'platform.recorded', actor: { uid: 'system', name: 'Indigen World platform' },
      statusBefore: null, statusAfter: txn.status, metadata: { platform: event.platform, platformRef: event.platformRef, amountMinor: event.amountMinor } , at });
    return 'created' as const;
  });
}

const dayOf = (value: unknown): string => {
  if (typeof value === 'string' && value.length >= 10) return value.slice(0, 10);
  if (value && typeof (value as { toDate?: () => Date }).toDate === 'function') return (value as { toDate: () => Date }).toDate().toISOString().slice(0, 10);
  return accraToday();
};

export function adEvent(id: string, d: DocumentData): PlatformEvent | null {
  const payment = d.payment ?? {};
  if (!['paid', 'underpaid'].includes(payment.status)) return null;
  const paid = num(payment.amountPaidPesewas);
  if (!paid || !payment.reference) return null;
  return {
    platform: 'ads', key: `ads:${payment.reference}`, type: 'income', amountMinor: paid, date: dayOf(payment.paidAt ?? d.updatedAt),
    description: `Advertising campaign payment — “${str(d.name, 'campaign').slice(0, 120)}”${payment.status === 'underpaid' ? ' (short payment)' : ''}`,
    categoryId: 'advertising-revenue', fundingSourceId: 'platform-advertising', counterparty: 'Advertiser (campaign owner)',
    paymentMethod: `Paystack${payment.channel ? ` · ${payment.channel}` : ''}`, reference: String(payment.reference), platformRef: `adCampaigns/${id}`,
  };
}

export function shopEvent(id: string, d: DocumentData): PlatformEvent | null {
  if (d.currency && d.currency !== 'GHS') { logger.warn('Shop transaction not in GHS left for manual entry', { id }); return null; }
  const minor = Math.abs(num(d.amountMinor));
  if (!minor) return null;
  if (d.kind === 'payment') {
    return { platform: 'shop', key: `shop:${id}`, type: 'income', amountMinor: minor, date: dayOf(d.verifiedAt), description: `Shop order payment — order ${str(d.orderId).slice(0, 12)}`,
      categoryId: 'shop-sales', fundingSourceId: 'platform-shop', counterparty: 'Shop customer', paymentMethod: 'Paystack', reference: str(d.reference, id), platformRef: `shopTransactions/${id}` };
  }
  if (d.kind === 'refund') {
    return { platform: 'shop', key: `shop:${id}`, type: 'refund', direction: 'out', amountMinor: minor, date: dayOf(d.verifiedAt), description: `Shop refund — order ${str(d.orderId).slice(0, 12)}`,
      categoryId: 'shop-sales', fundingSourceId: 'platform-shop', counterparty: 'Shop customer', paymentMethod: 'Paystack refund', reference: str(d.providerId, id), platformRef: `shopTransactions/${id}` };
  }
  return null;
}

export function redemptionEvent(id: string, d: DocumentData): PlatformEvent | null {
  if (d.status !== 'fulfilled' || !num(d.amountMinor)) return null;
  const kind = d.kind === 'data' ? 'mobile data' : 'airtime';
  return {
    platform: 'redemptions', key: `redemption:${id}`, type: 'expense', amountMinor: num(d.amountMinor), date: dayOf(d.paidAt ?? d.updatedAt),
    description: `Contributor reward: ${str(d.network)} ${kind} for ${num(d.points)} points`.replace(/\s+/g, ' '), categoryId: 'contributor-payments', fundingSourceId: null,
    counterparty: 'Contributor (points redemption)', paymentMethod: `${str(d.network)} ${kind}`.trim(), reference: str(d.paymentReference) || str(d.providerReference) || id,
    platformRef: `contributorRedemptions/${id}`,
  };
}

export function payoutEvent(id: string, d: DocumentData): PlatformEvent | null {
  if (d.status !== 'paid' || !num(d.amountMinor)) return null;
  return {
    platform: 'payouts', key: `payout:${id}`, type: 'expense', amountMinor: num(d.amountMinor), date: dayOf(d.paidAt ?? d.updatedAt),
    description: `Contributor payment${d.description ? ` — ${str(d.description).slice(0, 160)}` : ''}`, categoryId: 'contributor-payments', fundingSourceId: null,
    counterparty: 'Contributor (payment request)', paymentMethod: '', reference: str(d.paymentReference) || id, platformRef: `contributorPaymentRequests/${id}`,
  };
}

/** Catches up with every confirmed platform movement. Safe to run any number of times. */
export async function syncPlatform(): Promise<Record<PlatformKey, { seen: number; created: number }>> {
  const result: Record<PlatformKey, { seen: number; created: number }> = { ads: { seen: 0, created: 0 }, shop: { seen: 0, created: 0 }, redemptions: { seen: 0, created: 0 }, payouts: { seen: 0, created: 0 } };
  const run = async (key: PlatformKey, docs: FirebaseFirestore.QueryDocumentSnapshot[], toEvent: (id: string, d: DocumentData) => PlatformEvent | null) => {
    for (const doc of docs) {
      const event = toEvent(doc.id, doc.data());
      if (!event) continue;
      result[key].seen += 1;
      if (await recordPlatformEvent(event) === 'created') result[key].created += 1;
    }
  };
  const [ads, shop, redemptions, payouts] = await Promise.all([
    db().collection('adCampaigns').where('payment.status', 'in', ['paid', 'underpaid']).get(),
    db().collection('shopTransactions').get(),
    db().collection('contributorRedemptions').where('status', '==', 'fulfilled').get(),
    db().collection('contributorPaymentRequests').where('status', '==', 'paid').get(),
  ]);
  await run('ads', ads.docs, adEvent);
  await run('shop', shop.docs, shopEvent);
  await run('redemptions', redemptions.docs, redemptionEvent);
  await run('payouts', payouts.docs, payoutEvent);
  return result;
}

/** Money the platform has promised but not yet paid: approved redemptions and payment requests. */
async function platformCommitments(): Promise<{ redemptionsMinor: number; payoutsMinor: number; available: boolean }> {
  try {
    const [r, p] = await Promise.all([
      db().collection('contributorRedemptions').where('status', 'in', ['approved', 'needs_reconciliation']).aggregate({ total: AggregateField.sum('amountMinor') }).get(),
      db().collection('contributorPaymentRequests').where('status', '==', 'approved').aggregate({ total: AggregateField.sum('amountMinor') }).get(),
    ]);
    return { redemptionsMinor: num(r.data().total), payoutsMinor: num(p.data().total), available: true };
  } catch (error) {
    logger.warn('Platform commitments could not be totalled', { errorType: error instanceof Error ? error.name : 'unknown' });
    return { redemptionsMinor: 0, payoutsMinor: 0, available: false };
  }
}

/* ==========================================================================
   Read models
   ========================================================================== */

function rangeFor(raw: Record<string, unknown>, today: string, books: Books): { from: string | null; to: string; label: string; key: string } {
  const key = str(raw.range, 'all');
  const first = books.txns.filter((t) => isCounting(t.status)).map((t) => t.date).sort()[0] ?? today;
  switch (key) {
    case '7d': return { from: addDays(today, -6), to: today, label: 'Last 7 days', key };
    case '30d': return { from: addDays(today, -29), to: today, label: 'Last 30 days', key };
    case '90d': return { from: addDays(today, -89), to: today, label: 'Last 90 days', key };
    case 'year': return { from: `${today.slice(0, 4)}-01-01`, to: today, label: `This year (${today.slice(0, 4)})`, key };
    case 'custom': {
      if (!isDate(raw.from) || !isDate(raw.to) || raw.from > raw.to) throw new HttpsError('invalid-argument', 'Choose a start date on or before the end date.');
      return { from: raw.from, to: raw.to, label: `${raw.from} to ${raw.to}`, key };
    }
    default: return { from: null, to: today, label: `All time (since ${first})`, key: 'all' };
  }
}

function upcomingRecurring(books: Books, today: string, windowDays: number) {
  const until = addDays(today, windowDays);
  return books.recurring.filter((r) => r.status === 'active' && r.nextDueDate <= until)
    .map((r) => ({ id: r.id, name: r.name, dueDate: r.nextDueDate, amountMinor: r.ghsEstimateMinor || r.amountMinor, currency: r.currency, overdue: r.nextDueDate < today, daysAway: daysBetween(today, r.nextDueDate) }));
}

async function overview(raw: Record<string, unknown>) {
  const books = await loadBooks();
  const today = accraToday();
  const range = rangeFor(raw, today, books);
  const names = namer(books);
  const lifetime = summarise(books.txns);
  const period = summarise(books.txns, { from: range.from, to: range.to });
  const month = summarise(books.txns, { from: `${monthOf(today)}-01`, to: today });
  const platform = await platformCommitments();
  const internalCommitted = committedMinor(books.txns);
  const upcoming = upcomingRecurring(books, today, books.settings.upcomingWindowDays);
  const upcomingMinor = upcoming.reduce((sum, u) => sum + u.amountMinor, 0);
  const committedTotal = internalCommitted + platform.redemptionsMinor + platform.payoutsMinor;
  const budgets = books.budgets.filter((b) => b.status === 'active').map((budget) => ({ budget, status: budgetStatus(budget, books.txns) }));
  const balances = accountBalances(books.txns);
  const inflow = lifetime.netIncomeMinor + Math.max(0, lifetime.adjustmentsMinor);
  return {
    asOf: nowIso(), today, range,
    lifetime, period, month,
    commitments: { internalApprovedMinor: internalCommitted, redemptionsMinor: platform.redemptionsMinor, payoutsMinor: platform.payoutsMinor, platformAvailable: platform.available,
      totalMinor: committedTotal, upcomingRecurringMinor: upcomingMinor },
    availableAfterCommitmentsMinor: lifetime.closingMinor - committedTotal - upcomingMinor,
    spentShareBps: inflow > 0 ? Math.round((lifetime.netExpenseMinor * 10_000) / inflow) : 0,
    workflow: {
      drafts: books.txns.filter((t) => t.status === 'draft').length,
      pendingApproval: books.txns.filter((t) => t.status === 'pending_approval').length,
      platformPending: books.txns.filter((t) => t.status === 'pending_approval' && t.source.kind === 'platform').length,
      approvedUnpaid: books.txns.filter((t) => t.status === 'approved').length,
      openReconciliations: books.reconciliations.filter((r) => r.status === 'open').length,
    },
    balanceSeries: balanceSeries(books.txns, { from: range.from, to: range.to }, today),
    monthly: monthlySeries(books.txns, { from: range.from, to: range.to }, today).slice(-24),
    categories: spendingByCategory(books.txns, { from: range.from, to: range.to }).map((c) => ({ ...c, name: names.category(c.categoryId) })),
    incomeCategories: incomeByCategory(books.txns, { from: range.from, to: range.to }).map((c) => ({ ...c, name: names.category(c.categoryId) })),
    sources: fundingSources(books.txns, { from: range.from, to: range.to }).map((s) => ({ ...s, name: names.source(s.sourceId) })),
    accounts: books.accounts.map((a) => ({ id: a.id, name: a.name, type: a.type, status: a.status, balanceMinor: balances.get(a.id) ?? 0 })),
    unassignedMinor: balances.get('unassigned') ?? 0,
    budgets: budgets.map(({ budget, status }) => ({ ...budget, ...status })),
    upcoming,
    recent: queryLedger(books.txns, { statuses: 'books', limit: 8 }).rows.map(rowOut(books)),
    insights: insights({ txns: books.txns, today, categoryName: names.category, sourceName: names.source, upcoming: upcoming.map((u) => ({ name: u.name, dueDate: u.dueDate })), budgets }),
  };
}

const rowOut = (books: Books) => {
  const names = namer(books);
  return ({ txn, effect, runningBalanceMinor }: ReturnType<typeof queryLedger>['rows'][number]) => ({
    ...txn, signedMinor: txn.type === 'transfer' ? 0 : effect.balanceMinor, runningBalanceMinor, typeLabel: typeLabel(txn),
    categoryName: names.category(txn.categoryId), accountName: names.account(txn.accountId), toAccountName: txn.toAccountId ? names.account(txn.toAccountId) : null,
    fundingSourceName: txn.fundingSourceId ? names.source(txn.fundingSourceId) : null, fundedByName: txn.fundedBy ? names.source(txn.fundedBy) : null,
  });
};

function parseQuery(raw: Record<string, unknown>): LedgerQuery {
  const statuses = raw.statuses === 'all' || raw.statuses === 'books' ? raw.statuses
    : Array.isArray(raw.statuses) ? (raw.statuses as string[]).filter((s): s is TxnStatus => (TXN_STATUSES as readonly string[]).includes(s)) : 'books';
  return {
    q: boundedText(raw.q, 120, 'Search', { optional: true }),
    from: isDate(raw.from) ? raw.from : undefined, to: isDate(raw.to) ? raw.to : undefined,
    types: Array.isArray(raw.types) ? (raw.types as string[]).filter((t): t is TxnType => (TXN_TYPES as readonly string[]).includes(t)) : undefined,
    statuses, categoryId: optionalId(raw.categoryId, 'Category') ?? undefined, fundingSourceId: optionalId(raw.fundingSourceId, 'Funding source') ?? undefined,
    accountId: optionalId(raw.accountId, 'Account') ?? undefined, sort: raw.sort === 'amount' ? 'amount' : 'date', order: raw.order === 'asc' ? 'asc' : 'desc',
    offset: Math.max(0, Math.floor(num(raw.offset))), limit: Math.min(200, Math.max(1, Math.floor(num(raw.limit)) || 50)),
  };
}

/* ==========================================================================
   Transaction workflow
   ========================================================================== */

async function getTxn(tx: Transaction, id: unknown) {
  if (typeof id !== 'string' || !ID.test(id)) throw new HttpsError('invalid-argument', 'Choose a transaction.');
  const ref = db().collection(TXNS).doc(id);
  const snap = await tx.get(ref);
  if (!snap.exists) throw new HttpsError('not-found', 'That transaction does not exist.');
  return { ref, txn: normaliseTxn(snap.id, snap.data()!) };
}

function expectVersion(txn: Txn, raw: Record<string, unknown>) {
  if (raw.expectedVersion !== undefined && num(raw.expectedVersion) !== txn.version) {
    throw new HttpsError('aborted', 'Someone changed this entry since you opened it. Reload it and try again.');
  }
}

function possibleDuplicates(books: Books, t: Txn): Txn[] {
  return books.txns.filter((o) => o.id !== t.id && !['rejected', 'discarded'].includes(o.status) && !o.isReversal && o.status !== 'reversed'
    && o.type === t.type && o.amountMinor === t.amountMinor && o.date === t.date
    && ((t.reference && o.reference && o.reference.toLowerCase() === t.reference.toLowerCase()) || (o.accountId === t.accountId && o.description.toLowerCase() === t.description.toLowerCase())));
}

/** Create or edit an entry that is not yet in the books. `intent` decides where it goes next. */
async function saveTxn(actor: Actor, raw: Record<string, unknown>) {
  const intent = str(raw.intent, 'draft') as 'draft' | 'submit' | 'post' | 'commit';
  if (!['draft', 'submit', 'post', 'commit'].includes(intent)) throw new HttpsError('invalid-argument', 'Unknown save intent.');
  if ((intent === 'post' || intent === 'commit') && actor.level !== 'admin') throw new HttpsError('permission-denied', 'Only a finance administrator can post or approve. Submit it for approval instead.');
  const books = await loadBooks();
  const fields = parseTxnFields((raw.fields ?? {}) as Record<string, unknown>, books);
  const today = accraToday();
  if ((intent === 'post') && fields.date > today) throw new HttpsError('failed-precondition', 'A posted entry records money that has already moved; its date cannot be in the future. Save it as a draft or approve it as a commitment.');
  if (intent === 'commit' && fields.type !== 'expense') throw new HttpsError('invalid-argument', 'Only expenses can be approved as unpaid commitments.');
  const existingId = raw.id ? String(raw.id) : null;
  const requestKey = str(raw.requestKey);
  if (!existingId && !/^[A-Za-z0-9_-]{8,64}$/.test(requestKey)) throw new HttpsError('invalid-argument', 'A request key is required so a retry cannot record the entry twice.');
  const id = existingId ?? `txn-${hash(`${actor.uid}:${requestKey}`, 24)}`;
  const recurringId = optionalId(raw.recurringId, 'Recurring expense');
  const recurringDueDate = recurringId && isDate(raw.recurringDueDate) ? raw.recurringDueDate : null;
  const correctionOf = optionalId(raw.correctionOf, 'Corrected entry');

  // Soft checks that need the whole book, before the transaction.
  const candidateStatus: TxnStatus = intent === 'post' ? 'posted' : intent === 'commit' ? 'approved' : intent === 'submit' ? 'pending_approval' : 'draft';
  const probe = normaliseTxn(id, { ...fields, status: candidateStatus, createdAt: nowIso() });
  if (intent !== 'draft') {
    const problem = completenessProblem(probe, books);
    if (problem) throw new HttpsError('failed-precondition', problem);
    const duplicates = possibleDuplicates(books, probe);
    if (duplicates.length && raw.allowDuplicate !== true) {
      throw new HttpsError('already-exists', `This looks like ${duplicates[0].number} (${duplicates[0].description}, ${formatGhs(duplicates[0].amountMinor)} on ${duplicates[0].date}). Confirm it is a separate payment to continue.`,
        { duplicates: duplicates.slice(0, 3).map((d) => ({ id: d.id, number: d.number, description: d.description, date: d.date, status: d.status })) });
    }
  }
  let budgetWarnings: string[] = [];
  if (intent === 'post' || intent === 'commit') {
    const impact = budgetImpact(books.budgets, books.txns, probe);
    if (impact.blocked.length) {
      throw new HttpsError('failed-precondition', `${impact.blocked[0].budget.name} has a spending control and this would take it ${formatGhs(-impact.blocked[0].after.remainingMinor)} over its allocation.`);
    }
    budgetWarnings = impact.warnings.map((w) => w.after.state === 'over' ? `${w.budget.name} will be ${formatGhs(-w.after.remainingMinor)} over its allocation.` : `${w.budget.name} will be at ${(w.after.utilisedBps / 100).toFixed(0)}% of its allocation.`);
  }
  if (intent === 'post' || intent === 'commit') {
    const own = existingId ? books.txns.find((t) => t.id === existingId) : null;
    if (books.settings.requireSecondApprover && (!own || own.recordedBy.uid === actor.uid)) {
      throw new HttpsError('failed-precondition', 'Two-person approval is on: submit this for approval and another finance administrator approves it.');
    }
  }

  const at = nowIso();
  const result = await db().runTransaction(async (tx) => {
    const ref = db().collection(TXNS).doc(id);
    const snap = await tx.get(ref);
    let before: Txn | null = null;
    if (snap.exists) {
      before = normaliseTxn(snap.id, snap.data()!);
      if (!existingId) {
        if (before.recordedBy.uid !== actor.uid) throw new HttpsError('already-exists', 'That request key was already used.');
        return { id, number: before.number, status: before.status, replayed: true };
      }
      if (!['draft', 'pending_approval', 'rejected'].includes(before.status)) {
        throw new HttpsError('failed-precondition', 'Posted and approved entries cannot be edited. Reverse or correct it instead.');
      }
      if (before.source.kind === 'platform' && (fields.amountMinor !== before.amountMinor || fields.type !== before.type)) {
        throw new HttpsError('failed-precondition', 'The amount and type of a platform-recorded payment come from the platform record and cannot be edited.');
      }
      expectVersion(before, raw);
    } else if (existingId) {
      throw new HttpsError('not-found', 'That transaction does not exist.');
    }
    const draft: Txn = normaliseTxn(id, {
      ...(before ?? {}), ...fields, status: candidateStatus,
      recurringId: before?.recurringId ?? recurringId, recurringDueDate: before?.recurringDueDate ?? recurringDueDate, correctionOf: before?.correctionOf ?? correctionOf,
      source: before?.source ?? { kind: recurringId ? 'recurring' : 'manual' },
      recordedBy: before?.recordedBy ?? { uid: actor.uid, name: actor.name }, createdAt: before?.createdAt ?? at, updatedAt: at,
      version: (before?.version ?? 0) + 1, rejectionReason: '', rejectedAt: null,
      submittedAt: intent === 'draft' ? before?.submittedAt ?? null : at,
      approvedAt: intent === 'post' || intent === 'commit' ? at : null,
      postedAt: intent === 'post' ? at : null,
      authorisedBy: intent === 'post' || intent === 'commit' ? { uid: actor.uid, name: actor.name } : null,
      attachments: before?.attachments ?? [],
    });
    const reads = intent === 'post' ? await readForPosting(tx, draft) : null;
    const numbers = await nextNumbers(tx, { number: !before, posting: intent === 'post' });
    const txn: Txn = { ...draft, number: before?.number ?? numbers.number!, postingSequence: numbers.posting ?? null };
    if (reads) applyPosting(tx, txn, reads);
    tx.set(ref, txn as unknown as DocumentData);
    writeAudit(tx, {
      targetType: 'transaction', targetId: id, actor, at,
      action: !before ? `transaction.created.${candidateStatus}` : `transaction.updated.${candidateStatus}`,
      statusBefore: before?.status ?? null, statusAfter: txn.status,
      changes: diffFields(before as unknown as Record<string, unknown> | null, txn as unknown as Record<string, unknown>, EDITABLE_FIELDS),
      reason: str(raw.reason).slice(0, 500), metadata: { allowDuplicate: raw.allowDuplicate === true, correctionOf: txn.correctionOf },
    });
    return { id, number: txn.number, status: txn.status, replayed: false };
  });
  return { ...result, budgetWarnings };
}

/** Approve a pending entry: post it (money moved) or, for an expense, commit it (approved, unpaid). */
async function approveTxn(actor: Actor, raw: Record<string, unknown>) {
  const mode = raw.mode === 'commit' ? 'commit' : 'post';
  const books = await loadBooks();
  const accountId = optionalId(raw.accountId, 'Account');
  if (accountId && !books.accounts.some((a) => a.id === accountId && a.status === 'active')) throw new HttpsError('invalid-argument', 'Choose an active payment account.');
  const current = books.txns.find((t) => t.id === raw.id);
  if (!current) throw new HttpsError('not-found', 'That transaction does not exist.');
  const candidate: Txn = { ...current, accountId: accountId ?? current.accountId, status: mode === 'post' ? 'posted' : 'approved' };
  const problem = completenessProblem(candidate, books);
  if (problem) throw new HttpsError('failed-precondition', problem);
  if (mode === 'post' && candidate.date > accraToday()) throw new HttpsError('failed-precondition', 'This entry is dated in the future. Approve it as an unpaid commitment, then mark it paid when the money moves.');
  if (mode === 'commit' && candidate.type !== 'expense') throw new HttpsError('invalid-argument', 'Only expenses can be approved as unpaid commitments.');
  if (books.settings.requireSecondApprover && current.recordedBy.uid === actor.uid) throw new HttpsError('failed-precondition', 'Two-person approval is on: another finance administrator must approve your entry.');
  const impact = budgetImpact(books.budgets, books.txns, candidate);
  if (impact.blocked.length) throw new HttpsError('failed-precondition', `${impact.blocked[0].budget.name} has a spending control and this would take it over its allocation.`);
  const at = nowIso();
  await db().runTransaction(async (tx) => {
    const { ref, txn } = await getTxn(tx, raw.id);
    if (txn.status !== 'pending_approval' && txn.status !== 'draft') throw new HttpsError('failed-precondition', `This entry is ${txn.status.replace('_', ' ')} and cannot be approved.`);
    expectVersion(txn, raw);
    const next: Txn = { ...txn, accountId: accountId ?? txn.accountId, status: mode === 'post' ? 'posted' : 'approved', approvedAt: at, postedAt: mode === 'post' ? at : null,
      authorisedBy: { uid: actor.uid, name: actor.name }, updatedAt: at, version: txn.version + 1, submittedAt: txn.submittedAt ?? at };
    const reads = mode === 'post' ? await readForPosting(tx, next) : null;
    if (mode === 'post') next.postingSequence = (await nextNumbers(tx, { posting: true })).posting!;
    if (reads) applyPosting(tx, next, reads);
    tx.set(ref, next as unknown as DocumentData);
    writeAudit(tx, { targetType: 'transaction', targetId: txn.id, actor, at, action: mode === 'post' ? 'transaction.approved.posted' : 'transaction.approved.committed',
      statusBefore: txn.status, statusAfter: next.status, changes: diffFields(txn as unknown as Record<string, unknown>, next as unknown as Record<string, unknown>, ['accountId']),
      reason: str(raw.note).slice(0, 500) });
  });
  return { id: current.id, status: mode === 'post' ? 'posted' : 'approved', budgetWarnings: impact.warnings.map((w) => w.budget.name) };
}

/** An approved, unpaid expense is paid: it enters the books on the payment date. */
async function markPaid(actor: Actor, raw: Record<string, unknown>) {
  const date = isDate(raw.date) ? raw.date : accraToday();
  if (date > accraToday()) throw new HttpsError('invalid-argument', 'The payment date cannot be in the future.');
  const reference = boundedText(raw.reference, 120, 'Payment reference', { optional: true });
  const at = nowIso();
  return db().runTransaction(async (tx) => {
    const { ref, txn } = await getTxn(tx, raw.id);
    if (txn.status !== 'approved') throw new HttpsError('failed-precondition', 'Only an approved, unpaid expense can be marked paid.');
    expectVersion(txn, raw);
    const next: Txn = { ...txn, date, reference: reference || txn.reference, status: 'posted', postedAt: at, updatedAt: at, version: txn.version + 1 };
    const reads = await readForPosting(tx, next);
    next.postingSequence = (await nextNumbers(tx, { posting: true })).posting!;
    applyPosting(tx, next, reads);
    tx.set(ref, next as unknown as DocumentData);
    writeAudit(tx, { targetType: 'transaction', targetId: txn.id, actor, at, action: 'transaction.paid', statusBefore: 'approved', statusAfter: 'posted',
      changes: diffFields(txn as unknown as Record<string, unknown>, next as unknown as Record<string, unknown>, ['date', 'reference']) });
    return { id: txn.id, status: 'posted' };
  });
}

async function rejectTxn(actor: Actor, raw: Record<string, unknown>) {
  const reason = boundedText(raw.reason, 1000, 'Reason', { min: 3, multiline: true });
  const at = nowIso();
  return db().runTransaction(async (tx) => {
    const { ref, txn } = await getTxn(tx, raw.id);
    if (!['pending_approval', 'approved'].includes(txn.status)) throw new HttpsError('failed-precondition', 'Only entries awaiting approval or approved-but-unpaid can be rejected.');
    expectVersion(txn, raw);
    tx.update(ref, { status: 'rejected', rejectedAt: at, rejectionReason: reason, updatedAt: at, version: txn.version + 1 });
    writeAudit(tx, { targetType: 'transaction', targetId: txn.id, actor, at, action: 'transaction.rejected', statusBefore: txn.status, statusAfter: 'rejected', reason });
    return { id: txn.id, status: 'rejected' };
  });
}

/** Withdraw a draft (or one's own rejected entry). It stays in the history as discarded. */
async function discardTxn(actor: Actor, raw: Record<string, unknown>) {
  const at = nowIso();
  return db().runTransaction(async (tx) => {
    const { ref, txn } = await getTxn(tx, raw.id);
    if (!['draft', 'rejected', 'pending_approval'].includes(txn.status)) throw new HttpsError('failed-precondition', 'Only drafts, rejected entries and entries awaiting approval can be discarded.');
    if (actor.level !== 'admin' && txn.recordedBy.uid !== actor.uid) throw new HttpsError('permission-denied', 'Only the person who recorded it, or a finance administrator, can discard this.');
    if (txn.source.kind === 'platform' && actor.level !== 'admin') throw new HttpsError('permission-denied', 'Only a finance administrator can dismiss a platform-recorded payment.');
    const reason = boundedText(raw.reason, 500, 'Reason', { optional: true, multiline: true });
    if (txn.source.kind === 'platform' && reason.length < 3) throw new HttpsError('invalid-argument', 'Say why this platform payment does not belong in the books (for example, a test-mode payment).');
    tx.update(ref, { status: 'discarded', updatedAt: at, version: txn.version + 1 });
    writeAudit(tx, { targetType: 'transaction', targetId: txn.id, actor, at, action: 'transaction.discarded', statusBefore: txn.status, statusAfter: 'discarded', reason });
    return { id: txn.id, status: 'discarded' };
  });
}

/**
 * Cancels a posted entry with a linked opposite entry. The original stays in
 * the books (marked reversed) and the reversal sits beside it, so the history
 * shows both and the balance returns to what it was.
 */
async function reverseTxn(actor: Actor, raw: Record<string, unknown>) {
  const reason = boundedText(raw.reason, 1000, 'Reason', { min: 5, multiline: true });
  const date = isDate(raw.date) ? raw.date : accraToday();
  if (date > accraToday()) throw new HttpsError('invalid-argument', 'A reversal cannot be dated in the future.');
  const at = nowIso();
  return db().runTransaction(async (tx) => {
    const { ref, txn } = await getTxn(tx, raw.id);
    if (txn.status !== 'posted' || txn.isReversal) throw new HttpsError('failed-precondition', txn.status === 'reversed' ? 'This entry has already been reversed.' : 'Only a posted entry can be reversed.');
    if (date < txn.date) throw new HttpsError('invalid-argument', 'A reversal cannot be dated before the entry it reverses.');
    expectVersion(txn, raw);
    const reversalRef = db().collection(TXNS).doc(`rev-${txn.id}`.slice(0, 80));
    const existingReversal = await tx.get(reversalRef);
    if (existingReversal.exists) throw new HttpsError('already-exists', 'This entry has already been reversed.');
    const refDoc = txn.reference ? await tx.get(db().collection(REFERENCES).doc(referenceKey(txn.accountId, txn.reference))) : null;
    const numbers = await nextNumbers(tx, { number: true, posting: true });
    const reversal: Txn = {
      ...txn, id: reversalRef.id, number: numbers.number!, date, description: `Reversal of ${txn.number}: ${txn.description}`.slice(0, 300), status: 'posted',
      postingSequence: numbers.posting!, isReversal: true, reversalOf: txn.id, reversedBy: null, correctionOf: null, recurringId: null, recurringDueDate: null,
      source: { kind: 'manual' }, recordedBy: { uid: actor.uid, name: actor.name }, authorisedBy: { uid: actor.uid, name: actor.name }, attachments: [],
      notes: reason, createdAt: at, updatedAt: at, submittedAt: at, approvedAt: at, postedAt: at, rejectedAt: null, rejectionReason: '', version: 1,
      reference: txn.reference ? `${txn.reference} (reversal)`.slice(0, 120) : '',
    };
    tx.create(reversalRef, reversal as unknown as DocumentData);
    tx.update(ref, { status: 'reversed', reversedBy: reversalRef.id, updatedAt: at, version: txn.version + 1 });
    if (refDoc?.exists && refDoc.get('txnId') === txn.id) tx.update(refDoc.ref, { released: true, releasedAt: at });
    writeAudit(tx, { targetType: 'transaction', targetId: txn.id, actor, at, action: 'transaction.reversed', statusBefore: 'posted', statusAfter: 'reversed', reason,
      metadata: { reversalId: reversalRef.id, reversalNumber: reversal.number } });
    writeAudit(tx, { targetType: 'transaction', targetId: reversalRef.id, actor, at, action: 'transaction.created.reversal', statusBefore: null, statusAfter: 'posted', reason,
      metadata: { reversalOf: txn.id, originalNumber: txn.number } });
    return { id: txn.id, reversalId: reversalRef.id, reversalNumber: reversal.number };
  });
}

/** Reverse a wrong entry and open a corrected draft prefilled from it, linked both ways in the audit trail. */
async function correctTxn(actor: Actor, raw: Record<string, unknown>) {
  const reversed = await reverseTxn(actor, raw);
  const books = await loadBooks();
  const original = books.txns.find((t) => t.id === reversed.id)!;
  const fields = Object.fromEntries(EDITABLE_FIELDS.map((f) => [f, (original as unknown as Record<string, unknown>)[f]]));
  const saved = await saveTxn(actor, { fields: { ...fields, ...(raw.fields as Record<string, unknown> ?? {}) }, intent: 'draft', requestKey: `correct-${original.id}`.slice(0, 64), correctionOf: original.id });
  return { ...reversed, correctionId: saved.id, correctionNumber: saved.number };
}

/* ==========================================================================
   Receipts and supporting documents
   ========================================================================== */

function sniffType(bytes: Buffer): string | null {
  if (bytes.subarray(0, 5).toString('latin1') === '%PDF-') return 'application/pdf';
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (bytes.subarray(0, 4).toString('latin1') === 'RIFF' && bytes.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  return null;
}

/**
 * Links a file the person just uploaded (to their own receipt folder, which
 * Storage rules restrict to finance editors) to an entry or a funding source.
 * The real type is read from the file's first bytes, not trusted from the browser.
 */
async function attach(actor: Actor, raw: Record<string, unknown>) {
  const target = raw.targetType === 'source' ? 'source' : 'transaction';
  const targetId = optionalId(raw.targetId, 'Target');
  if (!targetId) throw new HttpsError('invalid-argument', 'Choose what this document supports.');
  const path = str(raw.path);
  const match = new RegExp(`^${RECEIPT_PREFIX}/${actor.uid}/([A-Za-z0-9_-]{8,64})/([A-Za-z0-9_-][A-Za-z0-9._-]{0,119})$`).exec(path);
  if (!match) throw new HttpsError('invalid-argument', 'Upload the file to your receipt folder first.');
  const file = getStorage().bucket().file(path);
  const [exists] = await file.exists();
  if (!exists) throw new HttpsError('not-found', 'The uploaded file was not found. Upload it again.');
  const [metadata] = await file.getMetadata();
  const size = num(metadata.size);
  if (size <= 0 || size > RECEIPT_MAX_BYTES) throw new HttpsError('invalid-argument', 'Receipts must be under 10 MB.');
  const [content] = await file.download();
  const realType = sniffType(content);
  if (!realType || !RECEIPT_TYPES.includes(realType)) throw new HttpsError('invalid-argument', 'Only PDF, JPEG, PNG and WebP files can be attached.');
  const attachment: Attachment = {
    id: match[1], name: boundedText(raw.name, 160, 'File name', { optional: true }) || match[2], contentType: realType, size,
    sha256: createHash('sha256').update(content).digest('hex'), path, uploadedBy: actor.name, uploadedAt: nowIso(),
  };
  const collection = target === 'source' ? SOURCES : TXNS;
  await db().runTransaction(async (tx) => {
    const ref = db().collection(collection).doc(targetId);
    const snap = await tx.get(ref);
    if (!snap.exists) {
      if (target === 'source' && PLATFORM_SOURCES[targetId]) throw new HttpsError('failed-precondition', 'Platform funding sources take no documents.');
      throw new HttpsError('not-found', 'That record does not exist.');
    }
    const list = (snap.get('attachments') ?? []) as Attachment[];
    if (list.some((a) => a.sha256 === attachment.sha256)) throw new HttpsError('already-exists', 'This exact file is already attached.');
    if (list.length >= 20) throw new HttpsError('resource-exhausted', 'Twenty documents is the limit for one record.');
    tx.update(ref, { attachments: FieldValue.arrayUnion(attachment), updatedAt: nowIso() });
    writeAudit(tx, { targetType: target, targetId, actor, action: 'document.attached', statusBefore: snap.get('status') ?? null, statusAfter: snap.get('status') ?? null,
      metadata: { name: attachment.name, contentType: realType, size, sha256: attachment.sha256 } });
  });
  return { attachment };
}

/** A five-minute link to a supporting document; every opening is audited. Falls back to the bytes if links cannot be signed. */
async function attachmentLink(actor: Actor, raw: Record<string, unknown>) {
  const target = raw.targetType === 'source' ? 'source' : 'transaction';
  const targetId = optionalId(raw.targetId, 'Target');
  const attachmentId = optionalId(raw.attachmentId, 'Document');
  if (!targetId || !attachmentId) throw new HttpsError('invalid-argument', 'Choose a document.');
  const snap = await db().collection(target === 'source' ? SOURCES : TXNS).doc(targetId).get();
  const attachment = ((snap.get('attachments') ?? []) as Attachment[]).find((a) => a.id === attachmentId);
  if (!attachment) throw new HttpsError('not-found', 'That document is not attached here.');
  await db().runTransaction(async (tx) => {
    writeAudit(tx, { targetType: target, targetId, actor, action: 'document.viewed', metadata: { attachmentId, name: attachment.name } });
  });
  const file = getStorage().bucket().file(attachment.path);
  try {
    const [url] = await file.getSignedUrl({ version: 'v4', action: 'read', expires: Date.now() + 5 * 60_000, responseDisposition: `inline; filename="${attachment.name.replace(/"/g, '')}"`, responseType: attachment.contentType });
    return { url, contentType: attachment.contentType, name: attachment.name };
  } catch (error) {
    logger.warn('Receipt link could not be signed; returning the file inline', { errorType: error instanceof Error ? error.name : 'unknown' });
    if (attachment.size > 7 * 1024 * 1024) throw new HttpsError('failed-precondition', 'This document is too large to open without signed links. Grant the functions service account roles/iam.serviceAccountTokenCreator.');
    const [content] = await file.download();
    return { dataBase64: content.toString('base64'), contentType: attachment.contentType, name: attachment.name };
  }
}

/* ==========================================================================
   Reference data: accounts, categories, sources, budgets, recurring, settings
   ========================================================================== */

async function saveRecord<T extends Record<string, unknown>>(actor: Actor, collection: string, targetType: AuditInput['targetType'], id: string | null, value: T, fields: string[]) {
  const ref = id ? db().collection(collection).doc(id) : db().collection(collection).doc();
  const at = nowIso();
  await db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (id && !snap.exists) throw new HttpsError('not-found', 'That record does not exist.');
    const before = snap.exists ? snap.data()! : null;
    const next = { ...(before ?? { createdAt: at, createdBy: { uid: actor.uid, name: actor.name } }), ...value, id: ref.id, updatedAt: at };
    tx.set(ref, next);
    writeAudit(tx, { targetType, targetId: ref.id, actor, at, action: `${targetType}.${before ? 'updated' : 'created'}`, changes: diffFields(before, next, fields) });
  });
  return { id: ref.id };
}

function parseAccount(raw: Record<string, unknown>) {
  if (!(ACCOUNT_TYPES as readonly string[]).includes(str(raw.type))) throw new HttpsError('invalid-argument', 'Choose the kind of account.');
  const identifier = str(raw.identifier).replace(/\s+/g, '');
  return {
    name: boundedText(raw.name, 80, 'Account name', { min: 2 }), type: raw.type as AccountType, institution: boundedText(raw.institution, 80, 'Bank or provider', { optional: true }),
    // Never a full account or wallet number: the last four characters are enough to recognise it.
    identifier: identifier ? `•••• ${identifier.slice(-4)}` : '', currency: 'GHS' as const, notes: boundedText(raw.notes, 500, 'Notes', { optional: true, multiline: true }),
    status: raw.status === 'archived' ? 'archived' as const : 'active' as const,
  };
}

function parseCategory(raw: Record<string, unknown>) {
  const kind = raw.kind;
  if (kind !== 'income' && kind !== 'expense' && kind !== 'both') throw new HttpsError('invalid-argument', 'Say whether the category is for income, expenses or both.');
  return { name: boundedText(raw.name, 60, 'Category name', { min: 2 }), kind, description: boundedText(raw.description, 200, 'Description', { optional: true }),
    active: raw.active !== false, order: Math.min(999, Math.max(0, Math.floor(num(raw.order)) || 50)) };
}

function parseSource(raw: Record<string, unknown>) {
  if (!(SOURCE_KINDS as readonly string[]).includes(str(raw.kind))) throw new HttpsError('invalid-argument', 'Choose the kind of funder.');
  return { name: boundedText(raw.name, 120, 'Name', { min: 2 }), kind: raw.kind as FundingSourceKind, purpose: boundedText(raw.purpose, 500, 'Funding purpose', { optional: true, multiline: true }),
    contact: boundedText(raw.contact, 160, 'Contact', { optional: true }), notes: boundedText(raw.notes, 1000, 'Notes', { optional: true, multiline: true }),
    status: raw.status === 'archived' ? 'archived' as const : 'active' as const, system: false };
}

function parseBudget(raw: Record<string, unknown>, books: Books) {
  const categoryIds = Array.isArray(raw.categoryIds) ? [...new Set((raw.categoryIds as unknown[]).map(String))] : [];
  if (!categoryIds.length || categoryIds.some((id) => !books.categories.some((c) => c.id === id))) throw new HttpsError('invalid-argument', 'Choose at least one category for the budget.');
  if (!isDate(raw.from) || !isDate(raw.to) || raw.from > raw.to) throw new HttpsError('invalid-argument', 'Choose the budget period.');
  const alertAtBps = Math.round(num(raw.alertAtBps));
  if (alertAtBps < 1000 || alertAtBps > 10_000) throw new HttpsError('invalid-argument', 'Warn somewhere between 10% and 100% of the allocation.');
  return { name: boundedText(raw.name, 80, 'Budget name', { min: 2 }), categoryIds, from: raw.from, to: raw.to, allocatedMinor: amount(raw.allocatedMinor, 'Allocation'),
    alertAtBps, control: raw.control === 'block' ? 'block' as const : 'warn' as const, status: raw.status === 'archived' ? 'archived' as const : 'active' as const };
}

function parseRecurring(raw: Record<string, unknown>, books: Books) {
  if (!(FREQUENCIES as readonly string[]).includes(str(raw.frequency))) throw new HttpsError('invalid-argument', 'Choose how often it is billed.');
  if (!isDate(raw.nextDueDate)) throw new HttpsError('invalid-argument', 'Enter the next payment date.');
  const currency = str(raw.currency, 'GHS');
  if (CURRENCY_DIGITS[currency] === undefined) throw new HttpsError('invalid-argument', 'Choose a supported currency.');
  const amountMinor = amount(raw.amountMinor, 'Billing amount');
  let ghsEstimateMinor = amountMinor;
  if (currency !== 'GHS') {
    try { ghsEstimateMinor = convertToGhsMinor(amountMinor, currency, str(raw.estimateRate)); }
    catch { throw new HttpsError('invalid-argument', 'Give an estimated exchange rate so upcoming costs can be shown in cedis.'); }
  }
  const categoryId = optionalId(raw.categoryId, 'Category');
  if (!categoryId || !books.categories.some((c) => c.id === categoryId && c.kind !== 'income')) throw new HttpsError('invalid-argument', 'Choose an expense category.');
  const accountId = optionalId(raw.accountId, 'Account');
  if (accountId && !books.accounts.some((a) => a.id === accountId)) throw new HttpsError('invalid-argument', 'Choose a payment account from the list.');
  const status = ['active', 'paused', 'cancelled'].includes(str(raw.status)) ? str(raw.status) as Recurring['status'] : 'active';
  return {
    name: boundedText(raw.name, 80, 'Service name', { min: 2 }), vendor: boundedText(raw.vendor, 80, 'Vendor', { optional: true }), amountMinor, currency,
    estimateRate: currency === 'GHS' ? '' : str(raw.estimateRate), ghsEstimateMinor, frequency: raw.frequency as Frequency, nextDueDate: raw.nextDueDate,
    anchorDay: Number(String(raw.nextDueDate).slice(8, 10)), paymentMethod: boundedText(raw.paymentMethod, 60, 'Payment method', { optional: true }),
    accountId, categoryId, status, reminderDays: Math.min(60, Math.max(0, Math.floor(num(raw.reminderDays)) || 7)),
    notes: boundedText(raw.notes, 1000, 'Notes', { optional: true, multiline: true }),
  };
}

/** Compares a statement balance with the books for one account on one day, and records the result. */
async function reconcile(actor: Actor, raw: Record<string, unknown>) {
  const books = await loadBooks();
  const accountId = optionalId(raw.accountId, 'Account');
  if (!accountId || !books.accounts.some((a) => a.id === accountId)) throw new HttpsError('invalid-argument', 'Choose the account to reconcile.');
  if (!isDate(raw.statementDate) || raw.statementDate > accraToday()) throw new HttpsError('invalid-argument', 'Enter the statement date (not in the future).');
  const statementBalanceMinor = Math.round(num(raw.statementBalanceMinor));
  if (!Number.isInteger(Number(raw.statementBalanceMinor)) || Math.abs(statementBalanceMinor) > MAX_AMOUNT_MINOR) throw new HttpsError('invalid-argument', 'Enter the statement balance.');
  const recordedBalanceMinor = accountBalances(books.txns, raw.statementDate).get(accountId) ?? 0;
  const differenceMinor = statementBalanceMinor - recordedBalanceMinor;
  const ref = db().collection(RECONCILIATIONS).doc();
  const at = nowIso();
  const record: Reconciliation = {
    id: ref.id, accountId, statementDate: raw.statementDate, statementBalanceMinor, recordedBalanceMinor, differenceMinor, status: differenceMinor === 0 ? 'matched' : 'open',
    note: boundedText(raw.note, 1000, 'Note', { optional: true, multiline: true }), resolution: '', adjustmentId: null, createdBy: { uid: actor.uid, name: actor.name }, createdAt: at, resolvedAt: null,
  };
  await db().runTransaction(async (tx) => {
    tx.create(ref, record);
    writeAudit(tx, { targetType: 'reconciliation', targetId: ref.id, actor, at, action: `reconciliation.${record.status}`, statusAfter: record.status,
      metadata: { accountId, statementDate: record.statementDate, statementBalanceMinor, recordedBalanceMinor, differenceMinor } });
  });
  return record;
}

/** Settle a flagged difference: explain it (for example a timing difference), or record a traceable adjustment for approval. */
async function resolveReconciliation(actor: Actor, raw: Record<string, unknown>) {
  const id = optionalId(raw.id, 'Reconciliation');
  if (!id) throw new HttpsError('invalid-argument', 'Choose a reconciliation.');
  const resolution = boundedText(raw.resolution, 1000, 'Explanation', { min: 5, multiline: true });
  const snap = await db().collection(RECONCILIATIONS).doc(id).get();
  if (!snap.exists) throw new HttpsError('not-found', 'That reconciliation does not exist.');
  const record = snap.data() as Reconciliation;
  if (record.status !== 'open') throw new HttpsError('failed-precondition', 'This reconciliation is not open.');
  let adjustmentId: string | null = null;
  if (raw.action === 'adjust') {
    const saved = await saveTxn(actor, {
      fields: { type: 'adjustment', adjustmentKind: 'reconciliation', direction: record.differenceMinor > 0 ? 'in' : 'out', amountMinor: Math.abs(record.differenceMinor),
        date: record.statementDate, description: `Reconciliation adjustment for ${record.statementDate}`, accountId: record.accountId, notes: resolution },
      intent: 'submit', requestKey: `recon-${id}`.slice(0, 64), allowDuplicate: true,
    });
    adjustmentId = saved.id;
  }
  const at = nowIso();
  await db().runTransaction(async (tx) => {
    const current = await tx.get(snap.ref);
    if (current.get('status') !== 'open') throw new HttpsError('aborted', 'This reconciliation was resolved by someone else.');
    tx.update(snap.ref, { status: 'resolved', resolution, adjustmentId, resolvedAt: at, resolvedBy: { uid: actor.uid, name: actor.name } });
    writeAudit(tx, { targetType: 'reconciliation', targetId: id, actor, at, action: raw.action === 'adjust' ? 'reconciliation.adjustment_submitted' : 'reconciliation.explained',
      statusBefore: 'open', statusAfter: 'resolved', reason: resolution, metadata: { adjustmentId } });
  });
  return { id, adjustmentId };
}

async function saveSettings(actor: Actor, raw: Record<string, unknown>, books: Books) {
  const autoPost = { ...books.settings.autoPost };
  const input = (raw.autoPost ?? {}) as Record<string, { post?: unknown; accountId?: unknown }>;
  for (const key of PLATFORM_KEYS) {
    if (!input[key]) continue;
    const accountId = optionalId(input[key].accountId, 'Account');
    if (accountId && !books.accounts.some((a) => a.id === accountId && a.status === 'active')) throw new HttpsError('invalid-argument', 'Choose an active account for auto-posting.');
    if (input[key].post === true && !accountId) throw new HttpsError('invalid-argument', 'Choose the account money lands in before turning on auto-posting.');
    autoPost[key] = { post: input[key].post === true, accountId };
  }
  const emails = Array.isArray(raw.notifyEmails) ? (raw.notifyEmails as unknown[]).map((e) => String(e).trim().toLowerCase()).filter(Boolean) : books.settings.notifyEmails;
  if (emails.length > 10 || emails.some((e) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))) throw new HttpsError('invalid-argument', 'Enter up to ten valid email addresses.');
  const next: Settings = {
    autoPost, notifyEmails: emails, requireSecondApprover: raw.requireSecondApprover === undefined ? books.settings.requireSecondApprover : raw.requireSecondApprover === true,
    upcomingWindowDays: Math.min(120, Math.max(7, Math.floor(num(raw.upcomingWindowDays)) || books.settings.upcomingWindowDays)), version: books.settings.version + 1,
  };
  await db().runTransaction(async (tx) => {
    const current = await tx.get(db().doc(SETTINGS));
    if (num(current.get('version')) !== books.settings.version) throw new HttpsError('aborted', 'Settings changed since you opened them. Reload and try again.');
    tx.set(db().doc(SETTINGS), { ...next, updatedAt: nowIso(), updatedBy: { uid: actor.uid, name: actor.name } });
    writeAudit(tx, { targetType: 'settings', targetId: 'main', actor, action: 'settings.updated',
      changes: diffFields(books.settings as unknown as Record<string, unknown>, next as unknown as Record<string, unknown>, ['autoPost', 'notifyEmails', 'requireSecondApprover', 'upcomingWindowDays']) });
  });
  return next;
}

/* ==========================================================================
   People and roles
   ========================================================================== */

async function people() {
  const out: { uid: string; email: string; name: string; level: FinanceLevel; role: string | null }[] = [];
  let token: string | undefined;
  let scanned = 0;
  do {
    const page = await getAuth().listUsers(1000, token);
    for (const user of page.users) {
      const level = financeLevel({ ...(user.customClaims ?? {}), uid: user.uid });
      if (level) out.push({ uid: user.uid, email: user.email ?? '', name: user.displayName ?? '', level, role: (user.customClaims?.role as string) ?? null });
    }
    scanned += page.users.length;
    token = page.pageToken;
  } while (token && scanned < 20_000);
  return { people: out.sort((a, b) => RANK[b.level] - RANK[a.level] || a.email.localeCompare(b.email)), scanned };
}

/** Finance administrators grant viewer and editor; only a super administrator grants or removes finance administration. */
async function setRole(actor: Actor, raw: Record<string, unknown>) {
  const email = boundedText(raw.email, 200, 'Email').toLowerCase();
  const level = raw.level;
  if (!['admin', 'editor', 'viewer', 'none'].includes(String(level))) throw new HttpsError('invalid-argument', 'Choose a finance access level.');
  let user;
  try { user = await getAuth().getUserByEmail(email); }
  catch { throw new HttpsError('not-found', 'No account uses that email. They must sign in once first.'); }
  if (user.uid === actor.uid) throw new HttpsError('permission-denied', 'You cannot change your own finance access.');
  const claims = { ...(user.customClaims ?? {}) } as Record<string, unknown>;
  const targetIsOwner = isOwnerSuperAdmin({ ...claims, uid: user.uid });
  const before = financeLevel({ ...claims, uid: user.uid });
  if ((level === 'admin' || before === 'admin') && !actor.superAdmin) throw new HttpsError('permission-denied', 'Only a super administrator grants or removes finance administration.');
  if (level === 'admin' && !roleSatisfies(effectiveRole({ ...claims, uid: user.uid }), 'admin')) throw new HttpsError('failed-precondition', 'Finance administration is only honoured on an admin account. Give them the admin role first.');
  if (level === 'admin') { claims.finance = true; delete claims.financeRole; }
  else { if (!targetIsOwner) delete claims.finance; if (level === 'none') delete claims.financeRole; else claims.financeRole = level; }
  if (targetIsOwner) {
    if (level !== 'admin') throw new HttpsError('failed-precondition', 'A super administrator always has full finance access.');
  }
  await getAuth().setCustomUserClaims(user.uid, claims);
  await db().runTransaction(async (tx) => {
    writeAudit(tx, { targetType: 'role', targetId: user.uid, actor, action: 'role.changed', changes: [{ field: 'financeLevel', before, after: level === 'none' ? null : level }], metadata: { email } });
  });
  return { uid: user.uid, before, after: level === 'none' ? null : level, note: 'They need to sign out and in again for the change to reach their session.' };
}

/* ==========================================================================
   Reports
   ========================================================================== */

async function report(actor: Actor, raw: Record<string, unknown>) {
  const kind = raw.kind as ReportKind;
  if (!(REPORT_KINDS as readonly string[]).includes(kind)) throw new HttpsError('invalid-argument', 'Choose a report.');
  if (!isDate(raw.from) || !isDate(raw.to) || raw.from > raw.to) throw new HttpsError('invalid-argument', 'Choose the reporting period.');
  const format = raw.format === 'pdf' ? 'pdf' : raw.format === 'csv' ? 'csv' : 'json';
  await consumeRateLimit('financeReport', actor.uid, 60);
  const books = await loadBooks();
  const names = namer(books);
  let audit;
  if (kind === 'audit') {
    const rows = await db().collection(AUDIT).where('at', '>=', `${raw.from}T00:00:00.000Z`).where('at', '<=', `${raw.to}T23:59:59.999Z`).orderBy('at', 'desc').limit(5000).get();
    const numbers = new Map(books.txns.map((t) => [t.id, t.number]));
    audit = rows.docs.map((d) => ({ at: str(d.get('at')).slice(0, 19).replace('T', ' '), action: str(d.get('action')), actorName: str(d.get('actor')?.name), target: numbers.get(str(d.get('targetId'))) ?? `${d.get('targetType')}/${str(d.get('targetId')).slice(0, 12)}`,
      statusBefore: d.get('statusBefore') ?? null, statusAfter: d.get('statusAfter') ?? null, reason: str(d.get('reason')).slice(0, 200), changes: (d.get('changes') ?? []).length }));
  }
  const built = buildReport({ kind, from: raw.from, to: raw.to, generatedAt: nowIso(), txns: books.txns, categoryName: names.category, sourceName: names.source, accountName: names.account, audit });
  await db().runTransaction(async (tx) => { writeAudit(tx, { targetType: 'settings', targetId: 'reports', actor, action: `report.generated.${format}`, metadata: { kind, from: raw.from, to: raw.to } }); });
  const filename = `indigen-world-${kind.replace(/_/g, '-')}-${raw.from}-to-${raw.to}`;
  if (format === 'csv') return { filename: `${filename}.csv`, csv: `﻿${reportCsv(built)}` };
  if (format === 'pdf') return { filename: `${filename}.pdf`, pdfBase64: Buffer.from(await renderReportPdf(built, actor.name)).toString('base64') };
  return { report: built };
}

/* ==========================================================================
   The callable
   ========================================================================== */

const VIEW_OPS = new Set(['voucher', 'attention', 'overview', 'ledger', 'get', 'config', 'source', 'audit', 'report', 'attachmentLink', 'me']);
const EDIT_OPS = new Set(['save', 'submit', 'discard', 'attach', 'saveSource', 'saveRecurring', 'reconcile']);
const ADMIN_OPS = new Set(['approve', 'markPaid', 'reject', 'reverse', 'correct', 'saveAccount', 'saveCategory', 'saveBudget', 'resolveReconciliation', 'saveSettings', 'syncPlatform', 'people', 'setRole']);

export const financeCentre = onStaffCall({ ...CONTRIBUTOR_CALL_OPTIONS, timeoutSeconds: 120, memory: '512MiB' }, guarded('financeCentre', async (req) => {
  const raw = (req.data ?? {}) as Record<string, unknown>;
  const op = str(raw.operation);
  const minimum: FinanceLevel | null = ADMIN_OPS.has(op) ? 'admin' : EDIT_OPS.has(op) ? 'editor' : VIEW_OPS.has(op) ? 'viewer' : null;
  if (!minimum) throw new HttpsError('invalid-argument', 'Unknown finance operation.');
  const actor = requireLevel(req, minimum);
  if (minimum !== 'viewer') await consumeRateLimit('financeCentreWrite', actor.uid, 240);

  switch (op) {
    case 'me': return { level: actor.level, superAdmin: actor.superAdmin, uid: actor.uid };
    case 'attention': {
      const books = await loadBooks();
      const today = accraToday();
      return {
        pendingApproval: books.txns.filter((t) => t.status === 'pending_approval').length,
        renewalsDue: books.recurring.filter((r) => r.status === 'active' && daysBetween(today, r.nextDueDate) <= r.reminderDays).length,
        openReconciliations: books.reconciliations.filter((r) => r.status === 'open').length,
      };
    }
    case 'overview': return overview(raw);
    case 'ledger': {
      const books = await loadBooks();
      const page = queryLedger(books.txns, parseQuery(raw));
      return { ...page, rows: page.rows.map(rowOut(books)) };
    }
    case 'get': {
      const books = await loadBooks();
      const target = books.txns.find((t) => t.id === raw.id);
      if (!target) throw new HttpsError('not-found', 'That transaction does not exist.');
      const running = withRunningBalances(books.txns).find((r) => r.txn.id === target.id);
      const auditRows = await db().collection(AUDIT).where('targetId', '==', target.id).limit(200).get();
      const linkedIds = [target.reversalOf, target.reversedBy, target.correctionOf, ...books.txns.filter((t) => t.correctionOf === target.id).map((t) => t.id)].filter(Boolean) as string[];
      return {
        txn: rowOut(books)(running ?? { txn: target, effect: effectOf(target), runningBalanceMinor: null }),
        audit: auditRows.docs.map((d) => d.data()).sort((a, b) => String(a.at).localeCompare(String(b.at))),
        linked: books.txns.filter((t) => linkedIds.includes(t.id)).map((t) => ({ id: t.id, number: t.number, status: t.status, description: t.description, isReversal: t.isReversal })),
        budgetImpact: target.type === 'expense' && !isCounting(target.status) ? budgetImpact(books.budgets, books.txns, { ...target, status: 'posted' }).warnings.map((w) => w.budget.name) : [],
      };
    }
    case 'config': {
      const books = await loadBooks();
      const balances = accountBalances(books.txns);
      const today = accraToday();
      return {
        level: actor.level, superAdmin: actor.superAdmin, today,
        accounts: books.accounts.map((a) => ({ ...a, balanceMinor: balances.get(a.id) ?? 0, entries: books.txns.filter((t) => t.accountId === a.id || t.toAccountId === a.id).length })),
        categories: books.categories, sources: books.sources,
        budgets: books.budgets.map((b) => ({ ...b, ...budgetStatus(b, books.txns) })),
        recurring: books.recurring.map((r) => ({ ...r, overdue: r.status === 'active' && r.nextDueDate < today, daysAway: daysBetween(today, r.nextDueDate) })),
        reconciliations: books.reconciliations, settings: books.settings,
        unassignedMinor: balances.get('unassigned') ?? 0,
      };
    }
    case 'source': {
      const books = await loadBooks();
      const id = optionalId(raw.id, 'Funding source');
      const source = books.sources.find((s) => s.id === id);
      if (!source) throw new HttpsError('not-found', 'That funding source does not exist.');
      const row = fundingSources(books.txns).find((s) => s.sourceId === source.id) ?? null;
      const related = queryLedger(books.txns, { statuses: 'all', fundingSourceId: source.id, limit: 200 }).rows.filter((r) => r.txn.status !== 'discarded');
      return { source, totals: row, transactions: related.map(rowOut(books)) };
    }
    case 'audit': {
      let query: FirebaseFirestore.Query = db().collection(AUDIT).orderBy('at', 'desc');
      if (raw.targetId) query = db().collection(AUDIT).where('targetId', '==', String(raw.targetId)).orderBy('at', 'desc');
      if (typeof raw.before === 'string') query = query.startAfter(raw.before);
      const rows = await query.limit(100).get();
      const books = await loadBooks();
      const numbers = new Map(books.txns.map((t) => [t.id, t.number]));
      return { rows: rows.docs.map((d) => ({ ...d.data(), targetNumber: numbers.get(String(d.get('targetId'))) ?? null })) };
    }
    case 'report': return report(actor, raw);
    case 'voucher': {
      const books = await loadBooks();
      const names = namer(books);
      const t = books.txns.find((x) => x.id === raw.id);
      if (!t) throw new HttpsError('not-found', 'That transaction does not exist.');
      const history = (await db().collection(AUDIT).where('targetId', '==', t.id).limit(200).get()).docs.map((d) => d.data()).sort((a, b) => String(a.at).localeCompare(String(b.at)));
      const numberOf = (id: string | null) => books.txns.find((x) => x.id === id)?.number ?? id;
      const stamp = (iso: string | null) => iso ? iso.slice(0, 16).replace('T', ' ') : '';
      const detail: [string, string][] = [
        ['Reference', t.number], ['Status', t.status.replace('_', ' ')], ['Type', typeLabel(t)], ['Date', t.date],
        ['Amount', `${formatGhs(t.amountMinor)}${t.original ? ` (${t.original.currency} ${(t.original.amountMinor / 10 ** (CURRENCY_DIGITS[t.original.currency] ?? 2)).toFixed(CURRENCY_DIGITS[t.original.currency] ?? 2)} at ${t.original.rate})` : ''}`],
        ['Description', t.description], ['Category', names.category(t.categoryId)],
        ['Account', t.type === 'transfer' ? `${names.account(t.accountId)} -> ${names.account(t.toAccountId)}` : names.account(t.accountId)],
        ['Sender / recipient', t.counterparty || '—'], ['Payment method', t.paymentMethod || '—'], ['Payment reference', t.reference || '—'], ['Project / department', t.project || '—'],
        ['Funding source', t.fundingSourceId ? `${names.source(t.fundingSourceId)}${t.restricted ? ` (restricted: ${t.restrictionPurpose})` : ''}` : '—'],
        ['Allocated to restricted funds of', t.fundedBy ? names.source(t.fundedBy) : '—'],
        ['Recorded by', `${t.recordedBy.name}, ${stamp(t.createdAt)} UTC`],
        ['Authorised by', t.authorisedBy ? `${t.authorisedBy.name}${t.approvedAt ? `, ${stamp(t.approvedAt)} UTC` : ''}` : '—'],
        ['Supporting documents', t.attachments.length ? t.attachments.map((a) => a.name).join(', ') : 'None attached'],
        ['Links', [t.reversalOf ? `reverses ${numberOf(t.reversalOf)}` : '', t.reversedBy ? `reversed by ${numberOf(t.reversedBy)}` : '', t.correctionOf ? `corrects ${numberOf(t.correctionOf)}` : ''].filter(Boolean).join('; ') || '—'],
      ];
      const voucher: Report = {
        kind: 'transactions', title: `Transaction record ${t.number}`, from: t.date, to: t.date, generatedAt: nowIso(), summary: null,
        tables: [
          { title: 'Details', columns: [{ key: 'field', label: 'Field', weight: 1 }, { key: 'value', label: 'Value', weight: 4 }], rows: detail.map(([field, value]) => ({ field, value })) },
          { title: 'History', columns: [{ key: 'at', label: 'When (UTC)', weight: 1.3 }, { key: 'action', label: 'Action', weight: 1.8 }, { key: 'by', label: 'By', weight: 1.3 }, { key: 'status', label: 'Status', weight: 1.6 }, { key: 'reason', label: 'Reason', weight: 3 }],
            rows: history.map((h) => ({ at: stamp(String(h.at)), action: h.action, by: h.actor?.name ?? '', status: `${h.statusBefore ?? '—'} -> ${h.statusAfter ?? '—'}`, reason: h.reason ?? '' })) },
        ],
        notes: [isCounting(t.status) ? 'This entry is in the official books.' : 'This entry is not in the official books: it has not been posted.'],
      };
      await db().runTransaction(async (tx) => { writeAudit(tx, { targetType: 'transaction', targetId: t.id, actor, action: 'transaction.record_downloaded' }); });
      return { filename: `${t.number}.pdf`, pdfBase64: Buffer.from(await renderReportPdf(voucher, actor.name)).toString('base64') };
    }
    case 'attachmentLink': return attachmentLink(actor, raw);
    case 'save': return saveTxn(actor, raw);
    case 'submit': {
      const books = await loadBooks();
      const t = books.txns.find((x) => x.id === raw.id);
      if (!t) throw new HttpsError('not-found', 'That transaction does not exist.');
      const fields = Object.fromEntries(EDITABLE_FIELDS.map((f) => [f, (t as unknown as Record<string, unknown>)[f]]));
      return saveTxn(actor, { id: t.id, fields, intent: 'submit', expectedVersion: raw.expectedVersion, allowDuplicate: raw.allowDuplicate });
    }
    case 'discard': return discardTxn(actor, raw);
    case 'attach': return attach(actor, raw);
    case 'saveSource': {
      const id = optionalId(raw.id, 'Funding source');
      if (id && PLATFORM_SOURCES[id]) throw new HttpsError('failed-precondition', 'Platform funding sources are maintained by the system.');
      return saveRecord(actor, SOURCES, 'source', id, parseSource(raw), ['name', 'kind', 'purpose', 'contact', 'notes', 'status']);
    }
    case 'saveRecurring': {
      const books = await loadBooks();
      return saveRecord(actor, RECURRING, 'recurring', optionalId(raw.id, 'Recurring expense'), parseRecurring(raw, books),
        ['name', 'vendor', 'amountMinor', 'currency', 'estimateRate', 'frequency', 'nextDueDate', 'paymentMethod', 'accountId', 'categoryId', 'status', 'reminderDays', 'notes']);
    }
    case 'reconcile': return reconcile(actor, raw);
    case 'approve': return approveTxn(actor, raw);
    case 'markPaid': return markPaid(actor, raw);
    case 'reject': return rejectTxn(actor, raw);
    case 'reverse': return reverseTxn(actor, raw);
    case 'correct': return correctTxn(actor, raw);
    case 'saveAccount': return saveRecord(actor, ACCOUNTS, 'account', optionalId(raw.id, 'Account'), parseAccount(raw), ['name', 'type', 'institution', 'identifier', 'notes', 'status']);
    case 'saveCategory': {
      const id = optionalId(raw.id, 'Category');
      return saveRecord(actor, CATEGORIES, 'category', id, { ...parseCategory(raw), ...(id ? {} : { system: false }) }, ['name', 'kind', 'description', 'active', 'order']);
    }
    case 'saveBudget': {
      const books = await loadBooks();
      return saveRecord(actor, BUDGETS, 'budget', optionalId(raw.id, 'Budget'), parseBudget(raw, books), ['name', 'categoryIds', 'from', 'to', 'allocatedMinor', 'alertAtBps', 'control', 'status']);
    }
    case 'resolveReconciliation': return resolveReconciliation(actor, raw);
    case 'saveSettings': return saveSettings(actor, raw, await loadBooks());
    case 'syncPlatform': {
      const result = await syncPlatform();
      await db().runTransaction(async (tx) => { writeAudit(tx, { targetType: 'settings', targetId: 'platform-sync', actor, action: 'platform.synced', metadata: result }); });
      return result;
    }
    case 'people': return people();
    case 'setRole': return setRole(actor, raw);
  }
  throw new HttpsError('invalid-argument', 'Unknown finance operation.');
}));

/* ==========================================================================
   Platform triggers — each money event is logged once, keyed by its own id
   ========================================================================== */

const quietly = (label: string, work: () => Promise<unknown>) => work().catch((error) => {
  // The daily sync retries anything a trigger missed, so a failure here is logged, not retried.
  logger.error('Finance platform logging failed; the daily sync will retry', { label, errorType: error instanceof Error ? error.name : 'unknown', detail: error instanceof Error ? error.message.slice(0, 200) : '' });
});

export const onFinanceAdPayment = onDocumentWritten({ document: 'adCampaigns/{campaignId}', region: REGION }, async (event) => {
  const after = event.data?.after;
  if (!after?.exists) return;
  const next = adEvent(after.id, after.data()!);
  const prev = event.data?.before?.exists ? adEvent(after.id, event.data.before.data()!) : null;
  if (next && (!prev || prev.key !== next.key || prev.amountMinor !== next.amountMinor)) await quietly('ads', () => recordPlatformEvent(next));
});

export const onFinanceShopTransaction = onDocumentCreated({ document: 'shopTransactions/{transactionId}', region: REGION }, async (event) => {
  if (!event.data) return;
  const next = shopEvent(event.data.id, event.data.data());
  if (next) await quietly('shop', () => recordPlatformEvent(next));
});

export const onFinanceRedemption = onDocumentWritten({ document: 'contributorRedemptions/{requestId}', region: REGION }, async (event) => {
  const after = event.data?.after;
  if (!after?.exists || after.get('status') !== 'fulfilled' || event.data?.before?.get('status') === 'fulfilled') return;
  const next = redemptionEvent(after.id, after.data()!);
  if (next) await quietly('redemptions', () => recordPlatformEvent(next));
});

export const onFinancePayout = onDocumentWritten({ document: 'contributorPaymentRequests/{requestId}', region: REGION }, async (event) => {
  const after = event.data?.after;
  if (!after?.exists || after.get('status') !== 'paid' || event.data?.before?.get('status') === 'paid') return;
  const next = payoutEvent(after.id, after.data()!);
  if (next) await quietly('payouts', () => recordPlatformEvent(next));
});

/* ==========================================================================
   Daily: catch up with the platform, then tell finance what needs attention
   ========================================================================== */

export function digestLines(input: { books: Books; today: string }): string[] {
  const { books, today } = input;
  const lines: string[] = [];
  const pending = books.txns.filter((t) => t.status === 'pending_approval');
  if (pending.length) lines.push(`${pending.length} ${pending.length === 1 ? 'entry is' : 'entries are'} waiting for approval (${formatGhs(pending.reduce((s, t) => s + t.amountMinor, 0))}).`);
  for (const r of books.recurring.filter((x) => x.status === 'active')) {
    const days = daysBetween(today, r.nextDueDate);
    if (days < 0) lines.push(`${r.name} was due on ${r.nextDueDate} and no payment is recorded yet.`);
    else if (days <= r.reminderDays) lines.push(`${r.name} renews on ${r.nextDueDate} (about ${formatGhs(r.ghsEstimateMinor || r.amountMinor)}).`);
  }
  for (const b of books.budgets.filter((x) => x.status === 'active')) {
    const s = budgetStatus(b, books.txns);
    if (s.state === 'over') lines.push(`${b.name} is ${formatGhs(-s.remainingMinor)} over its allocation.`);
    else if (s.state === 'warning') lines.push(`${b.name} has used ${(s.utilisedBps / 100).toFixed(0)}% of its allocation.`);
  }
  const open = books.reconciliations.filter((r) => r.status === 'open');
  if (open.length) lines.push(`${open.length} reconciliation ${open.length === 1 ? 'difference is' : 'differences are'} still open.`);
  return lines;
}

export const financeDailyDigest = onSchedule({ schedule: '0 7 * * *', timeZone: 'Africa/Accra', region: REGION, timeoutSeconds: 300, memory: '512MiB' }, async () => {
  try { await syncPlatform(); } catch (error) { logger.error('Finance platform sync failed', { errorType: error instanceof Error ? error.name : 'unknown' }); }
  const books = await loadBooks();
  const today = accraToday();
  const lines = digestLines({ books, today });
  if (!lines.length || !books.settings.notifyEmails.length) return;
  // One digest per day, ever: the marker is written before sending, so a
  // retried run never sends a second, possibly duplicate, email.
  const marker = db().collection(DIGESTS).doc(today);
  try { await marker.create({ status: 'sending', at: nowIso(), lines }); }
  catch { return; }
  const balance = summarise(books.txns).closingMinor;
  const text = [`Indigen World finance — ${today}`, '', `Available project balance: ${formatGhs(balance)}.`, '', ...lines.map((l) => `• ${l}`), '', 'Open Finance in the admin console to act on these.'].join('\n');
  const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const html = `<p>Available project balance: <strong>${escape(formatGhs(balance))}</strong>.</p><ul>${lines.map((l) => `<li>${escape(l)}</li>`).join('')}</ul><p>Open Finance in the admin console to act on these.</p>`;
  const ok = await sendMail({ to: books.settings.notifyEmails, subject: `Finance: ${lines.length} ${lines.length === 1 ? 'item needs' : 'items need'} attention`, text, html, deliveryKey: `finance-digest:${today}` });
  await marker.update({ status: ok ? 'sent' : 'failed', finishedAt: nowIso() });
});

/** For tests and scripts: a fresh random request key. */
export const newRequestKey = () => randomBytes(12).toString('hex');
