#!/usr/bin/env node
/**
 * Checks the AZ Studio downloads and publishes the ones that pass into the
 * Indigen World project, where the TribeStudio video editor reads them.
 *
 *   node tools/media-library/publish.mjs verify music      # listen-check every downloaded track
 *   node tools/media-library/publish.mjs verify stickers   # read-check every cut-out sticker
 *   node tools/media-library/publish.mjs publish music     # upload + write Firestore (idempotent)
 *   node tools/media-library/publish.mjs publish stickers
 *   node tools/media-library/publish.mjs status
 *
 * Runs with Application Default Credentials against project-kassena-7e026.
 *
 * ── What a published item must have passed ──────────────────────────────────
 * Music: FFmpeg decodes the whole file without an error; it is 20–150 seconds
 * long; it has no silence longer than 2.5 seconds after the first two seconds;
 * its loudness is within a usable range; and Gemini, listening to it, heard no
 * singing and no speech — the library promises instrumentals, and a track the
 * prompt asked to be instrumental is not taken on trust.
 * Stickers: the cut-out passed (cutout.py: flat background, nothing cut off,
 * no key colour left, a clean edge); and where the sticker carries lettering,
 * Gemini read exactly the words it was supposed to carry.
 *
 * Nothing is published that has not passed, and an item that later fails a
 * re-check is unpublished rather than left up.
 */
import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..', '..');
const WORK = path.join(here, '.work');
const PROJECT = process.env.INDIGEN_PROJECT ?? 'project-kassena-7e026';
const BUCKET = process.env.INDIGEN_BUCKET ?? `${PROJECT}.firebasestorage.app`;
const TERMS_CHECKED = '2026-09-27';
process.env.GOOGLE_CLOUD_QUOTA_PROJECT = PROJECT;

const require = createRequire(path.join(repo, 'services', 'functions', 'package.json'));
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getStorage } = require('firebase-admin/storage');
const FFMPEG = process.env.FFMPEG_BIN || require('ffmpeg-static');

// Publishing writes the live library the editor reads. Against the emulators
// (FIRESTORE_EMULATOR_HOST set) it runs freely; against production it runs
// only when asked to with --production, so a test run cannot publish by accident.
const toEmulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
if (process.argv[2] === 'publish' && !toEmulator && !process.argv.includes('--production')) {
  console.error('Refusing to publish to production without --production (or set FIRESTORE_EMULATOR_HOST to publish to the emulator).');
  process.exit(2);
}
if (toEmulator && !process.env.FIREBASE_STORAGE_EMULATOR_HOST) {
  console.error('FIRESTORE_EMULATOR_HOST is set but FIREBASE_STORAGE_EMULATOR_HOST is not: refusing to mix an emulated database with real storage.');
  process.exit(2);
}
console.log(`target: ${toEmulator ? `emulators (${process.env.FIRESTORE_EMULATOR_HOST})` : `production ${PROJECT}`}`);
initializeApp({ projectId: PROJECT, storageBucket: BUCKET });
const db = getFirestore();
const bucket = getStorage().bucket();

