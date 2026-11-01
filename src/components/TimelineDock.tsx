"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useProject } from "@/lib/store";
import { useLang, useT } from "@/lib/i18n";
import { interpreter, seek, setPaused, startProgram, useRuntime } from "@/lib/runtime";
import {
  MIN_CLIP,
  SNAP,
  clipRowKey,
  emptyTimeline,
  nextScriptY,
  parseProgram,
  snap,
  type Clip,
  type ScriptView,
  type Timeline,
} from "@/lib/timeline";
import { clipKey, deleteScript, saveTimeline, useTimelineUi, viewId } from "@/lib/timelineUi";
import { EFFECT_PREVIEW, IconBlocks, IconPlus, IconTrash } from "./Icons";

/* ---------------------------------------------------------------- helpers */

const RAINBOW = "linear-gradient(90deg,#FF6B5E,#FFE45C,#7CF29A,#5CE6E0,#5C9DFF,#B07CFF)";

function clipBackground(c: Clip, groupColor: string): string {
  if (c.effect === "off") return "repeating-linear-gradient(135deg,#2a2d33 0 6px,#23262c 6px 12px)";
  if (c.color === "rainbow") return RAINBOW;
  if (c.color === "group") return groupColor;
  if (c.color === "random") return "repeating-linear-gradient(90deg,#FF6B5E 0 10px,#5C9DFF 10px 20px,#7CF29A 20px 30px)";
  return c.color;
}

