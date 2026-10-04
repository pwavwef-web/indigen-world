// The video editor's pure model — and the promise that its preview matches the
// renderer. `node --test apps/tribestudio/scripts/video-editor.test.mjs`
//
// The editor previews looks and layer motion with its own copies of the
// renderer's tables (src/creator/editor/looks.ts). These tests load both — the
// editor's TypeScript through Vite's transformer, the renderer's compiled
// module from services/functions/lib — and fail if they ever disagree, because
// a look that previews one way and exports another is the one thing an editor
// must not do. Run `npm run build:functions` first so the compiled renderer
// exists; without it the drift tests are skipped rather than passing silently.

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { transformWithOxc } from 'vite';

const root = resolve(import.meta.dirname, '..');
const functionsLib = resolve(root, '..', '..', 'services', 'functions', 'lib', 'video-editor');

async function load(path, names, globals = {}) {
  const { code } = await transformWithOxc(readFileSync(resolve(root, path), 'utf8'), path, {});
  const executable = code.replace(/^import[\s\S]*?;\n/gm, '').replace(/\bexport (?=(?:async )?function|const|let|class)/g, '');
  return runInNewContext(`${executable}\n;({${names.join(',')}})`, { crypto: globalThis.crypto, Math, JSON, ...globals });
}

const model = await load('src/creator/editor/model.ts', [
  'newProject', 'newScene', 'titleCard', 'sceneTimes', 'sceneAt', 'effectiveTransition', 'splitSceneAt', 'moveScene',
  'duplicateScene', 'removeScene', 'addScenes', 'setCues', 'patchCue', 'shiftCues', 'cuesFromScenePlan', 'fadeGain',
  'duckGain', 'speechWindows', 'exportProblems', 'normaliseProject', 'restack', 'newSticker', 'newText', 'topZ', 'upsertSticker',
]);
const looks = await load('src/creator/editor/looks.ts', ['LOOK_OPS', 'lookCss', 'layerState', 'ENTER_SEC', 'EXIT_SEC', 'SHIFT']);

function project(...durations) {
  let p = model.newProject('Test', '9:16', 'blank');
  p = model.addScenes(durations.map((d, i) => model.newScene({ kind: 'color', color: '#000000' }, d, { title: `S${i + 1}` })))(p);
  return p;
}

// ── The magnetic scene track ───────────────────────────────────────────────

test('scenes play back to back; the total is their sum', () => {
  const p = project(3, 2.5, 4);
  assert.deepEqual(JSON.parse(JSON.stringify(model.sceneTimes(p.timeline.scenes))), { starts: [0, 3, 5.5], total: 9.5 });
  assert.equal(model.sceneAt(p.timeline.scenes, 5.6).index, 2);
  assert.equal(model.sceneAt(p.timeline.scenes, 0).index, 0);
});

test('splitting at the playhead keeps playback identical: the second half continues the source', () => {
  let p = project(4);
  p = { ...p, timeline: { ...p.timeline, scenes: [{ ...p.timeline.scenes[0], media: { kind: 'video', mediaId: 'm1' }, sourceIn: 2, speed: 1.5 }] } };
  const split = model.splitSceneAt(1.5)(p);
  const [a, b] = split.timeline.scenes;
  assert.equal(a.duration, 1.5);
  assert.equal(b.duration, 2.5);
  assert.equal(b.sourceIn, 2 + 1.5 * 1.5);
  assert.equal(model.sceneTimes(split.timeline.scenes).total, 4);
  // Too close to either edge: nothing happens.
  assert.equal(model.splitSceneAt(0.2)(p), p);
});

test('reordering, duplicating and removing close up the track', () => {
  const p = project(1, 2, 3);
  const [a, b, c] = p.timeline.scenes;
  const moved = model.moveScene(c.id, 0)(p);
  assert.deepEqual([...moved.timeline.scenes.map((s) => s.id)], [c.id, a.id, b.id]);
  const dup = model.duplicateScene(b.id)(p);
  assert.equal(dup.timeline.scenes.length, 4);
  assert.notEqual(dup.timeline.scenes[2].id, b.id);
  assert.equal(model.sceneTimes(dup.timeline.scenes).total, 8);
  assert.equal(model.sceneTimes(model.removeScene(a.id)(p).timeline.scenes).total, 5);
});

