import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { inspectResearchCycle, reviewedResearchProjection } from '../../services/functions/lib/kasem-research-cycle.js';
import { parseNote, addReview, parseReview } from '../../services/functions/lib/kasem-evidence.js';

const now = '2026-10-11T00:00:00.000Z';
const template = JSON.parse(readFileSync('packages/contracts/examples/kasem-research-cycle.example.json', 'utf8'));
const ajv = new Ajv2020({ strict: true }); addFormats(ajv);
const schema = ajv.compile(JSON.parse(readFileSync('packages/contracts/schemas/kasem-research-cycle.schema.json', 'utf8')));
const uses = ['display', 'retrieval', 'training'];
const rights = { display: 'allowed', retrieval: 'allowed', training: 'allowed' };
const categories = ['ownership', 'occupancy', 'parenthood', 'person', 'variant', 'misleading_prompt', 'unsupported', 'source_conflict'];
const noteJudgment = { meaning: 'faithful', grammar: 'acceptable', naturalness: 'natural', contextFit: 'fits', explanation: 'Synthetic only.', annotationApproved: true };
function history(source, approved = true) {
  const steps = [['candidate','submitted','curator'],['submitted','curated','curator'],['curated','reviewed','qualified_language_reviewer']];
  if (approved) steps.push(['reviewed','approved','qualified_language_reviewer'],['approved','approved','qualified_language_reviewer']);
  return steps.map(([from,to,role],i) => ({ from,to,role,actor:'reviewer-'+i,date:now,version:1,scope:'Synthetic context only.',evidence_source_ids:[source],uses,decision:'Synthetic test decision.' }));
}
function complete() {
  const cycle = structuredClone(template), q = cycle.records[0], notes = [];
  const doc = {source_id:cycle.sources[0].id,locator:'Synthetic page 1',evidence_type:'publication',transcription_status:'scan_checked',checked_by:'synthetic-checker',checked_at:now,note_id:null,note_revision:null,example_index:null};
  cycle.sources[0].permissions = {...rights}; cycle.targets.evaluation_items = 8;
  q.evidence = [doc]; q.review_status = 'reviewed'; q.review_history = history(doc.source_id,false); q.resolution = 'Synthetic limited conclusion.';
  const base = (id,type) => ({...structuredClone(q),id,type,original_text:'synthetic-'+id,reviewed_text:'synthetic-'+id,meaning_in_context:'Synthetic meaning '+id,
    usage_context:{situation:'Synthetic context only.',speaker_relationship:null,community_or_variety:'synthetic',register:null},scope:'Synthetic context only.',hypothesis:null,next_speaker_task:null,resolution:null,permissions:{...rights},review_status:'approved',review_history:history(doc.source_id),evidence:[doc]});
  const exampleRecord = (i,heldOut) => {
    const id='synthetic-note-'+i, source='synthetic-session-'+i;
    let n=parseNote({examples:[{kasem:'synthetic-token-'+i,english:'Synthetic scenario '+i,dialect:'synthetic',sourceType:'speaker',source,context:{situation:'Synthetic context only.'}}],permissions:{review:true,sourceConfirmed:true,publication:true,providerRetrieval:true,modelTraining:true,evaluation:true}},id,'synthetic-author',now);
    for (const reviewer of ['language-r1','language-r2']) n=addReview(n,parseReview({revision:1,dialectCompetent:true,judgments:[noteJudgment]},n,reviewer,now));
    if (heldOut) n.reservedSplit='test';
    notes.push(n); cycle.sources.push({id:source,title:source,kind:'speaker_session',permissions:{...rights},access_note:'Synthetic only.'});
    const r=base('synthetic-example-'+i,'example');r.original_text=n.examples[0].originalKasem;r.reviewed_text=n.examples[0].kasem;r.review_history=history(source);
    r.evidence=[{source_id:source,locator:'Synthetic timestamp 00:01',evidence_type:'speaker_example',transcription_status:'speaker_checked',checked_by:'synthetic-speaker',checked_at:now,note_id:id,note_revision:1,example_index:0}];
    cycle.records.push(r);return r;
  };
  const grounding=exampleRecord('ground',false);
  const construction=base('synthetic-construction','construction');construction.support_record_ids=[grounding.id];cycle.records.push(construction);
  cycle.evaluations=categories.map((category,i)=>{
    const record=exampleRecord(i,true),expected=category==='unsupported'?'abstention':category==='source_conflict'?'conflict':category==='misleading_prompt'?'clarification':'supported_example';
    return {id:'synthetic-eval-'+i,pattern_id:q.pattern_id,category,situation:'Synthetic unseen situation '+i,expected_behavior:expected,held_out_record_id:record.id,
      run:{model_version:'synthetic-model',prompt_version:'synthetic-prompt',date:now,response:'Synthetic response only.',response_kind:expected,
        grounding_record_ids:expected==='supported_example'?[grounding.id]:[],cited_source_ids:expected==='supported_example'?[grounding.evidence[0].source_id]:[],scope:expected==='supported_example'?grounding.scope:null,
        judgments:['r1','r2'].map(reviewer=>({reviewer,dialect_competent:true,meaning:true,number:true,spelling:true,context:true,source_fidelity:true,useful_uncertainty:true,fabricated_source:false,systematic_meaning_confusion:false}))}};
  });
  assert.equal(schema(cycle),true,JSON.stringify(schema.errors));return {cycle,notes};
}

