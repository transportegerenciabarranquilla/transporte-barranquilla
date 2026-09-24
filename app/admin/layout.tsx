import { redirect } from "next/navigation";
import { getAuthenticatedSession } from "../lib/authServer";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getAuthenticatedSession({ allowSiteAdmin: true, refreshSession: false });
  if (!session?.isAdmin) redirect("/");
  return children;
}
