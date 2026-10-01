import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Badge,
  ConfirmDialog,
  Counter,
  EmptyState,
  Facts,
  Icon,
  Notice,
  PageHeader,
  Panel,
  Skeleton,
  TypeTag,
  cx,
  useNow,
} from '../components';
import { RouteLink } from '../shell';
import { EXPRESSION_KINDS, EXPRESSION_SOURCES } from '../../creator/expressions-data';
import type { PublishedHeadword } from '../../creator/dictionary-data';
import {
  DESKS,
  FEEDBACK_MINIMUM,
  FEEDBACK_SNIPPETS,
  ITEM_TYPES,
  NEEDS_FEEDBACK,
  ageLabel,
  decisionError,
  decisionHelp,
  decisionLabel,
  decisionRequest,
  decisionTone,
  decisionsFor,
  itemCreatedAt,
  itemDialect,
  itemTitle,
  itemType,
  publishTarget,
  rubricFor,
  safeUrl,
  statusLabel,
  type Desk,
  type ReviewRecord,
} from './model';
import { SentenceReview } from './SentenceReview';
import { useReview } from './ReviewDesk';

/**
 * One item under review. The material is laid out so the source and the
 * contribution can be compared side by side; the decision panel explains
 * what each decision does, requires a written reason for sending work back,
 * and asks for confirmation before anything is recorded. The decision
 * carries the status and version the reviewer saw, so a decision made by
 * someone else in the meantime is never silently overwritten.
 */
