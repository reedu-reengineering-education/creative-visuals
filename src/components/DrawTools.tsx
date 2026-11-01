"use client";

import { useRef, useState } from "react";
import { useProject } from "@/lib/store";
import { useT } from "@/lib/i18n";
import Dialog from "./Dialog";
import { IconEraser, IconPen, IconPlus, IconTrash, IconUndo } from "./Icons";

export function ToolRail() {
  const t = useT();
  const tool = useProject((s) => s.tool);
  const setTool = useProject((s) => s.setTool);
  const undo = useProject((s) => s.undo);
  const canUndo = useProject((s) => s.history.length > 0);
  const hasStrokes = useProject((s) => s.project.strokes.length > 0);
  const clear = useProject((s) => s.clearStrokes);
  const [confirm, setConfirm] = useState(false);

  return (
    <>
      <div className="toolrail bar" role="toolbar" aria-orientation="vertical">
        <button className={`tool${tool === "pen" ? " on" : ""}`} aria-pressed={tool === "pen"} onClick={() => setTool("pen")}>
          <IconPen />
          {t("tool.pen")}
        </button>
        <button
          className={`tool${tool === "eraser" ? " on" : ""}`}
          aria-pressed={tool === "eraser"}
          onClick={() => setTool("eraser")}
        >
          <IconEraser />
          {t("tool.eraser")}
        </button>
        <div className="divider" />
        <button className="tool" onClick={undo} disabled={!canUndo}>
          <IconUndo />
          {t("tool.undo")}
        </button>
        <button className="tool" onClick={() => setConfirm(true)} disabled={!hasStrokes}>
          <IconTrash />
          {t("tool.clear")}
        </button>
      </div>
      {confirm && (
        <Dialog title={t("tool.clear.confirm")} onClose={() => setConfirm(false)} closeLabel={t("rename.cancel")}>
          <div className="row">
            <button
              className="primary"
              onClick={() => {
                clear();
                setConfirm(false);
              }}
            >
              {t("tool.clear.yes")}
            </button>
            <button className="ghost" onClick={() => setConfirm(false)}>
              {t("rename.cancel")}
            </button>
          </div>
        </Dialog>
      )}
    </>
  );
}

export function Palette() {
  const t = useT();
  const groups = useProject((s) => s.project.groups);
  const active = useProject((s) => s.activeGroupId);
  const tool = useProject((s) => s.tool);
  const setActive = useProject((s) => s.setActiveGroup);
  const addGroup = useProject((s) => s.addGroup);
  const [renaming, setRenaming] = useState<string | null>(null);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressed = useRef(false);

  const startPress = (id: string) => {
    longPressed.current = false;
    pressTimer.current = setTimeout(() => {
      longPressed.current = true;
      setRenaming(id);
    }, 550);
  };
  const endPress = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressTimer.current = null;
  };

  return (
    <>
      <p className="palette-hint">{t("draw.groupHint")}</p>
      <div className="palette bar" role="radiogroup" aria-label={t("palette.label")}>
        {groups.map((g) => {
          const on = g.id === active && tool === "pen";
          return (
            <button
              key={g.id}
              className={`pen${on ? " on" : ""}`}
              role="radio"
              aria-checked={on}
              onPointerDown={() => startPress(g.id)}
              onPointerUp={endPress}
              onPointerLeave={endPress}
              onPointerCancel={endPress}
              onClick={() => {
                if (!longPressed.current) setActive(g.id);
              }}
              onDoubleClick={() => setRenaming(g.id)}
              onContextMenu={(e) => {
                e.preventDefault();
                setRenaming(g.id);
              }}
            >
              <span className="swatch" style={{ background: g.color }} />
              <span className="name">{g.name}</span>
            </button>
          );
        })}
        <button className="pen" onClick={addGroup} aria-label={t("palette.new")}>
          <span className="swatch add">
            <IconPlus />
          </span>
          <span className="name">{t("palette.new")}</span>
        </button>
      </div>
      {renaming && <RenameDialog groupId={renaming} onClose={() => setRenaming(null)} />}
    </>
  );
}

function RenameDialog({ groupId, onClose }: { groupId: string; onClose: () => void }) {
  const t = useT();
  const group = useProject((s) => s.project.groups.find((g) => g.id === groupId));
  const used = useProject((s) => s.project.strokes.some((x) => x.groupId === groupId));
  const canDelete = useProject((s) => s.project.groups.length > 1) && !used;
  const rename = useProject((s) => s.renameGroup);
  const del = useProject((s) => s.deleteGroup);
  const [name, setName] = useState(group?.name ?? "");
  if (!group) return null;

  const save = () => {
    rename(groupId, name);
    onClose();
  };

  return (
    <Dialog title={t("rename.title")} onClose={onClose} closeLabel={t("rename.cancel")}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span className="gd" style={{ background: group.color, width: 28, height: 28 }} />
        <input
          className="text-input"
          value={name}
          autoFocus
          maxLength={24}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && save()}
          aria-label={t("rename.title")}
        />
      </div>
      <div className="row">
        <button className="primary" onClick={save}>
          {t("rename.save")}
        </button>
        <button
          className="ghost danger"
          disabled={!canDelete}
          style={{ opacity: canDelete ? 1 : 0.4 }}
          onClick={() => {
            del(groupId);
            onClose();
          }}
        >
          {t("rename.delete")}
        </button>
      </div>
      {!canDelete && <p className="muted">{t("rename.deleteHint")}</p>}
    </Dialog>
  );
}
