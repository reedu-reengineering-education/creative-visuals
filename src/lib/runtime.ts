"use client";

import { create } from "zustand";
import { useProject } from "./store";
import { useSensors } from "./sensors";
import { compileProgramJson } from "./blockJson";
import { isTimelineHat } from "./timeline";
import { cleanParams, sameParams } from "./params";
import { blendHue, effectDef } from "./palette";
import type { Expr, LinkOut, LinkProp, Script, Stmt, Target } from "./program";
import type { Project, RuntimeOverride } from "./types";

interface RuntimeState {
  running: boolean;
  paused: boolean;
  overrides: Record<string, RuntimeOverride>;
  scripts: Script[];
  /** true while an output window answered within the last few seconds */
  outputConnected: boolean;
  /** current values of the program's variables (by variable id) */
  vars: Record<string, number>;
  setScripts: (s: Script[]) => void;
  setRunning: (r: boolean) => void;
  setPaused: (p: boolean) => void;
  setOverrides: (o: Record<string, RuntimeOverride>) => void;
  setOutputConnected: (c: boolean) => void;
}

export const useRuntime = create<RuntimeState>((set) => ({
  running: false,
  paused: false,
  overrides: {},
  scripts: [],
  outputConnected: false,
  vars: {},
  setScripts: (scripts) => set({ scripts }),
  setRunning: (running) => set({ running }),
  setPaused: (paused) => set({ paused }),
  setOverrides: (overrides) => set({ overrides }),
  setOutputConnected: (outputConnected) => set({ outputConnected }),
}));

/** A coroutine yields the number of seconds to sleep (0 = next frame). */
interface Thread {
  scriptId: string;
  gen: Generator<number, void, void>;
  /** virtual time (ms) at which the thread continues */
  wake: number;
  /** total seconds this thread has waited – used to keep "forever" from spinning */
  waited: number;
}

interface Ctx {
  thisId: string | null;
  thread: Thread;
}

type Value = number | boolean;
const asNum = (v: Value) => (typeof v === "boolean" ? (v ? 1 : 0) : v);
const asBool = (v: Value) => (typeof v === "boolean" ? v : Number.isFinite(v) && v !== 0);

/** How a value looks on the wall. */
export function formatValue(v: Value): string {
  if (typeof v === "boolean") return v ? "✓" : "✗";
  if (!Number.isFinite(v)) return "–";
  return String(Math.round(v * 100) / 100);
}

/** A "zeige …" block keeps its number up to date while it is shown. */
interface LiveValue {
  scriptId: string;
  ids: string[];
  value: Expr;
  text: string;
}

/** A "Verbinde …" block: a value that keeps steering one setting of some shapes. */
interface Link {
  scriptId: string;
  ids: string[];
  prop: LinkProp;
  value: Expr;
  inMin: number;
  inMax: number;
  from: LinkOut;
  to: LinkOut;
  /** current output, undefined while the value is unknown (e.g. no sensor) */
  out?: LinkOut;
  /** "Kurve": recent outputs (0..1), sampled twice a second */
  series?: number[];
  sampledAt?: number;
}

const GRAPH_SAMPLES = 60;
const GRAPH_EVERY_MS = 500;

const STEPS = 64;
const quant = (x: number, step: number) => Math.round(x / step) * step;

/** Map a value into a link's output range (clamped; inMin > inMax turns it around). */
function linkOutput(ln: Link, v: number): LinkOut | undefined {
  if (!Number.isFinite(v)) return undefined;
  const span = ln.inMax - ln.inMin;
  const f = Math.round(Math.min(1, Math.max(0, span === 0 ? 0 : (v - ln.inMin) / span)) * STEPS) / STEPS;
  if (ln.prop === "color") return blendHue(String(ln.from), String(ln.to), f);
  const a = Number(ln.from);
  const b = Number(ln.to);
  return quant(a + (b - a) * f, ln.prop === "speed" || ln.prop === "size" ? 0.05 : 0.02);
}

