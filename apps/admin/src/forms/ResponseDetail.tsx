import { useCallback, useEffect, useRef, useState } from 'react';
import { FormResponseView } from '@indigen-world/console-ui';
import { CONSENT_PURPOSES, DESTINATIONS, RESPONSE_STATUS_LABELS, REVIEW_DECISIONS } from '@indigen-world/contracts/forms';
import type { AttachmentRef, ReviewDecision } from '@indigen-world/contracts/forms';
import type { HistoryEvent, ResponseDetail, ResponseSummary } from '@indigen-world/contracts/forms-api';
import { confirmAction } from '../ui/dialogs';
import { Icon, type IconName } from '../ui/icons';
import { Badge, Button, Field, IconButton, LoadFailure, Notice, Skeleton } from '../ui/primitives';
import { errorMessage, formsAdmin, formsReview, isStale, newRequestId } from './data';
import { dateOnly, dateTime } from './format';
import { CheckRow, ResponseStatusBadge } from './ui';

/* ==========================================================================
   One response: the questions of its own version, every submitted revision
   (with what changed since the one before), its history, consents, points
   and routing, attachments behind short-lived links, and the reviewer
   decisions. Decisions carry the status and revision on screen; if the
   response moved on meanwhile, nothing is changed and the latest is offered.
   ========================================================================== */

type Load = { state: 'loading' } | { state: 'ready'; detail: ResponseDetail } | { state: 'error'; message: string };

const EVENT_COPY: Record<HistoryEvent['type'], { label: string; icon: IconName }> = {
  created: { label: 'Draft started', icon: 'edit' },
  submitted: { label: 'Submitted', icon: 'send' },
  resubmitted: { label: 'Resubmitted with corrections', icon: 'send' },
  review_started: { label: 'Review started', icon: 'eye' },
  changes_requested: { label: 'Changes requested', icon: 'pen' },
  approved: { label: 'Approved', icon: 'check-circle' },
  rejected: { label: 'Rejected', icon: 'x-circle' },
  points_awarded: { label: 'Points awarded', icon: 'award' },
  points_failed: { label: 'Points not awarded', icon: 'alert' },
  routed: { label: 'Sent to its destination', icon: 'branch' },
  routing_blocked: { label: 'Not sent to its destination', icon: 'alert' },
  version_moved: { label: 'Moved to a newer version', icon: 'layers' },
  attachment_link: { label: 'Attachment link issued', icon: 'download' },
};

const REWARD_COPY: Record<ResponseDetail['reward']['status'], string> = {
  none: 'No points yet',
  awarded: 'Awarded',
  failed: 'Not awarded',
  not_applicable: 'No points for this form',
};

const ROUTING_COPY: Record<ResponseDetail['routing']['status'], string> = {
  not_applicable: 'Stays in Indigen Forms',
  pending: 'Waiting for approval',
  routed: 'Sent',
  blocked: 'Not sent',
  failed: 'Failed',
};

const DECISION_ORDER: ReviewDecision[] = ['start_review', 'approve', 'request_changes', 'reject'];
/** The server asks for at least this much feedback to request changes or reject. */
const MIN_FEEDBACK = 5;

