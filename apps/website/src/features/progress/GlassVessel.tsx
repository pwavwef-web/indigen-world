import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { getLiquidVisuals, LiquidBubbleLayer } from './liquidVisuals';
import { JarLabel, type JarLabelInfo } from './JarLabel';
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
const JAR_WIDTH = 240;
const JAR_HEIGHT = 330;
const JAR_TOP = 85;
const JAR_BOTTOM = 294;
const JAR_DEPTH = JAR_BOTTOM - JAR_TOP;
const JAR_LEFT = 41;
const JAR_INNER = 158;
const TANK_WIDTH = 600;
const TANK_HEIGHT = 88;
const TANK_LEFT = 32;
const TANK_LENGTH = 536;
const TANK_TOP = 15;
const TANK_BOTTOM = 73;
const TANK_DEPTH = TANK_BOTTOM - TANK_TOP;

/**
 * One wavelength of each surface wave, in drawing units, and how many fit in
 * its strip. The CSS slides each strip by exactly one wavelength per cycle
 * (a fixed share of the strip), so the loop is seamless.
 */
export const WAVE_PERIOD = 60;
export const BACK_WAVE_PERIOD = 46;
export const TANK_WAVE_PERIOD = 29;
export const TANK_BACK_WAVE_PERIOD = 23;
const FRONT_STRIP = WAVE_PERIOD * 5;
const BACK_STRIP = BACK_WAVE_PERIOD * 6;
const TANK_FRONT_STRIP = TANK_WAVE_PERIOD * 4;
const TANK_BACK_STRIP = TANK_BACK_WAVE_PERIOD * 5;

/**
 * How high a wave may rise above (and fall below) the counted level. Its mean
 * is always the level itself, and a shallow liquid gets a shallow wave, so a
 * sliver of 0.1% never looks like a puddle of 2%.
 */
export function waveAmplitude(depth: number, max = 3.4): number {
  return Math.max(0, Math.min(max, depth * 0.28));
}

/** A horizontal sine edge at `level`, closed down to `bottom`: x0 → x0 + periods·P. */
function horizontalWave(x0: number, periods: number, period: number, level: number, amplitude: number, bottom: number | null): string {
  let d = `M${x0} ${level}`;
  for (let index = 0; index < periods * 2; index += 1) {
    const x = x0 + (index * period) / 2;
    d += ` Q${x + period / 4} ${level + (index % 2 === 0 ? -2 : 2) * amplitude} ${x + period / 2} ${level}`;
  }
  return bottom === null ? d : `${d} L${x0 + periods * period} ${bottom} L${x0} ${bottom} Z`;
}

/** A vertical sine edge at x = `level`, closed back to `left`: y0 → y0 + periods·P. */
function verticalWave(y0: number, periods: number, period: number, level: number, amplitude: number, left: number | null): string {
  let d = `M${level} ${y0}`;
  for (let index = 0; index < periods * 2; index += 1) {
    const y = y0 + (index * period) / 2;
    d += ` Q${level + (index % 2 === 0 ? 2 : -2) * amplitude} ${y + period / 4} ${level} ${y + period / 2}`;
  }
  return left === null ? d : `${d} L${left} ${y0 + periods * period} L${left} ${y0} Z`;
}

/** How far the jar's inner wall stands in from x=41 at height y: the shoulders and the rounded base. */
export function cavityInset(y: number): number {
  if (y >= 272) {
    // Q41 294 65 294 from (41, 272): x = 41 + 24t², y = 272 + 22(1 − (1 − t)²)
    const t = 1 - Math.sqrt(Math.max(0, 1 - Math.min(1, (y - 272) / 22)));
    return 24 * t * t;
  }
  if (y >= 147) return 0;
  if (y < 93) return 29;
  // C70 115 41 121 41 147 from (70, 93): y rises with t, so bisect for x.
  let low = 0;
  let high = 1;
  for (let step = 0; step < 24; step += 1) {
    const t = (low + high) / 2;
    const at = (1 - t) ** 3 * 93 + 3 * (1 - t) ** 2 * t * 115 + 3 * (1 - t) * t * t * 121 + t ** 3 * 147;
    if (at < y) low = t; else high = t;
  }
  const t = (low + high) / 2;
  const x = (1 - t) ** 3 * 70 + 3 * (1 - t) ** 2 * t * 70 + 3 * (1 - t) * t * t * 41 + t ** 3 * 41;
  return x - JAR_LEFT;
}

