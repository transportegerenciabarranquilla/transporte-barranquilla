import { NextResponse } from "next/server";
import { ACCESS_COOKIE, getAuthCookieOptions, REFRESH_COOKIE, REMEMBER_COOKIE } from "../../../lib/authServer";
import { contractorForEmail, isAdminEmail } from "../../../lib/contractors";
import { requireSupabaseKey, SUPABASE_URL } from "../../../lib/supabaseServer";

type LoginResponse = { access_token?: string; refresh_token?: string; expires_in?: number; user?: { email?: string }; error_description?: string; msg?: string };

export async function POST(request: Request) {
  const { email, password, remember } = (await request.json()) as { email?: string; password?: string; remember?: boolean };
  const normalizedEmail = email?.trim().toLowerCase() || "";
  const contractor = contractorForEmail(normalizedEmail);
  if (!contractor) return NextResponse.json({ error: "Este correo no tiene una empresa asignada." }, { status: 403 });

  const supabaseKey = requireSupabaseKey();
  const authResponse = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: supabaseKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email: normalizedEmail, password }),
    cache: "no-store",
  });
  const body = (await authResponse.json().catch(() => ({}))) as LoginResponse;
  if (!authResponse.ok || !body.access_token) {
    return NextResponse.json({ error: body.error_description || body.msg || "Correo o contraseña incorrectos." }, { status: 401 });
  }

  const response = NextResponse.json({ email: normalizedEmail, contractor, isAdmin: isAdminEmail(normalizedEmail) });
  const maxAge = remember ? body.expires_in || 3600 : undefined;
  response.cookies.set(ACCESS_COOKIE, body.access_token, getAuthCookieOptions(maxAge));
  response.cookies.set(REMEMBER_COOKIE, remember ? "true" : "false", getAuthCookieOptions(remember ? 60 * 60 * 24 * 30 : undefined));
  if (body.refresh_token) response.cookies.set(REFRESH_COOKIE, body.refresh_token, getAuthCookieOptions(remember ? 60 * 60 * 24 * 30 : undefined));
  return response;
}
