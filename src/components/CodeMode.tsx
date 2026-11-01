"use client";

import { useEffect, useRef, useState } from "react";
import * as Blockly from "blockly/core";
import * as De from "blockly/msg/de";
import * as En from "blockly/msg/en";
import { useProject } from "@/lib/store";
import { useLang, useT } from "@/lib/i18n";
import { formatValue, useRuntime } from "@/lib/runtime";
import { programToCode, type Script } from "@/lib/program";
import { allChannels, channelLabel } from "@/lib/sensors";
import { renderStage } from "@/lib/render";
import { aspectRatio } from "@/lib/store";
import {
  NEW_VARIABLE_BUTTON,
  VARIABLES_CATEGORY,
  lichtwerkTheme,
  registerBlocks,
  registerRenderer,
  toolbox,
  variablesFlyout,
} from "./blocks/defs";
import { emptyProgram, isTimelineHat } from "@/lib/timeline";
import { compileProgramJson, variablesOf } from "@/lib/blockJson";
import Dialog from "./Dialog";
import ButtonPad from "./ButtonPad";

const compile = (ws: Blockly.Workspace) => compileProgramJson(Blockly.serialization.workspaces.save(ws), isTimelineHat);

/** Blocks that only check their condition once when they're not inside a loop. */
const IF_TYPES = new Set(["lw_if_then", "lw_if_then_else"]);
const LOOP_TYPES = new Set(["lw_forever", "lw_repeat", "lw_repeat_until"]);
const ONCE_ROOTS = new Set(["lw_on_start", "lw_on_key", "lw_on_button", "lw_when", "lw_while"]);

/** The Blockly editor. Saves the workspace into the project and restarts a running program on changes. */
export default function CodeMode({ showCode, onCloseCode }: { showCode: boolean; onCloseCode: () => void }) {
  const t = useT();
  const lang = useLang((s) => s.lang);
  const hostRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<Blockly.WorkspaceSvg | null>(null);
  const [scripts, setScripts] = useState<Script[]>([]);

  useEffect(() => {
    registerBlocks();
    registerRenderer();
    Blockly.setLocale((lang === "de" ? De : En) as unknown as { [key: string]: string });
    const host = hostRef.current!;
    const ws = Blockly.inject(host, {
      toolbox: toolbox(),
      theme: lichtwerkTheme(),
      renderer: "lichtwerk",
      trashcan: false,
      sounds: false,
      move: { scrollbars: true, drag: true, wheel: true },
      zoom: { controls: false, wheel: true, startScale: 1, maxScale: 2, minScale: 0.4, scaleSpeed: 1.15, pinch: true },
      grid: { spacing: 28, length: 2, colour: "#24272D", snap: false },
    });
    host.classList.add("lichtwerk-blockly");
    wsRef.current = ws;
    ws.registerToolboxCategoryCallback(VARIABLES_CATEGORY, variablesFlyout);
    ws.registerButtonCallback(NEW_VARIABLE_BUTTON, (b) => Blockly.Variables.createVariableButtonHandler(b.getTargetWorkspace()));

    const program = useProject.getState().project.program ?? emptyProgram();
    try {
      Blockly.serialization.workspaces.load(program as object, ws);
    } catch (e) {
      console.warn("[lichtwerk] could not load program", e);
    }
    setScripts(compile(ws));
    if (!useProject.getState().project.program) {
      useProject.getState().setProgram(Blockly.serialization.workspaces.save(ws));
    }

    /**
     * Kid-friendly hint: a "Falls" directly under "Wenn Start" is only checked once.
     * Show a warning on it until it sits inside a "Wiederhole" block.
     */
    const updateHints = () => {
      for (const b of ws.getAllBlocks(false)) {
        if (!IF_TYPES.has(b.type)) continue;
        let looped = false;
        let p = b.getSurroundParent();
        while (p) {
          if (LOOP_TYPES.has(p.type)) looped = true;
          p = p.getSurroundParent();
        }
        const once = !looped && ONCE_ROOTS.has(b.getRootBlock().type);
        b.setWarningText(once ? t("hint.ifOnce") : null);
      }
    };
    updateHints();

    let timer: ReturnType<typeof setTimeout> | null = null;
    const onChange = (e: Blockly.Events.Abstract) => {
      if (e.isUiEvent) return;
      updateHints();
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        useProject.getState().setProgram(Blockly.serialization.workspaces.save(ws));
        setScripts(compile(ws));
      }, 400);
    };
    ws.addChangeListener(onChange);

    const ro = new ResizeObserver(() => Blockly.svgResize(ws));
    ro.observe(host);

    return () => {
      if (timer) clearTimeout(timer);
      ro.disconnect();
      ws.dispose();
      wsRef.current = null;
    };
  }, [lang]);

  const running = useRuntime((s) => s.running);
  const groups = useProject((s) => s.project.groups);
  const program = useProject((s) => s.project.program);
  const variables = variablesOf(program);

  const code = programToCode(
    scripts,
    {
      group: (id) => groups.find((g) => g.id === id)?.name ?? "?",
      sensor: (id) => {
        const c = allChannels().find((x) => x.id === id);
        return c ? channelLabel(c) : id;
      },
      variable: (id) => variables.find((v) => v.id === id)?.name ?? "?",
    },
    variables.map((v) => v.id),
  );

  return (
    <>
      <div className="code-area">
        <div className="blockly-host" ref={hostRef} />
      </div>

      <section className="preview bar" aria-label={t("code.preview")}>
        <div className="preview-head">
          <p className="lbl">{t("code.preview")}</p>
          <p className="running" style={{ margin: 0 }}>
            <span className={`dot${running ? " on" : ""}`} />
            {running ? t("code.running") : t("code.stopped")}
          </p>
        </div>
        <PreviewCanvas />
        <ButtonPad scripts={scripts} />
        <VariableMonitor variables={variables} />
      </section>

      {showCode && (
        <Dialog title={t("code.showCode")} onClose={onCloseCode} wide closeLabel={t("menu.close")}>
          <p className="muted">{t("code.generated")}</p>
          <pre className="code-view">{code || "// …"}</pre>
        </Dialog>
      )}
    </>
  );
}

function PreviewCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let raf = 0;
    const frame = () => {
      raf = requestAnimationFrame(frame);
      const c = ref.current;
      if (!c) return;
      const project = useProject.getState().project;
      const w = 272;
      const h = Math.round(w / aspectRatio(project.aspect));
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (c.width !== w * dpr || c.height !== h * dpr) {
        c.width = w * dpr;
        c.height = h * dpr;
        c.style.height = `${h}px`;
      }
      const ctx = c.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const rt = useRuntime.getState();
      renderStage(ctx, {
        project,
        overrides: rt.overrides,
        running: rt.running,
        view: "light",
        width: w,
        height: h,
        now: Date.now(),
        badges: false,
      });
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);
  return <canvas ref={ref} width={272} height={153} />;
}

/** Current values of the variables while the program runs – helps to find mistakes. */
function VariableMonitor({ variables }: { variables: { id: string; name: string }[] }) {
  const t = useT();
  const values = useRuntime((s) => s.vars);
  const running = useRuntime((s) => s.running);
  if (!variables.length) return null;
  return (
    <div className="var-monitor" aria-label={t("vars.title")}>
      {variables.map((v) => (
        <span key={v.id} className="var-chip">
          {v.name}
          <b>{running ? formatValue(values[v.id] ?? 0) : "–"}</b>
        </span>
      ))}
    </div>
  );
}
