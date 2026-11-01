"use client";

import { create } from "zustand";
import { Capacitor } from "@capacitor/core";
import { BleClient } from "@capacitor-community/bluetooth-le";
import { t, type TKey } from "./i18n";

/**
 * BLE profile – taken from senseBox:bike
 * (sensebox/senseBox-bike-Arduino + reedu-reengineering-education/sensebox-bike-flutter).
 * Every characteristic sends one or more float32 values (little endian) via notify.
 */
export const SENSEBOX_SERVICE_UUID = "cf06a218-f68e-e0be-ad04-8ebc1eb0bc84";
export const DEVICE_NAME_PREFIX = "senseBox";

export interface SensorChannel {
  id: string;
  nameKey?: TKey;
  label?: string;
  unit: string;
  /** Typical range. */
  min: number;
  max: number;
}

interface CharacteristicDef {
  /** null = not part of the senseBox:bike profile yet. */
  uuid: string | null;
  /** One channel per float32 value in the payload. */
  channels: SensorChannel[];
}

export const CHARACTERISTICS: CharacteristicDef[] = [
  {
    uuid: "2cdf2174-35be-fdc4-4ca2-6fd173f8b3a8",
    channels: [{ id: "temperature", nameKey: "sensor.temperature", unit: "°C", min: -10, max: 40 }],
  },
  {
    uuid: "772df7ec-8cdc-4ea9-86af-410abe0ba257",
    channels: [{ id: "humidity", nameKey: "sensor.humidity", unit: "%", min: 0, max: 100 }],
  },
  {
    uuid: "7e14e070-84ea-489f-b45a-e1317364b979",
    channels: [
      { id: "pm1", nameKey: "sensor.pm1", unit: "µg/m³", min: 0, max: 100 },
      { id: "pm2_5", nameKey: "sensor.pm2_5", unit: "µg/m³", min: 0, max: 100 },
      { id: "pm4", nameKey: "sensor.pm4", unit: "µg/m³", min: 0, max: 100 },
      { id: "pm10", nameKey: "sensor.pm10", unit: "µg/m³", min: 0, max: 100 },
    ],
  },
  {
    uuid: "b3491b60-c0f3-4306-a30d-49c91f37a62b",
    channels: [{ id: "distance", nameKey: "sensor.distance", unit: "cm", min: 0, max: 400 }],
  },
  {
    uuid: "b3491b60-c0f3-4306-a30d-49c91f37a62c",
    channels: [{ id: "distance_right", nameKey: "sensor.distance_right", unit: "cm", min: 0, max: 400 }],
  },
  {
    uuid: "b944af10-f495-4560-968f-2f0d18cab522",
    channels: [
      { id: "acc_x", nameKey: "sensor.acc_x", unit: "m/s²", min: -20, max: 20 },
      { id: "acc_y", nameKey: "sensor.acc_y", unit: "m/s²", min: -20, max: 20 },
      { id: "acc_z", nameKey: "sensor.acc_z", unit: "m/s²", min: -20, max: 20 },
    ],
  },
  {
    // TODO: the senseBox:bike profile has no loudness characteristic yet.
    // Add its UUID here once the firmware sends one.
    uuid: null,
    channels: [{ id: "noise", nameKey: "sensor.noise", unit: "dB", min: 30, max: 110 }],
  },
];

export const KNOWN_CHANNELS: SensorChannel[] = CHARACTERISTICS.flatMap((c) => c.channels);

export function channelLabel(c: SensorChannel): string {
  if (c.nameKey) return t(c.nameKey);
  return c.label ?? c.id;
}

const HISTORY = 60;

interface SensorState {
  values: Record<string, number>;
  history: Record<string, number[]>;
  discovered: SensorChannel[];
  status: "idle" | "connecting" | "connected" | "error";
  deviceName: string | null;
  error: string | null;
  setValue: (id: string, v: number) => void;
  addDiscovered: (c: SensorChannel) => void;
  setStatus: (s: SensorState["status"], extra?: { deviceName?: string | null; error?: string | null }) => void;
  /** Replace all values (used by the output window). */
  setAll: (values: Record<string, number>) => void;
}

