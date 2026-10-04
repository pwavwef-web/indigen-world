import { WorkspaceDialog } from '../../interface/WorkspaceFrame';
import { Icon, type IconName } from '../../interface/icons';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { canMakeVideo, useAuth } from '../../auth';
import { matchRoute, useRoute } from '../../router';
import { AI_CONSENT_VERSION, type AiConsent } from './ai';
import { listMusicTracks, listStickers, saveConsent, type MusicTrack, type Sticker } from './api';
import { ExportDialog } from './ExportDialog';
import { Inspector } from './Inspector';
import { duplicateScene, removeLayer, removeScene, sceneAt, splitSceneAt } from './model';
import { CaptionsPanel } from './panels/CaptionsPanel';
import { MusicPanel, StickerPanel, fmt } from './panels/LibraryPanels';
import { AudioPanel, ContinuityPanel, MediaPanel, ScenesPanel, TextPanel } from './panels/ProjectPanels';
import { Stage } from './Stage';
import { Timeline } from './Timeline';
import { useAiScenes } from './useAiScenes';
import { useEditor } from './useEditor';
import '../pages/video-editor.css';
import './editor.css';

type Tab = 'scenes' | 'media' | 'music' | 'stickers' | 'text' | 'captions' | 'audio' | 'continuity';

const TABS: { id: Tab; label: string; icon: IconName }[] = [
  { id: 'scenes', label: 'Scenes', icon: 'assignments' },
  { id: 'media', label: 'Media', icon: 'upload' },
  { id: 'music', label: 'Music', icon: 'music' },
  { id: 'stickers', label: 'Stickers', icon: 'spark' },
  { id: 'text', label: 'Text', icon: 'doc' },
  { id: 'captions', label: 'Captions', icon: 'translation' },
  { id: 'audio', label: 'Sound', icon: 'sound' },
  { id: 'continuity', label: 'Continuity', icon: 'shield' },
];

const SAVE_LABEL = { saved: 'Saved', saving: 'Saving…', unsaved: 'Unsaved changes', error: 'Not saved — retry', loading: 'Opening…' } as const;

function ConsentDialog({ onConfirm, onCancel }: { onConfirm: (c: AiConsent) => void; onCancel: () => void }) {
  const [rights, setRights] = useState(false);
  const [cultural, setCultural] = useState(false);
  const [person, setPerson] = useState(false);
  const [personConsent, setPersonConsent] = useState(false);
  const [dialect, setDialect] = useState('');
  const ready = rights && cultural && (!person || personConsent);
  return (
    <WorkspaceDialog title="Before making AI video" onClose={onCancel} className="vx-export">
        <p className="vx-export__lede">These are the same statements the AI Video page asks for. They are saved with this project and sent with each scene you generate.</p>
        <label className="ve-check"><input type="checkbox" checked={rights} onChange={(e) => setRights(e.target.checked)} />I have the right to use everything I describe or upload, and I allow it to be processed by an AI video service.</label>
        <label className="ve-check"><input type="checkbox" checked={cultural} onChange={(e) => setCultural(e.target.checked)} />Nothing I ask for shows sacred or restricted cultural material without the permission of the people it belongs to.</label>
        <label className="ve-check"><input type="checkbox" checked={person} onChange={(e) => setPerson(e.target.checked)} />A reference picture I use shows a recognisable real person.</label>
        {person ? <label className="ve-check"><input type="checkbox" checked={personConsent} onChange={(e) => setPersonConsent(e.target.checked)} />That person agreed to take part and to their likeness being used.</label> : null}
        <label className="ve-field"><span>Kasem dialect spoken in the video, if any</span><input value={dialect} maxLength={80} placeholder="For example Paga, Chiana, Navrongo — or leave empty" onChange={(e) => setDialect(e.target.value)} /></label>
        <p className="ve-panel__note">Children and third-party material are not supported by AI video.</p>
        <div className="vx-sheet__actions">
          <button type="button" onClick={onCancel}>Cancel</button>
          <button type="button" disabled={!ready} onClick={() => onConfirm({
            dialect: dialect.trim() || 'Unspecified',
            confirmedAt: new Date().toISOString(),
            governance: {
              aiProcessingPermission: true,
              rightsConfirmed: true,
              culturalPermissionConfirmed: true,
              participantConsentConfirmed: person ? personConsent : false,
              voiceConsentConfirmed: false,
              likenessConsentConfirmed: person ? personConsent : false,
              containsRecognisablePerson: person,
              involvesMinors: false,
              usesThirdPartyMaterial: false,
              consentVersion: AI_CONSENT_VERSION,
            },
          })}>Confirm</button>
        </div>
    </WorkspaceDialog>
  );
}

