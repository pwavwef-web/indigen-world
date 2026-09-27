/**
 * Everyday Kasem expressions: one clear task, and where it stands.
 *
 * The page does two jobs and shows both at once, because they are the two
 * halves of contributing: send an expression, and see what the review made of
 * the ones already sent. A contributor should never have to wonder whether
 * anybody has looked at their work.
 *
 * The form asks for the five things an expression is worth nothing without —
 * the Kasem, what it means, when it is said, who it came from, and consent to
 * share it — and nothing else. An approved expression is published whole, as
 * an expression; it never becomes a dictionary word. Single words have their
 * own desk, and the form says so when it looks like one has been typed here.
 */
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from '../../router';
import { useAuth } from '../../auth';
import { trackEvent } from '../../analytics';
import { KasemPalette, insertIntoField } from '../KasemPalette';
import {
  EVERYDAY_STATEMENT,
  EXPRESSION_DIALECTS,
  EXPRESSION_KINDS,
  EXPRESSION_SOURCES,
  EXPRESSION_STATUS,
  MAX_PHRASE_LENGTH,
  type ExpressionDraft,
  type MyExpression,
  canWithdrawExpression,
  clearExpressionDraft,
  draftFromDeclined,
  emptyExpressionDraft,
  fetchMyExpressions,
  loadExpressionDraft,
  looksLikeSingleWord,
  missingPiece,
  saveExpressionDraft,
  statusOf,
  submitExpression,
  withdrawExpression,
} from '../expressions-data';

const WEBSITE_CAMPAIGN_URL = 'https://indigenworld.com/contribute';

const REVIEW_STEPS: { status: keyof typeof EXPRESSION_STATUS; title: string; body: string }[] = [
  { status: 'submitted', title: 'You send it', body: 'It is private: only you and the review team can see it.' },
  { status: 'under_review', title: 'A reviewer checks it', body: 'Spelling, meaning and context, by a Kasem speaker. Some go to an elder or teacher for a second look.' },
  { status: 'published', title: 'Approved expressions are published', body: 'Whole, with their meaning, context and source, credited to you — as expressions, never as dictionary words.' },
  { status: 'rejected', title: 'Or the reviewer says why not', body: 'You see the reason here, and you can correct it and send it again.' },
];

function toneClass(tone: string): string {
  return `pill pill--${tone === 'neutral' ? 'muted' : tone}`;
}

function errorMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    const message = (err as { message: string }).message;
    // Firebase prefixes callable errors with their code; the server's own
    // sentence is what the contributor needs.
    return message.replace(/^FirebaseError:\s*/, '') || 'The expression was not sent. Try again.';
  }
  return 'The expression was not sent. Try again.';
}

