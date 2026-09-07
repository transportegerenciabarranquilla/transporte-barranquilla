import { NextResponse } from "next/server";
import { getAuthenticatedSession } from "../../../lib/authServer";

export async function GET() {
  const session = await getAuthenticatedSession({ allowSiteAdmin: true, allowEffectiveRest: true });
  if (!session) return NextResponse.json({ session: null }, { status: 401 });
  return NextResponse.json({
    session: { email: session.email, contractor: session.contractor, isAdmin: session.isAdmin, isSiteAdmin: session.isSiteAdmin, isPeople: session.isPeople },
  });
}