export const useSensors = create<SensorState>((set, get) => ({
  values: {},
  history: {},
  discovered: [],
  status: "idle",
  deviceName: null,
  error: null,
  setValue: (id, v) => {
    const h = get().history[id] ?? [];
    set({
      values: { ...get().values, [id]: v },
      history: { ...get().history, [id]: [...h.slice(-(HISTORY - 1)), v] },
    });
  },
  addDiscovered: (c) => {
    if (get().discovered.some((d) => d.id === c.id)) return;
    set({ discovered: [...get().discovered, c] });
  },
  setStatus: (status, extra) =>
    set({
      status,
      deviceName: extra?.deviceName !== undefined ? extra.deviceName : get().deviceName,
      error: extra?.error !== undefined ? extra.error : null,
    }),
  setAll: (values) => set({ values }),
}));

export function allChannels(): SensorChannel[] {
  return [...KNOWN_CHANNELS, ...useSensors.getState().discovered];
}

/** Web Bluetooth in Chrome/Edge, CoreBluetooth in the iOS app (both through the same plugin). */
export function bluetoothSupported(): boolean {
  if (Capacitor.isNativePlatform()) return true;
  return typeof navigator !== "undefined" && "bluetooth" in navigator;
}

let deviceId: string | null = null;

function parseFloats(view: DataView): number[] {
  const out: number[] = [];
  for (let i = 0; i + 4 <= view.byteLength; i += 4) out.push(view.getFloat32(i, true));
  return out;
}

function onValues(uuid: string, def: CharacteristicDef | undefined, view: DataView) {
  const values = parseFloats(view);
  values.forEach((v, i) => {
    if (!Number.isFinite(v)) return;
    let channelId: string;
    if (def && def.channels[i]) {
      channelId = def.channels[i].id;
    } else {
      // unknown characteristic: still show it, kids can find out what it is
      const short = uuid.slice(0, 4).toUpperCase();
      channelId = `ble_${uuid.slice(0, 8)}_${i}`;
      useSensors.getState().addDiscovered({
        id: channelId,
        label: t("sensor.unknown", { id: values.length > 1 ? `${short}.${i + 1}` : short }),
        unit: "",
        min: 0,
        max: 100,
      });
    }
    useSensors.getState().setValue(channelId, v);
  });
}

/** The user closed the chooser: Chrome throws NotFoundError, the iOS plugin "requestDevice cancelled." */
function isCancel(e: unknown): boolean {
  if (e instanceof DOMException && e.name === "NotFoundError") return true;
  return e instanceof Error && /cancel/i.test(e.message);
}

export async function connectSenseBox(): Promise<void> {
  const store = useSensors.getState();
  if (!bluetoothSupported()) throw new Error("Bluetooth not supported");
  store.setStatus("connecting");
  try {
    await BleClient.initialize();
    const device = await BleClient.requestDevice({
      namePrefix: DEVICE_NAME_PREFIX,
      optionalServices: [SENSEBOX_SERVICE_UUID],
    });
    deviceId = device.deviceId;
    await BleClient.connect(device.deviceId, () => {
      deviceId = null;
      useSensors.getState().setStatus("idle", { deviceName: null });
    });
    const services = await BleClient.getServices(device.deviceId);
    const service = services.find((s) => s.uuid.toLowerCase() === SENSEBOX_SERVICE_UUID);
    if (!service) throw new Error("senseBox service not found");

    for (const ch of service.characteristics) {
      if (!ch.properties.notify) continue;
      const uuid = ch.uuid.toLowerCase();
      const def = CHARACTERISTICS.find((c) => c.uuid === uuid);
      await BleClient.startNotifications(device.deviceId, SENSEBOX_SERVICE_UUID, ch.uuid, (view) =>
        onValues(uuid, def, view),
      );
    }
    useSensors.getState().setStatus("connected", { deviceName: device.name ?? "senseBox" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (deviceId) void BleClient.disconnect(deviceId).catch(() => {});
    deviceId = null;
    // user closed the chooser -> just go back to idle
    if (isCancel(e)) {
      useSensors.getState().setStatus("idle");
      return;
    }
    useSensors.getState().setStatus("error", { error: msg });
    throw e;
  }
}

export function disconnectSenseBox() {
  if (deviceId) void BleClient.disconnect(deviceId).catch(() => {});
  deviceId = null;
  useSensors.getState().setStatus("idle", { deviceName: null });
}
