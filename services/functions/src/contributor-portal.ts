import { createHash } from 'node:crypto';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { requireAuth, requireRole } from './auth.js';
import { consumeRateLimit } from './rate-limit.js';
import { COLLECTION_CAMPAIGN_ID, buildCollectionCampaignDocument, buildCollectionContributionReceipt,
  buildCollectionSubmissionDocument, parseCollectionContributionInput } from './collection-contributions.js';

const options = { region: 'us-central1', invoker: 'public' as const,
  enforceAppCheck: process.env.ENFORCE_APP_CHECK === 'true' };
const origin = 'https://tribestudio.ngenwale.com';
function text(value: unknown, max: number, optional = false): string {
  if (typeof value !== 'string' || value.trim().length > max || (!optional && !value.trim())) {
    throw new HttpsError('invalid-argument', 'Missing or oversized text.');
  }
  return value.trim();
}
function id(value: unknown): string {
  const result = text(value, 128);
  if (!/^[a-zA-Z0-9_-]+$/.test(result)) throw new HttpsError('invalid-argument', 'Invalid identifier.');
  return result;
}
export function parseExpressionAnswer(raw: Record<string, unknown>) {
  const translation = text(raw.translation, 2000, true);
  if (!Array.isArray(raw.alternatives) || raw.alternatives.length > 12) {
    throw new HttpsError('invalid-argument', 'Use at most twelve alternate expressions.');
  }
  const alternatives = [...new Set(raw.alternatives.map(v => text(v, 500, true)).filter(Boolean))]
    .filter(v => v !== translation);
  if (alternatives.join('\n').length > 3500) {
    throw new HttpsError('invalid-argument', 'Alternate expressions must total no more than 3,500 characters.');
  }
  return { translation, alternatives };
}

// Returns a link for the administrator to share; never sends unsolicited email.
export const inviteExpressionContributor = onCall(options, async req => {
  const actor = requireAuth(req); requireRole(req, 'admin');
  await consumeRateLimit('inviteExpressionContributor', actor, 10);
  const email = text(req.data?.email, 254).toLowerCase();
  const expressions = req.data?.expressions;
  if (!Array.isArray(expressions) || !expressions.length || expressions.length > 100) {
    throw new HttpsError('invalid-argument', 'Provide 1–100 expressions.');
  }
  const prompts = [...new Set(expressions.map(v => text(v, 180)))];
  let user;
  try { user = await getAuth().getUserByEmail(email); }
  catch (error) {
    if ((error as { code?: string }).code !== 'auth/user-not-found') throw error;
    user = await getAuth().createUser({ email });
  }
  if (user.disabled) throw new HttpsError('failed-precondition', 'This account is disabled.');
  const db = getFirestore(), work = db.collection('contributorWork').doc().id;
  const path = `/contributor/${user.uid}/${work}`;
  const now = new Date().toISOString();
  const batch = db.batch();
  batch.set(db.doc(`contributorAccounts/${user.uid}`), { authUid: user.uid, status: 'active',
    defaultWork: work, invitedBy: actor, updatedAt: now }, { merge: true });
  batch.set(db.doc(`contributorAccounts/${user.uid}/works/${work}`), {
    id: work, title: 'Everyday expressions', language: 'xsm', kind: 'expressions', createdAt: now,
  });
  for (const expression of prompts) {
    const key = createHash('sha256').update(expression).digest('hex').slice(0, 24);
    batch.set(db.doc(`contributorAccounts/${user.uid}/works/${work}/items/${key}`), {
      id: key, expression, translation: '', alternatives: [], revision: 0, status: 'draft', updatedAt: now,
    });
  }
  await batch.commit();
  const reset = new URL(await getAuth().generatePasswordResetLink(email, { url: origin + path }));
  const activation = new URL(origin + path);
  activation.searchParams.set('oobCode', reset.searchParams.get('oobCode')!);
  activation.searchParams.set('mode', 'resetPassword');
  return { contributorId: user.uid, work, portalUrl: origin + path, activationUrl: activation.toString() };
});

/** Assign another set to the same contributor without changing their credentials. */
export const assignContributorExpressions = onCall(options, async req => {
  const actor = requireAuth(req); requireRole(req, 'admin');
  await consumeRateLimit('assignContributorExpressions', actor, 30);
  const uid = id(req.data?.contributorId);
  if (!Array.isArray(req.data?.expressions) || !req.data.expressions.length || req.data.expressions.length > 100) {
    throw new HttpsError('invalid-argument', 'Provide 1–100 expressions.');
  }
  const prompts = [...new Set<string>(req.data.expressions.map((v: unknown) => text(v, 180)))];
  const title = req.data.title == null ? 'Everyday expressions' : text(req.data.title, 120);
  const db = getFirestore(), account = db.doc(`contributorAccounts/${uid}`);
  const work = account.collection('works').doc();
  const now = new Date().toISOString();
  await db.runTransaction(async tx => {
    const member = await tx.get(account);
    if (member.get('status') !== 'active') throw new HttpsError('failed-precondition', 'Invite this contributor before assigning work.');
    tx.create(work, { id: work.id, title, kind: 'expressions', language: 'xsm', assignedBy: actor, createdAt: now });
    for (const expression of prompts) {
      const key = createHash('sha256').update(expression).digest('hex').slice(0, 24);
      tx.create(work.collection('items').doc(key), {
        id: key, expression, translation: '', alternatives: [], revision: 0, status: 'draft', updatedAt: now,
      });
    }
    tx.update(account, { defaultWork: work.id, updatedAt: now });
  });
  return { contributorId: uid, work: work.id, portalUrl: `${origin}/contributor/${uid}/${work.id}` };
});

