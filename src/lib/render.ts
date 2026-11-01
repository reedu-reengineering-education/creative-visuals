import { labelPoint, layerOrder, pathLength, pointAlong, bounds } from "./geometry";
import { DEFAULT_EFFECT, EFFECTS, hash01, hashString, resolveColor, type EffectDef } from "./palette";
import { CLOCK, TIMER } from "./params";
import { allChannels } from "./sensors";
import * as fx from "./fx";
import type { EffectAssignment, EffectParams, EffectType, Point, Project, RuntimeOverride, Stroke } from "./types";

export type View = "draw" | "effects" | "light";

export interface RenderOptions {
  project: Project;
  overrides: Record<string, RuntimeOverride>;
  running: boolean;
  view: View;
  width: number;
  height: number;
  now: number;
  selectedId?: string | null;
  draft?: Point[] | null;
  draftColor?: string;
  cursor?: Point | null;
  cursorColor?: string;
  /** hide number badges, e.g. in the small preview */
  badges?: boolean;
  /** strokes to mark (e.g. the group of the selected timeline row) */
  highlightIds?: string[];
  /** live sensor values, for the "number" effect */
  sensors?: Record<string, number>;
}

interface Resolved {
  effect: EffectType;
  color: string;
  /** effect time in seconds: real seconds since the start × speed */
  t: number;
  params: EffectParams;
  color2: string | null;
  /** what a text or number effect shows */
  text: string;
}

const DEFS = new Map<EffectType, EffectDef>(EFFECTS.map((e) => [e.value, e]));
const NO_PARAMS: EffectParams = {};

const STAGGER = 0.3; // seconds between strokes for "one by one"

function toPx(p: Point, w: number, h: number) {
  return { x: p.x * w, y: p.y * h };
}

function tracePath(ctx: CanvasRenderingContext2D, s: Stroke, w: number, h: number) {
  ctx.beginPath();
  s.points.forEach((p, i) => {
    const q = toPx(p, w, h);
    if (i === 0) ctx.moveTo(q.x, q.y);
    else ctx.lineTo(q.x, q.y);
  });
  if (s.closed) ctx.closePath();
}

/** Which effect does a stroke show right now? */
function resolve(
  o: RenderOptions,
  s: Stroke,
  index: number,
  count: number,
  groupColor: string,
): Resolved {
  const nowS = o.now / 1000;
  const ov = o.running ? o.overrides[s.id] : undefined;
  if (ov) {
    const color = resolveColor(ov.color, index, count, groupColor, s.id);
    const params = ov.params ?? NO_PARAMS;
    let t = (o.now - ov.since) / 1000;
    if (ov.sequence === "sequential") {
      t -= index * STAGGER;
      if (t < 0) return { effect: "off", color, t: 0, params, color2: null, text: "" };
    }
    t = Math.max(0, t);
    const def = DEFS.get(ov.effect);
    const speed = Math.min(params.speed ?? 1, def?.maxSpeed ?? Infinity);
    return {
      effect: ov.effect,
      color,
      t: t * speed,
      params,
      color2: params.color2 ? resolveColor(params.color2, index, count, groupColor, s.id) : null,
      text: contentOf(o, ov.effect, params, t),
    };
  }
  const a: EffectAssignment =
    o.project.strokeEffects[s.id] ?? o.project.groupEffects[s.groupId] ?? DEFAULT_EFFECT;
  const color = resolveColor(a.color, index, count, groupColor, s.id);
  const rest = { params: NO_PARAMS, color2: null, text: contentOf(o, a.effect, NO_PARAMS, nowS) };
  if (a.sequence === "sequential") {
    // loop: one after another, hold, start again
    const cycle = count * STAGGER + 3;
    const local = (nowS % cycle) - index * STAGGER;
    if (a.effect === "fill" || a.effect === "water") {
      return { effect: local < 0 ? "off" : a.effect, color, t: Math.max(0, local), ...rest };
    }
    return { effect: a.effect, color, t: nowS - index * STAGGER, ...rest };
  }
  return { effect: a.effect, color, t: nowS, ...rest };
}

const two = (n: number) => String(n).padStart(2, "0");

