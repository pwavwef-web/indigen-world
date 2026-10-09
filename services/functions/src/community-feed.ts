import { createHash } from 'node:crypto';
import { FieldValue, Timestamp, getFirestore, type DocumentData } from 'firebase-admin/firestore';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { requireAuth, requireRole } from './auth.js';
import { consumeRateLimit } from './rate-limit.js';
import { FEED_MODEL, eligible, isFollowed, rankFeed, satisfiesFeedDiversity, type FeedCandidate, type FeedViewer } from './community-feed-ranking.js';
import { deriveBehavioralInterests, deriveFeedTrends, feedContentFingerprint, type FeedInteraction, type PublicEngagement } from './community-feed-signals.js';

const options = {enforceAppCheck: process.env.ENFORCE_APP_CHECK === 'true', invoker: 'public' as const};
const str = (x: unknown) => typeof x === 'string' ? x : '';
const list = (x: unknown): string[] => Array.isArray(x) ? x.filter((s): s is string => typeof s === 'string' && s.length > 0 && s.length <= 100).slice(0,100) : [];
const time = (x: unknown) => x instanceof Timestamp ? x.toMillis() : 0;
const id = (x: unknown): string => {
  if (typeof x !== 'string' || !/^[\w-]{1,128}$/.test(x)) throw new HttpsError('invalid-argument', 'Invalid identifier.');
  return x;
};
const validTopics = ['question','language','culture','music','story','event','community_update','announcement'];
const arrayFields = ['topics','cultures','languages','countries','communities','mutedTopics'] as const;
export function validateFeedPreferences(data: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const field of arrayFields) if (field in data) {
    const values=data[field];
    if (!Array.isArray(values) || values.length > 30 || values.some(v=>typeof v !== 'string' || !/^[\p{L}\p{N} ._-]{1,64}$/u.test(v))) {
      throw new HttpsError('invalid-argument', `${field} must contain at most 30 short names or IDs.`);
    }
    result[field]=[...new Set(values.map(v=>v.trim().toLowerCase()).filter(Boolean))];
  }
  for (const field of ['behavioralConsent','locationConsent']) if (field in data) {
    if (typeof data[field] !== 'boolean') throw new HttpsError('invalid-argument', `${field} must be boolean.`);
    result[field]=data[field];
  }
  return result;
}
export function toFeedCandidate(postId: string, data: DocumentData, trust: DocumentData = {}, now = Date.now()): FeedCandidate {
  const topics = [...new Set([str(data.category), ...list(trust.topics)].filter(Boolean))];
  return {
    id:postId, authorId:str(data.authorId), createdAt:time(data.createdAt), text:str(data.text), topics,
    cultures:list(trust.cultures), languages:list(trust.languages), countries:list(trust.countries),
    communityId:str(data.communityId) || undefined, isReply:data.isReply === true || !!data.parentId,
    private:data.communityVisibility === 'private', mediaKeys:Array.isArray(data.media) ? data.media.map((m:DocumentData)=>str(m.storagePath) || str(m.url)).filter(Boolean) : [],
    pollOptions:Array.isArray(data.poll?.options) ? data.poll.options.map((o:DocumentData)=>str(o.text).trim().toLowerCase()) : [],
    likes:data.likeCount, replies:data.replyCount, reposts:data.repostCount,
    bookmarks:trust.bookmarks, shares:trust.shares,
    // Trust features are deliberately NOT read from author-controlled post fields.
    quality:trust.quality, reputation:trust.reputation, spamRisk:trust.spamRisk,
    velocity:time(trust.trendExpiresAt)>now ? trust.trendVelocity : trust.velocity,
    popularity:time(trust.trendExpiresAt)>now ? trust.trendPopularity : 0,
    moderation:['allow','limited','quarantine','removed'].includes(trust.moderation) ? trust.moderation : 'allow',
    educational:trust.educational === true || data.category === 'language',
    emerging:trust.emerging === true, editorial:trust.editorial === true, duplicateKey:trust.duplicateKey,
  };
}
async function viewerFor(uid: string): Promise<{viewer:FeedViewer; preferences:DocumentData}> {
  const db=getFirestore();
  const [prefs, follows, hidden, mutes, blocks, reverseBlocks, reports]=await Promise.all([
    db.doc(`communityFeedPreferences/${uid}`).get(),
    db.collection('communityFollows').where('followerId','==',uid).limit(3001).get(),
    db.collection('communityHiddenPosts').where('uid','==',uid).get(),
    db.collection('communityMutes').where('uid','==',uid).get(),
    db.collection('communityBlocks').where('uid','==',uid).get(),
    db.collection('communityBlocks').where('targetId','==',uid).get(),
    db.collection('communityReports').where('reporterId','==',uid).get(),
  ]);
  // Do not silently ignore follows. Move accounts above this MVP ceiling to fan-out before rollout.
  if(follows.size>3000) throw new HttpsError('resource-exhausted','This follow graph requires the expanded feed service.');
  const p=prefs.data() ?? {};
  return {preferences:p, viewer:{uid, following:new Set(follows.docs.map(d=>str(d.get('followingId')))),
    hidden:new Set([...hidden.docs,...reports.docs].map(d=>str(d.get('postId')))),
    excluded:new Set([...mutes.docs,...blocks.docs].map(d=>str(d.get('targetId'))).concat(reverseBlocks.docs.map(d=>str(d.get('uid'))))),
    topics:new Set(list(p.topics)), cultures:new Set(list(p.cultures)), languages:new Set(list(p.languages)),
    countries:new Set(p.locationConsent === true ? list(p.countries) : []), communities:new Set(list(p.communities)),
    mutedTopics:new Set(list(p.mutedTopics)), affinity:p.affinity ?? {}, negative:p.negative ?? {},
  }};
}
async function hydrate(ids: string[]) {
  if(!ids.length) return [];
  const db=getFirestore();
  const [posts, features]=await Promise.all([
    db.getAll(...ids.map(p=>db.doc(`communityPosts/${p}`))),
    db.getAll(...ids.map(p=>db.doc(`communityFeedFeatures/${p}`))),
  ]);
  // Admin SDK bypasses rules: recheck current public community visibility/status.
  const communityIds=[...new Set(posts.map(p=>str(p.get('communityId'))).filter(Boolean))];
  const spaces=communityIds.length ? await db.getAll(...communityIds.map(c=>db.doc(`communitySpaces/${c}`))) : [];
  const closed=new Set(spaces.filter(s=>!s.exists || s.get('visibility') === 'private' || (s.get('status') && s.get('status') !== 'active')).map(s=>s.id));
  return posts.flatMap((p,i)=> {
    if(!p.exists || closed.has(str(p.get('communityId')))) return [];
    const raw=p.data()!;
    // Inline quotes can retain deleted/private/blocked material. Feed payloads suppress
    // quote snapshots until a separately authorized quote resolver is available.
    const {quotedPost: _quote, ...safe}=raw;
    return [{post:toFeedCandidate(p.id,safe,features[i].data()), raw:safe}];
  });
}
/** Rebuild from current owner edges, not irreversible or stale stored affinities. */
async function loadBehavior(viewer: FeedViewer, preferences: DocumentData, now: number) {
  if (preferences.behavioralConsent !== true) return;
  const db = getFirestore(), cutoff = Timestamp.fromMillis(now - 30 * 86_400_000);
  const sources = [['communityLikes','uid','like'], ['communityBookmarks','uid','bookmark'], ['communityReposts','reposterId','repost']] as const;
  const [edges, replies, events] = await Promise.all([
    Promise.all(sources.map(([collection, field]) => db.collection(collection).where(field,'==',viewer.uid).where('createdAt','>=',cutoff).orderBy('createdAt','desc').limit(30).get())),
    db.collection('communityPosts').where('authorId','==',viewer.uid).where('isReply','==',true).where('createdAt','>=',cutoff).orderBy('createdAt','desc').limit(30).get(),
    db.collection('communityRecommendationEvents').where('uid','==',viewer.uid).where('createdAt','>=',cutoff).orderBy('createdAt','desc').limit(60).get(),
  ]);
  const interactions: FeedInteraction[] = [];
  edges.forEach((snapshot, i) => snapshot.docs.forEach(d => interactions.push({postId:str(d.get('postId')),kind:sources[i][2],at:time(d.get('createdAt'))})));
  replies.docs.forEach(d => interactions.push({postId:str(d.get('rootId')) || str(d.get('parentId')),kind:'reply',at:time(d.get('createdAt'))}));
  events.docs.forEach(d => {
    // TTL is asynchronous; expired events and a previous consent epoch never apply.
    if (time(d.get('expiresAt')) <= now || time(d.get('createdAt')) < time(preferences.behavioralConsentSince)) return;
    interactions.push({postId:str(d.get('postId')),kind:d.get('kind'),at:time(d.get('createdAt')),milliseconds:d.get('milliseconds')});
  });
  const seedIds = [...new Set(interactions.map(e => e.postId).filter(p => /^[\w-]{1,128}$/.test(p)))];
  const seeds = (await hydrate(seedIds)).map(e => e.post).filter(p => eligible(p, viewer, now));
  viewer.behavior = deriveBehavioralInterests(interactions, seeds, now);
}
async function generateCandidates(viewer: FeedViewer, mode: 'following'|'for-you') {
  const db=getFirestore(), posts=db.collection('communityPosts');
  const ids=new Set<string>();
  const resharers=new Map<string,{uid:string;createdAt:number;displayName:string;username:string;avatarUrl:string|null}>();
  const recent=()=>posts.where('isReply','==',false).orderBy('createdAt','desc');
  const followed=[...viewer.following];
  // Bounded concurrency avoids one request exhausting Firestore connections.
  for(let start=0;start<followed.length;start+=150) {
    await Promise.all(Array.from({length:Math.min(5,Math.ceil((followed.length-start)/30))},async(_,i)=>{
      const chunk=followed.slice(start+i*30,start+(i+1)*30);
      const [authored,reposts]=await Promise.all([
        recent().where('authorId','in',chunk).limit(30).get(),
        db.collection('communityReposts').where('reposterId','in',chunk).orderBy('createdAt','desc').limit(15).get(),
      ]);
      authored.docs.forEach(d=>ids.add(d.id));
      // Original posts are eligible through the repost only after safe hydration.
      reposts.docs.forEach(d=>{
        const p=str(d.get('postId')), actor=str(d.get('reposterId')), createdAt=time(d.get('createdAt'));
        if(p && !viewer.excluded.has(actor) && createdAt<=Date.now()+60_000) {
          ids.add(p);
          if(createdAt>(resharers.get(p)?.createdAt ?? 0)) {
            const stamp=d.get('reposter') ?? {};
            resharers.set(p,{uid:actor,createdAt,displayName:str(stamp.displayName)||'Community member',username:str(stamp.username)||'member',avatarUrl:str(stamp.avatarUrl)||null});
          }
        }
      });
    }));
  }
  const top = (values?: Record<string, number>) => Object.entries(values ?? {}).filter(([, value]) => value >= .15).sort((a,b) => b[1]-a[1] || a[0].localeCompare(b[0])).slice(0,5).map(([key]) => key);
  const facets=[...new Set([...viewer.topics,...top(viewer.behavior?.topics)])].filter(t=>validTopics.includes(t));
  const tasks: Promise<unknown>[]=[];
  if(mode==='for-you') tasks.push(recent().limit(120).get().then(s=>s.docs.forEach(d=>ids.add(d.id))));
  if(facets.length) tasks.push(recent().where('category','in',facets).limit(60).get().then(s=>s.docs.forEach(d=>ids.add(d.id))));
  const communities=[...viewer.communities];
  if(communities.length) tasks.push(recent().where('communityId','in',communities.slice(0,30)).limit(60).get().then(s=>s.docs.forEach(d=>ids.add(d.id))));
  const tags=[...viewer.cultures].map(x=>`culture:${x}`).concat([...viewer.languages].map(x=>`language:${x}`),[...viewer.countries].map(x=>`country:${x}`));
  if (mode === 'for-you') tags.push(...top(viewer.behavior?.cultures).map(x=>`culture:${x}`), ...top(viewer.behavior?.languages).map(x=>`language:${x}`), ...top(viewer.behavior?.topics).map(x=>`topic:${x}`));
  for(let i=0;i<tags.length;i+=30) tasks.push(db.collection('communityFeedFeatures').where('tags','array-contains-any',tags.slice(i,i+30)).orderBy('createdAt','desc').limit(60).get().then(s=>s.docs.forEach(d=>ids.add(d.id))));
  if(mode==='for-you') {
    for (const flag of ['editorial','emerging']) tasks.push(db.collection('communityFeedFeatures').where(flag,'==',true).orderBy('createdAt','desc').limit(20).get().then(s=>s.docs.forEach(d=>ids.add(d.id))));
    tasks.push(db.collection('communityFeedFeatures').where('trendExpiresAt','>',Timestamp.now()).orderBy('trendExpiresAt','desc').orderBy('trendPopularity','desc').limit(40).get().then(s=>s.docs.forEach(d=>ids.add(d.id))));
  }
  await Promise.all(tasks);
  // Hydrate in chunks so all follow groups are represented before the rank limit.
  const all=[...ids], hydrated=[];
  for(let i=0;i<all.length;i+=200) hydrated.push(...await hydrate(all.slice(i,i+200)));
  return hydrated.map(entry=>{
    const reshare=resharers.get(entry.post.id);
    return {...entry,reshare,post:{...entry.post,resharerId:reshare?.uid,activityAt:reshare?.createdAt}};
  });
}
function wire(value: unknown): unknown {
  if(value instanceof Timestamp) return {__timestampMillis:value.toMillis()};
  if(Array.isArray(value)) return value.map(wire);
  if(value && typeof value==='object') return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,wire(v)]));
  return value;
}

