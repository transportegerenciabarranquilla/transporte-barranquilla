import { NextResponse } from "next/server";
import { getAuthenticatedSession } from "../../../lib/authServer";

export async function GET() {
  const session = await getAuthenticatedSession();
  if (!session?.isAdmin) return NextResponse.json({ error: "Solo el administrador puede activar avisos." }, { status: 403 });
  const publicKey = process.env.VAPID_PUBLIC_KEY || process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";
  if (!publicKey) return NextResponse.json({ error: "Las notificaciones aún no están configuradas en el servidor." }, { status: 503 });
  return NextResponse.json({ publicKey });
}
