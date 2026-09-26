import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export const SUPPORT_ORIGIN = 'https://tribestudio.indigenworld.com';
export const SUPPORT_URL = `${SUPPORT_ORIGIN}/contributor/support`;
export const SUPPORT_EMAIL = 'hi@indigenworld.com';
export const SUPPORT_CATEGORIES = ['login', 'reset_email', 'activation', 'assignment', 'saving', 'payment', 'other'] as const;
export const SUPPORT_STATUSES = ['open', 'in_progress', 'awaiting_member', 'resolved'] as const;
export const digest = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
export const clean = (value: unknown, max = 2000) => typeof value === 'string' ? value.trim().slice(0, max) : '';
export const validEmail = (value: string) => value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
export const validKey = (value: string) => /^[a-f0-9]{64}$/.test(value);
export const validId = (value: string) => /^[a-zA-Z0-9_-]{8,80}$/.test(value);
export const escapeHtml = (value: string) => value.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));

/** User text is data. Routing is limited to these published support actions. */
export function supportGuidance(category: string): string {
  const steps: Record<string, string> = {
    login: 'Open your contributor invitation and choose Sign in. Use the email in your invitation. For a first sign-in, copy the temporary password exactly, including the country code and +, without spaces. After activation, use the password you chose. If it still fails, request a password-reset email here.',
    reset_email: 'Check Inbox and Spam for your invited email address. Wait a few minutes and use only the newest reset link. You can request another reset here. If the email still does not arrive, ask the team to check your invitation email.',
    activation: 'After your first sign-in, choose a new password with at least 8 characters, different from your phone number. Enter the same new password in both fields, then select Activate and open my workspace.',
    assignment: 'Open Your assignments in the contributor workspace and select your assigned set. If a set is missing, tell the team its title or the reference from your invitation.',
    saving: 'Keep the page open and copy any unsaved translation somewhere safe. Check your connection, then retry the save. Include the displayed error reference in your reply. Do not include private cultural material.',
    payment: 'Open Account & settings → Payment details in the contributor workspace. Enter payment details and verification codes only there. A team member will help with payment concerns; support messages do not approve or schedule payments.',
    other: 'Tell us which page you were on, what you tried, and the exact error message. The support team can take it from there.',
  };
  return `${steps[category] || steps.other}\n\nNever send your password, reset link, verification code or bank details in a support message. This case stays open until you confirm the problem is solved.`;
}

export function classifySupport(text: string): string {
  if (/\b(payment|bank|momo|payout|money)\b/i.test(text)) return 'payment';
  if (/\b(reset|forgot|spam)\b/i.test(text)) return 'reset_email';
  if (/\b(activat\w*|confirm password)\b/i.test(text)) return 'activation';
  if (/\b(log\s?in|sign\s?in|password|signing)\b/i.test(text)) return 'login';
  if (/\b(sav\w*|offline|connection)\b/i.test(text)) return 'saving';
  if (/\b(assignment|expression|task)\b/i.test(text)) return 'assignment';
  return 'other';
}

export function consentKeyword(text: string): 'stop' | 'start' | null {
  const word = text.trim().toUpperCase();
  if (['STOP', 'CANCEL', 'UNSUBSCRIBE', 'QUIT', 'END'].includes(word)) return 'stop';
  if (['START', 'UNSTOP', 'SUBSCRIBE'].includes(word)) return 'start';
  return null;
}

export function withinWhatsAppWindow(receivedAt: string, now = Date.now()): boolean {
  const at = Date.parse(receivedAt);
  return Number.isFinite(at) && at <= now + 60_000 && now - at < 24 * 60 * 60_000;
}

/** Compare exact raw bytes. Message IDs provide replay protection downstream. */
export function verifyMetaSignature(raw: Buffer, signature: string, secret: string): boolean {
  if (!secret || !/^sha256=[a-f0-9]{64}$/.test(signature)) return false;
  const actual = createHmac('sha256', secret).update(raw).digest();
  const candidate = Buffer.from(signature.slice(7), 'hex');
  return timingSafeEqual(candidate, actual);
}

/** Store an explicit redaction when people accidentally send common secrets. */
export function redactSupportText(value: string): string {
  return value
    .replace(/https?:\/\/[^\s]*(?:oobCode|access_token|resetToken)[^\s]*/gi, '[private recovery link removed]')
    .replace(/\b(password|passcode|otp|verification code|reset code)\s*(?:is|:|=)\s*\S+/gi, '$1: [removed]')
    .slice(0, 2000);
}