function resolveTarget(project: Project, tg: Target, ctx: Ctx): string[] {
  switch (tg.kind) {
    case "all":
      return project.strokes.map((s) => s.id);
    case "this":
      return ctx.thisId ? [ctx.thisId] : [];
    case "group":
      return project.strokes.filter((s) => s.groupId === tg.groupId).map((s) => s.id);
    case "item": {
      const list = project.strokes.filter((s) => s.groupId === tg.groupId);
      const s = list[tg.nr - 1];
      return s ? [s.id] : [];
    }
  }
}

/**
 * Runs the program on a virtual clock (ms since start), so it can be paused
 * and scrubbed like a timeline. Each script paints into its own layer; layers
 * of scripts that were triggered later lie on top.
 */
export class Interpreter {
  private threads: Thread[] = [];
  private layers = new Map<string, Record<string, RuntimeOverride>>();
  private layerOrder: string[] = [];
  private startedAt = new Map<string, number>();
  private dirty = false;
  private sensorState = new Map<string, boolean>();
  private scripts: Script[] = [];
  private vars = new Map<string, number>();
  private live: LiveValue[] = [];
  private links: Link[] = [];
  /** per shape: how a linked speed was blended in, so the animation doesn't jump when the speed changes */
  private speedState = new Map<string, { baseSince: number; since: number; speed: number }>();
  /** virtual clock in ms */
  clock = 0;
  /** real time (epoch ms) that corresponds to clock 0 */
  private epoch = Date.now();
  private lastReal = 0;
  paused = false;
  /** virtual time of the thread that is running right now */
  private current = 0;

  start(scripts: Script[], atMs = 0) {
    this.scripts = scripts;
    this.threads = [];
    this.layers.clear();
    this.layerOrder = [];
    this.startedAt.clear();
    this.sensorState.clear();
    this.vars.clear();
    this.live = [];
    this.links = [];
    this.speedState.clear();
    this.publishVars();
    this.clock = 0;
    this.epoch = Date.now() - atMs;
    this.lastReal = Date.now();
    for (const s of scripts) {
      if (s.trigger.k === "start") this.spawn(s, 0);
      if (s.trigger.k === "when" || s.trigger.k === "while") this.sensorState.set(s.id, false);
    }
    this.dirty = true;
    this.advance(atMs);
  }

  stop() {
    this.threads = [];
    this.layers.clear();
    this.layerOrder = [];
    this.startedAt.clear();
    this.live = [];
    this.links = [];
    this.speedState.clear();
    this.dirty = true;
    this.flush();
  }

  /** Remove everything a script shows (its layer, live numbers and links). */
  private clearScript(scriptId: string) {
    this.threads = this.threads.filter((t) => t.scriptId !== scriptId);
    this.layers.delete(scriptId);
    this.layerOrder = this.layerOrder.filter((id) => id !== scriptId);
    this.startedAt.delete(scriptId);
    this.live = this.live.filter((lv) => lv.scriptId !== scriptId);
    this.links = this.links.filter((ln) => ln.scriptId !== scriptId);
    this.dirty = true;
  }

  setPaused(p: boolean) {
    this.paused = p;
    this.lastReal = Date.now();
    // keep the real-time mapping in sync so animations continue smoothly
    this.epoch = Date.now() - this.clock;
  }

  key(key: string) {
    for (const s of this.scripts) if (s.trigger.k === "key" && s.trigger.key === key) this.spawn(s, this.clock);
    this.advance(this.clock);
  }

  /** One of the on-screen buttons (or keys 1–4). */
  button(b: string) {
    for (const s of this.scripts) if (s.trigger.k === "button" && s.trigger.button === b) this.spawn(s, this.clock);
    this.advance(this.clock);
  }