export function ResponseDetailPanel({ responseId, summary, onClose, onDecided, onNotice }: {
  responseId: string;
  summary: ResponseSummary | null;
  onClose: () => void;
  onDecided: (message: string) => Promise<void>;
  onNotice: (message: string, tone: 'success' | 'danger' | 'info') => void;
}) {
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [revision, setRevision] = useState<number | null>(null);
  const [compare, setCompare] = useState(true);
  const [feedback, setFeedback] = useState('');
  const [checks, setChecks] = useState<string[]>([]);
  const [busy, setBusy] = useState<ReviewDecision | null>(null);
  const [stale, setStale] = useState(false);
  const [error, setError] = useState('');
  const [touched, setTouched] = useState(false);
  const pending = useRef<{ signature: string; requestId: string } | null>(null);

  const reload = useCallback(async () => {
    try {
      const detail = await formsAdmin({ action: 'getResponse', responseId });
      setLoad({ state: 'ready', detail });
      setRevision(null);
      setStale(false);
      setError('');
    } catch (reason) {
      setLoad({ state: 'error', message: errorMessage(reason, 'This response could not be loaded.') });
    }
  }, [responseId]);
  useEffect(() => { void reload(); }, [reload]);

  const openAttachment = async (attachment: AttachmentRef) => {
    // Open the tab now, while the click still counts as the person's own action, then point it at the short-lived link.
    const tab = window.open('about:blank', '_blank');
    try {
      const { url } = await formsAdmin({ action: 'attachmentLink', responseId, attachmentId: attachment.id });
      if (tab) {
        tab.opener = null;
        tab.location.href = url;
      } else {
        window.location.assign(url);
      }
    } catch (reason) {
      tab?.close();
      onNotice(errorMessage(reason, `${attachment.name} could not be opened.`), 'danger');
    }
  };

  if (load.state === 'loading') {
    return <article className="ad-detail afm-detail" aria-busy="true"><Skeleton title lines={8} label="Loading the response" /></article>;
  }
  if (load.state === 'error') {
    return (
      <article className="ad-detail afm-detail">
        <div className="ad-detail__head"><h2>{summary?.referenceId ?? 'Response'}</h2><IconButton icon="close" label="Close response" onClick={onClose} /></div>
        <LoadFailure body={load.message} onRetry={() => void reload()} />
      </article>
    );
  }

  const detail = load.detail;
  const revisions = [...detail.revisions].sort((a, b) => a.revision - b.revision);
  const shownRevision = revisions.find((item) => item.revision === revision) ?? revisions.at(-1) ?? null;
  const previous = shownRevision ? revisions.filter((item) => item.revision < shownRevision.revision).at(-1) ?? null : null;
  const answers = shownRevision?.answers ?? detail.answers;
  const consents = shownRevision?.consents ?? detail.consents;
  const review = detail.definition.review;
  const allowed = DECISION_ORDER.filter((decision) => detail.allowedDecisions.includes(decision));
  const missingChecks = review.checks.filter((check) => !checks.includes(check.id));
  const destination = DESTINATIONS[detail.definition.destination.type];
  const title = detail.referenceId ?? 'Unsubmitted response';
  const headingId = `afm-response-${detail.id}`;

  const decide = async (decision: ReviewDecision) => {
    if (busy || stale) return;
    setTouched(true);
    setError('');
    const needsFeedback = decision === 'request_changes' || decision === 'reject';
    if (needsFeedback && feedback.trim().length < MIN_FEEDBACK) {
      setError(decision === 'reject' ? 'Give the contributor a reason of at least five characters before rejecting.' : 'Tell the contributor what to change, in at least five characters.');
      document.getElementById(`afm-feedback-${detail.id}`)?.focus();
      return;
    }
    if (decision === 'approve' && missingChecks.length) {
      setError(`Tick every check before approving: ${missingChecks.map((check) => check.label).join('; ')}.`);
      return;
    }
    const confirm = decision === 'approve' ? {
      title: `Approve ${title}?`,
      body: <>
        <p>{review.points ? `${review.points} points go to the contributor through the points ledger, once for this response (within Finance’s limits).` : 'This form awards no points.'}</p>
        <p>{detail.definition.destination.type === 'general_intake' ? 'The response stays in Indigen Forms.' : `${destination.effect} It is sent only if the contributor granted the consents it needs.`}</p>
        <p>Approval never grants publication or AI-training use; only the contributor’s own consents do.</p>
      </>,
      label: 'Approve',
      tone: 'primary' as const,
    } : decision === 'request_changes' ? {
      title: `Ask for changes to ${title}?`,
      body: <p>The contributor sees your feedback and can correct the response on its original version and send it again. This submission is kept as revision {detail.revision}.</p>,
      label: 'Request changes',
      tone: 'primary' as const,
    } : decision === 'reject' ? {
      title: `Reject ${title}?`,
      body: <p>The contributor sees your reason. The response and its history are kept for the record; it earns no points and is not sent anywhere.</p>,
      label: 'Reject',
      tone: 'danger' as const,
    } : null;
    if (confirm && !(await confirmAction({ title: confirm.title, body: confirm.body, confirmLabel: confirm.label, tone: confirm.tone }))) return;

    // Starting a review tells the contributor nothing: feedback drafted for a later decision stays in the box, unsent.
    const sendsFeedback = decision !== 'start_review' && Boolean(feedback.trim());
    // The same decision on the same revision reuses its request id, so a retry after a dropped connection cannot act twice.
    const signature = JSON.stringify([decision, detail.expectedStatus, detail.expectedRevision, sendsFeedback ? feedback.trim() : '', [...checks].sort()]);
    if (pending.current?.signature !== signature) pending.current = { signature, requestId: newRequestId() };
    setBusy(decision);
    try {
      const result = await formsReview({
        action: 'decide',
        responseId: detail.id,
        decision,
        ...(sendsFeedback ? { feedback } : {}),
        ...(decision === 'approve' && review.checks.length ? { checks } : {}),
        expectedStatus: detail.expectedStatus,
        expectedRevision: detail.expectedRevision,
        requestId: pending.current.requestId,
      });
      pending.current = null;
      if (decision !== 'start_review') {
        setFeedback('');
        setChecks([]);
      }
      setTouched(false);
      const outcome = decision === 'approve'
        ? `Approved ${title}.${result.reward.status === 'awarded' ? ` ${result.reward.points} points awarded.` : ''}${result.routing.status === 'routed' ? ' Sent to its destination.' : result.routing.status === 'blocked' ? ' Not sent: a needed consent is missing.' : ''}`
        : decision === 'start_review' ? `Review started for ${title}.`
          : decision === 'request_changes' ? `Changes requested for ${title}. The contributor has been told.`
            : `Rejected ${title}. The contributor has been told.`;
      await onDecided(result.replayed ? `${outcome} (This decision had already been recorded.)` : outcome);
      await reload();
    } catch (reason) {
      if (isStale(reason)) {
        pending.current = null;
        setStale(true);
        setError('This response changed since you opened it, so nothing was decided. Your feedback is still here. Load the latest version, check it, then decide again.');
      } else {
        setError(errorMessage(reason, 'The decision could not be saved. Nothing was changed.'));
      }
    } finally {
      setBusy(null);
    }
  };

  return (
    <article className="ad-detail afm-detail" aria-labelledby={headingId}>
      <div className="ad-detail__head">
        <div className="afm-detail__title">
          <h2 id={headingId}>{title}</h2>
          <ResponseStatusBadge status={detail.status} />
        </div>
        <IconButton icon="close" label="Close response" onClick={onClose} />
      </div>

      <dl className="afm-facts">
        <div><dt>Contributor</dt><dd>{detail.contributorName || 'Contributor'} <code className="afm-code">{detail.contributorId}</code></dd></div>
        <div><dt>Form</dt><dd>{detail.formTitle} · version {detail.formVersion}{detail.versionState === 'retired' ? ' (retired)' : ''}</dd></div>
        <div><dt>Submitted</dt><dd>{dateTime(detail.submittedAt)}</dd></div>
        <div><dt>Decided</dt><dd>{dateTime(detail.decidedAt)}</dd></div>
      </dl>

      {revisions.length > 1 ? (
        <div className="afm-revisions">
          <Field label="Revision" hint="Every submission is kept. A correction after “changes requested” is a new revision.">
            <select className="ts-select ts-select--sm" value={shownRevision?.revision ?? ''} onChange={(event) => setRevision(Number(event.target.value))}>
              {revisions.map((item) => <option key={item.revision} value={item.revision}>Revision {item.revision} · {dateOnly(item.submittedAt)}{item.revision === revisions.at(-1)?.revision ? ' (latest)' : ''}</option>)}
            </select>
          </Field>
          {previous ? <CheckRow label={`Mark answers changed since revision ${previous.revision}`} checked={compare} onChange={setCompare} /> : null}
        </div>
      ) : null}

      <section className="ad-detail__section" aria-label="Answers">
        <h3>Answers{shownRevision ? ` · revision ${shownRevision.revision}` : ''}</h3>
        <FormResponseView definition={detail.definition} answers={answers} consents={consents} compareWith={compare && previous ? previous.answers : null}
          onOpenAttachment={(attachment) => void openAttachment(attachment)} headingLevel={4} />
      </section>

      {detail.attachments.length ? (
        <section className="ad-detail__section" aria-label="Attachments">
          <h3>Attachments</h3>
          <ul className="afm-attachments">
            {detail.attachments.map((attachment) => (
              <li key={attachment.id}>
                <span className="afm-attachments__name"><Icon name="doc" /> {attachment.name}</span>
                <Badge tone={attachment.inspection === 'passed' ? 'success' : attachment.inspection === 'rejected' ? 'danger' : 'warning'}>
                  {attachment.inspection === 'passed' ? 'Format checked' : attachment.inspection === 'rejected' ? 'Rejected by the check' : 'Check pending'}
                </Badge>
                <Button size="sm" variant="ghost" icon="external" disabled={attachment.inspection === 'rejected'} onClick={() => void openAttachment(attachment)} aria-label={`Open ${attachment.name} in a new tab`}>Open</Button>
              </li>
            ))}
          </ul>
          <p className="ts-hint">Files are identified by their contents (signature check). There is no malware scan; open files you do not expect with care. Links last five minutes.</p>
        </section>
      ) : null}

      <section className="ad-detail__section" aria-label="Permissions">
        <h3>Permissions given</h3>
        {consents.length ? (
          <ul className="afm-consents">
            {consents.map((consent) => (
              <li key={consent.fieldId}>
                <Icon name={consent.granted ? 'check-circle' : 'x-circle'} className={consent.granted ? 'afm-ok' : 'afm-muted-icon'} />
                <span><strong>{CONSENT_PURPOSES[consent.purpose]?.label ?? consent.purpose}: {consent.granted ? 'granted' : 'not granted'}</strong><small>“{consent.statement}”</small></span>
              </li>
            ))}
          </ul>
        ) : <p className="ts-hint">This form asked for no consent.</p>}
      </section>

      <section className="ad-detail__section" aria-label="Points and routing">
        <h3>Points and destination</h3>
        <dl className="afm-facts">
          <div><dt>Points</dt><dd>{REWARD_COPY[detail.reward.status]}{detail.reward.points ? ` · ${detail.reward.points}` : ''}{detail.reward.note ? ` — ${detail.reward.note}` : ''}</dd></div>
          <div><dt>{destination?.label ?? detail.routing.destination}</dt><dd>{ROUTING_COPY[detail.routing.status]}{detail.routing.targetId ? <> · <code className="afm-code">{detail.routing.targetCollection}/{detail.routing.targetId}</code></> : null}{detail.routing.note ? ` — ${detail.routing.note}` : ''}</dd></div>
        </dl>
      </section>

      {detail.feedback ? <Notice tone={detail.status === 'rejected' ? 'danger' : 'info'} title="Latest feedback to the contributor">{detail.feedback}</Notice> : null}

      <section className="ad-detail__section" aria-label="Decision">
        <h3>Decision</h3>
        {review.required ? null : <p className="ts-hint">This version does not ask for review: responses stay received, earn no points and are not sent anywhere.</p>}
        {review.instructions ? <Notice tone="neutral" icon="info" title="Instructions for reviewers">{review.instructions}</Notice> : null}
        {stale ? <Notice tone="warning" role="alert" action={<Button size="sm" onClick={() => void reload()}>Load the latest version</Button>}>This response changed since you opened it. Your feedback is kept.</Notice> : null}
        {allowed.length ? (
          <>
            {allowed.includes('approve') && review.checks.length ? (
              <fieldset className="afm-fieldset">
                <legend className="ts-label">Checks before approving</legend>
                <div className="afm-checks">
                  {review.checks.map((check) => (
                    <CheckRow key={check.id} label={check.label} checked={checks.includes(check.id)} disabled={Boolean(busy) || stale}
                      onChange={(checked) => setChecks((current) => (checked ? [...current, check.id] : current.filter((id) => id !== check.id)))} />
                  ))}
                </div>
              </fieldset>
            ) : null}
            {allowed.some((decision) => decision !== 'start_review') ? (
              <Field label="Feedback to the contributor" hint="Required (at least five characters) to request changes or reject. The contributor sees it as written. Starting a review does not send it." error={touched && error && feedback.trim().length < MIN_FEEDBACK ? 'At least five characters are needed for this decision.' : undefined}>
                <textarea id={`afm-feedback-${detail.id}`} className="ts-textarea" rows={3} value={feedback} onChange={(event) => setFeedback(event.target.value)} disabled={stale} />
              </Field>
            ) : null}
            {error && !stale ? <Notice tone="danger" role="alert">{error}</Notice> : null}
            <div className="ad-detail__actions">
              {allowed.map((decision) => (
                <Button key={decision}
                  variant={decision === 'approve' ? 'primary' : decision === 'reject' ? 'danger-ghost' : 'secondary'}
                  busy={busy === decision}
                  disabled={Boolean(busy) || stale || (decision === 'approve' && missingChecks.length > 0)}
                  onClick={() => void decide(decision)}>
                  {REVIEW_DECISIONS[decision].label}
                </Button>
              ))}
            </div>
            {allowed.includes('approve') && missingChecks.length ? <p className="ts-hint">Approve unlocks when every check is ticked.</p> : null}
          </>
        ) : (
          <p className="ts-hint">No decision is open for a response that is {(RESPONSE_STATUS_LABELS[detail.status] ?? detail.status).toLowerCase()}{detail.status === 'submitted' || detail.status === 'under_review' ? ' (you cannot review your own response)' : ''}.</p>
        )}
      </section>

      <section className="ad-detail__section" aria-label="History">
        <h3>History</h3>
        {detail.history.length ? (
          <ol className="ts-timeline">
            {[...detail.history].sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).map((event) => {
              const copy = EVENT_COPY[event.type] ?? { label: event.type, icon: 'circle' as IconName };
              const checkLabels = (event.checks ?? []).map((id) => review.checks.find((check) => check.id === id)?.label ?? id);
              return (
                <li key={event.id} className="ts-timeline__item">
                  <span className="ts-timeline__icon" aria-hidden="true"><Icon name={copy.icon} /></span>
                  <div className="ts-timeline__body">
                    <strong>{copy.label}</strong>
                    <span className="ts-hint">{event.actorName || 'System'} · {event.actorRole} · revision {event.revision} · <time dateTime={event.at}>{dateTime(event.at)}</time></span>
                    {event.feedback ? <p className="afm-prewrap">“{event.feedback}”</p> : null}
                    {checkLabels.length ? <p className="ts-hint">Checks: {checkLabels.join('; ')}</p> : null}
                    {event.note ? <p className="ts-hint">{event.note}</p> : null}
                  </div>
                </li>
              );
            })}
          </ol>
        ) : <p className="ts-hint">No events yet.</p>}
      </section>
      <p className="ts-hint">Response id <code>{detail.id}</code></p>
    </article>
  );
}
