"use client";

import { useEffect, type ReactNode } from "react";
import { IconClose } from "./Icons";

export default function Dialog({
  title,
  onClose,
  children,
  wide,
  closeLabel,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  closeLabel: string;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  return (
    <div className="scrim" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`dialog${wide ? " wide" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="dialog-head">
          <h2>{title}</h2>
          <button className="round" aria-label={closeLabel} onClick={onClose}>
            <IconClose />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