  private eval(e: Expr): Value {
    switch (e.k) {
      case "num":
        return e.v;
      case "var":
        return this.vars.get(e.id) ?? 0;
      case "sensor": {
        const v = useSensors.getState().values[e.sensor];
        return v === undefined ? NaN : v;
      }
      case "random": {
        const a = asNum(this.eval(e.min));
        const b = asNum(this.eval(e.max));
        const lo = Math.min(a, b);
        const hi = Math.max(a, b);
        // whole numbers stay whole ("1 to 6" is a dice)
        if (Number.isInteger(lo) && Number.isInteger(hi)) return lo + Math.floor(Math.random() * (hi - lo + 1));
        return lo + Math.random() * (hi - lo);
      }
      case "arith": {
        const a = asNum(this.eval(e.a));
        const b = asNum(this.eval(e.b));
        if (e.op === "+") return a + b;
        if (e.op === "-") return a - b;
        if (e.op === "*") return a * b;
        return b === 0 ? NaN : a / b;
      }
      case "cmp": {
        const a = asNum(this.eval(e.a));
        const b = asNum(this.eval(e.b));
        if (e.op === ">") return a > b;
        if (e.op === "<") return a < b;
        return Math.abs(a - b) < 1e-9;
      }
      case "logic":
        return e.op === "and"
          ? asBool(this.eval(e.a)) && asBool(this.eval(e.b))
          : asBool(this.eval(e.a)) || asBool(this.eval(e.b));
      case "not":
        return !asBool(this.eval(e.a));
    }
  }

  private setVar(id: string, v: number) {
    if (this.vars.get(id) === v) return;
    this.vars.set(id, v);
    this.publishVars();
  }

  private publishVars() {
    useRuntime.setState({ vars: Object.fromEntries(this.vars) });
  }

  /** Recompute the numbers of all "zeige …" blocks that are visible. */
  private updateLive() {
    for (const lv of this.live) {
      const text = formatValue(this.eval(lv.value));
      if (text === lv.text) continue;
      lv.text = text;
      const layer = this.layers.get(lv.scriptId);
      if (!layer) continue;
      for (const id of lv.ids) {
        const o = layer[id];
        if (o) layer[id] = { ...o, params: { ...o.params, value: text } };
      }
      this.dirty = true;
    }
  }

  /** Where is a script right now? (ms since it started, or null) */
  position(scriptId: string): number | null {
    const at = this.startedAt.get(scriptId);
    if (at === undefined) return null;
    return this.clock - at;
  }

  private spawn(script: Script, at: number) {
    // restart an already running copy of this script (like Scratch does)
    this.threads = this.threads.filter((t) => t.scriptId !== script.id);
    const thread: Thread = { scriptId: script.id, gen: null as unknown as Thread["gen"], wake: at, waited: 0 };
    thread.gen = this.run(script.body, { thisId: null, thread });
    this.threads.push(thread);
    this.startedAt.set(script.id, at);
    this.layers.set(script.id, {});
    this.live = this.live.filter((lv) => lv.scriptId !== script.id);
    this.links = this.links.filter((ln) => ln.scriptId !== script.id);
    this.layerOrder = [...this.layerOrder.filter((id) => id !== script.id), script.id];
    this.dirty = true;
  }

  private setEffect(scriptId: string, ids: string[], st: Extract<Stmt, { k: "effect" }>) {
    const since = this.epoch + this.current;
    const layer = this.layers.get(scriptId) ?? {};
    // a new effect replaces a live number on these shapes
    for (const lv of this.live) if (lv.scriptId === scriptId) lv.ids = lv.ids.filter((id) => !ids.includes(id));
    this.live = this.live.filter((lv) => lv.ids.length);
    for (const id of ids) {
      const prev = layer[id];
      // same effect again (e.g. inside "forever"): keep it running instead of restarting it every frame
      if (
        prev &&
        prev.effect === st.effect &&
        prev.color === st.color &&
        prev.sequence === st.sequence &&
        sameParams(prev.params, st.params)
      )
        continue;
      layer[id] = { effect: st.effect, color: st.color, since, sequence: st.sequence, params: cleanParams(st.params) };
      this.dirty = true;
    }
    this.layers.set(scriptId, layer);
  }

