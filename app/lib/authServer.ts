import { cookies } from "next/headers";
import { contractorForEmail } from "./contractors";
import { SUPABASE_URL } from "./supabaseServer";

export const ACCESS_COOKIE = "bavaria_access_token";
export const REFRESH_COOKIE = "bavaria_refresh_token";

type SupabaseUser = {
  email?: string;
};

export async function getAuthenticatedSession() {
  const accessToken = (await cookies()).get(ACCESS_COOKIE)?.value;

  if (!accessToken) {
    return null;
  }

  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_ANON_KEY;

  if (!supabaseKey) {
    throw new Error("Falta SUPABASE_ANON_KEY o SUPABASE_SERVICE_ROLE_KEY.");
  }

  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${accessToken}`,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    return null;
  }

  const user = (await response.json()) as SupabaseUser;

  const email = user.email?.toLowerCase() || "";
  const contractor = contractorForEmail(email);

  return contractor
    ? {
        accessToken,
        email,
        contractor,
      }
    : null;
}