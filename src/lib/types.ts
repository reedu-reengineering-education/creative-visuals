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
  | "water"
  | "sparkle"
  | "wobble"
  | "draw"
  | "radial"
  | "depth"
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
  | "breathe"
  | "heartbeat"
  | "shake"
  | "bubbles"
  | "fireworks"
  | "gradient"
  | "text"
  | "number"
  | "off";

/** A colour choice: a CSS colour, or a special value resolved per stroke. */
export type ColorSpec = string | "rainbow" | "group" | "random";

export type Sequence = "together" | "sequential";

export interface EffectAssignment {
  effect: EffectType;
  color: ColorSpec;
  sequence: Sequence;
}

export type Aspect = "16:9" | "16:10" | "4:3";

export interface Project {
  version: 1;
  aspect: Aspect;
  groups: Group[];
  strokes: Stroke[];
  /** Effect for every stroke of a group. */
  groupEffects: Record<string, EffectAssignment>;
  /** Overrides for single strokes ("nur für Nr. 3"). */
  strokeEffects: Record<string, EffectAssignment>;
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
  /** for the "text" effect */
  text?: string;
  /** for the "number" effect: a sensor channel id, "timer" or "clock" */
  source?: string;
}

export type Mode = "draw" | "effects" | "code" | "show";
