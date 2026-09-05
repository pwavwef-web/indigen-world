import { randomUUID } from 'node:crypto';
import { getStorage } from 'firebase-admin/storage';
import { FieldValue, getFirestore, type Transaction } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { requireAuth, requireRole } from './auth.js';
import { consumeRateLimit } from './rate-limit.js';
import { resetCorpusCache } from './kawuri-corpus.js';
import { addReview, allowed, field, hash, object, parseNote, parseReview, publicSentences, stableStringify, type EvidenceNote } from './kasem-evidence.js';
import { qualityReport } from './kasem-dataset.js';

const options = { region: 'us-central1', enforceAppCheck: process.env.ENFORCE_APP_CHECK === 'true', timeoutSeconds: 120 };
const HOUR = 3600000;
function validated<T>(fn: () => T): T {
  try { return fn(); } catch (error) { if (error instanceof HttpsError) throw error; throw new HttpsError('invalid-argument', error instanceof Error ? error.message : 'Invalid evidence.'); }
}
function noteId(raw: unknown): string {
  const id = field(raw, 'Note ID', 150, true);
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new HttpsError('invalid-argument', 'Invalid note ID.');
  return id;
}
function writesEnabled() {
  if (process.env.KASEM_EVIDENCE_WRITES === 'false') throw new HttpsError('unavailable', 'Sentence collection is temporarily paused. Your draft is safe.');
}
async function invalidateReleases(id: string, reason: string) {
  const db = getFirestore();
  const releases = await db.collection('kasemDatasetReleases').where('noteIds', 'array-contains', id).get();
  for (let offset = 0; offset < releases.size; offset += 200) {
    const batch = db.batch();
    for (const release of releases.docs.slice(offset, offset + 200)) batch.update(release.ref, { status: 'invalidated', reason, invalidatedAt: new Date().toISOString() });
    await batch.commit();
  }
}
async function bindAudio(note: EvidenceNote) {
  for (const example of note.examples) if (example.audioPath) {
    const [metadata] = await getStorage().bucket().file(example.audioPath).getMetadata();
    if (!metadata.contentType?.startsWith('audio/') || Number(metadata.size) >= 20 * 1024 * 1024) throw new HttpsError('invalid-argument', 'Attach an audio recording smaller than 20 MB.');
    example.audioGeneration = String(metadata.generation);
  }
}

export const readGrammarAudio = onCall(options, async req => {
  const uid = requireAuth(req); requireRole(req, 'validator');
  await consumeRateLimit('readGrammarAudio', uid, 60, HOUR);
  const d = object(req.data), id = validated(() => noteId(d.noteId));
  const ref = getFirestore().collection('kasemEvidence').doc(id);
  const note = (await ref.get()).data() as EvidenceNote | undefined;
  if (!note || note.revision !== d.revision || !allowed(note, 'audio', new Date().toISOString())) throw new HttpsError('failed-precondition', 'This recording is no longer available for this review.');
  const index = d.example;
  if (!Number.isInteger(index) || Number(index) < 0 || Number(index) >= note.examples.length) throw new HttpsError('invalid-argument', 'Choose an example.');
  const example = note.examples[Number(index)];
  if (!example.audioPath || !example.audioGeneration) throw new HttpsError('not-found', 'No verified recording is attached.');
  const file = getStorage().bucket().file(example.audioPath), [metadata] = await file.getMetadata();
  if (String(metadata.generation) !== example.audioGeneration) throw new HttpsError('failed-precondition', 'The recording changed. Ask the contributor to submit a new revision.');
  const [bytes] = await file.download({ validation: 'crc32c' });
  // Recheck permission and object generation after the potentially slow download.
  const latest = (await ref.get()).data() as EvidenceNote | undefined;
  const [after] = await file.getMetadata();
  if (!latest || latest.revision !== note.revision || !allowed(latest, 'audio', new Date().toISOString()) || String(after.generation) !== example.audioGeneration) throw new HttpsError('failed-precondition', 'The recording changed or permission was withdrawn.');
  return { audio: bytes.toString('base64'), contentType: metadata.contentType ?? 'audio/mpeg' };
});
export function queueProjection(note: EvidenceNote): Record<string, unknown> {
  const { reviews: _reviews, authorUid, ...rest } = note;
  return { ...rest, authUid: authorUid, origin: note.mode === 'correction' ? 'correction' : 'contribution',
    constructions: [...new Set(note.examples.flatMap(e => e.constructions))], sentenceIds: [], reviewNote: '', harvestedWords: 0,
    reviewerIds: [...new Set(note.reviews.filter(r => r.revision === note.revision).map(r => r.reviewerId))] };
}
function writeNote(tx: Transaction, note: EvidenceNote) {
  const db = getFirestore();
  tx.set(db.collection('kasemEvidence').doc(note.id), note);
  tx.set(db.collection('grammarNotes').doc(note.id), queueProjection(note));
  const published = publicSentences(note, note.updatedAt);
  for (let i = 0; i < 6; i++) {
    const id = note.id + '-' + i, projection = published.find(p => p.id === id);
    const ref = db.collection('kasemSentences').doc(id);
    if (projection) tx.set(ref, projection); else tx.delete(ref);
  }
}
export const submitGrammarNote = onCall(options, async req => {
  writesEnabled();
  const uid = requireAuth(req), d = object(req.data), now = new Date().toISOString();
  await consumeRateLimit('submitGrammarNote', uid, 30, HOUR);
  const key = validated(() => field(d.requestId, 'Request ID', 150)) || randomUUID();
  const id = hash(uid + ':' + key).slice(0, 32);
  const note = validated(() => parseNote(d, id, uid, now, d.schemaVersion !== 2));
  await bindAudio(note);
  if (!note.permissions.review) note.status = 'needs-permission';
  const fingerprint = hash(stableStringify(d));
  await getFirestore().runTransaction(async tx => {
    const ref = getFirestore().collection('kasemEvidence').doc(id), existing = await tx.get(ref);
    if (existing.exists) {
      if (existing.get('requestFingerprint') !== fingerprint) throw new HttpsError('already-exists', 'This request ID was already used for another contribution.');
      return;
    }
    writeNote(tx, note);
    tx.update(ref, { requestFingerprint: fingerprint });
    tx.create(ref.collection('revisions').doc('1'), note);
  });
  return { id, status: note.status, revision: 1 };
});