const [command, kind] = process.argv.slice(2);
const read = (file, fallback) => (existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : fallback);
const write = (file, value) => writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
const log = (msg) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${msg}`);
const sha256 = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');

const musicBriefs = read(path.join(here, 'briefs', 'music.json'), null);
const stickerBriefs = read(path.join(here, 'briefs', 'stickers.json'), null);

// ── Licence text, stated once ───────────────────────────────────────────────
// From the Gemini API Additional Terms of Service (last updated 2026-04-28),
// Google's Generative AI Prohibited Use Policy (2024-12-17) and the Lyria
// documentation, read on TERMS_CHECKED. Kept here, and copied onto every
// published item, so the conditions travel with the file.
const TERM_SOURCES = [
  'https://ai.google.dev/gemini-api/terms',
  'https://policies.google.com/terms/generative-ai/use-policy',
  'https://ai.google.dev/gemini-api/docs/music-generation',
];
const MUSIC_LICENSE = {
  aiGenerated: true,
  summary: 'Original instrumental generated with Lyria 3.5 (Google) through AZ Studio for Indigen World. You can use it in videos you make and export in TribeStudio, including videos you post to YouTube, TikTok and Instagram.',
  restrictions: [
    'AI-generated: every track carries Google’s inaudible SynthID watermark. Do not present the music as composed or performed by a person.',
    'Not exclusive: Google does not claim the output, but may generate similar music for others. Don’t claim a track as your own composition or register it with Content ID or a similar rights system.',
    'Follow Google’s Generative AI Prohibited Use Policy: don’t use the music in content that is illegal, harmful, deceptive or that infringes others’ rights.',
    'Library rule: the tracks are for use inside videos made with TribeStudio, not for release on their own.',
  ],
  termsCheckedAt: TERMS_CHECKED,
  sources: TERM_SOURCES,
};
const STICKER_LICENSE = {
  aiGenerated: true,
  summary: 'Sticker generated with Nano Banana Pro (Gemini 3 Pro Image, Google Vertex AI) through AZ Studio for Indigen World, then cut out. You can use it in videos you make and export in TribeStudio.',
  restrictions: [
    'AI-generated: the pixels carry Google’s SynthID watermark. The cut-out copy no longer carries the original’s C2PA content credentials. Do not present it as drawn by a person.',
    'Not exclusive: similar images may be generated for others. Don’t register it as your own trademark or artwork.',
    'Follow Google’s Generative AI Prohibited Use Policy when you use it.',
  ],
  termsCheckedAt: TERMS_CHECKED,
  sources: ['https://cloud.google.com/terms/service-terms', 'https://policies.google.com/terms/generative-ai/use-policy'],
};

/** A result whose check never ran (network, quota) is not a verdict yet. */
function unfinished(result) {
  return Boolean(result?.incomplete || result?.problems?.some((p) => p.includes('could not run')));
}

// ── Gemini, for the two checks a waveform cannot make ──────────────────────
let genai = null;

async function gemini() {
  if (genai) return genai;
  const { GoogleGenAI } = require('@google/genai');
  genai = new GoogleGenAI({ vertexai: true, project: PROJECT, location: 'global' });
  return genai;
}

async function askJson(parts, schema, instruction) {
  const ai = await gemini();
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const res = await ai.models.generateContent({
        model: process.env.CHECK_MODEL ?? 'gemini-3.8-flash',
        contents: [{ role: 'user', parts }],
        config: { systemInstruction: instruction, responseMimeType: 'application/json', responseJsonSchema: schema, temperature: 0, maxOutputTokens: 4096, thinkingConfig: { thinkingLevel: 'MEDIUM' }, labels: { app: 'indigen-world', feature: 'media-library' } },
      });
      return JSON.parse(res.text ?? '{}');
    } catch (e) {
      if (attempt === 3) throw e;
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
  return {};
}

function ffmpeg(args) {
  return spawnSync(FFMPEG, ['-hide_banner', '-nostdin', ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

// ── Music ───────────────────────────────────────────────────────────────────

/**
 * The tempo to publish. Beat trackers often lock onto double (or half) the
 * pulse of slow music; where the measurement is within 12% of twice or half
 * the tempo the track was asked for, the requested octave is taken and the
 * record says so. Otherwise the measurement stands as measured.
 */
export function tempoFor(measured, requested) {
  if (!measured || !requested) return { bpm: measured ?? null, octaveCorrected: false };
  const near = (a, b) => Math.abs(a - b) / b <= 0.12;
  if (near(measured, requested * 2)) return { bpm: Math.round(measured / 2), octaveCorrected: true };
  if (near(measured, requested / 2)) return { bpm: Math.round(measured * 2), octaveCorrected: true };
  return { bpm: Math.round(measured), octaveCorrected: false };
}

const LISTEN_INSTRUCTION = 'You check background music for a video library that promises instrumentals. Be precise and conservative: report a human voice only when you clearly hear one.';
const LISTEN_PROMPT = 'List every moment a HUMAN VOICE is audible in this track. For each: start and end (m:ss), type (sung words, wordless singing, humming, choir or "aah" voices, spoken words, shout or chant), and the words if any are understandable. Synthesizers, whistles and instruments that merely sound voice-like are NOT human voices — list them under instrumentsThatSoundVocal instead. Also list the main instruments and describe the music in one plain sentence of at most 22 words for someone choosing background music.';
const LISTEN_SCHEMA = {
  type: 'object',
  properties: {
    voices: { type: 'array', items: { type: 'object', properties: { start: { type: 'string' }, end: { type: 'string' }, type: { type: 'string' }, words: { type: 'string' } }, required: ['start', 'end', 'type', 'words'] } },
    instrumentsThatSoundVocal: { type: 'array', items: { type: 'string' } },
    instruments: { type: 'array', items: { type: 'string' } },
    description: { type: 'string' },
    verdict: { type: 'string', enum: ['instrumental', 'has human voice'] },
  },
  required: ['voices', 'instrumentsThatSoundVocal', 'instruments', 'description', 'verdict'],
};

async function verifyMusic() {
  const state = read(path.join(WORK, 'state.music.json'), { items: {} });
  const out = read(path.join(WORK, 'verify.music.json'), {});
  for (const item of Object.values(state.items)) {
    if (item.status !== 'downloaded') continue;
    const file = path.join(WORK, item.file);
    const hash = sha256(file);
    // A check that could not run (network, quota) is not a verdict: try it again.
    if (out[item.briefId]?.sha256 === hash && out[item.briefId]?.passed !== undefined && !unfinished(out[item.briefId])) continue;
    const problems = [];
    const decode = ffmpeg(['-v', 'error', '-i', file, '-f', 'null', '-']);
    if (decode.status !== 0 || decode.stderr.trim()) problems.push(`decode errors: ${decode.stderr.trim().slice(0, 200) || decode.status}`);
    const probe = ffmpeg(['-i', file]);
    const m = /Duration:\s*(\d+):(\d+):([\d.]+)/.exec(probe.stderr);
    const duration = m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : 0;
    if (duration < 20 || duration > 150) problems.push(`length ${duration.toFixed(1)} s is outside 20–150 s`);
    const silence = ffmpeg(['-i', file, '-af', 'silencedetect=n=-50dB:d=2.5', '-f', 'null', '-']).stderr;
    const gaps = [...silence.matchAll(/silence_start:\s*([\d.]+)/g)].map((x) => Number(x[1])).filter((s) => s > 2 && s < duration - 3);
    if (gaps.length) problems.push(`silence of 2.5 s or more at ${gaps.map((g) => g.toFixed(1)).join(', ')} s`);
    const lufs = item.analysis?.integratedLufs ?? null;
    if (lufs !== null && (lufs < -35 || lufs > -5)) problems.push(`loudness ${lufs} LUFS is outside −35 to −5`);
    // Listening, for what a waveform cannot tell: is anyone singing or talking?
    // Voice-like instruments (a synth choir pad, a breathy lead, a whistle)
    // are named separately so they are not mistaken for people; a voice counts
    // only when two of up to three independent listens hear one.
    const clip = path.join(WORK, 'music', `${item.briefId}.check.mp3`);
    ffmpeg(['-y', '-i', file, '-ac', '1', '-ar', '16000', '-b:a', '48k', clip]);
    let heard = null;
    let incomplete = false;
    const listens = [];
    try {
      const audioPart = { inlineData: { mimeType: 'audio/mp3', data: readFileSync(clip).toString('base64') } };
      for (let i = 0; i < 3; i += 1) {
        const listen = await askJson([audioPart, { text: LISTEN_PROMPT }], LISTEN_SCHEMA, LISTEN_INSTRUCTION);
        listens.push(listen);
        const voiced = listens.filter((l) => l.verdict === 'has human voice').length;
        const clean = listens.length - voiced;
        if (voiced >= 2 || clean >= 2) break;
      }
      const voiced = listens.filter((l) => l.verdict === 'has human voice');
      heard = {
        voice: voiced.length >= 2,
        voices: (voiced[0]?.voices ?? []),
        voiceLikeInstruments: [...new Set(listens.flatMap((l) => l.instrumentsThatSoundVocal ?? []))],
        instruments: listens[0]?.instruments ?? [],
        description: listens.find((l) => l.description)?.description ?? '',
        listens: listens.length,
      };
    } catch (e) {
      incomplete = true;
      problems.push(`the listening check could not run: ${String(e.message ?? e).slice(0, 160)}`);
    }
    if (heard?.voice) problems.push(`a human voice was heard (${heard.voices.map((v) => `${v.start}–${v.end} ${v.type}${v.words ? ` “${v.words}”` : ''}`).join('; ') || 'details not given'})`);
    out[item.briefId] = { sha256: hash, passed: problems.length === 0, incomplete, problems, durationSec: Math.round(duration * 100) / 100, heard, checkedAt: new Date().toISOString() };
    write(path.join(WORK, 'verify.music.json'), out);
    log(`${problems.length ? '✗' : '✓'} ${item.briefId}${problems.length ? ` — ${problems.join('; ')}` : ` — ${heard?.description ?? ''}`}`);
  }
}

async function upload(file, destination, contentType) {
  const target = bucket.file(destination);
  const [exists] = await target.exists();
  let token;
  if (exists) {
    const [meta] = await target.getMetadata();
    token = meta.metadata?.firebaseStorageDownloadTokens;
    const [remoteHash] = [meta.metadata?.sha256];
    if (remoteHash !== sha256(file) || !token) {
      token = token ?? randomUUID();
      await bucket.upload(file, { destination, resumable: false, metadata: { contentType, cacheControl: 'public, max-age=31536000', metadata: { firebaseStorageDownloadTokens: token, sha256: sha256(file) } } });
    }
  } else {
    token = randomUUID();
    await bucket.upload(file, { destination, resumable: false, metadata: { contentType, cacheControl: 'public, max-age=31536000', metadata: { firebaseStorageDownloadTokens: token, sha256: sha256(file) } } });
  }
  // Against the emulator (a local end-to-end test), the link points at it.
  const host = process.env.FIREBASE_STORAGE_EMULATOR_HOST ? `http://${process.env.FIREBASE_STORAGE_EMULATOR_HOST}` : 'https://firebasestorage.googleapis.com';
  return `${host}/v0/b/${bucket.name}/o/${encodeURIComponent(destination)}?alt=media&token=${token}`;
}

