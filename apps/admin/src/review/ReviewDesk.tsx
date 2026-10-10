import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { queuesChanged } from '../attention';
import { NOUN_FORM_SLOTS, OTHER_FORM_SLOTS, pronounCheck } from '../creators/kasem-morphology';
import { dateOnly, dateTime, errorMessage, isStaleDecision } from '../finance/data';
import { useLeaveGuard, useRouter } from '../router';
import { confirmAction } from '../ui/dialogs';
import { Icon, type IconName } from '../ui/icons';
import {
  Badge,
  Button,
  EmptyState,
  Field,
  IconButton,
  LoadFailure,
  Notice,
  PageHeader,
  PermissionState,
  SearchField,
  Select,
  Skeleton,
  Toast,
  cx,
} from '../ui/primitives';
import {
  CATEGORY_META,
  PUBLISH_AS_OPTIONS,
  SCOPE_LABEL,
  STATUS_LABEL,
  canRequestRevision,
  categoryOf,
  contributorName,
  decideReview,
  fetchScope,
  isExpression,
  isQueueAnswer,
  mediaUrl,
  minorsDisclosure,
  publicationConsent,
  statusTone,
  thirdPartyDisclosure,
  titleOf,
  trainingConsent,
  type Category,
  type DecisionInput,
  type ReviewScope,
  type ReviewSubmission,
} from './data';

/* ==========================================================================
   One queue, one submission at a time. Every kind of contribution meets here
   — expressions, dictionary words, word-queue answers, invited translations,
   Collection uploads and campaign work — and each keeps its own checks:
   an expression publishes as an expression and never as a dictionary word.
   Approval and publication stay separate decisions.
   ========================================================================== */

type Load = { state: 'loading' } | { state: 'ready'; rows: ReviewSubmission[]; capped: boolean } | { state: 'denied' } | { state: 'error'; message: string };

const SCOPE_INTRO: Record<ReviewScope, string> = {
  pending: 'Review submissions and publication permissions.',
  approved: 'Approved work waiting to be published, or archived when it may not be published.',
  published: 'Live work. Unpublishing returns it to Approved.',
  revision: 'Returned to contributors with feedback. They can correct and resubmit.',
  rejected: 'Declined with a reason the contributor can see.',
  archived: 'Approved work kept out of publication.',
};

