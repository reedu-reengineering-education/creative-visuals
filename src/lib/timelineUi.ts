"use client";

import { create } from "zustand";
import { useProject } from "./store";
import { parseProgram, upsertTimeline, removeScript, type Clip, type Timeline } from "./timeline";

/** UI state of the timeline (which tab, which clip, which rows are open). */
interface TimelineUiState {
  activeId: string | null;
  selectedClipId: string | null;
  /** row key ("groupId" or "groupId#nr") of the selected row */
  selectedRow: string | null;
  expanded: Record<string, boolean>;
  collapsed: boolean;
  /** side panel folded down to its title, so the whole stage is visible */
  panelMin: boolean;
  setActive: (id: string) => void;
  selectClip: (id: string | null, row?: string | null) => void;
  selectRow: (row: string | null) => void;
  toggleExpanded: (groupId: string, open?: boolean) => void;
  setCollapsed: (c: boolean) => void;
  setPanelMin: (m: boolean) => void;
}

export const useTimelineUi = create<TimelineUiState>((set, get) => ({
  activeId: null,
  selectedClipId: null,
  selectedRow: null,
  expanded: {},
  // effects are picked by tapping the shapes; the timeline only opens on request
  collapsed: true,
  panelMin: false,
  setActive: (activeId) => set({ activeId, selectedClipId: null }),
  selectClip: (selectedClipId, row) => set({ selectedClipId, selectedRow: row === undefined ? get().selectedRow : row }),
  selectRow: (selectedRow) => set({ selectedRow, selectedClipId: null }),
  toggleExpanded: (groupId, open) =>
    set({ expanded: { ...get().expanded, [groupId]: open ?? !get().expanded[groupId] } }),
  setCollapsed: (collapsed) => set({ collapsed }),
  setPanelMin: (panelMin) => set({ panelMin }),
}));

/** All timelines / code scripts of the current program. */
export function currentViews() {
  return parseProgram(useProject.getState().project.program);
}

export function activeTimeline(): Timeline | null {
  const id = useTimelineUi.getState().activeId;
  const views = currentViews();
  const v = views.find((x) => (x.kind === "timeline" ? x.timeline.id : x.id) === id) ?? views[0];
  return v && v.kind === "timeline" ? v.timeline : null;
}

/** The "Wenn Start" timeline the effects mode works on (the active tab, else the first one). */
export function startTimeline(): Timeline | null {
  const id = useTimelineUi.getState().activeId;
  const list = currentViews().flatMap((v) => (v.kind === "timeline" && v.timeline.trigger.k === "start" ? [v.timeline] : []));
  return list.find((x) => x.id === id) ?? list[0] ?? null;
}

/** Write a changed timeline back into the blocks. */
export function saveTimeline(tl: Timeline) {
  const { project, setProgram } = useProject.getState();
  setProgram(upsertTimeline(project.program, tl));
}

export function deleteScript(id: string) {
  const { project, setProgram } = useProject.getState();
  setProgram(removeScript(project.program, id));
  useTimelineUi.getState().setActive(currentViews()[0] ? viewId(currentViews()[0]) : "");
}

export function viewId(v: ReturnType<typeof currentViews>[number]): string {
  return v.kind === "timeline" ? v.timeline.id : v.id;
}

export function clipKey(c: Pick<Clip, "groupId" | "nr" | "start">) {
  return `${c.nr === null ? c.groupId : `${c.groupId}#${c.nr}`}@${Math.round(c.start * 100) / 100}`;
}
