import { Breadcrumb, ButtonLink, Consequence, EmptyState, Icon, KeyValue, LoadFailure, Loading, Notice, PageHeader, ProgressBar, type IconName } from '../../ui';
import { useEffect, useMemo, useRef, useState } from 'react';
import { getDownloadURL, ref } from 'firebase/storage';
import { storage } from '../../firebase';
import type { Campaign, Submission } from '@indigen-world/contracts/creator-models';
import { Link, matchRoute, useQueryParam, useRoute } from '../../router';
import { useAuth } from '../../auth';
import { DraftRecovery, useRecovery } from '../../drafts/useRecovery';
import { trackEvent } from '../../analytics';
import { useConfig } from '../CreatorProvider';
import {
  fetchCampaign,
  fetchSubmission,
  newSubmissionId,
  saveSubmission,
  submissionsOpen,
  uploadSubmissionMedia,
  type SubmissionDraftInput,
} from '../data';
import { Field, Stepper, VoiceRecorder, WhatsAppCard } from '../components';
import { RouteLoader } from '../../LoadingScreen';

import { discoverySource } from '../discoverySource';
import { KasemField } from '../../spelling/KasemField';

const STEPS = ['Details', 'Media', 'Permissions', 'Review'];

type MediaType = 'image' | 'audio' | 'video' | 'document';
type StudioType = NonNullable<Submission['studioType']>;

const STUDIO_OPTIONS: { value: StudioType; label: string; body: string }[] = [
  { value: 'writing', label: 'Writing', body: 'Articles, stories, scripts and lesson text.' },
  { value: 'video', label: 'Video', body: 'Uploaded video or a public video link.' },
  { value: 'audio', label: 'Audio', body: 'Songs, interviews, oral history and voice recordings.' },
  { value: 'image', label: 'Image / visual story', body: 'Single images, galleries, captions and context.' },
  { value: 'translation', label: 'Translation', body: 'Source and translated text with notes.' },
];

const FORMAT_ICON: Record<StudioType, IconName> = { writing: 'doc', video: 'video', audio: 'audio', image: 'image', translation: 'translation' };

const FORMAT_TIP: Record<StudioType, string> = {
  writing: 'Write a short story: what happened, who was involved, and why it matters to you.',
  audio: 'Record a short memory or explanation. Introduce the topic and add context for listeners.',
  video: 'Share a short video with a title and context. Check the preview before publishing.',
  image: 'Choose a photo and explain what it shows. Add alternative text for people who cannot see it.',
  translation: 'Add the original text, your translation, and any notes about meaning or usage.',
};

function mediaTypeFor(mime: string): MediaType {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime.startsWith('video/')) return 'video';
  return 'document';
}

/**
 * Campaign id stored on an everyday post.
 *
 * Submissions have always carried a campaign reference, so open posts need
 * *something* there. A sentinel keeps the document shape unchanged while the
 * security rules and the publication trigger both read it as "not a campaign" —
 * which is what routes it past review and straight to Explore.
 */
const OPEN_CAMPAIGN_ID = 'open';

export function SubmissionNewPage() {
  const { path, search } = useRoute();
  const { user } = useAuth();
  const id = matchRoute('/studio/submissions/:id/edit', path)?.id;
  return <SubmissionLoader key={JSON.stringify([id, search, user?.uid])} id={id} />;
}

function SubmissionLoader({ id }: { id?: string }) {
  const { user } = useAuth();
  const [existing, setExisting] = useState<Submission | null>(null);
  const [loading, setLoading] = useState(Boolean(id));
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!id || !user) return;
    let active = true;
    setLoading(true);
    setError('');
    void fetchSubmission(id).then((sub) => {
      if (!active) return;
      if (!sub || sub.authUid !== user.uid || !['DRAFT', 'NEEDS_REVISION'].includes(sub.status)
        || sub.collectionContribution || sub.campaign.id === 'collection-contributions') {
        setError('This submission is unavailable or cannot be edited.');
      } else { setExisting(sub); }
      setLoading(false);
    }).catch(() => {
      if (active) { setError('Could not load your submission. Please retry.'); setLoading(false); }
    });
    return () => { active = false; };
  }, [id, user, retry]);
  if (loading) return <div className="ts-page"><RouteLoader note="Opening your post" /></div>;
  if (error) return (
    <div className="ts-page ts-page--medium">
      <LoadFailure title="This post cannot be opened" body={error} onRetry={() => setRetry((n) => n + 1)} compact={false} />
      <Link className="ts-link" to="/studio/submissions">Back to your content</Link>
    </div>
  );
  return <SubmissionEditor existing={existing} />;
}

