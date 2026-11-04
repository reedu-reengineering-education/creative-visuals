import type { ColorSpec, Direction, EffectParams, EffectType } from "./types";
import type { TKey } from "./i18n";

/** Pen colours = groups. Muted, distinct in hue and lightness. */
export const GROUP_COLORS: { color: string; nameKey: TKey }[] = [
  { color: "#E9E7E1", nameKey: "group.white" },
  { color: "#7FB2F0", nameKey: "group.blue" },
  { color: "#A6D07A", nameKey: "group.green" },
  { color: "#F2A766", nameKey: "group.orange" },
  { color: "#E79BC4", nameKey: "group.pink" },
  { color: "#EBD27A", nameKey: "group.yellow" },
  { color: "#B59CF0", nameKey: "group.violet" },
  { color: "#7FD8D2", nameKey: "group.cyan" },
  { color: "#EE8E86", nameKey: "group.red" },
];

/** Light colours the kids can choose for effects. */
export const LIGHT_COLORS: { value: string; key: TKey }[] = [
  { value: "#FFD98A", key: "color.warm" },
  { value: "#FFFFFF", key: "color.white" },
  { value: "#FF6B5E", key: "color.red" },
  { value: "#FFA24D", key: "color.orange" },
  { value: "#FFE45C", key: "color.yellow" },
  { value: "#7CF29A", key: "color.green" },
  { value: "#5CE6E0", key: "color.cyan" },
  { value: "#5C9DFF", key: "color.blue" },
  { value: "#B07CFF", key: "color.violet" },
  { value: "#FF7CC8", key: "color.pink" },
];

/**
 * Every colour the kids can pick: the light colours plus black ("no light"),
 * e.g. to mask parts of other shapes with "Füllen". Black is not part of
 * LIGHT_COLORS, which also feeds random colours and particles.
 */
export const PICK_COLORS: { value: string; key: TKey }[] = [...LIGHT_COLORS, { value: "#000000", key: "color.black" }];

export const SPECIAL_COLORS: { value: ColorSpec; key: TKey }[] = [
  { value: "rainbow", key: "color.rainbow" },
  { value: "group", key: "color.group" },
  { value: "random", key: "color.random" },
];

export type EffectCategory = "line" | "light" | "area" | "particles" | "psy" | "tech" | "text";

export const EFFECT_CATEGORIES: { value: EffectCategory; key: TKey }[] = [
  { value: "line", key: "fxcat.line" },
  { value: "light", key: "fxcat.light" },
  { value: "area", key: "fxcat.area" },
  { value: "particles", key: "fxcat.particles" },
  { value: "psy", key: "fxcat.psy" },
  { value: "tech", key: "fxcat.tech" },
  { value: "text", key: "fxcat.text" },
];

export interface EffectDef {
  value: EffectType;
  key: TKey;
  category: EffectCategory;
  /** settings that change something for this effect (shown in the settings popup) */
  uses: ParamKey[];
  /** directions it understands; the first one is its default */
  dirs?: Direction[];
  /** speed limit for effects that flash, so they stay below ~3 flashes per second */
  maxSpeed?: number;
  /** shown under the settings, e.g. how to feed a data effect with sensor values in code */
  hint?: TKey;
}

type ParamKey = keyof EffectParams;
const BASE: ParamKey[] = ["speed", "size", "brightness"];
const fx = (
  value: EffectType,
  category: EffectCategory,
  extra: ParamKey[] = [],
  more: Partial<Pick<EffectDef, "dirs" | "maxSpeed" | "hint">> & { base?: ParamKey[] } = {},
): EffectDef => ({
  value,
  key: `effect.${value}` as TKey,
  category,
  uses: [...(more.base ?? BASE), ...extra, ...(more.dirs ? (["dir"] as ParamKey[]) : [])],
  dirs: more.dirs,
  maxSpeed: more.maxSpeed,
  hint: more.hint,
});

const H: Direction[] = ["right", "left"];
const HV: Direction[] = ["right", "left", "up", "down"];

