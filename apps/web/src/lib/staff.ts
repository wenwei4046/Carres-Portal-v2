import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { StaffTierDto } from "@carres/shared";

/**
 * 0232 — Staff PIN login (Loo 2026-07-18). The per-tab staff identity proven by
 * a 6-digit PIN (or an owner-mode password reauth). One store login (email +
 * password) still gates first; this rides ON TOP of it and identifies the
 * PERSON so every order is attributed to them.
 *
 * Persisted to sessionStorage: it must survive a page refresh mid-shift but NOT
 * outlive the browser tab (a staff member walking away from the showroom tablet
 * shouldn't leave their identity minted for the next customer indefinitely — the
 * token also self-expires server-side at 12h).
 *
 * The central API fetcher (lib/api.ts) reads `token` here and echoes it as the
 * `X-Staff-Token` header on every call; a `staff_session_required` 403 clears it
 * (forces re-PIN). Dormant stores (no PIN set) never mint a token → the whole
 * feature is inert and the POS behaves exactly as before.
 */

/** The staff member proven by the active session (or owner-mode). */
export interface StaffIdentity {
  /** salespersons.id — null only in owner-mode (reauth before an owner row exists). */
  sid: string | null;
  tier: StaffTierDto;
  name: string;
  color: string | null;
  /** The staff's OWN outlet (salespersons.outlet_id); null = all outlets (principal). */
  outletId: string | null;
}

interface StaffSessionState {
  /** Signed staff token echoed on every API call (X-Staff-Token). Null = no session. */
  token: string | null;
  staff: StaffIdentity | null;
  /** Which dealer this session was minted for — guards the shared-kiosk case: a
   *  different store logging in on the same tab drops the stale session. */
  dealerId: string | null;
  /** The working outlet chosen at the outlet picker (survives 换人 / switch). */
  sessionOutletId: string | null;

  setSession: (token: string, staff: StaffIdentity, dealerId: string | null) => void;
  setSessionOutlet: (outletId: string | null) => void;
  /** 换人 / switch — drop the PERSON but keep the working outlet. */
  clearToken: () => void;
  /** Full reset (sign-out / cross-dealer) — drop everything. */
  reset: () => void;
}

export const useStaffSession = create<StaffSessionState>()(
  persist(
    (set) => ({
      token: null,
      staff: null,
      dealerId: null,
      sessionOutletId: null,
      setSession: (token, staff, dealerId) => set({ token, staff, dealerId }),
      setSessionOutlet: (outletId) => set({ sessionOutletId: outletId }),
      clearToken: () => set({ token: null, staff: null }),
      reset: () => set({ token: null, staff: null, dealerId: null, sessionOutletId: null }),
    }),
    {
      name: "carres-staff-session",
      storage: createJSONStorage(() => sessionStorage),
    },
  ),
);
