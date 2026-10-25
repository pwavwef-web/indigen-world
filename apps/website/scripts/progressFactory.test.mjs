import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { MILESTONE_LADDER, milestoneLabel, nextMilestone } from '../src/features/progress/progressMilestones.ts';
import { FLOOR_ORDERS, sortFloor } from '../src/features/progress/progressSort.ts';
import { formatShare, plantOutput } from '../src/features/progress/progressPlant.ts';

/** Just the fields the floor helpers read. */
function jar(id, approvedCount, target, extra = {}) {
  const known = approvedCount !== null;
  return {
    category: { id },
    approvedCount,
    isCountKnown: known,
    target,
    isTargetSetting: target === null,
    isTargetReached: known && target !== null && approvedCount >= target,
    ...extra,
  };
}

test('the next goal line is always reachable, and never already passed', () => {
  assert.deepEqual(nextMilestone(1555, 200000), { percent: 1, count: 2000, remaining: 445, fraction: 0.01 });
  assert.equal(nextMilestone(267, 400000).percent, 0.1, 'large targets start at a tenth of a percent');
  assert.equal(nextMilestone(267, 400000).remaining, 133);
  assert.equal(nextMilestone(254, 1000).percent, 50);
  // On a small target the first item reaches several steps: name the highest.
  assert.deepEqual(nextMilestone(0, 100), { percent: 1, count: 1, remaining: 1, fraction: 0.01 });
  assert.equal(nextMilestone(1, 100).percent, 2);
  assert.equal(nextMilestone(0, 1000).percent, 0.1);
  assert.equal(nextMilestone(99, 100).percent, 100);
  for (const [count, target] of [[0, 3], [5, 7], [12, 40], [999, 1000], [1, 400000], [4, 100]]) {
    const next = nextMilestone(count, target);
    assert.ok(next, `${count}/${target} has a next goal`);
    assert.ok(next.count > count && next.count <= target, 'the goal is ahead of the count and within the target');
    assert.equal(next.remaining, next.count - count);
    assert.ok(next.count / target * 100 >= next.percent - 1e-9, 'reaching the count really reaches the named step');
    assert.ok(MILESTONE_LADDER.includes(next.percent));
  }
  for (const [count, target] of [[100, 100], [125, 100], [null, 100], [5, null], [5, 0], [-1, 10], [Number.NaN, 10]]) {
    assert.equal(nextMilestone(count, target), null, `${count}/${target} has no goal`);
  }
  assert.equal(milestoneLabel(0.25), '0.25%');
});

test('ordering the floor moves jars, never numbers, and unreadable jars stay last', () => {
  const items = [
    jar('lexicon', 1555, 200000),
    jar('expressions', 254, 1000),
    jar('sentences', null, 400000),
    jar('literature', 1, 100),
    jar('music', 4, null),
    jar('audiobooks', 0, 100),
    jar('video', 0, 1000),
  ];
  const ids = (list) => list.map((item) => item.category.id);
  assert.deepEqual(ids(sortFloor(items, 'catalogue')), ids(items));
  assert.deepEqual(ids(sortFloor(items, 'fullest')), ['expressions', 'literature', 'lexicon', 'audiobooks', 'video', 'sentences', 'music']);
  assert.deepEqual(ids(sortFloor(items, 'needs')), ['audiobooks', 'video', 'lexicon', 'literature', 'expressions', 'sentences', 'music']);
  assert.deepEqual(ids(sortFloor(items, 'largest')), ['lexicon', 'expressions', 'music', 'literature', 'audiobooks', 'video', 'sentences']);
  for (const order of FLOOR_ORDERS) {
    const sorted = sortFloor(items, order);
    assert.equal(sorted.length, items.length);
    assert.ok(sorted.every((item) => items.includes(item)), 'the same objects, untouched');
  }
  assert.deepEqual(ids(items), ['lexicon', 'expressions', 'sentences', 'literature', 'music', 'audiobooks', 'video'], 'the input is never reordered in place');
});

test('the plant dial is the mean of readable jars, and never adds unlike units into progress', () => {
  const output = plantOutput([
    jar('lexicon', 840, 1000),
    jar('expressions', 265, 250),
    jar('sentences', null, 500),
    jar('music', 30, null),
  ]);
  assert.equal(output.readable, 2, 'unknown counts and unset targets are left out, not read as empty');
  assert.ok(Math.abs(output.averageFill - (0.84 + 1) / 2) < 1e-12, 'an exceeded target counts as full, never more');
  assert.equal(output.verifiedItems, 840 + 265 + 30);
  assert.equal(output.sealed, 1);
  assert.deepEqual(plantOutput([jar('sentences', null, 500)]), { averageFill: null, readable: 0, verifiedItems: 0, sealed: 0 });
  assert.equal(formatShare(null), '—');
  assert.equal(formatShare(0), '0%');
  assert.equal(formatShare(0.00005), '<0.01%');
  assert.equal(formatShare(0.0342), '3.4%');
  assert.equal(formatShare(0.00342), '0.34%');
  assert.equal(formatShare(0.0342 * 10), '34.2%');
  assert.equal(formatShare(0.99999), '99.9%', 'never claims a full plant early');
  assert.equal(formatShare(1), '100%');
});

test('shared page motion never touches the measured progress vessels', () => {
  const script = readFileSync(new URL('../public/scroll-cards.js', import.meta.url), 'utf8');
  const selector = script.slice(script.indexOf('const CARD_SELECTOR'), script.indexOf('].join'));
  assert.doesNotMatch(selector, /floating-vessel/, 'jars are not scroll cards');
  assert.match(script, /closest\('\[data-scroll-cards="off"\]'\)/, 'a page can opt out of scroll cards');
  const page = readFileSync(new URL('../src/pages/ProgressPage.tsx', import.meta.url), 'utf8');
  assert.match(page, /data-scroll-cards="off"/, 'the progress page opts out');
});
