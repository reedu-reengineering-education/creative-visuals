"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { layerOrder, strokeIndex, useProject, type LayerMove } from "@/lib/store";
import { useT } from "@/lib/i18n";
import { IconSparkle, IconTrash } from "./Icons";

const LAYER_ICONS: Record<LayerMove, string> = {
  front: "M12 4v12M7 9l5-5 5 5M5 20h14",
  forward: "M12 6v12M7 11l5-5 5 5",
  backward: "M12 6v12M7 13l5 5 5-5",
  back: "M12 8v12M7 15l5 5 5-5M5 4h14",
};

function LayerIcon({ move }: { move: LayerMove }) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={LAYER_ICONS[move]} />
    </svg>
  );
}

export function LayerButtons({ strokeId }: { strokeId: string }) {
  const t = useT();
  const moveLayer = useProject((s) => s.moveLayer);
  const order = useProject((s) => layerOrder(s.project.strokes).map((x) => x.id).join());
  const ids = order.split(",");
  const pos = ids.indexOf(strokeId);
  const top = pos === ids.length - 1;
  const bottom = pos === 0;
  const items: { move: LayerMove; key: "layer.front" | "layer.forward" | "layer.backward" | "layer.back"; disabled: boolean }[] = [
    { move: "front", key: "layer.front", disabled: top },
    { move: "forward", key: "layer.forward", disabled: top },
    { move: "backward", key: "layer.backward", disabled: bottom },
    { move: "back", key: "layer.back", disabled: bottom },
  ];
  return (
    <div className="section">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <p className="lbl">{t("layer.title")}</p>
        <span className="muted" style={{ fontSize: 12 }}>
          {t("layer.position", { n: pos + 1, total: ids.length })}
        </span>
      </div>
      <div className="grid2">
        {items.map((it) => (
          <button key={it.move} className="chip" disabled={it.disabled} style={{ opacity: it.disabled ? 0.4 : 1 }} onClick={() => moveLayer(strokeId, it.move)}>
            <LayerIcon move={it.move} />
            {t(it.key)}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Popover that opens on long press / right click on a shape. */
export default function ShapeMenu({
  strokeId,
  x,
  y,
  onClose,
  onEffect,
}: {
  strokeId: string;
  x: number;
  y: number;
  onClose: () => void;
  onEffect?: () => void;
}) {
  const t = useT();
  const project = useProject((s) => s.project);
  const remove = useProject((s) => s.removeStroke);
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const pad = 16;
    let left = x + 12;
    let top = y - h / 2;
    if (left + w > window.innerWidth - pad) left = x - w - 12;
    left = Math.max(pad, Math.min(left, window.innerWidth - w - pad));
    top = Math.max(pad, Math.min(top, window.innerHeight - h - pad));
    setPos({ left, top });
  }, [x, y]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const stroke = project.strokes.find((s) => s.id === strokeId);
  if (!stroke) return null;
  const group = project.groups.find((g) => g.id === stroke.groupId);
  const { index, count } = strokeIndex(project, stroke);

  return (
    <div className="scrim clear" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} className="popover" role="dialog" aria-label={t("shape.menu")} style={{ left: pos.left, top: pos.top }}>
        <h2>
          <span className="gd" style={{ background: group?.color }} />
          {group?.name}
          {count > 1 ? ` · ${t("effects.nr", { nr: index + 1 })}` : ""}
        </h2>
        <LayerButtons strokeId={strokeId} />
        <div className="row">
          {onEffect && (
            <button className="chip" style={{ flex: 1 }} onClick={onEffect}>
              <IconSparkle />
              {t("shape.effect")}
            </button>
          )}
          <button
            className="chip danger"
            style={{ flex: onEffect ? "none" : 1 }}
            onClick={() => {
              remove(strokeId);
              onClose();
            }}
          >
            <IconTrash />
            {t("shape.delete")}
          </button>
        </div>
      </div>
    </div>
  );
}
