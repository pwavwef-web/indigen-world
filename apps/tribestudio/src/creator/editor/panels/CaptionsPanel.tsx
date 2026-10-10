import { useEffect, useMemo, useRef, useState } from 'react';
import { alignCaptions, errorMessage } from '../api';
import {
  cuesFromScenePlan,
  newId,
  patchCue,
  sceneTimes,
  setCues,
  shiftCues,
  type CaptionStyle,
  type CaptionTrack,
  type EditorProject,
} from '../model';
import type { EditorApi } from '../useEditor';
import { KasemField } from '../../../spelling/KasemField';

/**
 * Captions and lyrics: timed to the real audio, then corrected by hand.
 *
 * Pasted words — a script, lyrics, a Kasem transcript — are never changed; they
 * are laid over the speech the server hears in the chosen audio. English and
 * French can instead be transcribed. Either way the result is a first pass:
 * every cue is on the timeline to drag and trim, the list below edits words
 * and times, and "Tap along" re-times cue starts by ear while the video plays.
 */

const STYLES: { id: CaptionStyle; label: string; hint: string }[] = [
  { id: 'subtitle', label: 'Subtitle', hint: 'A dark box, easy to read anywhere' },
  { id: 'bold', label: 'Bold words', hint: 'Big capitals, the spoken word lights up' },
  { id: 'karaoke', label: 'Karaoke', hint: 'Words fill with colour as they are sung' },
  { id: 'minimal', label: 'Minimal', hint: 'Small outlined text, no box' },
];

const LANGUAGES = [
  { id: 'xsm', label: 'Kasem' },
  { id: 'en', label: 'English' },
  { id: 'fr', label: 'French' },
  { id: 'other', label: 'Another language' },
];

type Source = { key: string; label: string; source: { kind: 'media'; mediaId: string } | { kind: 'track'; trackId: string }; clipStart: number; sourceIn: number; duration: number };

function sourcesFor(project: EditorProject, media: EditorApi['media']): Source[] {
  const out: Source[] = [];
  for (const v of project.timeline.voice) {
    out.push({ key: `voice:${v.id}`, label: `Voice · ${v.label || 'recording'}`, source: { kind: 'media', mediaId: v.mediaId }, clipStart: v.start, sourceIn: v.sourceIn, duration: v.duration });
  }
  const { starts } = sceneTimes(project.timeline.scenes);
  project.timeline.scenes.forEach((s, i) => {
    if (s.media?.kind !== 'video' || s.speed !== 1) return;
    const m = media.get(s.media.mediaId);
    if (!m?.hasAudio || m.source === 'ai') return;
    out.push({ key: `scene:${s.id}`, label: `Scene ${i + 1} sound · ${s.title || m.fileName}`, source: { kind: 'media', mediaId: m.id }, clipStart: starts[i]!, sourceIn: s.sourceIn, duration: s.duration });
  });
  return out;
}

