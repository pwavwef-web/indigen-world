import { getFirestore } from 'firebase-admin/firestore';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { requireAuth, requireRole } from './auth.js';
import { consumeRateLimit } from './rate-limit.js';
import { exampleQuality, field, hash, object, type EvidenceNote } from './kasem-evidence.js';
import { resetGrammarCache } from './kawuri-grammar.js';

const options = { region: 'us-central1', enforceAppCheck: process.env.ENFORCE_APP_CHECK === 'true' };
function reviewable(n: EvidenceNote): boolean {
  return n.permissions.status === 'active' && n.permissions.review && n.permissions.sourceConfirmed
    && (!n.permissions.expiresAt || Date.parse(n.permissions.expiresAt) > Date.now());
}
function text(raw: unknown, name: string, max: number, required = false): string {
  try { return field(raw, name, max, required); } catch (e) { throw new HttpsError('invalid-argument', String(e)); }
}
export const submitGrammarClaim = onCall(options, async req => {
  if (process.env.KASEM_EVIDENCE_WRITES === 'false') throw new HttpsError('unavailable', 'Grammar evidence collection is temporarily paused.');
  const uid = requireAuth(req); requireRole(req, 'validator');
  await consumeRateLimit('submitGrammarClaim', uid, 20, 3600000);
  const d = object(req.data), db = getFirestore(), ref = db.collection('grammarClaims').doc();
  const title = text(d.title, 'Title', 180, true), summary = text(d.summary, 'Claim', 2000, true);
  const scope = text(d.scope, 'Applicable contexts and exceptions', 2000, true), dialect = text(d.dialect, 'Dialect', 60, true);
  if (!Array.isArray(d.evidenceIds) || !d.evidenceIds.length || d.evidenceIds.length > 20 || d.evidenceIds.some(id => typeof id !== 'string' || !/^[\w-]{1,150}$/.test(id))) throw new HttpsError('invalid-argument', 'Link between one and twenty reviewed evidence notes.');
  const evidenceIds = [...new Set(d.evidenceIds as string[])];
  const triggers = text(d.triggers, 'Lookup terms, comma separated', 300).split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  await db.runTransaction(async tx => {
    const evidence = await Promise.all(evidenceIds.map(id => tx.get(db.collection('kasemEvidence').doc(id))));
    for (const doc of evidence) {
      const n = doc.data() as EvidenceNote | undefined;
      if (!n || !reviewable(n) || !n.examples.some((e, i) => e.dialect === dialect && exampleQuality(n, i).approved)) throw new HttpsError('failed-precondition', 'Every linked note needs independently reviewed evidence in this dialect.');
    }
    const claim = { id: ref.id, authorUid: uid, title, summary, scope, dialect, evidenceIds,
      evidenceRevisions: Object.fromEntries(evidence.map(doc => [doc.id, doc.get('revision')])),
      triggers, version: 1, status: 'hypothesis', createdAt: new Date().toISOString() };
    tx.create(ref, claim); tx.create(ref.collection('versions').doc('1'), claim);
  });
  return { id: ref.id, status: 'hypothesis' };
});
export const decideGrammarClaim = onCall(options, async req => {
  const uid = requireAuth(req); requireRole(req, 'validator');
  await consumeRateLimit('decideGrammarClaim', uid, 120, 3600000);
  const d = object(req.data), id = text(d.claimId, 'Claim ID', 150, true);
  if (!/^[\w-]+$/.test(id) || !['supported', 'disputed', 'retired'].includes(String(d.decision))) throw new HttpsError('invalid-argument', 'Choose a claim and a decision.');
  if (d.decision === 'retired') requireRole(req, 'admin');
  else if (process.env.KASEM_EVIDENCE_WRITES === 'false') throw new HttpsError('unavailable', 'Grammar evidence review is temporarily paused.');
  const reason = text(d.reason, 'Review reason', 2000, true), db = getFirestore();
  const status = await db.runTransaction(async tx => {
    const ref = db.collection('grammarClaims').doc(id), snapshot = await tx.get(ref);
    if (!snapshot.exists) throw new HttpsError('not-found', 'Claim not found.');
    const claim = snapshot.data()!;
    if (claim.authorUid === uid && d.decision !== 'retired') throw new HttpsError('permission-denied', 'A claim needs independent review.');
    if (claim.version !== d.version) throw new HttpsError('failed-precondition', 'Open the current claim version.');
    const reviewsRef = db.collection('kasemClaimReviews').doc(id), votes = await tx.get(reviewsRef);
    const evidence = await Promise.all((claim.evidenceIds as string[]).map(e => tx.get(db.collection('kasemEvidence').doc(e))));
    for (const doc of d.decision === 'retired' ? [] : evidence) {
      const n = doc.data() as EvidenceNote | undefined;
      if (!n || !reviewable(n) || n.revision !== claim.evidenceRevisions[doc.id] || !n.examples.some((e, i) => e.dialect === claim.dialect && exampleQuality(n, i).approved)) throw new HttpsError('failed-precondition', 'Supporting evidence changed. Propose a revised claim.');
    }
    const decisions = object(votes.data()?.decisions), key = hash(uid);
    const prior = decisions[key];
    if (decisions[key] && decisions[key] !== d.decision && d.decision !== 'retired') throw new HttpsError('already-exists', 'Your decision is already recorded for this version.');
    decisions[key] = d.decision;
    const values = Object.values(decisions);
    const next = claim.status === 'retired' || values.includes('retired') ? 'retired' : values.includes('disputed') ? 'disputed' : values.filter(v => v === 'supported').length >= 2 ? 'supported' : 'hypothesis';
    tx.set(reviewsRef, { decisions });
    if (prior !== d.decision) tx.create(reviewsRef.collection('events').doc(key + '-' + d.decision), { reviewerId: uid, decision: d.decision, reason, version: d.version, createdAt: new Date().toISOString() });
    tx.update(ref, { status: next });
    tx.set(db.collection('grammarRules').doc('claim-' + id), { id: 'claim-' + id, topic: 'construction', title: claim.title,
      summary: claim.summary, note: claim.scope, dialect: claim.dialect, englishTriggers: claim.triggers,
      // Derived claims stay private. Provider use checks all source permissions
      // at request time; a review decision does not grant public publication.
      pattern: '', examples: [], nounClasses: [], status: next === 'supported' ? 'reviewed-private' : 'draft',
      claimStatus: next, claimId: id, evidenceRevisions: claim.evidenceRevisions, schemaVersion: 2 });
    return { value: next, changed: next !== claim.status };
  });
  if (status.changed) {
    const releases = await db.collection('kasemDatasetReleases').where('claimIds', 'array-contains', id).get();
    for (let offset = 0; offset < releases.size; offset += 200) {
      const batch = db.batch();
      for (const release of releases.docs.slice(offset, offset + 200)) batch.update(release.ref, { status: 'invalidated', reason: 'Grammar claim status changed.', invalidatedAt: new Date().toISOString() });
      await batch.commit();
    }
  }
  resetGrammarCache(); return { status: status.value };
});
