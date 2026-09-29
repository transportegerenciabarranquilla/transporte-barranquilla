import { redirect } from "next/navigation";
import GraficasDashboard from "../admin/graficas/GraficasDashboard";
import { getAuthenticatedSession } from "../lib/authServer";
import { canAccessDeliveryCompliance } from "../lib/contractors";

export default async function CumplimientoEntregasPage() {
  const session = await getAuthenticatedSession({ refreshSession: false });
  if (!session || !canAccessDeliveryCompliance(session)) redirect("/");
  return <GraficasDashboard contractorMode contractorName={session.contractor} deliveryMode />;
}
