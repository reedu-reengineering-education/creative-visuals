import type { ColorSpec, EffectParams, EffectType, Sequence } from "./types";

/** The program the blocks compile to. Plain JSON so it can be stored and sent around. */

export type Target =
  | { kind: "all" }
  | { kind: "group"; groupId: string }
  | { kind: "item"; groupId: string; nr: number }
  | { kind: "this" };

/** A value: numbers, variables, sensor readings and what you can compute from them. */
export type Expr =
  | { k: "num"; v: number }
  | { k: "var"; id: string }
  | { k: "sensor"; sensor: string }
  | { k: "random"; min: Expr; max: Expr }
  | { k: "arith"; op: "+" | "-" | "*" | "/"; a: Expr; b: Expr }
  | { k: "cmp"; op: ">" | "<" | "="; a: Expr; b: Expr }
  | { k: "logic"; op: "and" | "or"; a: Expr; b: Expr }
  | { k: "not"; a: Expr }
  /** a piece of text */
  | { k: "text"; v: string }
  /** text glued together from pieces (text, numbers, readings …), see `joinText` */
  | { k: "join"; parts: Expr[] };

/** The effects that can show a value or a text built in code ("Zeige … als …"). */
export const SHOW_EFFECTS = ["number", "text", "banner"] as const;
export type ShowEffect = (typeof SHOW_EFFECTS)[number];

/**
 * Glue text pieces together. Kids can't see spaces at the end of a text
 * field, so a space is put between two pieces unless there already is one
 * or the next piece starts with punctuation: "Es ist" 21 "°C" → "Es ist 21 °C",
 * "Hallo" "!" → "Hallo!".
 */
export function joinText(parts: string[]): string {
  let out = "";
  for (const p of parts) {
    if (!p) continue;
    if (out && !/[\s(\[„]$/.test(out) && !/^[\s.,!?:;)\]“]/.test(p)) out += " ";
    out += p;
  }
  return out;
}

export type Stmt =
  | { k: "effect"; target: Target; effect: EffectType; color: ColorSpec; sequence?: Sequence; params?: EffectParams }
  | { k: "wait"; min: number; max: number }
  | { k: "waitUntil"; cond: Expr }
  | { k: "repeat"; times: number; body: Stmt[] }
  | { k: "repeatUntil"; cond: Expr; body: Stmt[] }
  | { k: "forever"; body: Stmt[] }
  | { k: "forEach"; groupId: string; body: Stmt[] }
  | { k: "if"; cond: Expr; body: Stmt[]; elseBody: Stmt[] }
  | { k: "setVar"; id: string; value: Expr }
  | { k: "changeVar"; id: string; by: Expr }
  /** show a value or text (live, it keeps updating) with a text effect on the shapes */
  | { k: "show"; target: Target; value: Expr; effect: ShowEffect; color: ColorSpec; params?: EffectParams }
  /**
   * A "dimmer": from now on the value keeps steering one setting of the
   * shapes, mapped from [inMin, inMax] to [from, to]. It changes whatever
   * effect is shown there instead of setting a new one.
   */
  | { k: "link"; target: Target; prop: LinkProp; value: Expr; inMin: number; inMax: number; from: LinkOut; to: LinkOut };

export type LinkProp = "speed" | "size" | "brightness" | "color" | "level" | "amount" | "graph";
/** a number (speed / size multiplier, brightness 0..1) or a CSS colour */
export type LinkOut = number | string;

/** The on-screen buttons ("1".."4", also keys 1–4). */
export const BUTTONS = ["1", "2", "3", "4"] as const;

export type Trigger =
  | { k: "start" }
  | { k: "key"; key: string }
  | { k: "button"; button: string }
  /** starts once each time the condition turns true */
  | { k: "when"; cond: Expr }
  /** runs while the condition is true; when it turns false the script stops and its effects disappear */
  | { k: "while"; cond: Expr };

export interface Script {
  id: string;
  trigger: Trigger;
  body: Stmt[];
  /** Timeline scripts started by an event disappear again when they are done. */
  clearOnEnd?: boolean;
  /** made by the timeline: each loop pass replays it like a video (effects start over) */
  timeline?: boolean;
}

/** Map a KeyboardEvent.key to the names used in the key block. */
export function normaliseKey(key: string): string | null {
  if (key === " " || key === "Spacebar") return "space";
  if (key === "ArrowLeft") return "left";
  if (key === "ArrowRight") return "right";
  if (key === "ArrowUp") return "up";
  if (key === "ArrowDown") return "down";
  if (/^[a-zA-Z0-9]$/.test(key)) return key.toLowerCase();
  return null;
}
