/**
 * Helpers for the Blockly serialisation JSON, without needing Blockly itself.
 * The project stores the program in this format; the timeline and the
 * interpreter both read it directly.
 */
import { parseParams } from "./params";
import {
  type Expr,
  type ShowEffect,
  type LinkOut,
  type LinkProp,
  type Script,
  type Stmt,
  type Target,
  type Trigger,
} from "./program";
import type { ColorSpec, EffectParams, EffectType, Sequence } from "./types";
import { KNOWN_CHANNELS } from "./sensors";

export const ALL = "__all";
export const THIS = "__this";

export interface BlockJson {
  type: string;
  id?: string;
  x?: number;
  y?: number;
  fields?: Record<string, unknown>;
  inputs?: Record<string, { block?: BlockJson; shadow?: BlockJson }>;
  next?: { block?: BlockJson };
  enabled?: boolean;
  disabledReasons?: string[];
  data?: string;
  [key: string]: unknown;
}

export interface ProgramJson {
  blocks?: { languageVersion?: number; blocks?: BlockJson[] };
  variables?: { name: string; id: string; type?: string }[];
  [key: string]: unknown;
}

export const HAT_TYPES = new Set(["lw_on_start", "lw_on_key", "lw_on_button", "lw_when", "lw_while"]);

/** The variables of a program (id + name), as Blockly stores them. */
export function variablesOf(program: unknown): { id: string; name: string }[] {
  const p = program as ProgramJson | null;
  return (p?.variables ?? []).map((v) => ({ id: v.id, name: v.name }));
}

export function topBlocks(program: unknown): BlockJson[] {
  const p = program as ProgramJson | null;
  return p?.blocks?.blocks ?? [];
}

export function isEnabled(b: BlockJson): boolean {
  if (b.enabled === false) return false;
  if (Array.isArray(b.disabledReasons) && b.disabledReasons.length) return false;
  return true;
}

const num = (v: unknown, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};
const str = (v: unknown, fallback = "") => (v === undefined || v === null ? fallback : String(v));

/** Statement chain starting at a block (follows `next`). */
export function chainOf(first: BlockJson | undefined): BlockJson[] {
  const out: BlockJson[] = [];
  for (let b = first; b; b = b.next?.block) out.push(b);
  return out;
}

export function triggerOf(hat: BlockJson): Trigger | null {
  switch (hat.type) {
    case "lw_on_start":
      return { k: "start" };
    case "lw_on_key":
      return { k: "key", key: str(hat.fields?.KEY, "space") };
    case "lw_on_button":
      return { k: "button", button: str(hat.fields?.BUTTON, "1") };
    case "lw_when":
      return { k: "when", cond: exprOf(inputBlock(hat, "COND"), FALSE) };
    case "lw_while":
      return { k: "while", cond: exprOf(inputBlock(hat, "COND"), FALSE) };
    default:
      return null;
  }
}

function targetOf(value: string): Target {
  if (value === ALL) return { kind: "all" };
  if (value === THIS) return { kind: "this" };
  return { kind: "group", groupId: value };
}

/** Id of a variable field (Blockly saves it as `{ id }`). */
function varId(v: unknown): string {
  if (v && typeof v === "object" && "id" in v) return String((v as { id: unknown }).id);
  return str(v);
}

/** What is plugged into a value input (or its shadow). */
function inputBlock(b: BlockJson, name: string): BlockJson | undefined {
  const i = b.inputs?.[name];
  const block = i?.block && isEnabled(i.block) ? i.block : undefined;
  return block ?? i?.shadow;
}

const LINK_PROPS = new Set<string>(["speed", "size", "brightness", "color", "level", "amount", "graph"]);

/** What "Setze [Tempo] von … auf ⟨…⟩" steers between: 0 → from, 100 (or the sensor's maximum) → to. */
export const SET_PROP_RANGE: Record<LinkProp, [LinkOut, LinkOut]> = {
  speed: [0.5, 3.5],
  size: [0.6, 2.4],
  brightness: [0, 1],
  level: [0, 1],
  amount: [0, 1],
  graph: [0, 1],
  // cold → warm, like a thermometer
  color: ["#5C9DFF", "#FF6B5E"],
};

/** Effects whose content comes from a slot on the effect block ("Laufschrift ⟨Hallo⟩"). */
export const SLOT_EFFECTS = new Set<string>(["text", "banner", "number"]);

