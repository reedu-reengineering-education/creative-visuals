"use client";

import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";

/**
 * iOS app only: a projector connected by cable or AirPlay gets its own scene that shows /output
 * (ios/App/App/ExternalDisplay.swift). With Stage Manager (extended display) `openWindow` opens /output
 * as a second window instead. Messages between editor and outputs go through native code.
 */
interface ExternalDisplayPlugin {
  send(options: { json: string }): Promise<void>;
  isConnected(): Promise<{ connected: boolean }>;
  openWindow(): Promise<void>;
  addListener(event: "message", cb: (e: { json: string }) => void): Promise<PluginListenerHandle>;
  addListener(event: "display", cb: (e: { connected: boolean }) => void): Promise<PluginListenerHandle>;
}

export const ExternalDisplay = registerPlugin<ExternalDisplayPlugin>("ExternalDisplay");

/** The editor runs inside the iOS app (the output window is replaced by the external display). */
export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}

/** This page is the output on an external display of the iOS app (a plain web view, no Capacitor bridge). */
export function isNativeOutput(): boolean {
  return typeof window !== "undefined" && (window as { __lichtwerkOutput?: boolean }).__lichtwerkOutput === true;
}