function SubmissionEditor({ existing }: { existing: Submission | null }) {
  const { user } = useAuth();
  const { config, whatsappUrl } = useConfig();
  const { navigate } = useRoute();
  const queryCampaign = useQueryParam('campaign') ?? '';
  const requestedCampaign = existing ? (existing.campaign.id === OPEN_CAMPAIGN_ID ? '' : existing.campaign.id) : queryCampaign;
  const sourceLink = discoverySource(useQueryParam('source'));
  const requestedType = useQueryParam('type');
  const initialType = STUDIO_OPTIONS.find((option) => option.value === requestedType)?.value ?? 'writing';
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine);
  const generatedVideoPath = useQueryParam('generated') ?? '';
  // No campaign in the URL means this is an open post: anyone may publish it,
  // it needs no verification, and nobody reviews it before it goes live.
  const isOpenPost = requestedCampaign.trim() === '';
  const campaignId = isOpenPost ? OPEN_CAMPAIGN_ID : requestedCampaign;
  // Lazy-init so a fresh submission id is generated once, not on every render.
  const submissionIdRef = useRef<string>('');
  if (!submissionIdRef.current) submissionIdRef.current = existing?.id ?? newSubmissionId();
  const submissionId = submissionIdRef;
  const persistedRef = useRef(existing !== null);
  const remoteVersion = useRef(existing?.lifecycle.version);
  const recoveryKey = 'tribestudio:last-draft:' + user?.uid + ':' + campaignId;
  const [recoverableId, setRecoverableId] = useState<string | null>(() => {
    try { return window.localStorage.getItem(recoveryKey); } catch { return null; }
  });
  useEffect(() => {
    const reconnect = () => { setOnline(true); setSaveStatus(''); };
    const disconnect = () => setOnline(false);
    window.addEventListener('online', reconnect);
    window.addEventListener('offline', disconnect);
    return () => { window.removeEventListener('online', reconnect); window.removeEventListener('offline', disconnect); };
  }, []);

  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const writeBusy = useRef(false);
  const uploadBusy = useRef(false);
  const [failedFile, setFailedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [previewError, setPreviewError] = useState('');
  const [previewRetry, setPreviewRetry] = useState(0);
  const [saveStatus, setSaveStatus] = useState('');
  const [savedSnapshot, setSavedSnapshot] = useState<string | null>(null);

  // Form state
  const [studioType, setStudioType] = useState<StudioType>(existing?.studioType ?? initialType);
  const [title, setTitle] = useState(existing?.title ?? '');
  const [category, setCategory] = useState(existing?.category ?? useQueryParam('category') ?? '');
  const [primaryLanguage, setPrimaryLanguage] = useState(existing?.primaryLanguage ?? 'xsm');
  const [dialect, setDialect] = useState(existing?.dialect ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [body, setBody] = useState(existing?.body ?? '');
  const [tags, setTags] = useState(existing?.tags?.join(', ') ?? '');
  const [targetAudience, setTargetAudience] = useState(existing?.targetAudience ?? '');
  const [sourceReferences, setSourceReferences] = useState(existing?.sourceReferences ?? sourceLink);
  const [translationNotes, setTranslationNotes] = useState(existing?.translationNotes ?? '');
  const [sourceLanguage, setSourceLanguage] = useState(existing?.translation?.sourceLanguage ?? 'xsm');
  const [targetLanguage, setTargetLanguage] = useState(existing?.translation?.targetLanguage ?? 'en');
  const [sourceContent, setSourceContent] = useState(existing?.translation?.sourceContent ?? '');
  const [translatedContent, setTranslatedContent] = useState(existing?.translation?.translatedContent ?? '');
  const [translatorNotes, setTranslatorNotes] = useState(existing?.translation?.translatorNotes ?? '');
  const [caption, setCaption] = useState(existing?.caption ?? '');
  const [altText, setAltText] = useState(existing?.altText ?? '');
  const [englishSummary, setEnglishSummary] = useState(existing?.englishSummary ?? '');
  const [culturalContext, setCulturalContext] = useState(existing?.culturalContext ?? '');
  const [externalPostUrl, setExternalPostUrl] = useState(existing?.externalPostUrl ?? '');
  const [involvesMinors, setInvolvesMinors] = useState(existing?.disclosures.involvesMinors ?? false);
  const [usesThirdParty, setUsesThirdParty] = useState(existing?.disclosures.usesThirdPartyMaterial ?? false);
  const [sourceInfo, setSourceInfo] = useState(existing?.disclosures.sourceInfo ?? '');
  const [media, setMedia] = useState<Submission['media']>(existing?.media);
  const [permReview, setPermReview] = useState(existing?.permissions.review ?? true);
  // Publishing is the whole point of an open post, so it starts granted there
  // and stays an explicit opt-in for campaign entries.
  const [permPublish, setPermPublish] = useState(existing?.permissions.publication ?? (requestedCampaign.trim() === ''));
  const [permPromo, setPermPromo] = useState(existing?.permissions.promotion ?? false);
  const [permAi, setPermAi] = useState(existing?.permissions.aiTraining ?? false);
  const [attRights, setAttRights] = useState(false);
  const [attParticipants, setAttParticipants] = useState(false);
  const [attGuardian, setAttGuardian] = useState(false);
  const [attCopyright, setAttCopyright] = useState(false);

  // A completed AI-video job or a browser-rendered editor export can hand its
  // private Firebase output straight to the normal publishing workflow. Both
  // prefixes are owner-scoped so a URL parameter cannot attach another
  // creator's media.
  useEffect(() => {
    if (existing || !user || !generatedVideoPath) return;
    const ownAiOutput = generatedVideoPath.startsWith(`studio-video-jobs/${user.uid}/`)
      && generatedVideoPath.endsWith('/output.mp4');
    const ownEditorOutput = generatedVideoPath.startsWith(`creator-submissions/${user.uid}/studio-video/`)
      && /\.(mp4|webm|mov)$/i.test(generatedVideoPath);
    if (!ownAiOutput && !ownEditorOutput) return;
    const mimeType = generatedVideoPath.toLowerCase().endsWith('.webm') ? 'video/webm'
      : generatedVideoPath.toLowerCase().endsWith('.mov') ? 'video/quicktime'
        : 'video/mp4';
    setStudioType('video');
    setMedia({
      storagePath: generatedVideoPath,
      mimeType,
      sizeBytes: 0,
      mediaType: 'video',
      thumbnailPath: null,
      captionsPath: null,
    });
    setUploadPct(100);
  }, [generatedVideoPath, user, existing]);

  useEffect(() => {
    if (isOpenPost) { setLoading(false); return; }
    let active = true;
    void fetchCampaign(campaignId)
      .then((c) => {
        if (!active) return;
        setCampaign(c);
        setLoading(false);
        trackEvent('submission_started', { campaign: c?.slug ?? campaignId });
      })
      .catch(() => {
        // Fall through to the "Campaign not found" state rather than hanging
        // on the loading placeholder.
        if (active) { setCampaign(null); setLoading(false); }
      });
    return () => { active = false; };
  }, [campaignId, isOpenPost]);

  const mediaLimits = config?.mediaRestrictions ?? campaign?.fileRequirements;
  // An open post must never be blocked by a missing platform configuration:
  // the category field is required to submit, so an empty list would make
  // posting impossible on a project whose config document has not been seeded.
  const FALLBACK_CATEGORIES = [
    'storytelling', 'folklore', 'proverb', 'song', 'oral-history',
    'language-lesson', 'craft', 'festival', 'everyday-life', 'culture', 'other',
  ];
  const configuredCategories = (config?.contentCategories ?? []).map((c) => c.slug);
  const categories = campaign?.categories && campaign.categories.length > 0
    ? campaign.categories
    : configuredCategories.length > 0
      ? configuredCategories
      : FALLBACK_CATEGORIES;
  const dialects = config?.dialects ?? [];

  const draftInput = useMemo<SubmissionDraftInput>(() => ({
    id: submissionId.current,
    uid: user?.uid ?? '',
    campaignId,
    studioType,
    title,
    category,
    primaryLanguage,
    dialect,
    description,
    body,
    tags: tags.split(',').map((s) => s.trim()).filter(Boolean),
    targetAudience,
    sourceReferences,
    translationNotes,
    translation: { sourceLanguage, targetLanguage, sourceContent, translatedContent, translatorNotes },
    caption,
    altText,
    englishSummary,
    culturalContext,
    externalPostUrl,
    participants: existing?.participants ?? [],
    disclosures: { involvesMinors, usesThirdPartyMaterial: usesThirdParty, sourceInfo },
    attestations: { ownsOrHasRights: attRights, participantsConsented: attParticipants, guardianPermissionForMinors: attGuardian, noUnlawfulCopyright: attCopyright },
    permissions: { review: permReview, publication: permPublish, promotion: permPromo, aiTraining: permAi },
    media: media ?? null,
    consentVersion: config?.termsVersion ?? 'creator-terms-unversioned',
  }), [user, campaignId, studioType, title, category, primaryLanguage, dialect, description, body, tags, targetAudience, sourceReferences, translationNotes, sourceLanguage, targetLanguage, sourceContent, translatedContent, translatorNotes, caption, altText, englishSummary, culturalContext, externalPostUrl, involvesMinors, usesThirdParty, sourceInfo, attRights, attParticipants, attGuardian, attCopyright, permReview, permPublish, permPromo, permAi, media, config, existing]);

  // The account id (each useAuth() resolves on its own, a moment after mount)
  // and the terms version (it arrives with the platform configuration) are not
  // edits, so they never make an untouched form dirty — otherwise opening the
  // composer would autosave an empty draft.
  const snapshotOf = (input: SubmissionDraftInput) => JSON.stringify({ ...input, uid: null, consentVersion: null });
  const snapshot = snapshotOf(draftInput);
  const initialSnapshot = useRef(snapshot);
  const dirty = snapshot !== (savedSnapshot ?? initialSnapshot.current);
  const recovery = useRecovery(user?.uid ?? '', `submission:${campaignId}`, { input: draftInput, persisted: persistedRef.current }, dirty, saved => {
    if (saved.persisted && saved.input.id !== existing?.id) { navigate(`/studio/submissions/${encodeURIComponent(saved.input.id)}/edit`); return; }
    const input = saved.input;
    if (input.uid !== user?.uid || input.campaignId !== campaignId) return;
    submissionId.current = input.id; persistedRef.current = saved.persisted;
    setStudioType(input.studioType ?? 'writing'); setTitle(input.title); setCategory(input.category);
    setPrimaryLanguage(input.primaryLanguage); setDialect(input.dialect); setDescription(input.description);
    setBody(input.body); setTags(input.tags.join(', ')); setTargetAudience(input.targetAudience);
    setSourceReferences(input.sourceReferences); setTranslationNotes(input.translationNotes);
    setSourceLanguage(input.translation.sourceLanguage ?? 'xsm'); setTargetLanguage(input.translation.targetLanguage ?? 'en');
    setSourceContent(input.translation.sourceContent ?? ''); setTranslatedContent(input.translation.translatedContent ?? ''); setTranslatorNotes(input.translation.translatorNotes ?? '');
    setCaption(input.caption); setAltText(input.altText); setEnglishSummary(input.englishSummary); setCulturalContext(input.culturalContext); setExternalPostUrl(input.externalPostUrl);
    setInvolvesMinors(input.disclosures.involvesMinors); setUsesThirdParty(input.disclosures.usesThirdPartyMaterial); setSourceInfo(input.disclosures.sourceInfo);
    setPermReview(input.permissions.review); setPermPublish(input.permissions.publication); setPermPromo(input.permissions.promotion); setPermAi(input.permissions.aiTraining);
    setMedia(input.media ?? undefined);
    setAttRights(false); setAttParticipants(false); setAttGuardian(false); setAttCopyright(false);
  }, String(existing?.lifecycle.version ?? 0));
  const dirtyRef = useRef(false);
  dirtyRef.current = dirty;

  useEffect(() => {
    if (!online || !dirty || loading || saving || uploadBusy.current || recovery.recovery || saveStatus.startsWith('Not saved')) return;
    const timer = window.setTimeout(() => { void saveDraft(); }, 1500);
    return () => window.clearTimeout(timer);
  }, [snapshot, dirty, loading, saving, uploadPct, saveStatus, online]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (dirtyRef.current || uploadBusy.current || writeBusy.current) { event.preventDefault(); event.returnValue = ''; }
    };
    const leave = (event: Event) => {
      if ((dirtyRef.current || uploadBusy.current || writeBusy.current)
        && !window.confirm('Your latest changes have not finished saving. Leave this page?')) event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    window.addEventListener('studio:before-navigate', leave);
    return () => { window.removeEventListener('beforeunload', warn); window.removeEventListener('studio:before-navigate', leave); };
  }, []);

  useEffect(() => {
    let active = true;
    setPreviewUrl('');
    setPreviewError('');
    if (media?.storagePath) void getDownloadURL(ref(storage, media.storagePath))
      .then((url) => { if (active) setPreviewUrl(url); })
      .catch(() => { if (active) setPreviewError('Could not load the attachment preview.'); });
    return () => { active = false; };
  }, [media, previewRetry]);

  const attachmentPreview = media ? <div className="cr-attachment">
    {previewError ? <p className="ts-error" role="alert"><Icon name="alert" />{previewError} <button type="button" className="ts-link" onClick={() => setPreviewRetry((n) => n + 1)}>Retry preview</button></p> : !previewUrl ? <p className="cr-attachment__loading"><span className="ts-spinner" aria-hidden="true" />Loading attachment…</p> :
      media.mediaType === 'image' ? <img src={previewUrl} alt={altText || 'Attachment preview'} /> :
      media.mediaType === 'audio' ? <audio controls src={previewUrl} /> :
      media.mediaType === 'video' ? <video controls playsInline src={previewUrl} /> :
      <a className="ts-btn ts-btn--secondary ts-btn--sm" href={previewUrl} target="_blank" rel="noreferrer"><Icon name="doc" />Open attached document</a>}
  </div> : null;

  if (loading) return <div className="ts-page"><Loading label="Opening the composer" /></div>;

  if (!isOpenPost && !campaign) {
    return (
      <div className="ts-page ts-page--medium">
        <EmptyState boxed icon="opportunities" title="Campaign not found" body="This campaign may have ended, or the link may be incomplete."
          actions={<ButtonLink to="/studio/opportunities" variant="secondary" icon="back">Back to opportunities</ButtonLink>} />
      </div>
    );
  }

  // Gate: a campaign only accepts entries while it is open. An open post has
  // no such window — the feed is always accepting.
  if (!isOpenPost && campaign && !submissionsOpen(campaign) && existing?.status !== 'NEEDS_REVISION') {
    return (
      <div className="ts-page ts-page--medium">
        <PageHeader
          breadcrumb={<Breadcrumb items={[{ label: 'Opportunities', to: '/studio/opportunities' }, { label: campaign.title }]} />}
          kicker="Campaign entry"
          title="Submissions are not open yet"
          description={<><strong>{campaign.title}</strong> is not accepting entries right now. Openings are announced on the creator channel.</>}
        />
        <WhatsAppCard url={whatsappUrl} />
        <Link className="ts-link" to="/studio/opportunities"><Icon name="back" />Back to opportunities</Link>
      </div>
    );
  }

  const handleFile = async (file: File | undefined) => {
    if (!file || !user || uploadBusy.current || writeBusy.current) return;
    setError(null);
    const maxBytes = mediaLimits?.maxFileBytes ?? 500 * 1024 * 1024;
    if (file.size > maxBytes) {
      setError(`File is too large. Maximum is ${Math.round(maxBytes / (1024 * 1024))} MB.`);
      return;
    }
    const accepted = mediaLimits?.acceptedMimeTypes;
    if (accepted && accepted.length > 0 && !accepted.includes(file.type)) {
      setError(`Unsupported file type (${file.type || 'unknown'}).`);
      return;
    }
    uploadBusy.current = true;
    setFailedFile(null);
    setUploadPct(0);
    try {
      const { storagePath } = await uploadSubmissionMedia(user.uid, campaignId, submissionId.current, file, setUploadPct);
      setMedia({ storagePath, mimeType: file.type, sizeBytes: file.size, mediaType: mediaTypeFor(file.type), thumbnailPath: null, captionsPath: null });
      setUploadPct(100);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed. Please retry.');
      setFailedFile(file);
      setUploadPct(null);
    } finally { uploadBusy.current = false; }
  };

  const saveDraft = async () => {
    if (recovery.recovery) return false;
    if (!user || writeBusy.current || uploadBusy.current) return false;
    if (!online) { setSaveStatus('Not saved — reconnect to save your latest changes.'); return false; }
    writeBusy.current = true;
    setSaveStatus('Saving…');
    setSaving(true);
    setError(null);
    try {
      const saved = await saveSubmission(draftInput, 'DRAFT', persistedRef.current ? undefined : null, remoteVersion.current);
      if (saved) remoteVersion.current = saved.lifecycle.version;
      persistedRef.current = true;
      setSavedSnapshot(snapshotOf(draftInput));
      setSaveStatus('Saved to your account');
      try { window.localStorage.setItem(recoveryKey, submissionId.current); } catch { /* Saving to the account already succeeded. */ }
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save draft.');
      setSaveStatus('Not saved — use Save draft to retry.');
      return false;
    } finally {
      writeBusy.current = false;
      setSaving(false);
    }
  };

  const validate = (onlyStep?: number): { message: string; step: number; field: string } | null => {
    if ((onlyStep === undefined || onlyStep === 1) && externalPostUrl.trim()) {
      let valid = false;
      try { valid = ['https:', 'http:'].includes(new URL(externalPostUrl.trim()).protocol); } catch { /* Invalid URL. */ }
      if (!valid) return { message: 'Enter a valid http or https public link.', step: 1, field: 'ext' };
    }
    if ((onlyStep === undefined || onlyStep === 0) && (!title.trim())) return { message: 'A content title is required.', step: 0, field: 't' };
    if ((onlyStep === undefined || onlyStep === 0) && (!category)) return { message: 'Choose a content category.', step: 0, field: 'cat' };
    if ((onlyStep === undefined || onlyStep === 0) && (studioType === 'writing' && body.trim().length < 40)) return { message: 'Add the written content before submitting.', step: 0, field: 'body' };
    if ((onlyStep === undefined || onlyStep === 0) && (studioType === 'translation' && (sourceContent.trim().length < 10 || translatedContent.trim().length < 10))) return { message: 'Add at least 10 characters in both source and translated text.', step: 0, field: sourceContent.trim().length < 10 ? 'sourceContent' : 'translatedContent' };
    if ((onlyStep === undefined || onlyStep === 1) && (['video', 'audio', 'image'].includes(studioType) && !media && !externalPostUrl.trim())) return { message: 'Upload media or provide a link to an existing public post.', step: 1, field: 'media-file' };
    if ((onlyStep === undefined || onlyStep === 0) && (studioType === 'image' && !altText.trim())) return { message: 'Alternative text is required for visual submissions.', step: 0, field: 'altText' };
    if ((onlyStep === undefined || onlyStep === 2) && (isOpenPost && !permPublish)) return { message: 'Grant publication permission to post this publicly.', step: 2, field: 'perm-publish' };
    if ((onlyStep === undefined || onlyStep === 2) && (!isOpenPost && !permReview)) return { message: 'Permission to review the submission is required to enter.', step: 2, field: 'perm-review' };
    if ((onlyStep === undefined || onlyStep === 2) && (!attRights || !attCopyright)) return { message: 'Please confirm you have the rights to submit this content.', step: 2, field: !attRights ? 'att-rights' : 'att-copyright' };
    if ((onlyStep === undefined || onlyStep === 2) && (!attParticipants)) return { message: 'Please confirm anyone featured has consented.', step: 2, field: 'att-participants' };
    if ((onlyStep === undefined || onlyStep === 2) && (involvesMinors && !attGuardian)) return { message: 'Guardian permission is required when minors appear.', step: 2, field: 'att-guardian' };
    return null;
  };

  const submit = async () => {
    if (!user || writeBusy.current || uploadBusy.current) return;
    if (!online) { setError('Reconnect before publishing. Keep this tab open to retain your latest changes.'); return; }
    const problem = validate();
    if (problem) { showProblem(problem); return; }
    writeBusy.current = true;
    setSaving(true);
    setError(null);
    try {
      const saved = await saveSubmission(draftInput, 'SUBMITTED', persistedRef.current ? undefined : null, remoteVersion.current);
      if (saved) remoteVersion.current = saved.lifecycle.version;
      recovery.clear();
      persistedRef.current = true;
      trackEvent(existing ? 'submission_updated' : 'submission_completed', { campaign: campaign?.slug ?? OPEN_CAMPAIGN_ID });
      try { window.localStorage.removeItem(recoveryKey); } catch { /* No local draft pointer. */ }
      dirtyRef.current = false;
      writeBusy.current = false;
      navigate(`/studio/submissions/${submissionId.current}`);
    } catch (err) {
      writeBusy.current = false;
      setError(err instanceof Error ? err.message : 'Submission failed. Please retry before leaving this page.');
      setSaving(false);
    }
  };

  const showProblem = (problem: NonNullable<ReturnType<typeof validate>>) => {
    setError(problem.message); setStep(problem.step);
    window.setTimeout(() => document.getElementById(problem.field)?.focus(), 0);
  };
  const next = async () => { const problem = validate(step); if (problem) { showProblem(problem); return; } if (!online || await saveDraft()) setStep((s) => Math.min(s + 1, 3)); };
  const back = () => setStep((s) => Math.max(s - 1, 0));

  const failedSave = saveStatus.startsWith('Not saved');
  const uploading = uploadPct !== null && uploadPct < 100;
  const saveText = saving ? 'Saving…' : dirty ? failedSave ? saveStatus : 'Unsaved changes' : saveStatus || 'Drafts save automatically as you work.';
  const formatLabel = STUDIO_OPTIONS.find((o) => o.value === studioType)?.label ?? studioType;
  const mediaSummary = media ? `${media.mediaType} · ${Math.round((media.sizeBytes ?? 0) / 1024)} KB` : externalPostUrl ? 'External link' : studioType === 'writing' || studioType === 'translation' ? 'Optional' : 'None';
  const languageName = (code: string) => (code === 'xsm' ? 'Kasem' : 'English');

  return (
    <div className="ts-page cr-compose">
      <PageHeader
        breadcrumb={<Breadcrumb items={[{ label: 'Content library', to: '/studio/submissions' }, { label: existing ? 'Edit' : 'New' }]} />}
        kicker={isOpenPost ? 'Open post' : 'Campaign entry'}
        title={existing ? 'Edit submission' : isOpenPost ? 'New post' : 'New campaign submission'}
        description={isOpenPost
          ? 'Publishes to Explore after you preview it. Until then the draft is private to you.'
          : <>For <strong>{campaign?.title ?? 'this campaign'}</strong>. Entries are reviewed before anything is published.</>}
      />

      <div className="cr-compose__bar">
        <Stepper steps={STEPS} current={step} />
        <div className="cr-compose__save">
          <p className={`ts-save cr-save${saving ? ' is-saving' : ''}${failedSave ? ' is-error' : ''}${dirty && !saving && !failedSave ? ' is-dirty' : ''}`} role="status" aria-live="polite">
            <span className="ts-save__mark" aria-hidden="true"><Icon name={failedSave ? 'alert' : dirty ? 'edit' : 'check'} /></span>
            {saveText}
          </p>
          {failedSave && online ? <button type="button" className="ts-btn ts-btn--secondary ts-btn--sm" disabled={saving} onClick={() => void saveDraft()}>Retry saving</button> : null}
        </div>
      </div>
      <DraftRecovery draft={recovery} />

      {!existing && recoverableId && recoverableId !== submissionId.current ? (
        <Notice
          tone="info"
          title="You have a saved account draft."
          action={(
            <span className="ts-cluster">
              <Link className="ts-btn ts-btn--secondary ts-btn--sm" to={`/studio/submissions/${encodeURIComponent(recoverableId)}/edit`}>Resume saved draft</Link>
              <button type="button" className="ts-btn ts-btn--ghost ts-btn--sm" onClick={() => { setRecoverableId(null); try { window.localStorage.removeItem(recoveryKey); } catch { /* Optional pointer. */ } }}>Start a separate post</button>
            </span>
          )}
        >
          Resume it, or keep this one as a separate post.
        </Notice>
      ) : null}
      {sourceLink ? (
        <Notice
          tone="info"
          title="Continue from what you discovered."
          action={<a className="ts-btn ts-btn--secondary ts-btn--sm" href={sourceLink} target="_blank" rel="noreferrer">View the original<Icon name="external" /></a>}
        >
          The link is in your source references. Add your own work and confirm permission for anything you reuse.
        </Notice>
      ) : null}
      {!online ? (
        <Notice tone="warning" icon="wifi-off" title="You are offline.">
          You can keep writing. Check the draft recovery indicator before leaving; uploading and publishing need a connection.
        </Notice>
      ) : null}
      {existing?.moderation?.feedback ? (
        <Notice tone="warning" icon="message" title="Reviewer feedback">
          <span className="preserve-lines">{existing.moderation.feedback}</span>
        </Notice>
      ) : null}

      <div className="cr-compose__layout">
        <div className="cr-compose__card">
          {step === 0 ? (
            <section className="cr-step" aria-labelledby="cr-step-title">
              <header className="cr-step__head">
                <span className="cr-step__n" aria-hidden="true">1</span>
                <div>
                  <h2 id="cr-step-title">Content details</h2>
                  <p>Choose a format, then tell people what the post is.</p>
                </div>
              </header>

              <fieldset className="cr-fieldset">
                <legend className="ts-label">Format</legend>
                <div className="cr-formats">
                  {STUDIO_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className={studioType === option.value ? 'cr-format is-on' : 'cr-format'}
                      aria-pressed={studioType === option.value}
                      onClick={() => setStudioType(option.value)}
                    >
                      <span className="cr-format__icon" aria-hidden="true"><Icon name={FORMAT_ICON[option.value]} /></span>
                      <strong>{option.label}</strong>
                      <span>{option.body}</span>
                    </button>
                  ))}
                </div>
              </fieldset>

              <div className="cr-group">
                <h3 className="cr-group__title">About the post</h3>
                <Field label="Content title" htmlFor="t"><input id="t" className="ts-input" value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
                <div className="field-row">
                  <Field label="Category" htmlFor="cat">
                    <select id="cat" className="ts-select" value={category} onChange={(e) => setCategory(e.target.value)}>
                      <option value="">Select…</option>
                      {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </Field>
                  <Field label="Primary language" htmlFor="pl">
                    <select id="pl" className="ts-select" value={primaryLanguage} onChange={(e) => setPrimaryLanguage(e.target.value)}>
                      <option value="xsm">Kasem</option>
                      <option value="en">English</option>
                    </select>
                  </Field>
                </div>
                <Field label="Dialect / community variant" htmlFor="dl">
                  <select id="dl" className="ts-select" value={dialect} onChange={(e) => setDialect(e.target.value)}>
                    <option value="">Select…</option>
                    {dialects.map((d) => <option key={d.slug} value={d.slug}>{d.label}</option>)}
                  </select>
                </Field>
                <Field label="Short description" htmlFor="desc"><textarea id="desc" className="ts-textarea" value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
              </div>

              {studioType === 'writing' ? (
                <div className="cr-group">
                  <h3 className="cr-group__title">The writing</h3>
                  <Field label="Story or article" htmlFor="body" hint="For oral histories, include original Kasem lines or structured paragraphs.">
                    <KasemField enabled={primaryLanguage === 'xsm'} id="body" className="ts-textarea cr-body" rows={8} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write or paste your cultural story, folklore, or proverbs here…" />
                  </Field>
                  <Field label="Language or dialect notes" htmlFor="translationNotes">
                    <textarea id="translationNotes" className="ts-textarea" value={translationNotes} onChange={(e) => setTranslationNotes(e.target.value)} placeholder="Notes on tonal inflections, rare words, or community-specific idioms..." />
                  </Field>
                </div>
              ) : null}
              {studioType === 'translation' ? (
                <div className="cr-group">
                  <h3 className="cr-group__title">The translation</h3>
                  <div className="field-row">
                    <Field label="Source language" htmlFor="sourceLang">
                      <select id="sourceLang" className="ts-select" value={sourceLanguage} onChange={(e) => setSourceLanguage(e.target.value)}>
                        <option value="xsm">Kasem</option>
                        <option value="en">English</option>
                      </select>
                    </Field>
                    <Field label="Target language" htmlFor="targetLang">
                      <select id="targetLang" className="ts-select" value={targetLanguage} onChange={(e) => setTargetLanguage(e.target.value)}>
                        <option value="en">English</option>
                        <option value="xsm">Kasem</option>
                      </select>
                    </Field>
                  </div>
                  <div className="field-row">
                    <Field label={`${sourceLanguage === 'xsm' ? 'Kasem' : 'English'} source text`} htmlFor="sourceContent">
                      <KasemField enabled={sourceLanguage === 'xsm'} id="sourceContent" className="ts-textarea" rows={6} value={sourceContent} onChange={(e) => setSourceContent(e.target.value)} placeholder="Original sentences or oral transcription..." />
                    </Field>
                    <Field label={`${targetLanguage === 'xsm' ? 'Kasem' : 'English'} translation`} htmlFor="translatedContent">
                      <KasemField enabled={targetLanguage === 'xsm'} id="translatedContent" className="ts-textarea" rows={6} value={translatedContent} onChange={(e) => setTranslatedContent(e.target.value)} placeholder="Accurate contextual translation..." />
                    </Field>
                  </div>
                  <Field label="Translator and cultural notes" htmlFor="translatorNotes">
                    <textarea id="translatorNotes" className="ts-textarea" value={translatorNotes} onChange={(e) => setTranslatorNotes(e.target.value)} placeholder="Explain word nuances or cultural metaphors..." />
                  </Field>
                </div>
              ) : null}
              {studioType === 'image' ? (
                <div className="cr-group">
                  <h3 className="cr-group__title">The image</h3>
                  <Field label="Caption" htmlFor="caption">
                    <input id="caption" className="ts-input" value={caption} onChange={(e) => setCaption(e.target.value)} />
                  </Field>
                  <Field label="Alternative text" htmlFor="altText" hint="Required for accessibility. Describe what the image shows for people who cannot see it.">
                    <textarea id="altText" className="ts-textarea" value={altText} onChange={(e) => setAltText(e.target.value)} />
                  </Field>
                </div>
              ) : null}

              <div className="cr-group">
                <h3 className="cr-group__title">Context</h3>
                <Field label="English translation or summary" htmlFor="es"><textarea id="es" className="ts-textarea" value={englishSummary} onChange={(e) => setEnglishSummary(e.target.value)} placeholder="Summary in English for community members and researchers" /></Field>
                <Field label="Cultural context or explanation" htmlFor="cc"><textarea id="cc" className="ts-textarea" value={culturalContext} onChange={(e) => setCulturalContext(e.target.value)} placeholder="Historical background, ceremonial relevance, or lineage background" /></Field>
                <Field label="Source links and context (optional)" htmlFor="sources"><textarea id="sources" className="ts-textarea" value={sourceReferences} onChange={(event) => setSourceReferences(event.target.value)} placeholder="Add public source links and explain where the knowledge comes from." /></Field>
                <div className="field-row">
                  <Field label="Tags" htmlFor="tags" hint="Comma-separated.">
                    <input id="tags" className="ts-input" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="folktale, greeting, market" />
                  </Field>
                  <Field label="Target audience" htmlFor="audience">
                    <input id="audience" className="ts-input" value={targetAudience} onChange={(e) => setTargetAudience(e.target.value)} placeholder="Children, learners, families…" />
                  </Field>
                </div>
              </div>
            </section>
          ) : null}

          {step === 1 ? (
            <section className="cr-step" aria-labelledby="cr-step-title">
              <header className="cr-step__head">
                <span className="cr-step__n" aria-hidden="true">2</span>
                <div>
                  <h2 id="cr-step-title">Media</h2>
                  <p>{['video', 'audio', 'image'].includes(studioType) ? 'Record, upload or link the material this post is built around.' : 'Optional for this format: add a recording, a file or a link.'}</p>
                </div>
              </header>

              <div className="cr-record">
                <div className="cr-record__head">
                  <span className="cr-format__icon" aria-hidden="true"><Icon name="mic" /></span>
                  <div>
                    <strong>Record audio</strong>
                    <p>Oral stories, pronunciations or songs, straight from your microphone.</p>
                  </div>
                </div>
                <fieldset className="cr-fieldset" disabled={!online || saving || uploading}><VoiceRecorder onAudioReady={(file) => void handleFile(file)} /></fieldset>
              </div>

              <div className="cr-or" aria-hidden="true"><span>or upload a file</span></div>

              <Field label={media ? 'Replace attachment' : 'Original media file'} htmlFor="media-file" hint={mediaLimits?.acceptedMimeTypes?.length ? `Accepted: ${mediaLimits.acceptedMimeTypes.join(', ')}` : 'Video, audio, image or document.'}>
                <div className={uploading ? 'ts-drop cr-drop is-busy' : 'ts-drop cr-drop'}>
                  <span className="ts-drop__icon" aria-hidden="true"><Icon name="upload" /></span>
                  <span className="ts-drop__title">{media ? 'Choose a different file' : 'Choose a file'}</span>
                  <span>or drop it here</span>
                  <input id="media-file" type="file" disabled={!online || saving || uploading} onChange={(e) => void handleFile(e.target.files?.[0])} />
                </div>
              </Field>
              {uploadPct !== null ? (
                <div className="cr-upload" aria-live="polite">
                  <ProgressBar value={uploadPct} active={uploadPct < 100} tone={uploadPct >= 100 ? 'success' : undefined} label="Upload progress" />
                  <span className="ts-hint">{uploadPct < 100 ? `Uploading… ${uploadPct}%` : 'Upload complete'}</span>
                </div>
              ) : null}
              {attachmentPreview}
              {media || failedFile ? (
                <div className="ts-cluster">
                  {media ? <button type="button" className="ts-btn ts-btn--danger-ghost ts-btn--sm" disabled={saving || uploading} onClick={() => { setMedia(undefined); setUploadPct(null); }}>Remove attachment</button> : null}
                  {failedFile ? <button type="button" className="ts-btn ts-btn--secondary ts-btn--sm" disabled={!online || saving} onClick={() => void handleFile(failedFile)}>Retry upload: {failedFile.name}</button> : null}
                </div>
              ) : null}
              {media && uploadPct === null ? <p className="ts-hint">Your saved media is attached. Upload a file to replace it.</p> : null}

              <Field label="Link to an existing public post (optional)" htmlFor="ext"><input id="ext" className="ts-input" value={externalPostUrl} onChange={(e) => setExternalPostUrl(e.target.value)} placeholder="https://…" /></Field>

              <fieldset className="cr-fieldset">
                <legend className="ts-label">Disclosures</legend>
                <div className="cr-checks">
                  <label className="ts-check ts-check--card"><input type="checkbox" checked={involvesMinors} onChange={(e) => setInvolvesMinors(e.target.checked)} /><span className="ts-check__copy"><strong>Minors appear in this content</strong><small>You will be asked to confirm guardian permission.</small></span></label>
                  <label className="ts-check ts-check--card"><input type="checkbox" checked={usesThirdParty} onChange={(e) => setUsesThirdParty(e.target.checked)} /><span className="ts-check__copy"><strong>Uses third-party music, images or footage</strong><small>Name the source below.</small></span></label>
                </div>
              </fieldset>
              <Field label="Source or inspiration (optional)" htmlFor="src"><input id="src" className="ts-input" value={sourceInfo} onChange={(e) => setSourceInfo(e.target.value)} /></Field>
            </section>
          ) : null}

          {step === 2 ? (
            <section className="cr-step" aria-labelledby="cr-step-title">
              <header className="cr-step__head">
                <span className="cr-step__n" aria-hidden="true">3</span>
                <div>
                  <h2 id="cr-step-title">Permissions</h2>
                  <p>Each permission is a separate choice. Only the ones marked required are needed to {isOpenPost ? 'post' : 'enter'}.</p>
                </div>
              </header>

              <div className="cr-perms">
                {isOpenPost ? (
                  <label className="cr-perm"><input id="perm-publish" type="checkbox" checked={permPublish} onChange={(e) => setPermPublish(e.target.checked)} /><span className="cr-perm__copy"><strong>Publication <em className="cr-perm__req">Required to post</em></strong><span>Publish this to the Explore feed in Indigen World.</span></span></label>
                ) : (
                  <>
                    <label className="cr-perm"><input id="perm-review" type="checkbox" checked={permReview} onChange={(e) => setPermReview(e.target.checked)} /><span className="cr-perm__copy"><strong>Review <em className="cr-perm__req">Required to enter</em></strong><span>Allow our team to review this submission.</span></span></label>
                    <label className="cr-perm"><input id="perm-publish" type="checkbox" checked={permPublish} onChange={(e) => setPermPublish(e.target.checked)} /><span className="cr-perm__copy"><strong>Publication</strong><span>Allow approved content to be published in Indigen World products.</span></span></label>
                  </>
                )}
                <label className="cr-perm"><input type="checkbox" checked={permPromo} onChange={(e) => setPermPromo(e.target.checked)} /><span className="cr-perm__copy"><strong>Promotion <em className="cr-perm__opt">Optional</em></strong><span>Allow approved excerpts to be used for campaign promotion.</span></span></label>
                <label className="cr-perm cr-perm--ai"><input type="checkbox" checked={permAi} onChange={(e) => setPermAi(e.target.checked)} /><span className="cr-perm__copy"><strong>AI / machine-learning research <em className="cr-perm__opt">Optional</em></strong><span>Off by default and never required to enter.</span></span></label>
              </div>

              <fieldset className="cr-fieldset">
                <legend className="ts-label">Confirmations</legend>
                <div className="cr-checks">
                  <label className="ts-check ts-check--card"><input id="att-rights" type="checkbox" checked={attRights} onChange={(e) => setAttRights(e.target.checked)} /><span className="ts-check__copy">I created this, or have permission to submit it.</span></label>
                  <label className="ts-check ts-check--card"><input id="att-participants" type="checkbox" checked={attParticipants} onChange={(e) => setAttParticipants(e.target.checked)} /><span className="ts-check__copy">Anyone featured has consented.</span></label>
                  <label className="ts-check ts-check--card"><input id="att-guardian" type="checkbox" checked={attGuardian} onChange={(e) => setAttGuardian(e.target.checked)} /><span className="ts-check__copy">Required guardian permission exists for any minors.</span></label>
                  <label className="ts-check ts-check--card"><input id="att-copyright" type="checkbox" checked={attCopyright} onChange={(e) => setAttCopyright(e.target.checked)} /><span className="ts-check__copy">This does not unlawfully use copyrighted material.</span></label>
                </div>
              </fieldset>
            </section>
          ) : null}

          {step === 3 ? (
            <section className="cr-step" aria-labelledby="cr-step-title">
              <header className="cr-step__head">
                <span className="cr-step__n" aria-hidden="true">4</span>
                <div>
                  <h2 id="cr-step-title">Preview your post</h2>
                  <p>Content preview. Explore may arrange the post differently on each device.</p>
                </div>
              </header>
              <article className="cr-preview">
                <p className="cr-preview__by"><span className="cr-preview__avatar" aria-hidden="true">{(user?.displayName || 'You').slice(0, 1).toUpperCase()}</span>{user?.displayName || 'You'} · {languageName(primaryLanguage)}</p>
                <h3 className="cr-preview__title">{title || 'Untitled'}</h3>
                {description ? <p className="cr-preview__desc">{description}</p> : null}
                {attachmentPreview}
                {caption ? <p className="cr-preview__caption">{caption}</p> : null}
                {studioType === 'writing' ? <p className="cr-preview__text">{body}</p> : null}
                {studioType === 'translation' ? (
                  <div className="cr-preview__pair">
                    <div><h4>{languageName(sourceLanguage)} source</h4><p className="cr-preview__text">{sourceContent}</p></div>
                    <div><h4>{languageName(targetLanguage)} translation</h4><p className="cr-preview__text">{translatedContent}</p></div>
                  </div>
                ) : null}
                {englishSummary ? <p>{englishSummary}</p> : null}
                {culturalContext ? <p className="cr-preview__context">{culturalContext}</p> : null}
                {/^https?:\/\//i.test(externalPostUrl.trim()) ? <a className="ts-link" href={externalPostUrl.trim()} target="_blank" rel="noreferrer">Open linked post<Icon name="external" /></a> : null}
              </article>

              <h3 className="cr-group__title">Review and {isOpenPost ? 'publish' : 'submit'}</h3>
              <KeyValue items={[
                { label: 'Title', value: title || '—' },
                { label: 'Studio', value: formatLabel },
                { label: 'Category', value: category || '—' },
                { label: 'Media', value: mediaSummary },
                { label: 'Publication permission', value: permPublish ? 'Granted' : 'Not granted' },
                { label: 'AI-training permission', value: permAi ? 'Granted' : 'Off (default)' },
              ]} />
              <Consequence icon={isOpenPost ? 'globe' : 'shield'}>
                {isOpenPost
                  ? 'This goes live on Explore as soon as you post it, credited to you.'
                  : 'Submitted content is not published automatically. It is reviewed first.'}
              </Consequence>
            </section>
          ) : null}

          {error ? <Notice tone="danger" role="alert">{error}</Notice> : null}

          <div className="cr-compose__actions">
            {step > 0 ? <button type="button" className="ts-btn ts-btn--ghost" onClick={back} disabled={saving}><Icon name="back" />Back</button> : <span />}
            <div className="cr-compose__actions-right">
              <button type="button" className="ts-btn ts-btn--secondary" onClick={() => void saveDraft()} disabled={saving || uploading}>Save draft</button>
              {step < 3 ? (
                <button type="button" className="ts-btn ts-btn--primary" onClick={next} disabled={saving || uploading}>Continue<Icon name="arrow" /></button>
              ) : (
                <button type="button" className="ts-btn ts-btn--primary" onClick={() => void submit()} disabled={!online || saving || uploading}>
                  <Icon name={isOpenPost ? 'globe' : 'send'} />
                  {saving
                    ? (isOpenPost ? 'Publishing…' : 'Submitting…')
                    : (isOpenPost ? 'Publish to Explore' : 'Submit for review')}
                </button>
              )}
            </div>
          </div>
        </div>

        <aside className="cr-compose__rail" aria-label="About this post">
          <section className="ts-panel ts-panel--tight cr-rail-card">
            <h2 className="cr-rail-card__title">What happens next</h2>
            {isOpenPost ? (
              <ol className="cr-path">
                <li className={step < 3 ? 'is-current' : 'is-done'}><strong>Private draft</strong><span>Saved to your account as you work.</span></li>
                <li className={step === 3 ? 'is-current' : undefined}><strong>You preview it</strong><span>Check the material and permissions.</span></li>
                <li><strong>Live on Explore</strong><span>Published straight away, credited to you. Reported posts may be reviewed and taken down.</span></li>
              </ol>
            ) : (
              <ol className="cr-path">
                <li className={step < 3 ? 'is-current' : 'is-done'}><strong>Private draft</strong><span>Saved to your account as you work.</span></li>
                <li className={step === 3 ? 'is-current' : undefined}><strong>Submitted for review</strong><span>The campaign team checks it against the brief.</span></li>
                <li><strong>Decision</strong><span>Approved, returned with feedback, or not accepted. Approved entries can be published if you allow publication.</span></li>
              </ol>
            )}
          </section>

          <section className="ts-panel ts-panel--tight cr-rail-card">
            <h2 className="cr-rail-card__title"><Icon name="spark" />Try this format</h2>
            <p>{FORMAT_TIP[studioType]}</p>
          </section>

          <section className="ts-panel ts-panel--tight cr-rail-card">
            <h2 className="cr-rail-card__title">This post</h2>
            <KeyValue items={[
              { label: 'Format', value: formatLabel },
              { label: 'Language', value: languageName(primaryLanguage) },
              { label: 'Media', value: mediaSummary },
              { label: 'Publication', value: permPublish ? 'Granted' : 'Not granted' },
            ]} />
          </section>
        </aside>
      </div>
    </div>
  );
}
