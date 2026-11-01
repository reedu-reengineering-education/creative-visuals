import * as Blockly from "blockly/core";
import { ALL, THIS, registerBlocks } from "./defs";
import { parseParams } from "@/lib/params";
import type { Cond, Script, Stmt, Target } from "@/lib/program";
import type { ColorSpec, EffectType } from "@/lib/types";

const HATS = new Set(["lw_on_start", "lw_on_key", "lw_on_tap", "lw_on_sensor"]);

function numField(b: Blockly.Block, name: string, fallback = 0): number {
  const v = Number(b.getFieldValue(name));
  return Number.isFinite(v) ? v : fallback;
}

function cond(b: Blockly.Block): Cond {
  return {
    sensor: String(b.getFieldValue("SENSOR")),
    op: b.getFieldValue("OP") === "<" ? "<" : ">",
    value: numField(b, "VALUE"),
  };
}

function target(value: string): Target {
  if (value === ALL) return { kind: "all" };
  if (value === THIS) return { kind: "this" };
  return { kind: "group", groupId: value };
}

function chain(first: Blockly.Block | null): Stmt[] {
  const out: Stmt[] = [];
  for (let b = first; b; b = b.getNextBlock()) {
    if (!b.isEnabled()) continue;
    const s = stmt(b);
    if (s) out.push(s);
  }
  return out;
}

function stmt(b: Blockly.Block): Stmt | null {
  switch (b.type) {
    case "lw_effect":
      return {
        k: "effect",
        target: target(String(b.getFieldValue("TARGET"))),
        effect: b.getFieldValue("EFFECT") as EffectType,
        color: b.getFieldValue("COLOR") as ColorSpec,
        sequence: b.getFieldValue("SEQ") === "sequential" ? "sequential" : "together",
        params: parseParams(b.getFieldValue("SET")),
      };
    case "lw_effect_one":
      return {
        k: "effect",
        target: { kind: "item", groupId: String(b.getFieldValue("GROUP")), nr: Math.max(1, Math.round(numField(b, "NR", 1))) },
        effect: b.getFieldValue("EFFECT") as EffectType,
        color: b.getFieldValue("COLOR") as ColorSpec,
        params: parseParams(b.getFieldValue("SET")),
      };
    case "lw_wait": {
      const s = numField(b, "SECONDS", 1);
      return { k: "wait", min: s, max: s };
    }
    case "lw_wait_random": {
      const a = numField(b, "MIN", 1);
      const c = numField(b, "MAX", 3);
      return { k: "wait", min: Math.min(a, c), max: Math.max(a, c) };
    }
    case "lw_repeat":
      return { k: "repeat", times: numField(b, "TIMES", 1), body: chain(b.getInputTargetBlock("DO")) };
    case "lw_forever":
      return { k: "forever", body: chain(b.getInputTargetBlock("DO")) };
    case "lw_for_each":
      return { k: "forEach", groupId: String(b.getFieldValue("GROUP")), body: chain(b.getInputTargetBlock("DO")) };
    case "lw_if":
      return { k: "if", cond: cond(b), body: chain(b.getInputTargetBlock("DO")), elseBody: [] };
    case "lw_if_else":
      return {
        k: "if",
        cond: cond(b),
        body: chain(b.getInputTargetBlock("DO")),
        elseBody: chain(b.getInputTargetBlock("ELSE")),
      };
    default:
      return null;
  }
}

/** Compile a (rendered or headless) workspace into scripts. */
export function workspaceToScripts(ws: Blockly.Workspace): Script[] {
  const scripts: Script[] = [];
  for (const top of ws.getTopBlocks(true)) {
    if (!HATS.has(top.type) || !top.isEnabled()) continue;
    const body = chain(top.getNextBlock());
    switch (top.type) {
      case "lw_on_start":
        scripts.push({ id: top.id, trigger: { k: "start" }, body });
        break;
      case "lw_on_key":
        scripts.push({ id: top.id, trigger: { k: "key", key: String(top.getFieldValue("KEY")) }, body });
        break;
      case "lw_on_tap":
        scripts.push({ id: top.id, trigger: { k: "tap" }, body });
        break;
      case "lw_on_sensor":
        scripts.push({ id: top.id, trigger: { k: "sensor", cond: cond(top) }, body });
        break;
    }
  }
  return scripts;
}

/** Compile stored workspace JSON without showing it (headless Blockly). */
export async function compileProgram(program: unknown): Promise<Script[]> {
  if (!program) return [];
  registerBlocks();
  const ws = new Blockly.Workspace();
  try {
    Blockly.serialization.workspaces.load(program as object, ws);
    return workspaceToScripts(ws);
  } catch (e) {
    console.warn("[lichtwerk] could not compile program", e);
    return [];
  } finally {
    ws.dispose();
  }
}
