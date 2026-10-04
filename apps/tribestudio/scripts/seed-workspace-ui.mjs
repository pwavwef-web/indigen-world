// Isolated, repeatable browser verification data. Never runs against production.
import { createRequire } from 'node:module';
import { writeFileSync, mkdirSync } from 'node:fs';
const require = createRequire(new URL('../../../services/functions/package.json', import.meta.url));
const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');
if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8080' || process.env.FIREBASE_AUTH_EMULATOR_HOST !== '127.0.0.1:9099') throw new Error('Only the isolated localhost emulators are allowed.');
const app = initializeApp({ projectId:'demo-indigen-world' });
const db = getFirestore(app), auth = getAuth(app);
const now = new Date().toISOString();
const life = { createdAt:now, updatedAt:now, version:1 };
for (const [uid, email, role, name] of [
  ['ui-creator','creator@workspace.test','creator','Local Creator'],
  ['ui-reviewer','reviewer@workspace.test','validator','Local Validator'],
  ['ui-contributor','contributor@workspace.test',null,'Local Contributor'],
]) {
  try { await auth.createUser({ uid,email,password:'WorkspaceTest123!',displayName:name }); } catch(error) { if(error.code !== 'auth/uid-already-exists' && error.code !== 'auth/email-already-exists') throw error; }
  await auth.setCustomUserClaims(uid,role ? { role } : {});
  await db.doc('creatorProfiles/'+uid).set({ id:uid,authUid:uid,status:role?'approved':'waitlisted',schemaVersion:1,public:{displayName:name,isPublic:true,avatarUrl:null},private:{email},profileCompletion:30,lifecycle:life });
}
await db.doc('configuration/platform').set({ defaultLanguage:'xsm',supportedLanguages:['xsm'],defaultCategories:['Stories','Culture','Everyday life'],defaultStudioTypes:['writing','image','audio','video','translation'] });
await db.doc('languages/xsm').set({ id:'xsm', name:'Kasem', label:'Kasem', status:'active' });
await db.doc('creatorMemberships/ui-creator').set({ userId:'ui-creator',status:'approved',roles:['creator'],assignedLanguages:['xsm'],assignedCommunities:[],assignedCampaigns:['ui-campaign'],permissions:[],createdAt:now,updatedAt:now });
await db.doc('contributorAccounts/ui-contributor').set({ status:'active',requiresPasswordChange:false,defaultWork:'ui-expressions',phoneNumber:'+233200000001',trainingAgreement:{version:'contributor-training-v2',acceptedAt:now} });
await db.doc('contributors/ui-contributor').set({ id:'ui-contributor',authUid:'ui-contributor',status:'active',publicVisibility:'hidden',public:{displayName:'Local Contributor'},private:{email:'contributor@workspace.test',phone:'+233200000001'},permissions:{edit:true,submit:true,review:false,publish:false},roles:['translator'] });
await db.doc('contributorAccounts/ui-contributor/works/ui-expressions').set({ id:'ui-expressions',title:'Local test · everyday expressions',instructions:'Browser test data. Translate only the test material; no production records are used.',kind:'expressions',language:'xsm',createdAt:now });
for(const [id,expression,translation,status] of [['one','Please come and sit with us.','','draft'],['two','Thank you for your help.','[Local test translation]','draft'],['three','We will meet tomorrow.','','draft']]) await db.doc('contributorAccounts/ui-contributor/works/ui-expressions/items/'+id).set({id,expression,translation,alternatives:[],revision:0,status,updatedAt:now});
const submission = (id, status, title) => ({ id,authUid:'ui-creator',creator:{collection:'creatorProfiles',id:'ui-creator'},campaign:{collection:'campaigns',id:'ui-campaign'},studioType:'writing',category:'Stories',title,body:'This is clearly labelled local test material for workflow verification. It is not a real cultural submission.',status,permissions:{review:true,publication:true,promotion:false,aiTraining:false},disclosures:{involvesMinors:false,usesThirdPartyMaterial:false},lifecycle:life });
await db.doc('submissions/ui-draft').set(submission('ui-draft','DRAFT','Local test · unfinished story'));
await db.doc('submissions/ui-review').set(submission('ui-review','SUBMITTED','Local test · story awaiting review'));
await db.doc('submissions/ui-stale').set(submission('ui-stale','SUBMITTED','Local test · concurrency check'));
await db.doc('campaigns/ui-campaign').set({id:'ui-campaign',slug:'ui-campaign',title:'Local test · creator campaign',status:'SUBMISSIONS_OPEN',visibility:'public',initiative:'Project Kassena',eligibleStudioTypes:['writing','video','audio','image','translation'],categories:['Stories','Culture'],lifecycle:life});
// A tiny real WAV verifies upload/playback without impersonating a speaker.
const rate=8000, samples=8000, wav=Buffer.alloc(44+samples*2);
wav.write('RIFF'); wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(rate,24);wav.writeUInt32LE(rate*2,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(samples*2,40);
for(let i=0;i<samples;i++) wav.writeInt16LE(Math.round(Math.sin(i/rate*440*Math.PI*2)*1500),44+i*2);
mkdirSync('outputs/workspace-reconstruction',{recursive:true});writeFileSync('outputs/workspace-reconstruction/local-test-tone.wav',wav);
console.log('Seeded isolated workspace test accounts, drafts and review records. Test password: WorkspaceTest123!');
