import { useMemo, useState } from 'react';
import {
  Badge,
  ConfirmDialog,
  EmptyState,
  Facts,
  Icon,
  Notice,
  PageHeader,
  Panel,
  Skeleton,
  Timeline,
  TypeTag,
  useNow,
  type TimelineEntry,
} from '../components';
import { formatDate, formatDateTime, friendlyError } from '../model';
import {
  ACTION_LABEL,
  STATE_META,
  TYPE_META,
  parseRowKey,
  receiptState,
  roundsFor,
  type SubmissionState,
} from '../submissions';
import { EXPRESSION_KINDS, EXPRESSION_SOURCES } from '../../creator/expressions-data';
import { PortalLink, useShared, useWorkspace } from '../workspace';
import { rowActionHref } from './OverviewPage';

const ROUND_STATE: Record<string, { label: string; tone: TimelineEntry['tone'] }> = {
  APPROVED: { label: 'Approved by a reviewer', tone: 'success' },
  PUBLISHED: { label: 'Published', tone: 'success' },
  REJECTED: { label: 'Returned with feedback', tone: 'warning' },
  NEEDS_REVISION: { label: 'Returned with feedback', tone: 'warning' },
  UNDER_REVIEW: { label: 'Passed to a specialist reviewer', tone: 'info' },
  ARCHIVED: { label: 'Kept, not published', tone: 'neutral' },
  WITHDRAWN: { label: 'Withdrawn', tone: 'neutral' },
};

const WITHDRAWABLE = new Set(['submitted', 'under_review', 'approved', 'published']);

/**
 * One piece of work: what was sent, what the reviewer said, every round it
 * went through, and the one thing that can happen next. Earlier versions of
 * an assigned translation stay visible: each review round is its own record.
 */
