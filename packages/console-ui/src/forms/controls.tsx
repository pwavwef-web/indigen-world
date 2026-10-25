import { useEffect, useRef, useState, type ReactNode } from 'react';
import { CONSENT_PURPOSES, choicesFor } from '@indigen-world/contracts/forms';
import type { AnswerValue } from '@indigen-world/contracts/forms';
import { focusTarget, useRenderer } from './context';
import { asAttachments, asEntries, asStrings, asText, cx, domId, formatDate, groupLimits, isRecord, isUploadType, sameAnswer } from './model';
import { QuestionErrors, QuestionHints, RequiredMark, hintIds, joinIds, type QuestionProps } from './parts';
import { UploadField } from './uploads';

/* Every question type the contract defines. Values are passed back exactly as
   typed: no trimming, case folding or Unicode normalisation on change, so
   Kasem tone marks and combining diacritics survive. Validation messages come
   from the caller (the contract's validateAnswers), never from here. */

export function Question(props: QuestionProps) {
  switch (props.field.type) {
    case 'short_text':
    case 'long_text':
    case 'email':
    case 'url':
      return <TextQuestion {...props} />;
    case 'number':
      return <NumberQuestion {...props} />;
    case 'date':
      return <DateQuestion {...props} />;
    case 'single_choice':
    case 'multiple_choice':
      return <ChoiceQuestion {...props} />;
    case 'dropdown':
    case 'language':
    case 'dialect':
      return <SelectQuestion {...props} />;
    case 'checkbox':
      return <CheckboxQuestion {...props} />;
    case 'consent':
      return <ConsentQuestion {...props} />;
    case 'file':
    case 'image':
    case 'audio':
    case 'video':
      return <UploadField {...props} />;
    case 'group':
      return <GroupQuestion {...props} />;
    case 'instruction':
      return <InstructionBlock {...props} />;
    case 'heading':
      return <HeadingBlock {...props} />;
    default:
      return null;
  }
}

function useQuestion(path: string) {
  const ctx = useRenderer();
  const cid = domId(ctx.prefix, path);
  const errors = ctx.issues.inline.get(path) ?? [];
  return { ctx, cid, errors, invalid: errors.length > 0 };
}

function Label({ htmlFor, text, required }: { htmlFor: string; text: string; required: boolean }) {
  return (
    <label className="ts-label iwf-label" htmlFor={htmlFor}>
      <span className="iwf-label__text">{text}</span>
      <RequiredMark required={required} />
    </label>
  );
}

/* -- Text ------------------------------------------------------------------------------ */

function Counter({ id, length, max }: { id: string; length: number; max: number }) {
  const over = length > max;
  return (
    <span className={cx('ts-counter', 'iwf-counter', over && 'is-over')} id={id}>
      {`${length} / ${max}`}
      <span className="ts-sr"> characters</span>
      {over ? <span className="iwf-counter__over">{` · ${length - max} over the limit`}</span> : null}
    </span>
  );
}

