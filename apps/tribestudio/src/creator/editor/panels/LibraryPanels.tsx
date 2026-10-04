import { Icon } from '../../../interface/icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import { errorMessage, listMusicTracks, listStickers, type MusicTrack, type Sticker } from '../api';
import { ENTER_SEC } from '../looks';
import { newMusicClip, newSticker, topZ, type EditorProject } from '../model';
import type { Selection } from '../useEditor';

type Commit = (edit: (p: EditorProject) => EditorProject) => void;

export const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function Waveform({ peaks, className }: { peaks: number[]; className?: string }) {
  if (!peaks.length) return null;
  const step = Math.max(1, Math.floor(peaks.length / 60));
  const bars = peaks.filter((_, i) => i % step === 0).slice(0, 60);
  return (
    <svg className={className ?? 'vx-wave'} viewBox={`0 0 ${bars.length * 3} 20`} preserveAspectRatio="none" aria-hidden="true">
      {bars.map((v, i) => <rect key={i} x={i * 3} y={10 - Math.max(0.6, v * 9.5)} width="2" height={Math.max(1.2, v * 19)} rx="1" />)}
    </svg>
  );
}

/**
 * The music library: tracks generated with Lyria 3.5 in AZ Studio, published
 * to Firestore with their measured length, tempo and energy. Nothing in this
 * list is compiled into the page — it is whatever is published today.
 */
export function MusicPanel({ project, onCommit, onSelect, time, duration, suggestedMoods }: {
  project: EditorProject;
  onCommit: Commit;
  onSelect: (s: Selection) => void;
  time: number;
  duration: number;
  suggestedMoods: string[];
}) {
  const [tracks, setTracks] = useState<MusicTrack[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [mood, setMood] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState<string | null>(null);
  const [showTerms, setShowTerms] = useState(false);
  const audio = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    let active = true;
    void listMusicTracks().then((t) => { if (active) setTracks(t); }).catch((e) => { if (active) setError(errorMessage(e, 'The music library could not be loaded.')); });
    return () => {
      active = false;
      audio.current?.pause();
    };
  }, []);

  // The chips are the library's ten moods (cinematic, upbeat, warm…); the
  // finer words on each track are for the search box, where seventy chips
  // would be a wall rather than a filter.
  const moods = useMemo(() => {
    const all = new Set<string>();
    for (const t of tracks ?? []) if (t.group) all.add(t.group);
    const suggested = suggestedMoods.filter((m) => all.has(m));
    return [...suggested, ...[...all].filter((m) => !suggested.includes(m)).sort()];
  }, [tracks, suggestedMoods]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (tracks ?? []).filter((t) => {
      if (mood && t.group !== mood) return false;
      if (!needle) return true;
      // What the track was heard to be, not only what it was asked to be:
      // Lyria does not always follow a brief's instruments.
      return [t.title, t.description, t.group, ...t.moods].some((v) => (v ?? '').toLowerCase().includes(needle));
    });
  }, [tracks, q, mood]);

  const inUse = new Set(project.timeline.music.map((m) => m.trackId));

  const preview = (track: MusicTrack) => {
    if (previewing === track.id) {
      audio.current?.pause();
      setPreviewing(null);
      return;
    }
    audio.current?.pause();
    const el = new Audio(track.url);
    el.volume = 0.8;
    el.onended = () => setPreviewing(null);
    audio.current = el;
    void el.play().then(() => setPreviewing(track.id)).catch(() => setError('The preview could not play. Check your sound, then try again.'));
  };

  const add = (track: MusicTrack) => {
    audio.current?.pause();
    setPreviewing(null);
    const start = duration > 0 && time < duration - 1 ? Math.max(0, Math.round(time * 10) / 10) : 0;
    const clip = newMusicClip(track.id, track.title, track.durationSec, duration, start);
    onCommit((p) => ({ ...p, timeline: { ...p.timeline, music: [...p.timeline.music, clip] } }));
    onSelect({ kind: 'music', id: clip.id });
  };

  const terms = tracks?.[0]?.license;

  return (
    <>
      <div className="ve-panel__head"><div><h2>Music</h2><p>Original instrumentals for your videos</p></div></div>
      <label className="vx-search"><span className="sr-only">Search music</span><input type="search" placeholder="Search by title, mood or style" value={q} onChange={(e) => setQ(e.target.value)} /></label>
      {moods.length ? (
        <div className="vx-chips" role="group" aria-label="Filter by mood">
          <button type="button" className={mood === null ? 'is-on' : ''} aria-pressed={mood === null} onClick={() => setMood(null)}>All</button>
          {moods.map((m) => <button type="button" key={m} className={mood === m ? 'is-on' : ''} aria-pressed={mood === m} onClick={() => setMood(mood === m ? null : m)}>{m}{suggestedMoods.includes(m) ? ' ✦' : ''}</button>)}
        </div>
      ) : null}
      {error ? <p className="vx-panel-error" role="alert">{error}</p> : null}
      {tracks === null && !error ? <p className="ve-panel__empty">Loading the library…</p> : null}
      {tracks && tracks.length === 0 ? <p className="ve-panel__empty">The music library is being prepared. Meanwhile you can upload your own music from Media.</p> : null}
      <ul className="vx-tracks">
        {shown.map((t) => (
          <li key={t.id} className={`vx-track-row${inUse.has(t.id) ? ' is-used' : ''}`}>
            <button type="button" className="vx-play" aria-label={`${previewing === t.id ? 'Stop' : 'Play'} a preview of ${t.title}`} onClick={() => preview(t)}>
              <Icon name={previewing === t.id ? "pause" : "play"} />
            </button>
            <div className="vx-track-row__body">
              <strong>{t.title}{inUse.has(t.id) ? <b className="vx-badge">In use</b> : null}</strong>
              <small title={t.description || t.style}>{t.description || t.style}</small>
              <small className="vx-track-row__meta">{[fmt(t.durationSec), t.bpm ? `${t.bpm} BPM` : '', t.energy ? `${t.energy} energy` : ''].filter(Boolean).join(' · ')}</small>
              <Waveform peaks={t.peaks} />
            </div>
            <button type="button" className="vx-add" onClick={() => add(t)} aria-label={`Add ${t.title} to the video`}>Add</button>
          </li>
        ))}
      </ul>
      {tracks && tracks.length > 0 && shown.length === 0 ? <p className="ve-panel__empty">No track matches. Try another mood or word.</p> : null}
      {terms ? (
        <div className="vx-terms">
          <p>{terms.summary}</p>
          <button type="button" className="vx-link" aria-expanded={showTerms} onClick={() => setShowTerms(!showTerms)}>{showTerms ? 'Hide the conditions' : 'Conditions of use'}</button>
          {showTerms ? <ul>{terms.restrictions.map((r) => <li key={r}>{r}</li>)}</ul> : null}
        </div>
      ) : null}
    </>
  );
}

