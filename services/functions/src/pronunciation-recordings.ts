import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { requireAuth, requireRole } from './auth.js';
import { finalisePublishedPronunciation, mintDownloadUrl } from './published-media.js';
import { consumeRateLimit } from './rate-limit.js';
import {
  REQUEST_CONFLICT_MESSAGE,
  parseRequestId,
  recordingDecisionProblem,
  replayOutcome,
  requestDocumentId,
  requestFingerprint,
} from './review-guards.js';

/**
 * Pronunciation recordings from the Learn tab's Speak practice.
 *
 * A learner records a published dictionary word, listens back, and sends the
 * take for a person to hear. Nothing here transcribes or scores Kasem speech:
 * no model does that accurately, and the app says so.
 *
 * ── Why not a dictionary contribution ──────────────────────────────────────
 * Approving a dictionary-kind collection contribution publishes a *new*
 * entry. A recording of a word that is already published would therefore
 * have created a duplicate of the word every time a reviewer said yes. These
 * recordings belong to the entry that exists, so they have their own record
 * and their own decision, which attaches the sound to that entry — and only
 * when the entry has none yet and the learner agreed to publication. A
 * verified recording is never replaced by this path.
 */

const REGION = 'us-central1';
const ENFORCE_APP_CHECK = process.env.ENFORCE_APP_CHECK === 'true';
export const RECORDINGS = 'pronunciationRecordings';
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_MS = 30_000;

function objectOf(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
}

/** Where a take was recorded. Older clients send nothing: the Learn tab's Speak practice. */
export const RECORDING_SOURCES = ['learn_speak', 'contributor_portal'] as const;
export type RecordingSource = typeof RECORDING_SOURCES[number];

export interface RecordingSubmission {
  entryId: string;
  storagePath: string;
  durationMs: number;
  publishConsent: boolean;
  source: RecordingSource;
}

/** Validates a submission. The file must be the member's own private upload. */
export function parseRecordingSubmission(raw: unknown, uid: string): RecordingSubmission {
  const data = objectOf(raw);
  const entryId = typeof data.entryId === 'string' ? data.entryId.trim() : '';
  if (!/^[A-Za-z0-9_-]{1,200}$/.test(entryId)) {
    throw new HttpsError('invalid-argument', 'Choose a published word to record.');
  }
  const storagePath = typeof data.storagePath === 'string' ? data.storagePath.trim() : '';
  if (!storagePath.startsWith(`creator-submissions/${uid}/`) || storagePath.includes('..')) {
    throw new HttpsError('invalid-argument', 'Upload the recording before sending it.');
  }
  const durationMs = typeof data.durationMs === 'number' ? Math.round(data.durationMs) : 0;
  if (durationMs < 300 || durationMs > MAX_MS + 1_000) {
    throw new HttpsError('invalid-argument', 'Recordings are between half a second and 30 seconds.');
  }
  if (typeof data.publishConsent !== 'boolean') {
    throw new HttpsError('invalid-argument', 'Say whether reviewers may publish the recording.');
  }
  const source = data.source == null || data.source === '' ? 'learn_speak' : data.source;
  if (!(RECORDING_SOURCES as readonly unknown[]).includes(source)) {
    throw new HttpsError('invalid-argument', 'Unknown recording source.');
  }
  return { entryId, storagePath, durationMs, publishConsent: data.publishConsent, source: source as RecordingSource };
}

export interface RecordingDecision {
  recordingId: string;
  decision: 'approve' | 'reject';
  note: string;
}

export function parseRecordingDecision(raw: unknown): RecordingDecision {
  const data = objectOf(raw);
  const recordingId = typeof data.recordingId === 'string' ? data.recordingId.trim() : '';
  if (!/^[A-Za-z0-9_-]{1,120}$/.test(recordingId)) {
    throw new HttpsError('invalid-argument', 'recordingId is required.');
  }
  if (data.decision !== 'approve' && data.decision !== 'reject') {
    throw new HttpsError('invalid-argument', 'decision must be approve or reject.');
  }
  const note = typeof data.note === 'string' ? data.note.trim().slice(0, 1_000) : '';
  if (data.decision === 'reject' && !note) {
    throw new HttpsError('invalid-argument', 'Say why, so the learner can try again.');
  }
  return { recordingId, decision: data.decision, note };
}

