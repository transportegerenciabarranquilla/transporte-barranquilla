import { NextResponse } from "next/server";
import { supabaseError, supabaseHeaders, supabaseRest } from "../../../lib/supabaseServer";

export async function GET() {
  try {
    const params = new URLSearchParams({ select: "*", limit: "200" });
    const response = await fetch(supabaseRest("ruta_criticas", `?${params}`), {
      cache: "no-store",
      headers: supabaseHeaders(),
    });

    if (!response.ok) {
      return NextResponse.json({ error: await supabaseError(response) }, { status: response.status });
    }

    const rows = (await response.json().catch(() => [])) as Array<Record<string, unknown>>;
    const neighborhoods = rows
      .map((row, index) => ({
        id: Number(row["#"] ?? index + 1),
        route: String(row.RUTA ?? "").trim(),
        distributionCenter: String(row.CD ?? "").trim(),
      }))
      .filter((row) => row.route)
      .sort((a, b) => a.id - b.id);

    return NextResponse.json({ neighborhoods });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudieron cargar los barrios." },
      { status: 500 },
    );
  }
}
