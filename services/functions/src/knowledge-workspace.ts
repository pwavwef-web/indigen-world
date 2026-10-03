import { supportedAudioHeader } from './knowledge-media.js';
import { DESTINATIONS, DISPLAY_PREFIXES, KNOWLEDGE_NORMALIZATION_VERSION, knowledgeSearchText, type ReviewScope } from '@indigen-world/contracts/knowledge';
import { authenticationFor, hasKnowledgeGrant, policyFrom, releaseDenials } from './knowledge-policy.js';
import { FieldPath, getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { HttpsError, onCall, type CallableRequest } from 'firebase-functions/v2/https';
import { requireAuth } from './auth.js';
import { consumeRateLimit } from './rate-limit.js';
import { stableStringify } from './kasem-evidence.js';
import {
  KNOWLEDGE_CATALOG, applyKnowledgeReview, knowledgeHash, knowledgeId, knowledgeObject, knowledgeText, knowledgeWarnings,
  parseKnowledgeInput, parseKnowledgeReview, type KnowledgeInput, type KnowledgeRecord, type KnowledgeReview,
} from './knowledge-records.js';

const options = { region: 'us-central1', enforceAppCheck: process.env.ENFORCE_APP_CHECK === 'true', timeoutSeconds: 120 };
const REVIEW_STATUSES = ['submitted', 'reviewed', 'gold', 'changes_requested', 'disputed'];
const SUMMARY_FIELDS = ['id', 'title', 'original', 'english', 'datasetType', 'language', 'region', 'revision', 'status', 'updatedAt', 'createdAt', 'authorUid', 'warnings', 'reviewCount', 'approvalCount', 'verifiedAt', 'workflow', 'authentication', 'disputed', 'displayId', 'submittedAt'];
function checked<T>(fn: () => T): T {
  try { return fn(); } catch (e) { if (e instanceof HttpsError) throw e; throw new HttpsError('invalid-argument', e instanceof Error ? e.message : 'Invalid knowledge record.'); }
}
function writesEnabled() {
  if (process.env.KNOWLEDGE_WORKSPACE_WRITES === 'false') throw new HttpsError('unavailable', 'Knowledge collection is temporarily paused. Keep your draft and try again later.');
}
async function reviewAccess(uid: string) {
  const db = getFirestore();
  const [p, g] = await Promise.all([db.doc('knowledgePolicies/current').get(), db.doc(`knowledgeRoleGrants/${uid}`).get()]);
  return { policy: policyFrom(p.data()), grant: g.data() };
}
async function readable(req: CallableRequest<unknown>, record: KnowledgeRecord) {
  const uid = requireAuth(req);
  if (record.authorUid === uid) return;
  const { policy, grant } = await reviewAccess(uid);
  if (!REVIEW_STATUSES.includes(record.status) || !record.permissions.review || !['language', 'culture', 'curation', 'release'].some(scope => hasKnowledgeGrant(grant, policy, record.datasetType, scope as ReviewScope | 'release'))) throw new HttpsError('permission-denied', 'This record is private to its contributor and assigned reviewers.');
}
function currentRevision(raw: unknown, record: KnowledgeRecord) {
  if (!Number.isInteger(raw) || raw !== record.revision) throw new HttpsError('failed-precondition', 'This record changed. Open the latest revision before continuing.');
}
async function bindAudio(record: KnowledgeInput) {
  for (const audio of record.audio) {
    const [metadata] = await getStorage().bucket().file(audio.path).getMetadata();
    if (!metadata.contentType?.startsWith('audio/') || Number(metadata.size) >= 20 * 1024 * 1024) throw new HttpsError('invalid-argument', 'Attach an audio recording smaller than 20 MB.');
    const file = getStorage().bucket().file(audio.path, { generation: metadata.generation });
    const chunks: Buffer[] = [];
    for await (const chunk of file.createReadStream({ start: 0, end: 31 })) chunks.push(Buffer.from(chunk));
    if (!supportedAudioHeader(Buffer.concat(chunks), String(metadata.contentType))) throw new HttpsError('invalid-argument', 'The recording does not match a supported WAV, MP3, Ogg, FLAC, M4A or WebM container.');
    audio.generation = String(metadata.generation);
    audio.checksum = String(metadata.md5Hash ?? metadata.crc32c ?? '');
    if (!audio.checksum || Number(metadata.size) <= 0) throw new HttpsError('invalid-argument', 'The recording upload is incomplete.');
  }
}
export const listKnowledgeRecords = onCall(options, async req => {
  const uid = requireAuth(req), d = knowledgeObject(req.data), scope = d.scope ?? 'mine';
  if (!['mine', 'review'].includes(String(scope))) throw new HttpsError('invalid-argument', 'Choose your records or the review queue.');
  const { policy, grant } = await reviewAccess(uid);
  const canReview = KNOWLEDGE_CATALOG.some(c => ['language', 'culture', 'curation'].some(s => hasKnowledgeGrant(grant, policy, c.id, s as ReviewScope)));
  if (scope === 'review' && !canReview) throw new HttpsError('permission-denied', 'A current scoped reviewer assignment is required.');
  await consumeRateLimit('listKnowledgeRecords', uid, 120, 3600000);
  let query = getFirestore().collection('knowledgeRecords')
    .where(scope === 'mine' ? 'authorUid' : 'status', scope === 'mine' ? '==' : 'in', scope === 'mine' ? uid : REVIEW_STATUSES)
    .orderBy(FieldPath.documentId()).select(...SUMMARY_FIELDS).limit(31);
  if (d.cursor) query = query.startAfter(checked(() => knowledgeId(d.cursor)));
  const snap = await query.get(), page = snap.docs.slice(0, 30);
  return { records: page.map(doc => doc.data()).filter(r => scope === 'mine' || ['language', 'culture', 'curation'].some(s => hasKnowledgeGrant(grant, policy, r.datasetType, s as ReviewScope))), policy: { version: policy.version, approved: policy.approved, sentenceEnabled: policy.sentenceEnabled, releaseEnabled: policy.destinations.length > 0 }, refreshedAt: new Date().toISOString(), catalog: KNOWLEDGE_CATALOG, canReview, nextCursor: snap.size > 30 ? page.at(-1)!.id : null };
});
export const getKnowledgeRecord = onCall(options, async req => {
  const uid = requireAuth(req), request = knowledgeObject(req.data), id = checked(() => knowledgeId(request.id));
  await consumeRateLimit('getKnowledgeRecord', uid, 180, 3600000);
  const ref = getFirestore().collection('knowledgeRecords').doc(id), snap = await ref.get();
  let record = snap.data() as KnowledgeRecord | undefined;
  if (!record) throw new HttpsError('not-found', 'Knowledge record not found.');
  await readable(req, record);
  const currentVersion = record.revision;
  if (request.revision !== undefined) {
    if (!Number.isInteger(request.revision) || Number(request.revision) < 1) throw new HttpsError('invalid-argument', 'Choose an exact revision.');
    const historical = (await ref.collection('revisions').doc(String(request.revision)).get()).data() as KnowledgeRecord | undefined;
    if (!historical) throw new HttpsError('not-found', 'Revision not found.');
    if (request.revision !== currentVersion) record = historical;
  }
  const canReadFeedback = record.authorUid === uid;
  const [reviews, history, events] = await Promise.all([
    (canReadFeedback ? ref.collection('reviews') : ref.collection('reviews').where('reviewerUid', '==', uid)).limit(250).get(),
    ref.collection('revisions').orderBy('revision', 'desc').select('revision', 'createdAt', 'updatedAt', 'status').limit(50).get(),
    ref.collection('events').orderBy('createdAt', 'desc').limit(100).get(),
  ]);
  const { policy, grant } = await reviewAccess(uid);
  const canRelease = hasKnowledgeGrant(grant, policy, record.datasetType, 'release');
  return { historical: currentVersion !== record.revision, currentVersion, canRelease: canRelease && currentVersion === record.revision, releaseChecks: canRelease ? Object.fromEntries(DESTINATIONS.map(destination => [destination, releaseDenials(record, destination, policy)])) : {}, record, events: events.docs.map(doc => doc.data()).filter(event => canReadFeedback || event.action !== 'reviewed' || event.actorUid === uid), reviews: reviews.docs.map(doc => doc.data()), history: history.docs.map(doc => ({ revision: doc.get('revision'), createdAt: doc.get('updatedAt'), status: doc.get('revision') === record.revision ? record.status : doc.get('status') })) };
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
  // Upload checks occur after the idempotency lookup, so a saved receipt survives media loss.
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
      if (old.datasetType !== input.datasetType && (old.submittedAt || old.status !== 'draft')) throw new HttpsError('invalid-argument', 'Keep the dataset area of an existing record.');
    } else if (d.revision !== undefined && d.revision !== null) throw new HttpsError('invalid-argument', 'A new record has no previous revision.');
    const policy = policyFrom((await tx.get(db.doc('knowledgePolicies/current'))).data());
    if (d.submit && input.datasetType === 'sentences' && !policy.sentenceEnabled) throw new HttpsError('failed-precondition', 'Sentence submissions await approval of the provisional schema. Save a private draft.');
    for (const relation of input.relations) {
      const target = (await tx.get(db.collection('knowledgeRecords').doc(checked(() => knowledgeId(relation.recordId))))).data() as KnowledgeRecord | undefined;
      const revision = (await tx.get(db.collection('knowledgeRecords').doc(relation.recordId).collection('revisions').doc(String(relation.revision)))).data();
      if (!target || !revision || target.language !== input.language || target.status === 'withdrawn' || (target.authorUid !== uid && target.authentication !== 'gold')) throw new HttpsError('invalid-argument', 'A relationship target is unavailable, withdrawn or belongs to another language.');
      if (relation.recordId === id) throw new HttpsError('invalid-argument', 'A record cannot link to itself.');
    }
    // Legacy external links stay as provenance only and cannot satisfy typed release requirements.
    for (const related of input.relatedRecordIds) {
      if (!/^(?:dictionaryEntries|expressionEntries|kasemEvidence):[A-Za-z0-9_-]{1,150}$/.test(related)) throw new HttpsError('invalid-argument', 'Use typed relationships for knowledge records.');
      const [collection, key] = related.split(':');
      const target = await tx.get(db.collection(collection).doc(key));
      if (!target.exists || (target.get('isPublished') !== true && target.get('authorUid') !== uid)) throw new HttpsError('invalid-argument', 'A related reference is unavailable.');
    }
    const prefix = DISPLAY_PREFIXES[input.datasetType] ?? (input.datasetType === 'sentences' && policy.sentenceEnabled ? policy.sentencePrefix : undefined);
    const counter = prefix && (!old?.displayId || old.datasetType !== input.datasetType) ? db.collection('knowledgeCounters').doc(prefix) : null;
    const sequence = counter ? Number((await tx.get(counter)).get('value') ?? 0) + 1 : 0;
    const duplicateKey = knowledgeHash(`${input.language}:${input.datasetType}:${input.original.normalize('NFC').toLocaleLowerCase('en')}`);
    const duplicates = input.original.trim() ? await tx.get(db.collection('knowledgeRecords').where('authorUid', '==', uid).where('duplicateKey', '==', duplicateKey).limit(6)) : null;
    await bindAudio(input);
    const now = new Date().toISOString();
    const record: KnowledgeRecord = { ...input, id, schemaVersion: 2, ...(old?.displayId && old.datasetType === input.datasetType ? { displayId: old.displayId } : prefix ? { displayId: `${prefix}-${String(sequence).padStart(6, '0')}` } : {}),
      workflow: d.submit ? 'submitted' : 'draft', authentication: 'community', authenticationPolicy: '', disputed: false, blockingIssues: [],
      ...(old?.submittedAt || d.submit ? { submittedAt: old?.submittedAt ?? now } : {}), searchText: knowledgeSearchText(input), normalizationVersion: KNOWLEDGE_NORMALIZATION_VERSION, revision: old ? old.revision + 1 : 1, authorUid: uid,
      createdAt: old?.createdAt ?? now, updatedAt: now, verifiedAt: null, status: d.submit ? 'submitted' : 'draft',
      duplicateKey, warnings: [...knowledgeWarnings(input), ...(duplicates?.docs.filter(doc => doc.id !== id).map(doc => `Possible duplicate or variant of ${doc.id}. Compare meaning and context before deciding.`) ?? [])], reviewCount: 0, approvalCount: 0 };
    if (counter) tx.set(counter, { value: sequence });
    tx.create(ref.collection('events').doc(`revision-${record.revision}`), { action: d.submit ? 'submitted' : 'draft_saved', actorUid: uid, revision: record.revision, createdAt: now, policyVersion: policy.version });
    tx.set(ref, record);
    tx.create(ref.collection('revisions').doc(String(record.revision)), record);
    tx.create(requestRef, { authorUid: uid, recordId: id, revision: record.revision, fingerprint, createdAt: now });
    return record;
  });
  return { record: result, receiptId: `${result.id}:${result.revision}`, savedAt: result.updatedAt };
});
export const reviewKnowledgeRecord = onCall(options, async req => {
  writesEnabled();
  const uid = requireAuth(req);
  await consumeRateLimit('reviewKnowledgeRecord', uid, 120, 3600000);
  const d = knowledgeObject(req.data), id = checked(() => knowledgeId(d.id)), db = getFirestore();
  const record = await db.runTransaction(async tx => {
    const ref = db.collection('knowledgeRecords').doc(id), snap = await tx.get(ref), old = snap.data() as KnowledgeRecord | undefined;
    if (!old) throw new HttpsError('not-found', 'Knowledge record not found.');
    currentRevision(d.revision, old);
    const policy = policyFrom((await tx.get(db.doc('knowledgePolicies/current'))).data());
    const grant = (await tx.get(db.doc(`knowledgeRoleGrants/${uid}`))).data();
    if (!hasKnowledgeGrant(grant, policy, old.datasetType, d.scope as ReviewScope)) throw new HttpsError('permission-denied', 'A current assignment and qualification in this review scope is required. An administrator role alone cannot authenticate Kasem.');
    const review = { ...checked(() => parseKnowledgeReview(d, old, uid, new Date().toISOString())), policyVersion: policy.version, qualificationReference: String(grant?.qualificationReference ?? '') };
    const reviewRef = ref.collection('reviews').doc(`${old.revision}-${review.scope}-${knowledgeHash(uid).slice(0, 32)}`), prior = await tx.get(reviewRef);
    if (prior.exists) {
      if (stableStringify({ ...prior.data(), createdAt: '' }) !== stableStringify({ ...review, createdAt: '' })) throw new HttpsError('already-exists', 'Your review is already recorded. Changes need a new contributor revision.');
      return old;
    }
    if (old.reviewCount >= 100) throw new HttpsError('resource-exhausted', 'This revision has reached its review limit. Ask the contributor to resolve feedback in a new revision.');
    const history = await tx.get(ref.collection('reviews').where('revision', '==', old.revision));
    const reviews = [...history.docs.map(doc => doc.data() as KnowledgeReview), review];
    const currentReviews: KnowledgeReview[] = [];
    for (const r of reviews) {
      const g = r.reviewerUid === uid ? grant : (await tx.get(db.doc(`knowledgeRoleGrants/${r.reviewerUid}`))).data();
      if (r.scope && hasKnowledgeGrant(g, policy, old.datasetType, r.scope)) currentReviews.push(r);
    }
    const next = applyKnowledgeReview(old, review);
    const authentication = authenticationFor(next, currentReviews, policy);
    next.authentication = authentication; next.authenticationPolicy = policy.version;
    if (authentication === 'gold' && !['disputed', 'changes_requested'].includes(next.status)) { next.workflow = 'review_complete'; next.status = 'gold'; next.verifiedAt = review.createdAt; }
    tx.create(ref.collection('events').doc(`review-${old.revision}-${review.scope}-${knowledgeHash(uid).slice(0, 32)}`), { action: 'reviewed', actorUid: uid, revision: old.revision, outcome: review.decision, scope: review.scope, createdAt: review.createdAt, policyVersion: policy.version });
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
    const next: KnowledgeRecord = { ...old, status: 'withdrawn', workflow: 'withdrawn', authentication: 'rejected_outdated', updatedAt: now, verifiedAt: null,
      ...(old.rights ? { rights: { ...old.rights, state: 'withdrawn' as const } } : {}),
      permissions: { ...old.permissions, review: false, publication: false, providerRetrieval: false, modelTraining: false, evaluation: false, audio: false } };
    for (const destination of ['venacula', 'tribestudio', 'kawuri', 'training', 'evaluation']) tx.delete(db.collection('knowledgeReleases').doc(`${id}-${destination}`));
    tx.set(db.collection('knowledgeRevocations').doc(id), { recordId: id, revision: old.revision, actorUid: uid, createdAt: now, status: 'future_use_blocked', residualLimit: 'Previously downloaded exports or trained models require a separately tracked removal process.' });
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
  await readable(req, record); currentRevision(d.revision, record);
  if (record.status === 'withdrawn' || !record.permissions.audio || (record.authorUid !== uid && !record.permissions.review)) throw new HttpsError('failed-precondition', 'Permission for this recording is no longer active.');
  if (!Number.isInteger(d.index) || Number(d.index) < 0 || Number(d.index) >= record.audio.length) throw new HttpsError('invalid-argument', 'Choose an attached recording.');
  const audio = record.audio[Number(d.index)], file = getStorage().bucket().file(audio.path), [metadata] = await file.getMetadata();
  if (!audio.generation || String(metadata.generation) !== audio.generation) throw new HttpsError('failed-precondition', 'The recording changed. Submit a new revision before review.');
  const [bytes] = await file.download({ validation: 'crc32c' });
  const latest = (await ref.get()).data() as KnowledgeRecord | undefined, [after] = await file.getMetadata();
  if (!latest || latest.revision !== record.revision || latest.status === 'withdrawn' || !latest.permissions.audio || String(after.generation) !== audio.generation) throw new HttpsError('failed-precondition', 'The recording or its permission changed.');
  await readable(req, latest);
  return { audio: bytes.toString('base64'), contentType: metadata.contentType ?? 'audio/mpeg' };
});

// Exported type keeps feedback events explicit for callers of the pure helper module.
export type { KnowledgeReview };

export const getKnowledgeProgress = onCall(options, async req => {
  const uid = requireAuth(req);
  await consumeRateLimit('getKnowledgeProgress', uid, 60, 3600000);
  const base = getFirestore().collection('knowledgeRecords').where('authorUid', '==', uid).where('schemaVersion', '==', 2);
  const states = ['draft', 'submitted', 'in_review', 'changes_requested', 'review_complete', 'withdrawn'];
  const counts = await Promise.all(states.map(state => base.where('workflow', '==', state).count().get()));
  const submitted = await base.where('submittedAt', '!=', null).count().get();
  return { counts: Object.fromEntries(states.map((state, i) => [state, counts[i].data().count])), submitted: submitted.data().count,
    period: 'All time · version 2 corpus records', timezone: 'UTC', refreshedAt: new Date().toISOString(),
    definition: 'One submitted record counts once. Revisions are shown separately in each record history. Legacy records are excluded until reconciled.' };
});
