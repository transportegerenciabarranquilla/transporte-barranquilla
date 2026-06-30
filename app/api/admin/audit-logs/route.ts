import { NextResponse } from "next/server";
import { getAuthenticatedSession } from "../../../lib/authServer";
import { fromAuditRow } from "../../../lib/auditLog";
import { supabaseAdminHeaders, supabaseError, supabaseRest, supabaseUserHeaders } from "../../../lib/supabaseServer";

const TABLE = "audit_logs";
const SELECT = "audit_id,action,module,contractor,user_email,ip_address,user_agent,device,record_id,details,created_at";

export async function GET(request: Request) {
  try {
    const session = await getAuthenticatedSession();
    if (!session?.isAdmin) return NextResponse.json({ error: "No autorizado." }, { status: 403 });

    const searchParams = new URL(request.url).searchParams;
    const contractor = searchParams.get("contractor") || "";
    const action = searchParams.get("action") || "";
    const date = searchParams.get("date") || "";
    const params = new URLSearchParams({ select: SELECT, order: "created_at.desc", limit: "200" });
    if (contractor && contractor !== "Todas") params.set("contractor", `eq.${contractor}`);
    if (action) params.set("action", `eq.${action}`);
    if (date) {
      params.set("created_at", `gte.${date}T00:00:00`);
      params.append("created_at", `lt.${date}T23:59:59`);
    }

    const response = await fetch(supabaseRest(TABLE, `?${params.toString()}`), {
      headers: supabaseAdminHeaders() || supabaseUserHeaders(session.accessToken),
      cache: "no-store",
    });
    if (!response.ok) return NextResponse.json({ error: await supabaseError(response) }, { status: response.status });

    const rows = (await response.json()) as Parameters<typeof fromAuditRow>[0][];
    return NextResponse.json({ records: rows.map(fromAuditRow) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error consultando auditoria." }, { status: 500 });
  }
}
