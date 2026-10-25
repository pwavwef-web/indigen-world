import { useState } from 'react';
import { RESPONSE_STATUS_LABELS } from '@indigen-world/contracts/forms';
import type { ResponseStatus } from '@indigen-world/contracts/forms';
import { Badge, Breadcrumb, ButtonLink, EmptyState, Icon, Page } from '../../ui';
import { useWorkspace } from '../workspace';
import { STATUS_TONE } from './forms-model';

/* Small pieces shared by the forms list, the fill workspace and the response page. */

export function StatusBadge({ status }: { status: ResponseStatus }) {
  return <Badge tone={STATUS_TONE[status] ?? 'neutral'} dot>{RESPONSE_STATUS_LABELS[status] ?? status}</Badge>;
}

/** Admin-written or contributor-written text, shown as plain text with its line breaks. */
export function Multiline({ text, className, lang }: { text: string; className?: string; lang?: string }) {
  return <p className={className ? `fm-multiline ${className}` : 'fm-multiline'} lang={lang}>{text}</p>;
}

/** Breadcrumb back to the forms list (and, optionally, My submissions). */
export function FormsCrumbs({ current, mine = false }: { current: string; mine?: boolean }) {
  const { paths } = useWorkspace();
  return (
    <Breadcrumb items={[
      { label: 'Available forms', to: paths.section('forms') },
      ...(mine ? [{ label: 'My submissions', to: paths.section('forms', { tab: 'mine' }) }] : []),
      { label: current },
    ]} />
  );
}

/** A reference id, large and easy to copy. */
export function ReferenceId({ value, large = false }: { value: string; large?: boolean }) {
  const [copied, setCopied] = useState('');
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied('Reference ID copied.');
    } catch {
      setCopied('Copy did not work here. Select the reference ID and copy it yourself.');
    }
  };
  return (
    <div className={large ? 'fm-ref fm-ref--large' : 'fm-ref'}>
      <span className="fm-ref__label">Reference ID</span>
      <span className="fm-ref__row">
        <code className="fm-ref__value" data-testid="reference-id">{value}</code>
        <button type="button" className="ts-btn ts-btn--secondary ts-btn--sm" onClick={() => void copy()}>
          <Icon name="copy" /><span>Copy<span className="ts-sr"> reference ID</span></span>
        </button>
      </span>
      <span className="ts-hint" role="status" aria-live="polite">{copied}</span>
    </div>
  );
}

/** A form or response the account cannot open: no audience match, or nothing there. */
export function FormsUnavailable({ kind, message }: { kind: 'denied' | 'missing'; message?: string }) {
  const { paths } = useWorkspace();
  return (
    <Page width="medium">
      <EmptyState
        boxed
        icon={kind === 'denied' ? 'lock' : 'map'}
        title={kind === 'denied' ? 'This form is not available to your account' : 'This form is not available'}
        body={kind === 'denied'
          ? 'It was opened to a particular group of contributors, such as speakers of one Kasem variety. Forms you can answer are listed under Available forms. If you think you should have access, use “Report a problem” or ask the person who shared the link.'
          : message || 'It may have been closed, archived or removed, or the link may be mistyped. Your saved responses are not affected.'}
        actions={(
          <>
            <ButtonLink variant="primary" icon="list" to={paths.section('forms')}>Available forms</ButtonLink>
            <ButtonLink variant="secondary" to={paths.section('forms', { tab: 'mine' })}>My submissions</ButtonLink>
          </>
        )}
      />
    </Page>
  );
}
