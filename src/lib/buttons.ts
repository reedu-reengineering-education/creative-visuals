/**
 * The on-screen buttons for the "Wenn Knopf … gedrückt" block. They work on
 * every setup: tapped on the iPad (also in Show mode, where there is no
 * keyboard), clicked on a laptop, or pressed as keys 1–4.
 */
import { t, type TKey } from "./i18n";
import { BUTTONS } from "./program";
import type { Script } from "./program";

export const BUTTON_STYLE: Record<string, { color: string; key: TKey }> = {
  "1": { color: "#FF6B5E", key: "button.red" },
  "2": { color: "#7CF29A", key: "button.green" },
  "3": { color: "#5C9DFF", key: "button.blue" },
  "4": { color: "#FFE45C", key: "button.yellow" },
};

export function buttonLabel(b: string): string {
  const s = BUTTON_STYLE[b];
  return s ? `● ${t(s.key)}` : b;
}

/** Buttons that some script listens to (in pad order). */
export function usedButtons(scripts: Script[]): string[] {
  const used = new Set(scripts.flatMap((s) => (s.trigger.k === "button" ? [s.trigger.button] : [])));
  return BUTTONS.filter((b) => used.has(b));
}
