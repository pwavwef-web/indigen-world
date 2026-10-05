import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';
import { jarNetwork, tankNetwork, travelDuration, type Fitting, type NetworkGeometry, type Route, type Segment } from './pipeGeometry';
import type { ActiveFlow } from './useApprovalFlows';

/** Width, in a vessel's own drawing units, of the inlet stub the pipes join. */
const STUB_UNITS = 14;
/** Lanes run this far above a row's inlets, inside the space each row reserves. */
const LANE_RISE = 28;

interface Measured {
  width: number;
  height: number;
  tube: number;
  network: NetworkGeometry;
}

function centreOf(element: Element, box: DOMRect) {
  const rect = element.getBoundingClientRect();
  return { x: rect.left + rect.width / 2 - box.left, y: rect.top + rect.height / 2 - box.top };
}

/**
 * The glass network joining the pump to every vessel. Drawn behind the
 * vessels and their controls, with pointer events off, so it can never take
 * a click or hide a focus ring. Geometry is re-measured only when layout
 * changes — never per frame.
 */
export function PipeNetwork({ layout, containerRef, measureKey, active, travel, onArrive }: {
  layout: 'jars' | 'tanks';
  containerRef: RefObject<HTMLElement | null>;
  /** Changes whenever the vessels may have moved (data, view, fonts). */
  measureKey: string;
  active: ActiveFlow | null;
  travel: boolean;
  onArrive: (key: string) => void;
}) {
  const id = useId().replace(/:/g, '');
  const [measured, setMeasured] = useState<Measured | null>(null);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const box = container.getBoundingClientRect();
      const outletElement = container.querySelector('[data-pipe-outlet]');
      const inletElements = [...container.querySelectorAll('[data-pipe-inlet]')];
      if (!outletElement || !inletElements.length || box.width === 0) {
        setMeasured(null);
        return;
      }
      const outlet = centreOf(outletElement, box);
      const inlets = inletElements.map((element) => ({ id: element.getAttribute('data-pipe-inlet') ?? '', ...centreOf(element, box) }));
      const svg = inletElements[0].closest('svg');
      const scale = Math.abs(svg?.getScreenCTM()?.a ?? 1);
      const tube = Math.min(13, Math.max(7, Math.round(STUB_UNITS * scale)));
      const trunk = container.querySelector('[data-pipe-trunk]');
      const network = layout === 'jars'
        ? jarNetwork({ outlet, inlets, trunkX: trunk ? centreOf(trunk, box).x : 16, laneRise: LANE_RISE })
        : tankNetwork({ outlet, inlets, trunkX: outlet.x });
      setMeasured({ width: box.width, height: box.height, tube, network });
    };
    const request = () => {
      if (!frame) frame = window.requestAnimationFrame(measure);
    };
    request();
    const observer = new ResizeObserver(request);
    observer.observe(container);
    container.querySelectorAll('.vessel-stage, .tribe-pump').forEach((element) => observer.observe(element));
    window.addEventListener('resize', request);
    void document.fonts?.ready.then(request);
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('resize', request);
    };
  }, [containerRef, layout, measureKey]);

  // A flow whose vessel has no measured route still arrives, without a pulse.
  const route = active ? measured?.network.routes[active.category] : undefined;
  const travelling = active?.phase === 'travel';
  useEffect(() => {
    if (travelling && active && (!route || !travel)) onArrive(active.key);
  }, [travelling, active, route, travel, onArrive]);

  if (!measured) return null;
  const { width, height, tube, network } = measured;
  return (
    <svg className={`pipe-network pipe-network--${layout}`} width={width} height={height} viewBox={`0 0 ${width} ${height}`}
      aria-hidden="true" focusable="false" style={{ '--tube': `${tube}px` } as CSSProperties}>
      <defs>
        <linearGradient id={`${id}-collar-h`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f7fcfe" />
          <stop offset=".45" stopColor="#c9dde7" />
          <stop offset=".75" stopColor="#8fb0c2" />
          <stop offset="1" stopColor="#dcebf2" />
        </linearGradient>
        <linearGradient id={`${id}-collar-v`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#f7fcfe" />
          <stop offset=".45" stopColor="#c9dde7" />
          <stop offset=".75" stopColor="#8fb0c2" />
          <stop offset="1" stopColor="#dcebf2" />
        </linearGradient>
      </defs>
      <g className="pipe-network__tubes">
        {network.segments.map((segment, index) => <Tube key={index} segment={segment} tube={tube} />)}
      </g>
      {travelling && active && route && travel && (
        <Pulse key={active.key} route={route} tube={tube} onDone={() => onArrive(active.key)} />
      )}
      <g className="pipe-network__fittings">
        {network.fittings.map((fitting, index) => <Collar key={index} fitting={fitting} tube={tube} gradient={id} />)}
      </g>
    </svg>
  );
}

function Tube({ segment, tube }: { segment: Segment; tube: number }) {
  const { from, to } = segment;
  const horizontal = Math.abs(from.y - to.y) < 0.5;
  const shine = tube * 0.24;
  const line = { x1: from.x, y1: from.y, x2: to.x, y2: to.y };
  return (
    <g className="pipe-tube">
      <line className="pipe-tube__edge" {...line} strokeWidth={tube + 2} />
      <line className="pipe-tube__glass" {...line} strokeWidth={tube} />
      <line className="pipe-tube__water" {...line} strokeWidth={Math.max(2, tube * 0.34)} />
      <line className="pipe-tube__shine" strokeWidth={Math.max(1, tube * 0.13)}
        x1={horizontal ? from.x : from.x - shine} y1={horizontal ? from.y - shine : from.y}
        x2={horizontal ? to.x : to.x - shine} y2={horizontal ? to.y - shine : to.y} />
    </g>
  );
}

function Collar({ fitting, tube, gradient }: { fitting: Fitting; tube: number; gradient: string }) {
  const across = fitting.kind === 'tee' || fitting.kind === 'elbow' ? tube + 6 : tube + 5;
  const along = fitting.kind === 'tee' || fitting.kind === 'elbow' ? tube + 6 : Math.max(5, tube * 0.6);
  // A collar clamping a horizontal tube is a vertical band, and the reverse.
  const [w, h] = fitting.axis === 'horizontal' ? [along, across] : [across, along];
  const y = fitting.kind === 'inlet' && fitting.axis === 'vertical' ? fitting.y - h : fitting.y - h / 2;
  const x = fitting.kind === 'inlet' && fitting.axis === 'horizontal' ? fitting.x - w : fitting.x - w / 2;
  return (
    <rect className={`pipe-collar pipe-collar--${fitting.kind}`} x={x} y={y} width={w} height={h}
      rx={fitting.kind === 'tee' || fitting.kind === 'elbow' ? 4 : 2}
      fill={`url(#${gradient}-collar-${fitting.axis === 'horizontal' ? 'v' : 'h'})`} />
  );
}

/** A bounded slug of liquid running the exact route, at a steady speed, then gone. */
function Pulse({ route, tube, onDone }: { route: Route; tube: number; onDone: () => void }) {
  const coreRef = useRef<SVGPathElement>(null);
  const glowRef = useRef<SVGPathElement>(null);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useLayoutEffect(() => {
    const core = coreRef.current;
    const glow = glowRef.current;
    if (!core || !glow || typeof core.animate !== 'function') {
      doneRef.current();
      return undefined;
    }
    const total = core.getTotalLength();
    const slug = Math.min(110, Math.max(44, total * 0.2));
    const frames = [{ strokeDashoffset: slug }, { strokeDashoffset: -total }];
    const timing: KeyframeAnimationOptions = { duration: travelDuration(total), easing: 'cubic-bezier(.42,0,.38,1)', fill: 'forwards' };
    for (const path of [core, glow]) {
      path.style.strokeDasharray = `${slug} ${total + slug}`;
      path.style.strokeDashoffset = `${slug}`;
    }
    const animations = [core.animate(frames, timing), glow.animate(frames, timing)];
    let settled = false;
    animations[0].finished.then(() => {
      if (!settled) {
        settled = true;
        doneRef.current();
      }
    }).catch(() => undefined);
    return () => {
      settled = true;
      animations.forEach((animation) => animation.cancel());
    };
  }, [route.d]);

  return (
    <g className="pipe-pulse">
      <path ref={glowRef} className="pipe-pulse__glow" d={route.d} strokeWidth={tube * 1.2} />
      <path ref={coreRef} className="pipe-pulse__core" d={route.d} strokeWidth={Math.max(3, tube * 0.52)} />
    </g>
  );
}
