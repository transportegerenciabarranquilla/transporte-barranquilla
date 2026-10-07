import type { Metadata } from "next";
import { PostArrivalAlerts } from "../components/PostArrivalAlerts";

export const metadata: Metadata = {
  title: "Alertas TML | People Transporte",
  description: "Personas con más de 45 minutos entre la llegada del vehículo y su salida en GeoVictoria.",
};

export default async function TmlAlertsPage({ searchParams }: { searchParams: Promise<{ fecha?: string; corte?: string }> }) {
  const { fecha, corte } = await searchParams;
  return <PostArrivalAlerts initialDate={fecha || ""} initialSnapshotId={corte || ""} />;
}
