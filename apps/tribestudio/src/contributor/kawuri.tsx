import { useEffect, useRef, useState } from 'react';
import { Chip, Icon, Notice, Skeleton, cx } from './components';
import { friendlyError, type FriendlyError } from './model';
import { guideSection } from './guide';
import type { AssistInput, AssistResult } from './types';

/**
 * How a Kawuri answer is shown: three parts, each labelled for what it is.
 *   Checks       — rules the workspace applies, no AI;
 *   Sources      — reviewed material: the assignment, the published
 *                  dictionary, the Platform guide;
 *   Suggestions  — Gemini, marked as unreviewed AI, each one dismissible.
 * Nothing here writes to a contribution. A suggestion is never inserted into
 * a draft; the contributor reads it and decides.
 */

const UNAVAILABLE: Record<string, string> = {
  VERTEX_API_DISABLED: 'The Vertex AI API is switched off for this project, so Kawuri cannot write suggestions.',
  VERTEX_AUTH_FAILED: 'The backend service account is not allowed to call Vertex AI (it needs roles/aiplatform.user).',
  MODEL_UNAVAILABLE: 'The Gemini model Kawuri uses is not available right now.',
  UNSUPPORTED_REGION: 'The Gemini model Kawuri uses is not offered in the configured region.',
  QUOTA_EXCEEDED: 'Kawuri is very busy. Try again in a few minutes.',
  OPERATION_TIMEOUT: 'Kawuri took too long to answer. Try again.',
  SAFETY_REJECTED: 'Kawuri declined to answer this one.',
  NO_PROJECT: 'Kawuri is not configured for this deployment.',
  CAPABILITY_UNAVAILABLE: 'Kawuri is switched off for this deployment.',
};

export function unavailableText(reason: string | null): string {
  return (reason && UNAVAILABLE[reason]) || 'Kawuri could not write suggestions this time.';
}

const SEVERITY: Record<string, { label: string; tone: 'warning' | 'info' | 'neutral' }> = {
  ask: { label: 'Check', tone: 'warning' },
  warn: { label: 'Worth a look', tone: 'warning' },
  note: { label: 'Tip', tone: 'info' },
};

