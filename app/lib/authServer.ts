import { cookies } from "next/headers";
import { contractorForEmail, isAdminEmail, isPeopleEmail } from "./contractors";
import { requireSupabaseKey, SUPABASE_URL } from "./supabaseServer";

export const ACCESS_COOKIE = "bavaria_access_token";
export const REFRESH_COOKIE = "bavaria_refresh_token";
export const REMEMBER_COOKIE = "bavaria_remember_session";

type SupabaseUser = { id?: string; email?: string };
type SupabaseRefreshResponse = {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  user?: SupabaseUser;
};

export async function getAuthenticatedSession() {
  const cookieStore = await cookies();
  let accessToken = cookieStore.get(ACCESS_COOKIE)?.value;
  const refreshToken = cookieStore.get(REFRESH_COOKIE)?.value;
  if (!accessToken && !refreshToken) return null;

  const supabaseKey = requireSupabaseKey();
  let user = accessToken ? await fetchSupabaseUser(supabaseKey, accessToken) : null;

  if (!user && refreshToken) {
    const refreshed = await refreshSupabaseSession(supabaseKey, refreshToken);
    if (!refreshed?.access_token) return null;

    const remember = cookieStore.get(REMEMBER_COOKIE)?.value === "true";
    accessToken = refreshed.access_token;
    user = refreshed.user || (await fetchSupabaseUser(supabaseKey, accessToken));

    cookieStore.set(ACCESS_COOKIE, accessToken, getAuthCookieOptions(remember ? refreshed.expires_in || 3600 : undefined));
    if (refreshed.refresh_token) {
      cookieStore.set(REFRESH_COOKIE, refreshed.refresh_token, getAuthCookieOptions(remember ? 60 * 60 * 24 * 30 : undefined));
    }
  }

  if (!accessToken || !user) return null;

  const email = user.email?.toLowerCase() || "";
  const contractor = contractorForEmail(email);
  return contractor && user.id ? { accessToken, userId: user.id, email, contractor, isAdmin: isAdminEmail(email), isPeople: isPeopleEmail(email) } : null;
}

async function fetchSupabaseUser(supabaseKey: string, accessToken: string) {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: supabaseKey, Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!response.ok) return null;

  return (await response.json()) as SupabaseUser;
}

async function refreshSupabaseSession(supabaseKey: string, refreshToken: string) {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: { apikey: supabaseKey, "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken }),
    cache: "no-store",
  });
  if (!response.ok) return null;

  return (await response.json()) as SupabaseRefreshResponse;
}

export function getAuthCookieOptions(maxAge?: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  };
}
