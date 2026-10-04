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
import { Badge, Button, Dialog, EmptyState, Icon, Notice, PageHeader, SkeletonCards, Steps, spotlight } from '../../ui';

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
  const [createdId, setCreatedId] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const sending = useRef(false);
  const create = async () => {
    if (!user || sending.current || createdId) return; sending.current = true;
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
      setCreatedId(projectId);

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
      sending.current = false; setBusy(null);
      setError(errorMessage(e, 'The project could not be created. Try again.'));
    }
  };

  const needsText = origin === 'prompt' || origin === 'script';
  const needsFiles = origin === 'footage' || origin === 'audio';
  const ready = (!needsText || text.trim().length >= 8) && (!needsFiles || files.length > 0);

  return (
    <Dialog title="New video" lede="Choose how to start. Everything after this is saved as you work." onClose={onClose} busy={Boolean(busy)} size="lg" className="cr-newvideo">
      <div className="ts-stack">
        <fieldset className="cr-fieldset">
          <legend className="ts-label">Start</legend>
          <div className="cr-choices">
            {STARTS.map((s) => (
              <label key={s.id} className={origin === s.id ? 'cr-choice is-on' : 'cr-choice'}>
                <input type="radio" name="origin" checked={origin === s.id} onChange={() => { setOrigin(s.id); setFiles([]); }} />
                <strong>{s.label}</strong><span>{s.hint}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="ts-field">
          <label className="ts-label" htmlFor="new-video-title">Title</label>
          <input id="new-video-title" className="ts-input" value={title} maxLength={120} placeholder={needsText && origin === 'prompt' ? 'Leave empty to use the planner’s title' : 'Untitled video'} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <fieldset className="cr-fieldset">
          <legend className="ts-label">Shape</legend>
          <div className="cr-choices cr-choices--compact">
            {ASPECTS.map((a) => (
              <label key={a.id} className={aspect === a.id ? 'cr-choice cr-choice--compact is-on' : 'cr-choice cr-choice--compact'}>
                <input type="radio" name="new-aspect" checked={aspect === a.id} onChange={() => setAspect(a.id)} />
                <strong><span className={`cr-aspect cr-aspect--${a.id.replace(":", "x")}`} aria-hidden="true" />{a.label}</strong>
                <span>{a.hint}</span>
              </label>
            ))}
          </div>
        </fieldset>
        {needsText ? (
          <>
            <div className="ts-field">
              <label className="ts-label" htmlFor="new-video-text">{origin === 'prompt' ? 'What is the video about?' : 'Your script'}</label>
              <textarea id="new-video-text" className="ts-textarea" rows={origin === 'script' ? 9 : 5} value={text} maxLength={6000} onChange={(e) => setText(e.target.value)} placeholder={origin === 'prompt' ? 'For example: a one-minute welcome to the Paga crocodile pond for visitors, warm and respectful, ending with how to visit.' : 'Paste the words that will be spoken. They are kept exactly as written.'} />
            </div>
            {origin === 'prompt' ? (
              <div className="ts-field">
                <label className="ts-label" htmlFor="new-video-length">Length <span className="ts-num cr-range-value">about {seconds} s</span></label>
                <input id="new-video-length" className="cr-range" type="range" min={15} max={180} step={5} value={seconds} onChange={(e) => setSeconds(Number(e.target.value))} />
              </div>
            ) : null}
            <label className="ts-check ts-check--card"><input type="checkbox" checked={captions} onChange={(e) => setCaptions(e.target.checked)} /><span className="ts-check__copy">Add captions from the narration (you can time them to a recording later)</span></label>
            <p className="ts-hint">The planner writes in English, or uses only your own words. It never invents Kasem.</p>
          </>
        ) : null}
        {needsFiles ? (
          <div className="ts-drop">
            <span className="ts-drop__icon" aria-hidden="true"><Icon name={origin === 'footage' ? 'film' : 'audio'} /></span>
            <span className="ts-drop__title">{files.length ? `${files.length} file${files.length === 1 ? '' : 's'} chosen` : origin === 'footage' ? 'Choose clips or pictures' : 'Choose a recording or song'}</span>
            <span className="ts-truncate">{files.map((f) => f.name).join(', ') || 'They stay private until you post'}</span>
            <input ref={fileInput} type="file" aria-label={origin === 'footage' ? 'Choose clips or pictures' : 'Choose a recording or song'} multiple={origin === 'footage'} accept={origin === 'footage' ? 'video/*,image/png,image/jpeg,image/webp' : 'audio/*'} onChange={(e) => setFiles(Array.from(e.target.files ?? []))} />
          </div>
        ) : null}
        {busy ? <p className="ts-save is-saving" role="status"><span className="ts-save__mark" aria-hidden="true" />{busy}</p> : null}
        {error ? <Notice tone="danger" role="alert">{error}{createdId ? ' Your project and successful uploads are saved. Open it to continue and retry any missing media.' : ''}</Notice> : null}
        <div className="cr-dialog-actions">
          <button type="button" className="ts-btn ts-btn--ghost" onClick={onClose} disabled={Boolean(busy)}>Cancel</button>
          {createdId && error
            ? <button type="button" className="ts-btn ts-btn--secondary" onClick={() => navigate('/studio/editor/' + createdId)}>Open saved project</button>
            : <button type="button" className="ts-btn ts-btn--primary" disabled={!ready || Boolean(busy)} onClick={() => void create()}>Create<Icon name="arrow" /></button>}
        </div>
      </div>
    </Dialog>
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
    <div className="ts-page cr-projects">
      <PageHeader
        kicker="Your work"
        title="Video projects"
        description="Reels, clips and longer videos — saved as you work, rendered to MP4 for any platform."
        actions={<Button variant="primary" icon="plus" onClick={() => setCreating(true)}>New video</Button>}
      />
      <section className="ts-panel ts-panel--tight cr-projects__guide" aria-label="Video project workflow">
        <Steps label="Video project workflow" steps={[
          { title: 'Build your scenes', detail: 'Footage, script, recording or a blank timeline', icon: 'layers' },
          { title: 'Edit and preview', detail: 'Arrange media, sound and captions', icon: 'film' },
          { title: 'Export', detail: 'Render an MP4 or create a post', icon: 'upload' },
        ]} />
      </section>
      {opening ? <p className="ts-save is-saving" role="status"><span className="ts-save__mark" aria-hidden="true" />{opening}</p> : null}
      {error ? <Notice tone="danger" role="alert" action={<button type="button" className="ts-btn ts-btn--secondary ts-btn--sm" onClick={load}>Try again</button>}>{error}</Notice> : null}
      {projects === null && !error ? <SkeletonCards count={3} label="Loading your videos" /> : null}
      {projects && projects.length === 0 ? (
        <EmptyState
          boxed
          icon="film"
          title="No videos yet"
          body="Start from an idea, a script, your footage or a recording."
          actions={<Button variant="primary" icon="plus" onClick={() => setCreating(true)}>Make your first video</Button>}
        />
      ) : null}
      {projects && projects.length > 0 ? (
        <ul className="cr-projects__grid ts-stagger">
          {projects.map((p) => (
            <li key={p.id} className="ts-card cr-project ts-spotlight" onPointerMove={spotlight}>
              <button type="button" className="cr-project__open" onClick={() => navigate(`/studio/editor/${p.id}`)}>
                <span className="cr-project__frame" aria-hidden="true">
                  <span className={`cr-aspect cr-aspect--${p.aspect.replace(":", "x")}`} />
                  <span className="cr-project__duration ts-num">{fmt(p.durationSec)}</span>
                </span>
                <strong className="cr-project__title ts-clamp-2">{p.title}</strong>
                <small>{ASPECTS.find((a) => a.id === p.aspect)?.label} · {p.sceneCount} scene{p.sceneCount === 1 ? '' : 's'}</small>
                <small className="cr-project__edited">Edited {p.updatedAt ? new Date(p.updatedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '—'}</small>
              </button>
              <div className="cr-project__foot">
                <Badge tone={p.lastRender?.status === 'succeeded' ? 'success' : p.lastRender?.status === 'failed' ? 'danger' : 'neutral'} dot>
                  {p.lastRender ? `Last export ${p.lastRender.status}` : 'Not exported yet'}
                </Badge>
                <button type="button" className="ts-btn ts-btn--danger-ghost ts-btn--sm" onClick={() => void remove(p)}><Icon name="trash" />Delete</button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
      {creating ? <NewVideo onClose={() => { setCreating(false); load(); }} /> : null}
    </div>
  );
}
