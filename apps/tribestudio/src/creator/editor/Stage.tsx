import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { MusicTrack, Sticker } from './api';
import { layerState, lookCss } from './looks';
import {
  clamp,
  duckGain,
  effectiveTransition,
  fadeGain,
  sceneTimes,
  speechWindows,
  upsertSticker,
  upsertText,
  type EditorProject,
  type ProjectMedia,
  type Scene,
  type StickerPlacement,
  type TextOverlay,
} from './model';
import { captionFrames, drawCaption, drawCard, drawTextOverlay, frameAt, layoutText } from './raster';
import type { Selection } from './useEditor';

/**
 * The preview: what the export will show at the playhead.
 *
 * Scenes are real <video> and <img> elements styled with the renderer's own
 * fit, look and motion; during a transition both scenes are on screen, mixed
 * the way the renderer's xfade mixes them. Text, stickers and captions are
 * drawn into one canvas in z order with the functions the export uses, so
 * what is on top here is on top in the file. The selected layer gets handles:
 * drag to move, the corner to resize, the knob to rotate.
 */

interface Props {
  project: EditorProject;
  media: ReadonlyMap<string, ProjectMedia>;
  urls: ReadonlyMap<string, string>;
  stickers: ReadonlyMap<string, Sticker>;
  tracks: ReadonlyMap<string, MusicTrack>;
  time: number;
  playing: boolean;
  selection: Selection;
  onSelect: (selection: Selection) => void;
  onCommit: (edit: (p: EditorProject) => EditorProject) => void;
  onEmptyClick: () => void;
}

interface Visible {
  scene: Scene;
  index: number;
  start: number;
  opacity: number;
  transform: string;
  clip: string | undefined;
  flash: number;
}

/** Which scenes are on screen at [t], and how each is mixed. */
export function visibleScenes(scenes: readonly Scene[], t: number): Visible[] {
  if (scenes.length === 0) return [];
  const { starts } = sceneTimes(scenes);
  let i = scenes.length - 1;
  while (i > 0 && t < starts[i]!) i -= 1;
  const base = (index: number): Visible => ({ scene: scenes[index]!, index, start: starts[index]!, opacity: 1, transform: '', clip: undefined, flash: 0 });
  // The join after the current scene, and the join into it.
  for (const join of [i + 1, i]) {
    if (join <= 0 || join >= scenes.length) continue;
    const tr = effectiveTransition(scenes, join);
    if (tr.type === 'cut') continue;
    const from = starts[join]! - tr.duration / 2;
    const p = (t - from) / tr.duration;
    if (p < 0 || p > 1) continue;
    const outgoing = base(join - 1);
    const incoming = base(join);
    if (tr.type === 'fade') incoming.opacity = p;
    if (tr.type === 'flash') {
      // fadewhite: towards white, then from white.
      outgoing.flash = p < 0.5 ? p * 2 : 0;
      incoming.opacity = p < 0.5 ? 0 : 1;
      incoming.flash = p < 0.5 ? 0 : (1 - p) * 2;
    }
    if (tr.type === 'slide') {
      outgoing.transform = `translateX(${-p * 100}%)`;
      incoming.transform = `translateX(${(1 - p) * 100}%)`;
    }
    if (tr.type === 'wipe') incoming.clip = `inset(0 0 0 ${(1 - p) * 100}%)`;
    return [outgoing, incoming];
  }
  return [base(i)];
}

