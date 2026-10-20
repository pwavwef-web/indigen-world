import { httpsCallable } from 'firebase/functions';
import { ref, uploadBytes } from 'firebase/storage';
import { functions, storage } from '../firebase';

/**
 * Project money: the browser side of services/functions/src/finance-centre.ts.
 *
 * Every figure comes from the `financeCentre` callable, which computes it
 * from the posted ledger on the server (finance-ledger.ts). Nothing here adds
 * up money for display; it only formats what the server returned, so the
 * cards, charts, tables and exports always agree.
 */

export type TxnType = 'income' | 'expense' | 'transfer' | 'refund' | 'adjustment';
export type TxnStatus = 'draft' | 'pending_approval' | 'approved' | 'posted' | 'rejected' | 'reversed' | 'discarded';
export type FinanceLevel = 'admin' | 'editor' | 'viewer';

export interface Attachment { id: string; name: string; contentType: string; size: number; sha256: string; uploadedBy: string; uploadedAt: string }

export interface Txn {
  id: string; number: string; type: TxnType; direction: 'in' | 'out' | null; adjustmentKind: 'opening' | 'correction' | 'reconciliation' | null;
  amountMinor: number; original: { currency: string; amountMinor: number; rate: string } | null; date: string; description: string;
  categoryId: string | null; accountId: string | null; toAccountId: string | null; counterparty: string; paymentMethod: string; reference: string; project: string;
  fundingSourceId: string | null; restricted: boolean; restrictionPurpose: string; fundedBy: string | null; notes: string; status: TxnStatus;
  postingSequence: number | null; isReversal: boolean; reversalOf: string | null; reversedBy: string | null; correctionOf: string | null;
  recurringId: string | null; recurringDueDate: string | null; source: { kind: 'manual' | 'platform' | 'recurring' | 'reconciliation'; platform?: string; ref?: string };
  recordedBy: { uid: string; name: string }; authorisedBy: { uid: string; name: string } | null; attachments: Attachment[];
  createdAt: string; updatedAt: string; submittedAt: string | null; approvedAt: string | null; postedAt: string | null; rejectedAt: string | null; rejectionReason: string; version: number;
  // Added by the server for display:
  signedMinor: number; runningBalanceMinor: number | null; typeLabel: string; categoryName: string; accountName: string; toAccountName: string | null;
  fundingSourceName: string | null; fundedByName: string | null;
}

export interface Summary {
  openingMinor: number; incomeMinor: number; refundsOutMinor: number; netIncomeMinor: number; expenseMinor: number; refundsInMinor: number; netExpenseMinor: number;
  adjustmentsMinor: number; netMovementMinor: number; closingMinor: number;
  counts: { posted: number; income: number; expense: number; transfer: number; refund: number; adjustment: number; reversed: number; reversals: number };
}

export interface Account { id: string; name: string; type: string; institution: string; identifier: string; notes: string; status: 'active' | 'archived'; balanceMinor: number; entries: number }
export interface Category { id: string; name: string; kind: 'income' | 'expense' | 'both'; description: string; active: boolean; system: boolean; order: number }
export interface FundingSource { id: string; name: string; kind: string; purpose: string; contact: string; notes: string; status: 'active' | 'archived'; system: boolean; attachments: Attachment[] }
export interface BudgetRow {
  id: string; name: string; categoryIds: string[]; from: string; to: string; allocatedMinor: number; alertAtBps: number; control: 'warn' | 'block'; status: 'active' | 'archived';
  actualMinor: number; committedMinor: number; remainingMinor: number; utilisedBps: number; state: 'ok' | 'warning' | 'over';
}
export interface Recurring {
  id: string; name: string; vendor: string; amountMinor: number; currency: string; estimateRate?: string; ghsEstimateMinor: number; frequency: 'weekly' | 'monthly' | 'quarterly' | 'yearly';
  nextDueDate: string; paymentMethod: string; accountId: string | null; categoryId: string | null; status: 'active' | 'paused' | 'cancelled'; reminderDays: number;
  lastPaidDate: string | null; notes: string; overdue: boolean; daysAway: number;
}
export interface Reconciliation {
  id: string; accountId: string; statementDate: string; statementBalanceMinor: number; recordedBalanceMinor: number; differenceMinor: number;
  status: 'matched' | 'open' | 'resolved'; note: string; resolution: string; adjustmentId: string | null; createdBy: { name: string }; createdAt: string; resolvedAt: string | null;
}
export type PlatformKey = 'ads' | 'shop' | 'redemptions' | 'payouts';
export interface Settings { autoPost: Record<PlatformKey, { post: boolean; accountId: string | null }>; notifyEmails: string[]; requireSecondApprover: boolean; upcomingWindowDays: number; version: number }

