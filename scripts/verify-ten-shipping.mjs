import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, createWriteStream } from 'node:fs';
import { resolve } from 'node:path';

// Existing package scripts remain authoritative. Continue after a failure so
// missing Flutter/Java/browser prerequisites cannot conceal independent checks.
const root = resolve(import.meta.dirname, '..');
const requested = process.argv.slice(2);
const selected = requested.length ? requested : ['--web', '--emulator', '--mobile'];
if (selected.some(value => !['--web','--emulator','--mobile','--browser','--review-browser'].includes(value))) throw Error('Options: --web --emulator --mobile --browser --review-browser');
const out = resolve(root, '.tooling/ten-shipping');
mkdirSync(out,{recursive:true});
// Firebase CLI debug logs enumerate the child's environment. Tests need tools
// and local paths, never live provider keys, access tokens or cloud credentials.
const allowedEnv=['PATH','Path','PATHEXT','SystemRoot','WINDIR','windir','ComSpec','COMSPEC','TEMP','TMP','JAVA_HOME','USERPROFILE','HOME','APPDATA','LOCALAPPDATA','ProgramFiles','ProgramFiles(x86)','ProgramW6432','ProgramData','ANDROID_HOME','ANDROID_SDK_ROOT','FLUTTER_ROOT','PUB_CACHE','GRADLE_USER_HOME','CHROMIUM_EXECUTABLE','SHIPPING_EVIDENCE_DIR','STUDIO_PREVIEW_URL','DICTIONARY_PREVIEW_URL','PROGRESS_PREVIEW_URL'];
const runEnv=Object.fromEntries(allowedEnv.filter(key=>process.env[key]).map(key=>[key,process.env[key]]));
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
  add('flutter-dependencies','flutter pub get --enforce-lockfile',mobile);
  add('flutter-analysis','flutter analyze --no-pub',mobile);
  add('flutter-focused','flutter test --no-pub test/features/contribute/draft_recovery_test.dart test/features/contribute/words/word_queue_controller_test.dart test/features/contribute/words/word_queue_screen_test.dart test/features/contribute/words/language_loop_test.dart test/features/downloads/downloads_test.dart test/core/media_preferences_test.dart test/core/low_data_requests_test.dart test/features/music/music_queue_test.dart test/features/downloads/downloads_widget_test.dart',mobile);
}
if(selected.includes('--browser')) {
  if(!selected.includes('--web') && !selected.includes('--emulator')) add('build:functions','npm run build:functions');
  add('browser-journeys','node scripts/check-shipping-browser.mjs');
  add('progress-browser','npm run test:progress:browser --workspace @indigen-world/website');
  add('review-browser','npx firebase emulators:exec --config .shipping-browser.firebase.json --project demo-indigen-shipping-browser --only auth,firestore "node scripts/check-shipping-review-browser.mjs"');
}
if(selected.includes('--review-browser') && !selected.includes('--browser')) {
  if(!selected.includes('--web') && !selected.includes('--emulator')) add('build:functions','npm run build:functions');
  add('review-browser','npx firebase emulators:exec --config .shipping-browser.firebase.json --project demo-indigen-shipping-browser --only auth,firestore \"node scripts/check-shipping-review-browser.mjs\"');
}
const servers=[];
async function previews() {
  for(const [app,port] of [['tribestudio',5199],['website',5200],['kasem-dictionary',5201]]) {
    const url=`http://127.0.0.1:${port}`;
    try {if((await fetch(url,{signal:AbortSignal.timeout(1000)})).ok) continue;}catch{}
    const child=spawn(process.execPath,[resolve(root,'node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:resolve(root,'apps',app),stdio:'ignore',windowsHide:true,env:runEnv});servers.push(child);
    let ready=false;
    for(let i=0;i<60;i++){try{ready=(await fetch(url,{signal:AbortSignal.timeout(1000)})).ok;}catch{}if(ready)break;await new Promise(resolve=>setTimeout(resolve,500));}
    if(!ready) throw Error(`Local ${app} preview did not start at ${url}`);
  }
}
const results=[];
const report='results-'+selected.map(value=>value.slice(2)).join('-')+'.json';
for(const job of jobs) {
  console.log(`\nRunning ${job.name}`);
  if(job.name.startsWith('flutter-') && !['flutter-version','flutter-dependencies'].includes(job.name) && results.some(row=>['flutter-version','flutter-dependencies'].includes(row.name) && row.exitCode!==0)) {
    results.push({...job,exitCode:2,error:'Blocked by Flutter toolchain/dependency prerequisite'});
    writeFileSync(resolve(out,report),JSON.stringify({timestamp:new Date().toISOString(),results},null,2));continue;
  }
  const log=createWriteStream(resolve(out,job.name.replaceAll(':','-')+'.log'));
  if(job.name==='browser-journeys') {
    try {await previews();} catch(error) {
      console.error(error);log.end();results.push({...job,exitCode:2,error:error.message});
      writeFileSync(resolve(out,report),JSON.stringify({timestamp:new Date().toISOString(),results},null,2));continue;
    }
  }
  const result=await new Promise(done=>{
    const child=spawn(job.command,{cwd:job.cwd,shell:true,windowsHide:true,env:{...runEnv,PROGRESS_PREVIEW_URL:process.env.PROGRESS_PREVIEW_URL || 'http://127.0.0.1:5200',PROGRESS_BLOCK_EXTERNAL:'true'}});
    child.stdout.on('data',data=>{log.write(data);process.stdout.write(data);});
    child.stderr.on('data',data=>{log.write(data);process.stderr.write(data);});
    child.on('error',error=>done({exitCode:2,error:error.message}));
    child.on('close',exitCode=>done({exitCode}));
  });
  log.end();results.push({...job,...result});
  writeFileSync(resolve(out,report),JSON.stringify({timestamp:new Date().toISOString(),results},null,2));
}
for(const server of servers) server.kill();
console.table(results.map(({name,exitCode})=>({check:name,exitCode})));
process.exitCode=results.some(row=>row.exitCode!==0)?1:0;
