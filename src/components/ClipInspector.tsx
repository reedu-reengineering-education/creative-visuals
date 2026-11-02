"use client";

import { useEffect, useState } from "react";
import { useProject } from "@/lib/store";
import { useLang, useT } from "@/lib/i18n";
import { EFFECTS, EFFECT_CATEGORIES, effectDef, PICK_COLORS, SPECIAL_COLORS, type EffectCategory } from "@/lib/palette";
import { clipRowKey, emptyTimeline, nextScriptY, type Clip } from "@/lib/timeline";
import { clipKey, saveTimeline, startTimeline, useTimelineUi } from "@/lib/timelineUi";
import { interpreter } from "@/lib/runtime";
import type { ColorSpec, EffectType, Group, Sequence } from "@/lib/types";
import { cleanParams } from "@/lib/params";
import { EFFECT_PREVIEW, IconClose, IconSequential, IconTogether, IconTrash } from "./Icons";
import EffectSettings from "./EffectSettings";
import { LayerButtons } from "./ShapeMenu";

const RAINBOW = "conic-gradient(#FF6B5E, #FFE45C, #7CF29A, #5CE6E0, #5C9DFF, #B07CFF, #FF6B5E)";

/** Colour a new effect gets when it is picked for a shape that had none. */
const NEW_COLOR: ColorSpec = "#FFD98A";

/**
 * Side panel of the effects mode. Two ways in:
 * - tap a shape on the stage (the main way): edits the effect of its group or
 *   of just that shape – behind the scenes a clip of the start timeline;
 * - select a clip in the (optional) timeline: edits that clip incl. its time.
 */
