import * as Blockly from "blockly/core";
import { FieldColorGrid, FieldEffectGrid, FieldSettings } from "./gridFields";
import { t, type TKey } from "@/lib/i18n";
import { EFFECTS, PICK_COLORS, SPECIAL_COLORS, effectDef } from "@/lib/palette";
import { SIZES, SPEEDS, encodeParams, parseParams } from "@/lib/params";
import { BUTTONS, type LinkProp } from "@/lib/program";
import { buttonLabel } from "@/lib/buttons";
import type { EffectType } from "@/lib/types";
import { useProject } from "@/lib/store";
import { allChannels, channelLabel } from "@/lib/sensors";

/* ---------- dropdown option generators (evaluated whenever a menu opens) ---------- */

export const ALL = "__all";
export const THIS = "__this";

type Opt = [string, string];

function groupOptions(extra: { all?: boolean; self?: boolean } = {}): () => Opt[] {
  return () => {
    const opts: Opt[] = [];
    if (extra.self) opts.push([t("group.this"), THIS]);
    if (extra.all) opts.push([t("group.all"), ALL]);
    for (const g of useProject.getState().project.groups) opts.push([`● ${g.name}`, g.id]);
    if (!opts.length) opts.push(["–", ALL]);
    return opts;
  };
}

const effectOptions = (): Opt[] => EFFECTS.map((e) => [t(e.key), e.value]);
const colorOptions = (): Opt[] => [
  ...PICK_COLORS.map((c): Opt => [t(c.key), c.value]),
  ...SPECIAL_COLORS.map((c): Opt => [t(c.key), c.value]),
];
const seqOptions = (): Opt[] => [
  [t("block.together"), "together"],
  [t("block.sequential"), "sequential"],
];
const sensorOptions = (): Opt[] => allChannels().map((c): Opt => [channelLabel(c), c.id]);
const speedOptions = (): Opt[] => SPEEDS.map((s): Opt => [`${s.icon ? `${s.icon} ` : ""}${t(s.key)}`, String(s.value)]);
const sizeOptions = (): Opt[] => SIZES.map((s): Opt => [s.label, String(s.value)]);
const lightColorOptions = (): Opt[] => PICK_COLORS.map((c): Opt => [t(c.key), c.value]);
const percentOptions = (): Opt[] => [0, 0.1, 0.25, 0.5, 0.75, 1].map((b): Opt => [`${Math.round(b * 100)} %`, String(b)]);
const linkPropOptions = (): Opt[] => LINK_PROP_LIST.map((p): Opt => [t(`link.${p}` as TKey), p]);

const LINK_PROP_LIST: LinkProp[] = ["speed", "size", "brightness", "color", "level", "amount", "graph"];

/** What "von … bis …" looks like for each setting a link can steer, and its default range. */
const LINK_RANGE: Record<LinkProp, { field: () => Blockly.Field; from: string; to: string }> = {
  speed: { field: () => dd(speedOptions), from: "0.5", to: "3.5" },
  size: { field: () => dd(sizeOptions), from: "0.6", to: "2.4" },
  brightness: { field: () => dd(percentOptions), from: "0.25", to: "1" },
  level: { field: () => dd(percentOptions), from: "0", to: "1" },
  amount: { field: () => dd(percentOptions), from: "0.1", to: "1" },
  // how high in the shape the curve goes for "von" and "bis"
  graph: { field: () => dd(percentOptions), from: "0", to: "1" },
  color: {
    field: () => {
      const f = new FieldColorGrid(lightColorOptions as Blockly.MenuGeneratorFunction);
      f.specials = false;
      return f;
    },
    from: "#5C9DFF",
    to: "#FF6B5E",
  },
};

const buttonOptions = (): Opt[] => BUTTONS.map((b) => [buttonLabel(b), b]);
const arithOptions = (): Opt[] => [
  ["+", "+"],
  ["−", "-"],
  ["×", "*"],
  ["÷", "/"],
];
const compareOptions = (): Opt[] => [
  [">", ">"],
  ["<", "<"],
  ["=", "="],
];
const logicOptions = (): Opt[] => [
  [t("block.and"), "and"],
  [t("block.or"), "or"],
];

const keyOptions = (): Opt[] => {
  const opts: Opt[] = [
    [t("key.space"), "space"],
    [t("key.left"), "left"],
    [t("key.right"), "right"],
    [t("key.up"), "up"],
    [t("key.down"), "down"],
  ];
  for (const c of "abcdefghijklmnopqrstuvwxyz0123456789") opts.push([c.toUpperCase(), c]);
  return opts;
};

/* ---------- helpers ---------- */

/** Fill a block row from a message like "Wenn %1 %2 %3" and a list of named fields. */
function row(block: Blockly.Block, key: TKey, fields: [string, Blockly.Field][], inputName?: string) {
  const input = block.appendDummyInput(inputName);
  const parts = t(key).split(/(%\d)/);
  for (const part of parts) {
    const m = part.match(/^%(\d)$/);
    if (m) {
      const f = fields[Number(m[1]) - 1];
      if (f) input.appendField(f[1], f[0]);
    } else if (part.trim()) {
      input.appendField(part.trim());
    }
  }
  return input;
}

