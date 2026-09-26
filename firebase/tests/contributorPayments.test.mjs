// Contributor payout verification, MoMo one-time codes, the community pulse
// and the Kawuri contributor assistant — no emulator, no network.
//
//   npm run build:functions && node --test firebase/tests/contributorPayments.test.mjs
//
// The pure transition functions are imported from the compiled backend. The
// callables are evaluated from the same compiled files with Firestore,
// Storage, SMS and the statement check replaced by in-memory fakes, so every
// status change, limit and permission is exercised through the code that
// ships.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { HttpsError } from 'firebase-functions/v2/https';
import { requireAuth, roleSatisfies } from '../../services/functions/lib/auth.js';
import { normalizeGhanaPhone } from '../../services/functions/lib/sms.js';
import { guarded, hasFinanceAccess, maskTail, sanitiseForLog } from '../../services/functions/lib/contributor-common.js';
import {
  bankAfterSubmission,
  checkCode,
  contentMatchesType,
  contributorPaymentView,
  decideSection,
  hashWithSalt,
  momoAfterConfirmation,
  normaliseProfile,
  resendWaitMs,
  MOMO_MAX_ATTEMPTS,
  MOMO_RESEND_COOLDOWN_MS,
} from '../../services/functions/lib/contributor-payments.js';
import {
  buildCheck,
  compareAccountNumbers,
  compareBanks,
  compareNames,
  emptyCheck,
  readExtraction,
  statementCheckEnabled,
} from '../../services/functions/lib/contributor-statement-check.js';
import { pulseEntryId, pulseEvents, pulseLabel, pulseToken, visibilityOf } from '../../services/functions/lib/contributor-pulse.js';
import { cleanSuggestions, draftChecks, expressionTerms, looksEnglish } from '../../services/functions/lib/contributor-assist.js';
import { ownAvatarUrl, profileInput, settingsInput } from '../../services/functions/lib/contributor-profile.js';

const plain = (value) => JSON.parse(JSON.stringify(value));
const NOW = '2026-09-23T10:00:00.000Z';
const statement = { path: 'contributor-payout-statements/alice/upload-0001/statement.pdf', contentType: 'application/pdf', sizeBytes: 4096, sha256: 'abc', uploadedAt: NOW };
const details = { bankName: 'Ecobank Ghana', accountName: 'Ama Akosua Mensah', accountNumber: '1441000123456', branch: 'Navrongo' };

// ---------------------------------------------------------------------------
// Pure rules
// ---------------------------------------------------------------------------

test('legacy flat payout profiles keep their status, are marked legacy and reach contributors masked', () => {
  const profile = normaliseProfile('alice', {
    bankName: 'GCB Bank', accountName: 'Ama Mensah', accountNumber: '0011223344556', branch: '',
    verificationStatus: 'verified', verificationNote: '', verifiedAt: NOW, verifiedBy: 'finance-1', updatedAt: NOW,
  });
  assert.equal(profile.bank.status, 'verified', 'a verified legacy account is not silently downgraded');
  assert.equal(profile.bank.legacy, true);
  assert.equal(profile.bank.statement, null);
  const view = contributorPaymentView(profile, null);
  const serialised = JSON.stringify(view);
  assert.equal(serialised.includes('0011223344556'), false, 'full account number never reaches the contributor');
  assert.equal(view.bank.accountNumberMasked, '•••• 4556');
  assert.equal(view.legacyProfile.accountNumber, '•••• 4556');
  assert.equal(normaliseProfile('bob', undefined).bank, null);
});

test('every bank submission is a fresh pending claim with a new version', () => {
  const verified = { ...bankAfterSubmission(null, details, statement, NOW, true), status: 'verified', decidedAt: NOW, decidedBy: 'finance-1' };
  const next = bankAfterSubmission(verified, { ...details, accountNumber: '1441000999999' }, { ...statement, path: 'x/y/z.pdf' }, NOW, false);
  assert.equal(next.status, 'pending');
  assert.equal(next.version, verified.version + 1);
  assert.equal(next.decidedAt, null);
  assert.equal(next.decidedBy, null);
  assert.equal(next.statusReason, '');
  assert.equal(next.automatedCheck.state, 'off');
  assert.equal(bankAfterSubmission(null, details, statement, NOW, true).automatedCheck.state, 'not_run');
});

test('finance decisions require the current version, reasons and a statement', () => {
  const bank = bankAfterSubmission(null, details, statement, NOW, false);
  const decide = (overrides) => decideSection('bank', bank, { decision: 'verify', reason: '', nextStep: '', version: bank.version, actor: 'finance-1', now: NOW, ...overrides });
  assert.throws(() => decide({ version: bank.version + 1 }), { code: 'aborted' });
  assert.throws(() => decide({ decision: 'reject', reason: 'no' }), { code: 'invalid-argument' });
  assert.throws(() => decide({ decision: 'needs_action', reason: 'Statement is cut off', nextStep: '' }), { code: 'invalid-argument' });
  assert.throws(() => decideSection('bank', { ...bank, statement: null }, { decision: 'verify', reason: '', nextStep: '', version: bank.version, actor: 'f', now: NOW }), { code: 'failed-precondition' });
  const verified = decide({});
  assert.equal(verified.status, 'verified');
  assert.equal(verified.decidedBy, 'finance-1');
  assert.throws(() => decideSection('bank', verified, { decision: 'verify', reason: '', nextStep: '', version: verified.version, actor: 'f', now: NOW }), { code: 'failed-precondition' });
  const needsAction = decide({ decision: 'needs_action', reason: 'The statement is cut off.', nextStep: 'Upload all pages of the statement.' });
  assert.equal(needsAction.status, 'needs_action');
  assert.equal(needsAction.nextStep, 'Upload all pages of the statement.');
});

