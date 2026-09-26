import { randomBytes } from 'node:crypto';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, type DocumentReference } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { HttpsError, onCall, onRequest, type Request } from 'firebase-functions/v2/https';
import type { Response } from 'express';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { requireAuth, requireRole } from './auth.js';
import { CONTRIBUTOR_CALL_OPTIONS, guarded } from './contributor-common.js';
import { consumeRateLimit } from './rate-limit.js';
import { sendMail, SMTP_PASSWORD, teamInbox } from './email.js';
import { clean, digest, escapeHtml, redactSupportText, SUPPORT_CATEGORIES, SUPPORT_ORIGIN, SUPPORT_STATUSES, SUPPORT_URL, supportGuidance, validEmail, validId, validKey } from './support-model.js';

const options = { ...CONTRIBUTOR_CALL_OPTIONS };
const timestamp = () => new Date().toISOString();
const caseRef = (id: string) => getFirestore().doc(`supportCases/${id}`);
const reference = () => `IW-${randomBytes(5).toString('hex').toUpperCase()}`;

export function supportEmailJob(caseId: string, type: string, to: string, text: string) {
  return { caseId, type, to, text, status: 'queued', createdAt: timestamp() };
}

/** Only trusted workers call this. Recovery is delivered solely to the mailbox. */
export async function queueSupportRecovery(email: string, caseId: string, requestId: string) {
  const ref = getFirestore().doc(`_supportEmailOutbox/${digest(`reset:${caseId}:${requestId}`)}`);
  if ((await ref.get()).exists) return;
  await consumeRateLimit('supportRecoveryEmail', digest(email), 3, 60 * 60_000);
  try { await ref.create(supportEmailJob(caseId, 'recovery', email, '')); }
  catch (error) { if ((error as {code?: number}).code !== 6) throw error; }
}

async function portalCase(id: string, key: string) {
  if (!validId(id) || !validKey(key)) throw new HttpsError('permission-denied', 'This private support link is invalid.');
  const snap = await caseRef(id).get();
  if (!snap.exists || snap.get('accessHash') !== digest(key) || snap.get('channel') !== 'portal') {
    throw new HttpsError('permission-denied', 'This private support link is invalid.');
  }
  return snap;
}

