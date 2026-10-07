import type { Metadata } from "next";
import { RouteTrackingDashboard } from "./RouteTrackingDashboard";

export const metadata: Metadata = {
  title: "Seguimiento de ruta | People Transporte",
  description: "Tiempo en ruta, TML y tiempo despertino por viaje y tripulante.",
};

export default function RouteTrackingPage() {
  return <RouteTrackingDashboard />;
}
