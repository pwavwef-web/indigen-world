import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';

/**
 * The factory floor behind the jars: a bottling hall with trusses, tall
 * windows, a crane, a conveyor, gears, steam and swinging lamps.
 *
 * Built for cost, not just looks. The scene is a 1600×900 stage scaled to
 * cover the viewport. Everything that never moves is one static SVG per depth
 * layer, painted once. Everything that moves is its own small element placed
 * on the stage in percentages, animated only by transform and opacity, so the
 * browser composites it instead of repainting the scene (no animated blur:
 * that stalled this page before). Colours come from the shift (day or night)
 * through CSS custom properties, and all motion stops with the page's pause,
 * reduced motion or a hidden tab.
 *
 * Depth comes from parallax: as the page scrolls, the far wall moves least and
 * the hanging lamps most. It is driven by a passive scroll listener, so it
 * costs nothing while the page is still (a scroll-linked CSS timeline kept the
 * main thread busy on every frame).
 *
 * Purely decorative: hidden from assistive technology, never interactive, and
 * no moving part stands for real activity — live approvals only ever travel
 * through the pipes.
 */

const W = 1600;
const H = 900;

/** Places an element on the 1600×900 stage. */
function at(x: number, y: number, width: number, height: number, extra?: CSSProperties): CSSProperties {
  return { left: `${(x / W) * 100}%`, top: `${(y / H) * 100}%`, width: `${(width / W) * 100}%`, height: `${(height / H) * 100}%`, ...extra };
}

function Part({ x, y, width, height, className, style, children, viewBox }: {
  x: number; y: number; width: number; height: number; className: string; style?: CSSProperties; children: ReactNode; viewBox?: string;
}) {
  return <div className={`factory-part ${className}`} style={at(x, y, width, height, style)}>
    <svg viewBox={viewBox ?? `0 0 ${width} ${height}`} width="100%" height="100%" preserveAspectRatio="none" focusable="false">{children}</svg>
  </div>;
}

function gearPath(teeth: number, outer: number, inner: number, hole: number): string {
  const step = (Math.PI * 2) / teeth;
  let d = '';
  for (let index = 0; index < teeth; index += 1) {
    const a = index * step;
    const points = [
      [a - step * 0.25, inner], [a - step * 0.15, outer], [a + step * 0.15, outer], [a + step * 0.25, inner],
    ];
    for (const [angle, radius] of points) {
      d += `${d ? 'L' : 'M'}${(Math.cos(angle) * radius).toFixed(2)} ${(Math.sin(angle) * radius).toFixed(2)} `;
    }
  }
  return `${d}Z M${hole} 0 A${hole} ${hole} 0 1 0 ${-hole} 0 A${hole} ${hole} 0 1 0 ${hole} 0 Z`;
}

function Gear({ x, y, radius, teeth, reverse = false, slow = false }: { x: number; y: number; radius: number; teeth: number; reverse?: boolean; slow?: boolean }) {
  const size = radius * 2 + 4;
  return <Part x={x - size / 2} y={y - size / 2} width={size} height={size}
    className={`factory-gear${reverse ? ' factory-gear--reverse' : ''}${slow ? ' factory-gear--slow' : ''}`}
    viewBox={`${-size / 2} ${-size / 2} ${size} ${size}`}>
    <path className="fx-gear" d={gearPath(teeth, radius, radius * 0.84, radius * 0.22)} fillRule="evenodd" />
    <circle className="fx-gear-rim" r={radius * 0.64} fill="none" strokeWidth={radius * 0.08} />
    {[0, 60, 120, 180, 240, 300].map((angle) => <rect key={angle} className="fx-gear-spoke" x={-radius * 0.05} y={radius * 0.22} width={radius * 0.1} height={radius * 0.42} transform={`rotate(${angle})`} />)}
    <circle className="fx-gear-hub" r={radius * 0.16} />
  </Part>;
}

/** Steam rises from a vent in three staggered puffs. */
function Steam({ x, y, scale = 1 }: { x: number; y: number; scale?: number }) {
  return <>{[0, 1, 2].map((puff) => <span key={puff} className="factory-steam"
    style={at(x - 30 * scale, y - 60 * scale, 60 * scale, 60 * scale, { animationDelay: `${puff * -1.9}s` })} />)}</>;
}

