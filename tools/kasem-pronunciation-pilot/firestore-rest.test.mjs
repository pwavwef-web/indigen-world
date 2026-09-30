import test from 'node:test';import assert from 'node:assert/strict';
import {FieldValue} from 'firebase-admin/firestore';import {firestoreRest} from './firestore-rest.mjs';
const app={options:{credential:{getAccessToken:async()=>({access_token:'test'})}}};
test('transaction reads bind to transaction and writes preserve update masks, create guards and server timestamps',async()=>{
  const calls=[];const db=firestoreRest(app,'test',async(url,options)=>{
    const body=JSON.parse(options.body);calls.push({url,body});let data;
    if(url.endsWith(':beginTransaction'))data={transaction:'tx'};
    else if(url.endsWith(':batchGet'))data=[{found:{name:body.documents[0],updateTime:'2026-09-27T12:00:00.123456789Z',fields:{kasemText:{stringValue:'yi'}}}}];
    else if(url.endsWith(':runQuery'))data=[];
    else data={writeResults:[]};return{ok:true,json:async()=>data};
  });
  await db.runTransaction(async tx=>{
    const [s]=await tx.getAll(db.doc('dictionaryEntries/yi'));assert.equal(s.get('kasemText'),'yi');assert.equal(s.updateTime.nanoseconds,123456789);
    await tx.get(db.collection('dictionaryEntries').where('headwordKey','in',['yi']));
    tx.update(s.ref,{englishText:'reach',updatedAt:FieldValue.serverTimestamp()});tx.create(db.doc('dictionaryEntries/eye'),{kasemText:'yi',forms:{plural:'yia'}});
  });
  assert.equal(calls[1].body.transaction,'tx');assert.equal(calls[2].body.transaction,'tx');
  const commit=calls.at(-1).body;assert.equal(commit.transaction,'tx');
  assert.deepEqual(commit.writes[0].updateMask.fieldPaths,['englishText']);
  assert.deepEqual(commit.writes[0].updateTransforms,[{fieldPath:'updatedAt',setToServerValue:'REQUEST_TIME'}]);
  assert.deepEqual(commit.writes[1].currentDocument,{exists:false});
});
test('an ambiguous commit is not retried',async()=>{
  let commits=0;const db=firestoreRest(app,'test',async url=>{
    if(url.endsWith(':commit')){commits++;throw Error('connection lost');}
    return{ok:true,json:async()=>({transaction:'tx'})};
  });
  await assert.rejects(db.runTransaction(async tx=>tx.create(db.doc('entries/a'),{text:'a'})),/connection lost/);assert.equal(commits,1);
});
