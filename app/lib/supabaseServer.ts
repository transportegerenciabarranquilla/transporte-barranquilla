export const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  "https://brtdrqslzfspsiyukzrl.supabase.co";

export const SUPABASE_KEY: string =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  "";

export const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

export function requireSupabaseKey() {
  if (!SUPABASE_KEY) {
    throw new Error("Falta SUPABASE_ANON_KEY en las variables de entorno.");
  }

  return SUPABASE_KEY;
}

export function supabaseHeaders(extra?: Record<string, string>) {
  const key = requireSupabaseKey();

  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

export function supabaseUserHeaders(accessToken: string, extra?: Record<string, string>) {
  return supabaseHeaders({ Authorization: `Bearer ${accessToken}`, ...extra });
}

export function supabaseReadHeaders(accessToken: string, extra?: Record<string, string>) {
  return supabaseAdminHeaders(extra) ?? supabaseUserHeaders(accessToken, extra);
}

export function supabaseAdminHeaders(extra?: Record<string, string>) {
  if (!SUPABASE_SERVICE_ROLE_KEY) return null;

  return {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
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
