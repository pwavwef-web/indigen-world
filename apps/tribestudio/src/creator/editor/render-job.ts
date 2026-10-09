import { effectiveTransition, round, sceneTimes, type Aspect, type EditorProject } from './model';
import { canvasToPng, captionFrames, rasterizeCaption, rasterizeCard, rasterizeText } from './raster';

/**
 * Builds what an export sends: the render spec the renderer validates
 * (`services/functions/src/video-editor/render-spec.ts`), and the PNGs it
 * refers to, drawn now at the exact size of the output frame.
 */

export type Resolution = '720p' | '1080p';
export type Quality = 'draft' | 'standard' | 'high';

export interface RenderSettings {
  aspect: Aspect;
  resolution: Resolution;
  quality: Quality;
}

/** The renderer's frame sizes, repeated here so text is drawn at the size it is shown. */
export function frameSize(settings: RenderSettings): { width: number; height: number } {
  const short = settings.quality === 'draft' ? 540 : settings.resolution === '720p' ? 720 : 1080;
  const long = Math.round((short * 16) / 9 / 2) * 2;
  if (settings.aspect === '9:16') return { width: short, height: long };
  if (settings.aspect === '16:9') return { width: long, height: short };
  return { width: short, height: short };
}

export interface LayerUpload {
  path: string;
  blob: Blob;
}

export interface RenderJob {
  spec: Record<string, unknown>;
  uploads: LayerUpload[];
}

export function layerFolder(uid: string, projectId: string, requestId: string): string {
  return `video-projects/${uid}/${projectId}/layers/${requestId}/`;
}

/**
 * Everything is drawn in this function, frame by frame, so an export of a
 * vertical project to landscape re-lays its text for the landscape frame
 * rather than stretching the vertical drawing.
 */
export async function buildRenderJob(project: EditorProject, settings: RenderSettings, ids: { uid: string; projectId: string; requestId: string }): Promise<RenderJob> {
  const { width: W, height: H } = frameSize(settings);
  const folder = layerFolder(ids.uid, ids.projectId, ids.requestId);
  const uploads: LayerUpload[] = [];
  const { scenes, texts, stickers, captions, voice, music, mix, background } = project.timeline;
  const total = sceneTimes(scenes).total;
  if (typeof document !== 'undefined' && 'fonts' in document) await document.fonts.ready;

  const specScenes = [];
  for (let i = 0; i < scenes.length; i += 1) {
    const s = scenes[i]!;
    let source: Record<string, unknown>;
    if (!s.media) throw new Error(`Scene ${i + 1} has no picture yet.`);
    if (s.media.kind === 'card') {
      const path = `${folder}card-${s.id}.png`;
      uploads.push({ path, blob: await canvasToPng(rasterizeCard(s.media.card, W, H)) });
      source = { kind: 'card', layerPath: path };
    } else if (s.media.kind === 'color') {
      source = { kind: 'color', color: s.media.color };
    } else {
      source = { kind: s.media.kind, mediaId: s.media.mediaId };
    }
    specScenes.push({
      id: s.id,
      source,
      duration: s.duration,
      sourceIn: s.sourceIn,
      speed: s.speed,
      fit: s.fit,
      focusX: s.focusX,
      focusY: s.focusY,
      rotation: s.rotation,
      flipX: s.flipX,
      look: s.look,
      kenBurns: s.kenBurns && s.media.kind === 'image',
      volume: s.volume,
      duckMusic: s.duckMusic,
      transitionIn: effectiveTransition(scenes, i),
    });
  }

  const layers: Record<string, unknown>[] = [];
  for (const t of texts) {
    if (t.start >= total || !t.text.trim()) continue;
    const drawn = rasterizeText(t, W, H);
    const path = `${folder}text-${t.id}.png`;
    uploads.push({ path, blob: await canvasToPng(drawn.canvas) });
    layers.push({ type: 'image', id: t.id, layerPath: path, x: drawn.x, y: drawn.y, width: drawn.canvas.width, height: drawn.canvas.height, start: t.start, end: Math.min(t.end, total), enter: t.enter, exit: t.exit, z: t.z });
  }
  for (const s of stickers) {
    if (s.start >= total) continue;
    layers.push({ type: 'sticker', id: s.id, stickerId: s.stickerId, cx: s.cx, cy: s.cy, size: s.size, rotation: s.rotation, flipX: s.flipX, opacity: s.opacity, start: s.start, end: Math.min(s.end, total), enter: s.enter, exit: s.exit, z: s.z });
  }

  const captionTrack: Record<string, unknown>[] = [];
  let n = 0;
  for (const frame of captionFrames(captions)) {
    if (frame.start >= total) continue;
    const path = `${folder}caption-${String(n).padStart(4, '0')}.png`;
    n += 1;
    uploads.push({ path, blob: await canvasToPng(rasterizeCaption(captions, frame, W, H)) });
    captionTrack.push({ layerPath: path, start: round(frame.start), end: round(Math.min(frame.end, total)) });
  }

  return {
    uploads,
    spec: {
      version: 1,
      aspect: settings.aspect,
      background,
      scenes: specScenes,
      layers,
      captionTrack,
      audio: {
        sourceLevel: mix.sourceLevel,
        voiceLevel: mix.voiceLevel,
        musicLevel: mix.musicLevel,
        duckTo: mix.duckTo,
        voice: voice.filter((v) => v.start < total).map((v) => ({ id: v.id, mediaId: v.mediaId, start: v.start, sourceIn: v.sourceIn, duration: v.duration, volume: v.volume, fadeIn: v.fadeIn, fadeOut: v.fadeOut })),
        music: music.filter((m) => m.start < total).map((m) => ({ id: m.id, trackId: m.trackId, start: m.start, sourceIn: m.sourceIn, duration: m.duration, volume: m.volume, fadeIn: m.fadeIn, fadeOut: m.fadeOut })),
      },
    },
  };
}