export const saveExpressionAnswer = onCall(options, async req => {
  const uid = requireAuth(req);
  await consumeRateLimit('saveExpressionAnswer', uid, 120);
  const work = id(req.data?.work), item = id(req.data?.item);
  const answer = parseExpressionAnswer(req.data ?? {});
  const submit = req.data?.submit === true;
  if (submit && (!answer.translation || req.data?.publicationPermission !== true)) {
    throw new HttpsError('failed-precondition', 'Add a translation and confirm permission to publish.');
  }
  const db = getFirestore(), account = db.doc(`contributorAccounts/${uid}`);
  const ref = account.collection('works').doc(work).collection('items').doc(item);
  const submissionId = createHash('sha256').update(`${uid}/${work}/${item}`).digest('hex');
  const now = new Date().toISOString();
  return db.runTransaction(async tx => {
    const [member, row, campaign] = await Promise.all([tx.get(account), tx.get(ref),
      tx.get(db.doc(`campaigns/${COLLECTION_CAMPAIGN_ID}`))]);
    if (member.get('status') !== 'active' || !row.exists) throw new HttpsError('permission-denied', 'An active invitation is required.');
    if (row.get('submissionId')) {
      if (submit) return { revision: row.get('revision'), submissionId };
      throw new HttpsError('failed-precondition', 'Submitted expressions are locked for review.');
    }
    if (req.data?.revision !== row.get('revision')) throw new HttpsError('aborted', 'This draft changed on another device. Reload before editing.');
    const revision = row.get('revision') + 1;
    if (submit) {
      const input = parseCollectionContributionInput({ collectionKind: 'dictionary', lexicalKind: 'phrase',
        title: row.get('expression'), body: answer.translation, translations: [answer.translation, ...answer.alternatives],
        format: 'Expression', dialect: 'Kasem', source: 'Invited speaker — everyday expression',
        notes: answer.alternatives.length ? `Other ways of saying it in Kasem:\n${answer.alternatives.join('\n')}` : '',
        rightsConfirmed: true, publicationPermission: true, participantConsentConfirmed: true,
        usesThirdPartyMaterial: false }, uid);
      // Expressions are complete utterances: commas and slashes are not word-list delimiters.
      input.translations = [answer.translation, ...answer.alternatives];
      const submission = buildCollectionSubmissionDocument(submissionId, uid, input, now);
      const portal = { contributorId: uid, work, item };
      if (!campaign.exists) tx.set(campaign.ref, buildCollectionCampaignDocument(now));
      tx.create(db.doc(`submissions/${submissionId}`), { ...submission, contributorPortal: portal,
        alternativeExpressions: answer.alternatives, permissions: { ...(submission.permissions as object),
          aiTraining: req.data?.aiTraining === true, consentVersion: 'contributor-expression-v1' } });
      tx.create(db.doc(`collectionContributions/${submissionId}`), {
        ...buildCollectionContributionReceipt(submissionId, submissionId, uid, input),
        contributorPortal: portal, alternativeExpressions: answer.alternatives,
      });
    }
    tx.update(ref, { ...answer, revision, updatedAt: now,
      ...(submit ? { submissionId, status: 'submitted' } : {}) });
    return { revision, ...(submit ? { submissionId } : {}) };
  });
});

// Read current state in the transaction: delayed/repeated events cannot restore withdrawn data.
export const onContributorExpressionReviewed = onDocumentWritten(
  { document: 'submissions/{submissionId}', region: 'us-central1', retry: true }, async event => {
    const db = getFirestore(), submission = db.doc(`submissions/${event.params.submissionId}`);
    await db.runTransaction(async tx => {
      const snap = await tx.get(submission), data = snap.data();
      const portal = data?.contributorPortal;
      if (!portal) return;
      if (portal.contributorId !== data.authUid) return;
      const itemRef = db.doc(`contributorAccounts/${portal.contributorId}/works/${portal.work}/items/${portal.item}`);
      const item = await tx.get(itemRef);
      if (item.get('submissionId') !== snap.id) return;
      const dictionary = await tx.get(db.doc(`dictionaryEntries/collection_${snap.id}`));
      const verified = ['APPROVED', 'PUBLISHED'].includes(data.status);
      tx.update(itemRef, {
        status: verified ? 'verified' : String(data.status).toLowerCase(), feedback: data.moderation?.feedback ?? '',
        reviewedAt: data.moderation?.decidedAt ?? null,
      });
      const training = db.doc(`contributorTrainingPairs/${snap.id}`);
      if (verified && dictionary.get('isPublished') === true
        && data.permissions?.aiTraining === true && data.permissions?.publication === true) {
        tx.set(training, { id: snap.id, language: 'xsm', english: data.title, kasem: data.body,
          alternatives: data.alternativeExpressions ?? [], sourceSubmission: snap.id,
          contributorId: data.authUid, consentVersion: data.permissions.consentVersion,
          reviewedAt: data.moderation?.decidedAt ?? null, kind: 'expression' });
      } else tx.delete(training);
    });
  });
