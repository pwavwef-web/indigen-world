import { getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { requireAuth, requireRole } from './auth.js';
const now = () => new Date().toISOString();
export const houseAdsAdmin = onCall({ region: 'us-central1', invoker: 'public', enforceAppCheck: process.env.ENFORCE_APP_CHECK === 'true' }, async (req) => {
  const uid = requireAuth(req); requireRole(req, 'admin');
  const data = req.data ?? {}, db = getFirestore();
  const organisationId = process.env.INDIGEN_HOUSE_ORGANISATION_ID ?? '';
  const profileRef = db.collection('advertiserProfiles').doc('house_indigen_world');
  if (data.operation === 'read') {
    const [profile, campaigns] = await Promise.all([profileRef.get(), db.collection('houseAdCampaigns').limit(100).get()]);
    return { profile: profile.data() ?? null, readiness: organisationId ? [] : ['Set INDIGEN_HOUSE_ORGANISATION_ID to the verified existing Indigen organisation/account ID.'], campaigns: campaigns.docs.map((d) => ({ id: d.id, ...d.data() })) };
  }
  if (!organisationId) throw new HttpsError('failed-precondition', 'The existing Indigen organisation/account must be configured first.');
  if (data.operation === 'ensureProfile') {
    return db.runTransaction(async (tx) => {
      const existing = await tx.get(profileRef);
      if (existing.exists) {
        if (existing.get('type') !== 'house' || existing.get('organisationId') !== organisationId) throw new HttpsError('failed-precondition', 'The reserved profile ID belongs to a different account. No record was overwritten.');
        return existing.data();
      }
      const profile = { type: 'house', organisationId, displayName: 'Indigen World', logoUrl: 'https://indigenworld.com/brand/indigen-world-mark.png', description: 'Updates and collections from Indigen World.', approvedHosts: ['indigenworld.com'], staffPermission: 'admin', createdAt: now() };
      tx.create(profileRef, profile); tx.create(db.collection('auditLogs').doc(), { action: 'houseAds.profile', actorUid: uid, createdAt: now() }); return profile;
    });
  }
  const profile = (await profileRef.get()).data();
  if (!profile || profile.type !== 'house' || profile.organisationId !== organisationId) throw new HttpsError('failed-precondition', 'Create the verified house-ad profile first.');
  if (data.operation === 'save') {
    const value = data.value ?? {}, id = String(data.id ?? db.collection('_').doc().id);
    if (!/^[\w-]{1,100}$/.test(id)) throw new HttpsError('invalid-argument', 'Invalid campaign identifier.');
    const destination = new URL(String(value.ctaUrl ?? ''));
    if (destination.protocol !== 'https:' || !profile.approvedHosts.includes(destination.hostname)) throw new HttpsError('invalid-argument', 'Choose a destination on an approved Indigen host.');
    if (!value.headline?.trim() || !value.body?.trim() || !['draft', 'published', 'paused', 'archived'].includes(value.status)) throw new HttpsError('invalid-argument', 'Add campaign text and a supported status.');
    if (!Number.isFinite(Date.parse(value.startsAt)) || !(Date.parse(value.endsAt) > Date.parse(value.startsAt))) throw new HttpsError('invalid-argument', 'Choose a valid schedule.');
    let imageUrl = '';
    if (value.assetId) { const asset = await db.collection('collectionMediaAssets').doc(String(value.assetId)).get(); if (asset.get('status') !== 'published') throw new HttpsError('failed-precondition', 'Choose a finalized image.'); imageUrl = asset.get('url'); }
    const placements = Array.isArray(value.placements) ? value.placements.filter((p: string) => ['community', 'explore', 'collection', 'post_comments'].includes(p)) : ['post_comments'];
    const campaign = { headline: String(value.headline).slice(0, 100), body: String(value.body).slice(0, 500), ctaLabel: String(value.ctaLabel ?? 'Learn more').slice(0, 40), ctaUrl: destination.toString(), startsAt: value.startsAt, endsAt: value.endsAt, placements, status: value.status, advertiserProfileId: profileRef.id, organisationId, assetId: value.assetId ?? null, updatedAt: now(), actorUid: uid };
    const batch = db.batch(); batch.set(db.collection('houseAdCampaigns').doc(id), campaign, { merge: true });
    batch.set(db.collection('adPlacements').doc(`house-${id}`), { campaignId: `house-${id}`, provider: 'house', campaignType: 'house', advertiserName: profile.displayName, advertiserLogoUrl: profile.logoUrl, headline: campaign.headline, body: campaign.body, ctaLabel: campaign.ctaLabel, ctaUrl: campaign.ctaUrl, creativeUrl: imageUrl, mediaType: 'image', placements, startsAt: campaign.startsAt, endsAt: campaign.endsAt, active: campaign.status === 'published', objective: 'visits' });
    batch.create(db.collection('auditLogs').doc(), { action: `houseAds.${value.status}`, targetId: id, actorUid: uid, createdAt: now() }); await batch.commit(); return { id };
  }
  throw new HttpsError('invalid-argument', 'Unsupported house campaign action.');
});
