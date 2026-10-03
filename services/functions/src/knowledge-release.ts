import { getFirestore, type Transaction } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { DESTINATIONS, knowledgeSearchText, type Destination } from '@indigen-world/contracts/knowledge';
import { requireAuth } from './auth.js';
import { consumeRateLimit } from './rate-limit.js';
import { authenticationFor, hasKnowledgeGrant, knowledgeProjection, policyFrom, releaseDenials, type KnowledgePolicy } from './knowledge-policy.js';
import { knowledgeHash, knowledgeId, knowledgeObject, type KnowledgeRecord, type KnowledgeReview } from './knowledge-records.js';

const options = { region: 'us-central1', enforceAppCheck: process.env.ENFORCE_APP_CHECK === 'true', timeoutSeconds: 120 };
const destinationFrom = (raw: unknown): Destination => {
  if (!DESTINATIONS.includes(raw as Destination)) throw new HttpsError('invalid-argument', 'Choose a supported destination.');
  return raw as Destination;
};
function idFrom(raw: unknown) { try { return knowledgeId(raw); } catch { throw new HttpsError('invalid-argument', 'Choose a valid record ID.'); } }

/** Rechecked for each read; there is deliberately no warm-process eligibility cache. */
async function denials(tx: Transaction, record: KnowledgeRecord, destination: Destination, policy: KnowledgePolicy, visited = new Set<string>()) {
  const key = `${record.id}:${record.revision}`;
  if (visited.has(key)) return [];
  if (visited.size >= 100) return ['The relationship graph needs a smaller reviewed release scope.'];
  visited.add(key);
  const reasons = releaseDenials(record, destination, policy);
  if (reasons.length) return reasons;
  const db = getFirestore();
  const reviewDocs = await tx.get(db.collection('knowledgeRecords').doc(record.id).collection('reviews').where('revision', '==', record.revision));
  const reviews: KnowledgeReview[] = [];
  for (const doc of reviewDocs.docs) {
    const review = doc.data() as KnowledgeReview;
    const grant = (await tx.get(db.doc(`knowledgeRoleGrants/${review.reviewerUid}`))).data();
    if (review.scope && hasKnowledgeGrant(grant, policy, record.datasetType, review.scope)) reviews.push(review);
  }
  if (authenticationFor(record, reviews, policy) !== 'gold') reasons.push('Qualified authentication is no longer current.');
  for (const relation of record.relations ?? []) {
    const target = (await tx.get(db.collection('knowledgeRecords').doc(relation.recordId))).data() as KnowledgeRecord | undefined;
    if (!target || target.language !== record.language || target.revision !== relation.revision || (await denials(tx, target, destination, policy, visited)).length) reasons.push('A required relationship is no longer eligible at its exact revision.');
  }
  return reasons;
}

