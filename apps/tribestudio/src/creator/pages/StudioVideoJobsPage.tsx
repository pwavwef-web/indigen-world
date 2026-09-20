import { useCallback, useEffect, useRef, useState } from 'react';
import { DataTable, type DataColumn } from '@indigen-world/console-ui';
import { useAuth } from '../../auth';
import { Link } from '../../router';
import { EmptyState, LoadError, Skeleton, useReloadable } from '../components';
import {
  fetchMyStudioVideoJobs,
  fetchStudioVideoPlayback,
  type StudioVideoJob,
  type StudioVideoPlayback,
} from '../data';

const STATUS_LABELS: Record<StudioVideoJob['status'], string> = {
  SUBMITTING: 'Starting',
  QUEUED: 'Waiting',
  RUNNING: 'Being made',
  SUCCEEDED: 'Ready',
  FAILED: 'Failed',
  CANCELLED: 'Cancelled',
};

const STATUS_TONE: Record<StudioVideoJob['status'], string> = {
  SUBMITTING: 'info',
  QUEUED: 'info',
  RUNNING: 'info',
  SUCCEEDED: 'ok',
  FAILED: 'err',
  CANCELLED: 'muted',
};

const MODEL_LABELS: Record<string, string> = {
  gen4_turbo: 'Runway Gen-4 Turbo',
  'gen4.5': 'Runway Gen-4.5',
  'gemini-omni-1.1-flash-preview': 'Gemini Omni',
  // Jobs made before Gemini Omni replaced Veo.
  'veo-3.1-generate-001': 'Gemini video (Veo)',
  'veo-3.1-fast-generate-001': 'Gemini video (Veo, fast)',
  'lipsync-2': 'Lipsync 2',
  'lipsync-2-pro': 'Lipsync 2 Pro',
};

const PENDING = new Set<StudioVideoJob['status']>(['SUBMITTING', 'QUEUED', 'RUNNING']);
const RELOAD_INTERVAL_MS = 30_000;

function formatUsd(value: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
}

function describe(job: StudioVideoJob): string {
  if (job.prompt) return job.prompt;
  return job.operation === 'lip_sync' ? 'Speaking video' : 'New visual';
}

const OPEN_FALLBACK = 'That video could not be opened. Try again in a moment.';

/** The server's own words when it chose them; a bare INTERNAL says nothing. */
function openFailure(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  if (error instanceof Error && typeof code === 'string' && code !== 'functions/internal' && error.message) {
    return error.message;
  }
  return OPEN_FALLBACK;
}

type OpenIntent = 'watch' | 'download';

interface OpenVideo extends StudioVideoPlayback {
  job: StudioVideoJob;
}

/**
 * Every video this creator has asked for.
 *
 * Without this page a generation existed only in the tab that started it: the
 * job id lived in a query parameter, so a reload, a crash or a closed laptop
 * left a paid-for video with no way back to it. The list is the recovery path,
 * and the only place a creator can see that a job failed rather than stalled.
 */