export function KawuriResultView({ result, guideHref, onNavigate, compact = false }: {
  result: AssistResult;
  guideHref: (section: string) => string;
  onNavigate: (to: string) => void;
  compact?: boolean;
}) {
  const [dismissed, setDismissed] = useState<string[]>([]);
  const suggestions = result.suggestions.filter((suggestion) => !dismissed.includes(suggestion.id));
  const guideLink = (id: string, label?: string) => {
    const section = guideSection(id);
    if (!section) return null;
    const href = guideHref(id);
    return (
      <a href={href} className="cw-source-link" onClick={(event) => { event.preventDefault(); onNavigate(href); }}>
        {label ?? section.title}
      </a>
    );
  };
  return (
    <div className={cx('cw-kawuri-result', compact && 'is-compact')}>
      {result.checks.length ? (
        <section className="cw-kawuri-block" aria-label="Checks">
          <h3><Icon name="check" />Checks <small>Rules the workspace applies. No AI.</small></h3>
          <ul className="cw-checks">
            {result.checks.map((check) => (
              <li key={check.id}>
                <Chip tone={SEVERITY[check.severity]?.tone ?? 'info'}>{SEVERITY[check.severity]?.label ?? 'Tip'}</Chip>
                <div><strong>{check.title}</strong><p>{check.detail} {guideLink(check.guideSection, 'Guide')}</p></div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="cw-kawuri-block cw-kawuri-block--ai" aria-label="Kawuri suggestions">
        <h3><Icon name="spark" />Kawuri suggestions <Chip tone="violet">AI · not reviewed</Chip></h3>
        {!result.configured ? (
          <Notice tone="neutral" title="Suggestions unavailable">
            <p>{unavailableText(result.unavailableReason)} The checks and sources on this panel still apply.</p>
          </Notice>
        ) : (
          <>
            {result.summary ? <p className="cw-kawuri-summary">{result.summary}</p> : null}
            {suggestions.length ? (
              <ul className="cw-suggestions">
                {suggestions.map((suggestion) => (
                  <li key={suggestion.id}>
                    <p>{suggestion.text}</p>
                    <div className="cw-suggestion__actions">
                      {suggestion.guideSection ? guideLink(suggestion.guideSection) : null}
                      <button type="button" className="cw-link-button" onClick={() => setDismissed((current) => [...current, suggestion.id])} aria-label={`Dismiss suggestion: ${suggestion.text}`}>Not helpful — dismiss</button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : result.suggestions.length ? <p className="cw-muted">You dismissed every suggestion.</p> : <p className="cw-muted">Kawuri had no suggestions for this.</p>}
            {result.questions.length ? (
              <div className="cw-questions">
                <strong>Questions a reviewer might ask</strong>
                <ul>{result.questions.map((question) => <li key={question}>{question}</li>)}</ul>
              </div>
            ) : null}
            {result.removed ? <p className="cw-muted">{result.removed} suggestion{result.removed === 1 ? ' was' : 's were'} removed because {result.removed === 1 ? 'it' : 'they'} contained Kasem. Kawuri is not allowed to write Kasem for you.</p> : null}
            <p className="cw-kawuri-disclaimer">Suggestions are not verified Kasem knowledge and have not been reviewed. Only reviewers decide what is correct.</p>
          </>
        )}
      </section>

      {!compact || result.sources.dictionary.length ? (
        <section className="cw-kawuri-block" aria-label="Sources">
          <h3><Icon name="shield" />Sources <small>Reviewed material</small></h3>
          {!compact && (result.sources.assignment.instructions || result.sources.assignment.dialect || result.sources.assignment.tone) ? (
            <div className="cw-source">
              <span className="cw-source__label">Assignment instructions</span>
              {result.sources.assignment.instructions ? <blockquote>{result.sources.assignment.instructions}</blockquote> : null}
              {result.sources.assignment.dialect ? <p><strong>Variety:</strong> {result.sources.assignment.dialect}</p> : null}
              {result.sources.assignment.tone ? <p><strong>Tone:</strong> {result.sources.assignment.tone}</p> : null}
            </div>
          ) : null}
          {result.sources.dictionary.length ? (
            <div className="cw-source">
              <span className="cw-source__label">Published dictionary entries for words in this expression</span>
              <ul className="cw-dictionary">
                {result.sources.dictionary.map((entry) => (
                  <li key={entry.id}>
                    <span lang="xsm" className="cw-dictionary__kasem">{entry.kasem}</span>
                    <span className="cw-dictionary__english">{entry.english}</span>
                    <span className="cw-dictionary__meta">{[entry.partOfSpeech, entry.dialect].filter(Boolean).join(' · ') || 'Reviewed entry'}</span>
                  </li>
                ))}
              </ul>
              <p className="cw-muted">These are single-word entries reviewers approved. A natural expression may use different words — translate the meaning.</p>
            </div>
          ) : !compact ? <p className="cw-muted">No published dictionary entries matched words in this expression.</p> : null}
          {!compact && result.sources.guide.length ? (
            <div className="cw-source">
              <span className="cw-source__label">Platform guide</span>
              <ul className="cw-source-links">{result.sources.guide.map((entry) => <li key={entry.id}>{guideLink(entry.id)}</li>)}</ul>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

/** Runs one assist request and keeps its outcome, for the page and the inline check. */
export function useAssist(assist: (input: AssistInput) => Promise<AssistResult>) {
  const [result, setResult] = useState<AssistResult | null>(null);
  const [error, setError] = useState<FriendlyError | null>(null);
  const [busy, setBusy] = useState(false);
  const latest = useRef(0);
  const run = async (input: AssistInput) => {
    const ticket = latest.current + 1;
    latest.current = ticket;
    setBusy(true);
    setError(null);
    try {
      const next = await assist(input);
      if (latest.current === ticket) setResult(next);
    } catch (reason) {
      if (latest.current === ticket) {
        setError(friendlyError(reason, 'Kawuri Intelligence'));
        setResult(null);
      }
    } finally {
      if (latest.current === ticket) setBusy(false);
    }
  };
  return { result, error, busy, run, reset: () => { setResult(null); setError(null); } };
}

/** The editor's inline "Check with Kawuri": the current, unsaved draft. */
export function KawuriDraftCheck({ assist, work, item, draft, onClose, guideHref, onNavigate }: {
  assist: (input: AssistInput) => Promise<AssistResult>;
  work: string;
  item: string;
  draft: { translation: string; alternatives: string[]; context: string };
  onClose: () => void;
  guideHref: (section: string) => string;
  onNavigate: (to: string) => void;
}) {
  const { result, error, busy, run } = useAssist(assist);
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void run({ mode: 'check_draft', work, item, draft });
  }, []);
  return (
    <section className="cw-kawuri-inline" aria-label="Kawuri draft check" aria-busy={busy}>
      <div className="cw-kawuri-inline__head">
        <strong><Icon name="kawuri" />Kawuri check</strong>
        <span className="cw-muted">Reads the English, your usage note and the assignment. It never sees or judges your Kasem, and changes nothing.</span>
        <div className="cw-inline-actions">
          <button type="button" disabled={busy} onClick={() => void run({ mode: 'check_draft', work, item, draft })}>Check again</button>
          <button type="button" className="cw-icon-button" onClick={onClose} aria-label="Close Kawuri check"><Icon name="close" /></button>
        </div>
      </div>
      {busy && !result ? <Skeleton lines={3} label="Kawuri is checking your draft" /> : null}
      {error ? (
        <Notice tone="warning" title="Kawuri Intelligence is not available">
          <p>{error.message}</p>
          <p className="cw-muted">Your draft is unaffected. The workspace needs the <code>kawuriContributorAssist</code> function for this check.</p>
        </Notice>
      ) : null}
      {result ? <KawuriResultView result={result} guideHref={guideHref} onNavigate={onNavigate} compact /> : null}
    </section>
  );
}