export const releaseKnowledgeRecord = onCall(options, async req => {
  const uid = requireAuth(req), d = knowledgeObject(req.data), id = idFrom(d.id), destination = destinationFrom(d.destination), db = getFirestore();
  await consumeRateLimit('releaseKnowledgeRecord', uid, 60, 3600000);
  if (process.env.KNOWLEDGE_WORKSPACE_WRITES === 'false') throw new HttpsError('unavailable', 'Corpus changes are paused.');
  if (typeof d.requestId !== 'string' || !/^[\w-]{8,150}$/.test(d.requestId)) throw new HttpsError('invalid-argument', 'Supply a durable release request ID.');
  return db.runTransaction(async tx => {
    const ref = db.collection('knowledgeRecords').doc(id), record = (await tx.get(ref)).data() as KnowledgeRecord | undefined;
    if (!record) throw new HttpsError('not-found', 'Record unavailable.');
    const policy = policyFrom((await tx.get(db.doc('knowledgePolicies/current'))).data());
    const grant = (await tx.get(db.doc(`knowledgeRoleGrants/${uid}`))).data();
    if (!hasKnowledgeGrant(grant, policy, record.datasetType, 'release')) throw new HttpsError('permission-denied', 'A current release manager grant is required.');
    if (d.revision !== record.revision) throw new HttpsError('failed-precondition', 'Select the exact current revision.');
    const requestRef = db.collection('knowledgeReleaseRequests').doc(knowledgeHash(`${uid}:${d.requestId}`)), prior = await tx.get(requestRef);
    if (prior.exists) {
      if (prior.get('recordId') !== id || prior.get('revision') !== d.revision || prior.get('destination') !== destination) throw new HttpsError('already-exists', 'That request ID already identifies a different release.');
      const active = await tx.get(db.collection('knowledgeReleases').doc(`${id}-${destination}`));
      return { manifest: prior.data(), replayed: true, active: active.exists && active.get('requestId') === d.requestId };
    }
    const reasons = await denials(tx, record, destination, policy);
    if (reasons.length) throw new HttpsError('failed-precondition', reasons.join(' '), { reasons });
    // A source family is reserved once across training and held-out evaluation.
    const familyRef = record.sourceFamily ? db.collection('knowledgeSourceSplits').doc(knowledgeHash(record.sourceFamily.normalize('NFC').trim().toLocaleLowerCase('en'))) : null;
    const family = familyRef ? await tx.get(familyRef) : null;
    if (family?.exists && ((destination === 'training' && family.get('split') !== 'train') || (['evaluation', 'kawuri'].includes(destination) && family.get('split') !== (destination === 'evaluation' ? 'evaluation' : 'train')))) throw new HttpsError('failed-precondition', 'This source family belongs to a different held-out split.');
    const manifest = { recordId: id, revision: record.revision, destination, policyVersion: policy.version, rightsVersion: record.rights.version,
      permittedUse: destination, transformation: 'typed-projection-v1', actorUid: uid, createdAt: new Date().toISOString(), state: 'released', requestId: d.requestId };
    tx.create(requestRef, manifest);
    tx.set(db.collection('knowledgeReleases').doc(`${id}-${destination}`), manifest);
    tx.create(ref.collection('events').doc(`release-${knowledgeHash(`${uid}:${d.requestId}`)}`), { action: 'released', ...manifest });
    if (familyRef && ['training', 'evaluation', 'kawuri'].includes(destination) && !family?.exists) tx.create(familyRef, { split: destination === 'evaluation' ? 'evaluation' : 'train', firstRelease: manifest.requestId, createdAt: manifest.createdAt });
    return { manifest, replayed: false, active: true };
  });
});

export const revokeKnowledgeRelease = onCall(options, async req => {
  const uid = requireAuth(req), d = knowledgeObject(req.data), id = idFrom(d.id), destination = destinationFrom(d.destination), db = getFirestore();
  if (typeof d.reason !== 'string' || d.reason.trim().length < 10 || d.reason.length > 2000) throw new HttpsError('invalid-argument', 'Explain the revocation.');
  await consumeRateLimit('revokeKnowledgeRelease', uid, 60, 3600000);
  return db.runTransaction(async tx => {
    const record = (await tx.get(db.collection('knowledgeRecords').doc(id))).data() as KnowledgeRecord | undefined;
    if (!record) throw new HttpsError('not-found', 'Record unavailable.');
    const policy = policyFrom((await tx.get(db.doc('knowledgePolicies/current'))).data());
    const grant = (await tx.get(db.doc(`knowledgeRoleGrants/${uid}`))).data();
    if (record.authorUid !== uid && !hasKnowledgeGrant(grant, policy, record.datasetType, 'release')) throw new HttpsError('permission-denied', 'Only the owner or a release manager may revoke this release.');
    const ref = db.collection('knowledgeReleases').doc(`${id}-${destination}`), prior = await tx.get(ref);
    if (!prior.exists) return { revoked: true };
    const event = { action: 'release_revoked', recordId: id, revision: prior.get('revision'), destination, reason: d.reason, actorUid: uid, createdAt: new Date().toISOString(), policyVersion: policy.version };
    tx.delete(ref); tx.create(db.collection('knowledgeRecords').doc(id).collection('events').doc(), event);
    tx.set(db.collection('knowledgeRevocations').doc(`${id}-${destination}`), { ...event, status: 'future_use_blocked', residualLimit: 'Downloaded exports and previously trained models require a separate removal process.' });
    return { revoked: true };
  });
});

