import { useEffect, useId, useState } from 'react';
import type { ResponseDetail } from '@indigen-world/contracts/forms-api';
import { FormResponseView } from '@indigen-world/console-ui';
import { ButtonLink, Icon, KeyValue, LoadFailure, Notice, Skeleton } from '../../ui';
import { PageHeader } from '../components';
import { formatDateTime } from '../model';
import { useWorkspace } from '../workspace';
import { FORMS_CHANGED, formsCall, formsFailure, openFormAttachment, type FormsFailure } from './forms-data';
import { actorLabel, historyLabel, statusMeaning } from './forms-model';
import { FormsCrumbs, FormsUnavailable, Multiline, ReferenceId, StatusBadge } from './parts';

/*
 * One of the contributor's own form responses:
 * /contributor/forms/submissions/{responseId}. Status in plain words, the
 * latest feedback, the answers exactly as submitted (earlier revisions can be
 * compared), and the history with role names only.
 */
export function FormSubmissionPage({ responseId }: { responseId: string }) {
  const data = useWorkspace();
  const [detail, setDetail] = useState<ResponseDetail | null>(null);
  const [failure, setFailure] = useState<FormsFailure | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [shown, setShown] = useState<number | null>(null);
  const [openError, setOpenError] = useState('');
  const revisionSelect = useId();

  useEffect(() => {
    let active = true;
    setFailure(null);
    formsCall(data.preview, { action: 'getMine', responseId })
      .then((next) => { if (active) setDetail(next); })
      .catch((error) => { if (active) setFailure(formsFailure(error, 'This response')); });
    return () => { active = false; };
  }, [data.preview, responseId, attempt]);
  useEffect(() => {
    const changed = () => setAttempt((count) => count + 1);
    window.addEventListener(FORMS_CHANGED, changed);
    return () => window.removeEventListener(FORMS_CHANGED, changed);
  }, []);

  if (failure?.code === 'not-found') return <FormsUnavailable kind="missing" message="This response does not exist, or it belongs to another account." />;
  if (failure?.code === 'permission-denied') return <FormsUnavailable kind="denied" />;
  if (failure && !detail) {
    return (
      <div className="ts-page fm-page">
        <PageHeader breadcrumb={<FormsCrumbs current="Response" mine />} title="This response could not be opened" />
        <LoadFailure title="The response did not load" body={failure.message} onRetry={() => setAttempt((count) => count + 1)} />
      </div>
    );
  }
  if (!detail) return <div className="ts-page fm-page"><Skeleton title lines={8} label="Opening your response" /></div>;

  const revisions = [...detail.revisions].sort((a, b) => b.revision - a.revision);
  const latest = revisions[0]?.revision ?? null;
  const selected = shown !== null ? revisions.find((entry) => entry.revision === shown) ?? null : null;
  const viewing = selected ?? (revisions.length && detail.status !== 'draft' ? revisions[0] : null);
  const previous = viewing ? revisions.find((entry) => entry.revision === viewing.revision - 1) ?? null : null;
  const answers = viewing ? viewing.answers : detail.answers;
  const consents = viewing ? viewing.consents : detail.consents;
  const editable = detail.status === 'draft' || detail.status === 'changes_requested';
  const history = [...detail.history].sort((a, b) => b.at.localeCompare(a.at));
  const title = detail.referenceId ?? 'Draft';
  // The revision the latest feedback was given on, to say when a newer one has been sent since.
  const feedbackRevision = history.find((entry) => entry.type === 'changes_requested' || entry.type === 'rejected')?.revision ?? null;
  const answeredSince = feedbackRevision !== null && detail.revision > feedbackRevision;

  return (
    <div className="ts-page fm-page fm-detail">
      <PageHeader
        breadcrumb={<FormsCrumbs current={title} mine />}
        kicker="Form response"
        title={detail.formTitle}
        meta={<span className="fm-meta"><StatusBadge status={detail.status} />{detail.referenceId ? <code className="fm-row__ref">{detail.referenceId}</code> : null}</span>}
      />

      <div className="ts-split">
        <div className="ts-stack ts-stack--md">
          <section className="ts-panel fm-status" aria-labelledby="fm-status-title">
            <h2 className="fm-status__title" id="fm-status-title">Status</h2>
            <p className="fm-status__line"><StatusBadge status={detail.status} /><span>{statusMeaning(detail.status, detail.definition.review.required)}</span></p>
            {editable ? (
              <div className="ts-cluster">
                <ButtonLink variant="primary" iconRight="arrow" to={data.paths.form(detail.formId, { response: detail.id })}>
                  {detail.status === 'changes_requested' ? 'Revise and resubmit' : 'Continue draft'}
                </ButtonLink>
              </div>
            ) : null}
          </section>

          {detail.reward.status === 'awarded' && detail.reward.points > 0 ? (
            <Notice tone="success" icon="award" title={`${detail.reward.points} points were added to your balance`} action={<ButtonLink size="sm" to={data.paths.section('rewards')}>Points & rewards</ButtonLink>}>
              Awarded once, when this response was approved.
            </Notice>
          ) : null}

          {detail.feedback ? (
            <section className="fm-feedback" aria-labelledby="fm-detail-feedback">
              <h2 className="fm-feedback__title" id="fm-detail-feedback"><Icon name="message" />{answeredSince ? 'Earlier feedback from the reviewer' : 'Feedback from the reviewer'}</h2>
              <Multiline text={detail.feedback} />
              {answeredSince ? <p className="ts-hint">{`Given on revision ${feedbackRevision}. You have sent revision ${detail.revision} since.`}</p> : null}
            </section>
          ) : null}

          <section className="ts-panel fm-answers" aria-labelledby="fm-answers-title">
            <div className="fm-answers__head">
              <h2 className="fm-answers__title" id="fm-answers-title">{viewing ? `Your answers · revision ${viewing.revision}` : 'Your answers (not sent yet)'}</h2>
              {revisions.length > 1 ? (
                <label className="fm-revision" htmlFor={revisionSelect}>
                  <span className="ts-label">Show revision</span>
                  <select
                    id={revisionSelect}
                    className="ts-select ts-select--sm"
                    value={String(viewing?.revision ?? latest ?? '')}
                    onChange={(event) => setShown(Number(event.target.value))}
                  >
                    {revisions.map((entry) => (
                      <option key={entry.revision} value={entry.revision}>
                        {`Revision ${entry.revision}${entry.revision === latest ? ' (latest)' : ''} · ${formatDateTime(entry.submittedAt)}`}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
            </div>
            {viewing && previous ? <p className="ts-hint">Answers marked “Changed” differ from revision {previous.revision}.</p> : null}
            {openError ? <Notice tone="danger" role="alert">{openError}</Notice> : null}
            <FormResponseView
              definition={detail.definition}
              answers={answers}
              consents={consents}
              compareWith={previous ? previous.answers : null}
              headingLevel={3}
              onOpenAttachment={(attachment) => {
                setOpenError('');
                openFormAttachment(data.preview, detail.id, attachment.id).catch((error: unknown) => setOpenError(error instanceof Error ? error.message : 'The file could not be opened.'));
              }}
            />
          </section>
        </div>

        <aside className="ts-stack ts-stack--md" aria-label="Response details">
          <section className="ts-panel ts-panel--tight" aria-labelledby="fm-facts-title">
            <h2 className="fm-aside__title" id="fm-facts-title">Details</h2>
            {detail.referenceId ? <ReferenceId value={detail.referenceId} /> : <p className="ts-hint">A reference ID is given when you first submit.</p>}
            <KeyValue
              stacked
              items={[
                { label: 'Form version', value: `Version ${detail.formVersion}` },
                { label: 'Revisions submitted', value: String(detail.revision), hidden: detail.revision === 0 },
                { label: 'Last submitted', value: formatDateTime(detail.submittedAt), hidden: !detail.submittedAt },
                { label: 'Last updated', value: formatDateTime(detail.updatedAt) },
                { label: 'Decided', value: formatDateTime(detail.decidedAt), hidden: !detail.decidedAt },
                { label: 'Files', value: String(detail.attachments.length), hidden: !detail.attachments.length },
              ]}
            />
          </section>

          <section className="ts-panel ts-panel--tight" aria-labelledby="fm-history-title">
            <h2 className="fm-aside__title" id="fm-history-title">History</h2>
            {history.length ? (
              <ol className="fm-timeline">
                {history.map((entry) => (
                  <li key={entry.id} className={`fm-timeline__item fm-timeline__item--${entry.type}`}>
                    <span className="fm-timeline__what">{historyLabel(entry.type)}</span>
                    <span className="fm-timeline__meta">
                      {`${actorLabel(entry.actorRole)} · `}<time dateTime={entry.at}>{formatDateTime(entry.at)}</time>
                      {entry.revision > 0 ? ` · revision ${entry.revision}` : ''}
                    </span>
                    {entry.feedback ? <Multiline className="fm-timeline__note" text={entry.feedback} /> : null}
                    {!entry.feedback && entry.note ? <Multiline className="fm-timeline__note" text={entry.note} /> : null}
                  </li>
                ))}
              </ol>
            ) : <p className="ts-hint">Nothing has happened to this response yet.</p>}
          </section>
        </aside>
      </div>
    </div>
  );
}