test('a confirmed MoMo code keeps an unchanged wallet and resets a changed one', () => {
  const wallet = { network: 'mtn', walletNumber: '+233241234567', registeredName: 'Ama Mensah' };
  const first = momoAfterConfirmation(null, wallet, NOW);
  assert.equal(first.changed, true);
  assert.equal(first.momo.ownershipStatus, 'pending', 'a code never proves ownership');
  const verified = { ...first.momo, ownershipStatus: 'verified', decidedAt: NOW, decidedBy: 'finance-1' };
  const again = momoAfterConfirmation(verified, wallet, '2026-09-24T00:00:00.000Z');
  assert.equal(again.changed, false);
  assert.equal(again.momo.ownershipStatus, 'verified');
  assert.equal(again.momo.phoneVerifiedAt, '2026-09-24T00:00:00.000Z');
  const moved = momoAfterConfirmation(verified, { ...wallet, walletNumber: '+233201234567' }, NOW);
  assert.equal(moved.changed, true);
  assert.equal(moved.momo.ownershipStatus, 'pending');
  assert.equal(moved.momo.version, verified.version + 1);
  assert.equal(momoAfterConfirmation(verified, { ...wallet, registeredName: 'Ama K Mensah' }, NOW).momo.ownershipStatus, 'pending');
});

test('one-time codes expire, lock after five wrong answers and respect the resend cooldown', () => {
  const salt = 'salt';
  const challenge = { codeHash: hashWithSalt('123456', salt), salt, attempts: 0, expiresAtMs: 10_000, lastSentAtMs: 0 };
  assert.deepEqual(checkCode(challenge, '123456', 5_000), { outcome: 'ok' });
  assert.deepEqual(checkCode(challenge, '000000', 5_000), { outcome: 'wrong', attemptsLeft: MOMO_MAX_ATTEMPTS - 1 });
  assert.deepEqual(checkCode({ ...challenge, attempts: MOMO_MAX_ATTEMPTS - 1 }, '000000', 5_000), { outcome: 'wrong', attemptsLeft: 0 });
  assert.deepEqual(checkCode({ ...challenge, attempts: MOMO_MAX_ATTEMPTS }, '123456', 5_000), { outcome: 'locked' });
  assert.deepEqual(checkCode(challenge, '123456', 10_000), { outcome: 'expired' });
  assert.equal(resendWaitMs(1_000, 1_000), MOMO_RESEND_COOLDOWN_MS);
  assert.equal(resendWaitMs(1_000, 1_000 + MOMO_RESEND_COOLDOWN_MS), 0);
  assert.equal(resendWaitMs(undefined, 5), 0);
});

test('finance access needs the finance claim on an admin, or a super administrator', () => {
  assert.equal(hasFinanceAccess({ role: 'admin' }), false, 'an ordinary admin does not see payout detail');
  assert.equal(hasFinanceAccess({ role: 'validator', finance: true }), false);
  assert.equal(hasFinanceAccess({ role: 'admin', finance: true }), true);
  assert.equal(hasFinanceAccess({ role: 'super_admin' }), true);
  assert.equal(hasFinanceAccess({ superAdmin: true }), true);
  assert.equal(hasFinanceAccess(undefined), false);
});

