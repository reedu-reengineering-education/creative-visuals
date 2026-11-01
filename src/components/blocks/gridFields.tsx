"use client";

import * as Blockly from "blockly/core";
import { useState } from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { EFFECTS, EFFECT_CATEGORIES, LIGHT_COLORS, SPECIAL_COLORS, effectDef, type EffectCategory } from "@/lib/palette";
import { CLOCK, SIZES, SPEEDS, TIMER, DIRECTIONS, cleanParams, encodeParams, parseParams } from "@/lib/params";
import { allChannels, channelLabel } from "@/lib/sensors";
import { t } from "@/lib/i18n";
import type { EffectParams, EffectType } from "@/lib/types";
import { EFFECT_PREVIEW } from "../Icons";
import EffectSettings from "../EffectSettings";

/**
 * Dropdown fields that open a small visual grid instead of a text list:
 * effects with animated previews, colours as swatches.
 */
abstract class GridField extends Blockly.FieldDropdown {
  private root: Root | null = null;

  protected abstract renderGrid(value: string, pick: (v: string) => void): React.ReactElement;

  protected override showEditor_() {
    Blockly.DropDownDiv.clearContent();
    const host = document.createElement("div");
    Blockly.DropDownDiv.getContentDiv().appendChild(host);
    this.root = createRoot(host);
    const pick = (v: string) => {
      this.setValue(v);
      Blockly.DropDownDiv.hideIfOwner(this, true);
    };
    // render synchronously so the drop-down can measure its size
    flushSync(() => this.root!.render(this.renderGrid(String(this.getValue()), pick)));
    Blockly.DropDownDiv.setColour("#1d2025", "#2a2d33");
    Blockly.DropDownDiv.showPositionedByField(this, () => {
      const r = this.root;
      this.root = null;
      // unmount after the current event, React doesn't like unmounting during render
      setTimeout(() => r?.unmount(), 0);
    });
  }
}

