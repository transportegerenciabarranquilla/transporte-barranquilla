export const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  "https://brtdrqslzfspsiyukzrl.supabase.co";

export const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  "";

export function supabaseHeaders(extra?: Record<string, string>) {
  if (!SUPABASE_KEY) {
    throw new Error("Falta SUPABASE_ANON_KEY o SUPABASE_SERVICE_ROLE_KEY.");
  }

  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

export function supabaseUserHeaders(
  accessToken: string,
  extra?: Record<string, string>
) {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    ...extra,
  };
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