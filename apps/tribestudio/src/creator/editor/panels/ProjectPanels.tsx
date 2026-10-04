import { Icon } from '../../../interface/icons';
import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { useAuth } from '../../../auth';
import { fetchMyStudioVideoJobs, uploadStudioVideoAsset, type StudioVideoJob } from '../../data';
import { planAiScene, referenceFor, type AiConsent } from '../ai';
import { addAiMedia, deleteMedia, errorMessage, uploadMedia } from '../api';
import {
  addScenes,
  duplicateScene,
  moveScene,
  newId,
  newScene,
  newText,
  removeScene,
  sceneTimes,
  titleCard,
  topZ,
  type ContinuityElement,
  type ProjectMedia,
  type Scene,
} from '../model';
import { ENTER_SEC } from '../looks';
import type { EditorApi, Selection } from '../useEditor';
import type { useAiScenes } from '../useAiScenes';
import { fmt } from './LibraryPanels';

type Ai = ReturnType<typeof useAiScenes>;

function statusOf(scene: Scene, media: ReadonlyMap<string, ProjectMedia>): { label: string; tone: 'ok' | 'wait' | 'bad' | 'empty' } {
  const g = scene.generation;
  if (g && (g.status === 'queued' || g.status === 'running')) return { label: 'AI video in progress', tone: 'wait' };
  if (!scene.media) return g?.status === 'failed' ? { label: 'AI video failed', tone: 'bad' } : { label: 'Needs a picture', tone: 'empty' };
  if (scene.media.kind === 'card') return { label: scene.media.card.style === 'title' ? 'Title card' : 'End card', tone: 'ok' };
  if (scene.media.kind === 'color') return { label: 'Colour', tone: 'ok' };
  const m = media.get(scene.media.mediaId);
  if (!m) return { label: 'Media missing', tone: 'bad' };
  if (m.status === 'uploading') return { label: 'Uploading', tone: 'wait' };
  return { label: m.source === 'ai' ? 'AI video' : m.kind === 'image' ? 'Picture' : 'Video', tone: 'ok' };
}

// ── Scenes: the plan, one card per scene ────────────────────────────────────

