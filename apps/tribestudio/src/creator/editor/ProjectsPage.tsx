import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../auth';
import { useQueryParam, useRoute } from '../../router';
import { fetchStudioVideoJob } from '../data';
import {
  addAiMedia,
  createProject,
  deleteProject,
  errorMessage,
  listProjects,
  planScenes,
  saveProject,
  uploadMedia,
  type ProjectSummary,
} from './api';
import {
  ASPECTS,
  cuesFromScenePlan,
  newId,
  newProject,
  newScene,
  setCues,
  titleCard,
  type Aspect,
  type EditorProject,
  type ProjectOrigin,
} from './model';
import { fmt } from './panels/LibraryPanels';
import '../pages/video-editor.css';
import './editor.css';

/**
 * Your videos, and the way into a new one.
 *
 * A project can start from an idea (the planner writes the scenes), a script
 * (the planner splits it, word for word), footage (each clip becomes a
 * scene), a recording or song (it becomes the soundtrack, with scenes to fill
 * over it and its words ready to time as captions), or nothing at all.
 * Everything after this page is saved as it happens.
 */

const STARTS: { id: ProjectOrigin; label: string; hint: string }[] = [
  { id: 'prompt', label: 'From an idea', hint: 'Describe the video; the scenes are planned for you' },
  { id: 'script', label: 'From a script', hint: 'Paste your words; they are split into scenes unchanged' },
  { id: 'footage', label: 'From footage', hint: 'Upload clips or pictures; each becomes a scene' },
  { id: 'audio', label: 'From a recording', hint: 'A song or narration becomes the soundtrack' },
  { id: 'blank', label: 'Blank project', hint: 'Start with an empty timeline' },
];

