"use client";

import { useEffect, useRef } from "react";
import { aspectRatio, useProject } from "@/lib/store";
import { useRuntime } from "@/lib/runtime";
import { renderStage, type View } from "@/lib/render";
import { useSensors } from "@/lib/sensors";
import { dist, finishStroke, hitTest } from "@/lib/geometry";
import type { Point, Project, RuntimeOverride } from "@/lib/types";

interface StageProps {
  view: View;
  /** "draw" = pen/eraser, "select" = tap to select, "tap" = forward taps, "none" */
  interaction: "draw" | "select" | "tap" | "none";
  onTap?: () => void;
  onTwoFingers?: () => void;
  /** Long press (or right click) on a stroke */
  onLongPress?: (strokeId: string, clientX: number, clientY: number) => void;
  /** Stroke to highlight (e.g. while its menu is open) */
  highlightId?: string | null;
  /** Strokes to mark with a dashed frame (selected timeline row) */
  highlightIds?: string[];
  /** Use these instead of the stores (output window). */
  source?: () => { project: Project; overrides: Record<string, RuntimeOverride>; running: boolean };
  /** inset in px that must stay free (e.g. under the top bar) – not used for the projection itself */
  className?: string;
}

/** The projection area: keeps the projector's aspect ratio, black, letterboxed. */
export default function Stage({ view, interaction, onTap, onTwoFingers, onLongPress, highlightId, highlightIds, source }: StageProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const size = useRef({ w: 0, h: 0, dpr: 1 });
  const draft = useRef<Point[] | null>(null);
  const cursor = useRef<Point | null>(null);
  const erased = useRef<Set<string>>(new Set());
  const pointers = useRef<Set<number>>(new Set());
  const press = useRef<{ timer: ReturnType<typeof setTimeout> | null; start: Point | null; fired: boolean }>({
    timer: null,
    start: null,
    fired: false,
  });
  const props = useRef({ view, interaction, onTap, onTwoFingers, onLongPress, highlightId, highlightIds, source });
  props.current = { view, interaction, onTap, onTwoFingers, onLongPress, highlightId, highlightIds, source };

  // layout: fit the canvas into the wrapper with the projector aspect ratio
  useEffect(() => {
    const wrap = wrapRef.current!;
    const canvas = canvasRef.current!;
    const layout = () => {
      const src = props.current.source?.().project ?? useProject.getState().project;
      const ar = aspectRatio(src.aspect);
      const W = wrap.clientWidth;
      const H = wrap.clientHeight;
      let w = W;
      let h = W / ar;
      if (h > H) {
        h = H;
        w = H * ar;
      }
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      size.current = { w, h, dpr };
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      canvas.style.left = `${(W - w) / 2}px`;
      canvas.style.top = `${(H - h) / 2}px`;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    };
    layout();
    const ro = new ResizeObserver(layout);
    ro.observe(wrap);
    let lastAspect = (props.current.source?.().project ?? useProject.getState().project).aspect;
    const iv = setInterval(() => {
      const a = (props.current.source?.().project ?? useProject.getState().project).aspect;
      if (a !== lastAspect) {
        lastAspect = a;
        layout();
      }
    }, 300);
    return () => {
      ro.disconnect();
      clearInterval(iv);
    };
  }, []);

  // forget pointers that were released somewhere else (e.g. on a menu)
  useEffect(() => {
    const up = (e: PointerEvent) => pointers.current.delete(e.pointerId);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, []);

  // render loop
  useEffect(() => {
    let raf = 0;
    const frame = () => {
      raf = requestAnimationFrame(frame);
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const { w, h, dpr } = size.current;
      if (!w || !h) return;
      const p = props.current;
      const data = p.source
        ? p.source()
        : {
            project: useProject.getState().project,
            overrides: useRuntime.getState().overrides,
            running: useRuntime.getState().running,
          };
      const st = useProject.getState();
      const activeGroup = data.project.groups.find((g) => g.id === st.activeGroupId);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      renderStage(ctx, {
        project: data.project,
        overrides: data.overrides,
        running: data.running,
        view: p.view,
        width: w,
        height: h,
        now: Date.now(),
        selectedId: p.highlightId ?? (p.view === "effects" ? st.selectedStrokeId : null),
        highlightIds: p.highlightIds,
        draft: draft.current,
        draftColor: activeGroup?.color,
        cursor: p.interaction === "draw" ? cursor.current : null,
        cursorColor: st.tool === "eraser" ? "#FFFFFF" : activeGroup?.color,
        sensors: useSensors.getState().values,
      });
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  const toPoint = (e: React.PointerEvent): Point => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.height };
  };

  const eraseAt = (p: Point) => {
    const { project, removeStroke } = useProject.getState();
    const ar = aspectRatio(project.aspect);
    const hit = hitTest(p, project.strokes, ar, 0.03);
    if (hit && !erased.current.has(hit.id)) {
      erased.current.add(hit.id);
      removeStroke(hit.id);
    }
  };

  const cancelPress = () => {
    if (press.current.timer) clearTimeout(press.current.timer);
    press.current.timer = null;
    press.current.start = null;
  };

  /** Open the shape menu for whatever is under the point. Returns true if there was a shape. */
  const openMenuAt = (p: Point, clientX: number, clientY: number) => {
    const cb = props.current.onLongPress;
    if (!cb) return false;
    const { project } = useProject.getState();
    const hit = hitTest(p, project.strokes, aspectRatio(project.aspect));
    if (!hit) return false;
    cb(hit.id, clientX, clientY);
    return true;
  };

  const lastPointerType = useRef("mouse");

  const onPointerDown = (e: React.PointerEvent) => {
    lastPointerType.current = e.pointerType;
    // right / middle mouse button: handled by the context menu
    if (e.pointerType === "mouse" && e.button !== 0) return;
    pointers.current.add(e.pointerId);
    try {
      (e.target as Element).setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    if (pointers.current.size >= 2) {
      // second finger: cancel the stroke, maybe leave show mode
      draft.current = null;
      cancelPress();
      props.current.onTwoFingers?.();
      return;
    }
    const p = toPoint(e);
    const mode = props.current.interaction;
    press.current.fired = false;
    if (
      e.button === 0 &&
      props.current.onLongPress &&
      (mode === "select" || (mode === "draw" && useProject.getState().tool === "pen"))
    ) {
      cancelPress();
      const { clientX, clientY } = e;
      press.current.start = p;
      press.current.timer = setTimeout(() => {
        press.current.timer = null;
        if (openMenuAt(p, clientX, clientY)) {
          press.current.fired = true;
          draft.current = null;
          // the finger will be lifted on top of the menu, not on the canvas
          pointers.current.clear();
        }
      }, 550);
    }
    if (mode === "draw") {
      cursor.current = p;
      if (useProject.getState().tool === "eraser") {
        erased.current = new Set();
        eraseAt(p);
        draft.current = null;
      } else {
        draft.current = [p];
      }
    } else if (mode === "select") {
      const { project, selectStroke } = useProject.getState();
      const hit = hitTest(p, project.strokes, aspectRatio(project.aspect));
      selectStroke(hit?.id ?? null);
    } else if (mode === "tap") {
      props.current.onTap?.();
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const p = toPoint(e);
    if (press.current.start && dist(press.current.start, p) > 0.012) cancelPress();
    if (props.current.interaction !== "draw") return;
    cursor.current = p;
    if (!pointers.current.has(e.pointerId)) return;
    if (useProject.getState().tool === "eraser") {
      eraseAt(p);
      return;
    }
    const d = draft.current;
    if (!d) return;
    const last = d[d.length - 1];
    if (dist(last, p) > 0.0015) d.push(p);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    cancelPress();
    if (press.current.fired) {
      press.current.fired = false;
      draft.current = null;
      return;
    }
    if (props.current.interaction !== "draw") return;
    const d = draft.current;
    draft.current = null;
    if (e.pointerType !== "mouse") cursor.current = null;
    if (!d || useProject.getState().tool === "eraser") return;
    const { project, addStroke } = useProject.getState();
    const done = finishStroke(d, aspectRatio(project.aspect));
    if (done) addStroke(done);
  };

  const onPointerLeave = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse" && !draft.current) cursor.current = null;
  };

  return (
    <div className="stage-wrap" ref={wrapRef}>
      <canvas
        ref={canvasRef}
        className="stage-canvas"
        style={{ cursor: interaction === "draw" ? "crosshair" : interaction === "select" ? "pointer" : "default" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={onPointerLeave}
        onContextMenu={(e) => {
          e.preventDefault();
          // right click on a laptop = long press
          if (lastPointerType.current === "mouse" && props.current.interaction !== "tap") {
            const rect = canvasRef.current!.getBoundingClientRect();
            openMenuAt(
              { x: (e.clientX - rect.left) / rect.width, y: (e.clientY - rect.top) / rect.height },
              e.clientX,
              e.clientY,
            );
          }
        }}
      />
    </div>
  );
}