/** No account existence, account diagnostics or credentials leave this endpoint. */
export async function supportPortalHandler(req: Request, res: Response) {
  res.set('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.status(405).json({ error: 'Use POST.' }); return; }
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body) || (req.rawBody?.length || 0) > 12_000) { res.status(400).json({ error: 'Invalid request.' }); return; }
  const data = req.body as Record<string, unknown>;
  const action = clean(data.action, 24), id = clean(data.id, 80), key = clean(data.key, 80);
  try {
    await consumeRateLimit('supportRequest', digest(req.ip || 'unknown'), 80);
    if (action === 'config') {
      const config = await getFirestore().doc('_supportConfig/whatsapp').get();
      res.json({ whatsappUrl: config.get('enabled') === true && /^\+[1-9]\d{7,14}$/.test(config.get('number') || '') ? `https://wa.me/${String(config.get('number')).slice(1)}` : null }); return;
    }
    if (action === 'create') {
      const email = clean(data.email, 254).toLowerCase(), name = clean(data.name, 100), category = clean(data.category, 30);
      const description = redactSupportText(clean(data.description));
      if (!validEmail(email) || !name || description.length < 8 || !validKey(key) || !SUPPORT_CATEGORIES.includes(category as typeof SUPPORT_CATEGORIES[number]) || data.consent !== true || clean(data.website)) {
        res.status(400).json({ error: 'Enter your name, invited email and a short description, and agree to being contacted about this case.' }); return;
      }
      const ref = caseRef(digest(key).slice(0, 32));
      if (!(await ref.get()).exists) {
        await consumeRateLimit('supportCreateIp', digest(req.ip || 'unknown'), 10, 60 * 60_000);
        await consumeRateLimit('supportCreateEmail', digest(email), 3, 60 * 60_000);
        const now = timestamp(), code = reference();
        await getFirestore().runTransaction(async tx => {
          if ((await tx.get(ref)).exists) return;
          tx.create(ref, { reference: code, accessHash: digest(key), channel: 'portal', email, name, category, status: category === 'payment' ? 'open' : 'awaiting_member', assignedTo: '', humanRequested: category === 'payment', contactVerified: false, consentAt: now, messageCount: 2, createdAt: now, updatedAt: now, lastMemberAt: now });
          tx.create(ref.collection('messages').doc('initial'), { author: 'member', text: description, createdAt: now });
          tx.create(ref.collection('messages').doc('guidance'), { author: 'assistant', text: supportGuidance(category), createdAt: new Date(Date.parse(now) + 1).toISOString() });
          tx.create(getFirestore().doc(`_supportEmailOutbox/${ref.id}_team`), supportEmailJob(ref.id, 'team', teamInbox(), `New ${category} support case ${code}. Open Admin → Contributors → Issues → Support inbox. Contact details are unverified. No account change has been authorized.`));
        });
      }
      const saved = await ref.get();
      res.json({ id: ref.id, reference: saved.get('reference') }); return;
    }
    const snap = await portalCase(id, key);
    const ref = snap.ref;
    if (action === 'get') {
      const messages = await ref.collection('messages').orderBy('createdAt').limit(100).get();
      res.json({ id, reference: snap.get('reference'), status: snap.get('status'), category: snap.get('category'), humanRequested: snap.get('humanRequested'), messages: messages.docs.map(d => ({ id: d.id, author: d.get('author'), text: d.get('text'), createdAt: d.get('createdAt') })) }); return;
    }
    const requestId = clean(data.requestId, 80);
    if (!validId(requestId)) throw new HttpsError('invalid-argument', 'A request reference is required.');
    if (action === 'reset') {
      await queueSupportRecovery(String(snap.get('email')), id, requestId);
      res.json({ notice: 'If this address has an eligible contributor account, recovery instructions will be sent to its mailbox. Check Inbox and Spam. Keep this case open if they do not arrive.' }); return;
    }
    if (!['reply', 'human', 'resolve'].includes(action)) throw new HttpsError('invalid-argument', 'Unknown support action.');
    const body = action === 'human' ? 'Please connect me with a team member.' : action === 'resolve' ? 'I confirm that my problem is solved.' : redactSupportText(clean(data.text));
    if (body.length < 2) throw new HttpsError('invalid-argument', 'Enter a message.');
    await getFirestore().runTransaction(async tx => {
      const current = await tx.get(ref), message = ref.collection('messages').doc(requestId);
      if ((await tx.get(message)).exists) return;
      if (Number(current.get('messageCount')) >= 98) throw new HttpsError('resource-exhausted', 'This case has reached its message limit. Contact hi@indigenworld.com and quote your reference.');
      const now = timestamp();
      tx.create(message, { author: 'member', text: body, createdAt: now });
      tx.update(ref, { status: action === 'resolve' ? 'resolved' : 'open', humanRequested: action === 'resolve' ? false : true, updatedAt: now, lastMemberAt: now, messageCount: Number(current.get('messageCount')) + 1, ...(action === 'resolve' ? { resolvedAt: now, resolution: 'member_confirmed' } : {}) });
      if (action !== 'resolve') tx.create(getFirestore().doc(`_supportEmailOutbox/${id}_${requestId}`), supportEmailJob(id, 'team', teamInbox(), `Support case ${snap.get('reference')} needs a team reply. Open Admin → Contributors → Issues → Support inbox.`));
    });
    res.json({ ok: true });
  } catch (error) {
    const code = error instanceof HttpsError ? error.code : 'internal';
    const status = code === 'resource-exhausted' ? 429 : code === 'permission-denied' ? 403 : code === 'invalid-argument' ? 400 : 500;
    if (status === 500) logger.error('Support request failed', { code, action });
    res.status(status).json({ error: error instanceof HttpsError ? error.message : 'Support could not save this request. Please retry, or email hi@indigenworld.com.' });
  }
}
export const supportPortal = onRequest({ region: 'us-central1', invoker: 'public', cors: [SUPPORT_ORIGIN, /^http:\/\/(?:localhost|127\.0\.0\.1):\d+$/], timeoutSeconds: 30, maxInstances: 10 }, supportPortalHandler);

export const listSupportCases = onCall(options, guarded('listSupportCases', async req => {
  requireRole(req, 'admin');
  const cases = await getFirestore().collection('supportCases').orderBy('updatedAt', 'desc').limit(100).get();
  const config = await getFirestore().doc('_supportConfig/whatsapp').get();
  return { cases: cases.docs.map(d => {
    const { accessHash: _private, ...data } = d.data();
    return { id: d.id, ...data };
  }), whatsapp: { enabled: config.get('enabled') === true, number: config.get('number') || '', lastInboundAt: config.get('lastInboundAt') || '', lastDeliveryAt: config.get('lastDeliveryAt') || '' } };
}));

