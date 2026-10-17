import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useWorkspace, PortalLink } from './workspace';
import { achievements, DEFAULT_JOURNEY, participationDays, reviewGrowth, weekDays, type Journey } from './journeyModel';
import { Icon, CountUp } from '../ui';
import { useRoute } from '../router';
import { motionAllowed } from '../ui/motion';

const JourneyContext = createContext<{ value: Journey; loading: boolean; saving: boolean; error: string; save: (patch: Partial<Journey>) => Promise<boolean>; retry: () => void } | null>(null);
export function JourneyProvider({ children }: { children: ReactNode }) {
  const data = useWorkspace();
  const [value, setValue] = useState<Journey>(DEFAULT_JOURNEY), [loading, setLoading] = useState(true), [error, setError] = useState(''), [attempt, setAttempt] = useState(0);
  const latest = useRef(value); latest.current = value;
  const saving = useRef(false);
  const generation = useRef(0);
  const [pending, setPending] = useState(false);
  const key = Object.values(data.items).flat().map(item => item.submissionId).filter(Boolean).join(',');
  useEffect(() => {
    let active = true;
    const refresh = () => {
      if (saving.current) return;
      const version = generation.current;
      void data.services.loadJourney().then(next => { if (active && !saving.current && version === generation.current) { setValue(next); setLoading(false); setError(''); } })
        .catch(() => { if (active && !saving.current && version === generation.current) { setLoading(false); setError('Your participation preferences could not be loaded.'); } });
    };
    refresh();
    const timer = window.setInterval(refresh, 60000);
    return () => { active = false; window.clearInterval(timer); };
  }, [data.uid, data.services, key, attempt]);
  const save = async (patch: Partial<Journey>) => {
    if (saving.current || loading || error) return false;
    saving.current = true;
    generation.current++; setPending(true);
    const next = { ...latest.current, ...patch };
    try { await data.services.saveJourney(next); latest.current = next; setValue(next); setError(''); return true; }
    catch { setError('Your preference could not be saved. Retry before changing it again.'); return false; }
    finally { saving.current = false; setPending(false); }
  };
  return <JourneyContext.Provider value={{ value, loading, saving: pending, error, save, retry: () => setAttempt(count => count + 1) }}>{children}</JourneyContext.Provider>;
}
export function useJourney() { return useContext(JourneyContext) ?? { value: DEFAULT_JOURNEY, loading: true, saving: false, error: '', save: async () => false, retry: () => undefined }; }

/** A quiet decorative burst; the success message is the accessible content. */
export function MilestoneBurst({ active }: { active: boolean }) {
  return active ? <span className="cq-burst" aria-hidden="true">{Array.from({ length: 12 }, (_, index) => <i key={index} style={{ ['--i' as string]: index }} />)}</span> : null;
}

export function ParticipationCard() {
  const data = useWorkspace(), journey = useJourney();
  const [busy, setBusy] = useState(false);
  const days = weekDays(), active = participationDays(journey.value, data.rounds);
  const count = days.filter(day => active.includes(day)).length;
  const today = new Date().toISOString().slice(0, 10);
  return <section className="cq-card cq-week" aria-labelledby="week-title">
    <div className="cq-card-head"><span className="cq-eyebrow"><Icon name="calendar" />Your rhythm</span><span className="cq-small">This week · UTC</span></div>
    <div className="cq-week-heading"><h2 id="week-title">A little, often.</h2><strong><CountUp value={count} /><span> / {journey.value.weeklyGoal} days</span></strong></div>
    <p className="cq-muted">Submit new work or a revision on the days that suit you.</p>
    <div className="cq-week-days" aria-label={`${count} active days this week`}>{days.map((day, index) => <span key={day} className={`${active.includes(day) ? 'is-done' : ''} ${day === today ? 'is-today' : ''}`} aria-label={`${day}${active.includes(day) ? ', contributed' : ''}${day === today ? ', today' : ''}`}><small>{['M', 'T', 'W', 'T', 'F', 'S', 'S'][index]}</small><span>{active.includes(day) ? <Icon name="check" /> : day.slice(-2)}</span></span>)}</div>
    <div className="cq-card-foot"><label>Weekly goal <select aria-label="Weekly participation goal" value={journey.value.weeklyGoal} disabled={busy || journey.loading || journey.saving || Boolean(journey.error)} onChange={async event => { setBusy(true); await journey.save({ weeklyGoal: Number(event.target.value) }); setBusy(false); }}>{[1, 2, 3, 4, 5, 6, 7].map(value => <option key={value} value={value}>{value} {value === 1 ? 'day' : 'days'}</option>)}</select></label><span className="cq-small">{count >= journey.value.weeklyGoal ? 'Your goal is reached' : 'Every week is a fresh start'}</span></div>
    {journey.error ? <p className="cq-error" role="alert">{journey.error} <button type="button" onClick={journey.retry}>Retry</button></p> : null}
  </section>;
}

