import { Icon } from '../ui/icons';
import { useEffect, useState } from 'react';
import { PortalLink, useWorkspace } from './workspace';
import { livePaymentService, previewService, type Streak } from './rewards';

/** The streak, as a small link beside the page title: the count and what keeps it going. */
export function HomeStreak() {
  const data = useWorkspace();
  const [streak, setStreak] = useState<Streak | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    setStreak(null);
    setFailed(false);
    const refresh = () => {
      void (data.preview ? previewService : livePaymentService).load().then(result => {
        if (active) { setStreak(result.data.streak); setFailed(false); }
      }).catch(() => { if (active) setFailed(true); });
    };
    refresh();
    const timer = window.setInterval(refresh, 60_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [data.uid, data.preview]);
  const title = failed ? 'View your streak' : !streak ? 'Loading streak…' : streak.current ? `${streak.current}-day streak` : 'Start your streak';
  const hint = failed ? 'Streak unavailable right now.' : !streak ? 'Checking your activity' : streak.activeToday ? 'You’ve contributed today.' : streak.current ? 'Submit a task today to keep it going.' : 'Submit a task today to begin.';
  return (
    <PortalLink to={data.paths.section('streak')} className={`cw-streak${streak?.activeToday ? ' is-lit' : ''}`} ariaLabel={`${title}. ${hint} View streak details.`}>
      <span className="cw-streak__flame" aria-hidden="true"><Icon name="flame" /></span>
      <span className="cw-streak__copy">
        <strong>{title}</strong>
        <small>{hint}</small>
      </span>
      <Icon name="chevron" className="cw-streak__go" />
    </PortalLink>
  );
}
