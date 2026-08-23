import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';

// The Arkesel API key never reaches the browser. These wrappers call admin-only
// callable Functions (smsBalance, sendTestSms) that hold the key server-side.

export interface SmsBalance {
  smsBalance: number | null;
  mainBalance: string | null;
}

export async function fetchSmsBalance(): Promise<SmsBalance> {
  const call = httpsCallable<Record<string, never>, SmsBalance>(functions, 'smsBalance');
  const res = await call({});
  return res.data;
}

export interface SendTestSmsResult {
  ok: boolean;
  id: string | null;
  recipient: string;
}

export async function sendTestSms(to: string, message?: string): Promise<SendTestSmsResult> {
  const call = httpsCallable<{ to: string; message?: string }, SendTestSmsResult>(functions, 'sendTestSms');
  const res = await call({ to, message });
  return res.data;
}

// ---- Announcements / campaigns ----

export type CampaignAudience = 'numbers' | 'all';

export interface SendCampaignInput {
  audience: CampaignAudience;
  message: string;
  recipients?: string; // free text; server parses , | ; newline / space separated
  scheduledAt?: string; // wall-clock `YYYY-MM-DDTHH:mm` (from a datetime-local input)
  sandbox?: boolean;
}

export interface SendCampaignResult {
  ok: boolean;
  id: string | null;
  status: 'sent' | 'scheduled' | 'partial' | 'failed';
  recipientCount: number;
  sentCount: number;
  invalid: string[];
  scheduled: boolean;
}

export async function sendSmsCampaign(input: SendCampaignInput): Promise<SendCampaignResult> {
  const call = httpsCallable<SendCampaignInput, SendCampaignResult>(functions, 'sendSmsCampaign');
  const res = await call(input);
  return res.data;
}

export interface CampaignSummary {
  id: string;
  message: string;
  audience: CampaignAudience;
  recipientCount: number;
  sentCount: number;
  status: string;
  sandbox: boolean;
  scheduledFor: string | null;
  createdAt: string | null;
}

export async function listSmsCampaigns(): Promise<CampaignSummary[]> {
  const call = httpsCallable<Record<string, never>, { campaigns: CampaignSummary[] }>(functions, 'listSmsCampaigns');
  const res = await call({});
  return res.data.campaigns;
}

// ---- Saved contact groups ----

export interface ContactGroup {
  id: string;
  name: string;
  numbers: string[];
  count: number;
}

export async function listSmsContactGroups(): Promise<ContactGroup[]> {
  const call = httpsCallable<Record<string, never>, { groups: ContactGroup[] }>(functions, 'listSmsContactGroups');
  const res = await call({});
  return res.data.groups;
}

export async function saveSmsContactGroup(input: { id?: string; name: string; recipients: string }): Promise<{ ok: boolean; id: string; count: number; invalid: string[] }> {
  const call = httpsCallable<typeof input, { ok: boolean; id: string; count: number; invalid: string[] }>(functions, 'saveSmsContactGroup');
  const res = await call(input);
  return res.data;
}

export async function deleteSmsContactGroup(id: string): Promise<void> {
  const call = httpsCallable<{ id: string }, { ok: boolean }>(functions, 'deleteSmsContactGroup');
  await call({ id });
}

// ---- Shared client-side helpers ----

/** Split a free-text blob into raw tokens by comma / pipe / semicolon / newline
 * / tab / whitespace — mirrors the server's parser so the UI can preview counts. */
export function splitRecipients(raw: string): string[] {
  return raw
    .split(/[\s,;|]+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

/** Normalise a single token to a Ghana MSISDN (`233XXXXXXXXX`) or `''`. Mirrors
 * the server's `normalizeGhanaPhone` so recipient counts match what will send. */
export function normalizeGhanaPhone(raw: string): string {
  let digits = String(raw).replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) digits = digits.slice(1);
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('0')) digits = `233${digits.slice(1)}`;
  else if (digits.startsWith('233')) { /* already international */ }
  else if (digits.length === 9) digits = `233${digits}`;
  return /^233\d{9}$/.test(digits) ? digits : '';
}