export const getSupportCase = onCall(options, guarded('getSupportCase', async req => {
  requireRole(req, 'admin');
  const id = clean(req.data?.id, 80);
  if (!validId(id)) throw new HttpsError('invalid-argument', 'Invalid case.');
  const snap = await caseRef(id).get();
  if (!snap.exists) throw new HttpsError('not-found', 'Case not found.');
  const messages = await snap.ref.collection('messages').orderBy('createdAt').limit(100).get();
  let account: Record<string, unknown> | null = null;
  if (validEmail(snap.get('email') || '')) {
    try {
      const user = await getAuth().getUserByEmail(snap.get('email'));
      const contributor = await getFirestore().doc(`contributorAccounts/${user.uid}`).get();
      account = { disabled: user.disabled, emailVerified: user.emailVerified, invited: contributor.exists, status: contributor.get('status') || '', activationPending: contributor.get('requiresPasswordChange') === true, lastSignIn: user.metadata.lastSignInTime || '', activatedAt: contributor.get('activatedAt') || '' };
    } catch (error) { if ((error as {code?: string}).code !== 'auth/user-not-found') throw error; }
  }
  return { messages: messages.docs.map(d => ({ id: d.id, ...d.data() })), account };
}));

export const updateSupportCase = onCall(options, guarded('updateSupportCase', async req => {
  requireRole(req, 'admin');
  const actor = requireAuth(req), id = clean(req.data?.id, 80), requestId = clean(req.data?.requestId, 80);
  const status = clean(req.data?.status, 30), reply = redactSupportText(clean(req.data?.reply)), resolution = clean(req.data?.resolution, 300);
  if (!validId(id) || !validId(requestId) || !SUPPORT_STATUSES.includes(status as typeof SUPPORT_STATUSES[number])) throw new HttpsError('invalid-argument', 'Choose a valid case and status.');
  if (status === 'resolved' && resolution.length < 8) throw new HttpsError('invalid-argument', 'Record how resolution was confirmed. Sending instructions alone does not resolve a case.');
  await consumeRateLimit('supportAdmin', actor, 30);
  const db = getFirestore(), ref = caseRef(id), audit = db.doc(`auditLogs/support_${id}_${requestId}`);
  await db.runTransaction(async tx => {
    if ((await tx.get(audit)).exists) return;
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError('not-found', 'Case not found.');
    if (reply && Number(snap.get('messageCount')) >= 98) throw new HttpsError('resource-exhausted', 'This case has reached its message limit.');
    const now = timestamp();
    tx.update(ref, { status, updatedAt: now, humanRequested: true, ...(req.data?.assignToMe ? { assignedTo: actor } : {}), ...(status === 'resolved' ? { resolvedAt: now, resolution } : {}), messageCount: Number(snap.get('messageCount')) + (reply ? 1 : 0) });
    tx.create(audit, { actor, action: 'support.case.update', targetId: id, status, createdAt: now });
    if (reply) {
      const message = ref.collection('messages').doc(requestId);
      tx.create(message, { author: 'team', text: reply, createdAt: now, delivery: 'queued' });
      const channel = snap.get('channel') === 'whatsapp' ? 'Whatsapp' : 'Email';
      tx.create(db.doc(`_support${channel}Outbox/${id}_${requestId}`), {
        ...supportEmailJob(id, 'reply', snap.get('channel') === 'whatsapp' ? snap.get('phone') : snap.get('email'), reply), messageId: requestId,
      });
    }
  });
  return { ok: true };
}));

