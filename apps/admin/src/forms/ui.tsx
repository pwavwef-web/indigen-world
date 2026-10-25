import { useCallback, useEffect, useRef, useState, type InputHTMLAttributes, type KeyboardEvent, type ReactNode } from 'react';
import { FORM_STATUS_LABELS, RESPONSE_STATUS_LABELS } from '@indigen-world/contracts/forms';
import type { FormStatus, ResponseStatus } from '@indigen-world/contracts/forms';
import type { StatusCounts } from '@indigen-world/contracts/forms-api';
import { Icon, type IconName } from '../ui/icons';
import { Badge, cx } from '../ui/primitives';
import { COUNT_DEFINITIONS, FORM_STATUS_TONE, RESPONSE_STATUS_TONE, awaitingReview } from './format';

/* Small controls the Forms screens share. They render TribeStudio's markup
   (ts-switch, ts-check, ts-tabs) like the rest of the console; the studio's
   own versions cannot be imported here because they link through the studio
   router. */

export function FormStatusBadge({ status }: { status: FormStatus }) {
  return <Badge tone={FORM_STATUS_TONE[status] ?? 'neutral'} dot>{FORM_STATUS_LABELS[status] ?? status}</Badge>;
}

export function ResponseStatusBadge({ status }: { status: ResponseStatus }) {
  return <Badge tone={RESPONSE_STATUS_TONE[status] ?? 'neutral'}>{RESPONSE_STATUS_LABELS[status] ?? status}</Badge>;
}

export function Switch({ checked, onChange, label, hint, disabled = false }: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  hint?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <label className={cx('ts-switch', disabled && 'is-disabled')}>
      <input type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />
      <span className="ts-switch__track" aria-hidden="true" />
      <span className="ts-check__copy"><strong>{label}</strong>{hint ? <small>{hint}</small> : null}</span>
    </label>
  );
}

export function CheckRow({ checked, onChange, label, hint, disabled = false, card = false, type = 'checkbox', name }: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  hint?: ReactNode;
  disabled?: boolean;
  card?: boolean;
  type?: 'checkbox' | 'radio';
  name?: string;
}) {
  return (
    <label className={cx('ts-check', card && 'ts-check--card')}>
      <input type={type} name={name} checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />
      <span className="ts-check__copy"><strong>{label}</strong>{hint ? <small>{hint}</small> : null}</span>
    </label>
  );
}

/** A labelled group of checkboxes over a vocabulary; an empty selection is meaningful to the caller. */
export function CheckList({ legend, hint, options, value, onChange, disabled = false, columns = false }: {
  legend: ReactNode;
  hint?: ReactNode;
  options: ReadonlyArray<{ id: string; label: string; hint?: string }>;
  value: readonly string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
  columns?: boolean;
}) {
  return (
    <fieldset className="afm-fieldset" disabled={disabled}>
      <legend className="ts-label">{legend}</legend>
      {hint ? <p className="ts-hint">{hint}</p> : null}
      <div className={cx('afm-checks', columns && 'afm-checks--columns')}>
        {options.map((option) => (
          <CheckRow key={option.id} label={option.label} hint={option.hint} checked={value.includes(option.id)}
            onChange={(checked) => onChange(checked ? [...value.filter((id) => id !== option.id), option.id].sort((a, b) => options.findIndex((o) => o.id === a) - options.findIndex((o) => o.id === b)) : value.filter((id) => id !== option.id))} />
        ))}
      </div>
    </fieldset>
  );
}

/** One choice from a few, each with an explanation (radio cards). */
export function ChoiceCards<T extends string>({ legend, hint, name, options, value, onChange, disabled = false }: {
  legend: ReactNode;
  hint?: ReactNode;
  name: string;
  options: ReadonlyArray<{ value: T; label: string; hint?: ReactNode }>;
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset className="afm-fieldset" disabled={disabled}>
      <legend className="ts-label">{legend}</legend>
      {hint ? <p className="ts-hint">{hint}</p> : null}
      <div className="afm-checks">
        {options.map((option) => (
          <CheckRow key={option.value} type="radio" name={name} card label={option.label} hint={option.hint} checked={value === option.value} onChange={(checked) => { if (checked) onChange(option.value); }} />
        ))}
      </div>
    </fieldset>
  );
}

/**
 * Tabs with the ARIA tabs pattern: arrow keys, Home and End move between
 * them, and only the selected tab is in the Tab order.
 */
export function Tabs<T extends string>({ label, tabs, value, onChange, idPrefix, vertical = false, className }: {
  label: string;
  tabs: ReadonlyArray<{ id: T; label: ReactNode; icon?: IconName; badge?: ReactNode }>;
  value: T;
  onChange: (id: T) => void;
  idPrefix: string;
  vertical?: boolean;
  className?: string;
}) {
  const refs = useRef(new Map<string, HTMLButtonElement>());
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const keys = vertical ? ['ArrowUp', 'ArrowDown'] : ['ArrowLeft', 'ArrowRight'];
    let next = -1;
    if (event.key === keys[0] || (vertical && event.key === 'ArrowLeft')) next = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === keys[1] || (vertical && event.key === 'ArrowRight')) next = (index + 1) % tabs.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = tabs.length - 1;
    if (next < 0) return;
    event.preventDefault();
    const tab = tabs[next];
    onChange(tab.id);
    refs.current.get(tab.id)?.focus();
  };
  return (
    <div role="tablist" aria-label={label} aria-orientation={vertical ? 'vertical' : 'horizontal'} className={cx('ts-tabs afm-tabs', vertical && 'afm-tabs--vertical', className)}>
      {tabs.map((tab, index) => {
        const active = tab.id === value;
        return (
          <button
            key={tab.id}
            ref={(node) => { if (node) refs.current.set(tab.id, node); else refs.current.delete(tab.id); }}
            type="button"
            role="tab"
            id={`${idPrefix}-tab-${tab.id}`}
            aria-selected={active}
            aria-controls={`${idPrefix}-panel-${tab.id}`}
            tabIndex={active ? 0 : -1}
            className={cx('ts-tab', active && 'is-active')}
            onClick={() => onChange(tab.id)}
            onKeyDown={(event) => onKeyDown(event, index)}
          >
            {tab.icon ? <Icon name={tab.icon} /> : null}
            <span>{tab.label}</span>
            {tab.badge}
          </button>
        );
      })}
    </div>
  );
}

