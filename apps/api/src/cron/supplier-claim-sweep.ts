import { adminClient } from "../lib/supabase";
import type { Bindings } from "../types";

/**
 * The unkept promise, swept daily (R2, migration 0288).
 *
 * The card asks for TWO ways a supplier claim is born. The first is a human
 * one — the receiving operator counts damaged / wrong units and the receive
 * RPC mints the claim on the spot. The second has nobody to trigger it: a PO
 * whose ETA has passed with units still pending delivery is a problem that
 * happens by the calendar, not by an action. So it runs on the clock, inside
 * the existing daily 09:00-MYT cron.
 *
 * `supplier_claim_sweep_overdue()` is idempotent — at most ONE open
 * late_delivery claim per PO line — so re-running it is free, and a Worker
 * retry cannot duplicate a chase.
 *
 * The RPC is granted to `service_role` ONLY (0266's lesson: a NULL app_role
 * must never fall through a gate, and the safest gate is no door at all), so
 * this is deliberately the admin client and there is no HTTP route that fires
 * it.
 *
 * FAILS SOFT: on a DB that predates 0288 the RPC is missing and the sweep
 * logs and returns 0 — a dormant feature must never take the other crons down
 * with it (the po-duty cron's contract, kept).
 */
export async function runSupplierClaimSweepCron(env: Bindings): Promise<number> {
  const sb = adminClient(env);
  const { data, error } = await sb.rpc("supplier_claim_sweep_overdue");
  if (error) {
    console.error("supplier-claim sweep failed:", error.message);
    return 0;
  }
  const created = Number(
    (data as { claims_created?: number } | null)?.claims_created ?? 0,
  );
  if (created > 0) {
    console.log(`supplier-claim sweep: ${created} late-delivery claim(s) opened`);
  }
  return created;
}
