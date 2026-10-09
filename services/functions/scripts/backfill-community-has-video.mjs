/**
 * Gives every existing community post a `hasVideo` flag.
 *
 *     node services/functions/scripts/backfill-community-has-video.mjs            # dry run
 *     node services/functions/scripts/backfill-community-has-video.mjs --commit   # writes
 *
 * Uses Application Default Credentials, so run `gcloud auth application-default
 * login` first if it refuses to start.
 *
 * ── Why ────────────────────────────────────────────────────────────────────
 * Explore shows community posts only by their video. It used to find them by
 * reading the Community tab's whole feed and keeping the few that had one, so
 * every page it fetched yielded a handful of reels and the feed ran dry and
 * started repeating itself. From 0.1.28 the app asks Firestore for videos
 * directly — `hasVideo == true`, `isReply == false`, newest first — and every
 * post written by that build carries the flag. This gives it to everything
 * written before.
 *
 * ── Order of operations ───────────────────────────────────────────────────
 * Run this BEFORE deploying the composite index (hasVideo, isReply, createdAt
 * desc) in firebase/firestore.indexes.json. Until the index exists the app's
 * query is refused and it falls back to the main feed, which is what Explore
 * read before. The moment the index is live the app trusts the flag, and a
 * post without it simply does not appear in Explore.
 *
 * ── What it touches ───────────────────────────────────────────────────────
 * Only `hasVideo`, merged, and only where it is missing or wrong — so a re-run
 * writes nothing, and a run after a partial failure finishes the job. Private
 * community posts live in a subcollection that Explore never reads and are
 * left alone. The post triggers in functions fire on create only, so updating
 * a post here sends no notification and summons no Kawuri reply.
 */

import { applicationDefault, cert, initializeApp } from 'firebase-admin/app';
import { FieldPath, getFirestore } from 'firebase-admin/firestore';

const PROJECT_ID = process.env.GCLOUD_PROJECT || 'project-kassena-7e026';
const commit = process.argv.includes('--commit');

/** Firestore's own ceiling on one batch, with room to spare. */
const BATCH_LIMIT = 400;

/** How many posts are read per page, so a large collection is never held whole. */
const PAGE_SIZE = 500;

/** The same rule the app writes with: any attached item whose type is video. */
export function hasVideo(data) {
  const media = data?.media;
  return Array.isArray(media) && media.some((item) => item?.type === 'video');
}

async function main() {
  initializeApp({
    projectId: PROJECT_ID,
    credential: process.env.GOOGLE_APPLICATION_CREDENTIALS
      ? cert(process.env.GOOGLE_APPLICATION_CREDENTIALS)
      : applicationDefault(),
  });
  const db = getFirestore();
  const posts = db.collection('communityPosts');

  let read = 0;
  let videos = 0;
  let alreadyRight = 0;
  const writes = [];

  let last = null;
  for (;;) {
    let page = posts.orderBy(FieldPath.documentId()).limit(PAGE_SIZE);
    if (last) page = page.startAfter(last);
    const snapshot = await page.get();
    if (snapshot.empty) break;
    for (const doc of snapshot.docs) {
      read += 1;
      const data = doc.data();
      const flag = hasVideo(data);
      if (flag) videos += 1;
      if (data.hasVideo === flag) {
        alreadyRight += 1;
        continue;
      }
      writes.push({ id: doc.id, hasVideo: flag });
    }
    last = snapshot.docs[snapshot.docs.length - 1];
    if (snapshot.size < PAGE_SIZE) break;
  }

  console.log(`read ${read} posts; ${videos} carry a video`);
  console.log(`${alreadyRight} already flagged correctly, ${writes.length} to write`);

  if (!commit) {
    console.log('\nDry run. Pass --commit to write.');
    return;
  }

  for (let index = 0; index < writes.length; index += BATCH_LIMIT) {
    const batch = db.batch();
    for (const write of writes.slice(index, index + BATCH_LIMIT)) {
      // Merged, never replaced, and no timestamp bumped: this migration owns
      // one field and must not reorder anybody's feed.
      batch.set(posts.doc(write.id), { hasVideo: write.hasVideo }, { merge: true });
    }
    await batch.commit();
    console.log(`wrote ${Math.min(index + BATCH_LIMIT, writes.length)}/${writes.length}`);
  }
  console.log(`\ndone: ${writes.length} posts updated`);
}

// Run only when invoked directly, so the rule above can be imported by a test.
if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}` ||
    process.argv[1]?.endsWith('backfill-community-has-video.mjs')) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
