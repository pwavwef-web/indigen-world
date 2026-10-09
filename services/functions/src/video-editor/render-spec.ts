/**
 * The render spec: what the TribeStudio video editor asks the renderer to make.
 *
 * ── One contract, validated here ─────────────────────────────────────────────
 * The editor builds this from a saved project (`apps/tribestudio/src/creator/
 * editor/render-spec.ts`) and the renderer turns it into one FFmpeg run
 * (`render-plan.ts`). It arrives from a browser, so every number is clamped,
 * every id is checked for shape, and every duration is recomputed here rather
 * than believed: the total length is the sum of the scenes, not a field the
 * client sends.
 *
 * ── The timeline model ───────────────────────────────────────────────────────
 * Scenes are a magnetic main track: in order, with no gaps, each starting where
 * the previous one ends. A transition between two scenes is centred on the cut,
 * borrowing half its length from each side, so a transition never moves
 * anything else on the timeline — captions, stickers, voice and music keep the
 * absolute times the member placed them at.
 *
 * Everything drawn over the picture is a layer, in one z-ordered list:
 *   - `image` layers are PNGs the editor rasterised itself (text, title cards,
 *     captions), placed at pixel positions in the output frame. Rasterising in
 *     the editor is what makes the preview and the export draw the same text.
 *   - `sticker` layers are library stickers, placed by their centre in
 *     normalised coordinates and sized against the frame's short side, so one
 *     project renders them in the same place in 9:16, 1:1 and 16:9.
 *   - one optional `captionTrack`: full-frame PNGs shown back to back, one per
 *     caption cue (or per highlighted word), which is far cheaper to composite
 *     than a separate layer per word.
 */

export const VIDEO_ASPECTS = ['9:16', '1:1', '16:9'] as const;
export type VideoAspect = (typeof VIDEO_ASPECTS)[number];

export const RENDER_RESOLUTIONS = ['720p', '1080p'] as const;
export type RenderResolution = (typeof RENDER_RESOLUTIONS)[number];

/** Draft is the fast preview render; standard and high are exports. */
export const RENDER_QUALITIES = ['draft', 'standard', 'high'] as const;
export type RenderQuality = (typeof RENDER_QUALITIES)[number];

export const SCENE_FITS = ['cover', 'contain', 'blur'] as const;
export type SceneFit = (typeof SCENE_FITS)[number];

export const SCENE_LOOKS = ['none', 'vivid', 'warm', 'cool', 'mono', 'dusk'] as const;
export type SceneLook = (typeof SCENE_LOOKS)[number];

export const TRANSITIONS = ['cut', 'fade', 'flash', 'slide', 'wipe'] as const;
export type TransitionType = (typeof TRANSITIONS)[number];

export const ENTRANCES = ['none', 'fade', 'pop', 'rise'] as const;
export type Entrance = (typeof ENTRANCES)[number];

export const EXITS = ['none', 'fade', 'pop', 'sink'] as const;
export type Exit = (typeof EXITS)[number];

export const FPS = 30;
export const MAX_DURATION_SEC = 300;
export const MIN_SCENE_SEC = 0.5;
export const MAX_SCENE_SEC = 120;
export const MAX_TRANSITION_SEC = 1.5;
export const MAX_SCENES = 120;
export const MAX_LAYERS = 80;
export const MAX_CAPTION_FRAMES = 1200;
export const MAX_VOICE_CLIPS = 60;
export const MAX_MUSIC_CLIPS = 12;

export class RenderSpecError extends Error {
  constructor(readonly field: string, message: string) {
    super(message);
    this.name = 'RenderSpecError';
  }
}

export type SceneSource =
  | { kind: 'video'; mediaId: string }
  | { kind: 'image'; mediaId: string }
  | { kind: 'card'; layerPath: string }
  | { kind: 'color'; color: string };

export interface SceneSpec {
  id: string;
  source: SceneSource;
  /** Seconds on the timeline. */
  duration: number;
  /** Where in the source file the scene starts (video only). */
  sourceIn: number;
  speed: number;
  fit: SceneFit;
  focusX: number;
  focusY: number;
  rotation: 0 | 90 | 180 | 270;
  flipX: boolean;
  look: SceneLook;
  kenBurns: boolean;
  /** The scene's own sound, 0–2 (0 is muted). */
  volume: number;
  /** Lower the music while this scene's own sound plays (someone speaking on camera). */
  duckMusic: boolean;
  /** How this scene arrives from the one before it. Ignored on the first scene. */
  transitionIn: { type: TransitionType; duration: number };
}

