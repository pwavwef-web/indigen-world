import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';
import type { AwardPolicyConfig, RedemptionPolicyConfig } from '../../../tribestudio/src/contributor/reward-policy';

export type { AwardPolicyConfig, RedemptionPolicyConfig };
export { quotePoints, computeAward, profitableSplit, parseAwardPolicy, parseRedemptionPolicy, PolicyError, DIMENSIONS, DIMENSION_LABELS, REWARD_CATEGORIES }
  from '../../../tribestudio/src/contributor/reward-policy';

/**
 * Contributor points: redemptions, reward policies, the points ledger and the
 * audit history. Contributors request redemptions in TribeStudio; validators
 * decide training-data quality on TribeStudio's Rewards desk; Finance decides
 * money here. Every callable is in services/functions/src/contributor-rewards.ts
 * and enforces the same roles on the server.
 */

export type RedemptionStatus = 'submitted' | 'approved' | 'needs_reconciliation' | 'fulfilled' | 'failed' | 'rejected' | 'cancelled';
export type RedemptionAction = 'approve' | 'reject' | 'fulfill' | 'fail' | 'mark_ambiguous';
export const STATUSES: RedemptionStatus[] = ['submitted', 'approved', 'needs_reconciliation', 'fulfilled', 'failed', 'rejected', 'cancelled'];

export interface Redemption {
  id: string;
  contributorId: string;
  points: number;
  /** Value in pesewas, fixed by the accepted quote (or the legacy rate). */
  amountMinor: number;
  baseMinor: number | null;
  bonusMinor: number | null;
  currency: 'GHS';
  description: string;
  kind: 'airtime' | 'data';
  network: string;
  phoneNumber: string;
  bundle: { id: string; label: string; priceMinor: number; residualMinor: number } | null;
  status: RedemptionStatus;
  settlementPath: 'ledger-v1' | 'legacy';
  policyId: string | null;
  policyVersion: number | null;
  createdAt: string;
  updatedAt?: string;
  decidedAt?: string | null;
  paidAt?: string | null;
  paymentReference?: string;
  providerReference?: string;
  adminNote?: string;
  history: { status: string; at: string; actor: string; note?: string }[];
}

export interface StatusTotal { count: number; points: number; amountMinor: number }
export type RedemptionSummary = Partial<Record<RedemptionStatus, StatusTotal>>;
export interface Flags { awardMode: 'legacy-flat' | 'assessed'; assessmentWorker: 'off' | 'on'; redemptionsOpen: boolean }
export interface PolicyRecord<T> { id: string; kind: 'award' | 'redemption'; version: number; config: T; basis: 'proposed-default' | 'finance-set'; createdAt: string; createdBy: string; reason: string }
export interface Liability { accounts: number; points: number; atBaseMinor: number; upperMinor: number; belowMinimumPoints: number; reservedPoints: number; openRequestsMinor: number | null; unopenedAccounts: number; truncated: boolean }

export interface RedemptionLedger {
  flags?: Flags;
  awardPolicy?: PolicyRecord<AwardPolicyConfig>;
  redemptionPolicy?: PolicyRecord<RedemptionPolicyConfig>;
  /** Exact totals over every request; null when the server could not compute them. */
  summary: RedemptionSummary | null;
  liability?: Liability;
  pendingAwards?: Record<'validator_review' | 'eligible', { count: number; points: number }> | null;
  canDecide?: boolean;
  /** True when more requests exist than the newest page that was loaded. */
  truncated: boolean;
  requests: Redemption[];
}

const listRewards = httpsCallable<{ summaryOnly?: boolean }, Partial<RedemptionLedger>>(functions, 'listContributorRewards');
const decide = httpsCallable<Record<string, unknown>, { requestId: string; status?: RedemptionStatus; pointsReturned?: number; replayed?: boolean }>(functions, 'decideContributorRedemption');

export async function loadContributorRewards(options: { summaryOnly?: boolean } = { summaryOnly: true }): Promise<RedemptionLedger> {
  const { data } = await listRewards(options);
  return { ...data, summary: data.summary ?? null, truncated: data.truncated === true, requests: (data.requests ?? []) as Redemption[] };
}

export async function loadRedemptionLedger(): Promise<RedemptionLedger> {
  return loadContributorRewards({});
}

export async function decideRedemption(input: { request: Redemption; action: RedemptionAction; note?: string; paymentReference?: string; providerReference?: string; definitive?: boolean }) {
  const { data } = await decide({
    requestId: input.request.id, action: input.action, note: input.note ?? '', paymentReference: input.paymentReference,
    providerReference: input.providerReference, definitive: input.definitive, expectedStatus: input.request.status,
  });
  return data;
}

/* -- Policies, flags, ledger, audit ------------------------------------------- */

export interface PolicyOverview {
  flags: Flags; award: PolicyRecord<AwardPolicyConfig>; redemption: PolicyRecord<RedemptionPolicyConfig>;
  history: { id: string; kind: 'award' | 'redemption'; version: number; basis: string; createdAt: string; createdBy: string; reason: string }[];
  calibration: { agreed: number | null; disagreed: number | null; note: string };
  canEdit: boolean;
}
export const loadPolicies = async () => (await httpsCallable<Record<string, never>, PolicyOverview>(functions, 'getRewardPolicies')({})).data;
export const previewPolicy = async (kind: 'award' | 'redemption', config: unknown) =>
  (await httpsCallable<{ kind: string; config: unknown }, Record<string, any>>(functions, 'previewRewardPolicy')({ kind, config })).data;
