import { NextResponse } from "next/server";
import { getAuthenticatedSession } from "../../../../lib/authServer";
import { supabaseAdminHeaders, supabaseUserHeaders } from "../../../../lib/supabaseServer";
import { readZkiCrewRows } from "../crewTable";

export async function GET() {
  try {
    const session = await getAuthenticatedSession();
    if (!session || (!session.isPeople && !session.isAdmin)) {
      return NextResponse.json({ error: "No autorizado." }, { status: 403 });
    }
    const headers = supabaseAdminHeaders() ?? supabaseUserHeaders(session.accessToken);
    return NextResponse.json({ crew: await readZkiCrewRows(headers) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo consultar Conductores-placas." }, { status: 500 });
  }
}
