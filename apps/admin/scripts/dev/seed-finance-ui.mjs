// Local-only finance data for looking at the Finance centre in a browser.
// Runs the real compiled `financeCentre` callable against the localhost
// emulators of the demo project — never production. Every record is titled
// "Local test ·" so nothing here can be mistaken for a real transaction.
//
//   npm run build:functions
//   npx firebase emulators:start --only auth,firestore,storage --project demo-indigen-world
//   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
//     FIREBASE_STORAGE_EMULATOR_HOST=127.0.0.1:9199 node apps/admin/scripts/dev/seed-admin-ui.mjs
//   (same variables) node apps/admin/scripts/dev/seed-finance-ui.mjs

import { createRequire } from 'node:module';

if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8080' || process.env.FIREBASE_AUTH_EMULATOR_HOST !== '127.0.0.1:9099') {
  throw new Error('Only the isolated localhost emulators are allowed.');
}
process.env.GCLOUD_PROJECT = 'demo-indigen-world';
const require = createRequire(new URL('../../../../services/functions/package.json', import.meta.url));
const { getApps, initializeApp } = require('firebase-admin/app');
if (!getApps().length) initializeApp({ projectId: 'demo-indigen-world', storageBucket: 'demo-indigen-world.appspot.com' });
const { getFirestore } = require('firebase-admin/firestore');
const finance = await import('../../../../services/functions/lib/finance-centre.js');

const ADMIN = { uid: 'ui-admin', token: { uid: 'ui-admin', role: 'admin', finance: true, name: 'Local Admin' } };
const EDITOR = { uid: 'ui-finance-editor', token: { uid: 'ui-finance-editor', financeRole: 'editor', name: 'Local Finance Editor' } };
const call = (who, data) => finance.financeCentre.run({ auth: who, data, rawRequest: {} });
const db = getFirestore();
if (!(await db.collection('financeTransactions').limit(1).get()).empty) { console.log('Finance data already seeded.'); process.exit(0); }

const today = new Date().toISOString().slice(0, 10);
const daysAgo = (n) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
let n = 0;
const key = () => `local-seed-${++n}-${Date.now()}`;

const momo = (await call(ADMIN, { operation: 'saveAccount', name: 'Local test · Project MoMo', type: 'mobile_money', institution: 'MTN', identifier: '0000001234' })).id;
const bank = (await call(ADMIN, { operation: 'saveAccount', name: 'Local test · Bank account', type: 'bank', institution: 'Local bank', identifier: '9876' })).id;
const paystack = (await call(ADMIN, { operation: 'saveAccount', name: 'Local test · Paystack balance', type: 'processor', institution: 'Paystack' })).id;
const sponsor = (await call(ADMIN, { operation: 'saveSource', name: 'Local test · Sponsor A', kind: 'individual', purpose: 'Development support' })).id;
const grant = (await call(ADMIN, { operation: 'saveSource', name: 'Local test · Research grant', kind: 'grant', purpose: 'Research and data collection' })).id;