export function ScenesPanel({ editor, ai, canVideo, consent, askConsent, onPickMedia }: {
  editor: EditorApi;
  ai: Ai;
  canVideo: boolean;
  consent: AiConsent | null;
  askConsent: (then: (c: AiConsent) => void) => void;
  onPickMedia: (sceneId: string) => void;
}) {
  const project = editor.project!;
  const { scenes } = project.timeline;
  const { starts, total } = sceneTimes(scenes);
  const [message, setMessage] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const generate = (scene: Scene) => {
    const go = (c: AiConsent) => {
      setMessage(null);
      void ai.generate(scene, c).then((error) => { if (error) setMessage(error); });
    };
    if (consent) go(consent);
    else askConsent(go);
  };

  const missing = scenes.filter((s) => !s.media && !(s.generation && (s.generation.status === 'queued' || s.generation.status === 'running')));
  const estimate = ai.caps
    ? missing.reduce((sum, s) => sum + (planAiScene(ai.caps!, s, project.aspect, Boolean(referenceFor(s, project)))?.estimateUsd ?? 0), 0)
    : 0;

  const generateAll = () => {
    const go = (c: AiConsent) => {
      if (!window.confirm(`Make ${missing.length} AI video${missing.length === 1 ? '' : 's'} for about $${estimate.toFixed(2)} of your AI video allowance?`)) return;
      for (const s of missing) void ai.generate(s, c).then((error) => { if (error) setMessage(error); });
    };
    if (consent) go(consent);
    else askConsent(go);
  };

  /** A title card opens the video; everything else joins the end. */
  const add = (scene: Scene, at?: number) => {
    editor.commit(addScenes([scene], at));
    editor.select({ kind: 'scene', id: scene.id });
  };

  return (
    <>
      <div className="ve-panel__head"><div><h2>Scenes</h2><p>{scenes.length} scene{scenes.length === 1 ? '' : 's'} · {fmt(total)}</p></div></div>
      <div className="vx-row-buttons">
        <button type="button" title="Adds an opening card before the first scene" onClick={() => add(newScene(titleCard(project.title), 3, { title: 'Title card' }), 0)}>+ Title card</button>
        <button type="button" onClick={() => add(newScene(null, 4, { title: `Scene ${scenes.length + 1}` }))}>+ Empty scene</button>
        <button type="button" title="Adds a closing card after the last scene" onClick={() => add(newScene(titleCard('Thank you for watching', 'end'), 3, { title: 'End card' }))}>+ End card</button>
      </div>
      {canVideo && missing.length > 0 ? (
        <button type="button" className="ve-panel-button ve-panel-button--primary" disabled={!ai.caps} onClick={generateAll}>
          Make AI video for {missing.length} empty scene{missing.length === 1 ? '' : 's'}{ai.caps ? ` · about $${estimate.toFixed(2)}` : ''}
        </button>
      ) : null}
      {ai.capsError && canVideo ? <p className="vx-panel-error">{ai.capsError}</p> : null}
      {message ? <p className="vx-panel-error" role="alert">{message}</p> : null}
      {scenes.length === 0 ? <p className="ve-panel__empty">No scenes yet. Upload footage from Media, add a title card, or start a new video from a prompt or a script.</p> : null}
      <ol className="vx-scene-list">
        {scenes.map((scene, i) => {
          const status = statusOf(scene, editor.media);
          const selected = editor.selection?.kind === 'scene' && editor.selection.id === scene.id;
          const plan = ai.caps ? planAiScene(ai.caps, scene, project.aspect, Boolean(referenceFor(scene, project))) : null;
          const busy = ai.starting.has(scene.id) || status.tone === 'wait';
          return (
            <li key={scene.id} className={`vx-scene-card${selected ? ' is-selected' : ''}`}>
              <button type="button" className="vx-scene-card__head" onClick={() => { editor.select({ kind: 'scene', id: scene.id }); editor.seek(starts[i]! + 0.01); setOpen(open === scene.id ? null : scene.id); }} aria-expanded={open === scene.id}>
                <span className="vx-scene-card__n">{i + 1}</span>
                <span className="vx-scene-card__title"><strong>{scene.title || `Scene ${i + 1}`}</strong><small>{fmt(starts[i]!)} · {scene.duration.toFixed(1)} s</small></span>
                <span className={`vx-status vx-status--${status.tone}`}>{status.label}</span>
              </button>
              {scene.plan.visual && open !== scene.id ? <p className="vx-scene-card__plan">{scene.plan.visual}</p> : null}
              {scene.generation?.status === 'failed' ? <p className="vx-panel-error">{scene.generation.error}</p> : null}
              {open === scene.id ? (
                <div className="vx-scene-card__body">
                  <label className="ve-field"><span>Title</span><input value={scene.title} maxLength={60} onChange={(e) => editor.commit((p) => ({ ...p, timeline: { ...p.timeline, scenes: p.timeline.scenes.map((s) => (s.id === scene.id ? { ...s, title: e.target.value } : s)) } }))} /></label>
                  <label className="ve-field"><span>What the picture shows</span><textarea rows={3} value={scene.plan.visual} placeholder="Subject, place, action and framing" onChange={(e) => editor.commit((p) => ({ ...p, timeline: { ...p.timeline, scenes: p.timeline.scenes.map((s) => (s.id === scene.id ? { ...s, plan: { ...s.plan, visual: e.target.value } } : s)) } }))} /></label>
                  <label className="ve-field"><span>Narration or dialogue</span><textarea rows={2} value={scene.plan.narration} placeholder="What is said over this scene" onChange={(e) => editor.commit((p) => ({ ...p, timeline: { ...p.timeline, scenes: p.timeline.scenes.map((s) => (s.id === scene.id ? { ...s, plan: { ...s.plan, narration: e.target.value } } : s)) } }))} /></label>
                  <label className="ve-field"><span>On-screen caption</span><input value={scene.plan.caption} maxLength={80} onChange={(e) => editor.commit((p) => ({ ...p, timeline: { ...p.timeline, scenes: p.timeline.scenes.map((s) => (s.id === scene.id ? { ...s, plan: { ...s.plan, caption: e.target.value } } : s)) } }))} /></label>
                  {project.continuity.length ? (
                    <fieldset className="vx-checks"><legend>Shows</legend>
                      {project.continuity.filter((e) => e.kind !== 'brand').map((el) => (
                        <label key={el.id}><input type="checkbox" checked={scene.elements.includes(el.id)} onChange={(e) => editor.commit((p) => ({ ...p, timeline: { ...p.timeline, scenes: p.timeline.scenes.map((s) => (s.id === scene.id ? { ...s, elements: e.target.checked ? [...s.elements, el.id] : s.elements.filter((x) => x !== el.id) } : s)) } }))} />{el.name}</label>
                      ))}
                    </fieldset>
                  ) : null}
                </div>
              ) : null}
              <div className="vx-scene-card__actions">
                <button type="button" onClick={() => onPickMedia(scene.id)}>{scene.media ? 'Replace' : 'Add media'}</button>
                {canVideo ? (
                  <button type="button" disabled={busy || !ai.caps} onClick={() => generate(scene)} title={plan ? `${plan.model.label ?? plan.model.id} · ${plan.durationSeconds} s · about $${plan.estimateUsd.toFixed(2)}${plan.note ? ` · ${plan.note}` : ''}` : undefined}>
                    {busy ? 'Making…' : scene.generation?.status === 'failed' ? 'Try AI again' : scene.media ? 'Remake with AI' : 'Make with AI'}{plan && !busy ? ` · $${plan.estimateUsd.toFixed(2)}` : ''}
                  </button>
                ) : null}
                <button type="button" aria-label="Move up" disabled={i === 0} onClick={() => editor.commit(moveScene(scene.id, i - 1))}><Icon name="up" /></button>
                <button type="button" aria-label="Move down" disabled={i === scenes.length - 1} onClick={() => editor.commit(moveScene(scene.id, i + 1))}><Icon name="down" /></button>
                <button type="button" aria-label="Duplicate scene" onClick={() => editor.commit(duplicateScene(scene.id))}><Icon name="copy" /></button>
                <button type="button" aria-label="Delete scene" onClick={() => { editor.commit(removeScene(scene.id)); editor.select(null); }}><Icon name="trash" /></button>
              </div>
            </li>
          );
        })}
      </ol>
      {!canVideo ? <p className="ve-panel__note">AI video needs an approved creator membership. You can still plan scenes and fill them with your own footage, pictures and cards.</p> : null}
    </>
  );
}