/** A value input slot in a block message ("%2" can be a field or one of these). */
interface Slot {
  input: string;
  check: "Number" | "Boolean";
}

/**
 * Like `row`, but parts can also be value inputs (for numbers, variables,
 * conditions). Text and fields before an input are attached to that input.
 */
function rowWithInputs(block: Blockly.Block, key: TKey, parts: [string, Blockly.Field][] | (Slot | [string, Blockly.Field])[]) {
  let pending: [string | undefined, Blockly.Field | string][] = [];
  const flush = (input: Blockly.Input) => {
    for (const [name, f] of pending) input.appendField(f, name);
    pending = [];
  };
  for (const part of t(key).split(/(%\d)/)) {
    const m = part.match(/^%(\d)$/);
    if (!m) {
      if (part.trim()) pending.push([undefined, part.trim()]);
      continue;
    }
    const p = parts[Number(m[1]) - 1];
    if (!p) continue;
    if (Array.isArray(p)) {
      pending.push([p[0], p[1]]);
    } else {
      const input = block.appendValueInput(p.input).setCheck(p.check);
      flush(input);
    }
  }
  if (pending.length) flush(block.appendDummyInput());
  block.setInputsInline(true);
}

const numIn = (input: string): Slot => ({ input, check: "Number" });
const boolIn = (input: string): Slot => ({ input, check: "Boolean" });

const dd = (gen: () => Opt[]) => new Blockly.FieldDropdown(gen as Blockly.MenuGeneratorFunction);
const num = (v: number, min?: number, max?: number, precision?: number) =>
  new Blockly.FieldNumber(v, min, max, precision);

/**
 * Keeps the ⚙ field of an effect block in step with its effect: hidden for
 * effects without settings, a starter text for "Laufschrift", fresh summary.
 */
function syncSettings(block: Blockly.Block, e: Blockly.Events.Abstract) {
  const field = block.getField("SET");
  if (!field || block.isInFlyout) return;
  const effect = block.getFieldValue("EFFECT") as EffectType;
  const hasSettings = (effectDef(effect)?.uses.length ?? 0) > 0;
  let changed = false;
  if (field.isVisible() !== hasSettings) {
    field.setVisible(hasSettings);
    changed = true;
  }
  if (e instanceof Blockly.Events.BlockChange && e.blockId === block.id && e.name === "EFFECT") {
    const p = parseParams(field.getValue());
    if (effectDef(effect)?.uses.includes("text") && !p.text) {
      field.setValue(encodeParams({ ...p, text: t("param.text.default") }));
    }
    field.forceRerender();
    changed = true;
  }
  if (changed && block instanceof Blockly.BlockSvg) block.queueRender();
}

/* ---------- renderer: zelos with dark text and light "slots" ---------- */

const svgUri = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

const DARK_ARROW = svgUri(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 12"><path d="M2.5 4.5L6 8l3.5-3.5" fill="none" stroke="#15171B" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
);

export const PLAY_ICON = svgUri(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M7 4.5v15l12-7.5z" fill="#15171B"/></svg>',
);

/**
 * Block shapes like the design: rounded corners, a soft dome on start blocks and
 * small, soft notches so kids still see which pieces fit together.
 */
class LichtwerkConstants extends Blockly.zelos.ConstantProvider {
  constructor() {
    super();
    this.FIELD_DROPDOWN_SVG_ARROW_DATAURI = DARK_ARROW;
    this.FIELD_DROPDOWN_COLOURED_DIV = false;
    this.FIELD_BORDER_RECT_X_PADDING = 12;

    this.CORNER_RADIUS = 12;
    this.FIELD_BORDER_RECT_RADIUS = 17;
    this.BOTTOM_ROW_MIN_HEIGHT = this.CORNER_RADIUS;
    this.MIN_BLOCK_HEIGHT = 52;
    this.NOTCH_WIDTH = 30;
    this.NOTCH_HEIGHT = 6;
    this.NOTCH_OFFSET_LEFT = 22;
    this.STATEMENT_BOTTOM_SPACER = -this.NOTCH_HEIGHT;
    this.STATEMENT_INPUT_PADDING_LEFT = 24;
    this.EMPTY_STATEMENT_INPUT_HEIGHT = 28;
    this.BOTTOM_ROW_AFTER_STATEMENT_MIN_HEIGHT = 22;
    // no dome: start blocks get big rounded top corners instead (see LichtwerkDrawer)
    this.START_HAT_HEIGHT = 0;
    this.START_HAT_WIDTH = 0;
    // yes/no blocks (rounded hexagons) keep the same small padding on every side
    const G = this.GRID_UNIT;
    this.SHAPE_IN_SHAPE_PADDING[this.SHAPES.HEXAGONAL] = { 0: 3 * G, 1: 2 * G, 2: 2 * G, 3: 2 * G };
  }

