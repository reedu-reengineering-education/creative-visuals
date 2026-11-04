"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useProject } from "@/lib/store";
import { initLang, useT } from "@/lib/i18n";
import { interpreter, restartKeepingTime, startProgram, stopProgram, useRuntime } from "@/lib/runtime";
import { useTimelineUi } from "@/lib/timelineUi";
import TimelineDock from "./TimelineDock";
import { useSensors } from "@/lib/sensors";
import { BUTTONS, normaliseKey } from "@/lib/program";
import { openChannel, type SyncMessage } from "@/lib/sync";
import type { Mode } from "@/lib/types";
import Stage from "./Stage";
import { Palette, ToolRail } from "./DrawTools";
import ClipInspector from "./ClipInspector";
import ButtonPad from "./ButtonPad";
import ShapeMenu from "./ShapeMenu";
import SensorPanel from "./SensorPanel";
import MenuDialog, { HelpDialog } from "./MenuDialog";
import {
  IconBlocks,
  IconHelp,
  IconMenu,
  IconPen,
  IconPlay,
  IconPlayFilled,
  IconSensor,
  IconSparkle,
  IconStopFilled,
} from "./Icons";

// Blockly only works in the browser
const CodeMode = dynamic(() => import("./CodeMode"), { ssr: false });

const MODES: { mode: Mode; key: "mode.draw" | "mode.effects" | "mode.code" | "mode.show"; Icon: () => React.ReactElement }[] = [
  { mode: "draw", key: "mode.draw", Icon: IconPen },
  { mode: "effects", key: "mode.effects", Icon: IconSparkle },
  { mode: "code", key: "mode.code", Icon: IconBlocks },
  { mode: "show", key: "mode.show", Icon: IconPlay },
];

/** A key press for the program: key blocks, and keys 1–4 also press the on-screen buttons. */
function pressKey(key: string) {
  if (!useRuntime.getState().running) return;
  interpreter.key(key);
  if ((BUTTONS as readonly string[]).includes(key)) interpreter.button(key);
}

/** Runs the program clock, keyboard input and the sync with an output window. */
function useRuntimeDriver() {
  useEffect(() => {
    // program clock
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      if (useRuntime.getState().running) interpreter.tick(Date.now());
    };
    raf = requestAnimationFrame(loop);

    // output window sync
    let lastPong = 0;
    const ch = openChannel((m: SyncMessage) => {
      switch (m.type) {
        case "hello":
          lastPong = Date.now();
          useRuntime.getState().setOutputConnected(true);
          sendAll();
          break;
        case "pong":
          lastPong = Date.now();
          // the output was there before the editor (e.g. the iOS app started with a projector attached)
          if (!useRuntime.getState().outputConnected) {
            useRuntime.getState().setOutputConnected(true);
            sendAll();
          }
          break;
        case "key":
          pressKey(m.key);
          break;
      }
    });
    const sendAll = () => {
      ch.post({ type: "project", project: useProject.getState().project });
      const rt = useRuntime.getState();
      ch.post({ type: "runtime", running: rt.running, overrides: rt.overrides, pausedAt: rt.pausedAt });
      ch.post({ type: "sensors", values: useSensors.getState().values });
    };
    let restartTimer: ReturnType<typeof setTimeout> | null = null;
    const unsubProject = useProject.subscribe((s, prev) => {
      if (s.project !== prev.project) ch.post({ type: "project", project: s.project });
      // blocks or timeline changed: keep playing from the same position with the new program
      if (s.project.program !== prev.project.program) {
        if (restartTimer) clearTimeout(restartTimer);
        restartTimer = setTimeout(restartKeepingTime, 120);
      }
    });
    const unsubRuntime = useRuntime.subscribe((s, prev) => {
      if (s.overrides !== prev.overrides || s.running !== prev.running || s.pausedAt !== prev.pausedAt) {
        ch.post({ type: "runtime", running: s.running, overrides: s.overrides, pausedAt: s.pausedAt });
      }
    });
    let sensorTimer: ReturnType<typeof setTimeout> | null = null;
    const unsubSensors = useSensors.subscribe(() => {
      if (sensorTimer) return;
      sensorTimer = setTimeout(() => {
        sensorTimer = null;
        ch.post({ type: "sensors", values: useSensors.getState().values });
      }, 200);
    });
    const ping = setInterval(() => {
      ch.post({ type: "ping" });
      if (Date.now() - lastPong > 5000 && useRuntime.getState().outputConnected) {
        useRuntime.getState().setOutputConnected(false);
      }
    }, 2000);
    ch.post({ type: "ping" });

    // keyboard -> program
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      if (target?.closest?.(".blocklyWidgetDiv, .blocklyDropDownDiv")) return;
      const key = normaliseKey(e.key);
      if (key) pressKey(key);
    };
    window.addEventListener("keydown", onKey);

    return () => {
      cancelAnimationFrame(raf);
      clearInterval(ping);
      if (sensorTimer) clearTimeout(sensorTimer);
      unsubProject();
      unsubRuntime();
      unsubSensors();
      ch.close();
      window.removeEventListener("keydown", onKey);
    };
  }, []);
}

