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

function hueOf(hex) {
  const [r, g, b] = [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return { hue: 0, saturation: 0 };
  const delta = max - min;
  const hue = max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
  return { hue: (hue * 60 + 360) % 360, saturation: delta / (1 - Math.abs(max + min - 1)) };
}

test('liquid is one coherent blue at every level, with no colour jumps', () => {
  for (const [fill, stage] of [[0, 'empty'], [0.01, 'filling'], [50, 'filling'], [99.99, 'filling'], [100, 'full']]) {
    assert.equal(liquidAppearance(fill).stage, stage, `stage at ${fill}%`);
  }
  let previous = liquidAppearance(0).colour;
  for (let fill = 0; fill <= 100; fill += 0.5) {
    const { colour, deep, light } = liquidAppearance(fill);
    for (const shade of [colour, deep, light]) {
      assert.match(shade, /^#[\da-f]{6}$/i);
      const { hue, saturation } = hueOf(shade);
      assert.ok(hue >= 195 && hue <= 215, `${shade} at ${fill}% stays blue (hue ${hue.toFixed(0)})`);
      assert.ok(saturation > 0.6, `${shade} at ${fill}% is a clear colour, not grey`);
    }
    for (const offset of [1, 3, 5]) {
      assert.ok(Math.abs(parseInt(previous.slice(offset, offset + 2), 16) - parseInt(colour.slice(offset, offset + 2), 16)) <= 2, `no colour jump at ${fill}%`);
    }
    previous = colour;
  }
  assert.ok(hueOf(liquidAppearance(80, true).colour).saturation < 0.3, 'an unset target stays neutral grey');
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
