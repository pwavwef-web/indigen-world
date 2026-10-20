// The Finance centre end to end: the real `financeCentre` callable, real
// Firestore transactions, the Storage and Auth emulators, and the real rules.
//
//   npm run test:finance
//
// Amounts follow the brief's worked example (GH₵4,000 in, GH₵200 out). They
// exist only in the emulator; no illustrative entry is ever written to
// production.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, beforeEach, test } from 'node:test';
import { deleteApp, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { assertFails, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, deleteDoc } from 'firebase/firestore';

process.env.GCLOUD_PROJECT ??= 'demo-indigen-world';
const PROJECT = process.env.GCLOUD_PROJECT;
assert.ok(process.env.FIRESTORE_EMULATOR_HOST, 'Run under the Firestore emulator.');

let app, db, finance;
before(async () => {
  app = initializeApp({ projectId: PROJECT, storageBucket: `${PROJECT}.appspot.com` });
  db = getFirestore();
  finance = await import('../../services/functions/lib/finance-centre.js');
});
after(async () => { await deleteApp(app); });

async function clear() {
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' });
}
beforeEach(clear);

const ADMIN = { role: 'admin', finance: true, name: 'Finance Admin' };
const ADMIN2 = { role: 'admin', finance: true, name: 'Second Admin' };
const EDITOR = { financeRole: 'editor', name: 'Finance Editor' };
const VIEWER = { financeRole: 'viewer', name: 'Finance Viewer' };
const call = (uid, token, data) => finance.financeCentre.run({ auth: { uid, token: { uid, ...token } }, data, rawRequest: {} });
const admin = (data) => call('admin-1', ADMIN, data);
const code = (pattern) => (error) => { assert.match(String(error.code), pattern, error.message); return true; };
let keySeq = 0;
const key = () => `request-key-${++keySeq}-${Date.now()}`;
const overview = async (range = 'all') => admin({ operation: 'overview', range });

async function account(name = 'MTN MoMo (project)', type = 'mobile_money') {
  return (await admin({ operation: 'saveAccount', name, type, institution: 'MTN', identifier: '024 123 4567' })).id;
}
const income = (accountId, extra = {}) => ({ type: 'income', amountMinor: 400_000, date: '2026-04-01', description: 'Financial contribution towards Indigen World development',
  counterparty: 'Sir Barney', categoryId: 'project-funding', accountId, ...extra });
const expense = (accountId, extra = {}) => ({ type: 'expense', amountMinor: 20_000, date: '2026-04-05', description: 'Claude subscription for project development',
  counterparty: 'Anthropic / Claude', categoryId: 'ai-tools', accountId, ...extra });

test('access is enforced on the server: no role, viewer, editor and admin each get exactly their level', async () => {
  await assert.rejects(call('nobody', { role: 'admin' }, { operation: 'overview' }), code(/permission-denied/), 'an admin role alone is not finance access');
  await assert.rejects(finance.financeCentre.run({ data: { operation: 'overview' }, rawRequest: {} }), code(/unauthenticated/));
  const accountId = await account();
  assert.equal((await call('viewer-1', VIEWER, { operation: 'overview' })).lifetime.closingMinor, 0);
  await assert.rejects(call('viewer-1', VIEWER, { operation: 'save', fields: income(accountId), intent: 'draft', requestKey: key() }), code(/permission-denied/));
  await assert.rejects(call('editor-1', EDITOR, { operation: 'save', fields: income(accountId), intent: 'post', requestKey: key() }), code(/permission-denied/));
  await assert.rejects(call('editor-1', EDITOR, { operation: 'saveAccount', name: 'Cash box', type: 'cash' }), code(/permission-denied/));
  const saved = await call('editor-1', EDITOR, { operation: 'save', fields: income(accountId), intent: 'submit', requestKey: key() });
  assert.equal(saved.status, 'pending_approval');
  await assert.rejects(call('editor-1', EDITOR, { operation: 'approve', id: saved.id }), code(/permission-denied/));
});

test('the worked example: GH₵4,000 from Sir Barney, then GH₵200 for Claude, leaves GH₵3,800.00 everywhere', async () => {
  const momo = await account();
  const barney = (await admin({ operation: 'saveSource', name: 'Sir Barney', kind: 'individual', purpose: 'Indigen World development' })).id;
  const submitted = await call('editor-1', EDITOR, { operation: 'save', fields: income(momo, { fundingSourceId: barney }), intent: 'submit', requestKey: key() });
  let o = await overview();
  assert.equal(o.lifetime.closingMinor, 0, 'pending approval is not money in the books');
  assert.equal(o.workflow.pendingApproval, 1);
  await admin({ operation: 'approve', id: submitted.id });
  o = await overview();
  assert.deepEqual([o.lifetime.netIncomeMinor, o.lifetime.netExpenseMinor, o.lifetime.closingMinor], [400_000, 0, 400_000]);
  await admin({ operation: 'save', fields: expense(momo), intent: 'post', requestKey: key() });
  o = await overview();
  assert.deepEqual([o.lifetime.netIncomeMinor, o.lifetime.netExpenseMinor, o.lifetime.closingMinor], [400_000, 20_000, 380_000]);
  assert.equal(o.lifetime.counts.posted, 2);
  assert.equal(o.accounts.find((a) => a.id === momo).balanceMinor, 380_000, 'the account balance reconciles with the project balance');
  assert.equal(o.balanceSeries.at(-1).balanceMinor, 380_000, 'the chart ends on the same figure');
  assert.equal(o.categories[0].name, 'AI Tools & Subscriptions');
  assert.equal(o.sources.find((s) => s.sourceId === barney).totalMinor, 400_000);
  assert.ok(o.insights.some((i) => i.text === 'The available project balance is GH₵3,800.00.'));
  const ledger = await call('viewer-1', VIEWER, { operation: 'ledger', sort: 'date', order: 'desc' });
  assert.deepEqual(ledger.rows.map((r) => r.runningBalanceMinor), [380_000, 400_000]);
  assert.deepEqual(ledger.rows.map((r) => r.signedMinor), [-20_000, 400_000]);
  const detail = await admin({ operation: 'source', id: barney });
  assert.equal(detail.totals.contributions, 1);
  assert.equal(detail.totals.spentMinor, 0, 'the Claude expense was not allocated to Sir Barney, so it is not charged to him');
  // A refresh reads the same records again.
  assert.equal((await overview()).lifetime.closingMinor, 380_000);
});

test('creation is idempotent, duplicates need confirmation, and a payment reference posts once per account', async () => {
  const momo = await account();
  const requestKey = key();
  const first = await admin({ operation: 'save', fields: income(momo, { reference: 'MOMO-123' }), intent: 'post', requestKey });
  const retry = await admin({ operation: 'save', fields: income(momo, { reference: 'MOMO-123' }), intent: 'post', requestKey });
  assert.equal(retry.id, first.id);
  assert.equal(retry.replayed, true);
  assert.equal((await overview()).lifetime.closingMinor, 400_000, 'a retried request did not post twice');
  await assert.rejects(admin({ operation: 'save', fields: income(momo, { reference: 'MOMO-123' }), intent: 'post', requestKey: key() }), code(/already-exists/), 'same amount, day and reference looks like a duplicate');
  await assert.rejects(admin({ operation: 'save', fields: income(momo, { reference: 'MOMO-123', amountMinor: 1 }), intent: 'post', requestKey: key(), allowDuplicate: true }), (e) => /already posted/.test(e.message));
  await admin({ operation: 'save', fields: income(momo, { reference: 'MOMO-999' }), intent: 'post', requestKey: key(), allowDuplicate: true });
  assert.equal((await overview()).lifetime.closingMinor, 800_000, 'a confirmed separate payment posts');
});

test('posted entries are immutable; a reversal restores the balance and keeps both in the audit trail', async () => {
  const momo = await account();
  await admin({ operation: 'save', fields: income(momo), intent: 'post', requestKey: key() });
  const wrong = await admin({ operation: 'save', fields: expense(momo, { amountMinor: 200_000, reference: 'INV-1' }), intent: 'post', requestKey: key() });
  assert.equal((await overview()).lifetime.closingMinor, 200_000);
  await assert.rejects(admin({ operation: 'save', id: wrong.id, fields: expense(momo, { amountMinor: 20_000 }), intent: 'post' }), code(/failed-precondition/));
  await assert.rejects(call('editor-1', EDITOR, { operation: 'reverse', id: wrong.id, reason: 'Wrong amount' }), code(/permission-denied/));
  const corrected = await admin({ operation: 'correct', id: wrong.id, reason: 'Typed GH₵2,000 instead of GH₵200', fields: { amountMinor: 20_000 } });
  assert.equal((await overview()).lifetime.closingMinor, 400_000, 'the reversal restores the balance');
  await assert.rejects(admin({ operation: 'reverse', id: wrong.id, reason: 'Again please' }), code(/failed-precondition|already-exists/));
  const draft = await admin({ operation: 'get', id: corrected.correctionId });
  assert.equal(draft.txn.status, 'draft');
  assert.equal(draft.txn.amountMinor, 20_000);
  assert.equal(draft.txn.correctionOf, wrong.id);
  await admin({ operation: 'approve', id: corrected.correctionId });
  assert.equal((await overview()).lifetime.closingMinor, 380_000);
  const original = await admin({ operation: 'get', id: wrong.id });
  assert.equal(original.txn.status, 'reversed');
  assert.deepEqual(original.audit.map((a) => a.action), ['transaction.created.posted', 'transaction.reversed']);
  assert.ok(original.linked.some((l) => l.isReversal) && original.linked.some((l) => l.id === corrected.correctionId));
  const ledger = await admin({ operation: 'ledger', statuses: 'all', sort: 'date', order: 'asc' });
  assert.equal(ledger.total, 4, 'income, the wrong expense, its reversal and the correction are all listed');
  assert.equal(ledger.rows.at(-1).runningBalanceMinor, 380_000);
});

test('transfers keep total funds; approved-but-unpaid expenses are commitments until paid', async () => {
  const momo = await account();
  const bank = await account('GCB current account', 'bank');
  await admin({ operation: 'save', fields: income(momo), intent: 'post', requestKey: key() });
  await admin({ operation: 'save', fields: { type: 'transfer', amountMinor: 150_000, date: '2026-04-02', description: 'Move funds to the bank', accountId: momo, toAccountId: bank }, intent: 'post', requestKey: key() });
  let o = await overview();
  assert.equal(o.lifetime.closingMinor, 400_000);
  assert.equal(o.lifetime.netIncomeMinor, 400_000);
  assert.deepEqual([o.accounts.find((a) => a.id === momo).balanceMinor, o.accounts.find((a) => a.id === bank).balanceMinor], [250_000, 150_000]);
  const committed = await admin({ operation: 'save', fields: expense(bank, { date: '2099-01-01' }), intent: 'commit', requestKey: key() });
  o = await overview();
  assert.equal(o.lifetime.closingMinor, 400_000, 'a commitment is not spending');
  assert.equal(o.commitments.internalApprovedMinor, 20_000);
  assert.equal(o.availableAfterCommitmentsMinor, 380_000);
  await assert.rejects(admin({ operation: 'save', fields: expense(bank, { date: '2099-01-01' }), intent: 'post', requestKey: key(), allowDuplicate: true }), code(/failed-precondition/), 'a future-dated entry cannot be posted');
  await admin({ operation: 'markPaid', id: committed.id, date: '2026-04-06', reference: 'GCB-7781' });
  o = await overview();
  assert.equal(o.lifetime.closingMinor, 380_000);
  assert.equal(o.commitments.internalApprovedMinor, 0);
});

test('recurring expenses are reminders, not spending, until a payment is posted; then the due date rolls on', async () => {
  const momo = await account();
  await admin({ operation: 'save', fields: income(momo), intent: 'post', requestKey: key() });
  const today = new Date().toISOString().slice(0, 10);
  const claude = (await call('editor-1', EDITOR, { operation: 'saveRecurring', name: 'Claude', vendor: 'Anthropic', amountMinor: 2_000, currency: 'USD', estimateRate: '10',
    frequency: 'monthly', nextDueDate: today, categoryId: 'ai-tools', accountId: momo, reminderDays: 7 })).id;
  let o = await overview();
  assert.equal(o.lifetime.closingMinor, 400_000);
  assert.equal(o.upcoming[0].amountMinor, 20_000, 'US$20 shown as about GH₵200 using the estimate rate');
  assert.equal(o.commitments.upcomingRecurringMinor, 20_000);
  await admin({ operation: 'save', fields: expense(momo, { date: today, original: { currency: 'USD', amountMinor: 2_000, rate: '11.5' } }), intent: 'post', requestKey: key(), recurringId: claude, recurringDueDate: today });
  o = await overview();
  assert.equal(o.lifetime.netExpenseMinor, 23_000, 'the posted cedi amount uses the actual rate on the day');
  const config = await admin({ operation: 'config' });
  assert.ok(config.recurring.find((r) => r.id === claude).nextDueDate > today, 'the next due date moved forward');
});

test('budgets warn by default and only block under an explicit spending control', async () => {
  const momo = await account();
  await admin({ operation: 'save', fields: income(momo), intent: 'post', requestKey: key() });
  const budget = (await admin({ operation: 'saveBudget', name: 'AI Development Budget', categoryIds: ['ai-tools'], from: '2026-01-01', to: '2026-12-31', allocatedMinor: 25_000, alertAtBps: 8000, control: 'warn' })).id;
  const warned = await admin({ operation: 'save', fields: expense(momo, { amountMinor: 30_000 }), intent: 'post', requestKey: key() });
  assert.ok(warned.budgetWarnings.some((w) => /over its allocation/.test(w)));
  await admin({ operation: 'saveBudget', id: budget, name: 'AI Development Budget', categoryIds: ['ai-tools'], from: '2026-01-01', to: '2026-12-31', allocatedMinor: 25_000, alertAtBps: 8000, control: 'block' });
  await assert.rejects(admin({ operation: 'save', fields: expense(momo, { amountMinor: 1_000, description: 'Another tool' }), intent: 'post', requestKey: key() }), code(/failed-precondition/));
  const o = await overview();
  assert.equal(o.budgets[0].state, 'over');
});

test('platform money is logged once from confirmed records and waits for approval unless auto-posting is set', async () => {
  const paystack = await account('Paystack balance', 'processor');
  await db.doc('adCampaigns/camp-1').set({ name: 'Shea butter, dry season', payment: { status: 'paid', reference: 'ad_ref_1', amountPaidPesewas: 14_840, paidAt: '2026-04-03T10:00:00Z', channel: 'mobile_money' } });
  await db.doc('adCampaigns/camp-2').set({ name: 'Unpaid', payment: { status: 'pending', reference: 'ad_ref_2', amountPaidPesewas: 0 } });
  await db.doc('contributorRedemptions/red-1').set({ status: 'fulfilled', amountMinor: 500, points: 300, network: 'MTN', kind: 'airtime', paidAt: '2026-04-04T09:00:00Z', paymentReference: 'TOPUP-1' });
  await db.doc('contributorRedemptions/red-2').set({ status: 'approved', amountMinor: 700, points: 400, network: 'MTN', kind: 'airtime' });
  await db.doc('contributorPaymentRequests/pay-1').set({ status: 'paid', amountMinor: 5_000, description: 'March contributions', paidAt: '2026-04-05T09:00:00Z', paymentReference: 'MOMO-77' });
  await db.doc('shopTransactions/shop_ref').set({ kind: 'payment', amountMinor: 3_000, currency: 'GHS', orderId: 'order-1', reference: 'shop_ref', verifiedAt: '2026-04-06T00:00:00Z' });
  await db.doc('shopTransactions/refund_r1').set({ kind: 'refund', amountMinor: -1_000, currency: 'GHS', orderId: 'order-1', providerId: '991', verifiedAt: '2026-04-07T00:00:00Z' });

  const first = await admin({ operation: 'syncPlatform' });
  assert.deepEqual([first.ads.created, first.redemptions.created, first.payouts.created, first.shop.created], [1, 1, 1, 2]);
  const again = await admin({ operation: 'syncPlatform' });
  assert.deepEqual([again.ads.created, again.redemptions.created, again.payouts.created, again.shop.created], [0, 0, 0, 0], 'a second sync records nothing twice');
  let o = await overview();
  assert.equal(o.lifetime.closingMinor, 0, 'platform records wait for a finance administrator before they count');
  assert.equal(o.workflow.platformPending, 5);
  assert.equal(o.commitments.redemptionsMinor, 700, 'an approved, unsent top-up is shown as a commitment');

  const pending = await admin({ operation: 'ledger', statuses: ['pending_approval'] });
  await assert.rejects(admin({ operation: 'approve', id: pending.rows[0].id }), code(/failed-precondition/), 'approval needs the account the money is in');
  for (const row of pending.rows) await admin({ operation: 'approve', id: row.id, accountId: paystack });
  o = await overview();
  assert.equal(o.lifetime.netIncomeMinor, 14_840 + 3_000 - 1_000);
  assert.equal(o.lifetime.netExpenseMinor, 500 + 5_000);

  // With auto-posting configured, a new event goes straight into the books — once.
  const settings = (await admin({ operation: 'config' })).settings;
  await admin({ operation: 'saveSettings', autoPost: { ...settings.autoPost, ads: { post: true, accountId: paystack } } });
  const event = finance.adEvent('camp-3', { name: 'Kente', payment: { status: 'paid', reference: 'ad_ref_3', amountPaidPesewas: 10_000, paidAt: '2026-04-08T00:00:00Z' } });
  assert.equal(await finance.recordPlatformEvent(event), 'created');
  assert.equal(await finance.recordPlatformEvent(event), 'exists');
  o = await overview();
  assert.equal(o.lifetime.netIncomeMinor, 14_840 + 3_000 - 1_000 + 10_000);
  // A platform record can be dismissed (for example a test-mode payment), with a reason.
  await db.doc('adCampaigns/camp-4').set({ name: 'Test', payment: { status: 'paid', reference: 'ad_test', amountPaidPesewas: 100, paidAt: '2026-04-09T00:00:00Z' } });
  await admin({ operation: 'saveSettings', autoPost: { ...settings.autoPost, ads: { post: false, accountId: paystack } } });
  await admin({ operation: 'syncPlatform' });
  const testPayment = (await admin({ operation: 'ledger', statuses: ['pending_approval'] })).rows[0];
  await assert.rejects(admin({ operation: 'discard', id: testPayment.id }), code(/invalid-argument/));
  await admin({ operation: 'discard', id: testPayment.id, reason: 'Paystack test-mode payment' });
  assert.equal((await admin({ operation: 'syncPlatform' })).ads.created, 0, 'a dismissed platform record is not re-imported');
});

test('reconciliation flags a difference and resolves it with a traceable adjustment', async () => {
  const momo = await account();
  await admin({ operation: 'save', fields: income(momo), intent: 'post', requestKey: key() });
  const matched = await admin({ operation: 'reconcile', accountId: momo, statementDate: '2026-04-30', statementBalanceMinor: 400_000 });
  assert.equal(matched.status, 'matched');
  const open = await admin({ operation: 'reconcile', accountId: momo, statementDate: '2026-04-30', statementBalanceMinor: 399_500, note: 'MoMo statement' });
  assert.deepEqual([open.status, open.differenceMinor], ['open', -500]);
  const resolved = await admin({ operation: 'resolveReconciliation', id: open.id, action: 'adjust', resolution: 'Network charge not recorded' });
  const adjustment = await admin({ operation: 'get', id: resolved.adjustmentId });
  assert.deepEqual([adjustment.txn.type, adjustment.txn.direction, adjustment.txn.amountMinor, adjustment.txn.status], ['adjustment', 'out', 500, 'pending_approval']);
  await call('admin-2', ADMIN2, { operation: 'approve', id: resolved.adjustmentId });
  assert.equal((await overview()).lifetime.closingMinor, 399_500);
  const audit = await admin({ operation: 'audit' });
  assert.ok(audit.rows.some((r) => r.action === 'reconciliation.adjustment_submitted'));
});

test('two-person approval, when switched on, stops an administrator approving their own entry', async () => {
  const momo = await account();
  await admin({ operation: 'saveSettings', requireSecondApprover: true });
  await assert.rejects(admin({ operation: 'save', fields: income(momo), intent: 'post', requestKey: key() }), code(/failed-precondition/));
  const mine = await admin({ operation: 'save', fields: income(momo), intent: 'submit', requestKey: key() });
  await assert.rejects(admin({ operation: 'approve', id: mine.id }), code(/failed-precondition/));
  await call('admin-2', ADMIN2, { operation: 'approve', id: mine.id });
  assert.equal((await overview()).lifetime.closingMinor, 400_000);
});

test('reports: CSV and PDF are built from the same posted records', async () => {
  const momo = await account();
  await admin({ operation: 'save', fields: income(momo), intent: 'post', requestKey: key() });
  await admin({ operation: 'save', fields: expense(momo), intent: 'post', requestKey: key() });
  await call('editor-1', EDITOR, { operation: 'save', fields: expense(momo, { amountMinor: 99_900, description: 'Unapproved draft' }), intent: 'draft', requestKey: key() });
  const json = await call('viewer-1', VIEWER, { operation: 'report', kind: 'monthly', from: '2026-04-01', to: '2026-04-30' });
  assert.equal(json.report.summary.closingMinor, 380_000);
  const csv = await admin({ operation: 'report', kind: 'transactions', from: '2026-04-01', to: '2026-04-30', format: 'csv' });
  assert.match(csv.csv, /Closing balance,3800\.00/);
  assert.doesNotMatch(csv.csv, /Unapproved draft/);
  const pdf = await admin({ operation: 'report', kind: 'annual', from: '2026-01-01', to: '2026-12-31', format: 'pdf' });
  assert.equal(Buffer.from(pdf.pdfBase64, 'base64').subarray(0, 5).toString(), '%PDF-');
  const audit = await admin({ operation: 'report', kind: 'audit', from: '2020-01-01', to: '2099-12-31', format: 'csv' });
  assert.match(audit.csv, /transaction\.created\.posted/);
});

test('receipts are type-checked from their bytes, linked once, and opened through the audited callable', { skip: !process.env.FIREBASE_STORAGE_EMULATOR_HOST }, async () => {
  const momo = await account();
  const entry = await call('editor-1', EDITOR, { operation: 'save', fields: expense(momo), intent: 'draft', requestKey: key() });
  const bucket = getStorage().bucket();
  const pdf = Buffer.concat([Buffer.from('%PDF-1.4\n'), Buffer.alloc(2000, 32)]);
  await bucket.file('finance-receipts/editor-1/upload-00000001/claude-invoice.pdf').save(pdf, { contentType: 'application/pdf' });
  await bucket.file('finance-receipts/editor-1/upload-00000002/fake.pdf').save(Buffer.from('<html>not a pdf</html>'), { contentType: 'application/pdf' });
  const linked = await call('editor-1', EDITOR, { operation: 'attach', targetType: 'transaction', targetId: entry.id, path: 'finance-receipts/editor-1/upload-00000001/claude-invoice.pdf', name: 'Claude invoice.pdf' });
  assert.equal(linked.attachment.contentType, 'application/pdf');
  await assert.rejects(call('editor-1', EDITOR, { operation: 'attach', targetType: 'transaction', targetId: entry.id, path: 'finance-receipts/editor-1/upload-00000002/fake.pdf' }), code(/invalid-argument/));
  await assert.rejects(call('editor-2', EDITOR, { operation: 'attach', targetType: 'transaction', targetId: entry.id, path: 'finance-receipts/editor-1/upload-00000001/claude-invoice.pdf' }), code(/invalid-argument/), 'only one’s own uploads');
  const opened = await call('viewer-1', VIEWER, { operation: 'attachmentLink', targetType: 'transaction', targetId: entry.id, attachmentId: 'upload-00000001' });
  assert.ok(opened.url || opened.dataBase64);
  const detail = await admin({ operation: 'get', id: entry.id });
  assert.deepEqual(detail.audit.map((a) => a.action), ['transaction.created.draft', 'document.attached', 'document.viewed']);
});

test('roles: finance admins grant viewer/editor; only a super administrator grants finance administration', { skip: !process.env.FIREBASE_AUTH_EMULATOR_HOST }, async () => {
  const auth = getAuth();
  const stamp = Date.now();
  const target = await auth.createUser({ email: `bookkeeper-${stamp}@example.com` });
  await assert.rejects(call('editor-1', EDITOR, { operation: 'setRole', email: `bookkeeper-${stamp}@example.com`, level: 'viewer' }), code(/permission-denied/));
  await admin({ operation: 'setRole', email: `bookkeeper-${stamp}@example.com`, level: 'editor' });
  assert.equal((await auth.getUser(target.uid)).customClaims.financeRole, 'editor');
  await assert.rejects(admin({ operation: 'setRole', email: `bookkeeper-${stamp}@example.com`, level: 'admin' }), code(/permission-denied/));
  await auth.setCustomUserClaims(target.uid, { role: 'admin', financeRole: 'editor' });
  await call('super-1', { role: 'super_admin', superAdmin: true }, { operation: 'setRole', email: `bookkeeper-${stamp}@example.com`, level: 'admin' });
  const claims = (await auth.getUser(target.uid)).customClaims;
  assert.deepEqual([claims.finance, claims.financeRole, claims.role], [true, undefined, 'admin']);
  const people = await admin({ operation: 'people' });
  assert.ok(people.people.some((p) => p.uid === target.uid && p.level === 'admin'));
});

test('database rules close every finance collection to clients, administrators included', async () => {
  const env = await initializeTestEnvironment({ projectId: PROJECT, firestore: { rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8080 } });
  try {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'financeTransactions/t1'), { amountMinor: 1, status: 'posted' });
      await setDoc(doc(ctx.firestore(), 'financeAudit/a1'), { action: 'x' });
    });
    for (const claims of [{ role: 'admin', finance: true }, { role: 'super_admin', superAdmin: true }, { financeRole: 'editor' }, {}]) {
      const store = env.authenticatedContext('someone', claims).firestore();
      await assertFails(getDoc(doc(store, 'financeTransactions/t1')));
      await assertFails(setDoc(doc(store, 'financeTransactions/t2'), { amountMinor: 1 }));
      await assertFails(setDoc(doc(store, 'financeAudit/a1'), { action: 'rewritten' }));
      await assertFails(deleteDoc(doc(store, 'financeAudit/a1')));
      await assertFails(getDoc(doc(store, 'financeSettings/main')));
    }
  } finally {
    await env.cleanup();
  }
});