test('statement comparison is evidence: names, banks and numbers, never verification', () => {
  assert.equal(compareNames('Ama Akosua Mensah', 'MENSAH AMA A.'), 'match');
  assert.equal(compareNames('Ama Mensah', 'Mrs Ama Mensah'), 'match');
  assert.equal(compareNames('Ama Mensah', 'Kofi Mensah'), 'partial');
  assert.equal(compareNames('Ama Mensah', 'Kwesi Owusu'), 'mismatch');
  assert.equal(compareNames('Ama Mensah', ''), 'not_found');
  assert.equal(compareBanks('Ghana Commercial Bank', 'GCB Bank PLC'), 'match');
  assert.equal(compareBanks('Barclays', 'Absa Bank Ghana Limited'), 'match');
  assert.equal(compareBanks('Ecobank', 'Fidelity Bank'), 'mismatch');
  assert.equal(compareBanks('Naara Rural Bank', 'NAARA RURAL BANK LTD'), 'match');
  assert.equal(compareAccountNumbers('1441000123456', 'same', '3456'), 'match');
  assert.equal(compareAccountNumbers('1441000123456', 'same', '9999'), 'mismatch', 'a model that says same with other digits is not believed');
  assert.equal(compareAccountNumbers('1441000123456', 'masked_consistent', '3456'), 'partial');
  assert.equal(compareAccountNumbers('1441000123456', 'not_visible', ''), 'not_found');
  const extraction = readExtraction({ documentKind: 'bank_statement', legible: true, accountHolderName: 'AMA A MENSAH', bankName: 'Ecobank Ghana Ltd', accountNumberComparison: 'same', accountNumberLast4: '3456' });
  const consistent = buildCheck(details, extraction, 'gemini-test', NOW);
  assert.equal(consistent.state, 'consistent');
  const mismatch = buildCheck(details, { ...extraction, bankName: 'Stanbic Bank' }, 'gemini-test', NOW);
  assert.equal(mismatch.state, 'mismatch');
  assert.equal(buildCheck(details, readExtraction({ documentKind: 'other', legible: true }), 'm', NOW).state, 'unreadable');
  assert.equal(buildCheck(details, readExtraction(null), null, NOW).state, 'unreadable');
  assert.equal(buildCheck(details, { ...extraction, accountHolderName: '' }, 'm', NOW).state, 'uncertain');
  for (const check of [consistent, mismatch]) assert.notEqual(check.state, 'verified');
  assert.equal(statementCheckEnabled({}), false, 'off unless a deployment opts in');
  assert.equal(statementCheckEnabled({ CONTRIBUTOR_STATEMENT_CHECK: 'enabled' }), true);
  assert.equal(emptyCheck('off').evidence, null);
});

test('uploaded statements must really be PDF, JPEG or PNG', () => {
  assert.equal(contentMatchesType(Buffer.from('%PDF-1.7\n'), 'application/pdf'), true);
  assert.equal(contentMatchesType(Buffer.from([0xff, 0xd8, 0xff, 0xe0]), 'image/jpeg'), true);
  assert.equal(contentMatchesType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), 'image/png'), true);
  assert.equal(contentMatchesType(Buffer.from('<html>'), 'application/pdf'), false);
  assert.equal(contentMatchesType(Buffer.from('%PDF-1.7'), 'image/png'), false);
  assert.equal(contentMatchesType(Buffer.from('MZ'), 'application/x-msdownload'), false);
});

test('unexpected failures become a referenced message without leaking details', async () => {
  const failing = guarded('test', async () => { throw new Error('Account 1441000123456 for ama@example.com failed'); });
  await assert.rejects(failing({}), (error) => {
    assert.equal(error.code, 'internal');
    assert.match(error.message, /reference IW-[0-9A-F]{8}/);
    assert.equal(error.message.includes('1441000123456'), false);
    assert.match(error.details.reference, /^IW-/);
    return true;
  });
  const deliberate = guarded('test', async () => { throw new HttpsError('failed-precondition', 'Upload a statement first.'); });
  await assert.rejects(deliberate({}), { code: 'failed-precondition', message: 'Upload a statement first.' });
  assert.equal(sanitiseForLog('Account 1441000123456 for ama@example.com'), 'Account [digits] for [email]');
  assert.equal(maskTail('+233241234567'), '•••• 4567');
});

test('pulse events count portal submissions and approvals once, with chosen labels', () => {
  const created = { contributorPortal: { contributorId: 'alice' }, status: 'SUBMITTED', lifecycle: { createdAt: '2026-09-23T08:00:00.000Z' } };
  assert.deepEqual(pulseEvents(undefined, created).map((event) => [event.kind, event.day]), [['submitted', '2026-09-23']]);
  assert.deepEqual(pulseEvents(created, { ...created, status: 'UNDER_REVIEW' }), []);
  const approved = { ...created, status: 'APPROVED', moderation: { decidedAt: '2026-09-24T09:00:00.000Z' } };
  assert.deepEqual(pulseEvents(created, approved).map((event) => [event.kind, event.day]), [['approved', '2026-09-24']]);
  assert.deepEqual(pulseEvents(approved, { ...approved, status: 'PUBLISHED' }), [], 'publishing an approved expression is not a second approval');
  assert.deepEqual(pulseEvents(undefined, { status: 'SUBMITTED' }), [], 'only contributor-portal work counts');
  // A redelivered event adds the same token, so arrayUnion counts it once.
  const key = 'k'.repeat(64);
  assert.equal(pulseToken('s1', key), pulseToken('s1', key));
  assert.notEqual(pulseEntryId('alice', '2026-09-23', key), pulseEntryId('alice', '2026-09-23', 'q'.repeat(64)), 'without the server key a row cannot be found from an account id');
  assert.equal(pulseLabel('name', '  Ama   Mensah '), 'Ama Mensah');
  assert.equal(pulseLabel('anonymous', 'Ama Mensah'), null);
  assert.equal(pulseLabel('hidden', 'Ama Mensah'), null);
  assert.equal(visibilityOf(undefined), 'anonymous', 'anonymous by default');
  assert.notEqual(pulseEntryId('alice', '2026-09-23', key), pulseEntryId('alice', '2026-09-24', key), 'anonymous rows cannot be linked across days');
});

