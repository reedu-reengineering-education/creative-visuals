"use client";

import { create } from "zustand";
import { GROUP_COLORS } from "./palette";
import { t } from "./i18n";
import { layerOrder, uid } from "./geometry";
import { emptyProgram, emptyTimeline, upsertTimeline, nextScriptY, type Clip } from "./timeline";

export { layerOrder };
import type { Aspect, EffectAssignment, Group, Mode, Project, Stroke } from "./types";

const STORAGE_KEY = "lichtwerk.project.v1";

export function aspectRatio(a: Aspect): number {
  if (a === "4:3") return 4 / 3;
  if (a === "16:10") return 16 / 10;
  return 16 / 9;
}

export function createDefaultProject(): Project {
  const groups: Group[] = GROUP_COLORS.slice(0, 5).map((g) => ({
    id: uid("g"),
    name: t(g.nameKey),
    color: g.color,
  }));
  return {
    version: 1,
    aspect: "16:9",
    groups,
    strokes: [],
    groupEffects: {},
    strokeEffects: {},
    program: null,
  };
}

/**
 * Older projects stored effects per group / stroke. Turn them into clips of a
 * start timeline so the timeline and the blocks are the only place for effects.
 */
function migrateStaticEffects(p: Project): Project {
  const groupFx = Object.entries(p.groupEffects ?? {});
  const strokeFx = Object.entries(p.strokeEffects ?? {});
  let program = p.program ?? emptyProgram();
  if (groupFx.length || strokeFx.length) {
    const tl = emptyTimeline({ k: "start" }, p.program ? nextScriptY(p.program) : 40);
    const clips: Clip[] = [];
    for (const [groupId, e] of groupFx) {
      clips.push({ id: "", groupId, nr: null, effect: e.effect, color: e.color, sequence: e.sequence, start: 0, duration: tl.duration });
    }
    for (const [strokeId, e] of strokeFx) {
      const s = p.strokes.find((x) => x.id === strokeId);
      if (!s) continue;
      const nr = p.strokes.filter((x) => x.groupId === s.groupId).indexOf(s) + 1;
      clips.push({ id: "", groupId: s.groupId, nr, effect: e.effect, color: e.color, sequence: "together", start: 0, duration: tl.duration });
    }
    tl.clips = clips;
    // replace the empty default start timeline if that is all there is
    program = p.program ? upsertTimeline(program, tl) : upsertTimeline({ blocks: { languageVersion: 0, blocks: [] } }, tl);
  }
  return { ...p, program, groupEffects: {}, strokeEffects: {} };
}

export function loadStoredProject(): Project | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Project;
    if (p && p.version === 1 && Array.isArray(p.strokes) && Array.isArray(p.groups)) return p;
  } catch {
    /* ignore broken / unavailable storage */
  }
  return null;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
function persist(project: Project) {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
    } catch {
      /* ignore */
    }
  }, 300);
}

/** Index (0-based) of a stroke within its group, in drawing order, and the group size. */
export function strokeIndex(project: Project, stroke: Stroke): { index: number; count: number } {
  let index = 0;
  let count = 0;
  for (const s of project.strokes) {
    if (s.groupId !== stroke.groupId) continue;
    if (s.id === stroke.id) index = count;
    count++;
  }
  return { index, count };
}

export type LayerMove = "front" | "forward" | "backward" | "back";

export function strokesOfGroup(project: Project, groupId: string): Stroke[] {
  return project.strokes.filter((s) => s.groupId === groupId);
}

interface ProjectState {
  project: Project;
  hydrated: boolean;
  mode: Mode;
  activeGroupId: string | null;
  tool: "pen" | "eraser";
  selectedStrokeId: string | null;
  history: Stroke[][];

  hydrate: () => void;
  replaceProject: (p: Project) => void;
  newProject: () => void;
  setMode: (m: Mode) => void;
  setTool: (tool: "pen" | "eraser") => void;
  setActiveGroup: (id: string) => void;
  setAspect: (a: Aspect) => void;

  addStroke: (s: Omit<Stroke, "id" | "groupId">) => void;
  removeStroke: (id: string) => void;
  moveLayer: (id: string, move: LayerMove) => void;
  clearStrokes: () => void;
  undo: () => void;

  addGroup: () => void;
  renameGroup: (id: string, name: string) => void;
  deleteGroup: (id: string) => void;
  moveStrokeToGroup: (strokeId: string, groupId: string) => void;

  selectStroke: (id: string | null) => void;
  setGroupEffect: (groupId: string, e: EffectAssignment) => void;
  setStrokeEffect: (strokeId: string, e: EffectAssignment | null) => void;
  setProgram: (program: unknown) => void;
}