/**
 * What is in the content slot of an effect block: nothing (or no slot: the
 * effect uses its settings), a fixed text (works like the text setting, so
 * the timeline can show it) or a live value (a reading, a variable, "Text aus …").
 */
export type EffectContent = { k: "none" } | { k: "text"; text: string } | { k: "value"; block: BlockJson };

export function effectContent(b: BlockJson): EffectContent {
  if (!SLOT_EFFECTS.has(str(b.fields?.EFFECT))) return { k: "none" };
  const v = inputBlock(b, "VALUE");
  if (!v) return { k: "none" };
  if (v.type === "lw_text") return { k: "text", text: str(v.fields?.TEXT) };
  return { k: "value", block: v };
}

const ZERO: Expr = { k: "num", v: 0 };
const FALSE: Expr = { k: "cmp", op: "=", a: { k: "num", v: 0 }, b: { k: "num", v: 1 } };

export function exprOf(b: BlockJson | undefined, fallback: Expr = ZERO): Expr {
  if (!b) return fallback;
  const f = b.fields ?? {};
  const arg = (name: string, fb: Expr = ZERO) => exprOf(inputBlock(b, name), fb);
  switch (b.type) {
    case "lw_num":
      return { k: "num", v: num(f.NUM, 0) };
    case "lw_var_get":
      return { k: "var", id: varId(f.VAR) };
    case "lw_sensor_value":
      return { k: "sensor", sensor: str(f.SENSOR, "temperature") };
    case "lw_random":
      return { k: "random", min: arg("MIN"), max: arg("MAX") };
    case "lw_arith": {
      const op = f.OP === "-" || f.OP === "*" || f.OP === "/" ? f.OP : "+";
      return { k: "arith", op, a: arg("A"), b: arg("B") };
    }
    case "lw_compare": {
      const op = f.OP === "<" || f.OP === "=" ? f.OP : ">";
      return { k: "cmp", op, a: arg("A"), b: arg("B") };
    }
    case "lw_logic":
      return { k: "logic", op: f.OP === "or" ? "or" : "and", a: arg("A", FALSE), b: arg("B", FALSE) };
    case "lw_not":
      return { k: "not", a: arg("A", FALSE) };
    case "lw_text":
      return { k: "text", v: str(f.TEXT) };
    case "lw_join": {
      const parts: Expr[] = [];
      for (let i = 0; i < joinItems(b); i++) {
        const part = inputBlock(b, `ITEM${i}`);
        if (part) parts.push(exprOf(part));
      }
      return { k: "join", parts };
    }
    default:
      return fallback;
  }
}

/** How many pieces a "Text aus …" block has (saved as extra state). */
export function joinItems(b: BlockJson): number {
  const items = Number((b.extraState as { items?: unknown } | undefined)?.items);
  return Number.isInteger(items) && items > 0 ? Math.min(items, 20) : 2;
}

