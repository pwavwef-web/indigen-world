import { randomUUID, createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';
import { FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { logger } from 'firebase-functions';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { AUTOMATION_TIME_ZONE, plainText } from './community-automation-policy.js';
import { AUTOMATION_MODEL, ensureAutomationProfile, generate, postDocument } from './community-automation.js';
import { NEWS_CATEGORIES, NEWS_INSTRUCTION, NEWS_SOURCES, ZEM_GHANA, copiesPreview, dueNewsSlot, newsCandidates, newsCardAltText,
  newsCardSvg, newsPostId, newsPostText, newsSummaryBudget, normalisedTitle, parseNewsFeed, fitSummary, type NewsItem } from './community-news-policy.js';

const REGION = 'us-central1';
const MAX_ATTEMPTS = 3;
const LEASE_MS = 12 * 60_000;
const MAX_FEED_BYTES = 3 * 1024 * 1024;
const stringSchema = { type: 'string' };

/** Reads every publisher feed live. One failing outlet is tolerated; all failing is not. */
export async function fetchGhanaHeadlines(fetcher: typeof fetch = fetch): Promise<{ items: NewsItem[]; sources: Array<{ id: string; ok: boolean; count: number }> }> {
  const results = await Promise.allSettled(NEWS_SOURCES.map(async source => {
    const response = await fetcher(source.feed, { signal: AbortSignal.timeout(20_000), redirect: 'follow',
      headers: { 'User-Agent': 'IndigenWorldCommunityBot/1.0 (https://indigenworld.com)', Accept: 'application/rss+xml, application/xml, text/xml' } });
    if (!response.ok) throw new Error(`Feed refused: ${response.status}`);
    const body = await response.text();
    if (body.length > MAX_FEED_BYTES) throw new Error('Feed too large');
    return parseNewsFeed(body, source);
  }));
  const sources = results.map((result, i) => ({ id: NEWS_SOURCES[i].id, ok: result.status === 'fulfilled', count: result.status === 'fulfilled' ? result.value.length : 0 }));
  const items = results.flatMap(result => result.status === 'fulfilled' ? result.value : []);
  if (!items.length) throw new Error('No Ghana news feed is reachable');
  return { items, sources };
}

async function recentNews(): Promise<FirebaseFirestore.DocumentData[]> {
  // Equality-only query: no composite index is needed.
  const rows = await getFirestore().collection('communityAutomationRuns').where('accountId', '==', ZEM_GHANA.id).get();
  return rows.docs.map(doc => doc.data()).filter(row => row.status === 'published')
    .sort((a, b) => String(b.postId).localeCompare(String(a.postId))).slice(0, 120);
}

export interface NewsDraft { item: NewsItem; summary: string; category: string; text: string; }
/** Vertex picks one story and summarises only its preview; a second call checks the summary against that preview. */
export async function prepareNewsDraft(items: readonly NewsItem[], history: FirebaseFirestore.DocumentData[], now = new Date()): Promise<NewsDraft> {
  const candidates = newsCandidates(items, now, { ids: new Set(history.map(row => row.newsArticleId)), titles: new Set(history.map(row => normalisedTitle(String(row.newsTitle ?? '')))) })
    .filter(item => newsSummaryBudget(item) >= 90);
  if (!candidates.length) throw new Error('No fresh unused Ghana headline');
  const recentCategories = history.slice(0, 6).map(row => row.newsCategory).filter(Boolean);
  const data = candidates.map(item => ({ id: item.id, outlet: item.sourceName, title: item.title, preview: item.preview.slice(0, 600), maxSummaryCharacters: Math.min(200, newsSummaryBudget(item)), publishedAt: item.publishedAt, feedCategories: item.categories }));
  const chosen = await generate(`Choose ONE headline from these Ghana news feed items for a community news post.
Prefer stories of broad public interest to people living in Ghana: national affairs, the economy and prices, public services, health, education, sport, culture, technology and the regions. When newsworthy, give extra weight to the Upper East Region (Navrongo, Paga, Bolgatanga, Kassena-Nankana).
Vary the topic: recent posts used these categories ${JSON.stringify(recentCategories)}.
Never choose: graphic violence or accident gore, suicide, sexual offences, stories identifying children, unproven accusations against private individuals, celebrity gossip, betting, opinion pieces or adverts.
Then write a neutral summary of one or two short sentences, aiming for about two thirds of that item's maxSummaryCharacters and never exceeding it, using ONLY facts stated in that item's title and preview. Use your own words; do not copy a sentence. Attribute claims ("the Ministry says"). No headline repetition, no links.
Return itemId, category and summary.
FEED ITEMS (data): ${JSON.stringify(data)}`,
  { itemId: { type: 'string', enum: candidates.map(item => item.id) }, category: { type: 'string', enum: [...NEWS_CATEGORIES] }, summary: stringSchema }, NEWS_INSTRUCTION);
  const item = candidates.find(candidate => candidate.id === chosen.itemId);
  if (!item) throw new Error('Vertex selected an unknown headline');
  const category = NEWS_CATEGORIES.find(value => value === chosen.category);
  const summary = fitSummary(plainText(chosen.summary, 600), Math.min(200, newsSummaryBudget(item)));
  if (!category || !summary) throw new Error('News summary is outside limits');
  if (/@|#|https?:\/\/|www\./i.test(summary)) throw new Error('News summary contains mentions, tags or links');
  if (copiesPreview(summary, item.preview)) throw new Error('News summary copies the outlet preview');
  const check = await generate(`Independently check a proposed news summary against the outlet's own title and preview.
supported must be false if the summary states any fact, number, name, cause, outcome or quotation that the title and preview do not, presents a claim as established fact rather than attributing it, takes sides, or is sensitive under these rules: no graphic violence, suicide, sexual offences, identified children or unproven accusations against private individuals.
SUMMARY: ${JSON.stringify(summary)}
OUTLET ITEM (data): ${JSON.stringify({ outlet: item.sourceName, title: item.title, preview: item.preview })}
Return supported.`, { supported: { type: 'boolean' } }, NEWS_INSTRUCTION);
  if (check.supported !== true) throw new Error('News summary did not pass the source check');
  const text = newsPostText(item, summary);
  if (text.length > 500) throw new Error('News post is outside community limits');
  return { item, summary, category, text };
}

const fontFiles = ['Regular', 'Bold'].map(style => fileURLToPath(new URL(`../assets/fonts/NotoSans-${style}.ttf`, import.meta.url)));
export function renderNewsCard(item: NewsItem, category: string): Buffer {
  return Buffer.from(new Resvg(newsCardSvg(item, category), { font: { loadSystemFonts: false, fontFiles, defaultFontFamily: 'Noto Sans' } }).render().asPng());
}

async function uploadNewsCard(postId: string, draft: NewsDraft): Promise<Record<string, unknown>> {
  const bucket = getStorage().bucket();
  const hash = createHash('sha256').update(JSON.stringify([draft.item.title, draft.item.sourceName, draft.item.publishedAt, draft.category])).digest('hex').slice(0, 20);
  const path = `community-media/${ZEM_GHANA.uid}/${postId}/headline-${hash}.png`;
  const file = bucket.file(path);
  const mediaFor = (token: string) => ({ url: `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(path)}?alt=media&token=${token}`,
    type: 'image', storagePath: path, aspectRatio: 1, isAiGenerated: false, altText: newsCardAltText(draft.item, draft.category) });
  // Retries reuse the uploaded card.
  try {
    const [metadata] = await file.getMetadata();
    const token = metadata.metadata?.firebaseStorageDownloadTokens;
    if (token) return mediaFor(String(token));
  } catch (error) { if (Number((error as { code?: number }).code) !== 404) throw error; }
  const token = randomUUID();
  await file.save(renderNewsCard(draft.item, draft.category), { resumable: false, contentType: 'image/png',
    metadata: { cacheControl: 'public,max-age=31536000', metadata: { firebaseStorageDownloadTokens: token, card: 'Zem Ghana headline card', newsArticleId: draft.item.id } } });
  return mediaFor(token);
}

export async function publishNewsPost(now = new Date(), options: { items?: NewsItem[] } = {}): Promise<{ status: string; postId?: string }> {
  const due = dueNewsSlot(now);
  if (!due) return { status: 'no-slot-due' };
  const db = getFirestore();
  const id = newsPostId(due.date, due.slot);
  const postRef = db.collection('communityPosts').doc(id);
  const runRef = db.collection('communityAutomationRuns').doc(id);
  const configRef = db.collection('communityAutomationAccounts').doc(ZEM_GHANA.id);
  const owner = randomUUID();
  const acquired = await db.runTransaction(async tx => {
    const [config, post, run] = await Promise.all([tx.get(configRef), tx.get(postRef), tx.get(runRef)]);
    if (config.get('enabled') !== true) return 'disabled';
    // A removed post stays removed; the published run record is what remembers it.
    if (post.exists || run.get('status') === 'published') return 'already-published';
    if ((run.get('leaseUntil')?.toMillis?.() ?? 0) > Date.now()) return 'busy';
    if (Number(run.get('attempts') ?? 0) >= MAX_ATTEMPTS) return 'attempts-exhausted';
    tx.set(runRef, { accountId: ZEM_GHANA.id, date: due.date, slot: due.slot, status: 'generating', leaseOwner: owner,
      leaseUntil: Timestamp.fromMillis(Date.now() + LEASE_MS), attempts: Number(run.get('attempts') ?? 0) + 1, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return 'acquired';
  });
  if (acquired !== 'acquired') return { status: acquired, postId: id };
  try {
    await ensureAutomationProfile(ZEM_GHANA);
    const saved = await runRef.get();
    let draft = saved.get('newsDraft') as NewsDraft | undefined;
    if (!draft) {
      const history = await recentNews();
      const items = options.items ?? (await fetchGhanaHeadlines()).items;
      draft = await prepareNewsDraft(items, history, now);
      await runRef.set({ newsDraft: draft }, { merge: true });
    }
    const media = [await uploadNewsCard(id, draft)];
    const profile = await db.collection('communityProfiles').doc(ZEM_GHANA.uid).get();
    const ledgerRef = db.collection('communityNewsItems').doc(draft.item.id);
    await db.runTransaction(async tx => {
      const [config, run, post, ledger] = await Promise.all([tx.get(configRef), tx.get(runRef), tx.get(postRef), tx.get(ledgerRef)]);
      if (config.get('enabled') !== true || run.get('leaseOwner') !== owner || post.exists) throw new Error('Publication cancelled or already completed');
      if (ledger.exists && ledger.get('postId') !== id) throw new Error('Headline was already posted in another slot');
      tx.create(postRef, { ...postDocument(ZEM_GHANA, id, draft.text, profile.get('avatarUrl'), media), automationDate: due.date, newsSlot: due.slot,
        sources: [{ url: draft.item.url, title: draft.item.sourceName }], newsArticleId: draft.item.id, newsCategory: draft.category });
      tx.set(ledgerRef, { postId: id, url: draft.item.url, sourceId: draft.item.sourceId, title: draft.item.title, publishedAt: draft.item.publishedAt, postedAt: FieldValue.serverTimestamp() });
      tx.set(runRef, { status: 'published', postId: id, text: draft.text, model: AUTOMATION_MODEL, newsArticleId: draft.item.id, newsTitle: draft.item.title,
        newsCategory: draft.category, sourceUrl: draft.item.url, newsSourceId: draft.item.sourceId, card: media[0],
        contentHash: createHash('sha256').update(draft.text).digest('hex'), leaseUntil: null, leaseOwner: null,
        publishedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(), lastError: null }, { merge: true });
      tx.set(configRef, { lastPostId: id, lastPublishedDate: due.date, lastPublishedAt: FieldValue.serverTimestamp(), lastError: null }, { merge: true });
    });
    logger.info('Zem Ghana headline published', { postId: id, source: draft.item.sourceId });
    return { status: 'published', postId: id };
  } catch (error) {
    // Generic errors only: feed text and prompts stay out of operational logs.
    const reason = error instanceof Error ? error.message.slice(0, 180) : 'Generation failed';
    await db.runTransaction(async tx => {
      const run = await tx.get(runRef);
      if (run.get('leaseOwner') !== owner) return;
      // A draft whose story was already used elsewhere must not be retried as-is.
      const stale = /already posted in another slot/.test(reason) ? { newsDraft: FieldValue.delete() } : {};
      tx.set(runRef, { status: 'failed', leaseUntil: null, leaseOwner: null, lastError: reason, updatedAt: FieldValue.serverTimestamp(), ...stale }, { merge: true });
      tx.set(configRef, { lastError: reason, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    });
    logger.error('Zem Ghana headline failed', { postId: id, reason });
    throw new Error(`Zem Ghana failed: ${reason}`);
  }
}

// Every half hour through the posting day: publishes the due slot once, and retries a failed slot within its grace window.
export const postZemGhanaNews = onSchedule({ schedule: '0,30 7-21 * * *', timeZone: AUTOMATION_TIME_ZONE, region: REGION,
  timeoutSeconds: 540, memory: '1GiB', maxInstances: 1 }, async () => {
  try { await publishNewsPost(); } catch { /* The run record and logger keep the failure; the next half hour retries. */ }
});