export default function ClipInspector({ onOpenTimeline }: { onOpenTimeline: () => void }) {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const project = useProject((s) => s.project);
  const selectedStrokeId = useProject((s) => s.selectedStrokeId);
  const selectedClipId = useTimelineUi((s) => s.selectedClipId);
  const selectedRow = useTimelineUi((s) => s.selectedRow);
  const selectClip = useTimelineUi((s) => s.selectClip);
  const selectRow = useTimelineUi((s) => s.selectRow);
  useTimelineUi((s) => s.activeId);
  const min = useTimelineUi((s) => s.panelMin);
  const setMin = useTimelineUi((s) => s.setPanelMin);
  const minButton = (
    <button
      className="round"
      aria-label={min ? t("panel.expand") : t("panel.minimize")}
      title={min ? t("panel.expand") : t("panel.minimize")}
      aria-expanded={!min}
      onClick={() => setMin(!min)}
    >
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
        <path d={min ? "M6 9l6 6 6-6" : "M6 15l6-6 6 6"} />
      </svg>
    </button>
  );

  // tapping a shape on the wall selects its group; tapping next to all shapes closes the panel
  useEffect(() => {
    const { strokes } = useProject.getState().project;
    const s = strokes.find((x) => x.id === selectedStrokeId);
    const ui = useTimelineUi.getState();
    if (!s) {
      if (ui.selectedRow || ui.selectedClipId) ui.selectRow(null);
      return;
    }
    if (strokes.filter((x) => x.groupId === s.groupId).length > 1) ui.toggleExpanded(s.groupId, true);
    ui.selectRow(s.groupId);
    ui.setPanelMin(false);
  }, [selectedStrokeId]);

  const tl = startTimeline();
  const f = (n: number) => n.toLocaleString(lang === "de" ? "de-DE" : "en-GB", { maximumFractionDigits: 2 });
  const close = () => {
    selectRow(null);
    useProject.getState().selectStroke(null);
  };

  /* ---------- a clip selected in the timeline ---------- */

  const clip = tl?.clips.find((c) => clipKey(c) === selectedClipId) ?? null;
  if (clip && tl) {
    const group = project.groups.find((g) => g.id === clip.groupId);
    const patch = (p: Partial<Clip>) => {
      const next = { ...clip, ...p };
      saveTimeline({ ...tl, clips: tl.clips.map((c) => (clipKey(c) === clipKey(clip) ? next : c)) });
      selectClip(clipKey(next), clipRowKey(next));
    };
    const remove = () => {
      saveTimeline({ ...tl, clips: tl.clips.filter((c) => clipKey(c) !== clipKey(clip)) });
      selectClip(null);
    };
    return (
      <aside className={`panel clip-panel${min ? " min" : ""}`} aria-label={t("effects.effect")}>
        <div className="clip-head">
          <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
            <p className="lbl">{t("clip.time", { start: f(clip.start), end: f(clip.start + clip.duration) })}</p>
            <h2>
              <span className="gd" style={{ background: group?.color }} />
              <span className="ellipsis">
                {group?.name} · {clip.nr === null ? t("clip.whole") : t("effects.nr", { nr: clip.nr })}
              </span>
            </h2>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {!min && (
              <button className="round danger" aria-label={t("clip.delete")} title={t("clip.delete")} onClick={remove}>
                <IconTrash />
              </button>
            )}
            {minButton}
            <button className="round" aria-label={t("effects.close")} onClick={() => selectClip(null)}>
              <IconClose />
            </button>
          </div>
        </div>
        {!min && <EffectEditor clip={clip} group={group} onPatch={patch} />}
      </aside>
    );
  }

  /* ---------- a shape (its group, or just this one) ---------- */

  if (!selectedRow) return null;
  const [groupId, nrPart] = selectedRow.split("#");
  const nr = nrPart ? Number(nrPart) : null;
  const group = project.groups.find((g) => g.id === groupId);
  const members = project.strokes.filter((s) => s.groupId === groupId);
  if (!group || !members.length) return null;
  const stroke = project.strokes.find((s) => s.id === selectedStrokeId && s.groupId === groupId) ?? null;
  // the shape that "Nur Nr. …" means: the tapped one, or the row's
  const itemNr = stroke ? members.indexOf(stroke) + 1 : nr;

  const rowClips = (tl?.clips ?? []).filter((c) => clipRowKey(c) === selectedRow).sort((a, b) => a.start - b.start);
  // several clips one after another: change the one that is playing now
  let pos = tl ? (interpreter.position(tl.id) ?? 0) / 1000 : 0;
  if (tl?.loop && tl.duration > 0) pos = ((pos % tl.duration) + tl.duration) % tl.duration;
  const current = rowClips.find((c) => pos >= c.start && pos < c.start + c.duration) ?? rowClips[0] ?? null;
  // no clip yet: the shape shows a plain line
  const shown: Clip = current ?? {
    id: "",
    groupId,
    nr,
    effect: "line",
    color: "#FFFFFF",
    sequence: "together",
    start: 0,
    duration: tl?.duration ?? 6,
  };

  const patch = (p: Partial<Clip>) => {
    if (current && tl) {
      saveTimeline({ ...tl, clips: tl.clips.map((c) => (clipKey(c) === clipKey(current) ? { ...current, ...p } : c)) });
      return;
    }
    // first effect for this shape: one clip over the whole show (and the show itself if there is none)
    const base = tl ?? emptyTimeline({ k: "start" }, nextScriptY(project.program));
    const next: Clip = { ...shown, color: p.effect && !p.color ? NEW_COLOR : shown.color, ...p, start: 0, duration: base.duration };
    saveTimeline({ ...base, clips: [...base.clips, next] });
    if (!tl) useTimelineUi.getState().setActive(base.id);
  };

  const remove = () => {
    if (!current || !tl) return;
    saveTimeline({ ...tl, clips: tl.clips.filter((c) => clipKey(c) !== clipKey(current)) });
  };

  return (
    <aside className={`panel clip-panel${min ? " min" : ""}`} aria-label={t("effects.effect")}>
      <div className="clip-head">
        <h2>
          <span className="gd" style={{ background: group.color }} />
          <span className="ellipsis">{nr === null ? group.name : `${group.name} · ${t("effects.nr", { nr })}`}</span>
        </h2>
        <div style={{ display: "flex", gap: 8 }}>
          {current && !min && (
            <button className="round danger" aria-label={t("row.remove")} title={t("row.remove")} onClick={remove}>
              <IconTrash />
            </button>
          )}
          {minButton}
          <button className="round" aria-label={t("effects.close")} onClick={close}>
            <IconClose />
          </button>
        </div>
      </div>

      {!min && members.length > 1 && itemNr !== null && (
        <div className="switch" role="radiogroup" aria-label={t("scope.title")}>
          <button role="radio" aria-checked={nr === null} className={nr === null ? "on" : ""} onClick={() => selectRow(groupId)}>
            {t("scope.group", { n: members.length })}
          </button>
          <button
            role="radio"
            aria-checked={nr !== null}
            className={nr !== null ? "on" : ""}
            onClick={() => selectRow(`${groupId}#${itemNr}`)}
          >
            {t("scope.item", { nr: itemNr })}
          </button>
        </div>
      )}

      {!min && rowClips.length > 1 && current && (
        <p className="fx-hint">
          {t("row.many", { n: rowClips.length, start: f(current.start), end: f(current.start + current.duration) })}{" "}
          <button className="link" onClick={onOpenTimeline}>
            {t("row.openTimeline")}
          </button>
        </p>
      )}

      {!min && <EffectEditor clip={shown} group={group} onPatch={patch} />}

      {!min && stroke && <LayerButtons strokeId={stroke.id} />}
    </aside>
  );
}

