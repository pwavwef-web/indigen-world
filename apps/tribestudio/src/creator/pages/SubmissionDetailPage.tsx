import { useEffect, useState } from 'react';
import { getDownloadURL, ref } from 'firebase/storage';
import { storage } from '../../firebase';
import type { Submission } from '@indigen-world/contracts/creator-models';
import { matchRoute, useRoute } from '../../router';
import { trackEvent } from '../../analytics';
import {
  canWithdrawSubmission,
  isCampaignSubmission,
  watchSubmission,
  withdrawSubmission,
} from '../data';
import { LoadError, StatusPill, SUBMISSION_STATUS_LABELS, useReloadable } from '../components';
import {
  Breadcrumb,
  Button,
  ButtonLink,
  Dialog,
  EmptyState,
  Icon,
  KeyValue,
  Notice,
  PageHeader,
  Panel,
  Skeleton,
  Steps,
  type StepItem,
} from '../../ui';

const LANGUAGE: Record<string, string> = { xsm: 'Kasem', en: 'English' };
const STUDIO: Record<string, string> = { writing: 'Writing', video: 'Video', audio: 'Audio', image: 'Image / visual story', translation: 'Translation' };

function shortDate(iso?: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Where the post stands, read only from its status. */
function journey(sub: Submission): { steps: StepItem[]; current: number } | null {
  if (['WITHDRAWN', 'ARCHIVED'].includes(sub.status)) return null;
  if (!isCampaignSubmission(sub) && !sub.collectionContribution) {
    return {
      steps: [
        { title: 'Draft', detail: 'Private to you' },
        { title: 'Preview', detail: 'You check it' },
        { title: 'Published', detail: 'Live on Explore' },
      ],
      current: sub.status === 'PUBLISHED' ? 3 : sub.status === 'DRAFT' ? 0 : 1,
    };
  }
  const decision = sub.status === 'NEEDS_REVISION' ? 'Revision requested' : sub.status === 'REJECTED' ? 'Not accepted' : ['APPROVED', 'SCHEDULED', 'PUBLISHED'].includes(sub.status) ? 'Approved' : 'Approved, returned or declined';
  const current = ({
    DRAFT: 0, SUBMITTED: 1, RESUBMITTED: 1, UNDER_REVIEW: 2, NEEDS_REVISION: 3, REJECTED: 3, APPROVED: 3, SCHEDULED: 3, PUBLISHED: 5,
  } as Record<string, number>)[sub.status] ?? 1;
  return {
    steps: [
      { title: 'Draft', detail: 'Private to you' },
      { title: 'Submitted', detail: 'Waiting for a reviewer' },
      { title: 'In review', detail: 'Checked against the brief' },
      { title: 'Decision', detail: decision },
      { title: 'Published', detail: 'If you allowed publication' },
    ],
    current,
  };
}

export function SubmissionDetailPage() {
  const { path } = useRoute();
  const id = matchRoute('/studio/submissions/:id', path)?.id;
  const { reloadKey, failed, setFailed, retry } = useReloadable();
  const [sub, setSub] = useState<Submission | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirmingWithdraw, setConfirmingWithdraw] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [mediaUrl, setMediaUrl] = useState('');
  const [mediaError, setMediaError] = useState(false);
  const [mediaRetry, setMediaRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setMediaUrl(''); setMediaError(false);
    if (sub?.media?.storagePath) void getDownloadURL(ref(storage, sub.media.storagePath))
      .then(url => { if (active) setMediaUrl(url); })
      .catch(() => { if (active) setMediaError(true); });
    return () => { active = false; };
  }, [sub?.media?.storagePath, mediaRetry]);

  useEffect(() => {
    if (!id) return;
    setFailed(false);
    setLoading(true);
    return watchSubmission(id, value => { setSub(value); setLoading(false); }, () => { setFailed(true); setLoading(false); });
  }, [id, reloadKey, setFailed]);

  const withdraw = async () => {
    if (!sub) return;
    setWithdrawing(true);
    setActionError(null);
    try {
      await withdrawSubmission(sub);
      trackEvent('submission_withdrawn');
      setConfirmingWithdraw(false);
      retry();
    } catch (err) {
      setActionError(err instanceof Error
        ? err.message
        : 'That could not be withdrawn. Please try again.');
    } finally {
      setWithdrawing(false);
    }
  };

  if (failed) return <div className="ts-page"><LoadError title="Could not load this post" onRetry={retry} /></div>;
  if (loading) return <div className="ts-page"><div className="ts-panel"><Skeleton lines={6} title label="Loading the post" /></div></div>;
  if (!sub) {
    return (
      <div className="ts-page ts-page--medium">
        <EmptyState boxed icon="doc" title="Submission not found" body="It may have been removed, or the link may be incomplete."
          actions={<ButtonLink to="/studio/submissions" variant="secondary" icon="back">Back to your content</ButtonLink>} />
      </div>
    );
  }

  const campaignEntry = isCampaignSubmission(sub);
  const path_ = journey(sub);
  const editable = ['DRAFT', 'NEEDS_REVISION'].includes(sub.status) && !sub.collectionContribution && sub.campaign.id !== 'collection-contributions';
  const kicker = sub.collectionKind === 'dictionary' ? 'Dictionary word' : sub.collectionKind === 'expressions' ? 'Expression' : campaignEntry ? 'Campaign entry' : 'Open post';

  return (
    <div className="ts-page cr-detail">
      <PageHeader
        breadcrumb={<Breadcrumb items={[{ label: 'Content library', to: '/studio/submissions' }, { label: sub.title || 'Untitled' }]} />}
        kicker={kicker}
        title={sub.title || 'Untitled'}
        description={sub.category || undefined}
        meta={<><StatusPill status={sub.status} labels={SUBMISSION_STATUS_LABELS} /><span className="ts-faint">Started {shortDate(sub.lifecycle.createdAt)}</span></>}
        actions={editable ? (
          /* The editor autosaves as a draft, so it only opens drafts and revisions:
             a live post opened there would be unpublished by its first autosave.
             Collection contributions are edited from the app, not this form. */
          <ButtonLink to={'/studio/submissions/' + encodeURIComponent(sub.id) + '/edit'} variant="primary" icon="edit">
            {sub.status === 'DRAFT' ? 'Continue draft' : 'Revise submission'}
          </ButtonLink>
        ) : undefined}
      />

      {path_ ? (
        <section className="ts-panel ts-panel--tight cr-journey" aria-label="Where it stands">
          <Steps label="Where it stands" steps={path_.steps} current={path_.current} compact />
        </section>
      ) : null}

      {sub.status === 'NEEDS_REVISION' && sub.moderation?.feedback ? (
        <Notice tone="warning" title="Revision requested">
          <span className="preserve-lines">{sub.moderation.feedback}</span>
          {sub.moderation.revisionDeadline ? <span className="cr-due"><Icon name="calendar" />Due {shortDate(sub.moderation.revisionDeadline)}</span> : null}
        </Notice>
      ) : null}
      {sub.status === 'APPROVED' ? <Notice tone="info" title="Approved, not yet published.">Review is complete. Your work is not marked as published yet.</Notice> : null}
      {sub.status === 'PUBLISHED' ? <Notice tone="success" title="Published.">Your content is live in Indigen World.</Notice> : null}
      {sub.status === 'DRAFT' ? <Notice tone="info" title="Unfinished draft.">Nobody can see this yet. Continue it whenever you are ready.</Notice> : null}
      {sub.status === 'WITHDRAWN' ? <Notice tone="neutral" title="Withdrawn.">This is no longer public anywhere in Indigen World.</Notice> : null}
      {sub.status === 'REJECTED' && sub.moderation?.feedback ? <Notice tone="danger" role="status" title="Not accepted."><span className="preserve-lines">{sub.moderation.feedback}</span></Notice> : null}
      {actionError ? <Notice tone="danger" role="alert">{actionError}</Notice> : null}

      <div className="ts-split">
        <div className="ts-stack">
          {sub.media?.storagePath ? (
            <Panel title="Source material">
              <div className="cr-attachment">
                {mediaError ? (
                  <p className="ts-error" role="alert"><Icon name="alert" />The attachment could not be loaded. <button type="button" className="ts-link" onClick={() => setMediaRetry(value => value + 1)}>Retry preview</button></p>
                ) : !mediaUrl ? (
                  <p className="cr-attachment__loading" role="status"><span className="ts-spinner" aria-hidden="true" />Loading attachment…</p>
                ) : sub.media.mediaType === 'image' ? (
                  <img src={mediaUrl} alt={sub.altText || sub.title || 'Submitted image'} />
                ) : sub.media.mediaType === 'audio' ? (
                  <audio controls aria-label="Submitted recording" src={mediaUrl} />
                ) : sub.media.mediaType === 'video' ? (
                  <video controls playsInline aria-label="Submitted video" src={mediaUrl} />
                ) : (
                  <a className="ts-btn ts-btn--secondary ts-btn--sm" href={mediaUrl} target="_blank" rel="noreferrer"><Icon name="doc" />Open attached document</a>
                )}
              </div>
              {sub.caption ? <p className="ts-muted">{sub.caption}</p> : null}
            </Panel>
          ) : null}
          <Panel title="Description"><p className="cr-prose">{sub.description || '—'}</p></Panel>
          {sub.body ? <Panel title="Body"><p className="cr-prose preserve-lines">{sub.body}</p></Panel> : null}
          {sub.translation?.sourceContent || sub.translation?.translatedContent ? (
            <Panel title="Translation">
              <div className="cr-preview__pair">
                <div>
                  <h4 className="ts-overline">{LANGUAGE[sub.translation.sourceLanguage ?? ''] ?? sub.translation.sourceLanguage ?? 'Source'}</h4>
                  <p className="cr-prose preserve-lines">{sub.translation.sourceContent || '—'}</p>
                </div>
                <div>
                  <h4 className="ts-overline">{LANGUAGE[sub.translation.targetLanguage ?? ''] ?? sub.translation.targetLanguage ?? 'Target'}</h4>
                  <p className="cr-prose preserve-lines">{sub.translation.translatedContent || '—'}</p>
                </div>
              </div>
              {sub.translation.translatorNotes ? <p className="ts-muted">{sub.translation.translatorNotes}</p> : null}
            </Panel>
          ) : null}
          {sub.englishSummary ? <Panel title="English summary"><p className="cr-prose">{sub.englishSummary}</p></Panel> : null}
          {sub.culturalContext ? <Panel title="Cultural context"><p className="cr-prose">{sub.culturalContext}</p></Panel> : null}
          {sub.moderation?.feedback ? <Panel title="Reviewer feedback" variant="tint"><p className="cr-prose preserve-lines">{sub.moderation.feedback}</p></Panel> : null}
        </div>

        <aside className="ts-stack" aria-label="Post details">
          <Panel title="Details" variant="tight">
            <KeyValue items={[
              { label: 'Language', value: LANGUAGE[sub.primaryLanguage ?? ''] ?? sub.primaryLanguage ?? '—' },
              { label: 'Studio', value: STUDIO[sub.studioType ?? ''] ?? '—' },
              { label: 'Dialect', value: sub.dialect || '—' },
              { label: 'Tags', value: sub.tags?.join(', ') || '—' },
              { label: 'Started', value: shortDate(sub.lifecycle.createdAt) },
              { label: 'Reward eligibility', value: sub.rewardEligible ? 'Confirmed' : 'Not confirmed', hidden: !campaignEntry },
            ]} />
          </Panel>
          <Panel title="Permissions" variant="tight">
            <KeyValue items={[
              { label: 'Publication', value: sub.permissions.publication ? 'Granted' : 'No' },
              { label: 'Promotion', value: sub.permissions.promotion ? 'Granted' : 'No' },
              { label: 'AI training', value: sub.permissions.aiTraining ? 'Granted' : 'Off' },
            ]} />
          </Panel>
          {canWithdrawSubmission(sub) ? (
            <Panel title="Take it down" variant="tight">
              <p className="ts-hint">
                {sub.status === 'PUBLISHED'
                  ? 'Withdrawing removes this from Explore straight away. Use it if someone in this piece has changed their mind, or if it should not be public.'
                  : 'Withdrawing closes this post. It stays in your list, marked withdrawn.'}
              </p>
              <Button variant="danger-ghost" block icon="archive" onClick={() => setConfirmingWithdraw(true)}>Withdraw this post</Button>
            </Panel>
          ) : (
            <Panel variant="tight">
              <p className="ts-hint">
                A campaign entry and a post under review cannot be changed from here. Ask on the
                Help page if something needs correcting.
              </p>
              <ButtonLink to="/studio/help" variant="secondary" block icon="help">Get help</ButtonLink>
            </Panel>
          )}
        </aside>
      </div>

      {confirmingWithdraw ? (
        <Dialog
          title={`Withdraw “${sub.title || 'Untitled'}”?`}
          lede="You can post it again later, but the current public record is removed."
          onClose={() => setConfirmingWithdraw(false)}
          busy={withdrawing}
          footer={(
            <>
              <Button variant="ghost" disabled={withdrawing} onClick={() => setConfirmingWithdraw(false)}>Keep it</Button>
              <Button variant="danger" busy={withdrawing} onClick={() => void withdraw()}>{withdrawing ? 'Withdrawing…' : 'Yes, withdraw it'}</Button>
            </>
          )}
        >
          {sub.status === 'PUBLISHED' ? <p className="ts-hint">The post leaves Explore as soon as you confirm.</p> : null}
        </Dialog>
      ) : null}
    </div>
  );
}
