import { cookies } from "next/headers";
import { contractorForEmail, isAdminEmail } from "./contractors";
import { SUPABASE_KEY, SUPABASE_URL } from "./supabaseServer";

export const ACCESS_COOKIE = "bavaria_access_token";
export const REFRESH_COOKIE = "bavaria_refresh_token";

type SupabaseUser = { email?: string };

export async function getAuthenticatedSession() {
  const accessToken = (await cookies()).get(ACCESS_COOKIE)?.value;
  if (!accessToken) return null;

  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!response.ok) return null;

  const user = (await response.json()) as SupabaseUser;
  const email = user.email?.toLowerCase() || "";
  const contractor = contractorForEmail(email);
  return contractor ? { accessToken, email, contractor, isAdmin: isAdminEmail(email) } : null;
}
