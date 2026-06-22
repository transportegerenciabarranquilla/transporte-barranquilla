export const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  "https://brtdrqslzfspsiyukzrl.supabase.co";

export const SUPABASE_KEY: string =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  (() => {
    throw new Error("Falta SUPABASE_ANON_KEY en .env.local.");
  })();

export function supabaseHeaders(extra?: Record<string, string>) {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

export function supabaseUserHeaders(accessToken: string, extra?: Record<string, string>) {
  return supabaseHeaders({ Authorization: `Bearer ${accessToken}`, ...extra });
}

export function supabaseRest(table: string, query = "") {
  return `${SUPABASE_URL}/rest/v1/${table}${query}`;
}

export async function supabaseError(response: Response) {
  const body = await response.json().catch(() => ({}));

  return (
    body.message ||
    body.error ||
    `Supabase respondió ${response.status}`
  );
}
