import { useEffect, useState } from 'react';
import type { Submission } from '@indigen-world/contracts/creator-models';
import { Link, matchRoute, useRoute } from '../../router';
import { fetchSubmission } from '../data';
import { Skeleton, StatusPill, SUBMISSION_STATUS_LABELS } from '../components';

const WITHDRAWABLE = new Set(['DRAFT', 'SUBMITTED', 'NEEDS_REVISION', 'RESUBMITTED', 'UNDER_REVIEW']);

export function SubmissionDetailPage() {
  const { path } = useRoute();
  const id = matchRoute('/studio/submissions/:id', path)?.id;
  const [sub, setSub] = useState<Submission | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    void fetchSubmission(id).then((s) => { setSub(s); setLoading(false); });
  }, [id]);

  if (loading) return <div className="page"><Skeleton lines={6} /></div>;
  if (!sub) return <div className="page"><h1>Submission not found</h1><Link to="/studio/submissions" className="button button--ghost-dark">Back</Link></div>;

  return (
    <div className="page">
      <p className="breadcrumb"><Link to="/studio/submissions">Submissions</Link> / {sub.title || 'Untitled'}</p>
      <header className="page__head">
        <div><h1>{sub.title || 'Untitled'}</h1><p className="muted">{sub.category}</p></div>
        <StatusPill status={sub.status} labels={SUBMISSION_STATUS_LABELS} />
      </header>

      {sub.status === 'NEEDS_REVISION' && sub.moderation?.feedback ? (
        <div className="callout callout--warn">
          <strong>Revision requested.</strong> {sub.moderation.feedback}
          {sub.moderation.revisionDeadline ? <> · Due {new Date(sub.moderation.revisionDeadline).toLocaleDateString()}</> : null}
        </div>
      ) : null}
      {sub.status === 'PUBLISHED' ? <div className="callout callout--ok"><strong>Published.</strong> Your content is live in Indigen World.</div> : null}
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
          {WITHDRAWABLE.has(sub.status) ? (
            <section className="panel">
              <p className="tiny">Need to withdraw? Contact support from the Help page.</p>
              <Link to="/studio/help" className="button button--ghost-dark button--block">Get help</Link>
            </section>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
