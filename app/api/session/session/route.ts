import { NextResponse } from "next/server";
import { getAuthenticatedSession } from "../../../lib/authServer";

export async function GET() {
  try {
    const session = await getAuthenticatedSession({ allowSiteAdmin: true, allowEffectiveRest: true });
    if (!session) return NextResponse.json({ session: null }, { status: 401 });
    return NextResponse.json({
      session: { email: session.email, contractor: session.contractor, isAdmin: session.isAdmin, isSiteAdmin: session.isSiteAdmin, isPeople: session.isPeople },
    });
  } catch {
    return NextResponse.json({ error: "No se pudo verificar la sesión temporalmente." }, { status: 503 });
  }
}