test('Kawuri draft checks advise without blocking, and Kasem is stripped from model suggestions', () => {
  const base = { expression: 'How is your family?', translation: '', alternatives: [], context: '', feedback: '', returned: false, returnedTranslation: '', unsure: false };
  assert.deepEqual(draftChecks(base).map((check) => check.id), ['missing-translation', 'no-context']);
  assert.ok(draftChecks({ ...base, translation: 'How is your family?' }).some((check) => check.id === 'same-as-english'));
  assert.ok(draftChecks({ ...base, translation: 'How are you and your family' }).some((check) => check.id === 'looks-english'));
  assert.equal(looksEnglish('Fʋ yi mɛ'), false, 'Kasem letters are never called English');
  assert.equal(looksEnglish('a ba'), false);
  const returned = draftChecks({ ...base, translation: 'Kasem draft', context: 'Said to an elder', feedback: 'Use the everyday greeting', returned: true, returnedTranslation: 'Kasem draft' });
  assert.deepEqual(returned.map((check) => check.id), ['feedback-unaddressed']);
  assert.ok(draftChecks({ ...base, translation: 'Kasem draft', alternatives: ['Kasem draft'], context: 'x' }).some((check) => check.id === 'duplicate-alternative'));
  assert.equal(draftChecks(base).some((check) => check.severity === 'block'), false);
  const cleaned = cleanSuggestions({
    summary: 'The assignment asks for everyday greetings.',
    suggestions: [
      { kind: 'context', text: 'Say whether this is said to an elder.', guideSection: 'alternatives-context' },
      { kind: 'meaning', text: 'Try “Fʋ yi mɛ” instead.', guideSection: 'none' },
    ],
    questions: ['Is it formal?', 'Would you say ŋ here?'],
  });
  assert.deepEqual(cleaned.suggestions.map((entry) => entry.text), ['Say whether this is said to an elder.']);
  assert.deepEqual(cleaned.questions, ['Is it formal?']);
  assert.equal(cleaned.removed, 2);
  assert.equal(cleaned.suggestions[0].guideSection, 'alternatives-context');
  assert.deepEqual(expressionTerms('Please come and sit with our family.').slice(0, 2), ['please come and sit with our family', 'sit']);
});

test('profile and settings input are validated', () => {
  assert.throws(() => profileInput({ displayName: 'A' }), { code: 'invalid-argument' });
  assert.throws(() => profileInput({ displayName: 'Ama', dialect: 'Twi' }), { code: 'invalid-argument' });
  assert.equal(profileInput({ displayName: '  Ama  Mensah ', dialect: 'Paga' }).displayName, 'Ama Mensah');
  assert.throws(() => settingsInput({ activityVisibility: 'public', notifications: {} }), { code: 'invalid-argument' });
  assert.throws(() => settingsInput({ activityVisibility: 'name', notifications: { reviewEmail: 'yes', paymentEmail: true, paymentSms: false } }), { code: 'invalid-argument' });
  assert.deepEqual(settingsInput({ activityVisibility: 'hidden', notifications: { reviewEmail: false, paymentEmail: true, paymentSms: true } }).notifications, { reviewEmail: false, paymentEmail: true, paymentSms: true });
  const bucket = 'project.firebasestorage.app';
  assert.equal(ownAvatarUrl(`https://firebasestorage.googleapis.com/v0/b/${bucket}/o/creator-avatars%2Falice%2Fphoto.jpg?alt=media`, 'alice', bucket), true);
  assert.equal(ownAvatarUrl(`https://firebasestorage.googleapis.com/v0/b/${bucket}/o/creator-avatars%2Fbob%2Fphoto.jpg`, 'alice', bucket), false);
  assert.equal(ownAvatarUrl('https://example.com/me.jpg', 'alice', bucket), false);
  assert.equal(ownAvatarUrl('', 'alice', bucket), true);
});

// ---------------------------------------------------------------------------
// Callables against in-memory fakes
// ---------------------------------------------------------------------------

function hasUndefined(value) {
  if (value === undefined) return true;
  if (value && typeof value === 'object') return Object.values(value).some(hasUndefined);
  return false;
}

