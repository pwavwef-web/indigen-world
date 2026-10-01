import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon, cx } from '../components';
import { randomId } from '../data';

/**
 * Shared parts of the guided contribution forms: the step indicator, a draft
 * kept in this browser with a visible save status, a request id that makes a
 * repeated send safe, and the action bar.
 */

export interface StepDefinition {
  id: string;
  label: string;
}

/** Where you are in the form. Completed steps can be revisited. */
export function Steps({ steps, current, onSelect }: { steps: StepDefinition[]; current: number; onSelect?: (index: number) => void }) {
  return (
    <ol className="cw-steps-nav" aria-label="Steps">
      {steps.map((step, index) => {
        const state = index < current ? 'done' : index === current ? 'current' : 'upcoming';
        const content = (
          <>
            <span className="cw-steps-nav__marker" aria-hidden="true">{state === 'done' ? <Icon name="check" className="cw-icon--sm" /> : index + 1}</span>
            <span className="cw-steps-nav__label">{step.label}</span>
            <span className="cw-sr">{state === 'done' ? ', completed' : state === 'current' ? ', current step' : ''}</span>
          </>
        );
        return (
          <li key={step.id} className={cx('cw-steps-nav__item', `is-${state}`)} aria-current={state === 'current' ? 'step' : undefined}>
            {state === 'done' && onSelect ? <button type="button" className="cw-steps-nav__button" onClick={() => onSelect(index)}>{content}</button> : <span className="cw-steps-nav__button">{content}</span>}
          </li>
        );
      })}
    </ol>
  );
}

export type DraftStatus = 'empty' | 'saving' | 'saved' | 'unavailable';

/**
 * Form state that survives a reload, a closed tab or a dropped connection.
 * Written to this browser only — nothing reaches the server until Send — and
 * scoped to the signed-in account so a shared computer never mixes drafts.
 */
export function useBrowserDraft<T extends object>(key: string, initial: () => T, isEmpty: (value: T) => boolean) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw) return { ...initial(), ...(JSON.parse(raw) as Partial<T>) };
    } catch { /* Fall back to an empty form. */ }
    return initial();
  });
  const [status, setStatus] = useState<DraftStatus>(() => (isEmpty(value) ? 'empty' : 'saved'));
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (isEmpty(value)) {
      try { window.localStorage.removeItem(key); } catch { /* Nothing to remove. */ }
      setStatus('empty');
      return;
    }
    setStatus('saving');
    const timer = window.setTimeout(() => {
      try {
        window.localStorage.setItem(key, JSON.stringify(value));
        setStatus('saved');
        setSavedAt(Date.now());
      } catch {
        setStatus('unavailable');
      }
    }, 400);
    return () => window.clearTimeout(timer);
  }, [key, value]);
  const clear = useCallback(() => {
    try { window.localStorage.removeItem(key); } catch { /* Nothing to clear. */ }
    first.current = true;
    setValue(initial());
    setStatus('empty');
  }, [key]);
  return { value, setValue, status, savedAt, clear };
}

/**
 * One id per thing being sent. It is kept until the send succeeds, so a retry
 * after a dropped connection carries the same id and the server returns the
 * contribution it already saved instead of filing a second one.
 */
export function useRequestId(key: string): [string, () => void] {
  const [id, setId] = useState(() => {
    try {
      const stored = window.sessionStorage.getItem(key);
      if (stored && /^[a-f0-9]{24}$/.test(stored)) return stored;
    } catch { /* Generate below. */ }
    return randomId();
  });
  useEffect(() => {
    try { window.sessionStorage.setItem(key, id); } catch { /* Best effort. */ }
  }, [id, key]);
  const renew = useCallback(() => setId(randomId()), []);
  return [id, renew];
}

export function DraftState({ status }: { status: DraftStatus }) {
  const text = status === 'saving' ? 'Saving draft…'
    : status === 'saved' ? 'Draft saved in this browser'
      : status === 'unavailable' ? 'This browser cannot keep a draft — keep the page open until you send'
        : 'Nothing written yet';
  return (
    <span className={cx('cw-draft-state', `is-${status}`)} role="status" aria-live="polite">
      <span className="cw-draft-state__dot" aria-hidden="true" />{text}
    </span>
  );
}

/** The bar at the bottom of each step: where the draft is, and how to move on. */
export function FlowBar({ status, children }: { status: DraftStatus; children: ReactNode }) {
  return (
    <div className="cw-flowbar">
      <DraftState status={status} />
      <div className="cw-flowbar__actions">{children}</div>
    </div>
  );
}

/** Moves focus to the first field with an error, and scrolls it into view. */
export function focusFirstError(order: string[], errors: Record<string, string>) {
  const first = order.find((id) => errors[id]);
  if (!first) return;
  window.requestAnimationFrame(() => {
    const field = document.getElementById(first);
    field?.focus();
    field?.scrollIntoView({ block: 'center', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  });
}

/** After a send: what happened, what happens next, and where to follow it. */
export function SentPanel({ title, children, actions }: { title: string; children: ReactNode; actions: ReactNode }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, []);
  return (
    <section className="cw-sent" aria-labelledby="sent-title">
      <span className="cw-sent__icon" aria-hidden="true"><Icon name="check" /></span>
      <h2 id="sent-title" ref={heading} tabIndex={-1}>{title}</h2>
      <div className="cw-sent__body">{children}</div>
      <div className="cw-inline-actions cw-sent__actions">{actions}</div>
    </section>
  );
}