export function SubmissionDetail({ rowKey }: { rowKey: string }) {
  const data = useWorkspace();
  const { rows } = useShared();
  const now = useNow();
  const parsed = parseRowKey(rowKey);
  const row = rows.find((candidate) => candidate.key === rowKey);
  const [withdrawing, setWithdrawing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [withdrawn, setWithdrawn] = useState(false);
  const back = <PortalLink to={data.paths.section('contributions')}>My submissions</PortalLink>;
  const loading = data.worksState === 'loading' || data.itemsState === 'loading' || data.receiptsState === 'loading' || data.recordingsState === 'loading';

  const history = useMemo<TimelineEntry[]>(() => {
    if (!parsed) return [];
    if (parsed.type === 'assigned' && parsed.work && parsed.item) {
      const item = (data.items[parsed.work] ?? []).find((entry) => entry.id === parsed.item);
      const rounds = roundsFor(data.rounds, parsed.work, parsed.item);
      const entries: TimelineEntry[] = [];
      rounds.forEach((round, index) => {
        entries.push({
          id: `${round.id}:sent`, at: round.createdAt, tone: 'info',
          title: index ? `Version ${index + 1} resubmitted` : 'Version 1 sent for review',
          detail: round.kasem ? <span lang="xsm" className="cw-history-text">{round.kasem}</span> : undefined,
        });
        const decision = ROUND_STATE[round.status];
        if (decision && round.decidedAt) {
          entries.push({
            id: `${round.id}:decided`, at: round.decidedAt, tone: decision.tone, title: decision.label,
            detail: round.feedback ? <blockquote className="cw-quote">{round.feedback}</blockquote> : undefined,
          });
        }
      });
      if (!rounds.length && item?.submittedAt) entries.push({ id: 'sent', at: item.submittedAt, tone: 'info', title: 'Sent for review' });
      if (item?.skippedAt && item.unsure) entries.push({ id: 'unsure', at: item.skippedAt, tone: 'violet', title: 'Flagged as unsure' });
      return entries.sort((a, b) => b.at.localeCompare(a.at));
    }
    if (parsed.type === 'recording') {
      const recording = data.recordings.find((entry) => entry.id === parsed.id);
      if (!recording) return [];
      return [
        ...(recording.decidedAt ? [{
          id: 'decided', at: recording.decidedAt, tone: (recording.status === 'approved' ? 'success' : 'warning') as TimelineEntry['tone'],
          title: recording.status === 'approved' ? 'Approved by a reviewer' : 'Not accepted',
          detail: recording.decisionNote ? <blockquote className="cw-quote">{recording.decisionNote}</blockquote> : undefined,
        }] : []),
        { id: 'sent', at: recording.createdAt, tone: 'info' as const, title: 'Recorded and sent for review' },
      ];
    }
    const receipt = data.receipts.find((entry) => entry.id === parsed.id);
    if (!receipt) return [];
    const state = receiptState(receipt.status);
    return [
      ...(receipt.reviewedAt ? [{
        id: 'decided', at: receipt.reviewedAt, tone: (STATE_META[state].tone === 'danger' ? 'danger' : STATE_META[state].tone) as TimelineEntry['tone'],
        title: STATE_META[state].label,
        detail: receipt.reviewFeedback ? <blockquote className="cw-quote">{receipt.reviewFeedback}</blockquote> : undefined,
      }] : []),
      { id: 'sent', at: receipt.createdAt, tone: 'info' as const, title: receipt.revisionOf ? 'Correction sent for review' : 'Sent for review' },
    ];
  }, [data.items, data.receipts, data.recordings, data.rounds, parsed?.id, parsed?.item, parsed?.type, parsed?.work]);

  if (!parsed || (!row && !loading)) {
    return (
      <div className="cw-page">
        <PageHeader title="Submission not found" breadcrumb={back} />
        <EmptyState title="This submission is not available" icon="search" actions={<PortalLink to={data.paths.section('contributions')} className="cw-btn">Back to My submissions</PortalLink>}>
          It may have been withdrawn, or the link is out of date.
        </EmptyState>
      </div>
    );
  }
  if (!row) return <div className="cw-page"><PageHeader title="Loading submission…" breadcrumb={back} /><Panel><Skeleton lines={6} label="Loading submission" /></Panel></div>;

  const state: SubmissionState = withdrawn ? 'withdrawn' : row.state;
  const meta = STATE_META[state];
  const receipt = row.type === 'expression' || row.type === 'word' ? data.receipts.find((entry) => entry.id === row.id) : undefined;
  const recording = row.type === 'recording' ? data.recordings.find((entry) => entry.id === row.id) : undefined;
  const item = row.type === 'assigned' ? (data.items[row.work ?? ''] ?? []).find((entry) => entry.id === row.item) : undefined;
  const credit = row.type === 'assigned' ? data.credits.find((entry) => entry.work === row.work && entry.item === row.item) : undefined;
  const canWithdraw = Boolean(receipt && WITHDRAWABLE.has(receipt.status) && !withdrawn);
  const feedbackTone = state === 'returned' ? 'warning' : state === 'not_accepted' ? 'danger' : state === 'approved' || state === 'published' ? 'success' : '';

  const withdraw = async () => {
    if (!receipt || busy) return;
    setBusy(true);
    setError('');
    try {
      await data.services.withdrawContribution(receipt.id);
      setWithdrawn(true);
      setWithdrawing(false);
    } catch (reason) {
      setError(friendlyError(reason, 'Withdrawing').message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="cw-page cw-detail">
      <PageHeader
        breadcrumb={<>{back}<span aria-hidden="true">/</span><span aria-current="page">{TYPE_META[row.type].label}</span></>}
        title={<span lang={row.titleLang}>{row.title}</span>}
        meta={<>
          <TypeTag icon={TYPE_META[row.type].icon}>{TYPE_META[row.type].label}</TypeTag>
          <Badge tone={meta.tone}>{meta.label}</Badge>
          {row.submittedAt ? <span>Submitted <time dateTime={row.submittedAt} title={formatDateTime(row.submittedAt)}>{formatDate(row.submittedAt, true)}</time></span> : <span>Not sent yet</span>}
        </>}
        actions={<>
          {row.action && !withdrawn ? <PortalLink to={rowActionHref(row, data.paths)} className="cw-btn cw-btn--primary">{ACTION_LABEL[row.action]}</PortalLink> : null}
          {canWithdraw ? <button type="button" className="danger" onClick={() => setWithdrawing(true)}>{receipt?.status === 'published' ? 'Take it down' : 'Withdraw'}</button> : null}
        </>}
      />

      {withdrawn ? <Notice tone="success" role="status" title="Withdrawn">It is no longer in the review queue and is not published anywhere.</Notice> : null}
      {error ? <Notice tone="danger" title="That did not work">{error}</Notice> : null}

      <div className="cw-detail__grid">
        <div className="cw-stack cw-stack--lg">
          <Panel title="Where it stands">
            <div className="cw-stack cw-stack--sm">
              <p>{meta.description}</p>
              {row.type === 'assigned' && (state === 'approved' || state === 'published') ? (
                <p className="cw-muted cw-small">{credit ? (credit.points ? `${credit.points} points were added to your balance on ${formatDate(credit.day, true)}.` : `No points were added: the daily limit was already reached on ${formatDate(credit.day, true)}.`) : 'Points for this approval will appear in Rewards once they are recorded.'}</p>
              ) : null}
              {(state === 'approved' && row.type !== 'recording') ? <p className="cw-muted cw-small">{TYPE_META[row.type].destination}</p> : null}
              {row.type === 'recording' && recording?.status === 'approved' ? (
                <p className="cw-muted cw-small">{recording.outcome === 'attach_to_entry' ? 'It is now the pronunciation on the dictionary entry.' : recording.outcome === 'keep_as_additional' ? 'The entry already had a recording, so yours is kept as an additional take.' : 'You did not allow publication, so it is kept for review only.'}</p>
              ) : null}
            </div>
          </Panel>

          {row.feedback ? (
            <Panel title="Reviewer feedback" description={row.decidedAt ? `Decided ${formatDate(row.decidedAt, true)}` : undefined}>
              <blockquote className={`cw-quote${feedbackTone ? ` cw-quote--${feedbackTone}` : ''}`}>{row.feedback}</blockquote>
              {row.action === 'revise' ? <p className="cw-muted cw-small cw-detail__note">Revising creates a new review round. This version and its decision stay on record.</p> : null}
              {row.action === 'correct' ? <p className="cw-muted cw-small cw-detail__note">A correction is sent as a new expression linked to this one. You can correct each declined expression once.</p> : null}
            </Panel>
          ) : null}

          <Panel title="What you submitted">
            {row.type === 'assigned' ? (
              <Facts variant="rows" items={[
                { label: 'English', value: row.title },
                { label: 'Your Kasem', value: item?.translation || <span className="cw-muted">Not written yet</span>, lang: 'xsm' },
                { label: 'Other ways to say it', value: item?.alternatives.length ? <ul className="cw-plain-list">{item.alternatives.map((value) => <li key={value} lang="xsm">{value}</li>)}</ul> : null },
                { label: 'When it is said', value: item?.context },
                { label: 'Task', value: row.work ? <PortalLink to={data.paths.work(row.work, row.item)}>{row.context}</PortalLink> : row.context },
              ]} />
            ) : receipt ? (
              <Facts variant="rows" items={receipt.kind === 'expression' ? [
                { label: 'Expression', value: receipt.phrase, lang: 'xsm' },
                { label: 'Kind', value: EXPRESSION_KINDS.find((kind) => kind.id === receipt.expressionKind)?.label ?? receipt.expressionKind },
                { label: 'Meaning', value: receipt.meaning },
                { label: 'Literal meaning', value: receipt.literalTranslation },
                { label: 'When it is said', value: receipt.context },
                { label: 'Dialect', value: receipt.dialect },
                { label: 'Source', value: [EXPRESSION_SOURCES.find((source) => source.id === receipt.sourceType)?.label, receipt.sourceDetail, receipt.speakerName ? `Speaker: ${receipt.speakerName}` : ''].filter(Boolean).join(' · ') },
                { label: 'Publication', value: receipt.publicationPermission ? 'May be published after review' : 'Keep for review and research only' },
                { label: 'AI training', value: receipt.aiTraining ? 'Allowed if approved' : 'Not allowed' },
              ] : [
                { label: 'Word', value: receipt.phrase, lang: 'xsm' },
                { label: 'Word class', value: receipt.partOfSpeech },
                { label: 'Meaning', value: receipt.meaning },
                { label: 'Example in Kasem', value: receipt.exampleKasem, lang: 'xsm' },
                { label: 'Example in English', value: receipt.exampleEnglish },
                { label: 'Dialect', value: receipt.dialect },
                { label: 'Source', value: receipt.sourceDetail },
                { label: 'Pronunciation', value: receipt.hasAudio ? 'Recording attached' : 'No recording' },
                { label: 'Publication', value: receipt.publicationPermission ? 'May be published after review' : 'Keep for review and research only' },
              ]} />
            ) : recording ? (
              <Facts variant="rows" items={[
                { label: 'Word', value: recording.headword, lang: 'xsm' },
                { label: 'Meaning', value: recording.meaning },
                { label: 'Length', value: recording.durationMs ? `${(recording.durationMs / 1000).toFixed(1)} seconds` : '' },
                { label: 'Publication', value: recording.publishConsent ? 'May be published with the word' : 'Keep for review only' },
              ]} />
            ) : null}
          </Panel>
        </div>

        <Panel title="History" className="cw-detail__history">
          {history.length ? <Timeline entries={history} now={now} /> : <p className="cw-muted">{row.submittedAt ? 'History is loading.' : 'Nothing has been sent yet. Drafts are private to you.'}</p>}
          {receipt?.revisionOf ? <p className="cw-small cw-detail__note"><Icon name="revisions" className="cw-icon--sm" /> This corrects <PortalLink to={data.paths.section('contributions', { view: `${receipt.kind}.${receipt.revisionOf}` })}>an earlier expression</PortalLink>.</p> : null}
          {receipt?.correctedBy ? <p className="cw-small cw-detail__note"><Icon name="revisions" className="cw-icon--sm" /> You sent <PortalLink to={data.paths.section('contributions', { view: `${receipt.kind}.${receipt.correctedBy}` })}>a correction</PortalLink> of this expression.</p> : null}
        </Panel>
      </div>

      <ConfirmDialog
        open={withdrawing}
        title={receipt?.status === 'published' ? 'Take this down?' : 'Withdraw this submission?'}
        confirmLabel={receipt?.status === 'published' ? 'Take it down' : 'Withdraw'}
        tone="danger"
        busy={busy}
        error={error || undefined}
        onCancel={() => { setWithdrawing(false); setError(''); }}
        onConfirm={() => void withdraw()}
      >
        <p>{receipt?.status === 'published'
          ? 'It will be removed from Indigen World straight away. The review record stays, so the team can see what happened.'
          : 'It leaves the review queue and will not be published. This cannot be undone; you can send it again as a new contribution.'}</p>
      </ConfirmDialog>
    </div>
  );
}