export default function Editor() {
  const t = useT();
  const hydrated = useProject((s) => s.hydrated);
  const mode = useProject((s) => s.mode);
  const setMode = useProject((s) => s.setMode);
  const outputConnected = useRuntime((s) => s.outputConnected);
  const sensorConnected = useSensors((s) => s.status === "connected");
  const [sensorsOpen, setSensorsOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [shapeMenu, setShapeMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const running = useRuntime((s) => s.running);
  const [hintVisible, setHintVisible] = useState(true);
  const prevMode = useRef<Mode>("draw");
  const selectedRow = useTimelineUi((s) => s.selectedRow);
  const dockCollapsed = useTimelineUi((s) => s.collapsed);
  const strokes = useProject((s) => s.project.strokes);
  const highlightIds = (() => {
    if (mode !== "effects" || !selectedRow) return undefined;
    const [groupId, nr] = selectedRow.split("#");
    const list = strokes.filter((x) => x.groupId === groupId);
    return nr ? (list[Number(nr) - 1] ? [list[Number(nr) - 1].id] : []) : list.map((x) => x.id);
  })();

  useEffect(() => {
    initLang();
    useProject.getState().hydrate();
  }, []);

  useRuntimeDriver();

  // Show mode: start the program, hide the exit hint after a moment, Esc goes back
  useEffect(() => {
    if (mode !== "show") return;
    if (!useRuntime.getState().running) void startProgram();
    setHintVisible(true);
    const hide = setTimeout(() => setHintVisible(false), 3500);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMode(prevMode.current === "show" ? "draw" : prevMode.current);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(hide);
      window.removeEventListener("keydown", onKey);
    };
  }, [mode, setMode]);

  const changeMode = (m: Mode) => {
    if (m === "show") prevMode.current = mode;
    setMode(m);
  };

  if (!hydrated) return <div className="app" />;

  if (mode === "show") {
    return (
      <div className="app" style={{ background: "#000" }}>
        <Stage
          view="light"
          interaction="tap"
          onTwoFingers={() => setMode(prevMode.current === "show" ? "draw" : prevMode.current)}
        />
        <ButtonPad overlay />
        <p className="show-hint" style={{ opacity: hintVisible ? 1 : 0 }}>
          {t("show.exit")}
        </p>
      </div>
    );
  }

  return (
    <div className={`app dotted${mode === "code" ? " code" : ""}${mode === "effects" ? ` effects${dockCollapsed ? " dock-collapsed" : ""}` : ""}`}>
      {mode !== "code" && (
        <Stage
          view={mode === "draw" ? "draw" : "effects"}
          interaction={mode === "draw" ? "draw" : "select"}
          highlightId={shapeMenu?.id ?? null}
          highlightIds={highlightIds}
          onLongPress={(id, x, y) => setShapeMenu({ id, x, y })}
        />
      )}

      {/* only worth a word when an output window (or the projector in the iOS app) is connected */}
      {outputConnected && (
        <div className="status">
          <span className="dot" />
          {t("status.output")}
        </div>
      )}

      <nav className="modebar bar" aria-label="Modus">
        {MODES.map(({ mode: m, key, Icon }) => (
          <button key={m} className={`seg${mode === m ? " on" : ""}`} aria-pressed={mode === m} onClick={() => changeMode(m)}>
            <Icon />
            <span>{t(key)}</span>
          </button>
        ))}
      </nav>

      <div className="topright">
        {mode === "code" && (
          <>
            {running ? (
              <button className="primary stop" onClick={stopProgram}>
                <IconStopFilled />
                {t("code.stop")}
              </button>
            ) : (
              <button className="primary" onClick={() => void startProgram()}>
                <IconPlayFilled />
                {t("code.start")}
              </button>
            )}
          </>
        )}
        <button className="round" aria-label={t("sensors.title")} title={t("sensors.title")} onClick={() => setSensorsOpen(true)}>
          <IconSensor />
          {sensorConnected && <span className="badge-dot" />}
        </button>
        {mode !== "code" && (
          <button className="round" aria-label={t("help")} title={t("help")} onClick={() => setHelpOpen(true)}>
            <IconHelp />
          </button>
        )}
        <button className="round" aria-label={t("menu.title")} title={t("menu.title")} onClick={() => setMenuOpen(true)}>
          <IconMenu />
        </button>
      </div>

      {mode === "draw" && (
        <>
          <ToolRail />
          <Palette />
        </>
      )}

      {mode === "effects" && (
        <>
          <ClipInspector onOpenTimeline={() => useTimelineUi.getState().setCollapsed(false)} />
          <TimelineDock />
        </>
      )}

      {mode === "code" && <CodeMode />}

      {sensorsOpen && <SensorPanel onClose={() => setSensorsOpen(false)} />}
      {menuOpen && <MenuDialog onClose={() => setMenuOpen(false)} />}
      {helpOpen && <HelpDialog onClose={() => setHelpOpen(false)} />}
      {shapeMenu && mode !== "code" && (
        <ShapeMenu
          strokeId={shapeMenu.id}
          x={shapeMenu.x}
          y={shapeMenu.y}
          onClose={() => setShapeMenu(null)}
          onEffect={
            mode === "draw"
              ? () => {
                  setShapeMenu(null);
                  setMode("effects");
                  useProject.getState().selectStroke(shapeMenu.id);
                }
              : undefined
          }
        />
      )}
    </div>
  );
}

