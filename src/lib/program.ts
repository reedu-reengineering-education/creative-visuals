import { cleanParams } from "./params";
import type { ColorSpec, EffectParams, EffectType, Sequence } from "./types";

/** The program the blocks compile to. Plain JSON so it can be stored and sent around. */

export type Target =
  | { kind: "all" }
  | { kind: "group"; groupId: string }
  | { kind: "item"; groupId: string; nr: number }
  | { kind: "this" };

/** A value: numbers, variables, sensor readings and what you can compute from them. */
export type Expr =
  | { k: "num"; v: number }
  | { k: "var"; id: string }
  | { k: "sensor"; sensor: string }
  | { k: "random"; min: Expr; max: Expr }
  | { k: "arith"; op: "+" | "-" | "*" | "/"; a: Expr; b: Expr }
  | { k: "cmp"; op: ">" | "<" | "="; a: Expr; b: Expr }
  | { k: "logic"; op: "and" | "or"; a: Expr; b: Expr }
  | { k: "not"; a: Expr };

export type Stmt =
  | { k: "effect"; target: Target; effect: EffectType; color: ColorSpec; sequence?: Sequence; params?: EffectParams }
  | { k: "wait"; min: number; max: number }
  | { k: "waitUntil"; cond: Expr }
  | { k: "repeat"; times: number; body: Stmt[] }
  | { k: "repeatUntil"; cond: Expr; body: Stmt[] }
  | { k: "forever"; body: Stmt[] }
  | { k: "forEach"; groupId: string; body: Stmt[] }
  | { k: "if"; cond: Expr; body: Stmt[]; elseBody: Stmt[] }
  | { k: "setVar"; id: string; value: Expr }
  | { k: "changeVar"; id: string; by: Expr }
  /** show a value (live, it keeps updating) as big number on the shapes */
  | { k: "show"; target: Target; value: Expr; color: ColorSpec }
  /**
   * A "dimmer": from now on the value keeps steering one setting of the
   * shapes, mapped from [inMin, inMax] to [from, to]. It changes whatever
   * effect is shown there instead of setting a new one.
   */
  | { k: "link"; target: Target; prop: LinkProp; value: Expr; inMin: number; inMax: number; from: LinkOut; to: LinkOut };

export type LinkProp = "speed" | "size" | "brightness" | "color" | "level" | "amount" | "graph";
/** a number (speed / size multiplier, brightness 0..1) or a CSS colour */
export type LinkOut = number | string;

/** The on-screen buttons ("1".."4", also keys 1–4). */
export const BUTTONS = ["1", "2", "3", "4"] as const;

export type Trigger =
  | { k: "start" }
  | { k: "key"; key: string }
  | { k: "button"; button: string }
  /** starts once each time the condition turns true */
  | { k: "when"; cond: Expr }
  /** runs while the condition is true; when it turns false the script stops and its effects disappear */
  | { k: "while"; cond: Expr };

export interface Script {
  id: string;
  trigger: Trigger;
  body: Stmt[];
  /** Timeline scripts started by an event disappear again when they are done. */
  clearOnEnd?: boolean;
}

/** Map a KeyboardEvent.key to the names used in the key block. */
export function normaliseKey(key: string): string | null {
  if (key === " " || key === "Spacebar") return "space";
  if (key === "ArrowLeft") return "left";
  if (key === "ArrowRight") return "right";
  if (key === "ArrowUp") return "up";
  if (key === "ArrowDown") return "down";
  if (/^[a-zA-Z0-9]$/.test(key)) return key.toLowerCase();
  return null;
}

const LINK_NAMES: Record<LinkProp, string> = {
  speed: "tempo",
  size: "groesse",
  brightness: "helligkeit",
  color: "farbe",
  level: "fuellstand",
  amount: "menge",
  graph: "kurve",
};

