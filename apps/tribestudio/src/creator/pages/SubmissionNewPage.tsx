import { useEffect, useMemo, useRef, useState } from 'react';
import type { Campaign, Submission } from '@indigen-world/contracts/creator-models';
import { Link, useQueryParam, useRoute } from '../../router';
import { useAuth } from '../../auth';
import { trackEvent } from '../../analytics';
import { useConfig } from '../CreatorProvider';
import {
  fetchCampaign,
  newSubmissionId,
  saveSubmission,
  submissionsOpen,
  uploadSubmissionMedia,
  type SubmissionDraftInput,
} from '../data';
import { Field, Stepper, WhatsAppCard } from '../components';

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

export function SubmissionNewPage() {
  const { user } = useAuth();
  const { config, whatsappUrl } = useConfig();
  const { navigate } = useRoute();
  const campaignId = useQueryParam('campaign') ?? '';
  // Lazy-init so a fresh submission id is generated once, not on every render.
  const submissionIdRef = useRef<string>('');
  if (!submissionIdRef.current) submissionIdRef.current = newSubmissionId();
  const submissionId = submissionIdRef;

  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadPct, setUploadPct] = useState<number | null>(null);

  // Form state
  const [studioType, setStudioType] = useState<StudioType>('video');
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [primaryLanguage, setPrimaryLanguage] = useState('xsm');
  const [dialect, setDialect] = useState('');
  const [description, setDescription] = useState('');
  const [body, setBody] = useState('');
  const [tags, setTags] = useState('');
  const [targetAudience, setTargetAudience] = useState('');
  const [sourceReferences, setSourceReferences] = useState('');
  const [translationNotes, setTranslationNotes] = useState('');
  const [sourceLanguage, setSourceLanguage] = useState('xsm');
  const [targetLanguage, setTargetLanguage] = useState('en');
  const [sourceContent, setSourceContent] = useState('');
  const [translatedContent, setTranslatedContent] = useState('');
  const [translatorNotes, setTranslatorNotes] = useState('');
  const [caption, setCaption] = useState('');
  const [altText, setAltText] = useState('');
  const [englishSummary, setEnglishSummary] = useState('');
  const [culturalContext, setCulturalContext] = useState('');
  const [externalPostUrl, setExternalPostUrl] = useState('');
  const [involvesMinors, setInvolvesMinors] = useState(false);
  const [usesThirdParty, setUsesThirdParty] = useState(false);
  const [sourceInfo, setSourceInfo] = useState('');
  const [media, setMedia] = useState<Submission['media']>(undefined);
  const [permReview, setPermReview] = useState(true);
  const [permPublish, setPermPublish] = useState(false);
  const [permPromo, setPermPromo] = useState(false);
  const [permAi, setPermAi] = useState(false);
  const [attRights, setAttRights] = useState(false);
  const [attParticipants, setAttParticipants] = useState(false);
  const [attGuardian, setAttGuardian] = useState(false);
  const [attCopyright, setAttCopyright] = useState(false);

  useEffect(() => {
    if (!campaignId) { setLoading(false); return; }
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
  }, [campaignId]);

  const mediaLimits = config?.mediaRestrictions ?? campaign?.fileRequirements;
  const categories = campaign?.categories && campaign.categories.length > 0
    ? campaign.categories
    : (config?.contentCategories ?? []).map((c) => c.slug);
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
    participants: [],
    disclosures: { involvesMinors, usesThirdPartyMaterial: usesThirdParty, sourceInfo },
    attestations: { ownsOrHasRights: attRights, participantsConsented: attParticipants, guardianPermissionForMinors: attGuardian, noUnlawfulCopyright: attCopyright },
    permissions: { review: permReview, publication: permPublish, promotion: permPromo, aiTraining: permAi },
    media,
    consentVersion: config?.termsVersion ?? 'creator-terms-unversioned',
  }), [user, campaignId, studioType, title, category, primaryLanguage, dialect, description, body, tags, targetAudience, sourceReferences, translationNotes, sourceLanguage, targetLanguage, sourceContent, translatedContent, translatorNotes, caption, altText, englishSummary, culturalContext, externalPostUrl, involvesMinors, usesThirdParty, sourceInfo, attRights, attParticipants, attGuardian, attCopyright, permReview, permPublish, permPromo, permAi, media, config]);

  if (loading) return <div className="page"><p className="muted">Loading…</p></div>;

  if (!campaign) {
    return <div className="page"><h1>Campaign not found</h1><Link to="/studio/opportunities" className="button button--ghost-dark">Back</Link></div>;
  }

  // Gate: submissions must be open for this campaign.
  if (!submissionsOpen(campaign)) {
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
    if (!file || !user) return;
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
    setUploadPct(0);
    try {
      const { storagePath } = await uploadSubmissionMedia(user.uid, campaignId, submissionId.current, file, setUploadPct);
      setMedia({ storagePath, mimeType: file.type, sizeBytes: file.size, mediaType: mediaTypeFor(file.type), thumbnailPath: null, captionsPath: null });
      setUploadPct(100);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed. Please retry.');
      setUploadPct(null);
    }
  };

  const saveDraft = async () => {
    if (!user) return;
    setSaving(true);
    setError(null);
    try {
      await saveSubmission(draftInput, 'DRAFT');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save draft.');
    } finally {
      setSaving(false);
    }
  };

  const validate = (): string | null => {
    if (!title.trim()) return 'A content title is required.';
    if (!category) return 'Choose a content category.';
    if (studioType === 'writing' && body.trim().length < 40) return 'Add the written content before submitting.';
    if (studioType === 'translation' && (sourceContent.trim().length < 10 || translatedContent.trim().length < 10)) return 'Add both source and translated content.';
    if (['video', 'audio', 'image'].includes(studioType) && !media && !externalPostUrl.trim()) return 'Upload media or provide a link to an existing public post.';
    if (studioType === 'image' && !altText.trim()) return 'Alternative text is required for visual submissions.';
    if (!permReview) return 'Permission to review the submission is required to enter.';
    if (!attRights || !attCopyright) return 'Please confirm you have the rights to submit this content.';
    if (involvesMinors && !attGuardian) return 'Guardian permission is required when minors appear.';
    return null;
  };

  const submit = async () => {
    if (!user) return;
    const problem = validate();
    if (problem) { setError(problem); setStep(3); return; }
    setSaving(true);
    setError(null);
    try {
      await saveSubmission(draftInput, 'SUBMITTED');
      trackEvent('submission_completed', { campaign: campaign.slug });
      navigate(`/studio/submissions/${submissionId.current}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Submission failed. Your draft is saved.');
      setSaving(false);
    }
  };

  const next = () => { void saveDraft(); setStep((s) => Math.min(s + 1, 3)); };
  const back = () => setStep((s) => Math.max(s - 1, 0));

  return (
    <div className="page">
      <p className="breadcrumb"><Link to="/studio/submissions">Submissions</Link> / New</p>
      <h1>New submission — {campaign.title}</h1>
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
              <input id="tags" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="folktale, greeting, market" />
            </Field>
            <Field label="Target audience" htmlFor="audience">
              <input id="audience" value={targetAudience} onChange={(e) => setTargetAudience(e.target.value)} placeholder="Children, learners, general community…" />
            </Field>
            {studioType === 'writing' ? (
              <>
                <Field label="Body" htmlFor="body">
                  <textarea id="body" value={body} onChange={(e) => setBody(e.target.value)} />
                </Field>
                <Field label="Sources and references" htmlFor="sources">
                  <textarea id="sources" value={sourceReferences} onChange={(e) => setSourceReferences(e.target.value)} />
                </Field>
                <Field label="Translation notes" htmlFor="translationNotes">
                  <textarea id="translationNotes" value={translationNotes} onChange={(e) => setTranslationNotes(e.target.value)} />
                </Field>
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
                  <Field label="Source content" htmlFor="sourceContent">
                    <textarea id="sourceContent" value={sourceContent} onChange={(e) => setSourceContent(e.target.value)} />
                  </Field>
                  <Field label="Translation" htmlFor="translatedContent">
                    <textarea id="translatedContent" value={translatedContent} onChange={(e) => setTranslatedContent(e.target.value)} />
                  </Field>
                </div>
                <Field label="Translator notes" htmlFor="translatorNotes">
                  <textarea id="translatorNotes" value={translatorNotes} onChange={(e) => setTranslatorNotes(e.target.value)} />
                </Field>
              </>
            ) : null}
            <Field label="English translation or summary" htmlFor="es"><textarea id="es" value={englishSummary} onChange={(e) => setEnglishSummary(e.target.value)} /></Field>
            <Field label="Cultural context or explanation" htmlFor="cc"><textarea id="cc" value={culturalContext} onChange={(e) => setCulturalContext(e.target.value)} /></Field>
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
            <h2>Media</h2>
            {studioType === 'writing' || studioType === 'translation' ? (
              <div className="callout callout--info">Media is optional for this studio. You can attach a reference file or continue without uploading.</div>
            ) : null}
            <Field label="Original media file" hint={mediaLimits?.acceptedMimeTypes?.length ? `Accepted: ${mediaLimits.acceptedMimeTypes.join(', ')}` : 'Video, audio, image or document.'}>
              <input type="file" onChange={(e) => void handleFile(e.target.files?.[0])} />
            </Field>
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
            <label className="perm"><input type="checkbox" checked={permReview} onChange={(e) => setPermReview(e.target.checked)} /> <span><strong>Review</strong> — allow our team to review this submission. <em>(Required to enter.)</em></span></label>
            <label className="perm"><input type="checkbox" checked={permPublish} onChange={(e) => setPermPublish(e.target.checked)} /> <span><strong>Publication</strong> — allow approved content to be published in Indigen World products.</span></label>
            <label className="perm"><input type="checkbox" checked={permPromo} onChange={(e) => setPermPromo(e.target.checked)} /> <span><strong>Promotion</strong> — allow approved excerpts to be used for campaign promotion.</span></label>
            <label className="perm perm--ai"><input type="checkbox" checked={permAi} onChange={(e) => setPermAi(e.target.checked)} /> <span><strong>AI / machine-learning research</strong> — optional. Off by default and never required to enter.</span></label>

            <h2>Confirmations</h2>
            <label className="checkbox"><input type="checkbox" checked={attRights} onChange={(e) => setAttRights(e.target.checked)} /> I created this, or have permission to submit it.</label>
            <label className="checkbox"><input type="checkbox" checked={attParticipants} onChange={(e) => setAttParticipants(e.target.checked)} /> Anyone featured has consented.</label>
            <label className="checkbox"><input type="checkbox" checked={attGuardian} onChange={(e) => setAttGuardian(e.target.checked)} /> Required guardian permission exists for any minors.</label>
            <label className="checkbox"><input type="checkbox" checked={attCopyright} onChange={(e) => setAttCopyright(e.target.checked)} /> This does not unlawfully use copyrighted material.</label>
          </section>
        ) : null}

        {step === 3 ? (
          <section>
            <h2>Review &amp; submit</h2>
            <dl className="review-list">
              <div><dt>Title</dt><dd>{title || '—'}</dd></div>
              <div><dt>Studio</dt><dd>{STUDIO_OPTIONS.find((o) => o.value === studioType)?.label ?? studioType}</dd></div>
              <div><dt>Category</dt><dd>{category || '—'}</dd></div>
              <div><dt>Media</dt><dd>{media ? `${media.mediaType} · ${Math.round((media.sizeBytes ?? 0) / 1024)} KB` : externalPostUrl ? 'External link' : studioType === 'writing' || studioType === 'translation' ? 'Optional' : 'None'}</dd></div>
              <div><dt>Publication permission</dt><dd>{permPublish ? 'Granted' : 'Not granted'}</dd></div>
              <div><dt>AI-training permission</dt><dd>{permAi ? 'Granted' : 'Off (default)'}</dd></div>
            </dl>
            <p className="tiny">Submitted content is not published automatically. It is reviewed first.</p>
          </section>
        ) : null}

        {error ? <div className="callout callout--warn" role="alert">{error}</div> : null}

        <div className="join__actions">
          {step > 0 ? <button type="button" className="button button--ghost-dark" onClick={back} disabled={saving}>Back</button> : <span />}
          <div className="join__actions-right">
            <button type="button" className="button button--ghost-dark" onClick={() => void saveDraft()} disabled={saving}>Save draft</button>
            {step < 3 ? (
              <button type="button" className="button button--primary" onClick={next} disabled={saving || (uploadPct !== null && uploadPct < 100)}>Continue</button>
            ) : (
              <button type="button" className="button button--primary" onClick={() => void submit()} disabled={saving}>{saving ? 'Submitting…' : 'Submit for review'}</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
