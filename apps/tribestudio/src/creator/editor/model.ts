/**
 * The video editor's project model, and every edit made to it.
 *
 * Pure: no React, no Firebase. Each operation takes a project and returns a new
 * one, which is what makes undo a stack of snapshots and autosave a single
 * write of whatever the latest snapshot is.
 *
 * ── The timeline ─────────────────────────────────────────────────────────────
 * Scenes are a magnetic main track: in order, back to back, each starting where
 * the previous one ends. Splitting, trimming, extending, duplicating, removing
 * and reordering a scene therefore never leaves a gap. A transition sits on the
 * cut, half on each side, and moves nothing. Text, stickers, captions, voice
 * and music are placed at absolute times over that track. This is the model
 * the renderer draws (`services/functions/src/video-editor/render-spec.ts`).
 */

export type Aspect = '9:16' | '1:1' | '16:9';
export type SceneFit = 'cover' | 'contain' | 'blur';
export type Look = 'none' | 'vivid' | 'warm' | 'cool' | 'mono' | 'dusk';
export type TransitionType = 'cut' | 'fade' | 'flash' | 'slide' | 'wipe';
export type Entrance = 'none' | 'fade' | 'pop' | 'rise';
export type Exit = 'none' | 'fade' | 'pop' | 'sink';
export type CaptionStyle = 'subtitle' | 'bold' | 'karaoke' | 'minimal';
export type ProjectOrigin = 'blank' | 'prompt' | 'script' | 'footage' | 'audio' | 'ai-video';

export const ASPECTS: { id: Aspect; label: string; hint: string }[] = [
  { id: '9:16', label: 'Vertical', hint: 'Reels, TikTok, Shorts' },
  { id: '1:1', label: 'Square', hint: 'Feed posts' },
  { id: '16:9', label: 'Landscape', hint: 'YouTube, websites' },
];

export const MIN_SCENE = 0.5;
export const MAX_SCENE = 120;
export const MAX_TOTAL = 300;

export interface ProjectMedia {
  id: string;
  kind: 'video' | 'image' | 'audio';
  storagePath: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  durationSec: number;
  width: number | null;
  height: number | null;
  hasAudio: boolean;
  source: 'upload' | 'ai' | 'recording';
  jobId?: string | null;
  status: 'uploading' | 'ready' | 'failed';
}

export interface CardSpec {
  style: 'title' | 'end';
  heading: string;
  subheading: string;
  background: string;
  accent: string;
  textColor: string;
}

export type SceneMedia =
  | { kind: 'video'; mediaId: string }
  | { kind: 'image'; mediaId: string }
  | { kind: 'color'; color: string }
  | { kind: 'card'; card: CardSpec };

export interface SceneGeneration {
  jobId: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed';
  prompt: string;
  error: string | null;
  attempt: number;
  estimateUsd: number | null;
}

export interface Scene {
  id: string;
  title: string;
  duration: number;
  /** Null while a planned scene is waiting for its picture. */
  media: SceneMedia | null;
  sourceIn: number;
  speed: number;
  fit: SceneFit;
  focusX: number;
  focusY: number;
  rotation: 0 | 90 | 180 | 270;
  flipX: boolean;
  look: Look;
  kenBurns: boolean;
  volume: number;
  duckMusic: boolean;
  transitionIn: { type: TransitionType; duration: number };
  plan: { visual: string; narration: string; caption: string };
  /** Continuity elements this scene shows, by id. */
  elements: string[];
  generation: SceneGeneration | null;
}

export interface TextOverlay {
  id: string;
  text: string;
  start: number;
  end: number;
  /** Centre, as a fraction of the frame. */
  x: number;
  y: number;
  /** Font size as a fraction of the frame's short side. */
  size: number;
  color: string;
  weight: 600 | 800;
  box: 'none' | 'box' | 'pill';
  boxColor: string;
  enter: Entrance;
  exit: Exit;
  z: number;
}

