import * as Blockly from "blockly/core";
import { FieldColorGrid, FieldEffectGrid, FieldSettings } from "./gridFields";
import { t, type TKey } from "@/lib/i18n";
import { EFFECTS, LIGHT_COLORS, SPECIAL_COLORS, effectDef } from "@/lib/palette";
import { encodeParams, parseParams } from "@/lib/params";
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
  ...LIGHT_COLORS.map((c): Opt => [t(c.key), c.value]),
  ...SPECIAL_COLORS.map((c): Opt => [t(c.key), c.value]),
];
const seqOptions = (): Opt[] => [
  [t("block.together"), "together"],
  [t("block.sequential"), "sequential"],
];
const sensorOptions = (): Opt[] => allChannels().map((c): Opt => [channelLabel(c), c.id]);
const opOptions = (): Opt[] => [
  [">", ">"],
  ["<", "<"],
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
function row(block: Blockly.Block, key: TKey, fields: [string, Blockly.Field][]) {
  const input = block.appendDummyInput();
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
    if (effect === "text" && !p.text) field.setValue(encodeParams({ ...p, text: t("param.text.default") }));
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
  }

  protected override populateBottomRow_() {
    super.populateBottomRow_();
    if (this.topRow.elements.some((e) => T.isHat(e))) this.bottomRow.minHeight += 4;
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

class LichtwerkRenderer extends Blockly.zelos.Renderer {
  protected override makeConstants_() {
    return new LichtwerkConstants();
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

  Blockly.Blocks["lw_on_tap"] = {
    init(this: Blockly.Block) {
      row(this, "block.onTap", []);
      this.setNextStatement(true);
      this.setStyle("events");
    },
  };

  Blockly.Blocks["lw_on_sensor"] = {
    init(this: Blockly.Block) {
      row(this, "block.onSensor", [
        ["SENSOR", dd(sensorOptions)],
        ["OP", dd(opOptions)],
        ["VALUE", num(70)],
      ]);
      this.setNextStatement(true);
      this.setStyle("sensors");
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

  Blockly.Blocks["lw_if"] = {
    init(this: Blockly.Block) {
      row(this, "block.ifSensor", [
        ["SENSOR", dd(sensorOptions)],
        ["OP", dd(opOptions)],
        ["VALUE", num(25)],
      ]);
      this.appendStatementInput("DO");
      this.setPreviousStatement(true);
      this.setNextStatement(true);
      this.setStyle("sensors");
    },
  };

  Blockly.Blocks["lw_if_else"] = {
    init(this: Blockly.Block) {
      row(this, "block.ifSensor", [
        ["SENSOR", dd(sensorOptions)],
        ["OP", dd(opOptions)],
        ["VALUE", num(25)],
      ]);
      this.appendStatementInput("DO");
      this.appendStatementInput("ELSE").appendField(t("block.ifElse"));
      this.setPreviousStatement(true);
      this.setNextStatement(true);
      this.setStyle("sensors");
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
    },
    categoryStyles: {
      events: { colour: "#E2C08D" },
      loops: { colour: "#A9BCDD" },
      wait: { colour: "#CBC4DE" },
      effects: { colour: "#8FDCC6" },
      sensors: { colour: "#D9B0A5" },
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
          { kind: "block", type: "lw_on_key" },
          { kind: "block", type: "lw_on_tap" },
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
          { kind: "block", type: "lw_effect", fields: { TARGET: g, EFFECT: "number", COLOR: "#FFD98A", SET: encodeParams({ source: "temperature" }) } },
          { kind: "block", type: "lw_effect", fields: { TARGET: ALL, EFFECT: "off", COLOR: "#FFFFFF" } },
        ],
      },
      {
        kind: "category",
        name: t("block.cat.sensors"),
        categorystyle: "sensors",
        ...cat("sensors"),
        contents: [
          { kind: "block", type: "lw_on_sensor", fields: { SENSOR: "noise", OP: ">", VALUE: 70 } },
          { kind: "block", type: "lw_if", fields: { SENSOR: "temperature", OP: ">", VALUE: 25 } },
          { kind: "block", type: "lw_if_else", fields: { SENSOR: "distance", OP: "<", VALUE: 50 } },
        ],
      },
    ],
  };
}

/** A small example program so the workspace isn't empty the first time. */
export function exampleProgram(): object {
  const groups = useProject.getState().project.groups;
  const g = groups[1]?.id ?? groups[0]?.id ?? ALL;
  return {
    blocks: {
      languageVersion: 0,
      blocks: [
        {
          type: "lw_on_start",
          x: 40,
          y: 40,
          next: {
            block: {
              type: "lw_for_each",
              fields: { GROUP: g },
              inputs: {
                DO: {
                  block: {
                    type: "lw_effect",
                    fields: { TARGET: THIS, EFFECT: "glow", COLOR: "rainbow" },
                    next: { block: { type: "lw_wait", fields: { SECONDS: 0.3 } } },
                  },
                },
              },
            },
          },
        },
        {
          type: "lw_on_key",
          x: 40,
          y: 360,
          fields: { KEY: "space" },
          next: {
            block: { type: "lw_effect", fields: { TARGET: ALL, EFFECT: "sparkle", COLOR: "#FFD98A" } },
          },
        },
      ],
    },
  };
}