export function CaptionsPanel({ editor, projectId }: { editor: EditorApi; projectId: string }) {
  const project = editor.project!;
  const track = project.timeline.captions;
  const sources = useMemo(() => sourcesFor(project, editor.media), [project, editor.media]);
  const [sourceKey, setSourceKey] = useState<string>('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [tapping, setTapping] = useState(false);
  const tapIndex = useRef(0);
  const source = sources.find((s) => s.key === sourceKey) ?? sources[0] ?? null;

  const setTrack = (patch: Partial<CaptionTrack>) => editor.commit((p) => ({ ...p, timeline: { ...p.timeline, captions: { ...p.timeline.captions, ...patch } } }));

  const time = async () => {
    if (!source) return;
    setBusy(true);
    setMessage(null);
    try {
      const reply = await alignCaptions({ projectId, source: source.source, clipStart: source.clipStart, sourceIn: source.sourceIn, duration: source.duration, text: text.trim(), language: track.language === 'other' ? 'xx' : track.language });
      if (reply.cues.length === 0) {
        setMessage({ tone: 'error', text: 'No speech was found in that audio. Choose another recording, or time the words by hand.' });
        return;
      }
      editor.commit(setCues(reply.cues, reply.method));
      setMessage({ tone: 'ok', text: reply.method === 'transcript' ? `Transcribed and timed ${reply.cues.length} captions. Check the words and the timing below.` : `Timed ${reply.cues.length} lines to where speech is heard. Play it through and correct anything that is off.` });
    } catch (e) {
      setMessage({ tone: 'error', text: errorMessage(e, 'The captions could not be timed. Try again, or time them by hand.') });
    } finally {
      setBusy(false);
    }
  };

  const fromPlan = () => {
    const cues = cuesFromScenePlan(project);
    if (!cues.length) {
      setMessage({ tone: 'error', text: 'No scene has narration or a caption in its plan yet.' });
      return;
    }
    editor.commit(setCues(cues, 'scene-plan'));
    setMessage({ tone: 'ok', text: `Added ${cues.length} captions from the scene plan, one per scene.` });
  };

  const addCue = () => {
    const start = Math.round(editor.time * 10) / 10;
    editor.commit((p) => ({ ...p, timeline: { ...p.timeline, captions: { ...p.timeline.captions, method: 'manual', cues: [...p.timeline.captions.cues, { id: newId('cue'), start, end: start + 2, text: 'New caption', words: null }].sort((a, b) => a.start - b.start) } } }));
  };

  // Tap along: every tap starts the next cue at the playhead and ends the last one there.
  useEffect(() => {
    if (!tapping) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Enter' && event.key !== 't') return;
      event.preventDefault();
      const cues = editor.project!.timeline.captions.cues;
      const i = tapIndex.current;
      if (i >= cues.length) {
        setTapping(false);
        editor.setPlaying(false);
        return;
      }
      const now = Math.round(editor.time * 100) / 100;
      const cue = cues[i]!;
      const length = Math.max(0.6, cue.end - cue.start);
      editor.commit((p) => {
        let next = patchCue(cue.id, { start: now, end: now + length })(p);
        if (i > 0) next = patchCue(cues[i - 1]!.id, { end: now })(next);
        return next;
      });
      tapIndex.current = i + 1;
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tapping, editor]);

  const startTapping = () => {
    if (!track.cues.length) return;
    tapIndex.current = 0;
    editor.seek(Math.max(0, track.cues[0]!.start - 2));
    setTapping(true);
    window.setTimeout(() => editor.setPlaying(true), 50);
  };

  return (
    <>
      <div className="ve-panel__head"><div><h2>Captions and lyrics</h2><p>Timed to the audio, then checked by you</p></div></div>
      <label className="ve-field"><span>Time them to</span>
        <select value={source?.key ?? ''} onChange={(e) => setSourceKey(e.target.value)} disabled={sources.length === 0}>
          {sources.length === 0 ? <option value="">Add a voice recording or a clip with sound first</option> : sources.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
      </label>
      <label className="ve-field"><span>Language</span>
        <select value={track.language} onChange={(e) => setTrack({ language: e.target.value })}>{LANGUAGES.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}</select>
      </label>
      <label className="ve-field"><span>The words (script or lyrics)</span>
        <KasemField enabled={track.language === 'xsm'} rows={6} value={text} onChange={(e) => setText(e.target.value)} placeholder={track.language === 'xsm' ? 'Paste the Kasem words, one line per caption. They are timed to the audio as written.' : 'Paste the words, one line per caption — or leave empty to transcribe English or French.'} />
      </label>
      <button type="button" className="ve-panel-button ve-panel-button--primary" disabled={busy || !source || (!text.trim() && !['en', 'fr'].includes(track.language))} onClick={() => void time()}>
        {busy ? 'Listening to the audio…' : text.trim() ? 'Time these words to the audio' : 'Transcribe and time'}
      </button>
      {!text.trim() && !['en', 'fr'].includes(track.language) ? <p className="ve-panel__note">Speech in {LANGUAGES.find((l) => l.id === track.language)?.label ?? 'this language'} cannot be transcribed automatically yet. Paste the words and they will be timed to the audio.</p> : null}
      <div className="vx-row-buttons">
        <button type="button" onClick={fromPlan}>Use the scene plan</button>
        <button type="button" onClick={addCue}>+ Caption at playhead</button>
      </div>
      {message ? <p className={message.tone === 'error' ? 'vx-panel-error' : 'vx-panel-ok'} role={message.tone === 'error' ? 'alert' : 'status'}>{message.text}</p> : null}

      <div className="ve-panel__head"><div><h2>Style</h2><p>How captions look in the video</p></div></div>
      <div className="vx-style-grid" role="radiogroup" aria-label="Caption style">
        {STYLES.map((s) => (
          <button type="button" role="radio" aria-checked={track.style === s.id} key={s.id} className={track.style === s.id ? 'is-on' : ''} onClick={() => setTrack({ style: s.id })}>
            <strong>{s.label}</strong><small>{s.hint}</small>
          </button>
        ))}
      </div>
      <div className="ve-segmented" role="group" aria-label="Caption position">
        {(['top', 'middle', 'bottom'] as const).map((p) => <button type="button" key={p} className={track.position === p ? 'is-on' : ''} aria-pressed={track.position === p} onClick={() => setTrack({ position: p })}>{p[0]!.toUpperCase() + p.slice(1)}</button>)}
      </div>
      <label className="ve-range"><span>Size <b>{Math.round(track.size * 1000) / 10}%</b></span><input type="range" min={0.03} max={0.09} step={0.005} value={track.size} onChange={(e) => setTrack({ size: Number(e.target.value) })} /></label>
      <div className="ve-control-grid">
        <label><span>Text</span><input type="color" value={track.color} onChange={(e) => setTrack({ color: e.target.value })} /></label>
        <label><span>Highlight</span><input type="color" value={track.highlight} onChange={(e) => setTrack({ highlight: e.target.value })} /></label>
      </div>

      <div className="ve-panel__head"><div><h2>Timing</h2><p>{track.cues.length} caption{track.cues.length === 1 ? '' : 's'}{track.method ? ` · ${track.method === 'manual' ? 'edited by hand' : track.method === 'transcript' ? 'transcribed' : track.method === 'scene-plan' ? 'from the scene plan' : 'timed to speech'}` : ''}</p></div></div>
      {track.cues.length ? (
        <>
          <div className="vx-row-buttons">
            <button type="button" onClick={() => editor.commit(shiftCues(-0.1))} aria-label="All captions 0.1 seconds earlier">−0.1 s all</button>
            <button type="button" onClick={() => editor.commit(shiftCues(0.1))} aria-label="All captions 0.1 seconds later">+0.1 s all</button>
            <button type="button" onClick={() => (tapping ? (setTapping(false), editor.setPlaying(false)) : startTapping())} aria-pressed={tapping}>{tapping ? 'Stop tapping' : 'Tap along'}</button>
          </div>
          {tapping ? <p className="vx-panel-ok" role="status">Press Enter (or T) each time a line begins. Caption {Math.min(tapIndex.current + 1, track.cues.length)} of {track.cues.length} is next.</p> : null}
          <ol className="vx-cues">
            {track.cues.map((c) => (
              <li key={c.id} className={editor.selection?.kind === 'cue' && editor.selection.id === c.id ? 'is-selected' : ''}>
                <button type="button" className="vx-cue-time" onClick={() => { editor.select({ kind: 'cue', id: c.id }); editor.seek(c.start); }}>{c.start.toFixed(1)}–{c.end.toFixed(1)}</button>
                <KasemField as="input" enabled={track.language === 'xsm'} aria-label="Caption text" value={c.text} onChange={(e) => editor.commit(patchCue(c.id, { text: e.target.value }))} />
              </li>
            ))}
          </ol>
        </>
      ) : <p className="ve-panel__empty">No captions yet.</p>}
    </>
  );
}