  /**
   * Yes/no blocks: zelos' diamond-like hexagon (tips as wide as half the
   * height), but with all corners rounded – the tip and where the slanted
   * edges meet the top and bottom edge.
   */
  override makeHexagonal() {
    const max = this.MAX_DYNAMIC_CONNECTION_SHAPE_WIDTH;
    const tip = (height: number) => Math.min(height / 2, max);
    /** One side, from the top (or bottom) edge over the tip to the other edge, as a relative path. */
    const side = (height: number, up: boolean, right: boolean) => {
      const w = tip(height);
      const e = right ? 1 : -1; // x direction towards the tip
      const c = ((up ? -1 : 1) * height) / 2;
      const a = Math.min(5, w * 0.3); // how far the edge corners are rounded
      const corner1 = { x: e * a, y: 0 };
      const point = { x: e * w, y: c };
      const corner2 = { x: e * a, y: 2 * c };
      const along = (p: { x: number; y: number }, q: { x: number; y: number }, f: number) => ({
        x: p.x + (q.x - p.x) * f,
        y: p.y + (q.y - p.y) * f,
      });
      const p1 = along(corner1, point, 0.22);
      const p2 = along(point, corner1, 0.3);
      const p3 = along(point, corner2, 0.3);
      const p4 = along(corner2, point, 0.22);
      const end = { x: 0, y: 2 * c };
      // relative path pieces: each starts where the previous one ended
      let at = { x: 0, y: 0 };
      const rel = (p: { x: number; y: number }) => `${p.x - at.x},${p.y - at.y}`;
      const q = (ctrl: { x: number; y: number }, to: { x: number; y: number }) => {
        const out = `q ${rel(ctrl)} ${rel(to)} `;
        at = to;
        return out;
      };
      const l = (to: { x: number; y: number }) => {
        const out = `l ${rel(to)} `;
        at = to;
        return out;
      };
      return q(corner1, p1) + l(p2) + q(point, p3) + l(p4) + q(corner2, end);
    };
    return {
      type: this.SHAPES.HEXAGONAL,
      isDynamic: true as const,
      width: tip,
      height: (h: number) => h,
      connectionOffsetY: (h: number) => h / 2,
      connectionOffsetX: (w: number) => -w,
      pathDown: (h: number) => side(h, false, false),
      pathUp: (h: number) => side(h, true, false),
      pathRightDown: (h: number) => side(h, false, true),
      pathRightUp: (h: number) => side(h, false, true),
    };
  }

  /** A soft, rounded notch instead of zelos' sharp trapezoid. */
  override makeNotch() {
    const w = this.NOTCH_WIDTH;
    const h = this.NOTCH_HEIGHT;
    const side = w * 0.3;
    const flat = w - side * 2;
    const down = (dir: 1 | -1) =>
      `c ${dir * side * 0.55},0 ${dir * side * 0.45},${h} ${dir * side},${h} ` +
      `h ${dir * flat} ` +
      `c ${dir * side * 0.55},0 ${dir * side * 0.45},${-h} ${dir * side},${-h}`;
    return {
      type: this.SHAPES.NOTCH,
      width: w,
      height: h,
      pathLeft: down(1),
      pathRight: down(-1),
    };
  }

  override makeStartHat() {
    return { height: 0, width: 0, path: "" };
  }
}

/** Corner radius of start blocks ("Wenn …"), like the design. */
const HAT_RADIUS = 22;
/** Space above and below the content of value blocks (numbers, readings, conditions). */
const VALUE_PADDING = 7;
/** Space between the block edge and the first / last field. */
const EDGE_PADDING = 14;

const T = Blockly.blockRendering.Types;

/** Start blocks: no dome, but large rounded top corners. */
class LichtwerkDrawer extends Blockly.zelos.Drawer {
  protected override drawTop_() {
    const top = this.info_.topRow;
    if (!top.elements.some((e) => T.isHat(e))) {
      super.drawTop_();
      return;
    }
    const x = top.xPos;
    const y = this.info_.startY;
    const r = Math.min(HAT_RADIUS, top.width / 2);
    const end = Math.max(y + r, y + this.constants_.CORNER_RADIUS + top.height - top.ascenderHeight);
    this.outlinePath_ +=
      `M ${x},${y + r} a ${r},${r} 0 0,1 ${r},${-r} ` +
      `H ${x + top.width - r} a ${r},${r} 0 0,1 ${r},${r} ` +
      `V ${end}`;
  }
}

/** Zelos pushes fields in the first row past the notch – we want them to start at the left edge like labels. */
class LichtwerkRenderInfo extends Blockly.zelos.RenderInfo {
  protected override adjustXPosition_() {}

  /** Start blocks are a bit taller, like in the design. */
  protected override populateTopRow_() {
    super.populateTopRow_();
    if (this.topRow.elements.some((e) => T.isHat(e))) this.topRow.minHeight += 4;
    if (this.outputConnection) this.topRow.minHeight = 0;
  }