/** The text a text or number effect shows. `seconds` = real seconds since the effect started. */
function contentOf(o: RenderOptions, effect: EffectType, p: EffectParams, seconds: number): string {
  if (effect === "text") return p.text?.trim() || "✨";
  if (effect !== "number") return "";
  const source = p.source ?? TIMER;
  if (source === TIMER) return String(Math.floor(seconds));
  if (source === CLOCK) {
    const d = new Date(o.now);
    return `${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())}`;
  }
  const v = o.sensors?.[source];
  const unit = allChannels().find((c) => c.id === source)?.unit ?? "";
  if (v === undefined || !Number.isFinite(v)) return `– ${unit}`.trim();
  const digits = Math.abs(v) >= 100 ? 0 : 1;
  return `${v.toFixed(digits)} ${unit}`.trim();
}

function drawEffect(
  ctx: CanvasRenderingContext2D,
  s: Stroke,
  r: Resolved,
  w: number,
  h: number,
  lw: number,
) {
  const { effect, color, t, params } = r;
  if (effect === "off") return;
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = color;
  ctx.fillStyle = color;

  const outline = (alpha: number, width = lw) => {
    ctx.globalAlpha = alpha;
    ctx.lineWidth = width;
    tracePath(ctx, s, w, h);
    ctx.stroke();
  };

  const dir = params.dir ?? DEFS.get(effect)?.dirs?.[0];
  const args = (): fx.FxArgs => ({
    ctx,
    pts: s.points.map((p) => toPx(p, w, h)),
    closed: s.closed,
    color,
    t,
    lw,
    size: params.size ?? 1,
    seed: hashString(s.id) % 997,
    color2: r.color2,
    dir,
    text: r.text,
  });

  switch (effect) {
    case "line":
      outline(1);
      break;

    case "wobble":
      fx.wobble(args());
      break;
    case "draw": {
      const a = args();
      fx.drawOn(dir === "left" ? { ...a, pts: [...a.pts].reverse() } : a);
      break;
    }
    case "radial":
      fx.radial(args());
      break;
    case "depth":
      fx.depth(args());
      break;
    case "neon":
      fx.neon(args());
      break;
    case "echo":
      fx.echo(args());
      break;
    case "stripes":
      fx.stripes(args());
      break;
    case "confetti":
      fx.confetti(args());
      break;
    case "flow":
      fx.flow(args());
      break;
    case "spiral":
      fx.spiral(args());
      break;
    case "plasma":
      fx.plasma(args());
      break;
    case "disco":
      fx.disco(args());
      break;
    case "glitch":
      fx.glitch(args());
      break;
    case "scan":
      fx.scan(args());
      break;
    case "matrix":
      fx.matrix(args());
      break;
    case "grid":
      fx.grid(args());
      break;
    case "radar":
      fx.radar(args());
      break;
    case "pixel":
      fx.pixel(args());
      break;
    case "breathe":
      fx.breathe(args());
      break;
    case "heartbeat":
      fx.heartbeat(args());
      break;
    case "shake":
      fx.shake(args());
      break;
    case "bubbles":
      fx.bubbles(args());
      break;
    case "fireworks":
      fx.fireworks(args());
      break;
    case "gradient":
      fx.gradient(args());
      break;
    case "text":
      fx.ticker(args());
      break;
    case "number":
      fx.bigNumber(args());
      break;

    case "glow": {
      const pulse = 0.72 + 0.28 * Math.sin(t * 2.4);
      ctx.shadowColor = color;
      ctx.shadowBlur = lw * 7;
      if (s.closed) {
        ctx.globalAlpha = 0.4 * pulse;
        tracePath(ctx, s, w, h);
        ctx.fill();
      }
      outline(pulse, lw * 1.5);
      break;
    }

    case "blink": {
      const on = Math.floor(t * 2) % 2 === 0;
      if (on) {
        ctx.shadowColor = color;
        ctx.shadowBlur = lw * 5;
        if (s.closed) {
          ctx.globalAlpha = 0.9;
          tracePath(ctx, s, w, h);
          ctx.fill();
        }
        outline(1, lw * 1.4);
      } else {
        outline(0.12);
      }
      break;
    }

    case "chase": {
      outline(0.18);
      ctx.shadowColor = color;
      ctx.shadowBlur = lw * 5;
      ctx.setLineDash([lw * 6, lw * 9]);
      ctx.lineDashOffset = (dir === "left" ? 1 : -1) * t * lw * 30;
      outline(1, lw * 1.8);
      break;
    }

    case "fill": {
      const a = Math.min(1, t / 0.5);
      ctx.shadowColor = color;
      ctx.shadowBlur = lw * 4;
      if (s.closed) {
        ctx.globalAlpha = a;
        tracePath(ctx, s, w, h);
        ctx.fill();
        outline(a);
      } else {
        outline(a, lw * 3);
      }
      break;
    }

    case "water": {
      if (!s.closed) {
        // lines can't hold water – let it flow along instead
        drawEffect(ctx, s, { ...r, effect: "chase" }, w, h, lw);
        break;
      }
      const b = bounds(s.points);
      const top = b.minY * h;
      const bottom = b.maxY * h;
      const left = b.minX * w;
      const right = b.maxX * w;
      const level = Math.min(1, t / 2.5) * 0.9 + Math.sin(t * 1.5) * 0.02;
      const waterY = bottom - (bottom - top) * level;
      const amp = Math.max(2, (bottom - top) * 0.03);
      ctx.save();
      tracePath(ctx, s, w, h);
      ctx.clip();
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.moveTo(left - 2, bottom + 2);
      const steps = 24;
      for (let i = 0; i <= steps; i++) {
        const x = left + ((right - left) * i) / steps;
        const y = waterY + Math.sin(i / 3 + t * 3) * amp;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(right + 2, bottom + 2);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      outline(0.5);
      break;
    }

    case "sparkle": {
      outline(0.22);
      const len = pathLength(s.points.map((p) => ({ x: p.x * w, y: p.y * h })));
      const n = Math.max(4, Math.min(30, Math.round(len / (lw * 10))));
      const seed = hashString(s.id) % 1000;
      ctx.shadowColor = color;
      ctx.shadowBlur = lw * 3;
      for (let k = 0; k < n; k++) {
        const period = 1.1 + hash01(seed + k * 3.1) * 0.8;
        const local = t + hash01(seed + k) * period;
        const cycleNo = Math.floor(local / period);
        const phase = (local % period) / period;
        const p = toPx(pointAlong(s, hash01(seed + k * 7 + cycleNo * 13.7)), w, h);
        const size = lw * 2.6 * Math.sin(phase * Math.PI);
        if (size <= 0.3) continue;
        ctx.globalAlpha = Math.sin(phase * Math.PI);
        ctx.lineWidth = Math.max(1, lw * 0.6);
        ctx.beginPath();
        ctx.moveTo(p.x - size, p.y);
        ctx.lineTo(p.x + size, p.y);
        ctx.moveTo(p.x, p.y - size);
        ctx.lineTo(p.x, p.y + size);
        ctx.stroke();
      }
      break;
    }
  }
  ctx.restore();
}

function drawBadge(ctx: CanvasRenderingContext2D, s: Stroke, nr: number, color: string, w: number, h: number, selected: boolean) {
  const p = toPx(labelPoint(s), w, h);
  const r = Math.max(9, h * 0.016);
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.fillStyle = selected ? "#6EE7C8" : color;
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#0B0C0E";
  ctx.font = `600 ${Math.round(r * 1.05)}px Lexend, system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(nr), p.x, p.y + r * 0.06);
  ctx.restore();
}

let scratch: HTMLCanvasElement | null = null;

/**
 * An empty canvas the size of the stage, with the same transform. Dimmed
 * strokes are drawn here and then copied over with lower opacity: on a black
 * wall less opacity = less light, and it also dims the white highlights and
 * multi-colour particles inside the effects.
 */
function dimLayer(ctx: CanvasRenderingContext2D): CanvasRenderingContext2D | null {
  if (typeof document === "undefined") return null;
  scratch ??= document.createElement("canvas");
  const { width, height } = ctx.canvas;
  if (scratch.width !== width || scratch.height !== height) {
    scratch.width = width;
    scratch.height = height;
  }
  const l = scratch.getContext("2d");
  if (!l) return null;
  l.setTransform(1, 0, 0, 1, 0, 0);
  l.globalAlpha = 1;
  l.globalCompositeOperation = "source-over";
  l.clearRect(0, 0, width, height);
  l.setTransform(ctx.getTransform());
  return l;
}

/** Draw the whole stage. The context must already be scaled to CSS pixels. */
export function renderStage(ctx: CanvasRenderingContext2D, o: RenderOptions) {
  const { width: w, height: h, project } = o;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, w, h);

  const lw = Math.max(2, h * 0.0055);
  const groupColor = new Map(project.groups.map((g) => [g.id, g.color]));
  const counters = new Map<string, number>();
  const totals = new Map<string, number>();
  for (const s of project.strokes) totals.set(s.groupId, (totals.get(s.groupId) ?? 0) + 1);
  const indexOf = new Map<string, number>();
  for (const s of project.strokes) {
    const i = counters.get(s.groupId) ?? 0;
    indexOf.set(s.id, i);
    counters.set(s.groupId, i + 1);
  }

  const layered = layerOrder(project.strokes);

  if (o.view === "draw") {
    for (const s of layered) {
      ctx.save();
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = groupColor.get(s.groupId) ?? "#fff";
      ctx.shadowColor = "rgba(255,245,225,0.35)";
      ctx.shadowBlur = lw * 2;
      ctx.lineWidth = lw;
      tracePath(ctx, s, w, h);
      ctx.stroke();
      ctx.restore();
    }
  } else {
    if (o.view === "effects") {
      // faint guides so invisible ("off") strokes can still be tapped
      for (const s of layered) {
        ctx.save();
        ctx.globalAlpha = 0.22;
        ctx.strokeStyle = groupColor.get(s.groupId) ?? "#fff";
        ctx.lineWidth = lw * 0.6;
        ctx.setLineDash([lw * 1.5, lw * 2]);
        tracePath(ctx, s, w, h);
        ctx.stroke();
        ctx.restore();
      }
    }
    // strokes with the same brightness are drawn together; dimmed runs go through a layer
    let run: { s: Stroke; r: Resolved }[] = [];
    let runBrightness = 1;
    const flushRun = () => {
      if (!run.length) return;
      const target = (runBrightness < 1 && dimLayer(ctx)) || ctx;
      for (const { s, r } of run) drawEffect(target, s, r, w, h, lw * (r.params.size ?? 1));
      if (target !== ctx) {
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = runBrightness;
        ctx.drawImage(target.canvas, 0, 0);
        ctx.restore();
      }
      run = [];
    };
    for (const s of layered) {
      const r = resolve(o, s, indexOf.get(s.id) ?? 0, totals.get(s.groupId) ?? 1, groupColor.get(s.groupId) ?? "#fff");
      if (r.effect === "off") continue;
      const b = r.params.brightness ?? 1;
      if (b !== runBrightness) {
        flushRun();
        runBrightness = b;
      }
      run.push({ s, r });
    }
    flushRun();
  }

  // selection
  if (o.selectedId) {
    const s = project.strokes.find((x) => x.id === o.selectedId);
    if (s) {
      ctx.save();
      ctx.strokeStyle = "#6EE7C8";
      ctx.shadowColor = "rgba(110,231,200,0.7)";
      ctx.shadowBlur = lw * 4;
      ctx.lineWidth = lw * 1.3;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      tracePath(ctx, s, w, h);
      ctx.stroke();
      const b = bounds(s.points);
      const pad = lw * 4;
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 0.6;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 6]);
      ctx.strokeRect(b.minX * w - pad, b.minY * h - pad, (b.maxX - b.minX) * w + pad * 2, (b.maxY - b.minY) * h + pad * 2);
      ctx.restore();
    }
  }

  // marked strokes (selected timeline row)
  if (o.highlightIds?.length) {
    ctx.save();
    ctx.strokeStyle = "#6EE7C8";
    ctx.globalAlpha = 0.85;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 5]);
    for (const id of o.highlightIds) {
      const s = project.strokes.find((x) => x.id === id);
      if (!s) continue;
      const b = bounds(s.points);
      const pad = lw * 3;
      ctx.strokeRect(b.minX * w - pad, b.minY * h - pad, (b.maxX - b.minX) * w + pad * 2, (b.maxY - b.minY) * h + pad * 2);
    }
    ctx.restore();
  }

  // number badges (only for groups with more than one stroke)
  if (o.view !== "light" && o.badges !== false) {
    for (const s of project.strokes) {
      if ((totals.get(s.groupId) ?? 0) < 2) continue;
      drawBadge(ctx, s, (indexOf.get(s.id) ?? 0) + 1, groupColor.get(s.groupId) ?? "#fff", w, h, s.id === o.selectedId);
    }
  }

  // stroke being drawn
  if (o.draft && o.draft.length > 1) {
    ctx.save();
    ctx.strokeStyle = o.draftColor ?? "#fff";
    ctx.lineWidth = lw;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    o.draft.forEach((p, i) => {
      const q = toPx(p, w, h);
      if (i === 0) ctx.moveTo(q.x, q.y);
      else ctx.lineTo(q.x, q.y);
    });
    ctx.stroke();
    ctx.restore();
  }

  // finger dot – shows on the wall where the finger is
  if (o.cursor) {
    const p = toPx(o.cursor, w, h);
    const r = Math.max(8, h * 0.016);
    ctx.save();
    ctx.fillStyle = o.cursorColor ?? "#6EE7C8";
    ctx.globalAlpha = 0.2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r * 2.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}