export function QualityMissions() {
  const data = useWorkspace(), { navigate } = useRoute();
  const items = Object.entries(data.items).flatMap(([work, rows]) => rows.map(item => ({ ...item, work })));
  const returned = items.find(item => ['rejected', 'needs_revision'].includes(item.status));
  const context = items.find(item => !item.submissionId && item.translation.trim() && !item.context?.trim() && !item.details?.situation?.trim());
  const next = items.find(item => !item.submissionId && !item.unsure);
  const missions = [
    { title: 'Make one answer stronger', text: returned ? 'A reviewer left a useful starting point.' : 'Open when a reviewer asks for a change.', icon: 'refresh' as const, item: returned, section: 'translate' },
    { title: 'Give a phrase its setting', text: context ? 'Help a reviewer understand who would say it.' : 'Open when a saved draft needs context.', icon: 'message' as const, item: context, section: 'context' },
    { title: 'Work through a small session', text: next ? 'A few thoughtful expressions, at your own pace.' : 'Your assigned work is already submitted.', icon: 'target' as const, item: next, section: 'understand' },
  ];
  return <section className="cq-card cq-missions" aria-labelledby="missions-title"><div className="cq-card-head"><span className="cq-eyebrow"><Icon name="compass" />Useful next steps</span><span className="cq-small">Choose your focus</span></div><h2 id="missions-title">Small steps. Better data.</h2><div className="cq-mission-list">{missions.map(mission => <button key={mission.title} type="button" disabled={!mission.item || data.itemsState !== 'ready'} onClick={() => mission.item && navigate(`${data.paths.work(mission.item.work, mission.item.id)}&step=${mission.section}`)}><span className="cq-mission-icon"><Icon name={mission.icon} /></span><span><strong>{mission.title}</strong><small>{mission.text}</small></span><Icon name={mission.item ? 'arrow' : 'check'} /></button>)}</div></section>;
}

export function RecognitionCard() {
  const data = useWorkspace(), journey = useJourney();
  const badges = achievements(Object.values(data.items).flat(), data.rounds);
  const previous = useRef<string | null>(null), [celebrate, setCelebrate] = useState(false);
  const signature = badges.filter(badge => badge.count >= badge.target).map(badge => badge.id).join(',');
  useEffect(() => {
    if (data.itemsState !== 'ready' || data.roundsState !== 'ready') return;
    let timer = 0;
    if (previous.current !== null && signature !== previous.current && signature.split(',').filter(Boolean).length > previous.current.split(',').filter(Boolean).length && journey.value.celebrations && motionAllowed()) {
      setCelebrate(true); timer = window.setTimeout(() => setCelebrate(false), 1800);
    }
    previous.current = signature;
    return () => window.clearTimeout(timer);
  }, [signature, data.itemsState, data.roundsState, journey.value.celebrations]);
  if (data.itemsState !== 'ready' || data.roundsState !== 'ready') return <section className="cq-card cq-recognition" aria-labelledby="recognition-title"><span className="cq-eyebrow"><Icon name="award" />Recognition</span><h2 id="recognition-title">Your work has meaning.</h2><p className="cq-muted" role="status">{data.itemsState === 'error' || data.roundsState === 'error' ? 'Recognition could not be counted right now. Your review records remain the source of your progress.' : 'Loading your reviewed contributions…'}</p></section>;
  return <section className="cq-card cq-recognition" aria-labelledby="recognition-title"><div className="cq-card-head"><span className="cq-eyebrow"><Icon name="award" />Recognition</span><span className="cq-small">Reviewer confirmed</span></div><h2 id="recognition-title">Your work has meaning.</h2><MilestoneBurst active={celebrate} /><div className="cq-badges">{badges.map(badge => <div key={badge.id} className={`cq-badge ${badge.count >= badge.target ? 'is-earned' : ''}`}><span className="cq-badge-medal"><Icon name={badge.icon} /></span><div><strong>{badge.title}</strong><small>{badge.criterion}</small><span className="cq-badge-progress">{Math.min(badge.count, badge.target)} / {badge.target}{badge.count >= badge.target ? ' · Earned' : ''}</span></div></div>)}</div><div className="cq-card-foot"><PortalLink to={data.paths.section('rewards')} className="ts-link">Points & rewards<Icon name="arrow" /></PortalLink><label className="cq-small"><input type="checkbox" checked={journey.value.celebrations} disabled={journey.loading || journey.saving || Boolean(journey.error)} onChange={event => void journey.save({ celebrations: event.target.checked })} />Celebrations</label></div></section>;
}