export const getCommunityFeed=onCall(options,async req=>{
  const uid=requireAuth(req);
  await consumeRateLimit('communityFeed',uid,30);
  const data=req.data ?? {};
  if(data.mode !== 'following' && data.mode !== 'for-you') throw new HttpsError('invalid-argument','Choose following or for-you.');
  const mode=data.mode as 'following'|'for-you';
  const limit=data.limit ?? 30;
  if(!Number.isInteger(limit) || limit<1 || limit>50) throw new HttpsError('invalid-argument','Page size must be 1–50.');
  const {viewer,preferences}=await viewerFor(uid);
  const db=getFirestore(), now=Date.now();
  let sessionRef, session:DocumentData, offset=0;
  if(data.cursor != null) {
    if(typeof data.cursor !== 'string' || !/^[\w-]{1,128}:\d{1,4}$/.test(data.cursor)) throw new HttpsError('invalid-argument','Invalid cursor.');
    const [key,index]=data.cursor.split(':'); offset=Number(index);
    sessionRef=db.doc(`communityFeedSessions/${key}`);
    const existing=await sessionRef.get(); session=existing.data() ?? {};
    if(session.uid !== uid || session.mode !== mode || time(session.expiresAt)<=now || offset>session.items?.length
      || session.preferencesUpdatedAt !== time(preferences.updatedAt)) throw new HttpsError('failed-precondition','Refresh this feed.');
  } else {
    if (mode === 'for-you') await loadBehavior(viewer, preferences, now);
    const candidates=await generateCandidates(viewer,mode);
    const ranked=rankFeed(candidates.map(c=>c.post),viewer,mode,now,300);
    sessionRef=db.collection('communityFeedSessions').doc();
    const byId=new Map(candidates.map(c=>[c.post.id,c]));
    session={uid,mode,model:FEED_MODEL,preferencesUpdatedAt:time(preferences.updatedAt),createdAt:Timestamp.fromMillis(now),expiresAt:Timestamp.fromMillis(now+15*60_000),
      items:ranked.map(r=>({id:r.post.id,reason:r.reason,score:r.score,resharerId:r.post.resharerId ?? null,reshare:byId.get(r.post.id)?.reshare ?? null})),issued:[]};
    await sessionRef.create(session);
  }
  const items:Array<{id:string;reason:string;score:number;resharerId?:string;reshare?:DocumentData}>=session.items;
  const result=[];
  // Only issued posts before this cursor belong to its browsing prefix; a retry
  // of a page must not count the page itself as prior author/topic exposure.
  const issued = new Set<string>(session.issued ?? []);
  const previousIds = items.slice(0, offset).filter(i=>issued.has(i.id)).slice(-9).map(i=>i.id);
  const delivered = mode === 'for-you' ? (await hydrate(previousIds)).map(e=>e.post) : [];
  // Recheck moderation, deletion, mutes and blocks for EVERY page, including retries.
  while(offset<items.length && result.length<limit) {
    const slice=items.slice(offset,offset+limit-result.length); offset+=slice.length;
    const current=new Map((await hydrate(slice.map(i=>i.id))).map(x=>[x.post.id,x]));
    for(const item of slice) {
      const entry=current.get(item.id);
      if(!entry) continue;
      const post={...entry.post,resharerId:item.resharerId};
      if(eligible(post,viewer,now) && (mode !== 'following' || isFollowed(post,viewer))
        && (mode !== 'for-you' || satisfiesFeedDiversity(post,delivered))) {
        result.push({id:item.id,post:wire(entry.raw),reason:item.reason,reshare:item.reshare ?? null});
        delivered.push(post);
      }
    }
  }
  if(result.length) await sessionRef.update({issued:FieldValue.arrayUnion(...result.map(x=>x.id))});
  return {items:result,sessionId:sessionRef.id,model:session.model,nextCursor:offset<items.length?`${sessionRef.id}:${offset}`:null};
});
export const saveCommunityFeedPreferences=onCall(options,async req=>{
  const uid=requireAuth(req); await consumeRateLimit('feedPreferences',uid,20);
  const values=validateFeedPreferences(req.data ?? {});
  const db=getFirestore(), ref=db.doc(`communityFeedPreferences/${uid}`);
  await db.runTransaction(async tx => {
    const previous=await tx.get(ref);
    tx.set(ref,{...values, ...(values.behavioralConsent === true && previous.get('behavioralConsent') !== true
      ? {behavioralConsentSince:FieldValue.serverTimestamp()} : {}),updatedAt:FieldValue.serverTimestamp()},{merge:true});
  });
  return {ok:true};
});
export const communityFeedFeedback=onCall(options,async req=>{
  const uid=requireAuth(req); await consumeRateLimit('feedFeedback',uid,40);
  const postId=id(req.data?.postId), action=str(req.data?.action);
  if(!['more','less','not-interested','mute-topic','unmute-topic'].includes(action)) throw new HttpsError('invalid-argument','Unknown feedback.');
  const [entry]=await hydrate([postId]);
  const {viewer}=await viewerFor(uid);
  if(!entry || !eligible(entry.post,{...viewer,hidden:new Set(),mutedTopics:new Set()},Date.now())) throw new HttpsError('not-found','Post unavailable.');
  const topics=entry.post.topics;
  const db=getFirestore(), ref=db.doc(`communityFeedPreferences/${uid}`);
  await db.runTransaction(async tx=>{
    const snapshot=await tx.get(ref), p=snapshot.data() ?? {};
    const affinity={...(p.affinity ?? {})}, negative={...(p.negative ?? {})}, muted=new Set(list(p.mutedTopics));
    for (const topic of topics) {
      if(action==='more') {affinity[topic]=1;negative[topic]=0;}
      if(action==='less' || action==='not-interested') {negative[topic]=1;affinity[topic]=0;}
      if(action==='mute-topic') muted.add(topic);
      if(action==='unmute-topic') muted.delete(topic);
    }
    tx.set(ref,{affinity,negative,mutedTopics:[...muted],updatedAt:FieldValue.serverTimestamp()},{merge:true});
    if(action==='not-interested') tx.set(db.doc(`communityHiddenPosts/${uid}_${postId}`),{uid,postId,createdAt:FieldValue.serverTimestamp()});
  });
  return {ok:true};
});
export const recordCommunityRecommendationEvent=onCall(options,async req=>{
  const uid=requireAuth(req); await consumeRateLimit('feedEvent',uid,120);
  const sessionId=id(req.data?.sessionId), postId=id(req.data?.postId), kind=str(req.data?.kind);
  if(!['impression','dwell','watch','skip','profile-visit','share'].includes(kind)) throw new HttpsError('invalid-argument','Unknown event.');
  const milliseconds=req.data?.milliseconds ?? 0;
  if(typeof milliseconds !== 'number' || !Number.isFinite(milliseconds) || milliseconds<0 || milliseconds>300_000) throw new HttpsError('invalid-argument','Invalid duration.');
  const db=getFirestore(), key=createHash('sha256').update(`${uid}:${sessionId}:${postId}:${kind}`).digest('hex');
  return db.runTransaction(async tx=>{
    const [session,prefs,event]=await Promise.all([tx.get(db.doc(`communityFeedSessions/${sessionId}`)),tx.get(db.doc(`communityFeedPreferences/${uid}`)),tx.get(db.doc(`communityRecommendationEvents/${key}`))]);
    if(session.get('uid')!==uid || time(session.get('expiresAt'))<=Date.now() || !(session.get('issued') ?? []).includes(postId)) throw new HttpsError('permission-denied','Event must refer to a served post.');
    if(prefs.get('behavioralConsent')!==true) return {recorded:false};
    if(event.exists) return {recorded:false};
    tx.create(db.doc(`communityRecommendationEvents/${key}`),{uid,postId,sessionId,kind,milliseconds,model:session.get('model'),createdAt:FieldValue.serverTimestamp(),expiresAt:Timestamp.fromMillis(Date.now()+30*86_400_000)});
    return {recorded:true};
  });
});
/** Materialize retrieval metadata only; never reset a moderator's decisions. */
export const indexCommunityFeedPost=onDocumentWritten('communityPosts/{postId}',async event=>{
  const db=getFirestore(), ref=db.doc(`communityFeedFeatures/${event.params.postId}`);
  // An atomic reread also protects against edits/deletion DURING a delayed trigger.
  await db.runTransaction(async tx=>{
    const post=await tx.get(db.doc(`communityPosts/${event.params.postId}`));
    if(!post.exists) {tx.delete(ref);return;}
    const data=post.data()!;
    tx.set(ref,{createdAt:data.createdAt ?? Timestamp.now(),updatedAt:FieldValue.serverTimestamp(),
      duplicateKey:feedContentFingerprint(data)},{merge:true});
  });
});

