/** A point in stage space. Both axes are normalised to 0..1. */
export interface Point {
  x: number;
  y: number;
}

/** One traced line or shape. Its group is the pen colour it was drawn with. */
export interface Stroke {
  id: string;
  groupId: string;
  points: Point[];
  /** Closed strokes are shapes that can be filled (windows, books, …). */
  closed: boolean;
  /** Layer: higher is drawn on top. Independent of the number in its group (= drawing order). */
  z?: number;
}

/** A group = one pen colour. Kids name it themselves ("Bücher", "Stufen", …). */
export interface Group {
  id: string;
  name: string;
  color: string;
}

export type EffectType =
  | "line"
  | "glow"
  | "blink"
  | "chase"
  | "fill"
  | "sparkle"
  | "wobble"
  | "draw"
  | "radial"
  | "neon"
  | "echo"
  | "stripes"
  | "confetti"
  | "flow"
  | "spiral"
  | "plasma"
  | "disco"
  | "glitch"
  | "scan"
  | "matrix"
  | "grid"
  | "radar"
  | "pixel"
  | "heartbeat"
  | "shake"
  | "bubbles"
  | "fireworks"
  | "gradient"
  | "text"
  | "banner"
  | "number"
  | "level"
  | "graph"
  | "off";

/** A colour choice: a CSS colour, or a special value resolved per stroke. */
export type ColorSpec = string | "rainbow" | "group" | "random";

export type Sequence = "together" | "sequential";

export type Aspect = "16:9" | "16:10" | "4:3";

export interface Project {
  version: 1;
  aspect: Aspect;
  groups: Group[];
  strokes: Stroke[];
  /** Blockly workspace state (serialisation JSON). */
  program: unknown | null;
}

/** What a running program sets on a stroke. `since` is an epoch timestamp (ms). */
export interface RuntimeOverride {
  effect: EffectType;
  color: ColorSpec;
  since: number;
  /** "one by one": every stroke of the group starts a little later than the one before */
  sequence?: Sequence;
  /** effect settings (speed, size, …); missing keys use the defaults */
  params?: EffectParams;
}

export type Direction = "right" | "left" | "up" | "down" | "in" | "out";

/** Settings of an effect. Every key is optional; see `src/lib/params.ts` for the defaults. */
export interface EffectParams {
  /** multiplier, 1 = normal */
  speed?: number;
  /** multiplier for line width, particles, text, 1 = normal */
  size?: number;
  /** 0..1 */
  brightness?: number;
  dir?: Direction;
  color2?: ColorSpec;
  /** for the text effects ("text", "banner") */
  text?: string;
  /** for the "number" effect: "timer" or "clock" (sensor values are shown with "Zeige …" in code) */
  source?: string;
  /** set by the program ("zeige …" block): what the "number" effect shows, overrides `source` */
  value?: string;
  /** how many particles, 0..1 (0.5 = normal) */
  amount?: number;
  /** set by a "Verbinde … → Füllstand" link: fill level 0..1 (without it the shape fills by itself) */
  level?: number;
  /** set by a "Verbinde … → Kurve" link: recent values, 0..1, oldest first */
  series?: number[];
}

export type Mode = "draw" | "effects" | "code" | "show";