export function ItemPage({ desk, id }: { desk: Desk; id: string }) {
  const review = useReview();
  const now = useNow();
  const [item, setItem] = useState<ReviewRecord | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading');
  const [error, setError] = useState('');
  const [decided, setDecided] = useState('');
  const [changedElsewhere, setChangedElsewhere] = useState('');
  const seenStatus = useRef<string | null>(null);
  const decidedHere = useRef(false);

  useEffect(() => review.services.watchItem(desk, id, (row) => {
    if (!row) { setState('missing'); setItem(null); return; }
    if (seenStatus.current && seenStatus.current !== row.status && !decidedHere.current) {
      setChangedElsewhere(`This item was updated while you were reading it. It is now “${statusLabel(row.status).label}”.`);
    }
    seenStatus.current = row.status;
    setItem(row);
    setState('ready');
  }, (reason) => { setError(reason.message); setState('error'); }), [desk, id, review.services]);

  const order = review.queueOrder;
  const position = order.findIndex((entry) => entry.desk === desk && entry.id === id);
  const next = position >= 0 ? order[position + 1] : order.find((entry) => !(entry.desk === desk && entry.id === id));
  const back = <><RouteLink to={review.lastQueue}>Review queue</RouteLink><span aria-hidden="true">/</span><span aria-current="page">{DESKS[desk].label}</span></>;

  if (state === 'loading') return <div className="cw-page"><PageHeader title="Loading…" breadcrumb={back} /><Panel><Skeleton lines={8} label="Loading the item" /></Panel></div>;
  if (state === 'error') {
    return (
      <div className="cw-page">
        <PageHeader title="This item could not be loaded" breadcrumb={back} />
        <Notice tone="danger" title="Could not load the item" action={<button type="button" onClick={() => window.location.reload()}>Reload</button>}>{error || 'Check your connection.'}</Notice>
      </div>
    );
  }
  if (state === 'missing' || !item) {
    return (
      <div className="cw-page">
        <PageHeader title="Item not found" breadcrumb={back} />
        <EmptyState title="This item is no longer available" icon="search" actions={<RouteLink to={review.lastQueue} className="cw-btn">Back to the queue</RouteLink>}>It may have been withdrawn by its contributor or removed.</EmptyState>
      </div>
    );
  }

  const type = itemType(desk, item);
  const status = statusLabel(item.status);
  const created = itemCreatedAt(item);
  const round = item.revisionOf ? 'Resubmission' : '';

  return (
    <div className="cw-page rv-item">
      <PageHeader
        breadcrumb={back}
        title={<span lang={type === 'assigned' ? undefined : 'xsm'}>{itemTitle(desk, item)}</span>}
        meta={<>
          <TypeTag icon={ITEM_TYPES[type].icon}>{ITEM_TYPES[type].label}</TypeTag>
          <Badge tone={status.tone}>{status.label}</Badge>
          {round ? <Badge tone="violet" plain>{round}</Badge> : null}
          <span><Icon name="clock" className="cw-icon--sm" />Waiting {ageLabel(created, now)}</span>
          {itemDialect(item) ? <span>{itemDialect(item)}</span> : null}
        </>}
        actions={next ? <RouteLink to={review.paths.item(next.desk, next.id)} className="cw-btn cw-btn--ghost">Skip to next<Icon name="arrow" className="cw-icon--sm" /></RouteLink> : undefined}
      />

      {decided ? (
        <Notice tone="success" role="status" title={decided} action={<>
          {next ? <RouteLink to={review.paths.item(next.desk, next.id)} className="cw-btn cw-btn--primary cw-btn--sm">Next in queue</RouteLink> : null}
          <RouteLink to={review.lastQueue} className="cw-btn cw-btn--sm">Back to the queue</RouteLink>
        </>}>
          The contributor has been notified. The decision is recorded with your account and the time.
        </Notice>
      ) : null}
      {changedElsewhere && !decided ? <Notice tone="warning" role="status" title="Updated by someone else">{changedElsewhere} The decision panel shows what is possible now.</Notice> : null}

      {desk === 'sentences' ? (
        <SentenceReview item={item} onSaved={(message) => { decidedHere.current = true; setDecided(message); }} />
      ) : (
        <div className="rv-review">
          <div className="rv-review__material">
            {desk === 'contributions' ? <ContributionMaterial item={item} /> : desk === 'recordings' ? <RecordingMaterial item={item} /> : <GenericMaterial desk={desk} item={item} />}
          </div>
          <aside className="rv-review__decision" aria-label="Decision">
            <DecisionPanel desk={desk} item={item} onDecided={(message) => { setDecided(message); }} onDeciding={(active) => { decidedHere.current = active; }} />
          </aside>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Material
// ---------------------------------------------------------------------------

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function Comparison({ left, right }: { left: { label: string; value: string; lang?: string }; right: { label: string; value: string; lang?: string } }) {
  return (
    <div className="rv-compare">
      <section className="rv-compare__side" aria-label={left.label}>
        <span className="rv-compare__label">{left.label}</span>
        <p className="rv-compare__text" lang={left.lang}>{left.value || <span className="cw-muted">Not given</span>}</p>
      </section>
      <span className="rv-compare__arrow" aria-hidden="true"><Icon name="arrow" /></span>
      <section className="rv-compare__side rv-compare__side--contributed" aria-label={right.label}>
        <span className="rv-compare__label">{right.label}</span>
        <p className="rv-compare__text" lang={right.lang}>{right.value || <span className="cw-muted">Not given</span>}</p>
      </section>
    </div>
  );
}

function yesNo(value: unknown, yes: string, no: string): string {
  return value === true ? yes : value === false ? no : 'Not recorded';
}

function ContributionMaterial({ item }: { item: ReviewRecord }) {
  const type = itemType('contributions', item);
  const expression = (item.expression ?? {}) as Record<string, any>;
  const alternatives: string[] = Array.isArray(item.alternativeExpressions) ? item.alternativeExpressions.map(String)
    : Array.isArray(expression.alternatives) ? expression.alternatives.map(String) : [];
  const source = (expression.source ?? {}) as Record<string, unknown>;
  const senses: Record<string, any>[] = Array.isArray(item.senses) ? item.senses : [];
  const external = safeUrl(item.externalPostUrl || item.ctaUrl);

  return (
    <div className="cw-stack cw-stack--lg">
      <Panel title="The contribution">
        <div className="cw-stack">
          {type === 'assigned' ? (
            <Comparison left={{ label: 'Source (English)', value: text(item.title) }} right={{ label: 'Contributed Kasem', value: text(expression.phrase) || text(item.body), lang: 'xsm' }} />
          ) : type === 'expression' ? (
            <Comparison left={{ label: 'Kasem expression', value: text(expression.phrase) || text(item.body), lang: 'xsm' }} right={{ label: 'Meaning given (English)', value: text(expression.meaning) || text(item.title) }} />
          ) : type === 'word' || type === 'saying' || type === 'queue-answer' ? (
            <Comparison left={{ label: type === 'queue-answer' ? 'Requested word (English)' : 'Kasem', value: type === 'queue-answer' ? text(item.wordQueuePrompt?.english) || text(item.title) : text(item.body), lang: type === 'queue-answer' ? undefined : 'xsm' }} right={{ label: type === 'queue-answer' ? 'Answer in Kasem' : 'Meaning (English)', value: type === 'queue-answer' ? text(item.body) : text(item.title), lang: type === 'queue-answer' ? 'xsm' : undefined }} />
          ) : (
            <Facts variant="rows" items={[
              { label: 'Title', value: text(item.title) },
              { label: 'Description', value: text(item.description) },
              { label: 'Format', value: text(item.format) },
            ]} />
          )}
          <Facts variant="rows" items={[
            { label: 'Other ways to say it', value: alternatives.length ? <ul className="cw-plain-list">{alternatives.map((value) => <li key={value} lang="xsm">{value}</li>)}</ul> : null },
            { label: 'Kind', value: type === 'expression' ? (EXPRESSION_KINDS.find((kind) => kind.id === expression.kind)?.label ?? text(expression.kind)) : '' },
            { label: 'Literally', value: text(expression.literalTranslation) || text(item.literalTranslation) },
            { label: 'When it is said', value: text(expression.context) || text(item.usageContext) },
            { label: 'Word class', value: type === 'word' || type === 'saying' ? text(item.format) : '' },
            { label: 'Meanings', value: senses.length > 1 ? <ol className="rv-senses">{senses.map((sense, index) => <li key={index}>{text(sense.definition)}{sense.examples?.[0]?.kasem ? <span className="cw-table__sub" lang="xsm">{sense.examples[0].kasem}{sense.examples[0].english ? ` — ${sense.examples[0].english}` : ''}</span> : null}</li>)}</ol> : null },
            { label: 'Example', value: text(item.kasemExample) ? <><span lang="xsm">{text(item.kasemExample)}</span>{text(item.englishExample) ? <span className="cw-table__sub">{text(item.englishExample)}</span> : null}</> : null },
            { label: 'Pronunciation (IPA)', value: text(item.ipa) },
            { label: 'Meaning in Kasem', value: text(item.kasemDefinition), lang: 'xsm' },
            { label: 'Dialect', value: itemDialect(item) },
            { label: 'Source', value: [...new Set([EXPRESSION_SOURCES.find((entry) => entry.id === source.type)?.label ?? (source.type === 'invited-speaker' ? 'Invited contributor' : ''), text(source.detail) || text(item.sourceReferences) || text(item.source), text(source.speakerName) ? `Speaker: ${text(source.speakerName)}` : ''].filter(Boolean))].join(' · ') },
            { label: 'Text', value: type === 'post' || type === 'literature' ? <span className="rv-longtext">{text(item.body)}</span> : null },
            { label: 'Cultural context', value: text(item.culturalContext) },
          ]} />
          {item.media?.storagePath ? <Media path={item.media.storagePath} type={item.media.mediaType} label={`Attachment for ${itemTitle('contributions', item)}`} /> : null}
          {external ? <p><a href={external} target="_blank" rel="noreferrer" className="cw-text-link">Open the linked post<Icon name="external" /></a></p> : null}
        </div>
      </Panel>

      {item.revisionOf ? <PreviousRound item={item} /> : null}

      {type === 'word' || type === 'saying' ? <DictionaryCheck initial={text(item.body)} /> : null}

      <Panel title="Permissions and consent">
        <Facts variant="rows" items={[
          { label: 'Publication', value: yesNo(item.permissions?.publication, 'Allowed after review', 'Not allowed — can only be kept') },
          { label: 'AI training', value: yesNo(item.permissions?.aiTraining, 'Allowed if approved', 'Not allowed') },
          { label: 'Consent version', value: text(item.permissions?.consentVersion) },
          { label: 'Rights and participants', value: item.attestations ? Object.entries(item.attestations).map(([key, value]) => `${key.replace(/([A-Z])/g, ' $1').toLowerCase()}: ${value ? 'yes' : 'no'}`).join(' · ') : '' },
          { label: 'Disclosures', value: item.disclosures ? [item.disclosures.involvesMinors ? 'Involves minors' : '', item.disclosures.usesThirdPartyMaterial ? 'Uses third-party material' : '', text(item.disclosures.sourceInfo)].filter(Boolean).join(' · ') || 'None' : '' },
        ]} />
      </Panel>

      <ReviewTrail item={item} />
    </div>
  );
}

/** The previous round of a resubmitted item: what changed, and what the last reviewer said. */
function PreviousRound({ item }: { item: ReviewRecord }) {
  const review = useReview();
  const [previous, setPrevious] = useState<ReviewRecord | null | undefined>(undefined);
  useEffect(() => {
    let active = true;
    review.services.loadSubmission(String(item.revisionOf)).then((row) => { if (active) setPrevious(row); }).catch(() => { if (active) setPrevious(null); });
    return () => { active = false; };
  }, [item.revisionOf, review.services]);
  const feedback = text(item.previousReview?.feedback) || text(previous?.moderation?.feedback);
  const before = previous ? text(previous.expression?.phrase) || text(previous.body) : '';
  const after = text(item.expression?.phrase) || text(item.body);
  return (
    <Panel title="Changes since the last round" description="The contributor revised this after an earlier decision">
      <div className="cw-stack">
        {feedback ? <div className="cw-stack cw-stack--sm"><span className="rv-compare__label">What the last reviewer asked for</span><blockquote className="cw-quote cw-quote--warning">{feedback}</blockquote></div> : null}
        {previous === undefined ? <Skeleton lines={2} label="Loading the previous round" /> : previous ? (
          <div className="rv-diff">
            <div><span className="rv-compare__label">Before</span><p lang="xsm" className={cx('rv-diff__text', before !== after && 'is-old')}>{before || '—'}</p></div>
            <div><span className="rv-compare__label">Now</span><p lang="xsm" className={cx('rv-diff__text', before !== after && 'is-new')}>{after || '—'}</p></div>
          </div>
        ) : <p className="cw-muted">The previous round could not be loaded.</p>}
        {before && before === after ? <p className="cw-small cw-text-warning">The Kasem is unchanged from the last round. Check the other details and the note.</p> : null}
      </div>
    </Panel>
  );
}

/** What has already happened to this item, from its own record. */
function ReviewTrail({ item }: { item: ReviewRecord }) {
  const moderation = (item.moderation ?? {}) as Record<string, any>;
  const rows = [
    { label: 'Current status', value: statusLabel(item.status).label },
    { label: 'Last decision', value: moderation.decidedAt ? new Date(moderation.decidedAt?.toMillis?.() ?? moderation.decidedAt).toLocaleString() : '' },
    { label: 'Last feedback', value: text(moderation.feedback) },
    { label: 'Checklist recorded', value: moderation.scores ? Object.entries(moderation.scores).map(([key, value]) => `${key}: ${value ? 'meets' : 'needs work'}`).join(' · ') : '' },
  ];
  if (!rows.slice(1).some((row) => row.value)) return null;
  return <Panel title="Review record"><Facts variant="rows" items={rows} /></Panel>;
}

function DictionaryCheck({ initial }: { initial: string }) {
  const review = useReview();
  const [spelling, setSpelling] = useState(initial);
  const [matches, setMatches] = useState<PublishedHeadword[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <Panel title="Check the dictionary" description="A matching spelling may be the same word, or a different word spelled alike">
      <form className="cw-stack cw-stack--sm" role="search" onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true); setError('');
        try { setMatches(await review.services.lookupHeadwords(spelling)); } catch { setError('The dictionary could not be checked. Try again.'); } finally { setBusy(false); }
      }}>
        <label className="cw-field-label" htmlFor="dictionary-check">Spelling</label>
        <div className="cw-row rv-check-row">
          <input id="dictionary-check" lang="xsm" value={spelling} onChange={(event) => setSpelling(event.target.value)} />
          <button type="submit" disabled={busy || !spelling.trim()}>{busy ? 'Checking…' : 'Check'}</button>
        </div>
        {error ? <p className="cw-field__error" role="alert">{error}</p> : null}
        {matches ? (matches.length ? (
          <ul className="cw-plain-list">{matches.map((entry) => <li key={entry.id}><span lang="xsm">{entry.kasemText}</span>{entry.homographIndex ? <sup>{entry.homographIndex}</sup> : null} — {entry.englishText}{entry.partOfSpeech ? ` (${entry.partOfSpeech})` : ''}</li>)}</ul>
        ) : <p className="cw-muted cw-small">No published word has this spelling.</p>) : null}
      </form>
    </Panel>
  );
}

function RecordingMaterial({ item }: { item: ReviewRecord }) {
  return (
    <div className="cw-stack cw-stack--lg">
      <Panel title="The recording">
        <div className="cw-stack">
          <Comparison left={{ label: 'Dictionary word', value: text(item.headword), lang: 'xsm' }} right={{ label: 'Meaning', value: text(item.meaning) }} />
          {item.storagePath ? <Media path={String(item.storagePath)} type="audio" label={`Recording of ${text(item.headword)}`} /> : <Notice tone="warning" title="No audio file is attached">This recording cannot be approved without its audio.</Notice>}
          <Facts variant="rows" items={[
            { label: 'Length', value: item.durationMs ? `${(Number(item.durationMs) / 1000).toFixed(1)} seconds` : '' },
            { label: 'Publication', value: item.publishConsent === true ? 'The speaker allows publication with the word' : 'Keep for review only' },
            { label: 'Recorded from', value: item.source === 'learn_speak' ? 'Speak practice in the app' : item.source === 'contributor_portal' ? 'The contributor workspace' : text(item.source) },
            { label: 'Automated assessment', value: 'None — a person decides. Nothing scores Kasem speech automatically.' },
          ]} />
        </div>
      </Panel>
    </div>
  );
}

const GENERIC_LABELS: Record<string, string> = {
  name: 'Name', requestedName: 'Name', meaning: 'Meaning', note: 'Note', gender: 'Gender', origin: 'Origin', handle: 'Handle',
  headline: 'Headline', description: 'Description', placements: 'Where it runs', regions: 'Regions', durationDays: 'Duration (days)', ctaLabel: 'Button label',
};

function GenericMaterial({ desk, item }: { desk: Desk; item: ReviewRecord }) {
  const keys = Object.keys(GENERIC_LABELS).filter((key) => item[key] !== undefined && item[key] !== null && item[key] !== '');
  const value = (raw: unknown): ReactNode => Array.isArray(raw) ? raw.join(', ') : typeof raw === 'object' ? JSON.stringify(raw) : String(raw);
  const attachment = desk === 'adverts' ? item.creative : item.media;
  const external = safeUrl(item.externalPostUrl || item.ctaUrl);
  return (
    <div className="cw-stack cw-stack--lg">
      <Panel title={desk === 'adverts' ? 'The advert' : 'The request'}>
        <div className="cw-stack">
          <Facts variant="rows" items={[
            ...keys.map((key) => ({ label: GENERIC_LABELS[key], value: value(item[key]) })),
            ...(desk === 'adverts' ? [
              { label: 'Daily budget', value: item.dailyBudgetPesewas ? `GH₵${(Number(item.dailyBudgetPesewas) / 100).toFixed(2)}` : '' },
              { label: 'Total budget', value: item.totalBudgetPesewas ? `GH₵${(Number(item.totalBudgetPesewas) / 100).toFixed(2)}` : '' },
              { label: 'Payment', value: text(item.payment?.status) || 'Unpaid' },
            ] : []),
          ]} />
          {attachment?.storagePath ? <Media path={attachment.storagePath} type={attachment.mediaType} label={itemTitle(desk, item)} /> : null}
          {external ? <p><a href={external} target="_blank" rel="noreferrer" className="cw-text-link">Open the destination<Icon name="external" /></a></p> : null}
        </div>
      </Panel>
    </div>
  );
}

function Media({ path, type, label }: { path: string; type: string; label: string }) {
  const review = useReview();
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setUrl(''); setError('');
    review.services.mediaUrl(path).then((value) => { if (active) setUrl(value); }).catch(() => { if (active) setError('The attachment could not be loaded. Listen to or view it before deciding.'); });
    return () => { active = false; };
  }, [attempt, path, review.services]);
  if (error) return <Notice tone="warning" title="Attachment unavailable" action={<button type="button" onClick={() => setAttempt((count) => count + 1)}>Retry</button>}>{error}</Notice>;
  if (!url) return <Skeleton lines={1} label="Loading the attachment" />;
  if (type === 'audio') return <div className="rv-media"><span className="rv-compare__label">Recording</span><audio controls preload="metadata" src={url} aria-label={label} /></div>;
  if (type === 'video') return <video className="rv-media__visual" controls playsInline src={url} aria-label={label} />;
  if (type === 'image') return <img className="rv-media__visual" src={url} alt={label} />;
  return <a href={url} target="_blank" rel="noreferrer" className="cw-text-link">Open the attachment<Icon name="external" /></a>;
}