/** Human moderation and curation boundary, with an immutable audit entry. */
export const curateCommunityFeedPost=onCall(options,async req=>{
  const uid=requireAuth(req); requireRole(req,'reviewer');
  await consumeRateLimit('curateFeed',uid,60);
  const postId=id(req.data?.postId), input=req.data ?? {}, update:DocumentData={};
  if(!['allow','limited','quarantine','removed'].includes(input.moderation)) throw new HttpsError('invalid-argument','Choose a moderation state.');
  const reason=str(input.reason).trim();
  if(reason.length<3 || reason.length>500) throw new HttpsError('invalid-argument','A moderation reason is required.');
  update.moderation=input.moderation;
  for(const field of ['cultures','languages','countries','topics']) if(field in input) {
    const values=validateFeedPreferences({[field]:input[field]}); update[field]=values[field];
  }
  for(const field of ['quality','reputation','spamRisk','velocity']) if(field in input) {
    if(typeof input[field]!=='number' || !Number.isFinite(input[field]) || input[field]<0 || input[field]>1) throw new HttpsError('invalid-argument',`${field} must be between 0 and 1.`);
    update[field]=input[field];
  }
  for(const field of ['educational','emerging','editorial']) if(field in input) {
    if(typeof input[field]!=='boolean') throw new HttpsError('invalid-argument',`${field} must be boolean.`);
    update[field]=input[field];
  }
  const db=getFirestore(), ref=db.doc(`communityFeedFeatures/${postId}`);
  await db.runTransaction(async tx=>{
    const [before,post]=await Promise.all([tx.get(ref),tx.get(db.doc(`communityPosts/${postId}`))]);
    if(!post.exists) throw new HttpsError('not-found','Post unavailable.');
    const combined={...before.data(),...update};
    const tags=['cultures','languages','countries','topics'].flatMap(field=>list(combined[field]).map(v=>`${field==='cultures'?'culture':field==='languages'?'language':field==='countries'?'country':'topic'}:${v}`));
    tx.set(ref,{...update,tags,createdAt:post.get('createdAt'),updatedAt:FieldValue.serverTimestamp()},{merge:true});
    tx.create(db.collection('auditLogs').doc(),{action:'curateCommunityFeedPost',actorUid:uid,postId,reason,before:before.data() ?? {},after:update,createdAt:FieldValue.serverTimestamp()});
  });
  return {ok:true};
});

