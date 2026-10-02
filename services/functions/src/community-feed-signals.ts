import type { FeedCandidate } from './community-feed-ranking.js';
import {createHash} from 'node:crypto';

/** Ignore mutable engagement totals when identifying duplicate content. */
export function feedContentFingerprint(data: Record<string, unknown>): string {
  const normalize = (value: unknown) => typeof value === 'string' ? value.normalize('NFKC').trim().toLowerCase().replace(/\s+/g,' ') : '';
  const poll = data.poll as {options?: Array<{text?: unknown}>} | undefined;
  const options = Array.isArray(poll?.options) ? poll.options.map(o=>normalize(o?.text)).sort() : [];
  return createHash('sha256').update(JSON.stringify({text:normalize(data.text),media:data.media ?? [],options,quotedPostId:data.quotedPostId ?? null})).digest('hex');
}

export type InteractionKind = 'like' | 'bookmark' | 'reply' | 'repost' | 'impression'
  | 'dwell' | 'watch' | 'skip' | 'profile-visit' | 'share';
export interface FeedInteraction {
  postId: string; kind: InteractionKind; at: number; milliseconds?: number;
}
export interface BehavioralInterests {
  topics: Record<string, number>; cultures: Record<string, number>;
  languages: Record<string, number>; authors: Record<string, number>;
  negativeTopics: Record<string, number>; seen: Set<string>;
}
const DAY = 86_400_000;
const bound = (n: number) => Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;

/** Private, bounded heuristics; no engagement-probability or identity inference. */
export function deriveBehavioralInterests(
  interactions: FeedInteraction[], posts: FeedCandidate[], now: number,
): BehavioralInterests {
  const result: BehavioralInterests = {topics: {}, cultures: {}, languages: {}, authors: {}, negativeTopics: {}, seen: new Set()};
  const byId = new Map(posts.map(p => [p.id, p]));
  // Replaying telemetry across sessions cannot multiply an individual action.
  const unique = new Map<string, FeedInteraction>();
  for (const event of interactions) {
    if (!Number.isFinite(event.at) || event.at <= 0 || event.at > now || now - event.at > 30 * DAY || !byId.has(event.postId)) continue;
    const key = `${event.postId}:${event.kind}`;
    if (event.at > (unique.get(key)?.at ?? 0)) unique.set(key, event);
  }
  const add = (target: Record<string, number>, keys: string[], weight: number) => {
    for (const key of new Set(keys)) target[key] = (target[key] ?? 0) + weight / Math.max(1, keys.length);
  };
  for (const event of unique.values()) {
    const post = byId.get(event.postId)!;
    const decay = 2 ** (-(now - event.at) / (7 * DAY));
    if (event.kind === 'impression') {
      if (now - event.at < DAY) result.seen.add(post.id);
      continue; // Exposure alone never proves interest.
    }
    if (event.kind === 'skip') {add(result.negativeTopics, post.topics, .12 * decay); continue;}
    const weights: Partial<Record<InteractionKind, number>> = {like: .7, bookmark: 1, reply: .8, repost: .8, share: .6, 'profile-visit': .2};
    let weight = weights[event.kind] ?? 0;
    if (event.kind === 'dwell') weight = .3 * bound(((event.milliseconds ?? 0) - 5000) / 25000);
    if (event.kind === 'watch') weight = .4 * bound(((event.milliseconds ?? 0) - 3000) / 57000);
    weight *= decay;
    add(result.topics, post.topics, weight);
    add(result.cultures, post.cultures, weight);
    add(result.languages, post.languages, weight);
    add(result.authors, [post.authorId], weight);
  }
  for (const dimension of [result.topics, result.cultures, result.languages, result.authors, result.negativeTopics]) {
    for (const key of Object.keys(dimension)) dimension[key] = 1 - Math.exp(-dimension[key]);
  }
  return result;
}

export interface PublicEngagement {postId: string; actorId: string; at: number; kind: 'like' | 'reply' | 'repost';}
export interface FeedTrend {postId: string; popularity: number; velocity: number; uniqueActors: number;}

/** Public actions only: saves, watch history and private-community activity never enter trends. */
export function deriveFeedTrends(events: PublicEngagement[], posts: FeedCandidate[], now: number): FeedTrend[] {
  const byId = new Map(posts.map(p => [p.id, p]));
  const actorCounts = new Map<string, number>();
  const postActors = new Map<string, Map<string, number>>();
  // Stable ordering makes the per-actor budget reproducible across worker retries.
  const ordered = [...events].sort((a, b) => b.at - a.at || a.postId.localeCompare(b.postId) || a.kind.localeCompare(b.kind));
  for (const event of ordered) {
    const post = byId.get(event.postId);
    if (!post || !event.actorId || event.actorId === post.authorId || !Number.isFinite(event.at)
      || event.at > now || event.at < now - DAY || post.createdAt < now - 7 * DAY) continue;
    const actors = postActors.get(post.id) ?? new Map<string, number>();
    if (actors.has(event.actorId)) continue; // One actor per post, regardless of action count.
    const count = actorCounts.get(event.actorId) ?? 0;
    if (count >= 20) continue;
    actorCounts.set(event.actorId, count + 1);
    actors.set(event.actorId, event.at); postActors.set(post.id, actors);
  }
  const raw = [...postActors].filter(([, actors]) => actors.size >= 5).map(([postId, actors]) => {
    const recent = [...actors.values()].filter(at => at >= now - DAY / 24).length;
    const baseline = Math.max(2, (actors.size - recent) / 23);
    return {postId, uniqueActors: actors.size, popularity: Math.log1p(actors.size), velocity: bound(recent / (baseline * 4))};
  });
  // Normalize popularity within cultural/topic cohorts so volume alone is not a global advantage.
  const groups = (post: FeedCandidate) => post.cultures.length ? post.cultures.map(c => `culture:${c}`)
    : post.topics.length ? post.topics.map(t => `topic:${t}`) : ['untagged'];
  const maxima = new Map<string, number>();
  for (const trend of raw) for (const group of groups(byId.get(trend.postId)!)) maxima.set(group, Math.max(maxima.get(group) ?? 0, trend.popularity));
  return raw.map(trend => ({...trend, popularity: Math.min(...groups(byId.get(trend.postId)!).map(g => trend.popularity / maxima.get(g)!))}));
}
