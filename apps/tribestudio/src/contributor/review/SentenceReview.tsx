import { useEffect, useRef, useState } from 'react';
import {
  Badge,
  ConfirmDialog,
  Counter,
  Facts,
  Icon,
  Notice,
  Panel,
  SelectField,
  cx,
} from '../components';
import {
  DIMENSIONS,
  SENTENCE_DIMENSIONS,
  SENTENCE_OUTCOMES,
  emptySentenceJudgment,
  sentenceConcern,
  sentenceReviewProblems,
  type ReviewRecord,
  type SentenceJudgment,
} from './model';
import { useReview } from './ReviewDesk';

/**
 * Sentence review. Each version of a sentence is judged on its own, on four
 * separate questions, and the reviewer confirms they can judge the dialect.
 * Nothing here approves a sentence: it is confirmed only when enough
 * independent reviewers agree (decideGrammarNote records the judgment and
 * works out the status), and disagreement is kept rather than averaged away.
 */
export function SentenceReview({ item, onSaved }: { item: ReviewRecord; onSaved: (message: string) => void }) {
  const review = useReview();
  const examples: Record<string, any>[] = Array.isArray(item.examples) ? item.examples : [];
  const [judgments, setJudgments] = useState<SentenceJudgment[]>(() => examples.map(() => emptySentenceJudgment()));
  const [competent, setCompetent] = useState(false);
  const [preference, setPreference] = useState('cannot-judge');
  const [attempted, setAttempted] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const sending = useRef(false);

  const own = item.authUid === review.uid;
  const reviewers: string[] = Array.isArray(item.reviewerIds) ? item.reviewerIds.map(String) : [];
  const already = reviewers.includes(review.uid);
  const closed = ['withdrawn', 'needs-permission', 'rejected'].includes(item.status);
  const problems = sentenceReviewProblems(judgments, competent);
  const change = (index: number, patch: Partial<SentenceJudgment>) => setJudgments((rows) => rows.map((row, position) => position === index ? { ...row, ...patch } : row));
  const permissions = (item.permissions ?? {}) as Record<string, unknown>;
  const blocked = own ? 'This is your own sentence. Another speaker must judge it.'
    : already ? 'You have already judged this revision. A correction needs a new revision from the contributor.'
      : closed ? `It is “${item.status === 'needs-permission' ? 'waiting for the contributor’s permission' : item.status}”, so it cannot be judged now.`
        : !examples.length ? 'This note has no sentences to judge.'
          : '';

  const start = () => {
    setAttempted(true);
    if (problems.length) {
      document.getElementById(problems[0].field)?.focus();
      return;
    }
    setError('');
    setConfirming(true);
  };

  const record = async () => {
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    setError('');
    try {
      const result = await review.services.call('decideGrammarNote', {
        noteId: item.id,
        revision: typeof item.revision === 'number' ? item.revision : 1,
        dialectCompetent: competent,
        preference,
        judgments,
      }) as { status?: string } | null;
      setConfirming(false);
      onSaved(SENTENCE_OUTCOMES[String(result?.status ?? '')] ?? 'Your judgment was recorded.');
    } catch (reason) {
      const message = reason instanceof Error ? reason.message.replace(/^Firebase: /, '') : '';
      setError(message && message !== 'internal' ? message : 'Your judgment could not be sent. Check your connection and try again — nothing was recorded.');
    } finally {
      sending.current = false;
      setBusy(false);
    }
  };

  const problemFor = (field: string) => (attempted ? problems.find((entry) => entry.field === field)?.message : undefined);

  return (
    <div className="rv-review">
      <div className="rv-review__material cw-stack cw-stack--lg">
        <Panel title="About this note">
          <Facts variant="rows" items={[
            { label: 'Kind', value: item.mode === 'comparison' ? 'Two versions of the same sentence' : item.mode === 'correction' ? 'A correction to an earlier answer' : 'Example sentence' },
            { label: 'Contributor’s explanation', value: typeof item.explanation === 'string' ? item.explanation : '' },
            { label: 'Why the versions differ', value: typeof item.comparisonNote === 'string' ? item.comparisonNote : '' },
            { label: 'Original question', value: typeof item.question === 'string' ? item.question : '' },
            { label: 'Revision', value: typeof item.revision === 'number' ? String(item.revision) : '' },
            { label: 'Independent judgments so far', value: `${reviewers.length} of the 2 needed to confirm` },
            { label: 'Permission', value: [permissions.review ? 'Review' : '', permissions.publication ? 'Publication' : '', permissions.audio ? 'Audio' : ''].filter(Boolean).join(' · ') || 'Not recorded' },
            { label: 'Permission ends', value: typeof permissions.expiresAt === 'string' && permissions.expiresAt ? new Date(permissions.expiresAt).toLocaleDateString() : '' },
          ]} />
        </Panel>

        {examples.map((example, index) => {
          const judgment = judgments[index];
          const context = (example.context ?? {}) as Record<string, string>;
          const concern = judgment ? sentenceConcern(judgment) : false;
          const explanationId = `sentence-${index}-explanation`;
          return (
            <Panel key={index} title={examples.length > 1 ? `Version ${index + 1}` : 'The sentence'} className="rv-sentence">
              <div className="cw-stack">
                <div className="rv-compare">
                  <section className="rv-compare__side" aria-label="Kasem">
                    <span className="rv-compare__label">Kasem</span>
                    <p className="rv-compare__text" lang="xsm">{example.kasem || <span className="cw-muted">Not given</span>}</p>
                    {example.literal ? <span className="cw-table__sub">Word for word: {example.literal}</span> : null}
                  </section>
                  <span className="rv-compare__arrow" aria-hidden="true"><Icon name="arrow" /></span>
                  <section className="rv-compare__side rv-compare__side--contributed" aria-label="English meaning">
                    <span className="rv-compare__label">Meaning (English)</span>
                    <p className="rv-compare__text">{example.english || <span className="cw-muted">Not given</span>}</p>
                  </section>
                </div>
                <Facts variant="rows" items={[
                  { label: 'Dialect', value: example.dialect && example.dialect !== 'unknown' ? example.dialect : 'Not given' },
                  { label: 'Situation', value: [context.situation, context.preceding ? `After: ${context.preceding}` : '', context.intent ? `Intent: ${context.intent}` : '', context.register ? `Register: ${context.register}` : ''].filter(Boolean).join(' · ') },
                  { label: 'Speaker’s note', value: example.note },
                  { label: 'Source', value: [example.sourceType === 'speaker' ? 'A speaker' : example.sourceType === 'literature' ? 'Published text' : example.sourceType === 'model' ? 'Suggested by a tool, checked by the contributor' : '', example.source].filter(Boolean).join(' · ') },
                  { label: 'Speaker’s own judgment', value: example.naturalness && example.naturalness !== 'cannot-judge' ? DIMENSIONS.naturalness[example.naturalness] ?? example.naturalness : '' },
                  { label: 'Word notes', value: Array.isArray(example.annotations) && example.annotations.length ? `${example.annotations.length} annotation${example.annotations.length === 1 ? '' : 's'}` : '' },
                ]} />
                {example.audioPath ? <SentenceAudio item={item} index={index} /> : null}

                {judgment && !blocked ? (
                  <fieldset className="rv-judgment" disabled={busy}>
                    <legend className="cw-field-label">Your judgment{examples.length > 1 ? ` of version ${index + 1}` : ''}</legend>
                    <div className="rv-judgment__grid">
                      {SENTENCE_DIMENSIONS.map((dimension) => (
                        <SelectField
                          key={dimension.id}
                          id={`sentence-${index}-${dimension.id}`}
                          label={dimension.label}
                          value={judgment[dimension.id]}
                          options={Object.entries(DIMENSIONS[dimension.id]).map(([value, label]) => ({ value, label }))}
                          onChange={(value) => change(index, { [dimension.id]: value })}
                        />
                      ))}
                    </div>
                    <div className="cw-field">
                      <label className="cw-field-label" htmlFor={explanationId}>
                        What is wrong, or what depends on context <span className="cw-field__tag">{concern ? 'Required' : 'Optional'}</span>
                      </label>
                      <textarea id={explanationId} rows={3} maxLength={2000} value={judgment.explanation} aria-invalid={Boolean(problemFor(explanationId))} aria-describedby={`${explanationId}-help`} onChange={(event) => change(index, { explanation: event.target.value })} />
                      {problemFor(explanationId) ? <p className="cw-field__error" id={`${explanationId}-help`}><Icon name="alert" />{problemFor(explanationId)}</p>
                        : <p className="cw-field__hint" id={`${explanationId}-help`}>{concern ? 'You marked a concern. Say what is wrong in at least 10 characters, so the contributor and other reviewers can see why.' : 'Add anything another reviewer should know.'}</p>}
                      <Counter value={judgment.explanation} max={2000} />
                    </div>
                    {Array.isArray(example.annotations) && example.annotations.length ? (
                      <label className="cw-check">
                        <input type="checkbox" checked={judgment.annotationApproved} onChange={(event) => change(index, { annotationApproved: event.target.checked })} />
                        <span>I also confirm the word notes and explanation for this version</span>
                      </label>
                    ) : null}
                  </fieldset>
                ) : null}
              </div>
            </Panel>
          );
        })}
      </div>

      <aside className="rv-review__decision rv-review__decision--sticky" aria-label="Judgment">
        <Panel title="Record your judgment" description="Nothing is recorded until you confirm" className="rv-decision">
          {blocked ? <Notice tone="warning" title="You cannot judge this one">{blocked}</Notice> : (
            <div className="cw-stack">
              <p className="cw-small">A sentence is confirmed only when two independent speakers judge it the same way. If reviewers disagree, it is marked for discussion — your judgment is never averaged away.</p>
              {examples.length > 1 ? (
                <SelectField id="sentence-preference" label="Which version would you use?" value={preference} onChange={setPreference} disabled={busy} options={[
                  { value: 'cannot-judge', label: 'Cannot judge' },
                  { value: 'first', label: 'Version 1' },
                  { value: 'second', label: 'Version 2' },
                  { value: 'tie', label: 'Both work' },
                  { value: 'context-dependent', label: 'Depends on the situation' },
                ]} />
              ) : null}
              <label className={cx('cw-check', attempted && !competent && 'is-invalid')}>
                <input id="sentence-competent" type="checkbox" checked={competent} disabled={busy} aria-invalid={attempted && !competent} onChange={(event) => setCompetent(event.target.checked)} />
                <span>I speak this dialect well enough to judge these sentences</span>
              </label>
              {problemFor('sentence-competent') ? <p className="cw-field__error" role="alert"><Icon name="alert" />{problemFor('sentence-competent')}</p> : null}
              {attempted && problems.length > 1 ? <p className="cw-field__error" role="alert"><Icon name="alert" />{problems.length} things need attention before this can be recorded.</p> : null}
              <button type="button" className="button--primary cw-btn--block" disabled={busy} onClick={start}>Review judgment…</button>
              <p className="cw-small cw-muted">Judgments are recorded with your account and the time. You can judge each revision once.</p>
            </div>
          )}
        </Panel>
      </aside>

      <ConfirmDialog
        open={confirming}
        title="Record this judgment?"
        confirmLabel="Confirm judgment"
        busy={busy}
        error={error || undefined}
        onCancel={() => { setConfirming(false); setError(''); }}
        onConfirm={() => void record()}
        wide
      >
        <ul className="rv-summary">
          {judgments.map((judgment, index) => (
            <li key={index}>
              <strong>{examples.length > 1 ? `Version ${index + 1}` : 'The sentence'}</strong>
              <span className="rv-summary__marks">
                {SENTENCE_DIMENSIONS.map(({ id, label }) => (
                  <Badge key={id} tone={judgment[id] === 'cannot-judge' ? 'neutral' : ['faithful', 'acceptable', 'natural', 'fits'].includes(judgment[id]) ? 'success' : 'warning'} plain>
                    {label}: {DIMENSIONS[id][judgment[id]] ?? judgment[id]}
                  </Badge>
                ))}
              </span>
              {judgment.explanation.trim() ? <span className="cw-small">{judgment.explanation.trim()}</span> : null}
            </li>
          ))}
        </ul>
        {examples.length > 1 ? <p className="cw-small">Preferred: {({ first: 'Version 1', second: 'Version 2', tie: 'Both work', 'context-dependent': 'Depends on the situation' } as Record<string, string>)[preference] ?? 'Cannot judge'}</p> : null}
      </ConfirmDialog>
    </div>
  );
}