function fakeFirestore() {
  const records = new Map();
  let auto = 0;
  const read = (path) => (records.has(path) ? structuredClone(records.get(path)) : undefined);
  const at = (data, key) => key.split('.').reduce((value, part) => value?.[part], data);
  const snapshot = (path) => ({
    exists: records.has(path), id: path.split('/').at(-1), ref: ref(path),
    data: () => read(path), get: (key) => structuredClone(at(records.get(path), key)),
  });
  const write = (path, data) => {
    // Firestore refuses undefined; so does this fake, so a bug cannot hide here.
    assert.equal(hasUndefined(data), false, `undefined written to ${path}`);
    records.set(path, structuredClone(data));
  };
  const deepMerge = (base, patch) => {
    const next = { ...base };
    for (const [key, value] of Object.entries(patch)) {
      next[key] = value && typeof value === 'object' && !Array.isArray(value) && base?.[key] && typeof base[key] === 'object'
        ? deepMerge(base[key], value) : value;
    }
    return next;
  };
  function ref(path) {
    return {
      path, id: path.split('/').at(-1),
      get: async () => snapshot(path),
      set: async (data, options) => write(path, options?.merge ? deepMerge(read(path) ?? {}, data) : data),
      update: async (patch) => {
        if (!records.has(path)) throw Object.assign(new Error(`No document to update: ${path}`), { code: 5 });
        const next = read(path);
        for (const [key, value] of Object.entries(patch)) {
          const parts = key.split('.');
          let target = next;
          for (const part of parts.slice(0, -1)) target = target[part] = { ...(target[part] ?? {}) };
          target[parts.at(-1)] = value;
        }
        write(path, next);
      },
      delete: async () => { records.delete(path); },
      collection: (name) => collection(`${path}/${name}`),
    };
  }
  function query(prefix, filters = [], max = Infinity) {
    return {
      isQuery: true,
      where: (field, op, value) => query(prefix, [...filters, [field, op, value]], max),
      limit: (count) => query(prefix, filters, count),
      get: async () => {
        const depth = prefix.split('/').length + 1;
        const docs = [...records.keys()]
          .filter((key) => key.startsWith(`${prefix}/`) && key.split('/').length === depth)
          .map(snapshot)
          .filter((doc) => filters.every(([field, op, value]) => op === '==' && doc.get(field) === value))
          .slice(0, max);
        return { docs, size: docs.length, empty: docs.length === 0 };
      },
    };
  }
  function collection(name) {
    return { ...query(name), doc: (id = `auto-${++auto}`) => ref(`${name}/${id}`) };
  }
  const db = {
    doc: ref,
    collection,
    batch() {
      const ops = [];
      return {
        set: (target, data, options) => ops.push(() => target.set(data, options)),
        update: (target, data) => ops.push(() => target.update(data)),
        delete: (target) => ops.push(() => target.delete()),
        commit: async () => { for (const op of ops) await op(); },
      };
    },
    async runTransaction(fn) {
      const writes = [];
      const tx = {
        get: async (target) => (target.isQuery ? target.get() : snapshot(target.path)),
        set: (target, data, options) => writes.push(() => target.set(data, options)),
        create: (target, data) => writes.push(() => { assert.ok(!records.has(target.path), `create over ${target.path}`); return target.set(data); }),
        update: (target, data) => writes.push(() => target.update(data)),
        delete: (target) => writes.push(() => target.delete()),
      };
      const result = await fn(tx);
      for (const apply of writes) await apply();
      return result;
    },
  };
  return { db, records };
}

function fakeStorage() {
  const files = new Map();
  const deleted = [];
  const signed = [];
  const file = (path) => ({
    exists: async () => [files.has(path)],
    getMetadata: async () => [{ contentType: files.get(path).contentType, size: String(files.get(path).bytes.length) }],
    download: async () => [Buffer.from(files.get(path).bytes)],
    delete: async () => { deleted.push(path); files.delete(path); },
    getSignedUrl: async (options) => { signed.push({ path, options }); return [`https://signed.example/${encodeURIComponent(path)}`]; },
  });
  return { storage: { bucket: () => ({ name: 'test-bucket', file }) }, files, deleted, signed };
}

const PDF = () => Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(3000, 32)]);
const strip = (code) => code.replace(/^import[\s\S]*?;\n/gm, '').replace(/\bexport (?=(?:async )?function|const|let|class)/g, '');
const lib = (name) => strip(readFileSync(new URL(`../../services/functions/lib/${name}`, import.meta.url), 'utf8'));

async function harness({ smsOk = true, smsConfigured = true, check = null } = {}) {
  const { db, records } = fakeFirestore();
  const { storage, files, deleted, signed } = fakeStorage();
  const messages = [];
  const limits = new Map();
  const checks = [];
  const context = {
    process: { env: {} }, Buffer, URL, console,
    createHash, randomBytes, randomInt, timingSafeEqual,
    getFirestore: () => db, getStorage: () => storage,
    logger: { info() {}, warn() {}, error() {} },
    HttpsError, onCall: (_options, fn) => fn,
    requireAuth, roleSatisfies,
    consumeRateLimit: async (operation, id, limit, _windowMs, units = 1, message = 'Too many requests. Try again shortly.') => {
      const key = `${operation}_${id}`;
      const used = limits.get(key) ?? 0;
      if (used + units > limit) throw new HttpsError('resource-exhausted', message);
      limits.set(key, used + units);
    },
    ARKESEL_API_KEY: 'test-secret',
    isSmsConfigured: () => smsConfigured,
    normalizeGhanaPhone,
    sendSmsToMsisdn: async (to, message) => { messages.push({ to, message }); return smsOk ? { ok: true, id: 'sms-1' } : { ok: false, error: 'network' }; },
    emptyCheck,
    statementCheckEnabled: () => Boolean(check),
    runStatementCheck: async (input) => { checks.push(input); return check; },
  };
  const api = runInNewContext(`${lib('contributor-common.js')}\n${lib('contributor-payments.js')}\n;({
    getContributorPayments, submitBankVerification, removePayoutMethod, startMomoVerification, confirmMomoVerification,
    listContributorPayments, getPayoutStatementLink, decidePayoutVerification, requestContributorPayment })`, context);
  records.set('contributorAccounts/alice', { status: 'active' });
  const contributor = (data = {}, uid = 'alice') => ({ auth: { uid, token: {} }, data });
  const finance = (data = {}, token = { role: 'admin', finance: true }, uid = 'finance-1') => ({ auth: { uid, token }, data });
  const upload = (id = 'upload-0001', bytes = PDF(), contentType = 'application/pdf', name = 'statement.pdf') => {
    files.set(`contributor-payout-statements/alice/${id}/${name}`, { bytes, contentType });
    return { uploadId: id, fileName: name };
  };
  const codeFrom = (index = -1) => /(\d{6})/.exec(messages.at(index).message)[1];
  return { ...api, db, records, files, deleted, signed, messages, checks, contributor, finance, upload, codeFrom };
}