export const decideGrammarNote = onCall(options, async req => {
  writesEnabled();
  const uid = requireAuth(req); requireRole(req, 'validator');
  await consumeRateLimit('decideGrammarNote', uid, 120, HOUR);
  const d = object(req.data), id = validated(() => noteId(d.noteId)), db = getFirestore();
  const result = await db.runTransaction(async tx => {
    const ref = db.collection('kasemEvidence').doc(id), snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError('failed-precondition', 'This legacy note needs migration and permission before review.');
    const note = snap.data() as EvidenceNote;
    if (!note.permissions.review || !note.permissions.sourceConfirmed) throw new HttpsError('failed-precondition', 'The contributor must record source and review permission first.');
    if (note.permissions.expiresAt && Date.parse(note.permissions.expiresAt) <= Date.now()) throw new HttpsError('failed-precondition', 'Permission has expired.');
    const review = validated(() => parseReview(d, note, uid, new Date().toISOString()));
    const prior = note.reviews.find(r => r.reviewerId === uid && r.revision === note.revision);
    if (prior) {
      if (stableStringify({ ...prior, createdAt: '' }) !== stableStringify({ ...review, createdAt: '' })) throw new HttpsError('already-exists', 'You already reviewed this revision. A correction needs a new revision.');
      return { status: note.status, sentences: publicSentences(note, new Date().toISOString()).length, words: 0, changed: false };
    }
    const next = validated(() => addReview(note, review));
    writeNote(tx, next);
    tx.create(ref.collection('reviews').doc(note.revision + '-' + hash(uid).slice(0, 32)), review);
    return { status: next.status, sentences: publicSentences(next, next.updatedAt).length, words: 0, changed: true };
  });
  resetCorpusCache();
  if (result.changed) await invalidateReleases(id, 'Evidence review changed; export again.');
  const { changed: _changed, ...outcome } = result;
  return outcome;
});

