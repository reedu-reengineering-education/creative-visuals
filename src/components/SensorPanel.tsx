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

/** One sensor as a small card: name, current value, the last values as a line. */
function SensorCard({ c }: { c: SensorChannel }) {
  const value = useSensors((s) => s.values[c.id]);
  const history = useSensors((s) => s.history[c.id]);
  // 0..1 probabilities need two decimals, big ranges none
  const span = c.max - c.min;
  const decimals = span > 50 ? 0 : span <= 1 ? 2 : 1;

  return (
    <div className="sensor">
      <span className="sensor-name">{channelLabel(c)}</span>
      <span className="sensor-value">
        {value === undefined ? "–" : value.toFixed(decimals)}
        {c.unit && <small>{c.unit}</small>}
      </span>
      <Sparkline values={history ?? []} />
    </div>
  );
}

export default function SensorPanel({ onClose }: { onClose: () => void }) {
  const t = useT();
  const status = useSensors((s) => s.status);
  const deviceName = useSensors((s) => s.deviceName);
  const error = useSensors((s) => s.error);
  // only what the senseBox actually sends
  const history = useSensors((s) => s.history);
  const sending = KNOWN_CHANNELS.filter((c) => history[c.id]?.length);
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
      {status === "connected" && <p className="muted">{sending.length ? t("sensors.hint") : t("sensors.waiting")}</p>}
      {sending.length > 0 && (
        <div className="sensor-list">
          {sending.map((c) => (
            <SensorCard key={c.id} c={c} />
          ))}
        </div>
      )}
    </Dialog>
  );
}