// ── Media: uploads, AI videos and recordings ────────────────────────────────

export function MediaPanel({ editor, projectId, pickFor, onPicked }: {
  editor: EditorApi;
  projectId: string;
  pickFor: string | null;
  onPicked: () => void;
}) {
  const { user } = useAuth();
  const project = editor.project!;
  const input = useRef<HTMLInputElement>(null);
  const [uploads, setUploads] = useState<{ name: string; pct: number; error?: string }[]>([]);
  const [aiJobs, setAiJobs] = useState<StudioVideoJob[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recording, setRecording] = useState<MediaRecorder | null>(null);
  const recordStart = useRef(0);

  const useMedia = (m: ProjectMedia) => {
    if (m.kind === 'audio') {
      const clip = { id: newId('voice'), mediaId: m.id, label: m.fileName, start: Math.round(editor.time * 10) / 10, sourceIn: 0, duration: Math.max(0.5, m.durationSec), volume: 1, fadeIn: 0.05, fadeOut: 0.1 };
      editor.commit((p) => ({ ...p, timeline: { ...p.timeline, voice: [...p.timeline.voice, clip] } }));
      editor.select({ kind: 'voice', id: clip.id });
      return;
    }
    const mediaRef = { kind: m.kind, mediaId: m.id } as const;
    const name = m.fileName.replace(/\.[^.]+$/, '').slice(0, 40);
    // Footage shaped differently from the frame is shown whole over a blurred fill.
    const mismatched = m.kind === 'video' && Boolean(m.width && m.height) && project.aspect !== (m.width! > m.height! ? '16:9' : m.width! < m.height! ? '9:16' : '1:1');
    if (pickFor) {
      editor.commit((p) => ({ ...p, timeline: { ...p.timeline, scenes: p.timeline.scenes.map((s) => (s.id !== pickFor ? s : {
        ...s,
        media: mediaRef,
        sourceIn: 0,
        kenBurns: m.kind === 'image',
        fit: mismatched ? 'blur' : s.fit,
        // A card's own name ("Title card") would now describe the wrong thing.
        title: s.media?.kind === 'card' || !s.title ? name : s.title,
        duration: m.kind === 'video' && s.media === null && m.durationSec > 0 ? Math.min(Math.max(s.duration, 0.5), m.durationSec) : s.duration,
      })) } }));
      onPicked();
      return;
    }
    const scene = newScene(mediaRef, m.kind === 'video' ? Math.min(60, Math.max(0.5, m.durationSec || 5)) : 4, { title: name });
    if (mismatched) scene.fit = 'blur';
    editor.commit(addScenes([scene]));
    editor.select({ kind: 'scene', id: scene.id });
  };

  const upload = async (files: File[]) => {
    if (!user) return;
    setError(null);
    for (const file of files) {
      setUploads((u) => [...u, { name: file.name, pct: 0 }]);
      try {
        const m = await uploadMedia(user.uid, projectId, file, (pct) => setUploads((u) => u.map((x) => (x.name === file.name ? { ...x, pct } : x))));
        setUploads((u) => u.filter((x) => x.name !== file.name));
        useMedia(m);
      } catch (e) {
        setUploads((u) => u.map((x) => (x.name === file.name ? { ...x, error: errorMessage(e, 'The upload failed.') } : x)));
      }
    }
  };

  const onFiles = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    void upload(files);
  };

  const loadAi = () => {
    if (!user) return;
    void fetchMyStudioVideoJobs(user.uid).then((jobs) => setAiJobs(jobs.filter((j) => j.status === 'SUCCEEDED' && j.outputStoragePath))).catch((e) => setError(errorMessage(e, 'Your AI videos could not be loaded.')));
  };

  const importAi = async (job: StudioVideoJob) => {
    try {
      const m = await addAiMedia(projectId, { id: job.id, outputStoragePath: job.outputStoragePath!, durationSec: 8, prompt: job.prompt ?? '' });
      useMedia(m);
    } catch (e) {
      setError(errorMessage(e, 'That AI video could not be added.'));
    }
  };

  const record = async () => {
    if (recording) {
      recording.stop();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const type = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'].find((t) => MediaRecorder.isTypeSupported(t)) ?? '';
      const rec = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        setRecording(null);
        const mime = (rec.mimeType || type || 'audio/webm').split(';')[0]!;
        const file = new File(chunks, `narration-${new Date().toISOString().slice(11, 19).replace(/:/g, '')}.${mime.includes('mp4') ? 'm4a' : 'webm'}`, { type: mime });
        void upload([file]);
      };
      recordStart.current = editor.time;
      rec.start();
      setRecording(rec);
    } catch {
      setError('The microphone could not be opened. Allow microphone access for this site, then try again.');
    }
  };

  useEffect(() => () => recording?.stop(), [recording]);

  const used = new Set<string>();
  for (const s of project.timeline.scenes) if (s.media && 'mediaId' in s.media) used.add(s.media.mediaId);
  for (const v of project.timeline.voice) used.add(v.mediaId);

  return (
    <>
      <div className="ve-panel__head"><div><h2>{pickFor ? 'Choose media for the scene' : 'Media'}</h2><p>{pickFor ? 'Pick a file, or upload a new one' : 'Footage, pictures and sound in this project'}</p></div></div>
      {pickFor ? <button type="button" className="vx-link" onClick={onPicked}>Cancel</button> : null}
      <input ref={input} className="ve-file-input" type="file" multiple accept="video/*,audio/*,image/png,image/jpeg,image/webp" onChange={onFiles} />
      <button type="button" className="ve-import" onClick={() => input.current?.click()}><span><strong>Upload from device</strong><small>Video, pictures or audio · stays private until you post</small></span></button>
      <button type="button" className="ve-import" onClick={() => void record()} aria-pressed={Boolean(recording)}><span><strong>{recording ? 'Stop recording' : 'Record narration'}</strong><small>{recording ? 'Recording… tap again to stop' : 'Your voice, added at the playhead'}</small></span></button>
      <button type="button" className="ve-import ve-import--ai" onClick={loadAi}><span><strong>Your AI videos</strong><small>Finished generations from AI Video</small></span></button>
      {aiJobs ? (
        <div className="ve-ai-library">
          {aiJobs.length === 0 ? <p>No finished AI videos yet.</p> : aiJobs.map((job) => (
            <button type="button" key={job.id} onClick={() => void importAi(job)}><span><strong>{job.prompt?.trim() || 'AI video'}</strong><small>{job.createdAt ? new Date(job.createdAt).toLocaleDateString() : ''}</small></span><b>Add</b></button>
          ))}
        </div>
      ) : null}
      {error ? <p className="vx-panel-error" role="alert">{error}</p> : null}
      {uploads.map((u) => (
        <div key={u.name} className="vx-upload">
          <span>{u.name}</span>
          {u.error ? <em role="alert">{u.error}</em> : <progress max={100} value={u.pct} aria-label={`Uploading ${u.name}`} />}
          {u.error ? <button type="button" className="vx-link" onClick={() => setUploads((x) => x.filter((y) => y.name !== u.name))}>Dismiss</button> : null}
        </div>
      ))}
      <div className="ve-assets">
        {editor.mediaList.map((m) => (
          <div key={m.id} className="ve-asset">
            <button type="button" className="vx-asset-main" onClick={() => useMedia(m)} disabled={m.status !== 'ready'}>
              <span className={`ve-asset__thumb ve-asset__thumb--${m.kind}`}>{m.kind === 'image' && editor.urls.get(m.id) ? <img src={editor.urls.get(m.id)} alt="" /> : <Icon name={m.kind === 'audio' ? 'audio' : 'video'} />}{m.source === 'ai' ? <b>AI</b> : null}</span>
              <span><strong>{m.fileName}</strong><small>{m.kind}{m.durationSec ? ` · ${fmt(m.durationSec)}` : ''}{used.has(m.id) ? ' · in use' : ''}</small></span>
            </button>
            {!used.has(m.id) ? <button type="button" className="vx-icon" aria-label={`Delete ${m.fileName}`} onClick={() => { if (window.confirm(`Delete ${m.fileName} from this project? The file cannot be brought back.`)) void deleteMedia(projectId, m); }}><Icon name="trash" /></button> : null}
          </div>
        ))}
      </div>
      {editor.mediaList.length === 0 ? <p className="ve-panel__empty">Nothing uploaded yet.</p> : null}
    </>
  );
}

