import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { DESTINATIONS, RESPONSE_STATUS_LABELS, REVIEWER_GROUPS, findField } from '@indigen-world/contracts/forms';
import type { ConsentRecord, ReviewDecision } from '@indigen-world/contracts/forms';
import type { FormsReviewResponses, HistoryEvent, ResponseDetail, ResponseSummary } from '@indigen-world/contracts/forms-api';
import { FormResponseView } from '@indigen-world/console-ui';
import { Badge, Button, Consequence, Dialog, EmptyState, Icon, LoadFailure, Notice, Skeleton, type IconName } from '../../../ui';
import { formatBytes, formatDateTime } from '../../model';
import { STATUS_TONE } from '../forms-model';
import { formsReview, openReviewAttachment, reviewFailure, type ReviewFailure } from './review-data';
import {
  DECISION_COPY, FEEDBACK_MAX, FEEDBACK_MIN, actorRoleLabel, consentGaps, decisionBlocker, decisionPayload, decisionRequestId,
  destinationLabel, feedbackLength, feedbackProblem, feedbackRequired, missingChecks, orderedDecisions, purposeLabel,
  reviewHistoryLabel, rewardOutcome, routingOutcome, takesFeedback,
} from './review-model';

/*
 * One response on the forms review desk: what the contributor submitted (any
 * revision, with changes marked against the one before), the form version's
 * review instructions, the permissions exactly as worded, the history, the
 * outcome once approved, and the decision. Admin- and contributor-written text
 * is shown as plain text with its line breaks; nothing is rendered as HTML.
 */

export interface Decided {
  responseId: string;
  referenceId: string | null;
  decision: ReviewDecision;
  outcome: FormsReviewResponses['decide'];
}

const DECISION_ICON: Record<ReviewDecision, IconName> = { start_review: 'eye', request_changes: 'refresh', approve: 'check', reject: 'x-circle' };

function newRequestId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Ask before leaving while the reviewer has typed feedback, and never while a decision is being sent. */
function useLeaveGuard(active: boolean, busy: boolean) {
  const state = useRef({ active, busy });
  state.current = { active, busy };
  useEffect(() => {
    const protect = (event: Event) => {
      if (state.current.busy) { event.preventDefault(); return; }
      if (state.current.active && !window.confirm('Leave this response? The feedback you typed has not been sent and will be lost.')) event.preventDefault();
    };
    const unload = (event: BeforeUnloadEvent) => {
      if (state.current.active || state.current.busy) { event.preventDefault(); event.returnValue = ''; }
    };
    window.addEventListener('studio:before-navigate', protect);
    window.addEventListener('beforeunload', unload);
    return () => {
      window.removeEventListener('studio:before-navigate', protect);
      window.removeEventListener('beforeunload', unload);
    };
  }, []);
  return state;
}

function Multiline({ text, className }: { text: string; className?: string }) {
  return <p className={className ? `fm-multiline ${className}` : 'fm-multiline'}>{text}</p>;
}

function CopyReference({ value }: { value: string }) {
  const [said, setSaid] = useState('');
  return (
    <>
      <button
        type="button"
        className="ts-btn ts-btn--ghost ts-btn--sm"
        onClick={() => {
          navigator.clipboard?.writeText(value)
            .then(() => setSaid('Reference ID copied.'))
            .catch(() => setSaid('Copy did not work here. Select the reference ID and copy it yourself.'));
        }}
      >
        <Icon name="copy" /><span>Copy<span className="ts-sr"> reference ID</span></span>
      </button>
      <span className="ts-sr" role="status" aria-live="polite">{said}</span>
    </>
  );
}

const INSPECTION: Record<'passed' | 'rejected' | 'pending', { tone: 'success' | 'warning' | 'danger'; label: string }> = {
  passed: { tone: 'success', label: 'Format check passed' },
  pending: { tone: 'warning', label: 'Still being checked' },
  rejected: { tone: 'danger', label: 'Rejected by the format check' },
};

const BLOCKED_TITLE: Partial<Record<ReviewFailure['kind'], string>> = {
  group: 'Another reviewer group reviews this form',
  own: 'You cannot review your own response',
  denied: 'You cannot review this response',
  missing: 'This response is not available',
};

