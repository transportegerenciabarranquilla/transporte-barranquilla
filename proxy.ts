import { NextResponse, type NextRequest } from "next/server";
import { isEffectiveRestEmail } from "./app/lib/contractors";

// Optimistic navigation restriction only. Pages and APIs independently validate
// the session against Supabase; the unsigned payload never grants permissions.
export function proxy(request: NextRequest) {
  const token = request.cookies.get("bavaria_access_token")?.value;
  let email = "";
  try { email = JSON.parse(Buffer.from(token?.split(".")[1] || "", "base64url").toString()).email || ""; } catch { /* Server auth handles expired or invalid sessions. */ }
  if (!isEffectiveRestEmail(email)) return NextResponse.next();
  const path = request.nextUrl.pathname;
  const allowed = ["/", "/descanso-efectivo", "/api/effective-rest", "/api/session/session", "/api/session/login", "/api/session/logout", "/api/security/lockdown"];
  if (allowed.includes(path)) return NextResponse.next();
  if (path.startsWith("/api/")) return NextResponse.json({ error: "Esta cuenta solo tiene acceso a Descanso efectivo." }, { status: 403 });
  return NextResponse.redirect(new URL("/descanso-efectivo", request.url));
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|favicon.jpeg|manifest.webmanifest|sw.js|icons/).*)"] };
