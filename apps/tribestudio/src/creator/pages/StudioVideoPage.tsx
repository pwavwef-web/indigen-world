import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { useAuth } from '../../auth';
import { Link } from '../../router';
import { Field, LoadError, Skeleton, VoiceRecorder } from '../components';
import {
  createStudioVideoJob,
  fetchStudioVideoCapabilities,
  fetchStudioVideoJob,
  fetchStudioVideoPlayback,
  refreshStudioVideoJob,
  uploadStudioVideoAsset,
  type CreateStudioVideoJobInput,
  type StudioVideoAssetKind,
  type StudioVideoCapabilities,
  type StudioVideoJob,
  type StudioVideoOperation,
} from '../data';

const CONSENT_VERSION = 'studio-video-r1-2026-09-01';
const TERMINAL_STATUSES = new Set(['SUCCEEDED', 'FAILED', 'CANCELLED']);
const POLL_INTERVAL_MS = 15_000;
// Three misses is roughly forty-five seconds of silence: long enough not to
// cry wolf over one dropped request, short enough that a creator is told
// something is wrong instead of watching an honest-looking spinner.
const POLL_FAILURES_BEFORE_WARNING = 3;

// Fallback only. The capability response carries a `label` per model, so a
// model added on the backend names itself rather than appearing as a raw id.
const MODEL_LABELS: Record<string, string> = {
  gen4_turbo: 'Runway Gen-4 Turbo',
  'gen4.5': 'Runway Gen-4.5',
  'veo-3.1-generate-001': 'Gemini video',
  'veo-3.1-fast-generate-001': 'Gemini video (fast)',
  'lipsync-2': 'Sync Lipsync 2',
  'lipsync-2-pro': 'Sync Lipsync 2 Pro',
};

/** What each model is good for, in a creator's terms rather than a vendor's. */
const MODEL_NOTES: Record<string, string> = {
  'gen4.5': 'Strong on movement and camera work.',
  gen4_turbo: 'Cheapest, and animates an image you supply.',
  'veo-3.1-generate-001': 'Google’s Veo 3.1. The most realistic, and the most expensive.',
  'veo-3.1-fast-generate-001': 'Google’s Veo 3.1 Fast. Realistic, at about a third of the price.',
};

const DEFAULT_VISUAL_MODEL = 'gen4.5';

const RATIO_LABELS: Record<string, string> = {
  '1280:720': 'Landscape · 16:9',
  '720:1280': 'Portrait · 9:16',
  '960:960': 'Square · 1:1',
};

function errorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback;
  return error.message
    .replace(/^Firebase:\s*/i, '')
    .replace(/^Functions:\s*/i, '')
    .replace(/\s*\([^)]*\)\.?$/, '')
    .trim() || fallback;
}

function formatUsd(value: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
}

function statusCopy(status: StudioVideoJob['status']): string {
  if (status === 'SUBMITTING') return 'Securing your request';
  if (status === 'QUEUED') return 'Waiting for the provider';
  if (status === 'RUNNING') return 'Creating your video';
  if (status === 'SUCCEEDED') return 'Video ready';
  if (status === 'FAILED') return 'Generation failed';
  return 'Generation cancelled';
}

interface UploadedAsset {
  name: string;
  storagePath: string;
}

