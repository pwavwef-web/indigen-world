import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import {
  MIN_SCENE,
  clamp,
  effectiveTransition,
  moveScene,
  patchCue,
  patchMusic,
  patchScene,
  patchVoice,
  round,
  sceneTimes,
  upsertSticker,
  upsertText,
  type EditorProject,
  type ProjectMedia,
} from './model';
import type { Selection } from './useEditor';

/**
 * The timeline under the stage.
 *
 * The scene track is magnetic: drag a scene to a new place and the others
 * close up behind it; drag its right edge to shorten or lengthen it (past the
 * end of a clip the last frame is held — the renderer does the same). Every
 * other track holds blocks placed at absolute times: drag one to move it, drag
 * an edge to change when it starts or stops. Changes preview while dragging and
 * become one undoable edit when the pointer is released.
 */

const LABEL = 84;

interface BlockDrag {
  id: string;
  track: 'text' | 'sticker' | 'cue' | 'voice' | 'music' | 'scene';
  edge: 'move' | 'start' | 'end';
  startX: number;
  origin: { start: number; end: number };
  preview: { start: number; end: number };
}

function lanes<T extends { id: string; start: number; end: number }>(items: T[]): Map<string, number> {
  const out = new Map<string, number>();
  const ends: number[] = [];
  for (const item of [...items].sort((a, b) => a.start - b.start)) {
    let lane = ends.findIndex((e) => e <= item.start + 1e-6);
    if (lane < 0) {
      lane = ends.length;
      ends.push(item.end);
    } else {
      ends[lane] = item.end;
    }
    out.set(item.id, lane);
  }
  return out;
}