test('bank verification: activated contributors only, validated upload, pending review, masked view', async () => {
  const h = await harness();
  h.records.set('contributorAccounts/alice', { status: 'active', requiresPasswordChange: true });
  await assert.rejects(h.submitBankVerification(h.contributor({ ...details, statement: h.upload() })), { code: 'failed-precondition' });
  h.records.set('contributorAccounts/alice', { status: 'active' });
  await assert.rejects(h.submitBankVerification(h.contributor({ ...details, statement: h.upload() }, 'mallory')), { code: 'permission-denied' });
  await assert.rejects(h.submitBankVerification(h.contributor({ ...details })), { code: 'invalid-argument' }, 'a statement is required');
  await assert.rejects(h.submitBankVerification(h.contributor({ ...details, statement: { uploadId: '../x', fileName: 'a.pdf' } })), { code: 'invalid-argument' });
  await assert.rejects(h.submitBankVerification(h.contributor({ ...details, statement: h.upload('upload-0002', Buffer.alloc(4000, 1)) })), { code: 'invalid-argument' }, 'bytes must match the claimed type');
  await assert.rejects(h.submitBankVerification(h.contributor({ ...details, statement: h.upload('upload-0003', Buffer.from('%PDF-1.7')) })), { code: 'invalid-argument' }, 'too small');
  await assert.rejects(h.submitBankVerification(h.contributor({ ...details, accountNumber: '12', statement: h.upload() })), { code: 'invalid-argument' });

  const view = plain(await h.submitBankVerification(h.contributor({ ...details, statement: h.upload() })));
  assert.equal(view.bank.status, 'pending');
  assert.equal(view.bank.accountNumberMasked, '•••• 3456');
  assert.equal(JSON.stringify(view).includes('1441000123456'), false);
  assert.equal(view.bank.automatedCheck.state, 'off');
  assert.equal(view.preferredMethod, 'bank');
  const stored = h.records.get('contributorPayoutProfiles/alice');
  assert.equal(stored.schemaVersion, 2);
  assert.equal(stored.bank.accountNumber, '1441000123456', 'the full number is kept server-side for payment');
  assert.equal(stored.bank.statement.path, 'contributor-payout-statements/alice/upload-0001/statement.pdf');
  assert.ok([...h.records.keys()].some((key) => key.startsWith('auditLogs/') && h.records.get(key).action === 'contributor.payout.bank.submit'));
  const fetched = plain(await h.getContributorPayments(h.contributor()));
  assert.equal(JSON.stringify(fetched).includes('1441000123456'), false);
  assert.equal(fetched.bank.statement.contentType, 'application/pdf');
  assert.equal(fetched.bank.statement.path, undefined, 'storage paths stay server-side');
});

test('changing verified bank details resets verification and deletes the superseded statement', async () => {
  const h = await harness({ check: { state: 'mismatch', fields: { accountName: 'match', accountNumber: 'mismatch', bankName: 'match' }, evidence: { documentKind: 'bank_statement', accountHolderName: 'AMA MENSAH', bankName: 'Ecobank', accountNumberLast4: '9999' }, model: 'm', ranAt: NOW, unavailableReason: null } });
  await h.submitBankVerification(h.contributor({ ...details, statement: h.upload() }));
  assert.equal(h.checks.length, 1, 'the automated check runs when switched on');
  let stored = h.records.get('contributorPayoutProfiles/alice');
  assert.equal(stored.bank.automatedCheck.state, 'mismatch');
  assert.equal(stored.bank.status, 'pending', 'a check result never changes the status');
  const contributorView = plain(await h.getContributorPayments(h.contributor()));
  assert.equal(contributorView.bank.automatedCheck.evidence, undefined, 'extracted evidence is for finance reviewers only');
  await h.decidePayoutVerification(h.finance({ contributorId: 'alice', method: 'bank', decision: 'verify', version: stored.bank.version }));
  assert.equal(h.records.get('contributorPayoutProfiles/alice').bank.status, 'verified');

  await h.submitBankVerification(h.contributor({ ...details, accountNumber: '1441000999999', statement: h.upload('upload-0009') }));
  stored = h.records.get('contributorPayoutProfiles/alice');
  assert.equal(stored.bank.status, 'pending');
  assert.equal(stored.bank.decidedAt, null);
  assert.deepEqual(stored.history.slice(0, 2).map((event) => event.action), ['bank.automated_check', 'bank.resubmitted_after_verification']);
  assert.deepEqual(h.deleted, ['contributor-payout-statements/alice/upload-0001/statement.pdf']);
});