async function publishMusic() {
  const state = read(path.join(WORK, 'state.music.json'), { items: {} });
  const checks = read(path.join(WORK, 'verify.music.json'), {});
  let published = 0;
  for (const brief of musicBriefs.tracks) {
    const item = state.items[`music:${brief.id}`];
    const check = checks[brief.id];
    const ref = db.collection('videoMusicTracks').doc(brief.id);
    if (!item || item.status !== 'downloaded' || !check?.passed || check.sha256 !== item.sha256) {
      const snap = await ref.get();
      if (snap.exists && snap.get('status') === 'published') {
        await ref.update({ status: 'hidden', hiddenReason: 'failed re-verification', updatedAt: new Date().toISOString() });
        log(`hidden ${brief.id}: it no longer passes`);
      }
      continue;
    }
    const file = path.join(WORK, item.file);
    const storagePath = `media-library/music/${brief.id}.mp3`;
    const url = await upload(file, storagePath, 'audio/mpeg');
    const a = item.analysis ?? {};
    const tempo = tempoFor(a.bpm, brief.targetBpm);
    const waveform = (a.peaks ?? []).filter((_, i) => i % 2 === 0).map((v) => Math.round(v * 100) / 100);
    const now = new Date().toISOString();
    const snap = await ref.get();
    await ref.set({
      id: brief.id,
      title: brief.title,
      group: brief.group,
      moods: brief.moods,
      style: brief.style,
      energy: brief.energy,
      description: check.heard?.description ?? brief.style,
      instruments: check.heard?.instruments ?? [],
      durationSec: check.durationSec,
      tempoBpm: tempo.bpm,
      tempo: { measuredBpm: a.bpm ?? null, requestedBpm: brief.targetBpm, octaveCorrected: tempo.octaveCorrected, method: 'Beat tracking with AZ Studio’s music analysis' },
      key: a.key ?? null,
      loudness: { integratedLufs: a.integratedLufs ?? null, truePeakDb: a.truePeakDb ?? null, loudnessRange: a.loudnessRange ?? null },
      waveform,
      audio: { storagePath, url, mimeType: 'audio/mpeg', sizeBytes: item.bytes, sha256: item.sha256 },
      generation: {
        model: item.modelId,
        modelName: item.modelName,
        provider: 'Google — Gemini Developer API',
        via: 'AZ Studio',
        azStudio: { project: 'az-learner', projectId: 'indigen-video-library', jobId: item.attempts.at(-1)?.jobId ?? null, assetId: item.assetId },
        prompt: item.prompt,
        requestedSeconds: brief.targetSeconds,
        generatedAt: item.generatedAt,
      },
      verification: { checkedAt: check.checkedAt, decodes: true, instrumental: true, listens: check.heard?.listens ?? null, voiceLikeInstruments: check.heard?.voiceLikeInstruments ?? [], listeningModel: process.env.CHECK_MODEL ?? 'gemini-3.8-flash' },
      license: MUSIC_LICENSE,
      usage: snap.exists ? snap.get('usage') ?? { exports: 0, lastUsedAt: null } : { exports: 0, lastUsedAt: null },
      // What the track was heard to be: Lyria does not always follow a brief's instruments.
      searchText: [brief.title, brief.group, ...brief.moods, check.heard?.description || brief.style].join(' ').toLowerCase(),
      status: 'published',
      schemaVersion: 1,
      createdAt: snap.exists ? snap.get('createdAt') ?? now : now,
      updatedAt: now,
    });
    published += 1;
  }
  log(`music: ${published} published`);
  return published;
}

