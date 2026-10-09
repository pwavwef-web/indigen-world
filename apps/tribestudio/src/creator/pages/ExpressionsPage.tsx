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
import { Link, useQueryParam } from '../../router';
import { useAuth } from '../../auth';
import { DraftRecovery, useRecovery } from '../../drafts/useRecovery';
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
  looksLikeSingleWord,
  missingPiece,
  statusOf,
  submitExpression,
  withdrawExpression,
  type StatusTone,
} from '../expressions-data';
import { Badge, Dialog, Disclosure, EmptyState, Icon, Notice, PageHeader, Skeleton, Steps, type Tone } from '../../ui';

const WEBSITE_CAMPAIGN_URL = 'https://indigenworld.com/contribute';

const REVIEW_STEPS: { status: keyof typeof EXPRESSION_STATUS; title: string; body: string }[] = [
  { status: 'submitted', title: 'You send it', body: 'It is private: only you and the review team can see it.' },
  { status: 'under_review', title: 'A reviewer checks it', body: 'Spelling, meaning and context, by a Kasem speaker. Some go to an elder or teacher for a second look.' },
  { status: 'published', title: 'Approved expressions are published', body: 'Whole, with their meaning, context and source, credited to you — as expressions, never as dictionary words.' },
  { status: 'rejected', title: 'Or the reviewer says why not', body: 'You see the reason here, and you can correct it and send it again.' },
];

