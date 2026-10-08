import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { validateBook, publicationExamples } from '../../services/functions/scripts/import-kasem-grammar.mjs';
import { directSourceCorpusRecord } from '../../services/functions/lib/kawuri-corpus.js';
import { grammarRecordFrom, matchBookGrammarRules } from '../../services/functions/lib/kawuri-grammar.js';
import { chooseGroundingPlan, renderGroundedAnswer } from '../../services/functions/lib/kawuri-grounding.js';
const book=JSON.parse(readFileSync('data/grammar-book-seed/book.json','utf8'));
const rules=JSON.parse(readFileSync('data/grammar-book-seed/rules.json','utf8'));
const records=rules.map(r=>grammarRecordFrom('gillbt83-'+r.key,{...r,englishTriggers:r.triggers}));

test('grammar source retains every ordered body block and all twelve tables across nine chapters',()=>{
  validateBook(book,rules);
  assert.equal(book.blocks.length,1638);assert.equal(book.blocks.filter(b=>b.kind==='table').length,12);
  assert.deepEqual([...new Set(rules.map(r=>r.chapter))],[1,2,3,4,5,6,7,8,9]);
  assert.ok(book.blocks.find(b=>b.index===294).text.includes('\t'));
  assert.equal(book.figures.length,19);
  for(const figure of book.figures) {
    assert.equal(createHash('sha256').update(readFileSync('data/grammar-book-seed/images/'+figure.file)).digest('hex'),figure.sourceSha256);
    assert.ok(book.blocks.find(b=>b.index===figure.block).figures.includes(figure.file));
  }
  assert.throws(()=>validateBook({...book,blocks:book.blocks.slice(1)},rules));
  assert.throws(()=>validateBook({...book,sourceSha256:''},rules));
});
test('all verb paradigms and explicit optional friend forms have source meanings',()=>{
  const table=book.blocks.find(b=>b.index===1472);
  assert.equal(table.rows.length,20);
  for(const row of table.rows.slice(1)) {
    const meaning=row[5] || 'eat';
    for(const cell of row.slice(1,5)) for(const form of cell.split(/[ ()]+/).filter(Boolean))
      assert.ok(book.entries.some(e=>e.headword.toLowerCase()===form.toLowerCase()&&e.translation===meaning),`missing ${form} / ${meaning}`);
  }
  for(const form of ['badwon','badwoni','badwonna','yugu','á','ná','bá','wó'])assert.ok(book.entries.some(e=>e.headword===form),form);
});
test('source defects stay in the reference without becoming dictionary headwords or exact answers',()=>{
  for(const entry of book.entries) {
    assert.doesNotMatch(entry.headword,/[ɩʋəɣɑ\d()]/u);
    assert.doesNotMatch(entry.translation,/didnotsee|Tell!\?:|\bpeat\b/);
    assert.ok(entry.sourceRefs.length);
  }
  const published=publicationExamples(book,rules).map(([,e])=>e);
  assert.ok(published.length>160);
  assert.ok(book.examples.some(e=>e.ambiguous));
  assert.ok(published.every(e=>!e.ambiguous));
  assert.ok(published.some(e=>e.kasem==='A wo zɔre'&&e.english==='I didn’t sweep'));
  assert.ok(published.some(e=>e.translationKind==='source-gloss'&&e.sourceGloss));
  assert.ok(published.every(e=>e.sourceRef.startsWith('Chapter')));
  for(const meaning of ['Tell!','Enter!'])assert.ok(published.some(e=>e.english===meaning));
});
test('each book must have its own completed authorisation manifest',()=>{
  const data={kasem:'A wo zɔre',english:'I didn’t sweep',importId:book.importId,status:'confirmed',projectionVersion:2,publicationMode:'owner-direct-source',providerRetrieval:true};
  const manifest={importId:book.importId,status:'published',publicationMode:'owner-direct-source',providerRetrieval:true};
  assert.equal(directSourceCorpusRecord('test',data,{...manifest,importId:'bgl-kasem-orthography-1997'}),null);
  assert.equal(directSourceCorpusRecord('test',data,{...manifest,status:'importing'}),null);
  assert.equal(directSourceCorpusRecord('test',{...data,importId:'unapproved-book'},manifest),null);
  assert.equal(directSourceCorpusRecord('test',{...data,ambiguous:true},manifest),null);
  const row=directSourceCorpusRecord('test',{...data,confirmations:8,literal:'fake',gloss:[{}]},manifest);
  assert.equal(row.confirmations,0);assert.equal(row.literal,'');assert.deepEqual(row.gloss,[]);
});
test('grammar lookup prioritises specific topics and does not intercept ordinary translation words',()=>{
  assert.equal(matchBookGrammarRules(records,'Explain the future continuous in Kasem')[0].id,'gillbt83-future-continuous');
  assert.ok(matchBookGrammarRules(records,'Explain noun class C').some(r=>r.id==='gillbt83-class-c'));
  assert.deepEqual(matchBookGrammarRules(records,'Will you go?'),[]);
  assert.equal(matchBookGrammarRules(records,'Explain Kasem pronouns')[0].id,'gillbt83-personal-pronouns');
  assert.equal(matchBookGrammarRules(records,'How do Kasem questions work?')[0].id,'gillbt83-yes-no');
  const turns=[{role:'user',text:'Explain future continuous in Kasem'}];
  const plan=chooseGroundingPlan(turns,{kind:'unsupported',query:'',examples:false,category:'general',topic:'about'});
  assert.equal(plan.kind,'language');assert.equal(plan.query,turns[0].text);
  const answer=renderGroundedAnswer(plan,{words:[],expressions:[],spellingRules:records});
  assert.match(answer.reply,/P. L. Hewer/);assert.match(answer.reply,/wó ta/);assert.match(answer.reply,/grammar-guide/);
  assert.doesNotMatch(answer.reply,/BGL 1997 printed example|speaker confirmed/);
});
test('the active path quotes the grammar book complete sentence and its own attribution',()=>{
  const plan={kind:'language',query:'I didn’t sweep',examples:false,category:'general',topic:'about'};
  const answer=renderGroundedAnswer(plan,{words:[],expressions:[{id:'gillbt83-example',kasem:'A wo zɔre',english:plan.query,alternatives:[],dialect:book.dialect,context:'Printed example',source:'book',attribution:book.attribution}]});
  assert.match(answer.reply,/A wo zɔre/);assert.match(answer.reply,/GILLBT/);assert.match(answer.reply,/no speaker review claimed/);
  assert.doesNotMatch(answer.reply,/BGL 1997/);
});
