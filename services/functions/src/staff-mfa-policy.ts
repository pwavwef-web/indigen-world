/**
 * The pure parts of staff two-step verification: RFC 6238 time-based one-time
 * passwords (the codes Google Authenticator, Microsoft Authenticator, 1Password
 * and similar apps show), recovery codes, and sealing the shared secret at
 * rest. No Firestore or Auth here, so firebase/tests/staffMfa.test.mjs checks
 * it against the RFC's own test vectors.
 */
import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const TOTP_PERIOD_SECONDS = 30;
export const TOTP_DIGITS = 6;
/** Codes from one period either side are accepted, for clocks that drift. */
export const TOTP_DRIFT_STEPS = 1;
export const RECOVERY_CODE_COUNT = 10;
/** Wrong codes in a row before verification locks for MFA_LOCK_MINUTES. */
export const MAX_FAILED_ATTEMPTS = 5;
export const MFA_LOCK_MINUTES = 15;
/** An unconfirmed enrolment secret is discarded after this long. */
export const ENROLMENT_TTL_MINUTES = 15;
export const TOTP_ISSUER = 'Indigen World Admin';

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text: string): Buffer {
  const clean = text.toUpperCase().replace(/[\s=-]/g, '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of clean) {
    const index = BASE32.indexOf(char);
    if (index < 0) throw new Error('Invalid base32 secret.');
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** A fresh 160-bit shared secret, base32 as authenticator apps expect it. */
export function newTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

/** The RFC 6238 code for one time step (HMAC-SHA1, as every authenticator app defaults to). */
export function totpAt(secret: string, step: number, digits = TOTP_DIGITS): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const hmac = createHmac('sha1', base32Decode(secret)).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary = ((hmac[offset] & 0x7f) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3];
  return String(binary % 10 ** digits).padStart(digits, '0');
}

export function timeStep(nowMs = Date.now()): number {
  return Math.floor(nowMs / 1000 / TOTP_PERIOD_SECONDS);
}

function sameText(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * The time step a code belongs to, or null when it matches none in the drift
 * window. A step at or before [lastUsedStep] is refused, so a code that has
 * been used (or overheard) cannot be replayed within its window.
 */
export function matchTotp(secret: string, code: string, options: { nowMs?: number; lastUsedStep?: number } = {}): number | null {
  const digits = code.replace(/\s/g, '');
  if (!/^\d{6}$/.test(digits)) return null;
  const current = timeStep(options.nowMs);
  for (let drift = -TOTP_DRIFT_STEPS; drift <= TOTP_DRIFT_STEPS; drift += 1) {
    const step = current + drift;
    if (options.lastUsedStep !== undefined && step <= options.lastUsedStep) continue;
    if (sameText(totpAt(secret, step), digits)) return step;
  }
  return null;
}

export function otpauthUrl(secret: string, account: string): string {
  const label = encodeURIComponent(`${TOTP_ISSUER}:${account}`);
  const params = new URLSearchParams({ secret, issuer: TOTP_ISSUER, algorithm: 'SHA1', digits: String(TOTP_DIGITS), period: String(TOTP_PERIOD_SECONDS) });
  return `otpauth://totp/${label}?${params.toString()}`;
}

/* -- Recovery codes ------------------------------------------------------------------ */

const RECOVERY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Ten one-time codes like `K7QM-2XRP-9DTA`, shown once and stored only as hashes. */
export function newRecoveryCodes(count = RECOVERY_CODE_COUNT): string[] {
  return Array.from({ length: count }, () => {
    const bytes = randomBytes(12);
    const chars = Array.from(bytes, (byte) => RECOVERY_ALPHABET[byte % RECOVERY_ALPHABET.length]).join('');
    return `${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8, 12)}`;
  });
}

export function normalizeRecoveryCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** Keyed so a leaked hash list cannot be brute-forced without the server key. */
export function recoveryCodeHash(key: Buffer, uid: string, code: string): string {
  return createHmac('sha256', key).update(`${uid}:${normalizeRecoveryCode(code)}`).digest('hex');
}

/* -- Sealing the shared secret ------------------------------------------------------- */

export interface SealedSecret {
  v: 1;
  iv: string;
  tag: string;
  data: string;
}

/** Parse STAFF_MFA_KEY: 32 random bytes, base64. */
export function parseMfaKey(raw: string | undefined): Buffer {
  const key = Buffer.from((raw ?? '').trim(), 'base64');
  if (key.length !== 32) throw new Error('STAFF_MFA_KEY must be 32 random bytes, base64-encoded.');
  return key;
}

/** AES-256-GCM, bound to the account so a sealed secret cannot be moved to another uid. */
export function sealSecret(key: Buffer, uid: string, secret: string): SealedSecret {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(`staff-mfa:${uid}`));
  const data = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return { v: 1, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: data.toString('base64') };
}

export function openSecret(key: Buffer, uid: string, sealed: SealedSecret): string {
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(sealed.iv, 'base64'));
  decipher.setAAD(Buffer.from(`staff-mfa:${uid}`));
  decipher.setAuthTag(Buffer.from(sealed.tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(sealed.data, 'base64')), decipher.final()]).toString('utf8');
}

/* -- Verified sessions ---------------------------------------------------------------- */

/**
 * The next `staffMfa` claim: the verified sign-in's auth_time added to those
 * still inside the session window, newest last, at most five (one per device
 * a person reasonably signs in from at once).
 */
export function nextVerifiedSessions(previous: unknown, authTime: number, nowSeconds: number, sessionSeconds: number): number[] {
  const kept = Array.isArray(previous)
    ? previous.filter((value): value is number => Number.isInteger(value) && value > nowSeconds - sessionSeconds && value !== authTime)
    : [];
  return [...kept, authTime].slice(-5);
}