// ── Stickers ────────────────────────────────────────────────────────────────

async function verifyStickers() {
  const report = read(path.join(WORK, 'stickers', 'cutout-report.json'), {});
  const out = read(path.join(WORK, 'verify.stickers.json'), {});
  for (const brief of stickerBriefs.stickers) {
    const cut = report[brief.id];
    if (!cut) continue;
    const file = path.join(WORK, cut.file);
    const hash = sha256(file);
    // A check that could not run (network, quota) is not a verdict: try it again.
    if (out[brief.id]?.sha256 === hash && out[brief.id]?.passed !== undefined && !unfinished(out[brief.id])) continue;
    const problems = [];
    if (cut.verdict === 'FAIL') problems.push(`cut-out failed: ${Object.entries(cut.checks).filter(([, c]) => c.result === 'FAIL').map(([n, c]) => `${n} (${c.detail})`).join('; ')}`);
    let seen = null;
    let incomplete = false;
    try {
      seen = await askJson(
        [{ inlineData: { mimeType: 'image/png', data: readFileSync(file).toString('base64') } }, { text: brief.text ? `This sticker should read exactly: "${brief.text}".` : 'This sticker should carry no lettering.' }],
        {
          type: 'object',
          properties: {
            text: { type: 'string', description: 'Every letter, word or number visible, exactly as written, or empty.' },
            legible: { type: 'boolean' },
            matches: { type: 'boolean', description: 'True if the lettering is exactly what it should be (or there is none, where none is expected).' },
            defects: { type: 'array', items: { type: 'string' }, description: 'Visible problems: leftover background, a fake checkerboard, cut-off parts, garbled shapes, stray marks. Empty if none.' },
            description: { type: 'string', description: 'What the sticker shows, in under 12 words, for alt text.' },
          },
          required: ['text', 'legible', 'matches', 'defects', 'description'],
        },
        'You inspect stickers before they go into a video editor library. Read lettering exactly, letter by letter, and report visible defects honestly.',
      );
    } catch (e) {
      incomplete = true;
      problems.push(`the reading check could not run: ${String(e.message ?? e).slice(0, 160)}`);
    }
    if (seen && !seen.matches) problems.push(`lettering reads “${seen.text}”${brief.text ? `, not “${brief.text}”` : ''}`);
    if (seen && brief.text && !seen.legible) problems.push('lettering is not legible');
    out[brief.id] = { sha256: hash, passed: problems.length === 0, incomplete, problems, verdict: cut.verdict, seen, checkedAt: new Date().toISOString() };
    write(path.join(WORK, 'verify.stickers.json'), out);
    log(`${problems.length ? '✗' : '✓'} ${brief.id}${problems.length ? ` — ${problems.join('; ')}` : seen?.defects?.length ? ` — noted: ${seen.defects.join('; ')}` : ''}`);
  }
}

