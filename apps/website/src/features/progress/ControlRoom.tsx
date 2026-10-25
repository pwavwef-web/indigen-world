import { useEffect, useState, type CSSProperties } from 'react';
import { Icon } from '../../components/Icon';
import { CATEGORIES_BY_ID } from './progressConfig';
import { approvalLabel, type PublicProgressEventView } from './liveProgressModel';
import { fillFraction, formatCount, formatPercent } from './progressFormat';
import { milestoneLabel, nextMilestone } from './progressMilestones';
import { formatShare, plantOutput } from './progressPlant';
import type { CategoryProgress, ConnectionState, ContributionCategoryId, LaunchProgressConfig } from './progressTypes';

/** A clock that ticks every `everyMs`, for "4 min ago". */
function useNow(everyMs: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), everyMs);
    return () => window.clearInterval(timer);
  }, [everyMs]);
  return now;
}

export function timeAgo(atMs: number, nowMs: number): string {
  if (!atMs) return '';
  const seconds = Math.max(0, Math.round((nowMs - atMs) / 1000));
  if (seconds < 45) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}

/** The plant's output dial: the mean fill of the jars, needle and digits together. */
function PlantDial({ categories, fixtureMode }: { categories: CategoryProgress[]; fixtureMode: boolean }) {
  const output = plantOutput(categories);
  const share = output.averageFill ?? 0;
  const angle = -90 + 180 * share;
  return <section className="control-panel control-panel--dial" aria-labelledby="plant-dial-title">
    <h2 id="plant-dial-title" className="control-panel__title"><span className="control-panel__lamp" aria-hidden="true" />Plant output</h2>
    <div className="plant-dial">
      <svg viewBox="0 0 220 128" aria-hidden="true" focusable="false">
        <defs>
          <linearGradient id="plant-dial-arc" x1="0" x2="1">
            <stop offset="0" stopColor="#36b6ff" /><stop offset=".6" stopColor="#4fe0d0" /><stop offset="1" stopColor="#ffc857" />
          </linearGradient>
        </defs>
        <path className="plant-dial__track" d="M24 112 A86 86 0 0 1 196 112" />
        <path className="plant-dial__value" d="M24 112 A86 86 0 0 1 196 112" pathLength="100" strokeDasharray={`${share * 100} 100`} stroke="url(#plant-dial-arc)" />
        {Array.from({ length: 11 }, (_, index) => <path key={index} className={index % 5 === 0 ? 'plant-dial__tick plant-dial__tick--major' : 'plant-dial__tick'}
          d={index % 5 === 0 ? 'M0 -98 V-84' : 'M0 -98 V-90'} transform={`translate(110 112) rotate(${-90 + index * 18})`} />)}
        {['0', '50', '100'].map((text, index) => <text key={text} className="plant-dial__scale" x={[16, 110, 204][index]} y={index === 1 ? 8 : 126} textAnchor="middle">{text}</text>)}
        <g className="plant-dial__needle" style={{ transform: `translate(110px, 112px) rotate(${angle}deg)` }}>
          <path d="M-3.4 0 L0 -80 L3.4 0 Z" />
        </g>
        <circle className="plant-dial__hub" cx="110" cy="112" r="8" />
      </svg>
      <p className="plant-dial__readout"><strong>{formatShare(output.averageFill)}</strong><span>average jar fill</span></p>
    </div>
    <p className="control-panel__foot">
      <strong>{formatCount(output.verifiedItems)}</strong> {fixtureMode ? 'sample items' : 'verified items'} · mean of {output.readable} {output.readable === 1 ? 'jar' : 'jars'}
    </p>
    {/* Each jar's own fill, in catalogue order; the numbers themselves are on the jars. */}
    <ol className="jar-strip" aria-hidden="true">
      {categories.map((item, index) => {
        const fill = item.isTargetSetting || !item.isCountKnown ? 0 : fillFraction(item.approvedCount, item.target);
        return <li key={item.category.id} title={`${item.category.title}: ${formatPercent(item.approvedCount, item.target) ?? '—'}`} data-sealed={item.isTargetReached ? 'true' : undefined}
          style={{ '--fill': fill, '--min-fill': fill > 0 ? '2px' : '0px' } as CSSProperties}>
          <span className="jar-strip__glass"><span /></span>
          <span className="jar-strip__no">{String(index + 1).padStart(2, '0')}</span>
        </li>;
      })}
    </ol>
  </section>;
}

