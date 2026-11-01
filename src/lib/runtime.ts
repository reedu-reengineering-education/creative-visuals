"use client";

import { create } from "zustand";
import { useProject } from "./store";
import { useSensors } from "./sensors";
import { compileProgramJson } from "./blockJson";
import { isTimelineHat } from "./timeline";
import { cleanParams, sameParams } from "./params";
import type { Cond, Script, Stmt, Target } from "./program";
import type { Project, RuntimeOverride } from "./types";

interface RuntimeState {
  running: boolean;
  paused: boolean;
  overrides: Record<string, RuntimeOverride>;
  scripts: Script[];
  /** true while an output window answered within the last few seconds */
  outputConnected: boolean;
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

function evalCond(c: Cond): boolean {
  const v = useSensors.getState().values[c.sensor];
  if (v === undefined || !Number.isFinite(v)) return false;
  return c.op === ">" ? v > c.value : v < c.value;
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
    this.clock = 0;
    this.epoch = Date.now() - atMs;
    this.lastReal = Date.now();
    for (const s of scripts) {
      if (s.trigger.k === "start") this.spawn(s, 0);
      if (s.trigger.k === "sensor") this.sensorState.set(s.id, false);
    }
    this.dirty = true;
    this.advance(atMs);
  }

  stop() {
    this.threads = [];
    this.layers.clear();
    this.layerOrder = [];
    this.startedAt.clear();
    this.dirty = true;
    this.flush();
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

  tap() {
    for (const s of this.scripts) if (s.trigger.k === "tap") this.spawn(s, this.clock);
    this.advance(this.clock);
  }

  /** Start one script by hand (the "▶" on an event tab), optionally already some ms into it. */
  fire(scriptId: string, offsetMs = 0) {
    const s = this.scripts.find((x) => x.id === scriptId);
    if (!s) return;
    this.spawn(s, this.clock - offsetMs);
    this.advance(this.clock);
  }

  /** Where is a script right now? (ms since it started, or null) */
  position(scriptId: string): number | null {
    const at = this.startedAt.get(scriptId);
    if (at === undefined) return null;
    return this.clock - at;
  }

  isActive(scriptId: string): boolean {
    return this.threads.some((t) => t.scriptId === scriptId);
  }

  private spawn(script: Script, at: number) {
    // restart an already running copy of this script (like Scratch does)
    this.threads = this.threads.filter((t) => t.scriptId !== script.id);
    const thread: Thread = { scriptId: script.id, gen: null as unknown as Thread["gen"], wake: at, waited: 0 };
    thread.gen = this.run(script.body, { thisId: null, thread });
    this.threads.push(thread);
    this.startedAt.set(script.id, at);
    this.layers.set(script.id, {});
    this.layerOrder = [...this.layerOrder.filter((id) => id !== script.id), script.id];
    this.dirty = true;
  }

  private setEffect(scriptId: string, ids: string[], st: Extract<Stmt, { k: "effect" }>) {
    const since = this.epoch + this.current;
    const layer = this.layers.get(scriptId) ?? {};
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
          yield* this.run(evalCond(st.cond) ? st.body : st.elseBody, ctx);
          break;
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
          if (script?.clearOnEnd) {
            this.layers.delete(th.scriptId);
            this.layerOrder = this.layerOrder.filter((id) => id !== th.scriptId);
            this.startedAt.delete(th.scriptId);
            this.dirty = true;
          }
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

    // sensor triggers fire when the condition becomes true
    for (const s of this.scripts) {
      if (s.trigger.k !== "sensor") continue;
      const v = evalCond(s.trigger.cond);
      if (v && !this.sensorState.get(s.id)) this.spawn(s, this.clock);
      this.sensorState.set(s.id, v);
    }
    this.advance(this.clock + dt);
    // re-anchor so `since` stays consistent with the real clock
    this.epoch = realNow - this.clock;
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
