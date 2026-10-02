import assert from 'node:assert/strict';
import { test } from 'node:test';
import { newTrail, tickTrail, moveTrail, jumpTrail, trailScore, travelTime } from '../src/features/labs/runner-engine.ts';

test('lanes clamp at both edges and finished trails ignore controls', () => {
  const state = newTrail();
  for (let i = 0; i < 5; i++) moveTrail(state, -1);
  assert.equal(state.lane, 0);
  for (let i = 0; i < 5; i++) moveTrail(state, 1);
  assert.equal(state.lane, 2);
  state.status = 'checkpoint'; moveTrail(state, -1); jumpTrail(state);
  assert.equal(state.lane, 2); assert.equal(state.jump, 0);
});
function obstacle(kind, jump = false) {
  const state = newTrail(); state.nextSpawn = 100;
  state.items = [{ lane: 1, age: travelTime(1) * .86 - .01, kind, hit: false }];
  if (jump) jumpTrail(state);
  tickTrail(state, .02); return state;
}
test('rocks hurt, logs can be jumped, sparks award points, and contact counts once', () => {
  assert.equal(obstacle('rock').lives, 2);
  assert.equal(obstacle('rock', true).lives, 2);
  assert.equal(obstacle('log').lives, 2);
  assert.equal(obstacle('log', true).lives, 3);
  const spark = obstacle('spark'); assert.equal(spark.coins, 1);
  tickTrail(spark, .02); assert.equal(spark.coins, 1); assert.equal(trailScore(spark), 10);
});
test('collision in another lane is safe; losing three lives ends the section', () => {
  const state = newTrail(); state.nextSpawn = 100; state.lane = 0;
  state.items = [{ lane: 1, age: 3.27, kind: 'rock', hit: false }]; tickTrail(state, .02);
  assert.equal(state.lives, 3); state.lane = 1;
  for (let i = 0; i < 3; i++) { state.invincible = 0; state.items = [{ lane: 1, age: 3.27, kind: 'rock', hit: false }]; tickTrail(state, .02); }
  assert.equal(state.status, 'crashed'); const elapsed = state.elapsed; tickTrail(state, .05); assert.equal(state.elapsed, elapsed);
});
test('a safe run reaches exactly 300 metres and spawning always leaves safe lanes', () => {
  for (const section of [1, 8, 50]) {
    const state = newTrail(section);
    for (let i = 0; i < 700 && state.status === 'running'; i++) {
      const danger = state.items.find(item => !item.hit && item.kind !== 'spark' && item.age / travelTime(section) > .8);
      if (danger) state.lane = (danger.lane + 1) % 3;
      tickTrail(state, .05);
    }
    assert.equal(state.status, 'checkpoint'); assert.equal(state.elapsed, 30);
    assert.ok(trailScore(state) >= 300 && trailScore(state) <= 500);
  }
});
