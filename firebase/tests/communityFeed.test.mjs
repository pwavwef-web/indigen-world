import assert from 'node:assert/strict';
import {test} from 'node:test';
import {rankFeed, scoreCandidate, eligible} from '../../services/functions/lib/community-feed-ranking.js';
import {validateFeedPreferences, toFeedCandidate} from '../../services/functions/lib/community-feed.js';
import {Timestamp} from 'firebase-admin/firestore';
import {deriveBehavioralInterests,deriveFeedTrends,feedContentFingerprint} from '../../services/functions/lib/community-feed-signals.js';
const now=1_800_000_000_000;
const viewer=(v={})=>({uid:'viewer',following:new Set(),hidden:new Set(),excluded:new Set(),topics:new Set(),cultures:new Set(),languages:new Set(),countries:new Set(),communities:new Set(),mutedTopics:new Set(),...v});
const post=(id,p={})=>({id,authorId:`author-${id}`,createdAt:now-1000,text:`Unique ${id}`,topics:[],cultures:[],languages:[],countries:[],...p});
test('personal safety and moderation always precede scoring',()=>{
 const v=viewer({hidden:new Set(['hidden']),excluded:new Set(['blocked']),mutedTopics:new Set(['music'])});
 const posts=[post('safe'),post('hidden',{likes:1e9}),post('blocked',{authorId:'blocked'}),post('reshared',{resharerId:'blocked'}),post('mute',{topics:['music']}),post('private',{private:true}),post('reply',{isReply:true}),post('removed',{moderation:'removed'}),post('held',{moderation:'quarantine'}),post('spam',{spamRisk:.9}),post('future',{createdAt:now+60001})];
 assert.deepEqual(rankFeed(posts,v,'for-you',now).map(x=>x.post.id),['safe']);
});
test('interests outrank unbounded popularity; discovery remains grounded',()=>{
 const v=viewer({cultures:new Set(['akan']),languages:new Set(['ga'])});
 const relevant=scoreCandidate(post('relevant',{cultures:['akan'],languages:['ga']}),v,now);
 const viral=scoreCandidate(post('viral',{likes:1e12,replies:1e12,reposts:1e12}),v,now);
 assert.ok(relevant.score>viral.score);
 assert.match(relevant.reason,/akan culture/);
 assert.equal(viral.features.discovery,0);
});
test('following is chronological and includes followed facets and reposts',()=>{
 const v=viewer({following:new Set(['friend']),topics:new Set(['story'])});
 const result=rankFeed([post('unfollowed'),post('old',{authorId:'friend',createdAt:now-10000,likes:1e8}),post('new',{topics:['story']}),post('repost',{resharerId:'friend',createdAt:now-5000})],v,'following',now);
 assert.deepEqual(result.map(r=>r.post.id),['new','repost','old']);
});
test('Following uses recent reshare time without changing original freshness',()=>{
 const v=viewer({following:new Set(['friend'])});
 const old=post('old',{resharerId:'friend',createdAt:now-864000000,activityAt:now});
 const recent=post('recent',{authorId:'friend',createdAt:now-1000});
 assert.equal(rankFeed([recent,old],v,'following',now)[0].post.id,'old');
 assert.ok(scoreCandidate(old,v,now).features.freshness<scoreCandidate(recent,v,now).features.freshness);
});
test('every ten-slot window respects culture and topic concentration',()=>{
 const posts=Array.from({length:80},(_,i)=>post(String(i),{topics:[`topic-${i%4}`],cultures:[`culture-${i%4}`],authorId:`author-${i%9}`}));
 const result=rankFeed(posts,viewer(),'for-you',now,50);
 assert.equal(result.length,50);
 for(let i=0;i<result.length;i++) {
  const window=result.slice(Math.max(0,i-9),i+1);
  for(let c=0;c<4;c++) assert.ok(window.filter(r=>r.post.cultures.includes(`culture-${c}`)).length<=4);
  if(i>1) assert.ok(new Set(result.slice(i-2,i+1).map(r=>r.post.authorId)).size>1);
 }
});
test('duplicate IDs, media and near-identical text are collapsed',()=>{
 const text='These are seven distinct words about our heritage and history';
 const result=rankFeed([post('a',{text}),post('a'),post('b',{text:text+' today'}),post('c',{mediaKeys:['same']}),post('d',{mediaKeys:['same']})],viewer(),'for-you',now);
 assert.equal(result.length,2);
});
test('cold start gives new zero-engagement educational posts a chance',()=>{
 const result=rankFeed([post('fresh',{educational:true,emerging:true}),post('old',{likes:1000,createdAt:now-8*86400000})],viewer(),'for-you',now);
 assert.equal(result[0].post.id,'fresh');
 assert.ok(result[0].features.discovery>0);
});
test('negative feedback lowers related posts; non-finite input cannot corrupt ranking',()=>{
 const p=post('p',{topics:['music'],quality:NaN,velocity:Infinity,likes:Infinity});
 assert.ok(Number.isFinite(scoreCandidate(p,viewer(),now).score));
 assert.ok(scoreCandidate(p,viewer({negative:{music:1}}),now).score<scoreCandidate(p,viewer(),now).score);
 assert.equal(eligible({...p,createdAt:NaN},viewer(),now),false);
});
test('hard limits yield short feeds and ordering is deterministic',()=>{
 const posts=Array.from({length:20},(_,i)=>post(String(i),{topics:['music']}));
 assert.equal(rankFeed(posts,viewer(),'for-you',now).length,4);
 assert.deepEqual(rankFeed(posts,viewer(),'for-you',now),rankFeed([...posts].reverse(),viewer(),'for-you',now));
});
test('author-controlled quality and moderation are ignored',()=>{
 const p=toFeedCandidate('p',{authorId:'a',createdAt:Timestamp.fromMillis(now),quality:1,moderation:'allow',spamRisk:0},{moderation:'quarantine',spamRisk:.9});
 assert.equal(p.quality,undefined);assert.equal(p.moderation,'quarantine');assert.equal(p.spamRisk,.9);
});
test('preferences validate size, path characters, booleans and normalization',()=>{
 assert.deepEqual(validateFeedPreferences({cultures:[' Akan ','akan'],behavioralConsent:false}),{cultures:['akan'],behavioralConsent:false});
 assert.throws(()=>validateFeedPreferences({topics:Array(31).fill('x')}));
 assert.throws(()=>validateFeedPreferences({communities:['a/b']}));
 assert.throws(()=>validateFeedPreferences({behavioralConsent:'yes'}));
 assert.deepEqual(validateFeedPreferences({quality:1}),{});
});
test('behavioral affinities decay, deduplicate and do not turn inferred interests into follows',()=>{
 const seed=post('seed',{topics:['language'],cultures:['akan'],languages:['ga']});
 const event={postId:'seed',kind:'bookmark',at:now};
 const behavior=deriveBehavioralInterests([event,event], [seed], now);
 assert.equal(behavior.topics.language,1-Math.exp(-1));
 assert.ok(deriveBehavioralInterests([{...event,at:now-7*86400000}],[seed],now).topics.language<behavior.topics.language);
 assert.deepEqual(deriveBehavioralInterests([{...event,at:now+1}],[seed],now).topics,{});
 const related=post('related',{topics:['language'],cultures:['akan'],languages:['ga']});
 const v=viewer({behavior});
 assert.equal(rankFeed([related],v,'following',now).length,0);
 assert.match(scoreCandidate(related,v,now).reason,/interacted with similar posts/);
 assert.ok(scoreCandidate(related,v,now).score>scoreCandidate(related,viewer(),now).score);
});
test('exposure is not interest, quick passes have a modest cost, long viewing is bounded',()=>{
 const seed=post('seed',{topics:['story']});
 const behavior=deriveBehavioralInterests([
  {postId:'seed',kind:'impression',at:now}, {postId:'seed',kind:'skip',at:now},
  {postId:'seed',kind:'dwell',at:now,milliseconds:1000},
 ],[seed],now);
 assert.equal(behavior.topics.story,0);
 assert.ok(behavior.seen.has('seed')); assert.ok(behavior.negativeTopics.story<.12);
 const extreme=deriveBehavioralInterests([{postId:'seed',kind:'watch',at:now,milliseconds:1e12}],[seed],now);
 assert.ok(extreme.topics.story<.4);
});
test('cultural discovery bridges through a followed subject and author concentration stays bounded',()=>{
 const v=viewer({topics:new Set(['story']),cultures:new Set(['akan'])});
 const p=scoreCandidate(post('other-culture',{topics:['story'],cultures:['kasena']}),v,now);
 assert.equal(p.discovery,true); assert.ok(p.features.discovery>0);
 const posts=Array.from({length:70},(_,i)=>post(String(i),{authorId:i%2?'dominant':`new-${i}`,topics:[`t-${i%5}`]}));
 const feed=rankFeed(posts,viewer(),'for-you',now,40);
 for(let i=0;i<feed.length;i++) assert.ok(feed.slice(Math.max(0,i-9),i+1).filter(p=>p.post.authorId==='dominant').length<=3);
});
test('trends require distinct public actors, exclude self activity and normalize within cultures',()=>{
 const posts=[post('large',{cultures:['large']}),post('small',{cultures:['small']}),post('brigade')];
 const events=[...Array.from({length:100},(_,i)=>({postId:'large',actorId:`l${i}`,at:now,kind:'like'})),
 ...Array.from({length:5},(_,i)=>({postId:'small',actorId:`s${i}`,at:now,kind:'reply'})),
 ...Array.from({length:100},()=>({postId:'brigade',actorId:'one',at:now,kind:'repost'})),
 {postId:'brigade',actorId:'author-brigade',at:now,kind:'like'}];
 const result=deriveFeedTrends(events,posts,now);
 assert.equal(result.length,2);assert.equal(result[0].popularity,result[1].popularity);
 assert.equal(result.find(t=>t.postId==='small').uniqueActors,5);
 assert.deepEqual(deriveFeedTrends(events.map(e=>({...e,at:now+1})),posts,now),[]);
});
test('per-actor trend budget limits spam across many different posts',()=>{
 const posts=Array.from({length:30},(_,i)=>post(`p${i}`));
 const events=posts.flatMap(p=>Array.from({length:5},(_,i)=>({postId:p.id,actorId:`actor${i}`,at:now,kind:'like'})));
 assert.equal(deriveFeedTrends(events,posts,now).length,20);
});
test('expired trend values never become ranking features',()=>{
 const data={authorId:'a',createdAt:Timestamp.fromMillis(now)};
 const trust={trendPopularity:1,trendVelocity:1,trendExpiresAt:Timestamp.fromMillis(now-1)};
 const expired=toFeedCandidate('p',data,trust,now);
 assert.equal(expired.popularity,0);assert.equal(expired.velocity,undefined);
 const live=toFeedCandidate('p',data,{...trust,trendExpiresAt:Timestamp.fromMillis(now+1)},now);
 assert.equal(live.popularity,1);assert.equal(live.velocity,1);
});
test('duplicate detection preserves distinct polls and ignores changing vote totals',()=>{
 const data={text:'Which of these customs would you like to discuss today',media:[],poll:{options:[{text:'Story',voteCount:0},{text:'Music',voteCount:0}],totalVotes:0}};
 const key=feedContentFingerprint(data);
 assert.equal(key,feedContentFingerprint({...data,poll:{options:[{text:'Story',voteCount:3},{text:'Music',voteCount:8}],totalVotes:11}}));
 assert.notEqual(key,feedContentFingerprint({...data,poll:{options:[{text:'Language'},{text:'History'}]}}));
 assert.equal(rankFeed([post('a',{text:data.text,pollOptions:['story','music']}),post('b',{text:data.text,pollOptions:['language','history']})],viewer(),'for-you',now).length,2);
});