/** Turn the program into readable JavaScript-like code for older kids. */
export function programToCode(
  scripts: Script[],
  names: { group: (id: string) => string; sensor: (id: string) => string; variable: (id: string) => string },
  /** variables to declare at the top */
  variableIds: string[] = [],
): string {
  const ind = (n: number) => "  ".repeat(n);
  const str = (s: string) => JSON.stringify(s);
  const target = (tg: Target): string => {
    switch (tg.kind) {
      case "all":
        return "alles()";
      case "this":
        return "dieses";
      case "group":
        return `gruppe(${str(names.group(tg.groupId))})`;
      case "item":
        return `gruppe(${str(names.group(tg.groupId))})[${tg.nr - 1}]`;
    }
  };
  const ident = (id: string) => names.variable(id).trim().replace(/[^\p{L}\p{N}_$]+/gu, "_") || "variable";
  const OPS = { "+": "+", "-": "-", "*": "*", "/": "/", ">": ">", "<": "<", "=": "===", and: "&&", or: "||" };
  /** `top`: no brackets needed around it */
  const expr = (e: Expr, top = true): string => {
    const wrap = (x: string) => (top ? x : `(${x})`);
    switch (e.k) {
      case "num":
        return String(e.v);
      case "var":
        return ident(e.id);
      case "sensor":
        return `sensor(${str(names.sensor(e.sensor))})`;
      case "random":
        return `zufall(${expr(e.min)}, ${expr(e.max)})`;
      case "arith":
      case "cmp":
      case "logic":
        return wrap(`${expr(e.a, false)} ${OPS[e.op]} ${expr(e.b, false)}`);
      case "not":
        return `!${expr(e.a, false)}`;
    }
  };
  /** settings as a small object with German keys, like the rest of the code view */
  const params = (p: EffectParams | undefined): string => {
    const c = cleanParams(p);
    const parts: string[] = [];
    if (c.speed !== undefined) parts.push(`tempo: ${c.speed}`);
    if (c.size !== undefined) parts.push(`groesse: ${c.size}`);
    if (c.brightness !== undefined) parts.push(`helligkeit: ${c.brightness}`);
    if (c.dir) parts.push(`richtung: ${str(c.dir)}`);
    if (c.color2) parts.push(`farbe2: ${str(c.color2)}`);
    if (c.text) parts.push(`text: ${str(c.text)}`);
    if (c.source) parts.push(`zeige: ${str(names.sensor(c.source))}`);
    return parts.length ? `, { ${parts.join(", ")} }` : "";
  };
  const stmts = (list: Stmt[], d: number): string =>
    list
      .map((s) => {
        switch (s.k) {
          case "effect":
            return `${ind(d)}${target(s.target)}.effekt(${str(s.effect)}, ${str(s.color)}${s.sequence === "sequential" ? ", nacheinander" : ""}${params(s.params)});`;
          case "wait":
            return s.min === s.max
              ? `${ind(d)}await warte(${s.min});`
              : `${ind(d)}await warte(zufall(${s.min}, ${s.max}));`;
          case "repeat":
            return `${ind(d)}for (let i = 0; i < ${s.times}; i++) {\n${stmts(s.body, d + 1)}\n${ind(d)}}`;
          case "forever":
            return `${ind(d)}while (true) {\n${stmts(s.body, d + 1)}\n${ind(d)}}`;
          case "forEach":
            return `${ind(d)}for (const dieses of gruppe(${str(names.group(s.groupId))})) {\n${stmts(s.body, d + 1)}\n${ind(d)}}`;
          case "if":
            return (
              `${ind(d)}if (${expr(s.cond)}) {\n${stmts(s.body, d + 1)}\n${ind(d)}}` +
              (s.elseBody.length ? ` else {\n${stmts(s.elseBody, d + 1)}\n${ind(d)}}` : "")
            );
          case "waitUntil":
            return `${ind(d)}await warteBis(() => ${expr(s.cond)});`;
          case "repeatUntil":
            return `${ind(d)}while (!${expr(s.cond, false)}) {\n${stmts(s.body, d + 1)}\n${ind(d)}}`;
          case "setVar":
            return `${ind(d)}${ident(s.id)} = ${expr(s.value)};`;
          case "changeVar":
            return `${ind(d)}${ident(s.id)} += ${expr(s.by)};`;
          case "show":
            return `${ind(d)}${target(s.target)}.zeige(() => ${expr(s.value)}, ${str(s.color)});`;
          case "link":
            return `${ind(d)}${target(s.target)}.verbinde(() => ${expr(s.value)}, [${s.inMin}, ${s.inMax}], ${str(LINK_NAMES[s.prop])}, [${[s.from, s.to].map((x) => (typeof x === "number" ? x : str(x))).join(", ")}]);`;
        }
      })
      .join("\n");
  const decls = variableIds.map((id) => `let ${ident(id)} = 0;`).join("\n");
  const body = scripts
    .map((sc) => {
      let head: string;
      switch (sc.trigger.k) {
        case "start":
          head = `beimStart(async () => {`;
          break;
        case "key":
          head = `beiTaste(${str(sc.trigger.key)}, async () => {`;
          break;
        case "button":
          head = `beiKnopf(${sc.trigger.button}, async () => {`;
          break;
        case "when":
          head = `wenn(() => ${expr(sc.trigger.cond)}, async () => {`;
          break;
        case "while":
          head = `solange(() => ${expr(sc.trigger.cond)}, async () => {`;
          break;
      }
      return `${head}\n${stmts(sc.body, 1)}\n});`;
    })
    .join("\n\n");
  return decls && body ? `${decls}\n\n${body}` : decls || body;
}