test('MoMo codes: hashed storage, cooldown, per-number limit and SMS failure', async () => {
  const h = await harness();
  const wallet = { network: 'mtn', walletNumber: '024 123 4567', registeredName: 'Ama Mensah' };
  await assert.rejects(h.startMomoVerification(h.contributor({ ...wallet, network: 'mpesa' })), { code: 'invalid-argument' });
  await assert.rejects(h.startMomoVerification(h.contributor({ ...wallet, walletNumber: '+33612345678' })), { code: 'invalid-argument' }, 'MoMo wallets are Ghanaian numbers');
  await assert.rejects(h.startMomoVerification(h.contributor({ ...wallet, registeredName: 'Ama 123' })), { code: 'invalid-argument' });
  const sent = plain(await h.startMomoVerification(h.contributor(wallet)));
  assert.equal(sent.delivery, 'accepted');
  assert.equal(sent.walletNumberMasked, '•••• 4567');
  assert.equal(JSON.stringify(sent).includes(h.codeFrom()), false, 'the code is never returned');
  assert.equal(h.messages[0].to, '233241234567');
  const challenge = h.records.get('contributorMomoChallenges/alice');
  assert.equal(JSON.stringify(challenge).includes(h.codeFrom()), false, 'only a salted hash of the code is stored');
  await assert.rejects(h.startMomoVerification(h.contributor(wallet)), { code: 'resource-exhausted' }, 'resend cooldown');
  for (let attempt = 0; attempt < 2; attempt += 1) {
    h.records.get('contributorMomoChallenges/alice').lastSentAtMs = 0;
    await h.startMomoVerification(h.contributor(wallet));
  }
  h.records.get('contributorMomoChallenges/alice').lastSentAtMs = 0;
  await assert.rejects(h.startMomoVerification(h.contributor(wallet)), { code: 'resource-exhausted', message: /this number/ }, 'three codes an hour to one number');
  assert.equal(h.messages.length, 3);

  const failing = await harness({ smsOk: false });
  await assert.rejects(failing.startMomoVerification(failing.contributor(wallet)), { code: 'unavailable' });
  assert.equal(failing.records.has('contributorMomoChallenges/alice'), false, 'a code that was never delivered cannot be answered');
  const unconfigured = await harness({ smsConfigured: false });
  await assert.rejects(unconfigured.startMomoVerification(unconfigured.contributor(wallet)), { code: 'failed-precondition' });
});

test('MoMo confirmation: attempts, expiry, and success proves phone control only', async () => {
  const h = await harness();
  const wallet = { network: 'telecel', walletNumber: '0201234567', registeredName: 'Ama Mensah' };
  await assert.rejects(h.confirmMomoVerification(h.contributor({ code: '123456' })), { code: 'not-found' });
  await h.startMomoVerification(h.contributor(wallet));
  const code = h.codeFrom();
  const wrong = code === '000000' ? '111111' : '000000';
  await assert.rejects(h.confirmMomoVerification(h.contributor({ code: '12' })), { code: 'invalid-argument' });
  await assert.rejects(h.confirmMomoVerification(h.contributor({ code: wrong })), { message: /4 tries left/ });
  h.records.get('contributorMomoChallenges/alice').expiresAtMs = Date.now() - 1;
  await assert.rejects(h.confirmMomoVerification(h.contributor({ code })), { code: 'deadline-exceeded' });
  assert.equal(h.records.has('contributorMomoChallenges/alice'), false);

  // A fresh code, then five wrong answers.
  await h.startMomoVerification(h.contributor(wallet));
  const latest = h.codeFrom();
  const miss = latest === '000000' ? '111111' : '000000';
  for (let attempt = 0; attempt < MOMO_MAX_ATTEMPTS; attempt += 1) {
    await assert.rejects(h.confirmMomoVerification(h.contributor({ code: miss })), { code: 'invalid-argument' });
  }
  assert.equal(h.records.has('contributorMomoChallenges/alice'), false, 'five wrong answers burn the code');
  await assert.rejects(h.confirmMomoVerification(h.contributor({ code: latest })), { code: 'not-found' }, 'a burned code cannot be answered');

  const fresh = await harness();
  await fresh.startMomoVerification(fresh.contributor(wallet));
  const view = plain(await fresh.confirmMomoVerification(fresh.contributor({ code: fresh.codeFrom() })));
  assert.ok(view.momo.phoneVerifiedAt);
  assert.equal(view.momo.ownershipStatus, 'pending', 'wallet ownership waits for a finance reviewer');
  assert.equal(view.payoutReady, false);
  assert.equal(view.momo.walletNumberMasked, '•••• 4567');
  assert.equal(fresh.records.get('contributorPayoutProfiles/alice').momo.walletNumber, '+233201234567');
  assert.equal(fresh.records.has('contributorMomoChallenges/alice'), false);
});

