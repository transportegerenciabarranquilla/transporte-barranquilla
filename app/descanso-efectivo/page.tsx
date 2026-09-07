import { redirect } from "next/navigation";
import { getAuthenticatedSession } from "../lib/authServer";
import { isEffectiveRestEmail } from "../lib/contractors";
import EffectiveRestClient from "./EffectiveRestClient";
export default async function Page() {
  const session = await getAuthenticatedSession({ allowEffectiveRest: true });
  if (!session || !isEffectiveRestEmail(session.email)) redirect("/");
  return <EffectiveRestClient />;
}
