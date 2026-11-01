"use client";

import type { Project, RuntimeOverride } from "./types";

/**
 * Editor <-> output window sync on the same device (BroadcastChannel).
 * The editor owns the project, the program and the sensors; the output only renders.
 */
export type SyncMessage =
  | { type: "hello" }
  | { type: "ping" }
  | { type: "pong" }
  | { type: "project"; project: Project }
  | { type: "runtime"; running: boolean; overrides: Record<string, RuntimeOverride> }
  | { type: "sensors"; values: Record<string, number> }
  | { type: "key"; key: string }
  | { type: "tap" };

export const CHANNEL_NAME = "lichtwerk";

export function openChannel(onMessage: (m: SyncMessage) => void): { post: (m: SyncMessage) => void; close: () => void } {
  if (typeof BroadcastChannel === "undefined") {
    return { post: () => {}, close: () => {} };
  }
  const ch = new BroadcastChannel(CHANNEL_NAME);
  ch.onmessage = (e: MessageEvent<SyncMessage>) => onMessage(e.data);
  return {
    post: (m) => {
      try {
        ch.postMessage(m);
      } catch {
        /* ignore */
      }
    },
    close: () => ch.close(),
  };
}

/** Open the output window – on a second screen if the browser lets us. */
export async function openOutputWindow() {
  let features = "popup,width=1280,height=720";
  try {
    const w = window as unknown as {
      getScreenDetails?: () => Promise<{
        screens: { left: number; top: number; width: number; height: number; isPrimary: boolean }[];
        currentScreen: { left: number; top: number };
      }>;
    };
    if (w.getScreenDetails) {
      const details = await w.getScreenDetails();
      const other = details.screens.find(
        (s) => s.left !== details.currentScreen.left || s.top !== details.currentScreen.top,
      );
      if (other) {
        features = `popup,left=${other.left},top=${other.top},width=${other.width},height=${other.height}`;
      }
    }
  } catch {
    /* permission denied or not supported – just open a normal window */
  }
  window.open("/output", "lichtwerk-output", features);
}