function SceneView({ visible, media, url, time, playing, frame, background, volume }: {
  visible: Visible;
  volume: number;
  media: ProjectMedia | undefined;
  url: string | undefined;
  time: number;
  playing: boolean;
  frame: { width: number; height: number };
  background: string;
}) {
  const { scene, start } = visible;
  const videoRef = useRef<HTMLVideoElement>(null);
  const backRef = useRef<HTMLVideoElement>(null);
  const cardRef = useRef<HTMLCanvasElement>(null);
  const kind = scene.media?.kind;
  const local = time - start;
  const sourceTime = Math.max(0, scene.sourceIn + local * scene.speed);

  useEffect(() => {
    if (videoRef.current) videoRef.current.volume = clamp(volume, 0, 1);
    for (const el of [videoRef.current, backRef.current]) {
      if (!el) continue;
      const end = Number.isFinite(el.duration) ? el.duration - 0.05 : Infinity;
      const target = Math.min(sourceTime, end);
      el.playbackRate = scene.speed;
      if (!playing) {
        if (!el.paused) el.pause();
        if (Math.abs(el.currentTime - target) > 0.04) el.currentTime = target;
      } else {
        if (Math.abs(el.currentTime - target) > 0.3) el.currentTime = target;
        if (el.paused && sourceTime < end) void el.play().catch(() => undefined);
        if (sourceTime >= end && !el.paused) el.pause();
      }
    }
  }, [sourceTime, playing, scene.speed, volume]);

  useEffect(() => {
    if (kind !== 'card' || !cardRef.current || scene.media?.kind !== 'card') return;
    const canvas = cardRef.current;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(frame.width * ratio);
    canvas.height = Math.round(frame.height * ratio);
    drawCard(canvas.getContext('2d')!, scene.media.card, canvas.width, canvas.height);
  }, [kind, scene.media, frame.width, frame.height]);

  const orient = `${scene.rotation ? `rotate(${scene.rotation}deg) ` : ''}${scene.flipX ? 'scaleX(-1) ' : ''}`;
  const kenBurns = scene.kenBurns && kind === 'image' ? ` scale(${1 + 0.08 * clamp(local / scene.duration, 0, 1)})` : '';
  const filter = lookCss(scene.look);
  const layer = {
    opacity: visible.opacity,
    transform: visible.transform || undefined,
    clipPath: visible.clip,
  };
  const fitStyle = (fit: 'cover' | 'contain') => ({
    objectFit: fit,
    objectPosition: `${scene.focusX * 100}% ${scene.focusY * 100}%`,
    filter: filter === 'none' ? undefined : filter,
    transform: `${orient}${kenBurns}` || undefined,
  });

  let body;
  if (!scene.media) {
    body = (
      <div className="vx-scene-placeholder">
        <strong>{scene.title || `Scene ${visible.index + 1}`}</strong>
        <span>{scene.generation?.status === 'queued' || scene.generation?.status === 'running' ? 'The AI video is being made…' : 'Waiting for a picture'}</span>
        {scene.plan.visual ? <small>{scene.plan.visual}</small> : null}
      </div>
    );
  } else if (kind === 'color' && scene.media.kind === 'color') {
    body = <div className="vx-fill" style={{ background: scene.media.color }} />;
  } else if (kind === 'card') {
    body = <canvas ref={cardRef} className="vx-fill" />;
  } else if (!url) {
    body = <div className="vx-scene-placeholder"><span>{media?.status === 'uploading' ? 'Uploading…' : 'Loading…'}</span></div>;
  } else if (kind === 'image') {
    body = (
      <>
        {scene.fit === 'blur' ? <img className="vx-fill vx-blur" src={url} alt="" draggable={false} style={fitStyle('cover')} /> : null}
        <img className="vx-fill" src={url} alt="" draggable={false} style={fitStyle(scene.fit === 'cover' ? 'cover' : 'contain')} />
      </>
    );
  } else {
    body = (
      <>
        {scene.fit === 'blur' ? <video ref={backRef} className="vx-fill vx-blur" src={url} muted playsInline preload="auto" style={fitStyle('cover')} /> : null}
        <video ref={videoRef} className="vx-fill" src={url} playsInline preload="auto" muted={scene.volume <= 0} style={fitStyle(scene.fit === 'cover' ? 'cover' : 'contain')} />
      </>
    );
  }
  return (
    <div className="vx-scene" style={{ ...layer, background }}>
      {body}
      {visible.flash > 0 ? <div className="vx-fill" style={{ background: '#fff', opacity: visible.flash }} /> : null}
    </div>
  );
}

