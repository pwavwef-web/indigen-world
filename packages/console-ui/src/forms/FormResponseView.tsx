import { useId, type JSX, type ReactNode } from 'react';
import { CONSENT_PURPOSES, computeVisibility, displayAnswer, isAnswered, topLevelFields } from '@indigen-world/contracts/forms';
import type { AnswerValue, Answers, AttachmentRef, ConsentRecord, FormField, Issue } from '@indigen-world/contracts/forms';
import { asAttachments, asEntries, asText, cx, formatBytes, formatDate, formatLabel, groupLimits, isRecord, sameAnswer } from './model';
import type { FormResponseViewProps, FormReviewSummaryProps } from './types';

/* Read-only answers: what reviewers decide on and what contributors check
   before they submit. Text is shown exactly as stored, with its line breaks. */

type HeadingTag = 'h2' | 'h3' | 'h4' | 'h5';
const tag = (level: number) => `h${Math.min(5, Math.max(2, level))}` as HeadingTag;

type OpenAttachment = (attachment: AttachmentRef & { fieldId: string }) => void;

interface ShowOptions {
  consent?: ConsentRecord;
  onOpen?: OpenAttachment;
  issuesAt?: (path: string) => string[];
  path: string;
}

function TextAnswer({ field, value }: { field: FormField; value: AnswerValue | undefined }) {
  const kasem = field.settings?.kasemKeyboard === true;
  return (
    <span className={cx('iwf-text', field.type === 'long_text' && 'iwf-text--long', kasem && 'iwf-kasem')} lang={kasem ? 'xsm' : undefined}>
      {asText(value)}
    </span>
  );
}

