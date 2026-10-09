import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, createWriteStream } from 'node:fs';
import { resolve } from 'node:path';

// Existing package scripts remain authoritative. Continue after a failure so
// missing Flutter/Java/browser prerequisites cannot conceal independent checks.
const root = resolve(import.meta.dirname, '..');
const requested = process.argv.slice(2);
const selected = requested.length ? requested : ['--web', '--emulator', '--mobile'];
if (selected.some(value => !['--web','--emulator','--mobile','--browser'].includes(value))) throw Error('Options: --web --emulator --mobile --browser');
const out = resolve(root, '.tooling/ten-shipping');
mkdirSync(out,{recursive:true});
const jobs = [];
const add = (name,command,cwd=root) => jobs.push({name,command,cwd});
if (selected.includes('--web')) {
  for (const name of ['build:web-ui','build:console-ui','test:contracts','check:tribestudio','check:kasena-dictionary','check:website','typecheck:admin','build:admin','test:function-helpers']) add(name,`npm run ${name}`);
}
if (selected.includes('--emulator')) {
  add('build:functions','npm run build:functions');
  add('shipping-emulator','npx firebase emulators:exec --config .public-progress-test.firebase.json --project demo-indigen-shipping-tests --only firestore "node --test --test-concurrency=1 firebase/tests/shipping.integration.test.mjs"');
}
if (selected.includes('--mobile')) {
  const mobile=resolve(root,'apps/mobile');
  add('flutter-version','flutter --version',mobile);
  add('flutter-analysis','flutter analyze --no-pub',mobile);
  add('flutter-focused','flutter test --no-pub test/features/contribute/draft_recovery_test.dart test/features/downloads/downloads_test.dart test/core/media_preferences_test.dart test/features/music/music_queue_test.dart test/features/downloads/downloads_widget_test.dart',mobile);
}
if(selected.includes('--browser')) add('browser-journeys','node scripts/check-shipping-browser.mjs');
const results=[];
for(const job of jobs) {
  console.log(`\nRunning ${job.name}`);
  const log=createWriteStream(resolve(out,job.name.replaceAll(':','-')+'.log'));
  const result=await new Promise(done=>{
    const child=spawn(job.command,{cwd:job.cwd,shell:true,windowsHide:true,env:process.env});
    child.stdout.on('data',data=>{log.write(data);process.stdout.write(data);});
    child.stderr.on('data',data=>{log.write(data);process.stderr.write(data);});
    child.on('error',error=>done({exitCode:2,error:error.message}));
    child.on('close',exitCode=>done({exitCode}));
  });
  log.end();results.push({...job,...result});
  writeFileSync(resolve(out,'results.json'),JSON.stringify({timestamp:new Date().toISOString(),results},null,2));
}
console.table(results.map(({name,exitCode})=>({check:name,exitCode})));
process.exitCode=results.some(row=>row.exitCode!==0)?1:0;