export function ExpressionsPage() {
  const { user } = useAuth();
  const uid = user?.uid ?? '';
  const [draft, setDraft] = useState<ExpressionDraft>(() => (uid ? loadExpressionDraft(uid) : null) ?? emptyExpressionDraft());
  const [restored] = useState(() => Boolean(uid && loadExpressionDraft(uid)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState<string | null>(null);
  const [mine, setMine] = useState<MyExpression[]>([]);
  const [loadingMine, setLoadingMine] = useState(true);
  const [mineFailed, setMineFailed] = useState(false);
  const [confirmWithdraw, setConfirmWithdraw] = useState<string | null>(null);
  const [withdrawing, setWithdrawing] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const phraseRef = useRef<HTMLInputElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const formTopRef = useRef<HTMLDivElement>(null);

  const loadMine = useCallback(() => {
    if (!uid) return;
    setLoadingMine(true);
    setMineFailed(false);
    void fetchMyExpressions(uid)
      .then((list) => { setMine(list); setLoadingMine(false); })
      .catch(() => { setMineFailed(true); setLoadingMine(false); });
  }, [uid]);

  useEffect(loadMine, [loadMine]);

  // Autosave, so a dropped connection or a closed tab costs nothing typed.
  useEffect(() => {
    if (!uid || sent) return;
    const timer = window.setTimeout(() => saveExpressionDraft(uid, draft), 400);
    return () => window.clearTimeout(timer);
  }, [uid, draft, sent]);

  const update = <K extends keyof ExpressionDraft>(key: K, value: ExpressionDraft[K]) => {
    setError('');
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const source = EXPRESSION_SOURCES.find((option) => option.id === draft.sourceType);
  const correcting = draft.revisionOf ? mine.find((item) => item.id === draft.revisionOf) : undefined;
  const singleWord = looksLikeSingleWord(draft.phrase);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const missing = missingPiece(draft);
    if (missing) {
      setError(missing);
      window.requestAnimationFrame(() => errorRef.current?.focus());
      return;
    }
    setBusy(true);
    setError('');
    try {
      await submitExpression(draft);
      // Enumerated fields only: never the expression or anything identifying.
      trackEvent('expression_submitted', { kind: draft.kind, source: draft.sourceType, correction: draft.revisionOf ? 1 : 0 });
      clearExpressionDraft(uid);
      setSent(draft.phrase.trim());
      setDraft(emptyExpressionDraft());
      loadMine();
      window.requestAnimationFrame(() => formTopRef.current?.scrollIntoView({ block: 'start' }));
    } catch (err) {
      setError(errorMessage(err));
      window.requestAnimationFrame(() => errorRef.current?.focus());
    } finally {
      setBusy(false);
    }
  };

  const startAnother = () => {
    setSent(null);
    setDraft(emptyExpressionDraft());
    window.requestAnimationFrame(() => phraseRef.current?.focus());
  };

  const correct = (item: MyExpression) => {
    setSent(null);
    setError('');
    setDraft(draftFromDeclined(item));
    window.requestAnimationFrame(() => {
      formTopRef.current?.scrollIntoView({ block: 'start' });
      phraseRef.current?.focus();
    });
  };

  const withdraw = async (id: string) => {
    setWithdrawing(id);
    try {
      await withdrawExpression(id);
      trackEvent('expression_withdrawn');
      setConfirmWithdraw(null);
      setNotice('Withdrawn. It is no longer in the review queue or published anywhere.');
      loadMine();
    } catch (err) {
      setNotice(errorMessage(err));
    } finally {
      setWithdrawing(null);
    }
  };

  if (!user) return null;

  const counts = mine.reduce<Record<string, number>>((acc, item) => {
    acc[item.status] = (acc[item.status] ?? 0) + 1;
    return acc;
  }, {});
  // A declined expression that has already been corrected points at its
  // correction instead of offering to be corrected a second time.
  const correctedIds = new Set(mine.map((item) => item.revisionOf).filter(Boolean));

  return (
    <div className="page expr">
      <header className="page__head">
        <div>
          <p className="hero__eyebrow">Everyday Kasem expressions · open to everyone</p>
          <h1>Share an expression</h1>
          <p className="muted expr__lede">
            Send one greeting, blessing, idiom or saying that you use, with what it means, when it is said and
            who you learned it from. A Kasem-speaking reviewer checks it before anyone else can see it.
          </p>
        </div>
        <a className="button button--ghost-dark button--small" href={WEBSITE_CAMPAIGN_URL} target="_blank" rel="noreferrer">
          About this campaign ↗
        </a>
      </header>

      <div className="cols expr__cols" ref={formTopRef}>
        <div>
          {sent ? (
            <section className="panel expr-sent" aria-live="polite">
              <p className="hero__eyebrow">Sent for review</p>
              <h2 lang="xsm">“{sent}”</h2>
              <p>
                It is waiting for a reviewer, and it appears below under <strong>Your expressions</strong> with its
                status. We will tell you under Notifications when a reviewer decides.
              </p>
              <div className="actions expr-sent__actions">
                <Link to="/studio/notifications" className="button button--ghost-dark">Notifications</Link>
                <button type="button" className="button button--primary" onClick={startAnother}>Share another expression</button>
              </div>
            </section>
          ) : (
            <form className="panel expr-form" onSubmit={(event) => void submit(event)} noValidate>
              {restored && !draft.revisionOf ? (
                <p className="callout callout--info">An unfinished expression was restored from this browser. Nothing has been sent.</p>
              ) : null}
              {draft.revisionOf ? (
                <div className="callout callout--warn">
                  <strong>Correcting an expression that was not accepted.</strong>
                  {correcting?.reviewFeedback ? <> The reviewer said: “{correcting.reviewFeedback}”</> : null}
                  <p className="tiny">Sending starts a new review. Confirm the consent questions again below.</p>
                  <button type="button" className="button button--small" onClick={() => setDraft(emptyExpressionDraft())}>Cancel the correction</button>
                </div>
              ) : null}

              <fieldset className="expr-section">
                <legend><span className="expr-section__n">1</span> The expression</legend>
                <KasemPalette onInsert={(char) => { if (phraseRef.current) insertIntoField(phraseRef.current, char); }} />
                <div className="field">
                  <label htmlFor="expr-phrase">The expression in Kasem *</label>
                  <input
                    id="expr-phrase"
                    ref={phraseRef}
                    lang="xsm"
                    value={draft.phrase}
                    maxLength={MAX_PHRASE_LENGTH + 20}
                    autoComplete="off"
                    onChange={(event) => update('phrase', event.target.value)}
                    aria-describedby="expr-phrase-hint"
                  />
                  <p className="field__hint" id="expr-phrase-hint">
                    Write it the way you say it. If you are unsure of the spelling, write it your way — the reviewer can suggest one.
                  </p>
                  {singleWord ? (
                    <p className="field__hint expr-word-hint">
                      One word? Single words get a full dictionary entry at <Link to="/studio/dictionary">Word contributions</Link>.
                      If this word is a whole expression on its own — a greeting, say — carry on here.
                    </p>
                  ) : null}
                </div>
                <div className="expr-choices expr-choices--three" role="radiogroup" aria-label="What kind of expression is it?">
                  {EXPRESSION_KINDS.map((kind) => (
                    <label key={kind.id} className={`studio-option expr-choice${draft.kind === kind.id ? ' is-on' : ''}`}>
                      <input type="radio" name="expr-kind" value={kind.id} checked={draft.kind === kind.id} onChange={() => update('kind', kind.id)} />
                      <strong>{kind.label}</strong>
                      <span>{kind.hint}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <fieldset className="expr-section">
                <legend><span className="expr-section__n">2</span> What it means</legend>
                <div className="field">
                  <label htmlFor="expr-meaning">Meaning in English *</label>
                  <textarea
                    id="expr-meaning"
                    value={draft.meaning}
                    onChange={(event) => update('meaning', event.target.value)}
                    placeholder="What a speaker means by it — not word for word"
                  />
                </div>
                <div className="field">
                  <label htmlFor="expr-literal">Word for word (optional)</label>
                  <input
                    id="expr-literal"
                    value={draft.literalTranslation}
                    onChange={(event) => update('literalTranslation', event.target.value)}
                    placeholder="Useful for idioms, where the words and the meaning differ"
                  />
                </div>
              </fieldset>

              <fieldset className="expr-section">
                <legend><span className="expr-section__n">3</span> When it is used</legend>
                <div className="field">
                  <label htmlFor="expr-context">When is it said? *</label>
                  <textarea
                    id="expr-context"
                    value={draft.context}
                    onChange={(event) => update('context', event.target.value)}
                    placeholder="Who says it, to whom, and on what occasion — for example, said by the household to a relative arriving home"
                  />
                </div>
                <div className="field">
                  <label htmlFor="expr-dialect">Dialect *</label>
                  <select id="expr-dialect" value={draft.dialect} onChange={(event) => update('dialect', event.target.value)}>
                    <option value="">Choose one</option>
                    {EXPRESSION_DIALECTS.map((dialect) => <option key={dialect} value={dialect}>{dialect}</option>)}
                  </select>
                </div>
              </fieldset>

              <fieldset className="expr-section">
                <legend><span className="expr-section__n">4</span> Who you learned it from</legend>
                <div className="expr-choices" role="radiogroup" aria-label="Who did you learn it from?">
                  {EXPRESSION_SOURCES.map((option) => (
                    <label key={option.id} className={`studio-option expr-choice expr-choice--compact${draft.sourceType === option.id ? ' is-on' : ''}`}>
                      <input
                        type="radio"
                        name="expr-source"
                        value={option.id}
                        checked={draft.sourceType === option.id}
                        onChange={() => { update('sourceType', option.id); update('speakerConsent', false); }}
                      />
                      <strong>{option.label}</strong>
                    </label>
                  ))}
                </div>
                <div className="field">
                  <label htmlFor="expr-source-detail">Where and how did you learn it? *</label>
                  <input
                    id="expr-source-detail"
                    value={draft.sourceDetail}
                    onChange={(event) => update('sourceDetail', event.target.value)}
                    placeholder={draft.sourceType === 'written' || draft.sourceType === 'recording'
                      ? 'The title, author or programme, and where it can be found'
                      : 'For example: my grandmother in Paga says it at harvest time'}
                    aria-describedby="expr-source-detail-hint"
                  />
                  <p className="field__hint" id="expr-source-detail-hint">
                    Shown with the published expression, so readers know where it comes from. Leave out addresses and phone numbers.
                  </p>
                </div>
                {draft.sourceType && draft.sourceType !== 'self' && draft.sourceType !== 'written' && draft.sourceType !== 'recording' ? (
                  <div className="field">
                    <label htmlFor="expr-speaker">Speaker’s name (optional)</label>
                    <input id="expr-speaker" value={draft.speakerName} onChange={(event) => update('speakerName', event.target.value)} aria-describedby="expr-speaker-hint" />
                    <p className="field__hint" id="expr-speaker-hint">Shown publicly with the expression. Only add a name if the person agreed to be named.</p>
                  </div>
                ) : null}
              </fieldset>

              <fieldset className="expr-section">
                <legend><span className="expr-section__n">5</span> Consent</legend>
                {source ? (
                  <label className="checkbox">
                    <input type="checkbox" checked={draft.speakerConsent} onChange={(event) => update('speakerConsent', event.target.checked)} />
                    <span>{source.consent}</span>
                  </label>
                ) : (
                  <p className="field__hint">Choose who you learned it from first — what you confirm depends on it.</p>
                )}
                <label className="checkbox">
                  <input type="checkbox" checked={draft.everydayConfirmed} onChange={(event) => update('everydayConfirmed', event.target.checked)} />
                  <span>{EVERYDAY_STATEMENT}</span>
                </label>
                <div className="expr-choices expr-choices--two" role="radiogroup" aria-label="May it be published after review?">
                  <label className={`studio-option expr-choice${draft.publish === 'yes' ? ' is-on' : ''}`}>
                    <input type="radio" name="expr-publish" checked={draft.publish === 'yes'} onChange={() => update('publish', 'yes')} />
                    <strong>Publish it after review</strong>
                    <span>If a reviewer approves it, it is published as an expression, credited to your studio name.</span>
                  </label>
                  <label className={`studio-option expr-choice${draft.publish === 'no' ? ' is-on' : ''}`}>
                    <input type="radio" name="expr-publish" checked={draft.publish === 'no'} onChange={() => update('publish', 'no')} />
                    <strong>Review only — do not publish</strong>
                    <span>A reviewer still checks it, and it is kept for the archive, but it is not shown publicly.</span>
                  </label>
                </div>
                <label className="perm perm--ai">
                  <input type="checkbox" checked={draft.aiTraining} onChange={(event) => update('aiTraining', event.target.checked)} />
                  <span>
                    Optional: Indigen World may also use this expression to build Kasem language tools and for AI research.
                    It is never required, and leaving it unticked changes nothing about the review.
                  </span>
                </label>
              </fieldset>

              {error ? <p className="field__error expr-error" role="alert" tabIndex={-1} ref={errorRef}>{error}</p> : null}
              <div className="actions">
                <button type="button" className="button button--ghost-dark" disabled={busy} onClick={() => { setDraft(emptyExpressionDraft()); clearExpressionDraft(uid); setError(''); }}>
                  Clear
                </button>
                <button type="submit" className="button button--primary" disabled={busy}>
                  {busy ? 'Sending…' : draft.revisionOf ? 'Send the correction for review' : 'Send for review'}
                </button>
              </div>
            </form>
          )}
        </div>

        <aside className="expr-aside">
          <section className="panel">
            <h2>What happens after you send it</h2>
            <ol className="expr-flow">
              {REVIEW_STEPS.map((step) => (
                <li key={step.status}>
                  <span className={toneClass(EXPRESSION_STATUS[step.status].tone)}>{EXPRESSION_STATUS[step.status].label}</span>
                  <strong>{step.title}</strong>
                  <p>{step.body}</p>
                </li>
              ))}
            </ol>
            <p className="tiny">You can withdraw an expression at any time, even after it is published. There is no payment for this campaign.</p>
          </section>
          <section className="panel expr-tips">
            <h2>Good to send</h2>
            <ul>
              <li>Greetings for different times of day</li>
              <li>Thanks, blessings and condolences</li>
              <li>Things said at home, in the market or at a gathering</li>
              <li>Idioms and sayings you grew up with</li>
            </ul>
            <h2>Please do not send</h2>
            <ul>
              <li>Sacred, secret or restricted knowledge</li>
              <li>Private family matters, or anything you were asked not to share</li>
              <li>Long stories — share those as <Link to="/studio/submissions/new?type=writing">writing</Link></li>
            </ul>
          </section>
        </aside>
      </div>

      <section className="panel expr-mine" aria-labelledby="expr-mine-title">
        <div className="panel__head">
          <h2 id="expr-mine-title">Your expressions</h2>
          {mine.length ? (
            <p className="tiny expr-mine__counts">
              {Object.entries(counts).map(([status, count]) => `${count} ${statusOf(status).label.toLowerCase()}`).join(' · ')}
            </p>
          ) : null}
        </div>
        {notice ? <p className="callout callout--info" role="status">{notice}</p> : null}
        {mineFailed ? (
          <div className="callout callout--warn">
            Your expressions could not be loaded. <button type="button" className="button button--small" onClick={loadMine}>Try again</button>
          </div>
        ) : loadingMine ? (
          <p className="notice">Loading your expressions…</p>
        ) : mine.length === 0 ? (
          <p className="notice">Nothing yet. The first expression you send appears here, with its review status.</p>
        ) : (
          <ul className="list expr-list">
            {mine.map((item) => {
              const meta = statusOf(item.status);
              return (
                <li key={item.id} className="list__item expr-item">
                  <div className="expr-item__main">
                    <strong lang="xsm">{item.phrase}</strong>
                    <p className="muted">{item.meaning}</p>
                    <p className="tiny">
                      {EXPRESSION_KINDS.find((kind) => kind.id === item.kind)?.label ?? item.kind}
                      {item.dialect ? ` · ${item.dialect}` : ''}
                      {item.createdAt ? ` · sent ${item.createdAt.toLocaleDateString()}` : ''}
                      {item.revisionOf ? ' · correction' : ''}
                    </p>
                    <p className="tiny expr-item__next">{meta.next}</p>
                    {item.reviewFeedback && item.status !== 'withdrawn' ? (
                      <p className="expr-item__feedback"><span>Reviewer:</span> {item.reviewFeedback}</p>
                    ) : null}
                  </div>
                  <div className="list__side list__side--stack">
                    <span className={toneClass(meta.tone)}>{meta.label}</span>
                    {item.status === 'rejected' ? (
                      correctedIds.has(item.id) ? (
                        <span className="tiny">Corrected and sent again</span>
                      ) : (
                        <button type="button" className="button button--small" onClick={() => correct(item)}>Correct and send again</button>
                      )
                    ) : null}
                    {canWithdrawExpression(item.status) ? (
                      confirmWithdraw === item.id ? (
                        <>
                          <button type="button" className="button button--small button--reject" disabled={withdrawing === item.id} onClick={() => void withdraw(item.id)}>
                            {withdrawing === item.id ? 'Withdrawing…' : 'Confirm'}
                          </button>
                          <button type="button" className="button button--small" disabled={withdrawing === item.id} onClick={() => setConfirmWithdraw(null)}>Keep it</button>
                        </>
                      ) : (
                        <button type="button" className="button button--small" onClick={() => setConfirmWithdraw(item.id)}>
                          {item.status === 'published' ? 'Take it down' : 'Withdraw'}
                        </button>
                      )
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