  private *run(body: Stmt[], ctx: Ctx): Generator<number, void, void> {
    for (const st of body) {
      switch (st.k) {
        case "effect":
          this.setEffect(ctx.thread.scriptId, resolveTarget(useProject.getState().project, st.target, ctx), st);
          break;
        case "wait": {
          const s = st.min === st.max ? st.min : st.min + Math.random() * (st.max - st.min);
          ctx.thread.waited += Math.max(0, s);
          yield Math.max(0, s);
          break;
        }
        case "repeat":
          for (let i = 0; i < Math.min(1000, Math.max(0, Math.floor(st.times))); i++) {
            yield* this.run(st.body, ctx);
          }
          break;
        case "forever":
          for (;;) {
            const before = ctx.thread.waited;
            yield* this.run(st.body, ctx);
            if (ctx.thread.waited === before) yield 0; // never block the browser
          }
        case "forEach": {
          const ids = useProject
            .getState()
            .project.strokes.filter((s) => s.groupId === st.groupId)
            .map((s) => s.id);
          for (const id of ids) yield* this.run(st.body, { thisId: id, thread: ctx.thread });
          break;
        }
        case "if":
          yield* this.run(asBool(this.eval(st.cond)) ? st.body : st.elseBody, ctx);
          break;
        case "waitUntil":
          while (!asBool(this.eval(st.cond))) yield 0;
          break;
        case "repeatUntil":
          while (!asBool(this.eval(st.cond))) {
            const before = ctx.thread.waited;
            yield* this.run(st.body, ctx);
            if (ctx.thread.waited === before) yield 0; // never block the browser
          }
          break;
        case "setVar":
          this.setVar(st.id, asNum(this.eval(st.value)));
          break;
        case "changeVar":
          this.setVar(st.id, (this.vars.get(st.id) ?? 0) + asNum(this.eval(st.by)));
          break;
        case "show": {
          const ids = resolveTarget(useProject.getState().project, st.target, ctx);
          const text = formatValue(this.eval(st.value));
          this.setEffect(ctx.thread.scriptId, ids, {
            k: "effect",
            target: st.target,
            effect: "number",
            color: st.color,
            params: { value: text },
          });
          this.live.push({ scriptId: ctx.thread.scriptId, ids, value: st.value, text });
          break;
        }
        case "link": {
          const ids = resolveTarget(useProject.getState().project, st.target, ctx);
          const scriptId = ctx.thread.scriptId;
          // a new link for the same setting replaces the old one on these shapes
          for (const ln of this.links) {
            if (ln.scriptId === scriptId && ln.prop === st.prop) ln.ids = ln.ids.filter((id) => !ids.includes(id));
          }
          this.links = this.links.filter((ln) => ln.ids.length);
          const ln: Link = { scriptId, ids, prop: st.prop, value: st.value, inMin: st.inMin, inMax: st.inMax, from: st.from, to: st.to };
          ln.out = linkOutput(ln, asNum(this.eval(ln.value)));
          this.links.push(ln);
          this.dirty = true;
          break;
        }
      }
    }
  }

  /** Run all threads up to virtual time `to`. */
  private advance(to: number) {
    this.clock = Math.max(this.clock, to);
    for (const th of [...this.threads]) {
      let steps = 0;
      while (th.wake <= this.clock && steps < 2000) {
        steps++;
        this.current = th.wake;
        const r = th.gen.next();
        if (r.done) {
          this.threads = this.threads.filter((x) => x !== th);
          const script = this.scripts.find((s) => s.id === th.scriptId);
          if (script?.clearOnEnd) this.clearScript(th.scriptId);
          break;
        }
        if (r.value <= 0) {
          th.wake = this.clock + 1;
          break;
        }
        // keep exact timing: the next step starts where the wait ends, not "now"
        th.wake = th.wake + r.value * 1000;
      }
    }
    this.flush();
  }

  tick(realNow: number) {
    const dt = Math.min(250, Math.max(0, realNow - this.lastReal));
    this.lastReal = realNow;
    if (this.paused) return;

    // "Wenn ⟨…⟩" and "Solange ⟨…⟩" start when their condition turns true;
    // "Solange" scripts are cleared again when it turns false
    for (const s of this.scripts) {
      if (s.trigger.k !== "when" && s.trigger.k !== "while") continue;
      const v = asBool(this.eval(s.trigger.cond));
      const was = this.sensorState.get(s.id);
      if (v && !was) this.spawn(s, this.clock);
      if (!v && was && s.trigger.k === "while") this.clearScript(s.id);
      this.sensorState.set(s.id, v);
    }
    this.advance(this.clock + dt);
    if (this.live.length || this.links.length) {
      this.updateLive();
      this.updateLinks();
      this.flush();
    }
    // re-anchor so `since` stays consistent with the real clock
    this.epoch = realNow - this.clock;
  }

