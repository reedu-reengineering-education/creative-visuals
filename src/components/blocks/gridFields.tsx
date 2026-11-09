"use client";

import * as Blockly from "blockly/core";
import { useState } from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { EFFECTS, EFFECT_CATEGORIES, PICK_COLORS, SPECIAL_COLORS, effectDef, type EffectCategory } from "@/lib/palette";
import { AMOUNTS, CLOCK, SIZES, SPEEDS, DIRECTIONS, cleanParams, encodeParams, parseParams } from "@/lib/params";
import { t } from "@/lib/i18n";
import type { EffectParams, EffectType, Sequence } from "@/lib/types";
import { EFFECT_PREVIEW, IconSequential, IconTogether } from "../Icons";
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

function EffectGrid({ value, pick, only }: { value: string; pick: (v: string) => void; only?: readonly EffectType[] }) {
  const list = only ? EFFECTS.filter((e) => only.includes(e.value)) : EFFECTS;
  const cats = EFFECT_CATEGORIES.filter((c) => list.some((e) => e.category === c.value));
  const [cat, setCat] = useState<EffectCategory>(list.find((e) => e.value === value)?.category ?? cats[0]?.value ?? "line");
  return (
    <div className="lw-grid" aria-label={t("effects.effect")}>
      <div className="cats lw-grid-cats" role="tablist" style={cats.length < 2 ? { display: "none" } : undefined}>
        {cats.map((c) => (
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
        {list.filter((e) => e.category === cat).map((e) => {
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

function ColorGrid({ value, pick, specials = true }: { value: string; pick: (v: string) => void; specials?: boolean }) {
  return (
    <div className="lw-grid lw-colors" role="listbox" aria-label={t("effects.color")}>
      <div className="lw-swatches">
        {PICK_COLORS.map((c) => (
          <button
            key={c.value}
            role="option"
            aria-selected={value === c.value}
            aria-label={t(c.key)}
            title={t(c.key)}
            className={`lw-swatch${c.value === "#000000" ? " sw-black" : ""}${value === c.value ? " on" : ""}`}
            style={{ background: c.value }}
            onClick={() => pick(c.value)}
          />
        ))}
      </div>
      {specials && (
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
      )}
    </div>
  );
}

export class FieldEffectGrid extends GridField {
  /** offer only these effects (the menu generator should list the same ones) */
  only?: readonly EffectType[];

  protected renderGrid(value: string, pick: (v: string) => void) {
    return <EffectGrid value={value} pick={pick} only={this.only} />;
  }
}

export class FieldColorGrid extends GridField {
  /** false: only real colours (no rainbow / group / random), e.g. for colour links */
  specials = true;

  protected renderGrid(value: string, pick: (v: string) => void) {
    return <ColorGrid value={value} pick={pick} specials={this.specials} />;
  }
}

/* ---------- the ⚙ settings field on effect blocks ---------- */

const short = (s: string, n: number) => {
  const chars = Array.from(s);
  return chars.length > n ? `${chars.slice(0, n - 1).join("")}…` : s;
};

/** What the field shows on the block: ⚙ plus everything that isn't the default. */
export function settingsSummary(
  effect: EffectType,
  p: EffectParams,
  hide: (keyof EffectParams)[] = [],
  sequence?: Sequence,
): string {
  const def = effectDef(effect);
  const uses = new Set((def?.uses ?? []).filter((u) => !hide.includes(u)));
  const parts: string[] = [];
  if (uses.has("text")) parts.push(p.text ? `"${short(p.text, 14)}"` : t("param.text.empty"));
  if (uses.has("source")) parts.push(p.source === CLOCK ? "🕒" : "⏱");
  if (uses.has("speed") && p.speed !== undefined && p.speed !== 1) {
    const s = SPEEDS.find((x) => x.value === p.speed);
    parts.push(s?.icon || (s ? t(s.key) : `${p.speed}×`));
  }
  if (uses.has("size") && p.size !== undefined && p.size !== 1) {
    parts.push(SIZES.find((x) => x.value === p.size)?.label ?? `${p.size}×`);
  }
  if (uses.has("amount") && p.amount !== undefined && p.amount !== 0.5) {
    const a = AMOUNTS.find((x) => x.value === p.amount);
    parts.push(a ? t(a.key) : `${Math.round(p.amount * 100)}%`);
  }
  if (uses.has("brightness") && p.brightness !== undefined && p.brightness !== 1) {
    parts.push(`${Math.round(p.brightness * 100)}%`);
  }
  if (uses.has("dir") && p.dir && p.dir !== def?.dirs?.[0]) {
    parts.push(DIRECTIONS.find((d) => d.value === p.dir)?.arrow ?? "");
  }
  if (uses.has("color2") && p.color2) parts.push("+●");
  // the same mark as on timeline clips
  if (sequence === "sequential") parts.push("›››");
  return parts.length ? `⚙ ${parts.join(" ")}` : "⚙";
}

function SettingsPopup({
  effect,
  initial,
  onChange,
  hide,
  sequence,
  onSequence,
}: {
  effect: EffectType;
  initial: EffectParams;
  onChange: (p: EffectParams) => void;
  hide?: (keyof EffectParams)[];
  /** "Alle zugleich / Nacheinander" for blocks that steer a whole group; undefined = not offered */
  sequence?: Sequence;
  onSequence?: (s: Sequence) => void;
}) {
  const [params, setParams] = useState(initial);
  const [seq, setSeq] = useState(sequence);
  const def = effectDef(effect);
  return (
    <div className="lw-settings" aria-label={t("param.settings")}>
      <p className="lw-settings-title">
        {def ? t(def.key) : effect} · {t("param.settings")}
      </p>
      <EffectSettings
        effect={effect}
        hide={hide}
        params={params}
        onChange={(p) => {
          const c = cleanParams(p);
          setParams(c);
          onChange(c);
        }}
      />
      {seq && (
        <div className="section">
          <div className="switch" role="radiogroup" aria-label={t("effects.sequence")}>
            {(["together", "sequential"] as Sequence[]).map((s) => (
              <button
                key={s}
                role="radio"
                aria-checked={seq === s}
                className={seq === s ? "on" : ""}
                onClick={() => {
                  setSeq(s);
                  onSequence?.(s);
                }}
              >
                {s === "together" ? <IconTogether /> : <IconSequential />}
                {t(s === "together" ? "effects.together" : "effects.sequential")}
              </button>
            ))}
          </div>
        </div>
      )}
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
  /** settings the block brings itself, not offered here */
  hide: (keyof EffectParams)[] = [];

  constructor(value = "") {
    super(value);
  }

  /** Does the effect have anything to set here? */
  hasSettings(): boolean {
    const hidden = this.hidden();
    return this.sequence() !== undefined || (effectDef(this.effect())?.uses ?? []).some((u) => !hidden.includes(u));
  }

  /**
   * The block's "zugleich / nacheinander" (its hidden SEQ field) is set here,
   * not on the block. Not offered for "Aus", nor while a live value is shown
   * (that has no order).
   */
  private sequence(): Sequence | undefined {
    const b = this.getSourceBlock();
    const seq = b?.getField("SEQ");
    if (!b || !seq || this.effect() === "off") return undefined;
    const plugged = b.getInput("VALUE")?.connection?.targetBlock();
    if (plugged && !plugged.isShadow()) return undefined;
    return seq.getValue() === "sequential" ? "sequential" : "together";
  }

  /** A value in the block's content slot ("Zahl ⟨Messwert⟩") replaces the text and the stopwatch / clock. */
  hidden(): (keyof EffectParams)[] {
    const plugged = this.getSourceBlock()?.getInput("VALUE")?.connection?.targetBlock();
    return plugged && !plugged.isShadow() ? [...this.hide, "text", "source"] : this.hide;
  }

  private effect(): EffectType {
    return (this.getSourceBlock()?.getFieldValue("EFFECT") ?? "glow") as EffectType;
  }

  override initView() {
    super.initView();
    this.fieldGroup_?.classList.add("lw-settings-field");
  }

  protected override getText_(): string {
    return settingsSummary(this.effect(), parseParams(this.getValue()), this.hidden(), this.sequence());
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
          hide={this.hidden()}
          onChange={(p) => this.setValue(encodeParams(p))}
          sequence={this.sequence()}
          onSequence={(s) => {
            this.getSourceBlock()?.setFieldValue(s, "SEQ");
            this.forceRerender();
          }}
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