/**
 * What an approval does with the sound. Pure, so the one rule that matters —
 * never overwrite a published recording — is tested on its own.
 */
export function approvalOutcome(input: {
  publishConsent: boolean;
  entryHasAudio: boolean;
}): 'attach_to_entry' | 'keep_as_additional' | 'approve_without_publishing' {
  if (!input.publishConsent) return 'approve_without_publishing';
  return input.entryHasAudio ? 'keep_as_additional' : 'attach_to_entry';
}

export const submitPronunciationRecording = onCall(
  { region: REGION, enforceAppCheck: ENFORCE_APP_CHECK, invoker: 'public', timeoutSeconds: 60 },
  async (req) => {
    const uid = requireAuth(req);
    const input = parseRecordingSubmission(req.data, uid);
    await consumeRateLimit('pronunciationRecording', uid, 20, 60 * 60_000);
    const db = getFirestore();
    const entry = await db.collection('dictionaryEntries').doc(input.entryId).get();
    if (!entry.exists || entry.get('isPublished') === false) {
      throw new HttpsError('failed-precondition', 'That word is not in the published dictionary.');
    }
    const file = getStorage().bucket().file(input.storagePath);
    let mimeType = '';
    let sizeBytes = 0;
    try {
      const [metadata] = await file.getMetadata();
      mimeType = String(metadata.contentType ?? '');
      sizeBytes = Number(metadata.size ?? 0);
    } catch {
      throw new HttpsError('failed-precondition', 'The recording did not finish uploading. Try again.');
    }
    if (!mimeType.startsWith('audio/') || sizeBytes <= 0 || sizeBytes > MAX_BYTES) {
      throw new HttpsError('invalid-argument', 'That file is not a short audio recording.');
    }
    // A retry of the same request (same requestId and content) answers with
    // the record the first attempt made, rather than queueing the take twice.
    const requestId = parseRequestId(objectOf(req.data).requestId);
    const fingerprint = requestId ? requestFingerprint(input) : '';
    const ref = requestId
      ? db.collection(RECORDINGS).doc(requestDocumentId(uid, 'recording', requestId))
      : db.collection(RECORDINGS).doc();
    const token = req.auth?.token as Record<string, unknown> | undefined;
    const record = {
      id: ref.id,
      status: 'submitted',
      source: input.source,
      entryId: input.entryId,
      headword: String(entry.get('kasemText') ?? entry.get('headword') ?? ''),
      meaning: String(entry.get('englishText') ?? entry.get('translation') ?? ''),
      uid,
      contributorName: typeof token?.name === 'string' ? token.name.slice(0, 80) : '',
      storagePath: input.storagePath,
      mimeType,
      sizeBytes,
      durationMs: input.durationMs,
      publishConsent: input.publishConsent,
      // Stated on the record so a reviewer never assumes a machine checked it.
      automatedAssessment: 'none',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      decidedBy: null,
      decidedAt: null,
      decisionNote: null,
      outcome: null,
      publishedUrl: null,
      ...(requestId ? { requestFingerprint: fingerprint } : {}),
    };
    if (!requestId) {
      await ref.set(record);
      return { id: ref.id, status: 'submitted' };
    }
    const existingStatus = await db.runTransaction(async (tx) => {
      const existing = await tx.get(ref);
      const outcome = replayOutcome(existing.exists ? existing.data() : null, uid, fingerprint);
      if (outcome === 'conflict') throw new HttpsError('already-exists', REQUEST_CONFLICT_MESSAGE);
      if (outcome === 'replay') return String(existing.get('status') ?? 'submitted');
      tx.create(ref, record);
      return 'submitted';
    });
    return { id: ref.id, status: existingStatus };
  },
);

