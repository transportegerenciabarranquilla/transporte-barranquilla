import { NextResponse } from "next/server";
import { getAuthenticatedSession } from "../../../lib/authServer";
import { supabaseError, supabaseRest, supabaseUserHeaders } from "../../../lib/supabaseServer";

export async function GET() {
  try {
    const session = await getAuthenticatedSession();
    if (!session) return NextResponse.json({ error: "Debes iniciar sesión." }, { status: 401 });
    const response = await fetch(supabaseRest("relevos", "?select=*"), { headers: supabaseUserHeaders(session.accessToken), cache: "no-store" });
    if (!response.ok) return NextResponse.json({ error: await supabaseError(response) }, { status: response.status });
    return NextResponse.json({ records: await response.json().catch(() => []) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo consultar relevos." }, { status: 500 });
  }
}
