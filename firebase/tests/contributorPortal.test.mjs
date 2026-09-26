import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { createHash } from 'node:crypto';
import { HttpsError } from 'firebase-functions/v2/https';
import { requireAuth, requireRole } from '../../services/functions/lib/auth.js';
import { normalizeMsisdn } from '../../services/functions/lib/sms.js';
import { COLLECTION_CAMPAIGN_ID, buildCollectionCampaignDocument, buildCollectionContributionReceipt,
  buildCollectionSubmissionDocument, parseCollectionContributionInput } from '../../services/functions/lib/collection-contributions.js';

async function harness({ smsOk = true, configured = true } = {}) {
  const records = new Map();
  const authUsers = new Map();
  const messages = [];
  let generated = 0;
  const update = (path, data) => {
    const next = { ...records.get(path) };
    for (const [key, value] of Object.entries(data)) {
      const parts = key.split('.'); let target = next;
      for (const part of parts.slice(0, -1)) target = target[part] = { ...target[part] };
      target[parts.at(-1)] = value;
    }
    records.set(path, next);
  };
  const reference = path => ({ get: async () => ({ exists: records.has(path), updateTime: 'version', get: key => key.split('.').reduce((o,k) => o?.[k], records.get(path)) }), update: async data => update(path, data), path, id: path.split('/').at(-1), collection: name => ({ doc: (id = `work-${++generated}`) => reference(`${path}/${name}/${id}`) }) });
  const query = (name, field, value) => ({ query: true, limit: () => query(name, field, value), get: async () => ({ docs: [...records.entries()].filter(([path, data]) => path.startsWith(`${name}/`) && path.split('/').length === 2 && data[field] === value).map(([path, data]) => ({ id: path.split('/').at(-1), data: () => data, get: key => data[key] })) }) });
  const db = { collection: name => ({ doc: (id = `work-${++generated}`) => reference(`${name}/${id}`), where: (field, _operator, value) => query(name, field, value) }), batch: () => { const writes = []; return {
    set: (ref, data, options) => writes.push(() => records.set(ref.path, { ...(options?.merge ? records.get(ref.path) : {}), ...data })),
    create: (ref, data) => { assert.ok(!records.has(ref.path)); writes.push(() => records.set(ref.path, data)); },
    update: (ref, data) => writes.push(() => update(ref.path, data)),
    commit: async () => writes.forEach(fn => fn()) }; }, doc: reference, runTransaction: async fn => {
    const writes = [];
    const result = await fn({ get: async ref => ref.query ? ref.get() : ({ exists: records.has(ref.path), id: ref.id, ref,
      data: () => records.get(ref.path), get: key => key.split('.').reduce((o,k) => o?.[k], records.get(ref.path)) }),
      set: (ref, data) => writes.push(() => records.set(ref.path, data)),
      create: (ref, data) => { assert.ok(!records.has(ref.path)); writes.push(() => records.set(ref.path, data)); },
      update: (ref, data) => writes.push(() => { assert.ok(records.has(ref.path)); records.set(ref.path, { ...records.get(ref.path), ...data }); }),
      delete: ref => writes.push(() => records.delete(ref.path)),
    });
    writes.forEach(fn => fn()); return result;
  } };
  const path = new URL('../../services/functions/lib/contributor-portal.js', import.meta.url);
  const code = readFileSync(path, 'utf8');
  const executable = code.replace(/^import[\s\S]*?;\n/gm, '').replace(/\bexport (?=(?:async )?function|const)/g, '');
  const api = runInNewContext(executable + '\n;({saveExpressionAnswer,onContributorExpressionReviewed,parseExpressionAnswer,assignContributorExpressions,assignmentInstructions,inviteExpressionContributor,activateExpressionContributor,resendContributorInvitation,contributorPhone,reportContributorIssue,updateContributorIssue,requestContributorPayment,decideContributorPaymentRequest})', {
    process, URL, createHash, HttpsError, requireAuth, requireRole, getFirestore: () => db,
    ARKESEL_API_KEY: 'test-secret', normalizeMsisdn, isSmsConfigured: () => configured,
    sendSmsToMsisdn: async (to, message) => { messages.push({ to, message }); return { ok: smsOk, ...(smsOk ? { id: 'sms-1' } : { error: 'network' }) }; },
    getAuth: () => ({
      getUser: async uid => { const user = [...authUsers.values()].find(user => user.uid === uid); if (!user) throw { code: 'auth/user-not-found' }; return user; },
      setCustomUserClaims: async (uid, claims) => { [...authUsers.values()].find(user => user.uid === uid).customClaims = claims; },
      getUserByEmail: async email => { if (!authUsers.has(email)) throw { code: 'auth/user-not-found' }; return authUsers.get(email); },
      createUser: async data => { const user = { uid: 'new-user', ...data }; authUsers.set(data.email, user); return user; },
      generatePasswordResetLink: async () => 'https://example.com/?oobCode=code',
      updateUser: async (uid, data) => { const user = [...authUsers.values()].find(user => user.uid === uid); Object.assign(user, data); return user; } }),
    onCall: (_options, fn) => fn, onDocumentWritten: (_options, fn) => fn, consumeRateLimit: async () => {},
    COLLECTION_CAMPAIGN_ID, buildCollectionCampaignDocument, buildCollectionContributionReceipt,
    buildCollectionSubmissionDocument, parseCollectionContributionInput,
  });
  records.set('contributorAccounts/alice', { status: 'active' });
  const itemPath = 'contributorAccounts/alice/works/work/items/item';
  records.set(itemPath, { expression: 'How are you?', revision: 0, status: 'draft' });
  const request = (data = {}, uid = 'alice') => ({ auth: { uid }, data: { work: 'work', item: 'item', revision: 0,
    translation: 'Kasem expression', alternatives: ['Another expression'], ...data } });
  return { ...api, records, authUsers, request, itemPath, messages };
}

