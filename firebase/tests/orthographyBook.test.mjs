import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateBook, destinationCounts } from '../../services/functions/scripts/import-kasem-orthography.mjs';
import { directSourceCorpusRecord, corpusRecordFrom } from '../../services/functions/lib/kawuri-corpus.js';
import { grammarRecordFrom, matchSpellingRules } from '../../services/functions/lib/kawuri-grammar.js';
import { chooseGroundingPlan, renderGroundedAnswer } from '../../services/functions/lib/kawuri-grounding.js';
const book=JSON.parse(readFileSync('data/orthography-seed/book.json','utf8'));
const rules=JSON.parse(readFileSync('data/orthography-seed/rules.json','utf8'));

test('the complete book has valid written headwords and stable source references',()=>{
  validateBook(book,rules);
  const refs=new Set(book.entries.flatMap(entry=>entry.sourceRefs));
  for(let page=32;page<=58;page++)assert.ok(refs.has(`Vocabulary; PDF page ${page}`),`missing vocabulary page ${page}`);
  for(const wrong of ['by','as','or','for','of','The','write','meaning','means','mean','verb'])assert.ok(!book.entries.some(e=>e.headword===wrong),`English prose leaked as ${wrong}`);
  for(const word of ['pe','pei','kwo','kwogo','kugu','á','dé','wó','yé','deém','véi','vèi','manlaataŋa'])assert.ok(book.entries.some(e=>e.headword===word),`missing ${word}`);
  assert.equal(new Set(book.entries.map(e=>e.id)).size,book.entries.length);
});
test('provenance is validated before any import writes',()=>{
  assert.throws(()=>validateBook({...book,vocabularyRowCount:645},rules));
  assert.throws(()=>validateBook({...book,entries:[{...book.entries[0],headword:'ɩ'}]},rules));
  assert.throws(()=>validateBook(book,rules.slice(1)));
});

test('repeated source records count a shared dictionary destination only once',()=>{
  const ref=path=>({path,parent:{id:path.split('/')[0]}});
  assert.deepEqual(destinationCounts([{ref:ref('dictionaryEntries/shared')},{ref:ref('dictionaryEntries/shared')},{ref:ref('expressionEntries/phrase')}]),{dictionaryEntries:1,expressionEntries:1,grammarRules:0,kasemSentences:0});
});
test('direct source examples require the completed manifest and never invent speaker confirmations',()=>{
  const data={kasem:'á tua',english:'you plural came',importId:book.importId,status:'confirmed',projectionVersion:2,publicationMode:'owner-direct-source',providerRetrieval:true,literal:'invented gloss',gloss:[{kasem:'á',english:'you'}],confirmations:2};
  const manifest={status:'published',publicationMode:'owner-direct-source',providerRetrieval:true};
  assert.equal(directSourceCorpusRecord('example',data,{}),null);
  assert.equal(directSourceCorpusRecord('example',data,{...manifest,status:'importing'}),null);
  assert.equal(directSourceCorpusRecord('example',{...data,ambiguous:true},manifest),null);
  const result=directSourceCorpusRecord('example',data,manifest);
  assert.equal(result.confirmations,0);assert.equal(result.literal,'');assert.deepEqual(result.gloss,[]);
  assert.equal(corpusRecordFrom('speaker',{kasem:'a tua',english:'I came',confirmations:2}).confirmations,2);
});
test('spelling questions retrieve the book rules and exclude unrelated grammar',()=>{
  const records=rules.map(r=>grammarRecordFrom('bgl97-'+r.key,{...r,englishTriggers:r.triggers}));
  assert.ok(matchSpellingRules(records,'What is the Kasem alphabet?').some(r=>r.id==='bgl97-alphabet'));
  assert.ok(matchSpellingRules(records,'Explain vowel length in Kasem').some(r=>r.id==='bgl97-long-vowels'));
  assert.deepEqual(matchSpellingRules(records,'Who runs the project?'),[]);
});
test('the active Kawuri answer path quotes source rules and printed sentences honestly',()=>{
  const spellingRules=rules.map(r=>grammarRecordFrom('bgl97-'+r.key,{...r,englishTriggers:r.triggers}));
  const plan=chooseGroundingPlan([{role:'user',text:'What is the Kasem alphabet?'}],{kind:'unsupported',query:'',examples:false,category:'general',topic:'about'});
  const answer=renderGroundedAnswer(plan,{words:[],expressions:[],spellingRules});
  assert.match(answer.reply,/seven written vowel symbols/);assert.match(answer.reply,/Bureau of Ghana Languages/);
  const sentence=renderGroundedAnswer({...plan,query:'we came'},{words:[],expressions:[{id:'bgl97-example',kasem:'dé tua',english:'we came',alternatives:[],dialect:'Ghana Kasem',context:'Printed example',source:'book'}]});
  assert.match(sentence.reply,/dé tua/);assert.match(sentence.reply,/no speaker review claimed/);assert.doesNotMatch(sentence.reply,/These reviewed records/);
});
