import { randomBytes } from 'node:crypto';
import { getFirestore, type DocumentReference } from 'firebase-admin/firestore';
import { defineSecret } from 'firebase-functions/params';
import { onRequest } from 'firebase-functions/v2/https';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { classifySupport, clean, consentKeyword, digest, redactSupportText, SUPPORT_URL, supportGuidance, verifyMetaSignature, withinWhatsAppWindow } from './support-model.js';
import { supportEmailJob } from './support.js';
import { teamInbox } from './email.js';

export const SUPPORT_META_APP_SECRET = defineSecret('SUPPORT_META_APP_SECRET');
export const SUPPORT_META_VERIFY_TOKEN = defineSecret('SUPPORT_META_VERIFY_TOKEN');
export const SUPPORT_META_ACCESS_TOKEN = defineSecret('SUPPORT_META_ACCESS_TOKEN');
const now = () => new Date().toISOString();
type Data = Record<string, any>;
const record = (value: unknown): Data => value && typeof value === 'object' && !Array.isArray(value) ? value as Data : {};
const array = (value: unknown): unknown[] => Array.isArray(value) ? value.slice(0, 100) : [];

/** Only the configured WABA and business phone can create cases. No media is downloaded. */
export function whatsappEvents(body: unknown, config: Data): Data[] {
  const root = record(body), result: Data[] = [];
  if (root.object !== 'whatsapp_business_account' || !config.wabaId || !config.phoneNumberId) return result;
  for (const item of array(root.entry)) {
    const entry = record(item);
    if (entry.id !== config.wabaId) continue;
    for (const change of array(entry.changes)) {
      const c = record(change), value = record(c.value);
      if (c.field !== 'messages' || record(value.metadata).phone_number_id !== config.phoneNumberId) continue;
      for (const message of array(value.messages)) {
        const m = record(message), id = clean(m.id, 256), from = clean(m.from, 20);
        const at = Number(m.timestamp) * 1000;
        if (!id || !/^[1-9]\d{7,14}$/.test(from) || !Number.isFinite(at) || at > Date.now() + 60_000 || at < Date.now() - 7 * 86400_000) continue;
        result.push({ kind: 'inbound', providerId: id, phone: `+${from}`, text: m.type === 'text' ? redactSupportText(clean(record(m.text).body)) : '[Attachment received. Please describe the problem in text.]', receivedAt: new Date(at).toISOString() });
      }
      for (const status of array(value.statuses)) {
        const s = record(status), id = clean(s.id, 256), delivery = clean(s.status, 30);
        if (id && ['sent', 'delivered', 'read', 'failed'].includes(delivery)) result.push({ kind: 'delivery', providerId: id, delivery, recipient: clean(s.recipient_id, 20) });
      }
    }
  }
  return result.slice(0, 100);
}

export const supportWhatsappWebhook = onRequest({ region: 'us-central1', invoker: 'public', secrets: [SUPPORT_META_APP_SECRET, SUPPORT_META_VERIFY_TOKEN], maxInstances: 5, timeoutSeconds: 30 }, async (req, res) => {
  res.set('Cache-Control', 'no-store');
  if (req.method === 'GET') {
    const token = SUPPORT_META_VERIFY_TOKEN.value();
    if (token && req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === token && typeof req.query['hub.challenge'] === 'string') { res.status(200).send(req.query['hub.challenge']); return; }
    res.sendStatus(403); return;
  }
  if (req.method !== 'POST') { res.sendStatus(405); return; }
  if (!req.rawBody || req.rawBody.length > 256_000 || !verifyMetaSignature(req.rawBody, req.get('x-hub-signature-256') || '', SUPPORT_META_APP_SECRET.value())) { res.sendStatus(403); return; }
  const db = getFirestore(), config = (await db.doc('_supportConfig/whatsapp').get()).data() || {};
  if (config.enabled !== true || config.provider !== 'meta') { res.sendStatus(503); return; }
  try {
    for (const event of whatsappEvents(req.body, config)) {
      const key = digest(`${config.phoneNumberId}:${event.kind}:${event.providerId}:${event.delivery || ''}`);
      try { await db.doc(`_supportWhatsappEvents/${key}`).create({ ...event, status: 'queued', createdAt: now() }); }
      catch (error) { if ((error as {code?: number}).code !== 6) throw error; }
    }
    res.sendStatus(200);
  } catch { res.sendStatus(503); }
});

