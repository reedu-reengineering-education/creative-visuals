"use client";

import type { Project, RuntimeOverride } from "./types";
import { ExternalDisplay, isNativeApp, isNativeOutput } from "./externalDisplay";

/**
 * Editor <-> output window sync on the same device: BroadcastChannel in the browser,
 * native code in the iOS app (editor on the iPad, output on an external display).
 * The editor owns the project, the program and the sensors; the output only renders.
 */
export type SyncMessage =
  | { type: "hello" }
  | { type: "ping" }
  | { type: "pong" }
  | { type: "project"; project: Project }
  | { type: "runtime"; running: boolean; overrides: Record<string, RuntimeOverride> }
  | { type: "sensors"; values: Record<string, number> }
  | { type: "key"; key: string };

export const CHANNEL_NAME = "lichtwerk";

interface Channel {
  post: (m: SyncMessage) => void;
  close: () => void;
}

export function openChannel(onMessage: (m: SyncMessage) => void): Channel {
  if (isNativeOutput()) return openNativeOutputChannel(onMessage);
  if (isNativeApp()) return openNativeEditorChannel(onMessage);
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

/** iOS editor: messages go through the ExternalDisplay plugin, only while a display is connected. */
function openNativeEditorChannel(onMessage: (m: SyncMessage) => void): Channel {
  let connected = false;
  void ExternalDisplay.isConnected().then((r) => (connected = r.connected), () => {});
  const handles = [
    ExternalDisplay.addListener("display", (e) => (connected = e.connected)),
    ExternalDisplay.addListener("message", (e) => {
      connected = true;
      onMessage(JSON.parse(e.json) as SyncMessage);
    }),
  ];
  return {
    post: (m) => {
      if (connected) void ExternalDisplay.send({ json: JSON.stringify(m) }).catch(() => {});
    },
    close: () => handles.forEach((h) => void h.then((x) => x.remove())),
  };
}

/** iOS output on the external display: the native side calls __lichtwerkReceive, we answer via a message handler. */
function openNativeOutputChannel(onMessage: (m: SyncMessage) => void): Channel {
  const w = window as unknown as {
    __lichtwerkReceive?: (m: SyncMessage) => void;
    webkit?: { messageHandlers?: { lichtwerk?: { postMessage: (json: string) => void } } };
  };
  const receive = (m: SyncMessage) => onMessage(m);
  w.__lichtwerkReceive = receive;
  return {
    post: (m) => w.webkit?.messageHandlers?.lichtwerk?.postMessage(JSON.stringify(m)),
    close: () => {
      if (w.__lichtwerkReceive === receive) delete w.__lichtwerkReceive;
    },
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