function TextQuestion({ field, path, value, onChange, required }: QuestionProps) {
  const { ctx, cid, errors, invalid } = useQuestion(path);
  const settings = field.settings ?? {};
  const text = asText(value);
  const multiline = field.type === 'long_text';
  const countable = field.type === 'short_text' || field.type === 'long_text';
  const max = countable && typeof settings.maxLength === 'number' && settings.maxLength > 0 ? settings.maxLength : undefined;
  const min = countable && typeof settings.minLength === 'number' && settings.minLength > 0 ? settings.minLength : undefined;
  const hint = min ? `Use at least ${min} characters.` : field.type === 'url' ? 'Start with https:// or http://.' : undefined;
  const counterId = max ? `${cid}-count` : undefined;
  const describedBy = joinIds(...hintIds(field, cid, hint), counterId, invalid && `${cid}-err`);
  const kasem = settings.kasemKeyboard === true;
  const suggestions = field.type === 'short_text' && settings.dictionarySuggestions === true;
  const change = (next: string) => onChange(next);

  let control: ReactNode;
  if ((kasem || suggestions) && ctx.renderKasemText) {
    control = ctx.renderKasemText({
      field,
      id: cid,
      value: text,
      onChange: change,
      multiline,
      disabled: ctx.disabled,
      invalid,
      describedBy,
      placeholder: field.placeholder,
      maxLength: max,
      dictionarySuggestions: suggestions,
      kasemKeyboard: kasem,
      required,
    });
  } else if (multiline) {
    control = (
      <textarea
        id={cid}
        className={cx('ts-textarea', 'iwf-textarea', kasem && 'iwf-kasem')}
        data-iwf-primary=""
        value={text}
        rows={max && max > 1000 ? 7 : 4}
        placeholder={field.placeholder}
        disabled={ctx.disabled}
        lang={kasem ? 'xsm' : undefined}
        spellCheck={kasem ? false : undefined}
        aria-required={required || undefined}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        onChange={(event) => change(event.target.value)}
      />
    );
  } else {
    control = (
      <input
        id={cid}
        type="text"
        className={cx('ts-input', kasem && 'iwf-kasem')}
        data-iwf-primary=""
        value={text}
        placeholder={field.placeholder}
        disabled={ctx.disabled}
        inputMode={field.type === 'email' ? 'email' : field.type === 'url' ? 'url' : undefined}
        autoComplete={field.type === 'email' ? 'email' : field.type === 'url' ? 'url' : undefined}
        lang={kasem ? 'xsm' : undefined}
        spellCheck={kasem || field.type === 'email' || field.type === 'url' ? false : undefined}
        aria-required={required || undefined}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        onChange={(event) => change(event.target.value)}
      />
    );
  }

  return (
    <div className={cx('iwf-q', `iwf-q--${field.type}`, invalid && 'is-invalid')} data-field-id={field.id}>
      <Label htmlFor={cid} text={field.label} required={required} />
      <QuestionHints field={field} cid={cid} hint={hint} />
      {control}
      {/* The contract measures the answer without surrounding whitespace. */}
      {max && counterId ? <Counter id={counterId} length={text.trim().length} max={max} /> : null}
      <QuestionErrors cid={cid} errors={errors} />
    </div>
  );
}

/* -- Number and date ------------------------------------------------------------------- */

// The contract's own number pattern: anything else stays text so it is reported, not guessed.
const NUMBER_PATTERN = /^-?\d+(\.\d+)?$/;
function parseNumber(text: string): AnswerValue {
  const trimmed = text.trim();
  if (!trimmed) return null;
  return NUMBER_PATTERN.test(trimmed) ? Number(trimmed) : text;
}

function numberHint(integer: boolean, min: number | null, max: number | null): string | undefined {
  const range = min !== null && max !== null ? `from ${min} to ${max}` : min !== null ? `of ${min} or more` : max !== null ? `of ${max} or less` : '';
  if (integer) return `Enter a whole number${range ? ` ${range}` : ''}.`;
  return range ? `Enter a number ${range}.` : undefined;
}

function NumberQuestion({ field, path, value, onChange, required }: QuestionProps) {
  const { ctx, cid, errors, invalid } = useQuestion(path);
  const settings = field.settings ?? {};
  const min = typeof settings.min === 'number' ? settings.min : null;
  const max = typeof settings.max === 'number' ? settings.max : null;
  const integer = settings.integer === true;
  const stored = typeof value === 'number' ? String(value) : asText(value);
  const [draft, setDraft] = useState(stored);
  // Keep what was typed ("1.50") while it still means the stored value; follow outside changes otherwise.
  const shown = sameAnswer(parseNumber(draft), value ?? null) ? draft : stored;
  const hint = numberHint(integer, min, max);
  const describedBy = joinIds(...hintIds(field, cid, hint), invalid && `${cid}-err`);
  return (
    <div className={cx('iwf-q', 'iwf-q--number', invalid && 'is-invalid')} data-field-id={field.id}>
      <Label htmlFor={cid} text={field.label} required={required} />
      <QuestionHints field={field} cid={cid} hint={hint} />
      <input
        id={cid}
        type="text"
        className="ts-input iwf-number"
        data-iwf-primary=""
        inputMode={integer && (min ?? -1) >= 0 ? 'numeric' : 'decimal'}
        value={shown}
        placeholder={field.placeholder}
        disabled={ctx.disabled}
        autoComplete="off"
        aria-required={required || undefined}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        onChange={(event) => {
          setDraft(event.target.value);
          onChange(parseNumber(event.target.value));
        }}
      />
      <QuestionErrors cid={cid} errors={errors} />
    </div>
  );
}

