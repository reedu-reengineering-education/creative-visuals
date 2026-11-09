/**
 * Timeline <-> blocks.
 *
 * The program (Blockly JSON) is the single source of truth. A script that only
 * uses effect + wait blocks (optionally inside one "forever") can be shown as a
 * timeline; editing the timeline regenerates exactly that script. Everything
 * else stays "code" and is shown as a locked tab.
 */
import {
  chainOf,
  effectContent,
  isEnabled,
  topBlocks,
  triggerOf,
  seqOf,
  ALL,
  SLOT_EFFECTS,
  THIS,
  type BlockJson,
  type ProgramJson,
} from "./blockJson";
import { cleanParams, encodeParams, parseParams, sameParams } from "./params";
import type { Trigger } from "./program";
import type { ColorSpec, EffectParams, EffectType, Sequence } from "./types";

export interface Clip {
  id: string;
  groupId: string;
  /** null = the whole group, otherwise the stroke number in the group (1-based) */
  nr: number | null;
  effect: EffectType;
  color: ColorSpec;
  sequence: Sequence;
  /** speed, size, … (only values that differ from the default) */
  params?: EffectParams;
  start: number;
  duration: number;
}

export interface Timeline {
  /** id of the hat block */
  id: string;
  trigger: Trigger;
  loop: boolean;
  duration: number;
  clips: Clip[];
  x: number;
  y: number;
}

export type ScriptView =
  | { kind: "timeline"; timeline: Timeline }
  | { kind: "code"; id: string; trigger: Trigger };

export const DEFAULT_DURATION = 6;
export const SNAP = 0.25;
export const MIN_CLIP = 0.25;

interface State {
  effect: EffectType;
  color: ColorSpec;
  sequence: Sequence;
  params?: EffectParams;
}

const LINE: State = { effect: "line", color: "#FFFFFF", sequence: "together" };
const OFF: State = { effect: "off", color: "#FFFFFF", sequence: "together" };

const r2 = (n: number) => Math.round(n * 100) / 100;
export const snap = (n: number) => Math.round(n / SNAP) * SNAP;

const rowKey = (groupId: string, nr: number | null) => (nr === null ? groupId : `${groupId}#${nr}`);
export const clipRowKey = (c: Pick<Clip, "groupId" | "nr">) => rowKey(c.groupId, c.nr);
const clipId = (key: string, start: number) => `${key}@${r2(start)}`;

function same(a: State | null | undefined, b: State | null | undefined, withSeq = true) {
  if (!a || !b) return a === b;
  return (
    a.effect === b.effect &&
    a.color === b.color &&
    (!withSeq || a.sequence === b.sequence) &&
    sameParams(a.params, b.params)
  );
}

/* ------------------------------------------------------------------ */
/* blocks -> timeline                                                  */
/* ------------------------------------------------------------------ */

