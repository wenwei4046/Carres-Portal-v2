import { create } from "zustand";
import type { Session, User } from "@supabase/supabase-js";
import type { Role } from "@carres/shared/domain";
import { supabase } from "./supabase";

type AuthState = {
  session: Session | null;
  user: User | null;
  role: Role | null;
  dealerId: string | null;
  supplierId: string | null;
  partnerId: string | null;
  outletId: string | null;
  loading: boolean;
  hydrated: boolean;
};

type AuthActions = {
  hydrate: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
};

const VALID_ROLES = [
  "principal", "dealer", "salesperson", "showroom",
  "logistics", "supplier", "partner", "finance", "bd",
] as const;

// Supabase Auth Hook (custom_access_token_hook) injects role/entity ids into
// JWT app_metadata at sign-in. The User object's app_metadata only carries
// provider info — the enriched claims live in the JWT itself, so we decode
// the access_token to read them.
function decodeJwtClaims(jwt: string): Record<string, unknown> | null {
  try {
    const payload = jwt.split(".")[1];
    if (!payload) return null;
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function pickRole(appMeta: Record<string, unknown>): Role | null {
  const r = appMeta.role;
  if (typeof r !== "string") return null;
  return (VALID_ROLES as readonly string[]).includes(r) ? (r as Role) : null;
}

function pickEntity(appMeta: Record<string, unknown>, key: string): string | null {
  const v = appMeta[key];
  return typeof v === "string" && v.length > 0 ? v : null;
}

function projectSession(session: Session | null) {
  const claims = session ? decodeJwtClaims(session.access_token) : null;
  const appMeta = (claims?.app_metadata as Record<string, unknown> | undefined) ?? {};
  return {
    session,
    user: session?.user ?? null,
    role: pickRole(appMeta),
    dealerId: pickEntity(appMeta, "dealer_id"),
    supplierId: pickEntity(appMeta, "supplier_id"),
    partnerId: pickEntity(appMeta, "partner_id"),
    outletId: pickEntity(appMeta, "outlet_id"),
  };
}

// onAuthStateChange runs once at module level — Supabase's listener is global,
// not per-component. Re-subscribing on every store creation would leak.
let listenerInstalled = false;

export const useAuth = create<AuthState & AuthActions>((set, get) => ({
  session: null,
  user: null,
  role: null,
  dealerId: null,
  supplierId: null,
  partnerId: null,
  outletId: null,
  loading: false,
  hydrated: false,

  async hydrate() {
    if (get().hydrated) return;
    set({ loading: true });
    const { data } = await supabase.auth.getSession();
    set({ ...projectSession(data.session), loading: false, hydrated: true });

    if (!listenerInstalled) {
      listenerInstalled = true;
      supabase.auth.onAuthStateChange((_event, session) => {
        set(projectSession(session));
      });
    }
  },

  async signIn(email, password) {
    set({ loading: true });
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    set({ loading: false });
    return { error: error?.message ?? null };
  },

  async signOut() {
    await supabase.auth.signOut();
    // PII guardrail: wipe wizard draft (customer name/phone/address) so a
    // subsequent login on the same tab (shared-kiosk scenario) doesn't restore
    // the previous dealer's in-progress order. Hard-coded key to avoid pulling
    // a wizard import into the auth store.
    try {
      sessionStorage.removeItem("carres-order-draft");
    } catch {
      // sessionStorage may be unavailable in some environments — swallow.
    }
  },
}));