test('the actual pilot uses checked editable copies and retains pending speaker work and unseen tests',()=>{
  const pilot=JSON.parse(readFileSync('docs/data/language-cells/kasem/person-meaning-pilot/cycle.json','utf8'));
  assert.equal(schema(pilot),true,JSON.stringify(schema.errors));
  const report=inspectResearchCycle(pilot,[],pilot.as_of);
  assert.equal(pilot.patterns.length,5);assert.equal(pilot.evaluations.length,20);
  assert.equal(report.milestone_complete,false);assert.equal(report.evaluation.judged,0);
  assert.equal(report.patterns.every(p=>p.reviewed_natural_examples===0),true);
  assert.equal(report.patterns.filter(p=>p.documented).length,4);
  assert.equal(pilot.records.flatMap(r=>r.evidence).every(e=>e.transcription_status==='editable_checked'),true);
  assert.equal(Object.values(report.eligibility).every(e=>e.retrieval.length>0),true);
  assert.match(report.next_action,/accepted sources/);
});

test('editable checks count as documentary evidence without implying scan checks or language approval',()=>{
  const {cycle,notes}=complete();
  cycle.sources[0].documentary_representation='editable_copy';
  for(const r of cycle.records) for(const e of r.evidence) if(e.evidence_type==='publication') e.transcription_status='editable_checked';
  assert.equal(schema(cycle),true,JSON.stringify(schema.errors));
  let report=inspectResearchCycle(cycle,notes,now);
  assert.equal(report.milestone_complete,true);assert.deepEqual(report.patterns[0].documentary_checks,['editable_checked']);
  delete cycle.sources[0].documentary_representation;
  report=inspectResearchCycle(cycle,notes,now);assert.equal(report.milestone_complete,false);
  assert.ok(report.issues.some(i=>i.code==='transcription-check-without-valid-attestation'));
});

test('a complete synthetic cycle passes, projects linked reviewed records, and withholds held-out families',()=>{
  const {cycle,notes}=complete(), report=inspectResearchCycle(cycle,notes,now);
  assert.deepEqual(report.issues,[]);assert.equal(report.milestone_complete,true);
  assert.equal(report.evaluation.supported_coverage,1);assert.equal(report.evaluation.supported_correctness,1);
  const projection=reviewedResearchProjection(cycle,notes,'retrieval',now);
  assert.deepEqual(projection.records.map(r=>r.id),['synthetic-example-ground','synthetic-construction']);
  assert.equal(projection.records[1].support_record_ids[0],projection.records[0].id);
  assert.equal(JSON.stringify(projection).includes('language-r1'),false);
});

