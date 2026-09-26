import { createHash, randomBytes } from 'node:crypto';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { CONTRIBUTOR_REGION, dayKey } from './contributor-common.js';

/**
 * The contributor pulse: what the community of invited contributors did today.
 *
 * ── What is real here ─────────────────────────────────────────────────────
 * Every number comes from a submission the portal actually created or a review
 * decision actually made. The trigger below watches `submissions` and records
 * two kinds of event for contributor-portal work only: an expression sent for
 * review, and an expression approved. Nothing is estimated and nothing is
 * seeded; a quiet day shows as a quiet day.
 *
 * ── Privacy ───────────────────────────────────────────────────────────────
 * A contributor chooses how they appear (contributorSettings/{uid}):
 *   name       their profile display name
 *   anonymous  "A contributor" — the default
 *   hidden     no row at all; their work still counts in the day's totals
 * Rows are keyed by a peppered hash of uid and day, so a row cannot be traced
 * to an account and one person's anonymous rows cannot be linked across days.
 * The pepper is a server-only secret (see pulsePepper), never a value in this
 * source file: anyone who knew it and an account id could find that account's
 * "anonymous" row.
 * Submission ids are stored the same way, only so that a redelivered event
 * cannot count twice (arrayUnion is idempotent; an increment would not be).
 * Nothing else about the work — the expression, the assignment, the
 * translation — is copied into the pulse.
 *
 * ── Who can read it ───────────────────────────────────────────────────────
 * Active contributors and staff (firestore.rules). Writes are this backend's.
 */

export const PULSE = 'contributorPulse';
export const PULSE_TOTALS = 'contributorPulseTotals';
export type ActivityVisibility = 'name' | 'anonymous' | 'hidden';

const APPROVED_STATUSES = new Set(['APPROVED', 'PUBLISHED']);
const LABEL_MAX = 40;

/** Server-only (firestore.rules denies every client). */
export const PULSE_KEY = 'contributorPulseKeys/current';
let pepperPromise: Promise<string> | null = null;

/**
 * The secret the pulse hashes with: CONTRIBUTOR_PULSE_PEPPER, or the existing
 * PHONE_HASH_PEPPER, when configured; otherwise a random key created on first
 * use and kept in a server-only document. Changing it mid-day starts new rows
 * for that day, so set it once.
 */
export function pulsePepper(): Promise<string> {
  const configured = process.env.CONTRIBUTOR_PULSE_PEPPER || process.env.PHONE_HASH_PEPPER;
  if (configured) return Promise.resolve(configured);
  if (!pepperPromise) {
    const db = getFirestore();
    const ref = db.doc(PULSE_KEY);
    pepperPromise = db.runTransaction(async (tx) => {
      const snapshot = await tx.get(ref);
      const existing = snapshot.get('key');
      if (typeof existing === 'string' && existing.length >= 32) return existing;
      const key = randomBytes(32).toString('hex');
      tx.set(ref, { key, createdAt: new Date().toISOString() });
      return key;
    });
    // A failed read is retried by the next event rather than cached.
    pepperPromise.catch(() => { pepperPromise = null; });
  }
  return pepperPromise;
}

export function pulseEntryId(uid: string, day: string, pepper: string): string {
  return createHash('sha256').update(`${pepper}:entry:${uid}:${day}`).digest('hex').slice(0, 24);
}

export function pulseToken(value: string, pepper: string): string {
  return createHash('sha256').update(`${pepper}:token:${value}`).digest('hex').slice(0, 16);
}

export interface PulseEvent {
  kind: 'submitted' | 'approved';
  day: string;
}

type SubmissionData = Record<string, unknown> & {
  contributorPortal?: { contributorId?: unknown } | null;
  status?: unknown;
  lifecycle?: { createdAt?: unknown } | null;
  moderation?: { decidedAt?: unknown } | null;
};

function isoOr(value: unknown, fallback: string): string {
  return typeof value === 'string' && !Number.isNaN(new Date(value).getTime()) ? value : fallback;
}