function DateQuestion({ field, path, value, onChange, required }: QuestionProps) {
  const { ctx, cid, errors, invalid } = useQuestion(path);
  const settings = field.settings ?? {};
  const minDate = settings.minDate ?? undefined;
  const maxDate = settings.maxDate ?? undefined;
  const hint = minDate && maxDate
    ? `Choose a date from ${formatDate(minDate)} to ${formatDate(maxDate)}.`
    : minDate ? `Choose ${formatDate(minDate)} or later.` : maxDate ? `Choose ${formatDate(maxDate)} or earlier.` : undefined;
  const describedBy = joinIds(...hintIds(field, cid, hint), invalid && `${cid}-err`);
  return (
    <div className={cx('iwf-q', 'iwf-q--date', invalid && 'is-invalid')} data-field-id={field.id}>
      <Label htmlFor={cid} text={field.label} required={required} />
      <QuestionHints field={field} cid={cid} hint={hint} />
      <input
        id={cid}
        type="date"
        className="ts-input iwf-date"
        data-iwf-primary=""
        value={typeof value === 'string' ? value : ''}
        min={minDate}
        max={maxDate}
        disabled={ctx.disabled}
        aria-required={required || undefined}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        onChange={(event) => onChange(event.target.value || null)}
      />
      <QuestionErrors cid={cid} errors={errors} />
    </div>
  );
}

/* -- Choices --------------------------------------------------------------------------- */

function selectionHint(min: number | null | undefined, max: number | null | undefined): string | undefined {
  if (min && max) return min === max ? `Choose ${min}.` : `Choose ${min} to ${max}.`;
  if (min) return `Choose at least ${min}.`;
  if (max) return `Choose up to ${max}.`;
  return 'Choose all that apply.';
}

function ChoiceQuestion({ field, path, value, onChange, required }: QuestionProps) {
  const { ctx, cid, errors, invalid } = useQuestion(path);
  const settings = field.settings ?? {};
  const multiple = field.type === 'multiple_choice';
  const options = choicesFor(field);
  const selected = multiple ? asStrings(value) : typeof value === 'string' ? [value] : [];
  const stale = selected.filter((id) => !options.some((option) => option.id === id));
  const hint = multiple ? selectionHint(settings.minSelections, settings.maxSelections) : undefined;
  const describedBy = joinIds(...hintIds(field, cid, hint), invalid && `${cid}-err`);
  const primary = Math.max(0, options.findIndex((option) => selected.includes(option.id)));
  return (
    <fieldset
      className={cx('iwf-q', `iwf-q--${field.type}`, invalid && 'is-invalid')}
      id={cid}
      role={multiple ? undefined : 'radiogroup'}
      aria-required={(!multiple && required) || undefined}
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy}
      data-field-id={field.id}
    >
      <legend className="ts-label iwf-label">
        <span className="iwf-label__text">{field.label}</span>
        <RequiredMark required={required} spoken={multiple} />
      </legend>
      <QuestionHints field={field} cid={cid} hint={hint} />
      <div className="iwf-choices">
        {options.map((option, index) => (
          <label key={option.id} className="ts-check ts-check--card iwf-choice" htmlFor={`${cid}-${index}`}>
            <input
              id={`${cid}-${index}`}
              type={multiple ? 'checkbox' : 'radio'}
              name={cid}
              value={option.id}
              checked={selected.includes(option.id)}
              disabled={ctx.disabled}
              data-iwf-primary={index === primary ? '' : undefined}
              onChange={(event) => {
                if (multiple) {
                  const rest = selected.filter((id) => id !== option.id);
                  onChange(event.target.checked ? [...rest, option.id] : rest);
                } else if (event.target.checked) {
                  onChange(option.id);
                }
              }}
            />
            <span className="ts-check__copy"><strong>{option.label}</strong></span>
          </label>
        ))}
      </div>
      {stale.length ? <p className="ts-hint">{`Earlier answer no longer offered: ${stale.join(', ')}`}</p> : null}
      {!multiple && !required && selected.length > 0 && !ctx.disabled ? (
        <button type="button" className="ts-btn ts-btn--link ts-btn--sm iwf-clear" onClick={() => onChange(null)}>
          <span>Clear selection<span className="ts-sr">{` for ${field.label}`}</span></span>
        </button>
      ) : null}
      <QuestionErrors cid={cid} errors={errors} />
    </fieldset>
  );
}