const BADGE_TONE: Record<StatusTone, Tone> = { info: 'info', ok: 'success', warn: 'warning', neutral: 'neutral' };

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
  return user ? <ExpressionEditor key={user.uid} uid={user.uid} /> : null;
}
function ExpressionEditor({ uid }: { uid: string }) {
  const { user } = useAuth();
  const requestedKind = useQueryParam('kind');
  const [draft, setDraft] = useState<ExpressionDraft>(() => ({ ...emptyExpressionDraft(), kind: requestedKind === 'proverb' ? 'proverb' : 'phrase' }));
  const recovery = useRecovery(uid, 'expressions', draft, Boolean(draft.phrase || draft.meaning || draft.context), restored => setDraft({ ...emptyExpressionDraft(), ...restored, speakerConsent: false, everydayConfirmed: false }));
  const [busy, setBusy] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const sending = useRef(false);
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


  const update = <K extends keyof ExpressionDraft>(key: K, value: ExpressionDraft[K]) => {
    setError('');
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const source = EXPRESSION_SOURCES.find((option) => option.id === draft.sourceType);
  const correcting = draft.revisionOf ? mine.find((item) => item.id === draft.revisionOf) : undefined;
  const singleWord = looksLikeSingleWord(draft.phrase);

  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    if (sending.current) return;
    const missing = missingPiece(draft);
    if (missing) {
      setError(missing);
      window.requestAnimationFrame(() => errorRef.current?.focus());
      return;
    }
    sending.current = true; setBusy(true);
    setError('');
    try {
      await submitExpression(draft);
      setReviewing(false);
      // Enumerated fields only: never the expression or anything identifying.
      trackEvent('expression_submitted', { kind: draft.kind, source: draft.sourceType, correction: draft.revisionOf ? 1 : 0 });
      recovery.clear();
      setSent(draft.phrase.trim());
      setDraft(emptyExpressionDraft());
      loadMine();
      window.requestAnimationFrame(() => formTopRef.current?.scrollIntoView({ block: 'start' }));
    } catch (err) {
      setError(errorMessage(err));
      window.requestAnimationFrame(() => errorRef.current?.focus());
    } finally {
      sending.current = false; setBusy(false);
    }
  };

  const startAnother = () => {
    recovery.resumeSaving();
    setSent(null);
    setDraft(emptyExpressionDraft());
    window.requestAnimationFrame(() => phraseRef.current?.focus());
  };

  const correct = (item: MyExpression) => {
    recovery.resumeSaving();
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
    <div className="ts-page cr-expr">
      <PageHeader
        kicker="Everyday Kasem expressions · open to everyone"
        title="Share an expression"
        description="Share a greeting, blessing, idiom or saying with its meaning, context and source. A Kasem-speaking reviewer checks it."
        actions={<a className="ts-btn ts-btn--secondary" href={WEBSITE_CAMPAIGN_URL} target="_blank" rel="noreferrer">About this campaign<Icon name="external" /></a>}
      />

      <section className="ts-panel ts-panel--tight cr-expr__guide" aria-label="Expression contribution process">
        <Steps label="Expression contribution process" steps={[
          { title: 'Write the expression', detail: 'Phrase, meaning and everyday context', icon: 'quote' },
          { title: 'Check the source', detail: 'Attribution and explicit permission', icon: 'user' },
          { title: 'Review and send', detail: 'Follow feedback here after submission', icon: 'shield' },
        ]} />
      </section>

      {reviewing ? (
        <Dialog title="Review expression" lede="Your expression stays private during review. Your permission choices are sent with it." onClose={() => setReviewing(false)} busy={busy}>
          <dl className="ts-kv cr-expr__confirm">
            <div><dt>Expression</dt><dd lang="xsm" className="cr-kasem">{draft.phrase}</dd></div>
            <div><dt>Meaning</dt><dd>{draft.meaning}</dd></div>
            <div><dt>Context</dt><dd>{draft.context}</dd></div>
            <div><dt>Source</dt><dd>{draft.sourceDetail}</dd></div>
            <div><dt>Publication</dt><dd>{draft.publish === 'yes' ? 'Permission granted' : 'Your selected publication choice is kept'}</dd></div>
          </dl>
          {error ? <p className="ts-error" role="alert"><Icon name="alert" />{error}</p> : null}
          <div className="cr-dialog-actions">
            <button type="button" className="ts-btn ts-btn--ghost" disabled={busy} onClick={() => setReviewing(false)}>Back to editing</button>
            <button type="button" className="ts-btn ts-btn--primary" aria-busy={busy || undefined} disabled={busy} onClick={() => void submit()}><Icon name="send" />{busy ? 'Sending…' : 'Confirm and send'}</button>
          </div>
        </Dialog>
      ) : null}

      <div className="cr-expr__layout" ref={formTopRef}>
        <div className="cr-expr__main">
          {sent ? (
            <section className="cr-sent" aria-live="polite">
              <span className="cr-sent__mark" aria-hidden="true"><Icon name="check" /></span>
              <p className="ts-kicker">Sent for review</p>
              <h2 lang="xsm" className="cr-kasem">“{sent}”</h2>
              <p>
                It is waiting for a reviewer, and it appears below under <strong>Your expressions</strong> with its
                status. We will tell you under Notifications when a reviewer decides.
              </p>
              <div className="ts-cluster">
                <Link to="/studio/notifications" className="ts-btn ts-btn--secondary"><Icon name="bell" />Notifications</Link>
                <button type="button" className="ts-btn ts-btn--primary" onClick={startAnother}><Icon name="plus" />Share another expression</button>
              </div>
            </section>
          ) : (
            <form className="cr-compose__card cr-expr__form" onSubmit={(event) => { event.preventDefault(); const missing = missingPiece(draft); if (missing) { setError(missing); window.requestAnimationFrame(() => errorRef.current?.focus()); } else setReviewing(true); }} noValidate>
              <DraftRecovery draft={recovery} />
              {draft.revisionOf ? (
                <div className="cr-correction">
                  <div className="cr-correction__copy">
                    <strong>Correcting an expression that was not accepted.</strong>
                    {correcting?.reviewFeedback ? <p>The reviewer said: “{correcting.reviewFeedback}”</p> : null}
                    <p className="ts-hint">Sending starts a new review. Confirm the consent questions again below.</p>
                  </div>
                  <button type="button" className="ts-btn ts-btn--secondary ts-btn--sm" onClick={() => setDraft(emptyExpressionDraft())}>Cancel the correction</button>
                </div>
              ) : null}

              <fieldset className="cr-expr__section">
                <legend><span className="cr-step__n" aria-hidden="true">1</span>The expression</legend>
                <div className="ts-field">
                  <label className="ts-label" htmlFor="expr-phrase">The expression in Kasem <span className="ts-required" aria-hidden="true">*</span></label>
                  <KasemPalette onInsert={(char) => { if (phraseRef.current) insertIntoField(phraseRef.current, char); }} />
                  <input
                    id="expr-phrase"
                    ref={phraseRef}
                    className="ts-input cr-kasem-input"
                    lang="xsm"
                    value={draft.phrase}
                    maxLength={MAX_PHRASE_LENGTH + 20}
                    autoComplete="off"
                    onChange={(event) => update('phrase', event.target.value)}
                    aria-describedby="expr-phrase-hint"
                  />
                  <p className="ts-hint" id="expr-phrase-hint">
                    Write it the way you say it. If you are unsure of the spelling, write it your way — the reviewer can suggest one.
                  </p>
                  {singleWord ? (
                    <p className="ts-hint cr-word-hint">
                      <Icon name="book" />
                      <span>One word? Single words get a full dictionary entry at <Link to="/studio/dictionary">Word contributions</Link>.
                      If this word is a whole expression on its own — a greeting, say — carry on here.</span>
                    </p>
                  ) : null}
                </div>
                <div className="cr-choices cr-choices--three" role="radiogroup" aria-label="What kind of expression is it?">
                  {EXPRESSION_KINDS.map((kind) => (
                    <label key={kind.id} className={`cr-choice${draft.kind === kind.id ? ' is-on' : ''}`}>
                      <input type="radio" name="expr-kind" value={kind.id} checked={draft.kind === kind.id} onChange={() => update('kind', kind.id)} />
                      <strong>{kind.label}</strong>
                      <span>{kind.hint}</span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <fieldset className="cr-expr__section">
                <legend><span className="cr-step__n" aria-hidden="true">2</span>What it means</legend>
                <div className="ts-field">
                  <label className="ts-label" htmlFor="expr-meaning">Meaning in English <span className="ts-required" aria-hidden="true">*</span></label>
                  <textarea
                    id="expr-meaning"
                    className="ts-textarea"
                    value={draft.meaning}
                    onChange={(event) => update('meaning', event.target.value)}
                    placeholder="What a speaker means by it — not word for word"
                  />
                </div>
                <div className="ts-field">
                  <label className="ts-label" htmlFor="expr-literal">Word for word <span className="ts-optional">optional</span></label>
                  <input
                    id="expr-literal"
                    className="ts-input"
                    value={draft.literalTranslation}
                    onChange={(event) => update('literalTranslation', event.target.value)}
                    placeholder="Useful for idioms, where the words and the meaning differ"
                  />
                </div>
              </fieldset>

              <fieldset className="cr-expr__section">
                <legend><span className="cr-step__n" aria-hidden="true">3</span>When it is used</legend>
                <div className="ts-field">
                  <label className="ts-label" htmlFor="expr-context">When is it said? <span className="ts-required" aria-hidden="true">*</span></label>
                  <textarea
                    id="expr-context"
                    className="ts-textarea"
                    value={draft.context}
                    onChange={(event) => update('context', event.target.value)}
                    placeholder="Who says it, to whom, and on what occasion — for example, said by the household to a relative arriving home"
                  />
                </div>
                <div className="ts-field cr-expr__dialect">
                  <label className="ts-label" htmlFor="expr-dialect">Dialect <span className="ts-required" aria-hidden="true">*</span></label>
                  <select id="expr-dialect" className="ts-select" value={draft.dialect} onChange={(event) => update('dialect', event.target.value)}>
                    <option value="">Choose one</option>
                    {EXPRESSION_DIALECTS.map((dialect) => <option key={dialect} value={dialect}>{dialect}</option>)}
                  </select>
                </div>
              </fieldset>

              <fieldset className="cr-expr__section">
                <legend><span className="cr-step__n" aria-hidden="true">4</span>Who you learned it from</legend>
                <div className="cr-choices cr-choices--compact" role="radiogroup" aria-label="Who did you learn it from?">
                  {EXPRESSION_SOURCES.map((option) => (
                    <label key={option.id} className={`cr-choice cr-choice--compact${draft.sourceType === option.id ? ' is-on' : ''}`}>
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
                <div className="ts-field">
                  <label className="ts-label" htmlFor="expr-source-detail">Where and how did you learn it? <span className="ts-required" aria-hidden="true">*</span></label>
                  <input
                    id="expr-source-detail"
                    className="ts-input"
                    value={draft.sourceDetail}
                    onChange={(event) => update('sourceDetail', event.target.value)}
                    placeholder={draft.sourceType === 'written' || draft.sourceType === 'recording'
                      ? 'The title, author or programme, and where it can be found'
                      : 'For example: my grandmother in Paga says it at harvest time'}
                    aria-describedby="expr-source-detail-hint"
                  />
                  <p className="ts-hint" id="expr-source-detail-hint">
                    Shown with the published expression, so readers know where it comes from. Leave out addresses and phone numbers.
                  </p>
                </div>
                {draft.sourceType && draft.sourceType !== 'self' && draft.sourceType !== 'written' && draft.sourceType !== 'recording' ? (
                  <div className="ts-field">
                    <label className="ts-label" htmlFor="expr-speaker">Speaker’s name <span className="ts-optional">optional</span></label>
                    <input id="expr-speaker" className="ts-input" value={draft.speakerName} onChange={(event) => update('speakerName', event.target.value)} aria-describedby="expr-speaker-hint" />
                    <p className="ts-hint" id="expr-speaker-hint">Shown publicly with the expression. Only add a name if the person agreed to be named.</p>
                  </div>
                ) : null}
              </fieldset>

              <fieldset className="cr-expr__section">
                <legend><span className="cr-step__n" aria-hidden="true">5</span>Consent</legend>
                <div className="cr-checks">
                  {source ? (
                    <label className="ts-check ts-check--card">
                      <input type="checkbox" checked={draft.speakerConsent} onChange={(event) => update('speakerConsent', event.target.checked)} />
                      <span className="ts-check__copy">{source.consent}</span>
                    </label>
                  ) : (
                    <p className="ts-hint cr-expr__wait"><Icon name="info" />Choose who you learned it from first — what you confirm depends on it.</p>
                  )}
                  <label className="ts-check ts-check--card">
                    <input type="checkbox" checked={draft.everydayConfirmed} onChange={(event) => update('everydayConfirmed', event.target.checked)} />
                    <span className="ts-check__copy">{EVERYDAY_STATEMENT}</span>
                  </label>
                </div>
                <div className="cr-choices cr-choices--two" role="radiogroup" aria-label="May it be published after review?">
                  <label className={`cr-choice${draft.publish === 'yes' ? ' is-on' : ''}`}>
                    <input type="radio" name="expr-publish" checked={draft.publish === 'yes'} onChange={() => update('publish', 'yes')} />
                    <strong>Publish it after review</strong>
                    <span>If a reviewer approves it, it is published as an expression, credited to your studio name.</span>
                  </label>
                  <label className={`cr-choice${draft.publish === 'no' ? ' is-on' : ''}`}>
                    <input type="radio" name="expr-publish" checked={draft.publish === 'no'} onChange={() => update('publish', 'no')} />
                    <strong>Review only — do not publish</strong>
                    <span>A reviewer still checks it, and it is kept for the archive, but it is not shown publicly.</span>
                  </label>
                </div>
                <label className="cr-perm cr-perm--ai">
                  <input type="checkbox" checked={draft.aiTraining} onChange={(event) => update('aiTraining', event.target.checked)} />
                  <span className="cr-perm__copy">
                    <strong>Language tools and AI research <em className="cr-perm__opt">Optional</em></strong>
                    <span>
                      Optional: Indigen World may also use this expression to build Kasem language tools and for AI research.
                      It is never required, and leaving it unticked changes nothing about the review.
                    </span>
                  </span>
                </label>
              </fieldset>

              {error ? <p className="ts-notice ts-notice--danger cr-expr__error" role="alert" tabIndex={-1} ref={errorRef}><Icon name="alert" className="ts-notice__icon" /><span className="ts-notice__body">{error}</span></p> : null}
              <div className="cr-compose__actions">
                <button type="button" className="ts-btn ts-btn--ghost" disabled={busy} onClick={() => { setDraft(emptyExpressionDraft()); clearExpressionDraft(uid); setError(''); }}>
                  Clear
                </button>
                <div className="cr-compose__actions-right">
                  <button type="submit" className="ts-btn ts-btn--primary" disabled={busy}>
                    {busy ? 'Sending…' : draft.revisionOf ? 'Review correction' : 'Review expression'}<Icon name="arrow" />
                  </button>
                </div>
              </div>
            </form>
          )}
        </div>

        <aside className="cr-expr__rail" aria-label="About expression review">
          <section className="ts-panel ts-panel--tight cr-rail-card">
            <h2 className="cr-rail-card__title">What happens after you send it</h2>
            <ol className="cr-flow">
              {REVIEW_STEPS.map((step) => (
                <li key={step.status}>
                  <Badge tone={BADGE_TONE[EXPRESSION_STATUS[step.status].tone]} dot>{EXPRESSION_STATUS[step.status].label}</Badge>
                  <strong>{step.title}</strong>
                  <p>{step.body}</p>
                </li>
              ))}
            </ol>
            <p className="ts-hint">You can withdraw an expression at any time, even after it is published. There is no payment for this campaign.</p>
          </section>
          <Disclosure summary="Examples and material to avoid" icon="info" className="cr-expr__tips">
            <h3 className="cr-group__title">Good to send</h3>
            <ul className="cr-bullets cr-bullets--ok">
              <li>Greetings for different times of day</li>
              <li>Thanks, blessings and condolences</li>
              <li>Things said at home, in the market or at a gathering</li>
              <li>Idioms and sayings you grew up with</li>
            </ul>
            <h3 className="cr-group__title">Please do not send</h3>
            <ul className="cr-bullets cr-bullets--no">
              <li>Sacred, secret or restricted knowledge</li>
              <li>Private family matters, or anything you were asked not to share</li>
              <li>Long stories — share those as <Link to="/studio/submissions/new?type=writing">writing</Link></li>
            </ul>
          </Disclosure>
        </aside>
      </div>

      <section className="ts-panel cr-mine" aria-labelledby="expr-mine-title">
        <div className="ts-panel__head">
          <div>
            <h2 id="expr-mine-title" className="ts-panel__title">Your expressions</h2>
            {mine.length ? (
              <p className="ts-panel__desc">
                {Object.entries(counts).map(([status, count]) => `${count} ${statusOf(status).label.toLowerCase()}`).join(' · ')}
              </p>
            ) : null}
          </div>
        </div>
        {notice ? <Notice tone="info" role="status">{notice}</Notice> : null}
        {mineFailed ? (
          <Notice tone="warning" title="Your expressions could not be loaded." action={<button type="button" className="ts-btn ts-btn--secondary ts-btn--sm" onClick={loadMine}>Try again</button>} />
        ) : loadingMine ? (
          <Skeleton lines={3} label="Loading your expressions" />
        ) : mine.length === 0 ? (
          <EmptyState compact icon="quote" title="Nothing sent yet" body="The first expression you send appears here, with its review status." />
        ) : (
          <ul className="cr-mine__list ts-stagger">
            {mine.map((item) => {
              const meta = statusOf(item.status);
              return (
                <li key={item.id} className={`cr-mine__item is-${item.status}`}>
                  <div className="cr-mine__main">
                    <div className="cr-mine__top">
                      <strong lang="xsm" className="cr-kasem">{item.phrase}</strong>
                      <Badge tone={BADGE_TONE[meta.tone]} dot live={item.status === 'under_review'}>{meta.label}</Badge>
                    </div>
                    <p className="cr-mine__meaning">{item.meaning}</p>
                    <p className="cr-mine__meta">
                      {EXPRESSION_KINDS.find((kind) => kind.id === item.kind)?.label ?? item.kind}
                      {item.dialect ? ` · ${item.dialect}` : ''}
                      {item.createdAt ? ` · sent ${item.createdAt.toLocaleDateString()}` : ''}
                      {item.revisionOf ? ' · correction' : ''}
                    </p>
                    <p className="cr-mine__next"><Icon name="arrow" />{meta.next}</p>
                    {item.reviewFeedback && item.status !== 'withdrawn' ? (
                      <p className="cr-mine__feedback"><span>Reviewer:</span> {item.reviewFeedback}</p>
                    ) : null}
                  </div>
                  <div className="cr-mine__actions">
                    {item.status === 'rejected' ? (
                      correctedIds.has(item.id) ? (
                        <span className="ts-hint">Corrected and sent again</span>
                      ) : (
                        <button type="button" className="ts-btn ts-btn--primary ts-btn--sm" onClick={() => correct(item)}>Correct and send again</button>
                      )
                    ) : null}
                    {canWithdrawExpression(item.status) ? (
                      confirmWithdraw === item.id ? (
                        <span className="cr-mine__confirm">
                          <button type="button" className="ts-btn ts-btn--danger ts-btn--sm" disabled={withdrawing === item.id} onClick={() => void withdraw(item.id)}>
                            {withdrawing === item.id ? 'Withdrawing…' : 'Confirm'}
                          </button>
                          <button type="button" className="ts-btn ts-btn--ghost ts-btn--sm" disabled={withdrawing === item.id} onClick={() => setConfirmWithdraw(null)}>Keep it</button>
                        </span>
                      ) : (
                        <button type="button" className="ts-btn ts-btn--ghost ts-btn--sm" onClick={() => setConfirmWithdraw(item.id)}>
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