export async function processWhatsappEvent(ref: DocumentReference) {
  const db = getFirestore();
  await db.runTransaction(async tx => {
    const event = await tx.get(ref);
    if (event.get('status') !== 'queued') return;
    const data = event.data()!;
    if (data.kind === 'delivery') {
      const mapped = await tx.get(db.doc(`_supportWhatsappMessages/${digest(data.providerId)}`));
      // A status can race the send response. Leave queued for trigger retry.
      if (!mapped.exists) {
        if (Date.parse(event.get('createdAt')) < Date.now() - 10 * 60_000) { tx.update(ref, { status: 'unmatched' }); return; }
        throw new Error('Awaiting outbound message mapping');
      }
      if (mapped.get('recipient') !== data.recipient) { tx.update(ref, { status: 'ignored' }); return; }
      const job = db.doc(`_supportWhatsappOutbox/${mapped.get('jobId')}`), snap = await tx.get(job);
      const rank: Data = { accepted: 0, sent: 1, failed: 1, delivered: 2, read: 3 };
      if ((rank[data.delivery] ?? 0) >= (rank[snap.get('status')] ?? 0)) {
        tx.update(job, { status: data.delivery, completedAt: now() });
        tx.update(db.doc(`supportCases/${snap.get('caseId')}/messages/${snap.get('messageId')}`), { delivery: data.delivery });
        if (data.delivery === 'failed') tx.update(db.doc(`supportCases/${snap.get('caseId')}`), { needsAttention: true, deliveryProblem: 'whatsapp_failed' });
      }
      tx.update(ref, { status: 'processed' });
      tx.set(db.doc('_supportConfig/whatsapp'), { lastDeliveryAt: now() }, { merge: true });
      return;
    }
    const contact = db.doc(`_supportWhatsappContacts/${digest(data.phone)}`), previous = await tx.get(contact);
    const previousCase = previous.get('caseId') ? await tx.get(db.doc(`supportCases/${previous.get('caseId')}`)) : null;
    const reuse = previousCase?.exists && Number(previousCase.get('messageCount')) < 90;
    const ticket = reuse ? previousCase! : null;
    const caseId = ticket?.id || digest(data.providerId).slice(0, 32), caseRef = db.doc(`supportCases/${caseId}`);
    const code = ticket?.get('reference') || `IW-${randomBytes(5).toString('hex').toUpperCase()}`;
    const keyword = consentKeyword(data.text), category = ticket?.get('category') || classifySupport(data.text);
    const newConversation = !ticket || ticket.get('status') === 'resolved';
    const human = /\b(human|person|agent|team member|still|not working)\b/i.test(data.text) || category === 'payment' || (!newConversation && keyword === null);
    const optedOut = keyword === 'stop' || (keyword !== 'start' && previous.get('optedOut') === true);
    const solved = /^(solved|resolved|my problem is solved)[.!]?$/i.test(data.text.trim());
    const receivedAt = [data.receivedAt, previous.get('lastInboundAt') || ''].sort().at(-1)!;
    const text = solved ? 'Thank you for confirming. Your support case is now resolved. Send a new message if you need help again.'
      : human ? `Your case ${code} is with the Indigen World team. Please describe the issue without passwords or verification codes. Help is also available at ${SUPPORT_URL}.`
        : `Indigen World automatic support · ${code}\n\n${supportGuidance(category)}\n\nFor private password recovery: ${SUPPORT_URL}\nReply HUMAN for a person, SOLVED to confirm resolution, or STOP to stop replies.`;
    // Automation gives one initial answer. Once a person is involved, only team replies are sent.
    const reply = !optedOut && withinWhatsAppWindow(data.receivedAt) && (newConversation || solved || (human && !ticket?.get('humanRequested')) || keyword === 'start');
    tx.set(contact, { caseId, optedOut, lastInboundAt: receivedAt, updatedAt: now() }, { merge: true });
    tx.set(caseRef, { reference: code, channel: 'whatsapp', phone: data.phone, category, status: solved ? 'resolved' : human ? 'open' : 'awaiting_member', humanRequested: solved ? false : human, contactVerified: false, lastMemberAt: receivedAt, updatedAt: now(), messageCount: Number(ticket?.get('messageCount') || 0) + 1 + (reply ? 1 : 0), ...(!ticket ? { name: '', createdAt: now(), assignedTo: '' } : {}), ...(solved ? { resolution: 'member_confirmed', resolvedAt: now() } : {}) }, { merge: true });
    tx.create(caseRef.collection('messages').doc(ref.id), { author: 'member', text: data.text, createdAt: data.receivedAt });
    if (reply) {
      tx.create(caseRef.collection('messages').doc(`auto_${ref.id}`), { author: 'assistant', text, createdAt: now(), delivery: 'queued' });
      tx.create(db.doc(`_supportWhatsappOutbox/auto_${ref.id}`), { caseId, messageId: `auto_${ref.id}`, to: data.phone, text, status: 'queued', createdAt: now() });
    }
    if (newConversation || (human && !ticket?.get('humanRequested'))) tx.create(db.doc(`_supportEmailOutbox/wa_${ref.id}`), supportEmailJob(caseId, 'team', teamInbox(), `WhatsApp support case ${code} needs review. Open Admin → Contributors → Issues → Support inbox.`));
    tx.update(ref, { status: 'processed' });
    tx.set(db.doc('_supportConfig/whatsapp'), { lastInboundAt: now() }, { merge: true });
  });
}
export const onSupportWhatsappEvent = onDocumentCreated({ document: '_supportWhatsappEvents/{event}', region: 'us-central1', retry: true, maxInstances: 3 }, async event => { if (event.data) await processWhatsappEvent(event.data.ref); });