/** The speaker's private recording, fetched only when the reviewer asks for it. */
function SentenceAudio({ item, index }: { item: ReviewRecord; index: number }) {
  const review = useReview();
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  if (url) return <div className="rv-media"><span className="rv-compare__label">Speaker’s recording</span><audio controls src={url} aria-label={`Speaker recording for version ${index + 1}`} /></div>;
  return (
    <div className="cw-stack cw-stack--sm">
      <button type="button" className="cw-btn--sm rv-load-audio" disabled={busy} onClick={async () => {
        setBusy(true);
        setError('');
        try {
          const data = await review.services.readSentenceAudio({ noteId: item.id, revision: typeof item.revision === 'number' ? item.revision : 1, example: index });
          const bytes = Uint8Array.from(atob(data.audio), (char) => char.charCodeAt(0));
          setUrl(URL.createObjectURL(new Blob([bytes], { type: data.contentType })));
        } catch {
          setError('The recording could not be loaded. Permission may have been withdrawn, or the connection dropped.');
        } finally {
          setBusy(false);
        }
      }}><Icon name="play" className="cw-icon--sm" />{busy ? 'Loading the recording…' : 'Listen to the speaker’s recording'}</button>
      {error ? <p className="cw-field__error" role="alert"><Icon name="alert" />{error}</p> : null}
    </div>
  );
}