export function ReviewDesk({ scope }: { scope: ReviewScope }) {
  const { params, setParams } = useRouter();
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [search, setSearch] = useState('');
  const [toast, setToast] = useState<{ message: string; tone: 'success' | 'info' | 'danger' } | null>(null);
  const category = (params.get('category') ?? 'all') as Category | 'all';
  const dialect = params.get('dialect') ?? 'all';
  const selectedId = params.get('item');
  const detailRef = useRef<HTMLDivElement>(null);

  const reload = useCallback(async () => {
    try {
      const { rows, capped } = await fetchScope(scope);
      setLoad({ state: 'ready', rows, capped });
    } catch (reason) {
      const code = (reason as { code?: string }).code ?? '';
      setLoad(/permission-denied/.test(code) ? { state: 'denied' } : { state: 'error', message: errorMessage(reason, 'The queue could not be loaded.') });
    }
  }, [scope]);
  useEffect(() => { setLoad({ state: 'loading' }); void reload(); }, [reload]);

  const rows = load.state === 'ready' ? load.rows : [];
  const dialects = useMemo(() => [...new Set(rows.map((row) => row.expression?.dialect ?? row.dialect).filter((value): value is string => Boolean(value)))].sort(), [rows]);
  const categories = useMemo(() => [...new Set(rows.map(categoryOf))], [rows]);
  const needle = search.trim().toLowerCase();
  const filtered = rows.filter((row) => {
    if (category !== 'all' && categoryOf(row) !== category) return false;
    if (dialect !== 'all' && (row.expression?.dialect ?? row.dialect) !== dialect) return false;
    if (!needle) return true;
    return [titleOf(row), row.title, row.body, row.englishSummary, row.expression?.meaning, row.id].some((value) => value?.toLowerCase().includes(needle));
  });
  const selected = rows.find((row) => row.id === selectedId) ?? null;

  // A wide screen opens the first submission, as the queue is read top-down.
  useEffect(() => {
    if (load.state !== 'ready' || selectedId || !filtered.length) return;
    if (window.matchMedia?.('(min-width: 1181px)').matches) setParams({ item: filtered[0].id });
  }, [filtered, load.state, selectedId, setParams]);

  const open = (row: ReviewSubmission) => {
    setParams({ item: row.id });
    if (!window.matchMedia?.('(min-width: 1181px)').matches) {
      window.requestAnimationFrame(() => detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    }
  };

  const afterDecision = async (message: string) => {
    const index = filtered.findIndex((row) => row.id === selectedId);
    const next = filtered[index + 1] ?? filtered[index - 1] ?? null;
    setToast({ message, tone: 'success' });
    queuesChanged();
    await reload();
    setParams({ item: next && next.id !== selectedId ? next.id : null });
  };

  return (
    <div className="ad-page">
      <PageHeader
        title={scope === 'pending' ? 'Review Desk' : SCOPE_LABEL[scope]}
        description={SCOPE_INTRO[scope]}
        actions={<Button icon="refresh" onClick={() => void reload()} disabled={load.state === 'loading'}>Refresh</Button>}
      />
      <div className="ad-toolbar">
        <Select label="Category" value={category} onChange={(value) => setParams({ category: value === 'all' ? null : value, item: null })}
          options={[{ value: 'all', label: 'All categories' }, ...(Object.keys(CATEGORY_META) as Category[]).filter((key) => categories.includes(key) || key === category).map((key) => ({ value: key, label: CATEGORY_META[key].label }))]} />
        <Select label="Dialect" value={dialect} onChange={(value) => setParams({ dialect: value === 'all' ? null : value, item: null })}
          options={[{ value: 'all', label: 'All dialects' }, ...dialects.map((value) => ({ value, label: value }))]} />
      </div>

      {load.state === 'loading' ? <div className="ad-card-box ad-card-box__body" style={{ paddingTop: 'var(--space-5)' }}><Skeleton title lines={6} label="Loading submissions" /></div> : null}
      {load.state === 'denied' ? <PermissionState body="The Review Desk needs a validator, reviewer or admin role." /> : null}
      {load.state === 'error' ? <LoadFailure title="The queue could not be loaded" body={load.message} onRetry={() => void reload()} compact={false} /> : null}

      {load.state === 'ready' ? (
        <>
          {load.capped ? <Notice tone="info">{scope === 'pending' ? `Showing the oldest ${rows.length} pending submissions. Decide these and the next ones load.` : `Showing the newest ${rows.length}.`}</Notice> : null}
          <div className="ad-desk ad-desk--wide-detail">
            <section className="ad-card-box ad-queue" aria-labelledby="queue-title">
              <div className="ad-card-box__head">
                <h2 id="queue-title" className="sr-only">{SCOPE_LABEL[scope]} submissions</h2>
                <SearchField label="Find a submission" placeholder="Find a submission…" value={search} onChange={setSearch} />
              </div>
              {filtered.length ? (
                <ul className="ad-queue__list" aria-labelledby="queue-title">
                  {filtered.map((row) => {
                    const kind = CATEGORY_META[categoryOf(row)];
                    const active = row.id === selectedId;
                    return (
                      <li key={row.id}>
                        <button type="button" className={cx('ad-queue__item', active && 'is-active')} aria-current={active ? 'true' : undefined} onClick={() => open(row)}>
                          <span className="ad-queue__icon" aria-hidden="true"><Icon name={kind.icon as IconName} /></span>
                          <span className="ad-queue__copy">
                            <strong lang={isExpression(row) ? 'xsm' : undefined}>{titleOf(row)}</strong>
                            <small>{kind.label} · {STATUS_LABEL[row.status] ?? row.status} · {dateOnly(row.lifecycle?.createdAt)}</small>
                          </span>
                          <Icon name="chevron" className="ad-queue__go" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : rows.length ? (
                <EmptyState compact icon="search" title="No submissions match" body="Try another search, category or dialect." />
              ) : (
                <EmptyState compact icon={scope === 'pending' ? 'check-circle' : 'inbox'} tone={scope === 'pending' ? 'success' : undefined}
                  title={scope === 'pending' ? 'The queue is clear' : `Nothing is ${SCOPE_LABEL[scope].toLowerCase()}`}
                  body={scope === 'pending' ? 'New contributions appear here as they are sent.' : undefined} />
              )}
            </section>
            <div ref={detailRef} className="ad-review-slot">
              {selected ? (
                <SubmissionDetail
                  key={`${selected.id}-${selected.status}-${selected.lifecycle?.version ?? 0}`}
                  submission={selected}
                  onClose={() => setParams({ item: null })}
                  onDecided={afterDecision}
                  onStale={async () => { await reload(); setToast({ message: 'This submission changed since you opened it. The latest version is shown.', tone: 'info' }); }}
                />
              ) : selectedId ? (
                <Notice tone="warning" title="That submission is not in this list">It may have moved to another status. Check the other Review Desk lists.</Notice>
              ) : filtered.length ? (
                <div className="ad-card-box"><EmptyState icon="doc" title="Choose a submission" body="Its content, consent and decision controls open here." /></div>
              ) : null}
            </div>
          </div>
        </>
      ) : null}
      {toast ? <Toast message={toast.message} tone={toast.tone} onDone={() => setToast(null)} /> : null}
    </div>
  );
}

/* -- Detail ------------------------------------------------------------------------------- */

function Meta({ icon, label, children }: { icon: IconName; label: string; children: ReactNode }) {
  return (
    <div className="ad-meta">
      <dt>{label}</dt>
      <dd><Icon name={icon} /><span>{children}</span></dd>
    </div>
  );
}

function Block({ label, children, lang }: { label: string; children: ReactNode; lang?: string }) {
  return (
    <div className="ad-block">
      <h3>{label}</h3>
      <div lang={lang}>{children}</div>
    </div>
  );
}

const CONSENT_COPY: Record<string, { label: string; tone: 'success' | 'neutral' | 'warning' | 'danger'; icon: IconName }> = {
  granted: { label: 'Granted', tone: 'success', icon: 'check-circle' },
  'not-granted': { label: 'Not granted', tone: 'neutral', icon: 'x-circle' },
  'not-declared': { label: 'Not declared', tone: 'warning', icon: 'help' },
  'not-asked': { label: 'Not asked', tone: 'neutral', icon: 'circle' },
  declared: { label: 'Declared', tone: 'warning', icon: 'alert' },
  'none-declared': { label: 'None declared', tone: 'neutral', icon: 'doc' },
  yes: { label: 'Involves minors', tone: 'warning', icon: 'users' },
  no: { label: 'None involved', tone: 'neutral', icon: 'users' },
};

function Consent({ label, value }: { label: string; value: string }) {
  const copy = CONSENT_COPY[value];
  return (
    <div className="ad-consent">
      <dt>{label}</dt>
      <dd><Icon name={copy.icon} className={`ad-consent__icon ad-consent__icon--${copy.tone}`} /><Badge tone={copy.tone === 'neutral' ? 'neutral' : copy.tone}>{copy.label}</Badge></dd>
    </div>
  );
}

function MediaPlayer({ submission }: { submission: ReviewSubmission }) {
  const media = submission.media;
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!media?.storagePath) return;
    let alive = true;
    mediaUrl(media.storagePath).then((value) => { if (alive) setUrl(value); }, () => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [media?.storagePath]);
  if (!media?.storagePath && !submission.externalPostUrl) return null;
  return (
    <div className="ad-media">
      {media?.storagePath ? (
        failed ? <Notice tone="warning">The uploaded {media.mediaType ?? 'file'} could not be opened. <code>{media.storagePath}</code></Notice>
          : !url ? <Skeleton lines={1} label="Loading the upload" />
            : media.mediaType === 'audio' ? <audio controls preload="metadata" src={url} aria-label={`Recording for ${titleOf(submission)}`} />
              : media.mediaType === 'video' ? <video controls preload="metadata" src={url} aria-label={`Video for ${titleOf(submission)}`} />
                : media.mediaType === 'image' ? <img src={url} alt={submission.altText || `Image for ${titleOf(submission)}`} />
                  : <a href={url} target="_blank" rel="noreferrer" className="ts-link">Open the uploaded document <Icon name="external" /></a>
      ) : null}
      {media?.storagePath ? <p className="ts-hint">{media.mediaType ?? 'File'} · {media.mimeType ?? 'unknown type'}{media.sizeBytes ? ` · ${Math.round(media.sizeBytes / 1024).toLocaleString('en-GB')} KB` : ''}</p> : null}
      {submission.externalPostUrl ? <a href={submission.externalPostUrl} target="_blank" rel="noreferrer" className="ts-link">Open the submitted link <Icon name="external" /></a> : null}
    </div>
  );
}

/**
 * The paradigm a contributor recorded, and what the determiner rule makes of
 * it. A differing pronoun is a question, never a verdict: the rule is young
 * and the contributor is a speaker, so nothing here disables a decision.
 */
function LexicalForms({ forms }: { forms?: Record<string, string> }) {
  if (!forms) return null;
  const answered = [...NOUN_FORM_SLOTS, ...OTHER_FORM_SLOTS].filter((slot) => (forms[slot.id] ?? '').trim().length > 0);
  if (answered.length === 0) return null;
  const check = pronounCheck(forms.definite, forms.pronoun);
  const note = check.status === 'differs'
    ? `Said with “${check.article}”, so the rule expects “${check.expected}” — the contributor wrote “${check.given}”. Worth a look: either a slip, or an exception worth keeping.`
    : check.status === 'absent'
      ? `Said with “${check.article}”, so the pronoun would be “${check.expected}”. Not recorded — nothing to correct, only nothing to publish.`
      : null;
  return (
    <Block label="Forms recorded">
      <dl className="ad-forms">
        {answered.map((slot) => (
          <div key={slot.id}>
            <dt>{slot.label}</dt>
            <dd lang="xsm">{forms[slot.id]}{slot.id === 'pronoun' && check.status === 'agrees' ? <Badge tone="success" className="ad-forms__ok">matches “{check.article}”</Badge> : null}</dd>
          </div>
        ))}
      </dl>
      {note ? <Notice tone={check.status === 'differs' ? 'warning' : 'neutral'}>{note}</Notice> : null}
    </Block>
  );
}

const EXPRESSION_KIND_LABELS: Record<string, string> = { phrase: 'Everyday phrase or greeting', idiom: 'Idiom', proverb: 'Proverb or saying' };
const EXPRESSION_SOURCE_LABELS: Record<string, string> = {
  self: 'The contributor says it themselves',
  family: 'A family member',
  elder: 'An elder or knowledge holder',
  community: 'Someone in their community',
  written: 'A book or written source',
  recording: 'A recording or broadcast',
  'invited-speaker': 'Invited Kasem speaker',
};

function ContentBlocks({ s }: { s: ReviewSubmission }) {
  if (isExpression(s)) {
    const expression = s.expression;
    const alternatives = expression?.alternatives ?? [];
    const source = expression?.source;
    return (
      <>
        <Block label="Meaning (English)">{expression?.meaning ?? s.title ?? '—'}</Block>
        {alternatives.length ? <Block label="Other ways of saying it" lang="xsm">{alternatives.join(' · ')}</Block> : null}
        {expression?.literalTranslation ?? s.literalTranslation ? <Block label="Word for word">{expression?.literalTranslation ?? s.literalTranslation}</Block> : null}
        <Block label="When it is used">{expression?.context ?? s.usageContext ?? 'Not recorded'}</Block>
        <Block label="Kind">{EXPRESSION_KIND_LABELS[expression?.kind ?? s.lexicalKind ?? 'phrase'] ?? expression?.kind}</Block>
        <Block label="Source / attribution">
          {source ? <>{EXPRESSION_SOURCE_LABELS[source.type] ?? source.type} — {source.detail}</> : (s.sourceReferences || 'Not recorded')}
          {source?.speakerName ? <p className="ts-muted">Speaker named publicly: {source.speakerName}</p> : null}
        </Block>
        {expression?.consent ? <Block label="Contributor confirmed"><p>“{expression.consent.source}”</p><p>“{expression.consent.everyday}”</p></Block> : null}
        {s.translationNotes ? <Block label="Reviewer context">{s.translationNotes}</Block> : null}
        {s.revisionOf ? <Block label="Correction of">An earlier expression that was not accepted (<code>{s.revisionOf}</code>)</Block> : null}
        <Notice tone="info" icon="message">A published expression appears on the website as an expression. It never becomes a dictionary word.</Notice>
      </>
    );
  }
  return (
    <>
      {s.englishSummary ? <Block label="English summary">{s.englishSummary}</Block> : null}
      {s.description ? <Block label="Description">{s.description}</Block> : null}
      {s.body ? <Block label={s.collectionKind === 'dictionary' || isQueueAnswer(s) ? 'Kasem' : 'Content'} lang={s.collectionKind === 'dictionary' || isQueueAnswer(s) ? 'xsm' : undefined}><p className="ad-prewrap">{s.body}</p></Block> : null}
      {s.kasemExample ? <Block label="Kasem example" lang="xsm">{s.kasemExample}</Block> : null}
      {s.englishExample ? <Block label="English example">{s.englishExample}</Block> : null}
      <LexicalForms forms={s.forms} />
      {s.translation?.translatedContent ? <Block label="Translation"><p className="ad-prewrap">{s.translation.translatedContent}</p></Block> : null}
      {s.culturalContext ? <Block label="Cultural context">{s.culturalContext}</Block> : null}
      <Block label="Source / attribution">{s.sourceReferences || 'Not recorded'}</Block>
      {s.translationNotes ? <Block label="Reviewer context">{s.translationNotes}</Block> : null}
      {s.format || s.studioType ? <Block label="Format">{[s.format, s.studioType].filter(Boolean).join(' · ')}</Block> : null}
    </>
  );
}

const FEEDBACK_MAX = 2000;

function SubmissionDetail({ submission: s, onClose, onDecided, onStale }: {
  submission: ReviewSubmission;
  onClose: () => void;
  onDecided: (message: string) => Promise<void>;
  onStale: () => Promise<void>;
}) {
  const [who, setWho] = useState<{ name: string; handle: string } | null>(null);
  const [note, setNote] = useState('');
  const [becomes, setBecomes] = useState(s.moderation?.publishAs ?? 'headword');
  const [entryId, setEntryId] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [touched, setTouched] = useState(false);
  const pending = ['SUBMITTED', 'RESUBMITTED', 'UNDER_REVIEW'].includes(s.status);
  const category = CATEGORY_META[categoryOf(s)];
  const dialect = s.expression?.dialect ?? s.dialect;
  const publication = publicationConsent(s);
  const queue = isQueueAnswer(s);
  useLeaveGuard(note.trim().length > 0 && !busy, 'Your reviewer note is not saved. Leave this submission?');

  useEffect(() => {
    let alive = true;
    void contributorName(s.authUid).then((value) => { if (alive) setWho(value); });
    return () => { alive = false; };
  }, [s.authUid]);

  const run = async (decision: DecisionInput['decision'], done: string, confirm?: { title: string; body: ReactNode; label: string; danger?: boolean }) => {
    setTouched(true);
    setError('');
    const needsNote = decision === 'REQUEST_REVISION' || decision === 'REJECT';
    if (needsNote && note.trim().length < 5) {
      setError(decision === 'REJECT' ? 'Give the contributor a reason of at least five characters before rejecting.' : 'Tell the contributor what to change (at least five characters).');
      document.getElementById(`note-${s.id}`)?.focus();
      return;
    }
    const usesBecomes = queue && (decision === 'APPROVE' || decision === 'PUBLISH');
    if (usesBecomes && becomes === 'variant' && !entryId.trim()) {
      setError('A regional variant needs the dictionary entry it belongs to.');
      return;
    }
    if (confirm && !(await confirmAction({ title: confirm.title, body: confirm.body, confirmLabel: confirm.label, tone: confirm.danger ? 'danger' : 'primary' }))) return;
    setBusy(decision);
    try {
      await decideReview({ submission: s, decision, feedback: note.trim(), ...(usesBecomes ? { publishAs: becomes, entryId: entryId.trim() || undefined } : {}) });
      await onDecided(done);
    } catch (reason) {
      if (isStaleDecision(reason)) { await onStale(); return; }
      setError(errorMessage(reason, 'The decision could not be saved. Nothing was changed.'));
    } finally {
      setBusy(null);
    }
  };

  const title = titleOf(s);
  return (
    <article className="ad-detail ad-review" aria-labelledby={`review-${s.id}`}>
      <div className="ad-detail__head">
        <div className="ad-review__title">
          <h2 id={`review-${s.id}`} lang={isExpression(s) ? 'xsm' : undefined}>{title}</h2>
          <Badge tone={statusTone(s.status)}>{STATUS_LABEL[s.status] ?? s.status}</Badge>
        </div>
        <IconButton icon="close" label="Close submission" onClick={onClose} />
      </div>

      <dl className="ad-meta-row">
        <Meta icon="user" label="Contributor">{who?.name || (s.contributorPortal?.contributorId ? 'Invited contributor' : `Account …${s.authUid.slice(-6)}`)}{who?.handle ? <small> @{who.handle}</small> : null}</Meta>
        <Meta icon={category.icon as IconName} label="Category">{category.label}</Meta>
        <Meta icon="calendar" label="Submitted">{dateOnly(s.lifecycle?.createdAt)}</Meta>
        <Meta icon="globe" label="Dialect">{dialect || 'Not specified'}</Meta>
      </dl>

      <MediaPlayer submission={s} />
      <div className="ad-review__content"><ContentBlocks s={s} /></div>

      <div className="ad-detail__section">
        <h3>Permissions</h3>
        <dl className="ad-consents">
          <Consent label="Publication" value={publication} />
          <Consent label="AI training" value={trainingConsent(s)} />
          <Consent label="Third-party material" value={thirdPartyDisclosure(s)} />
          <Consent label="Minors" value={minorsDisclosure(s)} />
        </dl>
        {s.disclosures?.sourceInfo ? <p className="ts-hint">Third-party source: {s.disclosures.sourceInfo}</p> : null}
      </div>

      {s.moderation?.feedback ? (
        <Notice tone={s.status === 'REJECTED' ? 'danger' : 'info'} title={pending ? 'Previous feedback' : 'Feedback sent to the contributor'}>
          {s.moderation.feedback}{s.moderation.decidedAt ? <span className="ts-muted"> · {dateTime(s.moderation.decidedAt)}</span> : null}
        </Notice>
      ) : null}

      {error ? <Notice tone="danger" role="alert">{error}</Notice> : null}

      {pending ? (
        <div className="ad-detail__section">
          {queue ? (
            <div className="ad-review__becomes">
              <Field label="Becomes" hint="What this word-queue answer turns into when approved.">
                <select className="ts-select" value={becomes} onChange={(event) => setBecomes(event.target.value)}>
                  {PUBLISH_AS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value} disabled={option.value === 'training' && s.permissions?.aiTraining !== true}>{option.label}</option>
                  ))}
                </select>
              </Field>
              {becomes === 'variant' || becomes === 'example' ? (
                <Field label="Dictionary entry ID" required={becomes === 'variant'} optional={becomes === 'example'} hint="For example collection_abc123.">
                  <input className="ts-input ts-input--mono" value={entryId} onChange={(event) => setEntryId(event.target.value)} />
                </Field>
              ) : null}
            </div>
          ) : null}
          <Field label="Reviewer note" hint="Required for a revision request or a rejection. The contributor sees it." counter={`${note.length.toLocaleString('en-GB')} / ${FEEDBACK_MAX.toLocaleString('en-GB')}`}
            error={touched && error && note.trim().length < 5 ? 'At least five characters.' : undefined}>
            <textarea id={`note-${s.id}`} className="ts-textarea" rows={3} maxLength={FEEDBACK_MAX} placeholder="Add feedback or a reason…" value={note} onChange={(event) => setNote(event.target.value)} />
          </Field>
          <div className="ad-detail__actions">
            <Button variant="primary" busy={busy === 'APPROVE'} disabled={Boolean(busy)} onClick={() => void run('APPROVE', `Approved “${title}”.`, {
              title: 'Approve this submission?',
              body: <p>Approval does not publish it. Approved work waits in <strong>Approved</strong> until it is published{publication === 'granted' ? '' : ' — and without publication permission it can only be archived'}.</p>,
              label: 'Approve',
            })}>Approve</Button>
            {canRequestRevision(s) ? (
              <Button variant="secondary" busy={busy === 'REQUEST_REVISION'} disabled={Boolean(busy)} onClick={() => void run('REQUEST_REVISION', `Revision requested for “${title}”.`)}>Request revision</Button>
            ) : null}
            <Button variant="danger-ghost" busy={busy === 'REJECT'} disabled={Boolean(busy)} onClick={() => void run('REJECT', `Rejected “${title}”.`, {
              title: 'Reject this submission?', body: <p>The contributor sees your reason{isExpression(s) ? ' and can correct the expression and send it again' : ''}.</p>, label: 'Reject', danger: true,
            })}>Reject</Button>
          </div>
          {!canRequestRevision(s) ? <p className="ts-hint">Collection uploads cannot be returned for revision; reject with a reason instead.</p> : null}
        </div>
      ) : s.status === 'APPROVED' ? (
        <div className="ad-detail__section">
          <h3>Publication</h3>
          {publication !== 'granted' ? <Notice tone="warning">The contributor has not granted publication permission, so this can only be archived.</Notice> : null}
          <div className="ad-detail__actions">
            <Button variant="primary" icon="send" busy={busy === 'PUBLISH'} disabled={Boolean(busy) || publication !== 'granted'} onClick={() => void run('PUBLISH', `Published “${title}”.`, {
              title: isExpression(s) ? 'Publish this expression?' : 'Publish to the Collection?',
              body: <p>{isExpression(s) ? 'It appears on the website as an expression.' : 'It becomes publicly visible in the Collection.'} You can unpublish it later.</p>,
              label: 'Publish',
            })}>{isExpression(s) ? 'Publish expression' : 'Publish to Collection'}</Button>
            <Button busy={busy === 'ARCHIVE'} disabled={Boolean(busy)} icon="archive" onClick={() => void run('ARCHIVE', `Archived “${title}”.`, {
              title: 'Archive this submission?', body: <p>It stays on record but is kept out of publication.</p>, label: 'Archive',
            })}>Archive</Button>
          </div>
        </div>
      ) : s.status === 'PUBLISHED' ? (
        <div className="ad-detail__section">
          <h3>Publication</h3>
          <div className="ad-detail__actions">
            <Button variant="danger-ghost" busy={busy === 'UNPUBLISH'} disabled={Boolean(busy)} onClick={() => void run('UNPUBLISH', `Unpublished “${title}”. It is back in Approved.`, {
              title: 'Unpublish this work?', body: <p>It is removed from public view and returns to Approved.</p>, label: 'Unpublish', danger: true,
            })}>Unpublish</Button>
          </div>
        </div>
      ) : (
        <p className="ts-hint">No decision is open for a submission that is {STATUS_LABEL[s.status]?.toLowerCase() ?? s.status.toLowerCase()}.</p>
      )}
      <p className="ts-hint">ID <code>{s.id}</code> · version {s.lifecycle?.version ?? '—'}</p>
    </article>
  );
}
