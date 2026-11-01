"use client";

import { useRef, useState } from "react";
import { useProject } from "@/lib/store";
import { useLang, useT, type Lang } from "@/lib/i18n";
import { openOutputWindow } from "@/lib/sync";
import { stopProgram } from "@/lib/runtime";
import type { Aspect, Project } from "@/lib/types";
import Dialog from "./Dialog";

export default function MenuDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const aspect = useProject((s) => s.project.aspect);
  const setAspect = useProject((s) => s.setAspect);
  const lang = useLang((s) => s.lang);
  const setLang = useLang((s) => s.setLang);
  const fileRef = useRef<HTMLInputElement>(null);
  const [confirmNew, setConfirmNew] = useState(false);

  const exportProject = () => {
    const p = useProject.getState().project;
    const blob = new Blob([JSON.stringify(p, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `lichtwerk-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  const importProject = async (file: File) => {
    try {
      const p = JSON.parse(await file.text()) as Project;
      if (p.version !== 1 || !Array.isArray(p.strokes) || !Array.isArray(p.groups)) throw new Error("invalid");
      stopProgram();
      useProject.getState().replaceProject(p);
      onClose();
    } catch {
      /* ignore invalid files */
    }
  };

  return (
    <Dialog title={t("menu.title")} onClose={onClose} closeLabel={t("menu.close")}>
      <div className="section">
        <button
          className="primary"
          style={{ alignSelf: "flex-start" }}
          onClick={() => {
            void openOutputWindow();
            onClose();
          }}
        >
          {t("menu.openOutput")}
        </button>
        <p className="muted">{t("menu.openOutputHint")}</p>
      </div>

      <div className="section">
        <p className="lbl">{t("menu.aspect")}</p>
        <div className="switch" role="radiogroup">
          {(["16:9", "16:10", "4:3"] as Aspect[]).map((a) => (
            <button key={a} role="radio" aria-checked={aspect === a} className={aspect === a ? "on" : ""} onClick={() => setAspect(a)}>
              {a}
            </button>
          ))}
        </div>
      </div>

      <div className="section">
        <p className="lbl">{t("menu.language")}</p>
        <div className="switch" role="radiogroup">
          {(
            [
              ["de", "Deutsch"],
              ["en", "English"],
            ] as [Lang, string][]
          ).map(([l, label]) => (
            <button key={l} role="radio" aria-checked={lang === l} className={lang === l ? "on" : ""} onClick={() => setLang(l)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="row">
        <button className="ghost" onClick={exportProject}>
          {t("menu.export")}
        </button>
        <button className="ghost" onClick={() => fileRef.current?.click()}>
          {t("menu.import")}
        </button>
        <button className="ghost danger" onClick={() => setConfirmNew(true)}>
          {t("menu.new")}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void importProject(f);
            e.target.value = "";
          }}
        />
      </div>
      {confirmNew && (
        <div className="section">
          <p className="muted">{t("menu.newConfirm")}</p>
          <div className="row">
            <button
              className="primary"
              onClick={() => {
                stopProgram();
                useProject.getState().newProject();
                onClose();
              }}
            >
              {t("menu.new")}
            </button>
            <button className="ghost" onClick={() => setConfirmNew(false)}>
              {t("rename.cancel")}
            </button>
          </div>
        </div>
      )}
    </Dialog>
  );
}

export function HelpDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  return (
    <Dialog title={t("help.title")} onClose={onClose} closeLabel={t("menu.close")}>
      <ol style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 10 }} className="muted">
        <li>{t("help.1")}</li>
        <li>{t("help.2")}</li>
        <li>{t("help.3")}</li>
        <li>{t("help.4")}</li>
        <li>{t("help.5")}</li>
      </ol>
    </Dialog>
  );
}
