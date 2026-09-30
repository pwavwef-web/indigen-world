// The video editor's renderer and its helpers — no emulator, no network.
//
//   npm run build:functions && node --test firebase/tests/videoEditor.test.mjs
//
// The last tests render real files with FFmpeg (FFMPEG_BIN, or the
// ffmpeg-static binary the functions depend on) and inspect them: frame size,
// length, that the sound is there, and that a sticker and a caption are drawn
// where and when the spec says. Those are the promises the editor makes about
// its preview, so they are checked on pixels rather than on the command line.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import {
  RenderSpecError,
  frameSize,
  layerPrefix,
  parseRenderSpec,
  referencedIds,
  referencedLayerPaths,
  sceneTimes,
} from '../../services/functions/lib/video-editor/render-spec.js';
import { LOOK_OPS, lookCss, lookFilter } from '../../services/functions/lib/video-editor/looks.js';
import { alphaFilters, layerState, scaleExpr, shiftExpr } from '../../services/functions/lib/video-editor/animation.js';
import { buildRenderPlan, duckExpression, mergeWindows } from '../../services/functions/lib/video-editor/render-plan.js';
import { alignToSpeech, captionLines, snapToSpeech, speechSegments, wordWeight } from '../../services/functions/lib/video-editor/captions.js';
import { narrationMatchesScript, readPlan, splitScript } from '../../services/functions/lib/video-editor/scene-planner.js';
import { allowedMediaPath, classifyFailure } from '../../services/functions/lib/video-editor/render-worker.js';
import { blankFrameArgs, parseProbe, probeMedia, runFfmpeg } from '../../services/functions/lib/video-editor/ffmpeg.js';

const ctx = { uid: 'uid1', projectId: 'proj1', requestId: 'req-0001' };
const prefix = layerPrefix(ctx.uid, ctx.projectId, ctx.requestId);

function baseSpec(extra = {}) {
  return {
    version: 1,
    aspect: '9:16',
    background: '#000000',
    scenes: [
      { id: 's1', source: { kind: 'video', mediaId: 'clip1' }, duration: 3 },
      { id: 's2', source: { kind: 'color', color: '#1fa2a6' }, duration: 2, transitionIn: { type: 'fade', duration: 0.6 } },
    ],
    layers: [],
    captionTrack: [],
    audio: { voice: [], music: [] },
    ...extra,
  };
}

// ── The spec ───────────────────────────────────────────────────────────────

test('the total length is the sum of the scenes, never a number the client sends', () => {
  const spec = parseRenderSpec({ ...baseSpec(), durationSec: 999 }, ctx);
  assert.equal(sceneTimes(spec.scenes).total, 5);
  assert.deepEqual(sceneTimes(spec.scenes).starts, [0, 3]);
});

test('a transition can never be longer than 90% of the shorter scene it joins, and the first scene has none', () => {
  const spec = parseRenderSpec(baseSpec({
    scenes: [
      { id: 'a', source: { kind: 'color', color: '#ffffff' }, duration: 0.8, transitionIn: { type: 'fade', duration: 1 } },
      { id: 'b', source: { kind: 'color', color: '#000000' }, duration: 4, transitionIn: { type: 'slide', duration: 1.5 } },
    ],
  }), ctx);
  assert.deepEqual(spec.scenes[0].transitionIn, { type: 'cut', duration: 0 });
  assert.equal(spec.scenes[1].transitionIn.type, 'slide');
  assert.ok(spec.scenes[1].transitionIn.duration <= 0.72 + 1e-9);
});

test('editor PNGs must sit in this render\'s own folder, so a spec cannot read another member\'s files', () => {
  assert.throws(() => parseRenderSpec(baseSpec({
    layers: [{ type: 'image', id: 't', layerPath: 'video-projects/someoneElse/p/layers/r/x.png', x: 0, y: 0, width: 10, height: 10, start: 0, end: 1 }],
  }), ctx), RenderSpecError);
  assert.throws(() => parseRenderSpec(baseSpec({
    captionTrack: [{ layerPath: `${prefix}../../escape.png`, start: 0, end: 1 }],
  }), ctx), RenderSpecError);
  const ok = parseRenderSpec(baseSpec({ captionTrack: [{ layerPath: `${prefix}c1.png`, start: 0.5, end: 1.5 }] }), ctx);
  assert.equal(ok.captionTrack.length, 1);
});

