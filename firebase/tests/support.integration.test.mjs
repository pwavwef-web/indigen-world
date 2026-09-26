import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { randomBytes, createHmac } from 'node:crypto';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import { getDoc, doc } from 'firebase/firestore';
import * as model from '../../services/functions/lib/support-model.js';
import * as support from '../../services/functions/lib/support.js';
import { whatsappEvents, processWhatsappEvent, deliverWhatsapp } from '../../services/functions/lib/support-whatsapp.js';

if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) throw new Error('Run only with Auth and Firestore emulators.');
const projectId = 'demo-indigen-world';
let app, rules, api, db;
const mail = [];
const admin = { auth: { uid: 'support-test-admin', token: { role: 'admin' } } };
before(async () => {
  app = initializeApp({ projectId }); db = getFirestore();
  rules = await initializeTestEnvironment({ projectId, firestore: { rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8') } });
  await rules.clearFirestore();
  api = { supportPortal: support.supportPortalHandler, listSupportCases: support.listSupportCases.run, getSupportCase: support.getSupportCase.run, updateSupportCase: support.updateSupportCase.run,
    deliverSupportEmail: ref => support.deliverSupportEmail(ref, async message => { mail.push(message); return true; }) };
});
after(async () => { await rules?.cleanup(); if (app) await deleteApp(app); });
async function portal(body) {
  let status = 200, json;
  const res = { set() {}, status(value) { status = value; return res; }, json(value) { json = value; return res; } };
  await api.supportPortal({ method: 'POST', ip: '127.0.0.1', body, rawBody: Buffer.from(JSON.stringify(body)) }, res);
  return { status, data: JSON.parse(JSON.stringify(json)) };
}
async function create(extra = {}) {
  const key = randomBytes(32).toString('hex');
  const body = { action: 'create', key, name: 'Test contributor', email: `${randomBytes(5).toString('hex')}@example.test`, category: 'login', description: 'The invitation will not let me sign in.', consent: true, ...extra };
  const response = await portal(body); assert.equal(response.status, 200);
  return { ...response.data, key, body };
}
test('unauthenticated help is private, account-neutral, idempotent and inaccessible through Firestore', async () => {
  const c = await create();
  assert.equal((await portal(c.body)).data.id, c.id);
  const messages = await db.collection(`supportCases/${c.id}/messages`).get(); assert.equal(messages.size, 2);
  const foreign = await portal({ action: 'get', id: c.id, key: 'b'.repeat(64) }); assert.equal(foreign.status, 403);
  const own = await portal({ action: 'get', ...c }); assert.equal(own.status, 200);
  for (const secret of ['email', 'accessHash', 'account', 'phone', 'lastSignIn', 'disabled']) assert.equal(secret in own.data, false);
  for (const context of [rules.unauthenticatedContext(), rules.authenticatedContext('support-test-admin', { role: 'admin' })]) {
    await assertFails(getDoc(doc(context.firestore(), `supportCases/${c.id}`)));
    await assertFails(getDoc(doc(context.firestore(), `supportCases/${c.id}/messages/initial`)));
  }
  await assert.rejects(api.listSupportCases({}), /admin access/);
  await assert.rejects(api.getSupportCase({ data: { id: c.id }, auth: { uid: 'member', token: { role: 'contributor' } } }), /admin access/);
});
test('human handoff, closure and reopening require explicit action; retries create one message', async () => {
  const c = await create();
  const body = { action: 'human', ...c, requestId: 'human-request-123' };
  await Promise.all([portal(body), portal(body)]);
  assert.equal((await db.doc(`supportCases/${c.id}`).get()).get('messageCount'), 3);
  assert.equal((await db.doc(`supportCases/${c.id}`).get()).get('status'), 'open');
  assert.equal((await portal({ action: 'resolve', ...c, requestId: 'resolve-request-123' })).status, 200);
  assert.equal((await db.doc(`supportCases/${c.id}`).get()).get('status'), 'resolved');
  await portal({ action: 'reply', ...c, requestId: 'reopen-request-123', text: 'It still does not work.' });
  assert.equal((await db.doc(`supportCases/${c.id}`).get()).get('status'), 'open');
  await assert.rejects(api.updateSupportCase({ ...admin, data: { id: c.id, requestId: 'admin-resolve-123', status: 'resolved', resolution: '' } }), /resolution/);
});
test('team replies queue once and SMTP acceptance never claims recipient delivery', async () => {
  const c = await create();
  const req = { ...admin, data: { id: c.id, requestId: 'admin-reply-123', status: 'awaiting_member', reply: 'Please use the email from your invitation.', assignToMe: true } };
  await Promise.all([api.updateSupportCase(req), api.updateSupportCase(req)]);
  const job = db.doc(`_supportEmailOutbox/${c.id}_admin-reply-123`);
  const start = mail.length; await Promise.all([api.deliverSupportEmail(job), api.deliverSupportEmail(job)]);
  assert.equal(mail.length - start, 1); assert.equal((await job.get()).get('status'), 'accepted');
  assert.equal((await db.doc(`supportCases/${c.id}/messages/admin-reply-123`).get()).get('delivery'), 'accepted');
  assert.equal((await db.doc(`supportCases/${c.id}`).get()).get('status'), 'awaiting_member');
});
test('recovery goes only to an active registered mailbox; unknown addresses get the same public notice', async () => {
  const email = 'support-recovery@example.test';
  const existing = await getAuth().getUserByEmail(email).catch(() => null);
  const user = existing || await getAuth().createUser({ email });
  await db.doc(`contributorAccounts/${user.uid}`).set({ status: 'active' });
  const c = await create({ email }); const unknown = await create();
  const reset = await portal({ action: 'reset', ...c, requestId: 'reset-request-123' });
  const other = await portal({ action: 'reset', ...unknown, requestId: 'reset-request-123' });
  assert.deepEqual(reset.data, other.data);
  for (let i = 0; i < 4; i++) assert.equal((await portal({ action: 'reset', ...c, requestId: 'reset-request-123' })).status, 200);
  const job = db.doc(`_supportEmailOutbox/${model.digest(`reset:${c.id}:reset-request-123`)}`);
  const unknownJob = db.doc(`_supportEmailOutbox/${model.digest(`reset:${unknown.id}:reset-request-123`)}`);
  const start = mail.length; await api.deliverSupportEmail(job); await api.deliverSupportEmail(unknownJob);
  assert.equal(mail.length - start, 1); assert.equal(mail.at(-1).to, email);
  assert.match(mail.at(-1).text, /oobCode=/);
  assert.doesNotMatch(JSON.stringify((await job.get()).data()), /oobCode=/);
  assert.equal((await unknownJob.get()).get('status'), 'not_eligible');
});
test('malformed, non-consenting and honeypot submissions are rejected', async () => {
  for (const body of [{}, { action: 'create', consent: false }, { action: 'create', website: 'spam' }]) assert.equal((await portal(body)).status >= 400, true);
  assert.equal(model.redactSupportText('password is secret123 https://example.test/?oobCode=SECRET'), 'password: [removed] [private recovery link removed]');
});

test('WhatsApp signatures bind raw bytes and only the configured business scope is accepted', () => {
  const raw = Buffer.from('{"test":true}'), secret = 'test-secret';
  const signature = 'sha256=' + createHmac('sha256', secret).update(raw).digest('hex');
  assert.equal(model.verifyMetaSignature(raw, signature, secret), true);
  assert.equal(model.verifyMetaSignature(Buffer.from('{"test":false}'), signature, secret), false);
  assert.equal(model.verifyMetaSignature(raw, signature, ''), false);
  const config = { wabaId: '123', phoneNumberId: '456' };
  const body = { object: 'whatsapp_business_account', entry: [{ id: '123', changes: [{ field: 'messages', value: { metadata: { phone_number_id: '456' }, messages: [{ id: 'wamid.test1', from: '233200000001', type: 'text', text: { body: 'Cannot log in' }, timestamp: String(Math.floor(Date.now() / 1000)) }] } }] }] };
  assert.equal(whatsappEvents(body, config).length, 1);
  assert.equal(whatsappEvents(body, { ...config, wabaId: 'other' }).length, 0);
  assert.equal(whatsappEvents(body, { ...config, phoneNumberId: 'other' }).length, 0);
  assert.equal(model.withinWhatsAppWindow(new Date(Date.now() - 24 * 3600_000).toISOString()), false);
});
async function inbound(id, text, phone = '+233200000001') {
  const ref = db.doc(`_supportWhatsappEvents/${id}`);
  await ref.create({ kind: 'inbound', providerId: id, phone, text, receivedAt: new Date().toISOString(), createdAt: new Date().toISOString(), status: 'queued' });
  await processWhatsappEvent(ref); return ref;
}
test('WhatsApp duplicate receipts cannot create duplicate replies; human handoff pauses automation', async () => {
  const ref = await inbound('wa-test-first', 'Cannot log in'); await processWhatsappEvent(ref);
  const contact = await db.doc(`_supportWhatsappContacts/${model.digest('+233200000001')}`).get();
  const c = db.doc(`supportCases/${contact.get('caseId')}`);
  assert.equal((await c.get()).get('messageCount'), 2);
  await inbound('wa-test-human', 'HUMAN'); assert.equal((await c.get()).get('humanRequested'), true);
  await inbound('wa-test-after-human', 'My email is example@example.test');
  assert.equal((await db.doc('_supportWhatsappOutbox/auto_wa-test-after-human').get()).exists, false);
  await inbound('wa-test-solved', 'SOLVED'); assert.equal((await c.get()).get('status'), 'resolved');
  await inbound('wa-test-reopen', 'Cannot sign in again');
  assert.equal((await c.get()).get('status'), 'awaiting_member');
  assert.equal((await db.doc('_supportWhatsappOutbox/auto_wa-test-reopen').get()).exists, true);
});
test('WhatsApp sends are held outside the reply window and after STOP, with no SMS fallback', async () => {
  await db.doc('_supportConfig/whatsapp').set({ enabled: true, provider: 'meta', wabaId: '123', phoneNumberId: '456', apiVersion: 'v25.0' });
  const contactRef = db.doc(`_supportWhatsappContacts/${model.digest('+233200000001')}`);
  const contact = await contactRef.get(); const caseId = contact.get('caseId');
  const queued = db.doc('_supportWhatsappOutbox/auto_wa-test-first');
  await contactRef.update({ lastInboundAt: new Date(Date.now() - 25 * 3600_000).toISOString() });
  let called = 0;
  await deliverWhatsapp(queued, 'test-token', async () => { called++; throw new Error('should not send'); });
  assert.equal(called, 0); assert.equal((await queued.get()).get('reason'), 'outside_reply_window');
  await inbound('wa-test-stop', 'STOP');
  const stopped = db.doc('_supportWhatsappOutbox/stopped-test');
  await db.doc(`supportCases/${caseId}/messages/stopped-test`).set({ text: 'test' });
  await stopped.create({ to: '+233200000001', caseId, messageId: 'stopped-test', text: 'test', status: 'queued' });
  await deliverWhatsapp(stopped, 'test-token', async () => { called++; throw new Error('should not send'); });
  assert.equal(called, 0); assert.equal((await stopped.get()).get('reason'), 'opted_out');
});
test('WhatsApp acceptance is not delivery; retries never send twice and failed transport stays uncertain', async () => {
  await inbound('wa-send-first', 'Cannot sign in', '+233200000002');
  const ref = db.doc('_supportWhatsappOutbox/auto_wa-send-first'); let called = 0;
  const send = async (_url, options) => { called++; const body = JSON.parse(options.body); assert.equal(body.messaging_product, 'whatsapp'); return new Response(JSON.stringify({ messages: [{ id: 'wamid.sent-test' }] }), { status: 200 }); };
  await Promise.all([deliverWhatsapp(ref, 'test-token', send), deliverWhatsapp(ref, 'test-token', send)]);
  assert.equal(called, 1); assert.equal((await ref.get()).get('status'), 'accepted');
  const delivery = db.doc('_supportWhatsappEvents/delivered-test'); await delivery.create({ kind: 'delivery', providerId: 'wamid.sent-test', recipient: '233200000002', delivery: 'delivered', status: 'queued', createdAt: new Date().toISOString() });
  await processWhatsappEvent(delivery); assert.equal((await ref.get()).get('status'), 'delivered');
  await inbound('wa-send-timeout', 'HUMAN', '+233200000002');
  const unknown = db.doc('_supportWhatsappOutbox/auto_wa-send-timeout');
  await deliverWhatsapp(unknown, 'test-token', async () => { throw new Error('timeout'); });
  await deliverWhatsapp(unknown, 'test-token', send);
  assert.equal((await unknown.get()).get('status'), 'unknown'); assert.equal(called, 1);
});