async function publishStickers() {
  const state = read(path.join(WORK, 'state.stickers.json'), { items: {} });
  const report = read(path.join(WORK, 'stickers', 'cutout-report.json'), {});
  const checks = read(path.join(WORK, 'verify.stickers.json'), {});
  const reviewed = read(path.join(here, 'review', 'stickers.json'), { rejected: {} });
  let published = 0;
  for (const [order, brief] of stickerBriefs.stickers.entries()) {
    const item = state.items[`stickers:${brief.id}`];
    const cut = report[brief.id];
    const check = checks[brief.id];
    const ref = db.collection('videoStickers').doc(brief.id);
    const file = cut ? path.join(WORK, cut.file) : null;
    const ok = item?.status === 'downloaded' && cut && check?.passed && file && check.sha256 === sha256(file) && !reviewed.rejected[brief.id];
    if (!ok) {
      const snap = await ref.get();
      if (snap.exists && snap.get('status') === 'published') {
        await ref.update({ status: 'hidden', hiddenReason: 'failed re-verification or review', updatedAt: new Date().toISOString() });
        log(`hidden ${brief.id}`);
      }
      continue;
    }
    const storagePath = `media-library/stickers/${brief.id}.png`;
    const url = await upload(file, storagePath, 'image/png');
    const now = new Date().toISOString();
    const snap = await ref.get();
    await ref.set({
      id: brief.id,
      label: brief.label,
      category: brief.category,
      keywords: brief.keywords,
      text: brief.text ?? null,
      altText: check.seen?.description || brief.label,
      order,
      image: { storagePath, url, width: cut.width, height: cut.height, sizeBytes: cut.bytes, sha256: check.sha256, format: 'png', transparent: true },
      generation: {
        model: item.modelId,
        modelName: item.modelName,
        provider: 'Google — Vertex AI',
        via: 'AZ Studio',
        azStudio: { project: 'az-learner', projectId: 'indigen-video-library', jobId: item.attempts.at(-1)?.jobId ?? null, assetId: item.assetId },
        prompt: item.prompt,
        edits: item.attempts.filter((a) => a.mode === 'edit').map((a) => a.note),
        generatedAt: item.generatedAt,
      },
      cutout: { method: 'Chroma-key flood fill from the frame edge, soft edge and despill (tools/media-library/cutout.py)', background: brief.background ?? 'green', verdict: cut.verdict, checks: cut.checks },
      verification: { checkedAt: check.checkedAt, lettering: check.seen?.text ?? '', letteringMatches: true, defectsNoted: check.seen?.defects ?? [], readingModel: process.env.CHECK_MODEL ?? 'gemini-3.8-flash', visualReview: reviewed.approvedAt ?? null },
      license: STICKER_LICENSE,
      usage: snap.exists ? snap.get('usage') ?? { exports: 0, lastUsedAt: null } : { exports: 0, lastUsedAt: null },
      searchText: [brief.label, brief.category, ...brief.keywords].join(' ').toLowerCase(),
      status: 'published',
      schemaVersion: 1,
      createdAt: snap.exists ? snap.get('createdAt') ?? now : now,
      updatedAt: now,
    });
    published += 1;
  }
  log(`stickers: ${published} published`);
  return published;
}

async function status() {
  for (const [collection, label] of [['videoMusicTracks', 'music'], ['videoStickers', 'stickers']]) {
    const snap = await db.collection(collection).get();
    const counts = {};
    for (const d of snap.docs) counts[d.get('status')] = (counts[d.get('status')] ?? 0) + 1;
    console.log(label, JSON.stringify(counts));
  }
}

const run = {
  'verify music': verifyMusic,
  'verify stickers': verifyStickers,
  'publish music': publishMusic,
  'publish stickers': publishStickers,
  'status undefined': status,
}[`${command} ${kind}`];
if (!run) {
  console.error('Usage: publish.mjs verify|publish music|stickers, or publish.mjs status');
  process.exit(2);
}
await run();
process.exit(0);
