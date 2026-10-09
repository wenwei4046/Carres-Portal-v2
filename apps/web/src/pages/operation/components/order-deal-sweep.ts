/**
 * THE DEAL RUNS FROM THE SHELL — owner rule (Orders MASTER "How the PIC is
 * decided", 0504; Delivery §13.1 2026-09-26): the system deals every order to
 * a person when it arrives, so an order with no PIC is a system error.
 *
 * The sweep (`POST /api/operation/staff/auto-assign`, one shared arithmetic
 * `planOpsAssignment`) used to be started only by the old Orders page
 * (`/operation/old-orders`), which nobody opens since the Sales Orders
 * register replaced it — so orders that entered Operations after the switch
 * were never dealt (measured 2026-10-09: SO-1365 and SO-1368). It now runs
 * once per signed-in session from the shell every Operations page shares.
 * Same rule, same server door: it deals only orders nobody carries and never
 * moves an order already resting with an active individual.
 */
import { useEffect } from "react";
import { apiFetch } from "@/lib/api";
import { queryClient } from "@/lib/query-client";
import { useAuth } from "@/lib/auth";

const KEY = (userId: string) => `carres-order-deal-sweep:${userId}`;

export function useOrderDealSweep(enabled: boolean = !import.meta.env.DEV) {
  const role = useAuth((s) => s.role);
  const userId = useAuth((s) => s.user?.id ?? null);
  useEffect(() => {
    /* A local development build talks to the shared database: it never deals
       orders, so a local walk can never change production assignments. */
    if (!enabled) return;
    if (!userId || (role !== "operation" && role !== "principal")) return;
    try {
      if (sessionStorage.getItem(KEY(userId))) return;
      sessionStorage.setItem(KEY(userId), "1");
    } catch {
      /* blocked storage: the sweep is idempotent, running it again is safe */
    }
    void apiFetch<{ assigned: number }>("/api/operation/staff/auto-assign", { method: "POST" })
      .then((r) => {
        if ((r?.assigned ?? 0) > 0) {
          void queryClient.invalidateQueries({ queryKey: ["operation"] });
        }
      })
      .catch(() => {
        /* the sweep is a background deal; a failed attempt changes nothing */
      });
  }, [enabled, role, userId]);
}
