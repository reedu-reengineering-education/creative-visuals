import type { NextConfig } from "next";

// Set by the GitHub Pages workflow (e.g. "/creative-visuals"); empty everywhere else.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  allowedDevOrigins: ["192.168.0.186", "192.168.2.173"],
  // `npm run build:ios` and the GitHub Pages workflow export static files into out/.
  // The normal build stays a server build so `npm run start` keeps working for workshops.
  ...(process.env.LICHTWERK_EXPORT === "1" ? { output: "export" as const } : {}),
  ...(basePath ? { basePath } : {}),
  // GitHub Pages: export output/index.html instead of output.html, because the export also has an
  // output/ folder (RSC payload) and Pages would serve that folder for /output. Not for the iOS app,
  // which loads output.html.
  ...(process.env.LICHTWERK_PAGES === "1" ? { trailingSlash: true } : {}),
};

export default nextConfig;
