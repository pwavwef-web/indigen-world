import { PageHeader, Panel, Spinner, StatusPill, toneForStatus } from '@indigen-world/console-ui';
import type { ContributorRedemption } from './data';

type Action = 'approve' | 'reject' | 'fulfill' | 'paid';

export function RedemptionRequestsPanel({ requests, nameFor, loading = false, busy = '', onAction, preview = false }: {
  requests: ContributorRedemption[];
  nameFor: (id: string) => string;
  loading?: boolean;
  busy?: string;
  onAction?: (request: ContributorRedemption, action: Action) => void;
  preview?: boolean;
}) {
  const groups = [
    { title: 'Pending', description: 'New requests awaiting a decision.', requests: requests.filter(request => request.status === 'submitted') },
    { title: 'Approved', description: 'Approved requests awaiting delivery.', requests: requests.filter(request => request.status === 'approved') },
    { title: 'Sent', description: 'Airtime or data recorded as delivered.', requests: requests.filter(request => ['fulfilled', 'paid'].includes(request.status)) },
    { title: 'Rejected', description: 'Declined requests; any reserved points were returned.', requests: requests.filter(request => request.status === 'rejected') },
  ];

  return <Panel><PageHeader kicker="Contributor requests" title="Redemptions" body="Review pending requests, deliver approved airtime or data, and keep a record of sent rewards." />
    {preview && <p className="point-settings-preview-note">Sample requests only. Actions here update this preview and do not send airtime or data.</p>}
    {loading ? <p><Spinner /> Loading requests…</p> : groups.map(group => <section className="admin-redemption-group" key={group.title} aria-label={`${group.title} redemptions`}>
      <div className="admin-redemption-group__heading"><div><h3>{group.title} <span>{group.requests.length}</span></h3><p>{group.description}</p></div></div>
      {group.requests.length ? <div className="admin-payment-list">{group.requests.map(request => <article key={request.id}>
        <div><strong>{nameFor(request.contributorId)} · {request.points ? `${request.points.toLocaleString()} points` : request.description}</strong><small>{new Date(request.createdAt).toLocaleDateString()} · {new Intl.NumberFormat(undefined, { style: 'currency', currency: request.currency }).format(request.amountMinor / 100)}</small>{request.kind ? <p>{request.kind === 'airtime' ? 'Airtime' : 'Mobile data'} · {request.network} · <code>{request.phoneNumber}</code></p> : request.bankSnapshot ? <p>{request.bankSnapshot.accountName}<br />{request.bankSnapshot.bankName} · <code>{request.bankSnapshot.accountNumber}</code></p> : null}{request.adminNote ? <p>{request.adminNote}</p> : null}{request.paymentReference ? <p>Reference: <code>{request.paymentReference}</code></p> : null}</div>
        <div><StatusPill tone={toneForStatus(request.status)}>{request.status === 'fulfilled' ? 'sent' : request.status === 'submitted' ? 'pending' : request.status}</StatusPill>
          {request.status === 'submitted' && onAction ? <><button type="button" className="button--primary" disabled={busy === request.id} onClick={() => onAction(request, 'approve')}>Approve</button><button type="button" className="danger" disabled={busy === request.id} onClick={() => onAction(request, 'reject')}>Reject</button></> : null}
          {request.status === 'approved' && onAction ? <><button type="button" className="button--primary" disabled={busy === request.id} onClick={() => onAction(request, request.kind ? 'fulfill' : 'paid')}>{request.kind ? 'Mark sent' : 'Mark paid'}</button><button type="button" className="danger" disabled={busy === request.id} onClick={() => onAction(request, 'reject')}>Reject and return points</button></> : null}
        </div>
      </article>)}</div> : <p className="muted">No {group.title.toLowerCase()} redemptions.</p>}
    </section>)}
  </Panel>;
}