/** Effect, colour, settings and timing of one clip. */
function EffectEditor({ clip, group, onPatch }: { clip: Clip; group?: Group; onPatch: (p: Partial<Clip>) => void }) {
  const t = useT();
  const [cat, setCat] = useState<EffectCategory | null>(null);
  const rowKey = clipRowKey(clip);
  useEffect(() => setCat(null), [rowKey, clip.start]);
  const category: EffectCategory = cat ?? EFFECTS.find((e) => e.value === clip.effect)?.category ?? "light";

  return (
    <>
      <div className="section" role="group" aria-label={t("effects.effect")}>
        <div className="cats" role="tablist">
          {EFFECT_CATEGORIES.map((c) => (
            <button
              key={c.value}
              role="tab"
              aria-selected={category === c.value}
              className={`cat-pill${category === c.value ? " on" : ""}`}
              onClick={() => setCat(c.value)}
            >
              {t(c.key)}
            </button>
          ))}
        </div>
        <div className="grid4">
          {EFFECTS.filter((e) => e.category === category).map((e) => {
            const Preview = EFFECT_PREVIEW[e.value as EffectType];
            const on = clip.effect === e.value;
            return (
              <button
                key={e.value}
                className={`fx${on ? " on" : ""}`}
                aria-pressed={on}
                onClick={() =>
                  onPatch(
                    effectDef(e.value)?.uses.includes("text") && !clip.params?.text
                      ? { effect: e.value, params: { ...clip.params, text: t("param.text.default") } }
                      : { effect: e.value },
                  )
                }
              >
                <Preview />
                {t(e.key)}
              </button>
            );
          })}
        </div>
      </div>

      <div className="section" role="group" aria-label={t("effects.color")}>
        <div className="swatches">
          {PICK_COLORS.map((c) => (
            <button
              key={c.value}
              className={`sw-color${c.value === "#000000" ? " sw-black" : ""}${clip.color === c.value ? " on" : ""}`}
              style={{ background: c.value }}
              aria-label={t(c.key)}
              aria-pressed={clip.color === c.value}
              onClick={() => onPatch({ color: c.value })}
            />
          ))}
          {SPECIAL_COLORS.map((c) => (
            <button
              key={c.value}
              className={`sw-color${clip.color === c.value ? " on" : ""}`}
              style={{
                background:
                  c.value === "rainbow"
                    ? RAINBOW
                    : c.value === "group"
                      ? group?.color
                      : "repeating-linear-gradient(45deg,#FF6B5E 0 6px,#5C9DFF 6px 12px,#7CF29A 12px 18px)",
                border: c.value === "group" ? "2px dashed #0b0c0e" : undefined,
              }}
              aria-label={t(c.key)}
              title={t(c.key)}
              aria-pressed={clip.color === c.value}
              onClick={() => onPatch({ color: c.value as ColorSpec })}
            />
          ))}
        </div>
      </div>

      <EffectSettings effect={clip.effect} params={clip.params ?? {}} onChange={(p) => onPatch({ params: cleanParams(p) })} />

      {clip.nr === null && (
        <div className="section">
          <div className="switch" role="radiogroup" aria-label={t("effects.sequence")}>
            {(["together", "sequential"] as Sequence[]).map((s) => (
              <button key={s} role="radio" aria-checked={clip.sequence === s} className={clip.sequence === s ? "on" : ""} onClick={() => onPatch({ sequence: s })}>
                {s === "together" ? <IconTogether /> : <IconSequential />}
                {t(s === "together" ? "effects.together" : "effects.sequential")}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
