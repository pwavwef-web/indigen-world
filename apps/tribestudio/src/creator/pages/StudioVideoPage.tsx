import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import type { Submission } from '@indigen-world/contracts/creator-models';
import { useAuth } from '../../auth';
import { Link } from '../../router';
import { Field, LoadError, Skeleton } from '../components';
import {
  createStudioVideoJob,
  fetchMySubmissions,
  fetchStudioVideoCapabilities,
  loadStudioVideoOutput,
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

const MODEL_LABELS: Record<string, string> = {
  gen4_turbo: 'Runway Gen-4 Turbo',
  'gen4.5': 'Runway Gen-4.5',
  'lipsync-2': 'Sync Lipsync 2',
  'lipsync-2-pro': 'Sync Lipsync 2 Pro',
};

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

function isApprovedKasemScript(submission: Submission): boolean {
  return ['APPROVED', 'PUBLISHED'].includes(submission.status)
    && submission.primaryLanguage?.toLowerCase() === 'xsm'
    && Boolean(submission.dialect?.trim())
    && Boolean(submission.body?.trim());
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
  const [scripts, setScripts] = useState<Submission[]>([]);
  const [selectedScriptId, setSelectedScriptId] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const [operation, setOperation] = useState<StudioVideoOperation>('generate_visual');
  const [duration, setDuration] = useState<5 | 10>(5);
  const [visualModel, setVisualModel] = useState<'gen4_turbo' | 'gen4.5'>('gen4.5');
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
  const requestId = useRef<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let active = true;
    setLoading(true);
    setLoadFailed(false);
    void Promise.all([fetchStudioVideoCapabilities(), fetchMySubmissions(user.uid)])
      .then(([nextCapabilities, submissions]) => {
        if (!active) return;
        const approvedScripts = submissions.filter(isApprovedKasemScript);
        setCapabilities(nextCapabilities);
        setScripts(approvedScripts);
        setSelectedScriptId((current) => current || approvedScripts[0]?.id || '');
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setLoadFailed(true);
        setLoading(false);
      });
    return () => { active = false; };
  }, [user, reloadKey]);

  // A job id in the URL makes an in-progress generation resumable after a reload.
  useEffect(() => {
    const resumeJobId = new URLSearchParams(window.location.search).get('job');
    if (!resumeJobId) return;
    let active = true;
    setRefreshing(true);
    void refreshStudioVideoJob(resumeJobId)
      .then((next) => { if (active) setJob(next); })
      .catch((err: unknown) => { if (active) setError(errorMessage(err, 'Could not reopen this video job.')); })
      .finally(() => { if (active) setRefreshing(false); });
    return () => { active = false; };
  }, []);

  // Poll slowly enough to stay within the backend refresh allowance.
  useEffect(() => {
    if (!job || TERMINAL_STATUSES.has(job.status)) return;
    let active = true;
    const timer = window.setTimeout(() => {
      void refreshStudioVideoJob(job.id)
        .then((next) => { if (active) setJob(next); })
        .catch(() => { /* A transient poll failure is retried on the next manual refresh. */ });
    }, 20_000);
    return () => { active = false; window.clearTimeout(timer); };
  }, [job]);

  useEffect(() => {
    if (job?.status !== 'SUCCEEDED' || !job.outputStoragePath) return;
    let active = true;
    void loadStudioVideoOutput(job.outputStoragePath)
      .then((url) => {
        if (active) setOutputUrl(url);
        else URL.revokeObjectURL(url);
      })
      .catch((err: unknown) => {
        if (active) setError(errorMessage(err, 'The video is ready, but its preview could not be loaded.'));
      });
    return () => { active = false; };
  }, [job?.status, job?.outputStoragePath]);

  useEffect(() => () => {
    if (outputUrl) URL.revokeObjectURL(outputUrl);
  }, [outputUrl]);

  const selectedScript = scripts.find((script) => script.id === selectedScriptId) ?? null;
  const operationCapability = capabilities?.operations.find((item) => item.operation === operation);
  const model = operation === 'generate_visual' ? visualModel : lipSyncModel;
  const modelCapability = operationCapability?.models.find((item) => item.id === model);
  const costEstimate = (modelCapability?.estimatedUsdPerSecond ?? 0) * duration;
  const referenceRequired = operation === 'generate_visual' && modelCapability?.requiresReferenceImage === true;
  const recognisableConsentRequired = containsPerson || operation === 'lip_sync';

  const handleUpload = async (kind: StudioVideoAssetKind, event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !user) return;
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
  };

  const validate = (): string | null => {
    if (!selectedScript) return 'Choose an approved or published Kasem script.';
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
      if (referenceRequired && !referenceImage) return 'Gen-4 Turbo requires a reference image.';
      if (!referenceImage && ratio === '960:960') return 'Square video requires a reference image.';
    } else {
      if (!sourceVideo || !sourceAudio) return 'Upload both a source video and the matching Kasem audio.';
      if (!voiceConsent) return 'The recorded speaker must consent to AI voice processing.';
    }
    return null;
  };

  const buildInput = (): CreateStudioVideoJobInput => {
    if (!selectedScript) throw new Error('Choose an approved Kasem script.');
    if (!requestId.current) requestId.current = `video_${crypto.randomUUID().replace(/-/g, '')}`;
    const base = {
      clientRequestId: requestId.current,
      durationSeconds: duration,
      kasem: {
        languageCode: 'xsm' as const,
        dialect: selectedScript.dialect ?? '',
        transcript: selectedScript.body ?? '',
        validationRef: `submissions/${selectedScript.id}`,
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
        provider: 'runway',
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

  const submit = async () => {
    const validationError = validate();
    if (validationError) { setError(validationError); return; }
    setCreating(true);
    setError(null);
    try {
      const next = await createStudioVideoJob(buildInput());
      setJob(next);
      const url = new URL(window.location.href);
      url.searchParams.set('job', next.id);
      window.history.replaceState({}, '', `${url.pathname}${url.search}`);
    } catch (err) {
      setError(errorMessage(err, 'The video job could not be started. Retry keeps the same request id, so it cannot double-charge.'));
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
    } catch (err) {
      setError(errorMessage(err, 'Could not refresh the video status.'));
    } finally {
      setRefreshing(false);
    }
  }, [job]);

  const startAnother = () => {
    if (outputUrl) URL.revokeObjectURL(outputUrl);
    setOutputUrl(null);
    setJob(null);
    setError(null);
    requestId.current = null;
    const url = new URL(window.location.href);
    url.searchParams.delete('job');
    window.history.replaceState({}, '', `${url.pathname}${url.search}`);
  };

  const availableRatios = useMemo(() => {
    if (!capabilities) return [];
    if (referenceImage) return modelCapability?.imageRatios ?? capabilities.limits.ratios;
    return modelCapability?.textRatios?.length
      ? modelCapability.textRatios
      : capabilities.limits.ratios;
  }, [capabilities, modelCapability, referenceImage]);

  useEffect(() => {
    if (availableRatios.length > 0 && !availableRatios.includes(ratio)) {
      setRatio(availableRatios[0] as typeof ratio);
    }
  }, [availableRatios, ratio]);

  if (loading) return <div className="page"><h1>AI Video</h1><Skeleton lines={7} /></div>;
  if (loadFailed) {
    return (
      <div className="page">
        <h1>AI Video</h1>
        <LoadError title="We couldn’t open the video studio" onRetry={() => setReloadKey((key) => key + 1)} />
      </div>
    );
  }

  if (scripts.length === 0) {
    return (
      <div className="page video-studio">
        <header className="video-hero">
          <div><p className="hero__eyebrow">Kasem creator tool</p><h1>AI-assisted video</h1></div>
        </header>
        <div className="empty">
          <h2>Start with a reviewed Kasem script</h2>
          <p>The first release only sends approved or published Kasem text to a video provider. Create a Kasem submission, then return when its status is approved or published.</p>
          <Link to="/studio/submissions/new" className="button button--primary">Create Kasem script</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="page video-studio">
      <header className="video-hero">
        <div>
          <p className="hero__eyebrow">Kasem creator tool · first release</p>
          <h1>Bring a Kasem story to life</h1>
          <p>Generate a visual with Runway or lip-sync consented footage with fal. Your script and media are checked before they leave TribeStudio.</p>
        </div>
        <span className="video-hero__mark" aria-hidden="true">▶</span>
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
          {outputUrl ? (
            <div className="video-result__preview">
              <video controls playsInline src={outputUrl} aria-label="Generated Kasem video preview" />
              <div className="video-result__actions">
                <a className="button button--primary" href={outputUrl} download={`kasem-video-${job.id}.mp4`}>Download video</a>
                <Link
                  to={`/studio/submissions/new?generated=${encodeURIComponent(job.outputStoragePath ?? '')}`}
                  className="button button--ghost-dark"
                >
                  Publish in a new post
                </Link>
              </div>
            </div>
          ) : null}
          <div className="video-result__actions">
            {!TERMINAL_STATUSES.has(job.status) ? (
              <button type="button" className="button button--ghost-dark" disabled={refreshing} onClick={() => void refresh()}>
                {refreshing ? 'Checking…' : 'Check now'}
              </button>
            ) : null}
            <button type="button" className="button button--ghost-dark" onClick={startAnother}>Start another video</button>
          </div>
        </section>
      ) : (
        <div className="video-builder">
          <div className="video-builder__form">
            <section className="video-step">
              <span className="video-step__number">1</span>
              <div className="video-step__body">
                <h2>Choose the Kasem script</h2>
                <p className="muted">Only your approved or published xsm submissions appear here.</p>
                <Field label="Validated script" htmlFor="video-script">
                  <select id="video-script" value={selectedScriptId} onChange={(event) => setSelectedScriptId(event.target.value)}>
                    {scripts.map((script) => <option key={script.id} value={script.id}>{script.title || 'Untitled'} · {script.dialect}</option>)}
                  </select>
                </Field>
                {selectedScript ? (
                  <div className="script-preview">
                    <span>{selectedScript.dialect} · Kasem (xsm)</span>
                    <p>{selectedScript.body}</p>
                  </div>
                ) : null}
              </div>
            </section>

            <section className="video-step">
              <span className="video-step__number">2</span>
              <div className="video-step__body">
                <h2>Choose how to create</h2>
                <div className="video-mode" role="radiogroup" aria-label="Video operation">
                  <label className={operation === 'generate_visual' ? 'video-mode__card is-on' : 'video-mode__card'}>
                    <input type="radio" name="operation" checked={operation === 'generate_visual'} onChange={() => setOperation('generate_visual')} />
                    <strong>Generate a visual</strong><span>Build a new scene from your prompt and optional image.</span>
                  </label>
                  <label className={operation === 'lip_sync' ? 'video-mode__card is-on' : 'video-mode__card'}>
                    <input type="radio" name="operation" checked={operation === 'lip_sync'} onChange={() => setOperation('lip_sync')} />
                    <strong>Lip-sync footage</strong><span>Match a consented video to your Kasem recording.</span>
                  </label>
                </div>

                {operation === 'generate_visual' ? (
                  <div className="video-options">
                    <div className="field-row">
                      <Field label="Model" htmlFor="visual-model">
                        <select id="visual-model" value={visualModel} onChange={(event) => setVisualModel(event.target.value as typeof visualModel)}>
                          {operationCapability?.models.map((item) => <option key={item.id} value={item.id}>{MODEL_LABELS[item.id] ?? item.id}</option>)}
                        </select>
                      </Field>
                      <Field label="Length" htmlFor="video-duration">
                        <select id="video-duration" value={duration} onChange={(event) => setDuration(Number(event.target.value) as 5 | 10)}>
                          {capabilities?.limits.durationsSeconds.map((seconds) => <option key={seconds} value={seconds}>{seconds} seconds</option>)}
                        </select>
                      </Field>
                      <Field label="Shape" htmlFor="video-ratio">
                        <select id="video-ratio" value={ratio} onChange={(event) => setRatio(event.target.value as typeof ratio)}>
                          {availableRatios.map((item) => <option key={item} value={item}>{RATIO_LABELS[item] ?? item}</option>)}
                        </select>
                      </Field>
                    </div>
                    <Field label="Scene direction" htmlFor="video-prompt" hint="Describe people, setting, movement, light and camera motion. Do not put private information here.">
                      <textarea id="video-prompt" rows={5} maxLength={1000} value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="At golden hour in a Kassena courtyard, woven baskets beside the storyteller, slow camera push-in…" />
                    </Field>
                    <Field label={`Reference image ${referenceRequired ? '(required for this model)' : '(optional)'}`} htmlFor="reference-image" hint="JPEG, PNG or WebP under 20 MB. Use only an image you control.">
                      <input id="reference-image" type="file" accept="image/*" disabled={uploading !== null} onChange={(event) => void handleUpload('image', event)} />
                    </Field>
                    {referenceImage ? <p className="asset-ready"><span>✓</span>{referenceImage.name}</p> : null}
                  </div>
                ) : (
                  <div className="video-options">
                    <div className="field-row">
                      <Field label="Lip-sync model" htmlFor="lipsync-model">
                        <select id="lipsync-model" value={lipSyncModel} onChange={(event) => setLipSyncModel(event.target.value as typeof lipSyncModel)}>
                          {operationCapability?.models.map((item) => <option key={item.id} value={item.id}>{MODEL_LABELS[item.id] ?? item.id}</option>)}
                        </select>
                      </Field>
                      <Field label="Length" htmlFor="lipsync-duration">
                        <select id="lipsync-duration" value={duration} onChange={(event) => setDuration(Number(event.target.value) as 5 | 10)}>
                          {capabilities?.limits.durationsSeconds.map((seconds) => <option key={seconds} value={seconds}>{seconds} seconds</option>)}
                        </select>
                      </Field>
                      <Field label="Duration handling" htmlFor="sync-mode">
                        <select id="sync-mode" value={syncMode} onChange={(event) => setSyncMode(event.target.value as typeof syncMode)}>
                          <option value="cut_off">Cut off longer source</option><option value="loop">Loop video</option><option value="bounce">Bounce video</option><option value="silence">Pad with silence</option><option value="remap">Remap timing</option>
                        </select>
                      </Field>
                    </div>
                    <div className="media-pair">
                      <Field label="Source video" htmlFor="source-video" hint="MP4 or other video under 200 MB.">
                        <input id="source-video" type="file" accept="video/*" disabled={uploading !== null} onChange={(event) => void handleUpload('video', event)} />
                        {sourceVideo ? <p className="asset-ready"><span>✓</span>{sourceVideo.name}</p> : null}
                      </Field>
                      <Field label="Kasem voice recording" htmlFor="source-audio" hint="Audio under 50 MB; it must match the selected transcript.">
                        <input id="source-audio" type="file" accept="audio/*" disabled={uploading !== null} onChange={(event) => void handleUpload('audio', event)} />
                        {sourceAudio ? <p className="asset-ready"><span>✓</span>{sourceAudio.name}</p> : null}
                      </Field>
                    </div>
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
                <h2>Permissions and consent</h2>
                <p className="muted">These confirmations apply to this generation only. AI-training permission is not requested.</p>
                <div className="consent-grid">
                  <label className="checkbox"><input type="checkbox" checked={aiPermission} onChange={(event) => setAiPermission(event.target.checked)} /><span>I permit TribeStudio to send this job’s script and selected media to the named AI provider.</span></label>
                  <label className="checkbox"><input type="checkbox" checked={rightsConfirmed} onChange={(event) => setRightsConfirmed(event.target.checked)} /><span>I created or control the material and have the necessary rights.</span></label>
                  <label className="checkbox"><input type="checkbox" checked={culturalPermission} onChange={(event) => setCulturalPermission(event.target.checked)} /><span>I have the cultural permission needed to represent this story, language and imagery.</span></label>
                  <label className="checkbox"><input type="checkbox" checked={noMinors} onChange={(event) => setNoMinors(event.target.checked)} /><span>I confirm that no minor appears in or supplied the source material.</span></label>
                  <label className="checkbox"><input type="checkbox" checked={noThirdParty} onChange={(event) => setNoThirdParty(event.target.checked)} /><span>I confirm there is no third-party music, image, voice or footage in this job.</span></label>
                  <label className="checkbox"><input type="checkbox" checked={containsPerson} onChange={(event) => setContainsPerson(event.target.checked)} /><span>The source or requested video contains a recognisable person.</span></label>
                  <label className="checkbox"><input type="checkbox" checked={participantConsent} onChange={(event) => setParticipantConsent(event.target.checked)} /><span>Every featured participant consented to this AI-assisted creation.</span></label>
                  <label className="checkbox"><input type="checkbox" checked={likenessConsent} onChange={(event) => setLikenessConsent(event.target.checked)} /><span>Every recognisable person consented to use of their likeness.</span></label>
                  {operation === 'lip_sync' ? <label className="checkbox"><input type="checkbox" checked={voiceConsent} onChange={(event) => setVoiceConsent(event.target.checked)} /><span>The recorded speaker consented to AI voice processing and lip-sync.</span></label> : null}
                </div>
              </div>
            </section>
          </div>

          <aside className="video-summary">
            <p className="hero__eyebrow">Before you create</p>
            <h2>{MODEL_LABELS[model] ?? model}</h2>
            <dl>
              <div><dt>Language</dt><dd>Kasem · xsm</dd></div>
              <div><dt>Length</dt><dd>{duration} seconds</dd></div>
              <div><dt>Estimated charge</dt><dd>{formatUsd(costEstimate)}</dd></div>
              <div><dt>Pricing snapshot</dt><dd>{capabilities?.pricingVersion}</dd></div>
            </dl>
            <p className="tiny muted">This estimate is for one provider generation. Provider billing can change; TribeStudio records the rate snapshot with the job.</p>
            {error ? <div className="callout callout--warn" role="alert">{error}</div> : null}
            <button type="button" className="button button--primary button--block" disabled={creating || uploading !== null} onClick={() => void submit()}>
              {creating ? 'Starting securely…' : `Create for about ${formatUsd(costEstimate)}`}
            </button>
            <p className="video-summary__safety">Your provider keys never enter this browser. Inputs and outputs remain private in Firebase until you choose to publish.</p>
          </aside>
        </div>
      )}
    </div>
  );
}