export const EFFECTS: EffectDef[] = [
  fx("line", "line", [], { base: ["size", "brightness"] }),
  fx("chase", "line", [], { dirs: H }),
  fx("draw", "line", [], { dirs: H }),
  fx("wobble", "line"),
  fx("shake", "line"),
  fx("glow", "light"),
  fx("blink", "light", [], { maxSpeed: 2 }),
  fx("neon", "light", [], { maxSpeed: 1.5 }),
  fx("echo", "light", [], { dirs: ["out", "in"] }),
  fx("heartbeat", "light"),
  fx("off", "light", [], { base: [] }),
  fx("fill", "area", [], { base: ["speed", "brightness"] }),
  fx("radial", "area"),
  fx("level", "area", [], { base: ["speed", "brightness"], dirs: ["up", "down", "right", "left"], hint: "hint.level" }),
  fx("stripes", "area", ["color2"], { dirs: HV }),
  fx("gradient", "area", ["color2"], { dirs: HV }),
  fx("sparkle", "particles", ["amount"]),
  fx("confetti", "particles", ["color2", "amount"]),
  fx("bubbles", "particles", ["amount"], { dirs: ["up", "down"] }),
  fx("fireworks", "particles", ["color2", "amount"]),
  fx("disco", "particles", ["amount"]),
  fx("flow", "psy", [], { dirs: H }),
  fx("spiral", "psy", ["color2"], { dirs: H }),
  fx("plasma", "psy", ["color2"]),
  fx("glitch", "tech", [], { maxSpeed: 2 }),
  fx("scan", "tech", [], { dirs: HV }),
  fx("matrix", "tech", ["amount"], { dirs: ["down", "up"] }),
  fx("grid", "tech", [], { dirs: HV }),
  fx("radar", "tech", [], { dirs: H }),
  fx("pixel", "tech", ["color2", "amount"]),
  fx("text", "text", ["text"], { dirs: ["left", "right"], hint: "hint.text" }),
  fx("banner", "text", ["text", "color2"], { dirs: ["up", "down"], hint: "hint.text" }),
  fx("number", "text", ["source"], { base: ["size", "brightness"], hint: "hint.number" }),
  fx("graph", "text", [], { base: ["size", "brightness"], hint: "hint.graph" }),
];

export function effectDef(effect: EffectType): EffectDef | undefined {
  return EFFECTS.find((e) => e.value === effect);
}

/** Deterministic pseudo-random number in 0..1 for a seed. */
export function hash01(seed: number): number {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

export function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Resolve a ColorSpec to a CSS colour for one stroke. */
export function resolveColor(
  spec: ColorSpec,
  index: number,
  count: number,
  groupColor: string,
  strokeId: string,
): string {
  if (spec === "rainbow") {
    const hue = count <= 1 ? 0 : (index / count) * 300;
    return `hsl(${hue.toFixed(0)} 95% 65%)`;
  }
  if (spec === "group") return groupColor;
  if (spec === "random") {
    const c = LIGHT_COLORS[hashString(strokeId) % LIGHT_COLORS.length];
    return c.value;
  }
  return spec;
}

/* ---------- colour helpers (for effects that mix or shift colours) ---------- */

export interface RGB {
  r: number;
  g: number;
  b: number;
}

function hslToRgb(h: number, s: number, l: number): RGB {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return 255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)));
  };
  return { r: f(0), g: f(8), b: f(4) };
}

/** Parse the colours this app produces: #rgb, #rrggbb, rgb()/rgba() and hsl(h s% l%). */
export function parseColor(css: string): RGB {
  const hex = css.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    const v = hex[1].length === 3 ? hex[1].replace(/./g, (c) => c + c) : hex[1];
    return { r: parseInt(v.slice(0, 2), 16), g: parseInt(v.slice(2, 4), 16), b: parseInt(v.slice(4, 6), 16) };
  }
  const rgb = css.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i);
  if (rgb) return { r: Number(rgb[1]), g: Number(rgb[2]), b: Number(rgb[3]) };
  const hsl = css.match(/^hsla?\(\s*([\d.]+)[\s,]+([\d.]+)%[\s,]+([\d.]+)%/i);
  if (hsl) return hslToRgb(Number(hsl[1]) % 360, Number(hsl[2]) / 100, Number(hsl[3]) / 100);
  return { r: 255, g: 255, b: 255 };
}

export function hueOf(css: string): number {
  const { r, g, b } = parseColor(css);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return 0;
  const d = max - min;
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return h * 60;
}

export const rgbCss = ({ r, g, b }: RGB, a = 1) =>
  `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${a})`;

/** Hue, saturation, lightness (0..360, 0..1, 0..1) of a colour. */
function hslOf(css: string): { h: number; s: number; l: number } {
  const { r, g, b } = parseColor(css);
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  return { h: hueOf(css), s, l };
}

/**
 * Blend two colours through the rainbow instead of mixing them like paint:
 * blue → red goes via cyan, green and yellow, like a thermometer scale.
 * Hues are unwrapped so the blend never crosses magenta (~300°); pink counts
 * as the red end. Grey/white take the hue of the other colour.
 */
export function blendHue(a: string, b: string, f: number): string {
  const x = hslOf(a);
  const y = hslOf(b);
  const unwrap = (h: number) => (h >= 300 ? h - 360 : h);
  const hx = unwrap(x.s < 0.05 ? y.h : x.h);
  const hy = unwrap(y.s < 0.05 ? x.h : y.h);
  const h = (hx + (hy - hx) * f + 360) % 360;
  const s = x.s + (y.s - x.s) * f;
  const l = x.l + (y.l - x.l) * f;
  return `hsl(${h.toFixed(0)} ${(s * 100).toFixed(0)}% ${(l * 100).toFixed(0)}%)`;
}


/** The same colour with its hue turned by `deg` (bright, saturated). */
export function shiftHue(css: string, deg: number): string {
  return `hsl(${((hueOf(css) + deg) % 360 + 360) % 360} 95% 65%)`;
}