test('the preview clamps transitions exactly as the renderer does', () => {
  const p = project(0.8, 4, 4);
  const scenes = p.timeline.scenes.map((s, i) => ({ ...s, transitionIn: { type: 'fade', duration: 1.5 } }));
  assert.deepEqual(JSON.parse(JSON.stringify(model.effectiveTransition(scenes, 0))), { type: 'cut', duration: 0 });
  assert.equal(model.effectiveTransition(scenes, 1).duration, 0.72);
  assert.equal(model.effectiveTransition(scenes, 2).duration, 1.5);
});

// ── Layers ─────────────────────────────────────────────────────────────────

test('new layers land on top, and restacking swaps neighbours', () => {
  let p = project(5);
  const s1 = model.newSticker('st-a', 0, 3, model.topZ(p));
  p = model.upsertSticker(s1)(p);
  const s2 = model.newSticker('st-b', 0, 3, model.topZ(p));
  p = model.upsertSticker(s2)(p);
  assert.ok(s2.z > s1.z);
  p = model.restack(s2.id, -1)(p);
  const z = Object.fromEntries(p.timeline.stickers.map((s) => [s.id, s.z]));
  assert.ok(z[s2.id] < z[s1.id]);
});

// ── Captions ───────────────────────────────────────────────────────────────

test('captions: timed cues are sorted; editing words drops stale word timings; shifting moves words too', () => {
  let p = project(10);
  p = model.setCues([{ start: 4, end: 6, text: 'second', words: null }, { start: 1, end: 3, text: 'first one', words: [{ text: 'first', start: 1, end: 2 }, { text: 'one', start: 2, end: 3 }] }], 'speech-timing')(p);
  const [c1, c2] = p.timeline.captions.cues;
  assert.equal(c1.text, 'first one');
  assert.equal(c2.text, 'second');
  const shifted = model.shiftCues(0.5)(p);
  assert.equal(shifted.timeline.captions.cues[0].words[1].start, 2.5);
  const edited = model.patchCue(c1.id, { text: 'first two' })(p);
  assert.equal(edited.timeline.captions.cues[0].words, null);
  assert.equal(edited.timeline.captions.method, 'manual');
});

test('captions from the scene plan follow the scenes they belong to', () => {
  let p = project(3, 4);
  p = { ...p, timeline: { ...p.timeline, scenes: p.timeline.scenes.map((s, i) => ({ ...s, plan: { ...s.plan, narration: i === 0 ? 'Hello there' : '' } })) } };
  const cues = model.cuesFromScenePlan(p);
  assert.equal(cues.length, 1);
  assert.ok(cues[0].start >= 0 && cues[0].end <= 3);
});

// ── Sound ──────────────────────────────────────────────────────────────────

test('music fades and ducks with the renderer\'s curve', () => {
  const clip = { start: 2, duration: 10, fadeIn: 2, fadeOut: 4 };
  assert.equal(model.fadeGain(clip, 1), 0);
  assert.equal(model.fadeGain(clip, 3), 0.5);
  assert.equal(model.fadeGain(clip, 6), 1);
  assert.equal(model.fadeGain(clip, 10), 0.5);
  const windows = [[4, 6]];
  assert.equal(model.duckGain(windows, 0.3, 1), 1);
  assert.ok(Math.abs(model.duckGain(windows, 0.3, 5) - 0.3) < 1e-9);
  assert.ok(Math.abs(model.duckGain(windows, 0.3, 3.85) - (1 - 0.7 * 0.5)) < 1e-9);
});

// ── Before export ──────────────────────────────────────────────────────────