export interface Config {
  level: FinanceLevel; superAdmin: boolean; today: string;
  accounts: Account[]; categories: Category[]; sources: FundingSource[]; budgets: BudgetRow[]; recurring: Recurring[]; reconciliations: Reconciliation[];
  settings: Settings; unassignedMinor: number;
}

export interface Overview {
  asOf: string; today: string; range: { from: string | null; to: string; label: string; key: string };
  lifetime: Summary; period: Summary; month: Summary;
  commitments: { internalApprovedMinor: number; redemptionsMinor: number; payoutsMinor: number; platformAvailable: boolean; totalMinor: number; upcomingRecurringMinor: number };
  availableAfterCommitmentsMinor: number; spentShareBps: number;
  workflow: { drafts: number; pendingApproval: number; platformPending: number; approvedUnpaid: number; openReconciliations: number };
  balanceSeries: { date: string; balanceMinor: number }[];
  monthly: { month: string; incomeMinor: number; expenseMinor: number; netMinor: number }[];
  categories: { categoryId: string; name: string; amountMinor: number; shareBps: number; count: number }[];
  incomeCategories: { categoryId: string; name: string; amountMinor: number; shareBps: number; count: number }[];
  sources: { sourceId: string; name: string; totalMinor: number; restrictedMinor: number; contributions: number; spentMinor: number; remainingRestrictedMinor: number; shareBps: number }[];
  accounts: { id: string; name: string; type: string; status: string; balanceMinor: number }[];
  unassignedMinor: number;
  budgets: BudgetRow[];
  upcoming: { id: string; name: string; dueDate: string; amountMinor: number; currency: string; overdue: boolean; daysAway: number }[];
  recent: Txn[];
  insights: { id: string; tone: 'info' | 'success' | 'warning' | 'danger'; text: string }[];
}

export interface LedgerPage { rows: Txn[]; total: number; offset: number; limit: number; filteredNetMinor: number }
export interface AuditRow {
  id: string; targetType: string; targetId: string; targetNumber: string | null; action: string; actor: { uid: string; name: string }; statusBefore: string | null; statusAfter: string | null;
  changes: { field: string; before: unknown; after: unknown }[]; reason: string; metadata: Record<string, unknown>; at: string;
}
export interface TxnDetail { txn: Txn; audit: AuditRow[]; linked: { id: string; number: string; status: TxnStatus; description: string; isReversal: boolean }[]; budgetImpact: string[] }

const callable = httpsCallable<Record<string, unknown>, unknown>(functions, 'financeCentre', { timeout: 120_000 });
export async function finance<T>(operation: string, data: Record<string, unknown> = {}): Promise<T> {
  return (await callable({ operation, ...data })).data as T;
}

export const loadFinanceAttention = () => finance<{ pendingApproval: number; renewalsDue: number; openReconciliations: number }>('attention');

/* -- Meaning --------------------------------------------------------------------------- */

export const STATUS_META: Record<TxnStatus, { label: string; tone: 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'violet'; hint: string }> = {
  draft: { label: 'Draft', tone: 'neutral', hint: 'Being prepared. Not in the balance.' },
  pending_approval: { label: 'Pending approval', tone: 'warning', hint: 'Submitted for a finance administrator. Not in the balance yet.' },
  approved: { label: 'Approved · unpaid', tone: 'info', hint: 'An approved expense not yet paid: a commitment, not spending.' },
  posted: { label: 'Posted', tone: 'success', hint: 'In the official books.' },
  rejected: { label: 'Rejected', tone: 'danger', hint: 'Declined with a reason. Not in the balance.' },
  reversed: { label: 'Reversed', tone: 'violet', hint: 'Cancelled by a linked reversal entry; both stay in the books.' },
  discarded: { label: 'Discarded', tone: 'neutral', hint: 'Withdrawn before approval. Kept for the audit trail.' },
};