/** The editor for the project named in the address: /studio/editor/{projectId}. */
export function EditorPage() {
  const { role } = useAuth();
  const { navigate, path } = useRoute();
  const projectId = matchRoute('/studio/editor/:projectId', path)?.projectId ?? '';
  const canVideo = canMakeVideo(role);
  const editor = useEditor(projectId);
  const ai = useAiScenes(editor, projectId, canVideo && Boolean(editor.project));
  const [tab, setTab] = useState<Tab>('scenes');
  const [pickFor, setPickFor] = useState<string | null>(null);
  const [exporting, setExporting] = useState<null | 'export' | 'preview'>(null);
  const [zoom, setZoom] = useState(1);
  const [stickers, setStickers] = useState<Map<string, Sticker>>(new Map());
  const [tracks, setTracks] = useState<Map<string, MusicTrack>>(new Map());
  const [consentThen, setConsentThen] = useState<((c: AiConsent) => void) | null>(null);
  const project = editor.project;

  useEffect(() => {
    void listStickers().then((list) => setStickers(new Map(list.map((s) => [s.id, s])))).catch(() => undefined);
    void listMusicTracks().then((list) => setTracks(new Map(list.map((t) => [t.id, t])))).catch(() => undefined);
  }, []);
  const stickerNames = useMemo(() => new Map([...stickers].map(([id, s]) => [id, s.label])), [stickers]);

  // Keyboard: space plays, S splits, Delete removes, Ctrl/⌘Z undoes.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('dialog, input, textarea, select, [contenteditable="true"]')) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) editor.redo();
        else editor.undo();
        return;
      }
      if (event.key === ' ') {
        event.preventDefault();
        if (editor.time >= editor.duration - 0.05) editor.seek(0);
        editor.setPlaying(!editor.playing);
      }
      if (event.key.toLowerCase() === 's' && !event.ctrlKey && !event.metaKey) editor.commit(splitSceneAt(editor.time));
      if ((event.key === 'Delete' || event.key === 'Backspace') && editor.selection) {
        const sel = editor.selection;
        editor.commit(sel.kind === 'scene' ? removeScene(sel.id) : removeLayer(sel.id));
        editor.select(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editor]);

  const suggestedMoods = useMemo(() => editor.plan?.musicMoods ?? [], [editor.plan]);

  if (editor.missing) {
    return <div className="ve page vx-message"><h1>This project was not found</h1><p>It may have been deleted, or it belongs to another account.</p><button type="button" onClick={() => navigate('/studio/editor')}>Your videos</button></div>;
  }
  if (editor.loadError) {
    return <div className="ve page vx-message"><h1>This project could not be opened</h1><p>{editor.loadError}</p><button type="button" onClick={() => window.location.reload()}>Try again</button></div>;
  }
  if (!project) return <div className="ve page vx-message"><p>Opening your project…</p></div>;

  const consent = (editor.consent as unknown as AiConsent | null) ?? null;
  const askConsent = (then: (c: AiConsent) => void) => setConsentThen(() => then);
  const replace = (sceneId: string) => {
    setPickFor(sceneId);
    setTab('media');
  };
  const current = sceneAt(project.timeline.scenes, editor.time);

  let panel: ReactNode = null;
  if (tab === 'scenes') panel = <ScenesPanel editor={editor} ai={ai} canVideo={canVideo} consent={consent} askConsent={askConsent} onPickMedia={replace} />;
  if (tab === 'media') panel = <MediaPanel editor={editor} projectId={projectId} pickFor={pickFor} onPicked={() => { setPickFor(null); setTab('scenes'); }} />;
  if (tab === 'music') panel = <MusicPanel project={project} onCommit={editor.commit} onSelect={editor.select} time={editor.time} duration={editor.duration} suggestedMoods={suggestedMoods} />;
  if (tab === 'stickers') panel = <StickerPanel project={project} onCommit={editor.commit} onSelect={editor.select} onSeek={editor.seek} time={editor.time} playing={editor.playing} duration={editor.duration} />;
  if (tab === 'text') panel = <TextPanel editor={editor} />;
  if (tab === 'captions') panel = <CaptionsPanel editor={editor} projectId={projectId} />;
  if (tab === 'audio') panel = <AudioPanel editor={editor} />;
  if (tab === 'continuity') panel = <ContinuityPanel editor={editor} />;

  const toolbar = (
    <>
      <div>
        <button type="button" disabled={!current} onClick={() => editor.commit(splitSceneAt(editor.time))} title="Split the scene at the playhead (S)">Split <kbd>S</kbd></button>
        <button type="button" disabled={editor.selection?.kind !== 'scene'} onClick={() => editor.selection && editor.commit(duplicateScene(editor.selection.id))}>Duplicate</button>
        <button type="button" disabled={!editor.selection} onClick={() => { const sel = editor.selection; if (!sel) return; editor.commit(sel.kind === 'scene' ? removeScene(sel.id) : removeLayer(sel.id)); editor.select(null); }}>Delete</button>
      </div>
      <label><span>Zoom</span><input type="range" min={0.4} max={3} step={0.2} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} /></label>
    </>
  );

  return (
    <div className="ve page vx">{editor.recovery ? <section className="vx-recovery" role="status"><div><strong>Unsaved video edits found on this device</strong><p>{'Compare the saved project before restoring this local copy. No saved work is replaced until you choose.'}</p></div><button type="button" onClick={editor.restoreRecovery}>Restore local draft</button><button type="button" onClick={editor.discardRecovery}>Keep saved project</button></section> : null}
      {editor.mediaError || editor.previewError ? <div className="vx-recovery" role="alert"><div><strong>{editor.mediaError ? 'The media library could not be loaded.' : 'Some media previews could not be loaded.'}</strong><p>Your edits remain open. Retry before relying on the preview.</p></div><button type="button" onClick={editor.retryMedia}>Retry media</button></div> : null}
      <header className="ve-topbar">
        <div className="ve-project">
          <button type="button" className="ve-back" aria-label="Back to your videos" onClick={() => navigate('/studio/editor')}><Icon name="back" /></button>
          <label><span>Video editor · {project.aspect}</span><input aria-label="Project name" value={project.title} maxLength={120} onChange={(e) => editor.commit((p) => ({ ...p, title: e.target.value }))} /></label>
        </div>
        <div className="ve-topbar__tools">
          <button type="button" className={`ve-save-state vx-save vx-save--${editor.saveState}`} onClick={() => editor.saveState === 'error' && void editor.retrySave()} aria-live="polite">{SAVE_LABEL[editor.saveState]}</button>
          <button type="button" className="ve-icon-button" aria-label="Undo" title="Undo (Ctrl/⌘ Z)" disabled={!editor.canUndo} onClick={editor.undo}><Icon name="undo" /></button>
          <button type="button" className="ve-icon-button" aria-label="Redo" title="Redo (Ctrl/⌘ Shift Z)" disabled={!editor.canRedo} onClick={editor.redo}><Icon name="redo" /></button>
          <button type="button" className="vx-secondary" disabled={project.timeline.scenes.length === 0} onClick={() => setExporting('preview')}>Preview render</button>
          <button type="button" className="ve-export-button" disabled={project.timeline.scenes.length === 0} onClick={() => setExporting('export')}>Export</button>
        </div>
      </header>

      <div className={`ve-workspace${editor.selection ? '' : ' ve-workspace--no-inspector'}`}>
        <nav className="ve-toolrail" aria-label="Editing tools">
          {TABS.map((t) => (
            <button type="button" key={t.id} className={tab === t.id ? 'is-on' : ''} aria-pressed={tab === t.id} onClick={() => { setTab(t.id); if (t.id !== 'media') setPickFor(null); }}>
              <Icon name={t.icon} /><span>{t.label}</span>
            </button>
          ))}
        </nav>
        <aside className="ve-library" aria-label={TABS.find((t) => t.id === tab)?.label}>{panel}</aside>
        <section className="ve-stage-area" aria-label="Video preview">
          <Stage
            project={project}
            media={editor.media}
            urls={editor.urls}
            stickers={stickers}
            tracks={tracks}
            time={editor.time}
            playing={editor.playing}
            selection={editor.selection}
            onSelect={editor.select}
            onCommit={editor.commit}
            onEmptyClick={() => setTab('media')}
          />
          <div className="ve-playback">
            <button type="button" className="ve-transport" disabled={editor.duration <= 0} aria-label={editor.playing ? 'Pause' : 'Play'} onClick={() => { if (editor.time >= editor.duration - 0.05) editor.seek(0); editor.setPlaying(!editor.playing); }}><Icon name={editor.playing ? 'pause' : 'play'} /></button>
            <span className="ve-time"><strong>{fmt(editor.time)}.{Math.floor((editor.time % 1) * 10)}</strong> / {fmt(editor.duration)}</span>
            <input type="range" min={0} max={Math.max(editor.duration, 0.1)} step={0.01} value={editor.time} aria-label="Playhead" onChange={(e) => editor.seek(Number(e.target.value))} />
          </div>
        </section>
        <Inspector editor={editor} stickers={stickers} tracks={tracks} onReplace={replace} />
        <Timeline project={project} media={editor.media} stickerNames={stickerNames} time={editor.time} zoom={zoom} selection={editor.selection} onSelect={editor.select} onSeek={editor.seek} onCommit={editor.commit} toolbar={toolbar} />
      </div>

      {exporting ? <ExportDialog editor={editor} projectId={projectId} preview={exporting === 'preview'} onClose={() => setExporting(null)} /> : null}
      {consentThen ? (
        <ConsentDialog
          onCancel={() => setConsentThen(null)}
          onConfirm={(c) => {
            const then = consentThen;
            setConsentThen(null);
            editor.setConsent(c as unknown as Record<string, unknown>);
            void saveConsent(projectId, c as unknown as Record<string, unknown>);
            then(c);
          }}
        />
      ) : null}
    </div>
  );
}
