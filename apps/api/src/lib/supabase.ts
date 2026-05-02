import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Bindings } from "../types";

export function userClient(env: Bindings, jwt: string): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

// RED LINE: service_role bypasses RLS. Only call from cron, admin, or
// account-creation routes. Never echo this client (or its data) back to the
// browser without explicit per-row RLS-equivalent checks.
export function adminClient(env: Bindings): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