function NewVideo({ onClose }: { onClose: () => void }) {
  const { user } = useAuth();
  const { navigate } = useRoute();
  const [origin, setOrigin] = useState<ProjectOrigin>('prompt');
  const [title, setTitle] = useState('');
  const [aspect, setAspect] = useState<Aspect>('9:16');
  const [seconds, setSeconds] = useState(45);
  const [text, setText] = useState('');
  const [captions, setCaptions] = useState(true);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const create = async () => {
    if (!user) return;
    setError(null);
    try {
      let project: EditorProject = newProject(title, aspect, origin);
      let plan: { musicMoods: string[]; method: string | null } | null = null;
      if (origin === 'prompt' || origin === 'script') {
        setBusy(origin === 'prompt' ? 'Planning your scenes…' : 'Splitting your script into scenes…');
        const reply = await planScenes({ source: origin, text, aspect, targetSeconds: seconds });
        const continuity = reply.continuity.map((c) => ({ id: newId('el'), name: c.name, kind: c.kind, description: c.description, referencePath: null }));
        const scenes = reply.scenes.map((s) => newScene(null, s.durationSec, {
          title: s.title,
          plan: { visual: s.visual, narration: s.narration, caption: s.caption },
          transitionIn: { type: s.transition, duration: s.transition === 'cut' ? 0 : 0.5 },
          elements: continuity.filter((c) => c.kind !== 'brand' && `${s.visual} ${s.narration}`.toLowerCase().includes(c.name.toLowerCase())).map((c) => c.id),
        }));
        project = { ...project, title: title.trim() || reply.title, continuity, timeline: { ...project.timeline, scenes } };
        if (captions) project = setCues(cuesFromScenePlan(project), 'scene-plan')(project);
        plan = { musicMoods: reply.musicMoods, method: reply.method };
      }
      setBusy('Creating the project…');
      const projectId = await createProject(user.uid, project, plan);

      if ((origin === 'footage' || origin === 'audio') && files.length) {
        const scenes = [...project.timeline.scenes];
        const voice = [...project.timeline.voice];
        for (const [i, file] of files.entries()) {
          setBusy(`Uploading ${i + 1} of ${files.length}: ${file.name}`);
          const m = await uploadMedia(user.uid, projectId, file, (pct) => setBusy(`Uploading ${i + 1} of ${files.length}: ${file.name} · ${pct}%`));
          if (m.kind === 'audio') {
            voice.push({ id: newId('voice'), mediaId: m.id, label: m.fileName, start: 0, sourceIn: 0, duration: Math.max(0.5, m.durationSec), volume: 1, fadeIn: 0.05, fadeOut: 0.3 });
            // Scenes to fill over the recording: a title card, then five-second
            // gaps waiting for pictures, lasting as long as the audio does.
            if (!scenes.length) {
              scenes.push(newScene(titleCard(project.title), Math.min(4, m.durationSec), { title: 'Title card' }));
              let at = scenes[0]!.duration;
              while (at < m.durationSec - 0.5) {
                const length = Math.min(5, m.durationSec - at);
                scenes.push(newScene(null, Math.max(0.5, length), { title: `Scene ${scenes.length + 1}` }));
                at += length;
              }
            }
          } else {
            const scene = newScene({ kind: m.kind, mediaId: m.id }, m.kind === 'video' ? Math.min(60, Math.max(0.5, m.durationSec || 5)) : 4, { title: m.fileName.replace(/\.[^.]+$/, '').slice(0, 40) });
            if (m.width && m.height && aspect !== (m.width > m.height ? '16:9' : m.width < m.height ? '9:16' : '1:1')) scene.fit = 'blur';
            scenes.push(scene);
          }
        }
        project = { ...project, timeline: { ...project.timeline, scenes, voice } };
        await saveProject(projectId, project, 2);
      }
      navigate(`/studio/editor/${projectId}`);
    } catch (e) {
      setBusy(null);
      setError(errorMessage(e, 'The project could not be created. Try again.'));
    }
  };

  const needsText = origin === 'prompt' || origin === 'script';
  const needsFiles = origin === 'footage' || origin === 'audio';
  const ready = (!needsText || text.trim().length >= 8) && (!needsFiles || files.length > 0);

  return (
    <div className="vx-sheet" role="dialog" aria-modal="true" aria-labelledby="vx-new-title">
      <button type="button" className="vx-sheet__backdrop" aria-label="Close" onClick={onClose} disabled={Boolean(busy)} />
      <div className="vx-sheet__card vx-export vx-new">
        <div className="vx-export__head"><h2 id="vx-new-title">New video</h2><button type="button" className="vx-icon" aria-label="Close" onClick={onClose} disabled={Boolean(busy)}>×</button></div>
        <fieldset className="vx-choice"><legend>Start</legend>
          {STARTS.map((s) => (
            <label key={s.id} className={origin === s.id ? 'is-on' : ''}>
              <input type="radio" name="origin" checked={origin === s.id} onChange={() => { setOrigin(s.id); setFiles([]); }} />
              <strong>{s.label}</strong><small>{s.hint}</small>
            </label>
          ))}
        </fieldset>
        <label className="ve-field"><span>Title</span><input value={title} maxLength={120} placeholder={needsText && origin === 'prompt' ? 'Leave empty to use the planner’s title' : 'Untitled video'} onChange={(e) => setTitle(e.target.value)} /></label>
        <fieldset className="vx-choice vx-choice--row"><legend>Shape</legend>
          {ASPECTS.map((a) => <label key={a.id} className={aspect === a.id ? 'is-on' : ''}><input type="radio" name="new-aspect" checked={aspect === a.id} onChange={() => setAspect(a.id)} /><strong>{a.label}</strong><small>{a.hint}</small></label>)}
        </fieldset>
        {needsText ? (
          <>
            <label className="ve-field"><span>{origin === 'prompt' ? 'What is the video about?' : 'Your script'}</span>
              <textarea rows={origin === 'script' ? 9 : 5} value={text} maxLength={6000} onChange={(e) => setText(e.target.value)} placeholder={origin === 'prompt' ? 'For example: a one-minute welcome to the Paga crocodile pond for visitors, warm and respectful, ending with how to visit.' : 'Paste the words that will be spoken. They are kept exactly as written.'} />
            </label>
            {origin === 'prompt' ? <label className="ve-range"><span>Length <b>about {seconds} s</b></span><input type="range" min={15} max={180} step={5} value={seconds} onChange={(e) => setSeconds(Number(e.target.value))} /></label> : null}
            <label className="ve-check"><input type="checkbox" checked={captions} onChange={(e) => setCaptions(e.target.checked)} />Add captions from the narration (you can time them to a recording later)</label>
            <p className="ve-panel__note">The planner writes in English, or uses only your own words. It never invents Kasem.</p>
          </>
        ) : null}
        {needsFiles ? (
          <>
            <input ref={fileInput} className="ve-file-input" type="file" multiple={origin === 'footage'} accept={origin === 'footage' ? 'video/*,image/png,image/jpeg,image/webp' : 'audio/*'} onChange={(e) => setFiles(Array.from(e.target.files ?? []))} />
            <button type="button" className="ve-import" onClick={() => fileInput.current?.click()}><span><strong>{files.length ? `${files.length} file${files.length === 1 ? '' : 's'} chosen` : origin === 'footage' ? 'Choose clips or pictures' : 'Choose a recording or song'}</strong><small>{files.map((f) => f.name).join(', ') || 'They stay private until you post'}</small></span></button>
          </>
        ) : null}
        {busy ? <p className="vx-export__status" role="status">{busy}</p> : null}
        {error ? <p className="vx-panel-error" role="alert">{error}</p> : null}
        <div className="vx-sheet__actions">
          <button type="button" onClick={onClose} disabled={Boolean(busy)}>Cancel</button>
          <button type="button" disabled={!ready || Boolean(busy)} onClick={() => void create()}>Create →</button>
        </div>
      </div>
    </div>
  );
}