// ---------------------------------------------------------------------------
// The decision
// ---------------------------------------------------------------------------

type RubricAnswer = 'meets' | 'needs' | 'unsure';

function DecisionPanel({ desk, item, onDecided, onDeciding }: { desk: Desk; item: ReviewRecord; onDecided: (message: string) => void; onDeciding: (active: boolean) => void }) {
  const review = useReview();
  const actions = decisionsFor(desk, item);
  const own = item.authUid === review.uid || item.uid === review.uid;
  const rubric = useMemo(() => rubricFor(desk, item), [desk, item]);
  const [decision, setDecision] = useState('');
  const [feedback, setFeedback] = useState('');
  const [answers, setAnswers] = useState<Record<string, RubricAnswer>>({});
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [problem, setProblem] = useState('');
  // Kept apart from `problem`: the status change that caused a conflict also
  // resets the form, and the reviewer must still be told what happened.
  const [conflict, setConflict] = useState('');
  const conflictNote = useRef<HTMLDivElement>(null);
  const sending = useRef(false);
  // The reviewer is usually at the foot of the panel when it happens.
  useEffect(() => { if (conflict) conflictNote.current?.focus(); }, [conflict]);
  // A new status means a new set of possible decisions; start again.
  useEffect(() => { setDecision(''); setConfirming(false); setProblem(''); }, [item.status]);

  if (own) {
    return (
      <Panel title="Decision">
        <Notice tone="warning" title="This is your own submission">Another reviewer must decide it. The review system refuses decisions on your own work.</Notice>
      </Panel>
    );
  }
  if (!actions.length) {
    return (
      <Panel title="Decision">
        {conflict ? <div ref={conflictNote} tabIndex={-1} className="rv-conflict"><Notice tone="warning" role="alert" title="Someone else got there first"><p>{conflict}</p></Notice></div> : null}
        <p className="cw-muted">No decision can be recorded while it is “{statusLabel(item.status).label}”.{item.status === 'PUBLISHED' ? ' Taking published work down is done from the admin console.' : ''}</p>
      </Panel>
    );
  }

  const needsFeedback = NEEDS_FEEDBACK.has(decision);
  // What each decision callable keeps: submissions 2,000 characters, the rest 1,000.
  const feedbackLimit = desk === 'contributions' ? 2000 : 1000;
  const snippets = needsFeedback ? FEEDBACK_SNIPPETS.return : ['APPROVE', 'approve'].includes(decision) ? FEEDBACK_SNIPPETS.approve : [];
  const concerns = rubric.filter((criterion) => answers[criterion.id] === 'needs');
  const label = decisionLabel(desk, decision, item);

  const start = () => {
    if (!decision) { setProblem('Choose a decision.'); return; }
    if (needsFeedback && feedback.trim().length < FEEDBACK_MINIMUM) {
      setProblem(`Write at least ${FEEDBACK_MINIMUM} characters of feedback, so the contributor knows what to change.`);
      document.getElementById('decision-feedback')?.focus();
      return;
    }
    setProblem('');
    setError('');
    setConfirming(true);
  };

  const record = async () => {
    if (sending.current || busy) return;
    sending.current = true;
    setBusy(true);
    setError('');
    setConflict('');
    onDeciding(true);
    try {
      const scores = Object.fromEntries(Object.entries(answers).filter(([, value]) => value !== 'unsure').map(([key, value]) => [key, value === 'meets' ? 1 : 0]));
      // Publishing keeps what the approval chose a dictionary answer to become.
      const { target, entryId } = publishTarget(decision, item);
      const request = decisionRequest(desk, item, decision, feedback, target, entryId, {
        expectedStatus: item.status,
        expectedVersion: typeof item.lifecycle?.version === 'number' ? item.lifecycle.version : undefined,
        scores,
      });
      await review.services.call(request.callable, request.data);
      setConfirming(false);
      setFeedback('');
      setAnswers({});
      onDecided(`Recorded: ${label}`);
    } catch (reason) {
      onDeciding(false);
      const outcome = decisionError(reason);
      if (outcome.conflict) {
        setConfirming(false);
        setConflict(/not recorded/i.test(outcome.message) ? outcome.message : `${outcome.message} Nothing you chose was recorded.`);
      } else setError(outcome.message);
    } finally {
      sending.current = false;
      setBusy(false);
    }
  };

  return (
    <Panel title="Decision" description="Nothing is recorded until you confirm" className="rv-decision">
      <div className="cw-stack">
        {conflict ? (
          <div ref={conflictNote} tabIndex={-1} className="rv-conflict">
            <Notice tone="warning" role="alert" title="Someone else got there first">
              <p>{conflict} The page now shows the latest version; check it before deciding again.</p>
            </Notice>
          </div>
        ) : null}
        {rubric.length ? (
          <fieldset className="rv-rubric">
            <legend className="cw-field-label">Quality checks <span className="cw-field__tag">Optional, saved with your decision</span></legend>
            {rubric.map((criterion) => (
              <div key={criterion.id} className="rv-rubric__row">
                <div className="rv-rubric__copy"><strong>{criterion.label}</strong><span>{criterion.hint}</span></div>
                <div className="cw-segmented" role="group" aria-label={criterion.label}>
                  {([['meets', 'Yes'], ['needs', 'No'], ['unsure', 'Can’t tell']] as [RubricAnswer, string][]).map(([value, text]) => (
                    <button key={value} type="button" aria-pressed={answers[criterion.id] === value} onClick={() => setAnswers((current) => ({ ...current, [criterion.id]: value }))}>{text}</button>
                  ))}
                </div>
              </div>
            ))}
            {concerns.length && ['APPROVE', 'PUBLISH'].includes(decision) ? <p className="cw-small cw-text-warning">You marked {concerns.length === 1 ? 'a check' : `${concerns.length} checks`} as not met. Approve only if you are sure it is acceptable.</p> : null}
          </fieldset>
        ) : null}

        <fieldset className="cw-field">
          <legend className="cw-field-label">Your decision</legend>
          <div className="cw-choices">
            {actions.map((value) => (
              <label key={value} className={cx('cw-choice-card', `cw-choice-card--${decisionTone(value) === 'neutral' ? 'success' : decisionTone(value)}`)}>
                <input type="radio" name="decision" value={value} checked={decision === value} disabled={busy} onChange={() => { setDecision(value); setProblem(''); setConflict(''); }} />
                <span><strong>{decisionLabel(desk, value, item)}</strong><span>{decisionHelp(desk, value, item)}</span></span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="cw-field">
          <label className="cw-field-label" htmlFor="decision-feedback">
            Feedback to the contributor <span className="cw-field__tag">{needsFeedback ? 'Required' : 'Optional'}</span>
          </label>
          {snippets.length ? (
            <div className="rv-snippets" role="group" aria-label="Insert a common reason">
              {snippets.map((snippet) => (
                <button key={snippet.label} type="button" className="cw-filter" disabled={busy} onClick={() => setFeedback((current) => `${current}${current && !current.endsWith(' ') ? ' ' : ''}${snippet.text}`)}>+ {snippet.label}</button>
              ))}
            </div>
          ) : null}
          <textarea id="decision-feedback" rows={5} maxLength={feedbackLimit} disabled={busy} value={feedback} aria-describedby="decision-feedback-hint" aria-invalid={Boolean(problem && needsFeedback && feedback.trim().length < FEEDBACK_MINIMUM)} onChange={(event) => { setFeedback(event.target.value); setProblem(''); }} />
          <p id="decision-feedback-hint" className="cw-field__hint">{needsFeedback ? 'Say what to change, specifically and kindly. The contributor sees exactly what you write.' : 'A short note helps the contributor learn what worked.'}</p>
          <Counter value={feedback} max={feedbackLimit} />
        </div>

        {problem ? <p className="cw-field__error" role="alert"><Icon name="alert" />{problem}</p> : null}
        <button type="button" className="button--primary cw-btn--block" disabled={busy} onClick={start}>Review decision…</button>
        <p className="cw-small cw-muted">You will see a summary before it is recorded. Decisions are recorded with your account and the time.</p>
      </div>

      <ConfirmDialog
        open={confirming}
        title={`${label}?`}
        confirmLabel={`Confirm: ${label}`}
        tone={decisionTone(decision) === 'danger' ? 'danger' : 'primary'}
        busy={busy}
        error={error || undefined}
        onCancel={() => { setConfirming(false); setError(''); }}
        onConfirm={() => void record()}
      >
        <p><strong lang="xsm">{itemTitle(desk, item)}</strong></p>
        <p>{decisionHelp(desk, decision, item)}</p>
        {feedback.trim() ? <div className="cw-stack cw-stack--sm"><span className="rv-compare__label">The contributor will read</span><blockquote className="cw-quote">{feedback.trim()}</blockquote></div> : null}
        {concerns.length && ['APPROVE', 'PUBLISH'].includes(decision) ? <Notice tone="warning" title="Checks not met">{concerns.map((criterion) => criterion.label).join('; ')}</Notice> : null}
      </ConfirmDialog>
    </Panel>
  );
}
