import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const DEFAULT_SUPABASE_URL = "https://ixlyupfcjdwsskkrkpbb.supabase.co";
const DEFAULT_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_BmyQ6eSMHKSn_CdsecPSkQ_35jfBVFm";
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || DEFAULT_SUPABASE_URL;
const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || DEFAULT_SUPABASE_PUBLISHABLE_KEY;

let browserClient: SupabaseClient | null = null;

export function isSupabaseConfigured() {
  return Boolean(supabaseUrl && supabasePublishableKey);
}

export function getSupabaseClient() {
  browserClient ??= createClient(supabaseUrl, supabasePublishableKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });

  return browserClient;
}

export async function getAuthenticatedSupabaseClient() {
  const client = getSupabaseClient();
  const { data, error } = await client.auth.getSession();

  if (error) throw new Error(`No fue posible consultar la sesión de Supabase: ${error.message}`);
  if (data.session) return client;

  const { error: signInError } = await client.auth.signInAnonymously();
  if (signInError) {
    throw new Error(
      `Supabase rechazó la conexión porque las sesiones anónimas están desactivadas. Activa Authentication > General Configuration > Allow anonymous sign-ins y recarga la página. ${signInError.message}`,
    );
  }

  return client;
}