export interface ImageLayerSpec {
  type: 'image';
  id: string;
  layerPath: string;
  x: number;
  y: number;
  width: number;
  height: number;
  start: number;
  end: number;
  enter: Entrance;
  exit: Exit;
  z: number;
}

export interface StickerLayerSpec {
  type: 'sticker';
  id: string;
  stickerId: string;
  /** Centre, as a fraction of the frame's width and height. */
  cx: number;
  cy: number;
  /** The sticker's longest side, as a fraction of the frame's shorter side. */
  size: number;
  rotation: number;
  flipX: boolean;
  opacity: number;
  start: number;
  end: number;
  enter: Entrance;
  exit: Exit;
  z: number;
}

export type LayerSpec = ImageLayerSpec | StickerLayerSpec;

export interface CaptionFrameSpec {
  layerPath: string;
  start: number;
  end: number;
}

export interface VoiceClipSpec {
  id: string;
  mediaId: string;
  start: number;
  sourceIn: number;
  duration: number;
  volume: number;
  fadeIn: number;
  fadeOut: number;
}

export interface MusicClipSpec {
  id: string;
  trackId: string;
  start: number;
  sourceIn: number;
  duration: number;
  volume: number;
  fadeIn: number;
  fadeOut: number;
}

export interface AudioMixSpec {
  /** Master levels for the three kinds of sound, 0–2. */
  sourceLevel: number;
  voiceLevel: number;
  musicLevel: number;
  /** Music gain while someone is speaking, 0–1 (1 = no ducking). */
  duckTo: number;
  voice: VoiceClipSpec[];
  music: MusicClipSpec[];
}

export interface RenderSpec {
  version: 1;
  aspect: VideoAspect;
  background: string;
  scenes: SceneSpec[];
  layers: LayerSpec[];
  captionTrack: CaptionFrameSpec[];
  audio: AudioMixSpec;
}

export interface RenderSettings {
  aspect: VideoAspect;
  resolution: RenderResolution;
  quality: RenderQuality;
}

type Json = Record<string, unknown>;

const ID = /^[A-Za-z0-9_-]{1,80}$/;
const COLOR = /^#[0-9a-fA-F]{6}$/;

function obj(raw: unknown, field: string): Json {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new RenderSpecError(field, `${field} must be an object.`);
  return raw as Json;
}

function arr(raw: unknown, field: string, max: number): unknown[] {
  if (raw == null) return [];
  if (!Array.isArray(raw)) throw new RenderSpecError(field, `${field} must be a list.`);
  if (raw.length > max) throw new RenderSpecError(field, `${field} can hold at most ${max} items.`);
  return raw;
}

function num(raw: unknown, field: string, min: number, max: number, fallback?: number): number {
  const value = typeof raw === 'number' && Number.isFinite(raw) ? raw : fallback;
  if (value === undefined) throw new RenderSpecError(field, `${field} must be a number.`);
  return Math.min(max, Math.max(min, value));
}

function id(raw: unknown, field: string): string {
  if (typeof raw !== 'string' || !ID.test(raw)) throw new RenderSpecError(field, `${field} is not a valid id.`);
  return raw;
}

function oneOf<T extends string>(raw: unknown, allowed: readonly T[], fallback: T): T {
  return typeof raw === 'string' && (allowed as readonly string[]).includes(raw) ? (raw as T) : fallback;
}

function color(raw: unknown, fallback: string): string {
  return typeof raw === 'string' && COLOR.test(raw) ? raw.toLowerCase() : fallback;
}

/** Rounds to the millisecond so what is stored and compared is stable. */
const ms = (value: number) => Math.round(value * 1000) / 1000;

/**
 * Where an editor-rasterised PNG for this render must live: inside the owner's
 * own project folder, under this render's request id. Anything else is refused,
 * so a spec can never point the renderer at another member's files.
 */
