/**
 * Pipe network geometry for the progress vessels. Pure: no imports.
 *
 * Everything is computed from measured anchors in one coordinate space (CSS
 * pixels inside the network container): the pump outlet, the centre line of
 * a trunk gutter, and each vessel's inlet. Pipes only run where the layout
 * reserves room for them — a lane above each row of jars, a gutter down the
 * left side — and every branch ends exactly on its inlet, so a vessel is never
 * fed by a pipe that stops short of it or passes over its label.
 *
 *   jars    outlet ─┬─ lane of row 1 ─┬─ branch ─▶ jar
 *                   └ trunk ─ lane of row n ─ branch ─▶ jar
 *   tanks   outlet ─ trunk ─┬─ branch ─▶ tank (left end)
 *                           └─ branch ─▶ tank
 */

export interface Point {
  x: number;
  y: number;
}

export interface Inlet extends Point {
  id: string;
}

/** One straight run of glass tube. */
export interface Segment {
  from: Point;
  to: Point;
}

export type FittingKind = 'outlet' | 'tee' | 'elbow' | 'inlet';

/** A metal collar; `axis` is the direction of the tube it clamps. */
export interface Fitting extends Point {
  kind: FittingKind;
  axis: 'horizontal' | 'vertical';
}

export interface Route {
  id: string;
  points: Point[];
  d: string;
  length: number;
}

export interface NetworkGeometry {
  segments: Segment[];
  fittings: Fitting[];
  routes: Record<string, Route>;
}

const EMPTY: NetworkGeometry = { segments: [], fittings: [], routes: {} };

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

function same(a: Point, b: Point): boolean {
  return Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5;
}

/** Drops repeated and collinear points so corners are real corners. */
export function simplify(points: Point[]): Point[] {
  const deduped = points.filter((point, index) => index === 0 || !same(point, points[index - 1]));
  return deduped.filter((point, index) => {
    if (index === 0 || index === deduped.length - 1) return true;
    const prev = deduped[index - 1];
    const next = deduped[index + 1];
    const vertical = Math.abs(prev.x - point.x) < 0.5 && Math.abs(point.x - next.x) < 0.5;
    const horizontal = Math.abs(prev.y - point.y) < 0.5 && Math.abs(point.y - next.y) < 0.5;
    return !vertical && !horizontal;
  });
}

export function polylineLength(points: Point[]): number {
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    total += Math.hypot(points[index].x - points[index - 1].x, points[index].y - points[index - 1].y);
  }
  return total;
}

/** An SVG path through `points` with each corner rounded by up to `radius`. */
export function roundedPath(input: Point[], radius = 12): string {
  const points = simplify(input);
  if (points.length === 0) return '';
  const parts = [`M${round(points[0].x)} ${round(points[0].y)}`];
  for (let index = 1; index < points.length - 1; index += 1) {
    const prev = points[index - 1];
    const corner = points[index];
    const next = points[index + 1];
    const inLength = Math.hypot(corner.x - prev.x, corner.y - prev.y);
    const outLength = Math.hypot(next.x - corner.x, next.y - corner.y);
    const r = Math.min(radius, inLength / 2, outLength / 2);
    const start = { x: corner.x - ((corner.x - prev.x) / inLength) * r, y: corner.y - ((corner.y - prev.y) / inLength) * r };
    const end = { x: corner.x + ((next.x - corner.x) / outLength) * r, y: corner.y + ((next.y - corner.y) / outLength) * r };
    parts.push(`L${round(start.x)} ${round(start.y)}`, `Q${round(corner.x)} ${round(corner.y)} ${round(end.x)} ${round(end.y)}`);
  }
  const last = points[points.length - 1];
  if (points.length > 1) parts.push(`L${round(last.x)} ${round(last.y)}`);
  return parts.join(' ');
}

function route(id: string, points: Point[], radius: number): Route {
  const simple = simplify(points);
  return { id, points: simple, d: roundedPath(simple, radius), length: polylineLength(simple) };
}

/** Groups inlets into visual rows by their vertical position. */
export function groupRows<T extends Point>(inlets: readonly T[], tolerance = 14): T[][] {
  const rows: T[][] = [];
  for (const inlet of [...inlets].sort((a, b) => a.y - b.y || a.x - b.x)) {
    const row = rows.find((candidate) => Math.abs(candidate[0].y - inlet.y) <= tolerance);
    if (row) row.push(inlet);
    else rows.push([inlet]);
  }
  return rows.map((row) => row.sort((a, b) => a.x - b.x));
}

function addFitting(fittings: Fitting[], fitting: Fitting) {
  if (!fittings.some((existing) => same(existing, fitting) && existing.kind !== 'inlet' && fitting.kind !== 'inlet')) {
    fittings.push(fitting);
  }
}

export interface JarNetworkInput {
  outlet: Point;
  inlets: Inlet[];
  /** Centre line of the gutter the trunk runs down between rows. */
  trunkX: number;
  /** How far above a row's inlets its lane runs. */
  laneRise: number;
  cornerRadius?: number;
}

