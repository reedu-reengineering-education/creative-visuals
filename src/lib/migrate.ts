/**
 * Bring stored projects up to date when they are loaded or imported, so the
 * rest of the code only has to know the current blocks and effects.
 *
 * - Static per-group / per-stroke effects (the very first version) become
 *   clips of a start timeline.
 * - Old blocks are rewritten to their replacements:
 *   "Wenn [Sensor] > x" → "Wenn ⟨…⟩", "Falls [Sensor] > x" → "Falls ⟨…⟩",
 *   "Wenn getippt" → "Wenn Knopf 1 gedrückt".
 * - Merged effects: Tiefe → Echo (inwards), Atmen → Leuchten,
 *   Wasser → Füllstand (fills by itself).
 * - Data effects no longer pick a sensor themselves: a "Zahl" with a sensor
 *   becomes "Zeige ⟨Messwert⟩ auf …"; Füllstand/Kurve lose the sensor (they
 *   are connected with "Verbinde" in code now).
 */
import { topBlocks, type BlockJson, type ProgramJson } from "./blockJson";
import { encodeParams, parseParams } from "./params";
import { emptyProgram, emptyTimeline, nextScriptY, upsertTimeline, type Clip } from "./timeline";
import type { ColorSpec, EffectParams, EffectType, Project, Sequence } from "./types";

interface StaticEffect {
  effect: string;
  color: ColorSpec;
  sequence: Sequence;
}

/** A project as it may come out of storage or an imported file. */
export type StoredProject = Project & {
  groupEffects?: Record<string, StaticEffect>;
  strokeEffects?: Record<string, StaticEffect>;
};

/** Effects that were merged into others: new effect + settings to add. */
const MERGED: Record<string, { effect: EffectType; params?: EffectParams }> = {
  depth: { effect: "echo", params: { dir: "in" } },
  breathe: { effect: "glow" },
  water: { effect: "level" },
};

export function migrateEffect(effect: string, params: EffectParams = {}): { effect: EffectType; params: EffectParams } {
  const m = MERGED[effect];
  if (!m) return { effect: effect as EffectType, params };
  return { effect: m.effect, params: { ...params, ...m.params } };
}

/** The sensor a data effect used to pick in its settings (before "Verbinde" / "Zeige" took over). */
function sensorSourceOf(set: unknown): string | null {
  if (typeof set !== "string" || !set) return null;
  try {
    const source = (JSON.parse(set) as { source?: unknown }).source;
    return typeof source === "string" && source !== "timer" && source !== "clock" && source !== "auto" ? source : null;
  } catch {
    return null;
  }
}

const compare = (sensor: unknown, op: unknown, value: unknown): BlockJson => ({
  type: "lw_compare",
  fields: { OP: op === "<" ? "<" : ">" },
  inputs: {
    A: { block: { type: "lw_sensor_value", fields: { SENSOR: String(sensor ?? "noise") } } },
    B: { shadow: { type: "lw_num", fields: { NUM: Number(value) || 0 } } },
  },
});

function migrateBlock(b: BlockJson): BlockJson {
  const out: BlockJson = { ...b };
  if (out.next?.block) out.next = { ...out.next, block: migrateBlock(out.next.block) };
  if (out.inputs) {
    out.inputs = Object.fromEntries(
      Object.entries(out.inputs).map(([name, i]) => [
        name,
        {
          ...i,
          ...(i.block ? { block: migrateBlock(i.block) } : {}),
          ...(i.shadow ? { shadow: migrateBlock(i.shadow) } : {}),
        },
      ]),
    );
  }
  const f = out.fields ?? {};
  switch (out.type) {
    case "lw_on_sensor": {
      const { SENSOR, OP, VALUE, ...rest } = f;
      return { ...out, type: "lw_when", fields: rest, inputs: { ...out.inputs, COND: { block: compare(SENSOR, OP, VALUE) } } };
    }
    case "lw_if":
    case "lw_if_else": {
      const { SENSOR, OP, VALUE, ...rest } = f;
      return {
        ...out,
        type: out.type === "lw_if" ? "lw_if_then" : "lw_if_then_else",
        fields: rest,
        inputs: { ...out.inputs, COND: { block: compare(SENSOR, OP, VALUE) } },
      };
    }
    case "lw_on_tap":
      return { ...out, type: "lw_on_button", fields: { BUTTON: "1" } };
    case "lw_effect":
    case "lw_effect_one": {
      const sensor = sensorSourceOf(f.SET);
      if (f.EFFECT === "number" && sensor) {
        const target = out.type === "lw_effect" ? f.TARGET : f.GROUP;
        return {
          type: "lw_show_value",
          ...(out.id ? { id: out.id } : {}),
          ...(out.next ? { next: out.next } : {}),
          fields: { TARGET: target, COLOR: f.COLOR },
          inputs: { VALUE: { block: { type: "lw_sensor_value", fields: { SENSOR: sensor } } } },
        };
      }
      if (typeof f.EFFECT !== "string" || !MERGED[f.EFFECT]) return out;
      const m = migrateEffect(f.EFFECT, parseParams(f.SET));
      return { ...out, fields: { ...f, EFFECT: m.effect, SET: encodeParams(m.params) } };
    }
    default:
      return out;
  }
}

export function migrateProgram(program: unknown): unknown {
  if (!program) return program;
  const p = program as ProgramJson;
  const blocks = topBlocks(p);
  if (!blocks.length) return program;
  return { ...p, blocks: { ...p.blocks, blocks: blocks.map(migrateBlock) } };
}

/** Static effects of the first version → clips of a start timeline. */
function migrateStaticEffects(p: StoredProject): unknown {
  const groupFx = Object.entries(p.groupEffects ?? {});
  const strokeFx = Object.entries(p.strokeEffects ?? {});
  if (!groupFx.length && !strokeFx.length) return p.program ?? emptyProgram();
  const tl = emptyTimeline({ k: "start" }, p.program ? nextScriptY(p.program) : 40);
  const clips: Clip[] = [];
  for (const [groupId, e] of groupFx) {
    const m = migrateEffect(e.effect);
    clips.push({ id: "", groupId, nr: null, ...m, color: e.color, sequence: e.sequence, start: 0, duration: tl.duration });
  }
  for (const [strokeId, e] of strokeFx) {
    const s = p.strokes.find((x) => x.id === strokeId);
    if (!s) continue;
    const nr = p.strokes.filter((x) => x.groupId === s.groupId).indexOf(s) + 1;
    const m = migrateEffect(e.effect);
    clips.push({ id: "", groupId: s.groupId, nr, ...m, color: e.color, sequence: "together", start: 0, duration: tl.duration });
  }
  tl.clips = clips;
  return upsertTimeline(p.program ?? { blocks: { languageVersion: 0, blocks: [] } }, tl);
}

export function migrateProject(stored: StoredProject): Project {
  return {
    version: 1,
    aspect: stored.aspect,
    groups: stored.groups,
    strokes: stored.strokes,
    program: migrateProgram(migrateStaticEffects(stored)),
  };
}
