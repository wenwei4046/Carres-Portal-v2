import { useEffect, useState } from "react";
import type { Role } from "@carres/shared/domain";
import type { PaymentRequestMe } from "@carres/shared/payment-requests";
import { apiFetch } from "@/lib/api";

/**
 * What the signed-in person may do beyond their role, for the rail.
 *
 * ONE use today (Chew 2026-10-03, docs/finance/MASTER.md §3.3 — the one
 * shared-menu change Chew approved): the `Payment Requests` entry shows to the
 * Operation staff Finance or the boss has allowed to ask Finance to pay. Finance and the
 * principal see it in the Finance area by their role.
 *
 * Read once per person with a plain request, not a react-query hook: the rail
 * renders in shells (and their tests) that carry no query client. A failed
 * read is "not allowed" — the entry stays hidden, which is the safe side; the
 * page itself is refused by the database to anyone not allowed.
 */
export type NavCapability = "payment-requester";

export const NO_CAPS: ReadonlySet<NavCapability> = new Set();
const ASKING_ROLES: ReadonlySet<Role> = new Set<Role>(["operation", "principal"]);

let cached: { key: string; caps: ReadonlySet<NavCapability> } | null = null;

export function capsFrom(me: PaymentRequestMe | null | undefined): ReadonlySet<NavCapability> {
  return me?.may_request ? new Set<NavCapability>(["payment-requester"]) : NO_CAPS;
}

export function useNavCapabilities(role: Role | null, userId: string | null | undefined): ReadonlySet<NavCapability> {
  const asks = role !== null && ASKING_ROLES.has(role) && Boolean(userId);
  const key = `${role}:${userId ?? ""}`;
  const [caps, setCaps] = useState<ReadonlySet<NavCapability>>(() => (asks && cached?.key === key ? cached.caps : NO_CAPS));
  useEffect(() => {
    if (!asks) { setCaps(NO_CAPS); return; }
    if (cached?.key === key) { setCaps(cached.caps); return; }
    let live = true;
    void apiFetch<PaymentRequestMe>("/api/finance/payment-requests/me")
      .then((me) => {
        const next = capsFrom(me);
        cached = { key, caps: next };
        if (live) setCaps(next);
      })
      .catch(() => { /* not allowed: the entry stays hidden */ });
    return () => { live = false; };
  }, [asks, key]);
  return caps;
}

/** Forget the cached answer (a new grant shows on the next read). */
export function resetNavCapabilities(): void {
  cached = null;
}