/** Vertical jars fed from above: one lane per row, joined by an outer trunk. */
export function jarNetwork({ outlet, inlets, trunkX, laneRise, cornerRadius = 12 }: JarNetworkInput): NetworkGeometry {
  if (!inlets.length) return EMPTY;
  const rows = groupRows(inlets);
  const lanes = rows.map((row, index) => {
    const top = Math.min(...row.map((inlet) => inlet.y)) - laneRise;
    // The first lane never rises above the pump's outlet.
    return index === 0 ? Math.max(top, outlet.y + 4) : top;
  });
  const multiRow = rows.length > 1;
  const segments: Segment[] = [];
  const fittings: Fitting[] = [];
  const routes: Record<string, Route> = {};

  if (lanes[0] > outlet.y) segments.push({ from: outlet, to: { x: outlet.x, y: lanes[0] } });
  addFitting(fittings, { x: outlet.x, y: outlet.y, kind: 'outlet', axis: 'vertical' });

  rows.forEach((row, index) => {
    const laneY = lanes[index];
    const right = Math.max(...row.map((inlet) => inlet.x), index === 0 ? outlet.x : -Infinity);
    const left = index === 0
      ? Math.min(row[0].x, outlet.x, multiRow ? trunkX : Infinity)
      : trunkX;
    if (right - left > 0.5) segments.push({ from: { x: left, y: laneY }, to: { x: right, y: laneY } });
    if (index === 0 && lanes[0] > outlet.y) addFitting(fittings, { x: outlet.x, y: laneY, kind: 'tee', axis: 'horizontal' });
    if (multiRow) {
      addFitting(fittings, { x: trunkX, y: laneY, kind: index === rows.length - 1 ? 'elbow' : 'tee', axis: 'vertical' });
    }
    for (const inlet of row) {
      segments.push({ from: { x: inlet.x, y: laneY }, to: { x: inlet.x, y: inlet.y } });
      addFitting(fittings, { x: inlet.x, y: laneY, kind: Math.abs(inlet.x - right) < 0.5 ? 'elbow' : 'tee', axis: 'horizontal' });
      addFitting(fittings, { x: inlet.x, y: inlet.y, kind: 'inlet', axis: 'vertical' });
      const end = { x: inlet.x, y: inlet.y };
      const points = index === 0
        ? [outlet, { x: outlet.x, y: laneY }, { x: inlet.x, y: laneY }, end]
        : [outlet, { x: outlet.x, y: lanes[0] }, { x: trunkX, y: lanes[0] }, { x: trunkX, y: laneY }, { x: inlet.x, y: laneY }, end];
      routes[inlet.id] = route(inlet.id, points, cornerRadius);
    }
  });
  if (multiRow) segments.push({ from: { x: trunkX, y: lanes[0] }, to: { x: trunkX, y: lanes[lanes.length - 1] } });
  return { segments, fittings, routes };
}

export interface TankNetworkInput {
  outlet: Point;
  inlets: Inlet[];
  trunkX: number;
  cornerRadius?: number;
}

/** Horizontal tanks fed from the left: one trunk, a branch into each tank's end. */
export function tankNetwork({ outlet, inlets, trunkX, cornerRadius = 12 }: TankNetworkInput): NetworkGeometry {
  if (!inlets.length) return EMPTY;
  const sorted = [...inlets].sort((a, b) => a.y - b.y);
  const segments: Segment[] = [];
  const fittings: Fitting[] = [];
  const routes: Record<string, Route> = {};
  // If the outlet is not already over the trunk, a short header joins them.
  const headerY = Math.abs(outlet.x - trunkX) < 0.5 ? outlet.y : Math.min(outlet.y + 16, sorted[0].y - 16);
  const lastY = sorted[sorted.length - 1].y;
  addFitting(fittings, { x: outlet.x, y: outlet.y, kind: 'outlet', axis: 'vertical' });
  if (headerY > outlet.y) {
    segments.push({ from: outlet, to: { x: outlet.x, y: headerY } }, { from: { x: outlet.x, y: headerY }, to: { x: trunkX, y: headerY } });
    addFitting(fittings, { x: trunkX, y: headerY, kind: 'elbow', axis: 'vertical' });
  }
  segments.push({ from: { x: trunkX, y: headerY }, to: { x: trunkX, y: lastY } });
  sorted.forEach((inlet, index) => {
    const end = { x: inlet.x, y: inlet.y };
    segments.push({ from: { x: trunkX, y: inlet.y }, to: end });
    addFitting(fittings, { x: trunkX, y: inlet.y, kind: index === sorted.length - 1 ? 'elbow' : 'tee', axis: 'vertical' });
    addFitting(fittings, { x: inlet.x, y: inlet.y, kind: 'inlet', axis: 'horizontal' });
    routes[inlet.id] = route(inlet.id, [outlet, { x: outlet.x, y: headerY }, { x: trunkX, y: headerY }, { x: trunkX, y: inlet.y }, end], cornerRadius);
  });
  return { segments, fittings, routes };
}

/** Pipe travel time: steady speed, kept between one and two seconds. */
export function travelDuration(lengthPx: number, pxPerSecond = 640): number {
  if (!Number.isFinite(lengthPx) || lengthPx <= 0) return 1000;
  return Math.round(Math.min(2000, Math.max(1000, (lengthPx / pxPerSecond) * 1000)));
}
