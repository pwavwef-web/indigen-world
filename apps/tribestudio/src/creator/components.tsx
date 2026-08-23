import { useCallback, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { trackEvent } from '../analytics';
import { WHATSAPP_CHANNEL_URL } from './data';

// Human-readable labels shown alongside internal status codes.
export const CAMPAIGN_STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft',
  WAITLIST_OPEN: 'Waitlist open',
  WAITLIST_CLOSED: 'Waitlist closed',
  SUBMISSIONS_OPEN: 'Submissions open',
  SUBMISSIONS_CLOSED: 'Submissions closed',
  JUDGING: 'Judging',
  COMPLETED: 'Completed',
  ARCHIVED: 'Archived',
};

export const APPLICATION_STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft',
  SUBMITTED: 'Submitted',
  UNDER_REVIEW: 'Under review',
  NEEDS_INFO: 'More information needed',
  WAITLISTED: 'Waitlisted',
  APPROVED: 'Approved',
  REJECTED: 'Not selected',
  SUSPENDED: 'Suspended',
  WITHDRAWN: 'Withdrawn',
};

export const SUBMISSION_STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft',
  SUBMITTED: 'Submitted',
  UNDER_REVIEW: 'Under review',
  NEEDS_REVISION: 'Revision requested',
  RESUBMITTED: 'Resubmitted',
  APPROVED: 'Approved',
  SCHEDULED: 'Scheduled',
  PUBLISHED: 'Published',
  REJECTED: 'Not accepted',
  WITHDRAWN: 'Withdrawn',
  ARCHIVED: 'Archived',
};

const STATUS_TONE: Record<string, string> = {
  APPROVED: 'ok',
  PUBLISHED: 'ok',
  SUBMISSIONS_OPEN: 'ok',
  WAITLIST_OPEN: 'info',
  SUBMITTED: 'info',
  UNDER_REVIEW: 'info',
  RESUBMITTED: 'info',
  SCHEDULED: 'info',
  NEEDS_REVISION: 'warn',
  NEEDS_INFO: 'warn',
  WAITLISTED: 'warn',
  REJECTED: 'err',
  SUSPENDED: 'err',
  WITHDRAWN: 'muted',
  ARCHIVED: 'muted',
  DRAFT: 'muted',
};

export function StatusPill({ status, labels }: { status: string; labels: Record<string, string> }) {
  const tone = STATUS_TONE[status] ?? 'muted';
  return <span className={`pill pill--${tone}`}>{labels[status] ?? status}</span>;
}

/** Prominent WhatsApp Channel call-to-action. Opens safely in a new tab. */
export function WhatsAppCard({ url, compact }: { url?: string; compact?: boolean }) {
  const href = url || WHATSAPP_CHANNEL_URL;
  return (
    <div className={compact ? 'wa-card wa-card--compact' : 'wa-card'}>
      <div className="wa-card__body">
        <strong>Follow Indigen World Creators on WhatsApp</strong>
        <p>Receive campaign openings, creator resources, deadlines and winner announcements.</p>
      </div>
      <a
        className="button button--whatsapp"
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => trackEvent('whatsapp_cta_clicked')}
      >
        Open WhatsApp Channel
      </a>
    </div>
  );
}

export function Stepper({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol className="stepper" aria-label="Progress">
      {steps.map((label, index) => {
        const state = index < current ? 'done' : index === current ? 'current' : 'todo';
        return (
          <li key={label} className={`stepper__item stepper__item--${state}`} aria-current={index === current ? 'step' : undefined}>
            <span className="stepper__dot">{index < current ? '✓' : index + 1}</span>
            <span className="stepper__label">{label}</span>
          </li>
        );
      })}
    </ol>
  );
}

export function EmptyState({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      {body ? <p>{body}</p> : null}
      {action}
    </div>
  );
}

export function Callout({ tone = 'info', children }: { tone?: 'info' | 'warn' | 'ok'; children: ReactNode }) {
  return <div className={`callout callout--${tone}`}>{children}</div>;
}

/**
 * Inline error state for a failed data load, with a retry affordance. Pair
 * with useReloadable() so a permission-denied / offline / missing-index read
 * shows a recoverable message instead of an infinite skeleton.
 */
export function LoadError({
  onRetry,
  title = 'We couldn’t load this',
}: {
  onRetry: () => void;
  title?: string;
}) {
  return (
    <div className="load-error" role="alert">
      <h2>{title}</h2>
      <p className="muted">
        Something went wrong reaching the workspace. Check your connection and try again.
      </p>
      <button type="button" className="button button--primary" onClick={onRetry}>
        Try again
      </button>
    </div>
  );
}

/**
 * Small helper for reloadable data screens. `reloadKey` goes in the effect's
 * dependency array; `retry()` clears the error and bumps the key to re-run the
 * load; `setFailed(true)` in a `.catch` flags the failure.
 */
export function useReloadable() {
  const [reloadKey, setReloadKey] = useState(0);
  const [failed, setFailed] = useState(false);
  const retry = useCallback(() => {
    setFailed(false);
    setReloadKey((k) => k + 1);
  }, []);
  return { reloadKey, failed, setFailed, retry };
}

export function Skeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="skeleton" aria-hidden="true">
      {Array.from({ length: lines }).map((_, i) => (
        <span key={i} className="skeleton__line" />
      ))}
    </div>
  );
}

export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className={error ? 'field field--error' : 'field'}>
      <label htmlFor={htmlFor}>{label}</label>
      {hint ? <p className="field__hint">{hint}</p> : null}
      {children}
      {error ? (
        <p className="field__error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** In-Browser Voice Recorder for indigenous language & oral story recording */
export function VoiceRecorder({ onAudioReady }: { onAudioReady: (file: File) => void }) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);

  const startRecording = async () => {
    setError(null);
    setAudioUrl(null);
    chunksRef.current = [];
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Microphone recording is not supported in this browser.');
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
        const audioFile = new File([blob], `kasem-recording-${Date.now()}.webm`, {
          type: 'audio/webm',
        });
        onAudioReady(audioFile);
        stream.getTracks().forEach((track) => track.stop());
      };

      recorder.start(200);
      setRecording(true);
      setSeconds(0);
      timerRef.current = window.setInterval(() => {
        setSeconds((s) => s + 1);
      }, 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not access microphone.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && recording) {
      mediaRecorderRef.current.stop();
      setRecording(false);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  };

  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remainder = secs % 60;
    return `${String(mins).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
  };

  return (
    <div className="voice-recorder">
      <div className="voice-recorder__controls">
        {!recording ? (
          <button
            type="button"
            className="button button--primary button--small record-btn"
            onClick={() => void startRecording()}
          >
            🔴 Start Recording
          </button>
        ) : (
          <button
            type="button"
            className="button button--danger button--small stop-btn"
            onClick={stopRecording}
          >
            ⏹ Stop Recording ({formatTime(seconds)})
          </button>
        )}
        {recording && <span className="recording-pulse">Recording live audio…</span>}
      </div>

      {error && <p className="field__error">{error}</p>}

      {audioUrl && (
        <div className="voice-recorder__preview">
          <p className="tiny muted">✓ Audio captured successfully. Play preview:</p>
          <audio controls src={audioUrl} className="audio-preview-player" />
        </div>
      )}
    </div>
  );
}

