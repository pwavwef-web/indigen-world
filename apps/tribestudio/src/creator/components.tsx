import type { ReactNode } from 'react';
import { trackEvent } from '../analytics';
import { WHATSAPP_CHANNEL_URL } from './data';

// Human-readable labels shown alongside internal status codes.
export const CAMPAIGN_STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft',
  WAITLIST_OPEN: 'Waitlist open',
  WAITLIST_CLOSED: 'Waitlist closed',
  SUBMISSIONS_OPEN: 'Submissions open',
  SUBMISSIONS_CLOSED: 'Submissions closed',
  JUDGING: 'Judging',
  COMPLETED: 'Completed',
  ARCHIVED: 'Archived',
};

export const APPLICATION_STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft',
  SUBMITTED: 'Submitted',
  UNDER_REVIEW: 'Under review',
  NEEDS_INFO: 'More information needed',
  WAITLISTED: 'Waitlisted',
  APPROVED: 'Approved',
  REJECTED: 'Not selected',
  SUSPENDED: 'Suspended',
  WITHDRAWN: 'Withdrawn',
};

export const SUBMISSION_STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft',
  SUBMITTED: 'Submitted',
  UNDER_REVIEW: 'Under review',
  NEEDS_REVISION: 'Revision requested',
  RESUBMITTED: 'Resubmitted',
  APPROVED: 'Approved',
  SCHEDULED: 'Scheduled',
  PUBLISHED: 'Published',
  REJECTED: 'Not accepted',
  WITHDRAWN: 'Withdrawn',
  ARCHIVED: 'Archived',
};

const STATUS_TONE: Record<string, string> = {
  APPROVED: 'ok',
  PUBLISHED: 'ok',
  SUBMISSIONS_OPEN: 'ok',
  WAITLIST_OPEN: 'info',
  SUBMITTED: 'info',
  UNDER_REVIEW: 'info',
  RESUBMITTED: 'info',
  SCHEDULED: 'info',
  NEEDS_REVISION: 'warn',
  NEEDS_INFO: 'warn',
  WAITLISTED: 'warn',
  REJECTED: 'err',
  SUSPENDED: 'err',
  WITHDRAWN: 'muted',
  ARCHIVED: 'muted',
  DRAFT: 'muted',
};

export function StatusPill({ status, labels }: { status: string; labels: Record<string, string> }) {
  const tone = STATUS_TONE[status] ?? 'muted';
  return <span className={`pill pill--${tone}`}>{labels[status] ?? status}</span>;
}

/** Prominent WhatsApp Channel call-to-action. Opens safely in a new tab. */
export function WhatsAppCard({ url, compact }: { url?: string; compact?: boolean }) {
  const href = url || WHATSAPP_CHANNEL_URL;
  return (
    <div className={compact ? 'wa-card wa-card--compact' : 'wa-card'}>
      <div className="wa-card__body">
        <strong>Follow Indigen World Creators on WhatsApp</strong>
        <p>Receive campaign openings, creator resources, deadlines and winner announcements.</p>
      </div>
      <a
        className="button button--whatsapp"
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => trackEvent('whatsapp_cta_clicked')}
      >
        Open WhatsApp Channel
      </a>
    </div>
  );
}

export function Stepper({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol className="stepper" aria-label="Progress">
      {steps.map((label, index) => {
        const state = index < current ? 'done' : index === current ? 'current' : 'todo';
        return (
          <li key={label} className={`stepper__item stepper__item--${state}`} aria-current={index === current ? 'step' : undefined}>
            <span className="stepper__dot">{index < current ? '✓' : index + 1}</span>
            <span className="stepper__label">{label}</span>
          </li>
        );
      })}
    </ol>
  );
}

export function EmptyState({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      {body ? <p>{body}</p> : null}
      {action}
    </div>
  );
}

export function Callout({ tone = 'info', children }: { tone?: 'info' | 'warn' | 'ok'; children: ReactNode }) {
  return <div className={`callout callout--${tone}`}>{children}</div>;
}

export function Skeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="skeleton" aria-hidden="true">
      {Array.from({ length: lines }).map((_, i) => (
        <span key={i} className="skeleton__line" />
      ))}
    </div>
  );
}

export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className={error ? 'field field--error' : 'field'}>
      <label htmlFor={htmlFor}>{label}</label>
      {hint ? <p className="field__hint">{hint}</p> : null}
      {children}
      {error ? (
        <p className="field__error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