export interface StickerPlacement {
  id: string;
  stickerId: string;
  cx: number;
  cy: number;
  /** Longest side as a fraction of the frame's short side. */
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

export interface CaptionWord {
  text: string;
  start: number;
  end: number;
}

export interface CaptionCue {
  id: string;
  start: number;
  end: number;
  text: string;
  words: CaptionWord[] | null;
}

export interface CaptionTrack {
  style: CaptionStyle;
  position: 'bottom' | 'middle' | 'top';
  /** Text size as a fraction of the frame's short side. */
  size: number;
  color: string;
  highlight: string;
  language: string;
  cues: CaptionCue[];
  /** How the current timing was produced, shown next to the cue list. */
  method: 'manual' | 'speech-timing' | 'transcript' | 'scene-plan' | null;
}

export interface AudioClip {
  id: string;
  start: number;
  sourceIn: number;
  duration: number;
  volume: number;
  fadeIn: number;
  fadeOut: number;
}

export interface VoiceClip extends AudioClip {
  mediaId: string;
  label: string;
}

export interface MusicClip extends AudioClip {
  trackId: string;
  title: string;
}

export interface Mix {
  sourceLevel: number;
  voiceLevel: number;
  musicLevel: number;
  /** Music gain under speech, 0–1; 1 is no ducking. */
  duckTo: number;
}

export interface ContinuityElement {
  id: string;
  name: string;
  kind: 'character' | 'location' | 'object' | 'brand';
  description: string;
  /**
   * A picture of it, uploaded where the Studio's video callable accepts
   * reference images (`creator-submissions/{uid}/studio-video/…`), handed to
   * the model so a face, a place or a logo comes back the same in every scene.
   */
  referencePath: string | null;
}

export interface Timeline {
  background: string;
  scenes: Scene[];
  texts: TextOverlay[];
  stickers: StickerPlacement[];
  captions: CaptionTrack;
  voice: VoiceClip[];
  music: MusicClip[];
  mix: Mix;
}

export interface EditorProject {
  title: string;
  aspect: Aspect;
  origin: ProjectOrigin;
  timeline: Timeline;
  continuity: ContinuityElement[];
}

// ── Construction ─────────────────────────────────────────────────────────────

export function newId(prefix: string): string {
  const random = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID().replace(/-/g, '').slice(0, 12)
    : Math.random().toString(36).slice(2, 14);
  return `${prefix}_${random}`;
}

export const round = (v: number, places = 3) => Math.round(v * 10 ** places) / 10 ** places;
export const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

export function emptyTimeline(): Timeline {
  return {
    background: '#0b0f19',
    scenes: [],
    texts: [],
    stickers: [],
    captions: { style: 'subtitle', position: 'bottom', size: 0.05, color: '#ffffff', highlight: '#f4c430', language: 'en', cues: [], method: null },
    voice: [],
    music: [],
    mix: { sourceLevel: 1, voiceLevel: 1, musicLevel: 0.8, duckTo: 0.35 },
  };
}

export function newProject(title: string, aspect: Aspect, origin: ProjectOrigin): EditorProject {
  return { title: title.trim().slice(0, 120) || 'Untitled video', aspect, origin, timeline: emptyTimeline(), continuity: [] };
}

export function newScene(media: SceneMedia | null, duration: number, extra: Partial<Scene> = {}): Scene {
  return {
    id: newId('scene'),
    title: '',
    duration: round(clamp(duration, MIN_SCENE, MAX_SCENE)),
    media,
    sourceIn: 0,
    speed: 1,
    fit: 'cover',
    focusX: 0.5,
    focusY: 0.5,
    rotation: 0,
    flipX: false,
    look: 'none',
    kenBurns: media?.kind === 'image',
    volume: 1,
    duckMusic: false,
    transitionIn: { type: 'cut', duration: 0 },
    plan: { visual: '', narration: '', caption: '' },
    elements: [],
    generation: null,
    ...extra,
  };
}

export function titleCard(heading: string, style: CardSpec['style'] = 'title'): SceneMedia {
  return {
    kind: 'card',
    card: {
      style,
      heading,
      subheading: '',
      background: style === 'title' ? '#2d2a6e' : '#101018',
      accent: '#f4c430',
      textColor: '#ffffff',
    },
  };
}

/**
 * Brings a stored document back to the current shape, filling anything a
 * project saved by an earlier editor did not have. Unknown values fall back to
 * defaults rather than failing: a project must always open.
 */
export function normaliseProject(raw: Record<string, unknown>): EditorProject {
  const base = emptyTimeline();
  const timeline = (raw.timeline && typeof raw.timeline === 'object' ? raw.timeline : {}) as Partial<Timeline>;
  const aspect = (['9:16', '1:1', '16:9'] as Aspect[]).includes(raw.aspect as Aspect) ? (raw.aspect as Aspect) : '9:16';
  return {
    title: typeof raw.title === 'string' && raw.title.trim() ? raw.title : 'Untitled video',
    aspect,
    origin: (typeof raw.origin === 'string' ? raw.origin : 'blank') as ProjectOrigin,
    continuity: Array.isArray(raw.continuity) ? (raw.continuity as ContinuityElement[]) : [],
    timeline: {
      background: typeof timeline.background === 'string' ? timeline.background : base.background,
      scenes: Array.isArray(timeline.scenes) ? timeline.scenes.map((s) => ({ ...newScene(null, 3), ...s, plan: { ...newScene(null, 3).plan, ...(s.plan ?? {}) }, elements: Array.isArray(s.elements) ? s.elements : [] })) : [],
      texts: Array.isArray(timeline.texts) ? timeline.texts : [],
      stickers: Array.isArray(timeline.stickers) ? timeline.stickers : [],
      captions: { ...base.captions, ...(timeline.captions ?? {}), cues: Array.isArray(timeline.captions?.cues) ? timeline.captions!.cues : [] },
      voice: Array.isArray(timeline.voice) ? timeline.voice : [],
      music: Array.isArray(timeline.music) ? timeline.music : [],
      mix: { ...base.mix, ...(timeline.mix ?? {}) },
    },
  };
}

// ── Timeline arithmetic ──────────────────────────────────────────────────────

/** Where each scene starts, and the total length — the renderer's own sum. */
export function sceneTimes(scenes: readonly Pick<Scene, 'duration'>[]): { starts: number[]; total: number } {
  const starts: number[] = [];
  let at = 0;
  for (const scene of scenes) {
    starts.push(round(at));
    at += scene.duration;
  }
  return { starts, total: round(at) };
}

export function totalDuration(project: EditorProject): number {
  return sceneTimes(project.timeline.scenes).total;
}

/** The scene on screen at [t], and its start. */
export function sceneAt(scenes: readonly Scene[], t: number): { index: number; start: number } | null {
  const { starts } = sceneTimes(scenes);
  for (let i = scenes.length - 1; i >= 0; i -= 1) {
    if (t >= starts[i]! - 1e-6) return { index: i, start: starts[i]! };
  }
  return scenes.length ? { index: 0, start: 0 } : null;
}

/**
 * The transition a scene actually gets: none on the first scene, and never
 * longer than 90% of the shorter of the two scenes it joins — the same clamp
 * the renderer applies, so the preview never shows a transition the export
 * will not have.
 */
export function effectiveTransition(scenes: readonly Scene[], index: number): { type: TransitionType; duration: number } {
  if (index <= 0 || index >= scenes.length) return { type: 'cut', duration: 0 };
  const t = scenes[index]!.transitionIn;
  if (t.type === 'cut') return { type: 'cut', duration: 0 };
  const room = Math.min(scenes[index - 1]!.duration, scenes[index]!.duration) * 0.9;
  const duration = round(Math.min(t.duration, room, 1.5));
  return duration < 0.1 ? { type: 'cut', duration: 0 } : { type: t.type, duration };
}

// ── Scene edits ──────────────────────────────────────────────────────────────

type Edit = (project: EditorProject) => EditorProject;

const withScenes = (project: EditorProject, scenes: Scene[]): EditorProject => ({ ...project, timeline: { ...project.timeline, scenes } });

export function patchScene(id: string, patch: Partial<Scene>): Edit {
  return (p) => withScenes(p, p.timeline.scenes.map((s) => (s.id === id ? { ...s, ...patch } : s)));
}

export function addScenes(scenes: Scene[], at?: number): Edit {
  return (p) => {
    const list = [...p.timeline.scenes];
    list.splice(at ?? list.length, 0, ...scenes);
    return withScenes(p, list);
  };
}

export function removeScene(id: string): Edit {
  return (p) => withScenes(p, p.timeline.scenes.filter((s) => s.id !== id));
}

export function duplicateScene(id: string): Edit {
  return (p) => {
    const i = p.timeline.scenes.findIndex((s) => s.id === id);
    if (i < 0) return p;
    const copy = { ...p.timeline.scenes[i]!, id: newId('scene'), generation: null };
    const list = [...p.timeline.scenes];
    list.splice(i + 1, 0, copy);
    return withScenes(p, list);
  };
}

export function moveScene(id: string, to: number): Edit {
  return (p) => {
    const list = [...p.timeline.scenes];
    const from = list.findIndex((s) => s.id === id);
    if (from < 0) return p;
    const [scene] = list.splice(from, 1);
    list.splice(clamp(to, 0, list.length), 0, scene!);
    return withScenes(p, list);
  };
}

/**
 * Splits the scene under [t] into two at [t]. The second half continues the
 * same source from where the first stopped, so playback is unchanged.
 */
export function splitSceneAt(t: number): Edit {
  return (p) => {
    const at = sceneAt(p.timeline.scenes, t);
    if (!at) return p;
    const scene = p.timeline.scenes[at.index]!;
    const local = t - at.start;
    if (local < MIN_SCENE || scene.duration - local < MIN_SCENE) return p;
    const first = { ...scene, duration: round(local) };
    const second: Scene = {
      ...scene,
      id: newId('scene'),
      duration: round(scene.duration - local),
      sourceIn: round(scene.sourceIn + local * scene.speed),
      transitionIn: { type: 'cut', duration: 0 },
      generation: null,
    };
    const list = [...p.timeline.scenes];
    list.splice(at.index, 1, first, second);
    return withScenes(p, list);
  };
}

/**
 * Changes how long a scene lasts. For a video this is a trim or an extension:
 * past the end of the file, the renderer holds the last frame.
 */
export function setSceneDuration(id: string, duration: number): Edit {
  return patchScene(id, { duration: round(clamp(duration, MIN_SCENE, MAX_SCENE)) });
}

/** Trims the start of a scene's source without moving anything else. */
export function trimSceneStart(id: string, sourceIn: number): Edit {
  return patchScene(id, { sourceIn: round(Math.max(0, sourceIn)) });
}

// ── Layer edits ──────────────────────────────────────────────────────────────

export function upsertText(text: TextOverlay): Edit {
  return (p) => {
    const exists = p.timeline.texts.some((t) => t.id === text.id);
    const texts = exists ? p.timeline.texts.map((t) => (t.id === text.id ? text : t)) : [...p.timeline.texts, text];
    return { ...p, timeline: { ...p.timeline, texts } };
  };
}

export function upsertSticker(sticker: StickerPlacement): Edit {
  return (p) => {
    const exists = p.timeline.stickers.some((s) => s.id === sticker.id);
    const stickers = exists ? p.timeline.stickers.map((s) => (s.id === sticker.id ? sticker : s)) : [...p.timeline.stickers, sticker];
    return { ...p, timeline: { ...p.timeline, stickers } };
  };
}

export function removeLayer(id: string): Edit {
  return (p) => ({
    ...p,
    timeline: {
      ...p.timeline,
      texts: p.timeline.texts.filter((t) => t.id !== id),
      stickers: p.timeline.stickers.filter((s) => s.id !== id),
      voice: p.timeline.voice.filter((v) => v.id !== id),
      music: p.timeline.music.filter((m) => m.id !== id),
      captions: { ...p.timeline.captions, cues: p.timeline.captions.cues.filter((c) => c.id !== id) },
    },
  });
}

/** The next z above every text and sticker, so a new layer lands on top. */
export function topZ(project: EditorProject): number {
  return Math.max(0, ...project.timeline.texts.map((t) => t.z), ...project.timeline.stickers.map((s) => s.z)) + 1;
}

/** Moves a text or sticker one step up or down among the other layers. */
export function restack(id: string, direction: 1 | -1): Edit {
  return (p) => {
    const layers = [
      ...p.timeline.texts.map((t) => ({ id: t.id, z: t.z })),
      ...p.timeline.stickers.map((s) => ({ id: s.id, z: s.z })),
    ].sort((a, b) => a.z - b.z);
    const i = layers.findIndex((l) => l.id === id);
    const j = i + direction;
    if (i < 0 || j < 0 || j >= layers.length) return p;
    [layers[i], layers[j]] = [layers[j]!, layers[i]!];
    const z = new Map(layers.map((l, k) => [l.id, k + 1]));
    return {
      ...p,
      timeline: {
        ...p.timeline,
        texts: p.timeline.texts.map((t) => ({ ...t, z: z.get(t.id) ?? t.z })),
        stickers: p.timeline.stickers.map((s) => ({ ...s, z: z.get(s.id) ?? s.z })),
      },
    };
  };
}

export function newSticker(stickerId: string, start: number, end: number, z: number): StickerPlacement {
  return { id: newId('sticker'), stickerId, cx: 0.5, cy: 0.42, size: 0.3, rotation: 0, flipX: false, opacity: 1, start: round(start), end: round(end), enter: 'pop', exit: 'fade', z };
}

export function newText(text: string, start: number, end: number, z: number, extra: Partial<TextOverlay> = {}): TextOverlay {
  return { id: newId('text'), text, start: round(start), end: round(end), x: 0.5, y: 0.18, size: 0.07, color: '#ffffff', weight: 800, box: 'none', boxColor: '#101018', enter: 'fade', exit: 'fade', z, ...extra };
}

// ── Captions ─────────────────────────────────────────────────────────────────

export function setCues(cues: Omit<CaptionCue, 'id'>[], method: CaptionTrack['method']): Edit {
  return (p) => ({
    ...p,
    timeline: {
      ...p.timeline,
      captions: {
        ...p.timeline.captions,
        method,
        cues: cues.map((c) => ({ id: newId('cue'), start: round(c.start), end: round(c.end), text: c.text, words: c.words ?? null })).sort((a, b) => a.start - b.start),
      },
    },
  });
}

export function patchCue(id: string, patch: Partial<CaptionCue>): Edit {
  return (p) => ({
    ...p,
    timeline: {
      ...p.timeline,
      captions: {
        ...p.timeline.captions,
        method: 'manual',
        cues: p.timeline.captions.cues
          .map((c) => (c.id === id ? { ...c, ...patch, words: patch.text !== undefined && patch.text !== c.text ? null : patch.words ?? c.words } : c))
          .sort((a, b) => a.start - b.start),
      },
    },
  });
}

/** Moves every cue by [delta] seconds, words and all. */
export function shiftCues(delta: number): Edit {
  return (p) => ({
    ...p,
    timeline: {
      ...p.timeline,
      captions: {
        ...p.timeline.captions,
        cues: p.timeline.captions.cues.map((c) => ({
          ...c,
          start: round(Math.max(0, c.start + delta)),
          end: round(Math.max(0.1, c.end + delta)),
          words: c.words?.map((w) => ({ ...w, start: round(Math.max(0, w.start + delta)), end: round(Math.max(0, w.end + delta)) })) ?? null,
        })),
      },
    },
  });
}

/** Captions from each scene's planned narration, timed to its scene. */
export function cuesFromScenePlan(project: EditorProject): Omit<CaptionCue, 'id'>[] {
  const { starts } = sceneTimes(project.timeline.scenes);
  return project.timeline.scenes
    .map((s, i) => ({ start: starts[i]! + 0.15, end: starts[i]! + s.duration - 0.15, text: (s.plan.caption || s.plan.narration).trim(), words: null }))
    .filter((c) => c.text && c.end - c.start > 0.4);
}

// ── Audio ────────────────────────────────────────────────────────────────────

export function newMusicClip(trackId: string, title: string, trackSeconds: number, videoSeconds: number, start = 0): MusicClip {
  const room = Math.max(1, (videoSeconds || trackSeconds) - start);
  return { id: newId('music'), trackId, title, start: round(start), sourceIn: 0, duration: round(Math.min(trackSeconds, room)), volume: 1, fadeIn: 1, fadeOut: 2 };
}

export function patchMusic(id: string, patch: Partial<MusicClip>): Edit {
  return (p) => ({ ...p, timeline: { ...p.timeline, music: p.timeline.music.map((m) => (m.id === id ? { ...m, ...patch } : m)) } });
}

export function patchVoice(id: string, patch: Partial<VoiceClip>): Edit {
  return (p) => ({ ...p, timeline: { ...p.timeline, voice: p.timeline.voice.map((v) => (v.id === id ? { ...v, ...patch } : v)) } });
}

/** The music's gain at [t] from its own fades, before ducking. */
export function fadeGain(clip: AudioClip, t: number): number {
  const local = t - clip.start;
  if (local < 0 || local > clip.duration) return 0;
  let g = 1;
  if (clip.fadeIn > 0) g = Math.min(g, local / clip.fadeIn);
  if (clip.fadeOut > 0) g = Math.min(g, (clip.duration - local) / clip.fadeOut);
  return clamp(g, 0, 1);
}

/** Windows where someone is speaking: voice clips, and scenes marked as speech. */
export function speechWindows(project: EditorProject): [number, number][] {
  const { starts } = sceneTimes(project.timeline.scenes);
  return [
    ...project.timeline.voice.map((v) => [v.start, v.start + v.duration] as [number, number]),
    ...project.timeline.scenes.flatMap((s, i) => (s.duckMusic && s.media?.kind === 'video' ? [[starts[i]!, starts[i]! + s.duration] as [number, number]] : [])),
  ];
}

/** The ducking multiplier at [t]: the renderer's curve, 0.3-second ramps. */
export function duckGain(windows: [number, number][], duckTo: number, t: number, ramp = 0.3): number {
  let envelope = 0;
  for (const [s, e] of windows) {
    envelope = Math.max(envelope, clamp((t - (s - ramp)) / ramp, 0, 1) * clamp((e + ramp - t) / ramp, 0, 1));
  }
  return 1 - (1 - duckTo) * envelope;
}

// ── Checks before export ─────────────────────────────────────────────────────

export interface ExportProblem {
  level: 'block' | 'warn';
  message: string;
  sceneId?: string;
}

/** What stops an export, and what is worth a second look first. */
export function exportProblems(project: EditorProject, media: ReadonlyMap<string, ProjectMedia>): ExportProblem[] {
  const out: ExportProblem[] = [];
  const { scenes } = project.timeline;
  const total = totalDuration(project);
  if (scenes.length === 0) out.push({ level: 'block', message: 'Add at least one scene.' });
  if (total > MAX_TOTAL) out.push({ level: 'block', message: `Videos can be up to ${MAX_TOTAL / 60} minutes; this one is ${Math.ceil(total)} seconds. Shorten or remove scenes.` });
  scenes.forEach((s, i) => {
    const label = s.title || `Scene ${i + 1}`;
    if (!s.media) {
      out.push({ level: 'block', message: `${label} has no picture yet. Add a clip, an image, a colour or a card.`, sceneId: s.id });
      return;
    }
    if (s.media.kind === 'video' || s.media.kind === 'image') {
      const m = media.get(s.media.mediaId);
      if (!m) out.push({ level: 'block', message: `${label}'s media is missing from the project. Replace it.`, sceneId: s.id });
      else if (m.status === 'uploading') out.push({ level: 'block', message: `${label} is still uploading.`, sceneId: s.id });
      else if (m.status === 'failed') out.push({ level: 'block', message: `${label}'s upload failed. Replace it.`, sceneId: s.id });
      else if (s.media.kind === 'video' && m.durationSec > 0 && s.sourceIn + s.duration * s.speed > m.durationSec + 0.05) {
        out.push({ level: 'warn', message: `${label} runs past the end of its clip; the last frame will be held.`, sceneId: s.id });
      }
    }
    if (s.generation && (s.generation.status === 'queued' || s.generation.status === 'running')) {
      out.push({ level: 'warn', message: `${label}'s AI video is still being made; the export will use what is there now.`, sceneId: s.id });
    }
  });
  for (const v of project.timeline.voice) {
    const m = media.get(v.mediaId);
    if (!m || m.status !== 'ready') out.push({ level: 'block', message: `The recording “${v.label || 'voice'}” is missing or still uploading.` });
  }
  const layersPast = [...project.timeline.texts, ...project.timeline.stickers].filter((l) => l.start >= total);
  if (layersPast.length) out.push({ level: 'warn', message: `${layersPast.length} text or sticker layer${layersPast.length === 1 ? ' starts' : 's start'} after the video ends and will not appear.` });
  const cuesPast = project.timeline.captions.cues.filter((c) => c.start >= total).length;
  if (cuesPast) out.push({ level: 'warn', message: `${cuesPast} caption${cuesPast === 1 ? '' : 's'} fall after the video ends.` });
  return out;
}