export const decidePronunciationRecording = onCall(
  { region: REGION, enforceAppCheck: ENFORCE_APP_CHECK, invoker: 'public', timeoutSeconds: 60 },
  async (req) => {
    const uid = requireAuth(req);
    requireRole(req, 'validator');
    const decision = parseRecordingDecision(req.data);
    const db = getFirestore();
    const ref = db.collection(RECORDINGS).doc(decision.recordingId);

    // Claim the decision in a transaction: never your own recording, never
    // one already decided, and never while another decision is in progress.
    // A rejection is complete inside the claim; an approval holds the claim
    // while the audio is copied, then records the outcome and releases it.
    const claimed = await db.runTransaction(async (tx) => {
      const snapshot = await tx.get(ref);
      if (!snapshot.exists) throw new HttpsError('not-found', 'That recording does not exist.');
      const problem = recordingDecisionProblem(snapshot.data() ?? {}, uid, Date.now());
      if (problem) throw new HttpsError(problem.code, problem.message);
      if (decision.decision === 'reject') {
        tx.update(ref, {
          status: 'rejected',
          decidedBy: uid,
          decidedAt: FieldValue.serverTimestamp(),
          decisionNote: decision.note,
          decisionLock: FieldValue.delete(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        return null;
      }
      tx.update(ref, { decisionLock: { by: uid, at: Date.now() } });
      return {
        entryId: String(snapshot.get('entryId')),
        publishConsent: snapshot.get('publishConsent') === true,
        storagePath: String(snapshot.get('storagePath')),
        mimeType: String(snapshot.get('mimeType') ?? 'audio/mp4'),
      };
    });

    if (!claimed) {
      await db.collection('auditLogs').add({
        action: 'pronunciation.reject',
        actorUid: uid,
        targetId: ref.id,
        occurredAt: new Date().toISOString(),
      });
      return { id: ref.id, status: 'rejected' };
    }

    let outcome: ReturnType<typeof approvalOutcome>;
    try {
      const entryRef = db.collection('dictionaryEntries').doc(claimed.entryId);
      const entry = await entryRef.get();
      if (!entry.exists) throw new HttpsError('failed-precondition', 'The word is no longer in the dictionary.');
      outcome = approvalOutcome({
        publishConsent: claimed.publishConsent,
        entryHasAudio: typeof entry.get('audioUrl') === 'string' && entry.get('audioUrl') !== '',
      });
      let publishedUrl: string | null = null;
      if (outcome === 'attach_to_entry') {
        await finalisePublishedPronunciation(entryRef, { contentId: entryRef.id, storagePath: claimed.storagePath, mimeType: claimed.mimeType });
        publishedUrl = String((await entryRef.get()).get('audioUrl') ?? '') || null;
      } else if (outcome === 'keep_as_additional') {
        const bucket = getStorage().bucket();
        const destination = `published-media/pronunciations/${ref.id}`;
        await bucket.file(claimed.storagePath).copy(bucket.file(destination));
        publishedUrl = await mintDownloadUrl(bucket, destination, claimed.mimeType);
      }
      await ref.update({
        status: 'approved',
        outcome,
        publishedUrl,
        decidedBy: uid,
        decidedAt: FieldValue.serverTimestamp(),
        decisionNote: decision.note || null,
        decisionLock: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      await db.collection('auditLogs').add({
        action: 'pronunciation.approve',
        actorUid: uid,
        targetId: ref.id,
        entryId: entryRef.id,
        outcome,
        occurredAt: new Date().toISOString(),
      });
    } catch (error) {
      // Release the claim so the recording can be decided again.
      await ref.update({ decisionLock: FieldValue.delete() }).catch(() => undefined);
      throw error;
    }
    return { id: ref.id, status: 'approved', outcome };
  },
);
