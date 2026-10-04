import assert from 'node:assert/strict';
import test from 'node:test';
import { liquidAppearance } from '../src/features/progress/liquidAppearance.ts';

test('empty, invalid and unconfigured targets cannot show liquid or bubbles', () => {
  for (const fill of [0, -1, -100, NaN, Infinity, -Infinity]) {
    const appearance = liquidAppearance(fill);
    assert.equal(appearance.fillPercent, 0, `safe fill for ${fill}`);
    assert.equal(appearance.bubbleCount, 0, `no phantom bubbles for ${fill}`);
  }
  const unknown = liquidAppearance(80, true);
  assert.equal(unknown.fillPercent, 0, 'unknown target never suggests 80% progress');
  assert.equal(unknown.stage, 'unknown');
  assert.equal(unknown.bubbleCount, 0);
});

test('colour milestones progress through red, yellow, blue and green', () => {
  for (const [fill, stage] of [[0, 'red'], [24.99, 'red'], [25, 'yellow'], [49.99, 'yellow'], [50, 'blue'], [74.99, 'blue'], [75, 'green'], [100, 'green']]) {
    assert.equal(liquidAppearance(fill).stage, stage, `stage at ${fill}%`);
  }
  const milestoneColours = [0, 25, 50, 75].map((fill) => liquidAppearance(fill).colour);
  assert.equal(new Set(milestoneColours).size, 4, 'four milestones visibly differ');
  assert.notEqual(liquidAppearance(10).colour, liquidAppearance(20).colour, 'colour transitions within a milestone range');
  for (const boundary of [25, 50, 75]) {
    const before = liquidAppearance(boundary - 0.01).colour;
    const after = liquidAppearance(boundary).colour;
    assert.match(before, /^#[\da-f]{6}$/i);
    assert.match(after, /^#[\da-f]{6}$/i);
    for (const offset of [1, 3, 5]) {
      assert.ok(Math.abs(parseInt(before.slice(offset, offset + 2), 16) - parseInt(after.slice(offset, offset + 2), 16)) <= 1, `no colour jump at ${boundary}%`);
    }
  }
});

test('more liquid produces a bounded, growing bubble volume', () => {
  let previous = liquidAppearance(0);
  for (let fill = 0.5; fill <= 100; fill += 0.5) {
    const current = liquidAppearance(fill);
    assert.equal(current.fillPercent, fill, 'small genuine fills stay visible');
    assert.ok(Number.isInteger(current.bubbleCount));
    assert.ok(current.bubbleCount > 0 && current.bubbleCount <= 14, 'bubble population stays within the rendering budget');
    assert.ok(current.bubbleCount >= previous.bubbleCount, 'bubble count never shrinks as fill rises');
    assert.ok(current.bubbleScale >= previous.bubbleScale, 'bubble size never shrinks as fill rises');
    assert.ok(current.bubbleDuration > 0 && Number.isFinite(current.bubbleDuration), 'animation duration remains usable');
    previous = current;
  }
  assert.ok(liquidAppearance(100).bubbleCount > liquidAppearance(1).bubbleCount, 'full vessels have more bubbles than a small contribution');
  assert.ok(liquidAppearance(100).bubbleScale > liquidAppearance(1).bubbleScale, 'full vessels have larger bubbles');
});

test('exceeded targets do not overflow the vessel or animation budget', () => {
  assert.deepEqual(liquidAppearance(125), liquidAppearance(100));
  assert.deepEqual(liquidAppearance(Number.MAX_VALUE), liquidAppearance(100));
});
