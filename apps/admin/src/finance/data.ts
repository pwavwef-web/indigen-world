import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';

/**
 * Point redemptions: a contributor turns points into airtime or mobile data.
 * Contributors request them in TribeStudio; staff decide them here. Both read
 * the same `contributorRedemptions` records through the callables in
 * services/functions/src/contributor-rewards.ts.
 */

export type RedemptionStatus = 'submitted' | 'approved' | 'fulfilled' | 'rejected';
export type RedemptionAction = 'approve' | 'reject' | 'fulfill';

export interface Redemption {
  id: string;
  contributorId: string;
  points: number;
  /** Value in pesewas, fixed when the request was made. */
  amountMinor: number;
  currency: 'GHS';
  description: string;
  kind: 'airtime' | 'data';
  network: string;
  phoneNumber: string;
  status: RedemptionStatus;
  createdAt: string;
  updatedAt?: string;
  decidedAt?: string | null;
  decidedBy?: string | null;
  paidAt?: string | null;
  paymentReference?: string;
  adminNote?: string;
}

export interface RewardSettings {
  pointsPerExpression: number;
  dailyCap: number;
  redemptionMinimum: number;
  cedisPerRedemption: number;
}

export interface StatusTotal { count: number; points: number; amountMinor: number }
export type RedemptionSummary = Record<RedemptionStatus, StatusTotal>;

export interface RedemptionLedger {
  rewards?: RewardSettings;
  /** Exact totals over every request; null when the server could not compute them. */
  summary: RedemptionSummary | null;
  /** True when more requests exist than the newest page that was loaded. */
  truncated: boolean;
  requests: Redemption[];
}

const listRewards = httpsCallable<{ summaryOnly?: boolean }, Partial<RedemptionLedger>>(functions, 'listContributorRewards');
const saveSettings = httpsCallable<RewardSettings, RewardSettings>(functions, 'setContributorRewardSettings');
const decide = httpsCallable<
  { requestId: string; action: RedemptionAction; note: string; paymentReference?: string; expectedStatus: RedemptionStatus },
  { requestId: string; status?: RedemptionStatus; pointsReturned?: number }
>(functions, 'decideContributorRedemption');

export async function loadContributorRewards(options: { summaryOnly?: boolean } = { summaryOnly: true }): Promise<RedemptionLedger> {
  const { data } = await listRewards(options);
  return {
    rewards: data.rewards,
    summary: data.summary ?? null,
    truncated: data.truncated === true,
    requests: (data.requests ?? []) as Redemption[],
  };
}

export async function loadRedemptionLedger(): Promise<RedemptionLedger> {
  return loadContributorRewards({});
}

export async function saveRewardSettings(settings: RewardSettings): Promise<RewardSettings> {
  return (await saveSettings(settings)).data;
}

export async function decideRedemption(input: { request: Redemption; action: RedemptionAction; note?: string; paymentReference?: string }) {
  const { data } = await decide({
    requestId: input.request.id,
    action: input.action,
    note: input.note ?? '',
    paymentReference: input.paymentReference,
    expectedStatus: input.request.status,
  });
  return data;
}

/* -- Meaning -------------------------------------------------------------------- */

export const STATUS_META: Record<RedemptionStatus, { label: string; tone: 'warning' | 'info' | 'success' | 'danger'; description: string }> = {
  submitted: { label: 'Pending', tone: 'warning', description: 'Waiting for a decision. Points are reserved.' },
  approved: { label: 'Awaiting delivery', tone: 'info', description: 'Approved. Send the airtime or data, then record the delivery reference.' },
  fulfilled: { label: 'Delivered', tone: 'success', description: 'Delivery recorded with a reference.' },
  rejected: { label: 'Rejected', tone: 'danger', description: 'Declined. The reserved points were returned to the contributor.' },
};

export const KIND_LABEL: Record<Redemption['kind'], string> = { airtime: 'Airtime', data: 'Mobile data' };
export const NETWORKS = ['MTN', 'Telecel', 'AT'] as const;

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

/** The GH₵ value a number of points earns at the given settings, in pesewas (mirrors the server). */
export function valueOfPoints(points: number, settings: RewardSettings): number {
  return Math.round(points / settings.redemptionMinimum * settings.cedisPerRedemption * 100);
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