// ── Text and cards ──────────────────────────────────────────────────────────

export function TextPanel({ editor }: { editor: EditorApi }) {
  const project = editor.project!;
  const t = editor.time;
  const total = sceneTimes(project.timeline.scenes).total;
  const add = (text: string, extra: Parameters<typeof newText>[4]) => {
    const start = Math.min(t, Math.max(0, total - 1));
    const item = newText(text, start, Math.min(start + 3, Math.max(start + 1, total)), topZ(project), extra);
    editor.commit((p) => ({ ...p, timeline: { ...p.timeline, texts: [...p.timeline.texts, item] } }));
    editor.select({ kind: 'text', id: item.id });
    // Its first frame is the start of its entrance, where it is still
    // invisible: show it at rest so the new text is seen where it landed.
    if (!editor.playing) editor.seek(Math.min(item.end, item.start + ENTER_SEC + 0.05));
  };
  return (
    <>
      <div className="ve-panel__head"><div><h2>Text</h2><p>Titles, names and labels over the picture</p></div></div>
      <div className="ve-template-grid">
        <button type="button" onClick={() => add(project.title, { size: 0.085, y: 0.2 })}>Big title</button>
        <button type="button" onClick={() => add('Name · Place', { size: 0.045, y: 0.72, box: 'box', weight: 600 })}>Name and place</button>
        <button type="button" onClick={() => add('Did you know?', { size: 0.05, y: 0.14, box: 'pill', boxColor: '#ef5b4c' })}>Label</button>
        <button type="button" onClick={() => add('Your words here', { size: 0.055, y: 0.5 })}>Plain text</button>
      </div>
      <div className="ve-panel__head"><div><h2>Cards</h2><p>A full-screen opening or closing</p></div></div>
      <div className="vx-row-buttons">
        <button type="button" onClick={() => { const s = newScene(titleCard(project.title), 3, { title: 'Title card' }); editor.commit(addScenes([s], 0)); editor.select({ kind: 'scene', id: s.id }); }}>+ Title card at the start</button>
        <button type="button" onClick={() => { const s = newScene(titleCard('Thank you for watching', 'end'), 3, { title: 'End card' }); editor.commit(addScenes([s])); editor.select({ kind: 'scene', id: s.id }); }}>+ End card at the end</button>
      </div>
      <p className="ve-panel__note">Text is drawn by your browser in the same place it will appear in the export. Select it on the picture to move or resize it.</p>
    </>
  );
}

