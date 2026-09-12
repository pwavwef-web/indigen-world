import { useEffect, useMemo, useRef, useState } from 'react';
import { getDownloadURL, ref } from 'firebase/storage';
import { storage } from '../../firebase';
import type { Campaign, Submission } from '@indigen-world/contracts/creator-models';
import { Link, matchRoute, useQueryParam, useRoute } from '../../router';
import { useAuth } from '../../auth';
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
  if (loading) return <div className="page"><p>Loading your submission…</p></div>;
  if (error) return <div className="page"><p role="alert">{error}</p><button type="button" onClick={() => setRetry((n) => n + 1)}>Retry</button><p><Link to="/studio/submissions">Back to submissions</Link></p></div>;
  return <SubmissionEditor existing={existing} />;
}

function SubmissionEditor({ existing }: { existing: Submission | null }) {
  const { user } = useAuth();
  const { config, whatsappUrl } = useConfig();
  const { navigate } = useRoute();
  const queryCampaign = useQueryParam('campaign') ?? '';
  const requestedCampaign = existing ? (existing.campaign.id === OPEN_CAMPAIGN_ID ? '' : existing.campaign.id) : queryCampaign;
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
  const [studioType, setStudioType] = useState<StudioType>(existing?.studioType ?? 'video');
  const [title, setTitle] = useState(existing?.title ?? '');
  const [category, setCategory] = useState(existing?.category ?? '');
  const [primaryLanguage, setPrimaryLanguage] = useState(existing?.primaryLanguage ?? 'xsm');
  const [dialect, setDialect] = useState(existing?.dialect ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [body, setBody] = useState(existing?.body ?? '');
  const [tags, setTags] = useState(existing?.tags?.join(', ') ?? '');
  const [targetAudience, setTargetAudience] = useState(existing?.targetAudience ?? '');
  const [sourceReferences, setSourceReferences] = useState(existing?.sourceReferences ?? '');
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

  // A completed AI-video job can hand its private Firebase output straight to
  // the normal publishing workflow. The owner-scoped path check prevents a URL
  // parameter from attaching another creator's media.
  useEffect(() => {
    if (existing || !user || !generatedVideoPath) return;
    const ownOutputPrefix = `studio-video-jobs/${user.uid}/`;
    if (!generatedVideoPath.startsWith(ownOutputPrefix) || !generatedVideoPath.endsWith('/output.mp4')) return;
    setStudioType('video');
    setMedia({
      storagePath: generatedVideoPath,
      mimeType: 'video/mp4',
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
    'language-lesson', 'craft', 'festival', 'everyday-life', 'other',
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

  const snapshot = JSON.stringify(draftInput);
  const initialSnapshot = useRef(snapshot);
  const dirty = snapshot !== (savedSnapshot ?? initialSnapshot.current);
  const dirtyRef = useRef(false);
  dirtyRef.current = dirty;

  useEffect(() => {
    if (!dirty || loading || saving || uploadBusy.current || saveStatus.startsWith('Not saved')) return;
    const timer = window.setTimeout(() => { void saveDraft(); }, 1500);
    return () => window.clearTimeout(timer);
  }, [snapshot, dirty, loading, saving, uploadPct, saveStatus]);

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

  const attachmentPreview = media ? <div className="submission-preview">
    {previewError ? <p role="alert">{previewError} <button type="button" onClick={() => setPreviewRetry((n) => n + 1)}>Retry preview</button></p> : !previewUrl ? <p>Loading attachment…</p> :
      media.mediaType === 'image' ? <img src={previewUrl} alt={altText || 'Attachment preview'} /> :
      media.mediaType === 'audio' ? <audio controls src={previewUrl} /> :
      media.mediaType === 'video' ? <video controls playsInline src={previewUrl} /> :
      <a href={previewUrl} target="_blank" rel="noreferrer">Open attached document</a>}
  </div> : null;

  if (loading) return <div className="page"><p className="muted">Loading…</p></div>;

  if (!isOpenPost && !campaign) {
    return <div className="page"><h1>Campaign not found</h1><Link to="/studio/opportunities" className="button button--ghost-dark">Back</Link></div>;
  }

  // Gate: a campaign only accepts entries while it is open. An open post has
  // no such window — the feed is always accepting.
  if (!isOpenPost && campaign && !submissionsOpen(campaign) && existing?.status !== 'NEEDS_REVISION') {
    return (
      <div className="page">
        <h1>Submissions are not open yet</h1>
        <div className="callout callout--info">
          <strong>{campaign.title}</strong> is not accepting entries right now. We’ll announce the moment it opens.
        </div>
        <WhatsAppCard url={whatsappUrl} />
        <p className="section__more"><Link to="/studio/opportunities">← Back to opportunities</Link></p>
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
    if (!user || writeBusy.current || uploadBusy.current) return false;
    writeBusy.current = true;
    setSaveStatus('Saving…');
    setSaving(true);
    setError(null);
    try {
      await saveSubmission(draftInput, 'DRAFT', persistedRef.current ? undefined : null);
      persistedRef.current = true;
      setSavedSnapshot(JSON.stringify(draftInput));
      setSaveStatus('Saved');
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
    const problem = validate();
    if (problem) { showProblem(problem); return; }
    writeBusy.current = true;
    setSaving(true);
    setError(null);
    try {
      await saveSubmission(draftInput, 'SUBMITTED', persistedRef.current ? undefined : null);
      persistedRef.current = true;
      trackEvent('submission_completed', { campaign: campaign?.slug ?? OPEN_CAMPAIGN_ID });
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
  const next = async () => { const problem = validate(step); if (problem) { showProblem(problem); return; } if (await saveDraft()) setStep((s) => Math.min(s + 1, 3)); };
  const back = () => setStep((s) => Math.max(s - 1, 0));

  return (
    <div className="page">
      <p className="breadcrumb"><Link to="/studio/submissions">Submissions</Link> / {existing ? 'Edit' : 'New'}</p>
      <h1>{existing ? 'Edit submission' : isOpenPost ? 'New post' : 'New campaign submission'}</h1>
      {isOpenPost ? (
        <div className="callout callout--info">
          <strong>This publishes straight to Explore.</strong> There is no queue and
          no approval step — what you post is what people see. So the two things
          that matter are yours to get right: you hold the rights to this work,
          and anyone in it agreed to be in it. Anything reported gets reviewed
          afterwards, and can be taken down.
        </div>
      ) : (
        <div className="callout callout--info">
          <strong>Campaign entry.</strong> Campaign submissions carry rewards, so
          this one is reviewed before it is published.
        </div>
      )}
      {existing?.moderation?.feedback ? <div className="callout callout--warn"><strong>Reviewer feedback: </strong>{existing.moderation.feedback}</div> : null}
      <p role="status" aria-live="polite">{saving ? "Saving…" : dirty ? saveStatus.startsWith("Not saved") ? saveStatus : "Unsaved changes" : saveStatus || "Drafts save automatically as you work."}</p>
      <Stepper steps={STEPS} current={step} />

      <div className="join__card">
        {step === 0 ? (
          <section>
            <h2>Content details</h2>
            <Field label="Studio type">
              <div className="studio-options">
                {STUDIO_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={studioType === option.value ? 'studio-option is-on' : 'studio-option'}
                    aria-pressed={studioType === option.value}
                    onClick={() => setStudioType(option.value)}
                  >
                    <strong>{option.label}</strong>
                    <span>{option.body}</span>
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Content title" htmlFor="t"><input id="t" value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
            <div className="field-row">
              <Field label="Category" htmlFor="cat">
                <select id="cat" value={category} onChange={(e) => setCategory(e.target.value)}>
                  <option value="">Select…</option>
                  {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </Field>
              <Field label="Primary language" htmlFor="pl">
                <select id="pl" value={primaryLanguage} onChange={(e) => setPrimaryLanguage(e.target.value)}>
                  <option value="xsm">Kasem</option>
                  <option value="en">English</option>
                </select>
              </Field>
            </div>
            <Field label="Dialect / community variant" htmlFor="dl">
              <select id="dl" value={dialect} onChange={(e) => setDialect(e.target.value)}>
                <option value="">Select…</option>
                {dialects.map((d) => <option key={d.slug} value={d.slug}>{d.label}</option>)}
              </select>
            </Field>
            <Field label="Short description" htmlFor="desc"><textarea id="desc" value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
            <Field label="Tags" htmlFor="tags" hint="Comma-separated.">
              <input id="tags" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="folktale, greeting, market, elder-story" />
            </Field>
            <Field label="Target audience" htmlFor="audience">
              <input id="audience" value={targetAudience} onChange={(e) => setTargetAudience(e.target.value)} placeholder="Children, learners, diaspora families, researchers…" />
            </Field>
            {studioType === 'writing' ? (
              <>
                <Field label="Folklore Narrative &amp; Story Body" htmlFor="body" hint="For oral histories, include original Kasem lines or structured paragraphs.">
                  <textarea id="body" rows={8} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write or paste your cultural story, folklore, or proverbs here…" />
                </Field>
                <div className="field-row">
                  <Field label="Proverb / Wisdom breakdown (optional)" htmlFor="sources">
                    <textarea id="sources" value={sourceReferences} onChange={(e) => setSourceReferences(e.target.value)} placeholder="E.g. Traditional context from Paga elder lineage..." />
                  </Field>
                  <Field label="Linguistic &amp; Dialect Notes" htmlFor="translationNotes">
                    <textarea id="translationNotes" value={translationNotes} onChange={(e) => setTranslationNotes(e.target.value)} placeholder="Notes on tonal inflections, rare words, or community-specific idioms..." />
                  </Field>
                </div>
              </>
            ) : null}
            {studioType === 'translation' ? (
              <>
                <div className="field-row">
                  <Field label="Source language" htmlFor="sourceLang">
                    <select id="sourceLang" value={sourceLanguage} onChange={(e) => setSourceLanguage(e.target.value)}>
                      <option value="xsm">Kasem</option>
                      <option value="en">English</option>
                    </select>
                  </Field>
                  <Field label="Target language" htmlFor="targetLang">
                    <select id="targetLang" value={targetLanguage} onChange={(e) => setTargetLanguage(e.target.value)}>
                      <option value="en">English</option>
                      <option value="xsm">Kasem</option>
                    </select>
                  </Field>
                </div>
                <div className="field-row field-row--wide">
                  <Field label={`${sourceLanguage === 'xsm' ? 'Kasem' : 'English'} source text`} htmlFor="sourceContent">
                    <textarea id="sourceContent" rows={6} value={sourceContent} onChange={(e) => setSourceContent(e.target.value)} placeholder="Original sentences or oral transcription..." />
                  </Field>
                  <Field label={`${targetLanguage === 'xsm' ? 'Kasem' : 'English'} translation`} htmlFor="translatedContent">
                    <textarea id="translatedContent" rows={6} value={translatedContent} onChange={(e) => setTranslatedContent(e.target.value)} placeholder="Accurate contextual translation..." />
                  </Field>
                </div>
                <Field label="Translator &amp; Cultural Notes" htmlFor="translatorNotes">
                  <textarea id="translatorNotes" value={translatorNotes} onChange={(e) => setTranslatorNotes(e.target.value)} placeholder="Explain word nuances or cultural metaphors..." />
                </Field>
              </>
            ) : null}
            <Field label="English translation or summary" htmlFor="es"><textarea id="es" value={englishSummary} onChange={(e) => setEnglishSummary(e.target.value)} placeholder="Summary in English for community members and researchers" /></Field>
            <Field label="Cultural context or explanation" htmlFor="cc"><textarea id="cc" value={culturalContext} onChange={(e) => setCulturalContext(e.target.value)} placeholder="Historical background, ceremonial relevance, or lineage background" /></Field>
            {studioType === 'image' ? (
              <>
                <Field label="Caption" htmlFor="caption">
                  <input id="caption" value={caption} onChange={(e) => setCaption(e.target.value)} />
                </Field>
                <Field label="Alternative text" htmlFor="altText" hint="Required for accessibility.">
                  <textarea id="altText" value={altText} onChange={(e) => setAltText(e.target.value)} />
                </Field>
              </>
            ) : null}
          </section>
        ) : null}

        {step === 1 ? (
          <section>
            <h2>Media &amp; Voice Recording Studio</h2>

            {/* In-Browser Voice Recording Studio */}
            <div className="voice-studio-card iw-glass-card">
              <div className="voice-studio-head">
                <span className="voice-icon">🎙️</span>
                <div>
                  <strong>In-Browser Audio &amp; Voice Recorder</strong>
                  <p className="tiny muted">Record oral stories, pronunciations, or songs directly from your microphone.</p>
                </div>
              </div>
              <fieldset disabled={saving || (uploadPct !== null && uploadPct < 100)}><VoiceRecorder onAudioReady={(file) => void handleFile(file)} /></fieldset>
            </div>

            <div className="or-divider"><span>OR UPLOAD MEDIA FILE</span></div>

            <Field label={media ? 'Replace attachment' : 'Original media file'} htmlFor="media-file" hint={mediaLimits?.acceptedMimeTypes?.length ? `Accepted: ${mediaLimits.acceptedMimeTypes.join(', ')}` : 'Video, audio, image or document.'}>
              <input id="media-file" type="file" disabled={saving || (uploadPct !== null && uploadPct < 100)} onChange={(e) => void handleFile(e.target.files?.[0])} />
            </Field>
            {attachmentPreview}
            {media ? <button type="button" className="button button--small" disabled={saving || (uploadPct !== null && uploadPct < 100)} onClick={() => { setMedia(undefined); setUploadPct(null); }}>Remove attachment</button> : null}
            {failedFile ? <button type="button" className="button button--small" disabled={saving} onClick={() => void handleFile(failedFile)}>Retry upload: {failedFile.name}</button> : null}
            {media && uploadPct === null ? <p className="tiny">Your saved media is attached. Upload a file to replace it.</p> : null}
            {uploadPct !== null ? (
              <div className="upload">
                <div className="upload__bar"><span style={{ width: `${uploadPct}%` }} /></div>
                <span className="tiny">{uploadPct < 100 ? `Uploading… ${uploadPct}%` : 'Upload complete'}</span>
              </div>
            ) : null}
            <Field label="Link to an existing public post (optional)" htmlFor="ext"><input id="ext" value={externalPostUrl} onChange={(e) => setExternalPostUrl(e.target.value)} placeholder="https://…" /></Field>
            <Field label="Disclosures">
              <label className="checkbox"><input type="checkbox" checked={involvesMinors} onChange={(e) => setInvolvesMinors(e.target.checked)} /> Minors appear in this content.</label>
              <label className="checkbox"><input type="checkbox" checked={usesThirdParty} onChange={(e) => setUsesThirdParty(e.target.checked)} /> This uses third-party music, images or footage.</label>
            </Field>
            <Field label="Source or inspiration (optional)" htmlFor="src"><input id="src" value={sourceInfo} onChange={(e) => setSourceInfo(e.target.value)} /></Field>
          </section>
        ) : null}

        {step === 2 ? (
          <section>
            <h2>Permissions</h2>
            <p className="muted">Each permission is a separate, understandable choice.</p>
            {isOpenPost ? (
              <label className="perm"><input id="perm-publish" type="checkbox" checked={permPublish} onChange={(e) => setPermPublish(e.target.checked)} /> <span><strong>Publication</strong> — publish this to the Explore feed in Indigen World. <em>(Required to post.)</em></span></label>
            ) : (
              <>
                <label className="perm"><input id="perm-review" type="checkbox" checked={permReview} onChange={(e) => setPermReview(e.target.checked)} /> <span><strong>Review</strong> — allow our team to review this submission. <em>(Required to enter.)</em></span></label>
                <label className="perm"><input id="perm-publish" type="checkbox" checked={permPublish} onChange={(e) => setPermPublish(e.target.checked)} /> <span><strong>Publication</strong> — allow approved content to be published in Indigen World products.</span></label>
              </>
            )}
            <label className="perm"><input type="checkbox" checked={permPromo} onChange={(e) => setPermPromo(e.target.checked)} /> <span><strong>Promotion</strong> — allow approved excerpts to be used for campaign promotion.</span></label>
            <label className="perm perm--ai"><input type="checkbox" checked={permAi} onChange={(e) => setPermAi(e.target.checked)} /> <span><strong>AI / machine-learning research</strong> — optional. Off by default and never required to enter.</span></label>

            <h2>Confirmations</h2>
            <label className="checkbox"><input id="att-rights" type="checkbox" checked={attRights} onChange={(e) => setAttRights(e.target.checked)} /> I created this, or have permission to submit it.</label>
            <label className="checkbox"><input id="att-participants" type="checkbox" checked={attParticipants} onChange={(e) => setAttParticipants(e.target.checked)} /> Anyone featured has consented.</label>
            <label className="checkbox"><input id="att-guardian" type="checkbox" checked={attGuardian} onChange={(e) => setAttGuardian(e.target.checked)} /> Required guardian permission exists for any minors.</label>
            <label className="checkbox"><input id="att-copyright" type="checkbox" checked={attCopyright} onChange={(e) => setAttCopyright(e.target.checked)} /> This does not unlawfully use copyrighted material.</label>
          </section>
        ) : null}

        {step === 3 ? (
          <section>
            <h2>Preview your post</h2>
            <article className="submission-preview">
              <p className="tiny muted">{user?.displayName || 'You'} · {primaryLanguage === 'xsm' ? 'Kasem' : 'English'}</p>
              <h3>{title || 'Untitled'}</h3><p>{description}</p>
              {attachmentPreview}
              {caption ? <p>{caption}</p> : null}
              {studioType === 'writing' ? <p className="submission-preview__text">{body}</p> : null}
              {studioType === 'translation' ? <div className="field-row"><div><h4>{sourceLanguage === 'xsm' ? 'Kasem' : 'English'} source</h4><p className="submission-preview__text">{sourceContent}</p></div><div><h4>{targetLanguage === 'xsm' ? 'Kasem' : 'English'} translation</h4><p className="submission-preview__text">{translatedContent}</p></div></div> : null}
              {englishSummary ? <p>{englishSummary}</p> : null}
              {culturalContext ? <p>{culturalContext}</p> : null}
              {/^https?:\/\//i.test(externalPostUrl.trim()) ? <a href={externalPostUrl.trim()} target="_blank" rel="noreferrer">Open linked post</a> : null}
            </article>
            <p className="tiny muted">Content preview. Explore may arrange the post differently on each device.</p>
            <h2>Review &amp; submit</h2>
            <dl className="review-list">
              <div><dt>Title</dt><dd>{title || '—'}</dd></div>
              <div><dt>Studio</dt><dd>{STUDIO_OPTIONS.find((o) => o.value === studioType)?.label ?? studioType}</dd></div>
              <div><dt>Category</dt><dd>{category || '—'}</dd></div>
              <div><dt>Media</dt><dd>{media ? `${media.mediaType} · ${Math.round((media.sizeBytes ?? 0) / 1024)} KB` : externalPostUrl ? 'External link' : studioType === 'writing' || studioType === 'translation' ? 'Optional' : 'None'}</dd></div>
              <div><dt>Publication permission</dt><dd>{permPublish ? 'Granted' : 'Not granted'}</dd></div>
              <div><dt>AI-training permission</dt><dd>{permAi ? 'Granted' : 'Off (default)'}</dd></div>
            </dl>
            <p className="tiny">
              {isOpenPost
                ? 'This goes live on Explore as soon as you post it, credited to you.'
                : 'Submitted content is not published automatically. It is reviewed first.'}
            </p>
          </section>
        ) : null}

        {error ? <div className="callout callout--warn" role="alert">{error}</div> : null}

        <div className="join__actions">
          {step > 0 ? <button type="button" className="button button--ghost-dark" onClick={back} disabled={saving}>Back</button> : <span />}
          <div className="join__actions-right">
            <button type="button" className="button button--ghost-dark" onClick={() => void saveDraft()} disabled={saving || (uploadPct !== null && uploadPct < 100)}>Save draft</button>
            {step < 3 ? (
              <button type="button" className="button button--primary" onClick={next} disabled={saving || (uploadPct !== null && uploadPct < 100)}>Continue</button>
            ) : (
              <button type="button" className="button button--primary" onClick={() => void submit()} disabled={saving}>
                {saving
                  ? (isOpenPost ? 'Publishing…' : 'Submitting…')
                  : (isOpenPost ? 'Publish to Explore' : 'Submit for review')}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