test('finance decisions: authorisation, self-review guard, stale versions and notification choices', async () => {
  const h = await harness();
  await h.startMomoVerification(h.contributor({ network: 'mtn', walletNumber: '0241234567', registeredName: 'Ama Mensah' }));
  await h.confirmMomoVerification(h.contributor({ code: h.codeFrom() }));
  const version = h.records.get('contributorPayoutProfiles/alice').momo.version;
  const decide = (data, token, uid) => h.decidePayoutVerification(h.finance({ contributorId: 'alice', method: 'momo', decision: 'verify', version, ...data }, token, uid));
  await assert.rejects(decide({}, { role: 'admin' }), { code: 'permission-denied' }, 'admin without the finance claim');
  await assert.rejects(decide({}, { role: 'contributor', finance: true }), { code: 'permission-denied' });
  await assert.rejects(h.listContributorPayments(h.finance({}, { role: 'admin' })), { code: 'permission-denied' });
  await assert.rejects(decide({}, { role: 'admin', finance: true }, 'alice'), { code: 'permission-denied' }, 'nobody decides on their own details');
  await assert.rejects(decide({ version: version + 1 }), { code: 'aborted' });
  h.records.set('contributorSettings/alice', { activityVisibility: 'anonymous', notifications: { reviewEmail: true, paymentEmail: false, paymentSms: true } });
  const result = plain(await decide({ decision: 'needs_action', reason: 'The registered name differs from the name on the wallet.', nextStep: 'Enter the name exactly as your MoMo account shows it.' }));
  assert.equal(result.status, 'needs_action');
  const notification = [...h.records.entries()].find(([key]) => key.startsWith('notifications/'))[1];
  assert.deepEqual(notification.channels, ['in_app', 'sms']);
  assert.equal(notification.link, '/contributor/account/payments');
  assert.equal(JSON.stringify(notification).includes('+233241234567'), false);
  const audit = [...h.records.values()].find((entry) => entry.action === 'contributor.payout.momo.needs_action');
  assert.equal(audit.actor.id, 'finance-1');
  const listed = plain(await h.listContributorPayments(h.finance()));
  assert.equal(listed.profiles[0].momo.walletNumber, '+233241234567', 'finance reviewers see the full number');
  assert.equal(listed.profiles[0].history[0].actorId, 'finance-1');
  const contributorView = plain(await h.getContributorPayments(h.contributor()));
  assert.equal(contributorView.history[0].actorId, undefined, 'reviewer identity stays with finance');
  assert.equal(contributorView.momo.nextStep, 'Enter the name exactly as your MoMo account shows it.');
});

test('statement links are finance-only, short-lived and audited', async () => {
  const h = await harness();
  await h.submitBankVerification(h.contributor({ ...details, statement: h.upload() }));
  await assert.rejects(h.getPayoutStatementLink(h.contributor({ contributorId: 'alice' })), { code: 'permission-denied' });
  await assert.rejects(h.getPayoutStatementLink(h.finance({ contributorId: 'alice' }, { role: 'admin' })), { code: 'permission-denied' });
  const link = plain(await h.getPayoutStatementLink(h.finance({ contributorId: 'alice' })));
  assert.match(link.url, /^https:\/\/signed\.example\//);
  assert.ok(h.signed[0].options.expires - Date.now() <= 5 * 60_000);
  assert.ok([...h.records.values()].some((entry) => entry.action === 'contributor.payout.statement.view' && entry.actor.id === 'finance-1'));
  await assert.rejects(h.getPayoutStatementLink(h.finance({ contributorId: 'nobody' })), { code: 'not-found' });
});

test('payment requests need a verified method and snapshot what was verified', async () => {
  const h = await harness();
  await assert.rejects(h.requestContributorPayment(h.contributor({ amountMinor: 5000, description: 'September assignment' })), { code: 'failed-precondition' });
  await h.submitBankVerification(h.contributor({ ...details, statement: h.upload() }));
  const version = h.records.get('contributorPayoutProfiles/alice').bank.version;
  await h.decidePayoutVerification(h.finance({ contributorId: 'alice', method: 'bank', decision: 'verify', version }));
  const { requestId } = await h.requestContributorPayment(h.contributor({ amountMinor: 5000, description: 'September assignment' }));
  const request = h.records.get(`contributorPaymentRequests/${requestId}`);
  assert.equal(request.payoutMethod, 'bank');
  assert.equal(request.payoutSnapshot.accountNumber, '1441000123456');
  await assert.rejects(h.requestContributorPayment(h.contributor({ amountMinor: 5000, description: 'Again' })), { code: 'failed-precondition' });
});