export function Timeline({ project, media, stickerNames, time, zoom, selection, onSelect, onSeek, onCommit, toolbar }: {
  project: EditorProject;
  media: ReadonlyMap<string, ProjectMedia>;
  /** Library sticker id → its name, so a block says which sticker it is. */
  stickerNames: ReadonlyMap<string, string>;
  time: number;
  zoom: number;
  selection: Selection;
  onSelect: (s: Selection) => void;
  onSeek: (t: number) => void;
  onCommit: (edit: (p: EditorProject) => EditorProject) => void;
  toolbar: ReactNode;
}) {
  const { timeline } = project;
  const pps = 56 * zoom;
  const { starts, total } = sceneTimes(timeline.scenes);
  const extent = Math.max(total, ...timeline.music.map((m) => m.start + m.duration), ...timeline.voice.map((v) => v.start + v.duration), 10) + 4;
  const scrollRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<BlockDrag | null>(null);
  const [sceneDrag, setSceneDrag] = useState<{ id: string; startX: number; dx: number } | null>(null);

  const x = (t: number) => LABEL + t * pps;
  const tickEvery = pps >= 90 ? 1 : pps >= 45 ? 2 : pps >= 20 ? 5 : 10;

  const seekFromPointer = (clientX: number) => {
    const el = scrollRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    onSeek(Math.max(0, (clientX - rect.left + el.scrollLeft - LABEL) / pps));
  };

  const begin = (event: ReactPointerEvent<HTMLElement>, id: string, track: BlockDrag['track'], edge: BlockDrag['edge'], start: number, end: number, sel: Selection) => {
    event.stopPropagation();
    onSelect(sel);
    setDrag({ id, track, edge, startX: event.clientX, origin: { start, end }, preview: { start, end } });
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const move = (event: ReactPointerEvent<HTMLElement>) => {
    if (!drag) return;
    const delta = (event.clientX - drag.startX) / pps;
    const { start, end } = drag.origin;
    const minLen = drag.track === 'scene' ? MIN_SCENE : 0.2;
    let preview = { start, end };
    if (drag.edge === 'move') preview = { start: Math.max(0, start + delta), end: Math.max(0, start + delta) + (end - start) };
    if (drag.edge === 'start') preview = { start: clamp(start + delta, 0, end - minLen), end };
    if (drag.edge === 'end') preview = { start, end: Math.max(start + minLen, end + delta) };
    setDrag({ ...drag, preview: { start: round(preview.start, 2), end: round(preview.end, 2) } });
  };

  const end = () => {
    if (!drag) return;
    const { id, track, preview, origin, edge } = drag;
    setDrag(null);
    if (preview.start === origin.start && preview.end === origin.end) return;
    const len = round(preview.end - preview.start);
    if (track === 'scene') {
      const scene = timeline.scenes.find((s) => s.id === id);
      if (scene) onCommit(patchScene(id, { duration: clamp(len, MIN_SCENE, 120) }));
      return;
    }
    if (track === 'text') {
      const t = timeline.texts.find((i) => i.id === id);
      if (t) onCommit(upsertText({ ...t, start: preview.start, end: preview.end }));
    } else if (track === 'sticker') {
      const s = timeline.stickers.find((i) => i.id === id);
      if (s) onCommit(upsertSticker({ ...s, start: preview.start, end: preview.end }));
    } else if (track === 'cue') {
      onCommit(patchCue(id, { start: preview.start, end: preview.end }));
    } else {
      // An audio clip's left edge trims its source as well as moving its start.
      const clip = (track === 'voice' ? timeline.voice : timeline.music).find((c) => c.id === id);
      if (!clip) return;
      const trimmed = edge === 'start' ? round(clip.sourceIn + (preview.start - origin.start)) : clip.sourceIn;
      const patch = { start: preview.start, duration: len, sourceIn: Math.max(0, trimmed) };
      onCommit(track === 'voice' ? patchVoice(id, patch) : patchMusic(id, patch));
    }
  };

  const block = (opts: { id: string; track: BlockDrag['track']; start: number; end: number; label: string; className: string; sel: Selection; lane?: number; resizable?: boolean; title?: string }) => {
    const live = drag && drag.id === opts.id ? drag.preview : { start: opts.start, end: opts.end };
    const selected = selection && selection.id === opts.id;
    return (
      <div
        key={opts.id}
        className={`vx-block ${opts.className}${selected ? ' is-selected' : ''}`}
        style={{ left: x(live.start), width: Math.max(8, (live.end - live.start) * pps), top: 4 + (opts.lane ?? 0) * 20, height: (opts.lane ?? -1) >= 0 ? 18 : undefined }}
        title={opts.title ?? opts.label}
        role="button"
        tabIndex={0}
        aria-label={`${opts.label}, ${live.start.toFixed(1)} to ${live.end.toFixed(1)} seconds`}
        aria-pressed={Boolean(selected)}
        onPointerDown={(e) => begin(e, opts.id, opts.track, 'move', opts.start, opts.end, opts.sel)}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(opts.sel); } }}
      >
        {opts.resizable !== false ? <span className="vx-edge vx-edge--start" onPointerDown={(e) => begin(e, opts.id, opts.track, 'start', opts.start, opts.end, opts.sel)} onPointerMove={move} onPointerUp={end} /> : null}
        <span className="vx-block__label">{opts.label}</span>
        {opts.resizable !== false ? <span className="vx-edge vx-edge--end" onPointerDown={(e) => begin(e, opts.id, opts.track, 'end', opts.start, opts.end, opts.sel)} onPointerMove={move} onPointerUp={end} /> : null}
      </div>
    );
  };

  // ── Scenes: reorder by dragging the body, resize by the right edge ──────
  const sceneBlocks = timeline.scenes.map((s, i) => {
    const live = drag && drag.id === s.id ? drag.preview : { start: starts[i]!, end: starts[i]! + s.duration };
    const dx = sceneDrag?.id === s.id ? sceneDrag.dx : 0;
    const selected = selection?.kind === 'scene' && selection.id === s.id;
    const m = s.media && 'mediaId' in s.media ? media.get(s.media.mediaId) : undefined;
    const kind = !s.media ? 'empty' : s.media.kind;
    const tr = effectiveTransition(timeline.scenes, i);
    return (
      <div key={s.id}>
        <div
          className={`vx-block vx-block--scene vx-block--${kind}${selected ? ' is-selected' : ''}${s.generation?.status === 'failed' ? ' has-error' : ''}`}
          style={{ left: x(starts[i]!) + dx, width: Math.max(10, (live.end - live.start) * pps - 2), zIndex: dx ? 5 : undefined }}
          role="button"
          tabIndex={0}
          aria-label={`Scene ${i + 1}${s.title ? `, ${s.title}` : ''}, ${s.duration.toFixed(1)} seconds`}
          aria-pressed={selected}
          onPointerDown={(e) => {
            onSelect({ kind: 'scene', id: s.id });
            onSeek(starts[i]! + 0.01);
            setSceneDrag({ id: s.id, startX: e.clientX, dx: 0 });
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => { if (sceneDrag?.id === s.id) setSceneDrag({ ...sceneDrag, dx: e.clientX - sceneDrag.startX }); }}
          onPointerUp={() => {
            if (sceneDrag?.id === s.id && Math.abs(sceneDrag.dx) > 6) {
              const centre = starts[i]! + s.duration / 2 + sceneDrag.dx / pps;
              let to = timeline.scenes.findIndex((o, k) => centre < starts[k]! + o.duration / 2);
              if (to < 0) to = timeline.scenes.length;
              if (to > i) to -= 1;
              if (to !== i) onCommit(moveScene(s.id, to));
            }
            setSceneDrag(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowLeft' && e.altKey) { e.preventDefault(); onCommit(moveScene(s.id, i - 1)); }
            if (e.key === 'ArrowRight' && e.altKey) { e.preventDefault(); onCommit(moveScene(s.id, i + 1)); }
          }}
        >
          <span className="vx-block__label">{i + 1}. {s.title || m?.fileName || (kind === 'card' ? 'Card' : kind === 'color' ? 'Colour' : kind === 'empty' ? 'Needs a picture' : 'Scene')}</span>
          <small>{s.duration.toFixed(1)}s</small>
          <span className="vx-edge vx-edge--end" onPointerDown={(e) => begin(e, s.id, 'scene', 'end', starts[i]!, starts[i]! + s.duration, { kind: 'scene', id: s.id })} onPointerMove={move} onPointerUp={end} />
        </div>
        {i > 0 && tr.type !== 'cut' ? <span className="vx-join" style={{ left: x(starts[i]!) - 7 }} title={`${tr.type} ${tr.duration.toFixed(1)}s`}>◆</span> : null}
      </div>
    );
  });

  const textLanes = useMemo(() => lanes(timeline.texts), [timeline.texts]);
  const stickerLanes = useMemo(() => lanes(timeline.stickers), [timeline.stickers]);
  const rowHeight = (n: number) => Math.max(34, 8 + Math.max(1, n) * 20);
  const textRows = Math.max(0, ...textLanes.values()) + 1;
  const stickerRows = Math.max(0, ...stickerLanes.values()) + 1;

  return (
    <section className="vx-timeline" aria-label="Timeline">
      <div className="vx-timeline__toolbar">{toolbar}</div>
      <div className="vx-timeline__scroll" ref={scrollRef}>
        <div className="vx-timeline__body" style={{ width: x(extent) }}>
          <div className="vx-ruler" onPointerDown={(e) => seekFromPointer(e.clientX)}>
            <span className="vx-track__label">Time</span>
            {Array.from({ length: Math.ceil(extent / tickEvery) + 1 }, (_, k) => (
              <i key={k} style={{ left: x(k * tickEvery) }}>{`${Math.floor((k * tickEvery) / 60)}:${String((k * tickEvery) % 60).padStart(2, '0')}`}</i>
            ))}
          </div>
          <div className="vx-track vx-track--scenes"><span className="vx-track__label">Scenes</span>{sceneBlocks}</div>
          <div className="vx-track" style={{ height: rowHeight(textRows) }}>
            <span className="vx-track__label">Text</span>
            {timeline.texts.map((t) => block({ id: t.id, track: 'text', start: t.start, end: t.end, label: t.text || 'Text', className: 'vx-block--text', sel: { kind: 'text', id: t.id }, lane: textLanes.get(t.id) }))}
          </div>
          <div className="vx-track" style={{ height: rowHeight(stickerRows) }}>
            <span className="vx-track__label">Stickers</span>
            {timeline.stickers.map((s) => block({ id: s.id, track: 'sticker', start: s.start, end: s.end, label: `★ ${stickerNames.get(s.stickerId) ?? 'Sticker'}`, className: 'vx-block--sticker', sel: { kind: 'sticker', id: s.id }, lane: stickerLanes.get(s.id), title: 'Sticker' }))}
          </div>
          <div className="vx-track">
            <span className="vx-track__label">Captions</span>
            {timeline.captions.cues.map((c) => block({ id: c.id, track: 'cue', start: c.start, end: c.end, label: c.text, className: 'vx-block--cue', sel: { kind: 'cue', id: c.id } }))}
          </div>
          <div className="vx-track">
            <span className="vx-track__label">Voice</span>
            {timeline.voice.map((v) => block({ id: v.id, track: 'voice', start: v.start, end: v.start + v.duration, label: v.label || 'Voice', className: 'vx-block--voice', sel: { kind: 'voice', id: v.id } }))}
          </div>
          <div className="vx-track">
            <span className="vx-track__label">Music</span>
            {timeline.music.map((m) => block({ id: m.id, track: 'music', start: m.start, end: m.start + m.duration, label: m.title || 'Music', className: 'vx-block--music', sel: { kind: 'music', id: m.id } }))}
          </div>
          <div className="vx-playhead" style={{ left: x(time) }} aria-hidden="true"><span /></div>
          {total > 0 ? <div className="vx-end-marker" style={{ left: x(total) }} title="The video ends here" aria-hidden="true" /> : null}
        </div>
      </div>
    </section>
  );
}
