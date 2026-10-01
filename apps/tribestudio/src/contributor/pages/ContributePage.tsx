import { useMemo } from 'react';
import { Icon, Notice, PageHeader, cx, type IconName } from '../components';
import { itemStatus, nextContribution, pluralise } from '../model';
import { TYPE_META, type ContributionType } from '../submissions';
import { loadExpressionDraft } from '../../creator/expressions-data';
import { ExpressionFlow } from '../contribute/ExpressionFlow';
import { WordFlow } from '../contribute/WordFlow';
import { RecordingFlow } from '../contribute/RecordingFlow';
import { PortalLink, useWorkspace } from '../workspace';
import { currentAssignment } from './OverviewPage';

interface Option {
  type: ContributionType;
  title: string;
  description: string;
  fields: string;
  href: string;
  action: string;
  note?: string;
  icon: IconName;
  primary?: boolean;
}

/**
 * Start a contribution: the kinds of work this workspace can send, each with
 * its own short form. Only kinds the backend accepts from a contributor
 * account are offered, and the page says plainly what is not collected here.
 */
export function ContributePage({ type, correct, entry }: { type: string; correct: string; entry: string }) {
  if (type === 'expression') return <ExpressionFlow correct={correct} />;
  if (type === 'word') return <WordFlow />;
  if (type === 'recording') return <RecordingFlow entry={entry} />;
  return <ContributeChooser />;
}

function ContributeChooser() {
  const data = useWorkspace();
  const work = useMemo(() => currentAssignment(data.works, data.items), [data.items, data.works]);
  const next = work ? nextContribution(data.items[work.id] ?? []) : undefined;
  const openTasks = data.works.filter((entry) => (data.items[entry.id] ?? []).some((item) => ['not_started', 'draft', 'unsure'].includes(itemStatus(item)))).length;
  const expressionDraft = useMemo(() => loadExpressionDraft(data.uid), [data.uid]);
  const wordDraft = useMemo(() => { try { return Boolean(window.localStorage.getItem(`contributor-word-draft:${data.uid}`)); } catch { return false; } }, [data.uid]);

  const options: Option[] = [
    {
      type: 'assigned',
      title: 'Translate an assigned task',
      description: 'Translate the English expressions the team has assigned to you into natural Kasem.',
      fields: 'English source (given) · your Kasem · other ways to say it · when it is said',
      href: work && next ? data.paths.work(work.id, next.id) : data.paths.section('assignments'),
      action: work && next ? `Continue “${work.title}”` : 'Open tasks',
      note: data.works.length ? (openTasks ? `${pluralise(openTasks, 'task')} with work remaining` : 'Every task is submitted') : 'No tasks assigned to you yet',
      icon: TYPE_META.assigned.icon,
      primary: Boolean(openTasks),
    },
    {
      type: 'expression',
      title: 'Share an everyday expression',
      description: 'A greeting, blessing, idiom or saying you know well, with what it means and when it is said.',
      fields: 'Kasem · meaning · when it is said · dialect · where you learned it',
      href: data.paths.section('contribute', { type: 'expression' }),
      action: expressionDraft ? 'Continue your draft' : 'Share an expression',
      note: expressionDraft ? 'You have a draft saved in this browser' : TYPE_META.expression.destination,
      icon: TYPE_META.expression.icon,
    },
    {
      type: 'word',
      title: 'Add a dictionary word',
      description: 'A single Kasem word with its meaning and, if you can, an example sentence and a recording.',
      fields: 'Kasem word · word class · meaning · example · source',
      href: data.paths.section('contribute', { type: 'word' }),
      action: wordDraft ? 'Continue your draft' : 'Add a word',
      note: wordDraft ? 'You have a draft saved in this browser' : TYPE_META.word.destination,
      icon: TYPE_META.word.icon,
    },
    {
      type: 'recording',
      title: 'Record how a word is said',
      description: 'Choose a word already in the dictionary and record yourself saying it.',
      fields: 'A published word · your recording · publication choice',
      href: data.paths.section('contribute', { type: 'recording' }),
      action: 'Record a word',
      note: TYPE_META.recording.destination,
      icon: TYPE_META.recording.icon,
    },
  ];

  return (
    <div className="cw-page">
      <PageHeader
        title="Start a contribution"
        description="Choose what you want to add. Each kind has its own short form, and a Kasem-speaking reviewer checks everything before it is published."
      />
      <ul className="cw-options">
        {options.map((option) => (
          <li key={option.type} className={cx('cw-option', option.primary && 'is-primary')}>
            <span className="cw-option__icon" aria-hidden="true"><Icon name={option.icon} /></span>
            <div className="cw-option__copy">
              <h2>{option.title}</h2>
              <p>{option.description}</p>
              <p className="cw-option__fields"><span className="cw-sr">You will be asked for: </span>{option.fields}</p>
            </div>
            <div className="cw-option__foot">
              {option.note ? <span className="cw-small cw-muted">{option.note}</span> : <span />}
              <PortalLink to={option.href} className={cx('cw-btn cw-btn--sm', option.primary && 'cw-btn--primary')}>{option.action}<Icon name="arrow" className="cw-icon--sm" /></PortalLink>
            </div>
          </li>
        ))}
      </ul>
      <Notice tone="neutral" title="Complete sentences and longer texts">
        <p>These are collected through assigned tasks for now. There is no open form for them in this workspace yet. If you have material you would like to share, use Report a problem on the Guidelines page and the team will get back to you.</p>
      </Notice>
    </div>
  );
}