test('invitation ownership and active access are checked on draft writes', async () => {
  const h = await harness();
  await assert.rejects(h.saveExpressionAnswer(h.request({}, 'bob')), { code: 'permission-denied' });
  h.records.set('contributorAccounts/alice', { status: 'revoked' });
  await assert.rejects(h.saveExpressionAnswer(h.request()), { code: 'permission-denied' });
});
test('draft autosave persists alternatives and rejects stale revisions', async () => {
  const h = await harness();
  await h.saveExpressionAnswer(h.request());
  assert.equal(h.records.get(h.itemPath).revision, 1);
  await assert.rejects(h.saveExpressionAnswer(h.request()), { code: 'aborted' });
  assert.equal(h.records.get(h.itemPath).translation, 'Kasem expression');
  assert.equal([...h.records.keys()].some(k => k.startsWith('submissions/')), false);
});
test('submission is idempotent and uses the shared Contributions pipeline with Kasem alternatives', async () => {
  const h = await harness();
  const req = h.request({ submit: true, publicationPermission: true });
  const result = await h.saveExpressionAnswer(req);
  assert.equal((await h.saveExpressionAnswer(req)).submissionId, result.submissionId);
  const submission = h.records.get(`submissions/${result.submissionId}`);
  assert.equal(submission.status, 'SUBMITTED');
  assert.equal(submission.lexicalKind, 'phrase');
  assert.equal(submission.title, 'How are you?');
  assert.deepEqual(Array.from(submission.translations), ['Kasem expression', 'Another expression']);
  assert.equal(submission.permissions.aiTraining, false);
  assert.equal(submission.collectionContribution.id, result.submissionId);
  assert.ok(h.records.has(`collectionContributions/${result.submissionId}`));
  await assert.rejects(h.saveExpressionAnswer(h.request({ revision: 1 })), { code: 'failed-precondition' });
});
test('publication consent and nonempty translation are mandatory only when submitting', async () => {
  const h = await harness();
  await assert.rejects(h.saveExpressionAnswer(h.request({ submit: true })), { code: 'failed-precondition' });
  await assert.rejects(h.saveExpressionAnswer(h.request({ submit: true, publicationPermission: true, translation: '' })), { code: 'failed-precondition' });
  await h.saveExpressionAnswer(h.request({ translation: '' }));
});
test('recorded contributor permissions gate editing and submission', async () => {
  const h = await harness();
  h.records.set('contributors/alice', { permissions: { edit: false, submit: true } });
  await assert.rejects(h.saveExpressionAnswer(h.request()), { code: 'permission-denied' });
  h.records.set('contributors/alice', { permissions: { edit: true, submit: false } });
  await h.saveExpressionAnswer(h.request());
  await assert.rejects(h.saveExpressionAnswer(h.request({ revision: 1, submit: true, publicationPermission: true })), { code: 'permission-denied' });
});
test('training projection follows current reviewed state, consent and withdrawal, including repeated events', async () => {
  const h = await harness();
  const { submissionId } = await h.saveExpressionAnswer(h.request({ submit: true, publicationPermission: true, aiTraining: true }));
  const key = `submissions/${submissionId}`, training = `contributorTrainingPairs/${submissionId}`;
  const event = { params: { submissionId } };
  await h.onContributorExpressionReviewed(event);
  assert.equal(h.records.has(training), false);
  h.records.set(key, { ...h.records.get(key), status: 'APPROVED' });
  h.records.set(`dictionaryEntries/collection_${submissionId}`, { isPublished: true });
  await h.onContributorExpressionReviewed(event);
  await h.onContributorExpressionReviewed(event);
  assert.equal(h.records.get(training).english, 'How are you?');
  assert.equal(h.records.get(h.itemPath).status, 'verified');
  h.records.set(key, { ...h.records.get(key), status: 'WITHDRAWN' });
  await h.onContributorExpressionReviewed(event);
  assert.equal(h.records.has(training), false);
  assert.equal(h.records.get(h.itemPath).status, 'withdrawn');
});
test('approval without training consent never creates training data', async () => {
  const h = await harness();
  const { submissionId } = await h.saveExpressionAnswer(h.request({ submit: true, publicationPermission: true }));
  const key = `submissions/${submissionId}`;
  h.records.set(key, { ...h.records.get(key), status: 'APPROVED' });
  await h.onContributorExpressionReviewed({ params: { submissionId } });
  assert.equal(h.records.has(`contributorTrainingPairs/${submissionId}`), false);
});
test('invalid identifiers and oversized alternatives are rejected before writes', async () => {
  const h = await harness();
  await assert.rejects(h.saveExpressionAnswer(h.request({ work: '../other' })), { code: 'invalid-argument' });
  await assert.rejects(h.saveExpressionAnswer(h.request({ alternatives: Array(13).fill('word') })), { code: 'invalid-argument' });
  assert.equal(h.records.get(h.itemPath).revision, 0);
});

