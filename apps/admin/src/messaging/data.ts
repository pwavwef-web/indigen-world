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