/** What one write to a submission means for the pulse. Pure. */
export function pulseEvents(
  before: SubmissionData | undefined,
  after: SubmissionData | undefined,
  now = new Date().toISOString(),
): PulseEvent[] {
  if (!after || !after.contributorPortal) return [];
  const events: PulseEvent[] = [];
  if (!before) {
    events.push({ kind: 'submitted', day: dayKey(isoOr(after.lifecycle?.createdAt, now)) });
  }
  const wasApproved = Boolean(before && APPROVED_STATUSES.has(String(before.status)));
  if (APPROVED_STATUSES.has(String(after.status)) && !wasApproved) {
    events.push({ kind: 'approved', day: dayKey(isoOr(after.moderation?.decidedAt, now)) });
  }
  return events;
}

export function visibilityOf(value: unknown): ActivityVisibility {
  return value === 'name' || value === 'hidden' ? value : 'anonymous';
}

/** The label a row carries: the chosen display name, or none (rendered "A contributor"). */
export function pulseLabel(visibility: ActivityVisibility, displayName: unknown): string | null {
  if (visibility !== 'name') return null;
  const name = typeof displayName === 'string' ? displayName.replace(/\s+/g, ' ').trim() : '';
  return name ? name.slice(0, LABEL_MAX) : null;
}

async function pulseIdentity(uid: string): Promise<{ visibility: ActivityVisibility; label: string | null }> {
  const db = getFirestore();
  const [settings, profile] = await Promise.all([
    db.doc(`contributorSettings/${uid}`).get(),
    db.doc(`contributors/${uid}`).get(),
  ]);
  const visibility = visibilityOf(settings.get('activityVisibility'));
  return { visibility, label: pulseLabel(visibility, profile.get('public.displayName')) };
}

export const onContributorPulseSubmissionWritten = onDocumentWritten(
  { document: 'submissions/{submissionId}', region: CONTRIBUTOR_REGION },
  async (event) => {
    const before = event.data?.before?.data() as SubmissionData | undefined;
    const after = event.data?.after?.data() as SubmissionData | undefined;
    const events = pulseEvents(before, after);
    if (events.length === 0 || !after) return;
    const uid = String(after.contributorPortal?.contributorId ?? after.authUid ?? '');
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(uid)) return;

    let pepper: string;
    let identity: Awaited<ReturnType<typeof pulseIdentity>>;
    try {
      [pepper, identity] = await Promise.all([pulsePepper(), pulseIdentity(uid)]);
    } catch (error) {
      logger.warn('Contributor pulse identity unavailable', { errorType: error instanceof Error ? error.name : 'unknown' });
      return;
    }
    const submissionToken = pulseToken(event.params.submissionId, pepper);
    const db = getFirestore();
    const batch = db.batch();
    for (const item of events) {
      const field = item.kind;
      batch.set(db.doc(`${PULSE_TOTALS}/${item.day}`), {
        day: item.day,
        [field]: FieldValue.arrayUnion(submissionToken),
        contributors: FieldValue.arrayUnion(pulseToken(`${uid}:${item.day}`, pepper)),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      const entry = db.doc(`${PULSE}/${pulseEntryId(uid, item.day, pepper)}`);
      if (identity.visibility === 'hidden') {
        batch.delete(entry);
      } else {
        batch.set(entry, {
          day: item.day,
          label: identity.label,
          anonymous: identity.label === null,
          [field]: FieldValue.arrayUnion(submissionToken),
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
      }
    }
    try {
      await batch.commit();
    } catch (error) {
      // A missed pulse event under-counts one expression; it never blocks review.
      logger.warn('Contributor pulse update failed', { errorType: error instanceof Error ? error.name : 'unknown' });
    }
  },
);

/**
 * Applies a changed display name or visibility to the contributor's recent
 * rows at once, so choosing "hidden" removes them now rather than tomorrow.
 */
export async function refreshPulseIdentity(uid: string, now = new Date()): Promise<void> {
  const [pepper, identity] = await Promise.all([pulsePepper(), pulseIdentity(uid)]);
  const db = getFirestore();
  const days = [dayKey(now), dayKey(new Date(now.getTime() - 24 * 60 * 60 * 1000))];
  await Promise.all(days.map(async (day) => {
    const ref = db.doc(`${PULSE}/${pulseEntryId(uid, day, pepper)}`);
    const snapshot = await ref.get();
    if (!snapshot.exists) return;
    if (identity.visibility === 'hidden') await ref.delete();
    else await ref.set({ label: identity.label, anonymous: identity.label === null }, { merge: true });
  }));
}