test('publication preserves long whole expressions and punctuation instead of word splitting', async () => {
  const { submissionTranslations } = await import('../../services/functions/lib/publication.js');
  const expression = 'A complete expression, with a second clause / and another part '.repeat(4);
  assert.deepEqual(submissionTranslations({ contributorPortal: { work: 'w' }, translations: [expression] }, 'dictionary'), [expression]);
});

test('admins assign independent sets to stable contributor IDs without replacing old work', async () => {
  const h = await harness();
  h.records.set('contributorAccounts/bob', { status: 'active' });
  const assign = (contributorId, expressions) => h.assignContributorExpressions({ auth: { uid: 'admin', token: { role: 'admin' } }, data: { contributorId, expressions, title: 'Greetings' } });
  const alice = await assign('alice', ['Hello there']);
  const bob = await assign('bob', ['See you tomorrow']);
  const more = await assign('alice', ['Please come in']);
  assert.notEqual(alice.work, bob.work); assert.notEqual(alice.work, more.work);
  assert.ok(h.records.has(h.itemPath), 'previous drafts survive');
  assert.ok(h.records.has(`contributorAccounts/alice/works/${alice.work}`));
  assert.ok(!h.records.has(`contributorAccounts/bob/works/${alice.work}`));
  assert.equal(h.records.get('contributorAccounts/alice').defaultWork, more.work);
  assert.equal(more.contributorId, 'alice');
  await assert.rejects(h.saveExpressionAnswer(h.request({ work: bob.work }, 'alice')), { code: 'permission-denied' });
});
test('assignment endpoint rejects non-admins and uninvited recipients', async () => {
  const h = await harness();
  await assert.rejects(h.assignContributorExpressions({ auth: { uid: 'alice', token: { role: 'contributor' } }, data: { contributorId: 'alice', expressions: ['Hello'] } }), { code: 'permission-denied' });
  await assert.rejects(h.assignContributorExpressions({ auth: { uid: 'admin', token: { role: 'admin' } }, data: { contributorId: 'outsider', expressions: ['Hello'] } }), { code: 'failed-precondition' });
});
test('assignment retries reuse the same work and reject changed contents', async () => {
  const h = await harness();
  const data = { contributorId: 'alice', requestId: 'stable-request', expressions: ['Please.', 'Thank you.'], title: 'Courtesy and community' };
  const call = input => h.assignContributorExpressions({ auth: { uid: 'admin', token: { role: 'admin' } }, data: input });
  const first = await call(data);
  const retry = await call(data);
  assert.equal(first.work, retry.work);
  assert.equal(first.created, true);
  assert.equal(retry.created, false);
  assert.equal([...h.records.keys()].filter(path => path.startsWith('contributorAccounts/alice/works/') && path.split('/').length === 4).length, 1);
  assert.equal([...h.records.keys()].filter(path => path.startsWith('auditLogs/')).length, 1);
  await assert.rejects(call({ ...data, expressions: ['Different'] }), { code: 'already-exists' });
});

