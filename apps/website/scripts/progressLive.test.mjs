import assert from 'node:assert/strict';
import test from 'node:test';
import { exactPercent, fillFraction, formatCount, formatPercent, percentParts } from '../src/features/progress/progressFormat.ts';
import {
  PUBLIC_EVENT_RING,
  approvalLabel,
  enqueueApprovals,
  ingestPublicProgress,
  parsePublicProgress,
} from '../src/features/progress/liveProgressModel.ts';
import { groupRows, jarNetwork, roundedPath, tankNetwork, travelDuration } from '../src/features/progress/pipeGeometry.ts';

test('percentages tell a little progress from none and never claim a target early', () => {
  assert.equal(formatPercent(357, 200_000), '0.18%', '357 of 200,000 is 0.1785%');
  assert.equal(formatPercent(2, 5_000), '0.04%', '2 of 5,000 is 0.04%, not 0%');
  assert.equal(formatPercent(93, 400_000), '0.02%');
  assert.equal(formatPercent(3, 400_000), '<0.01%', 'positive progress below the display precision');
  assert.equal(percentParts(3, 400_000).qualifier, '<');
  assert.equal(formatPercent(0, 100), '0%', 'only a truly empty collection reads 0%');
  assert.equal(formatPercent(105, 1_000), '10.5%');
  assert.equal(formatPercent(1, 100), '1%');
  assert.equal(formatPercent(9_996, 10_000), '99.9%', '99.96% is not yet 100%');
  assert.equal(formatPercent(100, 100), '100%');
  assert.equal(formatPercent(1_253, 1_000), '125%', 'beyond target stays true');
  assert.equal(formatPercent(1_004, 1_000), '100%', 'rounded down, never up');
  for (const target of [null, undefined, 0, -5, NaN, Infinity]) {
    assert.equal(formatPercent(10, target), null, `no percentage against target ${target}`);
  }
  assert.equal(formatPercent(null, 100), null, 'an unknown count has no percentage');
  assert.equal(exactPercent(357, 200_000), 0.1785);
  assert.equal(fillFraction(357, 200_000), 0.001785, 'fill uses the exact ratio, not the rounded label');
  assert.equal(fillFraction(1_253, 1_000), 1, 'fill is capped at a full vessel');
  assert.equal(fillFraction(5, null), 0, 'a missing target fills nothing');
  assert.equal(fillFraction(null, 100), 0, 'an unknown count fills nothing');
  assert.equal(formatCount(null), '—', 'an unknown count is never shown as 0');
  assert.equal(formatCount(200_000), '200,000');
});

const ts = (ms) => ({ toMillis: () => ms });
const NOW = 1_800_000_000_000;
const doc = (revision, totals, events = []) => parsePublicProgress({
  revision,
  updatedAt: ts(NOW),
  categories: Object.fromEntries(Object.entries(totals).map(([key, total]) => [key, { total, countedAt: ts(NOW) }])),
  events: events.map(([eventRevision, category, delta, total, at = NOW - 2_000]) => ({ revision: eventRevision, category, delta, total, at: ts(at) })),
});
const live = { animate: true, nowMs: NOW };

test('the public document is parsed defensively', () => {
  const parsed = parsePublicProgress({
    revision: 3,
    categories: { lexicon: { total: 357 }, bogus: { total: 4 }, grammar: { total: -1 }, music: { total: 1.5 } },
    events: [
      { revision: 3, category: 'lexicon', delta: 1, total: 357, at: ts(NOW), contributor: 'Never shown' },
      { revision: 2, category: 'lexicon', delta: 0, total: 356, at: ts(NOW) },
      { revision: 2, category: 'secret', delta: 1, total: 1, at: ts(NOW) },
    ],
  });
  assert.deepEqual(parsed.totals, { lexicon: 357 });
  assert.equal(parsed.events.length, 1);
  assert.equal('contributor' in parsed.events[0], false);
  assert.equal(parsePublicProgress(null), null);
  assert.equal(parsePublicProgress({ revision: 'x' }), null);
});

test('the first snapshot is history: totals shown, nothing replayed', () => {
  const first = ingestPublicProgress(null, doc(9, { lexicon: 357 }, [[9, 'lexicon', 1, 357, NOW - 500]]), live);
  assert.equal(first.silent, true);
  assert.deepEqual(first.approvals, []);
  assert.equal(first.state.revision, 9, 'the cursor starts at what was read');
  assert.equal(first.state.totals.lexicon, 357);
});

