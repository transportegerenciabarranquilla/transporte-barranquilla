import type { Metadata } from "next";
import PersonTracking from "./PersonTracking";

export const metadata: Metadata = {
  title: "Seguimiento de persona | People",
  description: "Historial operativo y evaluaciones en ruta por cédula.",
};

export default function PersonTrackingPage() {
  return <PersonTracking />;
}