export const savePolicy = async (kind: 'award' | 'redemption', config: unknown, reason: string, expectedActiveId: string) =>
  (await httpsCallable<Record<string, unknown>, { id: string; version: number }>(functions, 'saveRewardPolicy')({ kind, config, reason, expectedActiveId })).data;
export const saveFlags = async (flags: Partial<Flags>, reason: string) =>
  (await httpsCallable<Record<string, unknown>, { flags: Flags; settledOnSwitch: { settled: number; skipped: number } | null }>(functions, 'setRewardSystemFlags')({ flags, reason })).data;

export interface LedgerEntry {
  id: string; type: string; points: number; availableDelta: number; reservedDelta: number; reason: string; sequence: number; createdAt: string;
  actor: { kind: string; id: string }; refs: Record<string, unknown>; policy: { id: string; version: number } | null;
  after: { available: number; reserved: number; lifetimeEarned: number; lifetimeRedeemed: number };
}
export interface ContributorLedger {
  contributorId: string;
  account: { available: number; reserved: number; lifetimeEarned: number; lifetimeRedeemed: number; legacyCommittedPoints: number; entryCount: number; ledgerOpen: boolean };
  legacy: { rewardBalance: number | null; rewardLifetime: number | null; rewardLedger: unknown };
  entries: LedgerEntry[];
  assessments: { id: string; title: string; status: string; statusLabel: string; points: number | null; calculation: string; financeAttention: string | null; createdAt: string }[];
  requests: Redemption[];
}
export const loadLedger = async (contributorId: string) =>
  (await httpsCallable<{ contributorId: string }, ContributorLedger>(functions, 'getContributorPointsLedger')({ contributorId })).data;
export const adjustPoints = async (input: { contributorId: string; points: number; reason: string; idempotencyKey: string; assessmentId?: string }) =>
  (await httpsCallable<typeof input, { entryId: string; replayed: boolean }>(functions, 'adjustContributorPoints')(input)).data;
export interface AuditRow { id: string; action: string; actor: { collection: string; id: string }; target: { collection: string; id: string }; before: unknown; after: unknown; reason: string; metadata: Record<string, unknown>; occurredAt: string }
export const loadAudit = async (before?: string) =>
  (await httpsCallable<{ before?: string }, { rows: AuditRow[] }>(functions, 'listRewardAudit')(before ? { before } : {})).data.rows;

/* -- Meaning -------------------------------------------------------------------- */

export const STATUS_META: Record<RedemptionStatus, { label: string; tone: 'warning' | 'info' | 'success' | 'danger' | 'neutral'; description: string }> = {
  submitted: { label: 'Pending', tone: 'warning', description: 'Waiting for a decision. Points are reserved.' },
  approved: { label: 'Awaiting top-up', tone: 'info', description: 'Approved. Send the airtime or data, then record the outcome.' },
  needs_reconciliation: { label: 'Needs reconciliation', tone: 'warning', description: 'Outcome unclear (timeout, no receipt). Points stay reserved until you confirm delivered or definitively failed.' },
  fulfilled: { label: 'Delivered', tone: 'success', description: 'Delivery recorded with a reference. The reservation is settled.' },
  failed: { label: 'Failed', tone: 'danger', description: 'The provider confirmed nothing was delivered. Points were released once.' },
  rejected: { label: 'Rejected', tone: 'danger', description: 'Declined. The reserved points were returned once.' },
  cancelled: { label: 'Cancelled', tone: 'neutral', description: 'Cancelled by the contributor before approval. Points returned once.' },
};

export const KIND_LABEL: Record<Redemption['kind'], string> = { airtime: 'Airtime', data: 'Mobile data' };
export const NETWORKS = ['MTN', 'Telecel', 'AT'] as const;
export const ENTRY_LABEL: Record<string, string> = {
  opening_balance: 'Opening balance', award: 'Award', award_adjustment: 'Award change', reservation: 'Reserved', release: 'Released',
  settlement: 'Redeemed', legacy_refund: 'Legacy refund', legacy_settlement: 'Legacy delivery', adjustment: 'Adjustment',
};

/* -- Formatting ------------------------------------------------------------------- */

const cedis = new Intl.NumberFormat('en-GH', { style: 'currency', currency: 'GHS', currencyDisplay: 'symbol', minimumFractionDigits: 2 });

/** GH₵ from integer pesewas. Money stays in minor units until it is shown. */
export function formatGhs(amountMinor: number): string {
  return cedis.format(Math.round(amountMinor) / 100).replace('GHS', 'GH₵');
}

export function formatPoints(points: number): string {
  return `${points.toLocaleString('en-GB')} ${points === 1 ? 'point' : 'points'}`;
}

/** `+233 •• ••• 4567`: enough to match a request to a person, no more. */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 4) return '••••';
  const tail = digits.slice(-4);
  return phone.startsWith('+233') ? `+233 •• ••• ${tail}` : `•••• ${tail}`;
}

/** `+233 24 123 4567` for reading aloud or dialling. */
export function formatPhone(phone: string): string {
  const match = /^\+233(\d{2})(\d{3})(\d{4})$/.exec(phone);
  return match ? `+233 ${match[1]} ${match[2]} ${match[3]}` : phone;
}

export function dateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function dateOnly(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** Firebase callable errors carry a code; a stale decision comes back as `aborted` or `failed-precondition`. */
export function isStaleDecision(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code ?? '';
  return /aborted|failed-precondition/.test(code);
}

export function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message.replace(/^Firebase(Error)?:\s*/i, '') : fallback;
}

export function newKey(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
