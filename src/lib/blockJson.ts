/**
 * Helpers for the Blockly serialisation JSON, without needing Blockly itself.
 * The project stores the program in this format; the timeline and the
 * interpreter both read it directly.
 */
import { parseParams } from "./params";
import type { Cond, Script, Stmt, Target, Trigger } from "./program";
import type { ColorSpec, EffectType, Sequence } from "./types";

export const ALL = "__all";
export const THIS = "__this";

export interface BlockJson {
  type: string;
  id?: string;
  x?: number;
  y?: number;
  fields?: Record<string, unknown>;
  inputs?: Record<string, { block?: BlockJson }>;
  next?: { block?: BlockJson };
  enabled?: boolean;
  disabledReasons?: string[];
  data?: string;
  [key: string]: unknown;
}

export interface ProgramJson {
  blocks?: { languageVersion?: number; blocks?: BlockJson[] };
  [key: string]: unknown;
}

export const HAT_TYPES = new Set(["lw_on_start", "lw_on_key", "lw_on_tap", "lw_on_sensor"]);

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

export function condOf(b: BlockJson): Cond {
  return {
    sensor: str(b.fields?.SENSOR, "noise"),
    op: b.fields?.OP === "<" ? "<" : ">",
    value: num(b.fields?.VALUE, 0),
  };
}

export function triggerOf(hat: BlockJson): Trigger | null {
  switch (hat.type) {
    case "lw_on_start":
      return { k: "start" };
    case "lw_on_key":
      return { k: "key", key: str(hat.fields?.KEY, "space") };
    case "lw_on_tap":
      return { k: "tap" };
    case "lw_on_sensor":
      return { k: "sensor", cond: condOf(hat) };
    default:
      return null;
  }
}

function targetOf(value: string): Target {
  if (value === ALL) return { kind: "all" };
  if (value === THIS) return { kind: "this" };
  return { kind: "group", groupId: value };
}

function stmtOf(b: BlockJson): Stmt | null {
  const f = b.fields ?? {};
  const body = (name: string) => compileChain(b.inputs?.[name]?.block);
  switch (b.type) {
    case "lw_effect":
      return {
        k: "effect",
        target: targetOf(str(f.TARGET, ALL)),
        effect: str(f.EFFECT, "glow") as EffectType,
        color: str(f.COLOR, "#FFD98A") as ColorSpec,
        sequence: f.SEQ === "sequential" ? "sequential" : "together",
        params: parseParams(f.SET),
      };
    case "lw_effect_one":
      return {
        k: "effect",
        target: { kind: "item", groupId: str(f.GROUP), nr: Math.max(1, Math.round(num(f.NR, 1))) },
        effect: str(f.EFFECT, "glow") as EffectType,
        color: str(f.COLOR, "#FFD98A") as ColorSpec,
        params: parseParams(f.SET),
      };
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
    case "lw_if":
      return { k: "if", cond: condOf(b), body: body("DO"), elseBody: [] };
    case "lw_if_else":
      return { k: "if", cond: condOf(b), body: body("DO"), elseBody: body("ELSE") };
    default:
      return null;
  }
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
    if (!HAT_TYPES.has(hat.type) || !isEnabled(hat)) continue;
    const trigger = triggerOf(hat);
    if (!trigger) continue;
    scripts.push({
      id: hat.id ?? Math.random().toString(36).slice(2),
      trigger,
      body: compileChain(hat.next?.block),
      clearOnEnd: trigger.k !== "start" && isTimeline(hat),
    });
  }
  return scripts;
}

export function seqOf(v: unknown): Sequence {
  return v === "sequential" ? "sequential" : "together";
}