// ── Sound balance ───────────────────────────────────────────────────────────

const DUCK = [
  { value: 1, label: 'Off' },
  { value: 0.6, label: 'Light' },
  { value: 0.35, label: 'Medium' },
  { value: 0.15, label: 'Strong' },
];

export function AudioPanel({ editor }: { editor: EditorApi }) {
  const mix = editor.project!.timeline.mix;
  const set = (patch: Partial<typeof mix>) => editor.commit((p) => ({ ...p, timeline: { ...p.timeline, mix: { ...p.timeline.mix, ...patch } } }));
  const slider = (label: string, key: 'sourceLevel' | 'voiceLevel' | 'musicLevel', hint: string) => (
    <label className="ve-range"><span>{label} <b>{Math.round(mix[key] * 100)}%</b></span><input type="range" min={0} max={2} step={0.05} value={mix[key]} onChange={(e) => set({ [key]: Number(e.target.value) } as Partial<typeof mix>)} aria-describedby={`hint-${key}`} /><small id={`hint-${key}`}>{hint}</small></label>
  );
  return (
    <>
      <div className="ve-panel__head"><div><h2>Sound</h2><p>Balance speech, the clips' own sound and music</p></div></div>
      {slider('Clips\' own sound', 'sourceLevel', 'The sound recorded with your footage')}
      {slider('Voice and recordings', 'voiceLevel', 'Narration and audio you uploaded')}
      {slider('Music', 'musicLevel', 'Tracks from the music library')}
      <fieldset className="ve-segmented-field"><legend>Lower the music while someone speaks</legend>
        <div className="ve-segmented" role="group">
          {DUCK.map((d) => <button type="button" key={d.label} className={Math.abs(mix.duckTo - d.value) < 0.01 ? 'is-on' : ''} aria-pressed={Math.abs(mix.duckTo - d.value) < 0.01} onClick={() => set({ duckTo: d.value })}>{d.label}</button>)}
        </div>
      </fieldset>
      <p className="ve-panel__note">The music dips under every voice recording, and under scenes you mark as speech in the inspector. Levels above 100% are applied in the export; the preview plays them at 100%. The export is balanced to the loudness social platforms expect.</p>
    </>
  );
}

