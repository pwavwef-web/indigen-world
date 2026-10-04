import { useEffect, useState } from 'react';
import { useWorkspace, PortalLink } from './workspace';
import { livePaymentService, previewService } from './rewards';
import { Count, Icon } from '../ui';

/**
 * The updates strip above every contributor page: returned work and
 * delivered airtime or data. It appears only when there is something to say.
 */
export function NotificationCentre() {
  const data = useWorkspace();
  const [deliveries, setDeliveries] = useState<{ id: string; kind?: string }[]>([]);
  const [seen, setSeen] = useState<string[]>([]);
  const [failed, setFailed] = useState(false);
  const key = 'contributor-notifications:' + data.uid;
  useEffect(() => { try { setSeen(JSON.parse(localStorage.getItem(key) || '[]')); } catch { setSeen([]); } }, [key]);
  useEffect(() => {
    let active = true;
    const refresh = () => {
      void (data.preview ? previewService : livePaymentService).load().then(r => {
        if (active) { setDeliveries(r.data.requests.filter(x => x.status === 'fulfilled')); setFailed(false); }
      }).catch(() => { if (active) setFailed(true); });
    };
    refresh();
    const timer = setInterval(refresh, 60000);
    return () => { active = false; clearInterval(timer); };
  }, [data.uid, data.preview]);
  const returned = Object.values(data.items).flat().filter(x => ['rejected', 'needs_revision'].includes(x.status));
  const unread = deliveries.filter(x => !seen.includes(x.id)).length;
  if (!unread && !returned.length && !failed) return null;
  return (
    <details className="cw-updates ts-enter">
      <summary>
        <span className="cw-updates__icon" aria-hidden="true"><Icon name="bell" /></span>
        <span className="cw-updates__label">
          <strong>Updates</strong>
          {unread > 0 ? <Count value={`${unread} new`} /> : null}
          {returned.length > 0 ? <span className="ts-muted">{returned.length} need revision</span> : null}
        </span>
        <Icon name="chevron" className="ts-disclosure__chev" />
      </summary>
      <div className="cw-updates__body">
        {returned.length > 0 ? <PortalLink to={data.paths.section('contributions', { filter: 'returned' })} className="ts-link"><Icon name="alert" />Read feedback on {returned.length} returned {returned.length === 1 ? 'task' : 'tasks'}</PortalLink> : null}
        {deliveries.map(x => (
          <p key={x.id} className="ts-row" style={{ fontSize: 'var(--fs-sm)' }}>
            <PortalLink to={data.paths.section('rewards', { view: 'history' })} className="ts-link"><Icon name="gift" />{x.kind === 'airtime' ? 'Airtime' : 'Mobile data'} delivered</PortalLink>
            {!seen.includes(x.id) ? <Count value="New" /> : null}
          </p>
        ))}
        {failed ? <p className="ts-muted" style={{ fontSize: 'var(--fs-sm)' }}>Delivery updates could not be loaded. Open Recognition → History to try again.</p> : !returned.length && !deliveries.length ? <p className="ts-muted">No task or delivery updates yet.</p> : null}
        <div className="ts-cluster">
          <PortalLink to={data.paths.section('activity')} className="ts-link ts-link--quiet">View all activity<Icon name="arrow" /></PortalLink>
          {unread > 0 ? <button type="button" className="ts-btn ts-btn--ghost ts-btn--sm" onClick={() => { const ids = deliveries.map(x => x.id); setSeen(ids); try { localStorage.setItem(key, JSON.stringify(ids)); } catch { /* Optional. */ } }}><Icon name="check" /><span>Mark delivery updates read</span></button> : null}
        </div>
      </div>
    </details>
  );
}
