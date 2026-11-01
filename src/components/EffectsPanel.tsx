"use client";

import { useEffect, useState } from "react";
import { useProject } from "@/lib/store";
import { useLang, useT } from "@/lib/i18n";
import { EFFECTS, EFFECT_CATEGORIES, LIGHT_COLORS, SPECIAL_COLORS, type EffectCategory } from "@/lib/palette";
import { clipRowKey, type Clip } from "@/lib/timeline";
import { activeTimeline, clipKey, saveTimeline, useTimelineUi } from "@/lib/timelineUi";
import type { ColorSpec, EffectType, Sequence } from "@/lib/types";
import { cleanParams } from "@/lib/params";
import { EFFECT_PREVIEW, IconClose, IconSequential, IconTogether, IconTrash } from "./Icons";
import EffectSettings from "./EffectSettings";
import { LayerButtons } from "./ShapeMenu";

const RAINBOW = "conic-gradient(#FF6B5E, #FFE45C, #7CF29A, #5CE6E0, #5C9DFF, #B07CFF, #FF6B5E)";

/** Side panel for the selected clip of the timeline: effect, colour, timing. */
export default function EffectsPanel() {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const project = useProject((s) => s.project);
  const selectedStrokeId = useProject((s) => s.selectedStrokeId);
  const selectedClipId = useTimelineUi((s) => s.selectedClipId);
  const selectClip = useTimelineUi((s) => s.selectClip);
  useTimelineUi((s) => s.activeId);
  const [cat, setCat] = useState<EffectCategory | null>(null);
  useEffect(() => setCat(null), [selectedClipId]);

  const tl = activeTimeline();
  const clip = tl?.clips.find((c) => clipKey(c) === selectedClipId) ?? null;

  // no clip selected: show the layer buttons for a tapped shape
  if (!clip || !tl) {
    const stroke = project.strokes.find((s) => s.id === selectedStrokeId);
    if (!stroke) return null;
    const group = project.groups.find((g) => g.id === stroke.groupId);
    const nr = project.strokes.filter((s) => s.groupId === stroke.groupId).indexOf(stroke) + 1;
    return (
      <aside className="panel short" aria-label={t("layer.title")}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <h2>
            <span className="gd" style={{ background: group?.color }} />
            {group?.name} · {t("effects.nr", { nr })}
          </h2>
          <button className="round" aria-label={t("effects.close")} onClick={() => useProject.getState().selectStroke(null)}>
            <IconClose />
          </button>
        </div>
        <LayerButtons strokeId={stroke.id} />
      </aside>
    );
  }

  const group = project.groups.find((g) => g.id === clip.groupId);
  const category: EffectCategory = cat ?? EFFECTS.find((e) => e.value === clip.effect)?.category ?? "light";
  const f = (n: number) => n.toLocaleString(lang === "de" ? "de-DE" : "en-GB", { maximumFractionDigits: 2 });

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
    <aside className="panel clip-panel" aria-label={t("effects.effect")}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
          <p className="lbl">{t("clip.time", { start: f(clip.start), end: f(clip.start + clip.duration) })}</p>
          <h2>
            <span className="gd" style={{ background: group?.color }} />
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {group?.name} · {clip.nr === null ? t("clip.whole") : t("effects.nr", { nr: clip.nr })}
            </span>
          </h2>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="round danger" aria-label={t("clip.delete")} title={t("clip.delete")} onClick={remove}>
            <IconTrash />
          </button>
          <button className="round" aria-label={t("effects.close")} onClick={() => selectClip(null)}>
            <IconClose />
          </button>
        </div>
      </div>

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
                  patch(
                    e.value === "text" && !clip.params?.text
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
          {LIGHT_COLORS.map((c) => (
            <button
              key={c.value}
              className={`sw-color${clip.color === c.value ? " on" : ""}`}
              style={{ background: c.value }}
              aria-label={t(c.key)}
              aria-pressed={clip.color === c.value}
              onClick={() => patch({ color: c.value })}
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
              onClick={() => patch({ color: c.value as ColorSpec })}
            />
          ))}
        </div>
      </div>

      <EffectSettings effect={clip.effect} params={clip.params ?? {}} onChange={(p) => patch({ params: cleanParams(p) })} />

      {clip.nr === null && (
        <div className="section">
          <div className="switch" role="radiogroup" aria-label={t("effects.sequence")}>
            {(["together", "sequential"] as Sequence[]).map((s) => (
              <button key={s} role="radio" aria-checked={clip.sequence === s} className={clip.sequence === s ? "on" : ""} onClick={() => patch({ sequence: s })}>
                {s === "together" ? <IconTogether /> : <IconSequential />}
                {t(s === "together" ? "effects.together" : "effects.sequential")}
              </button>
            ))}
          </div>
        </div>
      )}

    </aside>
  );
}