const pct = (value: number, of: number) => `${(value / of) * 100}%`;

export interface GoalLine {
  /** 0–1 of the interior. */
  fraction: number;
  /** "1%" */
  label: string;
}

/**
 * A vessel in three layers.
 *
 * The back drawing holds the glass and the liquid: `.liquid-fill` is exactly
 * the counted fill of the interior. The middle layer holds what moves — the
 * surface waves and the bubbles — as plain elements slid by CSS transforms,
 * which the browser composites without repainting a single drawing. The
 * front drawing holds what sits on the glass: highlights, graduations, the
 * goal line, the label, the lid and the arrival splash.
 *
 * The surface is two sine waves whose mean is the counted level; the body is
 * drawn up to the wave's lowest point, so a trough really dips below the level
 * and a crest rises the same height above it. Nothing can make a vessel look
 * fuller than it is.
 *
 * Each vessel carries its own inlet stub — into the jar's mouth, into the
 * tank's left cap — and marks its open end with `data-pipe-inlet`, which is
 * where the measured pipe network joins it.
 */
export function GlassVessel({ categoryId, fill, unknown, horizontal = false, easeFill, arrival, label, sealed = false, goal = null }: {
  categoryId: ContributionCategoryId;
  /** 0–1 of the interior. */
  fill: number;
  /** Target being set or count unreadable: neutral, no liquid. */
  unknown: boolean;
  horizontal?: boolean;
  /** Ease toward a new fill (an arrival), rather than jumping. */
  easeFill: boolean;
  arrival?: ArrivalCue | null;
  /** The printed label on a jar. */
  label?: JarLabelInfo;
  /** The target has been reached: a wax seal on the lid. */
  sealed?: boolean;
  /** The next milestone, drawn as a dashed goal line on the glass. */
  goal?: GoalLine | null;
}) {
  const id = useId().replace(/:/g, '');
  const shown = useEasedFill(unknown ? 0 : Math.min(1, Math.max(0, fill)), easeFill ? 900 : 0);
  const liquid = getLiquidVisuals(shown * 100, unknown);
  const body = 'M64 67 L64 88 C64 112 34 114 34 145 L34 272 Q34 301 64 302 L176 302 Q206 301 206 272 L206 145 C206 114 176 112 176 88 L176 67 Z';
  const cavity = 'M70 85 L70 93 C70 115 41 121 41 147 L41 272 Q41 294 65 294 L175 294 Q199 294 199 272 L199 147 C199 121 170 115 170 93 L170 85 Z';
  const x = horizontal ? TANK_LEFT : JAR_LEFT;
  const y = horizontal ? TANK_TOP : JAR_BOTTOM - JAR_DEPTH * shown;
  const width = horizontal ? TANK_LENGTH * shown : JAR_INNER;
  const height = horizontal ? TANK_DEPTH : JAR_DEPTH * shown;
  const flowing = arrival?.travelled ? arrival.key : null;
  // A full jar's surface sits in the neck; it stays still there, as a brim.
  const amplitude = shown <= 0 ? 0 : horizontal ? waveAmplitude(width, 4) : shown >= 0.995 ? 0 : waveAmplitude(height);
  const moving = amplitude > 0.4;
  const goalY = goal && !horizontal ? JAR_BOTTOM - JAR_DEPTH * Math.min(1, Math.max(0, goal.fraction)) : null;
  const viewBox = horizontal ? `0 0 ${TANK_WIDTH} ${TANK_HEIGHT}` : `0 0 ${JAR_WIDTH} ${JAR_HEIGHT}`;
  const aspect = horizontal ? 'xMinYMid meet' : 'xMidYMid meet';

  // With a moving surface the drawn body stops at the wave's lowest point; the band above it carries the wave.
  const fillClip = horizontal
    ? { x, y: TANK_TOP, width: Math.max(0, width - (moving ? amplitude : 0)), height }
    : { x, y: y + (moving ? amplitude : 0), width, height: Math.max(0, height - (moving ? amplitude : 0)) };

  let band: { style: CSSProperties; front: string; back: string; line: string } | null = null;
  if (moving && !horizontal) {
    const inset = cavityInset(y);
    const bandWidth = JAR_INNER - inset * 2;
    const bandHeight = amplitude * 2 + 1;
    const level = amplitude + 0.5;
    band = {
      style: {
        left: pct(JAR_LEFT + inset, JAR_WIDTH), width: pct(bandWidth, JAR_WIDTH),
        top: pct(y - amplitude - 0.5, JAR_HEIGHT), height: pct(bandHeight, JAR_HEIGHT),
        '--front-left': pct(-WAVE_PERIOD, bandWidth), '--front-width': pct(FRONT_STRIP, bandWidth),
        '--back-width': pct(BACK_STRIP, bandWidth),
      } as CSSProperties,
      front: horizontalWave(0, FRONT_STRIP / WAVE_PERIOD, WAVE_PERIOD, level, amplitude, bandHeight),
      line: horizontalWave(0, FRONT_STRIP / WAVE_PERIOD, WAVE_PERIOD, level, amplitude, null),
      back: horizontalWave(0, BACK_STRIP / BACK_WAVE_PERIOD, BACK_WAVE_PERIOD, level, amplitude * 0.75, bandHeight),
    };
  } else if (moving && horizontal) {
    const surface = x + width;
    const bandWidth = amplitude * 2 + 1;
    const level = amplitude + 0.5;
    band = {
      style: {
        left: pct(surface - amplitude - 0.5, TANK_WIDTH), width: pct(bandWidth, TANK_WIDTH),
        top: pct(TANK_TOP, TANK_HEIGHT), height: pct(TANK_DEPTH, TANK_HEIGHT),
        '--front-top': pct(-TANK_WAVE_PERIOD, TANK_DEPTH), '--front-height': pct(TANK_FRONT_STRIP, TANK_DEPTH),
        '--back-height': pct(TANK_BACK_STRIP, TANK_DEPTH),
      } as CSSProperties,
      front: verticalWave(0, TANK_FRONT_STRIP / TANK_WAVE_PERIOD, TANK_WAVE_PERIOD, level, amplitude, 0),
      line: verticalWave(0, TANK_FRONT_STRIP / TANK_WAVE_PERIOD, TANK_WAVE_PERIOD, level, amplitude, null),
      back: verticalWave(0, TANK_BACK_STRIP / TANK_BACK_WAVE_PERIOD, TANK_BACK_WAVE_PERIOD, level, amplitude * 0.7, 0),
    };
  }
  const bandSize = horizontal ? [amplitude * 2 + 1, null] : [null, amplitude * 2 + 1];

  // Bubbles live in the liquid below the surface band.
  const bubbleArea = horizontal
    ? { x, y: TANK_TOP, width: Math.max(0, width - amplitude), height: TANK_DEPTH }
    : { x, y: y + amplitude, width, height: Math.max(0, height - amplitude) };

  return <div className={`glass-vessel${horizontal ? ' glass-vessel--tank' : ''}`} data-surface={moving ? 'moving' : 'still'}>
    <svg className={`glass-vessel-svg ${horizontal ? 'glass-vessel-svg--tank' : ''}`} viewBox={viewBox}
      preserveAspectRatio={aspect} aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={`glass-${id}`} x1="0" x2="1">
          <stop stopColor="#6296b3" stopOpacity=".55" /><stop offset=".07" stopColor="#e5faff" stopOpacity=".75" />
          <stop offset=".19" stopColor="#b6e0ef" stopOpacity=".14" /><stop offset=".5" stopColor="#f4fcff" stopOpacity=".08" />
          <stop offset=".83" stopColor="#a9d4e7" stopOpacity=".13" /><stop offset=".94" stopColor="#f0fdff" stopOpacity=".85" /><stop offset="1" stopColor="#537f98" stopOpacity=".65" />
        </linearGradient>
        <linearGradient id={`depth-${id}`} x1="0" x2="1">
          <stop className="glass-depth__edge" offset="0" /><stop className="glass-depth__mid" offset=".22" />
          <stop className="glass-depth__mid" offset=".78" /><stop className="glass-depth__edge" offset="1" />
        </linearGradient>
        <linearGradient id={`metal-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop stopColor="#456e85" /><stop offset=".12" stopColor="#cde8f2" /><stop offset=".28" stopColor="#f4feff" />
          <stop offset=".46" stopColor="#78a6bd" /><stop offset=".66" stopColor="#395f78" /><stop offset=".85" stopColor="#b0d9e9" /><stop offset="1" stopColor="#517a93" />
        </linearGradient>
        <linearGradient id={`stub-${id}`} x1="0" y1="0" x2={horizontal ? '0' : '1'} y2={horizontal ? '1' : '0'}>
          <stop offset="0" stopColor="#9cc3d6" /><stop offset=".28" stopColor="#f3fbff" /><stop offset=".72" stopColor="#d6ecf6" /><stop offset="1" stopColor="#8fb8cb" />
        </linearGradient>
        {/* Deep at the bottom (or the tank's far end), bright at the surface. */}
        <linearGradient id={`liquid-${id}`} x1="0" y1={horizontal ? '0' : '1'} x2={horizontal ? '1' : '0'} y2="0">
          <stop offset="0" stopColor={liquid.gradient[0]} stopOpacity=".97" />
          <stop offset=".55" stopColor={liquid.gradient[1]} stopOpacity=".95" />
          <stop offset="1" stopColor={liquid.gradient[2]} stopOpacity=".93" />
        </linearGradient>
        {/* The liquid is a cylinder too: darker where it meets the walls. */}
        <linearGradient id={`roundness-${id}`} x1="0" y1="0" x2={horizontal ? '0' : '1'} y2={horizontal ? '1' : '0'}>
          <stop offset="0" stopColor="#031a33" stopOpacity=".5" /><stop offset=".2" stopColor="#031a33" stopOpacity=".05" />
          <stop offset=".38" stopColor="#ffffff" stopOpacity=".16" /><stop offset=".55" stopColor="#ffffff" stopOpacity="0" />
          <stop offset=".85" stopColor="#031a33" stopOpacity=".12" /><stop offset="1" stopColor="#031a33" stopOpacity=".5" />
        </linearGradient>
        <radialGradient id={`caustic-${id}`}>
          <stop offset="0" stopColor="#ffffff" stopOpacity=".42" /><stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`seal-${id}`} cx=".38" cy=".32" r=".75">
          <stop offset="0" stopColor="#e2563f" /><stop offset=".55" stopColor="#a8301f" /><stop offset="1" stopColor="#5e150c" />
        </radialGradient>
        <clipPath id={`cavity-${id}`}>{horizontal ? <rect x="32" y="15" width="536" height="58" rx="27" /> : <path d={cavity} />}</clipPath>
        <clipPath id={`interior-${id}`}>{horizontal ? <rect x="20" y="15" width="548" height="58" rx="27" /> : <path d={`M113 50 H127 V85 H113 Z ${cavity}`} />}</clipPath>
        <clipPath id={`fill-${id}`}><rect {...fillClip} /></clipPath>
      </defs>

      {/* The tank's inlet stub, drawn before the glass so the caps sit over its lower end. */}
      {horizontal ? <g className="vessel-inlet-stub">
        <rect x="0" y="37" width="24" height="14" fill={`url(#stub-${id})`} stroke="#93b9cc" strokeWidth="1" />
        <rect x="0" y="33.5" width="7" height="21" rx="2" fill={`url(#metal-${id})`} stroke="#5f879c" strokeWidth=".8" />
        <circle data-pipe-inlet={categoryId} cx="1" cy="44" r=".6" fill="none" />
      </g> : null}

      {horizontal ? <rect x="26" y="10" width="548" height="68" rx="32" fill={`url(#glass-${id})`} stroke="#8fbacd" strokeWidth="1.6" /> : <path d={body} fill={`url(#glass-${id})`} stroke="#85aebf" strokeWidth="1.6" />}
      <g clipPath={`url(#cavity-${id})`}>
        {/* The far wall of the glass, seen through the near one. */}
        {horizontal ? <rect x="32" y="15" width="536" height="58" fill={`url(#depth-${id})`} /> : <path d={cavity} fill={`url(#depth-${id})`} />}
        {!horizontal && <ellipse className="glass-floor" cx="120" cy="289" rx="74" ry="6" />}
        {shown > 0 && <g className="liquid" clipPath={`url(#fill-${id})`}>
          <rect className="liquid-fill" x={x} y={y} width={width} height={height} fill={`url(#liquid-${id})`} />
          <rect x={x} y={y} width={width} height={height} fill={`url(#roundness-${id})`} />
          {!horizontal && height > 26 && <>
            <ellipse cx="88" cy={Math.min(282, y + height * 0.42)} rx="26" ry={Math.min(14, height * 0.2)} fill={`url(#caustic-${id})`} />
            <ellipse cx="150" cy={Math.min(286, y + height * 0.7)} rx="20" ry={Math.min(10, height * 0.14)} fill={`url(#caustic-${id})`} />
          </>}
        </g>}
      </g>
    </svg>

    <div className="glass-vessel__frame" aria-hidden="true">
      {band && <div className="liquid-band" style={band.style}>
        <svg className="liquid-strip liquid-strip--back" viewBox={horizontal ? `0 0 ${bandSize[0]} ${TANK_BACK_STRIP}` : `0 0 ${BACK_STRIP} ${bandSize[1]}`} preserveAspectRatio="none" focusable="false">
          <path d={band.back} fill={liquid.gradient[3]} />
        </svg>
        <svg className="liquid-strip liquid-strip--front" viewBox={horizontal ? `0 0 ${bandSize[0]} ${TANK_FRONT_STRIP}` : `0 0 ${FRONT_STRIP} ${bandSize[1]}`} preserveAspectRatio="none" focusable="false">
          <path d={band.front} fill={liquid.gradient[2]} fillOpacity=".95" />
          <path d={band.line} fill="none" stroke={liquid.gradient[3]} strokeWidth={horizontal ? 1.4 : 1.2} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        </svg>
      </div>}
      {shown > 0 && <LiquidBubbleLayer fillPercentage={liquid.fill * 100} area={bubbleArea} frame={horizontal ? [TANK_WIDTH, TANK_HEIGHT] : [JAR_WIDTH, JAR_HEIGHT]} horizontal={horizontal} />}
    </div>

    <svg className="glass-vessel-front" viewBox={viewBox} preserveAspectRatio={aspect} aria-hidden="true" focusable="false">
      <g clipPath={`url(#cavity-${id})`}>
        {horizontal ? <>
          <rect x="36" y="18" width="528" height="5" rx="3" fill="white" opacity=".65" />
          <rect x="36" y="67" width="528" height="3" rx="2" fill="#c5f5ff" opacity=".8" />
          <rect x="46" y="26" width="510" height="10" rx="5" fill="white" opacity=".12" />
          {[0.25, 0.5, 0.75].map(mark => <path key={mark} className="glass-graduation" d={`M${TANK_LEFT + TANK_LENGTH * mark} 16 v${mark === 0.5 ? 9 : 6}`} />)}
        </> : <>
          <path d="M78 101 C78 125 51 122 51 155 V255" stroke="white" strokeWidth="9" fill="none" opacity=".55" strokeLinecap="round" />
          <path d="M60 140 V250" stroke="white" strokeWidth="2.2" fill="none" opacity=".35" strokeLinecap="round" />
          <path d="M185 137 Q191 150 191 165 V270 Q190 285 177 286" stroke="#e5faff" strokeWidth="4" fill="none" opacity=".75" strokeLinecap="round" />
          <path d="M65 289 Q120 302 176 289" stroke="#e8ffff" strokeWidth="3" fill="none" opacity=".75" />
          {/* Graduations on the glass: quarters, the half a little longer. */}
          {[0.25, 0.5, 0.75].map(mark => <path key={mark} className="glass-graduation" d={`M44 ${JAR_BOTTOM - JAR_DEPTH * mark} h${mark === 0.5 ? 13 : 8}`} />)}
          {goalY !== null && goal && <g className="vessel-goal-line">
            <path d={`M43 ${goalY} H197`} />
            <g transform={`translate(176 ${Math.max(92, goalY - 13)})`}>
              <rect width="21" height="10" rx="3" />
              <text x="10.5" y="7.2">{goal.label}</text>
            </g>
          </g>}
        </>}
      </g>

      {label && !horizontal && <JarLabel id={id} label={label} sealed={sealed} />}

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
        {sealed && <g className="vessel-seal" transform="translate(586 18)">
          <circle r="9" fill={`url(#seal-${id})`} />
          <path d="M0 -4.6 L1.4 -1.4 L4.6 0 L1.4 1.4 L0 4.6 L-1.4 1.4 L-4.6 0 L-1.4 -1.4 Z" fill="#f6c9a8" opacity=".75" />
        </g>}
      </> : <>
        <rect x="61" y="57" width="118" height="31" rx="7" fill={`url(#glass-${id})`} stroke="#79a2b7" />
        {[58, 67, 77].map(ring => <ellipse key={ring} cx="120" cy={ring} rx="59" ry="8" fill={`url(#metal-${id})`} stroke="#6c97ad" />)}
        <ellipse cx="120" cy="56" rx="59" ry="10" fill={`url(#metal-${id})`} stroke="#608ba1" />
        <ellipse cx="120" cy="55" rx="51" ry="6" fill="#7facc0" />
        <ellipse cx="120" cy="56" rx="47" ry="4" fill="#dff2f8" opacity=".8" />
        <path d="M75 53 Q120 46 165 53" stroke="white" strokeWidth="2" fill="none" opacity=".9" />
        <path d="M39 273 Q39 306 70 306 H172 Q200 306 202 278" stroke="#98c4d4" strokeWidth="2.5" fill="none" opacity=".7" />
        {sealed && <g className="vessel-seal" transform="translate(156 74)">
          <path d="M-11 -2 Q-13 9 -9 13 Q-7 8 -6 11 Q-2 15 0 12 Q3 16 6 11 Q8 8 10 12 Q13 6 11 -2 Z" fill="#8f2416" />
          <circle r="11" fill={`url(#seal-${id})`} />
          <circle r="7.8" fill="none" stroke="#f3b496" strokeWidth=".7" opacity=".6" />
          <path d="M0 -5.2 L1.6 -1.6 L5.2 0 L1.6 1.6 L0 5.2 L-1.6 1.6 L-5.2 0 L-1.6 -1.6 Z" fill="#f6c9a8" opacity=".75" />
        </g>}
        {/* The inlet stub drops into the mouth; its top collar is where the pipe joins. */}
        <g className="vessel-inlet-stub">
          <rect x="113.5" y="20" width="13" height="40" fill={`url(#stub-${id})`} stroke="#93b9cc" strokeWidth="1" />
          <path d="M113.5 54 Q120 57 126.5 54 V60 Q120 63 113.5 60 Z" fill="#5f97b3" opacity=".55" />
          <rect x="110" y="13" width="20" height="9" rx="2" fill={`url(#metal-${id})`} stroke="#5f879c" strokeWidth=".8" />
          <circle data-pipe-inlet={categoryId} cx="120" cy="15" r=".6" fill="none" />
        </g>
      </>}
    </svg>
  </div>;
}
