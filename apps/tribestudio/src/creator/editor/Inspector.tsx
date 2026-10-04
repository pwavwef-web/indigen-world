import { Icon } from '../../interface/icons';
import type { ReactNode } from 'react';
import type { MusicTrack, Sticker } from './api';
import { ENTRANCES, EXITS, LOOKS } from './looks';
import {
  MIN_SCENE,
  clamp,
  duplicateScene,
  effectiveTransition,
  newId,
  patchCue,
  patchMusic,
  patchScene,
  patchVoice,
  removeLayer,
  removeScene,
  restack,
  round,
  sceneTimes,
  splitSceneAt,
  upsertSticker,
  upsertText,
  type CardSpec,
  type EditorProject,
  type Entrance,
  type Exit,
  type Scene,
  type StickerPlacement,
  type TextOverlay,
  type TransitionType,
} from './model';
import type { EditorApi } from './useEditor';

const TRANSITIONS: { id: TransitionType; label: string }[] = [
  { id: 'cut', label: 'Cut' },
  { id: 'fade', label: 'Fade' },
  { id: 'flash', label: 'Flash' },
  { id: 'slide', label: 'Slide' },
  { id: 'wipe', label: 'Wipe' },
];

function Num({ label, value, min, max, step = 0.1, onChange, suffix = 's' }: { label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void; suffix?: string }) {
  return (
    <label><span>{label}{suffix ? ` (${suffix})` : ''}</span><input type="number" min={min} max={max} step={step} value={Number(value.toFixed(2))} onChange={(e) => { const v = Number(e.target.value); if (Number.isFinite(v)) onChange(clamp(v, min, max)); }} /></label>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <section><h3>{title}</h3>{children}</section>;
}

function Motion({ enter, exit, onChange }: { enter: Entrance; exit: Exit; onChange: (p: { enter?: Entrance; exit?: Exit }) => void }) {
  return (
    <div className="ve-control-grid">
      <label><span>Entrance</span><select value={enter} onChange={(e) => onChange({ enter: e.target.value as Entrance })}>{ENTRANCES.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select></label>
      <label><span>Exit</span><select value={exit} onChange={(e) => onChange({ exit: e.target.value as Exit })}>{EXITS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select></label>
    </div>
  );
}

function SceneInspector({ editor, scene, index, onReplace }: { editor: EditorApi; scene: Scene; index: number; onReplace: () => void }) {
  const project = editor.project!;
  const set = (patch: Partial<Scene>) => editor.commit(patchScene(scene.id, patch));
  const m = scene.media && 'mediaId' in scene.media ? editor.media.get(scene.media.mediaId) : undefined;
  const tr = effectiveTransition(project.timeline.scenes, index);
  const card = scene.media?.kind === 'card' ? scene.media.card : null;
  const setCard = (patch: Partial<CardSpec>) => card && set({ media: { kind: 'card', card: { ...card, ...patch } } });
  const { starts } = sceneTimes(project.timeline.scenes);
  const inside = editor.time > starts[index]! + MIN_SCENE && editor.time < starts[index]! + scene.duration - MIN_SCENE;
  return (
    <div className="ve-inspector__body">
      <div className="ve-inspector__actions">
        <button type="button" onClick={onReplace}>{scene.media ? 'Replace' : 'Add media'}</button>
        <button type="button" disabled={!inside} title={inside ? 'Split at the playhead' : 'Move the playhead inside this scene to split it'} onClick={() => editor.commit(splitSceneAt(editor.time))}>Split</button>
        <button type="button" onClick={() => editor.commit(duplicateScene(scene.id))}>Duplicate</button>
        <button type="button" onClick={() => { editor.commit(removeScene(scene.id)); editor.select(null); }}>Delete</button>
      </div>
      <Section title="Timing">
        <div className="ve-control-grid">
          <Num label="Length" value={scene.duration} min={MIN_SCENE} max={120} onChange={(v) => set({ duration: round(v) })} />
          {scene.media?.kind === 'video' ? <Num label="Starts at" value={scene.sourceIn} min={0} max={Math.max(0, (m?.durationSec ?? 3600) - 0.1)} onChange={(v) => set({ sourceIn: round(v) })} /> : null}
        </div>
        {scene.media?.kind === 'video' ? (
          <>
            <label className="ve-range"><span>Speed <b>{scene.speed}×</b></span><input type="range" min={0.5} max={2} step={0.25} value={scene.speed} onChange={(e) => set({ speed: Number(e.target.value) })} /></label>
            {m?.durationSec && scene.sourceIn + scene.duration * scene.speed > m.durationSec + 0.05 ? <p className="ve-panel__note">This scene runs past the end of the clip; the last frame is held.</p> : null}
          </>
        ) : null}
      </Section>
      {index > 0 ? (
        <Section title="Transition in">
          <div className="ve-segmented" role="group" aria-label="Transition into this scene">
            {TRANSITIONS.map((t) => <button type="button" key={t.id} className={scene.transitionIn.type === t.id ? 'is-on' : ''} aria-pressed={scene.transitionIn.type === t.id} onClick={() => set({ transitionIn: { type: t.id, duration: t.id === 'cut' ? 0 : Math.max(0.3, scene.transitionIn.duration || 0.6) } })}>{t.label}</button>)}
          </div>
          {scene.transitionIn.type !== 'cut' ? <label className="ve-range"><span>Length <b>{tr.duration.toFixed(1)} s</b></span><input type="range" min={0.2} max={1.5} step={0.1} value={scene.transitionIn.duration} onChange={(e) => set({ transitionIn: { ...scene.transitionIn, duration: Number(e.target.value) } })} /></label> : null}
        </Section>
      ) : null}
      {card ? (
        <Section title={card.style === 'title' ? 'Title card' : 'End card'}>
          <label className="ve-field"><span>Heading</span><input value={card.heading} maxLength={80} onChange={(e) => setCard({ heading: e.target.value })} /></label>
          <label className="ve-field"><span>Line below</span><input value={card.subheading} maxLength={120} onChange={(e) => setCard({ subheading: e.target.value })} /></label>
          <div className="ve-control-grid">
            <label><span>Background</span><input type="color" value={card.background} onChange={(e) => setCard({ background: e.target.value })} /></label>
            <label><span>Accent</span><input type="color" value={card.accent} onChange={(e) => setCard({ accent: e.target.value })} /></label>
            <label><span>Text</span><input type="color" value={card.textColor} onChange={(e) => setCard({ textColor: e.target.value })} /></label>
          </div>
        </Section>
      ) : null}
      {scene.media?.kind === 'color' ? (
        <Section title="Colour"><label className="ve-field"><span>Fill</span><input type="color" value={scene.media.color} onChange={(e) => set({ media: { kind: 'color', color: e.target.value } })} /></label></Section>
      ) : null}
      {scene.media?.kind === 'video' || scene.media?.kind === 'image' ? (
        <>
          <Section title="Framing">
            <div className="ve-segmented" role="group" aria-label="How the picture fills the frame">
              {(['cover', 'contain', 'blur'] as const).map((f) => <button type="button" key={f} className={scene.fit === f ? 'is-on' : ''} aria-pressed={scene.fit === f} onClick={() => set({ fit: f })}>{f === 'cover' ? 'Fill' : f === 'contain' ? 'Fit' : 'Fit + blur'}</button>)}
            </div>
            {scene.fit === 'cover' ? (
              <>
                <label className="ve-range"><span>Keep across</span><input type="range" min={0} max={1} step={0.05} value={scene.focusX} onChange={(e) => set({ focusX: Number(e.target.value) })} /></label>
                <label className="ve-range"><span>Keep down</span><input type="range" min={0} max={1} step={0.05} value={scene.focusY} onChange={(e) => set({ focusY: Number(e.target.value) })} /></label>
              </>
            ) : null}
            <div className="ve-inspector__actions">
              <button type="button" onClick={() => set({ rotation: (((scene.rotation + 90) % 360) as Scene['rotation']) })}>Rotate 90°</button>
              <button type="button" aria-pressed={scene.flipX} onClick={() => set({ flipX: !scene.flipX })}>Mirror</button>
            </div>
            {scene.media.kind === 'image' ? <label className="ve-check"><input type="checkbox" checked={scene.kenBurns} onChange={(e) => set({ kenBurns: e.target.checked })} />Slow zoom</label> : null}
          </Section>
          <Section title="Look">
            <div className="ve-filter-grid">
              {LOOKS.map((l) => <button type="button" key={l.id} className={scene.look === l.id ? 'is-on' : ''} aria-pressed={scene.look === l.id} onClick={() => set({ look: l.id })}><span style={{ background: l.swatch }} /><strong>{l.label}</strong></button>)}
            </div>
          </Section>
        </>
      ) : null}
      {scene.media?.kind === 'video' ? (
        <Section title="Sound">
          <label className="ve-range"><span>Clip volume <b>{Math.round(scene.volume * 100)}%</b></span><input type="range" min={0} max={2} step={0.05} value={scene.volume} onChange={(e) => set({ volume: Number(e.target.value) })} /></label>
          <label className="ve-check"><input type="checkbox" checked={scene.duckMusic} onChange={(e) => set({ duckMusic: e.target.checked })} />Someone speaks here — lower the music</label>
          {m?.source === 'ai' ? <p className="ve-panel__note">AI videos from the Studio are made silent.</p> : null}
        </Section>
      ) : null}
    </div>
  );
}

function LayerTiming({ start, end, total, onChange }: { start: number; end: number; total: number; onChange: (p: { start?: number; end?: number }) => void }) {
  return (
    <div className="ve-control-grid">
      <Num label="Appears" value={start} min={0} max={Math.max(0, total - 0.1)} onChange={(v) => onChange({ start: round(v), end: Math.max(end, round(v) + 0.2) })} />
      <Num label="Leaves" value={end} min={0.1} max={Math.max(0.2, total)} onChange={(v) => onChange({ end: Math.max(start + 0.2, round(v)) })} />
    </div>
  );
}

function TextInspector({ editor, text }: { editor: EditorApi; text: TextOverlay }) {
  const total = sceneTimes(editor.project!.timeline.scenes).total;
  const set = (patch: Partial<TextOverlay>) => editor.commit(upsertText({ ...text, ...patch }));
  return (
    <div className="ve-inspector__body">
      <label className="ve-field"><span>Words</span><textarea rows={3} value={text.text} onChange={(e) => set({ text: e.target.value })} /></label>
      <Section title="Style">
        <label className="ve-range"><span>Size <b>{Math.round(text.size * 1000) / 10}%</b></span><input type="range" min={0.025} max={0.16} step={0.005} value={text.size} onChange={(e) => set({ size: Number(e.target.value) })} /></label>
        <div className="ve-control-grid">
          <label><span>Colour</span><input type="color" value={text.color} onChange={(e) => set({ color: e.target.value })} /></label>
          <label><span>Weight</span><select value={text.weight} onChange={(e) => set({ weight: Number(e.target.value) as 600 | 800 })}><option value={600}>Regular</option><option value={800}>Bold</option></select></label>
          <label><span>Background</span><select value={text.box} onChange={(e) => set({ box: e.target.value as TextOverlay['box'] })}><option value="none">None</option><option value="box">Box</option><option value="pill">Pill</option></select></label>
          {text.box !== 'none' ? <label><span>Box colour</span><input type="color" value={text.boxColor} onChange={(e) => set({ boxColor: e.target.value })} /></label> : null}
        </div>
      </Section>
      <Section title="Timing"><LayerTiming start={text.start} end={text.end} total={total} onChange={set} /><Motion enter={text.enter} exit={text.exit} onChange={set} /></Section>
      <LayerActions editor={editor} id={text.id} onDuplicate={() => editor.commit(upsertText({ ...text, id: newId('text'), y: clamp(text.y + 0.06, 0, 1), z: text.z + 1 }))} />
    </div>
  );
}

function StickerInspector({ editor, sticker, library }: { editor: EditorApi; sticker: StickerPlacement; library: ReadonlyMap<string, Sticker> }) {
  const total = sceneTimes(editor.project!.timeline.scenes).total;
  const set = (patch: Partial<StickerPlacement>) => editor.commit(upsertSticker({ ...sticker, ...patch }));
  const item = library.get(sticker.stickerId);
  return (
    <div className="ve-inspector__body">
      {item ? <div className="vx-inspector-sticker"><img src={item.url} alt={item.altText} /><span>{item.label}</span></div> : null}
      <Section title="Placement">
        <label className="ve-range"><span>Size <b>{Math.round(sticker.size * 100)}%</b></span><input type="range" min={0.05} max={1} step={0.01} value={sticker.size} onChange={(e) => set({ size: Number(e.target.value) })} /></label>
        <label className="ve-range"><span>Rotation <b>{Math.round(sticker.rotation)}°</b></span><input type="range" min={-180} max={180} step={1} value={sticker.rotation} onChange={(e) => set({ rotation: Number(e.target.value) })} /></label>
        <label className="ve-range"><span>Opacity <b>{Math.round(sticker.opacity * 100)}%</b></span><input type="range" min={0.1} max={1} step={0.05} value={sticker.opacity} onChange={(e) => set({ opacity: Number(e.target.value) })} /></label>
        <div className="ve-inspector__actions"><button type="button" aria-pressed={sticker.flipX} onClick={() => set({ flipX: !sticker.flipX })}>Mirror</button><button type="button" onClick={() => set({ cx: 0.5, cy: 0.5 })}>Centre</button></div>
      </Section>
      <Section title="Timing"><LayerTiming start={sticker.start} end={sticker.end} total={total} onChange={set} /><Motion enter={sticker.enter} exit={sticker.exit} onChange={set} /></Section>
      <LayerActions editor={editor} id={sticker.id} onDuplicate={() => editor.commit(upsertSticker({ ...sticker, id: newId('sticker'), cx: clamp(sticker.cx + 0.05, 0, 1), cy: clamp(sticker.cy + 0.05, 0, 1), z: sticker.z + 1 }))} />
    </div>
  );
}

function LayerActions({ editor, id, onDuplicate }: { editor: EditorApi; id: string; onDuplicate: () => void }) {
  return (
    <Section title="Layer">
      <div className="ve-inspector__actions">
        <button type="button" onClick={() => editor.commit(restack(id, 1))}>Bring forward</button>
        <button type="button" onClick={() => editor.commit(restack(id, -1))}>Send back</button>
        <button type="button" onClick={onDuplicate}>Duplicate</button>
        <button type="button" onClick={() => { editor.commit(removeLayer(id)); editor.select(null); }}>Delete</button>
      </div>
    </Section>
  );
}

function ClipInspector({ editor, kind, id, tracks }: { editor: EditorApi; kind: 'voice' | 'music'; id: string; tracks: ReadonlyMap<string, MusicTrack> }) {
  const project = editor.project!;
  const total = sceneTimes(project.timeline.scenes).total;
  const clip = kind === 'voice' ? project.timeline.voice.find((v) => v.id === id) : project.timeline.music.find((m) => m.id === id);
  if (!clip) return null;
  const track = kind === 'music' ? tracks.get((clip as { trackId: string }).trackId) : undefined;
  const sourceLength = kind === 'music' ? track?.durationSec ?? 600 : editor.media.get((clip as { mediaId: string }).mediaId)?.durationSec ?? 600;
  const set = (patch: Partial<typeof clip>) => editor.commit(kind === 'voice' ? patchVoice(id, patch) : patchMusic(id, patch));
  return (
    <div className="ve-inspector__body">
      {track ? <p className="vx-inspector-title"><strong>{track.title}</strong><small>{track.style}</small></p> : null}
      <Section title="Position and trim">
        <div className="ve-control-grid">
          <Num label="Starts at" value={clip.start} min={0} max={Math.max(0, total)} onChange={(v) => set({ start: round(v) })} />
          <Num label="From" value={clip.sourceIn} min={0} max={Math.max(0, sourceLength - 0.5)} onChange={(v) => set({ sourceIn: round(v), duration: round(Math.min(clip.duration, sourceLength - v)) })} />
          <Num label="Length" value={clip.duration} min={0.5} max={Math.max(0.5, sourceLength - clip.sourceIn)} onChange={(v) => set({ duration: round(v) })} />
        </div>
        {kind === 'music' && total > 0 ? <button type="button" className="vx-link" onClick={() => set({ duration: round(Math.max(0.5, Math.min(total - clip.start, sourceLength - clip.sourceIn))) })}>Run to the end of the video</button> : null}
      </Section>
      <Section title="Level">
        <label className="ve-range"><span>Volume <b>{Math.round(clip.volume * 100)}%</b></span><input type="range" min={0} max={2} step={0.05} value={clip.volume} onChange={(e) => set({ volume: Number(e.target.value) })} /></label>
        <label className="ve-range"><span>Fade in <b>{clip.fadeIn.toFixed(1)} s</b></span><input type="range" min={0} max={5} step={0.1} value={clip.fadeIn} onChange={(e) => set({ fadeIn: Number(e.target.value) })} /></label>
        <label className="ve-range"><span>Fade out <b>{clip.fadeOut.toFixed(1)} s</b></span><input type="range" min={0} max={8} step={0.1} value={clip.fadeOut} onChange={(e) => set({ fadeOut: Number(e.target.value) })} /></label>
      </Section>
      {track ? <p className="ve-panel__note">{track.license.summary}</p> : null}
      <button type="button" className="ve-danger" onClick={() => { editor.commit(removeLayer(id)); editor.select(null); }}>Remove from the video</button>
    </div>
  );
}

function CueInspector({ editor, id }: { editor: EditorApi; id: string }) {
  const cue = editor.project!.timeline.captions.cues.find((c) => c.id === id);
  if (!cue) return null;
  const split = () => {
    const t = editor.time;
    if (t <= cue.start + 0.2 || t >= cue.end - 0.2) return;
    const words = cue.text.split(/\s+/);
    const share = (t - cue.start) / (cue.end - cue.start);
    const cut = clamp(Math.round(words.length * share), 1, words.length - 1);
    editor.commit((p: EditorProject) => {
      const next = patchCue(cue.id, { end: t, text: words.slice(0, cut).join(' ') })(p);
      return { ...next, timeline: { ...next.timeline, captions: { ...next.timeline.captions, cues: [...next.timeline.captions.cues, { id: newId('cue'), start: t, end: cue.end, text: words.slice(cut).join(' '), words: null }].sort((a, b) => a.start - b.start) } } };
    });
  };
  return (
    <div className="ve-inspector__body">
      <label className="ve-field"><span>Caption</span><textarea rows={3} value={cue.text} onChange={(e) => editor.commit(patchCue(cue.id, { text: e.target.value }))} /></label>
      <div className="ve-control-grid">
        <Num label="Starts" value={cue.start} min={0} max={cue.end - 0.1} onChange={(v) => editor.commit(patchCue(cue.id, { start: round(v) }))} />
        <Num label="Ends" value={cue.end} min={cue.start + 0.1} max={600} onChange={(v) => editor.commit(patchCue(cue.id, { end: round(v) }))} />
      </div>
      <div className="ve-inspector__actions">
        <button type="button" onClick={() => editor.commit(patchCue(cue.id, { start: round(editor.time) }))}>Start at playhead</button>
        <button type="button" onClick={() => editor.commit(patchCue(cue.id, { end: round(editor.time) }))}>End at playhead</button>
        <button type="button" onClick={split}>Split at playhead</button>
        <button type="button" onClick={() => { editor.commit(removeLayer(cue.id)); editor.select(null); }}>Delete</button>
      </div>
    </div>
  );
}

export function Inspector({ editor, stickers, tracks, onReplace }: { editor: EditorApi; stickers: ReadonlyMap<string, Sticker>; tracks: ReadonlyMap<string, MusicTrack>; onReplace: (sceneId: string) => void }) {
  const project = editor.project!;
  const sel = editor.selection;
  if (!sel) return null;
  let title = '';
  let body: ReactNode = null;
  if (sel.kind === 'scene') {
    const index = project.timeline.scenes.findIndex((s) => s.id === sel.id);
    const scene = project.timeline.scenes[index];
    if (!scene) return null;
    title = scene.title || `Scene ${index + 1}`;
    body = <SceneInspector editor={editor} scene={scene} index={index} onReplace={() => onReplace(scene.id)} />;
  } else if (sel.kind === 'text') {
    const text = project.timeline.texts.find((t) => t.id === sel.id);
    if (!text) return null;
    title = 'Text';
    body = <TextInspector editor={editor} text={text} />;
  } else if (sel.kind === 'sticker') {
    const sticker = project.timeline.stickers.find((s) => s.id === sel.id);
    if (!sticker) return null;
    title = 'Sticker';
    body = <StickerInspector editor={editor} sticker={sticker} library={stickers} />;
  } else if (sel.kind === 'cue') {
    title = 'Caption';
    body = <CueInspector editor={editor} id={sel.id} />;
  } else {
    title = sel.kind === 'voice' ? 'Voice' : 'Music';
    body = <ClipInspector editor={editor} kind={sel.kind} id={sel.id} tracks={tracks} />;
  }
  return (
    <aside className="ve-inspector" aria-label="Inspector">
      <div className="ve-inspector__head"><div><span>Inspector</span><strong>{title}</strong></div><button type="button" aria-label="Close the inspector" onClick={() => editor.select(null)}><Icon name="close" /></button></div>
      {body}
    </aside>
  );
}
