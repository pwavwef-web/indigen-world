import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Counter,
  Field,
  Icon,
  LetterPalette,
  Notice,
  PageHeader,
  Panel,
  describedBy,
  insertAtCaret,
} from '../components';
import { friendlyError } from '../model';
import {
  EVERYDAY_STATEMENT,
  EXPRESSION_DIALECTS,
  EXPRESSION_KINDS,
  EXPRESSION_SOURCES,
  MAX_PHRASE_LENGTH,
  emptyExpressionDraft,
  looksLikeSingleWord,
  missingPiece,
  type ExpressionDraft,
} from '../../creator/expressions-data';
import { PortalLink, useWorkspace } from '../workspace';
import { FlowBar, SentPanel, Steps, focusFirstError, useBrowserDraft, useRequestId } from './flow';

const STEPS = [
  { id: 'expression', label: 'The expression' },
  { id: 'meaning', label: 'Meaning and use' },
  { id: 'source', label: 'Source and permission' },
  { id: 'review', label: 'Check and send' },
];

const FIELDS_BY_STEP: string[][] = [
  ['expr-phrase', 'expr-kind'],
  ['expr-meaning', 'expr-context', 'expr-dialect'],
  ['expr-source', 'expr-source-detail', 'expr-consent', 'expr-everyday', 'expr-publish'],
  [],
];

function errorsFor(step: number, draft: ExpressionDraft): Record<string, string> {
  const errors: Record<string, string> = {};
  if (step === 0) {
    if (!draft.phrase.trim()) errors['expr-phrase'] = 'Write the expression in Kasem.';
    else if (draft.phrase.trim().length > MAX_PHRASE_LENGTH) errors['expr-phrase'] = `Keep the expression under ${MAX_PHRASE_LENGTH} characters.`;
  }
  if (step === 1) {
    if (!draft.meaning.trim()) errors['expr-meaning'] = 'Say what the expression means in English.';
    else if (draft.meaning.trim().toLocaleLowerCase() === draft.phrase.trim().toLocaleLowerCase()) errors['expr-meaning'] = 'This is the same as the Kasem. Write what it means in English.';
    if (!draft.context.trim()) errors['expr-context'] = 'Say when someone would use it — reviewers need this to check the meaning.';
    if (!draft.dialect) errors['expr-dialect'] = 'Choose a dialect, or “Not sure”.';
  }
  if (step === 2) {
    if (!draft.sourceType) errors['expr-source'] = 'Choose where you learned it.';
    if (!draft.sourceDetail.trim()) errors['expr-source-detail'] = 'Say where you heard or learned it, in a few words.';
    if (!draft.speakerConsent) errors['expr-consent'] = 'Confirm the sharing statement to send it.';
    if (!draft.everydayConfirmed) errors['expr-everyday'] = 'Confirm that it is an everyday expression.';
    if (!draft.publish) errors['expr-publish'] = 'Choose whether it may be published after review.';
  }
  return errors;
}

/**
 * Share an everyday expression: the open path for contributions nobody
 * assigned. It goes through `submitExpression`, is reviewed on the same desk
 * as every other contribution, and — if approved and cleared for it — is
 * published to Expressions, never as a dictionary word.
 */
