import { NextResponse } from "next/server";
import { ACCESS_COOKIE, getAuthCookieOptions, REFRESH_COOKIE, REMEMBER_COOKIE } from "../../../lib/authServer";
import { contractorForEmail, isAdminEmail, isPeopleEmail, isSecurityOwnerEmail } from "../../../lib/contractors";
import { readSecurityState } from "../../../lib/securityState";
import { requireSupabaseKey, SUPABASE_URL, supabaseUserHeaders } from "../../../lib/supabaseServer";

type LoginResponse = { access_token?: string; refresh_token?: string; expires_in?: number; user?: { email?: string }; error_description?: string; msg?: string };

const AUTH_TIMEOUT_MS = 12_000;

export async function POST(request: Request) {
  const { email, password, remember } = (await request.json()) as { email?: string; password?: string; remember?: boolean };
  const normalizedEmail = email?.trim().toLowerCase() || "";
  const contractor = contractorForEmail(normalizedEmail);
  if (!contractor) return NextResponse.json({ error: "Este correo no tiene una empresa asignada." }, { status: 403 });

  const supabaseKey = requireSupabaseKey();
  let authResponse: Response;
  try {
    authResponse = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: supabaseKey, "Content-Type": "application/json" },
      body: JSON.stringify({ email: normalizedEmail, password }),
      cache: "no-store",
      signal: AbortSignal.timeout(AUTH_TIMEOUT_MS),
    });
  } catch (error) {
    console.error("Supabase Auth no respondió durante el inicio de sesión.", error);
    return NextResponse.json(
      { error: "El servicio de inicio de sesión no está respondiendo. Intenta nuevamente en unos minutos." },
      { status: 503 },
    );
  }
  const body = (await authResponse.json().catch(() => ({}))) as LoginResponse;
  if (!authResponse.ok || !body.access_token) {
    if (authResponse.status === 400 || authResponse.status === 401) {
      return NextResponse.json(
        { error: body.error_description || body.msg || "Correo o contraseña incorrectos." },
        { status: 401 },
      );
    }

    console.error("Supabase Auth rechazó temporalmente el inicio de sesión.", {
      status: authResponse.status,
      message: body.error_description || body.msg,
    });
    return NextResponse.json(
      { error: "El servicio de inicio de sesión presenta una falla temporal. Intenta nuevamente en unos minutos." },
      { status: 503 },
    );
  }
  const security = await readSecurityState(supabaseUserHeaders(body.access_token)).catch((error) => {
    console.error("No se pudo consultar el estado de seguridad durante el inicio de sesión.", error);
    return { state: { active: false, activatedAt: "", activatedBy: "", reason: "" }, configured: false };
  });
  if (security.state.active && !isSecurityOwnerEmail(normalizedEmail)) {
    return NextResponse.json({ error: "La plataforma se encuentra en mantenimiento de seguridad." }, { status: 423 });
  }

  const response = NextResponse.json({
    email: normalizedEmail,
    contractor,
    isAdmin: isAdminEmail(normalizedEmail),
    isPeople: isPeopleEmail(normalizedEmail),
  });
  const maxAge = remember ? body.expires_in || 3600 : undefined;
  response.cookies.set(ACCESS_COOKIE, body.access_token, getAuthCookieOptions(maxAge));
  response.cookies.set(REMEMBER_COOKIE, remember ? "true" : "false", getAuthCookieOptions(remember ? 60 * 60 * 24 * 30 : undefined));
  if (body.refresh_token) response.cookies.set(REFRESH_COOKIE, body.refresh_token, getAuthCookieOptions(remember ? 60 * 60 * 24 * 30 : undefined));
  return response;
}
