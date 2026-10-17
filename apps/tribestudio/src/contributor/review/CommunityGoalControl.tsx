import { useEffect, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../firebase';
import { useAuth } from '../../auth';
import { Icon } from '../../ui';

type Goal = { enabled: boolean; target: number; day: string };
const read = httpsCallable<Record<string, never>, Goal>(functions, 'getContributorCollectionGoal');
const save = httpsCallable<Goal, Goal>(functions, 'setContributorCollectionGoal');
export function CommunityGoalControl() {
  const { role } = useAuth();
  return role === 'admin' || role === 'super_admin' ? <GoalEditor /> : null;
}
function GoalEditor() {
  const today = new Date().toISOString().slice(0, 10);
  const [goal, setGoal] = useState<Goal>({ enabled: false, target: 30, day: today });
  const [ready, setReady] = useState(false), [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [failed, setFailed] = useState(false), [attempt, setAttempt] = useState(0);
  useEffect(() => { let active = true; void read({}).then(result => { if (active) { setGoal(result.data); setReady(true); setFailed(false); setMessage(''); } }).catch(() => { if (active) { setMessage('The community target could not be loaded.'); setFailed(true); } }); return () => { active = false; }; }, [attempt]);
  return <details className="ts-disclosure" style={{ marginBottom: 18 }}><summary><Icon name="target" /><span>Community collection goal<small>Administrator control · reviewed expressions per UTC day</small></span><Icon name="chevron" /></summary><div className="ts-disclosure__body"><p className="ts-hint">A shared goal encourages contributors to improve useful work. Progress counts actual approvals from the contributor community for the chosen day.</p><div className="ts-row" style={{ flexWrap: 'wrap' }}><label className="ts-check"><input type="checkbox" checked={goal.enabled} disabled={!ready || busy} onChange={event => setGoal({ ...goal, enabled: event.target.checked })} />Show the shared goal</label><label className="ts-field"><span className="ts-label">UTC day</span><input type="date" className="ts-input" value={goal.day} disabled={!ready || busy} onChange={event => setGoal({ ...goal, day: event.target.value })} /></label><label className="ts-field"><span className="ts-label">Reviewed expressions</span><input type="number" className="ts-input" min={1} max={10000} step={1} value={goal.target} disabled={!ready || busy} onChange={event => setGoal({ ...goal, target: Number(event.target.value) })} /></label><button type="button" className="ts-btn ts-btn--primary" disabled={!ready || busy || !goal.day || !Number.isInteger(goal.target) || goal.target < 1 || goal.target > 10000} onClick={async () => { setBusy(true); try { const result = await save(goal); setGoal(result.data); setMessage('Community goal saved. Contributors see it on the selected UTC day.'); setFailed(false); } catch { setMessage('The community goal could not be saved. Try again.'); setFailed(true); } finally { setBusy(false); } }}>{busy ? 'Saving…' : 'Save goal'}</button></div>{message ? <p role={failed ? 'alert' : 'status'} className="ts-hint">{message} {failed && !ready ? <button type="button" className="ts-btn ts-btn--sm" onClick={() => setAttempt(value => value + 1)}>Retry</button> : null}</p> : null}</div></details>;
}