function EffectGrid({ value, pick }: { value: string; pick: (v: string) => void }) {
  const [cat, setCat] = useState<EffectCategory>(EFFECTS.find((e) => e.value === value)?.category ?? "line");
  return (
    <div className="lw-grid" aria-label={t("effects.effect")}>
      <div className="cats lw-grid-cats" role="tablist">
        {EFFECT_CATEGORIES.map((c) => (
          <button
            key={c.value}
            role="tab"
            aria-selected={cat === c.value}
            className={`cat-pill${cat === c.value ? " on" : ""}`}
            onClick={() => setCat(c.value)}
          >
            {t(c.key)}
          </button>
        ))}
      </div>
      <div className="lw-grid-tiles" role="listbox">
        {EFFECTS.filter((e) => e.category === cat).map((e) => {
          const Preview = EFFECT_PREVIEW[e.value];
          return (
            <button
              key={e.value}
              role="option"
              aria-selected={value === e.value}
              className={`lw-grid-fx${value === e.value ? " on" : ""}`}
              onClick={() => pick(e.value)}
            >
              <Preview />
              <span>{t(e.key)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

const SPECIAL_BG: Record<string, string> = {
  rainbow: "conic-gradient(#FF6B5E, #FFE45C, #7CF29A, #5CE6E0, #5C9DFF, #B07CFF, #FF6B5E)",
  group: "#7FB2F0",
  random: "repeating-linear-gradient(45deg,#FF6B5E 0 6px,#5C9DFF 6px 12px,#7CF29A 12px 18px)",
};

function ColorGrid({ value, pick }: { value: string; pick: (v: string) => void }) {
  return (
    <div className="lw-grid lw-colors" role="listbox" aria-label={t("effects.color")}>
      <div className="lw-swatches">
        {LIGHT_COLORS.map((c) => (
          <button
            key={c.value}
            role="option"
            aria-selected={value === c.value}
            aria-label={t(c.key)}
            title={t(c.key)}
            className={`lw-swatch${value === c.value ? " on" : ""}`}
            style={{ background: c.value }}
            onClick={() => pick(c.value)}
          />
        ))}
      </div>
      <div className="lw-specials">
        {SPECIAL_COLORS.map((c) => (
          <button
            key={c.value}
            role="option"
            aria-selected={value === c.value}
            className={`lw-special${value === c.value ? " on" : ""}`}
            onClick={() => pick(c.value)}
          >
            <span className="lw-swatch-mini" style={{ background: SPECIAL_BG[c.value] }} />
            {t(c.key)}
          </button>
        ))}
      </div>
    </div>
  );
}

export class FieldEffectGrid extends GridField {
  protected renderGrid(value: string, pick: (v: string) => void) {
    return <EffectGrid value={value} pick={pick} />;
  }
}

export class FieldColorGrid extends GridField {
  protected renderGrid(value: string, pick: (v: string) => void) {
    return <ColorGrid value={value} pick={pick} />;
  }
}

/* ---------- the ⚙ settings field on effect blocks ---------- */

const short = (s: string, n: number) => {
  const chars = Array.from(s);
  return chars.length > n ? `${chars.slice(0, n - 1).join("")}…` : s;
};

/** What the field shows on the block: ⚙ plus everything that isn't the default. */
export function settingsSummary(effect: EffectType, p: EffectParams): string {
  const def = effectDef(effect);
  const uses = new Set(def?.uses ?? []);
  const parts: string[] = [];
  if (uses.has("text")) parts.push(p.text ? `"${short(p.text, 14)}"` : t("param.text.empty"));
  if (uses.has("source")) {
    const src = p.source ?? TIMER;
    const ch = allChannels().find((c) => c.id === src);
    parts.push(src === TIMER ? "⏱" : src === CLOCK ? "🕒" : ch ? channelLabel(ch) : src);
  }
  if (uses.has("speed") && p.speed !== undefined && p.speed !== 1) {
    const s = SPEEDS.find((x) => x.value === p.speed);
    parts.push(s?.icon || (s ? t(s.key) : `${p.speed}×`));
  }
  if (uses.has("size") && p.size !== undefined && p.size !== 1) {
    parts.push(SIZES.find((x) => x.value === p.size)?.label ?? `${p.size}×`);
  }
  if (uses.has("brightness") && p.brightness !== undefined && p.brightness !== 1) {
    parts.push(`${Math.round(p.brightness * 100)}%`);
  }
  if (uses.has("dir") && p.dir && p.dir !== def?.dirs?.[0]) {
    parts.push(DIRECTIONS.find((d) => d.value === p.dir)?.arrow ?? "");
  }
  if (uses.has("color2") && p.color2) parts.push("+●");
  return parts.length ? `⚙ ${parts.join(" ")}` : "⚙";
}

function SettingsPopup({
  effect,
  initial,
  onChange,
}: {
  effect: EffectType;
  initial: EffectParams;
  onChange: (p: EffectParams) => void;
}) {
  const [params, setParams] = useState(initial);
  const def = effectDef(effect);
  return (
    <div className="lw-settings" aria-label={t("param.settings")}>
      <p className="lw-settings-title">
        {def ? t(def.key) : effect} · {t("param.settings")}
      </p>
      <EffectSettings
        effect={effect}
        params={params}
        onChange={(p) => {
          const c = cleanParams(p);
          setParams(c);
          onChange(c);
        }}
      />
    </div>
  );
}

/**
 * Effect settings on a block. The value is a small JSON string (see
 * `lib/params.ts`); the block shows a short summary and a tap opens the
 * same settings as the clip inspector.
 */
export class FieldSettings extends Blockly.FieldTextInput {
  private root: Root | null = null;

  constructor(value = "") {
    super(value);
  }

  private effect(): EffectType {
    return (this.getSourceBlock()?.getFieldValue("EFFECT") ?? "glow") as EffectType;
  }

  override initView() {
    super.initView();
    this.fieldGroup_?.classList.add("lw-settings-field");
  }

  protected override getText_(): string {
    return settingsSummary(this.effect(), parseParams(this.getValue()));
  }

  protected override showEditor_() {
    Blockly.DropDownDiv.clearContent();
    const host = document.createElement("div");
    Blockly.DropDownDiv.getContentDiv().appendChild(host);
    this.root = createRoot(host);
    flushSync(() =>
      this.root!.render(
        <SettingsPopup
          effect={this.effect()}
          initial={parseParams(this.getValue())}
          onChange={(p) => this.setValue(encodeParams(p))}
        />,
      ),
    );
    Blockly.DropDownDiv.setColour("#1d2025", "#2a2d33");
    Blockly.DropDownDiv.showPositionedByField(this, () => {
      const r = this.root;
      this.root = null;
      setTimeout(() => r?.unmount(), 0);
    });
  }
}