export function TabPanel({ idPrefix, id, children, className }: { idPrefix: string; id: string; children: ReactNode; className?: string }) {
  return <div role="tabpanel" id={`${idPrefix}-panel-${id}`} aria-labelledby={`${idPrefix}-tab-${id}`} tabIndex={0} className={cx('afm-tabpanel', className)}>{children}</div>;
}

/**
 * A number box that lets the person type freely ("", "-", "1.") and reports
 * a number, or null when it is empty or not a number yet.
 */
export function NumberInput({ value, onValue, integer = false, className, ...rest }: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> & {
  value: number | null | undefined;
  onValue: (value: number | null) => void;
  integer?: boolean;
}) {
  const shown = value === null || value === undefined ? '' : String(value);
  const [text, setText] = useState(shown);
  const parse = (raw: string): number | null => {
    if (!/^-?\d+(\.\d+)?$/.test(raw)) return null;
    const number = Number(raw);
    return Number.isFinite(number) && (!integer || Number.isInteger(number)) ? number : null;
  };
  useEffect(() => {
    // Follow outside changes (undo, reload) without fighting what is being typed.
    if (parse(text) !== (value ?? null)) setText(shown);
  }, [shown]); // `text` is read, not watched: typing must not be overwritten.
  return (
    <input
      {...rest}
      type="text"
      inputMode={integer ? 'numeric' : 'decimal'}
      className={cx('ts-input afm-number', className)}
      value={text}
      onChange={(event) => {
        setText(event.target.value);
        onValue(parse(event.target.value));
      }}
    />
  );
}

/** "Unsaved changes" / "Saving…" / "Saved 10:42" / "Not saved", announced politely. */
export function SaveIndicator({ state, savedAt }: { state: 'clean' | 'dirty' | 'saving' | 'saved' | 'error' | 'readonly'; savedAt: string | null }) {
  const text = state === 'saving' ? 'Saving…'
    : state === 'dirty' ? 'Unsaved changes'
      : state === 'error' ? 'Not saved'
        : state === 'readonly' ? 'Published versions cannot be changed'
          : savedAt ? `Saved ${savedAt}` : 'No changes';
  return (
    <span className={cx('ts-save afm-save', state === 'saving' && 'is-saving', state === 'dirty' && 'is-dirty', state === 'error' && 'is-error')} role="status" aria-live="polite">
      <span className="ts-save__mark" aria-hidden="true"><Icon name={state === 'error' || state === 'dirty' ? 'alert' : state === 'readonly' ? 'lock' : 'check'} /></span>
      <span>{text}</span>
    </span>
  );
}

/** The five counts staff ask about, with what each one means. */
export function CountsSummary({ counts, totalSubmitted, label }: { counts: StatusCounts; totalSubmitted: number; label: string }) {
  const items = [
    { label: 'Submitted', value: totalSubmitted, icon: 'send' as IconName },
    { label: 'Awaiting review', value: awaitingReview(counts), icon: 'hourglass' as IconName },
    { label: 'Changes requested', value: counts.changes_requested ?? 0, icon: 'pen' as IconName },
    { label: 'Approved', value: counts.approved ?? 0, icon: 'check-circle' as IconName },
    { label: 'Rejected', value: counts.rejected ?? 0, icon: 'x-circle' as IconName },
  ];
  return (
    <section className="afm-counts" aria-label={label}>
      <dl className="afm-counts__list">
        {items.map((item) => (
          <div key={item.label} className="afm-counts__item">
            <dt><Icon name={item.icon} />{item.label}</dt>
            <dd>{item.value.toLocaleString('en-GB')}</dd>
          </div>
        ))}
      </dl>
      <details className="afm-counts__help">
        <summary><Icon name="chevron" className="afm-chev" />How these counts are defined</summary>
        <ul>
          {COUNT_DEFINITIONS.map((item) => <li key={item.term}><strong>{item.term}:</strong> {item.detail}</li>)}
        </ul>
      </details>
    </section>
  );
}

/** A polite live region for announcing moves, additions and saves to screen readers. */
export function useAnnouncer(): [ReactNode, (message: string) => void] {
  const [message, setMessage] = useState('');
  const announce = useCallback((next: string) => {
    // Clear first so the same sentence twice is announced twice.
    setMessage('');
    window.setTimeout(() => setMessage(next), 30);
  }, []);
  return [<div key="announcer" className="sr-only" role="status" aria-live="polite">{message}</div>, announce];
}
