// Integration tests for contributor points, assessments and redemptions,
// running the real handlers and real Firestore transactions against the
// Firestore emulator:
//
//   npm run test:contributor-rewards
//
// Kasem text in these fixtures is a bracketed placeholder on purpose: no
// Kasem is invented for tests.

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { after, before, beforeEach, test } from 'node:test';
import { deleteApp, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

process.env.GCLOUD_PROJECT ??= 'demo-indigen-world';
assert.ok(process.env.FIRESTORE_EMULATOR_HOST, 'Run under the Firestore emulator.');

let app, db, rewards, assessment, portal, expressions;

before(async () => {
  app = initializeApp({ projectId: process.env.GCLOUD_PROJECT });
  db = getFirestore();
  rewards = await import('../../services/functions/lib/contributor-rewards.js');
  assessment = await import('../../services/functions/lib/reward-assessment.js');
  portal = await import('../../services/functions/lib/contributor-portal.js');
  expressions = await import('../../services/functions/lib/expressions.js');
});
after(async () => { await deleteApp(app); });

async function clear() {
  const host = process.env.FIRESTORE_EMULATOR_HOST;
  await fetch(`http://${host}/emulator/v1/projects/${process.env.GCLOUD_PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
}
beforeEach(clear);

const FINANCE = { role: 'admin', finance: true };
const call = (fn, uid, data, token = {}) => fn.run({ auth: { uid, token: { uid, ...token } }, data, rawRequest: {} });
const code = (pattern) => (error) => { assert.match(String(error.code), pattern); return true; };

async function contributor(uid, balance = 0, lifetime = balance) {
  await db.doc(`contributorAccounts/${uid}`).set({ status: 'active', rewardBalance: balance, rewardLifetime: lifetime,
    trainingAgreement: { version: 'contributor-training-v2' } });
}
async function account(uid) { return (await db.doc(`contributorPointAccounts/${uid}`).get()).data(); }
async function entries(uid) {
  return (await db.collection('pointLedger').where('contributorId', '==', uid).get()).docs.map(d => d.data()).sort((a, b) => a.sequence - b.sequence);
}
async function quoteAndRedeem(uid, points, key = `key-${uid}-${points}`) {
  const quote = await call(rewards.quoteContributorRedemption, uid, { kind: 'airtime', network: 'MTN', points });
  return { quote, result: await call(rewards.redeemContributorPoints, uid, { quoteId: quote.quoteId, phoneNumber: '0241234567', idempotencyKey: key }) };
}

test('a redemption reserves the quoted points once, and a retry returns the same request', async () => {
  await contributor('alice', 1000, 1300);
  const { quote, result } = await quoteAndRedeem('alice', 900);
  assert.deepEqual([quote.baseMinor, quote.bonusMinor, quote.totalMinor], [1500, 50, 1550]);
  const replay = await call(rewards.redeemContributorPoints, 'alice', { quoteId: quote.quoteId, phoneNumber: '0241234567', idempotencyKey: 'key-alice-900' });
  assert.equal(replay.requestId, result.requestId);
  assert.equal(replay.replayed, true);
  const request = (await db.doc(`contributorRedemptions/${result.requestId}`).get()).data();
  assert.equal(request.amountMinor, 1550);
  assert.equal(request.settlementPath, 'ledger-v1');
  assert.equal(request.quote.policyVersion, 1);
  const state = await account('alice');
  assert.deepEqual([state.available, state.reserved, state.lifetimeEarned], [100, 900, 1300]);
  assert.deepEqual((await entries('alice')).map(e => e.type), ['opening_balance', 'reservation']);
  assert.equal((await db.doc('contributorAccounts/alice').get()).get('rewardBalance'), 1000, 'the legacy field is frozen, not rewritten');
});

test('simultaneous redemptions cannot overspend: exactly one wins', async () => {
  await contributor('bob', 1000);
  const quotes = await Promise.all([1, 2, 3].map(() => call(rewards.quoteContributorRedemption, 'bob', { kind: 'airtime', network: 'MTN', points: 600 })));
  const outcomes = await Promise.allSettled(quotes.map((q, i) =>
    call(rewards.redeemContributorPoints, 'bob', { quoteId: q.quoteId, phoneNumber: '0241234567', idempotencyKey: `race-${i}-bob` })));
  assert.equal(outcomes.filter(o => o.status === 'fulfilled').length, 1);
  for (const o of outcomes.filter(o => o.status === 'rejected')) assert.match(String(o.reason.code), /failed-precondition|aborted/);
  const state = await account('bob');
  assert.deepEqual([state.available, state.reserved], [400, 600]);
  assert.equal((await entries('bob')).filter(e => e.type === 'reservation').length, 1);
});

test('forged and stale inputs are refused: balance, other owners, expiry, policy change, old clients', async () => {
  await contributor('carol', 400);
  await contributor('dan', 5000);
  await assert.rejects(call(rewards.quoteContributorRedemption, 'carol', { kind: 'airtime', network: 'MTN', points: 900 }), code(/failed-precondition/));
  await assert.rejects(call(rewards.quoteContributorRedemption, 'carol', { kind: 'airtime', network: 'MTN', points: 299 }), code(/invalid-argument/));
  await assert.rejects(call(rewards.quoteContributorRedemption, 'carol', { kind: 'cash', points: 300 }), code(/invalid-argument/));
  await assert.rejects(call(rewards.quoteContributorRedemption, 'carol', { kind: 'data', bundleId: 'made-up' }), code(/invalid-argument/));
  await assert.rejects(call(rewards.redeemContributorPoints, 'carol', { points: 300, kind: 'airtime', network: 'MTN', phoneNumber: '0241234567' }), code(/failed-precondition/));
  const quote = await call(rewards.quoteContributorRedemption, 'dan', { kind: 'airtime', network: 'MTN', points: 300 });
  await assert.rejects(call(rewards.redeemContributorPoints, 'carol', { quoteId: quote.quoteId, phoneNumber: '0241234567', idempotencyKey: 'stolen-quote' }), code(/not-found/));
  await db.doc(`redemptionQuotes/${quote.quoteId}`).update({ expiresAt: '2000-01-01T00:00:00.000Z' });
  await assert.rejects(call(rewards.redeemContributorPoints, 'dan', { quoteId: quote.quoteId, phoneNumber: '0241234567', idempotencyKey: 'expired-quote' }), code(/aborted/));
  // Finance changes the rates between the quote and the confirmation.
  const fresh = await call(rewards.quoteContributorRedemption, 'dan', { kind: 'airtime', network: 'MTN', points: 900 });
  const current = await call(rewards.getRewardPolicies, 'fin', {}, FINANCE);
  const config = { ...current.redemption.config, bands: [{ upToPoints: 300, bonusBps: 0 }, { upToPoints: null, bonusBps: 400 }] };
  await call(rewards.saveRewardPolicy, 'fin', { kind: 'redemption', config, reason: 'Calibration test change', expectedActiveId: current.redemption.id }, FINANCE);
  await assert.rejects(call(rewards.redeemContributorPoints, 'dan', { quoteId: fresh.quoteId, phoneNumber: '0241234567', idempotencyKey: 'old-policy' }), code(/aborted/));
  const requote = await call(rewards.quoteContributorRedemption, 'dan', { kind: 'airtime', network: 'MTN', points: 900 });
  assert.equal(requote.policyVersion, 2);
  assert.equal(requote.totalMinor, 1540);
  // Contributors cannot touch policy, flags or ledgers.
  await assert.rejects(call(rewards.saveRewardPolicy, 'dan', { kind: 'redemption', config, reason: 'I would like more', expectedActiveId: 'x' }, { role: 'contributor' }), code(/permission-denied/));
  await assert.rejects(call(rewards.adjustContributorPoints, 'dan', { contributorId: 'dan', points: 5000, reason: 'Give myself points', idempotencyKey: 'self-grant' }, { role: 'admin' }), code(/permission-denied/));
  await assert.rejects(call(rewards.decideContributorRedemption, 'adm', { requestId: 'x', action: 'approve' }, { role: 'admin' }), code(/permission-denied/));
});

test('Finance lifecycle: ambiguous holds the points, delivery settles once, failure releases once', async () => {
  await contributor('erin', 2000);
  const first = (await quoteAndRedeem('erin', 900, 'erin-first')).result;
  const decide = (data) => call(rewards.decideContributorRedemption, 'fin', { requestId: first.requestId, ...data }, FINANCE);
  await decide({ action: 'approve', expectedStatus: 'submitted' });
  await assert.rejects(decide({ action: 'fail', note: 'unclear', definitive: false }), code(/invalid-argument/));
  await decide({ action: 'mark_ambiguous', note: 'Provider timed out with no receipt yet' });
  assert.deepEqual([(await account('erin')).available, (await account('erin')).reserved], [1100, 900]);
  await assert.rejects(decide({ action: 'reject', note: 'refund it' }), code(/failed-precondition/));
  await decide({ action: 'fulfill', paymentReference: 'TOPUP-REF-1' });
  const replay = await decide({ action: 'fulfill', paymentReference: 'TOPUP-REF-1' });
  assert.equal(replay.replayed, true);
  await assert.rejects(decide({ action: 'fail', note: 'Late failure notice', definitive: true }), code(/failed-precondition/));
  let state = await account('erin');
  assert.deepEqual([state.available, state.reserved, state.lifetimeRedeemed], [1100, 0, 900]);
  const second = (await quoteAndRedeem('erin', 300, 'erin-second')).result;
  await call(rewards.decideContributorRedemption, 'fin', { requestId: second.requestId, action: 'approve' }, FINANCE);
  await call(rewards.decideContributorRedemption, 'fin', { requestId: second.requestId, action: 'fail', note: 'Number rejected by the network', definitive: true }, FINANCE);
  state = await account('erin');
  assert.deepEqual([state.available, state.reserved], [1100, 0]);
  const types = (await entries('erin')).map(e => e.type);
  assert.deepEqual(types, ['opening_balance', 'reservation', 'settlement', 'reservation', 'release']);
});

test('a contributor can cancel a pending request exactly once', async () => {
  await contributor('fay', 600);
  const { result } = await quoteAndRedeem('fay', 300, 'fay-cancel');
  await call(rewards.cancelContributorRedemption, 'fay', { requestId: result.requestId });
  await assert.rejects(call(rewards.cancelContributorRedemption, 'fay', { requestId: result.requestId }), code(/failed-precondition/));
  await assert.rejects(call(rewards.cancelContributorRedemption, 'gus', { requestId: result.requestId }), code(/not-found/));
  assert.equal((await account('fay')).available, 600);
  assert.equal((await entries('fay')).filter(e => e.type === 'release').length, 1);
});

test('legacy requests keep their agreed value and settle through legacy entries', async () => {
  await contributor('hal', 0, 300); // 300 already deducted by a legacy request
  await db.doc('contributorRedemptions/legacy-1').set({ id: 'legacy-1', contributorId: 'hal', kind: 'airtime', network: 'MTN', phoneNumber: '+233241234567',
    points: 300, amountMinor: 500, currency: 'GHS', status: 'submitted', createdAt: '2026-10-01T00:00:00.000Z' });
  await call(rewards.decideContributorRedemption, 'fin', { requestId: 'legacy-1', action: 'reject', note: 'Duplicate number' }, FINANCE);
  const state = await account('hal');
  assert.equal(state.available, 300);
  assert.deepEqual((await entries('hal')).map(e => e.type), ['opening_balance', 'legacy_refund']);
});

test('reasoned adjustments are idempotent and cannot overdraw', async () => {
  await contributor('ivy', 100);
  const body = { contributorId: 'ivy', points: 50, reason: 'Correction for a missed award', idempotencyKey: 'adj-ivy-1' };
  await call(rewards.adjustContributorPoints, 'fin', body, FINANCE);
  const again = await call(rewards.adjustContributorPoints, 'fin', body, FINANCE);
  assert.equal(again.replayed, true);
  assert.equal((await account('ivy')).available, 150);
  await assert.rejects(call(rewards.adjustContributorPoints, 'fin', { ...body, points: -500, idempotencyKey: 'adj-ivy-2' }, FINANCE), code(/failed-precondition/));
  const audit = await db.collection('auditLogs').where('domain', '==', 'contributor-rewards').get();
  assert.ok(audit.docs.some(d => d.get('action') === 'contributor.reward.ledger.adjust'));
});

/* ── Assessments ──────────────────────────────────────────────────────────── */

async function portalSubmission(uid, item, { aiTraining = true, revisionOf = null, status = 'SUBMITTED' } = {}) {
  const id = revisionOf
    ? createHash('sha256').update(`${uid}/work/${item}/revision/2`).digest('hex')
    : createHash('sha256').update(`${uid}/work/${item}`).digest('hex');
  const doc = expressions.buildExpressionSubmissionDocument(id, uid, {
    expression: { phrase: `[Kasem placeholder ${item}]`, alternatives: [], meaning: `English prompt ${item}`, literalTranslation: '', context: 'Greeting a neighbour',
      kind: 'phrase', dialect: 'Kasem', source: { type: 'invited-speaker', detail: 'Invited speaker', speakerName: '' } },
    publicationPermission: true, aiTraining, revisionOf,
  }, new Date().toISOString(), 'contributor-training-v2');
  await db.doc(`submissions/${id}`).set({ ...doc, status, contributorPortal: { contributorId: uid, work: 'work', item }, ...(revisionOf ? { revisionOf } : {}) });
  await db.doc(`contributorAccounts/${uid}/works/work/items/${item}`).set({ submissionId: id, revision: 1, status: 'submitted' }, { merge: true });
  await assessment.onSubmissionForReward.run({ params: { submissionId: id } });
  return id;
}
const VALIDATOR = { role: 'validator' };
const decideAssessment = async (uid, id, data) => {
  const current = (await db.doc(`contributionAssessments/${id}`).get()).data();
  return call(assessment.decideRewardAssessment, uid, { assessmentId: id, expectedRevision: current.revision, ...data }, VALIDATOR);
};
async function setMode(awardMode, assessmentWorker = 'off') {
  await call(rewards.setRewardSystemFlags, 'fin', { flags: { awardMode, assessmentWorker }, reason: 'Integration test switch' }, FINANCE);
}

test('assessed awards: validator confirmation settles once; repeats and self-review are refused', async () => {
  await contributor('jo', 0);
  await setMode('assessed');
  const id = await portalSubmission('jo', 'one');
  const opened = (await db.doc(`contributionAssessments/${id}`).get()).data();
  assert.equal(opened.status, 'validator_review');
  assert.equal(opened.automated.status, 'not-run');
  assert.equal((await account('jo')), undefined, 'pending work never touches the balance');
  await assert.rejects(decideAssessment('jo', id, { decision: 'confirm', scores: { accuracy: 90, completeness: 90, technical: 90, metadata: 90 } }), code(/permission-denied/));
  const result = await decideAssessment('val', id, { decision: 'confirm', scores: { accuracy: 80, completeness: 80, technical: 80, metadata: 80 } });
  assert.equal(result.points, 25);
  assert.equal(result.calculation, '20 category points × 1.25 strong-quality multiplier = 25 points');
  assert.equal((await account('jo')).available, 25);
  // Re-confirming the same decision moves nothing.
  await decideAssessment('val', id, { decision: 'confirm', scores: { accuracy: 80, completeness: 80, technical: 80, metadata: 80 }, reason: 'Second look, same judgement' });
  assert.equal((await account('jo')).available, 25);
  // An authorised upgrade is a ledger adjustment, not a second award.
  await decideAssessment('val', id, { decision: 'confirm', scores: { accuracy: 95, completeness: 92, technical: 90, metadata: 90 }, reason: 'Context note confirms full accuracy' });
  const types = (await entries('jo')).map(e => [e.type, e.points]);
  assert.deepEqual(types, [['opening_balance', 0], ['award', 25], ['award_adjustment', 5]]);
  assert.equal((await db.doc(`contributorTrainingPairs/${id}`).get()).get('qualityBand'), 'exceptional');
  const view = await call(rewards.getContributorRewards, 'jo', {});
  assert.equal(view.balance.available, 30);
  assert.equal(view.awards[0].status, 'awarded');
});

test('below the lowest band, missing permission and duplicates are never auto-paid', async () => {
  await contributor('kim', 0);
  await setMode('assessed');
  const weak = await portalSubmission('kim', 'weak');
  await assert.rejects(decideAssessment('val', weak, { decision: 'confirm', scores: { accuracy: 50, completeness: 50, technical: 50, metadata: 50 } }), code(/failed-precondition/));
  await decideAssessment('val', weak, { decision: 'clarify', messageToContributor: 'When would you say this, and to whom?' });
  await call(assessment.respondToRewardAssessment, 'kim', { assessmentId: weak, kind: 'clarification', message: 'Said to an elder in the morning.' });
  assert.equal((await db.doc(`contributionAssessments/${weak}`).get()).get('status'), 'validator_review');
  const noConsent = await portalSubmission('kim', 'noconsent', { aiTraining: false });
  assert.equal((await db.doc(`contributionAssessments/${noConsent}`).get()).get('status'), 'ineligible');
  await assert.rejects(decideAssessment('val', noConsent, { decision: 'confirm', scores: { accuracy: 95, completeness: 95, technical: 95, metadata: 95 } }), code(/failed-precondition/));
  // A worker flagged an exact accepted duplicate: confirmation needs an explicit, reasoned variant decision.
  const dup = await portalSubmission('kim', 'dup');
  await db.doc(`contributionAssessments/${dup}`).update({ 'automated.status': 'completed', 'automated.result': { recommendedBand: 'standard', duplicates: [{ kind: 'exact', scope: 'accepted', ref: 'contributorTrainingPairs/x', similarity: 1 }], evaluator: { modelStatus: 'ok' } } });
  await assert.rejects(decideAssessment('val', dup, { decision: 'confirm', scores: { accuracy: 70, completeness: 70, technical: 70, metadata: 70 } }), code(/failed-precondition/));
  const ok = await decideAssessment('val', dup, { decision: 'confirm', duplicateResolution: 'distinct-variant', reason: 'Distinct context: said at a funeral', scores: { accuracy: 70, completeness: 70, technical: 70, metadata: 70 } });
  assert.equal(ok.points, 20);
  assert.equal((await account('kim')).available, 20);
});

test('a contribution paid under the flat rule is never paid again after the switch', async () => {
  await contributor('lee', 0);
  await setMode('legacy-flat');
  const id = await portalSubmission('lee', 'flat');
  // Publication approval under the flat rule pays 10 into the ledger.
  await db.doc(`submissions/${id}`).update({ status: 'APPROVED', moderation: { decidedAt: new Date().toISOString() } });
  await portal.onContributorExpressionReviewed.run({ params: { submissionId: id } });
  await portal.onContributorExpressionReviewed.run({ params: { submissionId: id } }); // redelivered event
  assert.equal((await account('lee')).available, 10);
  // A validator confirms the same contribution while flat awards are still on: recorded, not paid.
  const confirmed = await decideAssessment('val', id, { decision: 'confirm', scores: { accuracy: 90, completeness: 90, technical: 90, metadata: 90 } });
  assert.equal(confirmed.status, 'eligible');
  const switched = await call(rewards.setRewardSystemFlags, 'fin', { flags: { awardMode: 'assessed' }, reason: 'Switch to assessed awards' }, FINANCE);
  assert.equal(switched.settledOnSwitch.settled, 1);
  assert.equal((await account('lee')).available, 10, 'no second award');
  assert.match((await db.doc(`contributionAssessments/${id}`).get()).get('settlement.note'), /not paid again/);
  // And under assessed awards, approval for publication pays nothing.
  const other = await portalSubmission('lee', 'later');
  await db.doc(`submissions/${other}`).update({ status: 'APPROVED', moderation: { decidedAt: new Date().toISOString() } });
  await portal.onContributorExpressionReviewed.run({ params: { submissionId: other } });
  assert.equal((await account('lee')).available, 10);
});

test('an edit opens a new assessment revision and supersedes the old one', async () => {
  await contributor('max', 0);
  await setMode('assessed');
  const first = await portalSubmission('max', 'edit');
  const second = await portalSubmission('max', 'edit', { revisionOf: first });
  assert.equal((await db.doc(`contributionAssessments/${first}`).get()).get('status'), 'superseded');
  const both = [(await db.doc(`contributionAssessments/${first}`).get()).get('contributionKey'), (await db.doc(`contributionAssessments/${second}`).get()).get('contributionKey')];
  assert.equal(both[0], both[1], 'revisions share one award identity');
  await decideAssessment('val', second, { decision: 'confirm', scores: { accuracy: 60, completeness: 60, technical: 60, metadata: 60 } });
  assert.equal((await account('max')).available, 20);
});

test('worker results are validated before use; a broken result or outage routes to a validator', async () => {
  await contributor('ned', 0);
  await setMode('assessed', 'on');
  const id = await portalSubmission('ned', 'worker');
  const a = (await db.doc(`contributionAssessments/${id}`).get()).data();
  assert.equal(a.status, 'queued');
  const jobRef = db.doc(`contributionAssessmentJobs/${a.automated.jobId}`);
  const job = (await jobRef.get()).data();
  assert.equal(job.input.kasemText, '[Kasem placeholder worker]');
  assert.equal(JSON.stringify(job.input).includes('ned'), false, 'no account identity inside the model-facing input');
  // A result that claims verified accuracy from a model guess is refused.
  const dims = (score, basis = 'deterministic') => ({ score, basis, notes: [] });
  const result = {
    schemaVersion: 1, submissionId: id, revisionId: id, contributionKey: a.contributionKey, category: 'expressions',
    evaluator: { worker: 'iw-assessment-worker', version: '1.0.0', model: 'gemini-2.5-flash', modelStatus: 'ok', policyId: 'award-v1-proposed', policyVersion: 1 },
    eligibility: [], dimensions: { accuracy: dims(95, 'model-proposal'), completeness: dims(80), technical: dims(90), metadata: dims(80) },
    overallScore: 90, recommendedBand: 'exceptional', proposedPoints: 30, duplicates: [],
    orthography: { original: '[x]', normalizedNfc: '[x]', changed: false, rulesApplied: 'ghana-bgl-1997', findings: [] },
    alignment: { status: 'uncertain', notes: [] }, audio: null, uncertainty: [], reasons: [], clarifications: [], evidence: [],
    kawuri: { status: 'ok', findings: [] }, routing: 'validator-review', completedAt: new Date().toISOString(),
  };
  await jobRef.update({ status: 'completed', result });
  await assessment.onAssessmentJobWritten.run({ data: { after: await jobRef.get() } });
  let fresh = (await db.doc(`contributionAssessments/${id}`).get()).data();
  assert.equal(fresh.status, 'validator_review');
  assert.equal(fresh.automated.status, 'unavailable');
  assert.equal(fresh.estimate, null, 'no estimate from a refused result');
  assert.equal((await account('ned')), undefined);
  // A valid result becomes a non-spendable estimate only.
  const id2 = await portalSubmission('ned', 'worker2');
  const a2 = (await db.doc(`contributionAssessments/${id2}`).get()).data();
  const job2 = db.doc(`contributionAssessmentJobs/${a2.automated.jobId}`);
  await job2.update({ status: 'completed', result: { ...result, submissionId: id2, revisionId: id2, contributionKey: a2.contributionKey,
    dimensions: { accuracy: dims(70, 'model-proposal'), completeness: dims(80), technical: dims(90), metadata: dims(80) }, overallScore: 76, recommendedBand: 'standard', proposedPoints: 20 } });
  await assessment.onAssessmentJobWritten.run({ data: { after: await job2.get() } });
  fresh = (await db.doc(`contributionAssessments/${id2}`).get()).data();
  assert.equal(fresh.automated.status, 'completed');
  assert.equal(fresh.estimate.points, 20);
  const view = await call(rewards.getContributorRewards, 'ned', {});
  assert.equal(view.balance.available, 0);
  assert.equal(view.balance.pendingEstimate, 20);
  // Overriding the worker's band needs a reason.
  await assert.rejects(decideAssessment('val', id2, { decision: 'confirm', scores: { accuracy: 85, completeness: 85, technical: 85, metadata: 85 } }), code(/invalid-argument/));
  await decideAssessment('val', id2, { decision: 'confirm', reason: 'Meaning verified with a second speaker', scores: { accuracy: 85, completeness: 85, technical: 85, metadata: 85 } });
  const calibrated = (await db.doc(`contributionAssessments/${id2}`).get()).data().calibration;
  assert.deepEqual([calibrated.automatedBand, calibrated.validatorBand, calibrated.agreed], ['standard', 'strong', false]);
});

test('migration: dry run reconciles, commit opens once, rerun is a no-op, rollback restores legacy fields', async () => {
  const { execFileSync } = await import('node:child_process');
  const script = new URL('../../services/functions/scripts/migrate-points-ledger.mjs', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
  const run = (...flags) => JSON.parse(execFileSync(process.execPath, [script, '--project', process.env.GCLOUD_PROJECT, ...flags], { env: process.env, encoding: 'utf8' }).split('\n}\n')[0] + '\n}');
  // Consistent account: 600 earned, 300 in a pending legacy request.
  await contributor('ola', 300, 600);
  await db.doc('contributorAccounts/ola/rewardCredits/c1').set({ points: 300 });
  await db.doc('contributorAccounts/ola/rewardCredits/c2').set({ points: 300 });
  await db.doc('contributorRedemptions/old-ola').set({ contributorId: 'ola', kind: 'airtime', points: 300, amountMinor: 500, status: 'approved', createdAt: '2026-10-01T00:00:00.000Z' });
  // Inconsistent account: balance does not match its records — reported, not "fixed".
  await contributor('pat', 900, 300);
  const dry = run();
  assert.equal(dry.mode, 'dry-run');
  assert.deepEqual([dry.accounts, dry.toOpen, dry.opened, dry.discrepancies, dry.legacyOpenRequests, dry.legacyOpenValueMinor], [2, 2, 0, 1, 1, 500]);
  assert.equal((await db.doc('contributorPointAccounts/ola').get()).exists, false, 'dry run writes nothing');
  const first = run('--commit');
  assert.equal(first.opened, 2);
  assert.equal((await account('pat')).available, 900, 'never reduces the balance contributors saw');
  assert.equal((await db.doc('contributorRedemptions/old-ola').get()).get('settlementPath'), 'legacy');
  const second = run('--commit');
  assert.deepEqual([second.opened, second.alreadyOpen, second.legacyRequestsStamped], [0, 2, 0]);
  assert.equal((await entries('ola')).length, 1);
  // The pending legacy request still settles on its original terms.
  await call(rewards.decideContributorRedemption, 'fin', { requestId: 'old-ola', action: 'fulfill', paymentReference: 'OLD-REF' }, FINANCE);
  assert.deepEqual((await entries('ola')).map(e => e.type), ['opening_balance', 'legacy_settlement']);
  const back = run('--rollback');
  assert.equal(back.rolledBack, 2);
  assert.equal((await db.doc('contributorAccounts/ola').get()).get('rewardBalance'), 300);
  assert.equal((await entries('ola')).length, 2, 'rollback keeps the ledger history');
  // While rolled back the previous system credits 10; re-migration carries it over.
  await db.doc('contributorAccounts/ola').update({ rewardBalance: 310 });
  const again = run('--commit');
  assert.equal(again.reconciledAfterRollback, 2);
  assert.equal((await account('ola')).available, 310);
});

test('end to end: the backend queues a job, the Python worker runs it from Firestore, the backend records a validated estimate', async (t) => {
  const { existsSync } = await import('node:fs');
  const { execFileSync } = await import('node:child_process');
  const venv = new URL(`../../services/assessment-worker/venv/${process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python'}`, import.meta.url);
  const python = venv.pathname.replace(/^\/([A-Za-z]:)/, '$1');
  if (!existsSync(python)) { t.skip('services/assessment-worker/venv not installed'); return; }
  await contributor('quinn', 0);
  await setMode('assessed', 'on');
  await db.doc('expressionEntries/pub1').set({ isPublished: true, phrase: '[Kasem placeholder accepted]', meaning: 'English prompt accepted' });
  const id = await portalSubmission('quinn', 'e2e');
  const jobId = (await db.doc(`contributionAssessments/${id}`).get()).get('automated.jobId');
  const cwd = new URL('../../services/assessment-worker/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
  const out = execFileSync(python, ['-m', 'assessment_worker.cli', 'run-job', jobId, '--project', process.env.GCLOUD_PROJECT],
    { cwd, encoding: 'utf8', env: { ...process.env, ASSESSMENT_KAWURI: 'off', PYTHONIOENCODING: 'utf-8' } });
  assert.match(out, /completed/);
  const again = execFileSync(python, ['-m', 'assessment_worker.cli', 'run-job', jobId, '--project', process.env.GCLOUD_PROJECT],
    { cwd, encoding: 'utf8', env: { ...process.env, ASSESSMENT_KAWURI: 'off' } });
  assert.match(again, /skipped/, 'a repeated delivery does not run the job twice');
  const job = db.doc(`contributionAssessmentJobs/${jobId}`);
  await assessment.onAssessmentJobWritten.run({ data: { after: await job.get() } });
  const a = (await db.doc(`contributionAssessments/${id}`).get()).data();
  assert.equal(a.automated.status, 'completed');
  assert.equal(a.status, 'validator_review');
  assert.equal(a.automated.result.kawuri.status, 'disabled');
  assert.equal(a.automated.result.dimensions.accuracy.score, null, 'no trusted match and no model: accuracy is left to the validator');
  assert.equal(a.estimate, null);
  assert.equal(await account('quinn'), undefined);
});