  protected override populateBottomRow_() {
    super.populateBottomRow_();
    if (this.topRow.elements.some((e) => T.isHat(e))) this.bottomRow.minHeight += 4;
    if (this.outputConnection) this.bottomRow.minHeight = 0;
  }

  /**
   * Value blocks: the same space above and below the content. (Zelos uses no
   * spacing there and fills up to the minimum height only at the bottom.)
   */
  override getSpacerRowHeight_(prev: Blockly.blockRendering.Row, next: Blockly.blockRendering.Row) {
    if (this.outputConnection && !this.hasStatementInput && (T.isTopRow(prev) || T.isBottomRow(next))) {
      return VALUE_PADDING;
    }
    return super.getSpacerRowHeight_(prev, next);
  }

  override getInRowSpacing_(
    prev: Blockly.blockRendering.Measurable | null,
    next: Blockly.blockRendering.Measurable | null,
  ) {
    if (!prev && next && T.isField(next)) return EDGE_PADDING;
    if (prev && T.isField(prev) && !next) return EDGE_PADDING;
    return super.getInRowSpacing_(prev, next);
  }
}

/**
 * Blocks plugged into other blocks (numbers, readings, conditions) don't get
 * the dark gap outline that separates stacked blocks – inside a coloured
 * block it would look like a black frame. They get a thin outline in a
 * darker shade of their own colour instead, so a condition stays visible
 * inside a block of the same colour.
 */
class LichtwerkPathObject extends Blockly.zelos.PathObject {
  override applyColour(block: Blockly.BlockSvg) {
    super.applyColour(block);
    const nested = !!block.outputConnection;
    const s = this.svgPath.style;
    if (nested) {
      // inline !important beats the stylesheet's gap outline
      s.setProperty("stroke", this.style.colourTertiary, "important");
      s.setProperty("stroke-width", "1.5px", "important");
    } else {
      s.removeProperty("stroke");
      s.removeProperty("stroke-width");
    }
  }
}

class LichtwerkRenderer extends Blockly.zelos.Renderer {
  protected override makeConstants_() {
    return new LichtwerkConstants();
  }

  override makePathObject(root: SVGElement, style: Blockly.Theme.BlockStyle) {
    return new LichtwerkPathObject(root, style, this.getConstants());
  }

  protected override makeRenderInfo_(block: Blockly.BlockSvg) {
    return new LichtwerkRenderInfo(this, block);
  }

  protected override makeDrawer_(block: Blockly.BlockSvg, info: Blockly.blockRendering.RenderInfo) {
    return new LichtwerkDrawer(block, info as Blockly.zelos.RenderInfo);
  }
}

let rendererRegistered = false;
export function registerRenderer() {
  if (rendererRegistered) return;
  rendererRegistered = true;
  Blockly.blockRendering.register("lichtwerk", LichtwerkRenderer);
}

/* ---------- block definitions ---------- */

let registered = false;

