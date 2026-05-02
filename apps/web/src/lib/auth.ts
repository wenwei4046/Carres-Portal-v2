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

function pickRole(session: Session | null): Role | null {
  const r = session?.user.app_metadata?.role;
  if (typeof r !== "string") return null;
  return (VALID_ROLES as readonly string[]).includes(r) ? (r as Role) : null;
}

function pickEntity(session: Session | null, key: string): string | null {
  const v = session?.user.app_metadata?.[key];
  return typeof v === "string" && v.length > 0 ? v : null;
}

function projectSession(session: Session | null) {
  return {
    session,
    user: session?.user ?? null,
    role: pickRole(session),
    dealerId: pickEntity(session, "dealer_id"),
    supplierId: pickEntity(session, "supplier_id"),
    partnerId: pickEntity(session, "partner_id"),
    outletId: pickEntity(session, "outlet_id"),
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
  },
}));
