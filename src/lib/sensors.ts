"use client";

import { create } from "zustand";
import { Capacitor } from "@capacitor/core";
import { BleClient } from "@capacitor-community/bluetooth-le";
import { t, type TKey } from "./i18n";

/**
 * BLE profile – exactly the characteristics of senseBox:bike
 * (github.com/sensebox/senseBox-bike-Arduino, all firmware variants).
 * Every characteristic sends one or more float32 values (little endian) via notify.
 * Characteristics that aren't listed here are ignored.
 */
export const SENSEBOX_SERVICE_UUID = "cf06a218-f68e-e0be-ad04-8ebc1eb0bc84";
/** the battery level sits in the standard battery service (0x180F / 0x2A19) */
const BATTERY_SERVICE_UUID = "0000180f-0000-1000-8000-00805f9b34fb";
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
  uuid: string;
  /** default: the senseBox service */
  service?: string;
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
    uuid: "8edf8ebb-1246-4329-928d-ee0c91db2389",
    channels: [
      { id: "gps_lat", nameKey: "sensor.gps_lat", unit: "°", min: -90, max: 90 },
      { id: "gps_lng", nameKey: "sensor.gps_lng", unit: "°", min: -180, max: 180 },
      { id: "speed", nameKey: "sensor.speed", unit: "km/h", min: 0, max: 40 },
    ],
  },
  {
    // probabilities from the overtaking model (car, bike); -1 while there is no prediction
    uuid: "fc01c688-2c44-4965-ae18-373af9fed18d",
    channels: [
      { id: "overtaking", nameKey: "sensor.overtaking", unit: "", min: 0, max: 1 },
      { id: "overtaking_bike", nameKey: "sensor.overtaking_bike", unit: "", min: 0, max: 1 },
    ],
  },
  {
    // probabilities from the surface model
    uuid: "b944af10-f495-4560-968f-2f0d18cab521",
    channels: [
      { id: "surface_asphalt", nameKey: "sensor.surface_asphalt", unit: "", min: 0, max: 1 },
      { id: "surface_compact", nameKey: "sensor.surface_compact", unit: "", min: 0, max: 1 },
      { id: "surface_paving", nameKey: "sensor.surface_paving", unit: "", min: 0, max: 1 },
      { id: "surface_sett", nameKey: "sensor.surface_sett", unit: "", min: 0, max: 1 },
      { id: "standing", nameKey: "sensor.standing", unit: "", min: 0, max: 1 },
    ],
  },
  {
    uuid: "b944af10-f495-4560-968f-2f0d18cab523",
    channels: [{ id: "anomaly", nameKey: "sensor.anomaly", unit: "", min: 0, max: 5 }],
  },
  {
    uuid: "00002a19-0000-1000-8000-00805f9b34fb",
    service: BATTERY_SERVICE_UUID,
    channels: [{ id: "battery", nameKey: "sensor.battery", unit: "%", min: 0, max: 100 }],
  },
];

export const KNOWN_CHANNELS: SensorChannel[] = CHARACTERISTICS.flatMap((c) => c.channels);

export function channelLabel(c: SensorChannel): string {
  return c.nameKey ? t(c.nameKey) : (c.label ?? c.id);
}

const HISTORY = 60;

interface SensorState {
  values: Record<string, number>;
  history: Record<string, number[]>;
  status: "idle" | "connecting" | "connected" | "error";
  deviceName: string | null;
  error: string | null;
  setValue: (id: string, v: number) => void;
  setStatus: (s: SensorState["status"], extra?: { deviceName?: string | null; error?: string | null }) => void;
  /** Replace all values (used by the output window). */
  setAll: (values: Record<string, number>) => void;
}

export const useSensors = create<SensorState>((set, get) => ({
  values: {},
  history: {},
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
  setStatus: (status, extra) =>
    set({
      status,
      deviceName: extra?.deviceName !== undefined ? extra.deviceName : get().deviceName,
      error: extra?.error !== undefined ? extra.error : null,
    }),
  setAll: (values) => set({ values }),
}));

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

function onValues(def: CharacteristicDef, view: DataView) {
  parseFloats(view).forEach((v, i) => {
    const channel = def.channels[i];
    if (channel && Number.isFinite(v)) useSensors.getState().setValue(channel.id, v);
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
      optionalServices: [SENSEBOX_SERVICE_UUID, BATTERY_SERVICE_UUID],
    });
    deviceId = device.deviceId;
    await BleClient.connect(device.deviceId, () => {
      deviceId = null;
      useSensors.getState().setStatus("idle", { deviceName: null });
    });
    const services = await BleClient.getServices(device.deviceId);
    if (!services.some((s) => s.uuid.toLowerCase() === SENSEBOX_SERVICE_UUID)) throw new Error("senseBox service not found");

    // only the senseBox:bike characteristics; anything else the box sends is ignored
    for (const service of services) {
      const serviceUuid = service.uuid.toLowerCase();
      for (const ch of service.characteristics) {
        if (!ch.properties.notify) continue;
        const uuid = ch.uuid.toLowerCase();
        const def = CHARACTERISTICS.find((c) => c.uuid === uuid && (c.service ?? SENSEBOX_SERVICE_UUID) === serviceUuid);
        if (!def) continue;
        await BleClient.startNotifications(device.deviceId, service.uuid, ch.uuid, (view) => onValues(def, view));
      }
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