/**
 * The sticker library: cut out and checked before publishing, drawn in the
 * editor and in the export from the same PNG.
 */
export function StickerPanel({ project, onCommit, onSelect, onSeek, time, playing, duration }: {
  project: EditorProject;
  onCommit: (edit: (p: EditorProject) => EditorProject) => void;
  onSelect: (s: Selection) => void;
  onSeek: (t: number) => void;
  time: number;
  playing: boolean;
  duration: number;
}) {
  const [stickers, setStickers] = useState<Sticker[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [category, setCategory] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void listStickers().then((s) => { if (active) setStickers(s); }).catch((e) => { if (active) setError(errorMessage(e, 'The sticker library could not be loaded.')); });
    return () => { active = false; };
  }, []);

  const categories = useMemo(() => [...new Set((stickers ?? []).map((s) => s.category))], [stickers]);
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (stickers ?? []).filter((s) => (!category || s.category === category) && (!needle || [s.label, s.category, ...s.keywords].some((v) => v.toLowerCase().includes(needle))));
  }, [stickers, q, category]);

  const add = (sticker: Sticker) => {
    const start = duration > 0 ? Math.min(time, Math.max(0, duration - 1)) : 0;
    const end = Math.min(duration > 0 ? duration : start + 3, start + 3);
    const placed = newSticker(sticker.id, start, Math.max(start + 1, end), topZ(project));
    onCommit((p) => ({ ...p, timeline: { ...p.timeline, stickers: [...p.timeline.stickers, placed] } }));
    onSelect({ kind: 'sticker', id: placed.id });
    // Its first frame is the start of its entrance, where it is still
    // invisible: show it at rest so the new sticker is seen where it landed.
    if (!playing) onSeek(Math.min(placed.end, placed.start + ENTER_SEC + 0.05));
  };

  return (
    <>
      <div className="ve-panel__head"><div><h2>Stickers</h2><p>Tap one to place it at the playhead</p></div></div>
      <label className="vx-search"><span className="sr-only">Search stickers</span><input type="search" placeholder="Search stickers" value={q} onChange={(e) => setQ(e.target.value)} /></label>
      {categories.length ? (
        <div className="vx-chips" role="group" aria-label="Filter by category">
          <button type="button" className={category === null ? 'is-on' : ''} aria-pressed={category === null} onClick={() => setCategory(null)}>All</button>
          {categories.map((c) => <button type="button" key={c} className={category === c ? 'is-on' : ''} aria-pressed={category === c} onClick={() => setCategory(category === c ? null : c)}>{c}</button>)}
        </div>
      ) : null}
      {error ? <p className="vx-panel-error" role="alert">{error}</p> : null}
      {stickers === null && !error ? <p className="ve-panel__empty">Loading stickers…</p> : null}
      {stickers && stickers.length === 0 ? <p className="ve-panel__empty">The sticker library is being prepared.</p> : null}
      <div className="vx-sticker-grid">
        {shown.map((s) => (
          <button type="button" key={s.id} className="vx-sticker" onClick={() => add(s)} title={s.label} aria-label={`Add sticker: ${s.altText}`}>
            <img src={s.url} alt="" loading="lazy" />
          </button>
        ))}
      </div>
      {stickers && stickers.length > 0 && shown.length === 0 ? <p className="ve-panel__empty">No sticker matches.</p> : null}
      {stickers && stickers.length > 0 ? <p className="ve-panel__note">Drag a sticker on the picture to move it; use the corner to resize and the knob to rotate. Set when it appears in the inspector.</p> : null}
    </>
  );
}