function SelectQuestion({ field, path, value, onChange, required }: QuestionProps) {
  const { ctx, cid, errors, invalid } = useQuestion(path);
  const options = choicesFor(field);
  const current = typeof value === 'string' ? value : '';
  const known = !current || options.some((option) => option.id === current);
  const describedBy = joinIds(...hintIds(field, cid), invalid && `${cid}-err`);
  return (
    <div className={cx('iwf-q', `iwf-q--${field.type}`, invalid && 'is-invalid')} data-field-id={field.id}>
      <Label htmlFor={cid} text={field.label} required={required} />
      <QuestionHints field={field} cid={cid} />
      <select
        id={cid}
        className="ts-select"
        data-iwf-primary=""
        value={current}
        disabled={ctx.disabled}
        aria-required={required || undefined}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        onChange={(event) => onChange(event.target.value === '' ? null : event.target.value)}
      >
        <option value="">{field.placeholder || 'Choose…'}</option>
        {options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
        {!known ? <option value={current}>{`${current} (no longer offered)`}</option> : null}
      </select>
      <QuestionErrors cid={cid} errors={errors} />
    </div>
  );
}

/* -- Ticks and consent -------------------------------------------------------------------- */

function CheckboxQuestion({ field, path, value, onChange, required }: QuestionProps) {
  const { ctx, cid, errors, invalid } = useQuestion(path);
  const statement = field.settings?.statement;
  const describedBy = joinIds(...hintIds(field, cid), invalid && `${cid}-err`);
  const input = (
    <input
      id={cid}
      type="checkbox"
      data-iwf-primary=""
      checked={value === true}
      disabled={ctx.disabled}
      aria-required={required || undefined}
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy}
      onChange={(event) => onChange(event.target.checked)}
    />
  );
  if (statement) {
    return (
      <fieldset className={cx('iwf-q', 'iwf-q--checkbox', invalid && 'is-invalid')} data-field-id={field.id}>
        <legend className="ts-label iwf-label">
          <span className="iwf-label__text">{field.label}</span>
          <RequiredMark required={required} />
        </legend>
        <QuestionHints field={field} cid={cid} />
        <label className="ts-check ts-check--card iwf-tick" htmlFor={cid}>
          {input}
          <span className="ts-check__copy"><strong className="iwf-statement">{statement}</strong></span>
        </label>
        <QuestionErrors cid={cid} errors={errors} />
      </fieldset>
    );
  }
  return (
    <div className={cx('iwf-q', 'iwf-q--checkbox', invalid && 'is-invalid')} data-field-id={field.id}>
      <label className="ts-check ts-check--card iwf-tick" htmlFor={cid}>
        {input}
        <span className="ts-check__copy">
          <strong className="iwf-statement">
            {field.label}
            {required ? <span className="ts-required" aria-hidden="true"> *</span> : null}
          </strong>
        </span>
      </label>
      <QuestionHints field={field} cid={cid} />
      <QuestionErrors cid={cid} errors={errors} />
    </div>
  );
}

function ConsentQuestion({ field, path, value, onChange, required }: QuestionProps) {
  const { ctx, cid, errors, invalid } = useQuestion(path);
  const settings = field.settings ?? {};
  const purpose = settings.consentPurpose ? CONSENT_PURPOSES[settings.consentPurpose] : undefined;
  const describedBy = joinIds(`${cid}-statement`, purpose && `${cid}-purpose`, ...hintIds(field, cid), `${cid}-note`, invalid && `${cid}-err`);
  return (
    <fieldset className={cx('iwf-q', 'iwf-consent', invalid && 'is-invalid')} data-field-id={field.id}>
      <legend className="ts-label iwf-label">
        <span className="iwf-label__text">{field.label}</span>
        <RequiredMark required={required} />
      </legend>
      {purpose ? (
        <p className="iwf-consent__purpose" id={`${cid}-purpose`}>
          <span className="iwf-consent__tag">{purpose.label}</span>
          <span className="iwf-consent__about">{purpose.description}</span>
        </p>
      ) : null}
      <QuestionHints field={field} cid={cid} />
      {/* The exact wording stored with the response. */}
      <div className="iwf-consent__statement" id={`${cid}-statement`}>{settings.statement ?? ''}</div>
      <label className="ts-check ts-check--card iwf-tick" htmlFor={cid}>
        <input
          id={cid}
          type="checkbox"
          data-iwf-primary=""
          checked={value === true}
          disabled={ctx.disabled}
          aria-required={required || undefined}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          onChange={(event) => onChange(event.target.checked)}
        />
        <span className="ts-check__copy">
          <strong>I agree</strong>
          <small id={`${cid}-note`}>
            {required ? 'Needed to submit this form.' : 'Optional. You can leave this unticked and still submit.'}
          </small>
        </span>
      </label>
      <QuestionErrors cid={cid} errors={errors} />
    </fieldset>
  );
}

