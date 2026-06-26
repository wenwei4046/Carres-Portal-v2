import { computeOrderStorage } from "@carres/shared";

/**
 * Collect-before-delivery gate (balance job — Jess 2026-06-23: collect the
 * storage fee BEFORE delivery, gate delivery until collected; a waiver needs
 * principal approval). Migration 0184.
 *
 * Returns a blocker `{ message, amount }` when an order has a storage fee owed
 * that has NOT been collected and has NOT been waived by a principal — else
 * `null` (dispatch may proceed). One shared definition of "is a fee owed?"
 * (`computeOrderStorage`) keeps this in lock-step with the Payments panel + the
 * drawer, so the gate never fires on an order the operator sees as RM0.
 *
 * Fail-OPEN by design: if the lookups error or the order has no storage scope,
 * we return null. The gate's job is to stop a KNOWN-owed fee slipping through,
 * not to block dispatch on an infra hiccup (158 live orders dispatch through
 * here; 0 currently carry storage).
 */
export async function storageBlock(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: any,
  orderId: string,
): Promise<{ message: string; amount: number } | null> {
  try {
    const [controlRes, linesRes] = await Promise.all([
      sb
        .from("ops_order_control")
        .select("storage_from, storage_fee_override, storage_collected_at, storage_waiver_status")
        .eq("order_id", orderId)
        .maybeSingle(),
      sb.from("order_lines").select("sku").eq("order_id", orderId),
    ]);

    const control = controlRes?.data ?? null;
    // No overlay row → the operator never turned storage on → gate open.
    if (!control) return null;
    // Already collected, or a principal approved a waiver → gate open.
    if (control.storage_collected_at) return null;
    if (control.storage_waiver_status === "approved") return null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const skus: string[] = (linesRes?.data ?? []).map((l: any) => String(l.sku));
    const asOf = new Date().toISOString().slice(0, 10);
    const { due, amount } = computeOrderStorage({
      storageFrom: control.storage_from ?? null,
      override:
        control.storage_fee_override != null ? Number(control.storage_fee_override) : null,
      skus,
      asOf,
    });
    if (!due) return null;

    return {
      amount,
      message: `Storage fee of RM${amount.toLocaleString()} must be collected (or waived by a principal) before this order can be dispatched.`,
    };
  } catch {
    // Fail OPEN — a gate-lookup hiccup must not block dispatch of the 158 live
    // orders (0 of which currently carry storage).
    return null;
  }
}