  private updateLinks() {
    for (const ln of this.links) {
      const out = linkOutput(ln, asNum(this.eval(ln.value)));
      if (ln.prop === "graph") {
        ln.out = out;
        if (out === undefined || (ln.sampledAt !== undefined && this.clock - ln.sampledAt < GRAPH_EVERY_MS)) continue;
        ln.series = [...(ln.series ?? []).slice(-(GRAPH_SAMPLES - 1)), Number(out)];
        ln.sampledAt = this.clock;
        this.dirty = true;
        continue;
      }
      if (out === ln.out) continue;
      ln.out = out;
      this.dirty = true;
    }
  }

  /** Links change the effect that is shown (from any layer) instead of replacing it. */
  private applyLinks(merged: Record<string, RuntimeOverride>) {
    const now = this.epoch + this.clock;
    for (const ln of this.links) {
      if (ln.out === undefined) continue;
      for (const id of ln.ids) {
        const base = merged[id] ?? { effect: "line", color: "#FFFFFF", since: this.epoch };
        if (base.effect === "off") continue;
        switch (ln.prop) {
          case "color":
            merged[id] = { ...base, color: String(ln.out) };
            break;
          case "size":
            merged[id] = { ...base, params: { ...base.params, size: Number(ln.out) } };
            break;
          case "brightness":
          case "level":
          case "amount":
            merged[id] = { ...base, params: { ...base.params, [ln.prop]: Number(ln.out) } };
            break;
          case "graph":
            merged[id] = { ...base, params: { ...base.params, series: ln.series ?? [] } };
            break;
          case "speed": {
            const max = effectDef(base.effect)?.maxSpeed ?? Infinity;
            const speed = Math.max(0.05, Math.min(Number(ln.out), max));
            let st = this.speedState.get(id);
            if (!st || st.baseSince !== base.since) {
              st = { baseSince: base.since, since: base.since, speed: Math.min(base.params?.speed ?? 1, max) };
            }
            // keep the animation where it is: same effect time before and after the change
            if (st.speed !== speed) {
              st.since = now - ((now - st.since) * st.speed) / speed;
              st.speed = speed;
            }
            this.speedState.set(id, st);
            merged[id] = { ...base, since: st.since, params: { ...base.params, speed } };
            break;
          }
        }
      }
    }
  }

  private flush() {
    if (!this.dirty) return;
    this.dirty = false;
    const merged: Record<string, RuntimeOverride> = {};
    // start scripts at the bottom, later triggered scripts on top
    const order = [
      ...this.layerOrder.filter((id) => this.scripts.find((s) => s.id === id)?.trigger.k === "start"),
      ...this.layerOrder.filter((id) => this.scripts.find((s) => s.id === id)?.trigger.k !== "start"),
    ];
    for (const id of order) Object.assign(merged, this.layers.get(id));
    this.applyLinks(merged);
    useRuntime.getState().setOverrides(merged);
  }
}

export const interpreter = new Interpreter();

export function compileCurrentProgram(): Script[] {
  return compileProgramJson(useProject.getState().project.program, isTimelineHat);
}

/** Start the current program, optionally already `atMs` into it. */
export async function startProgram(atMs = 0) {
  const scripts = compileCurrentProgram();
  useRuntime.getState().setScripts(scripts);
  interpreter.start(scripts, atMs);
  interpreter.setPaused(useRuntime.getState().paused);
  useRuntime.getState().setRunning(true);
}

/** Restart with the latest blocks but keep the current position (used while editing). */
export function restartKeepingTime() {
  if (!useRuntime.getState().running) return;
  void startProgram(interpreter.clock);
}

export function stopProgram() {
  interpreter.stop();
  useRuntime.getState().setRunning(false);
}

export function setPaused(p: boolean) {
  interpreter.setPaused(p);
  useRuntime.getState().setPaused(p);
}

/** Jump to a time of the start timeline. */
export function seek(ms: number) {
  const scripts = compileCurrentProgram();
  useRuntime.getState().setScripts(scripts);
  interpreter.start(scripts, Math.max(0, ms));
  interpreter.setPaused(useRuntime.getState().paused);
  useRuntime.getState().setRunning(true);
}