test('returned expressions save revisions and resubmit as a linked review round', async () => {
  const h = await harness();
  const first = await h.saveExpressionAnswer(h.request({ submit: true, publicationPermission: true }));
  const firstPath = `submissions/${first.submissionId}`;
  h.records.set(firstPath, { ...h.records.get(firstPath), status: 'REJECTED', moderation: { feedback: 'Use a welcoming tone', decidedAt: '2026-09-16' } });
  await h.onContributorExpressionReviewed({ params: first });
  await h.saveExpressionAnswer(h.request({ revision: 1, translation: 'Revised wording' }));
  assert.equal(h.records.get(h.itemPath).feedback, 'Use a welcoming tone');
  await assert.rejects(h.saveExpressionAnswer(h.request({ revision: 1, submit: true, publicationPermission: true })), { code: 'aborted' });
  const request = h.request({ revision: 2, translation: 'Revised wording', submit: true, publicationPermission: true });
  h.records.set(`contributorTrainingPairs/${first.submissionId}`, { stale: true });
  const next = await h.saveExpressionAnswer(request);
  assert.equal(h.records.has(`contributorTrainingPairs/${first.submissionId}`), false);
  assert.notEqual(next.submissionId, first.submissionId);
  assert.equal((await h.saveExpressionAnswer(request)).submissionId, next.submissionId);
  assert.equal(h.records.get(firstPath).status, 'REJECTED');
  assert.equal(h.records.get(`submissions/${next.submissionId}`).revisionOf, first.submissionId);
  assert.equal(h.records.get(`submissions/${next.submissionId}`).previousReview.feedback, 'Use a welcoming tone');
  assert.equal(h.records.get(`submissions/${next.submissionId}`).body, 'Revised wording');
  await h.onContributorExpressionReviewed({ params: first });
  assert.equal(h.records.get(h.itemPath).status, 'submitted', 'late events from the old review do not reopen the new round');
  assert.equal(h.records.get(h.itemPath).feedback, '');
  assert.equal(h.records.get('contributorAccounts/alice').rewardBalance, undefined);
  const nextPath = `submissions/${next.submissionId}`;
  h.records.set(nextPath, { ...h.records.get(nextPath), status: 'APPROVED', moderation: { decidedAt: new Date().toISOString() } });
  await h.onContributorExpressionReviewed({ params: { submissionId: next.submissionId } });
  await h.onContributorExpressionReviewed({ params: { submissionId: next.submissionId } });
  assert.equal(h.records.get('contributorAccounts/alice').rewardBalance, 10);
});

test('canonical approved state prevents editing even if the assignment still says rejected', async () => {
  const h = await harness();
  const first = await h.saveExpressionAnswer(h.request({ submit: true, publicationPermission: true }));
  h.records.set(h.itemPath, { ...h.records.get(h.itemPath), status: 'rejected' });
  const path = `submissions/${first.submissionId}`;
  h.records.set(path, { ...h.records.get(path), status: 'APPROVED' });
  await assert.rejects(h.saveExpressionAnswer(h.request({ revision: 1, translation: 'Late edit', submit: true, publicationPermission: true })), { code: 'failed-precondition' });
  await assert.rejects(h.saveExpressionAnswer(h.request({ revision: 1 })), { code: 'failed-precondition' });
});


