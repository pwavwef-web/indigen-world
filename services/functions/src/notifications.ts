import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { SMTP_PASSWORD, isEmailConfigured, sendMail } from './email.js';
import { notificationEmail } from './email-templates.js';
import { ARKESEL_API_KEY, isSmsConfigured, sendSms } from './sms.js';

/** Base URL used to turn a relative notification `link` into a clickable URL. */
function studioBaseUrl(): string {
  return (process.env.STUDIO_BASE_URL || 'https://tribestudio.indigenworld.com').replace(/\/$/, '');
}

function toAbsoluteUrl(link: unknown): string | undefined {
  if (typeof link !== 'string' || link.length === 0) return undefined;
  if (/^https?:\/\//i.test(link)) return link;
  return `${studioBaseUrl()}${link.startsWith('/') ? '' : '/'}${link}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Resolve the email address for a notification's recipient. Prefers the contact
 * email a creator supplied on their profile, then falls back to the address on
 * their Firebase Auth account.
 */
async function resolveRecipientEmail(
  db: FirebaseFirestore.Firestore,
  recipient: { collection?: unknown; id?: unknown } | undefined,
  authUid: unknown,
): Promise<string | undefined> {
  if (recipient && recipient.collection === 'creatorProfiles' && typeof recipient.id === 'string') {
    const snap = await db.collection('creatorProfiles').doc(recipient.id).get();
    const email = snap.get('contact.email');
    if (typeof email === 'string' && email.includes('@')) return email.trim();
  }
  if (typeof authUid === 'string' && authUid.length > 0) {
    try {
      const user = await getAuth().getUser(authUid);
      if (user.email) return user.email;
    } catch (error) {
      logger.warn('Could not resolve recipient auth email', {
        errorType: error instanceof Error ? error.name : 'unknown',
      });
    }
  }
  return undefined;
}

/** Resolve a phone number for a recipient, preferring their profile contact. */
async function resolveRecipientPhone(
  db: FirebaseFirestore.Firestore,
  recipient: { collection?: unknown; id?: unknown } | undefined,
  authUid: unknown,
): Promise<string | undefined> {
  if (recipient && recipient.collection === 'creatorProfiles' && typeof recipient.id === 'string') {
    const snap = await db.collection('creatorProfiles').doc(recipient.id).get();
    const phone = snap.get('contact.phone');
    if (typeof phone === 'string' && phone.trim().length > 0) return phone.trim();
  }
  if (typeof authUid === 'string' && authUid.length > 0) {
    try {
      const user = await getAuth().getUser(authUid);
      if (user.phoneNumber) return user.phoneNumber;
    } catch {
      /* fall through */
    }
  }
  return undefined;
}

/** Build a short, single-thought SMS body from a notification. */
function smsText(title: string, body: string): string {
  const combined = (body ? `${title} — ${body}` : title).replace(/\s+/g, ' ').trim();
  return combined.length > 300 ? `${combined.slice(0, 297)}…` : combined;
}

/**
 * Deliver queued notifications. Every privileged transition (creator-application
 * receipt, application decision, submission decision) already writes a
 * `notifications` document with a `channels` array; this trigger fans it out:
 *
 *   - `email`         → an on-brand HTML email (see email-templates.ts)
 *   - `sms` / `priority: 'high'` → a concise Arkesel SMS to the recipient's phone
 *
 * Each channel is handled independently, records its outcome back on the
 * document (`email`/`sms` status objects, which also make it idempotent under
 * at-least-once delivery), and never rethrows, so one channel failing cannot
 * block the other or spin an infinite retry loop.
 */
export const onNotificationCreated = onDocumentCreated(
  { document: 'notifications/{notificationId}', region: 'us-central1', secrets: [SMTP_PASSWORD, ARKESEL_API_KEY] },
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const data = snap.data() ?? {};

    const channels = Array.isArray(data.channels) ? data.channels : [];
    const wantsEmail = channels.includes('email');
    const wantsSms = channels.includes('sms') || data.priority === 'high';
    if (!wantsEmail && !wantsSms) return;

    const title = typeof data.title === 'string' ? data.title : 'Indigen World update';
    const body = typeof data.body === 'string' ? data.body : '';
    const db = getFirestore();

    // ---- Email ----
    const emailHandled = data.email && typeof data.email === 'object' && 'status' in data.email;
    if (wantsEmail && !emailHandled) {
      try {
        if (!isEmailConfigured()) {
          await snap.ref.update({ email: { status: 'skipped', reason: 'not-configured', attemptedAt: nowIso() } });
        } else {
          const to = await resolveRecipientEmail(db, data.recipient, data.authUid);
          if (!to) {
            await snap.ref.update({ email: { status: 'skipped', reason: 'no-recipient-email', attemptedAt: nowIso() } });
          } else {
            const content = notificationEmail({ title, body, actionUrl: toAbsoluteUrl(data.link) });
            const sent = await sendMail({ to, subject: content.subject, html: content.html, text: content.text });
            await snap.ref.update({ email: { status: sent ? 'sent' : 'failed', to, attemptedAt: nowIso() } });
          }
        }
      } catch (error) {
        logger.error('Notification email handler failed', { errorType: error instanceof Error ? error.name : 'unknown' });
        try { await snap.ref.update({ email: { status: 'failed', attemptedAt: nowIso() } }); } catch { /* ignore */ }
      }
    }

    // ---- SMS (high priority) ----
    const smsHandled = data.sms && typeof data.sms === 'object' && 'status' in data.sms;
    if (wantsSms && !smsHandled) {
      try {
        if (!isSmsConfigured()) {
          await snap.ref.update({ sms: { status: 'skipped', reason: 'not-configured', attemptedAt: nowIso() } });
        } else {
          const phone = await resolveRecipientPhone(db, data.recipient, data.authUid);
          if (!phone) {
            await snap.ref.update({ sms: { status: 'skipped', reason: 'no-recipient-phone', attemptedAt: nowIso() } });
          } else {
            const result = await sendSms({ to: phone, message: smsText(title, body) });
            await snap.ref.update({
              sms: { status: result.ok ? 'sent' : 'failed', to: phone, id: result.id ?? null, attemptedAt: nowIso() },
            });
          }
        }
      } catch (error) {
        logger.error('Notification SMS handler failed', { errorType: error instanceof Error ? error.name : 'unknown' });
        try { await snap.ref.update({ sms: { status: 'failed', attemptedAt: nowIso() } }); } catch { /* ignore */ }
      }
    }
  },
);
