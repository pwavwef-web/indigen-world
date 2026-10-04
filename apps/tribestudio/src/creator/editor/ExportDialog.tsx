import { WorkspaceDialog } from '../../interface/WorkspaceFrame';
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../auth';
import { useRoute } from '../../router';
import {
  cancelRender,
  copyRenderForPost,
  errorMessage,
  listRenders,
  renderUrl,
  retryRender,
  startRender,
  subscribeRender,
  uploadLayers,
  type RenderDoc,
} from './api';
import { ASPECTS, exportProblems, totalDuration, type Aspect } from './model';
import { buildRenderJob, frameSize, type Quality, type Resolution } from './render-job';
import type { EditorApi } from './useEditor';

/**
 * Exporting: from the project to a finished MP4.
 *
 * The browser draws the text, captions and cards for the chosen frame, uploads
 * them, and hands the renderer the spec; everything after that happens on the
 * server, so the member can close the tab and find the finished file here
 * later. Progress, failures and retries are read from the render document the
 * renderer writes.
 */

const QUALITIES: { id: Quality; label: string; hint: string }[] = [
  { id: 'standard', label: 'Standard', hint: 'Good for social feeds; smaller file' },
  { id: 'high', label: 'High', hint: 'Sharper; best for YouTube and archives' },
];

const PLATFORM_HINT: Record<Aspect, string> = {
  '9:16': 'TikTok, Instagram Reels, YouTube Shorts, WhatsApp Status',
  '1:1': 'Instagram and Facebook feed posts',
  '16:9': 'YouTube, websites and presentations',
};

function describe(r: RenderDoc): string {
  const s = r.settings;
  const size = frameSize(s);
  return `${s.aspect} · ${r.quality === 'draft' ? 'preview' : `${s.resolution} ${r.quality}`} · ${size.width}×${size.height}`;
}

