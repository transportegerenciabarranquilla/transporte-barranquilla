import GraficasDashboard from "../../admin/graficas/GraficasDashboard";
import { redirect } from "next/navigation";
import { getAuthenticatedSession } from "../../lib/authServer";

export default async function SicGraficasPage() {
  const session = await getAuthenticatedSession();
  if (!session || session.isAdmin || session.isPeople) redirect("/");
  return <GraficasDashboard contractorMode contractorName={session.contractor} />;
}