export function ExpressionFlow({ correct }: { correct: string }) {
  const data = useWorkspace();
  const declined = useMemo(() => data.receipts.find((receipt) => receipt.id === correct && receipt.kind === 'expression'), [correct, data.receipts]);
  const correctable = Boolean(declined && declined.status === 'rejected' && !declined.correctedBy);
  const draftKey = `tribestudio:expression-draft:${data.uid}`;
  const { value: draft, setValue: setDraft, status, clear } = useBrowserDraft<ExpressionDraft>(
    correct ? `${draftKey}:correct:${correct}` : draftKey,
    () => (declined && correctable ? fromDeclined(declined) : emptyExpressionDraft()),
    (value) => !value.phrase.trim() && !value.meaning.trim() && !value.context.trim(),
  );
  const [requestId, renewRequest] = useRequestId(`contributor-request:${data.uid}:expression:${correct || 'new'}`);
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [attempted, setAttempted] = useState<Record<number, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [sendError, setSendError] = useState('');
  const [sent, setSent] = useState<string | null>(null);
  const sending = useRef(false);
  const lastField = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

  const update = (patch: Partial<ExpressionDraft>) => {
    setDraft((current) => ({ ...current, ...patch, revisionOf: correctable ? correct : '' }));
  };
  // After a first attempt to move on, errors follow the fields as they change.
  useEffect(() => {
    if (attempted[step]) setErrors(errorsFor(step, draft));
  }, [attempted, draft, step]);
  // A correction opened before the declined expression loaded is filled in once it arrives.
  const prefilled = useRef(false);
  useEffect(() => {
    if (prefilled.current || !declined || !correctable) return;
    prefilled.current = true;
    if (!draft.phrase.trim() && !draft.meaning.trim()) setDraft(fromDeclined(declined));
  }, [correctable, declined, draft.meaning, draft.phrase, setDraft]);

  const goTo = (target: number) => {
    if (target > step) {
      const found = errorsFor(step, draft);
      setAttempted((current) => ({ ...current, [step]: true }));
      setErrors(found);
      if (Object.keys(found).length) { focusFirstError(FIELDS_BY_STEP[step], found); return; }
    }
    setErrors({});
    setStep(target);
    window.requestAnimationFrame(() => document.getElementById('flow-step-title')?.focus());
  };

  const send = async () => {
    if (sending.current || busy) return;
    const missing = missingPiece(draft);
    if (missing) { setSendError(missing); return; }
    sending.current = true;
    setBusy(true);
    setSendError('');
    try {
      const result = await data.services.submitExpression({ ...draft, revisionOf: correctable ? correct : '' }, requestId);
      setSent(result.contributionId);
      clear();
      renewRequest();
    } catch (reason) {
      setSendError(friendlyError(reason, 'Sending your expression').message);
    } finally {
      sending.current = false;
      setBusy(false);
    }
  };

  const insert = (letter: string) => {
    const field = lastField.current ?? document.getElementById('expr-phrase') as HTMLInputElement | null;
    if (!field) return;
    const { value, caret } = insertAtCaret(field, letter);
    update(field.id === 'expr-literal' ? { literalTranslation: value } : { phrase: value });
    window.requestAnimationFrame(() => { field.focus(); field.setSelectionRange(caret, caret); });
  };

  const breadcrumb = <><PortalLink to={data.paths.section('contribute')}>Start a contribution</PortalLink><span aria-hidden="true">/</span><span aria-current="page">Everyday expression</span></>;

  if (sent) {
    return (
      <div className="cw-page">
        <PageHeader breadcrumb={breadcrumb} title="Everyday expression" />
        <SentPanel
          title="Sent for review"
          actions={<>
            <PortalLink to={data.paths.section('contributions', { view: `expression.${sent}` })} className="cw-btn cw-btn--primary">Follow it in My submissions</PortalLink>
            <PortalLink to={data.paths.section('contribute', { type: 'expression' })} className="cw-btn" >Share another expression</PortalLink>
          </>}
        >
          <p>“<span lang="xsm">{draft.phrase || 'Your expression'}</span>” is with the review team. Only you and the reviewers can see it until it is approved.</p>
          <ol className="cw-next-steps">
            <li>A Kasem-speaking reviewer checks the spelling, the meaning and when it is said.</li>
            <li>They approve it, or explain why not — you can then correct it once and send it again.</li>
            <li>{draft.publish === 'yes' ? 'If approved, it is published as an expression credited to you. Publication is a separate step after approval.' : 'If approved, it is kept for review and research only, as you chose.'}</li>
          </ol>
        </SentPanel>
      </div>
    );
  }

  const fieldError = (id: string) => errors[id];
  const source = EXPRESSION_SOURCES.find((entry) => entry.id === draft.sourceType);

  return (
    <div className="cw-page cw-flow">
      <PageHeader
        breadcrumb={breadcrumb}
        title={correctable ? 'Correct an expression' : 'Share an everyday expression'}
        description="A greeting, blessing, idiom or saying you know well. Reviewers check every expression before anything is published."
      />
      {correct && !correctable ? (
        <Notice tone="warning" title="This expression cannot be corrected">
          <p>Only an expression that was not accepted can be corrected, and only once. You can still share it as a new expression below.</p>
        </Notice>
      ) : null}
      {correctable && declined ? (
        <Notice tone="warning" title="You are correcting an expression that was not accepted">
          {declined.reviewFeedback ? <p>The reviewer said: “{declined.reviewFeedback}”</p> : null}
          <p>Confirm the permissions again before sending. The earlier version and its decision stay on record.</p>
        </Notice>
      ) : null}

      <div className="cw-flow__layout">
        <div className="cw-flow__main">
          <Steps steps={STEPS} current={step} onSelect={goTo} />
          <form className="cw-panel cw-flow__form" noValidate onSubmit={(event) => { event.preventDefault(); if (step < 3) goTo(step + 1); else void send(); }}>
            <div className="cw-flow__head">
              <p className="cw-small cw-muted">Step {step + 1} of {STEPS.length}</p>
              <h2 id="flow-step-title" tabIndex={-1}>{STEPS[step].label}</h2>
            </div>

            {step === 0 ? (
              <div className="cw-form">
                <Field
                  id="expr-phrase"
                  label="The expression in Kasem"
                  required
                  error={fieldError('expr-phrase')}
                  hint="Write it the way people say it, with the Kasem letters."
                  example={<><strong>For example:</strong> a morning greeting you use with your family, or a blessing said at a naming ceremony.</>}
                  counter={<Counter value={draft.phrase} max={MAX_PHRASE_LENGTH} />}
                >
                  <textarea
                    id="expr-phrase"
                    lang="xsm"
                    rows={2}
                    maxLength={MAX_PHRASE_LENGTH + 50}
                    value={draft.phrase}
                    aria-invalid={Boolean(fieldError('expr-phrase'))}
                    aria-describedby={describedBy('expr-phrase', { error: fieldError('expr-phrase'), hint: true, example: true })}
                    onFocus={(event) => { lastField.current = event.currentTarget; }}
                    onChange={(event) => update({ phrase: event.target.value })}
                  />
                </Field>
                <LetterPalette onInsert={insert} />
                {looksLikeSingleWord(draft.phrase) ? (
                  <Notice tone="neutral" title="Is this a single word?">
                    <p>A word on its own is best added as a <PortalLink to={data.paths.section('contribute', { type: 'word' })}>dictionary word</PortalLink>, where it gets a full entry. A one-word greeting is fine here.</p>
                  </Notice>
                ) : null}
                <fieldset className="cw-field" id="expr-kind" tabIndex={-1}>
                  <legend className="cw-field-label">What kind of expression is it? <span className="cw-field__tag">Required</span></legend>
                  <div className="cw-choices cw-choices--3">
                    {EXPRESSION_KINDS.map((kind) => (
                      <label key={kind.id} className="cw-choice-card">
                        <input type="radio" name="expr-kind" checked={draft.kind === kind.id} onChange={() => update({ kind: kind.id })} />
                        <span><strong>{kind.label}</strong><span>{kind.hint}</span></span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              </div>
            ) : null}

            {step === 1 ? (
              <div className="cw-form">
                <Field
                  id="expr-meaning"
                  label="What does it mean in English?"
                  required
                  error={fieldError('expr-meaning')}
                  hint="The meaning a listener takes from it, not a word-for-word gloss."
                  example={<><strong>For example:</strong> “Welcome back — said to someone returning from a journey.”</>}
                >
                  <textarea id="expr-meaning" rows={2} maxLength={600} value={draft.meaning} aria-invalid={Boolean(fieldError('expr-meaning'))} aria-describedby={describedBy('expr-meaning', { error: fieldError('expr-meaning'), hint: true, example: true })} onChange={(event) => update({ meaning: event.target.value })} />
                </Field>
                {draft.kind !== 'phrase' ? (
                  <Field id="expr-literal" label="What do the words say, literally?" optional hint="Useful for idioms and proverbs, where the words and the meaning differ.">
                    <input id="expr-literal" maxLength={600} value={draft.literalTranslation} aria-describedby="expr-literal-hint" onFocus={(event) => { lastField.current = event.currentTarget; }} onChange={(event) => update({ literalTranslation: event.target.value })} />
                  </Field>
                ) : null}
                <Field
                  id="expr-context"
                  label="When would someone say this?"
                  required
                  error={fieldError('expr-context')}
                  hint="Who says it, to whom, and on what occasion. Formal or casual?"
                  example={<><strong>For example:</strong> “Said to an elder when you arrive at their home in the morning.”</>}
                >
                  <textarea id="expr-context" rows={3} maxLength={1000} value={draft.context} aria-invalid={Boolean(fieldError('expr-context'))} aria-describedby={describedBy('expr-context', { error: fieldError('expr-context'), hint: true, example: true })} onChange={(event) => update({ context: event.target.value })} />
                </Field>
                <Field id="expr-dialect" label="Which dialect is it from?" required error={fieldError('expr-dialect')} hint="“Not sure” is a valid answer.">
                  <select id="expr-dialect" value={draft.dialect} aria-invalid={Boolean(fieldError('expr-dialect'))} aria-describedby={describedBy('expr-dialect', { error: fieldError('expr-dialect'), hint: true })} onChange={(event) => update({ dialect: event.target.value })}>
                    <option value="">Choose a dialect</option>
                    {EXPRESSION_DIALECTS.map((dialect) => <option key={dialect} value={dialect}>{dialect}</option>)}
                  </select>
                </Field>
              </div>
            ) : null}

            {step === 2 ? (
              <div className="cw-form">
                <fieldset className="cw-field" id="expr-source" tabIndex={-1} aria-describedby={fieldError('expr-source') ? 'expr-source-error' : undefined}>
                  <legend className="cw-field-label">Where did you learn it? <span className="cw-field__tag">Required</span></legend>
                  <div className="cw-choices cw-choices--3">
                    {EXPRESSION_SOURCES.map((entry) => (
                      <label key={entry.id} className="cw-choice-card">
                        <input type="radio" name="expr-source" checked={draft.sourceType === entry.id} onChange={() => { update({ sourceType: entry.id, speakerConsent: false }); }} />
                        <span><strong>{entry.label}</strong></span>
                      </label>
                    ))}
                  </div>
                  {fieldError('expr-source') ? <p className="cw-field__error" id="expr-source-error"><Icon name="alert" />{fieldError('expr-source')}</p> : null}
                </fieldset>
                <Field
                  id="expr-source-detail"
                  label="Tell us a little more"
                  required
                  error={fieldError('expr-source-detail')}
                  hint="Where you heard it, or which book or broadcast it came from."
                  example={<><strong>For example:</strong> “My grandmother in Navrongo says it every morning.”</>}
                >
                  <input id="expr-source-detail" maxLength={600} value={draft.sourceDetail} aria-invalid={Boolean(fieldError('expr-source-detail'))} aria-describedby={describedBy('expr-source-detail', { error: fieldError('expr-source-detail'), hint: true, example: true })} onChange={(event) => update({ sourceDetail: event.target.value })} />
                </Field>
                {draft.sourceType && draft.sourceType !== 'self' && draft.sourceType !== 'written' && draft.sourceType !== 'recording' ? (
                  <Field id="expr-speaker" label="Their name, if they want to be credited" optional hint="Leave this empty to keep them anonymous.">
                    <input id="expr-speaker" maxLength={120} value={draft.speakerName} aria-describedby="expr-speaker-hint" onChange={(event) => update({ speakerName: event.target.value })} />
                  </Field>
                ) : null}
                <fieldset className="cw-field cw-consent">
                  <legend className="cw-field-label">Permission <span className="cw-field__tag">Required</span></legend>
                  <label className="cw-check" id="expr-consent" tabIndex={-1}>
                    <input type="checkbox" checked={draft.speakerConsent} disabled={!source} aria-invalid={Boolean(fieldError('expr-consent'))} onChange={(event) => update({ speakerConsent: event.target.checked })} />
                    <span><strong>{source?.consent ?? 'Choose where you learned it first.'}</strong></span>
                  </label>
                  {fieldError('expr-consent') ? <p className="cw-field__error"><Icon name="alert" />{fieldError('expr-consent')}</p> : null}
                  <label className="cw-check" id="expr-everyday" tabIndex={-1}>
                    <input type="checkbox" checked={draft.everydayConfirmed} aria-invalid={Boolean(fieldError('expr-everyday'))} onChange={(event) => update({ everydayConfirmed: event.target.checked })} />
                    <span><strong>{EVERYDAY_STATEMENT}</strong></span>
                  </label>
                  {fieldError('expr-everyday') ? <p className="cw-field__error"><Icon name="alert" />{fieldError('expr-everyday')}</p> : null}
                </fieldset>
                <fieldset className="cw-field" id="expr-publish" tabIndex={-1}>
                  <legend className="cw-field-label">After review <span className="cw-field__tag">Required</span></legend>
                  <div className="cw-choices cw-choices--2">
                    <label className="cw-choice-card">
                      <input type="radio" name="expr-publish" checked={draft.publish === 'yes'} onChange={() => update({ publish: 'yes' })} />
                      <span><strong>Publish it after review</strong><span>If approved, it can appear in Expressions, credited to you.</span></span>
                    </label>
                    <label className="cw-choice-card">
                      <input type="radio" name="expr-publish" checked={draft.publish === 'no'} onChange={() => update({ publish: 'no' })} />
                      <span><strong>Keep it for review only</strong><span>Reviewers and researchers can use it; it is never published.</span></span>
                    </label>
                  </div>
                  {fieldError('expr-publish') ? <p className="cw-field__error"><Icon name="alert" />{fieldError('expr-publish')}</p> : null}
                </fieldset>
                <label className="cw-check">
                  <input type="checkbox" checked={draft.aiTraining} onChange={(event) => update({ aiTraining: event.target.checked })} />
                  <span><strong>Allow it to be used for Kawuri AI training <span className="cw-field__tag">Optional</span></strong><span>Only if it is approved. Leaving this unticked changes nothing else.</span></span>
                </label>
              </div>
            ) : null}

            {step === 3 ? (
              <div className="cw-form">
                <p className="cw-muted">Check what you are sending. You can go back to any step to change it.</p>
                <dl className="cw-review-list">
                  <div><dt>Expression</dt><dd lang="xsm">{draft.phrase}</dd></div>
                  <div><dt>Kind</dt><dd>{EXPRESSION_KINDS.find((kind) => kind.id === draft.kind)?.label}</dd></div>
                  <div><dt>Meaning</dt><dd>{draft.meaning}</dd></div>
                  {draft.literalTranslation ? <div><dt>Literally</dt><dd>{draft.literalTranslation}</dd></div> : null}
                  <div><dt>When it is said</dt><dd>{draft.context}</dd></div>
                  <div><dt>Dialect</dt><dd>{draft.dialect}</dd></div>
                  <div><dt>Source</dt><dd>{[source?.label, draft.sourceDetail, draft.speakerName ? `Credit: ${draft.speakerName}` : ''].filter(Boolean).join(' · ')}</dd></div>
                  <div><dt>After review</dt><dd>{draft.publish === 'yes' ? 'Publish it' : 'Keep it for review only'}</dd></div>
                  <div><dt>AI training</dt><dd>{draft.aiTraining ? 'Allowed if approved' : 'Not allowed'}</dd></div>
                </dl>
                {sendError ? (
                  <div role="alert" className="cw-inline-alert">
                    <p><strong>It was not sent.</strong> {sendError}</p>
                    <p>Everything you wrote is still here and saved in this browser. Trying again is safe: if the first attempt did reach us, it will not be filed twice.</p>
                  </div>
                ) : null}
              </div>
            ) : null}

            <FlowBar status={status}>
              {step > 0 ? <button type="button" className="cw-btn--ghost" disabled={busy} onClick={() => goTo(step - 1)}><Icon name="back" className="cw-icon--sm" />Back</button> : null}
              {step < 3
                ? <button type="submit" className="button--primary">Continue<Icon name="arrow" className="cw-icon--sm" /></button>
                : <button type="submit" className="button--primary" disabled={busy} aria-busy={busy}>{busy ? 'Sending…' : sendError ? 'Try sending again' : 'Send for review'}</button>}
            </FlowBar>
          </form>
        </div>

        <aside className="cw-flow__aside" aria-label="About everyday expressions">
          <Panel title="What happens after you send it">
            <ol className="cw-next-steps">
              <li>A Kasem-speaking reviewer checks the spelling, the meaning and the context.</li>
              <li>They approve it, or explain why not. You can correct a declined expression once.</li>
              <li>Approved expressions you allow to be published appear in Expressions, credited to you. They are never filed as dictionary words.</li>
            </ol>
          </Panel>
          <Panel title="Good to know">
            <ul className="cw-plain-list cw-small">
              <li>Your draft is kept in this browser until you send it.</li>
              <li>Nothing sacred, secret or restricted — this form is for everyday expressions.</li>
              <li><PortalLink to={data.paths.section('guide', { section: 'contribution-types' })}>How each kind of contribution is used</PortalLink></li>
            </ul>
          </Panel>
        </aside>
      </div>
    </div>
  );
}

function fromDeclined(receipt: { phrase: string; meaning: string; context: string; literalTranslation: string; expressionKind: string; dialect: string; sourceType: string; sourceDetail: string; speakerName: string; id: string }): ExpressionDraft {
  return {
    ...emptyExpressionDraft(),
    phrase: receipt.phrase,
    kind: (['phrase', 'idiom', 'proverb'].includes(receipt.expressionKind) ? receipt.expressionKind : 'phrase') as ExpressionDraft['kind'],
    meaning: receipt.meaning,
    literalTranslation: receipt.literalTranslation,
    context: receipt.context,
    dialect: EXPRESSION_DIALECTS.includes(receipt.dialect) ? receipt.dialect : '',
    sourceType: (['self', 'family', 'elder', 'community', 'written', 'recording'].includes(receipt.sourceType) ? receipt.sourceType : '') as ExpressionDraft['sourceType'],
    sourceDetail: receipt.sourceDetail,
    speakerName: receipt.speakerName,
    revisionOf: receipt.id,
  };
}
