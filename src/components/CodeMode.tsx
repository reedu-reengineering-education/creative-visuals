"use client";

import { useEffect, useRef, useState } from "react";
import * as Blockly from "blockly/core";
import * as De from "blockly/msg/de";
import * as En from "blockly/msg/en";
import { useProject } from "@/lib/store";
import { useLang, useT } from "@/lib/i18n";
import { useRuntime } from "@/lib/runtime";
import { programToCode, type Script } from "@/lib/program";
import { allChannels, channelLabel } from "@/lib/sensors";
import { renderStage } from "@/lib/render";
import { aspectRatio } from "@/lib/store";
import { lichtwerkTheme, registerBlocks, registerRenderer, toolbox } from "./blocks/defs";
import { emptyProgram } from "@/lib/timeline";
import { workspaceToScripts } from "./blocks/compile";
import Dialog from "./Dialog";

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

    const program = useProject.getState().project.program ?? emptyProgram();
    try {
      Blockly.serialization.workspaces.load(program as object, ws);
    } catch (e) {
      console.warn("[lichtwerk] could not load program", e);
    }
    setScripts(workspaceToScripts(ws));
    if (!useProject.getState().project.program) {
      useProject.getState().setProgram(Blockly.serialization.workspaces.save(ws));
    }

    /**
     * Kid-friendly hint: a "Falls" directly under "Wenn Start" is only checked once.
     * Show a warning on it until it sits inside a "Wiederhole" block.
     */
    const updateHints = () => {
      for (const b of ws.getAllBlocks(false)) {
        if (b.type !== "lw_if" && b.type !== "lw_if_else") continue;
        let looped = false;
        let p = b.getSurroundParent();
        while (p) {
          if (p.type === "lw_forever" || p.type === "lw_repeat") looped = true;
          p = p.getSurroundParent();
        }
        const root = b.getRootBlock();
        const once = !looped && (root.type === "lw_on_start" || root.type === "lw_on_key" || root.type === "lw_on_tap");
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
        setScripts(workspaceToScripts(ws));
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

  const code = programToCode(scripts, {
    group: (id) => groups.find((g) => g.id === id)?.name ?? "?",
    sensor: (id) => {
      const c = allChannels().find((x) => x.id === id);
      return c ? channelLabel(c) : id;
    },
  });

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