export function registerBlocks() {
  if (registered) return;
  registered = true;

  Blockly.Blocks["lw_on_start"] = {
    init(this: Blockly.Block) {
      row(this, "block.onStart", []).insertFieldAt(0, new Blockly.FieldImage(PLAY_ICON, 16, 16, "▶"));
      this.setNextStatement(true);
      this.setStyle("events");
    },
  };

  Blockly.Blocks["lw_on_key"] = {
    init(this: Blockly.Block) {
      row(this, "block.onKey", [["KEY", dd(keyOptions)]]);
      this.setNextStatement(true);
      this.setStyle("events");
    },
  };

  Blockly.Blocks["lw_on_button"] = {
    init(this: Blockly.Block) {
      row(this, "block.onButton", [["BUTTON", dd(buttonOptions)]]);
      this.setNextStatement(true);
      this.setStyle("events");
    },
  };

  Blockly.Blocks["lw_when"] = {
    init(this: Blockly.Block) {
      rowWithInputs(this, "block.when", [boolIn("COND")]);
      this.setNextStatement(true);
      this.setStyle("events");
    },
  };

  Blockly.Blocks["lw_while"] = {
    init(this: Blockly.Block) {
      rowWithInputs(this, "block.while", [boolIn("COND")]);
      this.setNextStatement(true);
      this.setStyle("events");
    },
  };

  Blockly.Blocks["lw_for_each"] = {
    init(this: Blockly.Block) {
      row(this, "block.forEach", [["GROUP", dd(groupOptions())]]);
      this.appendStatementInput("DO");
      this.setPreviousStatement(true);
      this.setNextStatement(true);
      this.setStyle("loops");
    },
  };

  Blockly.Blocks["lw_repeat"] = {
    init(this: Blockly.Block) {
      row(this, "block.repeat", [["TIMES", num(3, 1, 1000, 1)]]);
      this.appendStatementInput("DO");
      this.setPreviousStatement(true);
      this.setNextStatement(true);
      this.setStyle("loops");
    },
  };

  Blockly.Blocks["lw_forever"] = {
    init(this: Blockly.Block) {
      row(this, "block.forever", []);
      this.appendStatementInput("DO");
      this.setPreviousStatement(true);
      this.setStyle("loops");
    },
  };

  Blockly.Blocks["lw_wait"] = {
    init(this: Blockly.Block) {
      row(this, "block.wait", [["SECONDS", num(1, 0, 600, 0.1)]]);
      this.setPreviousStatement(true);
      this.setNextStatement(true);
      this.setStyle("wait");
    },
  };

  Blockly.Blocks["lw_wait_random"] = {
    init(this: Blockly.Block) {
      row(this, "block.waitRandom", [
        ["MIN", num(1, 0, 600, 0.1)],
        ["MAX", num(3, 0, 600, 0.1)],
      ]);
      this.setPreviousStatement(true);
      this.setNextStatement(true);
      this.setStyle("wait");
    },
  };

  Blockly.Blocks["lw_effect"] = {
    init(this: Blockly.Block) {
      row(this, "block.effect", [
        ["TARGET", dd(groupOptions({ all: true, self: true }))],
        ["EFFECT", new FieldEffectGrid(effectOptions as Blockly.MenuGeneratorFunction)],
        ["COLOR", new FieldColorGrid(colorOptions as Blockly.MenuGeneratorFunction)],
        ["SEQ", dd(seqOptions)],
        ["SET", new FieldSettings()],
      ]);
      this.setPreviousStatement(true);
      this.setNextStatement(true);
      this.setStyle("effects");
    },
    onchange(this: Blockly.Block, e: Blockly.Events.Abstract) {
      syncSettings(this, e);
    },
  };

  Blockly.Blocks["lw_effect_one"] = {
    init(this: Blockly.Block) {
      row(this, "block.effectOne", [
        ["GROUP", dd(groupOptions())],
        ["NR", num(1, 1, 999, 1)],
        ["EFFECT", new FieldEffectGrid(effectOptions as Blockly.MenuGeneratorFunction)],
        ["COLOR", new FieldColorGrid(colorOptions as Blockly.MenuGeneratorFunction)],
        ["SET", new FieldSettings()],
      ]);
      this.setPreviousStatement(true);
      this.setNextStatement(true);
      this.setStyle("effects");
    },
    onchange(this: Blockly.Block, e: Blockly.Events.Abstract) {
      syncSettings(this, e);
    },
  };

  /* ---- conditions, numbers and variables ---- */

  Blockly.Blocks["lw_if_then"] = {
    init(this: Blockly.Block) {
      rowWithInputs(this, "block.if", [boolIn("COND")]);
      this.appendStatementInput("DO");
      this.setInputsInline(true);
      this.setPreviousStatement(true);
      this.setNextStatement(true);
      this.setStyle("logic");
    },
  };

  Blockly.Blocks["lw_if_then_else"] = {
    init(this: Blockly.Block) {
      rowWithInputs(this, "block.if", [boolIn("COND")]);
      this.appendStatementInput("DO");
      this.appendStatementInput("ELSE").appendField(t("block.ifElse"));
      this.setInputsInline(true);
      this.setPreviousStatement(true);
      this.setNextStatement(true);
      this.setStyle("logic");
    },
  };

  Blockly.Blocks["lw_wait_until"] = {
    init(this: Blockly.Block) {
      rowWithInputs(this, "block.waitUntil", [boolIn("COND")]);
      this.setPreviousStatement(true);
      this.setNextStatement(true);
      this.setStyle("wait");
    },
  };

  Blockly.Blocks["lw_repeat_until"] = {
    init(this: Blockly.Block) {
      rowWithInputs(this, "block.repeatUntil", [boolIn("COND")]);
      this.appendStatementInput("DO");
      this.setInputsInline(true);
      this.setPreviousStatement(true);
      this.setNextStatement(true);
      this.setStyle("loops");
    },
  };

  Blockly.Blocks["lw_compare"] = {
    init(this: Blockly.Block) {
      rowWithInputs(this, "block.binary", [numIn("A"), ["OP", dd(compareOptions)], numIn("B")]);
      this.setOutput(true, "Boolean");
      this.setStyle("logic");
    },
  };

  Blockly.Blocks["lw_logic"] = {
    init(this: Blockly.Block) {
      rowWithInputs(this, "block.binary", [boolIn("A"), ["OP", dd(logicOptions)], boolIn("B")]);
      this.setOutput(true, "Boolean");
      this.setStyle("logic");
    },
  };

  Blockly.Blocks["lw_not"] = {
    init(this: Blockly.Block) {
      rowWithInputs(this, "block.not", [boolIn("A")]);
      this.setOutput(true, "Boolean");
      this.setStyle("logic");
    },
  };

  Blockly.Blocks["lw_num"] = {
    init(this: Blockly.Block) {
      this.appendDummyInput().appendField(new Blockly.FieldNumber(0), "NUM");
      this.setOutput(true, "Number");
      this.setStyle("logic");
    },
  };

  Blockly.Blocks["lw_arith"] = {
    init(this: Blockly.Block) {
      rowWithInputs(this, "block.binary", [numIn("A"), ["OP", dd(arithOptions)], numIn("B")]);
      this.setOutput(true, "Number");
      this.setStyle("logic");
    },
  };

  Blockly.Blocks["lw_random"] = {
    init(this: Blockly.Block) {
      rowWithInputs(this, "block.random", [numIn("MIN"), numIn("MAX")]);
      this.setOutput(true, "Number");
      this.setStyle("logic");
    },
  };

  Blockly.Blocks["lw_sensor_value"] = {
    init(this: Blockly.Block) {
      row(this, "block.sensorValue", [["SENSOR", dd(sensorOptions)]]);
      this.setOutput(true, "Number");
      this.setStyle("sensors");
    },
  };

  Blockly.Blocks["lw_var_get"] = {
    init(this: Blockly.Block) {
      this.appendDummyInput().appendField(new Blockly.FieldVariable(null), "VAR");
      this.setOutput(true, "Number");
      this.setStyle("variables");
    },
  };

  Blockly.Blocks["lw_var_set"] = {
    init(this: Blockly.Block) {
      rowWithInputs(this, "block.varSet", [["VAR", new Blockly.FieldVariable(null)], numIn("VALUE")]);
      this.setPreviousStatement(true);
      this.setNextStatement(true);
      this.setStyle("variables");
    },
  };

  Blockly.Blocks["lw_var_change"] = {
    init(this: Blockly.Block) {
      rowWithInputs(this, "block.varChange", [["VAR", new Blockly.FieldVariable(null)], numIn("VALUE")]);
      this.setPreviousStatement(true);
      this.setNextStatement(true);
      this.setStyle("variables");
    },
  };

  /* ---- links: a value keeps steering one setting ("dimmer") ---- */

  /**
   * "Verbinde ⟨Wert⟩ von a bis b → [Tempo] von [Gruppe]: x bis y".
   * The "x bis y" fields depend on the chosen setting, so they are rebuilt
   * when it changes; the choice is saved as extra state, which Blockly loads
   * before the field values.
   */
  type LinkBlock = Blockly.Block & { prop_: LinkProp; updateRange_: (p: LinkProp) => void };
  Blockly.Blocks["lw_link"] = {
    init(this: LinkBlock) {
      rowWithInputs(this, "block.link", [numIn("VALUE"), ["IN_MIN", num(0)], ["IN_MAX", num(100)]]);
      this.appendEndRowInput();
      const prop = new Blockly.FieldDropdown(linkPropOptions as Blockly.MenuGeneratorFunction, (v: string) => {
        this.updateRange_(v as LinkProp);
        return v;
      });
      row(this, "block.linkTo", [
        ["PROP", prop],
        ["TARGET", dd(groupOptions({ all: true, self: true }))],
      ]);
      this.prop_ = "speed";
      this.updateRange_("speed");
      this.setPreviousStatement(true);
      this.setNextStatement(true);
      this.setStyle("links");
    },
    updateRange_(this: LinkBlock, p: LinkProp) {
      if (p === this.prop_ && this.getInput("RANGE")) return;
      this.prop_ = p;
      if (this.getInput("RANGE")) this.removeInput("RANGE");
      const r = LINK_RANGE[p] ?? LINK_RANGE.speed;
      const from = r.field();
      const to = r.field();
      from.setValue(r.from);
      to.setValue(r.to);
      const range: [string, Blockly.Field][] = [
        ["FROM", from],
        ["TO", to],
      ];
      row(this, "block.linkRange", range, "RANGE");
    },
    saveExtraState(this: LinkBlock) {
      return { prop: this.prop_ };
    },
    loadExtraState(this: LinkBlock, state: { prop?: LinkProp }) {
      if (state?.prop) this.updateRange_(state.prop);
    },
  };

  Blockly.Blocks["lw_show_value"] = {
    init(this: Blockly.Block) {
      rowWithInputs(this, "block.showValue", [
        numIn("VALUE"),
        ["TARGET", dd(groupOptions({ all: true, self: true }))],
        ["COLOR", new FieldColorGrid(colorOptions as Blockly.MenuGeneratorFunction)],
      ]);
      this.setPreviousStatement(true);
      this.setNextStatement(true);
      this.setStyle("effects");
    },
  };
}