/** Hidden players for music and voice, kept in step with the clock. */
function AudioLayer({ project, tracks, urls, time, playing }: { project: EditorProject; tracks: ReadonlyMap<string, MusicTrack>; urls: ReadonlyMap<string, string>; time: number; playing: boolean }) {
  const refs = useRef(new Map<string, HTMLAudioElement>());
  const windows = useMemo(() => speechWindows(project), [project]);
  const { mix } = project.timeline;
  const clips = [
    ...project.timeline.music.map((m) => ({ clip: m, url: tracks.get(m.trackId)?.url, level: mix.musicLevel, duck: true })),
    ...project.timeline.voice.map((v) => ({ clip: v, url: urls.get(v.mediaId), level: mix.voiceLevel, duck: false })),
  ];
  useEffect(() => {
    for (const { clip, level, duck } of clips) {
      const el = refs.current.get(clip.id);
      if (!el) continue;
      const inside = time >= clip.start && time < clip.start + clip.duration;
      const target = clip.sourceIn + (time - clip.start);
      // An HTML player cannot go above full volume; levels over 100% are exported but previewed at 100%.
      el.volume = clamp(clip.volume * level * fadeGain(clip, time) * (duck ? duckGain(windows, mix.duckTo, time) : 1), 0, 1);
      if (!playing || !inside) {
        if (!el.paused) el.pause();
        if (!playing && inside && Math.abs(el.currentTime - target) > 0.05) el.currentTime = target;
        continue;
      }
      if (Math.abs(el.currentTime - target) > 0.3) el.currentTime = target;
      if (el.paused) void el.play().catch(() => undefined);
    }
  });
  return (
    <div hidden>
      {clips.map(({ clip, url }) => (url ? <audio key={clip.id} src={url} preload="auto" ref={(el) => { if (el) refs.current.set(clip.id, el); else refs.current.delete(clip.id); }} /> : null))}
    </div>
  );
}

type Drag =
  | { mode: 'move'; id: string; kind: 'sticker' | 'text'; startX: number; startY: number; origin: { x: number; y: number } }
  | { mode: 'resize'; id: string; kind: 'sticker' | 'text'; centre: { x: number; y: number }; startDist: number; origin: number }
  | { mode: 'rotate'; id: string; centre: { x: number; y: number } };

