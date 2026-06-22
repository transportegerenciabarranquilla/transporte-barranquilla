import { NextResponse } from "next/server";
import { supabaseHeaders, supabaseRest } from "../../lib/supabaseServer";

export async function GET(request: Request) {
  try {
    const rawCc = new URL(request.url).searchParams.get("cc");
    const contractor = new URL(request.url).searchParams.get("contratista")?.trim();
    const cc = rawCc?.replace(/\D/g, "").trim();

    if (!cc) {
      return NextResponse.json({ persona: null });
    }

    const params = new URLSearchParams({
      select: "CC,NOMBRE,CARGO,CONTRATISTA",
      CC: `eq.${cc}`,
      limit: "1",
    });
    if (contractor) params.set("CONTRATISTA", `eq.${contractor}`);
    const response = await fetch(
      supabaseRest("transporte_barranquilla", `?${params.toString()}`),
      {
        headers: supabaseHeaders(),
        cache: "no-store",
      }
    );
    const body = await response.json().catch(() => null);

    if (!response.ok) {
      return NextResponse.json(
        {
          error:
            body?.message ||
            body?.error ||
            `Supabase respondió ${response.status}.`,
        },
        { status: response.status }
      );
    }

    return NextResponse.json({
      persona: Array.isArray(body) ? body[0] ?? null : null,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Error buscando la persona.",
      },
      { status: 500 }
    );
  }
}
