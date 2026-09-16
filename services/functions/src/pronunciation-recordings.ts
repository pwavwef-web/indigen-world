import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { requireAuth, requireRole } from './auth.js';
import { finalisePublishedPronunciation, mintDownloadUrl } from './published-media.js';
import { consumeRateLimit } from './rate-limit.js';

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

export interface RecordingSubmission {
  entryId: string;
  storagePath: string;
  durationMs: number;
  publishConsent: boolean;
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
  return { entryId, storagePath, durationMs, publishConsent: data.publishConsent };
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
    const ref = db.collection(RECORDINGS).doc();
    const token = req.auth?.token as Record<string, unknown> | undefined;
    await ref.set({
      id: ref.id,
      status: 'submitted',
      source: 'learn_speak',
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
    });
    return { id: ref.id, status: 'submitted' };
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
    const snapshot = await ref.get();
    if (!snapshot.exists) throw new HttpsError('not-found', 'That recording does not exist.');
    if (snapshot.get('status') !== 'submitted') {
      throw new HttpsError('failed-precondition', 'That recording has already been decided.');
    }

    if (decision.decision === 'reject') {
      await ref.update({
        status: 'rejected',
        decidedBy: uid,
        decidedAt: FieldValue.serverTimestamp(),
        decisionNote: decision.note,
        updatedAt: FieldValue.serverTimestamp(),
      });
      return { id: ref.id, status: 'rejected' };
    }

    const entryRef = db.collection('dictionaryEntries').doc(String(snapshot.get('entryId')));
    const entry = await entryRef.get();
    if (!entry.exists) throw new HttpsError('failed-precondition', 'The word is no longer in the dictionary.');
    const outcome = approvalOutcome({
      publishConsent: snapshot.get('publishConsent') === true,
      entryHasAudio: typeof entry.get('audioUrl') === 'string' && entry.get('audioUrl') !== '',
    });
    const storagePath = String(snapshot.get('storagePath'));
    const mimeType = String(snapshot.get('mimeType') ?? 'audio/mp4');
    let publishedUrl: string | null = null;
    if (outcome === 'attach_to_entry') {
      await finalisePublishedPronunciation(entryRef, { contentId: entryRef.id, storagePath, mimeType });
      publishedUrl = String((await entryRef.get()).get('audioUrl') ?? '') || null;
    } else if (outcome === 'keep_as_additional') {
      const bucket = getStorage().bucket();
      const destination = `published-media/pronunciations/${ref.id}`;
      await bucket.file(storagePath).copy(bucket.file(destination));
      publishedUrl = await mintDownloadUrl(bucket, destination, mimeType);
    }
    await ref.update({
      status: 'approved',
      outcome,
      publishedUrl,
      decidedBy: uid,
      decidedAt: FieldValue.serverTimestamp(),
      decisionNote: decision.note || null,
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
    return { id: ref.id, status: 'approved', outcome };
  },
);
