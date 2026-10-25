import { useCallback, useEffect, useId, useMemo, useRef, type JSX, type RefObject } from 'react';
import { computeVisibility, findField } from '@indigen-world/contracts/forms';
import type { AnswerValue, Answers, AttachmentRef } from '@indigen-world/contracts/forms';
import { RendererContext, focusTarget, type RendererContextValue } from './context';
import { Question } from './controls';
import { asAttachments, asEntries, cx, domId, groupLimits, indexIssues, isRecord, safePrefix, type GroupEntry, type SummaryItem } from './model';
import type { FormRendererProps } from './types';
import { useUploadManager } from './uploads';

const EMPTY: Answers = {};

/**
 * Renders a form definition for filling in (TribeStudio) or previewing (the
 * admin builder). Visibility and required-ness come only from the contract's
 * computeVisibility; hidden questions are not rendered, and their answers are
 * left in place for the contract to drop on submit.
 */
export function FormRenderer(props: FormRendererProps): JSX.Element {
  const {
    definition,
    answers,
    onChange,
    issues,
    disabled = false,
    mode = 'fill',
    sectionIds,
    uploads,
    renderKasemText,
    renderRecorder,
    idPrefix,
    errorFocusKey,
    headingLevel = 2,
    hideSectionTitles = false,
    onUploadingChange,
  } = props;
  const reactId = useId();
  const prefix = safePrefix(idPrefix ?? `iwf-${reactId}`);
  const current = isRecord(answers) ? (answers as Answers) : EMPTY;
  const visibility = useMemo(() => computeVisibility(definition, current), [definition, current]);

  // Changes are made against the latest answers, including ones this renderer
  // sent a moment ago and the parent has not rendered yet (finishing uploads).
  const latest = useRef<Answers>(current);
  latest.current = current;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const commit = useCallback((next: Answers) => {
    latest.current = next;
    onChangeRef.current(next);
  }, []);
  const setAnswer = useCallback((fieldId: string, value: AnswerValue) => {
    commit({ ...latest.current, [fieldId]: value });
  }, [commit]);

  const keyStore = useRef(new Map<string, string[]>());
  const keySequence = useRef(0);
  const newKey = useCallback(() => {
    keySequence.current += 1;
    return `entry${keySequence.current}`;
  }, []);
  const groupKeys = useCallback((groupId: string, length: number) => {
    const keys = keyStore.current.get(groupId) ?? [];
    if (keys.length === length) return keys;
    const next = keys.slice(0, length);
    while (next.length < length) next.push(newKey());
    keyStore.current.set(groupId, next);
    return next;
  }, [newKey]);
  const mutateGroup = useCallback((groupId: string, floor: number, change: (entries: GroupEntry[], keys: string[]) => void) => {
    const base = latest.current;
    const stored = asEntries(base[groupId]);
    const length = Math.max(stored.length, floor);
    const keys = [...groupKeys(groupId, length)];
    const entries: GroupEntry[] = Array.from({ length }, (_, index) => (index < stored.length ? stored[index] : {}));
    change(entries, keys);
    keyStore.current.set(groupId, keys);
    commit({ ...base, [groupId]: entries });
  }, [commit, groupKeys]);

  // Where a finished upload belongs: the question, or the group entry it was
  // started in (wherever that entry has moved since).
  const attach = useCallback((slot: string, attachment: AttachmentRef) => {
    const [fieldId, entryKey, subId] = slot.split(':');
    if (entryKey === undefined || subId === undefined) {
      const base = latest.current;
      commit({ ...base, [fieldId]: [...asAttachments(base[fieldId]), attachment] });
      return true;
    }
    const keys = keyStore.current.get(fieldId) ?? [];
    if (!keys.includes(entryKey)) return false;
    mutateGroup(fieldId, keys.length, (entries, list) => {
      const at = list.indexOf(entryKey);
      if (at < 0) return;
      const entry: GroupEntry = isRecord(entries[at]) ? entries[at] : {};
      entries[at] = { ...entry, [subId]: [...asAttachments(entry[subId]), attachment] };
    });
    return true;
  }, [commit, mutateGroup]);

  const uploadManager = useUploadManager({ adapter: uploads, preview: mode === 'preview', attach, onUploadingChange });

  const wanted = sectionIds ? new Set(sectionIds) : null;
  const sections = definition.sections.filter((section) => visibility.sections[section.id] && (!wanted || wanted.has(section.id)));
  const rendered = new Set(sections.map((section) => section.id));
  const issueList = Array.isArray(issues) ? issues : [];
  const entryCount = (groupId: string) => {
    const field = findField(definition, groupId);
    if (!field) return 0;
    return Math.max(asEntries(current[groupId]).length, groupLimits(field, visibility.required[groupId] === true).floor);
  };
  const issueIndex = indexIssues(definition, issueList, visibility, rendered, entryCount);

  // Focus the summary when problems appear, and again whenever the caller
  // changes errorFocusKey (a failed Next or Submit).
  const summaryRef = useRef<HTMLDivElement>(null);
  const hadIssues = useRef(false);
  const focusKey = useRef(errorFocusKey);
  const hasIssues = issueIndex.summary.length > 0;
  useEffect(() => {
    const keyChanged = focusKey.current !== errorFocusKey;
    focusKey.current = errorFocusKey;
    const appeared = !hadIssues.current && mode === 'fill';
    hadIssues.current = hasIssues;
    if (hasIssues && (appeared || keyChanged) && summaryRef.current) {
      summaryRef.current.focus({ preventScroll: true });
      summaryRef.current.scrollIntoView?.({ block: 'start' });
    }
  }, [hasIssues, errorFocusKey, mode]);

  const context: RendererContextValue = {
    prefix,
    mode,
    disabled,
    visibility,
    issues: issueIndex,
    headingLevel,
    renderKasemText,
    renderRecorder,
    uploads: uploadManager,
    setAnswer,
    groupKeys,
    newKey,
    mutateGroup,
  };
  const SectionHeading = (headingLevel === 2 ? 'h2' : 'h3') as 'h2' | 'h3';

  return (
    <RendererContext.Provider value={context}>
      <div className={cx('iwf-form', mode === 'preview' && 'iwf-form--preview', disabled && 'is-disabled')} data-mode={mode}>
        {hasIssues ? <ErrorSummary items={issueIndex.summary} prefix={prefix} level={headingLevel} summaryRef={summaryRef} /> : null}
        {sections.length === 0 ? <p className="ts-hint iwf-empty">There are no questions to show.</p> : null}
        {sections.map((section) => {
          const titleId = `${prefix}--section-${section.id}`;
          const showTitle = !hideSectionTitles && Boolean(section.title);
          const fields = section.fields.filter((field) => visibility.fields[field.id]);
          return (
            <section key={section.id} className="iwf-section" aria-labelledby={showTitle ? titleId : undefined} data-section-id={section.id}>
              {showTitle || (!hideSectionTitles && section.description) ? (
                <header className="iwf-section__head">
                  {showTitle ? <SectionHeading id={titleId} className="iwf-section__title">{section.title}</SectionHeading> : null}
                  {!hideSectionTitles && section.description ? <p className="iwf-section__desc">{section.description}</p> : null}
                </header>
              ) : null}
              <div className="iwf-section__fields">
                {fields.map((field) => (
                  <Question
                    key={field.id}
                    field={field}
                    path={field.id}
                    slot={field.id}
                    value={current[field.id]}
                    required={visibility.required[field.id] === true}
                    onChange={(value) => setAnswer(field.id, value)}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </RendererContext.Provider>
  );
}

function ErrorSummary({ items, prefix, level, summaryRef }: { items: SummaryItem[]; prefix: string; level: 2 | 3; summaryRef: RefObject<HTMLDivElement | null> }) {
  const Heading = (level === 2 ? 'h2' : 'h3') as 'h2' | 'h3';
  const titleId = `${prefix}--summary`;
  return (
    <div className="iwf-summary" ref={summaryRef} tabIndex={-1} aria-labelledby={titleId}>
      <div role="alert">
        <Heading id={titleId} className="iwf-summary__title">
          {items.length === 1 ? 'Fix 1 problem before you continue' : `Fix ${items.length} problems before you continue`}
        </Heading>
        <ul className="iwf-summary__list">
          {items.map((item) => {
            const text = item.label ? `${item.label}: ${item.message}` : item.message;
            if (!item.target) return <li key={item.key}>{text}</li>;
            const id = domId(prefix, item.target);
            return (
              <li key={item.key}>
                <a
                  href={`#${id}`}
                  onClick={(event) => {
                    event.preventDefault();
                    focusTarget(document.getElementById(id));
                  }}
                >
                  {text}
                </a>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