const WINDOWS = [260, 620, 980, 1340];
const LAMPS = [{ x: 330, delay: 0 }, { x: 800, delay: -2.4 }, { x: 1270, delay: -4.1 }];
const DUST = Array.from({ length: 14 }, (_, index) => ({
  x: 260 + ((index * 997) % 1080),
  y: 300 + ((index * 563) % 420),
  delay: -((index * 1.7) % 11),
  duration: 10 + (index % 5) * 1.6,
}));

/** How far each depth layer rises over a full scroll of the page, as a share of its own height. */
const PARALLAX = { far: 2.5, mid: 6, near: 11 };

function useParallax(enabled: boolean) {
  const far = useRef<HTMLDivElement>(null);
  const mid = useRef<HTMLDivElement>(null);
  const near = useRef<HTMLDivElement>(null);
  const scrim = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const layers = [[far, PARALLAX.far], [mid, PARALLAX.mid], [near, PARALLAX.near]] as const;
    const reset = () => {
      for (const [ref] of layers) if (ref.current) ref.current.style.transform = '';
      if (scrim.current) scrim.current.style.opacity = '';
    };
    if (!enabled) {
      reset();
      return undefined;
    }
    let frame = 0;
    const update = () => {
      frame = 0;
      const range = document.documentElement.scrollHeight - window.innerHeight;
      const progress = range > 0 ? Math.min(1, Math.max(0, window.scrollY / range)) : 0;
      for (const [ref, rise] of layers) if (ref.current) ref.current.style.transform = `translateY(${(-rise * progress).toFixed(3)}%)`;
      if (scrim.current) scrim.current.style.opacity = (0.12 + 0.46 * progress).toFixed(3);
    };
    const request = () => { if (!frame) frame = window.requestAnimationFrame(update); };
    update();
    window.addEventListener('scroll', request, { passive: true });
    window.addEventListener('resize', request);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('scroll', request);
      window.removeEventListener('resize', request);
      reset();
    };
  }, [enabled]);
  return { far, mid, near, scrim };
}