/* -- Display-only ------------------------------------------------------------------------ */

function InstructionBlock({ field }: QuestionProps) {
  return (
    <div className="iwf-instruction" data-field-id={field.id}>
      {field.label ? <p className="iwf-instruction__title">{field.label}</p> : null}
      <p className="iwf-instruction__body">{field.settings?.body ?? ''}</p>
      {field.description ? <p className="ts-hint iwf-desc">{field.description}</p> : null}
    </div>
  );
}

function HeadingBlock({ field }: QuestionProps) {
  const ctx = useRenderer();
  const Heading = (ctx.headingLevel === 2 ? 'h3' : 'h4') as 'h3' | 'h4';
  return (
    <div className="iwf-heading-block" data-field-id={field.id}>
      <Heading className="iwf-heading">{field.label}</Heading>
      {field.description ? <p className="ts-hint iwf-desc">{field.description}</p> : null}
    </div>
  );
}

/* -- Repeatable group -------------------------------------------------------------------- */

function GroupQuestion({ field, path, value, required }: QuestionProps) {
  const { ctx, cid, errors, invalid } = useQuestion(path);
  const { minItems, maxItems, floor, itemLabel } = groupLimits(field, required);
  const stored = asEntries(value);
  const count = Math.max(stored.length, floor);
  const keys = ctx.groupKeys(field.id, count);
  const subs = field.fields ?? [];
  const firstInput = subs.find((sub) => sub.type !== 'instruction' && sub.type !== 'heading') ?? subs[0];
  const [announcement, setAnnouncement] = useState('');
  const pendingFocus = useRef<string | null>(null);
  const Heading = (ctx.headingLevel === 2 ? 'h3' : 'h4') as 'h3' | 'h4';

  useEffect(() => {
    const target = pendingFocus.current;
    if (!target) return;
    pendingFocus.current = null;
    focusTarget(document.getElementById(target));
  });

  const entryId = (index: number) => domId(ctx.prefix, `${field.id}.${index}`);
  const hint = minItems === maxItems
    ? `Add ${maxItems} ${maxItems === 1 ? 'entry' : 'entries'}.`
    : minItems > 0 ? `Add ${minItems} to ${maxItems} entries.` : `Add up to ${maxItems} ${maxItems === 1 ? 'entry' : 'entries'}.`;
  const describedBy = joinIds(...hintIds(field, cid, hint), invalid && `${cid}-err`);

  const add = () => {
    if (count >= maxItems) return;
    ctx.mutateGroup(field.id, floor, (entries, list) => {
      entries.push({});
      list.push(ctx.newKey());
    });
    pendingFocus.current = firstInput ? domId(ctx.prefix, `${field.id}.${count}.${firstInput.id}`) : entryId(count);
    setAnnouncement(`${itemLabel} ${count + 1} added.`);
  };

  const remove = (index: number) => {
    const removed = stored[index];
    ctx.mutateGroup(field.id, floor, (entries, list) => {
      entries.splice(index, 1);
      list.splice(index, 1);
    });
    // Files attached inside the removed entry are no longer part of the response.
    if (isRecord(removed)) {
      for (const sub of subs) {
        if (isUploadType(sub.type)) for (const attachment of asAttachments(removed[sub.id])) ctx.uploads.removeAttachment(attachment);
      }
    }
    const remaining = Math.max(count - 1, floor);
    pendingFocus.current = remaining > index ? `${entryId(index)}-title` : remaining > 0 ? `${entryId(remaining - 1)}-title` : `${cid}-add`;
    setAnnouncement(`${itemLabel} ${index + 1} removed.`);
  };

  const move = (index: number, to: number) => {
    if (to < 0 || to >= count) return;
    ctx.mutateGroup(field.id, floor, (entries, list) => {
      [entries[index], entries[to]] = [entries[to], entries[index]];
      [list[index], list[to]] = [list[to], list[index]];
    });
    const button = to === 0 ? 'down' : to === count - 1 ? 'up' : to < index ? 'up' : 'down';
    pendingFocus.current = `${entryId(to)}-${button}`;
    setAnnouncement(`Moved to position ${to + 1} of ${count}.`);
  };

  return (
    <fieldset className={cx('iwf-q', 'iwf-group', invalid && 'is-invalid')} id={cid} aria-describedby={describedBy} data-field-id={field.id}>
      <legend className="ts-label iwf-label">
        <span className="iwf-label__text">{field.label}</span>
        <RequiredMark required={required} spoken />
      </legend>
      <QuestionHints field={field} cid={cid} hint={hint} />
      {count > 0 ? (
        <ol className="iwf-entries">
          {Array.from({ length: count }, (_, index) => {
            const raw = stored[index];
            const entry: Record<string, AnswerValue> = isRecord(raw) ? raw : {};
            const key = keys[index];
            const id = entryId(index);
            const title = `${itemLabel} ${index + 1}`;
            const entryErrors = ctx.issues.inline.get(`${field.id}.${index}`) ?? [];
            return (
              <li key={key} className={cx('iwf-entry', entryErrors.length > 0 && 'is-invalid')} id={id}>
                <div className="iwf-entry__group" role="group" aria-labelledby={`${id}-title`}>
                  <div className="iwf-entry__head">
                    <Heading className="iwf-entry__title" id={`${id}-title`} tabIndex={-1}>{title}</Heading>
                    <div className="iwf-entry__tools">
                      <button type="button" id={`${id}-up`} className="ts-btn ts-btn--ghost ts-btn--sm" disabled={ctx.disabled || index === 0} onClick={() => move(index, index - 1)}>
                        <span>Move up<span className="ts-sr">{` ${title}`}</span></span>
                      </button>
                      <button type="button" id={`${id}-down`} className="ts-btn ts-btn--ghost ts-btn--sm" disabled={ctx.disabled || index === count - 1} onClick={() => move(index, index + 1)}>
                        <span>Move down<span className="ts-sr">{` ${title}`}</span></span>
                      </button>
                      <button type="button" id={`${id}-remove`} className="ts-btn ts-btn--danger-ghost ts-btn--sm" disabled={ctx.disabled || count <= floor} onClick={() => remove(index)}>
                        <span>Remove<span className="ts-sr">{` ${title}`}</span></span>
                      </button>
                    </div>
                  </div>
                  <QuestionErrors cid={id} errors={entryErrors} />
                  <div className="iwf-entry__fields">
                    {subs.map((sub) => (
                      <Question
                        key={sub.id}
                        field={sub}
                        path={`${field.id}.${index}.${sub.id}`}
                        slot={`${field.id}:${key}:${sub.id}`}
                        value={entry[sub.id]}
                        required={ctx.visibility.required[sub.id] === true}
                        onChange={(next) => ctx.mutateGroup(field.id, floor, (entries, list) => {
                          const at = list.indexOf(key);
                          if (at < 0) return;
                          const base: Record<string, AnswerValue> = isRecord(entries[at]) ? entries[at] : {};
                          entries[at] = { ...base, [sub.id]: next };
                        })}
                      />
                    ))}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="ts-hint iwf-group__empty">No entries yet.</p>
      )}
      <div className="iwf-group__actions">
        <button type="button" id={`${cid}-add`} className="ts-btn ts-btn--secondary ts-btn--sm" disabled={ctx.disabled || count >= maxItems} onClick={add}>
          <span>{`Add ${itemLabel}`}</span>
        </button>
        {count >= maxItems ? <span className="ts-hint">{`${maxItems} ${maxItems === 1 ? 'entry is' : 'entries are'} the most allowed.`}</span> : null}
      </div>
      <QuestionErrors cid={cid} errors={errors} />
      <p className="ts-sr" aria-live="polite">{announcement}</p>
    </fieldset>
  );
}