export function ProjectsPage() {
  const { user } = useAuth();
  const { navigate } = useRoute();
  const job = useQueryParam('job');
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [opening, setOpening] = useState<string | null>(null);

  const load = () => {
    if (!user) return;
    setError(null);
    void listProjects(user.uid).then(setProjects).catch((e) => setError(errorMessage(e, 'Your videos could not be loaded.')));
  };
  useEffect(load, [user]);

  // "Open in the editor" from Your videos: a new project around that AI video.
  useEffect(() => {
    if (!user || !job) return;
    let active = true;
    setOpening('Opening your AI video in a new project…');
    void (async () => {
      try {
        const found = await fetchStudioVideoJob(job);
        if (!found?.outputStoragePath) throw new Error('That AI video has not finished yet.');
        const project = newProject(found.prompt?.slice(0, 60) || 'AI video edit', '9:16', 'ai-video');
        const projectId = await createProject(user.uid, project);
        const m = await addAiMedia(projectId, { id: found.id, outputStoragePath: found.outputStoragePath, durationSec: 8, prompt: found.prompt ?? '' });
        await saveProject(projectId, { ...project, timeline: { ...project.timeline, scenes: [newScene({ kind: 'video', mediaId: m.id }, 8, { title: 'AI video' })] } }, 2);
        if (active) navigate(`/studio/editor/${projectId}`, { replace: true });
      } catch (e) {
        if (active) {
          setOpening(null);
          setError(errorMessage(e, 'That AI video could not be opened.'));
        }
      }
    })();
    return () => { active = false; };
  }, [user, job, navigate]);

  const remove = async (p: ProjectSummary) => {
    if (!window.confirm(`Delete “${p.title}” with its uploads and exports? This cannot be undone.`)) return;
    try {
      await deleteProject(p.id);
      load();
    } catch (e) {
      setError(errorMessage(e, 'The project could not be deleted.'));
    }
  };

  return (
    <div className="ve page vx vx-projects">
      <header className="vx-projects__head">
        <div><h1>Video editor</h1><p>Reels, clips and longer videos — saved as you work, rendered to MP4 for any platform.</p></div>
        <button type="button" className="ve-export-button" onClick={() => setCreating(true)}>+ New video</button>
      </header>
      {opening ? <p className="vx-export__status" role="status">{opening}</p> : null}
      {error ? <p className="vx-panel-error" role="alert">{error} <button type="button" className="vx-link" onClick={load}>Try again</button></p> : null}
      {projects === null && !error ? <p className="ve-panel__empty">Loading your videos…</p> : null}
      {projects && projects.length === 0 ? (
        <div className="vx-projects__empty">
          <strong>No videos yet</strong>
          <span>Start from an idea, a script, your footage or a recording.</span>
          <button type="button" className="ve-export-button" onClick={() => setCreating(true)}>Make your first video</button>
        </div>
      ) : null}
      <ul className="vx-project-grid">
        {(projects ?? []).map((p) => (
          <li key={p.id} className="vx-project-card">
            <button type="button" className="vx-project-card__open" onClick={() => navigate(`/studio/editor/${p.id}`)}>
              <span className={`vx-frame-badge vx-frame-badge--${p.aspect.replace(':', 'x')}`} aria-hidden="true" />
              <strong>{p.title}</strong>
              <small>{ASPECTS.find((a) => a.id === p.aspect)?.label} · {p.sceneCount} scene{p.sceneCount === 1 ? '' : 's'} · {fmt(p.durationSec)}</small>
              <small>{p.lastRender ? `Last export ${p.lastRender.status}${p.lastRender.finishedAt ? ` · ${new Date(p.lastRender.finishedAt).toLocaleDateString()}` : ''}` : 'Not exported yet'} · edited {p.updatedAt ? new Date(p.updatedAt).toLocaleDateString() : ''}</small>
            </button>
            <button type="button" className="vx-link" onClick={() => void remove(p)}>Delete</button>
          </li>
        ))}
      </ul>
      {creating ? <NewVideo onClose={() => setCreating(false)} /> : null}
    </div>
  );
}
