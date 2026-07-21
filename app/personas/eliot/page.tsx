import type { Metadata } from "next";
import { TdControlApp } from "./components/TdControlApp";

export const metadata: Metadata = {
  title: "Atrasos | People Transporte",
  description: "Control de atrasos, marcaciones y tripulaciones por corte.",
};

export default function AtrasosPage() {
  return <TdControlApp />;
}