test('a fresh approval plays once; redelivery and view switches cannot replay it', () => {
  const start = ingestPublicProgress(null, doc(9, { lexicon: 357, expressions: 105 }), live).state;
  const next = doc(10, { lexicon: 357, expressions: 106 }, [[10, 'expressions', 1, 106]]);
  const fresh = ingestPublicProgress(start, next, live);
  assert.deepEqual(fresh.approvals.map((a) => [a.category, a.delta, a.fromTotal, a.totalAfter]), [['expressions', 1, 105, 106]]);
  assert.equal(fresh.state.totals.lexicon, 357, 'other totals unchanged');
  const again = ingestPublicProgress(fresh.state, next, live);
  assert.deepEqual(again.approvals, [], 'the same document delivered twice plays nothing');
  assert.equal(approvalLabel(fresh.approvals[0].delta), '+1 approved');
});

test('busy traffic is batched truthfully by collection', () => {
  const start = ingestPublicProgress(null, doc(1, { lexicon: 10, grammar: 2 }), live).state;
  const busy = ingestPublicProgress(start, doc(4, { lexicon: 13, grammar: 3 }, [
    [2, 'lexicon', 1, 11], [3, 'grammar', 1, 3], [4, 'lexicon', 2, 13],
  ]), live);
  assert.deepEqual(busy.approvals.map((a) => [a.category, a.delta, a.fromTotal, a.totalAfter]), [
    ['lexicon', 3, 10, 13],
    ['grammar', 1, 2, 3],
  ]);
});

test('corrections, catch-up, stale events and dropped history never animate', () => {
  const start = ingestPublicProgress(null, doc(5, { lexicon: 358 }), live).state;
  const retracted = ingestPublicProgress(start, doc(6, { lexicon: 357 }, [[6, 'lexicon', -1, 357]]), live);
  assert.deepEqual(retracted.approvals, []);
  assert.deepEqual(retracted.corrections, ['lexicon']);
  assert.equal(retracted.state.totals.lexicon, 357);

  const resumed = ingestPublicProgress(start, doc(7, { lexicon: 360 }, [[7, 'lexicon', 2, 360]]), { ...live, animate: false });
  assert.deepEqual(resumed.approvals, [], 'a resumed tab or reconnect catches up silently');
  assert.equal(resumed.state.totals.lexicon, 360);
  assert.equal(resumed.state.revision, 7);

  const old = ingestPublicProgress(start, doc(7, { lexicon: 359 }, [[7, 'lexicon', 1, 359, NOW - 10 * 60_000]]), live);
  assert.deepEqual(old.approvals, [], 'an old change is not presented as happening now');

  const full = Array.from({ length: PUBLIC_EVENT_RING }, (_, index) => [100 + index, 'lexicon', 1, 400 + index]);
  const dropped = ingestPublicProgress(start, doc(123, { lexicon: 423 }, full), live);
  assert.deepEqual(dropped.approvals, [], 'a backlog larger than the ring is caught up, not replayed');
  assert.equal(dropped.state.totals.lexicon, 423);

  const reconciled = ingestPublicProgress(start, doc(6, { lexicon: 400 }), live);
  assert.deepEqual(reconciled.approvals, [], 'a reconcile changes numbers without events');
  assert.equal(reconciled.state.totals.lexicon, 400);

  const reset = ingestPublicProgress(start, doc(2, { lexicon: 1 }, [[2, 'lexicon', 1, 1]]), live);
  assert.deepEqual(reset.approvals, [], 'a document that went backwards is absorbed silently');
});

test('reaching a target celebrates once per session', () => {
  const targets = { music: 100 };
  const start = ingestPublicProgress(null, doc(1, { music: 99 }), live).state;
  const reached = ingestPublicProgress(start, doc(2, { music: 100 }, [[2, 'music', 1, 100]]), { ...live, targets });
  assert.equal(reached.approvals[0].milestone, true);
  const dipped = ingestPublicProgress(reached.state, doc(3, { music: 99 }, [[3, 'music', -1, 99]]), { ...live, targets });
  const again = ingestPublicProgress(dipped.state, doc(4, { music: 100 }, [[4, 'music', 1, 100]]), { ...live, targets });
  assert.equal(again.approvals[0].milestone, false, 'deduplicated');
  const beyond = ingestPublicProgress(again.state, doc(5, { music: 101 }, [[5, 'music', 1, 101]]), { ...live, targets });
  assert.equal(beyond.approvals[0].milestone, false, 'over target is not a second milestone');
});