export function StudioVideoPage() {
  const { user } = useAuth();
  const [capabilities, setCapabilities] = useState<StudioVideoCapabilities | null>(null);
  const [script, setScript] = useState('');
  const [dialect, setDialect] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [loadFailure, setLoadFailure] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [operation, setOperation] = useState<StudioVideoOperation>('generate_visual');
  const [duration, setDuration] = useState<number>(5);
  const [visualModel, setVisualModel] = useState<string>(DEFAULT_VISUAL_MODEL);
  const [ratio, setRatio] = useState<'1280:720' | '720:1280' | '960:960'>('1280:720');
  const [prompt, setPrompt] = useState('');
  const [referenceImage, setReferenceImage] = useState<UploadedAsset | null>(null);
  const [lipSyncModel, setLipSyncModel] = useState<'lipsync-2' | 'lipsync-2-pro'>('lipsync-2');
  const [syncMode, setSyncMode] = useState<'cut_off' | 'loop' | 'bounce' | 'silence' | 'remap'>('cut_off');
  const [sourceVideo, setSourceVideo] = useState<UploadedAsset | null>(null);
  const [sourceAudio, setSourceAudio] = useState<UploadedAsset | null>(null);
  const [uploading, setUploading] = useState<StudioVideoAssetKind | null>(null);
  const [uploadPct, setUploadPct] = useState(0);

  const [containsPerson, setContainsPerson] = useState(false);
  const [aiPermission, setAiPermission] = useState(false);
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [culturalPermission, setCulturalPermission] = useState(false);
  const [participantConsent, setParticipantConsent] = useState(false);
  const [voiceConsent, setVoiceConsent] = useState(false);
  const [likenessConsent, setLikenessConsent] = useState(false);
  const [noMinors, setNoMinors] = useState(false);
  const [noThirdParty, setNoThirdParty] = useState(false);

  const [job, setJob] = useState<StudioVideoJob | null>(null);
  const [creating, setCreating] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outputUrl, setOutputUrl] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [pollTrouble, setPollTrouble] = useState<string | null>(null);
  const requestId = useRef<string | null>(null);

  const jobId = job?.id ?? null;
  const jobPending = job ? !TERMINAL_STATUSES.has(job.status) : false;

  useEffect(() => {
    if (!user) return;
    let active = true;
    setLoading(true);
    setLoadFailed(false);
    setLoadFailure(null);
    void fetchStudioVideoCapabilities()
      .then((nextCapabilities) => {
        if (!active) return;
        setCapabilities(nextCapabilities);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (!active) return;
        // Keep the reason. Discarding it showed "check your connection" to a
        // creator whose account simply has not been approved yet, next to a
        // retry button that could never succeed.
        setLoadFailure(errorMessage(err, 'Something went wrong reaching the video studio.'));
        setLoadFailed(true);
        setLoading(false);
      });
    return () => { active = false; };
  }, [user, reloadKey]);

  // A job id in the URL makes an in-progress generation resumable after a
  // reload. The document is read first and the provider poll is a second,
  // optional step: recovery must not depend on the call that can fail, or a
  // reload during an outage shows an empty builder form and invites the
  // creator to pay for the same video twice.
  useEffect(() => {
    const resumeJobId = new URLSearchParams(window.location.search).get('job');
    if (!resumeJobId) return;
    let active = true;
    setRefreshing(true);
    void fetchStudioVideoJob(resumeJobId)
      .then((existing) => {
        if (!active) return;
        if (existing) setJob(existing);
        else setError('That video job could not be found on this account.');
      })
      .catch((err: unknown) => {
        if (active) setError(errorMessage(err, 'Could not reopen this video job.'));
      })
      .finally(() => { if (active) setRefreshing(false); });
    return () => { active = false; };
  }, []);

  // A repeating interval keyed on the job id, not on the job object.
  //
  // The previous version scheduled a single timeout per render and swallowed
  // its rejection, so one failed poll ended the chain: no new job object, no
  // re-run, no further requests, and a spinner that turned forever while the
  // finished video sat in Storage. An interval keeps asking, and a run of
  // failures is shown to the creator rather than hidden.
  useEffect(() => {
    if (!jobId || !jobPending) return;
    let active = true;
    let failures = 0;
    // One request at a time. The refresh call imports the finished video
    // inline and can run for minutes, so firing a fresh one every tick would
    // stack up dozens of importers racing to write the same object.
    let inFlight = false;
    const tick = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const next = await refreshStudioVideoJob(jobId);
        if (!active) return;
        failures = 0;
        setPollTrouble(null);
        setJob(next);
      } catch (err) {
        if (!active) return;
        failures += 1;
        if (failures >= POLL_FAILURES_BEFORE_WARNING) {
          setPollTrouble(errorMessage(err, 'We cannot reach the video service right now.'));
        }
      } finally {
        inFlight = false;
      }
    };
    const timer = window.setInterval(() => { void tick(); }, POLL_INTERVAL_MS);
    return () => { active = false; window.clearInterval(timer); };
  }, [jobId, jobPending]);

  useEffect(() => {
    if (job?.status !== 'SUCCEEDED' || !job.outputStoragePath || !jobId) return;
    let active = true;
    void fetchStudioVideoPlayback(jobId)
      .then((playback) => {
        if (!active) return;
        setOutputUrl(playback.playbackUrl);
        setDownloadUrl(playback.downloadUrl);
      })
      .catch((err: unknown) => {
        if (active) setError(errorMessage(err, 'The video is ready, but its preview could not be loaded.'));
      });
    return () => { active = false; };
  }, [job?.status, job?.outputStoragePath, jobId]);

  const operationCapability = capabilities?.operations.find((item) => item.operation === operation);
  const model = operation === 'generate_visual' ? visualModel : lipSyncModel;
  const modelCapability = operationCapability?.models.find((item) => item.id === model);
  const costEstimate = (modelCapability?.estimatedUsdPerSecond ?? 0) * duration;
  const referenceRequired = operation === 'generate_visual' && modelCapability?.requiresReferenceImage === true;
  const recognisableConsentRequired = containsPerson || operation === 'lip_sync';
  const modelLabel = modelCapability?.label ?? MODEL_LABELS[model] ?? model;
  // Per model: Runway makes 5 or 10 seconds and Gemini makes 4, 6 or 8.
  const availableDurations = useMemo(
    () => modelCapability?.durationsSeconds ?? capabilities?.limits.durationsSeconds ?? [5, 10],
    [modelCapability, capabilities],
  );

  const uploadAsset = useCallback(async (kind: StudioVideoAssetKind, file: File) => {
    if (!user) return;
    setError(null);
    setUploading(kind);
    setUploadPct(0);
    try {
      const storagePath = await uploadStudioVideoAsset(user.uid, kind, file, setUploadPct);
      const asset = { name: file.name, storagePath };
      if (kind === 'image') setReferenceImage(asset);
      if (kind === 'video') setSourceVideo(asset);
      if (kind === 'audio') setSourceAudio(asset);
      setUploadPct(100);
    } catch (err) {
      setError(errorMessage(err, 'Upload failed. Please try again.'));
    } finally {
      setUploading(null);
    }
  }, [user]);

  const handleUpload = async (kind: StudioVideoAssetKind, event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) await uploadAsset(kind, file);
  };

  /** A browser recording arrives as a File, with no input element to clear. */
  const uploadAudioFile = useCallback(
    (file: File) => uploadAsset('audio', file),
    [uploadAsset],
  );

  const validate = (): string | null => {
    if (script.trim().length < 2) return 'Write the Kasem words for this video.';
    if (!dialect.trim()) return 'Add the Kasem dialect or community variety.';
    if (!aiPermission || !rightsConfirmed || !culturalPermission) {
      return 'Confirm AI processing, rights, and cultural permission before creating.';
    }
    if (!noMinors || !noThirdParty) {
      return 'Confirm that this release contains no minors and no third-party material.';
    }
    if (recognisableConsentRequired && (!participantConsent || !likenessConsent)) {
      return 'Participation and likeness consent are required for every recognisable person.';
    }
    if (operation === 'generate_visual') {
      if (!prompt.trim()) return 'Describe the scene you want to create.';
      if (referenceRequired && !referenceImage) return 'This model needs a reference image.';
      if (availableRatios.length > 0 && !availableRatios.includes(ratio)) {
        return 'That shape is not available for the model you picked.';
      }
    } else {
      if (!sourceVideo || !sourceAudio) return 'Upload both a source video and the matching Kasem audio.';
      if (!voiceConsent) return 'The recorded speaker must consent to AI voice processing.';
    }
    return null;
  };

  const buildInput = (): CreateStudioVideoJobInput => {
    if (!requestId.current) requestId.current = `video_${crypto.randomUUID().replace(/-/g, '')}`;
    const base = {
      clientRequestId: requestId.current,
      durationSeconds: duration,
      kasem: {
        languageCode: 'xsm' as const,
        dialect: dialect.trim(),
        transcript: script.trim(),
        validationRef: '',
      },
      governance: {
        aiProcessingPermission: true as const,
        rightsConfirmed: true as const,
        culturalPermissionConfirmed: true as const,
        participantConsentConfirmed: participantConsent,
        voiceConsentConfirmed: voiceConsent,
        likenessConsentConfirmed: likenessConsent,
        containsRecognisablePerson: containsPerson,
        involvesMinors: false as const,
        usesThirdPartyMaterial: false as const,
        consentVersion: CONSENT_VERSION,
      },
    };
    if (operation === 'generate_visual') {
      return {
        ...base,
        operation,
        // From the capability response: which service serves this model is the
        // backend's decision, not a constant repeated in the browser.
        provider: modelCapability?.provider === 'gemini' ? 'gemini' : 'runway',
        model: visualModel,
        prompt: prompt.trim(),
        ratio,
        referenceImageStoragePath: referenceImage?.storagePath ?? null,
      };
    }
    if (!sourceVideo || !sourceAudio) throw new Error('Upload video and audio first.');
    return {
      ...base,
      operation,
      provider: 'fal',
      model: lipSyncModel,
      videoStoragePath: sourceVideo.storagePath,
      audioStoragePath: sourceAudio.storagePath,
      syncMode,
    };
  };

  /** The job id the backend will use, known before the call is made. */
  const pendingJobId = (input: CreateStudioVideoJobInput): string | null =>
    user ? `${user.uid}_${input.clientRequestId}` : null;

  const rememberJobId = (jobId: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set('job', jobId);
    window.history.replaceState({}, '', `${url.pathname}${url.search}`);
  };

  const submit = async () => {
    const validationError = validate();
    if (validationError) { setError(validationError); return; }
    setCreating(true);
    setError(null);
    const input = buildInput();
    // Written before the call, not after it. A create that commits server-side
    // but whose response is lost would otherwise leave a job running, and
    // billing, with nothing in the browser pointing back to it.
    const expectedJobId = pendingJobId(input);
    if (expectedJobId) rememberJobId(expectedJobId);
    try {
      const next = await createStudioVideoJob(input);
      setJob(next);
      rememberJobId(next.id);
    } catch (err) {
      setError(errorMessage(err, 'The video job could not be started. Retrying keeps the same request id, so it cannot double-charge.'));
    } finally {
      setCreating(false);
    }
  };

  const refresh = useCallback(async () => {
    if (!job) return;
    setRefreshing(true);
    setError(null);
    try {
      setJob(await refreshStudioVideoJob(job.id));
      setPollTrouble(null);
    } catch (err) {
      setError(errorMessage(err, 'Could not refresh the video status.'));
    } finally {
      setRefreshing(false);
    }
  }, [job]);

  const startAnother = () => {
    setOutputUrl(null);
    setDownloadUrl(null);
    setJob(null);
    setError(null);
    setPollTrouble(null);
    requestId.current = null;
    const url = new URL(window.location.href);
    url.searchParams.delete('job');
    window.history.replaceState({}, '', `${url.pathname}${url.search}`);
  };

  const availableRatios = useMemo(() => {
    if (!capabilities) return [];
    const forModel = referenceImage ? modelCapability?.imageRatios : modelCapability?.textRatios;
    if (forModel && forModel.length > 0) return forModel;
    // Only when the model said nothing at all; a model that lists no text
    // ratios is one that needs an image, and its own list applies then.
    return modelCapability ? [] : capabilities.limits.ratios;
  }, [capabilities, modelCapability, referenceImage]);

  useEffect(() => {
    if (availableRatios.length > 0 && !availableRatios.includes(ratio)) {
      setRatio(availableRatios[0] as typeof ratio);
    }
  }, [availableRatios, ratio]);

  // Switching model can invalidate the length. Snapped here rather than left
  // for the backend to reject, because a rejection reads as "the video failed"
  // for a request that was never askable.
  useEffect(() => {
    if (availableDurations.length > 0 && !availableDurations.includes(duration)) {
      setDuration(availableDurations[0]);
    }
  }, [availableDurations, duration]);

  if (loading) return <div className="page"><h1>AI Video</h1><Skeleton lines={7} /></div>;
  if (loadFailed) {
    return (
      <div className="page">
        <h1>AI Video</h1>
        <LoadError title="We couldn’t open the video studio" onRetry={() => setReloadKey((key) => key + 1)} />
        {loadFailure ? <div className="callout callout--warn" role="alert">{loadFailure}</div> : null}
        <p className="tiny muted">
          Video making is open to approved creators. If this keeps happening, check{' '}
          <Link to="/studio/profile">your profile</Link> for your creator status.
        </p>
      </div>
    );
  }

  return (
    <div className="page video-studio">
      <header className="video-hero">
        <div>
          <p className="hero__eyebrow">Kasem video maker</p>
          <h1>Create a Kasem video</h1>
          <p>Write what will be said, choose the kind of video, and create it. TribeStudio keeps your files private until you publish.</p>
        </div>
        <div className="video-hero__aside">
          <Link to="/studio/video/jobs" className="button button--ghost-dark button--small">Your videos</Link>
          <span className="video-hero__mark" aria-hidden="true">▶</span>
        </div>
      </header>

      {job ? (
        <section className={`video-result video-result--${job.status.toLowerCase()}`} aria-live="polite">
          <div className="video-result__head">
            <div>
              <p className="hero__eyebrow">{MODEL_LABELS[job.model] ?? job.model}</p>
              <h2>{statusCopy(job.status)}</h2>
              <p className="muted">Estimated provider charge: {formatUsd(job.costEstimate.amountUsd)} · updated {new Date(job.updatedAt).toLocaleTimeString()}</p>
            </div>
            {!TERMINAL_STATUSES.has(job.status) ? <span className="video-spinner" aria-label="Generation in progress" /> : null}
          </div>
          {job.failureReason ? <div className="callout callout--warn">{job.failureReason}</div> : null}
          {jobPending ? (
            <p className="tiny muted">
              You can close this page. The video keeps building and waits for you under{' '}
              <Link to="/studio/video/jobs">your videos</Link>.
            </p>
          ) : null}
          {pollTrouble ? (
            <div className="callout callout--warn" role="status">
              {pollTrouble} Your video is still being made — it will appear under{' '}
              <Link to="/studio/video/jobs">your videos</Link> when it is done.
            </div>
          ) : null}
          {outputUrl ? (
            <div className="video-result__preview">
              <video controls playsInline src={outputUrl} aria-label="Generated Kasem video preview" />
              <div className="video-result__actions">
                <Link
                  to={`/studio/editor?job=${encodeURIComponent(job.id)}`}
                  className="button button--primary"
                >
                  Edit before posting
                </Link>
                <a className="button button--ghost-dark" href={downloadUrl ?? outputUrl}>Download original</a>
              </div>
            </div>
          ) : null}
          {error ? <div className="callout callout--warn" role="alert">{error}</div> : null}
          <div className="video-result__actions">
            {jobPending ? (
              <button type="button" className="button button--ghost-dark" disabled={refreshing} onClick={() => void refresh()}>
                {refreshing ? 'Checking…' : 'Check now'}
              </button>
            ) : null}
            <Link to="/studio/video/jobs" className="button button--ghost-dark">Your videos</Link>
            <button type="button" className="button button--ghost-dark" onClick={startAnother}>Start another video</button>
          </div>
        </section>
      ) : (
        <div className="video-builder">
          <div className="video-builder__form">
            <section className="video-step">
              <span className="video-step__number">1</span>
              <div className="video-step__body">
                <h2>Write your script</h2>
                <p className="muted">Type the Kasem words that will be spoken or guide the story. This does not need to be a previous submission.</p>
                <Field label="Kasem script" htmlFor="video-script" hint="Up to 4,000 characters. Write it exactly as it should be spoken.">
                  <textarea
                    id="video-script"
                    rows={8}
                    maxLength={4000}
                    value={script}
                    onChange={(event) => setScript(event.target.value)}
                    placeholder="Write your Kasem narration or dialogue here…"
                  />
                </Field>
                <div className="script-meta">
                  <Field label="Dialect or community variety" htmlFor="video-dialect">
                    <input id="video-dialect" maxLength={80} value={dialect} onChange={(event) => setDialect(event.target.value)} placeholder="For example: Navrongo" />
                  </Field>
                  <span className="tiny muted">{script.length.toLocaleString()} / 4,000 characters</span>
                </div>
              </div>
            </section>

            <section className="video-step">
              <span className="video-step__number">2</span>
              <div className="video-step__body">
                <h2>Choose your video</h2>
                <div className="video-mode" role="radiogroup" aria-label="Video operation">
                  <label className={operation === 'generate_visual' ? 'video-mode__card is-on' : 'video-mode__card'}>
                    <input type="radio" name="operation" checked={operation === 'generate_visual'} onChange={() => setOperation('generate_visual')} />
                    <strong>Make new visuals</strong><span>Create a scene from your description and optional image.</span>
                  </label>
                  <label className={operation === 'lip_sync' ? 'video-mode__card is-on' : 'video-mode__card'}>
                    <input type="radio" name="operation" checked={operation === 'lip_sync'} onChange={() => setOperation('lip_sync')} />
                    <strong>Sync someone speaking</strong><span>Match your own video to a consented Kasem recording.</span>
                  </label>
                </div>

                {operation === 'generate_visual' ? (
                  <div className="video-options">
                    <Field label="How should it look?" htmlFor="video-prompt" hint="Describe the place, people, movement and mood. Do not include private information.">
                      <textarea id="video-prompt" rows={5} maxLength={1000} value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="At golden hour in a Kassena courtyard, woven baskets beside the storyteller, slow camera push-in…" />
                    </Field>
                    <Field label={`Add an image ${referenceRequired ? '(required with the selected quality)' : '(optional)'}`} htmlFor="reference-image" hint="Use your own JPEG, PNG or WebP under 20 MB.">
                      <input id="reference-image" type="file" accept="image/*" disabled={uploading !== null} onChange={(event) => void handleUpload('image', event)} />
                    </Field>
                    {referenceImage ? <p className="asset-ready"><span>✓</span>{referenceImage.name}</p> : null}
                    <details className="video-advanced">
                      <summary>Quality, length and format</summary>
                      <div className="field-row">
                        <Field
                          label="Model"
                          htmlFor="visual-model"
                          hint={MODEL_NOTES[visualModel]}
                        >
                          <select id="visual-model" value={visualModel} onChange={(event) => setVisualModel(event.target.value)}>
                            {operationCapability?.models.map((item) => (
                              <option key={item.id} value={item.id}>
                                {item.label ?? MODEL_LABELS[item.id] ?? item.id}
                              </option>
                            ))}
                          </select>
                        </Field>
                        <Field label="Length" htmlFor="video-duration">
                          <select id="video-duration" value={duration} onChange={(event) => setDuration(Number(event.target.value))}>
                            {availableDurations.map((seconds) => <option key={seconds} value={seconds}>{seconds} seconds</option>)}
                          </select>
                        </Field>
                        <Field label="Format" htmlFor="video-ratio">
                          <select id="video-ratio" value={ratio} onChange={(event) => setRatio(event.target.value as typeof ratio)}>
                            {availableRatios.map((item) => <option key={item} value={item}>{RATIO_LABELS[item] ?? item}</option>)}
                          </select>
                        </Field>
                      </div>
                    </details>
                  </div>
                ) : (
                  <div className="video-options">
                    <div className="media-pair">
                      <Field label="Your video" htmlFor="source-video" hint="A video you control, under 200 MB.">
                        <input id="source-video" type="file" accept="video/*" disabled={uploading !== null} onChange={(event) => void handleUpload('video', event)} />
                        {sourceVideo ? <p className="asset-ready"><span>✓</span>{sourceVideo.name}</p> : null}
                      </Field>
                      <Field label="Kasem recording" htmlFor="source-audio" hint="Record it here, or upload audio matching the script above (under 50 MB).">
                        <input id="source-audio" type="file" accept="audio/*" disabled={uploading !== null} onChange={(event) => void handleUpload('audio', event)} />
                        <VoiceRecorder onAudioReady={(file) => void uploadAudioFile(file)} />
                        {sourceAudio ? <p className="asset-ready"><span>✓</span>{sourceAudio.name}</p> : null}
                      </Field>
                    </div>
                    <details className="video-advanced">
                      <summary>Quality, length and timing</summary>
                      <div className="field-row">
                        <Field label="Quality" htmlFor="lipsync-model">
                          <select id="lipsync-model" value={lipSyncModel} onChange={(event) => setLipSyncModel(event.target.value as typeof lipSyncModel)}>
                            {operationCapability?.models.map((item) => (
                              <option key={item.id} value={item.id}>
                                {item.label ?? MODEL_LABELS[item.id] ?? item.id}
                              </option>
                            ))}
                          </select>
                        </Field>
                        <Field label="Length" htmlFor="lipsync-duration">
                          <select id="lipsync-duration" value={duration} onChange={(event) => setDuration(Number(event.target.value))}>
                            {availableDurations.map((seconds) => <option key={seconds} value={seconds}>{seconds} seconds</option>)}
                          </select>
                        </Field>
                        <Field label="If lengths differ" htmlFor="sync-mode">
                          <select id="sync-mode" value={syncMode} onChange={(event) => setSyncMode(event.target.value as typeof syncMode)}>
                            <option value="cut_off">Cut off the longer file</option><option value="loop">Loop the video</option><option value="bounce">Bounce the video</option><option value="silence">Add silence</option><option value="remap">Adjust timing</option>
                          </select>
                        </Field>
                      </div>
                    </details>
                  </div>
                )}
                {uploading ? (
                  <div className="upload"><div className="upload__bar"><span style={{ width: `${uploadPct}%` }} /></div><span className="tiny">Uploading {uploading}… {uploadPct}%</span></div>
                ) : null}
              </div>
            </section>

            <section className="video-step">
              <span className="video-step__number">3</span>
              <div className="video-step__body">
                <h2>Confirm you can use it</h2>
                <p className="muted">These permissions are only for making this video. They do not give permission to train an AI model.</p>
                <div className="consent-list">
                  <label className="checkbox"><input type="checkbox" checked={aiPermission} onChange={(event) => setAiPermission(event.target.checked)} /><span>I allow TribeStudio to send this script and selected media to the video provider for this job.</span></label>
                  <label className="checkbox"><input type="checkbox" checked={rightsConfirmed && culturalPermission} onChange={(event) => { setRightsConfirmed(event.target.checked); setCulturalPermission(event.target.checked); }} /><span>I own or control this material and have the cultural permission to use it.</span></label>
                  <label className="checkbox"><input type="checkbox" checked={noMinors && noThirdParty} onChange={(event) => { setNoMinors(event.target.checked); setNoThirdParty(event.target.checked); }} /><span>No minors or third-party music, images, voices or footage are included.</span></label>
                  {operation === 'generate_visual' ? (
                    <label className="checkbox"><input type="checkbox" checked={containsPerson} onChange={(event) => setContainsPerson(event.target.checked)} /><span>The requested video includes a recognisable person.</span></label>
                  ) : null}
                  {recognisableConsentRequired ? (
                    <label className="checkbox"><input type="checkbox" checked={participantConsent && likenessConsent && (operation !== 'lip_sync' || voiceConsent)} onChange={(event) => { setParticipantConsent(event.target.checked); setLikenessConsent(event.target.checked); if (operation === 'lip_sync') setVoiceConsent(event.target.checked); }} /><span>{operation === 'lip_sync' ? 'Everyone shown and the recorded speaker agreed to participation, likeness use and AI lip-sync.' : 'Every recognisable person agreed to participate and have their likeness used.'}</span></label>
                  ) : null}
                </div>
              </div>
            </section>
          </div>

          <aside className="video-summary">
            <p className="hero__eyebrow">Your video</p>
            <h2>{operation === 'generate_visual' ? 'New visual' : 'Speaking video'}</h2>
            <dl>
              <div><dt>Language</dt><dd>Kasem · xsm</dd></div>
              <div><dt>Length</dt><dd>{duration} seconds</dd></div>
              <div><dt>Estimated charge</dt><dd>{formatUsd(costEstimate)}</dd></div>
            </dl>
            <p className="tiny muted">One generation using {modelLabel}. The final provider charge may vary slightly.</p>
            {modelCapability?.provider === 'gemini' ? (
              <p className="tiny muted">
                Gemini video is made without a soundtrack on purpose — a generated voice would not
                be speaking Kasem. Add your own recording with “Sync someone speaking”, or in
                editing.
              </p>
            ) : null}
            {error ? <div className="callout callout--warn" role="alert">{error}</div> : null}
            <button type="button" className="button button--primary button--block" disabled={creating || uploading !== null} onClick={() => void submit()}>
              {creating ? 'Starting securely…' : `Create for about ${formatUsd(costEstimate)}`}
            </button>
            <p className="video-summary__safety">Your files stay private until you publish. Provider keys never enter this browser.</p>
          </aside>
        </div>
      )}
    </div>
  );
}