export function FactoryBackdrop({ parallax = false }: { parallax?: boolean }) {
  const layers = useParallax(parallax);
  const trussNodes = Array.from({ length: 22 }, (_, index) => -40 + index * 80);
  const floorLines = Array.from({ length: 17 }, (_, index) => -600 + index * 175);
  return <div className="factory-backdrop" aria-hidden="true">
    <div className="factory-sky" />

    {/* Far: the back wall, its windows and the tanks along it. */}
    <div className="factory-layer factory-layer--far" ref={layers.far}>
      <svg className="factory-art" viewBox={`0 0 ${W} ${H}`} width="100%" height="100%" focusable="false">
        <defs>
          <linearGradient id="fx-wall-grad" x1="0" y1="0" x2="0" y2="1">
            <stop className="fx-stop-wall-top" offset="0" /><stop className="fx-stop-wall-bottom" offset="1" />
          </linearGradient>
          <linearGradient id="fx-window-grad" x1="0" y1="0" x2="0" y2="1">
            <stop className="fx-stop-window-top" offset="0" /><stop className="fx-stop-window-bottom" offset="1" />
          </linearGradient>
          <radialGradient id="fx-window-glow" cx=".5" cy=".55" r=".5">
            <stop className="fx-stop-glow" offset="0" /><stop className="fx-stop-glow-edge" offset="1" />
          </radialGradient>
          <linearGradient id="fx-tank-grad" x1="0" x2="1">
            <stop className="fx-stop-tank-dark" offset="0" /><stop className="fx-stop-tank-light" offset=".35" /><stop className="fx-stop-tank-dark" offset="1" />
          </linearGradient>
        </defs>
        <rect width={W} height={H} fill="url(#fx-wall-grad)" />
        {/* Wall panels and seams. */}
        {Array.from({ length: 17 }, (_, index) => <path key={index} className="fx-seam" d={`M${index * 100} 150 V780`} />)}
        <path className="fx-seam fx-seam--band" d="M0 300 H1600 M0 560 H1600" />
        {WINDOWS.map((cx) => <g key={cx}>
          <ellipse cx={cx} cy="360" rx="190" ry="230" fill="url(#fx-window-glow)" />
          <path className="fx-window-frame" d={`M${cx - 108} 528 V262 A108 108 0 0 1 ${cx + 108} 262 V528 Z`} />
          <path d={`M${cx - 98} 520 V264 A98 98 0 0 1 ${cx + 98} 264 V520 Z`} fill="url(#fx-window-grad)" />
          {[-49, 0, 49].map((offset) => <path key={offset} className="fx-mullion" d={`M${cx + offset} ${offset === 0 ? 166 : 182} V520`} />)}
          {[230, 290, 350, 410, 470].map((row) => <path key={row} className="fx-mullion" d={`M${cx - 98} ${row} H${cx + 98}`} />)}
          <path className="fx-window-sill" d={`M${cx - 118} 530 H${cx + 118}`} />
        </g>)}
        {/* Catwalk along the wall. */}
        <path className="fx-rail" d="M240 548 H1360 M240 528 H1360" />
        {Array.from({ length: 29 }, (_, index) => <path key={index} className="fx-rail fx-rail--post" d={`M${240 + index * 40} 528 V566`} />)}
        <rect className="fx-deck" x="230" y="562" width="1140" height="7" />
        {/* Storage tanks at the far ends. */}
        {[{ x: 30, w: 210 }, { x: 1360, w: 210 }].map(({ x, w }) => <g key={x}>
          <path d={`M${x} 780 V400 Q${x} 340 ${x + w / 2} 336 Q${x + w} 340 ${x + w} 400 V780 Z`} fill="url(#fx-tank-grad)" />
          {[440, 540, 640, 740].map((band) => <path key={band} className="fx-tank-band" d={`M${x} ${band} H${x + w}`} />)}
          <path className="fx-ladder" d={`M${x + w - 34} 380 V780 M${x + w - 18} 380 V780 ${Array.from({ length: 20 }, (_, rung) => `M${x + w - 34} ${392 + rung * 20} H${x + w - 18}`).join(' ')}`} />
        </g>)}
      </svg>
      {WINDOWS.map((cx, index) => <span key={cx} className="factory-shaft" style={at(cx - 100, 300, 420, 600, { animationDelay: `${index * -2.3}s` })} />)}
    </div>

    {/* Mid: roof steel, columns, pipe runs, the machines and the conveyor. */}
    <div className="factory-layer factory-layer--mid" ref={layers.mid}>
      <svg className="factory-art" viewBox={`0 0 ${W} ${H}`} width="100%" height="100%" focusable="false">
        <defs>
          <linearGradient id="fx-steel-grad" x1="0" y1="0" x2="0" y2="1">
            <stop className="fx-stop-steel-light" offset="0" /><stop className="fx-stop-steel" offset=".5" /><stop className="fx-stop-steel-dark" offset="1" />
          </linearGradient>
          <linearGradient id="fx-pipe-grad" x1="0" y1="0" x2="0" y2="1">
            <stop className="fx-stop-steel-dark" offset="0" /><stop className="fx-stop-steel-light" offset=".3" /><stop className="fx-stop-steel" offset=".6" /><stop className="fx-stop-steel-dark" offset="1" />
          </linearGradient>
          <linearGradient id="fx-drum-grad" x1="0" x2="1">
            <stop className="fx-stop-steel-dark" offset="0" /><stop className="fx-stop-steel-light" offset=".3" /><stop className="fx-stop-steel" offset=".7" /><stop className="fx-stop-steel-dark" offset="1" />
          </linearGradient>
          <linearGradient id="fx-floor-grad" x1="0" y1="0" x2="0" y2="1">
            <stop className="fx-stop-floor-far" offset="0" /><stop className="fx-stop-floor-near" offset="1" />
          </linearGradient>
          <pattern id="fx-hazard" width="22" height="22" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect className="fx-hazard-a" width="11" height="22" /><rect className="fx-hazard-b" x="11" width="11" height="22" />
          </pattern>
          <clipPath id="fx-floor-clip"><rect x="0" y="800" width={W} height="100" /></clipPath>
        </defs>

        {/* Floor, with perspective seams running to the far wall. */}
        <rect x="0" y="780" width={W} height="120" fill="url(#fx-floor-grad)" />
        <g clipPath="url(#fx-floor-clip)">
          {floorLines.map((x) => <path key={x} className="fx-floor-line" d={`M800 640 L${x + 150} 900`} />)}
          {[812, 834, 864].map((y) => <path key={y} className="fx-floor-line" d={`M0 ${y} H${W}`} />)}
        </g>
        <rect x="330" y="800" width="940" height="8" fill="url(#fx-hazard)" opacity=".85" />

        {/* Roof truss: two chords and a zigzag web. */}
        <rect className="fx-chord" x="-20" y="34" width="1640" height="12" />
        <rect className="fx-chord" x="-20" y="104" width="1640" height="10" />
        <path className="fx-web" d={trussNodes.map((x, index) => `${index === 0 ? 'M' : 'L'}${x} ${index % 2 === 0 ? 46 : 104}`).join(' ')} />
        {trussNodes.map((x) => <circle key={x} className="fx-rivet" cx={x} cy={x % 160 === 120 ? 46 : 104} r="2.6" />)}
        {/* Crane rail. */}
        <rect x="-10" y="146" width="1620" height="16" fill="url(#fx-steel-grad)" />
        <path className="fx-edge" d="M-10 146 H1610 M-10 162 H1610" />

        {/* Columns with knee braces. */}
        {[{ x: 70, brace: 1 }, { x: 1496, brace: -1 }].map(({ x, brace }) => <g key={x}>
          <rect x={x} y="110" width="34" height="690" fill="url(#fx-drum-grad)" />
          <path className="fx-edge" d={`M${x + 5} 110 V800 M${x + 29} 110 V800`} />
          <path className="fx-brace" d={brace > 0 ? `M${x + 34} 250 L${x + 150} 114` : `M${x} 250 L${x - 116} 114`} />
          {Array.from({ length: 12 }, (_, index) => <circle key={index} className="fx-rivet" cx={x + 17} cy={150 + index * 54} r="2.2" />)}
        </g>)}

        {/* Pipe runs along the wall, with flanges and a valve. */}
        {[606, 640].map((y) => <g key={y}>
          <rect x="0" y={y - 9} width={W} height="18" fill="url(#fx-pipe-grad)" />
          {Array.from({ length: 9 }, (_, index) => <rect key={index} className="fx-flange" x={90 + index * 190} y={y - 13} width="10" height="26" rx="2" />)}
        </g>)}
        <rect x="324" y="614" width="18" height="60" fill="url(#fx-drum-grad)" />
        <rect x="1262" y="648" width="18" height="40" fill="url(#fx-drum-grad)" />
        <g transform="translate(470 606)">
          <circle className="fx-valve" r="21" fill="none" strokeWidth="5" />
          <path className="fx-valve" d="M-21 0 H21 M0 -21 V21" strokeWidth="3" />
          <circle className="fx-gear-hub" r="5" />
        </g>

        {/* Left: control cabinet. */}
        <rect x="118" y="660" width="214" height="140" rx="6" fill="url(#fx-drum-grad)" />
        <rect className="fx-screen" x="138" y="680" width="104" height="58" rx="4" />
        <path className="fx-screen-trace" d="M146 722 L162 712 L176 718 L192 700 L206 706 L222 692 L234 696" />
        <circle className="fx-gauge-face" cx="290" cy="706" r="24" />
        {[-120, -60, 0, 60, 120].map((angle) => <path key={angle} className="fx-gauge-tick" d="M0 -20 V-15" transform={`translate(290 706) rotate(${angle})`} />)}
        {[0, 1, 2, 3, 4].map((index) => <circle key={index} className={`fx-button fx-button--${index % 3}`} cx={150 + index * 22} cy="764" r="6" />)}
        <rect className="fx-vent" x="150" y="636" width="36" height="24" rx="3" />

        {/* Right: the mixing drum and its gearbox. */}
        <rect x="1250" y="600" width="250" height="200" rx="12" fill="url(#fx-drum-grad)" />
        {[628, 676, 724, 772].map((y) => <path key={y} className="fx-tank-band" d={`M1250 ${y} H1500`} />)}
        {Array.from({ length: 10 }, (_, index) => <circle key={index} className="fx-rivet" cx={1262 + index * 25} cy="612" r="2.4" />)}
        <circle className="fx-gear-housing" cx="1310" cy="694" r="62" />
        <rect x="1468" y="540" width="20" height="62" fill="url(#fx-drum-grad)" />
        <rect className="fx-vent" x="1462" y="530" width="32" height="14" rx="3" />
        <rect x="1432" y="584" width="36" height="16" rx="4" fill="url(#fx-steel-grad)" />

        {/* Conveyor frame (the belt and what it carries move separately). */}
        <rect className="fx-conveyor-frame" x="360" y="772" width="880" height="22" rx="5" />
        {Array.from({ length: 23 }, (_, index) => <circle key={index} className="fx-roller" cx={370 + index * 39.5} cy="783" r="6" />)}
        {[380, 640, 960, 1220].map((x) => <rect key={x} className="fx-conveyor-leg" x={x - 5} y="794" width="10" height="18" />)}
      </svg>

      <Gear x={1310} y={694} radius={50} teeth={14} />
      <Gear x={1385} y={734} radius={30} teeth={9} reverse />
      <Gear x={296} y={768} radius={20} teeth={8} slow />
      <div className="factory-part factory-gauge-needle" style={at(288, 686, 4, 22)} />

      <div className="factory-part factory-beacon" style={at(1426, 556, 48, 40)}>
        <span className="factory-beacon__dome" />
        <span className="factory-beacon__beam" />
      </div>
      <div className="factory-part factory-leds" style={at(256, 690, 40, 10)}><span /><span /><span /></div>

      {/* The crane carries a crate along the left bay, clear of the title. */}
      <div className="factory-part factory-crane" style={at(110, 140, 120, 210)}>
        <div className="factory-crane__load">
          <svg viewBox="0 0 120 210" width="100%" height="100%" preserveAspectRatio="none" focusable="false">
            <rect className="fx-trolley" x="22" y="0" width="76" height="26" rx="4" />
            <circle className="fx-gear-hub" cx="36" cy="8" r="6" /><circle className="fx-gear-hub" cx="84" cy="8" r="6" />
            <path className="fx-cable" d="M56 26 V120 M64 26 V120" />
            <path className="fx-hook" d="M60 120 v10 q0 10 -8 10 q-6 0 -6 -6" />
            <path className="fx-cable" d="M60 132 L28 150 M60 132 L92 150" />
            <rect className="fx-crate" x="20" y="150" width="80" height="54" rx="3" />
            <path className="fx-crate-slat" d="M20 168 H100 M20 186 H100 M44 150 V204 M76 150 V204" />
          </svg>
        </div>
      </div>

      {/* The belt and its load move together, one spacing per loop. */}
      <div className="factory-part factory-conveyor" style={at(360, 704, 880, 74)}>
        <div className="factory-conveyor__track">
          {Array.from({ length: 9 }, (_, index) => <svg key={index} className="factory-conveyor__item" viewBox="0 0 110 74" focusable="false"
            style={{ left: `${(index * 110 / 990) * 100}%` }}>
            {index % 3 === 1 ? <>
              <rect className="fx-crate" x="30" y="28" width="50" height="40" rx="2" />
              <path className="fx-crate-slat" d="M30 41 H80 M30 54 H80" />
            </> : <>
              <rect className="fx-jar-lid" x="40" y="14" width="30" height="8" rx="2" />
              <path className="fx-jar-glass" d="M38 22 h34 q8 4 8 14 v26 q0 6 -6 6 h-38 q-6 0 -6 -6 v-26 q0 -10 8 -14 z" />
              <path className="fx-jar-liquid" d={`M32 ${index % 3 === 0 ? 46 : 52} h46 v10 q0 6 -6 6 h-34 q-6 0 -6 -6 z`} />
              <rect className="fx-jar-label" x="41" y="40" width="28" height="12" rx="1.5" />
            </>}
          </svg>)}
        </div>
      </div>

      <Steam x={1478} y={526} scale={1.3} />
      <Steam x={168} y={634} />
    </div>

    {/* Near: hanging lamps, their light, and dust drifting through it. */}
    <div className="factory-layer factory-layer--near" ref={layers.near}>
      {LAMPS.map(({ x, delay }) => <div key={x} className="factory-part factory-lamp" style={at(x - 260, 110, 520, 790, { animationDelay: `${delay}s` })}>
        <span className="factory-lamp__cone" />
        <svg className="factory-lamp__fixture" viewBox="0 0 520 790" preserveAspectRatio="none" focusable="false">
          <path className="fx-cable" d="M260 0 V72" />
          <path className="fx-lamp-shade" d="M228 96 Q232 74 260 72 Q288 74 292 96 Z" />
          <rect className="fx-lamp-cap" x="252" y="66" width="16" height="9" rx="2" />
          <ellipse className="fx-lamp-bulb" cx="260" cy="97" rx="15" ry="5" />
        </svg>
      </div>)}
      {DUST.map((mote, index) => <span key={index} className="factory-dust"
        style={at(mote.x, mote.y, 5, 5, { animationDelay: `${mote.delay}s`, animationDuration: `${mote.duration}s` })} />)}
    </div>

    <div className="factory-scrim" ref={layers.scrim} />
  </div>;
}
