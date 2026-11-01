"use client";

import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n";
import { effectDef, PICK_COLORS } from "@/lib/palette";
import { AMOUNTS, BRIGHTNESS, CLOCK, DIRECTIONS, SIZES, SPEEDS, TIMER } from "@/lib/params";
import type { ColorSpec, EffectParams, EffectType } from "@/lib/types";

const RAINBOW = "conic-gradient(#FF6B5E, #FFE45C, #7CF29A, #5CE6E0, #5C9DFF, #B07CFF, #FF6B5E)";
const EMOJI = ["✨", "❤️", "⭐", "🎉", "👋", "🔥", "🌈", "😎", "🚀", "👻"];

/**
 * The settings of one effect: only what this effect understands is shown.
 * Used in the clip inspector and in the ⚙ popup of the effect blocks.
 */
export default function EffectSettings({
  effect,
  params,
  onChange,
}: {
  effect: EffectType;
  params: EffectParams;
  onChange: (p: EffectParams) => void;
}) {
  const t = useT();
  const def = effectDef(effect);
  if (!def || (!def.uses.length && !def.hint)) return null;
  const uses = new Set(def.uses);
  const set = (p: Partial<EffectParams>) => onChange({ ...params, ...p });

  return (
    <div className="fx-settings">
      {def.hint && <p className="fx-hint">{t(def.hint)}</p>}

      {uses.has("text") && (
        <div className="section">
          <p className="lbl">{t("param.text")}</p>
          <TextParam value={params.text ?? ""} onCommit={(text) => set({ text })} />
        </div>
      )}

      {uses.has("source") && (
        <Row label={t("param.source")}>
          <Opt on={params.source !== CLOCK} onClick={() => set({ source: TIMER })}>
            ⏱ {t("param.source.timer")}
          </Opt>
          <Opt on={params.source === CLOCK} onClick={() => set({ source: CLOCK })}>
            🕒 {t("param.source.clock")}
          </Opt>
        </Row>
      )}

      {uses.has("speed") && (
        <Row label={t("param.speed")}>
          {SPEEDS.map((s) => (
            <Opt key={s.value} on={(params.speed ?? 1) === s.value} onClick={() => set({ speed: s.value })} title={t(s.key)}>
              {s.icon ? `${s.icon} ` : ""}
              {t(s.key)}
            </Opt>
          ))}
        </Row>
      )}

      {uses.has("size") && (
        <Row label={t("param.size")}>
          {SIZES.map((s) => (
            <Opt key={s.value} on={(params.size ?? 1) === s.value} onClick={() => set({ size: s.value })}>
              {s.label}
            </Opt>
          ))}
        </Row>
      )}

      {uses.has("amount") && (
        <Row label={t("param.amount")}>
          {AMOUNTS.map((a) => (
            <Opt key={a.value} on={(params.amount ?? 0.5) === a.value} onClick={() => set({ amount: a.value })}>
              {t(a.key)}
            </Opt>
          ))}
        </Row>
      )}

      {uses.has("brightness") && (
        <Row label={t("param.brightness")}>
          {BRIGHTNESS.map((b) => (
            <Opt key={b} on={(params.brightness ?? 1) === b} onClick={() => set({ brightness: b })}>
              {Math.round(b * 100)}%
            </Opt>
          ))}
        </Row>
      )}

      {uses.has("dir") && def.dirs && (
        <Row label={t("param.dir")}>
          {DIRECTIONS.filter((d) => def.dirs!.includes(d.value)).map((d) => (
            <Opt
              key={d.value}
              on={(params.dir ?? def.dirs![0]) === d.value}
              onClick={() => set({ dir: d.value })}
              title={t(d.key)}
            >
              <span className="fx-arrow">{d.arrow}</span>
            </Opt>
          ))}
        </Row>
      )}

      {uses.has("color2") && (
        <div className="section">
          <p className="lbl">{t("param.color2")}</p>
          <div className="swatches">
            <button
              className={`sw-color sw-none${!params.color2 ? " on" : ""}`}
              aria-label={t("param.color2.none")}
              title={t("param.color2.none")}
              aria-pressed={!params.color2}
              onClick={() => set({ color2: undefined })}
            />
            {[...PICK_COLORS.map((c) => ({ value: c.value as ColorSpec, key: c.key, bg: c.value })), { value: "rainbow" as ColorSpec, key: "color.rainbow" as const, bg: RAINBOW }].map(
              (c) => (
                <button
                  key={c.value}
                  className={`sw-color${c.value === "#000000" ? " sw-black" : ""}${params.color2 === c.value ? " on" : ""}`}
                  style={{ background: c.bg }}
                  aria-label={t(c.key)}
                  title={t(c.key)}
                  aria-pressed={params.color2 === c.value}
                  onClick={() => set({ color2: c.value })}
                />
              ),
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="section">
      <p className="lbl">{label}</p>
      <div className="switch" role="radiogroup" aria-label={label}>
        {children}
      </div>
    </div>
  );
}

function Opt({ on, onClick, title, children }: { on: boolean; onClick: () => void; title?: string; children: React.ReactNode }) {
  return (
    <button role="radio" aria-checked={on} className={on ? "on" : ""} onClick={onClick} title={title}>
      {children}
    </button>
  );
}

/** Text with emoji buttons. Saved on Enter, on leaving the field and on every emoji tap. */
function TextParam({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  const t = useT();
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = (v: string) => {
    if (v !== value) onCommit(v);
  };
  return (
    <>
      <input
        className="fx-text"
        value={draft}
        maxLength={120}
        placeholder={t("param.text.placeholder")}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => commit(draft)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") commit(draft);
        }}
      />
      <div className="fx-emoji">
        {EMOJI.map((em) => (
          <button
            key={em}
            onClick={() => {
              const next = `${draft}${em}`.slice(0, 120);
              setDraft(next);
              commit(next);
            }}
          >
            {em}
          </button>
        ))}
      </div>
    </>
  );
}