/** SMTP has no idempotency API: never automatically resend an uncertain send. */
export async function deliverSupportEmail(ref: DocumentReference, mailer = sendMail) {
  const db = getFirestore();
  const job = await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (snap.get('status') !== 'queued') return null;
    tx.update(ref, { status: 'sending', attemptedAt: timestamp() });
    return snap.data()!;
  });
  if (!job) return;
  let text = String(job.text), subject = 'Indigen World support';
  const ticket = await caseRef(job.caseId).get();
  if (!ticket.exists) { await ref.update({ status: 'cancelled', completedAt: timestamp() }); return; }
  const code = String(ticket.get('reference') || 'Support');
  if (job.type === 'recovery') {
    try {
      const user = await getAuth().getUserByEmail(job.to);
      const account = await db.doc(`contributorAccounts/${user.uid}`).get();
      if (user.disabled || account.get('status') !== 'active') { await ref.update({ status: 'not_eligible', completedAt: timestamp() }); return; }
      const link = await getAuth().generatePasswordResetLink(job.to, { url: `${SUPPORT_ORIGIN}/contributor` });
      text = `A password reset was requested for your Indigen World contributor account.\n\nChoose your new password using this private link:\n${link}\n\nIf you did not request this, you can ignore this email. Your password has not changed. Never share this link.\n\nFor help: ${SUPPORT_URL}\nCase: ${code}`;
      subject = 'Reset your Indigen World password';
    } catch (error) {
      if ((error as {code?: string}).code === 'auth/user-not-found') { await ref.update({ status: 'not_eligible', completedAt: timestamp() }); return; }
      await ref.update({ status: 'failed', failure: 'recovery_unavailable', completedAt: timestamp() });
      await ticket.ref.update({ needsAttention: true, deliveryProblem: 'recovery_unavailable', updatedAt: timestamp() }); return;
    }
  } else subject = `Indigen World support · ${code}`;
  const accepted = await mailer({ to: job.to, subject, text, html: `<div style="font-family:Arial,sans-serif;line-height:1.6;white-space:pre-wrap">${escapeHtml(text)}</div>` });
  const status = accepted ? 'accepted' : 'failed';
  await ref.update({ status, completedAt: timestamp() });
  if (job.messageId) await caseRef(job.caseId).collection('messages').doc(job.messageId).update({ delivery: status });
  if (!accepted) await caseRef(job.caseId).update({ needsAttention: true, deliveryProblem: 'email_failed', updatedAt: timestamp() });
}

export const onSupportEmailCreated = onDocumentCreated({ document: '_supportEmailOutbox/{job}', region: 'us-central1', secrets: [SMTP_PASSWORD], retry: true, maxInstances: 3 }, async event => {
  if (event.data) await deliverSupportEmail(event.data.ref);
});

/** Team reminders only; no unsolicited contributor follow-ups. */
export const supportEscalationSweep = onSchedule({ schedule: 'every 60 minutes', region: 'us-central1', timeZone: 'Etc/UTC' }, async () => {
  const db = getFirestore();
  const cutoff = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
  const cases = await db.collection('supportCases').where('status', 'in', ['open', 'in_progress', 'awaiting_member']).where('updatedAt', '<', cutoff).orderBy('updatedAt').limit(100).get();
  const day = timestamp().slice(0, 10);
  for (const item of cases.docs) {
    const job = db.doc(`_supportEmailOutbox/${item.id}_reminder_${day}`);
    try { await job.create(supportEmailJob(item.id, 'team', teamInbox(), `Support case ${item.get('reference')} remains ${item.get('status')}. Review it in the support inbox; do not mark it resolved without evidence.`)); }
    catch (error) { if ((error as {code?: number}).code !== 6) throw error; }
  }
  const stuck = await db.collection('_supportEmailOutbox').where('status', '==', 'sending').where('attemptedAt', '<', new Date(Date.now() - 10 * 60_000).toISOString()).limit(100).get();
  for (const item of stuck.docs) {
    await item.ref.update({ status: 'unknown' });
    await caseRef(item.get('caseId')).update({ needsAttention: true, deliveryProblem: 'email_delivery_unknown' });
  }
  const whatsappStuck = await db.collection('_supportWhatsappOutbox').where('status', '==', 'sending').where('attemptedAt', '<', new Date(Date.now() - 10 * 60_000).toISOString()).limit(100).get();
  for (const item of whatsappStuck.docs) {
    await db.runTransaction(async tx => {
      const current = await tx.get(item.ref);
      if (current.get('status') !== 'sending') return;
      tx.update(item.ref, { status: 'unknown' });
      tx.update(caseRef(item.get('caseId')), { needsAttention: true, deliveryProblem: 'whatsapp_delivery_unknown' });
      tx.update(caseRef(item.get('caseId')).collection('messages').doc(item.get('messageId')), { delivery: 'unknown' });
    });
  }
});