test('export checks block what cannot render and warn about what looks wrong', () => {
  const empty = model.newProject('x', '9:16', 'blank');
  assert.ok(model.exportProblems(empty, new Map()).some((p) => p.level === 'block'));
  let p = project(3);
  p = model.addScenes([model.newScene(null, 3)])(p);
  p = model.addScenes([model.newScene({ kind: 'video', mediaId: 'gone' }, 3)])(p);
  const problems = model.exportProblems(p, new Map());
  assert.equal(problems.filter((x) => x.level === 'block').length, 2);
  const long = project(120, 120, 70);
  assert.ok(model.exportProblems(long, new Map()).some((x) => /5 minutes/.test(x.message)));
});

test('a stored project always opens, whatever it is missing', () => {
  const p = model.normaliseProject({ title: '', aspect: 'weird', timeline: { scenes: [{ id: 's1', duration: 2 }], captions: { style: 'bold' } } });
  assert.equal(p.title, 'Untitled video');
  assert.equal(p.aspect, '9:16');
  assert.equal(p.timeline.scenes[0].plan.visual, '');
  assert.equal(p.timeline.captions.style, 'bold');
  assert.deepEqual(JSON.parse(JSON.stringify(p.timeline.captions.cues)), []);
});

// ── Preview and export agree ───────────────────────────────────────────────

const rendererBuilt = existsSync(resolve(functionsLib, 'looks.js'));

test('the preview\'s looks are the renderer\'s looks', { skip: !rendererBuilt && 'run npm run build:functions first' }, async () => {
  const server = await import(pathToFileURL(resolve(functionsLib, 'looks.js')).href);
  assert.deepEqual(JSON.parse(JSON.stringify(looks.LOOK_OPS)), JSON.parse(JSON.stringify(server.LOOK_OPS)));
  for (const look of Object.keys(server.LOOK_OPS)) assert.equal(looks.lookCss(look), server.lookCss(look));
});

test('the preview\'s entrances and exits are the renderer\'s', { skip: !rendererBuilt && 'run npm run build:functions first' }, async () => {
  const server = await import(pathToFileURL(resolve(functionsLib, 'animation.js')).href);
  assert.equal(looks.ENTER_SEC, server.ENTER_SEC);
  assert.equal(looks.EXIT_SEC, server.EXIT_SEC);
  assert.equal(looks.SHIFT, server.SHIFT);
  for (const enter of ['none', 'fade', 'pop', 'rise']) {
    for (const exit of ['none', 'fade', 'pop', 'sink']) {
      for (let t = 0.9; t <= 5.1; t += 0.05) {
        const a = looks.layerState(t, 1, 5, enter, exit);
        const b = server.layerState(t, 1, 5, enter, exit);
        for (const key of ['alpha', 'scale', 'shift']) assert.ok(Math.abs(a[key] - b[key]) < 1e-12, `${enter}/${exit} ${key} at ${t}`);
      }
    }
  }
});


test('failed-save recovery is account and project scoped, preserves edits, and rejects malformed copies', async () => {
  const storage = new Map();
  const window = { localStorage:{ getItem:key=>storage.get(key) || null, setItem:(key,value)=>storage.set(key,value), removeItem:key=>storage.delete(key) } };
  const { readEditorRecovery, writeEditorRecovery, clearEditorRecovery } = await load('src/creator/editor/recovery.ts',['readEditorRecovery','writeEditorRecovery','clearEditorRecovery'],{ window,normaliseProject:model.normaliseProject,Date });
  const project = model.newProject('Local recovered film','16:9','blank');
  assert.equal(writeEditorRecovery('alice','film',project,3),true);
  const recovered = readEditorRecovery('alice','film');
  assert.equal(recovered.project.title,project.title); assert.equal(recovered.revision,3);
  assert.equal(readEditorRecovery('bob','film'),null); assert.equal(readEditorRecovery('alice','other-film'),null);
  storage.set('tribestudio:video-recovery:alice:film','{"uid":"alice","id":"film","revision":3,"project":{"title":"bad"}}');
  assert.equal(readEditorRecovery('alice','film'),null);
  writeEditorRecovery('alice','film',project,3); clearEditorRecovery('alice','film'); assert.equal(readEditorRecovery('alice','film'),null);
});
