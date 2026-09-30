import { FieldPath, getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { HttpsError, onCall, type CallableRequest } from 'firebase-functions/v2/https';
import { requireAuth, requireRole, roleSatisfies } from './auth.js';
import { consumeRateLimit } from './rate-limit.js';
import { stableStringify } from './kasem-evidence.js';
import {
  KNOWLEDGE_CATALOG, applyKnowledgeReview, knowledgeHash, knowledgeId, knowledgeObject, knowledgeText, knowledgeWarnings,
  parseKnowledgeInput, parseKnowledgeReview, type KnowledgeInput, type KnowledgeRecord, type KnowledgeReview,
} from './knowledge-records.js';

const options = { region: 'us-central1', enforceAppCheck: process.env.ENFORCE_APP_CHECK === 'true', timeoutSeconds: 120 };
const REVIEW_STATUSES = ['submitted', 'reviewed', 'gold', 'changes_requested', 'disputed'];
const SUMMARY_FIELDS = ['id', 'title', 'datasetType', 'language', 'region', 'revision', 'status', 'updatedAt', 'createdAt', 'authorUid', 'warnings', 'reviewCount', 'approvalCount', 'verifiedAt'];
function checked<T>(fn: () => T): T {
  try { return fn(); } catch (e) { if (e instanceof HttpsError) throw e; throw new HttpsError('invalid-argument', e instanceof Error ? e.message : 'Invalid knowledge record.'); }
}
function writesEnabled() {
  if (process.env.KNOWLEDGE_WORKSPACE_WRITES === 'false') throw new HttpsError('unavailable', 'Knowledge collection is temporarily paused. Keep your draft and try again later.');
}
function readable(req: CallableRequest<unknown>, record: KnowledgeRecord) {
  const uid = requireAuth(req);
  if (record.authorUid === uid || roleSatisfies(req.auth?.token.role, 'admin')) return;
  if (!roleSatisfies(req.auth?.token.role, 'validator') || !REVIEW_STATUSES.includes(record.status) || !record.permissions.review) throw new HttpsError('permission-denied', 'This record is private to its contributor and eligible reviewers.');
}
function currentRevision(raw: unknown, record: KnowledgeRecord) {
  if (!Number.isInteger(raw) || raw !== record.revision) throw new HttpsError('failed-precondition', 'This record changed. Open the latest revision before continuing.');
}
async function bindAudio(record: KnowledgeInput) {
  for (const audio of record.audio) {
    const [metadata] = await getStorage().bucket().file(audio.path).getMetadata();
    if (!metadata.contentType?.startsWith('audio/') || Number(metadata.size) >= 20 * 1024 * 1024) throw new HttpsError('invalid-argument', 'Attach an audio recording smaller than 20 MB.');
    audio.generation = String(metadata.generation);
  }
}
export const listKnowledgeRecords = onCall(options, async req => {
  const uid = requireAuth(req), d = knowledgeObject(req.data), scope = d.scope ?? 'mine';
  if (!['mine', 'review'].includes(String(scope))) throw new HttpsError('invalid-argument', 'Choose your records or the review queue.');
  const canReview = roleSatisfies(req.auth?.token.role, 'validator');
  if (scope === 'review') requireRole(req, 'validator');
  await consumeRateLimit('listKnowledgeRecords', uid, 120, 3600000);
  let query = getFirestore().collection('knowledgeRecords')
    .where(scope === 'mine' ? 'authorUid' : 'status', scope === 'mine' ? '==' : 'in', scope === 'mine' ? uid : REVIEW_STATUSES)
    .orderBy(FieldPath.documentId()).select(...SUMMARY_FIELDS).limit(31);
  if (d.cursor) query = query.startAfter(checked(() => knowledgeId(d.cursor)));
  const snap = await query.get(), page = snap.docs.slice(0, 30);
  return { records: page.map(doc => doc.data()), catalog: KNOWLEDGE_CATALOG, canReview, nextCursor: snap.size > 30 ? page.at(-1)!.id : null };
});
export const getKnowledgeRecord = onCall(options, async req => {
  const uid = requireAuth(req), id = checked(() => knowledgeId(knowledgeObject(req.data).id));
  await consumeRateLimit('getKnowledgeRecord', uid, 180, 3600000);
  const ref = getFirestore().collection('knowledgeRecords').doc(id), snap = await ref.get(), record = snap.data() as KnowledgeRecord | undefined;
  if (!record) throw new HttpsError('not-found', 'Knowledge record not found.');
  readable(req, record);
  const canReadFeedback = record.authorUid === uid || roleSatisfies(req.auth?.token.role, 'admin');
  const [reviews, history] = await Promise.all([
    (canReadFeedback ? ref.collection('reviews') : ref.collection('reviews').where('reviewerUid', '==', uid)).limit(250).get(),
    ref.collection('revisions').orderBy('revision', 'desc').select('revision', 'createdAt', 'updatedAt', 'status').limit(50).get(),
  ]);
  return { record, reviews: reviews.docs.map(doc => doc.data()), history: history.docs.map(doc => ({ revision: doc.get('revision'), createdAt: doc.get('updatedAt'), status: doc.get('revision') === record.revision ? record.status : doc.get('status') })) };
});
export const saveKnowledgeRecord = onCall(options, async req => {
  writesEnabled();
  const uid = requireAuth(req), d = knowledgeObject(req.data);
  await consumeRateLimit('saveKnowledgeRecord', uid, 90, 3600000);
  if (typeof d.submit !== 'boolean') throw new HttpsError('invalid-argument', 'Choose save draft or submit for review.');
  const requestId = checked(() => knowledgeText(d.requestId, 'Request ID', 150, true));
  const input = checked(() => parseKnowledgeInput(d.record, uid, d.submit === true));
  const id = d.id ? checked(() => knowledgeId(d.id)) : `KSM-${input.datasetType}-${knowledgeHash(uid + ':' + requestId).slice(0, 24)}`;
  const fingerprint = knowledgeHash(stableStringify({ id: d.id ?? null, revision: d.revision ?? null, record: input, submit: d.submit }));
  const db = getFirestore(), ref = db.collection('knowledgeRecords').doc(id), requestRef = db.collection('knowledgeRecordRequests').doc(knowledgeHash(uid + ':' + requestId));
  // An unchanged audio path does not let a replaced Storage object inherit an old review.
  await bindAudio(input);
  const result = await db.runTransaction(async tx => {
    const priorRequest = await tx.get(requestRef);
    if (priorRequest.exists) {
      if (priorRequest.get('fingerprint') !== fingerprint) throw new HttpsError('already-exists', 'Use a new request ID when changing your record.');
      const prior = await tx.get(db.collection('knowledgeRecords').doc(priorRequest.get('recordId')).collection('revisions').doc(String(priorRequest.get('revision'))));
      if (!prior.exists) throw new HttpsError('internal', 'The saved revision could not be found.');
      return prior.data() as KnowledgeRecord;
    }
    const snap = await tx.get(ref), old = snap.data() as KnowledgeRecord | undefined;
    if (d.id && !old) throw new HttpsError('not-found', 'Knowledge record not found.');
    if (old) {
      if (old.authorUid !== uid) throw new HttpsError('permission-denied', 'Only the contributor may edit this record.');
      currentRevision(d.revision, old);
      if (old.status === 'withdrawn') throw new HttpsError('failed-precondition', 'Withdrawn records cannot be revised. Create a new contribution.');
      if (old.datasetType !== input.datasetType) throw new HttpsError('invalid-argument', 'Keep the dataset area of an existing record.');
    } else if (d.revision !== undefined && d.revision !== null) throw new HttpsError('invalid-argument', 'A new record has no previous revision.');
    const now = new Date().toISOString();
    const record: KnowledgeRecord = { ...input, id, schemaVersion: 1, revision: old ? old.revision + 1 : 1, authorUid: uid,
      createdAt: old?.createdAt ?? now, updatedAt: now, verifiedAt: null, status: d.submit ? 'submitted' : 'draft',
      warnings: knowledgeWarnings(input), reviewCount: 0, approvalCount: 0 };
    tx.set(ref, record);
    tx.create(ref.collection('revisions').doc(String(record.revision)), record);
    tx.create(requestRef, { authorUid: uid, recordId: id, revision: record.revision, fingerprint, createdAt: now });
    return record;
  });
  return { record: result };
});
export const reviewKnowledgeRecord = onCall(options, async req => {
  writesEnabled();
  const uid = requireAuth(req); requireRole(req, 'validator');
  await consumeRateLimit('reviewKnowledgeRecord', uid, 120, 3600000);
  const d = knowledgeObject(req.data), id = checked(() => knowledgeId(d.id)), db = getFirestore();
  const record = await db.runTransaction(async tx => {
    const ref = db.collection('knowledgeRecords').doc(id), snap = await tx.get(ref), old = snap.data() as KnowledgeRecord | undefined;
    if (!old) throw new HttpsError('not-found', 'Knowledge record not found.');
    currentRevision(d.revision, old);
    const review = checked(() => parseKnowledgeReview(d, old, uid, new Date().toISOString()));
    const reviewRef = ref.collection('reviews').doc(`${old.revision}-${knowledgeHash(uid).slice(0, 32)}`), prior = await tx.get(reviewRef);
    if (prior.exists) {
      if (stableStringify({ ...prior.data(), createdAt: '' }) !== stableStringify({ ...review, createdAt: '' })) throw new HttpsError('already-exists', 'Your review is already recorded. Changes need a new contributor revision.');
      return old;
    }
    if (old.reviewCount >= 100) throw new HttpsError('resource-exhausted', 'This revision has reached its review limit. Ask the contributor to resolve feedback in a new revision.');
    const next = applyKnowledgeReview(old, review);
    tx.create(reviewRef, review); tx.set(ref, next);
    return next;
  });
  return { record };
});
export const withdrawKnowledgeRecord = onCall(options, async req => {
  const uid = requireAuth(req), d = knowledgeObject(req.data), id = checked(() => knowledgeId(d.id)), db = getFirestore();
  await consumeRateLimit('withdrawKnowledgeRecord', uid, 60, 3600000);
  const record = await db.runTransaction(async tx => {
    const ref = db.collection('knowledgeRecords').doc(id), snap = await tx.get(ref), old = snap.data() as KnowledgeRecord | undefined;
    if (!old) throw new HttpsError('not-found', 'Knowledge record not found.');
    if (old.authorUid !== uid) throw new HttpsError('permission-denied', 'Only the contributor may withdraw this record.');
    currentRevision(d.revision, old);
    if (old.status === 'withdrawn') return old;
    const now = new Date().toISOString();
    const next: KnowledgeRecord = { ...old, status: 'withdrawn', updatedAt: now, verifiedAt: null,
      permissions: { ...old.permissions, review: false, publication: false, providerRetrieval: false, modelTraining: false, evaluation: false, audio: false } };
    tx.set(ref, next); tx.create(ref.collection('events').doc('withdrawal'), { action: 'withdrawn', authorUid: uid, revision: old.revision, createdAt: now });
    return next;
  });
  return { record };
});
export const readKnowledgeAudio = onCall(options, async req => {
  const uid = requireAuth(req), d = knowledgeObject(req.data), id = checked(() => knowledgeId(d.id));
  await consumeRateLimit('readKnowledgeAudio', uid, 60, 3600000);
  const ref = getFirestore().collection('knowledgeRecords').doc(id), record = (await ref.get()).data() as KnowledgeRecord | undefined;
  if (!record) throw new HttpsError('not-found', 'Knowledge record not found.');
  readable(req, record); currentRevision(d.revision, record);
  if (record.status === 'withdrawn' || !record.permissions.audio || (record.authorUid !== uid && !record.permissions.review)) throw new HttpsError('failed-precondition', 'Permission for this recording is no longer active.');
  if (!Number.isInteger(d.index) || Number(d.index) < 0 || Number(d.index) >= record.audio.length) throw new HttpsError('invalid-argument', 'Choose an attached recording.');
  const audio = record.audio[Number(d.index)], file = getStorage().bucket().file(audio.path), [metadata] = await file.getMetadata();
  if (!audio.generation || String(metadata.generation) !== audio.generation) throw new HttpsError('failed-precondition', 'The recording changed. Submit a new revision before review.');
  const [bytes] = await file.download({ validation: 'crc32c' });
  const latest = (await ref.get()).data() as KnowledgeRecord | undefined, [after] = await file.getMetadata();
  if (!latest || latest.revision !== record.revision || latest.status === 'withdrawn' || !latest.permissions.audio || String(after.generation) !== audio.generation) throw new HttpsError('failed-precondition', 'The recording or its permission changed.');
  readable(req, latest);
  return { audio: bytes.toString('base64'), contentType: metadata.contentType ?? 'audio/mpeg' };
});

// Exported type keeps feedback events explicit for callers of the pure helper module.
export type { KnowledgeReview };
