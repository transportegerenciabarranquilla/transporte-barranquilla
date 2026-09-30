import { NextResponse, type NextRequest } from "next/server";
import { isEffectiveRestEmail, isSecurityOwnerEmail } from "./app/lib/contractors";
import { isTrustedMutation } from "./app/lib/requestOrigin";
import { requestIp } from "./app/lib/securityIp";
import { isIpBlocked } from "./app/lib/securityIpState";
import { requireSupabaseKey, SUPABASE_URL } from "./app/lib/supabaseServer";

// Optimistic navigation restriction only. Pages and APIs independently validate
// the session against Supabase; the unsigned payload never grants permissions.
export async function proxy(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/api/") && !isTrustedMutation(request)) {
    return NextResponse.json({ error: "Origen de solicitud no permitido." }, { status: 403 });
  }
  const token = request.cookies.get("bavaria_access_token")?.value;
  const path = request.nextUrl.pathname;
  // La portada y el login permiten a la cuenta propietaria recuperar acceso.
  // El login verifica la IP después de autenticar, antes de emitir cookies.
  const recovery = ["/", "/api/session/login", "/api/session/logout", "/api/security/lockdown"];
  if (!recovery.includes(path)) {
    try {
      if (await isIpBlocked(requestIp(request.headers))) {
        let owner = false;
        if (token) {
          const result = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
            headers: { apikey: requireSupabaseKey(), Authorization: `Bearer ${token}` }, cache: "no-store",
          });
          const user = result.ok ? await result.json() : null;
          owner = Boolean(user?.id && isSecurityOwnerEmail(user.email));
        }
        if (!owner) return path.startsWith("/api/")
          ? NextResponse.json({ error: "El acceso desde esta IP está bloqueado." }, { status: 423 })
          : NextResponse.redirect(new URL("/", request.url));
      }
    } catch {
      return NextResponse.json({ error: "No se pudo verificar el acceso. Intenta nuevamente." }, { status: 503 });
    }
  }
  let email = "";
  try { email = JSON.parse(Buffer.from(token?.split(".")[1] || "", "base64url").toString()).email || ""; } catch { /* Server auth handles expired or invalid sessions. */ }
  if (!isEffectiveRestEmail(email)) return NextResponse.next();
  const allowed = ["/", "/descanso-efectivo", "/api/session/session", "/api/session/login", "/api/session/logout", "/api/security/lockdown"];
  if (allowed.includes(path) || path === "/api/effective-rest" || path.startsWith("/api/effective-rest/")) return NextResponse.next();
  if (path.startsWith("/api/")) return NextResponse.json({ error: "Esta cuenta solo tiene acceso a Descanso efectivo." }, { status: 403 });
  return NextResponse.redirect(new URL("/descanso-efectivo", request.url));
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|favicon.jpeg|manifest.webmanifest|sw.js|icons/).*)"] };