export function parseScript(hat: BlockJson): ScriptView | null {
  const trigger = triggerOf(hat);
  if (!trigger) return null;
  const id = hat.id ?? "";
  const code: ScriptView = { kind: "code", id, trigger };

  let body = chainOf(hat.next?.block);
  let loop = false;
  if (body.some((b) => !isEnabled(b))) return code;
  if (body.length === 1 && body[0].type === "lw_forever") {
    loop = true;
    body = chainOf(body[0].inputs?.DO?.block);
    if (body.some((b) => !isEnabled(b))) return code;
  }

  const groupState = new Map<string, State>();
  const open = new Map<string, Clip>();
  const closed: Clip[] = [];
  let t = 0;

  const close = (key: string) => {
    const c = open.get(key);
    if (!c) return;
    open.delete(key);
    c.duration = r2(t - c.start);
    if (c.duration > 0) closed.push(c);
  };
  const openClip = (groupId: string, nr: number | null, st: State) => {
    const key = rowKey(groupId, nr);
    // a clip that ended right now with the same look just continues
    const i = closed.findIndex(
      (c) => clipRowKey(c) === key && r2(c.start + c.duration) === r2(t) && same(c, st, nr === null),
    );
    if (i >= 0) {
      const [c] = closed.splice(i, 1);
      open.set(key, c);
      return;
    }
    open.set(key, { id: clipId(key, t), groupId, nr, ...st, params: cleanParams(st.params), start: r2(t), duration: 0 });
  };

  /** settings of an effect block; a fixed text in its slot counts as the text setting */
  const paramsOf = (b: BlockJson): EffectParams | null => {
    const content = effectContent(b);
    // a live value (reading, variable …) can't be shown as a clip
    if (content.k === "value") return null;
    const p = parseParams(b.fields?.SET);
    if (content.k === "text") p.text = content.text;
    return p;
  };

  for (const b of body) {
    const f = b.fields ?? {};
    if (b.type === "lw_wait") {
      const s = Number(f.SECONDS);
      if (!Number.isFinite(s) || s < 0) return code;
      t = r2(t + s);
    } else if (b.type === "lw_effect") {
      const gid = String(f.TARGET ?? "");
      const params = paramsOf(b);
      if (!gid || gid === ALL || gid === THIS || !params) return code;
      const st: State = {
        effect: String(f.EFFECT) as EffectType,
        color: String(f.COLOR) as ColorSpec,
        sequence: seqOf(f.SEQ),
        params,
      };
      groupState.set(gid, st);
      close(gid);
      for (const key of [...open.keys()]) if (key.startsWith(`${gid}#`)) close(key);
      if (st.effect !== "off") openClip(gid, null, st);
    } else if (b.type === "lw_effect_one") {
      const gid = String(f.GROUP ?? "");
      const nr = Math.max(1, Math.round(Number(f.NR) || 1));
      const params = paramsOf(b);
      if (!params) return code;
      const st: State = {
        effect: String(f.EFFECT) as EffectType,
        color: String(f.COLOR) as ColorSpec,
        sequence: "together",
        params,
      };
      const base = groupState.get(gid) ?? LINE;
      close(rowKey(gid, nr));
      if (!same(st, base, false)) openClip(gid, nr, st);
    } else {
      return code;
    }
  }

  let duration = t;
  if (duration <= 0) {
    duration = DEFAULT_DURATION;
    t = duration;
  }
  for (const key of [...open.keys()]) close(key);

  return {
    kind: "timeline",
    timeline: { id, trigger, loop, duration, clips: closed.sort((a, b) => a.start - b.start), x: hat.x ?? 40, y: hat.y ?? 40 },
  };
}

export function parseProgram(program: unknown): ScriptView[] {
  const out: ScriptView[] = [];
  for (const b of topBlocks(program)) {
    if (!isEnabled(b)) continue;
    const v = parseScript(b);
    if (v) out.push(v);
  }
  return out;
}

export function isTimelineHat(hat: BlockJson): boolean {
  return parseScript(hat)?.kind === "timeline";
}

/* ------------------------------------------------------------------ */
/* timeline -> blocks                                                  */
/* ------------------------------------------------------------------ */

/**
 * Text effects get their text in the slot on the block ("Laufschrift ⟨Hallo⟩"),
 * not in the settings; "Zahl" gets an empty slot (stopwatch / clock).
 */
export function withContentSlot(b: BlockJson, effect: string, params: EffectParams | undefined): BlockJson {
  if (!SLOT_EFFECTS.has(effect)) return { ...b, fields: { ...b.fields, SET: encodeParams(params) } };
  const { text, ...rest } = params ?? {};
  return {
    ...b,
    extraState: { slot: true },
    fields: { ...b.fields, SET: encodeParams(rest) },
    ...(effect === "number" ? {} : { inputs: { VALUE: { shadow: { type: "lw_text", fields: { TEXT: text ?? "" } } } } }),
  };
}

function effectBlock(groupId: string, st: State): BlockJson {
  return withContentSlot(
    { type: "lw_effect", fields: { TARGET: groupId, EFFECT: st.effect, COLOR: st.color, SEQ: st.sequence } },
    st.effect,
    st.params,
  );
}

function itemBlock(groupId: string, nr: number, st: State): BlockJson {
  return withContentSlot(
    { type: "lw_effect_one", fields: { GROUP: groupId, NR: nr, EFFECT: st.effect, COLOR: st.color } },
    st.effect,
    st.params,
  );
}

function hatFor(trigger: Trigger): BlockJson {
  switch (trigger.k) {
    case "start":
      return { type: "lw_on_start" };
    case "key":
      return { type: "lw_on_key", fields: { KEY: trigger.key } };
    case "button":
      return { type: "lw_on_button", fields: { BUTTON: trigger.button } };
    case "when":
    case "while":
      // never regenerated: the effects mode only edits "Wenn Start" timelines
      return { type: trigger.k === "when" ? "lw_when" : "lw_while" };
  }
}

function link(blocks: BlockJson[]): BlockJson | undefined {
  for (let i = blocks.length - 2; i >= 0; i--) blocks[i].next = { block: blocks[i + 1] };
  return blocks[0];
}

