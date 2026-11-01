"use client";

import { useState } from "react";
import { useT } from "@/lib/i18n";
import {
  KNOWN_CHANNELS,
  bluetoothSupported,
  channelLabel,
  connectSenseBox,
  disconnectSenseBox,
  useSensors,
  type SensorChannel,
} from "@/lib/sensors";
import Dialog from "./Dialog";

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return <svg width="100%" height="28" aria-hidden="true" />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values
    .map((v, i) => `${((i / (values.length - 1)) * 100).toFixed(1)},${(26 - ((v - min) / span) * 24).toFixed(1)}`)
    .join(" ");
  return (
    <svg viewBox="0 0 100 28" preserveAspectRatio="none" width="100%" height="28" aria-hidden="true">
      <polyline points={pts} fill="none" stroke="#6EE7C8" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function SensorRow({ c, simulate }: { c: SensorChannel; simulate: boolean }) {
  const t = useT();
  const value = useSensors((s) => s.values[c.id]);
  const history = useSensors((s) => s.history[c.id]);
  const step = c.max - c.min > 50 ? 1 : 0.1;

  return (
    <div className="sensor">
      <div className="sensor-top">
        <span className="sensor-name">{channelLabel(c)}</span>
        <span className="sensor-value">
          {value === undefined ? t("sensors.noValue") : value.toFixed(step < 1 ? 1 : 0)}
          <small>{c.unit}</small>
        </span>
      </div>
      <Sparkline values={history ?? []} />
      {simulate && (
        <input
          type="range"
          className="sensor-slider"
          min={c.min}
          max={c.max}
          step={step}
          value={value ?? (c.min + c.max) / 2}
          aria-label={channelLabel(c)}
          onChange={(e) => useSensors.getState().setValue(c.id, Number(e.target.value))}
        />
      )}
    </div>
  );
}

export default function SensorPanel({ onClose }: { onClose: () => void }) {
  const t = useT();
  const status = useSensors((s) => s.status);
  const deviceName = useSensors((s) => s.deviceName);
  const error = useSensors((s) => s.error);
  const discovered = useSensors((s) => s.discovered);
  const [busy, setBusy] = useState(false);
  const supported = bluetoothSupported();

  return (
    <Dialog title={t("sensors.title")} onClose={onClose} wide closeLabel={t("menu.close")}>
      {supported ? (
        <div className="row" style={{ alignItems: "center" }}>
          {status === "connected" ? (
            <>
              <p className="muted" style={{ flex: 1 }}>
                {t("sensors.connected", { name: deviceName ?? "senseBox" })}
              </p>
              <button className="ghost" onClick={disconnectSenseBox}>
                {t("sensors.disconnect")}
              </button>
            </>
          ) : (
            <>
              <p className="muted" style={{ flex: 1 }}>
                {t("sensors.notConnected")}
              </p>
              <button
                className="primary"
                disabled={busy || status === "connecting"}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await connectSenseBox();
                  } catch {
                    /* shown via store */
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {t("sensors.connect")}
              </button>
            </>
          )}
        </div>
      ) : (
        <p className="muted">{t("sensors.unsupported")}</p>
      )}
      {error && <p className="muted danger">{t("sensors.error", { msg: error })}</p>}
      {status === "connected" && <p className="muted">{t("sensors.hint")}</p>}
      {status !== "connected" && <p className="muted">{t("sensors.simulate")}</p>}
      <div className="sensor-list">
        {[...KNOWN_CHANNELS, ...discovered].map((c) => (
          <SensorRow key={c.id} c={c} simulate={status !== "connected"} />
        ))}
      </div>
    </Dialog>
  );
}
