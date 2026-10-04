import { useAuth } from '../../auth';
import { readEditorRecovery, writeEditorRecovery, clearEditorRecovery, type EditorRecovery } from './recovery';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { loadProject, mediaUrl, saveProject, subscribeLastRender, subscribeMedia, type ProjectPlanInfo, type ProjectSummary } from './api';
import { totalDuration, type EditorProject, type ProjectMedia } from './model';

export type SaveState = 'saved' | 'saving' | 'unsaved' | 'error' | 'loading';

export type Selection =
  | { kind: 'scene'; id: string }
  | { kind: 'text'; id: string }
  | { kind: 'sticker'; id: string }
  | { kind: 'cue'; id: string }
  | { kind: 'voice'; id: string }
  | { kind: 'music'; id: string }
  | null;

type Edit = (project: EditorProject) => EditorProject;

/**
 * One open project: its state, its history, its media, and its saving.
 *
 * Every change goes through [commit], which pushes the previous state onto the
 * undo stack and marks the project unsaved; a save follows a moment after the
 * last change, so dragging a sticker across the frame is one write, not sixty.
 * A failed save is retried on the next change and said out loud in the top
 * bar — the member must never believe a project is safe when it is not.
 */
export function useEditor(projectId: string) {
  const { user } = useAuth(); const uid = user?.uid || '';
  const [recovery, setRecovery] = useState<EditorRecovery | null>(null);
  const saving = useRef(false);
  const recoverable = useRef(true);
  const [project, setProject] = useState<EditorProject | null>(null);
  const [missing, setMissing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('loading');
  const [consent, setConsent] = useState<Record<string, unknown> | null>(null);
  const [plan, setPlan] = useState<ProjectPlanInfo | null>(null);
  const [lastRender, setLastRender] = useState<ProjectSummary['lastRender']>(null);
  const [mediaList, setMediaList] = useState<ProjectMedia[]>([]);
  const [mediaError, setMediaError] = useState(false);
  const [mediaAttempt, setMediaAttempt] = useState(0);
  const [previewError, setPreviewError] = useState(false);
  const [previewAttempt, setPreviewAttempt] = useState(0);
  const [urls, setUrls] = useState<Map<string, string>>(new Map());
  const [selection, setSelection] = useState<Selection>(null);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const history = useRef<EditorProject[]>([]);
  const future = useRef<EditorProject[]>([]);
  const revision = useRef(1);
  const dirty = useRef(false);
  const saveTimer = useRef<number | null>(null);
  const latest = useRef<EditorProject | null>(null);
  const [, bump] = useState(0);

  useEffect(() => {
    let active = true;
    setProject(null);
    setMissing(false);
    setLoadError(null);
    setSaveState('loading');
    void loadProject(projectId)
      .then((loaded) => {
        if (!active) return;
        if (!loaded) {
          setMissing(true);
          return;
        }
        revision.current = loaded.revision;
        latest.current = loaded.project;
        setProject(loaded.project);
        setConsent(loaded.consent);
        setPlan(loaded.plan);
        setSaveState('saved');
        setRecovery(readEditorRecovery(uid, projectId));
      })
      .catch((e: unknown) => {
        if (active) setLoadError(e instanceof Error ? e.message : 'This project could not be opened.');
      });
    const stopRender = subscribeLastRender(projectId, setLastRender);
    return () => {
      active = false;
      stopRender();
    };
  }, [projectId, uid]);

  useEffect(() => {
    setMediaError(false);
    return subscribeMedia(projectId, setMediaList, () => setMediaError(true));
  }, [projectId, mediaAttempt]);

  const media = useMemo(() => new Map(mediaList.map((m) => [m.id, m])), [mediaList]);

  // Playable URLs for the preview, fetched once per file.
  useEffect(() => {
    let active = true;
    for (const m of mediaList) {
      if (m.status !== 'ready' || urls.has(m.id)) continue;
      void mediaUrl(m)
        .then((url) => {
          if (active) setUrls((current) => new Map(current).set(m.id, url));
        })
        .catch(() => { if (active) setPreviewError(true); });
    }
    return () => {
      active = false;
    };
  }, [mediaList, urls, previewAttempt]);

  const flush = useCallback(async () => {
    const current = latest.current;
    if (!current || !dirty.current || saving.current) return;
    saving.current = true;
    dirty.current = false;
    setSaveState('saving');
    try {
      revision.current += 1;
      await saveProject(projectId, current, revision.current);
      if (!dirty.current) clearEditorRecovery(uid, projectId);
      setSaveState(dirty.current ? 'unsaved' : 'saved');
    } catch {
      dirty.current = true;
      setSaveState('error');
    } finally { saving.current = false; if (dirty.current && latest.current !== current) saveTimer.current = window.setTimeout(() => void flush(), 900); }
  }, [projectId, uid]);

  const scheduleSave = useCallback(() => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => void flush(), 900);
  }, [flush]);

  // Save on the way out, and warn about a tab closed mid-save.
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty.current && !saving.current) return;
      void flush();
      event.preventDefault();
      event.returnValue = '';
    };
    const beforeNavigate = (event: Event) => {
      if ((dirty.current || saving.current) && !recoverable.current && !window.confirm('This video has unsaved changes and browser recovery is unavailable. Leave and risk losing them?')) { event.preventDefault(); return; }
      void flush();
    };
    window.addEventListener('studio:before-navigate', beforeNavigate);
    window.addEventListener('beforeunload', beforeUnload);
    return () => {
      window.removeEventListener('studio:before-navigate', beforeNavigate);
      window.removeEventListener('beforeunload', beforeUnload);
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      void flush();
    };
  }, [flush]);

  const commit = useCallback((edit: Edit) => {
    const current = latest.current;
    if (!current) return;
    const next = edit(current);
    if (next === current) return;
    history.current.push(current);
    if (history.current.length > 80) history.current.shift();
    future.current = [];
    latest.current = next;
    recoverable.current = writeEditorRecovery(uid, projectId, next, revision.current);
    dirty.current = true;
    setProject(next);
    setSaveState('unsaved');
    scheduleSave();
  }, [scheduleSave, uid, projectId]);

  /**
   * A change the member did not make — an AI video finishing, an upload
   * landing — saved like any other but kept out of the undo history, so undo
   * never takes back something that happened on its own.
   */
  const apply = useCallback((edit: Edit) => {
    const current = latest.current;
    if (!current) return;
    const next = edit(current);
    if (next === current) return;
    latest.current = next;
    history.current = history.current.map(edit);
    recoverable.current = writeEditorRecovery(uid, projectId, next, revision.current);
    dirty.current = true;
    setProject(next);
    setSaveState('unsaved');
    scheduleSave();
  }, [scheduleSave, uid, projectId]);

  const undo = useCallback(() => {
    const previous = history.current.pop();
    if (!previous || !latest.current) return;
    future.current.push(latest.current);
    latest.current = previous;
    recoverable.current = writeEditorRecovery(uid, projectId, previous, revision.current);
    dirty.current = true;
    setProject(previous);
    setSaveState('unsaved');
    scheduleSave();
    bump((n) => n + 1);
  }, [scheduleSave, uid, projectId]);

  const redo = useCallback(() => {
    const next = future.current.pop();
    if (!next || !latest.current) return;
    history.current.push(latest.current);
    latest.current = next;
    recoverable.current = writeEditorRecovery(uid, projectId, next, revision.current);
    dirty.current = true;
    setProject(next);
    setSaveState('unsaved');
    scheduleSave();
    bump((n) => n + 1);
  }, [scheduleSave, uid, projectId]);

  const duration = project ? totalDuration(project) : 0;

  // The playback clock. The picture and sound follow it; it does not follow them.
  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    const started = performance.now() - time * 1000;
    const tick = (now: number) => {
      const t = (now - started) / 1000;
      if (t >= duration) {
        setTime(duration);
        setPlaying(false);
        return;
      }
      setTime(t);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
    // Restarting the clock on every tick would drift; it restarts when play starts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, duration]);

  const seek = useCallback((t: number) => {
    setPlaying(false);
    setTime(Math.max(0, Math.min(t, duration)));
  }, [duration]);

  return {
    project,
    recovery,
    restoreRecovery: () => {
      if (!recovery) return;
      if (latest.current) history.current.push(latest.current);
      latest.current = recovery.project; dirty.current = true;
      recoverable.current = writeEditorRecovery(uid, projectId, recovery.project, revision.current);
      setProject(recovery.project); setRecovery(null); setSaveState('unsaved'); scheduleSave();
    },
    discardRecovery: () => { clearEditorRecovery(uid, projectId); setRecovery(null); },
    missing,
    loadError,
    saveState,
    retrySave: flush,
    consent,
    setConsent,
    plan,
    lastRender,
    mediaError,
    previewError,
    retryMedia: () => { setMediaAttempt(value => value + 1); setPreviewError(false); setPreviewAttempt(value => value + 1); },
    media,
    mediaList,
    urls,
    selection,
    select: setSelection,
    time,
    seek,
    setTime,
    playing,
    setPlaying,
    duration,
    commit,
    apply,
    undo,
    redo,
    canUndo: history.current.length > 0,
    canRedo: future.current.length > 0,
  };
}

export type EditorApi = ReturnType<typeof useEditor>;