test('stale revisions, withdrawals, expiry and missing purpose consent remove the affected example and construction',()=>{
  for(const alter of [n=>n.revision++,n=>n.permissions.status='withdrawn',n=>n.permissions.expiresAt='2026-10-10T00:00:00.000Z',n=>n.permissions.providerRetrieval=false]) {
    const {cycle,notes}=complete();alter(notes[0]);
    const report=inspectResearchCycle(cycle,notes,now);
    assert.equal(report.milestone_complete,false);
    assert.ok(report.eligibility['synthetic-example-ground'].retrieval.length);
    assert.ok(report.eligibility['synthetic-construction'].retrieval.includes('ineligible-support:synthetic-example-ground'));
  }
});

test('unknown source rights, narrowed review scope and revised records cannot inherit approvals',()=>{
  for(const alter of [c=>c.sources[1].permissions.retrieval='unknown',c=>c.records.find(r=>r.id==='synthetic-example-ground').scope='Different scope',c=>c.records.find(r=>r.id==='synthetic-example-ground').version++]) {
    const {cycle,notes}=complete();alter(cycle);
    assert.ok(inspectResearchCycle(cycle,notes,now).eligibility['synthetic-example-ground'].retrieval.length);
  }
});

test('display approval does not confer retrieval or training permission',()=>{
  const {cycle,notes}=complete(),r=cycle.records.find(r=>r.id==='synthetic-example-ground');
  r.permissions.retrieval='unknown';r.permissions.training='denied';
  const report=inspectResearchCycle(cycle,notes,now);
  assert.deepEqual(report.eligibility[r.id].display,[]);assert.ok(report.eligibility[r.id].retrieval.length);assert.ok(report.eligibility[r.id].training.length);
});

test('reopened disputes need fresh approvals and changed reviewed wording must return to sentence review',()=>{
  const {cycle,notes}=complete(),r=cycle.records.find(r=>r.id==='synthetic-example-ground');
  const previous=r.review_history[4];
  for(const [from,to] of [['approved','disputed'],['disputed','curated'],['curated','reviewed'],['reviewed','approved']]) r.review_history.push({...previous,from,to,actor:'new-reviewer'});
  let report=inspectResearchCycle(cycle,notes,now);
  assert.ok(report.eligibility[r.id].retrieval.includes('needs-two-current-scoped-use-reviews'));
  r.review_history.push({...previous,from:'approved',to:'approved',actor:'second-new-reviewer'});
  r.reviewed_text='Unreviewed replacement sentence';report=inspectResearchCycle(cycle,notes,now);
  assert.ok(report.issues.some(i=>i.code==='reviewed-example-does-not-match-attestation'));assert.equal(report.milestone_complete,false);
});

test('circular support, fabricated citations, broadened scopes and systematic meaning failures block completion',()=>{
  for(const alter of [c=>c.records.find(r=>r.id==='synthetic-example-ground').support_record_ids=['synthetic-construction'],c=>c.evaluations[0].run.cited_source_ids=['invented-source'],c=>c.evaluations[0].run.scope='Universal Kasem rule',c=>c.evaluations[0].run.judgments[0].systematic_meaning_confusion=true]) {
    const {cycle,notes}=complete();alter(cycle);const report=inspectResearchCycle(cycle,notes,now);
    assert.equal(report.milestone_complete,false);assert.ok(report.issues.length);
    assert.throws(()=>reviewedResearchProjection(cycle,notes,'retrieval',now),/integrity/);
  }
});

test('broken links, skipped review states, absent reservations and contributor self-evaluation fail the gate',()=>{
  for(const alter of [c=>c.records[0].related_record_ids=['missing'],c=>c.records[0].review_history[0].to='approved',c=>c.evaluations[0].held_out_record_id='missing',c=>c.evaluations[0].run.judgments[0].reviewer='synthetic-author']) {
    const {cycle,notes}=complete();alter(cycle);const report=inspectResearchCycle(cycle,notes,now);
    assert.equal(report.milestone_complete,false);assert.ok(report.issues.length);
  }
  const {cycle,notes}=complete();notes[1].reservedSplit='';
  assert.ok(inspectResearchCycle(cycle,notes,now).issues.some(i=>i.code==='evaluation-needs-reviewed-reserved-speaker-example'));
});

