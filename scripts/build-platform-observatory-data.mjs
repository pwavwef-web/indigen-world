import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sourceSpecs, capabilities, decisions, releases, gaps, externalSources } from '../data/platform-audit/curation.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const file=p=>resolve(root,p);
const sha=b=>createHash('sha256').update(b).digest('hex');
const read=p=>JSON.parse(readFileSync(file(p),'utf8'));
const inventory=read('data/platform-audit/inventory.json');
const http=read('data/platform-audit/http-checks.json');
const sources=sourceSpecs.map(([id,path,start,end])=>{
  const bytes=readFileSync(file(path)); const lines=bytes.toString('utf8').split(/\r?\n/);
  if(start>lines.length) throw new Error(`Invalid source range: ${path}:${start}`);
  return {id,path,start,end:Math.min(end,lines.length),sha256:sha(bytes),classification:'Repository primary evidence',excerpt:lines.slice(start-1,end).join('\n')};
});
const sourceById=Object.fromEntries(sources.map(s=>[s.id,s]));
if(existsSync(file('data/platform-audit/reviewed.json'))&&!process.argv.includes('--accept-reviewed-sources')) {
 const prior=read('data/platform-audit/reviewed.json');
 const drift=sources.filter(s=>prior.sources.find(p=>p.id===s.id)?.sha256!==s.sha256);
 if(drift.length) throw new Error('Review changed sources and curation before accepting new identities: '+drift.map(s=>s.path).join(', ')+'. After manual review, rerun with --accept-reviewed-sources.');
}
for(const row of [...capabilities,...decisions,...releases,...gaps]) {
  if(!row.sources.length || row.sources.some(id=>!sourceById[id])) throw new Error('Unknown evidence in '+row.id);
}
const domains=[...new Set(capabilities.map(c=>c.domain))];
const coverage=domains.map(domain=>{
  const rs=capabilities.filter(c=>c.domain===domain);
  return {domain,Implemented:rs.filter(c=>c.state==='Implemented').length,Partial:rs.filter(c=>c.state==='Partial').length,Planned:rs.filter(c=>c.state==='Planned').length,total:rs.length};
});
const meta={
 id:'audit-2026-10-15',auditDate:'2026-10-15',auditedAt:new Date().toISOString(),head:inventory.head,headDate:inventory.headDate,
 inventoriedFiles:inventory.files.length,releasePostFolders:inventory.releasePostCount,releaseNotes:inventory.releaseNoteCount,
 workingTree:'Includes existing modified/untracked work. Latest local commit dated 10 Oct; later documentary release receipts do not identify this entire checkout as production.',
 scope:'Bounded review of product/governance/architecture documents, implementation entry points, selected tests and dated release records. No private records, production database, Play Console, provider balances or live user analytics inspected.',
 limitation:'Not every line, endpoint or historical change was audited. Source-level findings require scoped fixes and verification; unknown evidence is not a failing or passing result.',
};
const unknowns=[
 {id:'u-adoption',title:'Adoption and retention',value:null,status:'Not measured in this audit',needed:'Consented, defined active-user/cohort events and a time window; avoid cross-device tracking without a privacy decision.'},
 {id:'u-learning',title:'Learning and language quality',value:null,status:'Not measured in this audit',needed:'Independent speaker/learner assessment, source variety, baseline, held-out items and sample/denominator.'},
 {id:'u-rights',title:'Rights and qualified-review coverage',value:null,status:'Not measured in this audit',needed:'Authorised aggregate audit of current per-purpose permissions and valid reviewer decisions; no raw corpus export.'},
 {id:'u-finance',title:'Settled rewards and sustainability',value:null,status:'Not measured in this audit',needed:'Approved aggregate settlement/reconciliation and provider cost evidence, with period, currency and operating capacity.'},
];
const reviewed={metadata:meta,sources,externalSources,capabilities,coverage,decisions,releases,gaps,http,unknowns};
writeFileSync(file('data/platform-audit/reviewed.json'),JSON.stringify(reviewed,null,2)+'\n');
const snapshotPath='tools/platform-observatory/src/data.json';
const existing=read(snapshotPath);
const provenance=(ids,label,definitions=[])=>{
 const refs=[...new Set(ids)].map(id=>sourceById[id]);
 return {label,provider:'Local repository review',executedAt:meta.auditedAt,files:[...new Set(refs.map(r=>r.path))],
  filters:['Snapshot date: 15 October 2026 UTC','Current working tree; private storage excluded'],
  metricDefinitions:definitions,
  caveats:['Implementation, historical test results, documentary deployment receipts and current HTTP checks are distinct. No production business/outcome metrics were queried.','The capability inventory is curated at mixed feature granularity. Counts show the scope of this review, not platform completion or quality.'],
  evidenceFlow:refs.map(r=>({title:r.path+':'+r.start+'–'+r.end,detail:'Read the indicated source range in the current working tree; SHA-256 '+r.sha256+'. Exact excerpt retained in sources query. Documentary dates/results were not rerun.'})),
 };
};
const allIds=sources.map(s=>s.id);
const queries={};
for(const [id,rows,label] of [
 ['capabilities',capabilities,'Curated platform capability ledger'],['decisions',decisions,'Proposed next decisions and acceptance evidence'],
 ['releases',releases,'Dated documentary release milestones'],['gaps',gaps,'Source conflicts and implementation gaps'],
 ['sources',sources,'Exact reviewed source excerpts and file identities'],['metadata',[meta],'Audit scope and repository identity'],
 ['unknowns',unknowns,'Required outcome evidence not captured'],['coverage',coverage,'Capability inventory by domain and implementation state'],
 ]) {
 const ids=rows.flatMap(r=>r.sources??[]);
 queries[id]={rows,source:provenance(ids.length?ids:allIds,label,id==='coverage'?[{label:'Capability inventory count',definition:'Number of curated capability rows in each domain with source-backed implementation state. Implemented means executable behavior exists; Partial means important implementation or operational gates remain; Planned means ambition/decision without demonstrated complete behavior. These counts are not weighted completion percentages.',componentIds:['coverage-chart'],formula:'Count capabilities grouped by domain and state.',sourceLineage:[{files:[...new Set(sources.map(s=>s.path))]}]}]:[]),
  methods:[{language:'JavaScript',code:id==='coverage'?'For each distinct domain, count curated capabilities by exact state Implemented, Partial, Planned. No weighting, scoring or extrapolation.':'Read the explicitly curated claim register; resolve each source ID to exact local path, range and SHA-256. Preserve caveats and dated evidence.'}]};
}
queries.http={rows:http.map((r,i)=>({id:'h'+i,...r})),source:{label:'Current public HTTP shell checks',provider:'Public HTTPS',executedAt:http.at(-1).checkedAt,links:http.map(r=>({label:r.url,url:r.url})),caveats:['HTTP 200 verifies page-shell reachability only. No assets, sign-in, backend transaction, App Check, content quality or availability claims follow.'],evidenceFlow:http.map(r=>({title:r.url,detail:'GET with 12-second timeout; checked '+r.checkedAt+'; status '+r.status+'; title '+r.title+'. No authenticated requests or mutations.'}))}};
for(const row of capabilities) queries['capability_'+row.id]={rows:[row],source:provenance(row.sources,row.title)};
if(existsSync(file('data/platform-audit/checks.json'))) {
 const checks=read('data/platform-audit/checks.json');
 queries.auditchecks={rows:checks,source:{label:'Checks actually run in this audit',provider:'Local verification',files:['data/platform-audit/checks.json'],executedAt:checks.at(-1).recordedAt,caveats:['These scoped checks do not establish a full platform test pass or production readiness.'],evidenceFlow:checks.map(c=>({title:c.command,detail:c.result+' Scope: '+c.scope}))}};
}
queries.external={rows:externalSources,source:{label:'External primary guidance',executedAt:'2026-10-15T23:24:37Z',links:externalSources.map(r=>({label:r.title,url:r.url})),caveats:['Guidance is a review lens; no compliance certification or product-performance conclusion.'],evidenceFlow:[{title:'Official-source web review',detail:'Read GIDA CARE Principles, W3C WCAG 2.2 and Remotion Player official documentation on 15 October 2026.'}]}};
writeFileSync(file(snapshotPath),JSON.stringify({...existing,title:'Indigen World · Platform observatory',status:'reviewed',buildStatus:'creating',generatedAt:meta.auditedAt,filters:[
 {id:'domain',label:'Domain',field:'domain',defaultValue:'all',queryIds:['capabilities','coverage']},
 {id:'state',label:'Implementation',field:'state',defaultValue:'all',queryIds:['capabilities']},
],queries},null,2)+'\n');
console.log(JSON.stringify({capabilities:capabilities.length,domains:domains.length,sources:sources.length,decisions:decisions.length,releases:releases.length,gaps:gaps.length}));