export function ResponseReview({ preview, responseId, queueRow, focusOnLoad, canRetryRouting, onDecided, onStarted, onBack, onTrail, onDeciding }: {
  preview: boolean;
  responseId: string;
  /** The same response as the queue last listed it, to notice a change made elsewhere. */
  queueRow: ResponseSummary | null;
  focusOnLoad: boolean;
  canRetryRouting: boolean;
  onDecided(result: Decided): void;
  onStarted(referenceId: string | null): void;
  onBack(): void;
  onTrail(label: string | null): void;
  onDeciding(deciding: boolean): void;
}) {
  const [detail, setDetail] = useState<ResponseDetail | null>(null);
  const [failure, setFailure] = useState<ReviewFailure | null>(null);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [stale, setStale] = useState<ReviewFailure | null>(null);
  const [shown, setShown] = useState<number | null>(null);
  const [fileError, setFileError] = useState('');
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState('');
  const heading = useRef<HTMLHeadingElement>(null);
  const focused = useRef(false);
  const ids = useId().replace(/[^A-Za-z0-9_-]/g, '');

  useEffect(() => {
    let active = true;
    setLoading(true);
    formsReview(preview, { action: 'get', responseId })
      .then((next) => {
        if (!active) return;
        setDetail(next);
        setFailure(null);
        setStale(null);
        setShown(null);
        onTrail(next.referenceId ?? next.id);
      })
      .catch((error: unknown) => { if (active) setFailure(reviewFailure(error)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [preview, responseId, attempt]);

  useEffect(() => {
    if (detail && focusOnLoad && !focused.current) {
      focused.current = true;
      heading.current?.focus();
    }
  }, [detail, focusOnLoad]);

  const reload = () => setAttempt((count) => count + 1);

  if (failure && !detail) {
    const title = BLOCKED_TITLE[failure.kind];
    if (title) {
      return (
        <div className="ts-panel fr-blocked" role="alert">
          <EmptyState
            icon={failure.kind === 'missing' ? 'map' : 'lock'}
            title={title}
            body={failure.message}
            actions={<Button variant="secondary" icon="back" onClick={onBack}>Back to the queue</Button>}
          />
        </div>
      );
    }
    return <div className="ts-panel"><LoadFailure title="This response did not load" body={failure.message} onRetry={reload} /></div>;
  }
  if (!detail) return <div className="ts-panel"><Skeleton title lines={8} label="Opening the response" /></div>;

  const definition = detail.definition;
  const revisions = [...detail.revisions].sort((a, b) => b.revision - a.revision);
  const latest = revisions[0] ?? null;
  const viewing = (shown !== null ? revisions.find((entry) => entry.revision === shown) : null) ?? latest;
  const previous = viewing ? revisions.find((entry) => entry.revision === viewing.revision - 1) ?? null : null;
  const answers = viewing?.answers ?? detail.answers;
  const consents: ConsentRecord[] = viewing?.consents ?? detail.consents;
  const history = [...detail.history].sort((a, b) => b.at.localeCompare(a.at));
  const checkLabels = new Map(definition.review.checks.map((check) => [check.id, check.label]));
  // The queue was refreshed after this response was opened and lists it differently.
  const movedInQueue = Boolean(queueRow && Date.parse(queueRow.updatedAt) > Date.parse(detail.updatedAt)
    && (queueRow.status !== detail.expectedStatus || queueRow.revision !== detail.expectedRevision));
  const staleMessage = stale?.message ?? (movedInQueue ? 'The queue shows this response in another state now. Your notes are kept. Load the latest version before deciding.' : null);
  const feedbackRevision = history.find((entry) => entry.type === 'changes_requested' || entry.type === 'rejected' || entry.type === 'approved')?.revision ?? null;
  const decided = detail.status === 'approved' || detail.reward.status !== 'none' || detail.routing.status !== 'not_applicable';
  const group = REVIEWER_GROUPS[definition.review.reviewerGroup]?.label ?? 'Reviewers';
  const titleId = `fr-${ids}-title`;

  const openFile = (attachmentId: string) => {
    setFileError('');
    openReviewAttachment(preview, detail.id, attachmentId).catch((error: unknown) => setFileError(error instanceof Error ? error.message : 'The file could not be opened.'));
  };

  const retryRouting = async () => {
    setRetrying(true);
    setRetryError('');
    try {
      await formsReview(preview, { action: 'retryRouting', responseId: detail.id });
      reload();
    } catch (error) {
      setRetryError(reviewFailure(error).message);
    } finally {
      setRetrying(false);
    }
  };

  return (
    <div className="rv-detail fr-detail">
      <article className="ts-panel rv-record fr-record" aria-labelledby={titleId}>
        {staleMessage ? (
          <Notice
            tone="warning"
            role="alert"
            className="fr-stale"
            title="This response changed after you opened it"
            action={<Button size="sm" variant="dark" icon="refresh" busy={loading} onClick={reload}>Load latest version</Button>}
          >
            <p>{staleMessage}</p>
          </Notice>
        ) : null}
        {failure ? (
          <Notice tone="danger" title="The latest version did not load" action={<Button size="sm" onClick={reload} busy={loading}>Try again</Button>}>
            <p>{failure.message}</p>
          </Notice>
        ) : null}

        <header className="rv-record__head fr-head">
          <div className="ts-cluster">
            <Badge tone={STATUS_TONE[detail.status] ?? 'neutral'} dot>{RESPONSE_STATUS_LABELS[detail.status] ?? detail.status}</Badge>
            <Badge>{`Form version ${detail.formVersion}${detail.versionState === 'retired' ? ' (retired)' : ''}`}</Badge>
            {detail.revision > 1 ? <Badge tone="info">{`Revision ${detail.revision}`}</Badge> : null}
          </div>
          <h2 className="rv-record__title" id={titleId} ref={heading} tabIndex={-1}>{detail.formTitle}</h2>
          <dl className="fr-facts">
            <div className="fr-facts__item fr-facts__item--ref">
              <dt>Reference ID</dt>
              <dd className="fr-facts__ref">
                <code className="fr-ref" data-testid="review-reference">{detail.referenceId ?? 'Not assigned'}</code>
                {detail.referenceId ? <CopyReference value={detail.referenceId} /> : null}
              </dd>
            </div>
            <div className="fr-facts__item"><dt>Contributor</dt><dd>{detail.contributorName || 'Unnamed contributor'}</dd></div>
            <div className="fr-facts__item">
              <dt>Submitted</dt>
              <dd>{detail.submittedAt ? <time dateTime={detail.submittedAt}>{formatDateTime(detail.submittedAt)}</time> : 'Not submitted'}</dd>
            </div>
            <div className="fr-facts__item"><dt>Revision</dt><dd>{detail.revision > 1 ? `${detail.revision} (resubmitted)` : String(detail.revision)}</dd></div>
            <div className="fr-facts__item"><dt>Form version</dt><dd>{`Version ${detail.formVersion}`}</dd></div>
            {detail.decidedAt ? (
              <div className="fr-facts__item"><dt>Last decision</dt><dd><time dateTime={detail.decidedAt}>{formatDateTime(detail.decidedAt)}</time></dd></div>
            ) : null}
          </dl>
        </header>

        <section className="fr-instructions" aria-labelledby={`${titleId}-instructions`}>
          <h3 className="rv-section__title" id={`${titleId}-instructions`}><Icon name="guide" />Review instructions</h3>
          {definition.review.instructions
            ? <Multiline text={definition.review.instructions} className="fr-instructions__text" />
            : <p className="ts-hint">This version of the form has no review instructions.</p>}
          <p className="ts-hint">
            {`Reviewed by: ${group}. `}
            {definition.review.checks.length ? `${definition.review.checks.length} check${definition.review.checks.length === 1 ? '' : 's'} to confirm before approving. ` : 'No checks to confirm. '}
            {definition.review.points > 0 ? `${definition.review.points} points on approval.` : 'No points.'}
          </p>
        </section>

        {detail.feedback ? (
          <section className="fm-feedback" aria-labelledby={`${titleId}-feedback`}>
            <h3 className="fm-feedback__title" id={`${titleId}-feedback`}><Icon name="message" />Latest feedback sent to the contributor</h3>
            <Multiline text={detail.feedback} />
            {feedbackRevision !== null ? <p className="ts-hint">{`Given on revision ${feedbackRevision}.${detail.revision > feedbackRevision ? ` The contributor has sent revision ${detail.revision} since.` : ''}`}</p> : null}
          </section>
        ) : null}

        {decided ? (
          <section className="rv-section fr-outcome" aria-labelledby={`${titleId}-outcome`}>
            <h3 className="rv-section__title" id={`${titleId}-outcome`}><Icon name="award" />Outcome</h3>
            <Notice tone={rewardOutcome(detail.reward, definition.review.points).tone} icon="award" title="Points">
              <p>{rewardOutcome(detail.reward, definition.review.points).text}</p>
            </Notice>
            <Notice
              tone={routingOutcome(detail.routing).tone}
              icon="send"
              title={`Filing: ${destinationLabel(detail.routing.destination)}`}
              action={canRetryRouting && detail.status === 'approved' && ['failed', 'pending'].includes(detail.routing.status)
                ? <Button size="sm" icon="refresh" busy={retrying} onClick={() => void retryRouting()}>Retry filing</Button>
                : undefined}
            >
              <p>{routingOutcome(detail.routing).text}</p>
              {retryError ? <p className="ts-error" role="alert"><Icon name="alert" />{retryError}</p> : null}
            </Notice>
          </section>
        ) : null}

        <section className="rv-section fr-answers" aria-labelledby={`${titleId}-answers`}>
          <div className="fr-answers__head">
            <h3 className="rv-section__title" id={`${titleId}-answers`}><Icon name="doc" />{viewing ? `Answers · revision ${viewing.revision}` : 'Answers'}</h3>
            {revisions.length > 1 ? (
              <label className="fm-revision" htmlFor={`${titleId}-revision`}>
                <span className="ts-label">Show revision</span>
                <select
                  id={`${titleId}-revision`}
                  className="ts-select ts-select--sm"
                  value={String(viewing?.revision ?? '')}
                  onChange={(event) => setShown(Number(event.target.value))}
                >
                  {revisions.map((entry) => (
                    <option key={entry.revision} value={entry.revision}>
                      {`Revision ${entry.revision}${entry === latest ? ' (latest)' : ''} · ${formatDateTime(entry.submittedAt)}`}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>
          {previous ? <p className="ts-hint">{`Answers marked “Changed” differ from revision ${previous.revision}. Open “Previous answer” under one to compare.`}</p> : null}
          {viewing && latest && viewing !== latest ? <Notice tone="info">{`You are looking at revision ${viewing.revision}. Decisions apply to the latest revision, ${latest.revision}.`}</Notice> : null}
          {fileError ? <Notice tone="danger">{fileError}</Notice> : null}
          <FormResponseView
            definition={definition}
            answers={answers}
            consents={consents}
            compareWith={previous ? previous.answers : null}
            headingLevel={4}
            onOpenAttachment={(attachment) => openFile(attachment.id)}
          />
        </section>

        {detail.attachments.length ? (
          <section className="rv-section" aria-labelledby={`${titleId}-files`}>
            <h3 className="rv-section__title" id={`${titleId}-files`}><Icon name="upload" />Files</h3>
            <ul className="fr-files">
              {detail.attachments.map((file) => {
                const check = INSPECTION[file.inspection] ?? INSPECTION.pending;
                return (
                  <li key={file.id} className="fr-file">
                    <span className="fr-file__name">{file.name}</span>
                    <span className="fr-file__meta">{`${findField(definition, file.fieldId)?.label || 'File'} · ${formatBytes(file.size)}`}</span>
                    <Badge tone={check.tone} dot>{check.label}</Badge>
                    <Button size="sm" icon="external" onClick={() => openFile(file.id)}>
                      Open<span className="ts-sr">{` ${file.name}`}</span>
                    </Button>
                  </li>
                );
              })}
            </ul>
            <p className="ts-hint">Files are identified by their contents only. There is no malware scan, so open them with care. Each link works for five minutes and is recorded.</p>
          </section>
        ) : null}

        <section className="rv-section" aria-labelledby={`${titleId}-consents`}>
          <h3 className="rv-section__title" id={`${titleId}-consents`}><Icon name="shield" />{viewing ? `Permissions given with revision ${viewing.revision}` : 'Permissions given'}</h3>
          {consents.length ? (
            <ul className="fr-consents">
              {consents.map((record) => (
                <li key={record.fieldId} className="fr-consent">
                  <span className="fr-consent__line">
                    <span className={`iwf-state ${record.granted ? 'is-yes' : 'is-no'}`}>{record.granted ? 'Granted' : 'Not granted'}</span>
                    <strong>{purposeLabel(record.purpose)}</strong>
                  </span>
                  <span className="fr-consent__caption">Wording the contributor saw</span>
                  <Multiline text={record.statement} className="fr-consent__wording" />
                </li>
              ))}
            </ul>
          ) : <p className="ts-hint">This form asks for no permissions.</p>}
          <p className="ts-hint">Approval grants none of these. Each was given, or not, by the contributor.</p>
        </section>

        <section className="rv-section" aria-labelledby={`${titleId}-history`}>
          <h3 className="rv-section__title" id={`${titleId}-history`}><Icon name="clock" />History</h3>
          {history.length ? (
            <ol className="fm-timeline">
              {history.map((entry: HistoryEvent) => (
                <li key={entry.id} className={`fm-timeline__item fm-timeline__item--${entry.type}`}>
                  <span className="fm-timeline__what">{reviewHistoryLabel(entry.type)}</span>
                  <span className="fm-timeline__meta">
                    {`${entry.actorName || actorRoleLabel(entry.actorRole)} (${actorRoleLabel(entry.actorRole).toLowerCase()}) · `}
                    <time dateTime={entry.at}>{formatDateTime(entry.at)}</time>
                    {entry.revision > 0 ? ` · revision ${entry.revision}` : ''}
                  </span>
                  {entry.feedback ? <Multiline className="fm-timeline__note" text={entry.feedback} /> : null}
                  {entry.checks?.length ? <span className="fm-timeline__note">{`Checks confirmed: ${entry.checks.map((id) => checkLabels.get(id) ?? id).join('; ')}`}</span> : null}
                  {entry.note ? <Multiline className="fm-timeline__note" text={entry.note} /> : null}
                </li>
              ))}
            </ol>
          ) : <p className="ts-hint">No history recorded yet.</p>}
        </section>
      </article>

      <aside className="rv-decide" aria-label="Decision">
        <DecisionPanel
          preview={preview}
          detail={detail}
          stale={Boolean(staleMessage)}
          reloading={loading}
          onReload={reload}
          onStale={(reason) => setStale(reason)}
          onDecided={onDecided}
          onStarted={() => { onStarted(detail.referenceId); reload(); }}
          onDeciding={onDeciding}
        />
      </aside>
    </div>
  );
}

function DecisionPanel({ preview, detail, stale, reloading, onReload, onStale, onDecided, onStarted, onDeciding }: {
  preview: boolean;
  detail: ResponseDetail;
  stale: boolean;
  reloading: boolean;
  onReload(): void;
  onStale(reason: ReviewFailure): void;
  onDecided(result: Decided): void;
  onStarted(): void;
  onDeciding(deciding: boolean): void;
}) {
  const allowed = orderedDecisions(detail.allowedDecisions);
  const review = detail.definition.review;
  const checks = review.checks;
  const destination = DESTINATIONS[detail.definition.destination.type];
  const gaps = consentGaps(detail.definition, detail.grantedPurposes);
  const [decision, setDecision] = useState<ReviewDecision | null>(null);
  const [feedback, setFeedback] = useState('');
  const [ticked, setTicked] = useState<string[]>([]);
  const [attempted, setAttempted] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ReviewFailure | null>(null);
  const [started, setStarted] = useState(false);
  const sending = useRef(false);
  const request = useRef<{ signature: string; requestId: string } | null>(null);
  const guard = useLeaveGuard(feedback.trim().length > 0, busy);
  const ids = `fr-${useId().replace(/[^A-Za-z0-9_-]/g, '')}`;

  // A reloaded response may allow other decisions: drop a choice that is no longer possible, keep the notes and ticks.
  useEffect(() => {
    if (decision && !allowed.includes(decision)) setDecision(null);
    setError(null);
  }, [detail.expectedStatus, detail.expectedRevision]);
  useEffect(() => { onDeciding(Boolean(decision)); }, [decision]);
  useEffect(() => () => onDeciding(false), []);

  const problem = attempted ? decisionBlocker({ decision, allowed, feedback, checks, ticked }) : null;
  const overLimit = feedbackLength(feedback) > FEEDBACK_MAX ? feedbackProblem('approve', feedback) : null;
  const feedbackError = problem?.field === 'feedback' ? problem.message : overLimit;
  const checksError = problem?.field === 'checks' ? problem.message : null;
  const decisionError = problem?.field === 'decision' ? problem.message : null;
  const required = feedbackRequired(decision);
  const writesFeedback = allowed.some((value) => takesFeedback(value));
  const showChecks = checks.length > 0 && allowed.includes('approve');
  const length = feedbackLength(feedback);

  if (!allowed.length) {
    return (
      <section className="ts-panel ts-panel--tint fr-decide-none" aria-labelledby={`${ids}-none`}>
        <h2 className="ts-panel__title" id={`${ids}-none`}>No decision to make</h2>
        <p className="ts-hint">
          <Icon name="lock" />
          {detail.status === 'changes_requested'
            ? ' The contributor is revising this response. It returns to the queue when they submit it again.'
            : detail.status === 'approved' || detail.status === 'rejected'
              ? ' This response has been decided. Its outcome is recorded with it.'
              : ' This form does not use review: its responses are kept as received.'}
        </p>
      </section>
    );
  }

  const focusProblem = (field: 'decision' | 'feedback' | 'checks') => {
    const target = field === 'decision'
      ? document.getElementById(`${ids}-decision-${allowed[0]}`)
      : field === 'checks'
        ? document.getElementById(`${ids}-check-${missingChecks(checks, ticked)[0]?.id ?? ''}`)
        : document.getElementById(`${ids}-feedback`);
    target?.focus();
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (stale || busy) return;
    setAttempted(true);
    setStarted(false);
    const blocker = decisionBlocker({ decision, allowed, feedback, checks, ticked });
    if (blocker) {
      // Wait for the messages to render, then take the reviewer to the first thing to fix.
      window.setTimeout(() => focusProblem(blocker.field), 0);
      return;
    }
    setError(null);
    setConfirming(true);
  };

  const send = async () => {
    if (sending.current || !decision || stale) return;
    sending.current = true;
    setBusy(true);
    setError(null);
    const payload = decisionPayload({
      responseId: detail.id, decision, feedback, checks, ticked,
      expectedStatus: detail.expectedStatus, expectedRevision: detail.expectedRevision,
    });
    // The same decision on the same revision keeps its request id, so a retry cannot be recorded twice.
    request.current = decisionRequestId(request.current, payload, newRequestId);
    try {
      const outcome = await formsReview(preview, { action: 'decide', ...payload, requestId: request.current.requestId });
      request.current = null;
      guard.current = { active: false, busy: false };
      setConfirming(false);
      if (decision === 'start_review') {
        setDecision(null);
        setAttempted(false);
        setStarted(true);
        onStarted();
      } else {
        onDecided({ responseId: detail.id, referenceId: detail.referenceId, decision, outcome });
      }
    } catch (reason) {
      const failure = reviewFailure(reason);
      setConfirming(false);
      setError(failure);
      if (failure.kind === 'stale' || failure.kind === 'decision' || failure.kind === 'conflict') onStale(failure);
    } finally {
      sending.current = false;
      setBusy(false);
    }
  };

  const copy = decision ? DECISION_COPY[decision] : null;
  const sentFeedback = decision && takesFeedback(decision) && feedback.trim() ? feedback : '';
  const tickedLabels = checks.filter((check) => ticked.includes(check.id)).map((check) => check.label);

  return (
    <form className="ts-panel rv-decide__form fr-decide" onSubmit={submit} noValidate aria-labelledby={`${ids}-title`}>
      <div className="ts-panel__heading">
        <h2 className="ts-panel__title" id={`${ids}-title`}>Your decision</h2>
        <p className="ts-panel__desc">The contributor sees your feedback exactly as you write it.</p>
      </div>

      {started ? <Notice tone="success" role="status" title="Review started">Other reviewers can see that this response is under review. Decide when you are ready.</Notice> : null}

      <fieldset className="rv-choices" disabled={busy || stale} aria-describedby={decisionError ? `${ids}-decision-error` : undefined}>
        <legend className="ts-label">Decision</legend>
        {allowed.map((value) => (
          <label key={value} className={`rv-choice rv-choice--${DECISION_COPY[value].tone}`}>
            <input
              type="radio"
              id={`${ids}-decision-${value}`}
              name={`${ids}-decision`}
              value={value}
              checked={decision === value}
              onChange={() => setDecision(value)}
            />
            <span className="rv-choice__icon" aria-hidden="true"><Icon name={DECISION_ICON[value]} /></span>
            <span className="rv-choice__label">{DECISION_COPY[value].label}</span>
          </label>
        ))}
        {decisionError ? <p className="ts-error" id={`${ids}-decision-error`} role="alert"><Icon name="alert" />{decisionError}</p> : null}
      </fieldset>

      {copy ? <Consequence>{copy.consequence}</Consequence> : <p className="ts-hint">Each decision says what it does once you choose it.</p>}

      {decision === 'approve' ? (
        <div className="fr-approve">
          {review.points > 0 ? <p className="fr-points"><Icon name="award" />{`+${review.points} points on approval`}</p> : <p className="ts-hint">This form gives no points.</p>}
          {destination ? <p className="fr-effect"><strong>{destination.label}. </strong>{destination.effect}</p> : null}
          {gaps.length ? (
            <Notice tone="warning" title="It will not be filed">
              <p>{`The contributor did not give the permission this destination needs (${gaps.map(purposeLabel).join(', ')}). The response is still approved, and the points still apply.`}</p>
            </Notice>
          ) : null}
        </div>
      ) : null}

      {showChecks ? (
        <fieldset
          className={`fr-checks${checksError ? ' is-invalid' : ''}`}
          disabled={busy || stale}
          aria-describedby={[`${ids}-checks-hint`, checksError ? `${ids}-checks-error` : ''].filter(Boolean).join(' ')}
        >
          <legend className="ts-label">
            Reviewer checks
            <span className="fr-checks__count">{`${ticked.filter((id) => checks.some((check) => check.id === id)).length} of ${checks.length}`}</span>
          </legend>
          <p className="ts-hint" id={`${ids}-checks-hint`}>Tick each one you have confirmed. Approving needs every check.</p>
          {checks.map((check) => (
            <label key={check.id} className="ts-check ts-check--card">
              <input
                type="checkbox"
                id={`${ids}-check-${check.id}`}
                checked={ticked.includes(check.id)}
                aria-invalid={checksError && !ticked.includes(check.id) ? true : undefined}
                onChange={(event) => {
                  const on = event.target.checked;
                  setTicked((current) => on ? [...current.filter((id) => id !== check.id), check.id] : current.filter((id) => id !== check.id));
                }}
              />
              <span className="ts-check__copy"><strong>{check.label}</strong></span>
            </label>
          ))}
          {checksError ? <p className="ts-error" id={`${ids}-checks-error`} role="alert"><Icon name="alert" />{checksError}</p> : null}
        </fieldset>
      ) : null}

      {writesFeedback ? (
        <div className="ts-field fr-feedback-field">
          <label className="ts-label" htmlFor={`${ids}-feedback`}>
            Feedback to the contributor
            {required ? <span className="ts-required" aria-hidden="true">*</span> : <span className="ts-optional">{decision === 'start_review' ? 'Not sent with Start review' : 'Optional'}</span>}
          </label>
          <textarea
            id={`${ids}-feedback`}
            className="ts-textarea"
            rows={5}
            value={feedback}
            disabled={busy || stale}
            aria-required={required || undefined}
            aria-invalid={feedbackError ? true : undefined}
            aria-describedby={[`${ids}-feedback-hint`, `${ids}-feedback-count`, feedbackError ? `${ids}-feedback-error` : ''].filter(Boolean).join(' ')}
            placeholder={required ? 'Say what to change, or why it cannot be accepted.' : 'A note the contributor sees with the decision.'}
            onChange={(event) => setFeedback(event.target.value)}
          />
          <p className="ts-hint" id={`${ids}-feedback-hint`}>
            {required
              ? `Required for this decision: at least ${FEEDBACK_MIN} characters.`
              : 'Required when you request changes or reject (at least 5 characters).'}
          </p>
          <span className={`ts-counter fr-counter${feedbackError ? ' is-invalid' : ''}`} id={`${ids}-feedback-count`}>
            {required && length < FEEDBACK_MIN ? `${length} of at least ${FEEDBACK_MIN} characters` : `${length} / ${FEEDBACK_MAX} characters`}
          </span>
          {feedbackError ? <p className="ts-error" id={`${ids}-feedback-error`} role="alert"><Icon name="alert" />{feedbackError}</p> : null}
        </div>
      ) : null}

      {error && !['stale', 'decision', 'conflict'].includes(error.kind) ? (
        <Notice
          tone={error.uncertain ? 'warning' : 'danger'}
          role="alert"
          title={error.uncertain ? 'Not confirmed yet' : 'The decision was not recorded'}
          action={error.uncertain ? <Button size="sm" icon="refresh" busy={busy} onClick={() => void send()}>Send again</Button> : undefined}
        >
          <p>{error.message}</p>
        </Notice>
      ) : null}
      {stale ? (
        <div className="fr-stale-hint" role="status">
          <Icon name="lock" />
          <span>This response changed after you opened it. Load the latest version before deciding; your notes stay here.</span>
          <Button size="sm" variant="secondary" icon="refresh" busy={reloading} onClick={onReload}>Load latest version</Button>
        </div>
      ) : null}

      <Button type="submit" variant="primary" size="lg" block busy={busy} disabled={stale}>
        {busy ? 'Recording…' : stale ? 'Load the latest version first' : copy ? `${copy.label}…` : 'Record decision…'}
      </Button>

      {confirming && decision && copy ? (
        <Dialog
          title={`${copy.label}?`}
          lede={`${detail.formTitle} · ${detail.referenceId ?? detail.id} · revision ${detail.revision}`}
          busy={busy}
          onClose={() => { if (!busy) setConfirming(false); }}
          footer={(
            <>
              <Button variant="ghost" disabled={busy} onClick={() => setConfirming(false)}>Cancel</Button>
              <Button variant={decision === 'reject' ? 'danger' : 'primary'} busy={busy} onClick={() => void send()}>
                {busy ? 'Recording…' : copy.confirm}
              </Button>
            </>
          )}
        >
          <div className="fr-confirm">
            <p>{copy.consequence}</p>
            {decision === 'approve' ? (
              <ul className="fr-confirm__list">
                <li>{review.points > 0 ? `+${review.points} points for the contributor, awarded once (Finance limits may lower it).` : 'No points: this form gives none.'}</li>
                {destination ? <li>{destination.effect}</li> : null}
                {gaps.length ? <li>{`Not filed: the contributor did not give ${gaps.map(purposeLabel).join(', ')}.`}</li> : null}
                {tickedLabels.length ? <li>{`Checks confirmed: ${tickedLabels.join('; ')}.`}</li> : null}
              </ul>
            ) : null}
            {sentFeedback ? (
              <div className="fr-confirm__feedback">
                <span className="ts-label">Feedback the contributor will see</span>
                <Multiline text={sentFeedback} />
              </div>
            ) : decision !== 'start_review' ? <p className="ts-hint">No feedback is sent with this decision.</p> : null}
          </div>
        </Dialog>
      ) : null}
    </form>
  );
}