test('all-abstention output has zero supported coverage and cannot pass',()=>{
  const {cycle,notes}=complete();for(const e of cycle.evaluations) e.run.response_kind='abstention';
  const report=inspectResearchCycle(cycle,notes,now);
  assert.equal(report.evaluation.supported_coverage,0);assert.equal(report.evaluation.supported_correctness,null);assert.equal(report.milestone_complete,false);
});

test('missing judgments keep pending items in coverage denominators; duplicate reviewers do not count twice',()=>{
  const {cycle,notes}=complete();cycle.evaluations[0].run=null;
  let report=inspectResearchCycle(cycle,notes,now);assert.ok(report.evaluation.supported_coverage<1);assert.equal(report.milestone_complete,false);
  cycle.evaluations[1].run.judgments[1].reviewer='r1';report=inspectResearchCycle(cycle,notes,now);
  assert.ok(report.issues.some(i=>i.code==='duplicate-evaluation-reviewer'));assert.equal(report.milestone_complete,false);
});

test('held-out near paraphrases and newly linked source families are excluded from grounding',()=>{
  const {cycle,notes}=complete();notes[0].groups=['shared-family'];notes[1].groups=['shared-family'];
  let report=inspectResearchCycle(cycle,notes,now);assert.ok(report.eligibility['synthetic-example-ground'].retrieval.includes('held-out-evidence'));
  notes[0].groups=[];notes[1].groups=[];notes[1].examples[0].english='A visitor waits outside today';notes[0].examples[0].english=notes[1].examples[0].english+' now';
  report=inspectResearchCycle(cycle,notes,now);assert.ok(report.eligibility['synthetic-example-ground'].retrieval.includes('held-out-evidence'));
});

test('original characters, spacing and legitimate variants survive; NFC duplicate flags require investigation',()=>{
  const {cycle,notes}=complete(),r=cycle.records.find(r=>r.id==='synthetic-example-ground');
  r.original_text='  nɔɔno fi\u0301xture-token  ';notes[0].examples[0].originalKasem=r.original_text;
  const copy={...structuredClone(r),id:'synthetic-other-attestation',original_text:r.original_text.normalize('NFC')};cycle.records.push(copy);
  const report=inspectResearchCycle(cycle,notes,now);assert.ok(report.flags.length);assert.equal(report.milestone_complete,false);
  assert.equal(cycle.records.find(x=>x.id===r.id).original_text,r.original_text);
});

const prefix=join(tmpdir(),'kasem-cycle-test-'),dir=mkdtempSync(prefix);
const run=args=>execFileSync(process.execPath,['services/functions/scripts/kasem-research-cycle.mjs',...args],{encoding:'utf8',stdio:'pipe'});
after(()=>{if(!resolve(dir).startsWith(resolve(prefix)))throw new Error('Unexpected cleanup target');rmSync(dir,{recursive:true,force:true});});
test('CLI validates IDs, separates open elicitation from follow-ups, protects private output and prevents early training',()=>{
  const {cycle,notes}=complete(),input=join(dir,'cycle.json'),evidence=join(dir,'evidence.json');
  writeFileSync(input,JSON.stringify(cycle));writeFileSync(evidence,JSON.stringify(notes));
  const packet=join(dir,'packet');run(['packet','--cycle',input,'--evidence',evidence,'--output',packet,'--as-of',now]);
  const tasks=JSON.parse(readFileSync(join(packet,'speaker-tasks.json'),'utf8'));
  assert.equal(tasks[0].follow_up_forms,undefined);assert.equal(tasks[0].situations.length,1);
  assert.throws(()=>run(['packet','--cycle',input,'--output','data/must-not-write-cycle']),/Private output/);
  cycle.evaluations[0].run=null;writeFileSync(input,JSON.stringify(cycle));
  assert.throws(()=>run(['project','--cycle',input,'--evidence',evidence,'--use','training','--output',join(dir,'early-training'),'--as-of',now]),/Finish and evaluate/);
  cycle.records[0].id='../malformed';writeFileSync(input,JSON.stringify(cycle));
  assert.throws(()=>run(['report','--cycle',input]),/Invalid kasem-research-cycle/);
});
