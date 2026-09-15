import { useEffect, useState } from 'react';
import type { Submission } from '@indigen-world/contracts/creator-models';
import { Link, matchRoute, useRoute } from '../../router';
import { trackEvent } from '../../analytics';
import {
  canWithdrawSubmission,
  fetchSubmission,
  withdrawSubmission,
} from '../data';
import { LoadError, Skeleton, StatusPill, SUBMISSION_STATUS_LABELS, useReloadable } from '../components';

export function SubmissionDetailPage() {
  const { path } = useRoute();
  const id = matchRoute('/studio/submissions/:id', path)?.id;
  const { reloadKey, failed, setFailed, retry } = useReloadable();
  const [sub, setSub] = useState<Submission | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirmingWithdraw, setConfirmingWithdraw] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let active = true;
    setFailed(false);
    setLoading(true);
    void fetchSubmission(id)
      .then((s) => { if (!active) return; setSub(s); setLoading(false); })
      .catch(() => { if (active) { setFailed(true); setLoading(false); } });
    return () => { active = false; };
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

  if (failed) return <div className="page"><LoadError onRetry={retry} /></div>;
  if (loading) return <div className="page"><Skeleton lines={6} /></div>;
  if (!sub) return <div className="page"><h1>Submission not found</h1><Link to="/studio/submissions" className="button button--ghost-dark">Back</Link></div>;

  return (
    <div className="page">
      <p className="breadcrumb"><Link to="/studio/submissions">Submissions</Link> / {sub.title || 'Untitled'}</p>
      <header className="page__head">
        <div><h1>{sub.title || 'Untitled'}</h1><p className="muted">{sub.category}</p></div>
        <div className="page__head-actions">
          <StatusPill status={sub.status} labels={SUBMISSION_STATUS_LABELS} />
          {/* The editor autosaves as a draft, so it only opens drafts and revisions:
              a live post opened there would be unpublished by its first autosave.
              Collection contributions are edited from the app, not this form. */}
          {['DRAFT', 'NEEDS_REVISION'].includes(sub.status) && !sub.collectionContribution && sub.campaign.id !== 'collection-contributions' ? (
            <Link to={'/studio/submissions/' + encodeURIComponent(sub.id) + '/edit'} className="button button--small button--primary">
              {sub.status === 'DRAFT' ? 'Continue draft' : 'Revise submission'}
            </Link>
          ) : null}
        </div>
      </header>

      {sub.status === 'NEEDS_REVISION' && sub.moderation?.feedback ? (
        <div className="callout callout--warn">
          <strong>Revision requested.</strong> {sub.moderation.feedback}
          {sub.moderation.revisionDeadline ? <> · Due {new Date(sub.moderation.revisionDeadline).toLocaleDateString()}</> : null}
        </div>
      ) : null}
      {sub.status === 'APPROVED' ? <div className="callout callout--info"><strong>Approved, not yet published.</strong> Review is complete. Your work is not marked as published yet.</div> : null}
      {sub.status === 'PUBLISHED' ? <div className="callout callout--ok"><strong>Published.</strong> Your content is live in Indigen World.</div> : null}
      {sub.status === 'DRAFT' ? <div className="callout callout--info"><strong>Unfinished draft.</strong> Nobody can see this yet. Continue it whenever you are ready.</div> : null}
      {sub.status === 'WITHDRAWN' ? <div className="callout callout--info"><strong>Withdrawn.</strong> This is no longer public anywhere in Indigen World.</div> : null}
      {actionError ? <div className="callout callout--warn" role="alert">{actionError}</div> : null}
      {sub.status === 'REJECTED' && sub.moderation?.feedback ? <div className="callout callout--warn"><strong>Not accepted.</strong> {sub.moderation.feedback}</div> : null}

      <div className="cols">
        <div>
          <section className="panel"><h2>Description</h2><p>{sub.description || '—'}</p></section>
          {sub.body ? <section className="panel"><h2>Body</h2><p className="preserve-lines">{sub.body}</p></section> : null}
          {sub.translation?.sourceContent || sub.translation?.translatedContent ? (
            <section className="panel">
              <h2>Translation</h2>
              <div className="translation-preview">
                <div>
                  <strong>{sub.translation.sourceLanguage || 'Source'}</strong>
                  <p className="preserve-lines">{sub.translation.sourceContent || '—'}</p>
                </div>
                <div>
                  <strong>{sub.translation.targetLanguage || 'Target'}</strong>
                  <p className="preserve-lines">{sub.translation.translatedContent || '—'}</p>
                </div>
              </div>
              {sub.translation.translatorNotes ? <p className="muted">{sub.translation.translatorNotes}</p> : null}
            </section>
          ) : null}
          {sub.englishSummary ? <section className="panel"><h2>English summary</h2><p>{sub.englishSummary}</p></section> : null}
          {sub.culturalContext ? <section className="panel"><h2>Cultural context</h2><p>{sub.culturalContext}</p></section> : null}
          {sub.moderation?.feedback ? <section className="panel"><h2>Reviewer feedback</h2><p>{sub.moderation.feedback}</p></section> : null}
        </div>
        <aside>
          <section className="panel">
            <h2>Details</h2>
            <ul className="mini-list">
              <li><span>Language</span><span className="muted">{sub.primaryLanguage}</span></li>
              <li><span>Studio</span><span className="muted">{sub.studioType || '—'}</span></li>
              <li><span>Dialect</span><span className="muted">{sub.dialect || '—'}</span></li>
              <li><span>Tags</span><span className="muted">{sub.tags?.join(', ') || '—'}</span></li>
              <li><span>Submitted</span><span className="muted">{sub.lifecycle.createdAt ? new Date(sub.lifecycle.createdAt).toLocaleDateString() : '—'}</span></li>
              <li><span>Reward eligible</span><span className="muted">{sub.rewardEligible ? 'Yes' : 'Pending'}</span></li>
            </ul>
          </section>
          <section className="panel">
            <h2>Permissions</h2>
            <ul className="mini-list">
              <li><span>Publication</span><span className="muted">{sub.permissions.publication ? 'Granted' : 'No'}</span></li>
              <li><span>Promotion</span><span className="muted">{sub.permissions.promotion ? 'Granted' : 'No'}</span></li>
              <li><span>AI training</span><span className="muted">{sub.permissions.aiTraining ? 'Granted' : 'Off'}</span></li>
            </ul>
          </section>
          {canWithdrawSubmission(sub) ? (
            <section className="panel">
              <h2>Take it down</h2>
              <p className="tiny">
                {sub.status === 'PUBLISHED'
                  ? 'Withdrawing removes this from Explore straight away. Use it if someone in this piece has changed their mind, or if it should not be public.'
                  : 'Withdrawing closes this post. It stays in your list, marked withdrawn.'}
              </p>
              {confirmingWithdraw ? (
                <>
                  <p className="tiny"><strong>Withdraw “{sub.title || 'Untitled'}”?</strong> You can post it again later, but the current public record is removed.</p>
                  <button
                    type="button"
                    className="button button--danger button--block"
                    disabled={withdrawing}
                    onClick={() => void withdraw()}
                  >
                    {withdrawing ? 'Withdrawing…' : 'Yes, withdraw it'}
                  </button>
                  <button
                    type="button"
                    className="button button--ghost-dark button--block"
                    disabled={withdrawing}
                    onClick={() => setConfirmingWithdraw(false)}
                  >
                    Keep it
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="button button--ghost-dark button--block"
                  onClick={() => setConfirmingWithdraw(true)}
                >
                  Withdraw this post
                </button>
              )}
            </section>
          ) : (
            <section className="panel">
              <p className="tiny">
                A campaign entry and a post under review cannot be changed from here. Ask on the
                Help page if something needs correcting.
              </p>
              <Link to="/studio/help" className="button button--ghost-dark button--block">Get help</Link>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