export function GrowthCard() {
  const data = useWorkspace();
  const growth = useMemo(() => reviewGrowth(data.rounds), [data.rounds]);
  if (data.roundsState !== 'ready') return <section className="cq-card cq-growth" aria-labelledby="growth-title"><span className="cq-eyebrow"><Icon name="branch" />Learning from review</span><h2 id="growth-title">See what is improving.</h2><p className="cq-muted" role="status">{data.roundsState === 'error' ? 'Review history could not be loaded. Try reloading the workspace.' : 'Loading review history…'}</p></section>;
  return <section className="cq-card cq-growth" aria-labelledby="growth-title"><div className="cq-card-head"><span className="cq-eyebrow"><Icon name="branch" />Learning from review</span><span className="cq-small">Review rounds</span></div><h2 id="growth-title">See what is improving.</h2><div className="cq-growth-cohorts">{[{ label: 'Previous 14 days', value: growth.previous }, { label: 'Latest 14 days', value: growth.recent }].map(({ label, value }) => <div key={label}><small>{label}</small><strong>{value.accepted}<span> / {value.total}</span></strong><span className="cq-small">accepted review rounds</span><div className="cq-track"><i style={{ width: `${value.total ? value.accepted / value.total * 100 : 0}%` }} /></div></div>)}</div><p className="cq-muted">{growth.themes.length ? 'Feedback to learn from:' : 'Reviewer feedback will reveal useful areas to practise.'}</p><div className="cq-theme-list">{growth.themes.map(theme => <span key={theme.label}>{theme.label}<b>{theme.count}</b></span>)}</div><p className="cq-small">Based on up to 500 recent records, including earlier revisions. Pending submissions are excluded.</p></section>;
}

export function CommunityGoalCard() {
  const data = useWorkspace(), { value } = useJourney();
  const goal = value.communityGoal;
  const approved = data.pulse.totals?.approved ?? 0;
  return <section className="cq-card cq-community" aria-labelledby="community-title"><div className="cq-card-head"><span className="cq-eyebrow"><Icon name="users" />Made together</span><span className="cq-small">Today · UTC</span></div><h2 id="community-title">A language grows with us.</h2>{data.pulse.state === 'unavailable' || data.pulse.state === 'loading' ? <p className="cq-muted">Community progress is unavailable right now.</p> : <><div className="cq-community-number"><CountUp value={approved} />{goal ? <span> / {goal.target}</span> : null}</div><p className="cq-muted">Expressions approved by reviewers today.{data.pulse.state === 'cached' ? ' Showing the last available update.' : ''}</p>{goal ? <><div className="cq-track" role="progressbar" aria-label="Community review goal" aria-valuemin={0} aria-valuemax={goal.target} aria-valuenow={Math.min(approved, goal.target)}><i style={{ width: `${Math.min(100, approved / goal.target * 100)}%` }} /></div><span className="cq-small">{approved >= goal.target ? 'The team’s goal is reached.' : 'Each reviewed contribution brings us closer.'}</span></> : <p className="cq-small">The team has not set a shared target for today.</p>}</>}<PortalLink to={data.paths.account('notifications')} className="ts-link">Choose your community visibility<Icon name="arrow" /></PortalLink></section>;
}

export function PracticeCard() {
  const journey = useJourney(), [open, setOpen] = useState(false), [answer, setAnswer] = useState(''), [busy, setBusy] = useState(false);
  const finish = async () => { setBusy(true); const saved = await journey.save({ practiceCompleted: true }); if (saved) setOpen(false); setBusy(false); };
  return <section className="cq-card cq-practice" aria-labelledby="practice-title"><div className="cq-card-head"><span className="cq-eyebrow"><Icon name="book" />One-minute practice</span><span className="cq-small">{journey.value.practiceCompleted ? 'Completed' : 'A useful start'}</span></div><h2 id="practice-title">Give the reviewer a picture.</h2><p className="cq-muted">Learn how a short usage note makes an expression easier to review.</p><button type="button" className="ts-btn ts-btn--soft" aria-expanded={open} onClick={() => setOpen(value => !value)}>{open ? 'Close practice' : journey.value.practiceCompleted ? 'Practise again' : 'Try the practice'}<Icon name="arrow" /></button>{open ? <div className="cq-lesson"><p className="cq-eyebrow">Practice only · kept out of collection data</p><blockquote>“Please come and sit with us.”</blockquote><p>Which note gives a reviewer the clearest setting?</p><fieldset><legend className="sr-only">Choose a useful usage note</legend>{[['vague', 'It is a common expression.'], ['useful', 'A host warmly invites a visiting neighbour to join the family.'], ['length', 'This expression is quite long.']].map(([value, text]) => <label key={value}><input type="radio" name="practice-context" value={value} checked={answer === value} onChange={() => setAnswer(value)} />{text}</label>)}</fieldset>{answer ? <p role="status" className={answer === 'useful' ? 'cq-success' : 'cq-muted'}>{answer === 'useful' ? 'Exactly. The speaker, listener and situation help explain the intended tone.' : 'Try a note that tells us who is speaking, to whom, and why.'}</p> : null}<button type="button" className="ts-btn ts-btn--primary" disabled={answer !== 'useful' || busy || journey.loading || journey.saving || Boolean(journey.error)} onClick={() => void finish()}>{busy ? 'Saving…' : 'Complete practice'}<Icon name="check" /></button>{journey.error ? <p className="cq-error" role="alert">{journey.error}<button type="button" onClick={journey.retry}>Retry</button></p> : null}</div> : null}</section>;
}
