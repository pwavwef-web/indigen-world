import { CONSENT_PURPOSES } from '@indigen-world/contracts/forms';
import type { FormStatus, Issue, PublishSummary } from '@indigen-world/contracts/forms';
import type { FormsAccess } from '@indigen-world/contracts/forms-api';
import { Button, Dialog, Notice, Skeleton } from '../../ui/primitives';

/* ==========================================================================
   The last look before a version goes live: the server's own summary of
   what contributors will meet and what happens to their answers, and every
   problem that blocks publishing (the server's and the builder's own). Publish
   is offered only when there is no problem and this administrator may publish.
   ========================================================================== */

export type PublishState =
  | { state: 'loading' }
  | { state: 'ready'; summary: PublishSummary; issues: Issue[]; version: number; revision: number }
  | { state: 'error'; message: string };

export function PublishDialog({ value, access, formStatus, busy, error, onPublish, onClose, onShowIssue }: {
  value: PublishState;
  access: FormsAccess | null;
  /** The form's status now: publishing keeps a paused or closed form paused or closed. */
  formStatus?: FormStatus;
  busy: boolean;
  error: string;
  onPublish: () => void;
  onClose: () => void;
  onShowIssue: (issue: Issue) => void;
}) {
  const ready = value.state === 'ready' ? value : null;
  const blocked = Boolean(ready?.issues.length);
  const canPublish = access?.canPublish === true;
  const publishers = access?.publishers ?? [];
  return (
    <Dialog
      title={ready ? `Publish version ${ready.version}?` : 'Publish'}
      lede={ready ? 'Check what contributors will meet. A published version cannot be changed; later edits become a new version.' : undefined}
      size="lg"
      busy={busy}
      onClose={onClose}
      footer={<>
        <Button onClick={onClose} disabled={busy}>{ready && !blocked && canPublish ? 'Cancel' : 'Close'}</Button>
        {ready && !blocked && canPublish ? <Button variant="primary" icon="send" busy={busy} onClick={onPublish}>Publish version {ready.version}</Button> : null}
      </>}
    >
      {value.state === 'loading' ? <Skeleton title lines={6} label="Preparing the publishing summary" /> : null}
      {value.state === 'error' ? <Notice tone="danger" role="alert">{value.message}</Notice> : null}
      {ready ? (
        <div className="afm-stack">
          {blocked ? (
            <Notice tone="danger" title={ready.issues.length === 1 ? '1 problem blocks publishing' : `${ready.issues.length} problems block publishing`} role="alert">
              <ul className="afm-issue-lines">
                {ready.issues.map((issue, index) => (
                  <li key={index}><button type="button" className="afm-linkbutton ts-link" onClick={() => onShowIssue(issue)}>{issue.message}</button></li>
                ))}
              </ul>
            </Notice>
          ) : null}
          {formStatus === 'paused' || formStatus === 'closed' ? (
            <Notice tone="info" title={`The form stays ${formStatus}`}>
              Version {ready.version} becomes the version contributors meet, but publishing does not {formStatus === 'paused' ? 'resume' : 'reopen'} the form: nobody can submit until you {formStatus === 'paused' ? 'resume' : 'reopen'} it from its status.
            </Notice>
          ) : null}
          {!canPublish ? (
            <Notice tone="warning" title="You cannot publish this form">
              {publishers.length
                ? <>Only these administrators may publish forms: {publishers.map((person) => person.name).join(', ')}. Ask one of them to publish it. The owner super administrator manages this list in Forms settings.</>
                : 'Your account is not allowed to publish forms. Ask an administrator who can.'}
            </Notice>
          ) : null}
          <SummaryView summary={ready.summary} />
          {error ? <Notice tone="danger" role="alert">{error}</Notice> : null}
        </div>
      ) : null}
    </Dialog>
  );
}

function SummaryView({ summary }: { summary: PublishSummary }) {
  return (
    <div className="afm-summary">
      <h3 className="afm-h3">{summary.title || 'Untitled form'}</h3>
      <dl className="afm-summary__stats">
        <div><dt>Sections</dt><dd>{summary.sections}</dd></div>
        <div><dt>Questions</dt><dd>{summary.questions}</dd></div>
        <div><dt>Required</dt><dd>{summary.requiredQuestions}</dd></div>
        <div><dt>With rules</dt><dd>{summary.conditionalQuestions}</dd></div>
        <div><dt>Uploads</dt><dd>{summary.uploads}</dd></div>
      </dl>
      <dl className="afm-summary__facts">
        <div><dt>Audience</dt><dd>{summary.audience}</dd></div>
        <div><dt>Schedule</dt><dd>{summary.schedule}</dd></div>
        <div><dt>Submission</dt><dd>{summary.submission}</dd></div>
        <div><dt>Review</dt><dd>{summary.review}</dd></div>
        <div><dt>Destination</dt><dd>{summary.destination}</dd></div>
      </dl>
      <section className="afm-stack-sm" aria-label="Consents">
        <h4 className="afm-h4">Consents asked</h4>
        {summary.consents.length ? (
          <ul className="afm-summary__consents">
            {summary.consents.map((consent, index) => (
              <li key={index}>
                <strong>{CONSENT_PURPOSES[consent.purpose]?.label ?? consent.purpose}</strong>
                <blockquote className="ts-quote">{consent.statement}</blockquote>
              </li>
            ))}
          </ul>
        ) : <p className="ts-hint">This form asks for no consent.</p>}
      </section>
      {summary.validation.length ? (
        <section className="afm-stack-sm" aria-label="Answer rules">
          <h4 className="afm-h4">Answer rules</h4>
          <ul className="afm-summary__rules">{summary.validation.map((line, index) => <li key={index}>{line}</li>)}</ul>
        </section>
      ) : null}
    </div>
  );
}