/** Meta has no send idempotency guarantee here: uncertain sends are held for review. */
export async function deliverWhatsapp(ref: DocumentReference, token: string, send: typeof fetch = fetch) {
  const db = getFirestore();
  const job = await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (snap.get('status') !== 'queued') return null;
    const config = await tx.get(db.doc('_supportConfig/whatsapp'));
    const contact = await tx.get(db.doc(`_supportWhatsappContacts/${digest(snap.get('to'))}`));
    const reason = !token || config.get('enabled') !== true || config.get('provider') !== 'meta' || !/^\d+$/.test(config.get('phoneNumberId') || '') || !/^v\d+\.0$/.test(config.get('apiVersion') || '') ? 'not_configured'
      : contact.get('optedOut') === true ? 'opted_out' : !withinWhatsAppWindow(contact.get('lastInboundAt') || '') ? 'outside_reply_window' : '';
    if (reason) {
      tx.update(ref, { status: 'held', reason, completedAt: now() });
      tx.update(db.doc(`supportCases/${snap.get('caseId')}/messages/${snap.get('messageId')}`), { delivery: `held_${reason}` });
      tx.update(db.doc(`supportCases/${snap.get('caseId')}`), { needsAttention: true, deliveryProblem: reason });
      return null;
    }
    tx.update(ref, { status: 'sending', attemptedAt: now() });
    return { ...snap.data()!, phoneNumberId: config.get('phoneNumberId'), apiVersion: config.get('apiVersion') } as Data;
  });
  if (!job) return;
  let status = 'unknown';
  try {
    const response = await send(`https://graph.facebook.com/${job.apiVersion}/${job.phoneNumberId}/messages`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to: String(job.to).replace(/^\+/, ''), type: 'text', text: { body: job.text, preview_url: false } }), signal: AbortSignal.timeout(20_000) });
    if (response.ok) {
      const body = record(await response.json()), providerId = clean(record(array(body.messages)[0]).id, 256);
      if (providerId) {
        await db.doc(`_supportWhatsappMessages/${digest(providerId)}`).set({ jobId: ref.id, recipient: String(job.to).slice(1) });
        status = 'accepted';
      }
    } else status = response.status >= 500 ? 'unknown' : 'failed';
  } catch { /* Do not log tokens, payloads or full provider errors. */ }
  // The delivery webhook may already have advanced this message past accepted.
  await db.runTransaction(async tx => {
    const current = await tx.get(ref);
    if (current.get('status') !== 'sending') return;
    tx.update(ref, { status, completedAt: now() });
    tx.update(db.doc(`supportCases/${job.caseId}/messages/${job.messageId}`), { delivery: status });
    if (status !== 'accepted') tx.update(db.doc(`supportCases/${job.caseId}`), { needsAttention: true, deliveryProblem: `whatsapp_${status}` });
  });
}
export const onSupportWhatsappOutbox = onDocumentCreated({ document: '_supportWhatsappOutbox/{job}', region: 'us-central1', secrets: [SUPPORT_META_ACCESS_TOKEN], retry: true, maxInstances: 3 }, async event => { if (event.data) await deliverWhatsapp(event.data.ref, SUPPORT_META_ACCESS_TOKEN.value()); });