export function layerPrefix(uid: string, projectId: string, requestId: string): string {
  return `video-projects/${uid}/${projectId}/layers/${requestId}/`;
}

function layerPath(raw: unknown, field: string, prefix: string): string {
  if (typeof raw !== 'string' || !raw.startsWith(prefix) || raw.includes('..') || !/\.png$/i.test(raw) || raw.length > 400) {
    throw new RenderSpecError(field, `${field} must be a PNG uploaded for this render.`);
  }
  return raw;
}

function parseScene(raw: unknown, index: number, prefix: string): SceneSpec {
  const field = `scenes[${index}]`;
  const s = obj(raw, field);
  const src = obj(s.source, `${field}.source`);
  let source: SceneSource;
  switch (src.kind) {
    case 'video':
    case 'image':
      source = { kind: src.kind, mediaId: id(src.mediaId, `${field}.source.mediaId`) };
      break;
    case 'card':
      source = { kind: 'card', layerPath: layerPath(src.layerPath, `${field}.source.layerPath`, prefix) };
      break;
    case 'color':
      source = { kind: 'color', color: color(src.color, '#000000') };
      break;
    default:
      throw new RenderSpecError(`${field}.source.kind`, `${field} has an unknown source.`);
  }
  const transition = s.transitionIn && typeof s.transitionIn === 'object' ? (s.transitionIn as Json) : {};
  const rotation = num(s.rotation, `${field}.rotation`, 0, 270, 0);
  return {
    id: id(s.id, `${field}.id`),
    source,
    duration: ms(num(s.duration, `${field}.duration`, MIN_SCENE_SEC, MAX_SCENE_SEC)),
    sourceIn: ms(num(s.sourceIn, `${field}.sourceIn`, 0, 36_000, 0)),
    speed: num(s.speed, `${field}.speed`, 0.25, 3, 1),
    fit: oneOf(s.fit, SCENE_FITS, 'cover'),
    focusX: num(s.focusX, `${field}.focusX`, 0, 1, 0.5),
    focusY: num(s.focusY, `${field}.focusY`, 0, 1, 0.5),
    rotation: ([0, 90, 180, 270] as const).find((r) => r === Math.round(rotation / 90) * 90) ?? 0,
    flipX: s.flipX === true,
    look: oneOf(s.look, SCENE_LOOKS, 'none'),
    kenBurns: s.kenBurns === true && source.kind === 'image',
    volume: source.kind === 'video' ? num(s.volume, `${field}.volume`, 0, 2, 1) : 0,
    duckMusic: s.duckMusic === true,
    transitionIn: {
      type: index === 0 ? 'cut' : oneOf(transition.type, TRANSITIONS, 'cut'),
      duration: index === 0 ? 0 : ms(num(transition.duration, `${field}.transitionIn.duration`, 0, MAX_TRANSITION_SEC, 0.5)),
    },
  };
}

function parseLayer(raw: unknown, index: number, prefix: string, total: number): LayerSpec {
  const field = `layers[${index}]`;
  const l = obj(raw, field);
  const start = ms(num(l.start, `${field}.start`, 0, total));
  const end = ms(num(l.end, `${field}.end`, 0, total));
  if (end - start < 0.1) throw new RenderSpecError(field, `${field} must be on screen for at least a tenth of a second.`);
  const common = {
    id: id(l.id, `${field}.id`),
    start,
    end,
    enter: oneOf(l.enter, ENTRANCES, 'none'),
    exit: oneOf(l.exit, EXITS, 'none'),
    z: Math.round(num(l.z, `${field}.z`, -10_000, 10_000, index)),
  };
  if (l.type === 'image') {
    return {
      type: 'image',
      ...common,
      layerPath: layerPath(l.layerPath, `${field}.layerPath`, prefix),
      x: Math.round(num(l.x, `${field}.x`, -4000, 4000)),
      y: Math.round(num(l.y, `${field}.y`, -4000, 4000)),
      width: Math.round(num(l.width, `${field}.width`, 1, 4000)),
      height: Math.round(num(l.height, `${field}.height`, 1, 4000)),
    };
  }
  if (l.type === 'sticker') {
    return {
      type: 'sticker',
      ...common,
      stickerId: id(l.stickerId, `${field}.stickerId`),
      cx: num(l.cx, `${field}.cx`, -0.5, 1.5),
      cy: num(l.cy, `${field}.cy`, -0.5, 1.5),
      size: num(l.size, `${field}.size`, 0.03, 1.5),
      rotation: num(l.rotation, `${field}.rotation`, -360, 360, 0),
      flipX: l.flipX === true,
      opacity: num(l.opacity, `${field}.opacity`, 0.05, 1, 1),
    };
  }
  throw new RenderSpecError(`${field}.type`, `${field} must be an image or a sticker.`);
}