/** Bounded MVP trending refresh. Sampling is explicit; no private behavioral data. */
export async function refreshCommunityFeedTrends(now = Date.now()) {
  const db=getFirestore(), cutoff=Timestamp.fromMillis(now - 86_400_000);
  const sources=[['communityLikes','uid','like'],['communityReposts','reposterId','repost'],['communityPosts','authorId','reply']] as const;
  const snapshots=await Promise.all(sources.map(([collection]) => {
    let query=db.collection(collection).where('createdAt','>=',cutoff);
    if(collection==='communityPosts') query=query.where('isReply','==',true);
    return query.orderBy('createdAt','desc').limit(200).get();
  }));
  const events:PublicEngagement[]=[];
  snapshots.forEach((s,i)=>s.docs.forEach(d=>events.push({postId:sources[i][2]==='reply' ? str(d.get('rootId')) || str(d.get('parentId')) : str(d.get('postId')),actorId:str(d.get(sources[i][1])),at:time(d.get('createdAt')),kind:sources[i][2]})));
  const groups=new Map<string,Set<string>>();
  for(const event of events) {
    if(!/^[\w-]{1,128}$/.test(event.postId)) continue;
    const actors=groups.get(event.postId) ?? new Set<string>(); actors.add(event.actorId); groups.set(event.postId,actors);
  }
  const candidates=(await hydrate([...groups].filter(([,actors])=>actors.size>=5).map(([postId])=>postId))).map(e=>e.post);
  const neutral:FeedViewer={uid:'',following:new Set(),hidden:new Set(),excluded:new Set(),topics:new Set(),cultures:new Set(),languages:new Set(),countries:new Set(),communities:new Set(),mutedTopics:new Set()};
  const safe=candidates.filter(p=>eligible(p,neutral,now) && p.moderation !== 'limited' && (p.spamRisk ?? 0)<.5);
  const trends=deriveFeedTrends(events,safe,now);
  // Conditional transactions prevent a slower, older run overwriting a newer one.
  for(const trend of trends) await db.runTransaction(async tx=>{
    const ref=db.doc(`communityFeedFeatures/${trend.postId}`), before=await tx.get(ref);
    if(time(before.get('trendAsOf'))>now) return;
    tx.set(ref,{trendAsOf:Timestamp.fromMillis(now),trendExpiresAt:Timestamp.fromMillis(now+30*60_000),
      trendPopularity:trend.popularity,trendVelocity:trend.velocity,trendUniqueActors:trend.uniqueActors},{merge:true});
  });
  return {scanned:snapshots.reduce((sum,s)=>sum+s.size,0),saturated:snapshots.some(s=>s.size===200),updated:trends.length};
}
export const updateCommunityFeedTrends=onSchedule({schedule:'every 15 minutes',timeZone:'Etc/UTC',retryCount:1},async()=>{
  const summary=await refreshCommunityFeedTrends();
  console.info('Community trend sample',summary);
});
