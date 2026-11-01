"use client";

import { useEffect, useRef, useState } from "react";
import Stage from "./Stage";
import { createDefaultProject, loadStoredProject } from "@/lib/store";
import { useSensors } from "@/lib/sensors";
import { normaliseKey } from "@/lib/program";
import { openChannel, type SyncMessage } from "@/lib/sync";
import { initLang, useT } from "@/lib/i18n";
import { isNativeOutput } from "@/lib/externalDisplay";
import type { Project, RuntimeOverride } from "@/lib/types";

/** The projector window: only light, no interface. Controlled by the editor via BroadcastChannel. */
export default function OutputView() {
  const t = useT();
  const data = useRef<{ project: Project; overrides: Record<string, RuntimeOverride>; running: boolean } | null>(null);
  const post = useRef<(m: SyncMessage) => void>(() => {});
  const [ready, setReady] = useState(false);
  const [hint, setHint] = useState(true);
  const [cursorHidden, setCursorHidden] = useState(false);

  useEffect(() => {
    initLang();
    data.current = { project: loadStoredProject() ?? createDefaultProject(), overrides: {}, running: false };
    setReady(true);
    const ch = openChannel((m) => {
      if (!data.current) return;
      switch (m.type) {
        case "project":
          data.current = { ...data.current, project: m.project };
          break;
        case "runtime":
          data.current = { ...data.current, running: m.running, overrides: m.overrides };
          break;
        case "sensors":
          useSensors.getState().setAll(m.values);
          break;
        case "ping":
          post.current({ type: "pong" });
          break;
      }
    });
    post.current = ch.post;
    ch.post({ type: "hello" });

    const onKey = (e: KeyboardEvent) => {
      const k = normaliseKey(e.key);
      if (k) {
        e.preventDefault();
        ch.post({ type: "key", key: k });
      }
    };
    window.addEventListener("keydown", onKey);
    // an external display of the iOS app is already fullscreen and can't be clicked
    if (isNativeOutput()) setHint(false);
    const hideHint = setTimeout(() => setHint(false), 5000);

    let cursorTimer: ReturnType<typeof setTimeout> | null = null;
    const onMove = () => {
      setCursorHidden(false);
      if (cursorTimer) clearTimeout(cursorTimer);
      cursorTimer = setTimeout(() => setCursorHidden(true), 2000);
    };
    window.addEventListener("pointermove", onMove);

    return () => {
      ch.close();
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointermove", onMove);
      clearTimeout(hideHint);
      if (cursorTimer) clearTimeout(cursorTimer);
    };
  }, []);

  const goFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {});
    }
  };

  return (
    <div className="app" style={{ background: "#000", cursor: cursorHidden ? "none" : "default" }} onDoubleClick={goFullscreen}>
      {ready && (
        <Stage
          view="light"
          interaction="tap"
          source={() => data.current!}
          onTap={goFullscreen}
        />
      )}
      <div className="output-hint" style={{ opacity: hint ? 1 : 0 }}>
        {t("output.hint")}
      </div>
    </div>
  );
}