test('overlapping caption frames are trimmed so only one caption shows at a time', () => {
  const spec = parseRenderSpec(baseSpec({
    captionTrack: [
      { layerPath: `${prefix}b.png`, start: 1, end: 3 },
      { layerPath: `${prefix}a.png`, start: 0, end: 2 },
    ],
  }), ctx);
  assert.deepEqual(spec.captionTrack.map((f) => [f.start, f.end]), [[0, 1], [1, 3]]);
});

test('videos longer than five minutes are refused with the length in the message', () => {
  const scenes = Array.from({ length: 4 }, (_, i) => ({ id: `s${i}`, source: { kind: 'color', color: '#000000' }, duration: 100 }));
  assert.throws(() => parseRenderSpec(baseSpec({ scenes }), ctx), /400 seconds/);
});

test('an empty timeline, an unknown source and a bad version are refused', () => {
  assert.throws(() => parseRenderSpec(baseSpec({ scenes: [] }), ctx), /at least one scene/);
  assert.throws(() => parseRenderSpec(baseSpec({ scenes: [{ id: 'x', source: { kind: 'url', url: 'http://x' }, duration: 2 }] }), ctx), RenderSpecError);
  assert.throws(() => parseRenderSpec({ ...baseSpec(), version: 2 }, ctx), /version/);
});

test('audio clips are clipped to the video and levels are clamped', () => {
  const spec = parseRenderSpec(baseSpec({
    audio: {
      musicLevel: 9,
      voice: [{ id: 'v', mediaId: 'rec1', start: 4, duration: 10 }],
      music: [{ id: 'm', trackId: 'track-a', start: 0, duration: 60, fadeIn: 1, fadeOut: 2 }],
    },
  }), ctx);
  assert.equal(spec.audio.musicLevel, 2);
  assert.equal(spec.audio.voice[0].duration, 1);
  assert.equal(spec.audio.music[0].duration, 5);
  assert.deepEqual(referencedIds(spec), { mediaIds: ['clip1', 'rec1'], trackIds: ['track-a'], stickerIds: [] });
});

test('frame sizes are even and follow the chosen aspect and resolution; drafts are 540 on the short side', () => {
  assert.deepEqual(frameSize({ aspect: '9:16', resolution: '1080p', quality: 'high' }), { width: 1080, height: 1920 });
  assert.deepEqual(frameSize({ aspect: '16:9', resolution: '720p', quality: 'standard' }), { width: 1280, height: 720 });
  assert.deepEqual(frameSize({ aspect: '1:1', resolution: '1080p', quality: 'standard' }), { width: 1080, height: 1080 });
  assert.deepEqual(frameSize({ aspect: '9:16', resolution: '1080p', quality: 'draft' }), { width: 540, height: 960 });
});

// ── Looks and motion: one definition for preview and export ───────────────

test('every look has a CSS preview and an FFmpeg filter built from the same operations', () => {
  for (const look of Object.keys(LOOK_OPS)) {
    const css = lookCss(look);
    const filter = lookFilter(look);
    if (look === 'none') {
      assert.equal(css, 'none');
      assert.equal(filter, '');
      continue;
    }
    for (const op of LOOK_OPS[look]) assert.ok(css.includes(op.op), `${look} preview lacks ${op.op}`);
    assert.match(filter, /^colorchannelmixer=/);
  }
  // Grayscale collapses every channel to the same luminance weights.
  assert.match(lookFilter('mono'), /rr=0\.2126:rg=0\.7152:rb=0\.0722:gr=0\.2126/);
});

