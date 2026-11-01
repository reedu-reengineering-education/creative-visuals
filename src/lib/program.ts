import { cleanParams } from "./params";
import type { ColorSpec, EffectParams, EffectType, Sequence } from "./types";

/** The program the blocks compile to. Plain JSON so it can be stored and sent around. */

export type Target =
  | { kind: "all" }
  | { kind: "group"; groupId: string }
  | { kind: "item"; groupId: string; nr: number }
  | { kind: "this" };

export interface Cond {
  sensor: string;
  op: ">" | "<";
  value: number;
}

export type Stmt =
  | { k: "effect"; target: Target; effect: EffectType; color: ColorSpec; sequence?: Sequence; params?: EffectParams }
  | { k: "wait"; min: number; max: number }
  | { k: "repeat"; times: number; body: Stmt[] }
  | { k: "forever"; body: Stmt[] }
  | { k: "forEach"; groupId: string; body: Stmt[] }
  | { k: "if"; cond: Cond; body: Stmt[]; elseBody: Stmt[] };

export type Trigger = { k: "start" } | { k: "key"; key: string } | { k: "tap" } | { k: "sensor"; cond: Cond };

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

/** Turn the program into readable JavaScript-like code for older kids. */
export function programToCode(
  scripts: Script[],
  names: { group: (id: string) => string; sensor: (id: string) => string },
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
  const cond = (c: Cond) => `sensor(${str(names.sensor(c.sensor))}) ${c.op} ${c.value}`;
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
              `${ind(d)}if (${cond(s.cond)}) {\n${stmts(s.body, d + 1)}\n${ind(d)}}` +
              (s.elseBody.length ? ` else {\n${stmts(s.elseBody, d + 1)}\n${ind(d)}}` : "")
            );
        }
      })
      .join("\n");
  return scripts
    .map((sc) => {
      let head: string;
      switch (sc.trigger.k) {
        case "start":
          head = `beimStart(async () => {`;
          break;
        case "key":
          head = `beiTaste(${str(sc.trigger.key)}, async () => {`;
          break;
        case "tap":
          head = `beimTippen(async () => {`;
          break;
        case "sensor":
          head = `wenn(() => ${cond(sc.trigger.cond)}, async () => {`;
          break;
      }
      return `${head}\n${stmts(sc.body, 1)}\n});`;
    })
    .join("\n\n");
}