export function timelineToBlocks(tl: Timeline): BlockJson {
  const dur = Math.max(MIN_CLIP, tl.duration);
  const clips = tl.clips
    .map((c) => ({ ...c, start: Math.max(0, c.start), duration: Math.min(c.duration, dur - c.start) }))
    .filter((c) => c.duration > 0 && c.start < dur);

  const active = (key: string, t: number) =>
    clips.find((c) => clipRowKey(c) === key && c.start <= t + 1e-6 && t < c.start + c.duration - 1e-6) ?? null;
  const stateOf = (c: Clip | null): State | null =>
    c ? { effect: c.effect, color: c.color, sequence: c.sequence, params: c.params } : null;

  const times = new Set<number>([0]);
  for (const c of clips) {
    times.add(r2(c.start));
    if (c.start + c.duration < dur) times.add(r2(c.start + c.duration));
  }
  const events = [...times].sort((a, b) => a - b);

  const groups = [...new Set(clips.filter((c) => c.nr === null).map((c) => c.groupId))];
  const itemKeys = [...new Set(clips.filter((c) => c.nr !== null).map((c) => clipRowKey(c)))].map((k) => {
    const c = clips.find((x) => clipRowKey(x) === k)!;
    return { key: k, groupId: c.groupId, nr: c.nr as number };
  });

  const prevGroup = new Map<string, State>();
  const prevItem = new Map<string, State | "base">();
  const out: BlockJson[] = [];

  events.forEach((t, i) => {
    const changed = new Set<string>();
    for (const g of groups) {
      const st = stateOf(active(g, t)) ?? OFF;
      if (!same(prevGroup.get(g), st)) {
        out.push(effectBlock(g, st));
        prevGroup.set(g, st);
        changed.add(g);
      }
    }
    for (const it of itemKeys) {
      const st = stateOf(active(it.key, t));
      const prev = prevItem.get(it.key);
      if (st) {
        if (changed.has(it.groupId) || prev === "base" || prev === undefined || !same(prev, st, false)) {
          out.push(itemBlock(it.groupId, it.nr, st));
          prevItem.set(it.key, st);
        }
      } else if (prev && prev !== "base") {
        const base = prevGroup.get(it.groupId) ?? LINE;
        if (!changed.has(it.groupId)) out.push(itemBlock(it.groupId, it.nr, base));
        prevItem.set(it.key, "base");
      } else {
        prevItem.set(it.key, "base");
      }
    }
    const next = events[i + 1] ?? dur;
    const wait = r2(next - t);
    if (wait > 0) out.push({ type: "lw_wait", fields: { SECONDS: wait } });
  });

  const hat: BlockJson = { ...hatFor(tl.trigger), id: tl.id, x: tl.x, y: tl.y, data: "timeline" };
  const first = link(out);
  if (tl.loop) {
    hat.next = { block: { type: "lw_forever", inputs: { DO: { block: first } } } };
  } else if (first) {
    hat.next = { block: first };
  }
  return hat;
}

/* ------------------------------------------------------------------ */
/* program updates                                                     */
/* ------------------------------------------------------------------ */

function withBlocks(program: unknown, blocks: BlockJson[]): ProgramJson {
  const p = (program ?? {}) as ProgramJson;
  return { ...p, blocks: { languageVersion: p.blocks?.languageVersion ?? 0, blocks } };
}

export function upsertTimeline(program: unknown, tl: Timeline): ProgramJson {
  const hat = timelineToBlocks(tl);
  const blocks = topBlocks(program);
  const i = blocks.findIndex((b) => b.id === tl.id);
  const next = i >= 0 ? blocks.map((b, j) => (j === i ? hat : b)) : [...blocks, hat];
  return withBlocks(program, next);
}

export function removeScript(program: unknown, id: string): ProgramJson {
  return withBlocks(
    program,
    topBlocks(program).filter((b) => b.id !== id),
  );
}

export function newTimelineId(): string {
  return `tl_${Math.random().toString(36).slice(2, 10)}`;
}

export function emptyTimeline(trigger: Trigger, y = 40): Timeline {
  return {
    id: newTimelineId(),
    trigger,
    loop: trigger.k === "start",
    duration: trigger.k === "start" ? DEFAULT_DURATION : 3,
    clips: [],
    x: 40,
    y,
  };
}

/** A fresh program: one empty, looping start timeline. */
export function emptyProgram(): ProgramJson {
  return withBlocks(null, [timelineToBlocks(emptyTimeline({ k: "start" }))]);
}

/** Next free y position for a new script on the code canvas. */
export function nextScriptY(program: unknown): number {
  const ys = topBlocks(program).map((b) => (b.y ?? 0) + 260);
  return ys.length ? Math.max(...ys) : 40;
}