test('entrances and exits: the numbers the preview uses match the expressions the renderer writes', () => {
  const s = layerState(1.0 + 0.35 * 0.6, 1, 5, 'pop', 'none');
  assert.ok(Math.abs(s.scale - 1.12) < 1e-9);
  assert.equal(layerState(0.5, 1, 5, 'fade', 'fade').alpha, 0);
  assert.equal(layerState(3, 1, 5, 'fade', 'fade').alpha, 1);
  assert.ok(layerState(4.85, 1, 5, 'none', 'sink').shift > 0);
  assert.equal(scaleExpr(1, 5, 'fade', 'fade'), null);
  assert.equal(shiftExpr(1, 5, 'pop', 'pop'), null);
  assert.match(scaleExpr(1, 5, 'pop', 'none'), /0\.5\+0\.62/);
  assert.deepEqual(alphaFilters(1, 5, 'rise', 'fade'), ['fade=t=in:st=1:d=0.35:alpha=1', 'fade=t=out:st=4.7:d=0.3:alpha=1']);
});

test('music ducks only under speech, with merged windows and a ramp', () => {
  assert.equal(duckExpression([], 0.3), null);
  assert.equal(duckExpression([[1, 2]], 1), null);
  assert.deepEqual(mergeWindows([[4, 5], [1, 2], [2.1, 3]]), [[1, 3], [4, 5]]);
  const expr = duckExpression([[1, 2], [2.1, 3]], 0.3);
  assert.match(expr, /^1-0\.7\*clip\(\(t-0\.7\)\/0\.3/);
  assert.ok(!expr.includes('max('), 'the two windows merge into one');
});

// ── Captions ───────────────────────────────────────────────────────────────

test('speech is what lies between the silences FFmpeg reports', () => {
  const stderr = [
    '[silencedetect @ 0x1] silence_start: 0',
    '[silencedetect @ 0x1] silence_end: 0.8 | silence_duration: 0.8',
    '[silencedetect @ 0x1] silence_start: 2.5',
    '[silencedetect @ 0x1] silence_end: 3.1 | silence_duration: 0.6',
    '[silencedetect @ 0x1] silence_start: 5.2',
  ].join('\n');
  assert.deepEqual(speechSegments(stderr, 6), [{ start: 0.8, end: 2.5 }, { start: 3.1, end: 5.2 }]);
});

test('lines keep the creator\'s breaks and long lines split at word boundaries', () => {
  assert.deepEqual(captionLines('One two.\n\nThree'), ['One two.', 'Three']);
  const long = captionLines('This sentence is definitely far too long to show as one single caption line on screen');
  assert.ok(long.every((l) => l.length <= 42));
  assert.equal(long.join(' '), 'This sentence is definitely far too long to show as one single caption line on screen');
});

test('supplied words are timed to the speech, one line per phrase when the counts match, never reworded', () => {
  const speech = [{ start: 0.8, end: 2.5 }, { start: 3.1, end: 5.2 }];
  const cues = alignToSpeech(['Ninkana ba wei', 'A de lɛ'], speech, { offset: 10, duration: 6 });
  assert.deepEqual(cues.map((c) => [c.start, c.end, c.text]), [[10.8, 12.5, 'Ninkana ba wei'], [13.1, 15.2, 'A de lɛ']]);
  assert.equal(cues[0].words.length, 3);
  assert.equal(cues[0].words[0].start, 10.8);
  assert.equal(cues[0].words.at(-1).end, 12.5);
  // Kasem's extended vowels count as vowels.
  assert.equal(wordWeight('lɛ'), 1);
});

test('when counts differ, cues share the voiced time by length and snap to pauses', () => {
  const speech = [{ start: 0, end: 4 }];
  const cues = alignToSpeech(['short', 'a much longer line of speech here'], speech, { duration: 4 });
  assert.equal(cues[0].start, 0);
  assert.equal(cues.at(-1).end, 4);
  assert.ok(cues[0].end - cues[0].start < cues[1].end - cues[1].start);
  assert.ok(cues[0].end <= cues[1].start);
});

test('five lines over four spoken phrases: breaks near a pause move into it, a mid-sentence break stays put', () => {
  // Measured from a real narration: "Welcome to Sirigu. / Here, women shape clay by hand, /
  // the way their mothers did. / Every wall tells a story in patterns. / Come and learn with us."
  const speech = [{ start: 0, end: 1.94 }, { start: 2.7, end: 6.85 }, { start: 7.65, end: 10.8 }, { start: 11.35, end: 12.69 }];
  const lines = ['Welcome to Sirigu.', 'Here, women shape clay by hand,', 'the way their mothers did.', 'Every wall tells a story in patterns.', 'Come and learn with us.'];
  const cues = alignToSpeech(lines, speech, { offset: 1, duration: 12.69 });
  const at = cues.map((c) => [c.start, c.end]);
  assert.deepEqual(at[0], [1, 2.94]);
  assert.equal(at[1][0], 3.7);
  // "by hand, / the way…" was spoken without a pause: the break stays inside the phrase.
  assert.ok(at[1][1] > 3.7 && at[1][1] < 7.85);
  assert.equal(at[2][1], 7.85);
  assert.deepEqual(at[3], [8.65, 11.8]);
  assert.deepEqual(at[4], [12.35, 13.69]);
});

test('transcribed segments snap to the nearest speech edges and never overlap', () => {
  const cues = snapToSpeech([{ start: 0.6, end: 2.2, text: 'hello there' }, { start: 2.0, end: 5.0, text: 'and welcome' }], [{ start: 0.8, end: 2.5 }, { start: 3.1, end: 5.2 }], { duration: 6 });
  assert.equal(cues[0].start, 0.8);
  assert.ok(cues[0].end <= cues[1].start);
  assert.equal(cues[1].end, 5.2);
});

// ── Planning ───────────────────────────────────────────────────────────────

test('a plan made from a script must give the script back word for word', () => {
  const script = 'We arrive at dawn. The market opens slowly.\nBy noon everyone is there.';
  assert.ok(narrationMatchesScript([{ narration: 'We arrive at dawn.' }, { narration: 'The market opens slowly. By noon everyone is there.' }], script));
  assert.equal(narrationMatchesScript([{ narration: 'We arrive early.' }, { narration: 'The market opens slowly. By noon everyone is there.' }], script), false);
  const reworded = { scenes: [{ title: 'A', visual: 'x', narration: 'We get there at dawn', caption: '', durationSec: 3, transition: 'cut' }], musicMoods: [], continuity: [] };
  assert.equal(readPlan(reworded, { source: 'script', script, moods: [] }), null);
  const split = splitScript(script, 8);
  assert.ok(narrationMatchesScript(split, script));
  assert.ok(split.every((s) => s.durationSec >= 2.5));
});

test('a model plan is cleaned: unknown transitions become cuts, moods must be in the library', () => {
  const plan = readPlan({
    title: 'Market day',
    scenes: [{ title: 'Dawn', visual: 'Wide shot of stalls opening', narration: 'The market wakes.', caption: 'Dawn', durationSec: 40, transition: 'spin' }],
    musicMoods: ['warm', 'jazz'],
    continuity: [{ name: 'Ama', kind: 'character', description: 'Woman in a blue wrap' }, { name: '', kind: 'x', description: '' }],
  }, { source: 'prompt', script: '', moods: ['warm', 'upbeat'] });
  assert.equal(plan.scenes[0].transition, 'cut');
  assert.equal(plan.scenes[0].durationSec, 12);
  assert.deepEqual(plan.musicMoods, ['warm']);
  assert.equal(plan.continuity.length, 1);
});

// ── The worker's guards ────────────────────────────────────────────────────

test('media may come only from the project\'s own folder or the member\'s own AI videos', () => {
  assert.ok(allowedMediaPath('video-projects/u1/p1/media/m1/clip.mp4', 'u1', 'p1'));
  assert.ok(allowedMediaPath('studio-video-jobs/u1/job/output.mp4', 'u1', 'p1'));
  assert.equal(allowedMediaPath('video-projects/u2/p1/media/m1/clip.mp4', 'u1', 'p1'), false);
  assert.equal(allowedMediaPath('video-projects/u1/p1/media/../../../u2/x.mp4', 'u1', 'p1'), false);
  assert.equal(allowedMediaPath('creator-submissions/u1/x.mp4', 'u1', 'p1'), false);
});

test('failures are sorted into what a retry can fix and what needs the member', () => {
  assert.equal(classifyFailure(new RenderSpecError('scenes', 'bad')).retryable, false);
  assert.equal(classifyFailure(new Error('boom')).retryable, true);
});

test('FFmpeg\'s own description of a file gives duration, streams and size', () => {
  const probe = parseProbe('  Duration: 00:01:02.50, start: 0.000000, bitrate: 900 kb/s\n  Stream #0:0[0x1](und): Video: h264 (High), yuv420p, 1080x1920, 30 fps\n  Stream #0:1[0x2](und): Audio: aac (LC), 48000 Hz, stereo');
  assert.deepEqual(probe, { durationSec: 62.5, hasVideo: true, hasAudio: true, width: 1080, height: 1920 });
});

// ── Real renders ───────────────────────────────────────────────────────────

function ffmpegBin() {
  if (process.env.FFMPEG_BIN) return process.env.FFMPEG_BIN;
  try {
    return createRequire(import.meta.url)('../../services/functions/node_modules/ffmpeg-static') ?? createRequire(import.meta.url)('ffmpeg-static');
  } catch {
    try {
      return createRequire(import.meta.url)('ffmpeg-static');
    } catch {
      return null;
    }
  }
}

const FF = ffmpegBin();
if (FF) process.env.FFMPEG_BIN = FF;

function ff(args) {
  const r = spawnSync(FF, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(r.stderr);
}

/** The average colour of a small box of one frame, as [r, g, b]. */
function pixel(file, t, x, y, w, h, size = 8) {
  const r = spawnSync(FF, ['-hide_banner', '-loglevel', 'error', '-ss', String(t), '-i', file, '-frames:v', '1', '-vf', `crop=${size}:${size}:${Math.round(x * w - size / 2)}:${Math.round(y * h - size / 2)},scale=1:1:flags=area`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 1 << 20 });
  return [...r.stdout.subarray(0, 3)];
}

/** RMS level of the audio between two times, in dBFS. */
function audioLevel(file, from, to) {
  const r = spawnSync(FF, ['-hide_banner', '-nostdin', '-ss', String(from), '-t', String(to - from), '-i', file, '-af', 'volumedetect', '-f', 'null', '-'], { encoding: 'utf8' });
  const m = /mean_volume:\s*(-?[\d.]+|-inf) dB/.exec(r.stderr);
  return m && m[1] !== '-inf' ? Number(m[1]) : -120;
}

const close = (actual, expected, tolerance = 40) => actual.every((v, i) => Math.abs(v - expected[i]) <= tolerance);

async function render(aspect, dir) {
  const settings = { aspect, resolution: '720p', quality: 'draft' };
  const { width: W, height: H } = frameSize(settings);
  const clip = path.join(dir, 'clip.mp4');
  const tone = path.join(dir, 'music.m4a');
  const sticker = path.join(dir, 'sticker.png');
  const caption = path.join(dir, 'caption.png');
  const blank = path.join(dir, 'blank.png');
  // A grey test clip with a quiet tone, a louder "music" tone, a solid red
  // sticker, and a caption frame with a solid green bar across the bottom.
  ff(['-f', 'lavfi', '-i', 'color=c=0x808080:s=640x360:r=30:d=4', '-f', 'lavfi', '-i', 'sine=f=300:d=4,volume=0.05', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', clip]);
  ff(['-f', 'lavfi', '-i', 'sine=f=660:d=10,volume=0.5', '-c:a', 'aac', tone]);
  ff(['-f', 'lavfi', '-i', 'color=c=0xff0000:s=200x200,format=rgba', '-frames:v', '1', sticker]);
  ff(['-f', 'lavfi', '-i', `color=c=0x00ff00:s=${W}x${Math.round(H * 0.1)},format=rgba,pad=${W}:${H}:0:${Math.round(H * 0.85)}:color=0x00000000`, '-frames:v', '1', caption]);
  ff(blankFrameArgs(W, H, blank).slice(3));

  const spec = parseRenderSpec({
    version: 1,
    aspect,
    background: '#000000',
    scenes: [
      { id: 'a', source: { kind: 'video', mediaId: 'clip' }, duration: 3, fit: 'cover' },
      { id: 'b', source: { kind: 'color', color: '#0000ff' }, duration: 2, transitionIn: { type: 'fade', duration: 0.6 } },
    ],
    layers: [{ type: 'sticker', id: 'k', stickerId: 'red', cx: 0.25, cy: 0.3, size: 0.25, start: 1, end: 4, enter: 'pop', exit: 'fade', z: 1 }],
    captionTrack: [{ layerPath: `${prefix}cap.png`, start: 2, end: 3.5 }],
    audio: { musicLevel: 1, duckTo: 0.25, voice: [], music: [{ id: 'm', trackId: 'tone', start: 1, sourceIn: 0, duration: 4, fadeIn: 0.2, fadeOut: 0.3 }] },
  }, ctx);
  assert.deepEqual(referencedLayerPaths(spec), [`${prefix}cap.png`]);
  const inputs = {
    media: new Map([['clip', { path: clip, ...(await probeMedia(clip)) }]]),
    layers: new Map([[`${prefix}cap.png`, caption]]),
    stickers: new Map([['red', sticker]]),
    tracks: new Map([['tone', { path: tone, durationSec: 10 }]]),
    blankFramePath: blank,
  };
  const out = path.join(dir, `out-${aspect.replace(':', 'x')}.mp4`);
  const plan = buildRenderPlan(spec, settings, inputs, dir, out);
  for (const f of plan.files) writeFileSync(f.path, f.content);
  await runFfmpeg(plan.args, { timeoutMs: 180_000 });
  return { out, W, H, probe: await probeMedia(out) };
}

for (const aspect of ['9:16', '16:9']) {
  test(`a ${aspect} render is the right size and length, with the sticker, caption and music where the spec puts them`, { skip: !FF && 'no FFmpeg available' }, async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'render-test-'));
    try {
      const { out, W, H, probe } = await render(aspect, dir);
      assert.equal(probe.width, W);
      assert.equal(probe.height, H);
      assert.ok(Math.abs(probe.durationSec - 5) < 0.1, `duration ${probe.durationSec}`);
      assert.ok(probe.hasAudio);
      // Before the sticker's entrance: the grey clip at its position.
      assert.ok(close(pixel(out, 0.5, 0.25, 0.3, W, H), [128, 128, 128]), 'no sticker before 1 s');
      // Fully in: red at its centre, in both aspect ratios.
      assert.ok(close(pixel(out, 2.5, 0.25, 0.3, W, H), [255, 0, 0], 60), 'sticker drawn at its centre');
      // After it left: the blue scene.
      assert.ok(close(pixel(out, 4.5, 0.25, 0.3, W, H), [0, 0, 255], 60), 'sticker gone after its end');
      // The caption bar only inside its window.
      assert.ok(close(pixel(out, 2.8, 0.5, 0.9, W, H), [0, 255, 0], 70), 'caption on screen');
      assert.ok(!close(pixel(out, 4.0, 0.5, 0.9, W, H), [0, 255, 0], 70), 'caption gone after its end');
      // The music starts at 1 s: near silence before, clearly audible after.
      assert.ok(audioLevel(out, 0, 0.8) < audioLevel(out, 1.5, 2.5) - 10, 'music enters at its position');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
}
