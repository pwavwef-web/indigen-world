import assert from 'node:assert/strict';
import {before,after,test} from 'node:test';
import {readFileSync} from 'node:fs';
import {initializeApp,deleteApp} from 'firebase-admin/app';
import {getFirestore,Timestamp} from 'firebase-admin/firestore';
import {initializeTestEnvironment,assertFails,assertSucceeds} from '@firebase/rules-unit-testing';
import {getDoc,setDoc,doc} from 'firebase/firestore';
import * as api from '../../services/functions/lib/community-feed.js';
if(!process.env.FIRESTORE_EMULATOR_HOST) throw Error('Use the Firestore emulator.');
const projectId='demo-indigen-feed-tests';let app,db,rules;
const req=(uid,data)=>({auth:{uid,token:{}},data});
before(async()=>{
 app=initializeApp({projectId});db=getFirestore();
 rules=await initializeTestEnvironment({projectId,firestore:{rules:readFileSync(new URL('../firestore.rules',import.meta.url),'utf8')}});
 await rules.clearFirestore();
 const batch=db.batch();
 for(let i=0;i<36;i++) {
  batch.set(db.doc(`communityPosts/p${i}`),{authorId:`a${i}`,text:`Post ${i}`,isReply:false,createdAt:Timestamp.fromMillis(Date.now()-i*1000),category:['story','music','language','culture','question'][i%5],media:[]});
  batch.set(db.doc(`communityFollows/viewer_a${i}`),{followerId:'viewer',followingId:`a${i}`,createdAt:Timestamp.now()});
 }
 await batch.commit();
});
after(async()=>{await rules?.cleanup();if(app)await deleteApp(app);});
test('requires auth and validates page size/cursor',async()=>{
 await assert.rejects(api.getCommunityFeed.run({data:{mode:'for-you'}}),e=>e.code==='unauthenticated');
 await assert.rejects(api.getCommunityFeed.run(req('x',{mode:'for-you',limit:999})),e=>e.code==='invalid-argument');
 await assert.rejects(api.getCommunityFeed.run(req('x',{mode:'for-you',cursor:'../bad'})),e=>e.code==='invalid-argument');
});
test('all follow chunks, pagination, actor binding and live safety rechecks',async()=>{
 const first=await api.getCommunityFeed.run(req('viewer',{mode:'following',limit:10}));
 assert.equal(first.items.length,10);assert.equal(first.items[0].id,'p0');
 assert.ok(first.nextCursor);
 await assert.rejects(api.getCommunityFeed.run(req('intruder',{mode:'following',cursor:first.nextCursor})),e=>e.code==='failed-precondition');
 await db.doc('communityFeedFeatures/p10').set({moderation:'removed'});
 await db.doc('communityBlocks/a11_viewer').set({uid:'a11',targetId:'viewer'});
 await db.doc('communityPosts/p12').delete();
 const second=await api.getCommunityFeed.run(req('viewer',{mode:'following',cursor:first.nextCursor,limit:50}));
 assert.ok(second.items.some(p=>p.id==='p35'),'31st and later follows are included');
 assert.ok(!second.items.some(p=>['p10','p11','p12'].includes(p.id)));
 assert.equal(new Set([...first.items,...second.items].map(p=>p.id)).size,first.items.length+second.items.length);
});
test('private or closed community posts and quote snapshots cannot leak',async()=>{
 await db.doc('communitySpaces/private').set({visibility:'private',status:'active'});
 await db.doc('communityPosts/private-post').set({authorId:'a',isReply:false,createdAt:Timestamp.now(),communityId:'private',text:'secret'});
 await db.doc('communityPosts/quote').set({authorId:'b',isReply:false,createdAt:Timestamp.now(),text:'quote',quotedPost:{text:'secret snapshot'}});
 const result=await api.getCommunityFeed.run(req('privacy',{mode:'for-you',limit:50}));
 assert.ok(!result.items.some(p=>p.id==='private-post'));
 assert.equal(result.items.find(p=>p.id==='quote')?.post.quotedPost,undefined);
});
test('events require consent, served membership, and are idempotent',async()=>{
 const page=await api.getCommunityFeed.run(req('events',{mode:'for-you',limit:10}));
 const data={sessionId:page.sessionId,postId:page.items[0].id,kind:'impression'};
 assert.equal((await api.recordCommunityRecommendationEvent.run(req('events',data))).recorded,false);
 await api.saveCommunityFeedPreferences.run(req('events',{behavioralConsent:true}));
 const results=await Promise.all([api.recordCommunityRecommendationEvent.run(req('events',data)),api.recordCommunityRecommendationEvent.run(req('events',data))]);
 assert.equal(results.filter(r=>r.recorded).length,1);
 await assert.rejects(api.recordCommunityRecommendationEvent.run(req('intruder',data)),e=>e.code==='permission-denied');
 await assert.rejects(api.recordCommunityRecommendationEvent.run(req('events',{...data,postId:'never-served'})),e=>e.code==='permission-denied');
});
test('reposts retain attribution and newly blocked reposters disappear on pagination',async()=>{
 await db.doc('communityFollows/repost-viewer_friend').set({followerId:'repost-viewer',followingId:'friend'});
 await db.doc('communityReposts/friend_p20').set({reposterId:'friend',postId:'p20',createdAt:Timestamp.now(),reposter:{displayName:'Friend',username:'friend'}});
 await db.doc('communityReposts/friend_p21').set({reposterId:'friend',postId:'p21',createdAt:Timestamp.fromMillis(Date.now()-1000),reposter:{displayName:'Friend',username:'friend'}});
 const page=await api.getCommunityFeed.run(req('repost-viewer',{mode:'following',limit:1}));
 assert.equal(page.items[0].reshare.uid,'friend');
 assert.equal(page.items[0].id,'p20');
 await db.doc('communityBlocks/repost-viewer_friend').set({uid:'repost-viewer',targetId:'friend'});
 const next=await api.getCommunityFeed.run(req('repost-viewer',{mode:'following',cursor:page.nextCursor}));
 assert.equal(next.items.length,0);
});
test('feedback is private, reversible, and moderation requires staff',async()=>{
 await api.communityFeedFeedback.run(req('feedback',{postId:'p0',action:'mute-topic'}));
 let p=(await db.doc('communityFeedPreferences/feedback').get()).data();assert.deepEqual(p.mutedTopics,['story']);
 await api.communityFeedFeedback.run(req('feedback',{postId:'p0',action:'unmute-topic'}));
 p=(await db.doc('communityFeedPreferences/feedback').get()).data();assert.deepEqual(p.mutedTopics,[]);
 await assert.rejects(api.curateCommunityFeedPost.run(req('feedback',{postId:'p0',moderation:'removed',reason:'test'})),e=>e.code==='permission-denied');
 await api.curateCommunityFeedPost.run({auth:{uid:'reviewer',token:{role:'reviewer'}},data:{postId:'p0',moderation:'limited',reason:'Pending cultural context review',cultures:['Akan'],quality:.4}});
 assert.deepEqual((await db.doc('communityFeedFeatures/p0').get()).get('tags'),['culture:akan']);
 assert.equal((await db.collection('auditLogs').where('postId','==','p0').get()).size,1);
});
test('rules deny client access to ranking internals and cross-user preferences',async()=>{
 const own=rules.authenticatedContext('feedback').firestore(), stranger=rules.authenticatedContext('other').firestore();
 await assertSucceeds(getDoc(doc(own,'communityFeedPreferences/feedback')));
 await assertFails(getDoc(doc(stranger,'communityFeedPreferences/feedback')));
 await assertFails(setDoc(doc(own,'communityFeedPreferences/feedback'),{quality:1}));
 for(const collection of ['communityFeedFeatures','communityFeedSessions','communityRecommendationEvents']) {
  await assertFails(getDoc(doc(own,`${collection}/p0`)));
  await assertFails(setDoc(doc(own,`${collection}/fake`),{uid:'feedback'}));
 }
});
test('behavioral retrieval requires consent, uses saved patterns, and leaves Following explicit',async()=>{
 const at=Timestamp.now(), old=Timestamp.fromMillis(Date.now()-2*86400000);
 const batch=db.batch();
 batch.set(db.doc('communityPosts/behavior-seed'),{authorId:'seed-author',isReply:false,createdAt:old,category:'story',text:'Saved cultural story'});
 batch.set(db.doc('communityFeedFeatures/behavior-seed'),{cultures:['kasena'],languages:['kasem'],tags:['culture:kasena','language:kasem'],createdAt:old});
 batch.set(db.doc('communityPosts/behavior-match'),{authorId:'match-author',isReply:false,createdAt:old,category:'story',text:'A related cultural discussion'});
 batch.set(db.doc('communityFeedFeatures/behavior-match'),{cultures:['kasena'],languages:['kasem'],tags:['culture:kasena','language:kasem'],createdAt:old});
 batch.set(db.doc('communityBookmarks/behavior_behavior-seed'),{uid:'behavior',postId:'behavior-seed',createdAt:at});
 // Put the saved pattern outside the global recent reservoir.
 for(let i=0;i<130;i++) batch.set(db.doc(`communityPosts/reservoir-${i}`),{authorId:`reservoir-${i}`,isReply:false,createdAt:Timestamp.fromMillis(Date.now()-i*100),category:'question',text:`Recent post ${i}`});
 await batch.commit();
 const baseline=await api.getCommunityFeed.run(req('behavior',{mode:'for-you',limit:50}));
 assert.ok(!baseline.items.some(p=>p.id==='behavior-match'));
 await api.saveCommunityFeedPreferences.run(req('behavior',{behavioralConsent:true}));
 const personalized=await api.getCommunityFeed.run(req('behavior',{mode:'for-you',limit:50}));
 assert.match(personalized.items.find(p=>p.id==='behavior-match')?.reason ?? '',/interacted with similar posts/);
 assert.equal((await api.getCommunityFeed.run(req('behavior',{mode:'following'}))).items.length,0);
 await api.saveCommunityFeedPreferences.run(req('behavior',{behavioralConsent:false}));
 await assert.rejects(api.getCommunityFeed.run(req('behavior',{mode:'for-you',cursor:`${personalized.sessionId}:1`})),e=>e.code==='failed-precondition');
 const disabled=await api.getCommunityFeed.run(req('behavior',{mode:'for-you',limit:50}));
 assert.ok(!disabled.items.some(p=>p.id==='behavior-match'));
});
test('emerging and trending sources retrieve posts outside the global recent reservoir',async()=>{
 const old=Timestamp.fromMillis(Date.now()-2*86400000);
 await db.doc('communityPosts/emerging-voice').set({authorId:'new-voice',isReply:false,createdAt:old,category:'language',text:'A new voice shares a lesson'});
 await db.doc('communityFeedFeatures/emerging-voice').set({emerging:true,educational:true,createdAt:old});
 await db.doc('communityPosts/trend-post').set({authorId:'trend-author',isReply:false,createdAt:old,category:'culture',text:'A cultural discussion'});
 const batch=db.batch();
 for(let i=0;i<5;i++) batch.set(db.doc(`communityLikes/trend-actor-${i}_trend-post`),{uid:`trend-actor-${i}`,postId:'trend-post',createdAt:Timestamp.now()});
 await batch.commit();
 const summary=await api.refreshCommunityFeedTrends(); assert.ok(summary.updated>=1);
 const features=(await db.doc('communityFeedFeatures/trend-post').get()).data();
 assert.equal(features.trendUniqueActors,5);assert.ok(features.trendExpiresAt.toMillis()>Date.now());
 const result=await api.getCommunityFeed.run(req('sources',{mode:'for-you',limit:50}));
 assert.ok(result.items.some(p=>p.id==='emerging-voice'));
 assert.match(result.items.find(p=>p.id==='trend-post')?.reason ?? '',/Trending/);
});
test('removed, private and single-actor activity cannot enter the trend pool',async()=>{
 const now=Timestamp.now(), batch=db.batch();
 for(const p of ['removed-trend','private-trend','single-actor']) batch.set(db.doc(`communityPosts/${p}`),{authorId:'author',isReply:false,createdAt:now,text:p, ...(p==='private-trend'?{communityId:'private'}:{})});
 batch.set(db.doc('communityFeedFeatures/removed-trend'),{moderation:'removed'});
 for(let i=0;i<5;i++) for(const p of ['removed-trend','private-trend']) batch.set(db.doc(`communityLikes/actor-${i}_${p}`),{uid:`actor-${i}`,postId:p,createdAt:now});
 batch.set(db.doc('communityLikes/one_single-actor'),{uid:'one',postId:'single-actor',createdAt:now});
 batch.set(db.doc('communityReposts/one_single-actor'),{reposterId:'one',postId:'single-actor',createdAt:now});
 await batch.commit(); await api.refreshCommunityFeedTrends();
 for(const p of ['removed-trend','private-trend','single-actor']) assert.equal((await db.doc(`communityFeedFeatures/${p}`).get()).get('trendPopularity'),undefined);
});
test('post indexing is idempotent, preserves curation and removes deleted features',async()=>{
 await db.doc('communityPosts/indexed').set({authorId:'a',text:'Current text',isReply:false,createdAt:Timestamp.now()});
 await db.doc('communityFeedFeatures/indexed').set({moderation:'quarantine',quality:.5});
 await api.indexCommunityFeedPost.run({params:{postId:'indexed'}});
 const first=(await db.doc('communityFeedFeatures/indexed').get()).data();
 await api.indexCommunityFeedPost.run({params:{postId:'indexed'}});
 const repeated=(await db.doc('communityFeedFeatures/indexed').get()).data();
 assert.equal(first.duplicateKey,repeated.duplicateKey);assert.equal(repeated.moderation,'quarantine');
 await db.doc('communityPosts/indexed').delete();await api.indexCommunityFeedPost.run({params:{postId:'indexed'}});
 assert.equal((await db.doc('communityFeedFeatures/indexed').get()).exists,false);
});
test('delivery enforces author diversity again after intervening post edits',async()=>{
 const page=await api.getCommunityFeed.run(req('delivery-diversity',{mode:'for-you',limit:2}));
 const session=(await db.doc(`communityFeedSessions/${page.sessionId}`).get()).data();
 const nextId=session.items[2].id;
 for(const postId of [...page.items.map(p=>p.id),nextId]) await db.doc(`communityPosts/${postId}`).update({authorId:'same-edited-author'});
 const next=await api.getCommunityFeed.run(req('delivery-diversity',{mode:'for-you',cursor:page.nextCursor,limit:10}));
 assert.ok(!next.items.some(p=>p.id===nextId));
});