/** The answer's display, or null when there is no answer. */
function answerContent(field: FormField, value: AnswerValue | undefined, options: ShowOptions): ReactNode {
  switch (field.type) {
    case 'short_text':
    case 'long_text':
    case 'email':
    case 'url':
      return isAnswered(value) ? <TextAnswer field={field} value={value} /> : null;
    case 'number':
      return value === undefined || value === null || value === '' ? null : <span className="iwf-text">{asText(value)}</span>;
    case 'date':
      return typeof value === 'string' && value ? <time dateTime={value}>{formatDate(value)}</time> : null;
    case 'single_choice':
    case 'dropdown':
    case 'language':
    case 'dialect':
    case 'multiple_choice':
      return isAnswered(value) ? <span className="iwf-text">{displayAnswer(field, value as AnswerValue)}</span> : null;
    case 'checkbox':
      if (typeof value !== 'boolean') return null;
      return (
        <span className="iwf-tick-view">
          <span className={cx('iwf-state', value ? 'is-yes' : 'is-no')}>{displayAnswer(field, value)}</span>
          {field.settings?.statement ? <span className="iwf-tick-view__statement">{field.settings.statement}</span> : null}
        </span>
      );
    case 'consent': {
      const record = options.consent;
      const granted = record ? record.granted : value === true;
      const purposeId = record?.purpose ?? field.settings?.consentPurpose;
      const purpose = purposeId ? CONSENT_PURPOSES[purposeId] : undefined;
      const statement = record?.statement ?? field.settings?.statement ?? '';
      return (
        <span className="iwf-consent-view">
          <span className="iwf-consent-view__line">
            <span className={cx('iwf-state', granted ? 'is-yes' : 'is-no')}>{granted ? 'Granted' : 'Not granted'}</span>
            {purpose ? <span className="iwf-consent__tag">{purpose.label}</span> : null}
          </span>
          {statement ? (
            <span className="iwf-consent-view__wording">
              <span className="iwf-consent-view__caption">Wording as shown on the form</span>
              <span className="iwf-consent__statement">{statement}</span>
            </span>
          ) : null}
        </span>
      );
    }
    case 'file':
    case 'image':
    case 'audio':
    case 'video': {
      const files = asAttachments(value);
      if (!files.length) return null;
      return (
        <ul className="iwf-view-files">
          {files.map((file) => {
            const meta = `${formatLabel(file.contentType)} · ${formatBytes(file.size)}`;
            return (
              <li key={file.id}>
                {options.onOpen ? (
                  <button type="button" className="iwf-file-link" onClick={() => options.onOpen?.({ ...file, fieldId: field.id })}>
                    <span className="iwf-file-link__name">{file.name}</span>
                    <span className="iwf-file-link__meta">{meta}</span>
                  </button>
                ) : (
                  <span className="iwf-file-link iwf-file-link--static">
                    <span className="iwf-file-link__name">{file.name}</span>
                    <span className="iwf-file-link__meta">{meta}</span>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      );
    }
    case 'group': {
      const entries = asEntries(value);
      if (!entries.length) return null;
      const { itemLabel } = groupLimits(field, false);
      return (
        <ol className="iwf-view-entries">
          {entries.map((raw, index) => {
            const entry: Record<string, AnswerValue> = isRecord(raw) ? raw : {};
            return (
              <li key={index} className="iwf-view-entry">
                <span className="iwf-view-entry__title">{`${itemLabel} ${index + 1}`}</span>
                <dl className="iwf-answers iwf-answers--nested">
                  {(field.fields ?? []).map((sub) => {
                    const path = `${options.path}.${index}.${sub.id}`;
                    return (
                      <AnswerRow
                        key={sub.id}
                        field={sub}
                        value={entry[sub.id]}
                        showEmpty
                        options={{ onOpen: options.onOpen, issuesAt: options.issuesAt, path }}
                      />
                    );
                  })}
                </dl>
              </li>
            );
          })}
        </ol>
      );
    }
    default:
      return null;
  }
}

function AnswerRow({ field, value, showEmpty, options, compare, previous }: {
  field: FormField;
  value: AnswerValue | undefined;
  showEmpty: boolean;
  options: ShowOptions;
  compare?: boolean;
  previous?: AnswerValue;
}) {
  const content = answerContent(field, value, options);
  const messages = options.issuesAt?.(options.path) ?? [];
  const changed = compare === true && !sameAnswer(value, previous);
  if (content === null && !showEmpty && !messages.length && !changed) return null;
  return (
    <div className={cx('iwf-answer', changed && 'is-changed', messages.length > 0 && 'is-invalid')} data-field-id={field.id}>
      <dt className="iwf-answer__label">
        <span className="iwf-answer__question">{field.label || field.id}</span>
        {changed ? <span className="iwf-changed">Changed</span> : null}
      </dt>
      <dd className="iwf-answer__value">
        {content ?? <span className="iwf-none">No answer</span>}
        {changed ? (
          <details className="iwf-before">
            <summary>Previous answer</summary>
            <div className="iwf-before__value">
              {answerContent(field, previous, { path: options.path, onOpen: options.onOpen }) ?? <span className="iwf-none">No answer</span>}
            </div>
          </details>
        ) : null}
        {messages.length ? (
          <span className="ts-error iwf-error">
            <span className="iwf-error__mark" aria-hidden="true">!</span>
            <span className="iwf-error__text">
              <span className="ts-sr">Needs attention: </span>
              {messages.map((message, index) => <span key={index} className="iwf-error__line">{message}</span>)}
            </span>
          </span>
        ) : null}
      </dd>
    </div>
  );
}

/** A section's answers, split around heading items (a heading cannot sit inside a list of answers). */
function SectionAnswers({ fields, answers, showEmpty, consents, onOpen, compareWith, issuesAt, level }: {
  fields: FormField[];
  answers: Answers;
  showEmpty: boolean;
  consents: Map<string, ConsentRecord>;
  onOpen?: OpenAttachment;
  compareWith?: Answers | null;
  issuesAt?: (path: string) => string[];
  level: number;
}) {
  const blocks: Array<{ heading: FormField } | { rows: FormField[] }> = [];
  for (const field of fields) {
    if (field.type === 'instruction') continue;
    if (field.type === 'heading') {
      blocks.push({ heading: field });
      continue;
    }
    const last = blocks[blocks.length - 1];
    if (last && 'rows' in last) last.rows.push(field);
    else blocks.push({ rows: [field] });
  }
  const Heading = tag(level);
  return (
    <>
      {blocks.map((block, index) => {
        if ('heading' in block) {
          return block.heading.label ? <Heading key={block.heading.id} className="iwf-view__subheading">{block.heading.label}</Heading> : null;
        }
        const rows = block.rows.map((field) => (
          <AnswerRow
            key={field.id}
            field={field}
            value={answers[field.id]}
            showEmpty={showEmpty}
            compare={Boolean(compareWith)}
            previous={compareWith ? compareWith[field.id] : undefined}
            options={{ consent: consents.get(field.id), onOpen, issuesAt, path: field.id }}
          />
        ));
        return <dl key={`rows-${index}`} className="iwf-answers">{rows}</dl>;
      })}
    </>
  );
}

export function FormResponseView({
  definition,
  answers,
  consents,
  onOpenAttachment,
  showEmpty = true,
  compareWith = null,
  headingLevel = 3,
}: FormResponseViewProps): JSX.Element {
  const stored = isRecord(answers) ? (answers as Answers) : {};
  const visibility = computeVisibility(definition, stored);
  const byField = new Map((consents ?? []).map((record) => [record.fieldId, record]));
  const sections = definition.sections.filter((section) => visibility.sections[section.id]);
  const Heading = tag(headingLevel);
  const changedCount = compareWith
    ? topLevelFields(definition).filter(({ field, sectionId }) => visibility.sections[sectionId] && visibility.fields[field.id]
      && field.type !== 'instruction' && field.type !== 'heading' && !sameAnswer(stored[field.id], compareWith[field.id])).length
    : 0;
  return (
    <div className="iwf-view">
      {compareWith ? (
        <p className="iwf-view__compare">
          {changedCount === 0 ? 'No answers changed since the earlier revision.' : changedCount === 1 ? '1 answer changed since the earlier revision.' : `${changedCount} answers changed since the earlier revision.`}
        </p>
      ) : null}
      {sections.map((section) => {
        const fields = section.fields.filter((field) => visibility.fields[field.id]);
        return (
          <section key={section.id} className="iwf-view__section" data-section-id={section.id}>
            {section.title ? <Heading className="iwf-view__title">{section.title}</Heading> : null}
            <SectionAnswers
              fields={fields}
              answers={stored}
              showEmpty={showEmpty}
              consents={byField}
              onOpen={onOpenAttachment}
              compareWith={compareWith}
              level={headingLevel + 1}
            />
          </section>
        );
      })}
    </div>
  );
}

/** Issues by answer path; attachment indexes (`fieldId.0`) count as their question's. */
function issueLookup(issues: Issue[]) {
  const map = new Map<string, string[]>();
  for (const issue of issues) {
    const segments = String(issue?.path ?? '').split('.');
    // fieldId[.n] or groupId.n[.subId[.n]]: drop a trailing attachment index.
    const key = segments.length === 2 && /^\d+$/.test(segments[1]) ? segments[0]
      : segments.length === 4 && /^\d+$/.test(segments[3]) ? segments.slice(0, 3).join('.') : segments.join('.');
    const list = map.get(key) ?? [];
    list.push(String(issue?.message ?? ''));
    map.set(key, list);
  }
  return map;
}

/** The review-before-submit step: answers grouped by visible section, each with an Edit button. */
export function FormReviewSummary({ definition, answers, onEdit, issues, headingLevel = 3 }: FormReviewSummaryProps): JSX.Element {
  const reactId = useId().replace(/[^A-Za-z0-9_-]/g, '');
  const stored = isRecord(answers) ? (answers as Answers) : {};
  const visibility = computeVisibility(definition, stored);
  const sections = definition.sections.filter((section) => visibility.sections[section.id]);
  const issueList = Array.isArray(issues) ? issues : [];
  const lookup = issueLookup(issueList);
  const placed = new Map(topLevelFields(definition).map(({ field, sectionId }) => [field.id, sectionId]));
  const sectionOf = (issue: Issue) => {
    const top = String(issue?.path ?? '').split('.')[0];
    const sectionId = placed.get(top);
    return sectionId && visibility.sections[sectionId] && visibility.fields[top] ? sectionId : null;
  };
  const unplaced = issueList.filter((issue) => !sectionOf(issue));
  const Heading = tag(headingLevel);
  const issuesAt = (path: string) => {
    if (path.includes('.')) return lookup.get(path) ?? [];
    // A group row also carries its entry-level problems ("groupId.2").
    const own = lookup.get(path) ?? [];
    const entries = [...lookup.entries()].filter(([key]) => new RegExp(`^${path}\\.\\d+$`).test(key)).flatMap(([, list]) => list);
    return [...own, ...entries];
  };
  return (
    <div className="iwf-review">
      {issueList.length ? (
        <div className="iwf-summary iwf-summary--static" role="alert">
          <p className="iwf-summary__title">
            {issueList.length === 1 ? '1 answer needs attention before you submit.' : `${issueList.length} answers need attention before you submit.`}
          </p>
          {unplaced.length ? (
            <ul className="iwf-summary__list">
              {unplaced.map((issue, index) => <li key={index}>{issue.message}</li>)}
            </ul>
          ) : null}
        </div>
      ) : null}
      {sections.map((section, index) => {
        const title = section.title || (sections.length > 1 ? `Section ${index + 1}` : 'Your answers');
        const titleId = `iwf${reactId}-review-${section.id}`;
        const count = issueList.filter((issue) => sectionOf(issue) === section.id).length;
        const fields = section.fields.filter((field) => visibility.fields[field.id]);
        return (
          <section key={section.id} className={cx('iwf-review__section', count > 0 && 'is-invalid')} aria-labelledby={titleId} data-section-id={section.id}>
            <div className="iwf-review__head">
              <Heading id={titleId} className="iwf-review__title">{title}</Heading>
              {count > 0 ? <span className="iwf-review__count">{count === 1 ? '1 to fix' : `${count} to fix`}</span> : null}
              <button type="button" className="ts-btn ts-btn--secondary ts-btn--sm iwf-review__edit" onClick={() => onEdit(section.id)}>
                <span>Edit<span className="ts-sr">{` ${title}`}</span></span>
              </button>
            </div>
            <SectionAnswers
              fields={fields}
              answers={stored}
              showEmpty
              consents={new Map()}
              issuesAt={issuesAt}
              level={headingLevel + 1}
            />
          </section>
        );
      })}
    </div>
  );
}
