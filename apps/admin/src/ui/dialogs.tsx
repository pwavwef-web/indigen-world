import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Button, Dialog, Field } from './primitives';

/**
 * Styled replacements for `window.confirm` and `window.prompt`, as promises,
 * so a screen can ask a question in one line and still get an accessible
 * dialog: a real label, a visible reason requirement, focus kept inside and
 * returned afterwards, and Escape to back out.
 *
 *   if (!(await confirmAction({ title: 'Remove this app?' }))) return;
 *   const reason = await askText({ title: 'Reject application', label: 'Reason', required: true });
 *   if (reason === null) return;
 */

interface ConfirmRequest {
  kind: 'confirm';
  title: ReactNode;
  body?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'primary' | 'danger';
  resolve: (value: boolean) => void;
}

interface TextRequest {
  kind: 'text';
  title: ReactNode;
  body?: ReactNode;
  label: string;
  hint?: ReactNode;
  initial?: string;
  placeholder?: string;
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  multiline?: boolean;
  confirmLabel?: string;
  tone?: 'primary' | 'danger';
  resolve: (value: string | null) => void;
}

type Request = ConfirmRequest | TextRequest;

let listener: ((request: Request | null) => void) | null = null;
const queue: Request[] = [];
const ids = new WeakMap<Request, number>();
let nextId = 0;

function show(request: Request) {
  ids.set(request, ++nextId);
  queue.push(request);
  if (queue.length === 1) listener?.(request);
}

function finish() {
  queue.shift();
  listener?.(queue[0] ?? null);
}

export function confirmAction(options: Omit<ConfirmRequest, 'kind' | 'resolve'>): Promise<boolean> {
  return new Promise((resolve) => show({ kind: 'confirm', ...options, resolve }));
}

/** Resolves to the trimmed text, or null when the person cancels. */
export function askText(options: Omit<TextRequest, 'kind' | 'resolve'>): Promise<string | null> {
  return new Promise((resolve) => show({ kind: 'text', ...options, resolve }));
}

export function DialogHost() {
  const [request, setRequest] = useState<Request | null>(queue[0] ?? null);
  useEffect(() => {
    listener = setRequest;
    return () => { listener = null; };
  }, []);
  if (!request) return null;
  return request.kind === 'confirm'
    ? <ConfirmDialog key={ids.get(request)} request={request} />
    : <TextDialog key={ids.get(request)} request={request} />;
}

function ConfirmDialog({ request }: { request: ConfirmRequest }) {
  const done = (value: boolean) => { request.resolve(value); finish(); };
  return (
    <Dialog title={request.title} onClose={() => done(false)}
      footer={<>
        <Button onClick={() => done(false)}>{request.cancelLabel ?? 'Cancel'}</Button>
        <Button variant={request.tone === 'danger' ? 'danger' : 'primary'} autoFocus onClick={() => done(true)}>{request.confirmLabel ?? 'Confirm'}</Button>
      </>}>
      {request.body ? <div className="ad-dialog-copy">{request.body}</div> : null}
    </Dialog>
  );
}

function TextDialog({ request }: { request: TextRequest }) {
  const [value, setValue] = useState(request.initial ?? '');
  const [touched, setTouched] = useState(false);
  const trimmed = value.trim();
  const min = request.minLength ?? (request.required ? 1 : 0);
  const invalid = trimmed.length < min;
  const done = (result: string | null) => { request.resolve(result); finish(); };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    setTouched(true);
    if (!invalid) done(trimmed);
  };
  const formId = 'ad-text-dialog-form';
  return (
    <Dialog title={request.title} onClose={() => done(null)}
      footer={<>
        <Button onClick={() => done(null)}>Cancel</Button>
        <Button type="submit" form={formId} variant={request.tone === 'danger' ? 'danger' : 'primary'}>{request.confirmLabel ?? 'Continue'}</Button>
      </>}>
      <form id={formId} className="ts-stack" onSubmit={submit} noValidate>
        {request.body ? <div className="ad-dialog-copy">{request.body}</div> : null}
        <Field label={request.label} hint={request.hint} required={request.required}
          error={touched && invalid ? (min > 1 ? `Enter at least ${min} characters.` : 'This is required.') : undefined}
          counter={request.maxLength ? `${value.length} / ${request.maxLength.toLocaleString()}` : undefined}>
          {request.multiline
            ? <textarea className="ts-textarea" rows={4} autoFocus value={value} maxLength={request.maxLength} placeholder={request.placeholder} onChange={(event) => setValue(event.target.value)} />
            : <input className="ts-input" autoFocus value={value} maxLength={request.maxLength} placeholder={request.placeholder} onChange={(event) => setValue(event.target.value)} />}
        </Field>
      </form>
    </Dialog>
  );
}