function parseClip(raw: unknown, field: string, total: number): Omit<VoiceClipSpec, 'mediaId' | 'id'> & { id: string } {
  const c = obj(raw, field);
  const start = ms(num(c.start, `${field}.start`, 0, total));
  const duration = ms(num(c.duration, `${field}.duration`, 0.1, MAX_DURATION_SEC));
  return {
    id: id(c.id, `${field}.id`),
    start,
    sourceIn: ms(num(c.sourceIn, `${field}.sourceIn`, 0, 36_000, 0)),
    duration: ms(Math.min(duration, total - start)),
    volume: num(c.volume, `${field}.volume`, 0, 2, 1),
    fadeIn: ms(num(c.fadeIn, `${field}.fadeIn`, 0, 10, 0)),
    fadeOut: ms(num(c.fadeOut, `${field}.fadeOut`, 0, 10, 0)),
  };
}

/** Where each scene starts on the timeline, and the total length. */
export function sceneTimes(scenes: readonly Pick<SceneSpec, 'duration'>[]): { starts: number[]; total: number } {
  const starts: number[] = [];
  let at = 0;
  for (const scene of scenes) {
    starts.push(ms(at));
    at += scene.duration;
  }
  return { starts, total: ms(at) };
}

/**
 * Parses and clamps an untrusted spec. Throws [RenderSpecError] naming the
 * first field that cannot be made sense of.
 */
export function parseRenderSpec(raw: unknown, context: { uid: string; projectId: string; requestId: string }): RenderSpec {
  const root = obj(raw, 'spec');
  if (root.version !== 1) throw new RenderSpecError('version', 'This render spec version is not supported.');
  const prefix = layerPrefix(context.uid, context.projectId, context.requestId);
  const scenes = arr(root.scenes, 'scenes', MAX_SCENES).map((s, i) => parseScene(s, i, prefix));
  if (scenes.length === 0) throw new RenderSpecError('scenes', 'Add at least one scene before rendering.');
  const seen = new Set<string>();
  for (const scene of scenes) {
    if (seen.has(scene.id)) throw new RenderSpecError('scenes', 'Two scenes share one id.');
    seen.add(scene.id);
  }
  // A transition borrows half its length from each side, so it can never be
  // longer than the shorter of the two scenes it joins.
  for (let i = 1; i < scenes.length; i += 1) {
    const t = scenes[i]!.transitionIn;
    const room = Math.min(scenes[i - 1]!.duration, scenes[i]!.duration);
    if (t.type === 'cut') t.duration = 0;
    else t.duration = ms(Math.min(t.duration, room * 0.9));
    if (t.duration < 0.1) t.type = 'cut';
  }
  const { total } = sceneTimes(scenes);
  if (total > MAX_DURATION_SEC) {
    throw new RenderSpecError('scenes', `Videos can be up to ${MAX_DURATION_SEC / 60} minutes long; this one is ${Math.ceil(total)} seconds.`);
  }
  const layers = arr(root.layers, 'layers', MAX_LAYERS).map((l, i) => parseLayer(l, i, prefix, total));
  const captionTrack = arr(root.captionTrack, 'captionTrack', MAX_CAPTION_FRAMES).map((raw, i) => {
    const f = obj(raw, `captionTrack[${i}]`);
    const start = ms(num(f.start, `captionTrack[${i}].start`, 0, total));
    const end = ms(num(f.end, `captionTrack[${i}].end`, 0, total));
    return { layerPath: layerPath(f.layerPath, `captionTrack[${i}].layerPath`, prefix), start, end };
  }).filter((f) => f.end - f.start >= 1 / FPS).sort((a, b) => a.start - b.start);
  // Caption frames are shown back to back; an overlap would mean two cues on
  // screen at once, which the track cannot draw. The later one wins.
  for (let i = 0; i < captionTrack.length - 1; i += 1) {
    if (captionTrack[i]!.end > captionTrack[i + 1]!.start) captionTrack[i]!.end = captionTrack[i + 1]!.start;
  }
  const audio = root.audio && typeof root.audio === 'object' ? (root.audio as Json) : {};
  const voice = arr(audio.voice, 'audio.voice', MAX_VOICE_CLIPS).map((raw, i) => ({
    ...parseClip(raw, `audio.voice[${i}]`, total),
    mediaId: id((raw as Json).mediaId, `audio.voice[${i}].mediaId`),
  })).filter((c) => c.duration >= 0.1);
  const music = arr(audio.music, 'audio.music', MAX_MUSIC_CLIPS).map((raw, i) => ({
    ...parseClip(raw, `audio.music[${i}]`, total),
    trackId: id((raw as Json).trackId, `audio.music[${i}].trackId`),
  })).filter((c) => c.duration >= 0.1);
  return {
    version: 1,
    aspect: oneOf(root.aspect, VIDEO_ASPECTS, '9:16'),
    background: color(root.background, '#000000'),
    scenes,
    layers: layers.filter((l) => l.end - l.start >= 0.1).sort((a, b) => a.z - b.z),
    captionTrack: captionTrack.filter((f) => f.end - f.start >= 1 / FPS),
    audio: {
      sourceLevel: num(audio.sourceLevel, 'audio.sourceLevel', 0, 2, 1),
      voiceLevel: num(audio.voiceLevel, 'audio.voiceLevel', 0, 2, 1),
      musicLevel: num(audio.musicLevel, 'audio.musicLevel', 0, 2, 0.8),
      duckTo: num(audio.duckTo, 'audio.duckTo', 0, 1, 0.35),
      voice,
      music,
    },
  };
}

