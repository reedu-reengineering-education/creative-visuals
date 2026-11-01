/**
 * The more creative effects: squiggly lines, drawing on, radial fill, depth,
 * neon, pulse, stripes, confetti and everything added later (psychedelic,
 * technical, fun and text effects). All work in canvas pixels.
 */
import { hash01, LIGHT_COLORS, parseColor, rgbCss, shiftHue } from "./palette";
import type { Direction } from "./types";

export interface P {
  x: number;
  y: number;
}

interface Sample {
  p: P;
  /** unit normal */
  n: P;
  /** distance along the path */
  d: number;
}

const dist = (a: P, b: P) => Math.hypot(a.x - b.x, a.y - b.y);
const ease = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x * x * (3 - 2 * x));
const easeOut = (x: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);

function ring(pts: P[], closed: boolean): P[] {
  return closed && pts.length > 2 ? [...pts, pts[0]] : pts;
}

export function lengthOf(pts: P[], closed: boolean): number {
  const r = ring(pts, closed);
  let len = 0;
  for (let i = 1; i < r.length; i++) len += dist(r[i - 1], r[i]);
  return len;
}

/** Evenly spaced samples along the path with normals. */
export function resample(pts: P[], closed: boolean, step: number): Sample[] {
  const r = ring(pts, closed);
  if (r.length < 2) return r.map((p) => ({ p, n: { x: 0, y: 0 }, d: 0 }));
  const out: Sample[] = [];
  let d = 0;
  let carry = 0;
  for (let i = 1; i < r.length; i++) {
    const a = r[i - 1];
    const b = r[i];
    const segLen = dist(a, b);
    if (segLen === 0) continue;
    const dir = { x: (b.x - a.x) / segLen, y: (b.y - a.y) / segLen };
    const n = { x: -dir.y, y: dir.x };
    for (let s = carry; s < segLen; s += step) {
      out.push({ p: { x: a.x + dir.x * s, y: a.y + dir.y * s }, n, d: d + s });
    }
    carry = (carry - segLen) % step;
    if (carry < 0) carry += step;
    d += segLen;
  }
  out.push({ p: r[r.length - 1], n: out[out.length - 1]?.n ?? { x: 0, y: 0 }, d });
  // smooth the normals so corners don't jump
  return out.map((s, i) => {
    const a = out[Math.max(0, i - 1)].n;
    const b = out[Math.min(out.length - 1, i + 1)].n;
    const nx = a.x + s.n.x * 2 + b.x;
    const ny = a.y + s.n.y * 2 + b.y;
    const l = Math.hypot(nx, ny) || 1;
    return { ...s, n: { x: nx / l, y: ny / l } };
  });
}

/** Centre of a shape (area centroid for closed shapes). */
export function centroid(pts: P[], closed: boolean): P {
  if (closed && pts.length > 2) {
    let a = 0;
    let cx = 0;
    let cy = 0;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const q = pts[(i + 1) % pts.length];
      const f = p.x * q.y - q.x * p.y;
      a += f;
      cx += (p.x + q.x) * f;
      cy += (p.y + q.y) * f;
    }
    if (Math.abs(a) > 1e-6) return { x: cx / (3 * a), y: cy / (3 * a) };
  }
  const s = pts.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
  return { x: s.x / pts.length, y: s.y / pts.length };
}

function trace(ctx: CanvasRenderingContext2D, pts: P[], closed: boolean) {
  ctx.beginPath();
  pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  if (closed) ctx.closePath();
}

/** The part of the path between fractions a and b (0..1). */
export function subPath(pts: P[], closed: boolean, a: number, b: number): P[] {
  const r = ring(pts, closed);
  const total = lengthOf(pts, closed);
  const from = Math.max(0, a) * total;
  const to = Math.min(1, b) * total;
  const out: P[] = [];
  let d = 0;
  for (let i = 1; i < r.length; i++) {
    const p = r[i - 1];
    const q = r[i];
    const l = dist(p, q);
    const segStart = d;
    const segEnd = d + l;
    if (segEnd >= from && segStart <= to && l > 0) {
      const t0 = Math.max(0, (from - segStart) / l);
      const t1 = Math.min(1, (to - segStart) / l);
      const pa = { x: p.x + (q.x - p.x) * t0, y: p.y + (q.y - p.y) * t0 };
      const pb = { x: p.x + (q.x - p.x) * t1, y: p.y + (q.y - p.y) * t1 };
      if (!out.length) out.push(pa);
      out.push(pb);
    }
    d = segEnd;
  }
  return out;
}

const scaleAround = (pts: P[], c: P, s: number, off: P = { x: 0, y: 0 }) =>
  pts.map((p) => ({ x: c.x + (p.x - c.x) * s + off.x, y: c.y + (p.y - c.y) * s + off.y }));

/* ------------------------------------------------------------------ */

export interface FxArgs {
  ctx: CanvasRenderingContext2D;
  pts: P[];
  closed: boolean;
  color: string;
  /** seconds since the effect started */
  t: number;
  /** base line width (already multiplied by the size setting) */
  lw: number;
  /** the size setting itself, for things measured by the shape (text) */
  size: number;
  seed: number;
  /** second colour, or null if the kids didn't pick one */
  color2: string | null;
  dir: Direction | undefined;
  /** what text and number effects show */
  text: string;
}

/** Squiggly, slightly "boiling" hand-drawn line. */
export function wobble({ ctx, pts, closed, color, t, lw, seed }: FxArgs) {
  const samples = resample(pts, closed, Math.max(3, lw * 2));
  const amp = lw * 1.8;
  const boil = Math.floor(t * 8);
  const moved = samples.map((s, i) => {
    const wave = Math.sin(s.d * 0.05 + t * 5 + seed) * 0.65 + Math.sin(s.d * 0.13 - t * 7.3) * 0.35;
    const jitter = (hash01(i * 1.7 + boil * 31.1 + seed) - 0.5) * 0.5;
    const o = (wave + jitter) * amp;
    return { x: s.p.x + s.n.x * o, y: s.p.y + s.n.y * o };
  });
  ctx.shadowColor = color;
  ctx.shadowBlur = lw * 4;
  ctx.lineWidth = lw * 1.3;
  trace(ctx, moved, closed);
  ctx.stroke();
}

