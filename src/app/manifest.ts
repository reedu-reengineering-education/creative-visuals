import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Lichtwerk",
    short_name: "Lichtwerk",
    description: "Projection mapping for kids",
    start_url: "/",
    display: "fullscreen",
    orientation: "landscape",
    background_color: "#000000",
    theme_color: "#000000",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