export const TYPE_OPTIONS: { value: TxnType; label: string; hint: string }[] = [
  { value: 'income', label: 'Income', hint: 'Money received: funding, donations, grants, revenue' },
  { value: 'expense', label: 'Expense', hint: 'Money spent on the project' },
  { value: 'transfer', label: 'Internal transfer', hint: 'Moving money between project accounts; not income or spending' },
  { value: 'refund', label: 'Refund / reimbursement', hint: 'Money returned to us, or returned by us' },
  { value: 'adjustment', label: 'Opening balance / adjustment', hint: 'Authorised balance-setting or correcting entry' },
];

export const ACCOUNT_TYPES: { value: string; label: string }[] = [
  { value: 'bank', label: 'Bank account' }, { value: 'mobile_money', label: 'Mobile Money' }, { value: 'cash', label: 'Cash' },
  { value: 'processor', label: 'Payment processor balance' }, { value: 'wallet', label: 'Project wallet' }, { value: 'other', label: 'Other' },
];
export const accountTypeLabel = (type: string) => ACCOUNT_TYPES.find((t) => t.value === type)?.label ?? type;

export const SOURCE_KINDS: { value: string; label: string }[] = [
  { value: 'individual', label: 'Individual sponsor' }, { value: 'organisation', label: 'Organisation' }, { value: 'grant', label: 'Grant' },
  { value: 'donation', label: 'Donation' }, { value: 'platform', label: 'Platform revenue' }, { value: 'other', label: 'Other' },
];

export const FREQUENCY_LABEL: Record<Recurring['frequency'], string> = { weekly: 'Weekly', monthly: 'Monthly', quarterly: 'Quarterly', yearly: 'Yearly' };
export const PLATFORM_LABEL: Record<PlatformKey, { label: string; hint: string }> = {
  ads: { label: 'Advertising payments', hint: 'Paystack payments for ad campaigns (income)' },
  shop: { label: 'Shop payments and refunds', hint: 'Verified Paystack shop payments (income) and processed refunds' },
  redemptions: { label: 'Points redemptions', hint: 'Airtime and data top-ups recorded as delivered (expense)' },
  payouts: { label: 'Contributor payouts', hint: 'Contributor payment requests marked paid (expense)' },
};
export const CURRENCIES = ['GHS', 'USD', 'EUR', 'GBP', 'NGN', 'XOF'];
export const CURRENCY_DIGITS: Record<string, number> = { GHS: 2, USD: 2, EUR: 2, GBP: 2, NGN: 2, XOF: 0 };

/* -- Formatting ---------------------------------------------------------------------------- */

