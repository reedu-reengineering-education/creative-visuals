import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "de.reedu.lichtwerk",
  appName: "Lichtwerk",
  webDir: "out",
  backgroundColor: "#000000",
  ios: {
    contentInset: "never",
  },
  plugins: {
    BluetoothLe: {
      displayStrings: {
        scanning: "Suche senseBox …",
        cancel: "Abbrechen",
        availableDevices: "Gefundene Geräte",
        noDeviceFound: "Keine senseBox gefunden",
      },
    },
  },
  // Live reload from the dev server: CAP_SERVER_URL=http://<laptop-ip>:3000 npx cap run ios
  ...(process.env.CAP_SERVER_URL ? { server: { url: process.env.CAP_SERVER_URL, cleartext: true } } : {}),
};

export default config;
