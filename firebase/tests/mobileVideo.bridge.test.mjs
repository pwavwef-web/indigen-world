// Run the Flutter screen suite first; it writes the actual mobile caption PNG.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { parseRenderSpec } from '../../services/functions/lib/video-editor/render-spec.js';
import { buildRenderPlan } from '../../services/functions/lib/video-editor/render-plan.js';
import { blankFrameArgs, probeMedia, runFfmpeg } from '../../services/functions/lib/video-editor/ffmpeg.js';
const FF=createRequire(new URL('../../services/functions/package.json',import.meta.url))('ffmpeg-static');
test('the actual Flutter caption raster passes the shared contract and produces a playable timed H264/AAC output', async () => {
  const dir=path.resolve('data/private/mobile-render-fixture');
  const spec=parseRenderSpec(JSON.parse(readFileSync(path.join(dir,'spec.json'),'utf8')),{uid:'synthetic-review-member',projectId:'review-project',requestId:'review-request'});
  const blank=path.join(dir,'blank.png');await runFfmpeg(blankFrameArgs(720,1280,blank),{timeoutMs:30000});
  const layer=spec.layers[0].layerPath, output=path.join(dir,'mobile-edited-output.mp4');
  const plan=buildRenderPlan(spec,{aspect:'9:16',resolution:'720p',quality:'standard'},{media:new Map([['review-image',{path:path.resolve('apps/mobile/assets/places/paga-pond.jpg'),hasVideo:true,hasAudio:false,durationSec:4}]]),layers:new Map([[layer,path.join(dir,'caption.png')]]),stickers:new Map(),tracks:new Map(),blankFramePath:blank},dir,output);
  for(const file of plan.files)writeFileSync(file.path,file.content);
  await runFfmpeg(plan.args,{timeoutMs:180000});
  const probe=await probeMedia(output);assert.equal(probe.width,720);assert.equal(probe.height,1280);assert.ok(Math.abs(probe.durationSec-4)<.1);assert.ok(probe.hasAudio);
  function crop(time){const r=spawnSync(FF,['-v','error','-ss',String(time),'-i',output,'-frames:v','1','-vf','crop=640:220:40:880','-f','rawvideo','-pix_fmt','rgb24','-'],{maxBuffer:3*1024*1024});assert.equal(r.status,0);return r.stdout;}
  const before=crop(.5),during=crop(2),after=crop(3.5);
  const difference=(a,b)=>a.reduce((sum,n,i)=>sum+Math.abs(n-b[i]),0)/a.length;
  assert.ok(difference(before,during)>3,'Flutter caption appears in its timed window');assert.ok(difference(before,after)<3,'Caption disappears after its end');
  const screens=path.resolve('apps/updates-blog/posts/2026-10-16-connected-mobile-workflows/screens');mkdirSync(screens,{recursive:true});
  const frame=spawnSync(FF,['-v','error','-y','-ss','2','-i',output,'-frames:v','1',path.join(screens,'mobile-rendered-output.png')]);assert.equal(frame.status,0);
  console.log('Verified actual Flutter raster -> shared worker -> 720×1280, 4s, timed captions and playable MP4:',output);
});