export async function resolveKnowledge(destination: Destination, query = '', cursor = '', limit = 30) {
  const db = getFirestore();
  return db.runTransaction(async tx => {
    const policy = policyFrom((await tx.get(db.doc('knowledgePolicies/current'))).data());
    if (!policy.approved || !policy.destinations.includes(destination)) return { records: [], nextCursor: null, policyVersion: policy.version };
    let q = db.collection('knowledgeReleases').where('destination', '==', destination).orderBy('__name__').limit(limit + 1);
    if (cursor) q = q.startAfter(cursor);
    const snapshots = await tx.get(q), records: ReturnType<typeof knowledgeProjection>[] = [];
    for (const release of snapshots.docs.slice(0, limit)) {
      const record = (await tx.get(db.collection('knowledgeRecords').doc(release.get('recordId')))).data() as KnowledgeRecord | undefined;
      if (!record || record.revision !== release.get('revision') || release.get('policyVersion') !== policy.version || (await denials(tx, record, destination, policy)).length) continue;
      if (query && !knowledgeSearchText(record).includes(query.normalize('NFC').toLocaleLowerCase('en'))) continue;
      records.push(knowledgeProjection(record, destination));
    }
    return { records, nextCursor: snapshots.size > limit ? snapshots.docs[limit - 1].id : null, policyVersion: policy.version };
  });
}
export const resolveKnowledgeRecords = onCall(options, async req => {
  const uid = requireAuth(req), d = knowledgeObject(req.data), destination = destinationFrom(d.destination ?? 'venacula');
  await consumeRateLimit('resolveKnowledgeRecords', uid, 120, 3600000);
  if (['training', 'evaluation'].includes(destination)) throw new HttpsError('permission-denied', 'Dataset exports require the release manager export operation.');
  if (typeof d.query !== 'undefined' && (typeof d.query !== 'string' || d.query.length > 200)) throw new HttpsError('invalid-argument', 'Use a search of at most 200 characters.');
  if (typeof d.cursor !== 'undefined' && (typeof d.cursor !== 'string' || !/^[\w-]{1,150}$/.test(d.cursor))) throw new HttpsError('invalid-argument', 'Invalid page cursor.');
  return resolveKnowledge(destination, String(d.query ?? ''), String(d.cursor ?? ''));
});

export const exportKnowledgeRecords = onCall(options, async req => {
  const uid = requireAuth(req), d = knowledgeObject(req.data), destination = destinationFrom(d.destination), db = getFirestore();
  await consumeRateLimit('exportKnowledgeRecords', uid, 10, 3600000);
  const p = policyFrom((await db.doc('knowledgePolicies/current').get()).data()), grant = (await db.doc(`knowledgeRoleGrants/${uid}`).get()).data();
  if (!p.approvedCategories.length || !p.approvedCategories.every(c => hasKnowledgeGrant(grant, p, c, 'release'))) throw new HttpsError('permission-denied', 'Export requires release authority across the approved categories.');
  if (d.cursor !== undefined && (typeof d.cursor !== 'string' || !/^[\w-]{1,150}$/.test(d.cursor))) throw new HttpsError('invalid-argument', 'Invalid export page cursor.');
  const result = await resolveKnowledge(destination, '', String(d.cursor ?? ''), 30);
  const manifest = { destination, policyVersion: result.policyVersion, createdAt: new Date().toISOString(), actorUid: uid, transformation: 'typed-projection-v1', revisions: result.records.map(r => ({ recordId: r.recordId, revision: r.revision })), exclusions: 'Ineligible, revoked, superseded and other-split records excluded. Audio binaries and private identity/consent evidence excluded.', nextCursor: result.nextCursor };
  const ref = await db.collection('knowledgeExports').add(manifest);
  return { ...result, manifest: { ...manifest, id: ref.id } };
});