test('skip flags an empty expression without review or training writes and can be resumed', async () => {
  const h = await harness();
  await h.saveExpressionAnswer(h.request({ skip: true, translation: '', alternatives: [] }));
  assert.equal(h.records.get(h.itemPath).unsure, true);
  assert.equal(h.records.get(h.itemPath).revision, 1);
  assert.equal([...h.records.keys()].some(k => /^(submissions|collectionContributions|contributorTrainingPairs)\//.test(k)), false);
  await assert.rejects(h.saveExpressionAnswer(h.request({ skip: true, submit: true })), { code: 'invalid-argument' });
  await assert.rejects(h.saveExpressionAnswer(h.request({ skip: true })), { code: 'aborted' });
  await h.saveExpressionAnswer(h.request({ revision: 1 }));
  assert.equal(h.records.get(h.itemPath).unsure, false);
});

test('pending review cannot be skipped and skipping a returned expression preserves feedback', async () => {
  const h = await harness();
  const result = await h.saveExpressionAnswer(h.request({ submit: true, publicationPermission: true }));
  await assert.rejects(h.saveExpressionAnswer(h.request({ revision: 1, skip: true })), { code: 'failed-precondition' });
  const key = 'submissions/' + result.submissionId;
  h.records.set(key, { ...h.records.get(key), status: 'REJECTED', moderation: { feedback: 'Clarify meaning' } });
  await h.onContributorExpressionReviewed({ params: result });
  await h.saveExpressionAnswer(h.request({ revision: 1, skip: true }));
  assert.equal(h.records.get(h.itemPath).feedback, 'Clarify meaning');
  assert.equal(h.records.get(h.itemPath).unsure, true);
  assert.equal(h.records.get(key).status, 'REJECTED');
});

test('assignment instructions are bounded and stored per assignment', async () => {
  const h = await harness();
  const guidance = { dialect: 'Navrongo Kasem', tone: 'Welcoming', deadline: '30 September 2026, 17:00 GMT', helpContact: 'Assignment coordinator: coordinator@example.com' };
  const result = await h.assignContributorExpressions({ auth: { uid: 'admin', token: { role: 'admin' } }, data: { contributorId: 'alice', expressions: ['Hello'], ...guidance } });
  const work = h.records.get('contributorAccounts/alice/works/' + result.work);
  for (const [key, value] of Object.entries(guidance)) assert.equal(work[key], value);
  assert.throws(() => h.assignmentInstructions({ tone: 'x'.repeat(501) }), { code: 'invalid-argument' });
});

test('new invitation uses phone as temporary password and activation is required before writing', async () => {
  const h = await harness();
  const invite = { auth: { uid: 'admin', token: { role: 'admin' } }, data: { requestId: 'invite-1', email: 'new@example.com', phoneNumber: '+233241234567', expressions: ['Hello'] } };
  await h.inviteExpressionContributor(invite);
  assert.equal(h.authUsers.get('new@example.com').password, '+233241234567');
  const account = h.records.get('contributorAccounts/new-user');
  assert.equal(account.requiresPasswordChange, true);
  h.records.set('contributorAccounts/alice', { status: 'active', requiresPasswordChange: true });
  await assert.rejects(h.saveExpressionAnswer(h.request()), { code: 'failed-precondition' });
  const activate = password => ({ auth: { uid: 'new-user', token: { firebase: { sign_in_provider: 'password' } } }, data: { password } });
  await assert.rejects(h.activateExpressionContributor(activate('+233241234567')), { code: 'invalid-argument' });
  await assert.rejects(h.activateExpressionContributor(activate('short')), { code: 'invalid-argument' });
  await assert.rejects(h.activateExpressionContributor({ ...activate('my-new-password'), auth: { uid: 'new-user', token: { firebase: { sign_in_provider: 'google.com' } } } }), { code: 'permission-denied' });
  await h.activateExpressionContributor(activate('my-new-password'));
  assert.equal(h.authUsers.get('new@example.com').password, 'my-new-password');
  assert.equal(h.records.get('contributorAccounts/new-user').requiresPasswordChange, false);
  await h.inviteExpressionContributor(invite);
  assert.equal(h.authUsers.get('new@example.com').password, 'my-new-password');
  assert.equal(h.records.get('contributorAccounts/new-user').requiresPasswordChange, false);
  assert.equal(h.messages.length, 1, 'Retry does not send a second SMS');
  await assert.rejects(h.inviteExpressionContributor({ ...invite, data: { ...invite.data, phoneNumber: 'invalid' } }), { code: 'invalid-argument' });
});


test('retry after Auth creation still requires activation when the account document is missing', async () => {
  const h = await harness();
  h.authUsers.set('retry@example.com', { uid: 'retry-user', email: 'retry@example.com', password: '+233241234567' });
  await h.inviteExpressionContributor({ auth: { uid: 'admin', token: { role: 'admin' } }, data: { requestId: 'retry-1', email: 'retry@example.com', phoneNumber: '+233241234567', expressions: ['Hello'] } });
  assert.equal(h.records.get('contributorAccounts/retry-user').requiresPasswordChange, true);
});

const invitationRequest = (data = {}) => ({ auth: { uid: 'admin', token: { role: 'admin' } },
  data: { requestId: 'cohort-invite', contributorId: 'profile-1', email: 'speaker@example.com', phoneNumber: '0241234567', expressions: ['Hello'], ...data } });

test('SMS invitation preserves imported profile identity and private notes, and enables contributing', async () => {
  const h = await harness();
  h.records.set('contributors/profile-1', { public: { displayName: 'Speaker' }, private: { notes: 'Registration answers' }, permissions: { edit: false, submit: false, review: false, publish: false } });
  const result = await h.inviteExpressionContributor(invitationRequest());
  assert.equal(result.contributorId, 'profile-1');
  assert.equal(result.sms.status, 'accepted');
  assert.equal(h.messages[0].to, '233241234567');
  assert.match(h.messages[0].message, /speaker@example.com/);
  assert.match(h.messages[0].message, /Temporary password: your phone number \+233241234567/);
  assert.ok(h.messages[0].message.includes(result.portalUrl));
  assert.equal(h.records.get('contributors/profile-1').private.notes, 'Registration answers');
  assert.equal(h.records.get('contributors/profile-1').permissions.submit, true);
  assert.equal(h.records.get('contributors/profile-1').permissions.edit, true);
  const again = await h.inviteExpressionContributor(invitationRequest());
  assert.equal(again.work, result.work);
  assert.equal(h.messages.length, 1);
  await assert.rejects(h.inviteExpressionContributor(invitationRequest({ requestId: 'different' })), { code: 'already-exists' });
});

test('existing accounts retain passwords and receive the correct SMS instructions', async () => {
  const h = await harness();
  h.authUsers.set('speaker@example.com', { uid: 'profile-1', email: 'speaker@example.com', password: 'existing-secret', customClaims: { role: 'admin' } });
  const result = await h.inviteExpressionContributor(invitationRequest());
  assert.equal(result.loginMethod, 'existing');
  assert.equal(h.authUsers.get('speaker@example.com').password, 'existing-secret');
  assert.equal(h.authUsers.get('speaker@example.com').customClaims.role, 'admin');
  assert.match(h.messages[0].message, /existing password/);
  assert.doesNotMatch(h.messages[0].message, /Temporary password/);
});

test('SMS failure preserves the assignment and resend neither resets credentials nor duplicates work', async () => {
  const h = await harness({ smsOk: false });
  const result = await h.inviteExpressionContributor(invitationRequest());
  assert.equal(result.sms.status, 'failed');
  assert.equal(h.records.get('contributorAccounts/profile-1').invitation.sms.status, 'failed');
  const before = [...h.records.keys()].filter(k => k.includes('/works/')).length;
  const resend = await h.resendContributorInvitation({ auth: { uid: 'admin', token: { role: 'admin' } }, data: { contributorId: 'profile-1' } });
  assert.equal(resend.sms.status, 'failed');
  assert.equal(h.messages.length, 2);
  assert.equal([...h.records.keys()].filter(k => k.includes('/works/')).length, before);
  assert.equal(h.authUsers.get('speaker@example.com').password, '+233241234567');
  h.records.get('contributorAccounts/profile-1').status = 'suspended';
  await assert.rejects(h.resendContributorInvitation({ auth: { uid: 'admin', token: { role: 'admin' } }, data: { contributorId: 'profile-1' } }), { code: 'failed-precondition' });
  assert.equal(h.messages.length, 2);
});

test('missing SMS configuration, invalid phones and non-admin calls cannot create an invitation', async () => {
  const h = await harness({ configured: false });
  await assert.rejects(h.inviteExpressionContributor(invitationRequest()), { code: 'failed-precondition' });
  assert.equal(h.authUsers.size, 0);
  assert.equal(h.messages.length, 0);
  assert.equal(h.contributorPhone('024 123 4567'), '+233241234567');
  assert.equal(h.contributorPhone('+22670123456'), '+22670123456');
  assert.throws(() => h.contributorPhone('not-a-number'), { code: 'invalid-argument' });
  await assert.rejects(h.inviteExpressionContributor({ ...invitationRequest(), auth: { uid: 'alice', token: {} } }), { code: 'permission-denied' });
});

test('re-inviting a cancelled account to a changed contact number keeps the original temporary password', async () => {
  const h = await harness();
  await h.inviteExpressionContributor(invitationRequest());
  const account = h.records.get('contributorAccounts/profile-1');
  account.status = 'deactivated';
  account.invitation.status = 'cancelled';
  h.authUsers.get('speaker@example.com').disabled = true;
  const result = await h.inviteExpressionContributor(invitationRequest({ requestId: 'second-invite', phoneNumber: '0201234567' }));
  assert.equal(result.sms.to, '+233201234567');
  assert.equal(h.authUsers.get('speaker@example.com').password, '+233241234567');
  assert.equal(h.records.get('contributorAccounts/profile-1').phoneNumber, '+233241234567');
  assert.equal(h.records.get('contributors/profile-1').private.phone, '+233201234567');
  assert.match(h.messages[1].message, /Temporary password: your phone number \+233241234567/);
});

test('issue reports validate assignment ownership, omit private fields and deduplicate retries', async () => {
  const api = await harness(); const { records } = api;
  records.set('contributorAccounts/alice', { status: 'active' });
  records.set('contributorAccounts/alice/works/work', { title: 'Sample' });
  records.set('contributorAccounts/alice/works/work/items/item', {});
  const req = { auth: { uid: 'alice', token: {} }, data: { requestId: 'retry-1', work: 'work', item: 'item', category: 'saving', description: 'Cannot save', accountNumber: 'PRIVATE', translation: 'UNSAVED' } };
  const first = await api.reportContributorIssue(req);
  assert.equal((await api.reportContributorIssue(req)).id, first.id);
  const saved = records.get(`contributorIssues/${first.id}`);
  assert.equal(saved.contributorId, 'alice'); assert.equal(saved.status, 'open');
  assert.equal(saved.accountNumber, undefined); assert.equal(saved.translation, undefined);
  await assert.rejects(api.reportContributorIssue({ ...req, data: { ...req.data, work: 'someone-elses-work' } }), /unavailable/);
  await assert.rejects(api.updateContributorIssue({ ...req, data: { id: first.id, status: 'resolved', reply: 'done' } }), /admin access/);
  await api.updateContributorIssue({ auth: { uid: 'admin', token: { role: 'admin' } }, data: { id: first.id, status: 'in_progress', reply: 'We are checking.' } });
  assert.equal(records.get(`contributorIssues/${first.id}`).replies[0].text, 'We are checking.');
  assert.equal(records.get(`contributorIssues/${first.id}`).status, 'in_progress');
});

test('approved expressions award ten points up to the daily cap; submissions and repeated reviews do not award twice', async () => {
  const h = await harness();
  for (let index = 0; index < 31; index++) {
    const path = `contributorAccounts/alice/works/work/items/item-${index}`;
    h.records.set(path, { expression: `Expression ${index}`, revision: 0, status: 'draft' });
    const request = h.request({ item: `item-${index}`, submit: true, publicationPermission: true });
    const result = await h.saveExpressionAnswer(request);
    assert.equal(h.records.get('contributorAccounts/alice').rewardBalance, index ? Math.min(index * 10, 300) : undefined);
    if (index === 0) await h.saveExpressionAnswer(request);
    const submissionPath = `submissions/${result.submissionId}`;
    h.records.set(submissionPath, { ...h.records.get(submissionPath), status: 'APPROVED', moderation: { decidedAt: new Date().toISOString() } });
    await h.onContributorExpressionReviewed({ params: { submissionId: result.submissionId } });
    if (index === 0) await h.onContributorExpressionReviewed({ params: { submissionId: result.submissionId } });
  }
  const account = h.records.get('contributorAccounts/alice');
  assert.equal(account.rewardBalance, 300);
  assert.equal(account.rewardLifetime, 300);
  const day = new Date().toISOString().slice(0, 10);
  assert.equal(h.records.get(`contributorAccounts/alice/rewardDays/${day}`).points, 300);
  const firstId = createHash('sha256').update('alice/work/item-0').digest('hex');
  const cappedId = createHash('sha256').update('alice/work/item-30').digest('hex');
  assert.equal(h.records.get(`contributorAccounts/alice/rewardCredits/${firstId}`).points, 10);
  assert.equal(h.records.get(`contributorAccounts/alice/rewardCredits/${cappedId}`).points, 0);
});

test('airtime and data redemption reserves points, validates destination, and refunds rejected requests', async () => {
  const h = await harness();
  h.records.set('contributorAccounts/alice', { status: 'active', rewardBalance: 600, rewardLifetime: 600 });
  const request = choice => ({ auth: { uid: 'alice' }, data: { points: 300, kind: 'airtime', network: 'MTN', phoneNumber: '0241234567', ...choice } });
  await assert.rejects(h.requestContributorPayment(request({ kind: 'cash' })), { code: 'invalid-argument' });
  await assert.rejects(h.requestContributorPayment(request({ phoneNumber: 'not a number' })), { code: 'invalid-argument' });
  const first = await h.requestContributorPayment(request());
  const saved = h.records.get(`contributorPaymentRequests/${first.requestId}`);
  assert.equal(saved.amountMinor, 500);
  assert.equal(saved.kind, 'airtime');
  assert.equal(saved.phoneNumber, '+233241234567');
  assert.equal(saved.bankSnapshot, undefined);
  assert.equal(h.records.get('contributorAccounts/alice').rewardBalance, 300);
  await assert.rejects(h.requestContributorPayment(request({ kind: 'data' })), { code: 'failed-precondition' });
  const admin = (action, reference = '') => ({ auth: { uid: 'admin', token: { role: 'admin' } }, data: { requestId: first.requestId, action, paymentReference: reference } });
  await h.decideContributorPaymentRequest(admin('reject'));
  assert.equal(h.records.get('contributorAccounts/alice').rewardBalance, 600);
  const second = await h.requestContributorPayment(request({ kind: 'data', network: 'Telecel' }));
  const decide = (action, reference = '') => ({ auth: { uid: 'admin', token: { role: 'admin' } }, data: { requestId: second.requestId, action, paymentReference: reference } });
  await h.decideContributorPaymentRequest(decide('approve'));
  await h.decideContributorPaymentRequest(decide('fulfill', 'DELIVERY-123'));
  assert.equal(h.records.get(`contributorPaymentRequests/${second.requestId}`).status, 'fulfilled');
  assert.equal(h.records.get('contributorAccounts/alice').rewardBalance, 300);
  const third = await h.requestContributorPayment(request({ kind: 'data', network: 'AT' }));
  const adminThird = action => ({ auth: { uid: 'admin', token: { role: 'admin' } }, data: { requestId: third.requestId, action } });
  await h.decideContributorPaymentRequest(adminThird('approve'));
  await h.decideContributorPaymentRequest(adminThird('reject'));
  assert.equal(h.records.get('contributorAccounts/alice').rewardBalance, 300);
});

test('contributors may redeem any whole-point amount from the minimum through their balance', async () => {
  const h = await harness();
  h.records.set('contributorAccounts/alice', { status: 'active', rewardBalance: 350, rewardLifetime: 350 });
  const request = points => ({ auth: { uid: 'alice' }, data: { points, kind: 'data', network: 'MTN', phoneNumber: '0241234567' } });
  await assert.rejects(h.requestContributorPayment(request(299)), { code: 'failed-precondition' });
  await assert.rejects(h.requestContributorPayment(request(351)), { code: 'failed-precondition' });
  const result = await h.requestContributorPayment(request(350));
  assert.equal(h.records.get(`contributorPaymentRequests/${result.requestId}`).amountMinor, 583);
  assert.equal(h.records.get('contributorAccounts/alice').rewardBalance, 0);
});

test('expression streak advances once per UTC day and resets after a missed day', async () => {
  const h = await harness();
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const older = new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10);
  h.records.set('contributorAccounts/alice', { status: 'active', streakLastDay: yesterday, streakCount: 2, streakBest: 4 });
  const submit = async item => {
    h.records.set(`contributorAccounts/alice/works/work/items/${item}`, { expression: item, revision: 0, status: 'draft' });
    await h.saveExpressionAnswer(h.request({ item, submit: true, publicationPermission: true }));
  };
  await submit('streak-1');
  assert.equal(h.records.get('contributorAccounts/alice').streakCount, 3);
  assert.equal(h.records.get('contributorAccounts/alice').streakBest, 4);
  await submit('streak-2');
  assert.equal(h.records.get('contributorAccounts/alice').streakCount, 3);
  h.records.set('contributorAccounts/alice', { ...h.records.get('contributorAccounts/alice'), streakLastDay: older, streakCount: 5, streakBest: 5 });
  await submit('streak-3');
  assert.equal(h.records.get('contributorAccounts/alice').streakCount, 1);
  assert.equal(h.records.get('contributorAccounts/alice').streakBest, 5);
});
