import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Icon } from './components';
import { audioProblem } from './data';

/**
 * Record a short take in the browser, or choose an audio file instead.
 *
 * The take stays in this tab until the page sends it, so a failed upload
 * never costs the recording: the parent keeps the blob and can retry. The
 * microphone is released the moment recording stops and when the component
 * goes away, including when permission arrives after it has unmounted.
 */

export const MAX_RECORDING_MS = 30_000;
export const MIN_RECORDING_MS = 500;

export interface CapturedAudio {
  file: File;
  url: string;
  durationMs: number;
  source: 'recorded' | 'uploaded';
}

function extensionFor(type: string): string {
  if (type.includes('mp4') || type.includes('m4a') || type.includes('aac')) return 'm4a';
  if (type.includes('ogg')) return 'ogg';
  if (type.includes('mpeg')) return 'mp3';
  return 'webm';
}

/** Reads a file's duration from its metadata; resolves 0 when the browser cannot tell. */
function measure(url: string): Promise<number> {
  return new Promise((resolve) => {
    const audio = new Audio();
    const done = (value: number) => { audio.removeAttribute('src'); resolve(value); };
    audio.preload = 'metadata';
    audio.onloadedmetadata = () => done(Number.isFinite(audio.duration) ? Math.round(audio.duration * 1000) : 0);
    audio.onerror = () => done(0);
    audio.src = url;
  });
}

export function AudioCapture({ value, onChange, disabled = false, label = 'Recording' }: {
  value: CapturedAudio | null;
  onChange: (value: CapturedAudio | null) => void;
  disabled?: boolean;
  label?: string;
}) {
  const [recording, setRecording] = useState(false);
  const [starting, setStarting] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState('');
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const startedAt = useRef(0);
  const timer = useRef<number | null>(null);
  const mounted = useRef(true);
  const fileInput = useRef<HTMLInputElement>(null);

  const release = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (timer.current !== null) window.clearInterval(timer.current);
    timer.current = null;
  };

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      const recorder = recorderRef.current;
      if (recorder) {
        recorder.ondataavailable = null;
        recorder.onstop = null;
        if (recorder.state !== 'inactive') recorder.stop();
      }
      release();
    };
  }, []);

  const stop = () => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') recorder.stop();
  };

  const start = async () => {
    if (starting || recording || disabled) return;
    setError('');
    setStarting(true);
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
        throw new Error('This browser cannot record audio. Choose an audio file instead.');
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      if (!mounted.current) { stream.getTracks().forEach((track) => track.stop()); return; }
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      chunks.current = [];
      recorder.ondataavailable = (event) => { if (event.data.size > 0) chunks.current.push(event.data); };
      recorder.onstop = () => {
        const durationMs = Date.now() - startedAt.current;
        release();
        if (!mounted.current) return;
        setRecording(false);
        const type = recorder.mimeType || chunks.current[0]?.type || 'audio/webm';
        const blob = new Blob(chunks.current, { type });
        if (durationMs < MIN_RECORDING_MS || !blob.size) {
          setError('That was too short to hear. Hold the button a moment longer, then say the word.');
          return;
        }
        const file = new File([blob], `recording-${Date.now()}.${extensionFor(type)}`, { type });
        if (value?.url) URL.revokeObjectURL(value.url);
        onChange({ file, url: URL.createObjectURL(blob), durationMs: Math.min(durationMs, MAX_RECORDING_MS), source: 'recorded' });
      };
      startedAt.current = Date.now();
      recorder.start(250);
      setRecording(true);
      setElapsed(0);
      timer.current = window.setInterval(() => {
        const spent = Date.now() - startedAt.current;
        setElapsed(spent);
        if (spent >= MAX_RECORDING_MS) stop();
      }, 200);
    } catch (reason) {
      release();
      const name = (reason as { name?: string })?.name;
      if (mounted.current) {
        setError(name === 'NotAllowedError' || name === 'SecurityError'
          ? 'Microphone access was blocked. Allow the microphone for this site in your browser settings, or choose an audio file instead.'
          : name === 'NotFoundError'
            ? 'No microphone was found. Connect one, or choose an audio file instead.'
            : reason instanceof Error ? reason.message : 'Recording could not start.');
      }
    } finally {
      if (mounted.current) setStarting(false);
    }
  };

  const choose = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const problem = audioProblem(file);
    if (problem) { setError(problem); return; }
    setError('');
    const url = URL.createObjectURL(file);
    const durationMs = await measure(url);
    if (durationMs && durationMs > MAX_RECORDING_MS + 1_000) {
      URL.revokeObjectURL(url);
      setError('That file is longer than 30 seconds. Trim it to just the word, or record it here.');
      return;
    }
    if (value?.url) URL.revokeObjectURL(value.url);
    onChange({ file, url, durationMs: durationMs || 1_000, source: 'uploaded' });
  };

  const discard = () => {
    if (value?.url) URL.revokeObjectURL(value.url);
    onChange(null);
  };

  const seconds = Math.floor(elapsed / 1000);
  return (
    <div className="cw-recorder" aria-label={label} role="group">
      {value ? (
        <div className="cw-recorder__take">
          <audio controls src={value.url} preload="metadata" aria-label={`${label}: your take`} />
          <div className="cw-recorder__meta">
            <span className="cw-small cw-muted">{value.source === 'recorded' ? 'Recorded here' : value.file.name} · {(value.durationMs / 1000).toFixed(1)} s</span>
            <div className="cw-inline-actions">
              <button type="button" className="cw-btn--sm" disabled={disabled} onClick={() => { discard(); void start(); }}><Icon name="mic" className="cw-icon--sm" />Record again</button>
              <button type="button" className="cw-btn--sm cw-btn--ghost" disabled={disabled} onClick={discard}><Icon name="trash" className="cw-icon--sm" />Remove</button>
            </div>
          </div>
        </div>
      ) : (
        <div className="cw-recorder__controls">
          {recording ? (
            <button type="button" className="cw-recorder__button is-recording" onClick={stop} aria-label="Stop recording">
              <Icon name="stop" />Stop
            </button>
          ) : (
            <button type="button" className="cw-recorder__button" disabled={disabled || starting} onClick={() => void start()}>
              <Icon name="mic" />{starting ? 'Allow the microphone…' : 'Record'}
            </button>
          )}
          <div className="cw-recorder__status" aria-live="polite">
            {recording ? (
              <><span className="cw-recorder__live" aria-hidden="true" /><span className="cw-tabular">Recording · 0:{String(seconds).padStart(2, '0')} of 0:30</span></>
            ) : <span className="cw-muted cw-small">Up to 30 seconds. Nothing is sent until you choose Send.</span>}
          </div>
          {!recording ? (
            <>
              <button type="button" className="cw-link-button" disabled={disabled} onClick={() => fileInput.current?.click()}>Choose an audio file instead</button>
              <input ref={fileInput} className="cw-sr" type="file" accept="audio/*" tabIndex={-1} aria-hidden="true" onChange={(event) => void choose(event)} />
            </>
          ) : null}
        </div>
      )}
      {error ? <p className="cw-field__error" role="alert"><Icon name="alert" />{error}</p> : null}
    </div>
  );
}