export const useProject = create<ProjectState>((set, get) => {
  /** Apply a change to the project and persist it. */
  const update = (fn: (p: Project) => Project, pushHistory = false) => {
    const prev = get().project;
    const next = fn(prev);
    const history = pushHistory ? [...get().history.slice(-49), prev.strokes] : get().history;
    set({ project: next, history });
    persist(next);
  };

  return {
    project: { version: 1, aspect: "16:9", groups: [], strokes: [], groupEffects: {}, strokeEffects: {}, program: null },
    hydrated: false,
    mode: "draw",
    activeGroupId: null,
    tool: "pen",
    selectedStrokeId: null,
    history: [],

    hydrate: () => {
      const project = migrateStaticEffects(loadStoredProject() ?? createDefaultProject());
      set({ project, hydrated: true, activeGroupId: project.groups[1]?.id ?? project.groups[0]?.id ?? null });
    },
    replaceProject: (p) => {
      set({ project: p, history: [], selectedStrokeId: null, activeGroupId: p.groups[0]?.id ?? null });
      persist(p);
    },
    newProject: () => {
      const p = { ...createDefaultProject(), program: emptyProgram() };
      set({ project: p, history: [], selectedStrokeId: null, activeGroupId: p.groups[1]?.id ?? null });
      persist(p);
    },
    setMode: (mode) => set({ mode, selectedStrokeId: mode === "effects" ? get().selectedStrokeId : null }),
    setTool: (tool) => set({ tool }),
    setActiveGroup: (id) => set({ activeGroupId: id, tool: "pen" }),
    setAspect: (aspect) => update((p) => ({ ...p, aspect })),

    addStroke: (s) => {
      const groupId = get().activeGroupId ?? get().project.groups[0]?.id;
      if (!groupId) return;
      update((p) => {
        const z = p.strokes.reduce((m, x, i) => Math.max(m, x.z ?? i), -1) + 1;
        return { ...p, strokes: [...p.strokes, { ...s, id: uid("s"), groupId, z }] };
      }, true);
    },
    removeStroke: (id) =>
      update((p) => {
        const strokeEffects = { ...p.strokeEffects };
        delete strokeEffects[id];
        return { ...p, strokes: p.strokes.filter((s) => s.id !== id), strokeEffects };
      }, true),
    moveLayer: (id, move) =>
      update((p) => {
        const order = layerOrder(p.strokes).map((s) => s.id);
        const i = order.indexOf(id);
        if (i < 0) return p;
        order.splice(i, 1);
        const j =
          move === "front" ? order.length : move === "back" ? 0 : move === "forward" ? Math.min(order.length, i + 1) : Math.max(0, i - 1);
        order.splice(j, 0, id);
        const z = new Map(order.map((sid, k) => [sid, k]));
        return { ...p, strokes: p.strokes.map((s) => ({ ...s, z: z.get(s.id) })) };
      }, true),
    clearStrokes: () => update((p) => ({ ...p, strokes: [], strokeEffects: {} }), true),
    undo: () => {
      const history = get().history;
      if (!history.length) return;
      const strokes = history[history.length - 1];
      set({ history: history.slice(0, -1) });
      update((p) => ({ ...p, strokes }));
    },

    addGroup: () => {
      const used = new Set(get().project.groups.map((g) => g.color));
      const next = GROUP_COLORS.find((g) => !used.has(g.color)) ?? GROUP_COLORS[get().project.groups.length % GROUP_COLORS.length];
      const group: Group = { id: uid("g"), name: t(next.nameKey), color: next.color };
      update((p) => ({ ...p, groups: [...p.groups, group] }));
      set({ activeGroupId: group.id, tool: "pen" });
    },
    renameGroup: (id, name) =>
      update((p) => ({ ...p, groups: p.groups.map((g) => (g.id === id ? { ...g, name: name.trim() || g.name } : g)) })),
    deleteGroup: (id) => {
      const p = get().project;
      if (p.strokes.some((s) => s.groupId === id) || p.groups.length <= 1) return;
      update((proj) => {
        const groupEffects = { ...proj.groupEffects };
        delete groupEffects[id];
        return { ...proj, groups: proj.groups.filter((g) => g.id !== id), groupEffects };
      });
      if (get().activeGroupId === id) set({ activeGroupId: get().project.groups[0]?.id ?? null });
    },
    moveStrokeToGroup: (strokeId, groupId) =>
      update(
        (p) => ({
          ...p,
          // move it to the end so it gets the next number in its new group
          strokes: [
            ...p.strokes.filter((s) => s.id !== strokeId),
            ...p.strokes.filter((s) => s.id === strokeId).map((s) => ({ ...s, groupId })),
          ],
        }),
        true,
      ),

    selectStroke: (id) => set({ selectedStrokeId: id }),
    setGroupEffect: (groupId, e) => update((p) => ({ ...p, groupEffects: { ...p.groupEffects, [groupId]: e } })),
    setStrokeEffect: (strokeId, e) =>
      update((p) => {
        const strokeEffects = { ...p.strokeEffects };
        if (e) strokeEffects[strokeId] = e;
        else delete strokeEffects[strokeId];
        return { ...p, strokeEffects };
      }),
    setProgram: (program) => update((p) => ({ ...p, program })),
  };
});
