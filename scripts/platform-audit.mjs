import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(root, 'data/platform-audit');
mkdirSync(out, { recursive: true });
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }).trim();
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const selected = git('ls-files', '--cached', '--others', '--exclude-standard').split('\n').filter(p =>
  /^(README\.md|package\.json|firebase\.json|docs\/(architecture|decisions|governance|operations|product)\/.*\.(md|json)|\.github\/workflows\/.*\.yml|apps\/[^/]+\/(README\.md|package\.json)|apps\/updates-blog\/posts\/.*\/(README\.md|share\.md)|services\/(functions|ai|assessment-worker)\/(README\.md|package\.json))$/.test(p)
).filter(p => existsSync(resolve(root, p)));
const files = [...new Set(selected)].sort().map(p => {
  const b = readFileSync(resolve(root,p));
  return { path:p, sha256:sha(b), lines:b.toString('utf8').split('\n').length };
});
const statusLines = git('status','--porcelain=v1','--untracked-files=all').split('\n').filter(Boolean);
const snapshot = {
  generatedAt:new Date().toISOString(),
  head:git('rev-parse','HEAD'), branch:git('branch','--show-current'),
  headDate:git('show','-s','--format=%cI','HEAD'),
  scope:'Repository metadata inventory only; file inclusion does not mean semantic review. No production database, private records, credentials or correspondence read.',
  dirtyPaths:statusLines.length, files,
  releasePostCount: files.filter(f=>/^apps\/updates-blog\/posts\/[^/]+\/README\.md$/.test(f.path)).length,
  releaseNoteCount:files.filter(f=>/^docs\/product\/releases\//.test(f.path)).length,
};
if (process.argv.includes('--check')) {
  const curated=JSON.parse(readFileSync(resolve(out,'reviewed.json'),'utf8'));
  const missing = curated.sources.filter(s=>s.path && !existsSync(resolve(root,s.path)));
  const drift = curated.sources.filter(s=>s.path && existsSync(resolve(root,s.path)) && s.sha256 !== sha(readFileSync(resolve(root,s.path))));
  const ids=new Set(curated.capabilities.map(r=>r.id));
  const errors=[];
  if(ids.size!==curated.capabilities.length) errors.push('Duplicate capability IDs');
  for(const r of [...curated.capabilities,...curated.decisions,...curated.releases,...curated.gaps]) {
    if (!r.sources?.length || r.sources.some(id=>!curated.sources.some(s=>s.id===id))) errors.push('Missing/unknown source: '+r.id);
  }
  if(missing.length) errors.push('Missing files: '+missing.map(s=>s.path).join(', '));
  if(drift.length) errors.push('Reviewed source drift: '+drift.map(s=>s.path).join(', '));
  console.log(JSON.stringify({capabilities:curated.capabilities.length,sources:curated.sources.length,decisions:curated.decisions.length,releases:curated.releases.length,gaps:curated.gaps.length,errors},null,2));
  process.exitCode=errors.length?1:0;
} else {
  writeFileSync(resolve(out,'inventory.json'),JSON.stringify(snapshot,null,2)+'\n');
  console.log(JSON.stringify({head:snapshot.head,headDate:snapshot.headDate,files:files.length,dirtyPaths:snapshot.dirtyPaths,releasePosts:snapshot.releasePostCount,releaseNotes:snapshot.releaseNoteCount}));
}