// ── Continuity ──────────────────────────────────────────────────────────────

export function ContinuityPanel({ editor }: { editor: EditorApi }) {
  const { user } = useAuth();
  const project = editor.project!;
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const set = (list: ContinuityElement[]) => editor.commit((p) => ({ ...p, continuity: list }));
  const patch = (id: string, change: Partial<ContinuityElement>) => set(project.continuity.map((e) => (e.id === id ? { ...e, ...change } : e)));

  const attach = async (el: ContinuityElement, file: File | undefined) => {
    if (!file || !user) return;
    setBusy(el.id);
    setError(null);
    try {
      const path = await uploadStudioVideoAsset(user.uid, 'image', file, () => undefined);
      patch(el.id, { referencePath: path });
    } catch (e) {
      setError(errorMessage(e, 'The picture could not be uploaded.'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <div className="ve-panel__head"><div><h2>Continuity</h2><p>Keep people, places and branding the same in every AI scene</p></div></div>
      <button type="button" className="ve-panel-button" onClick={() => set([...project.continuity, { id: newId('el'), name: '', kind: 'character', description: '', referencePath: null }])}>+ Add a person, place or object</button>
      {error ? <p className="vx-panel-error" role="alert">{error}</p> : null}
      {project.continuity.length === 0 ? <p className="ve-panel__empty">Describe anyone or anything that appears in more than one scene. Each AI scene that shows it gets the same description — and your picture, if you add one.</p> : null}
      <ul className="vx-elements">
        {project.continuity.map((el) => (
          <li key={el.id}>
            <div className="ve-control-grid">
              <label><span>Name</span><input value={el.name} maxLength={60} onChange={(e) => patch(el.id, { name: e.target.value })} /></label>
              <label><span>Kind</span><select value={el.kind} onChange={(e) => patch(el.id, { kind: e.target.value as ContinuityElement['kind'] })}><option value="character">Person</option><option value="location">Place</option><option value="object">Object</option><option value="brand">Branding (every scene)</option></select></label>
            </div>
            <label className="ve-field"><span>How it looks</span><textarea rows={2} maxLength={300} value={el.description} onChange={(e) => patch(el.id, { description: e.target.value })} /></label>
            <label className="vx-file">
              <span>{busy === el.id ? 'Uploading…' : el.referencePath ? 'Reference picture added — replace' : 'Add a reference picture'}</span>
              <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => void attach(el, e.target.files?.[0])} />
            </label>
            <button type="button" className="vx-link" onClick={() => set(project.continuity.filter((x) => x.id !== el.id))}>Remove</button>
          </li>
        ))}
      </ul>
      <p className="ve-panel__note">Tick which scenes show each person, place or object in the Scenes panel. Branding applies to every scene.</p>
    </>
  );
}

export type { Selection };