/** The projection's recent changes, newest first. No names: a collection, an amount and a time. */
function DeliveryLog({ events, fixtureMode, connection }: { events: PublicProgressEventView[] | null; fixtureMode: boolean; connection: ConnectionState }) {
  const now = useNow(30_000);
  const latest = (events ?? []).slice(-5).reverse();
  return <section className="control-panel control-panel--log" aria-labelledby="delivery-log-title">
    <h2 id="delivery-log-title" className="control-panel__title">
      <span className="control-panel__lamp" data-on={connection === 'live' || connection === 'sample'} aria-hidden="true" />
      Delivery log{fixtureMode ? ' · sample' : ''}
    </h2>
    {events === null ? <p className="delivery-log__empty">The log returns with the live connection. Totals are counted directly meanwhile.</p>
      : latest.length === 0 ? <p className="delivery-log__empty">{fixtureMode ? 'Simulate an approval from Options to see a delivery.' : 'No deliveries in the current log yet.'}</p>
        : <ol className="delivery-log">
          {latest.map((event) => {
            const category = CATEGORIES_BY_ID[event.category];
            return <li key={event.id} className="delivery-log__row" style={{ '--jar-accent': category.accentHue } as CSSProperties}>
              <span className="delivery-log__icon" aria-hidden="true"><Icon name={category.iconName} size={13} /></span>
              <span className="delivery-log__what">
                <strong>{category.title}</strong>
                <span>{event.delta > 0 ? approvalLabel(event.delta, event.category) : `count corrected ${event.delta.toLocaleString('en-US')}`} · now {formatCount(event.total)}</span>
              </span>
              <time className="delivery-log__when" dateTime={event.atMs ? new Date(event.atMs).toISOString() : undefined}>{timeAgo(event.atMs, now)}</time>
            </li>;
          })}
        </ol>}
  </section>;
}

function daysUntil(dateText: string | null, nowMs: number): number | null {
  if (!dateText) return null;
  const at = Date.parse(dateText);
  if (!Number.isFinite(at)) return null;
  return Math.max(0, Math.ceil((at - nowMs) / 86_400_000));
}

/** Sealed jars, the jar that most needs hands, and the launch window as configured. */
function ShiftBoard({ categories, config, onFind }: { categories: CategoryProgress[]; config: LaunchProgressConfig; onFind: (id: ContributionCategoryId) => void }) {
  const now = useNow(3_600_000);
  const output = plantOutput(categories);
  const withTargets = categories.filter((item) => !item.isTargetSetting).length;
  const needed = categories.find((item) => item.needsContributions);
  // The jar nearest its next goal line, by items still needed.
  const closest = categories
    .map((item) => ({ item, next: item.isTargetSetting || !item.isCountKnown ? null : nextMilestone(item.approvedCount, item.target) }))
    .filter((entry): entry is { item: CategoryProgress; next: NonNullable<ReturnType<typeof nextMilestone>> } => entry.next !== null)
    .sort((a, b) => a.next.remaining - b.next.remaining)[0];
  const days = daysUntil(config.launchTargetDate, now);
  return <section className="control-panel control-panel--board" aria-labelledby="shift-board-title">
    <h2 id="shift-board-title" className="control-panel__title"><span className="control-panel__lamp" data-on="true" aria-hidden="true" />Shift board</h2>
    <dl className="shift-board">
      <div><dt>Sealed jars</dt><dd><strong>{output.sealed}</strong> / {withTargets || '—'}</dd></div>
      <div><dt>Launch</dt><dd>{days !== null ? <><strong>{days}</strong> {days === 1 ? 'day' : 'days'}</> : config.launchWindowLabel.replace(/^Planned:\s*/i, '')}</dd></div>
    </dl>
    <div className="shift-board__actions">
      {needed && <button type="button" className="shift-board__needed" onClick={() => onFind(needed.category.id)}>
        <span>Most needed now</span>
        <strong>{needed.category.title}</strong>
        <Icon name="arrow" size={13} />
      </button>}
      {closest && <button type="button" className="shift-board__needed shift-board__needed--goal" onClick={() => onFind(closest.item.category.id)}>
        <span>Closest goal</span>
        <strong>{closest.item.category.title}: {formatCount(closest.next.remaining)} {closest.next.remaining === 1 ? closest.item.category.unit : closest.item.category.unitPlural} to {milestoneLabel(closest.next.percent)}</strong>
        <Icon name="arrow" size={13} />
      </button>}
    </div>
  </section>;
}

export function ControlRoom({ categories, events, connection, fixtureMode, config, onFind }: {
  categories: CategoryProgress[];
  events: PublicProgressEventView[] | null;
  connection: ConnectionState;
  fixtureMode: boolean;
  config: LaunchProgressConfig;
  onFind: (id: ContributionCategoryId) => void;
}) {
  return <div className="control-room">
    <PlantDial categories={categories} fixtureMode={fixtureMode} />
    <DeliveryLog events={events} fixtureMode={fixtureMode} connection={connection} />
    <ShiftBoard categories={categories} config={config} onFind={onFind} />
  </div>;
}