/** `GH₵4,000.00`; the same format as the server and the exports. Money stays in integer pesewas until here. */
export function ghs(minor: number | null | undefined, { signed = false }: { signed?: boolean } = {}): string {
  if (minor == null) return '—';
  const negative = minor < 0;
  const abs = Math.abs(Math.trunc(minor));
  const whole = Math.floor(abs / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const sign = negative ? '−' : signed && minor > 0 ? '+' : '';
  return `${sign}GH₵${whole}.${String(abs % 100).padStart(2, '0')}`;
}

/** `GH₵4k`, for chart axes only. */
export function ghsShort(minor: number): string {
  const cedis = minor / 100;
  const abs = Math.abs(cedis);
  const sign = cedis < 0 ? '−' : '';
  const trim = (n: number, d: number) => n.toFixed(d).replace(/\.0$/, '');
  if (abs >= 1_000_000) return `${sign}GH₵${trim(abs / 1_000_000, abs >= 10_000_000 ? 0 : 1)}m`;
  if (abs >= 1_000) return `${sign}GH₵${trim(abs / 1_000, abs >= 10_000 ? 0 : 1)}k`;
  return `${sign}GH₵${abs.toFixed(0)}`;
}

export function money(minor: number, currency: string): string {
  if (currency === 'GHS') return ghs(minor);
  const digits = CURRENCY_DIGITS[currency] ?? 2;
  return `${currency} ${(minor / 10 ** digits).toLocaleString('en-GB', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

export const pct = (bps: number) => `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 1)}%`;

/** Exact text-to-pesewas: `4,000.00` → 400000. Never parsed as a float. */
export function parseMoney(text: string, digits = 2): number | null {
  const clean = String(text ?? '').replace(/GH₵|GHS|₵|,|\s/gi, '');
  const pattern = digits === 0 ? /^(\d{1,12})$/ : new RegExp(`^(\\d{1,12})(?:\\.(\\d{1,${digits}}))?$`);
  const match = pattern.exec(clean);
  if (!match) return null;
  return Number(match[1]) * 10 ** digits + (digits === 0 ? 0 : Number((match[2] ?? '').padEnd(digits, '0')));
}

/** A preview of the server's conversion (finance-ledger.ts convertToGhsMinor); the server's figure is the one recorded. */
export function previewGhs(originalMinor: number, currency: string, rate: string): number | null {
  const digits = CURRENCY_DIGITS[currency];
  const match = /^(\d{1,6})(?:\.(\d{1,8}))?$/.exec(rate.trim());
  if (digits === undefined || !match) return null;
  const numerator = BigInt(match[1] + (match[2] ?? ''));
  if (numerator === 0n) return null;
  const top = BigInt(originalMinor) * numerator * 100n, bottom = 10n ** BigInt(digits + (match[2] ?? '').length);
  return Number(top % bottom * 2n >= bottom ? top / bottom + 1n : top / bottom);
}

/** Pesewas → `4000.00` for an input box. */
export const toInput = (minor: number | null | undefined, digits = 2) => minor == null ? '' : digits === 0 ? String(minor) : `${Math.floor(minor / 100)}.${String(minor % 100).padStart(2, '0')}`;

const ACCRA = 'Africa/Accra';
export function day(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value.length === 10 ? `${value}T12:00:00Z` : value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: ACCRA });
}
export function when(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: ACCRA });
}
export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString('en-GB', { month: 'short', year: '2-digit', timeZone: ACCRA });
}

export function errorText(error: unknown, fallback = 'Something went wrong.'): string {
  const message = error instanceof Error ? error.message : '';
  return message ? message.replace(/^Firebase(Error)?:\s*/i, '') : fallback;
}
export const errorCode = (error: unknown) => (error as { code?: string } | null)?.code ?? '';
export const isDenied = (error: unknown) => /permission-denied|unauthenticated/.test(errorCode(error));
export const duplicateOf = (error: unknown) => /already-exists/.test(errorCode(error)) && Boolean((error as { details?: { duplicates?: unknown[] } }).details?.duplicates);

export function requestKey(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/* -- Files ----------------------------------------------------------------------------------- */

export function download(filename: string, content: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function base64Bytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export const RECEIPT_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
export const RECEIPT_MAX = 10 * 1024 * 1024;

/** Upload to the person's own receipt folder (Storage rules allow editors only), then link it on the server. */
export async function uploadReceipt(uid: string, file: File, target: { targetType: 'transaction' | 'source'; targetId: string }) {
  if (!RECEIPT_TYPES.includes(file.type)) throw new Error('Attach a PDF, JPEG, PNG or WebP file.');
  if (file.size > RECEIPT_MAX) throw new Error('Receipts must be under 10 MB.');
  const safe = file.name.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^[-.]+/, '').slice(0, 100) || 'receipt';
  const path = `finance-receipts/${uid}/${requestKey().slice(0, 24)}/${safe}`;
  await uploadBytes(ref(storage, path), file, { contentType: file.type });
  return finance<{ attachment: Attachment }>('attach', { ...target, path, name: file.name.slice(0, 160) });
}

export async function openAttachment(target: { targetType: 'transaction' | 'source'; targetId: string }, attachment: Attachment) {
  // Open the tab synchronously so pop-up blockers allow it, then point it at the document.
  const tab = window.open('', '_blank');
  try {
    const result = await finance<{ url?: string; dataBase64?: string; contentType: string; name: string }>('attachmentLink', { ...target, attachmentId: attachment.id });
    const url = result.url ?? URL.createObjectURL(new Blob([base64Bytes(result.dataBase64 ?? '') as BlobPart], { type: result.contentType }));
    if (tab) tab.location.href = url; else window.location.href = url;
  } catch (error) {
    tab?.close();
    throw error;
  }
}

export const fileSize = (bytes: number) => bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
