import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { day, ghs, ghsShort, monthLabel, pct } from './money';

/* ==========================================================================
   Finance charts, drawn as plain SVG from figures the server computed.

   Colour does one job each: blue is the balance, green is money in, red is
   money out (validated for colour-vision deficiency in light and dark; see
   money.css). Colour is never the only cue: money in sits above the zero
   line and money out below it, values carry +/− signs, and every chart has
   a legend or direct labels plus a table for screen readers.
   ========================================================================== */

function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    observer.observe(node);
    setWidth(Math.round(node.getBoundingClientRect().width));
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

/** Round tick steps (1, 2, 2.5, 5 × 10ⁿ pesewas) covering [min, max] with zero included. */
function ticks(min: number, max: number, count = 4): number[] {
  const lo = Math.min(0, min), hi = Math.max(0, max);
  const span = hi - lo || 100_00;
  const raw = span / count;
  const power = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * power).find((s) => s >= raw) ?? power * 10;
  const start = Math.floor(lo / step) * step;
  const out: number[] = [];
  for (let v = start; v <= hi + step * 0.001; v += step) out.push(Math.round(v));
  if (out.at(-1)! < hi) out.push(out.at(-1)! + step);
  return out;
}

function SrTable({ caption, head, rows }: { caption: string; head: string[]; rows: ReactNode[][] }) {
  return (
    <div className="ad-table-scroll">
    <table className="sr-only">
      <caption>{caption}</caption>
      <thead><tr>{head.map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead>
      <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody>
    </table>
    </div>
  );
}

function Tooltip({ x, y, width, children }: { x: number; y: number; width: number; children: ReactNode }) {
  const left = Math.min(Math.max(x, 70), Math.max(70, width - 70));
  return <div className="fm-tip" style={{ left, top: y }} role="status">{children}</div>;
}

/* -- Balance over time ---------------------------------------------------------------------- */

export function BalanceChart({ points, label }: { points: { date: string; balanceMinor: number }[]; label: string }) {
  const [box, width] = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const gradient = useId().replace(/:/g, '');
  const height = 240, padL = 64, padR = 16, padT = 16, padB = 28;
  const values = points.map((p) => p.balanceMinor);
  const yTicks = ticks(Math.min(...values, 0), Math.max(...values, 0));
  const yMin = yTicks[0], yMax = yTicks.at(-1)!;
  const t0 = points.length ? Date.parse(`${points[0].date}T00:00:00Z`) : 0;
  const t1 = points.length ? Date.parse(`${points.at(-1)!.date}T00:00:00Z`) : 1;
  const plotW = Math.max(10, width - padL - padR), plotH = height - padT - padB;
  const x = (date: string) => padL + (t1 === t0 ? plotW / 2 : ((Date.parse(`${date}T00:00:00Z`) - t0) / (t1 - t0)) * plotW);
  const y = (v: number) => padT + plotH - ((v - yMin) / (yMax - yMin || 1)) * plotH;
  // Balances change at a posting and hold until the next: draw steps, not slopes.
  const path = points.map((p, i) => i === 0 ? `M${x(p.date)},${y(p.balanceMinor)}` : `H${x(p.date)}V${y(p.balanceMinor)}`).join('');
  const area = points.length ? `${path}V${y(Math.max(0, yMin))}H${x(points[0].date)}Z` : '';
  const xLabels = useMemo(() => {
    if (!points.length) return [];
    const n = Math.min(points.length, Math.max(2, Math.floor(plotW / 110)));
    const picks = new Set<number>();
    for (let i = 0; i < n; i += 1) picks.add(Math.round((i * (points.length - 1)) / Math.max(1, n - 1)));
    return [...picks].map((i) => points[i]);
  }, [points, plotW]);
  const onKey = (event: KeyboardEvent) => {
    if (!points.length) return;
    if (event.key === 'ArrowRight') setActive((a) => Math.min(points.length - 1, (a ?? -1) + 1));
    else if (event.key === 'ArrowLeft') setActive((a) => Math.max(0, (a ?? points.length) - 1));
    else if (event.key === 'Escape') setActive(null);
    else return;
    event.preventDefault();
  };
  const onMove = (clientX: number) => {
    const rect = box.current?.getBoundingClientRect();
    if (!rect || !points.length) return;
    const px = clientX - rect.left;
    let best = 0;
    points.forEach((p, i) => { if (Math.abs(x(p.date) - px) < Math.abs(x(points[best].date) - px)) best = i; });
    setActive(best);
  };
  const point = active !== null ? points[active] : null;
  return (
    <div className="fm-chart" ref={box}>
      {width > 0 && points.length ? (
        <svg width={width} height={height} role="img" aria-label={`${label}. Balance ${ghs(values.at(-1) ?? 0)} on ${day(points.at(-1)?.date)}. Use the arrow keys to read each change.`}
          tabIndex={0} onKeyDown={onKey} onMouseMove={(e) => onMove(e.clientX)} onMouseLeave={() => setActive(null)} onBlur={() => setActive(null)}
          onTouchStart={(e) => onMove(e.touches[0].clientX)} onTouchMove={(e) => onMove(e.touches[0].clientX)}>
          <defs>
            <linearGradient id={gradient} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" className="fm-area-top" />
              <stop offset="100%" className="fm-area-bottom" />
            </linearGradient>
          </defs>
          {yTicks.map((t) => (
            <g key={t}>
              <line x1={padL} x2={width - padR} y1={y(t)} y2={y(t)} className={t === 0 ? 'fm-zero' : 'fm-grid'} />
              <text x={padL - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fm-axis">{ghsShort(t)}</text>
            </g>
          ))}
          {xLabels.map((p, i) => (
            <text key={p.date} x={x(p.date)} y={height - 8} textAnchor={i === 0 ? 'start' : i === xLabels.length - 1 ? 'end' : 'middle'} className="fm-axis">{day(p.date).replace(/ \d{4}$/, '')}</text>
          ))}
          <path d={area} fill={`url(#${gradient})`} className="fm-area" />
          <path d={path} className="fm-line" pathLength={1} />
          {points.length <= 40 ? points.map((p, i) => i > 0 && <circle key={p.date} cx={x(p.date)} cy={y(p.balanceMinor)} r={3} className="fm-dot" />) : null}
          {point ? (
            <g>
              <line x1={x(point.date)} x2={x(point.date)} y1={padT} y2={padT + plotH} className="fm-cross" />
              <circle cx={x(point.date)} cy={y(point.balanceMinor)} r={5} className="fm-dot fm-dot--active" />
            </g>
          ) : null}
        </svg>
      ) : null}
      {point ? (
        <Tooltip x={x(point.date)} y={y(point.balanceMinor) - 12} width={width}>
          <span className="fm-tip__k">{day(point.date)}</span>
          <strong>Balance {ghs(point.balanceMinor)}</strong>
          {active! > 0 ? <span className="fm-tip__k">{ghs(point.balanceMinor - points[active! - 1].balanceMinor, { signed: true })} that day</span> : null}
        </Tooltip>
      ) : null}
      <SrTable caption={label} head={['Date', 'Balance']} rows={points.map((p) => [day(p.date), ghs(p.balanceMinor)])} />
    </div>
  );
}

/* -- Monthly in and out ------------------------------------------------------------------------ */

export function MonthlyChart({ months }: { months: { month: string; incomeMinor: number; expenseMinor: number; netMinor: number }[] }) {
  const [box, width] = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const height = 240, padL = 64, padR = 12, padT = 14, padB = 26;
  const yTicks = ticks(Math.min(0, ...months.map((m) => -m.expenseMinor), ...months.map((m) => m.netMinor)), Math.max(0, ...months.map((m) => m.incomeMinor), ...months.map((m) => m.netMinor)));
  const yMin = yTicks[0], yMax = yTicks.at(-1)!;
  const plotW = Math.max(10, width - padL - padR), plotH = height - padT - padB;
  const y = (v: number) => padT + plotH - ((v - yMin) / (yMax - yMin || 1)) * plotH;
  const band = plotW / Math.max(1, months.length);
  const barW = Math.max(3, Math.min(28, band * 0.56));
  const cx = (i: number) => padL + band * i + band / 2;
  const every = Math.max(1, Math.ceil(months.length / Math.max(1, Math.floor(plotW / 54))));
  const m = active !== null ? months[active] : null;
  return (
    <div className="fm-chart" ref={box}>
      <div className="fm-legend" aria-hidden="true">
        <span><i className="fm-key fm-key--in" />Money in</span><span><i className="fm-key fm-key--out" />Money out</span><span><i className="fm-key fm-key--net" />Net movement</span>
      </div>
      {width > 0 ? (
        <svg width={width} height={height} role="img" aria-label="Money in and out by month. Use the arrow keys to read each month." tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight') setActive((a) => Math.min(months.length - 1, (a ?? -1) + 1));
            else if (e.key === 'ArrowLeft') setActive((a) => Math.max(0, (a ?? months.length) - 1));
            else return;
            e.preventDefault();
          }} onMouseLeave={() => setActive(null)} onBlur={() => setActive(null)}>
          {yTicks.map((t) => (
            <g key={t}>
              <line x1={padL} x2={width - padR} y1={y(t)} y2={y(t)} className={t === 0 ? 'fm-zero' : 'fm-grid'} />
              <text x={padL - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fm-axis">{ghsShort(t)}</text>
            </g>
          ))}
          {months.map((row, i) => (
            <g key={row.month} className={active === i ? 'fm-col fm-col--active' : 'fm-col'} onMouseEnter={() => setActive(i)} onTouchStart={() => setActive(i)}>
              <rect x={padL + band * i} y={padT} width={band} height={plotH} className="fm-hit" />
              {row.incomeMinor > 0 ? <rect x={cx(i) - barW / 2} y={y(row.incomeMinor)} width={barW} height={Math.max(1, y(0) - y(row.incomeMinor) - 1)} rx={Math.min(4, barW / 3)} className="fm-bar fm-bar--in" /> : null}
              {row.expenseMinor > 0 ? <rect x={cx(i) - barW / 2} y={y(0) + 1} width={barW} height={Math.max(1, y(-row.expenseMinor) - y(0) - 1)} rx={Math.min(4, barW / 3)} className="fm-bar fm-bar--out" /> : null}
              {row.incomeMinor || row.expenseMinor ? <rect x={cx(i) - 5} y={y(row.netMinor) - 1.5} width={10} height={3} rx={1.5} className="fm-net" /> : null}
              {i % every === 0 ? <text x={cx(i)} y={height - 8} textAnchor="middle" className="fm-axis">{monthLabel(row.month)}</text> : null}
            </g>
          ))}
        </svg>
      ) : null}
      {m ? (
        <Tooltip x={cx(active!)} y={y(Math.max(0, m.incomeMinor)) - 12} width={width}>
          <span className="fm-tip__k">{monthLabel(m.month)}</span>
          <span><i className="fm-key fm-key--in" />In {ghs(m.incomeMinor)}</span>
          <span><i className="fm-key fm-key--out" />Out {ghs(m.expenseMinor)}</span>
          <strong>Net {ghs(m.netMinor, { signed: true })}</strong>
        </Tooltip>
      ) : null}
      <SrTable caption="Money in and out by month" head={['Month', 'Money in', 'Money out', 'Net']} rows={months.map((r) => [monthLabel(r.month), ghs(r.incomeMinor), ghs(r.expenseMinor), ghs(r.netMinor, { signed: true })])} />
    </div>
  );
}

/* -- Ranked bars (categories, funders) -------------------------------------------------------------- */

export function BarList({ rows, tone = 'accent', label, onSelect, empty }: {
  rows: { id: string; name: string; amountMinor: number; shareBps: number; note?: string }[];
  tone?: 'accent' | 'in' | 'out';
  label: string;
  onSelect?: (id: string) => void;
  empty: ReactNode;
}) {
  if (!rows.length) return <p className="fm-empty">{empty}</p>;
  const max = Math.max(...rows.map((r) => Math.abs(r.amountMinor)), 1);
  const shown = rows.slice(0, 8);
  const rest = rows.slice(8);
  const all = rest.length ? [...shown, { id: '__other', name: `Other (${rest.length})`, amountMinor: rest.reduce((s, r) => s + r.amountMinor, 0), shareBps: rest.reduce((s, r) => s + r.shareBps, 0) }] : shown;
  return (
    <ul className="fm-bars" aria-label={label}>
      {all.map((row) => {
        const body = (
          <>
            <span className="fm-bars__name">{row.name}{'note' in row && row.note ? <small>{row.note}</small> : null}</span>
            <span className="fm-bars__track" aria-hidden="true"><span className={`fm-bars__fill fm-bars__fill--${tone}`} style={{ width: `${Math.max(1.5, (Math.abs(row.amountMinor) / max) * 100)}%` }} /></span>
            <span className="fm-bars__value">{ghs(row.amountMinor)}</span>
            <span className="fm-bars__share">{pct(row.shareBps)}</span>
          </>
        );
        return (
          <li key={row.id}>
            {onSelect && row.id !== '__other' ? <button type="button" className="fm-bars__row" onClick={() => onSelect(row.id)}>{body}</button> : <div className="fm-bars__row">{body}</div>}
          </li>
        );
      })}
    </ul>
  );
}

/* -- Money in versus money out, for a period ------------------------------------------------------------ */

export function InOut({ incomeMinor, expenseMinor, label }: { incomeMinor: number; expenseMinor: number; label: string }) {
  const max = Math.max(incomeMinor, expenseMinor, 1);
  const total = incomeMinor + expenseMinor;
  const share = (v: number) => total > 0 ? Math.round((v / total) * 10_000) : 0;
  return (
    <div className="fm-inout" role="group" aria-label={label}>
      {[
        { key: 'in', name: 'Money in', value: incomeMinor, sign: '+' },
        { key: 'out', name: 'Money out', value: expenseMinor, sign: '−' },
      ].map((row) => (
        <div key={row.key} className="fm-inout__row">
          <div className="fm-inout__label"><i className={`fm-key fm-key--${row.key}`} aria-hidden="true" />{row.name}<span className="fm-inout__share">{pct(share(row.value))}</span></div>
          <div className="fm-inout__track" aria-hidden="true"><span className={`fm-inout__fill fm-inout__fill--${row.key}`} style={{ width: `${(row.value / max) * 100}%` }} /></div>
          <div className="fm-inout__value">{row.value ? row.sign : ''}{ghs(row.value)}</div>
        </div>
      ))}
      <div className="fm-inout__net">Net <strong>{ghs(incomeMinor - expenseMinor, { signed: true })}</strong></div>
    </div>
  );
}