function stmtOf(b: BlockJson): Stmt | null {
  const f = b.fields ?? {};
  const body = (name: string) => compileChain(b.inputs?.[name]?.block);
  const cond = (name: string) => exprOf(inputBlock(b, name), FALSE);
  switch (b.type) {
    case "lw_effect":
    case "lw_effect_one": {
      const target: Target =
        b.type === "lw_effect"
          ? targetOf(str(f.TARGET, ALL))
          : { kind: "item", groupId: str(f.GROUP), nr: Math.max(1, Math.round(num(f.NR, 1))) };
      const effect = str(f.EFFECT, "glow") as EffectType;
      const color = str(f.COLOR, "#FFD98A") as ColorSpec;
      const params = parseParams(f.SET);
      const content = effectContent(b);
      // a reading, a variable or "Text aus …" in the slot: shown live
      if (content.k === "value") {
        return { k: "show", target, value: exprOf(content.block), effect: effect as ShowEffect, color, params: showParams(params) };
      }
      if (content.k === "text") params.text = content.text.slice(0, 120);
      if (b.type === "lw_effect_one") return { k: "effect", target, effect, color, params };
      return { k: "effect", target, effect, color, sequence: f.SEQ === "sequential" ? "sequential" : "together", params };
    }
    case "lw_wait": {
      const s = num(f.SECONDS, 1);
      return { k: "wait", min: s, max: s };
    }
    case "lw_wait_random": {
      const a = num(f.MIN, 1);
      const c = num(f.MAX, 3);
      return { k: "wait", min: Math.min(a, c), max: Math.max(a, c) };
    }
    case "lw_repeat":
      return { k: "repeat", times: num(f.TIMES, 1), body: body("DO") };
    case "lw_forever":
      return { k: "forever", body: body("DO") };
    case "lw_for_each":
      return { k: "forEach", groupId: str(f.GROUP), body: body("DO") };
    case "lw_if_then":
      return { k: "if", cond: cond("COND"), body: body("DO"), elseBody: [] };
    case "lw_if_then_else":
      return { k: "if", cond: cond("COND"), body: body("DO"), elseBody: body("ELSE") };
    case "lw_wait_until":
      return { k: "waitUntil", cond: cond("COND") };
    case "lw_repeat_until":
      return { k: "repeatUntil", cond: cond("COND"), body: body("DO") };
    case "lw_var_set":
      return { k: "setVar", id: varId(f.VAR), value: exprOf(inputBlock(b, "VALUE")) };
    case "lw_var_change":
      return { k: "changeVar", id: varId(f.VAR), by: exprOf(inputBlock(b, "VALUE"), { k: "num", v: 1 }) };
    case "lw_link": {
      const prop = (LINK_PROPS.has(str(f.PROP)) ? str(f.PROP) : "speed") as LinkProp;
      const color = prop === "color";
      return {
        k: "link",
        target: targetOf(str(f.TARGET, ALL)),
        prop,
        value: exprOf(inputBlock(b, "VALUE")),
        inMin: num(f.IN_MIN, 0),
        inMax: num(f.IN_MAX, 100),
        from: color ? str(f.FROM, "#5C9DFF") : num(f.FROM, prop === "speed" || prop === "size" ? 0.5 : 0),
        to: color ? str(f.TO, "#FF6B5E") : num(f.TO, prop === "speed" || prop === "size" ? 2 : 1),
      };
    }
    case "lw_set_prop": {
      const prop = (LINK_PROPS.has(str(f.PROP)) ? str(f.PROP) : "speed") as LinkProp;
      const v = inputBlock(b, "VALUE");
      // a sensor plugged in directly is scaled from its typical range, everything else counts 0..100
      const channel = v?.type === "lw_sensor_value" ? KNOWN_CHANNELS.find((c) => c.id === str(v.fields?.SENSOR)) : undefined;
      const [from, to] = SET_PROP_RANGE[prop];
      return {
        k: "link",
        target: targetOf(str(f.TARGET, ALL)),
        prop,
        value: exprOf(v),
        inMin: channel?.min ?? 0,
        inMax: channel?.max ?? 100,
        from,
        to,
      };
    }
    default:
      return null;
  }
}

/** A live value brings its own content, so the effect's text and stopwatch settings don't apply. */
function showParams(p: EffectParams): EffectParams | undefined {
  const { text: _text, source: _source, value: _value, ...rest } = p;
  return Object.keys(rest).length ? rest : undefined;
}

function compileChain(first: BlockJson | undefined): Stmt[] {
  const out: Stmt[] = [];
  for (const b of chainOf(first)) {
    if (!isEnabled(b)) continue;
    const s = stmtOf(b);
    if (s) out.push(s);
  }
  return out;
}

/** Compile the stored program into runnable scripts. */
export function compileProgramJson(program: unknown, isTimeline: (hat: BlockJson) => boolean): Script[] {
  const scripts: Script[] = [];
  for (const hat of topBlocks(program)) {
    if (!isEnabled(hat)) continue;
    // a link block lying on its own is active too – no "Wenn Start" needed
    if (hat.type === "lw_link" || hat.type === "lw_set_prop") {
      scripts.push({ id: hat.id ?? Math.random().toString(36).slice(2), trigger: { k: "start" }, body: compileChain(hat) });
      continue;
    }
    if (!HAT_TYPES.has(hat.type)) continue;
    const trigger = triggerOf(hat);
    if (!trigger) continue;
    const timeline = isTimeline(hat);
    scripts.push({
      id: hat.id ?? Math.random().toString(36).slice(2),
      trigger,
      body: compileChain(hat.next?.block),
      // "Solange" scripts clear themselves when their condition turns false, not when they end
      clearOnEnd: trigger.k !== "start" && trigger.k !== "while" && timeline,
      timeline,
    });
  }
  return scripts;
}

export function seqOf(v: unknown): Sequence {
  return v === "sequential" ? "sequential" : "together";
}
