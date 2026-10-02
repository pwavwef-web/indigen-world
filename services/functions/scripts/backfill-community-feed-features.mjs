import {feedContentFingerprint} from '../lib/community-feed-signals.js';
import {initializeApp} from 'firebase-admin/app';
import {FieldPath,FieldValue,Firestore,Timestamp,getFirestore} from 'firebase-admin/firestore';
import {createRequire} from 'node:module';

const args=process.argv.slice(2);
if(args.includes('--help')) {
  console.log('Usage: node services/functions/scripts/backfill-community-feed-features.mjs --project PROJECT_ID [--apply] [--firebase-login]\nDefault: read-only dry run. Set FIRESTORE_EMULATOR_HOST for emulator use. Uses Application Default Credentials; --firebase-login uses the existing Firebase CLI login in memory.');
  process.exit(0);
}
const projectIndex=args.indexOf('--project'), projectId=args[projectIndex+1];
if(projectIndex<0 || !projectId || projectId.startsWith('--') || args.some(a=>a.startsWith('--') && !['--project','--apply','--firebase-login'].includes(a))) throw Error('Specify --project PROJECT_ID. See --help for optional flags.');
let db;
if(args.includes('--firebase-login')) {
  const require=createRequire(import.meta.url), auth=require('firebase-tools/lib/auth.js');
  const account=auth.getGlobalDefaultAccount(); if(!account) throw Error('Sign in with the Firebase CLI first.');
  const token=await auth.getAccessToken(account.tokens.refresh_token,['https://www.googleapis.com/auth/cloud-platform']);
  const {OAuth2Client}=require('google-auth-library'), authClient=new OAuth2Client();
  authClient.setCredentials({access_token:token.access_token,expiry_date:Date.now()+Math.min(token.expires_in ?? 3000,3000)*1000});
  db=new Firestore({projectId,authClient,preferRest:true});
} else {
  initializeApp({projectId}); db=getFirestore();
}
const apply=args.includes('--apply');
let after, scanned=0, changed=0, skipped=0;
const metadata=(data)=>({createdAt:data.createdAt,duplicateKey:feedContentFingerprint(data)});
for(;;) {
  let query=db.collection('communityPosts').orderBy(FieldPath.documentId()).limit(200);
  if(after) query=query.startAfter(after);
  const page=await query.get(); if(page.empty) break;
  for(const post of page.docs) {
    scanned++;
    // Each transaction rereads canonical state and preserves existing curation.
    const update=async(tx)=>{
      const featuresRef=db.doc(`communityFeedFeatures/${post.id}`);
      const [current,features]=await Promise.all([tx?tx.get(post.ref):post.ref.get(),tx?tx.get(featuresRef):featuresRef.get()]);
      if(!current.exists || !(current.get('createdAt') instanceof Timestamp)) return 'skipped';
      const values=metadata(current.data());
      if(features.get('duplicateKey')===values.duplicateKey && features.get('createdAt')?.isEqual(values.createdAt)) return 'unchanged';
      if(tx) tx.set(featuresRef,{...values,updatedAt:FieldValue.serverTimestamp()},{merge:true});
      return 'changed';
    };
    const result=await (apply?db.runTransaction(update):update());
    if(result==='changed') changed++;
    if(result==='skipped') skipped++;
  }
  after=page.docs.at(-1);
}
console.log(JSON.stringify({projectId,mode:apply?'applied':'dry-run',scanned,changed,skipped}));