export const reviseGrammarNote = onCall(options, async req => {
  writesEnabled();
  const uid = requireAuth(req), d = object(req.data), id = validated(() => noteId(d.noteId)), now = new Date().toISOString();
  await consumeRateLimit('reviseGrammarNote', uid, 30, HOUR);
  const parsed = validated(() => parseNote(d, id, uid, now));
  await bindAudio(parsed);
  const result = await getFirestore().runTransaction(async tx => {
    const ref = getFirestore().collection('kasemEvidence').doc(id), snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError('not-found', 'Note not found.');
    const old = snap.data() as EvidenceNote;
    if (old.authorUid !== uid) throw new HttpsError('permission-denied', 'Only the contributor can revise their evidence and permission.');
    if (d.revision !== old.revision) throw new HttpsError('failed-precondition', 'Open the latest revision before saving.');
    const next: EvidenceNote = { ...parsed, revision: old.revision + 1, createdAt: old.createdAt,
      groups: [...new Set([...old.groups, ...parsed.groups])], reservedSplit: old.reservedSplit, reviews: old.reviews,
      ...(old.datasetSplit ? { datasetSplit: old.datasetSplit } : {}),
      ...(old.requestFingerprint ? { requestFingerprint: old.requestFingerprint } : {}) };
    writeNote(tx, next);
    tx.create(ref.collection('revisions').doc(String(next.revision)), next);
    return { id, revision: next.revision, status: next.status };
  });
  resetCorpusCache();
  await invalidateReleases(id, 'Evidence revised; review and export again.');
  return result;
});

export const withdrawGrammarNote = onCall(options, async req => {
  const uid = requireAuth(req), id = validated(() => noteId(object(req.data).noteId));
  await getFirestore().runTransaction(async tx => {
    const ref = getFirestore().collection('kasemEvidence').doc(id), snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError('not-found', 'Note not found.');
    const note = snap.data() as EvidenceNote;
    if (note.authorUid !== uid) throw new HttpsError('permission-denied', 'Only the contributor can withdraw this note.');
    const now = new Date().toISOString();
    writeNote(tx, { ...note, status: 'withdrawn', updatedAt: now, permissions: { ...note.permissions, status: 'withdrawn' } });
    tx.set(getFirestore().collection('kasemWithdrawals').doc(id), { noteId: id, withdrawnAt: now });
  });
  resetCorpusCache();
  await invalidateReleases(id, 'Contributor withdrew permission.');
  return { status: 'withdrawn' };
});

export const grammarQualityReport = onCall(options, async req => {
  requireAuth(req); requireRole(req, 'validator');
  const snapshot = await getFirestore().collection('kasemEvidence').limit(3001).get();
  if (snapshot.size > 3000) throw new HttpsError('resource-exhausted', 'Use the dataset command for a full paginated report.');
  return qualityReport(snapshot.docs.map(d => d.data() as EvidenceNote), new Date().toISOString());
});

export const rateKawuriAnswer = onCall(options, async req => {
  const uid = requireAuth(req), d = object(req.data);
  await consumeRateLimit('rateKawuriAnswer', uid, 60, HOUR);
  if (!['right', 'wrong'].includes(String(d.verdict))) throw new HttpsError('invalid-argument', 'Choose right or wrong.');
  const question = validated(() => field(d.question, 'Question', 2000, true));
  const answer = validated(() => field(d.answer, 'Answer', 8000, true));
  const now = new Date().toISOString(), db = getFirestore(), ref = db.collection('kawuriVerdicts').doc();
  const correction = d.verdict === 'wrong' ? d.correction : null;
  const note = correction ? validated(() => parseNote({ title: 'Answer correction', mode: 'correction', examples: [correction],
    question, answer, explanation: d.comment, permissions: d.permissions, modelVersion: d.modelVersion, promptVersion: d.promptVersion }, ref.id, uid, now, !d.permissions)) : null;
  if (note && !note.permissions.review) note.status = 'needs-permission';
  await db.runTransaction(async tx => {
    tx.create(ref, { id: ref.id, authUid: uid, verdict: d.verdict, question, answer, comment: validated(() => field(d.comment, 'Comment', 2000)),
      noteId: note?.id ?? '', createdAt: FieldValue.serverTimestamp(), schemaVersion: 2 });
    if (note) { writeNote(tx, note); tx.create(db.collection('kasemEvidence').doc(note.id).collection('revisions').doc('1'), note); }
    tx.set(db.collection('kawuriScoreboard').doc('current'), { right: FieldValue.increment(d.verdict === 'right' ? 1 : 0),
      wrong: FieldValue.increment(d.verdict === 'wrong' ? 1 : 0), corrections: FieldValue.increment(note ? 1 : 0), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  });
  return { id: ref.id, noteId: note?.id ?? '', queuedForReview: Boolean(note) };
});