export function StudioVideoJobsPage() {
  const { user } = useAuth();
  const { reloadKey, failed, setFailed, retry } = useReloadable();
  const [jobs, setJobs] = useState<StudioVideoJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const [opening, setOpening] = useState<{ jobId: string; intent: OpenIntent } | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);
  const [viewing, setViewing] = useState<OpenVideo | null>(null);
  const [playbackStalled, setPlaybackStalled] = useState(false);
  const viewerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!user) return;
    let active = true;
    setFailed(false);
    void fetchMyStudioVideoJobs(user.uid)
      .then((next) => {
        if (!active) return;
        setJobs(next);
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setFailed(true);
        setLoading(false);
      });
    return () => { active = false; };
  }, [user, reloadKey, tick, setFailed]);

  // Jobs finish on the server whether or not anyone is watching, so the list
  // refreshes itself while any of them is still running.
  const anyPending = jobs.some((job) => PENDING.has(job.status));
  useEffect(() => {
    if (!anyPending) return;
    const timer = window.setInterval(() => setTick((value) => value + 1), RELOAD_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [anyPending]);

  // A finished video is private until it is published, so this page is the
  // only place its maker can watch it: without a player here the choice was to
  // download it blind or publish it unseen.
  const openVideo = useCallback(async (job: StudioVideoJob, intent: OpenIntent) => {
    if (!job.outputStoragePath) return;
    setOpening({ jobId: job.id, intent });
    setOpenError(null);
    try {
      const playback = await fetchStudioVideoPlayback(job.id);
      if (intent === 'download') {
        // The signed URL already carries an attachment disposition, so the
        // browser saves the file rather than navigating to it.
        window.location.assign(playback.downloadUrl);
      } else {
        setPlaybackStalled(false);
        setViewing({ ...playback, job });
      }
    } catch (err) {
      setOpenError(openFailure(err));
    } finally {
      setOpening(null);
    }
  }, []);

  useEffect(() => {
    if (viewing) viewerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [viewing]);

  const isOpening = (job: StudioVideoJob, intent: OpenIntent) =>
    opening?.jobId === job.id && opening.intent === intent;

  const columns: DataColumn<StudioVideoJob>[] = [
    {
      id: 'description',
      header: 'What you asked for',
      wrap: true,
      cell: (job) => <span className="job-desc" title={describe(job)}>{describe(job)}</span>,
      sort: (job) => describe(job),
      search: (job) => `${describe(job)} ${job.operation}`,
    },
    {
      id: 'model',
      header: 'Made with',
      width: '150px',
      cell: (job) => MODEL_LABELS[job.model] ?? job.model,
      sort: (job) => MODEL_LABELS[job.model] ?? job.model,
      search: (job) => MODEL_LABELS[job.model] ?? job.model,
    },
    {
      id: 'created',
      header: 'Started',
      width: '160px',
      mono: true,
      cell: (job) => (job.createdAt ? new Date(job.createdAt).toLocaleString() : '—'),
      sort: (job) => (job.createdAt ? new Date(job.createdAt).getTime() : 0),
    },
    {
      id: 'cost',
      header: 'Charge',
      width: '100px',
      mono: true,
      cell: (job) => formatUsd(job.costEstimate?.amountUsd ?? 0),
      sort: (job) => job.costEstimate?.amountUsd ?? 0,
    },
    {
      id: 'status',
      header: 'Status',
      width: '110px',
      cell: (job) => (
        <span className={`pill pill--${STATUS_TONE[job.status] ?? 'muted'}`}>
          {STATUS_LABELS[job.status] ?? job.status}
        </span>
      ),
      sort: (job) => STATUS_LABELS[job.status] ?? job.status,
      search: (job) => STATUS_LABELS[job.status] ?? job.status,
    },
    {
      id: 'actions',
      header: 'Open',
      align: 'end',
      width: '290px',
      cell: (job) => (
        <span className="dt-actions">
          {job.status === 'SUCCEEDED' && job.outputStoragePath ? (
            <>
              <button
                type="button"
                className="button button--small"
                disabled={opening?.jobId === job.id}
                aria-pressed={viewing?.job.id === job.id}
                onClick={() => void openVideo(job, 'watch')}
              >
                {isOpening(job, 'watch') ? 'Opening…' : 'Watch'}
              </button>
              <button
                type="button"
                className="button button--small"
                disabled={opening?.jobId === job.id}
                onClick={() => void openVideo(job, 'download')}
              >
                {isOpening(job, 'download') ? 'Opening…' : 'Download'}
              </button>
              <Link
                to={`/studio/editor?job=${encodeURIComponent(job.id)}`}
                className="button button--small button--primary"
              >
                Edit &amp; post
              </Link>
            </>
          ) : (
            <Link to={`/studio/video?job=${encodeURIComponent(job.id)}`} className="button button--small">
              {PENDING.has(job.status) ? 'Watch' : 'Open'}
            </Link>
          )}
        </span>
      ),
    },
  ];

  if (failed) {
    return (
      <div className="page">
        <h1>Your videos</h1>
        <LoadError onRetry={retry} title="We couldn’t load your videos" />
      </div>
    );
  }
  if (loading) {
    return (
      <div className="page">
        <h1>Your videos</h1>
        <Skeleton lines={5} />
      </div>
    );
  }

  const failedJobs = jobs.filter((job) => job.status === 'FAILED' && job.failureReason);

  return (
    <div className="page">
      <header className="page__head">
        <h1>Your videos</h1>
        <div className="page__head-actions">
          <Link to="/studio/video" className="button button--primary button--small">Make a video</Link>
        </div>
      </header>

      {anyPending ? (
        <div className="callout callout--info" role="status">
          A video is being made right now. It finishes on our side even if you close this page — this
          list updates on its own.
        </div>
      ) : null}
      {openError ? <div className="callout callout--warn" role="alert">{openError}</div> : null}

      {viewing ? (
        <section className="video-viewer" ref={viewerRef} aria-label="Video preview">
          <div className="video-viewer__head">
            <div>
              <h2>{describe(viewing.job)}</h2>
              <p className="tiny muted">Only you can see this until you publish it.</p>
            </div>
            <button type="button" className="button button--small" onClick={() => setViewing(null)}>
              Close
            </button>
          </div>
          <video
            key={viewing.job.id}
            controls
            autoPlay
            playsInline
            src={viewing.playbackUrl}
            aria-label={`Preview of ${describe(viewing.job)}`}
            onError={() => setPlaybackStalled(true)}
          />
          {playbackStalled ? (
            // Signed links last half an hour; a player left open longer than
            // that stops loading instead of failing loudly.
            <div className="callout callout--warn" role="status">
              The preview stopped loading. Press Watch again to reopen it.
            </div>
          ) : null}
          <div className="video-result__actions">
            <a className="button button--small" href={viewing.downloadUrl}>Download</a>
            {viewing.job.outputStoragePath ? (
              <Link
                to={`/studio/submissions/new?generated=${encodeURIComponent(viewing.job.outputStoragePath)}`}
                className="button button--small button--primary"
              >
                Publish
              </Link>
            ) : null}
          </div>
        </section>
      ) : null}

      {jobs.length === 0 ? (
        <EmptyState
          title="No videos yet"
          body="Write a Kasem script, describe the scene or bring your own footage, and the studio will make a video you can publish."
          action={<Link to="/studio/video" className="button button--primary">Make your first video</Link>}
        />
      ) : (
        <DataTable
          caption="Your AI video jobs"
          columns={columns}
          rows={jobs}
          rowKey={(job) => job.id}
          searchable
          searchPlaceholder="Search by description or status…"
          initialSort={{ columnId: 'created', direction: 'desc' }}
          pageSize={20}
          empty={{ title: 'Nothing matches that search' }}
        />
      )}

      {failedJobs.length > 0 ? (
        <section className="video-failures">
          <h2>Why a video failed</h2>
          <dl>
            {failedJobs.map((job) => (
              <div key={job.id}>
                <dt>{describe(job)}</dt>
                <dd>{job.failureReason}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}
    </div>
  );
}