export function Stage({ project, media, urls, stickers, tracks, time, playing, selection, onSelect, onCommit, onEmptyClick }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [box, setBox] = useState({ width: 0, height: 0 });
  const [drag, setDrag] = useState<Drag | null>(null);
  const [draft, setDraft] = useState<StickerPlacement | TextOverlay | null>(null);
  const images = useRef(new Map<string, HTMLImageElement>());
  const [, setLoaded] = useState(0);
  const { timeline } = project;
  const [aw, ah] = project.aspect === '9:16' ? [9, 16] : project.aspect === '16:9' ? [16, 9] : [1, 1];

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth - 24;
      const h = el.clientHeight - 24;
      const scale = Math.min(w / aw, h / ah);
      setBox({ width: Math.max(0, Math.floor(aw * scale)), height: Math.max(0, Math.floor(ah * scale)) });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [aw, ah]);

  // Library images for the stickers in use, loaded once each.
  useEffect(() => {
    for (const s of timeline.stickers) {
      const item = stickers.get(s.stickerId);
      if (!item || images.current.has(s.stickerId)) continue;
      const img = new Image();
      img.onload = () => setLoaded((n) => n + 1);
      img.src = item.url;
      images.current.set(s.stickerId, img);
    }
  }, [timeline.stickers, stickers]);

  const texts = useMemo(() => timeline.texts.map((t) => (draft && draft.id === t.id ? (draft as TextOverlay) : t)), [timeline.texts, draft]);
  const placed = useMemo(() => timeline.stickers.map((s) => (draft && draft.id === s.id ? (draft as StickerPlacement) : s)), [timeline.stickers, draft]);
  const frames = useMemo(() => captionFrames(timeline.captions), [timeline.captions]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || box.width === 0) return;
    const ratio = window.devicePixelRatio || 1;
    const W = Math.round(box.width * ratio);
    const H = Math.round(box.height * ratio);
    if (canvas.width !== W || canvas.height !== H) {
      canvas.width = W;
      canvas.height = H;
    }
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, W, H);
    const layers = [
      ...texts.map((t) => ({ z: t.z, draw: () => drawTextOverlay(ctx, t, W, H, layerState(time, t.start, t.end, t.enter, t.exit)) })),
      ...placed.map((s) => ({
        z: s.z,
        draw: () => {
          const img = images.current.get(s.stickerId);
          const state = layerState(time, s.start, s.end, s.enter, s.exit);
          if (!img?.complete || !img.naturalWidth || state.alpha <= 0) return;
          const long = s.size * Math.min(W, H);
          const scale = long / Math.max(img.naturalWidth, img.naturalHeight);
          ctx.save();
          ctx.globalAlpha = state.alpha * s.opacity;
          ctx.translate(s.cx * W, s.cy * H + state.shift * H);
          ctx.rotate((s.rotation * Math.PI) / 180);
          ctx.scale((s.flipX ? -1 : 1) * state.scale * scale, state.scale * scale);
          ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
          ctx.restore();
        },
      })),
    ].sort((a, b) => a.z - b.z);
    for (const layer of layers) layer.draw();
    const frame = frameAt(frames, time);
    if (frame) drawCaption(ctx, timeline.captions, frame, W, H);
  });

  const visible = visibleScenes(timeline.scenes, time);
  const selectedSticker = selection?.kind === 'sticker' ? placed.find((s) => s.id === selection.id) ?? null : null;
  const selectedText = selection?.kind === 'text' ? texts.find((t) => t.id === selection.id) ?? null : null;

  const toFrame = (event: { clientX: number; clientY: number }) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height };
  };

  /** The topmost text or sticker under a point that is on screen now. */
  const hit = (pt: { x: number; y: number }): Selection => {
    const W = box.width;
    const H = box.height;
    const measure = document.createElement('canvas').getContext('2d')!;
    const candidates = [
      ...placed.filter((s) => time >= s.start && time <= s.end).map((s) => {
        const img = images.current.get(s.stickerId);
        const long = s.size * Math.min(W, H);
        const aspect = img?.naturalWidth ? img.naturalWidth / img.naturalHeight : 1;
        const w = aspect >= 1 ? long : long * aspect;
        const h = aspect >= 1 ? long / aspect : long;
        return { z: s.z, sel: { kind: 'sticker', id: s.id } as Selection, inside: Math.abs(pt.x * W - s.cx * W) <= w / 2 && Math.abs(pt.y * H - s.cy * H) <= h / 2 };
      }),
      ...texts.filter((t) => time >= t.start && time <= t.end).map((t) => {
        const b = layoutText(measure, t, W, H);
        return { z: t.z, sel: { kind: 'text', id: t.id } as Selection, inside: pt.x * W >= b.left && pt.x * W <= b.left + b.width && pt.y * H >= b.top && pt.y * H <= b.top + b.height };
      }),
    ].filter((c) => c.inside).sort((a, b) => b.z - a.z);
    return candidates[0]?.sel ?? null;
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!canvasRef.current) return;
    const pt = toFrame(event);
    const found = hit(pt);
    if (!found) {
      onSelect(null);
      if (timeline.scenes.length === 0) onEmptyClick();
      return;
    }
    onSelect(found);
    const target = found.kind === 'sticker' ? placed.find((s) => s.id === found.id)! : texts.find((t) => t.id === found.id)!;
    const origin = found.kind === 'sticker' ? { x: (target as StickerPlacement).cx, y: (target as StickerPlacement).cy } : { x: (target as TextOverlay).x, y: (target as TextOverlay).y };
    setDraft(target);
    setDrag({ mode: 'move', id: found.id, kind: found.kind as 'sticker' | 'text', startX: pt.x, startY: pt.y, origin });
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const beginHandle = (event: ReactPointerEvent<HTMLElement>, mode: 'resize' | 'rotate', item: StickerPlacement | TextOverlay, kind: 'sticker' | 'text') => {
    event.stopPropagation();
    const pt = toFrame(event);
    const centre = kind === 'sticker' ? { x: (item as StickerPlacement).cx, y: (item as StickerPlacement).cy } : { x: (item as TextOverlay).x, y: (item as TextOverlay).y };
    setDraft(item);
    if (mode === 'rotate') setDrag({ mode, id: item.id, centre });
    else setDrag({ mode, id: item.id, kind, centre, startDist: Math.hypot((pt.x - centre.x) * box.width, (pt.y - centre.y) * box.height), origin: kind === 'sticker' ? (item as StickerPlacement).size : (item as TextOverlay).size });
    (event.currentTarget.closest('.vx-frame') as HTMLElement | null)?.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag || !draft) return;
    const pt = toFrame(event);
    if (drag.mode === 'move') {
      let x = clamp(drag.origin.x + pt.x - drag.startX, -0.2, 1.2);
      let y = clamp(drag.origin.y + pt.y - drag.startY, -0.2, 1.2);
      // A light pull towards the centre lines, where most things belong.
      if (Math.abs(x - 0.5) < 0.012) x = 0.5;
      if (Math.abs(y - 0.5) < 0.012) y = 0.5;
      setDraft(drag.kind === 'sticker' ? { ...(draft as StickerPlacement), cx: x, cy: y } : { ...(draft as TextOverlay), x, y });
    } else if (drag.mode === 'resize') {
      const dist = Math.hypot((pt.x - drag.centre.x) * box.width, (pt.y - drag.centre.y) * box.height);
      const factor = drag.startDist > 0 ? dist / drag.startDist : 1;
      setDraft(drag.kind === 'sticker'
        ? { ...(draft as StickerPlacement), size: clamp(drag.origin * factor, 0.04, 1.2) }
        : { ...(draft as TextOverlay), size: clamp(drag.origin * factor, 0.025, 0.2) });
    } else {
      const angle = (Math.atan2((pt.y - drag.centre.y) * box.height, (pt.x - drag.centre.x) * box.width) * 180) / Math.PI + 90;
      const snapped = Math.abs(((angle % 90) + 90) % 90) < 4 ? Math.round(angle / 90) * 90 : angle;
      setDraft({ ...(draft as StickerPlacement), rotation: Math.round(((snapped + 540) % 360) - 180) });
    }
  };

  const onPointerUp = () => {
    if (drag && draft) {
      const final = draft;
      onCommit('stickerId' in final ? upsertSticker(final as StickerPlacement) : upsertText(final as TextOverlay));
    }
    setDrag(null);
    setDraft(null);
  };

  // Handles for the selected layer, in stage pixels.
  let handles = null;
  if (selectedSticker && time >= selectedSticker.start && time <= selectedSticker.end) {
    const img = images.current.get(selectedSticker.stickerId);
    const long = selectedSticker.size * Math.min(box.width, box.height);
    const aspect = img?.naturalWidth ? img.naturalWidth / img.naturalHeight : 1;
    const w = aspect >= 1 ? long : long * aspect;
    const h = aspect >= 1 ? long / aspect : long;
    handles = (
      <div className="vx-handles" style={{ left: selectedSticker.cx * box.width - w / 2, top: selectedSticker.cy * box.height - h / 2, width: w, height: h, transform: `rotate(${selectedSticker.rotation}deg)` }}>
        <button type="button" className="vx-handle vx-handle--rotate" aria-label="Rotate sticker" onPointerDown={(e) => beginHandle(e, 'rotate', selectedSticker, 'sticker')} />
        <button type="button" className="vx-handle vx-handle--resize" aria-label="Resize sticker" onPointerDown={(e) => beginHandle(e, 'resize', selectedSticker, 'sticker')} />
      </div>
    );
  } else if (selectedText && time >= selectedText.start && time <= selectedText.end && box.width > 0) {
    const b = layoutText(document.createElement('canvas').getContext('2d')!, selectedText, box.width, box.height);
    handles = (
      <div className="vx-handles" style={{ left: b.left, top: b.top, width: b.width, height: b.height }}>
        <button type="button" className="vx-handle vx-handle--resize" aria-label="Resize text" onPointerDown={(e) => beginHandle(e, 'resize', selectedText, 'text')} />
      </div>
    );
  }

  return (
    <div className="vx-stage" ref={wrapRef}>
      <div
        className="vx-frame"
        style={{ width: box.width, height: box.height, background: timeline.background }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {visible.map((v) => (
          <SceneView
            key={v.scene.id}
            visible={v}
            media={v.scene.media && 'mediaId' in v.scene.media ? media.get(v.scene.media.mediaId) : undefined}
            url={v.scene.media && 'mediaId' in v.scene.media ? urls.get(v.scene.media.mediaId) : undefined}
            time={time}
            playing={playing}
            frame={box}
            background={timeline.background}
            volume={v.scene.volume * timeline.mix.sourceLevel}
          />
        ))}
        {timeline.scenes.length === 0 ? (
          <div className="vx-empty">
            <strong>Start with a scene</strong>
            <span>Upload footage or a picture, add a title card, or plan scenes from a prompt or a script.</span>
          </div>
        ) : null}
        <canvas ref={canvasRef} className="vx-overlay" style={{ width: box.width, height: box.height }} aria-hidden="true" />
        {handles}
      </div>
      <AudioLayer project={project} tracks={tracks} urls={urls} time={time} playing={playing} />
    </div>
  );
}