/* ---------- theme ---------- */

const cat = (id: string) => ({
  cssconfig: {
    row: "blocklyToolboxCategory lw-cat",
    icon: `blocklyToolboxCategoryIcon lw-cat-icon lw-cat-${id}`,
  },
});

/** colourTertiary = outline: a slightly darker shade so stacked blocks stay readable. */
const style = (c: string, outline: string) => ({ colourPrimary: c, colourSecondary: c, colourTertiary: outline });

export function lichtwerkTheme(): Blockly.Theme {
  return Blockly.Theme.defineTheme("lichtwerk", {
    name: "lichtwerk",
    base: Blockly.Themes.Classic,
    blockStyles: {
      events: { ...style("#E2C08D", "#C4A06C"), hat: "cap" },
      loops: style("#A9BCDD", "#889DC4"),
      wait: style("#CBC4DE", "#ADA4C7"),
      effects: style("#8FDCC6", "#6CC2A9"),
      sensors: style("#D9B0A5", "#BE9083"),
      logic: style("#A9D89B", "#89BC7B"),
      variables: style("#E3AFC6", "#C890A8"),
      links: style("#9FD0DC", "#7FB3C0"),
    },
    categoryStyles: {
      events: { colour: "#E2C08D" },
      loops: { colour: "#A9BCDD" },
      wait: { colour: "#CBC4DE" },
      effects: { colour: "#8FDCC6" },
      sensors: { colour: "#D9B0A5" },
      logic: { colour: "#A9D89B" },
      variables: { colour: "#E3AFC6" },
      links: { colour: "#9FD0DC" },
    },
    componentStyles: {
      workspaceBackgroundColour: "#0F1013",
      toolboxBackgroundColour: "#15171B",
      toolboxForegroundColour: "#C9CDD4",
      flyoutBackgroundColour: "#1A1C21",
      flyoutForegroundColour: "#C9CDD4",
      flyoutOpacity: 0.97,
      scrollbarColour: "#3A3E46",
      scrollbarOpacity: 0.6,
      insertionMarkerColour: "#FFFFFF",
      insertionMarkerOpacity: 0.3,
      cursorColour: "#6EE7C8",
      selectedGlowColour: "#6EE7C8",
    },
    fontStyle: { family: "Lexend, system-ui, sans-serif", weight: "600", size: 15 },
    startHats: true,
  });
}

