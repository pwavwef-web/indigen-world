import type { FormStatus, ResponseStatus, VersionState } from '@indigen-world/contracts/forms';
import type { StatusCounts } from '@indigen-world/contracts/forms-api';
import type { Tone } from '../ui/primitives';

/* Pure display helpers for the Forms screens. Nothing here changes what an
   administrator or contributor typed; it only formats dates, counts and
   statuses for reading. */

export const builderPath = (formId: string) => `/forms/builder?form=${encodeURIComponent(formId)}`;
export const responsesPath = (formId: string) => `/forms/responses?form=${encodeURIComponent(formId)}`;

export function dateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function dateOnly(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function timeOnly(value: Date): string {
  return value.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

/** ISO timestamp → the value of a `datetime-local` input, in the browser's time zone. */
export function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** A `datetime-local` value (local time) → ISO, or null when empty or invalid. */
export function fromLocalInput(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function timeZoneName(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'your time zone';
  } catch {
    return 'your time zone';
  }
}

export const FORM_STATUS_TONE: Record<FormStatus, Tone> = {
  draft: 'neutral',
  published: 'success',
  paused: 'warning',
  closed: 'info',
  archived: 'neutral',
};

export const RESPONSE_STATUS_TONE: Record<ResponseStatus, Tone> = {
  draft: 'neutral',
  submitted: 'info',
  under_review: 'violet',
  changes_requested: 'warning',
  approved: 'success',
  rejected: 'danger',
};

export const VERSION_STATE_LABEL: Record<VersionState, string> = { draft: 'Draft', published: 'Published', retired: 'Retired' };
export const VERSION_STATE_TONE: Record<VersionState, Tone> = { draft: 'neutral', published: 'success', retired: 'neutral' };

/** Responses waiting for a reviewer: sent and not yet decided. */
export function awaitingReview(counts: StatusCounts | null | undefined): number {
  return (counts?.submitted ?? 0) + (counts?.under_review ?? 0);
}

export const COUNT_DEFINITIONS = [
  { term: 'Submitted', detail: 'every response sent at least once, whatever its status now.' },
  { term: 'Awaiting review', detail: 'responses that are submitted or under review and have no decision yet.' },
  { term: 'Changes requested, Approved, Rejected', detail: 'responses whose current status is that decision. A corrected response moves back to Awaiting review when the contributor resubmits it.' },
  { term: 'Not counted', detail: 'contributors’ unsent drafts.' },
] as const;

export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count.toLocaleString('en-GB')} ${count === 1 ? one : many}`;
}
