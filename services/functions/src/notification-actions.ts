import { createHash } from 'node:crypto';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { requireAuth } from './auth.js';
import { consumeRateLimit } from './rate-limit.js';
export const notificationAction = onCall({ region: 'us-central1', invoker: 'public', enforceAppCheck: process.env.ENFORCE_APP_CHECK === 'true' }, async (req) => {
  const uid = requireAuth(req), data = req.data ?? {}, db = getFirestore();
  if (data.recipientId !== uid || typeof data.notificationId !== 'string' || !/^[\w-]{1,200}$/.test(data.notificationId)) throw new HttpsError('permission-denied', 'This action belongs to another account.');
  await consumeRateLimit('notificationAction', uid, 80, 60000);
  return db.runTransaction(async (tx) => {
    const ref = db.collection('communityNotifications').doc(data.notificationId), row = await tx.get(ref);
    if (!row.exists || row.get('recipientId') !== uid) throw new HttpsError('not-found', 'This notification is no longer available.');
    if (data.action === 'read') { tx.update(ref, { read: true, readAt: FieldValue.serverTimestamp() }); return { ok: true }; }
    if (data.action === 'opened') { tx.update(ref, { openedAt: FieldValue.serverTimestamp() }); return { ok: true }; }
    const postId = row.get('actionTargetPostId') || row.get('postId');
    if (!['like', 'reply', 'quote', 'mention', 'post', 'thread_reply'].includes(row.get('type')) || typeof postId !== 'string') throw new HttpsError('failed-precondition', 'This notification does not support reactions or replies.');
    const postRef = db.collection('communityPosts').doc(postId), post = await tx.get(postRef);
    const profile = await tx.get(db.collection('communityProfiles').doc(uid));
    if (!post.exists || !profile.exists || post.get('deleted') === true || post.get('status') === 'removed' || ['suspended', 'revoked'].includes(profile.get('status'))) throw new HttpsError('failed-precondition', 'This content is no longer available.');
    if (post.get('communityVisibility') && post.get('communityVisibility') !== 'public') throw new HttpsError('permission-denied', 'Open this community in the app to continue.');
    const communityId = post.get('communityId');
    if (communityId) {
      const space = await tx.get(db.collection('communitySpaces').doc(String(communityId)));
      const membership = await tx.get(db.collection('communitySpaces').doc(String(communityId)).collection('memberships').doc(uid));
      if (space.get('status') !== 'active' || space.get('visibility') !== 'public' || membership.get('status') !== 'active') throw new HttpsError('permission-denied', 'Active community membership is required for this action.');
    }
    const authorId = post.get('authorId');
    const blocks = await Promise.all([tx.get(db.collection('communityBlocks').doc(`${uid}_${authorId}`)), tx.get(db.collection('communityBlocks').doc(`${authorId}_${uid}`))]);
    if (blocks.some((b) => b.exists)) throw new HttpsError('permission-denied', 'This content is unavailable.');
    if (data.action === 'like') {
      const edge = db.collection('communityLikes').doc(`${uid}_${postId}`), liked = await tx.get(edge);
      if (!liked.exists) { tx.create(edge, { uid, postId, createdAt: FieldValue.serverTimestamp() }); tx.update(postRef, { likeCount: FieldValue.increment(1) }); }
      return { ok: true, liked: true };
    }
    if (data.action === 'reply') {
      const text = String(data.text ?? '').trim();
      if (!text || text.length > 500 || typeof data.actionId !== 'string' || data.actionId.length > 120) throw new HttpsError('invalid-argument', 'Enter a reply of up to 500 characters.');
      const replyId = createHash('sha256').update(`${uid}:${row.id}:${data.actionId}`).digest('hex').slice(0, 40), replyRef = db.collection('communityPosts').doc(replyId);
      if ((await tx.get(replyRef)).exists) return { ok: true, postId: replyId };
      tx.create(replyRef, { authorId: uid, author: { displayName: profile.get('displayName') ?? '', username: profile.get('username') ?? '', avatarUrl: profile.get('avatarUrl') ?? null }, text, parentId: postId, isReply: true, rootId: post.get('rootId') || post.get('rootPostId') || postId, communityId: communityId ?? null, communityVisibility: 'public', communityName: post.get('communityName') ?? '', category: post.get('category') ?? 'general', media: [], likeCount: 0, replyCount: 0, repostCount: 0, quoteCount: 0, viewCount: 0, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
      tx.update(postRef, { replyCount: FieldValue.increment(1) }); return { ok: true, postId: replyId };
    }
    throw new HttpsError('invalid-argument', 'Unsupported notification action.');
  });
});
