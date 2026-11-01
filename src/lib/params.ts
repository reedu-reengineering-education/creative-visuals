/**
 * Effect settings ("params"): speed, size, brightness, direction, a second
 * colour, and the content of text and number effects.
 *
 * In the program they live in the `SET` field of the effect blocks as a small
 * JSON string. Only values that differ from the defaults are stored, so an
 * untouched block has an empty `SET` and older projects need no migration.
 */
import type { TKey } from "./i18n";
import type { ColorSpec, Direction, EffectParams } from "./types";

export const SPEEDS: { value: number; key: TKey; icon: string }[] = [
  { value: 0.5, key: "param.speed.slow", icon: "🐢" },
  { value: 1, key: "param.speed.normal", icon: "" },
  { value: 2, key: "param.speed.fast", icon: "⚡" },
  { value: 3.5, key: "param.speed.turbo", icon: "🚀" },
];

export const SIZES: { value: number; label: string }[] = [
  { value: 0.6, label: "S" },
  { value: 1, label: "M" },
  { value: 1.6, label: "L" },
  { value: 2.4, label: "XL" },
];

export const BRIGHTNESS: number[] = [0.25, 0.5, 0.75, 1];

export const DIRECTIONS: { value: Direction; key: TKey; arrow: string }[] = [
  { value: "right", key: "param.dir.right", arrow: "→" },
  { value: "left", key: "param.dir.left", arrow: "←" },
  { value: "up", key: "param.dir.up", arrow: "↑" },
  { value: "down", key: "param.dir.down", arrow: "↓" },
  { value: "out", key: "param.dir.out", arrow: "↔" },
  { value: "in", key: "param.dir.in", arrow: "→←" },
];

/** Number sources that work without a sensor. */
export const TIMER = "timer";
export const CLOCK = "clock";

const DIRS = new Set<string>(DIRECTIONS.map((d) => d.value));

const finite = (v: unknown): number | undefined => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) ? n : undefined;
};

/** Read params from a block field (JSON string) or a stored object. Unknown or broken values are dropped. */
export function parseParams(v: unknown): EffectParams {
  let o: unknown = v;
  if (typeof v === "string") {
    if (!v.trim()) return {};
    try {
      o = JSON.parse(v);
    } catch {
      return {};
    }
  }
  if (!o || typeof o !== "object") return {};
  const r = o as Record<string, unknown>;
  const p: EffectParams = {};
  const speed = finite(r.speed);
  if (speed !== undefined) p.speed = Math.min(5, Math.max(0.1, speed));
  const size = finite(r.size);
  if (size !== undefined) p.size = Math.min(4, Math.max(0.2, size));
  const brightness = finite(r.brightness);
  if (brightness !== undefined) p.brightness = Math.min(1, Math.max(0, brightness));
  if (typeof r.dir === "string" && DIRS.has(r.dir)) p.dir = r.dir as Direction;
  if (typeof r.color2 === "string" && r.color2) p.color2 = r.color2 as ColorSpec;
  if (typeof r.text === "string" && r.text) p.text = r.text.slice(0, 120);
  if (typeof r.source === "string" && r.source) p.source = r.source;
  return p;
}

/** Drop everything that equals the default. */
export function cleanParams(p: EffectParams | undefined): EffectParams {
  const out: EffectParams = {};
  if (!p) return out;
  if (p.speed !== undefined && p.speed !== 1) out.speed = p.speed;
  if (p.size !== undefined && p.size !== 1) out.size = p.size;
  if (p.brightness !== undefined && p.brightness !== 1) out.brightness = p.brightness;
  if (p.dir) out.dir = p.dir;
  if (p.color2) out.color2 = p.color2;
  if (p.text) out.text = p.text;
  if (p.source) out.source = p.source;
  return out;
}

/** Stable string form for the block field ("" = all defaults). */
export function encodeParams(p: EffectParams | undefined): string {
  const c = cleanParams(p);
  const keys = Object.keys(c).sort() as (keyof EffectParams)[];
  if (!keys.length) return "";
  const sorted: Record<string, unknown> = {};
  for (const k of keys) sorted[k] = c[k];
  return JSON.stringify(sorted);
}

export function sameParams(a: EffectParams | undefined, b: EffectParams | undefined): boolean {
  return encodeParams(a) === encodeParams(b);
}

export function hasParams(p: EffectParams | undefined): boolean {
  return encodeParams(p) !== "";
}