const post = (fields, who = ADMIN, intent = 'post') => call(who, { operation: 'save', intent, requestKey: key(), allowDuplicate: true, fields });
await post({ type: 'income', amountMinor: 400_000, date: daysAgo(80), description: 'Local test · Sponsor contribution', counterparty: 'Local test · Sponsor A', categoryId: 'project-funding', accountId: momo, fundingSourceId: sponsor, reference: 'LOCAL-MOMO-1' });
await post({ type: 'income', amountMinor: 150_000, date: daysAgo(50), description: 'Local test · Grant tranche', categoryId: 'grants', accountId: bank, fundingSourceId: grant, restricted: true, restrictionPurpose: 'Research and data collection only' });
await post({ type: 'expense', amountMinor: 20_000, date: daysAgo(75), description: 'Local test · AI subscription', counterparty: 'Local test · Vendor', categoryId: 'ai-tools', accountId: momo, paymentMethod: 'Card' });
await post({ type: 'expense', amountMinor: 20_000, date: daysAgo(45), description: 'Local test · AI subscription', counterparty: 'Local test · Vendor', categoryId: 'ai-tools', accountId: momo, paymentMethod: 'Card' });
await post({ type: 'expense', amountMinor: 20_000, date: daysAgo(15), description: 'Local test · AI subscription', counterparty: 'Local test · Vendor', categoryId: 'ai-tools', accountId: momo, paymentMethod: 'Card' });
await post({ type: 'expense', amountMinor: 8_500, date: daysAgo(40), description: 'Local test · Cloud hosting', categoryId: 'cloud-hosting', accountId: bank });
await post({ type: 'expense', amountMinor: 32_000, date: daysAgo(20), description: 'Local test · Field recording trip', categoryId: 'research', accountId: bank, fundedBy: grant });
await post({ type: 'expense', amountMinor: 12_000, date: daysAgo(6), description: 'Local test · Domain renewal', categoryId: 'domains-web', accountId: momo });
await post({ type: 'transfer', amountMinor: 100_000, date: daysAgo(30), description: 'Local test · Move funds to the bank', accountId: momo, toAccountId: bank });
const wrong = await post({ type: 'expense', amountMinor: 50_000, date: daysAgo(10), description: 'Local test · Printing (entered twice)', categoryId: 'marketing', accountId: momo });
await call(ADMIN, { operation: 'reverse', id: wrong.id, reason: 'Local test · duplicate entry' });
await post({ type: 'expense', amountMinor: 18_000, date: today, description: 'Local test · Contributor workshop snacks', categoryId: 'operations', accountId: momo, counterparty: 'Local test · Caterer' }, EDITOR, 'submit');
await post({ type: 'expense', amountMinor: 45_000, date: daysAgo(-10), description: 'Local test · Sound equipment (ordered)', categoryId: 'equipment', accountId: bank }, ADMIN, 'commit');

await call(ADMIN, { operation: 'saveBudget', name: 'Local test · AI development', categoryIds: ['ai-tools', 'software-development'], from: `${today.slice(0, 4)}-01-01`, to: `${today.slice(0, 4)}-12-31`, allocatedMinor: 70_000, alertAtBps: 8000, control: 'warn' });
await call(ADMIN, { operation: 'saveBudget', name: 'Local test · Research', categoryIds: ['research'], from: `${today.slice(0, 4)}-01-01`, to: `${today.slice(0, 4)}-12-31`, allocatedMinor: 150_000, alertAtBps: 8000, control: 'warn' });
await call(EDITOR, { operation: 'saveRecurring', name: 'Local test · AI assistant', vendor: 'Local test · Vendor', amountMinor: 2_000, currency: 'USD', estimateRate: '10', frequency: 'monthly', nextDueDate: daysAgo(-5), categoryId: 'ai-tools', accountId: momo, reminderDays: 7 });
await call(EDITOR, { operation: 'saveRecurring', name: 'Local test · Cloud hosting', amountMinor: 9_000, currency: 'GHS', frequency: 'monthly', nextDueDate: daysAgo(-18), categoryId: 'cloud-hosting', accountId: bank, reminderDays: 5 });
await db.doc('adCampaigns/local-test-campaign').set({ name: 'Local test · Campaign', payment: { status: 'paid', reference: 'local_ad_ref', amountPaidPesewas: 14_840, paidAt: `${daysAgo(3)}T10:00:00Z`, channel: 'mobile_money' } });
await call(ADMIN, { operation: 'syncPlatform' });
await call(ADMIN, { operation: 'reconcile', accountId: momo, statementDate: daysAgo(1), statementBalanceMinor: 167_500, note: 'Local test · statement' });
console.log('Seeded local finance data.', (await call(ADMIN, { operation: 'overview' })).lifetime);