export function parseRenderSettings(raw: unknown, aspect: VideoAspect): RenderSettings {
  const s = raw && typeof raw === 'object' ? (raw as Json) : {};
  return {
    aspect,
    resolution: oneOf(s.resolution, RENDER_RESOLUTIONS, '1080p'),
    quality: oneOf(s.quality, RENDER_QUALITIES, 'standard'),
  };
}

/**
 * The output frame for an aspect and resolution. Draft previews render at 540
 * on the short side whatever was chosen: they exist to be checked quickly.
 * Dimensions are always even, which H.264 in yuv420p requires.
 */
export function frameSize(settings: RenderSettings): { width: number; height: number } {
  const short = settings.quality === 'draft' ? 540 : settings.resolution === '720p' ? 720 : 1080;
  const long = Math.round((short * 16) / 9 / 2) * 2;
  if (settings.aspect === '9:16') return { width: short, height: long };
  if (settings.aspect === '16:9') return { width: long, height: short };
  return { width: short, height: short };
}

/** Every media id, track id and sticker id the spec refers to, for the worker to resolve. */
export function referencedIds(spec: RenderSpec): { mediaIds: string[]; trackIds: string[]; stickerIds: string[] } {
  const media = new Set<string>();
  for (const scene of spec.scenes) if (scene.source.kind === 'video' || scene.source.kind === 'image') media.add(scene.source.mediaId);
  for (const clip of spec.audio.voice) media.add(clip.mediaId);
  return {
    mediaIds: [...media],
    trackIds: [...new Set(spec.audio.music.map((c) => c.trackId))],
    stickerIds: [...new Set(spec.layers.filter((l): l is StickerLayerSpec => l.type === 'sticker').map((l) => l.stickerId))],
  };
}

/** Every editor-rasterised PNG the spec refers to. */
export function referencedLayerPaths(spec: RenderSpec): string[] {
  const paths = new Set<string>();
  for (const scene of spec.scenes) if (scene.source.kind === 'card') paths.add(scene.source.layerPath);
  for (const layer of spec.layers) if (layer.type === 'image') paths.add(layer.layerPath);
  for (const frame of spec.captionTrack) paths.add(frame.layerPath);
  return [...paths];
}
