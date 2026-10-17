import { useState } from 'react';
import { Button } from '../ui/primitives';
type Row = Record<string, any>;
export function OrderRequests({ requests, notes, resolve }: { requests: Row[]; notes: Row[]; resolve: (request: Row) => Promise<void> }) {
  const [messages, setMessages] = useState<Record<string, string>>({});
  return <><h3>Customer requests</h3>{requests.length ? requests.map((r) => <div className="panel" key={r.id}>
    <strong>{r.kind} · {r.status}</strong><p>{r.message}</p>{r.resolution && <p>{r.resolution}</p>}
    {r.status === 'open' && <><label>Resolution for {r.kind}<textarea value={messages[r.id] ?? ''} onChange={(e) => setMessages({ ...messages, [r.id]: e.target.value })} /></label>
      <div className="shop-shortcuts">{(r.kind === 'support' ? ['resolved'] : ['approved', 'declined']).map((status) => <Button key={status} disabled={!messages[r.id]?.trim()} onClick={() => void resolve({ requestId: r.id, status, message: messages[r.id] })}>{status}</Button>)}</div>
      {r.kind !== 'support' && <p className="muted">Approval does not issue a refund or restock goods. Finance verifies refunds; Inventory records a separate inspected disposition.</p>}
    </>}
  </div>) : <p>No customer requests.</p>}
    <h3>Internal notes</h3>{notes.map((n) => <p key={n.id}>{n.text} · {n.actorUid} · {n.createdAt}</p>)}
  </>;
}
