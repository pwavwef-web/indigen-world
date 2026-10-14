import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TRAIL, newTrail, nextTrail, tickTrail, moveTrail, jumpTrail, slideTrail, trailScore, trailPattern } from '../src/features/labs/runner-engine.ts';

test('lanes clamp; checkpoint state ignores controls and simulation', () => {
  const s = newTrail(); for(let i=0;i<5;i++) moveTrail(s,-1); assert.equal(s.lane,0);
  for(let i=0;i<5;i++) moveTrail(s,1); assert.equal(s.lane,2);
  s.status='checkpoint'; const before=structuredClone(s); moveTrail(s,-1);jumpTrail(s);slideTrail(s);tickTrail(s,1);
  assert.deepEqual(s,before);
});
function contact(kind, pose='') {
  const s=newTrail();s.nextSpawn=10000;s.items=[{id:1,lane:1,z:.6,kind,hit:false}];
  if(pose==='jump'){jumpTrail(s);for(let i=0;i<30;i++)tickTrail(s,1/120);s.items=[{id:1,lane:1,z:.6,kind,hit:false}];s.lives=3;s.invincible=0;}
  if(pose==='slide')slideTrail(s);
  tickTrail(s,.02);return s;
}
test('dimension-aware collision: rocks hurt; jumps clear logs; slides clear awnings',()=>{
  assert.equal(contact('rock').lives,2);assert.equal(contact('rock','jump').lives,2);
  assert.equal(contact('log').lives,2);assert.equal(contact('log','jump').lives,3);
  assert.equal(contact('canopy').lives,2);assert.equal(contact('canopy','slide').lives,3);
  const s=contact('spark');assert.equal(s.coins,1);tickTrail(s,.02);assert.equal(s.coins,1);
});
test('incompatible actions do not overlap and collisions follow actual eased position',()=>{
  const s=newTrail();jumpTrail(s);slideTrail(s);assert.equal(s.slide,0);
  const r=newTrail();slideTrail(r);jumpTrail(r);assert.equal(r.jump,0);
  const a=newTrail();a.nextSpawn=10000;moveTrail(a,1);a.items=[{id:1,lane:2,z:.6,kind:'rock',hit:false}];
  tickTrail(a,.02);assert.equal(a.lives,3,'future target lane does not immediately become collision position');
});
test('invulnerability prevents repeated damage; three separated hits end a run',()=>{
  const s=newTrail();s.nextSpawn=10000;
  for(let i=0;i<3;i++){s.invincible=0;s.items=[{id:i,lane:1,z:.6,kind:'rock',hit:false}];tickTrail(s,.02);}
  assert.equal(s.status,'crashed');const d=s.distance;tickTrail(s,.1);assert.equal(s.distance,d);
});
test('all spawn waves leave two safe lanes and a checkpoint exit is clear',()=>{
  for(let section=1;section<=50;section++)for(let wave=0;wave<40;wave++){
    const p=trailPattern(wave,section);assert(p.lane>=0&&p.lane<3);assert.notEqual(p.lane,p.sparkLane);
    assert(['rock','log','canopy'].includes(p.kind));
  }
  const s=newTrail();s.distance=276;s.totalDistance=276;s.nextSpawn=275;tickTrail(s,.1);assert.equal(s.items.length,0);
});
function safeRun(fps,section=1) {
  const s=newTrail(section);
  for(let i=0;i<fps*65&&s.status==='running';i++){
    const danger=s.items.filter(x=>x.kind!=='spark'&&!x.hit&&x.z<14).sort((a,b)=>a.z-b.z)[0];
    if(danger){s.lane=(danger.lane+1)%3;}
    tickTrail(s,1/fps);
  }
  return s;
}
test('30/60/120 fps reach the same exact 300m boundary with bounded score',()=>{
  const runs=[30,60,120].map(fps=>safeRun(fps));
  for(const s of runs){assert.equal(s.status,'checkpoint');assert.equal(s.distance,300);assert.equal(s.lives,3);assert(s.elapsed>=30);assert(trailScore(s)<=500);}
  assert(Math.abs(runs[0].elapsed-runs[2].elapsed)<.01);assert.equal(trailScore(runs[0]),trailScore(runs[2]));
});
test('hidden-tab sized delta is bounded; resumed sections carry hearts and metres, recycle items',()=>{
  const s=newTrail();tickTrail(s,300);assert(s.distance<2);
  const done=safeRun(60);done.lives=2;const next=nextTrail(done);assert.equal(next.lives,2);assert.equal(next.totalDistance,300);assert.equal(next.distance,0);assert.equal(next.items.length,0);
  const many=newTrail();many.lives=100;
  for(let i=0;i<60*35;i++)tickTrail(many,1/60);assert(many.items.length<24);
});
test('practice is slower and never needs a queue to reach another section',()=>{
  const s=newTrail(1,true);tickTrail(s,.1);assert(s.speed<8);s.status='checkpoint';s.distance=300;s.totalDistance=300;
  const next=nextTrail(s);assert.equal(next.practice,true);assert.equal(next.status,'running');
});
