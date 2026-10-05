import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { getLiquidVisuals, LiquidBubbles } from './liquidVisuals';
import type { ArrivalCue } from './useApprovalFlows';
import type { ContributionCategoryId } from './progressTypes';

/** Eases between fills on arrival; any other change (first paint, view switch) is immediate. */
function useEasedFill(target: number, duration: number): number {
  const [value, setValue] = useState(target);
  const valueRef = useRef(target);
  useEffect(() => {
    const from = valueRef.current;
    if (duration <= 0 || Math.abs(target - from) < 1e-9) {
      valueRef.current = target;
      setValue(target);
      return undefined;
    }
    const start = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const next = from + (target - from) * (1 - (1 - progress) ** 3);
      valueRef.current = progress === 1 ? target : next;
      setValue(valueRef.current);
      if (progress < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target, duration]);
  return value;
}

// The jar's interior runs from y=85 to y=294 (209 units); the tank's from x=32 to x=568 (536 units), y=15 to y=73.
const JAR_TOP = 85;
const JAR_BOTTOM = 294;
const JAR_DEPTH = JAR_BOTTOM - JAR_TOP;
const TANK_LEFT = 32;
const TANK_LENGTH = 536;

/**
 * Layered glass optics and a clipped, data-driven liquid volume.
 *
 * Height (jar) or length (tank) is exactly the fill fraction of the interior.
 * Waves, bubbles, jets and ripples are all clipped to the liquid or the glass
 * interior, so no decoration can make a vessel look fuller than it is.
 *
 * Each vessel carries its own inlet stub — into the jar's mouth, into the
 * tank's left cap — and marks its open end with `data-pipe-inlet`, which is
 * where the measured pipe network joins it.
 */
export function GlassVessel({ categoryId, fill, unknown, horizontal = false, easeFill, arrival }: {
  categoryId: ContributionCategoryId;
  /** 0–1 of the interior. */
  fill: number;
  /** Target being set or count unreadable: neutral, no liquid. */
  unknown: boolean;
  horizontal?: boolean;
  /** Ease toward a new fill (an arrival), rather than jumping. */
  easeFill: boolean;
  arrival?: ArrivalCue | null;
}) {
  const id = useId().replace(/:/g, '');
  const shown = useEasedFill(unknown ? 0 : Math.min(1, Math.max(0, fill)), easeFill ? 900 : 0);
  const liquid = getLiquidVisuals(shown * 100, unknown);
  const body = 'M64 67 L64 88 C64 112 34 114 34 145 L34 272 Q34 301 64 302 L176 302 Q206 301 206 272 L206 145 C206 114 176 112 176 88 L176 67 Z';
  const cavity = 'M70 85 L70 93 C70 115 41 121 41 147 L41 272 Q41 294 65 294 L175 294 Q199 294 199 272 L199 147 C199 121 170 115 170 93 L170 85 Z';
  const x = horizontal ? TANK_LEFT : 41;
  const y = horizontal ? 15 : JAR_BOTTOM - JAR_DEPTH * shown;
  const width = horizontal ? TANK_LENGTH * shown : 158;
  const height = horizontal ? 58 : JAR_DEPTH * shown;
  const flowing = arrival?.travelled ? arrival.key : null;

  return <svg className={`glass-vessel-svg ${horizontal ? 'glass-vessel-svg--tank' : ''}`} viewBox={horizontal ? '0 0 600 88' : '0 0 240 330'}
    preserveAspectRatio={horizontal ? 'xMinYMid meet' : 'xMidYMid meet'} aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id={`glass-${id}`} x1="0" x2="1">
        <stop stopColor="#6296b3" stopOpacity=".55" /><stop offset=".07" stopColor="#e5faff" stopOpacity=".75" />
        <stop offset=".19" stopColor="#b6e0ef" stopOpacity=".14" /><stop offset=".5" stopColor="#f4fcff" stopOpacity=".08" />
        <stop offset=".83" stopColor="#a9d4e7" stopOpacity=".13" /><stop offset=".94" stopColor="#f0fdff" stopOpacity=".85" /><stop offset="1" stopColor="#537f98" stopOpacity=".65" />
      </linearGradient>
      <linearGradient id={`metal-${id}`} x1="0" y1="0" x2="0" y2="1">
        <stop stopColor="#456e85" /><stop offset=".12" stopColor="#cde8f2" /><stop offset=".28" stopColor="#f4feff" />
        <stop offset=".46" stopColor="#78a6bd" /><stop offset=".66" stopColor="#395f78" /><stop offset=".85" stopColor="#b0d9e9" /><stop offset="1" stopColor="#517a93" />
      </linearGradient>
      <linearGradient id={`stub-${id}`} x1={horizontal ? '0' : '0'} y1={horizontal ? '0' : '0'} x2={horizontal ? '0' : '1'} y2={horizontal ? '1' : '0'}>
        <stop offset="0" stopColor="#9cc3d6" /><stop offset=".28" stopColor="#f3fbff" /><stop offset=".72" stopColor="#d6ecf6" /><stop offset="1" stopColor="#8fb8cb" />
      </linearGradient>
      <linearGradient id={`liquid-${id}`} x1="0" y1="1" x2=".8" y2="0">
        {liquid.gradient.map((colour, index) => <stop key={index} offset={`${index * 100 / 3}%`} stopColor={colour} stopOpacity={index === 3 ? '.8' : '.96'} />)}
      </linearGradient>
      <clipPath id={`cavity-${id}`}>{horizontal ? <rect x="32" y="15" width="536" height="58" rx="27" /> : <path d={cavity} />}</clipPath>
      <clipPath id={`interior-${id}`}>{horizontal ? <rect x="20" y="15" width="548" height="58" rx="27" /> : <path d={`M113 50 H127 V85 H113 Z ${cavity}`} />}</clipPath>
      <clipPath id={`fill-${id}`}><rect x={x} y={y} width={width} height={height} /></clipPath>
    </defs>

    {/* The inlet stub, drawn before the vessel so the glass and caps sit over its lower end. */}
    {horizontal ? <g className="vessel-inlet-stub">
      <rect x="0" y="37" width="24" height="14" fill={`url(#stub-${id})`} stroke="#93b9cc" strokeWidth="1" />
      <rect x="0" y="33.5" width="7" height="21" rx="2" fill={`url(#metal-${id})`} stroke="#5f879c" strokeWidth=".8" />
      <circle data-pipe-inlet={categoryId} cx="1" cy="44" r=".6" fill="none" />
    </g> : null}

    {horizontal ? <rect x="26" y="10" width="548" height="68" rx="32" fill={`url(#glass-${id})`} stroke="#8fbacd" strokeWidth="1.6" /> : <path d={body} fill={`url(#glass-${id})`} stroke="#85aebf" strokeWidth="1.6" />}
    <g clipPath={`url(#cavity-${id})`}>
      {shown > 0 && <g clipPath={`url(#fill-${id})`}>
        <rect className="liquid-fill" x={x} y={y} width={width} height={height} fill={`url(#liquid-${id})`} />
        {horizontal ? <>
          <ellipse className="tank-meniscus-wave" cx={x + width} cy="44" rx="11" ry="29" fill={liquid.gradient[3]} opacity=".6" />
          <rect x={x} y="19" width={width} height="4" rx="2" fill="white" opacity=".35" />
        </> : <>
          <ellipse className="liquid-wave" cx="120" cy={y + 2} rx="80" ry="7" fill={liquid.gradient[3]} opacity=".8" />
          <ellipse className="liquid-ripple" cx="120" cy={y + 2} rx="62" ry="4" fill="none" stroke="white" strokeWidth=".8" opacity=".7" />
          <path d={`M42 ${y + 9} Q120 ${y + 22} 199 ${y + 9}`} stroke="white" fill="none" opacity=".4" />
        </>}
        <LiquidBubbles fillPercentage={liquid.fill * 100} x={x + 4} y={y + 4} width={Math.max(0, width - 8)} height={Math.max(0, height - 8)} horizontal={horizontal} />
      </g>}
      {horizontal ? <>
        <rect x="36" y="18" width="528" height="5" rx="3" fill="white" opacity=".65" />
        <rect x="36" y="67" width="528" height="3" rx="2" fill="#c5f5ff" opacity=".8" />
        <rect x="46" y="26" width="510" height="10" rx="5" fill="white" opacity=".12" />
      </> : <>
        <path d="M78 101 C78 125 51 122 51 155 V255" stroke="white" strokeWidth="9" fill="none" opacity=".7" strokeLinecap="round" />
        <path d="M185 137 Q191 150 191 165 V270 Q190 285 177 286" stroke="#e5faff" strokeWidth="4" fill="none" opacity=".75" strokeLinecap="round" />
        <path d="M65 289 Q120 302 176 289" stroke="#e8ffff" strokeWidth="3" fill="none" opacity=".75" />
        {[137, 183, 229].map(mark => <path key={mark} d={`M174 ${mark} h13`} stroke="#4f879e" strokeWidth="1" opacity=".5" />)}
      </>}
    </g>

    {/* Arrival: a jet from the inlet and one ripple where it lands, inside the glass only. */}
    {flowing && <g key={flowing} className="vessel-arrival-flow" clipPath={`url(#interior-${id})`}>
      {horizontal ? <>
        <rect className="vessel-jet vessel-jet--horizontal" x="20" y="40" width={Math.max(40, Math.min(220, x + width - 20))} height="8" rx="4" fill={liquid.gradient[2]} />
        <ellipse className="vessel-ripple vessel-ripple--horizontal" cx={Math.max(36, x + width)} cy="44" rx="6" ry="24" fill="none" stroke="white" strokeWidth="2" />
      </> : <>
        <rect className="vessel-jet" x="117" y="52" width="6" height={Math.max(20, y - 52)} rx="3" fill={liquid.gradient[2]} />
        {[0, 1, 2].map((drop) => <circle key={drop} className="vessel-drop" cx={120 + (drop - 1) * 3} cy="92" r={2.4 - drop * 0.4}
          fill={liquid.gradient[2]} style={{ '--drop-fall': `${Math.max(20, y - 96)}px`, animationDelay: `${drop * 110}ms` } as CSSProperties} />)}
        <ellipse className="vessel-ripple" cx="120" cy={Math.min(y, 291)} rx="18" ry="4" fill="none" stroke="white" strokeWidth="1.6" />
      </>}
    </g>}

    {horizontal ? <>
      {[15, 24, 563, 572].map(cap => <rect key={cap} x={cap} y="6" width="13" height="76" rx="5" fill={`url(#metal-${id})`} stroke="#527f98" strokeWidth="1" />)}
      <path d="M41 11 H558" stroke="white" strokeWidth="1.6" opacity=".9" />
    </> : <>
      <rect x="61" y="57" width="118" height="31" rx="7" fill={`url(#glass-${id})`} stroke="#79a2b7" />
      {[58, 67, 77].map(ring => <ellipse key={ring} cx="120" cy={ring} rx="59" ry="8" fill={`url(#metal-${id})`} stroke="#6c97ad" />)}
      <ellipse cx="120" cy="56" rx="59" ry="10" fill={`url(#metal-${id})`} stroke="#608ba1" />
      <ellipse cx="120" cy="55" rx="51" ry="6" fill="#7facc0" />
      <ellipse cx="120" cy="56" rx="47" ry="4" fill="#dff2f8" opacity=".8" />
      <path d="M75 53 Q120 46 165 53" stroke="white" strokeWidth="2" fill="none" opacity=".9" />
      <path d="M39 273 Q39 306 70 306 H172 Q200 306 202 278" stroke="#98c4d4" strokeWidth="2.5" fill="none" opacity=".7" />
      {/* The inlet stub drops into the mouth; its top collar is where the pipe joins. */}
      <g className="vessel-inlet-stub">
        <rect x="113.5" y="20" width="13" height="40" fill={`url(#stub-${id})`} stroke="#93b9cc" strokeWidth="1" />
        <path d="M113.5 54 Q120 57 126.5 54 V60 Q120 63 113.5 60 Z" fill="#5f97b3" opacity=".55" />
        <rect x="110" y="13" width="20" height="9" rx="2" fill={`url(#metal-${id})`} stroke="#5f879c" strokeWidth=".8" />
        <circle data-pipe-inlet={categoryId} cx="120" cy="15" r=".6" fill="none" />
      </g>
    </>}
  </svg>;
}
