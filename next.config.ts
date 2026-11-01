import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  allowedDevOrigins: ["192.168.0.186"],
  // `npm run build:ios` exports static files into out/ for the Capacitor app.
  // The normal build stays a server build so `npm run start` keeps working for workshops.
  ...(process.env.LICHTWERK_EXPORT === "1" ? { output: "export" as const } : {}),
};

export default nextConfig;
