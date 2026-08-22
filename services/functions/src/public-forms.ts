import { createHash } from 'node:crypto';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { HttpsError, onRequest } from 'firebase-functions/v2/https';
import { consumeRateLimit } from './rate-limit.js';
import { SMTP_PASSWORD, sendMail, teamInbox } from './email.js';
import {
  contactAcknowledgement,
  contactTeamAlert,
  involvementAcknowledgement,
  involvementTeamAlert,
  newsletterWelcome,
} from './email-templates.js';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CONSENT_VERSION = 'venacula-newsletter-2026-08';

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function email(value: unknown): string {
  return text(value, 320).toLowerCase();
}

function fingerprint(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function validEmail(value: string): boolean {
  return value.length <= 320 && EMAIL_PATTERN.test(value);
}

/**
 * Same-origin public intake for the website's contact, involvement and
 * newsletter forms. Raw submissions are server-written and remain covered by
 * Firestore's default-deny client rules.
 */
export const publicForms = onRequest(
  { cors: true, invoker: 'public', region: 'us-central1', timeoutSeconds: 15, secrets: [SMTP_PASSWORD] },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.set('Allow', 'POST').status(405).json({ error: 'method-not-allowed' });
      return;
    }

    if (!isObject(req.body)) {
      res.status(400).json({ error: 'invalid-request' });
      return;
    }

    const form = text(req.body.form, 40);
    const payload = req.body.payload;
    if (!isObject(payload)) {
      res.status(400).json({ error: 'invalid-payload' });
      return;
    }

    const actor = fingerprint(req.ip || 'unknown');
    try {
      await consumeRateLimit('publicForms', actor, 10, 60 * 60 * 1000);
    } catch (error) {
      if (error instanceof HttpsError && error.code === 'resource-exhausted') {
        res.status(429).json({ error: 'rate-limited' });
        return;
      }
      throw error;
    }

    const db = getFirestore();

    try {
      if (form === 'newsletter') {
        const subscriberEmail = email(payload.email);
        const country = text(payload.country, 80);
        if (!validEmail(subscriberEmail) || payload.consent !== 'accepted') {
          res.status(400).json({ error: 'invalid-newsletter-subscription' });
          return;
        }

        const subscriberRef = db.collection('newsletterSubscribers').doc(fingerprint(subscriberEmail));
        const isNewSubscriber = await db.runTransaction(async (tx) => {
          const existing = await tx.get(subscriberRef);
          tx.set(subscriberRef, {
            id: subscriberRef.id,
            email: subscriberEmail,
            country: country || null,
            status: 'subscribed',
            source: 'website',
            consent: {
              granted: true,
              version: CONSENT_VERSION,
              grantedAt: FieldValue.serverTimestamp(),
            },
            ...(existing.exists ? {} : { subscribedAt: FieldValue.serverTimestamp() }),
            updatedAt: FieldValue.serverTimestamp(),
          }, { merge: true });
          return !existing.exists;
        });

        // Welcome only genuinely new subscribers so re-subscribing never spams.
        if (isNewSubscriber) {
          const welcome = newsletterWelcome();
          await sendMail({ to: subscriberEmail, subject: welcome.subject, html: welcome.html, text: welcome.text });
        }

        // Duplicate subscriptions intentionally receive the same response so
        // this endpoint does not disclose whether an address is already stored.
        res.status(200).json({ accepted: true });
        return;
      }

      if (form === 'contact') {
        const name = text(payload.name, 160);
        const contactEmail = email(payload.email);
        const subject = text(payload.subject, 160);
        const message = text(payload.message, 4000);
        if (name.length < 2 || !validEmail(contactEmail) || !subject || !message) {
          res.status(400).json({ error: 'invalid-contact-submission' });
          return;
        }
        const ref = db.collection('publicFormSubmissions').doc();
        await ref.set({
          id: ref.id,
          form,
          payload: { name, email: contactEmail, subject, message },
          source: 'website',
          status: 'new',
          receivedAt: FieldValue.serverTimestamp(),
        });

        // Best-effort: alert the team (reply-to the sender) and acknowledge the sender.
        const teamAlert = contactTeamAlert({ name, email: contactEmail, subject, message });
        const ack = contactAcknowledgement({ name, subject });
        await Promise.all([
          sendMail({ to: teamInbox(), subject: teamAlert.subject, html: teamAlert.html, text: teamAlert.text, replyTo: contactEmail }),
          sendMail({ to: contactEmail, subject: ack.subject, html: ack.html, text: ack.text }),
        ]);

        res.status(200).json({ accepted: true });
        return;
      }

      if (form === 'get-involved') {
        const name = text(payload.name, 160);
        const contact = text(payload.contact, 320);
        const country = text(payload.country, 80);
        const organisation = text(payload.organisation, 200);
        const route = text(payload.route, 120);
        const note = text(payload.note, 3000);
        if (name.length < 2 || !contact || !country || !route || !note) {
          res.status(400).json({ error: 'invalid-involvement-submission' });
          return;
        }
        const ref = db.collection('publicFormSubmissions').doc();
        await ref.set({
          id: ref.id,
          form,
          payload: { name, contact, country, organisation, route, note },
          source: 'website',
          status: 'new',
          receivedAt: FieldValue.serverTimestamp(),
        });

        // Best-effort: always alert the team; acknowledge the person only when
        // the contact they left is an email address (it may be a phone number).
        const contactIsEmail = validEmail(contact.toLowerCase());
        const teamAlert = involvementTeamAlert({ name, contact, country, organisation, route, note });
        const sends = [
          sendMail({
            to: teamInbox(),
            subject: teamAlert.subject,
            html: teamAlert.html,
            text: teamAlert.text,
            replyTo: contactIsEmail ? contact : undefined,
          }),
        ];
        if (contactIsEmail) {
          const ack = involvementAcknowledgement({ name, route });
          sends.push(sendMail({ to: contact, subject: ack.subject, html: ack.html, text: ack.text }));
        }
        await Promise.all(sends);

        res.status(200).json({ accepted: true });
        return;
      }

      res.status(400).json({ error: 'unknown-form' });
    } catch (error) {
      logger.error('Public form submission failed', {
        errorType: error instanceof Error ? error.name : 'unknown',
      });
      res.status(500).json({ error: 'submission-failed' });
    }
  },
);
