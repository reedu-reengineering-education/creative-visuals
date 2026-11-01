import type { Point, Stroke } from "./types";

export function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function pathLength(points: Point[]): number {
  let len = 0;
  for (let i = 1; i < points.length; i++) len += dist(points[i - 1], points[i]);
  return len;
}

/**
 * Moving-average smoothing that keeps the end points. Only nearby points are
 * averaged, so sharp corners between far-apart points stay sharp.
 */
export function smooth(points: Point[], radius = 2, maxDist = 0.012): Point[] {
  if (points.length < 3) return points.slice();
  const out: Point[] = [];
  for (let i = 0; i < points.length; i++) {
    if (i === 0 || i === points.length - 1) {
      out.push(points[i]);
      continue;
    }
    let sx = 0;
    let sy = 0;
    let n = 0;
    for (let j = Math.max(0, i - radius); j <= Math.min(points.length - 1, i + radius); j++) {
      if (dist(points[j], points[i]) > maxDist) continue;
      sx += points[j].x;
      sy += points[j].y;
      n++;
    }
    out.push({ x: sx / n, y: sy / n });
  }
  return out;
}

function perpendicularDistance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return dist(p, a);
  return Math.abs(dy * p.x - dx * p.y + b.x * a.y - b.y * a.x) / len;
}

/** Ramer–Douglas–Peucker simplification. */
export function simplify(points: Point[], epsilon: number): Point[] {
  if (points.length < 3) return points.slice();
  let maxD = 0;
  let index = 0;
  const end = points.length - 1;
  for (let i = 1; i < end; i++) {
    const d = perpendicularDistance(points[i], points[0], points[end]);
    if (d > maxD) {
      maxD = d;
      index = i;
    }
  }
  if (maxD > epsilon) {
    const left = simplify(points.slice(0, index + 1), epsilon);
    const right = simplify(points.slice(index), epsilon);
    return left.slice(0, -1).concat(right);
  }
  return [points[0], points[end]];
}

/**
 * Clean up a freehand stroke:
 * smooth it, auto-close it when the end is near the start, straighten
 * almost-straight lines and remove redundant points.
 * `aspect` = width / height of the stage, so distances are measured fairly.
 */
export function finishStroke(raw: Point[], aspect: number): { points: Point[]; closed: boolean } | null {
  // work in a space where x and y have the same scale
  const scaled = raw.map((p) => ({ x: p.x * aspect, y: p.y }));
  const len = pathLength(scaled);
  if (scaled.length < 2 || len < 0.01) return null;

  let pts = smooth(scaled, 2);
  const start = pts[0];
  const end = pts[pts.length - 1];
  const gap = dist(start, end);

  let closed = false;
  if (len > 0.08 && gap < Math.max(0.035, len * 0.08)) {
    closed = true;
    pts = pts.slice(0, -1);
    // drop trailing points that are basically on top of the start point
    while (pts.length > 3 && dist(pts[pts.length - 1], start) < 0.01) pts.pop();
  } else {
    // nearly straight? -> make it a perfect line
    let maxDev = 0;
    for (const p of pts) maxDev = Math.max(maxDev, perpendicularDistance(p, start, end));
    if (maxDev < Math.max(0.006, gap * 0.035)) pts = [start, end];
  }

  pts = simplify(pts, 0.003);
  if (closed && pts.length < 3) closed = false;
  return { points: pts.map((p) => ({ x: p.x / aspect, y: p.y })), closed };
}

/** Distance from point to a stroke (in stage-normalised, aspect-corrected units). */
export function distanceToStroke(p: Point, stroke: Stroke, aspect: number): number {
  const pts = stroke.points.map((q) => ({ x: q.x * aspect, y: q.y }));
  const pp = { x: p.x * aspect, y: p.y };
  if (pts.length === 1) return dist(pp, pts[0]);
  let best = Infinity;
  const n = stroke.closed ? pts.length : pts.length - 1;
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    best = Math.min(best, segmentDistance(pp, a, b));
  }
  return best;
}

function segmentDistance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  if (l2 === 0) return dist(p, a);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  return dist(p, { x: a.x + t * dx, y: a.y + t * dy });
}

export function pointInPolygon(p: Point, poly: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

/** Find the stroke under a point (closest outline, or the innermost shape it is inside of). */
export function hitTest(p: Point, strokes: Stroke[], aspect: number, tolerance = 0.025): Stroke | null {
  let best: Stroke | null = null;
  let bestD = tolerance;
  for (const s of strokes) {
    const d = distanceToStroke(p, s, aspect);
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  if (best) return best;
  // inside a closed shape? prefer the smallest one
  let smallest: Stroke | null = null;
  let smallestArea = Infinity;
  for (const s of strokes) {
    if (!s.closed || !pointInPolygon(p, s.points)) continue;
    const b = bounds(s.points);
    const area = (b.maxX - b.minX) * (b.maxY - b.minY);
    if (area < smallestArea) {
      smallestArea = area;
      smallest = s;
    }
  }
  return smallest;
}

export function bounds(points: Point[]) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return { minX, minY, maxX, maxY };
}

/** Where to put the number badge of a stroke. */
export function labelPoint(stroke: Stroke): Point {
  const pts = stroke.points;
  if (stroke.closed) {
    const b = bounds(pts);
    return { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
  }
  // middle of the path
  const total = pathLength(pts);
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const d = dist(pts[i - 1], pts[i]);
    if (acc + d >= total / 2) {
      const t = d === 0 ? 0 : (total / 2 - acc) / d;
      return { x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * t, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * t };
    }
    acc += d;
  }
  return pts[0];
}

/** Point at a fraction 0..1 along the stroke (closed strokes wrap around). */
export function pointAlong(stroke: Stroke, frac: number): Point {
  const pts = stroke.closed ? [...stroke.points, stroke.points[0]] : stroke.points;
  if (pts.length === 1) return pts[0];
  const total = pathLength(pts);
  const target = (((frac % 1) + 1) % 1) * total;
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const d = dist(pts[i - 1], pts[i]);
    if (acc + d >= target) {
      const t = d === 0 ? 0 : (target - acc) / d;
      return { x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * t, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * t };
    }
    acc += d;
  }
  return pts[pts.length - 1];
}

export function uid(prefix = "id"): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-3)}`;
}

/** Strokes in layer order (back to front). */
export function layerOrder(strokes: Stroke[]): Stroke[] {
  return strokes
    .map((s, i) => ({ s, z: s.z ?? i, i }))
    .sort((a, b) => a.z - b.z || a.i - b.i)
    .map((x) => x.s);
}

