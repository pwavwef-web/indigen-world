import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { requireAuth, requireRole } from './auth.js';
import { KNOWLEDGE_CATALOG, knowledgeObject } from './knowledge-records.js';
import { policyFrom } from './knowledge-policy.js';
import { stableStringify } from './kasem-evidence.js';
import { consumeRateLimit } from './rate-limit.js';

const options = { region: 'us-central1', enforceAppCheck: process.env.ENFORCE_APP_CHECK === 'true' };
/** Records the human governance decision; never treats an admin role as language expertise. */
export const configureKnowledgeGovernance = onCall(options, async req => {
  const uid = requireAuth(req); requireRole(req, 'super_admin');
  await consumeRateLimit('configureKnowledgeGovernance', uid, 20, 3600000);
  const d = knowledgeObject(req.data), db = getFirestore();
  if (typeof d.reason !== 'string' || d.reason.trim().length < 10 || d.reason.length > 2000) throw new HttpsError('invalid-argument', 'Reference the approved governance decision.');
  if (!['policy', 'grant'].includes(String(d.action))) throw new HttpsError('invalid-argument', 'Choose policy or grant.');
  return db.runTransaction(async tx => {
    const current = policyFrom((await tx.get(db.doc('knowledgePolicies/current'))).data());
    let entity: string;
    if (d.action === 'policy') {
      const policy = policyFrom(d.policy);
      if (!policy.approved || !/^[\w.-]{1,100}$/.test(policy.version)) throw new HttpsError('invalid-argument', 'Provide a valid approved and versioned policy, including category scope, quorum and full rubric.');
      const versionRef = db.collection('knowledgePolicyVersions').doc(policy.version), prior = await tx.get(versionRef);
      if (prior.exists && stableStringify(prior.get('policy')) !== stableStringify(policy)) throw new HttpsError('already-exists', 'Policy versions are immutable. Use a new version.');
      if (!prior.exists) tx.create(versionRef, { policy, decisionReference: d.reason, actorUid: uid, createdAt: new Date().toISOString() });
      tx.set(db.doc('knowledgePolicies/current'), policy); entity = `knowledgePolicyVersions/${policy.version}`;
    } else {
      const g = knowledgeObject(d.grant);
      if (typeof d.uid !== 'string' || !/^[\w-]{1,128}$/.test(d.uid)) throw new HttpsError('invalid-argument', 'Choose a valid account ID.');
      if (typeof g.active !== 'boolean' || !Array.isArray(g.categories) || !g.categories.length || !g.categories.every(c => KNOWLEDGE_CATALOG.some(t => t.id === c))
        || !Array.isArray(g.scopes) || !g.scopes.length || !g.scopes.every(s => ['language', 'culture', 'curation', 'release'].includes(s))
        || typeof g.expiresAt !== 'string' || !Number.isFinite(Date.parse(g.expiresAt)) || typeof g.qualificationReference !== 'string' || !g.qualificationReference.trim() || g.qualificationReference.length > 2000)
        throw new HttpsError('invalid-argument', 'A grant needs explicit category/scope assignments, expiry and a qualification evidence reference.');
      if (g.active && (!current.approved || Date.parse(g.expiresAt) <= Date.now())) throw new HttpsError('failed-precondition', 'Approve the policy and choose a future grant expiry.');
      entity = `knowledgeRoleGrants/${d.uid}`;
      const prior = await tx.get(db.doc(entity));
      tx.create(db.collection('knowledgeGrantVersions').doc(), { uid: d.uid, before: prior.exists ? prior.data() : null, after: { ...g, policyVersion: current.version }, actorUid: uid, createdAt: new Date().toISOString(), reason: d.reason });
      tx.set(db.doc(entity), { active: g.active, categories: g.categories, scopes: g.scopes, expiresAt: g.expiresAt, qualificationReference: g.qualificationReference, policyVersion: current.version });
    }
    tx.create(db.collection('knowledgeGovernanceEvents').doc(), { action: String(d.action), entity, actorUid: uid, reason: d.reason, previousPolicyVersion: current.version, createdAt: new Date().toISOString() });
    return { saved: true, entity };
  });
});