/** The line draws itself like a pen, then stays. */
export function drawOn({ ctx, pts, closed, color, t, lw }: FxArgs) {
  const f = ease(t / 1.8);
  if (f <= 0) return;
  const part = subPath(pts, closed, 0, f);
  if (part.length < 2) return;
  ctx.shadowColor = color;
  ctx.shadowBlur = lw * 4;
  ctx.lineWidth = lw * 1.4;
  trace(ctx, part, false);
  ctx.stroke();
  if (f < 1) {
    // glowing pen tip
    const tip = part[part.length - 1];
    ctx.fillStyle = "#FFFFFF";
    ctx.shadowBlur = lw * 6;
    ctx.beginPath();
    ctx.arc(tip.x, tip.y, lw * 1.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** A circle grows from the middle and fills the shape; then soft rings keep moving. */
export function radial({ ctx, pts, closed, color, t, lw }: FxArgs) {
  if (!closed) {
    // lines grow from their middle to both ends
    const e = easeOut(t / 1.2);
    const part = subPath(pts, false, 0.5 - e / 2, 0.5 + e / 2);
    if (part.length < 2) return;
    ctx.shadowColor = color;
    ctx.shadowBlur = lw * 4;
    ctx.lineWidth = lw * 2;
    trace(ctx, part, false);
    ctx.stroke();
    return;
  }
  const c = centroid(pts, true);
  const R = Math.max(...pts.map((p) => dist(p, c))) * 1.02;
  const e = easeOut(t / 1.4);
  ctx.save();
  trace(ctx, pts, true);
  ctx.clip();
  ctx.globalAlpha = 0.9;
  ctx.beginPath();
  ctx.arc(c.x, c.y, R * e, 0, Math.PI * 2);
  ctx.fill();
  if (e < 1) {
    ctx.globalAlpha = 0.8;
    ctx.strokeStyle = "#FFFFFF";
    ctx.lineWidth = lw * 1.5;
    ctx.stroke();
  } else {
    // calm rings travelling outwards
    ctx.strokeStyle = "#FFFFFF";
    ctx.lineWidth = lw;
    for (let k = 0; k < 3; k++) {
      const f = (t * 0.45 + k / 3) % 1;
      ctx.globalAlpha = 0.35 * (1 - f);
      ctx.beginPath();
      ctx.arc(c.x, c.y, R * f, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  ctx.restore();
  ctx.globalAlpha = 1;
  ctx.lineWidth = lw;
  trace(ctx, pts, true);
  ctx.stroke();
}

/** Depth: copies of the shape fly into it like a tunnel (lines: a 3D extrusion). */
export function depth({ ctx, pts, closed, color, t, lw, dir }: FxArgs) {
  const n = 6;
  const phase = dir === "out" ? 1 - ((t * 0.5) % 1) : (t * 0.5) % 1;
  ctx.shadowColor = color;
  ctx.shadowBlur = lw * 3;
  if (closed) {
    const c = centroid(pts, true);
    for (let k = n - 1; k >= 0; k--) {
      const f = (k + phase) / n;
      ctx.globalAlpha = Math.pow(1 - f, 1.4);
      ctx.lineWidth = lw * (0.4 + 1.1 * (1 - f));
      trace(ctx, scaleAround(pts, c, 1 - f * 0.92), true);
      ctx.stroke();
    }
  } else {
    for (let k = n - 1; k >= 0; k--) {
      const f = (k + phase) / n;
      const off = { x: f * lw * 9, y: f * lw * 9 };
      ctx.globalAlpha = Math.pow(1 - f, 1.4);
      ctx.lineWidth = lw * (0.5 + (1 - f));
      trace(
        ctx,
        pts.map((p) => ({ x: p.x + off.x, y: p.y + off.y })),
        false,
      );
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
  ctx.lineWidth = lw * 1.4;
  trace(ctx, pts, closed);
  ctx.stroke();
}

/** A neon tube: bright core, wide glow and the odd flicker. */
export function neon({ ctx, pts, closed, color, t, lw, seed }: FxArgs) {
  const slot = Math.floor(t * 14);
  const r = hash01(slot * 3.3 + seed);
  let on = r < 0.06 ? 0.12 : r < 0.12 ? 0.55 : 1;
  if (t % 4.3 < 0.3) on = hash01(slot + seed) < 0.5 ? 0.2 : 1; // little burst every few seconds
  if (t < 0.6) on = hash01(slot * 1.7 + seed) < 0.5 ? 0.15 : 1; // switching on
  if (closed) {
    ctx.globalAlpha = 0.1 * on;
    trace(ctx, pts, true);
    ctx.fill();
  }
  ctx.shadowColor = color;
  ctx.shadowBlur = lw * 10;
  ctx.globalAlpha = 0.45 * on;
  ctx.lineWidth = lw * 3.2;
  trace(ctx, pts, closed);
  ctx.stroke();
  ctx.globalAlpha = on;
  ctx.lineWidth = lw * 1.4;
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = "#FFFFFF";
  ctx.globalAlpha = 0.85 * on;
  ctx.lineWidth = lw * 0.5;
  ctx.stroke();
}

/** Echo rings that grow out of the shape. */
export function echo({ ctx, pts, closed, color, t, lw, dir }: FxArgs) {
  const c = centroid(pts, closed);
  ctx.shadowColor = color;
  ctx.shadowBlur = lw * 4;
  for (let k = 0; k < 3; k++) {
    const f = (t * 0.7 + k / 3) % 1;
    ctx.globalAlpha = 0.85 * (1 - f);
    ctx.lineWidth = lw * (1.3 - f * 0.8);
    trace(ctx, scaleAround(pts, c, dir === "in" ? 1 - f * 0.85 : 1 + f * 0.6), closed);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.lineWidth = lw * 1.4;
  trace(ctx, pts, closed);
  ctx.stroke();
}

/** Moving diagonal stripes (lines: a barber-pole line). */
export function stripes({ ctx, pts, closed, color, color2, t, lw, dir }: FxArgs) {
  const back = dir === "left" || dir === "up";
  if (!closed) {
    ctx.globalAlpha = 0.3;
    ctx.lineWidth = lw;
    if (color2) {
      ctx.globalAlpha = 1;
      ctx.strokeStyle = color2;
      ctx.lineWidth = lw * 3;
    }
    trace(ctx, pts, false);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = color;
    ctx.lineCap = "butt";
    ctx.lineWidth = lw * 3;
    ctx.setLineDash([lw * 2.5, lw * 2.5]);
    ctx.lineDashOffset = (back ? 1 : -1) * t * lw * 20;
    ctx.stroke();
    return;
  }
  const c = centroid(pts, true);
  const R = Math.max(...pts.map((p) => dist(p, c))) + lw * 4;
  const period = lw * 7;
  const off = (t * lw * 14) % (period * 2);
  ctx.save();
  trace(ctx, pts, true);
  ctx.clip();
  if (color2) {
    ctx.fillStyle = color2;
    ctx.globalAlpha = 0.9;
    ctx.fill();
    ctx.fillStyle = color;
  }
  ctx.translate(c.x, c.y);
  // right/left: stripes lean like "/", up/down: like "\"
  ctx.rotate(dir === "up" || dir === "down" ? Math.PI / 4 : -Math.PI / 4);
  if (back) ctx.scale(-1, 1);
  ctx.globalAlpha = 0.9;
  for (let x = -R - period * 2 + off; x < R; x += period * 2) ctx.fillRect(x, -R, period, R * 2);
  ctx.restore();
  ctx.globalAlpha = 1;
  ctx.lineWidth = lw;
  trace(ctx, pts, true);
  ctx.stroke();
}

/** Colourful confetti raining inside the shape (lines: falling from the line). */
export function confetti({ ctx, pts, closed, color, color2, t, lw, seed }: FxArgs) {
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const bw = Math.max(1, maxX - minX);
  const bh = Math.max(1, maxY - minY);
  const colors = color2 ? [color, color2] : [color, ...LIGHT_COLORS.map((c) => c.value)];
  const n = Math.round(Math.min(70, Math.max(12, (bw * bh) / (lw * lw * 45))));
  const visible = Math.min(n, Math.floor((t / 1.2) * n) + 1);

  ctx.save();
  if (closed) {
    trace(ctx, pts, true);
    ctx.clip();
  }
  for (let k = 0; k < visible; k++) {
    const h1 = hash01(k * 1.31 + seed);
    const h2 = hash01(k * 2.71 + seed);
    const h3 = hash01(k * 4.13 + seed);
    const size = lw * (1.6 + h2 * 1.2);
    let x: number;
    let y: number;
    let alpha = 1;
    if (closed) {
      const speed = 0.18 + h2 * 0.3;
      const fall = (h3 + t * speed) % 1;
      x = minX + h1 * bw + Math.sin(t * 2 + k) * lw;
      y = minY - size * 2 + fall * (bh + size * 4);
    } else {
      // falls from a random point of the line
      const along = subPath(pts, false, 0, h1);
      const start = along[along.length - 1] ?? pts[0];
      const fall = (h3 + t * (0.5 + h2 * 0.5)) % 1;
      x = start.x + Math.sin(t * 3 + k) * lw * 1.5;
      y = start.y + fall * lw * 26;
      alpha = 1 - fall;
    }
    ctx.globalAlpha = alpha;
    ctx.fillStyle = colors[k % colors.length];
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(t * (2 + h3 * 3) + k);
    ctx.fillRect(-size / 2, -size / 4, size, size / 2);
    ctx.restore();
  }
  ctx.restore();
  ctx.globalAlpha = closed ? 0.5 : 0.3;
  ctx.lineWidth = lw;
  trace(ctx, pts, closed);
  ctx.stroke();
}

/* ------------------------------------------------------------------ */
/* helpers for the newer effects                                       */
/* ------------------------------------------------------------------ */

function bbox(pts: P[]) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY, w: Math.max(1, maxX - minX), h: Math.max(1, maxY - minY) };
}

/** Clip to the shape (closed) and run `draw`; restores afterwards. */
function inside(ctx: CanvasRenderingContext2D, pts: P[], draw: () => void) {
  ctx.save();
  trace(ctx, pts, true);
  ctx.clip();
  draw();
  ctx.restore();
}

function outlineAt(ctx: CanvasRenderingContext2D, pts: P[], closed: boolean, alpha: number, width: number) {
  ctx.globalAlpha = alpha;
  ctx.lineWidth = width;
  trace(ctx, pts, closed);
  ctx.stroke();
}

/** Position and direction at distance d along resampled points. */
function at(samples: Sample[], d: number): { p: P; angle: number } {
  let i = 1;
  while (i < samples.length - 1 && samples[i].d < d) i++;
  const a = samples[i - 1];
  const b = samples[i] ?? a;
  const f = b.d > a.d ? Math.min(1, Math.max(0, (d - a.d) / (b.d - a.d))) : 0;
  return {
    p: { x: a.p.x + (b.p.x - a.p.x) * f, y: a.p.y + (b.p.y - a.p.y) * f },
    angle: Math.atan2(b.p.y - a.p.y, b.p.x - a.p.x),
  };
}

/** A gradient axis across the bounding box in a direction. */
function axis(b: ReturnType<typeof bbox>, dir: Direction | undefined) {
  const cx = (b.minX + b.maxX) / 2;
  const cy = (b.minY + b.maxY) / 2;
  switch (dir) {
    case "left":
      return { x0: b.maxX, y0: cy, x1: b.minX, y1: cy, len: b.w };
    case "up":
      return { x0: cx, y0: b.maxY, x1: cx, y1: b.minY, len: b.h };
    case "down":
      return { x0: cx, y0: b.minY, x1: cx, y1: b.maxY, len: b.h };
    default:
      return { x0: b.minX, y0: cy, x1: b.maxX, y1: cy, len: b.w };
  }
}

/** Text split into what a person sees as letters (keeps emoji together). */
function graphemes(s: string): string[] {
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    return [...new Intl.Segmenter().segment(s)].map((x) => x.segment);
  }
  return Array.from(s);
}

const FONT = "Lexend, system-ui, sans-serif";

/* ------------------------------------------------------------------ */
/* psychedelic                                                         */
/* ------------------------------------------------------------------ */

/** Rainbow colours flowing along the line. */
export function flow({ ctx, pts, closed, t, lw, dir }: FxArgs) {
  const sgn = dir === "left" ? -1 : 1;
  const hue = (x: number) => (((x % 360) + 360) % 360).toFixed(0);
  if (closed) {
    const b = bbox(pts);
    const g = ctx.createLinearGradient(b.minX, b.minY, b.maxX, b.maxY);
    for (let k = 0; k <= 6; k++) g.addColorStop(k / 6, `hsl(${hue(k * 60 - sgn * t * 120)} 95% 60%)`);
    ctx.globalAlpha = 0.28;
    ctx.fillStyle = g;
    trace(ctx, pts, true);
    ctx.fill();
  }
  const samples = resample(pts, closed, Math.max(3, lw * 1.5));
  const total = samples[samples.length - 1]?.d || 1;
  for (const [alpha, width] of [
    [0.3, lw * 3.2],
    [1, lw * 1.5],
  ]) {
    ctx.globalAlpha = alpha;
    ctx.lineWidth = width;
    for (let i = 1; i < samples.length; i++) {
      const a = samples[i - 1];
      const b = samples[i];
      ctx.strokeStyle = `hsl(${hue((a.d / total) * 360 - sgn * t * 150)} 95% 62%)`;
      ctx.beginPath();
      ctx.moveTo(a.p.x, a.p.y);
      ctx.lineTo(b.p.x, b.p.y);
      ctx.stroke();
    }
  }
}

/** Turning spiral arms inside the shape (lines: two twisting strands). */
export function spiral({ ctx, pts, closed, color, color2, t, lw, dir }: FxArgs) {
  const sgn = dir === "left" ? -1 : 1;
  if (!closed) {
    const samples = resample(pts, false, Math.max(3, lw));
    ctx.shadowColor = color;
    ctx.shadowBlur = lw * 3;
    ctx.lineWidth = lw * 1.2;
    [color, color2 ?? color].forEach((c, k) => {
      ctx.strokeStyle = c;
      ctx.beginPath();
      samples.forEach((s, i) => {
        const o = Math.sin(s.d * 0.06 - sgn * t * 4 + k * Math.PI) * lw * 3;
        const x = s.p.x + s.n.x * o;
        const y = s.p.y + s.n.y * o;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    });
    return;
  }
  const c = centroid(pts, true);
  const R = Math.max(...pts.map((p) => dist(p, c))) * 1.05;
  const arms = 6;
  const twist = 2.4;
  const rot = sgn * t * 1.3;
  const slice = Math.PI / arms;
  inside(ctx, pts, () => {
    ctx.globalAlpha = 0.9;
    for (let k = 0; k < arms * 2; k++) {
      const fill = k % 2 === 0 ? color : color2;
      if (!fill) continue;
      const a0 = rot + k * slice;
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.moveTo(c.x, c.y);
      for (let i = 0; i <= 16; i++) {
        const r = (R * i) / 16;
        const th = a0 + (twist * i) / 16;
        ctx.lineTo(c.x + Math.cos(th) * r, c.y + Math.sin(th) * r);
      }
      for (let i = 16; i >= 0; i--) {
        const r = (R * i) / 16;
        const th = a0 + slice + (twist * i) / 16;
        ctx.lineTo(c.x + Math.cos(th) * r, c.y + Math.sin(th) * r);
      }
      ctx.closePath();
      ctx.fill();
    }
  });
  outlineAt(ctx, pts, true, 1, lw);
}

/** Wobbling plasma clouds between two colours. */
export function plasma({ ctx, pts, closed, color, color2, t, lw }: FxArgs) {
  const a = parseColor(color);
  const b = parseColor(color2 ?? shiftHue(color, 150));
  const mix = (f: number) => rgbCss({ r: a.r + (b.r - a.r) * f, g: a.g + (b.g - a.g) * f, b: a.b + (b.b - a.b) * f });
  const value = (u: number, v: number) =>
    (Math.sin(u * 3 + t) +
      Math.sin(v * 2.3 - t * 1.3) +
      Math.sin((u + v) * 2 + t * 0.7) +
      Math.sin(Math.hypot(u - 1, v - 1) * 3.5 - t * 1.6) +
      4) /
    8;
  if (!closed) {
    const samples = resample(pts, false, Math.max(3, lw * 1.5));
    ctx.lineWidth = lw * 2;
    for (let i = 1; i < samples.length; i++) {
      ctx.strokeStyle = mix(value(samples[i].d * 0.025, samples[i].d * 0.012));
      ctx.beginPath();
      ctx.moveTo(samples[i - 1].p.x, samples[i - 1].p.y);
      ctx.lineTo(samples[i].p.x, samples[i].p.y);
      ctx.stroke();
    }
    return;
  }
  const bb = bbox(pts);
  const cell = Math.max(lw * 2.5, Math.max(bb.w, bb.h) / 40);
  const scale = Math.max(bb.w, bb.h) / 3;
  inside(ctx, pts, () => {
    ctx.globalAlpha = 0.92;
    for (let y = bb.minY; y < bb.maxY; y += cell) {
      for (let x = bb.minX; x < bb.maxX; x += cell) {
        ctx.fillStyle = mix(value((x - bb.minX) / scale, (y - bb.minY) / scale));
        ctx.fillRect(x, y, cell + 0.5, cell + 0.5);
      }
    }
  });
  ctx.strokeStyle = color;
  outlineAt(ctx, pts, true, 0.8, lw);
}

/** Coloured disco lights wandering over the shape. */
export function disco({ ctx, pts, closed, color, t, lw, seed }: FxArgs) {
  const colors = [color, ...LIGHT_COLORS.map((c) => c.value)];
  const n = 7;
  ctx.globalCompositeOperation = "lighter";
  if (closed) {
    const b = bbox(pts);
    const cx = (b.minX + b.maxX) / 2;
    const cy = (b.minY + b.maxY) / 2;
    const r = Math.max(lw * 4, Math.min(b.w, b.h) * 0.16);
    inside(ctx, pts, () => {
      for (let k = 0; k < n; k++) {
        const h1 = hash01(seed + k * 1.7);
        const h2 = hash01(seed + k * 3.1);
        const x = cx + Math.sin(t * (0.7 + h1) + k * 2.1) * b.w * 0.45;
        const y = cy + Math.cos(t * (0.6 + h2) + k * 1.3) * b.h * 0.45;
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, colors[k % colors.length]);
        g.addColorStop(1, rgbCss(parseColor(colors[k % colors.length]), 0));
        ctx.globalAlpha = 0.85;
        ctx.fillStyle = g;
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
      }
    });
    ctx.globalCompositeOperation = "source-over";
    outlineAt(ctx, pts, true, 0.5, lw);
    return;
  }
  const samples = resample(pts, false, 3);
  const total = samples[samples.length - 1]?.d || 1;
  for (let k = 0; k < n; k++) {
    const f = (Math.sin(t * (0.6 + hash01(seed + k) * 0.9) + k * 2.4) + 1) / 2;
    const { p } = at(samples, f * total);
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = colors[k % colors.length];
    ctx.shadowColor = colors[k % colors.length];
    ctx.shadowBlur = lw * 4;
    ctx.beginPath();
    ctx.arc(p.x, p.y, lw * 1.6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalCompositeOperation = "source-over";
  ctx.shadowBlur = 0;
  outlineAt(ctx, pts, false, 0.25, lw);
}

/* ------------------------------------------------------------------ */
/* technical                                                           */
/* ------------------------------------------------------------------ */

/** Broken signal: colour channels slip apart, slices jump sideways. */
export function glitch({ ctx, pts, closed, color, t, lw, seed }: FxArgs) {
  const slot = Math.floor(t * 8);
  const glitching = hash01(slot * 1.3 + seed) < 0.35;
  const off = glitching ? (hash01(slot * 2.1 + seed) - 0.5) * lw * 6 : lw * 0.5;
  const moved = (dx: number) => pts.map((p) => ({ x: p.x + dx, y: p.y }));

  ctx.globalCompositeOperation = "lighter";
  for (const [c, dx] of [
    ["#FF3B5C", -off],
    ["#38E8FF", off],
  ] as const) {
    ctx.strokeStyle = c;
    outlineAt(ctx, moved(dx), closed, 0.8, lw * 1.2);
  }
  ctx.globalCompositeOperation = "source-over";
  ctx.strokeStyle = color;
  if (closed) {
    ctx.globalAlpha = 0.18;
    trace(ctx, pts, true);
    ctx.fill();
  }
  outlineAt(ctx, pts, closed, 1, lw);

  if (glitching) {
    // a few horizontal slices shifted sideways
    const b = bbox(pts);
    for (let k = 0; k < 3; k++) {
      const y = b.minY + hash01(slot * 3.7 + k + seed) * b.h;
      const hgt = lw * (1.5 + hash01(slot * 5.3 + k) * 4);
      const dx = (hash01(slot * 7.1 + k + seed) - 0.5) * lw * 14;
      ctx.save();
      ctx.beginPath();
      ctx.rect(b.minX - lw * 4, y, b.w + lw * 8, hgt);
      ctx.clip();
      ctx.translate(dx, 0);
      ctx.globalAlpha = 0.9;
      ctx.lineWidth = lw * 1.4;
      trace(ctx, pts, closed);
      if (closed) ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }
}

/** A bright band sweeps across like a scanner. */
export function scan({ ctx, pts, closed, color, t, lw, dir }: FxArgs) {
  const b = bbox(pts);
  const ax = axis(b, dir);
  const f = (t * 0.6) % 1.2; // a short pause after each sweep
  const g = ctx.createLinearGradient(ax.x0, ax.y0, ax.x1, ax.y1);
  const clear = rgbCss(parseColor(color), 0);
  g.addColorStop(0, clear);
  if (f > 0.3) g.addColorStop(Math.min(1, f - 0.3), clear);
  if (f <= 1) g.addColorStop(f, color);
  if (f + 0.02 < 1) g.addColorStop(f + 0.02, clear);
  g.addColorStop(1, clear);

  outlineAt(ctx, pts, closed, 0.25, lw);
  ctx.strokeStyle = g;
  ctx.fillStyle = g;
  if (closed) {
    ctx.globalAlpha = 0.85;
    trace(ctx, pts, true);
    ctx.fill();
  }
  outlineAt(ctx, pts, closed, 1, lw * 1.8);
  if (closed && f <= 1) {
    // the scan line itself
    const x = ax.x0 + (ax.x1 - ax.x0) * f;
    const y = ax.y0 + (ax.y1 - ax.y0) * f;
    inside(ctx, pts, () => {
      ctx.strokeStyle = "#FFFFFF";
      ctx.globalAlpha = 0.9;
      ctx.lineWidth = lw * 0.8;
      ctx.beginPath();
      if (ax.y0 === ax.y1) {
        ctx.moveTo(x, b.minY);
        ctx.lineTo(x, b.maxY);
      } else {
        ctx.moveTo(b.minX, y);
        ctx.lineTo(b.maxX, y);
      }
      ctx.stroke();
    });
  }
}

const GLYPHS = graphemes("01アイウエオカキクケコサシスセソタチツテト0123456789");

/** Falling code like in the movies. */
export function matrix({ ctx, pts, closed, color, t, lw, seed, dir }: FxArgs) {
  const up = dir === "up";
  const font = lw * 3.2;
  ctx.font = `600 ${font.toFixed(1)}px ui-monospace, Menlo, monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const glyph = (a: number, b: number) => GLYPHS[Math.floor(hash01(a * 12.7 + b * 3.3 + seed) * GLYPHS.length)];
  const TRAIL = 8;

  if (!closed) {
    const samples = resample(pts, false, font * 1.4);
    samples.forEach((s, k) => {
      const speed = 0.4 + hash01(k * 1.9 + seed) * 0.5;
      const fall = (hash01(k * 2.3 + seed) + t * speed) % 1;
      const y = s.p.y + (up ? -1 : 1) * fall * font * 7;
      ctx.globalAlpha = 1 - fall;
      ctx.fillStyle = fall < 0.12 ? "#FFFFFF" : color;
      ctx.fillText(glyph(k, Math.floor(t * 6)), s.p.x, y);
    });
    outlineAt(ctx, pts, false, 0.35, lw);
    return;
  }

  const b = bbox(pts);
  const cols = Math.ceil(b.w / font);
  const rows = Math.ceil(b.h / font);
  inside(ctx, pts, () => {
    for (let k = 0; k < cols; k++) {
      const speed = 5 + hash01(k * 1.31 + seed) * 7; // rows per second
      const head = (hash01(k * 2.7 + seed) * (rows + TRAIL) + t * speed) % (rows + TRAIL);
      const x = b.minX + (k + 0.5) * font;
      for (let j = 0; j < TRAIL; j++) {
        const row = Math.floor(head) - j;
        if (row < 0 || row > rows) continue;
        const y = up ? b.maxY - (row + 0.5) * font : b.minY + (row + 0.5) * font;
        ctx.globalAlpha = j === 0 ? 1 : 0.85 * (1 - j / TRAIL);
        ctx.fillStyle = j === 0 ? "#FFFFFF" : color;
        // every cell has its own glyph that changes now and then
        ctx.fillText(glyph(k, row * 7.3 + Math.floor(t * 2 + hash01(k * 3.1 + row) * 5)), x, y);
      }
    }
  });
  outlineAt(ctx, pts, true, 0.6, lw);
}

/** A moving wireframe grid with twinkling crossing points (lines: a ruler). */
export function grid({ ctx, pts, closed, color, t, lw, seed, dir }: FxArgs) {
  const back = dir === "left" || dir === "up";
  const vertical = dir === "up" || dir === "down";
  if (!closed) {
    const samples = resample(pts, false, lw * 4);
    outlineAt(ctx, pts, false, 0.4, lw * 0.7);
    ctx.lineWidth = lw * 0.6;
    ctx.globalAlpha = 1;
    ctx.beginPath();
    for (const s of samples) {
      const len = lw * (1 + (Math.sin(s.d * 0.08 - (back ? -1 : 1) * t * 6) + 1) * 1.6);
      ctx.moveTo(s.p.x - s.n.x * len, s.p.y - s.n.y * len);
      ctx.lineTo(s.p.x + s.n.x * len, s.p.y + s.n.y * len);
    }
    ctx.stroke();
    return;
  }
  const b = bbox(pts);
  const cell = lw * 7;
  const off = ((t * cell * 1.5) % cell) * (back ? -1 : 1);
  const ox = vertical ? 0 : off;
  const oy = vertical ? off : 0;
  inside(ctx, pts, () => {
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = lw * 0.45;
    ctx.beginPath();
    for (let x = b.minX - cell + ox; x <= b.maxX + cell; x += cell) {
      ctx.moveTo(x, b.minY);
      ctx.lineTo(x, b.maxY);
    }
    for (let y = b.minY - cell + oy; y <= b.maxY + cell; y += cell) {
      ctx.moveTo(b.minX, y);
      ctx.lineTo(b.maxX, y);
    }
    ctx.stroke();
    let i = 0;
    for (let x = b.minX - cell + ox; x <= b.maxX + cell; x += cell) {
      for (let y = b.minY - cell + oy; y <= b.maxY + cell; y += cell) {
        i++;
        const tw = Math.sin(t * 3 + hash01(i * 1.7 + seed) * 6.28);
        if (tw < 0.6) continue;
        ctx.globalAlpha = (tw - 0.6) * 2.5;
        ctx.beginPath();
        ctx.arc(x, y, lw * 0.9, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  });
  outlineAt(ctx, pts, true, 1, lw);
}

/** Radar sweep with blips (lines: a light running back and forth). */
export function radar({ ctx, pts, closed, color, t, lw, seed, dir }: FxArgs) {
  if (!closed) {
    outlineAt(ctx, pts, false, 0.2, lw);
    const p = (Math.sin(t * 2.2) + 1) / 2;
    const back = Math.cos(t * 2.2) < 0 ? 1 : -1;
    ctx.shadowColor = color;
    ctx.shadowBlur = lw * 4;
    for (let k = 0; k < 7; k++) {
      const a = p + back * k * 0.025;
      const part = subPath(pts, false, Math.min(a, a + back * 0.025), Math.max(a, a + back * 0.025));
      if (part.length < 2) continue;
      ctx.globalAlpha = 1 - k / 7;
      ctx.lineWidth = lw * (2 - k * 0.15);
      trace(ctx, part, false);
      ctx.stroke();
    }
    return;
  }
  const c = centroid(pts, true);
  const R = Math.max(...pts.map((p) => dist(p, c))) * 1.05;
  const sgn = dir === "left" ? -1 : 1;
  const sweep = sgn * t * 2.2;
  inside(ctx, pts, () => {
    ctx.lineWidth = lw * 0.5;
    ctx.globalAlpha = 0.25;
    for (let k = 1; k <= 3; k++) {
      ctx.beginPath();
      ctx.arc(c.x, c.y, (R * k) / 3, 0, Math.PI * 2);
      ctx.stroke();
    }
    const steps = 20;
    for (let k = 0; k < steps; k++) {
      const a1 = sweep - sgn * k * 0.05;
      const a0 = a1 - sgn * 0.05;
      ctx.globalAlpha = 0.55 * (1 - k / steps);
      ctx.beginPath();
      ctx.moveTo(c.x, c.y);
      ctx.arc(c.x, c.y, R, Math.min(a0, a1), Math.max(a0, a1));
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.moveTo(c.x, c.y);
    ctx.lineTo(c.x + Math.cos(sweep) * R, c.y + Math.sin(sweep) * R);
    ctx.stroke();
    // blips light up when the sweep passes them
    const turn = Math.floor(Math.abs(sweep) / (Math.PI * 2));
    for (let k = 0; k < 5; k++) {
      const ang = hash01(seed + k * 3.3 + turn * 0.71) * Math.PI * 2;
      const rr = (0.2 + hash01(seed + k * 5.9 + turn * 1.3) * 0.75) * R;
      const behind = ((((sweep - ang) * sgn) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      const a = Math.max(0, 1 - behind / 2.5);
      if (a <= 0) continue;
      ctx.globalAlpha = a;
      ctx.beginPath();
      ctx.arc(c.x + Math.cos(ang) * rr, c.y + Math.sin(ang) * rr, lw * 1.3, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  outlineAt(ctx, pts, true, 1, lw);
}

/** LED pixels switching on and off. */
export function pixel({ ctx, pts, closed, color, color2, t, lw, seed }: FxArgs) {
  const cell = lw * 3.5;
  const lit = (i: number) => {
    const rate = 1.5 + hash01(i * 0.37 + seed) * 2;
    return hash01(i * 1.13 + Math.floor(t * rate + hash01(i * 2.9) * 10) * 7.7 + seed) > 0.5;
  };
  const pick = (i: number) => (color2 && hash01(i * 4.1 + seed) > 0.5 ? color2 : color);
  if (!closed) {
    const samples = resample(pts, false, cell);
    samples.forEach((s, i) => {
      ctx.globalAlpha = lit(i) ? 1 : 0.12;
      ctx.fillStyle = pick(i);
      ctx.fillRect(s.p.x - cell * 0.38, s.p.y - cell * 0.38, cell * 0.76, cell * 0.76);
    });
    return;
  }
  const b = bbox(pts);
  inside(ctx, pts, () => {
    let i = 0;
    for (let y = b.minY; y < b.maxY; y += cell) {
      for (let x = b.minX; x < b.maxX; x += cell) {
        i++;
        ctx.globalAlpha = lit(i) ? 0.95 : 0.08;
        ctx.fillStyle = pick(i);
        ctx.fillRect(x + cell * 0.1, y + cell * 0.1, cell * 0.8, cell * 0.8);
      }
    }
  });
  outlineAt(ctx, pts, true, 0.5, lw * 0.7);
}

/* ------------------------------------------------------------------ */
/* fun                                                                 */
/* ------------------------------------------------------------------ */

function pulseShape(ctx: CanvasRenderingContext2D, pts: P[], closed: boolean, color: string, lw: number, scale: number, glow: number) {
  const c = centroid(pts, closed);
  const moved = scaleAround(pts, c, scale);
  ctx.shadowColor = color;
  ctx.shadowBlur = lw * (3 + glow * 6);
  if (closed) {
    ctx.globalAlpha = 0.15 + glow * 0.45;
    trace(ctx, moved, true);
    ctx.fill();
  }
  outlineAt(ctx, moved, closed, 0.75 + glow * 0.25, lw * (1.1 + glow * 0.8));
}

/** Slowly grows and shrinks, like breathing. */
export function breathe({ ctx, pts, closed, color, t, lw }: FxArgs) {
  const b = (Math.sin(t * 1.6 - Math.PI / 2) + 1) / 2;
  pulseShape(ctx, pts, closed, color, lw, 1 + 0.08 * b, b);
}

/** Ba-dum … ba-dum. */
export function heartbeat({ ctx, pts, closed, color, t, lw }: FxArgs) {
  const ph = t % 1.1;
  const bump = (c: number, w: number) => Math.max(0, 1 - Math.abs(ph - c) / w);
  const p = Math.max(bump(0.08, 0.1), 0.65 * bump(0.32, 0.1));
  pulseShape(ctx, pts, closed, color, lw, 1 + 0.12 * p, p);
}

/** Shakes like it's cold. */
export function shake({ ctx, pts, closed, color, t, lw, seed }: FxArgs) {
  const slot = Math.floor(t * 20);
  const dx = (hash01(slot * 1.7 + seed) - 0.5) * lw * 2.5;
  const dy = (hash01(slot * 2.9 + seed) - 0.5) * lw * 2.5;
  const rot = (hash01(slot * 4.3 + seed) - 0.5) * 0.05;
  const c = centroid(pts, closed);
  const moved = pts.map((p) => {
    const x = p.x - c.x;
    const y = p.y - c.y;
    return { x: c.x + x * Math.cos(rot) - y * Math.sin(rot) + dx, y: c.y + x * Math.sin(rot) + y * Math.cos(rot) + dy };
  });
  ctx.shadowColor = color;
  ctx.shadowBlur = lw * 3;
  if (closed) {
    ctx.globalAlpha = 0.25;
    trace(ctx, moved, true);
    ctx.fill();
  }
  outlineAt(ctx, moved, closed, 1, lw * 1.3);
}

/** Bubbles rising (or sinking). */
export function bubbles({ ctx, pts, closed, color, t, lw, seed, dir }: FxArgs) {
  const down = dir === "down";
  const bubble = (x: number, y: number, r: number, alpha: number) => {
    ctx.globalAlpha = alpha;
    ctx.lineWidth = Math.max(1, lw * 0.5);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = alpha * 0.9;
    ctx.beginPath();
    ctx.arc(x - r * 0.35, y - r * 0.35, r * 0.22, 0, Math.PI * 2);
    ctx.fill();
  };
  if (!closed) {
    const samples = resample(pts, false, lw * 5);
    samples.forEach((s, k) => {
      if (hash01(k * 1.9 + seed) < 0.4) return;
      const rise = (hash01(k * 2.3 + seed) + t * (0.35 + hash01(k) * 0.3)) % 1;
      const r = lw * (0.8 + hash01(k * 3.1 + seed) * 1.2);
      const x = s.p.x + Math.sin(t * 2 + k) * lw;
      const y = s.p.y + (down ? 1 : -1) * rise * lw * 22;
      bubble(x, y, r, 1 - rise);
    });
    outlineAt(ctx, pts, false, 0.4, lw);
    return;
  }
  const b = bbox(pts);
  const n = Math.round(Math.min(40, Math.max(8, (b.w * b.h) / (lw * lw * 80))));
  inside(ctx, pts, () => {
    for (let k = 0; k < n; k++) {
      const h1 = hash01(k * 1.31 + seed);
      const h2 = hash01(k * 2.71 + seed);
      const h3 = hash01(k * 4.13 + seed);
      const r = lw * (1 + h2 * 2);
      const rise = (h3 + t * (0.12 + h2 * 0.18)) % 1;
      const x = b.minX + h1 * b.w + Math.sin(t * 1.5 + k) * lw * 1.2;
      const travel = rise * (b.h + r * 4);
      const y = down ? b.minY - r * 2 + travel : b.maxY + r * 2 - travel;
      bubble(x, y, r, 0.9);
    }
  });
  outlineAt(ctx, pts, true, 0.6, lw);
}

/** Fireworks bursting over and over. */
export function fireworks({ ctx, pts, closed, color, color2, t, lw, seed }: FxArgs) {
  const b = bbox(pts);
  const samples = closed ? null : resample(pts, false, 3);
  const total = samples?.[samples.length - 1]?.d ?? 1;
  const period = 1.8;
  const streams = 3;
  for (let k = 0; k < streams; k++) {
    const local = t + (k * period) / streams;
    const n = Math.floor(local / period);
    const f = (local % period) / period;
    const h1 = hash01(seed + n * 3.7 + k * 11.1);
    const h2 = hash01(seed + n * 5.3 + k * 7.9);
    const centre = samples ? at(samples, h1 * total).p : { x: b.minX + b.w * (0.15 + h1 * 0.7), y: b.minY + b.h * (0.15 + h2 * 0.6) };
    const R = closed ? Math.min(b.w, b.h) * 0.35 + lw * 4 : lw * 12;
    const c = color2 ? (n % 2 ? color2 : color) : k === 0 ? color : LIGHT_COLORS[(n + k * 3) % LIGHT_COLORS.length].value;
    ctx.fillStyle = c;
    ctx.shadowColor = c;
    ctx.shadowBlur = lw * 3;
    const sparks = 16;
    for (let i = 0; i < sparks; i++) {
      const ang = (i / sparks) * Math.PI * 2 + h2;
      const d = easeOut(f * 1.4) * R * (0.8 + hash01(i + n) * 0.3);
      const x = centre.x + Math.cos(ang) * d;
      const y = centre.y + Math.sin(ang) * d + f * f * lw * 10;
      ctx.globalAlpha = Math.max(0, 1 - f);
      ctx.beginPath();
      ctx.arc(x, y, lw * 0.75 * (1 - f * 0.5), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.shadowBlur = 0;
  outlineAt(ctx, pts, closed, 0.3, lw);
}

/** A smooth, moving colour gradient. */
export function gradient({ ctx, pts, closed, color, color2, t, lw, dir }: FxArgs) {
  const b = bbox(pts);
  const ax = axis(b, dir);
  const other = color2 ?? shiftHue(color, 120);
  // three periods over 3× the shape, shifted by up to one period: repeats seamlessly
  const off = ((t * 0.35) % 1) - 1;
  const dx = (ax.x1 - ax.x0) / Math.max(1, ax.len);
  const dy = (ax.y1 - ax.y0) / Math.max(1, ax.len);
  const L = Math.max(1, ax.len);
  const sx = ax.x0 + dx * off * L;
  const sy = ax.y0 + dy * off * L;
  const g = ctx.createLinearGradient(sx, sy, sx + dx * 3 * L, sy + dy * 3 * L);
  for (let k = 0; k <= 6; k++) g.addColorStop(k / 6, k % 2 ? other : color);
  ctx.fillStyle = g;
  ctx.strokeStyle = g;
  if (closed) {
    ctx.globalAlpha = 0.9;
    trace(ctx, pts, true);
    ctx.fill();
    outlineAt(ctx, pts, true, 1, lw);
  } else {
    outlineAt(ctx, pts, false, 1, lw * 2.2);
  }
}

/* ------------------------------------------------------------------ */
/* text                                                                */
/* ------------------------------------------------------------------ */

/** Scrolling text: a ticker inside shapes, letters running along lines. */
export function ticker({ ctx, pts, closed, color, t, lw, size, text, dir }: FxArgs) {
  const sgn = dir === "right" ? 1 : -1;
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = lw * 2;
  ctx.textBaseline = "middle";
  if (closed) {
    const b = bbox(pts);
    const font = Math.max(lw * 3, Math.min(b.h * 0.9, b.h * 0.55 * size));
    ctx.font = `600 ${font.toFixed(1)}px ${FONT}`;
    ctx.textAlign = "left";
    const unit = ctx.measureText(`${text}   `).width || 1;
    const off = (((t * font * 2.2 * sgn) % unit) + unit) % unit;
    const y = (b.minY + b.maxY) / 2;
    inside(ctx, pts, () => {
      ctx.globalAlpha = 1;
      for (let x = b.minX - unit + off; x < b.maxX; x += unit) ctx.fillText(text, x, y);
    });
    ctx.shadowBlur = 0;
    outlineAt(ctx, pts, true, 0.35, lw * 0.8);
    return;
  }
  const font = lw * 5;
  ctx.font = `600 ${font.toFixed(1)}px ${FONT}`;
  ctx.textAlign = "center";
  const letters = graphemes(`${text}   `);
  const widths = letters.map((l) => ctx.measureText(l).width);
  const unit = widths.reduce((a, w) => a + w, 0) || 1;
  const samples = resample(pts, false, 2);
  const total = samples[samples.length - 1]?.d ?? 0;
  const off = (((t * font * 2.2 * sgn) % unit) + unit) % unit;
  ctx.globalAlpha = 1;
  for (let start = -unit + off; start < total; start += unit) {
    let d = start;
    letters.forEach((l, i) => {
      const mid = d + widths[i] / 2;
      d += widths[i];
      if (mid < 0 || mid > total || !l.trim()) return;
      const { p, angle } = at(samples, mid);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(angle);
      ctx.fillText(l, 0, 0);
      ctx.restore();
    });
  }
}

/** A big number (a sensor value, a timer or the clock). */
export function bigNumber({ ctx, pts, closed, color, lw, size, text }: FxArgs) {
  const b = bbox(pts);
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = lw * 3;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.globalAlpha = 1;
  if (closed) {
    ctx.font = `700 100px ${FONT}`;
    const w100 = ctx.measureText(text).width || 1;
    const font = Math.max(lw * 3, Math.min(b.h * 0.75, ((b.w * 0.85) / w100) * 100) * Math.min(1, 0.6 + size * 0.4));
    ctx.font = `700 ${font.toFixed(1)}px ${FONT}`;
    ctx.fillText(text, (b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2 + font * 0.04);
    ctx.shadowBlur = 0;
    outlineAt(ctx, pts, true, 0.35, lw * 0.6);
    return;
  }
  const samples = resample(pts, false, 3);
  const { p } = at(samples, (samples[samples.length - 1]?.d ?? 0) / 2);
  const font = lw * 7;
  ctx.font = `700 ${font.toFixed(1)}px ${FONT}`;
  ctx.fillText(text, p.x, p.y - font * 0.7);
  ctx.shadowBlur = 0;
  outlineAt(ctx, pts, false, 0.5, lw);
}
