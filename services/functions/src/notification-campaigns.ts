import { createHash } from 'node:crypto';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { callerClaims, isOwnerSuperAdmin, onStaffCall, requireAuth, requireRole } from './auth.js';
const now = () => new Date().toISOString();
const routeAllowed = (route: unknown) => typeof route === 'string' && /^\/(?:notifications|shop(?:\/(?:product|category|order)\/[\w%-]+)?|post\/[\w-]+|)$/.test(route);
export const notificationCampaignAdmin = onStaffCall({ region: 'us-central1', invoker: 'public', enforceAppCheck: process.env.ENFORCE_APP_CHECK === 'true' }, async (req) => {
  const uid = requireAuth(req); requireRole(req, 'admin');
  const data = req.data ?? {}, db = getFirestore();
  if (data.operation === 'list') return { items: (await db.collection('notificationCampaigns').orderBy('updatedAt', 'desc').limit(100).get()).docs.map((d) => ({ id: d.id, ...d.data() })) };
  const id = String(data.id ?? db.collection('_').doc().id);
  if (!/^[\w-]{1,100}$/.test(id)) throw new HttpsError('invalid-argument', 'Invalid campaign ID.');
  const ref = db.collection('notificationCampaigns').doc(id);
  if (data.operation === 'save') {
    const value = data.value ?? {};
    if (typeof value.title !== 'string' || !value.title.trim() || value.title.length > 120 || typeof value.body !== 'string' || !value.body.trim() || value.body.length > 1000 || !routeAllowed(value.route)) throw new HttpsError('invalid-argument', 'Add a title, message and supported in-app destination.');
    let imageUrl = '';
    if (value.assetId) { const asset = await db.collection('collectionMediaAssets').doc(String(value.assetId)).get(); if (asset.get('status') !== 'published') throw new HttpsError('failed-precondition', 'Finish the image upload before saving.'); imageUrl = asset.get('url'); }
    const draft = { title: value.title.trim(), body: value.body.trim(), route: value.route, assetId: value.assetId ?? null, imageUrl, segment: value.segment === 'all' ? 'all' : 'self', promotional: true, scheduledAt: value.scheduledAt || now() };
    const revision = createHash('sha256').update(JSON.stringify(draft)).digest('hex');
    await db.runTransaction(async (tx) => { const old = await tx.get(ref); if (old.exists && old.get('status') !== 'draft') throw new HttpsError('failed-precondition', 'Create a new draft to change a queued campaign.'); tx.set(ref, { ...draft, revision, status: 'draft', ownerUid: uid, updatedAt: now() }); });
    return { id, revision };
  }
  return db.runTransaction(async (tx) => {
    const campaign = (await tx.get(ref)).data(); if (!campaign) throw new HttpsError('not-found', 'Campaign not found.');
    if (data.operation === 'cancel') {
      if (campaign.status !== 'scheduled') throw new HttpsError('failed-precondition', 'Only a campaign that has not begun dispatch can be cancelled.');
      tx.update(ref, { status: 'cancelled', updatedAt: now() }); return { id, status: 'cancelled' };
    }
    if (data.operation === 'queue' || data.operation === 'testSelf') {
      if (data.revision !== campaign.revision || campaign.status !== 'draft') throw new HttpsError('failed-precondition', 'Review the current saved draft before dispatch.');
      if (data.operation === 'queue' && campaign.segment === 'all' && req.auth?.token.broadcast !== true && !isOwnerSuperAdmin(callerClaims(req))) throw new HttpsError('permission-denied', 'Broadcast permission is required. You can send a test to yourself.');
      const scheduledAt = data.operation === 'testSelf' ? now() : campaign.scheduledAt;
      if (!Number.isFinite(Date.parse(scheduledAt))) throw new HttpsError('invalid-argument', 'Choose a valid schedule.');
      tx.update(ref, { status: 'scheduled', scheduledAt, segment: data.operation === 'testSelf' ? 'self' : campaign.segment, reviewedRevision: campaign.revision, reviewedBy: uid, dispatchAfter: null, updatedAt: now() });
      tx.create(db.collection('auditLogs').doc(), { action: 'notificationCampaign.queued', campaignId: id, actorUid: uid, createdAt: now() }); return { id, status: 'scheduled' };
    }
    throw new HttpsError('invalid-argument', 'Unsupported notification campaign action.');
  });
});
export const dispatchNotificationCampaigns = onSchedule({ schedule: 'every 1 minutes', region: 'us-central1', timeoutSeconds: 120 }, async () => {
  const db = getFirestore(), queued = await db.collection('notificationCampaigns').where('status', 'in', ['scheduled', 'dispatching']).where('scheduledAt', '<=', now()).limit(10).get();
  for (const row of queued.docs) {
    const campaign = await db.runTransaction(async (tx) => { const fresh = (await tx.get(row.ref)).data(); if (!fresh || !['scheduled', 'dispatching'].includes(fresh.status) || fresh.leaseUntil > now()) return null; tx.update(row.ref, { status: 'dispatching', leaseUntil: new Date(Date.now() + 120000).toISOString() }); return fresh; });
    if (!campaign) continue;
    let recipients: FirebaseFirestore.DocumentSnapshot[] = [];
    if (campaign.segment === 'self') recipients = [await db.collection('communityProfiles').doc(campaign.ownerUid).get()];
    else {
      let query = db.collection('communityProfiles').orderBy('__name__').limit(100);
      if (campaign.dispatchAfter) query = query.startAfter(campaign.dispatchAfter);
      recipients = (await query.get()).docs;
    }
    for (const profile of recipients) {
      if (!profile.exists || ['suspended', 'revoked'].includes(profile.get('status')) || (campaign.segment !== 'self' && profile.get('notificationPrefs.promotions') !== true)) continue;
      const notificationId = `campaign_${row.id}_${profile.id}`, ref = db.collection('communityNotifications').doc(notificationId);
      try { await ref.create({ id: notificationId, eventKey: notificationId, payloadVersion: 2, recipientId: profile.id, type: 'announcement', title: campaign.title, body: campaign.body, route: campaign.route, imageUrl: campaign.imageUrl, category: 'system', promotional: campaign.segment !== 'self', testToSelf: campaign.segment === 'self', read: false, createdAt: FieldValue.serverTimestamp() }); }
      catch (error) { if ((error as { code?: number }).code !== 6) throw error; }
    }
    await row.ref.update({ status: campaign.segment === 'self' || recipients.length < 100 ? 'records_created' : 'dispatching', dispatchAfter: recipients.at(-1)?.id ?? null, leaseUntil: null, updatedAt: now(), recordsProcessed: FieldValue.increment(recipients.length) });
  }
});
