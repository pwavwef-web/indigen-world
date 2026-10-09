import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {transformWithOxc} from 'vite';
async function load(file,names) {const {code}=await transformWithOxc(readFileSync(new URL('../src/'+file,import.meta.url),'utf8'),file);return runInNewContext(code.replace(/export (?=function|const)/g,'')+';({'+names.join(',')+'})');}
test('published categories remain distinct and withheld fixtures cannot be browsed',async()=>{
 const {belongsToCollection}=await load('collections.ts',['belongsToCollection']);
 assert.equal(belongsToCollection('words',{isPublished:true,lexicalKind:'proverb'}),false);
 assert.equal(belongsToCollection('phrases',{isPublished:true,expressionKind:'phrase'}),true);
 assert.equal(belongsToCollection('proverbs',{isPublished:true,expressionKind:'phrase'}),false);
 assert.equal(belongsToCollection('sentences',{status:'confirmed',projectionVersion:2,expiresAtMillis:null}),true);
 assert.equal(belongsToCollection('sentences',{status:'submitted',projectionVersion:2,expiresAtMillis:null}),false);
 assert.equal(belongsToCollection('grammar',{status:'draft'}),false);
 assert.equal(belongsToCollection('words',{isPublished:false}),false);
});
test('both published books link to actual guides and all illustration source anchors exist',async()=>{
 const {sourceReference}=await load('sourceReference.ts',['sourceReference']);
 const grammar=sourceReference({importId:'gillbt-basic-grammar-1983-2014',sourceRefs:['DOCX block 530']});
 assert.equal(grammar.href,'/grammar-guide.html#block-530');
 assert.equal(sourceReference({importBatch:'bgl-kasem-orthography-1997'}).href,'/spelling-guide.html');
 assert.equal(sourceReference({}).href,null);assert.match(sourceReference({}).title,/not recorded/);
 const {ILLUSTRATIONS}=await load('illustrations.ts',['ILLUSTRATIONS']);assert.equal(ILLUSTRATIONS.length,19);
 const guide=readFileSync(new URL('../public/grammar-guide.html',import.meta.url),'utf8');
 for(const figure of ILLUSTRATIONS) {assert(guide.includes('id="block-'+figure.block+'"'));assert(guide.includes(figure.url));assert(readFileSync(new URL('../public'+figure.url,import.meta.url)).length>0);}
});