function fmt(sec: number, lang: string) {
  return sec.toLocaleString(lang === "de" ? "de-DE" : "en-GB", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

/* ---------------------------------------------------------------- component */

interface Drag {
  clip: Clip;
  mode: "move" | "start" | "end";
  x0: number;
  min: number;
  max: number;
  moved: boolean;
}

/**
 * The start show as a timeline. Only "Wenn Start" scripts are shown here:
 * everything that reacts (buttons, keys, sensors, variables) is programmed
 * in the code mode.
 */
export default function TimelineDock({ onOpenCode }: { onOpenCode: () => void }) {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const program = useProject((s) => s.project.program);
  const groups = useProject((s) => s.project.groups);
  const strokes = useProject((s) => s.project.strokes);
  const selectedStrokeId = useProject((s) => s.selectedStrokeId);
  const running = useRuntime((s) => s.running);
  const paused = useRuntime((s) => s.paused);
  const ui = useTimelineUi();

  const views = useMemo(
    () => parseProgram(program).filter((v) => v.kind === "timeline" && v.timeline.trigger.k === "start"),
    [program],
  );
  const active: ScriptView | undefined = views.find((v) => viewId(v) === ui.activeId) ?? views[0];
  const tl = active?.kind === "timeline" ? active.timeline : null;

  const [trackW, setTrackW] = useState(600);
  const rulerRef = useRef<HTMLDivElement>(null);
  const playheadRef = useRef<HTMLDivElement>(null);
  const timeRef = useRef<HTMLSpanElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [draft, setDraft] = useState<{ start: number; duration: number } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // keep the active tab valid
  useEffect(() => {
    if (active && viewId(active) !== ui.activeId) ui.setActive(viewId(active));
    setConfirmDelete(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active && viewId(active)]);

  // the effects mode always plays
  useEffect(() => {
    if (!useRuntime.getState().running) void startProgram();
  }, []);

  // tapping a shape on the wall selects its row
  useEffect(() => {
    if (!selectedStrokeId) return;
    const s = strokes.find((x) => x.id === selectedStrokeId);
    if (!s) return;
    const count = strokes.filter((x) => x.groupId === s.groupId).length;
    if (count > 1) useTimelineUi.getState().toggleExpanded(s.groupId, true);
    useTimelineUi.getState().selectRow(s.groupId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStrokeId]);

  // track width
  useLayoutEffect(() => {
    const el = rulerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setTrackW(el.clientWidth));
    ro.observe(el);
    setTrackW(el.clientWidth);
    return () => ro.disconnect();
  }, [tl?.id, ui.collapsed]);

  const duration = tl?.duration ?? 6;
  const pps = trackW / duration;

  // playhead + time readout
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      if (!tl) return;
      let pos = interpreter.position(tl.id);
      const dur = tl.duration * 1000;
      if (pos === null || !useRuntime.getState().running) pos = 0;
      else if (tl.loop) pos = ((pos % dur) + dur) % dur;
      else pos = Math.min(pos, dur);
      const x = (pos / 1000) * (trackW / tl.duration);
      if (playheadRef.current) playheadRef.current.style.transform = `translateX(${x}px)`;
      if (timeRef.current) timeRef.current.textContent = `${fmt(pos / 1000, lang)} / ${fmt(tl.duration, lang)} s`;
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [tl, trackW, lang]);

  /* -------------------------------------------------------------- actions */

  const update = (next: Timeline) => saveTimeline(next);

  const rows = useMemo(() => {
    const out: { key: string; groupId: string; nr: number | null; label: string; color: string; count: number }[] = [];
    for (const g of groups) {
      const count = strokes.filter((s) => s.groupId === g.id).length;
      if (!count) continue;
      out.push({ key: g.id, groupId: g.id, nr: null, label: g.name, color: g.color, count });
      if (count > 1 && ui.expanded[g.id]) {
        for (let i = 1; i <= count; i++)
          out.push({ key: `${g.id}#${i}`, groupId: g.id, nr: i, label: t("effects.nr", { nr: i }), color: g.color, count });
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups, strokes, ui.expanded, lang]);

  const rowClips = (key: string) => (tl ? tl.clips.filter((c) => clipRowKey(c) === key) : []);

  const bounds = (clip: Clip) => {
    const others = rowClips(clipRowKey(clip)).filter((c) => clipKey(c) !== clipKey(clip));
    const end = clip.start + clip.duration;
    const prevEnd = Math.max(0, ...others.filter((c) => c.start + c.duration <= clip.start + 1e-6).map((c) => c.start + c.duration));
    const nextStart = Math.min(duration, ...others.filter((c) => c.start >= end - 1e-6).map((c) => c.start));
    return { prevEnd, nextStart };
  };

  const addClipAt = (row: (typeof rows)[number], sec: number) => {
    if (!tl) return;
    const start = Math.max(0, Math.floor(sec / SNAP) * SNAP);
    const others = rowClips(row.key);
    if (others.some((c) => start >= c.start - 1e-6 && start < c.start + c.duration - 1e-6)) return;
    const nextStart = Math.min(duration, ...others.filter((c) => c.start > start).map((c) => c.start));
    const end = Math.min(start + 2, nextStart);
    if (end - start < MIN_CLIP) return;
    const clip: Clip = {
      id: "",
      groupId: row.groupId,
      nr: row.nr,
      effect: "glow",
      color: "#FFD98A",
      sequence: "together",
      start,
      duration: end - start,
    };
    update({ ...tl, clips: [...tl.clips, clip] });
    ui.selectClip(clipKey(clip), row.key);
  };

  const onTrackPointerUp = (row: (typeof rows)[number], e: React.PointerEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    const rect = e.currentTarget.getBoundingClientRect();
    addClipAt(row, (e.clientX - rect.left) / pps);
  };

  const onClipPointerDown = (clip: Clip, e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    const rect = e.currentTarget.getBoundingClientRect();
    const local = e.clientX - rect.left;
    const handle = Math.min(16, rect.width / 3);
    const mode: Drag["mode"] = local < handle ? "start" : local > rect.width - handle ? "end" : "move";
    const { prevEnd, nextStart } = bounds(clip);
    setDrag({ clip, mode, x0: e.clientX, min: prevEnd, max: nextStart, moved: false });
    setDraft({ start: clip.start, duration: clip.duration });
    ui.selectClip(clipKey(clip), clipRowKey(clip));
  };

  const onClipPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag) return;
    const dx = (e.clientX - drag.x0) / pps;
    if (!drag.moved && Math.abs(e.clientX - drag.x0) < 4) return;
    const c = drag.clip;
    const end = c.start + c.duration;
    let start = c.start;
    let dur = c.duration;
    if (drag.mode === "move") {
      start = Math.min(Math.max(snap(c.start + dx), drag.min), drag.max - c.duration);
    } else if (drag.mode === "start") {
      start = Math.min(Math.max(snap(c.start + dx), drag.min), end - MIN_CLIP);
      dur = end - start;
    } else {
      const e2 = Math.min(Math.max(snap(end + dx), c.start + MIN_CLIP), drag.max);
      dur = e2 - c.start;
    }
    setDrag({ ...drag, moved: true });
    setDraft({ start, duration: dur });
  };

  const onClipPointerUp = () => {
    if (drag && draft && tl && drag.moved) {
      const key = clipKey(drag.clip);
      const moved = { ...drag.clip, start: draft.start, duration: draft.duration };
      update({ ...tl, clips: tl.clips.map((c) => (clipKey(c) === key ? moved : c)) });
      ui.selectClip(clipKey(moved), clipRowKey(moved));
    }
    setDrag(null);
    setDraft(null);
  };

  const scrub = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!tl) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const sec = Math.min(Math.max(0, (e.clientX - rect.left) / pps), tl.duration - 0.01);
    seek(sec * 1000);
  };

  const addShow = () => {
    const tl2 = emptyTimeline({ k: "start" }, nextScriptY(program));
    update(tl2);
    ui.setActive(tl2.id);
  };

  /* -------------------------------------------------------------- render */

  const ticks = useMemo(() => {
    const step = duration > 30 ? 5 : duration > 12 ? 2 : 1;
    const out: number[] = [];
    for (let s = 0; s <= duration + 1e-6; s += step) out.push(s);
    return out;
  }, [duration]);

  const canDelete = views.length > 1;

  return (
    <section className={`dock bar${ui.collapsed ? " collapsed" : ""}`} aria-label={t("mode.effects")}>
      <div className="dock-head">
        <div className="tabs" role="tablist">
          {views.map((v, i) => {
            const id = viewId(v);
            const on = active && viewId(active) === id;
            return (
              <button key={id} role="tab" aria-selected={!!on} className={`tab${on ? " on" : ""}`} onClick={() => ui.setActive(id)}>
                <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M7 4.5v15l12-7.5z" />
                </svg>
                <span>{views.length > 1 ? `${t("tl.start")} ${i + 1}` : t("tl.start")}</span>
              </button>
            );
          })}
          {/* one show is enough; "Neue Show" only appears when the program has none */}
          {views.length === 0 && (
            <button className="tab add" onClick={addShow}>
              <IconPlus />
              <span>{t("tl.addShow")}</span>
            </button>
          )}
        </div>
        <button className="chip dock-more" onClick={onOpenCode} title={t("tl.moreInCode")}>
          <IconBlocks />
          <span>{t("tl.moreInCode")}</span>
        </button>
        <button
          className="round small"
          aria-label={ui.collapsed ? t("tl.expand") : t("tl.collapse")}
          title={ui.collapsed ? t("tl.expand") : t("tl.collapse")}
          onClick={() => ui.setCollapsed(!ui.collapsed)}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d={ui.collapsed ? "M6 15l6-6 6 6" : "M6 9l6 6 6-6"} />
          </svg>
        </button>
      </div>

      {!ui.collapsed && !tl && <p className="muted tl-hint">{t("tl.noShow")}</p>}

      {!ui.collapsed && tl && (
        <>
          <div className="dock-tools">
            <button
              className="round small"
              aria-label={paused || !running ? t("tl.play") : t("tl.pause")}
              title={paused || !running ? t("tl.play") : t("tl.pause")}
              onClick={() => {
                if (!running) void startProgram();
                setPaused(running ? !paused : false);
              }}
            >
              {paused || !running ? (
                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
                  <path d="M7 4.5v15l12-7.5z" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
                  <rect x="6" y="5" width="4" height="14" rx="1" />
                  <rect x="14" y="5" width="4" height="14" rx="1" />
                </svg>
              )}
            </button>
            <button className="round small" aria-label={t("tl.restart")} title={t("tl.restart")} onClick={() => seek(0)}>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <path d="M6 5v14M18 6l-9 6 9 6z" />
              </svg>
            </button>
            <span className="time" ref={timeRef} />

            <div className="spacer" />
            <label className="field">
              <span>{t("tl.duration")}</span>
              <button className="step" onClick={() => update({ ...tl, duration: Math.max(1, tl.duration - 1) })} aria-label="−">
                −
              </button>
              <b>{fmt(tl.duration, lang)} s</b>
              <button className="step" onClick={() => update({ ...tl, duration: Math.min(60, tl.duration + 1) })} aria-label="+">
                +
              </button>
            </label>
            <label className="toggle">
              <input type="checkbox" checked={tl.loop} onChange={(e) => update({ ...tl, loop: e.target.checked })} />
              {t("tl.loop")}
            </label>
            {canDelete && (
              <button
                className={`round small${confirmDelete ? " danger-bg" : ""}`}
                aria-label={confirmDelete ? t("tl.deleteConfirm") : t("tl.delete")}
                title={confirmDelete ? t("tl.deleteConfirm") : t("tl.delete")}
                onClick={() => (confirmDelete ? deleteScript(tl.id) : setConfirmDelete(true))}
              >
                <IconTrash />
              </button>
            )}
          </div>

          <div className="tl">
            <div className="tl-row tl-ruler-row">
              <div className="tl-label" />
              <div className="tl-ruler" ref={rulerRef} onPointerDown={scrub} onPointerMove={(e) => e.buttons && scrub(e)}>
                {ticks.map((s) => (
                  <span key={s} className="tick" style={{ left: s * pps }}>
                    {s}
                  </span>
                ))}
              </div>
            </div>
            <div className="tl-rows">
              {rows.length === 0 && <p className="muted" style={{ padding: "12px 4px" }}>{t("tl.noShapes")}</p>}
              {rows.map((row) => (
                <div key={row.key} className={`tl-row${ui.selectedRow === row.key ? " sel" : ""}${row.nr !== null ? " item" : ""}`}>
                  <div className="tl-label" onClick={() => ui.selectRow(row.key)}>
                    {row.nr === null && row.count > 1 ? (
                      <button
                        className="chev"
                        aria-label={row.label}
                        aria-expanded={!!ui.expanded[row.groupId]}
                        onClick={(e) => {
                          e.stopPropagation();
                          ui.toggleExpanded(row.groupId);
                        }}
                      >
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true" style={{ transform: ui.expanded[row.groupId] ? "rotate(90deg)" : "none" }}>
                          <path d="M9 6l6 6-6 6" />
                        </svg>
                      </button>
                    ) : (
                      <span className="chev-space" />
                    )}
                    <span className="gd" style={{ background: row.color, opacity: row.nr === null ? 1 : 0.6 }} />
                    <span className="name">{row.label}</span>
                  </div>
                  <div className="tl-track" onPointerUp={(e) => onTrackPointerUp(row, e)}>
                    {rowClips(row.key).map((c) => {
                      const key = clipKey(c);
                      const isDrag = drag && clipKey(drag.clip) === key && draft;
                      const start = isDrag ? draft!.start : c.start;
                      const dur = isDrag ? draft!.duration : c.duration;
                      const Preview = EFFECT_PREVIEW[c.effect];
                      return (
                        <div
                          key={key}
                          className={`clip${ui.selectedClipId === key ? " on" : ""}${c.effect === "off" ? " off" : ""}`}
                          style={{ left: start * pps, width: Math.max(8, dur * pps - 3), background: clipBackground(c, row.color) }}
                          onPointerDown={(e) => onClipPointerDown(c, e)}
                          onPointerMove={onClipPointerMove}
                          onPointerUp={onClipPointerUp}
                          onPointerCancel={onClipPointerUp}
                        >
                          <span className="clip-label">
                            <Preview />
                            {t(`effect.${c.effect}` as "effect.glow")}
                            {c.sequence === "sequential" ? " ›››" : ""}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
              {tl.clips.length === 0 && rows.length > 0 && <p className="muted tl-hint">{t("tl.emptyHint")}</p>}
            </div>
            <div className="tl-playhead-wrap">
              <div className="tl-playhead" ref={playheadRef} />
            </div>
          </div>
        </>
      )}
    </section>
  );
}
