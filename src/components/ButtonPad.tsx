"use client";

import { useT } from "@/lib/i18n";
import { BUTTON_STYLE, usedButtons } from "@/lib/buttons";
import { interpreter, startProgram, useRuntime } from "@/lib/runtime";
import type { Script } from "@/lib/program";

/**
 * The buttons the program listens to ("Wenn Knopf … gedrückt"). Only buttons
 * that are used appear. Keys 1–4 do the same on a laptop.
 */
export default function ButtonPad({ scripts, overlay = false }: { scripts?: Script[]; overlay?: boolean }) {
  const t = useT();
  const running = useRuntime((s) => s.running);
  const runtimeScripts = useRuntime((s) => s.scripts);
  const buttons = usedButtons(scripts ?? runtimeScripts);
  if (!buttons.length) return null;

  const press = async (b: string) => {
    if (!useRuntime.getState().running) await startProgram();
    interpreter.button(b);
  };

  return (
    <div className={`button-pad${overlay ? " overlay" : ""}`} role="group" aria-label={t("pad.title")}>
      {buttons.map((b) => {
        const s = BUTTON_STYLE[b];
        return (
          <button
            key={b}
            className={`pad-btn${running ? "" : " idle"}`}
            style={{ background: s.color }}
            aria-label={`${t(s.key)} (${b})`}
            title={`${t(s.key)} · ${b}`}
            onPointerDown={(e) => {
              e.stopPropagation();
              void press(b);
            }}
          >
            {b}
          </button>
        );
      })}
    </div>
  );
}