export function ExportDialog({ editor, projectId, preview: openAsPreview, onClose }: { editor: EditorApi; projectId: string; preview: boolean; onClose: () => void }) {
  const { user } = useAuth();
  const { navigate } = useRoute();
  const project = editor.project!;
  // A preview can be followed by the real export without closing the dialog.
  const [preview, setPreview] = useState(openAsPreview);
  const [aspect, setAspect] = useState<Aspect>(project.aspect);
  const [resolution, setResolution] = useState<Resolution>('1080p');
  const [quality, setQuality] = useState<Quality>(preview ? 'draft' : 'standard');
  const [phase, setPhase] = useState<'choose' | 'drawing' | 'uploading' | 'starting' | 'watching'>('choose');
  const [uploaded, setUploaded] = useState<{ done: number; total: number }>({ done: 0, total: 0 });
  const [renderId, setRenderId] = useState<string | null>(null);
  const [render, setRender] = useState<RenderDoc | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [video, setVideo] = useState<string | null>(null);
  const [history, setHistory] = useState<RenderDoc[]>([]);
  const [posting, setPosting] = useState(false);
  const problems = useMemo(() => exportProblems(project, editor.media), [project, editor.media]);
  const blocked = problems.some((p) => p.level === 'block');
  const duration = totalDuration(project);

  useEffect(() => {
    if (!user) return;
    void listRenders(user.uid, projectId).then(setHistory).catch(() => undefined);
  }, [user, projectId, renderId]);

  useEffect(() => {
    if (!renderId) return;
    return subscribeRender(renderId, (r) => {
      setRender(r);
      if (r?.status === 'succeeded') {
        void renderUrl(r.id).then((x) => setVideo(x.url)).catch((e) => setError(errorMessage(e, 'The finished video could not be opened.')));
      }
    });
  }, [renderId]);

  const start = async () => {
    if (!user) return;
    setError(null);
    setVideo(null);
    const requestId = crypto.randomUUID();
    const settings = { aspect, resolution, quality: preview ? ('draft' as const) : quality };
    try {
      setPhase('drawing');
      const job = await buildRenderJob(project, settings, { uid: user.uid, projectId, requestId });
      setPhase('uploading');
      setUploaded({ done: 0, total: job.uploads.length });
      await uploadLayers(job.uploads, (done, total) => setUploaded({ done, total }));
      setPhase('starting');
      const started = await startRender({ projectId, requestId, spec: job.spec, settings });
      setRenderId(started.id);
      setPhase('watching');
    } catch (e) {
      setPhase('choose');
      setError(errorMessage(e, 'The export could not start. Try again.'));
    }
  };

  const open = async (r: RenderDoc) => {
    setRenderId(r.id);
    setPhase('watching');
    setVideo(null);
  };

  const download = async () => {
    if (!render) return;
    try {
      const { url } = await renderUrl(render.id, true);
      window.location.assign(url);
    } catch (e) {
      setError(errorMessage(e, 'The download link could not be made.'));
    }
  };

  const post = async () => {
    if (!render) return;
    setPosting(true);
    try {
      const path = await copyRenderForPost(render.id);
      navigate(`/studio/submissions/new?generated=${encodeURIComponent(path)}&edited=1`);
    } catch (e) {
      setError(errorMessage(e, 'The video could not be prepared for posting.'));
      setPosting(false);
    }
  };

  const running = render && (render.status === 'queued' || render.status === 'rendering');
  const size = frameSize({ aspect, resolution, quality: preview ? 'draft' : quality });

  return (
    <WorkspaceDialog title={preview ? 'Preview render' : 'Export video'} onClose={onClose} className="vx-export">

        {phase === 'choose' ? (
          <>
            {preview ? <p className="vx-export__lede">A quick, lower-resolution render made by the same renderer as the export — the most exact preview of the finished file.</p> : null}
            <fieldset className="vx-choice"><legend>Shape</legend>
              {ASPECTS.map((a) => (
                <label key={a.id} className={aspect === a.id ? 'is-on' : ''}>
                  <input type="radio" name="aspect" value={a.id} checked={aspect === a.id} onChange={() => setAspect(a.id)} />
                  <strong>{a.label} {a.id}</strong><small>{PLATFORM_HINT[a.id]}</small>
                </label>
              ))}
            </fieldset>
            {aspect !== project.aspect ? <p className="ve-panel__note">This project is laid out for {project.aspect}. Text, captions and stickers keep their positions relative to the frame; check the preview render before posting.</p> : null}
            {!preview ? (
              <>
                <fieldset className="vx-choice vx-choice--row"><legend>Resolution</legend>
                  {(['720p', '1080p'] as const).map((r) => <label key={r} className={resolution === r ? 'is-on' : ''}><input type="radio" name="resolution" checked={resolution === r} onChange={() => setResolution(r)} /><strong>{r}</strong></label>)}
                </fieldset>
                <fieldset className="vx-choice vx-choice--row"><legend>Quality</legend>
                  {QUALITIES.map((q) => <label key={q.id} className={quality === q.id ? 'is-on' : ''}><input type="radio" name="quality" checked={quality === q.id} onChange={() => setQuality(q.id)} /><strong>{q.label}</strong><small>{q.hint}</small></label>)}
                </fieldset>
              </>
            ) : null}
            <p className="vx-export__summary">{size.width}×{size.height} · {Math.floor(duration / 60)}:{String(Math.round(duration % 60)).padStart(2, '0')} · MP4 (H.264, AAC){preview ? '' : ' · loudness balanced for social platforms'}</p>
            {problems.length ? (
              <ul className="vx-problems">
                {problems.map((p, i) => <li key={i} className={`vx-problem vx-problem--${p.level}`}>{p.message}</li>)}
              </ul>
            ) : null}
            {error ? <p className="vx-panel-error" role="alert">{error}</p> : null}
            <div className="vx-sheet__actions">
              <button type="button" onClick={onClose}>Cancel</button>
              <button type="button" disabled={blocked || editor.saveState === 'error'} onClick={() => void start()}>{preview ? 'Render preview' : 'Export'} →</button>
            </div>
          </>
        ) : null}

        {phase === 'drawing' ? <p className="vx-export__status" role="status">Drawing text and captions…</p> : null}
        {phase === 'uploading' ? <div className="ve-export-progress"><span style={{ width: `${uploaded.total ? (uploaded.done / uploaded.total) * 100 : 0}%` }} /><small>Sending text and captions · {uploaded.done} of {uploaded.total}</small></div> : null}
        {phase === 'starting' ? <p className="vx-export__status" role="status">Starting the render…</p> : null}

        {phase === 'watching' && render ? (
          <div className="vx-export__render">
            <p className="vx-export__summary">{describe(render)}</p>
            {running ? (
              <>
                <div className="ve-export-progress" aria-live="polite"><span style={{ width: `${Math.round(render.progress * 100)}%` }} /><small>{render.stage ?? 'Working'} · you can close this and come back</small></div>
                <button type="button" className="vx-link" onClick={() => void cancelRender(render.id)}>Cancel this export</button>
              </>
            ) : null}
            {render.status === 'failed' || render.status === 'cancelled' ? (
              <>
                <p className="vx-panel-error" role="alert">{render.error?.message ?? 'The export did not finish.'}</p>
                <div className="vx-sheet__actions">
                  <button type="button" onClick={() => setPhase('choose')}>Change settings</button>
                  {render.error?.retryable !== false ? <button type="button" onClick={() => void retryRender(render.id).catch((e) => setError(errorMessage(e, 'It could not be retried.')))}>Try again</button> : null}
                </div>
              </>
            ) : null}
            {render.status === 'succeeded' ? (
              <>
                {video ? <video className="vx-export__video" controls playsInline src={video} style={{ aspectRatio: render.settings.aspect.replace(':', '/') }} /> : <p className="vx-export__status">Opening the video…</p>}
                <p className="vx-export__summary">{render.output ? `${(render.output.bytes / (1024 * 1024)).toFixed(1)} MB · ${render.output.width}×${render.output.height} · ${render.output.durationSec.toFixed(1)} s · checked after rendering` : ''}</p>
                <div className="vx-sheet__actions">
                  {render.quality === 'draft' ? <button type="button" onClick={() => { setPreview(false); setQuality('standard'); setRender(null); setRenderId(null); setVideo(null); setPhase('choose'); }}>Export in full quality</button> : <button type="button" onClick={() => void download()}>Download MP4</button>}
                  {render.quality !== 'draft' ? <button type="button" disabled={posting} onClick={() => void post()}>{posting ? 'Preparing…' : 'Post to TribeStudio →'}</button> : null}
                </div>
                <small className="vx-export__note">Exports are kept for 30 days, and the newest three of each project.</small>
              </>
            ) : null}
            {error ? <p className="vx-panel-error" role="alert">{error}</p> : null}
          </div>
        ) : null}

        {history.length ? (
          <details className="vx-history">
            <summary>Earlier exports of this project ({history.length})</summary>
            <ul>
              {history.map((r) => (
                <li key={r.id}>
                  <span>{new Date(r.createdAt).toLocaleString()} · {describe(r)}</span>
                  <b className={`vx-status vx-status--${r.status === 'succeeded' ? 'ok' : r.status === 'failed' ? 'bad' : 'wait'}`}>{r.expired ? 'expired' : r.status}</b>
                  {!r.expired ? <button type="button" className="vx-link" onClick={() => void open(r)}>Open</button> : null}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
    </WorkspaceDialog>
  );
}