/* ---------- toolbox ---------- */

const n = (v: number) => ({ shadow: { type: "lw_num", fields: { NUM: v } } });
const reading = (sensor: string) => ({ block: { type: "lw_sensor_value", fields: { SENSOR: sensor } } });
const linkBlock = (sensor: string, inMin: number, inMax: number, prop: LinkProp, target: string, from: string, to: string) => ({
  kind: "block",
  type: "lw_link",
  extraState: { prop },
  fields: { IN_MIN: inMin, IN_MAX: inMax, PROP: prop, TARGET: target, FROM: from, TO: to },
  inputs: { VALUE: reading(sensor) },
});
/** "Wenn ⟨…⟩" / "Solange ⟨…⟩" with a sensor comparison plugged in. */
const condHat = (type: string, sensor: string, op: string, v: number) => ({
  kind: "block",
  type,
  inputs: { COND: { block: { type: "lw_compare", fields: { OP: op }, inputs: { A: reading(sensor), B: n(v) } } } },
});

export function toolbox(): Blockly.utils.toolbox.ToolboxDefinition {
  const groups = useProject.getState().project.groups;
  const g = groups[1]?.id ?? groups[0]?.id ?? ALL;
  return {
    kind: "categoryToolbox",
    contents: [
      {
        kind: "category",
        name: t("block.cat.events"),
        categorystyle: "events",
        ...cat("events"),
        contents: [
          { kind: "block", type: "lw_on_start" },
          condHat("lw_when", "noise", ">", 70),
          condHat("lw_while", "temperature", ">", 20),
          { kind: "block", type: "lw_on_button", fields: { BUTTON: "1" } },
          { kind: "block", type: "lw_on_key" },
        ],
      },
      {
        kind: "category",
        name: t("block.cat.loops"),
        categorystyle: "loops",
        ...cat("loops"),
        contents: [
          { kind: "block", type: "lw_for_each", fields: { GROUP: g } },
          { kind: "block", type: "lw_repeat" },
          { kind: "block", type: "lw_forever" },
          { kind: "block", type: "lw_repeat_until" },
        ],
      },
      {
        kind: "category",
        name: t("block.cat.wait"),
        categorystyle: "wait",
        ...cat("wait"),
        contents: [
          { kind: "block", type: "lw_wait", fields: { SECONDS: 0.3 } },
          { kind: "block", type: "lw_wait_random" },
          { kind: "block", type: "lw_wait_until" },
        ],
      },
      {
        kind: "category",
        name: t("block.cat.effects"),
        categorystyle: "effects",
        ...cat("effects"),
        contents: [
          { kind: "block", type: "lw_effect", fields: { TARGET: THIS, EFFECT: "glow", COLOR: "rainbow" } },
          { kind: "block", type: "lw_effect", fields: { TARGET: g, EFFECT: "blink", COLOR: "#FFD98A" } },
          { kind: "block", type: "lw_effect_one", fields: { GROUP: g, NR: 1, EFFECT: "fill", COLOR: "#FFD98A" } },
          { kind: "block", type: "lw_effect", fields: { TARGET: g, EFFECT: "plasma", COLOR: "#B07CFF", SET: encodeParams({ speed: 2 }) } },
          { kind: "block", type: "lw_effect", fields: { TARGET: g, EFFECT: "text", COLOR: "#FFFFFF", SET: encodeParams({ text: t("param.text.default") }) } },
          { kind: "block", type: "lw_effect", fields: { TARGET: g, EFFECT: "banner", COLOR: "#FFFFFF", SET: encodeParams({ text: t("param.text.default") }) } },
          { kind: "block", type: "lw_effect", fields: { TARGET: g, EFFECT: "level", COLOR: "#FF6B5E", SET: encodeParams({ source: "temperature" }) } },
          { kind: "block", type: "lw_show_value", fields: { TARGET: g, COLOR: "#FFD98A" }, inputs: { VALUE: n(0) } },
          { kind: "block", type: "lw_effect", fields: { TARGET: ALL, EFFECT: "off", COLOR: "#FFFFFF" } },
        ],
      },
      {
        kind: "category",
        name: t("block.cat.links"),
        categorystyle: "links",
        ...cat("links"),
        contents: [
          linkBlock("noise", 40, 90, "speed", g, "0.5", "3.5"),
          linkBlock("temperature", 15, 30, "color", g, "#5C9DFF", "#FF6B5E"),
          linkBlock("distance", 200, 20, "size", g, "0.6", "2.4"),
          linkBlock("noise", 40, 90, "brightness", g, "0.25", "1"),
          linkBlock("noise", 40, 90, "amount", g, "0.1", "1"),
          linkBlock("distance", 200, 20, "level", g, "0", "1"),
          linkBlock("noise", 30, 110, "graph", g, "0", "1"),
          condHat("lw_while", "temperature", ">", 20),
        ],
      },
      {
        kind: "category",
        name: t("block.cat.logic"),
        categorystyle: "logic",
        ...cat("logic"),
        contents: [
          { kind: "block", type: "lw_if_then" },
          { kind: "block", type: "lw_if_then_else" },
          { kind: "block", type: "lw_compare", fields: { OP: ">" }, inputs: { A: n(0), B: n(10) } },
          { kind: "block", type: "lw_compare", fields: { OP: "=" }, inputs: { A: n(0), B: n(3) } },
          { kind: "block", type: "lw_logic", fields: { OP: "and" } },
          { kind: "block", type: "lw_logic", fields: { OP: "or" } },
          { kind: "block", type: "lw_not" },
          { kind: "block", type: "lw_arith", fields: { OP: "+" }, inputs: { A: n(1), B: n(1) } },
          { kind: "block", type: "lw_arith", fields: { OP: "*" }, inputs: { A: n(2), B: n(3) } },
          { kind: "block", type: "lw_random", inputs: { MIN: n(1), MAX: n(6) } },
          { kind: "block", type: "lw_num", fields: { NUM: 10 } },
        ],
      },
      {
        kind: "category",
        name: t("block.cat.sensors"),
        categorystyle: "sensors",
        ...cat("sensors"),
        contents: [
          condHat("lw_when", "noise", ">", 70),
          condHat("lw_while", "noise", ">", 70),
          { kind: "block", type: "lw_sensor_value", fields: { SENSOR: "temperature" } },
          {
            kind: "block",
            type: "lw_compare",
            fields: { OP: "<" },
            inputs: { A: { block: { type: "lw_sensor_value", fields: { SENSOR: "distance" } } }, B: n(50) },
          },
        ],
      },
      {
        kind: "category",
        name: t("block.cat.variables"),
        categorystyle: "variables",
        custom: VARIABLES_CATEGORY,
        ...cat("variables"),
      },
    ],
  };
}

