import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Torre Control - Transporte Barranquilla",
    short_name: "Torre Control",
    description: "Seguimiento operativo de transporte, rutas y personal.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f4f7fb",
    theme_color: "#10223d",
    lang: "es-CO",
    categories: ["business", "productivity"],
    icons: [{ src: "/favicon.jpeg", sizes: "438x438", type: "image/jpeg", purpose: "any" }],
  };
}
