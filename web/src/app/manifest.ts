import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Pathivara School Operations",
    short_name: "Pathivara",
    description: "School administration and operations workspace.",
    start_url: "/",
    display: "standalone",
    background_color: "#f5f7f8",
    theme_color: "#183944",
    orientation: "any",
    icons: [
      {
        src: "/icons/icon.svg",
        sizes: "192x192",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/icons/icon.svg",
        sizes: "192x192",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}