export const VARIABLES_CATEGORY = "LW_VARIABLES";
export const NEW_VARIABLE_BUTTON = "LW_NEW_VARIABLE";

/** Flyout of the variables category: a "new variable" button, then blocks for the newest variable. */
export function variablesFlyout(ws: Blockly.WorkspaceSvg): Blockly.utils.toolbox.FlyoutItemInfoArray {
  const vars = ws.getVariableMap().getAllVariables();
  const items: Blockly.utils.toolbox.FlyoutItemInfoArray = [
    { kind: "button", text: t("var.new"), callbackkey: NEW_VARIABLE_BUTTON },
  ];
  if (!vars.length) {
    items.push({ kind: "label", text: t("var.hint") });
    return items;
  }
  const last = vars[vars.length - 1];
  const field = { VAR: { id: last.getId() } };
  items.push(
    { kind: "block", type: "lw_var_set", fields: field, inputs: { VALUE: n(0) } },
    { kind: "block", type: "lw_var_change", fields: field, inputs: { VALUE: n(1) } },
    { kind: "block", type: "lw_show_value", fields: { TARGET: ALL, COLOR: "#FFD98A" }, inputs: { VALUE: { block: { type: "lw_var_get", fields: field } } } },
  );
  for (const v of vars) items.push({ kind: "block", type: "lw_var_get", fields: { VAR: { id: v.getId() } } });
  return items;
}
