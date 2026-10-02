import type { BehavioralInterests } from './community-feed-signals.js';
/** Pure, deterministic policy ranker. All trust/safety features come from the server. */
export const FEED_MODEL = 'cultural-balance-v2';
export interface FeedCandidate {
  id: string; authorId: string; createdAt: number; text: string;
  topics: string[]; cultures: string[]; languages: string[]; countries: string[];
  communityId?: string; mediaKeys?: string[]; pollOptions?: string[]; resharerId?: string; activityAt?: number;
  likes?: number; replies?: number; reposts?: number; bookmarks?: number; shares?: number;
  quality?: number; reputation?: number; velocity?: number; popularity?: number; spamRisk?: number;
  moderation?: 'allow' | 'limited' | 'quarantine' | 'removed';
  educational?: boolean; emerging?: boolean; editorial?: boolean; isReply?: boolean;
  private?: boolean; duplicateKey?: string;
}
export interface FeedViewer {
  uid: string; following: Set<string>; hidden: Set<string>; excluded: Set<string>;
  topics: Set<string>; cultures: Set<string>; languages: Set<string>; countries: Set<string>;
  communities: Set<string>; mutedTopics: Set<string>;
  affinity?: Record<string, number>; relationships?: Record<string, number>;
  negative?: Record<string, number>; seen?: Set<string>; behavior?: BehavioralInterests;
}
export interface RankedCandidate {
  post: FeedCandidate; score: number; reason: string;
  discovery: boolean; features: Record<string, number>;
}
const clamp = (x: unknown, max = 1): number => typeof x === 'number' && Number.isFinite(x) ? Math.max(0, Math.min(max, x)) : 0;
const match = (values: string[], selected: Set<string>) => values.find(v => selected.has(v));
const overlap = (values: string[], selected: Set<string>) => values.length ? Math.min(1, values.filter(v => selected.has(v)).length / Math.min(3, values.length)) : 0;
export function eligible(post: FeedCandidate, viewer: FeedViewer, now: number): boolean {
  return !!post.id && !!post.authorId && Number.isFinite(post.createdAt) && post.createdAt > 0
    && post.createdAt <= now + 60_000 && !post.private && !post.isReply
    && !['quarantine', 'removed'].includes(post.moderation ?? 'allow')
    && clamp(post.spamRisk) < 0.85 && !viewer.hidden.has(post.id)
    && !viewer.excluded.has(post.authorId) && !viewer.excluded.has(post.resharerId ?? '')
    && !post.topics.some(t => viewer.mutedTopics.has(t));
}
export function isFollowed(post: FeedCandidate, viewer: FeedViewer): boolean {
  return viewer.following.has(post.authorId) || viewer.following.has(post.resharerId ?? '')
    || !!match(post.topics, viewer.topics) || !!match(post.cultures, viewer.cultures)
    || !!match(post.languages, viewer.languages) || !!match(post.countries, viewer.countries)
    || viewer.communities.has(post.communityId ?? '');
}
export function scoreCandidate(post: FeedCandidate, viewer: FeedViewer, now: number): RankedCandidate {
  const topic = overlap(post.topics, viewer.topics);
  const culture = overlap(post.cultures, viewer.cultures);
  const language = overlap(post.languages, viewer.languages);
  const community = viewer.communities.has(post.communityId ?? '') ? 1 : 0;
  const explicitAffinity = Math.max(0, ...post.topics.map(t => clamp(viewer.affinity?.[t])));
  const behavioralTopic = Math.max(0, ...post.topics.map(t => clamp(viewer.behavior?.topics[t])));
  const behavioralCulture = Math.max(0, ...post.cultures.map(c => clamp(viewer.behavior?.cultures[c])));
  const behavioralLanguage = Math.max(0, ...post.languages.map(l => clamp(viewer.behavior?.languages[l])));
  const interaction = Math.max(explicitAffinity, behavioralTopic * .7);
  const relationship = Math.min(1, (viewer.following.has(post.authorId) ? 0.7 : 0)
    + Math.max(clamp(viewer.relationships?.[post.authorId]), clamp(viewer.behavior?.authors[post.authorId])) * 0.3);
  // Counts saturate; a million likes cannot drown out cultural relevance.
  const engagement = Math.min(1, Math.log1p(clamp(post.likes, 1000) + 2 * clamp(post.replies, 500)
    + 2 * clamp(post.reposts, 500) + 3 * clamp(post.bookmarks, 500) + clamp(post.shares, 500)) / Math.log(4001));
  const freshness = Math.pow(0.5, Math.max(0, now - post.createdAt) / 86_400_000);
  const relevance = Math.max(topic, language, culture, community, interaction, behavioralCulture * .7, behavioralLanguage * .7,
    overlap(post.countries, viewer.countries) * 0.3);
  const cold = !viewer.topics.size && !viewer.cultures.size && !viewer.languages.size && !viewer.communities.size && !viewer.following.size;
  const discovery = !isFollowed(post, viewer) || (viewer.cultures.size > 0 && post.cultures.length > 0 && !match(post.cultures, viewer.cultures));
  const culturalDiscovery = discovery && (relevance > 0 || cold || post.editorial)
    ? 0.4 + 0.4 * relevance + (post.emerging ? 0.2 : 0) : 0;
  const negative = Math.max(0, ...post.topics.map(t => Math.max(clamp(viewer.negative?.[t]), clamp(viewer.behavior?.negativeTopics[t]))));
  const features = {
    interest: 18 * Math.max(topic, interaction), relationship: 12 * relationship,
    engagement: 6 * engagement, culture: 12 * Math.max(culture, behavioralCulture * .7), language: 12 * Math.max(language, behavioralLanguage * .7),
    community: 8 * community, quality: 8 * clamp(post.quality), reputation: 2 * clamp(post.reputation),
    freshness: 14 * freshness, discovery: 9 * culturalDiscovery,
    education: post.educational ? 5 : 0, emerging: post.emerging ? 3 * freshness : 0,
    trending: 3 * clamp(post.velocity), popular: 3 * clamp(post.popularity), editorial: post.editorial ? 4 : 0,
    negative: -24 * negative, repeated: viewer.seen?.has(post.id) || viewer.behavior?.seen.has(post.id) ? -12 : 0,
    spam: -40 * clamp(post.spamRisk), limited: post.moderation === 'limited' ? -30 : 0,
  };
  const cultureMatch = match(post.cultures, viewer.cultures);
  const languageMatch = match(post.languages, viewer.languages);
  const topicMatch = match(post.topics, viewer.topics);
  const reason = cultureMatch ? `Because you follow ${cultureMatch} culture`
    : languageMatch ? `Because you follow ${languageMatch}`
    : viewer.following.has(post.authorId) ? 'From someone you follow'
    : community ? 'From a community you follow'
    : topicMatch ? `Because you follow ${topicMatch}`
    : explicitAffinity > 0 ? 'Because you asked for more like this'
    : Math.max(behavioralTopic, behavioralCulture, behavioralLanguage) > 0 ? 'Because you interacted with similar posts'
    : post.editorial ? 'Selected by the editorial team'
    : clamp(post.velocity) > .5 ? 'Trending in the community'
    : clamp(post.popularity) > .5 ? 'Popular in the community'
    : post.emerging ? 'Discover an emerging contributor'
    : post.educational ? 'Discover a learning post' : 'Discover a recent community post';
  return {post, score: Object.values(features).reduce((a,b) => a+b, 0), reason, discovery, features};
}
function tokensFor(post: FeedCandidate, cache: WeakMap<FeedCandidate, Set<string>>): Set<string> {
  const cached = cache.get(post);
  if (cached) return cached;
  const tokens = new Set(post.text.toLowerCase().normalize('NFKC').match(/[\p{L}\p{N}]+/gu) ?? []);
  cache.set(post, tokens);
  return tokens;
}
function nearDuplicate(a: FeedCandidate, b: FeedCandidate, cache: WeakMap<FeedCandidate, Set<string>>): boolean {
  if (a.id === b.id || (a.duplicateKey && a.duplicateKey === b.duplicateKey)) return true;
  if (a.mediaKeys?.length && b.mediaKeys?.some(k => a.mediaKeys!.includes(k))) return true;
  if (JSON.stringify([...(a.pollOptions ?? [])].sort()) !== JSON.stringify([...(b.pollOptions ?? [])].sort())) return false;
  const x=tokensFor(a,cache), y=tokensFor(b,cache);
  if (x.size < 6 || y.size < 6) return false;
  return [...x].filter(t => y.has(t)).length / new Set([...x,...y]).size >= 0.85;
}
/** Also applied at delivery, because intervening removals/edits can change a window. */
export function satisfiesFeedDiversity(post: FeedCandidate, previous: FeedCandidate[]): boolean {
  const window = previous.slice(-9);
  if (previous.length >= 2 && previous.slice(-2).every(p => p.authorId === post.authorId)) return false;
  if (window.filter(p => p.authorId === post.authorId).length >= 3) return false;
  return !post.topics.some(t => window.filter(p=>p.topics.includes(t)).length>=4)
    && !post.cultures.some(c => window.filter(p=>p.cultures.includes(c)).length>=4)
    && !(post.communityId && window.filter(p=>p.communityId===post.communityId).length>=4);
}
export function rankFeed(candidates: FeedCandidate[], viewer: FeedViewer, mode: 'following'|'for-you', now: number, limit = 100): RankedCandidate[] {
  const tokens = new WeakMap<FeedCandidate, Set<string>>();
  const unique = new Map<string, FeedCandidate>();
  for (const post of candidates) if (eligible(post, viewer, now) && (mode !== 'following' || isFollowed(post, viewer))) {
    if (!unique.has(post.id)) unique.set(post.id, post);
  }
  const pool = [...unique.values()].map(p => scoreCandidate(p, viewer, now));
  pool.sort((a,b) => (mode === 'following' ? (b.post.activityAt ?? b.post.createdAt)-(a.post.activityAt ?? a.post.createdAt) : b.score-a.score) || a.post.id.localeCompare(b.post.id));
  const result: RankedCandidate[] = [];
  if (mode === 'following') return pool.filter((item,index) => !pool.slice(0,index).some(p => nearDuplicate(p.post,item.post,tokens))).slice(0,limit);
  while (pool.length && result.length < Math.max(0,limit)) {
    const selected = result.map(r=>r.post);
    const window = result.slice(-9);
    let best = -1, bestValue = -Infinity;
    for (let i=0;i<pool.length;i++) {
      const item=pool[i], p=item.post;
      if (result.some(r => nearDuplicate(r.post,p,tokens))) continue;
      if (!satisfiesFeedDiversity(p, selected)) continue;
      // Soft mix targets; never relax safety or duplication to fill an empty slot.
      const discoveries=window.filter(r=>r.discovery).length;
      const mix = item.discovery ? (discoveries < 2 && item.features.discovery > 0 ? 8 : discoveries >= 4 ? -10 : 0) : (discoveries >= 4 ? 5 : 0);
      const education = p.educational && !window.some(r=>r.post.educational) ? 5 : 0;
      const emerging = p.emerging && !window.some(r=>r.post.emerging) ? 4 : 0;
      const value=item.score+mix+education+emerging;
      if(value>bestValue) {best=i;bestValue=value;}
    }
    if(best<0) break; // A short page is preferable to violating a hard rule.
    result.push(pool.splice(best,1)[0]);
  }
  return result;
}