test('the effect queue merges by collection and stays bounded', () => {
  const approval = (category, delta, key = `${category}${delta}`) => ({ key, category, delta, fromTotal: 0, totalAfter: delta, revision: 1, milestone: false });
  let { queue, overflow } = enqueueApprovals([], [approval('lexicon', 1), approval('grammar', 1)], 3);
  ({ queue, overflow } = enqueueApprovals(queue, [approval('lexicon', 2), approval('music', 1), approval('video', 1)], 3));
  assert.deepEqual(queue.map((flow) => [flow.category, flow.delta]), [['lexicon', 3], ['grammar', 1], ['music', 1]]);
  assert.deepEqual(overflow.map((item) => item.category), ['video'], 'beyond the bound: number only, no effect');
});

test('jar pipes meet every inlet from a lane above its row, joined by one trunk', () => {
  const inlets = [
    { id: 'a', x: 120, y: 300 }, { id: 'b', x: 360, y: 302 }, { id: 'c', x: 600, y: 300 },
    { id: 'd', x: 120, y: 800 }, { id: 'e', x: 360, y: 800 },
  ];
  const outlet = { x: 360, y: 200 };
  const network = jarNetwork({ outlet, inlets, trunkX: 18, laneRise: 30 });
  assert.equal(groupRows(inlets).length, 2);
  for (const inlet of inlets) {
    const { points, d } = network.routes[inlet.id];
    assert.deepEqual(points[0], outlet, `${inlet.id} starts at the pump outlet`);
    assert.deepEqual(points.at(-1), { x: inlet.x, y: inlet.y }, `${inlet.id} ends exactly on its inlet`);
    assert.ok(d.startsWith('M360 200') && d.endsWith(`L${inlet.x} ${inlet.y}`));
    for (let index = 1; index < points.length; index += 1) {
      const [p, q] = [points[index - 1], points[index]];
      assert.ok(p.x === q.x || p.y === q.y, 'pipes run straight, with real corners');
    }
    const finalLeg = points.at(-2);
    assert.equal(finalLeg.x, inlet.x, 'the last leg drops straight into the jar mouth');
    if (points.length > 2) assert.ok(finalLeg.y < inlet.y && inlet.y - finalLeg.y <= 32, 'from the lane reserved just above the row');
  }
  const trunk = network.segments.find((s) => s.from.x === 18 && s.to.x === 18);
  assert.ok(trunk, 'rows are joined by a trunk in the gutter');
  assert.deepEqual([trunk.from.y, trunk.to.y], [270, 770]);
  assert.equal(network.routes.b.points.length, 2, 'the jar under the pump is fed straight down');
  assert.ok(network.fittings.filter((f) => f.kind === 'inlet').length === inlets.length, 'a collar at every inlet');
});

test('tank pipes run down one trunk and into the left end of each tank', () => {
  const inlets = [{ id: 'a', x: 70, y: 200 }, { id: 'b', x: 70, y: 320 }, { id: 'c', x: 70, y: 440 }];
  const network = tankNetwork({ outlet: { x: 26, y: 120 }, inlets, trunkX: 26 });
  for (const inlet of inlets) {
    const { points } = network.routes[inlet.id];
    assert.deepEqual(points, [{ x: 26, y: 120 }, { x: 26, y: inlet.y }, { x: 70, y: inlet.y }]);
  }
  const offset = tankNetwork({ outlet: { x: 60, y: 100 }, inlets, trunkX: 26 });
  assert.deepEqual(offset.routes.a.points.slice(0, 3), [{ x: 60, y: 100 }, { x: 60, y: 116 }, { x: 26, y: 116 }], 'an offset outlet joins the trunk with a short header');
});

test('rounded paths keep their endpoints and travel time stays between one and two seconds', () => {
  const d = roundedPath([{ x: 0, y: 0 }, { x: 0, y: 50 }, { x: 80, y: 50 }], 12);
  assert.equal(d, 'M0 0 L0 38 Q0 50 12 50 L80 50');
  assert.equal(travelDuration(100), 1000);
  assert.equal(travelDuration(960), 1500);
  assert.equal(travelDuration(5_000), 2000);
});
