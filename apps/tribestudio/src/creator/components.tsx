import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { trackEvent } from '../analytics';
import { WHATSAPP_CHANNEL_URL } from './data';
import { Icon } from '../ui/icons';
import { Badge, EmptyState as KitEmptyState, LoadFailure, Notice, Skeleton as KitSkeleton, Steps, type Tone } from '../ui';

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
  APPROVED: 'Approved, not published',
  SCHEDULED: 'Scheduled',
  PUBLISHED: 'Published',
  REJECTED: 'Not accepted',
  WITHDRAWN: 'Withdrawn',
  ARCHIVED: 'Archived',
};

const STATUS_TONE: Record<string, Tone> = {
  APPROVED: 'success',
  PUBLISHED: 'success',
  SUBMISSIONS_OPEN: 'success',
  WAITLIST_OPEN: 'info',
  SUBMITTED: 'info',
  UNDER_REVIEW: 'info',
  RESUBMITTED: 'info',
  SCHEDULED: 'info',
  NEEDS_REVISION: 'warning',
  NEEDS_INFO: 'warning',
  WAITLISTED: 'warning',
  REJECTED: 'danger',
  SUSPENDED: 'danger',
  REVOKED: 'danger',
  WITHDRAWN: 'neutral',
  ARCHIVED: 'neutral',
  DRAFT: 'neutral',
};

export function statusTone(status: string): Tone {
  return STATUS_TONE[status] ?? 'neutral';
}

export function StatusPill({ status, labels }: { status: string; labels: Record<string, string> }) {
  const tone = statusTone(status);
  return <Badge tone={tone} dot live={status === 'UNDER_REVIEW'}>{labels[status] ?? status}</Badge>;
}

/** The official creator channel, as a compact call to action. Opens in a new tab. */
export function WhatsAppCard({ url, compact }: { url?: string; compact?: boolean }) {
  const href = url || WHATSAPP_CHANNEL_URL;
  return (
    <div className={compact ? 'cr-channel cr-channel--compact' : 'cr-channel'}>
      <span className="cr-channel__icon" aria-hidden="true"><Icon name="message" /></span>
      <div className="cr-channel__body">
        <strong>Indigen World Creators on WhatsApp</strong>
        <p>Campaign openings, creator resources, deadlines and winner announcements.</p>
      </div>
      <a
        className="ts-btn ts-btn--secondary ts-btn--sm"
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => trackEvent('whatsapp_cta_clicked')}
      >
        <span>Open the channel</span>
        <Icon name="external" />
      </a>
    </div>
  );
}

export function Stepper({ steps, current }: { steps: string[]; current: number }) {
  return <Steps label="Progress" current={current} steps={steps.map((title) => ({ title }))} />;
}

export function EmptyState({ title, body, action, icon = 'inbox' }: { title: string; body?: string; action?: ReactNode; icon?: Parameters<typeof KitEmptyState>[0]['icon'] }) {
  return <KitEmptyState boxed compact icon={icon} title={title} body={body} actions={action} />;
}

export function Callout({ tone = 'info', children }: { tone?: 'info' | 'warn' | 'ok'; children: ReactNode }) {
  return <Notice tone={tone === 'warn' ? 'warning' : tone === 'ok' ? 'success' : 'info'}>{children}</Notice>;
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
  return <LoadFailure title={title} body="Something went wrong reaching the workspace. Check your connection and try again." onRetry={onRetry} />;
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
  return <KitSkeleton lines={lines} />;
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
    <div className={error ? 'ts-field field field--error' : 'ts-field field'}>
      <label className="ts-label" htmlFor={htmlFor}>{label}</label>
      {children}
      {hint ? <p className="ts-hint field__hint">{hint}</p> : null}
      {error ? (
        <p className="ts-error field__error" role="alert">
          <Icon name="alert" />{error}
        </p>
      ) : null}
    </div>
  );
}

/** In-browser voice recorder for indigenous language and oral story recording. */
export function VoiceRecorder({ onAudioReady }: { onAudioReady: (file: File) => void }) {
  const [recording, setRecording] = useState(false);
  const [starting, setStarting] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const previewRef = useRef<string | null>(null);
  const mountedRef = useRef(false);
  const startingRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      const recorder = mediaRecorderRef.current;
      if (recorder) {
        recorder.ondataavailable = null;
        recorder.onstop = null;
        if (recorder.state !== 'inactive') recorder.stop();
      }
      streamRef.current?.getTracks().forEach((track) => track.stop());
      if (timerRef.current !== null) window.clearInterval(timerRef.current);
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    };
  }, []);

  const startRecording = async () => {
    if (startingRef.current || recording) return;
    startingRef.current = true;
    setStarting(true);
    setError(null);
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = null;
    setAudioUrl(null);
    chunksRef.current = [];
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Microphone recording is not supported in this browser.');
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mountedRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        if (!mountedRef.current) return;
        const mimeType = recorder.mimeType || chunksRef.current[0]?.type || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type: mimeType });
        const url = URL.createObjectURL(blob);
        previewRef.current = url;
        setAudioUrl(url);
        const audioFile = new File([blob], 'kasem-recording-' + Date.now() + (mimeType.includes('mp4') ? '.m4a' : mimeType.includes('ogg') ? '.ogg' : '.webm'), {
          type: mimeType,
        });
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        setRecording(false);
        if (timerRef.current !== null) window.clearInterval(timerRef.current);
        timerRef.current = null;
        onAudioReady(audioFile);
      };

      recorder.start(200);
      setRecording(true);
      setSeconds(0);
      timerRef.current = window.setInterval(() => {
        setSeconds((s) => s + 1);
      }, 1000);
    } catch (err) {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      if (mountedRef.current) setError(err instanceof Error ? err.message : 'Could not access microphone.');
    } finally {
      startingRef.current = false;
      if (mountedRef.current) setStarting(false);
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
    <div className={recording ? 'cr-recorder is-recording' : 'cr-recorder'}>
      <div className="cr-recorder__controls">
        {!recording ? (
          <button
            type="button"
            className="ts-btn ts-btn--primary cr-recorder__button"
            disabled={starting}
            onClick={() => void startRecording()}
          >
            <Icon name="mic" />
            {starting ? 'Opening microphone…' : audioUrl ? 'Record again' : 'Record audio'}
          </button>
        ) : (
          <button
            type="button"
            className="ts-btn ts-btn--danger cr-recorder__button"
            onClick={stopRecording}
          >
            <Icon name="stop" />
            Stop recording
          </button>
        )}
        {recording ? (
          <span className="cr-recorder__live" role="status">
            <span className="cr-recorder__dot" aria-hidden="true" />
            <span className="ts-num">{formatTime(seconds)}</span>
            <span className="cr-recorder__wave" aria-hidden="true"><i /><i /><i /><i /><i /></span>
            <span className="sr-only">Recording</span>
          </span>
        ) : (
          <span className="ts-hint">Your browser asks for the microphone the first time.</span>
        )}
      </div>

      {error && <p className="ts-error" role="alert"><Icon name="alert" />{error}</p>}

      {audioUrl && (
        <div className="cr-recorder__preview">
          <p className="ts-save"><span className="ts-save__mark" aria-hidden="true"><Icon name="check" /></span>Recording captured — play it back before you continue.</p>
          <audio controls src={audioUrl} />
        </div>
      )}
    </div>
  );
}
