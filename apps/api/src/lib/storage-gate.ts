import { storageHold } from "@carres/shared";
import { catalogCategoryOf } from "./catalog-category-of";

/**
 * Collect-before-delivery gate (balance job — Jess 2026-06-23: collect the
 * storage fee BEFORE delivery, gate delivery until collected; a release needs
 * the manager). Migration 0184.
 *
 * Returns a blocker `{ message, amount }` when an order has a storage fee owed
 * that has NOT been collected and that the manager has NOT released — else
 * `null` (dispatch may proceed).
 *
 * C9 (2026-07-27) — this now asks the ONE shared rule (`storageHold`) instead
 * of computing its own answer, and that closed a real hole: it read the
 * override and the computed fee but **not** the Master-imported
 * `storage_fee_msbf` / `storage_fee_sof` columns (0207), so an order carrying
 * Jess's own keyed fee and no `storage_from` was counted by the Orders ladder
 * and waved through by this gate. Same rule now for the ladder, the booking
 * gate and this one.
 *
 * Fail-OPEN by design: if the lookups error or the order has no storage scope,
 * we return null. The gate's job is to stop a KNOWN-owed fee slipping through,
 * not to block dispatch on an infra hiccup.
 */
export async function storageBlock(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: any,
  orderId: string,
): Promise<{ message: string; amount: number } | null> {
  try {
    const [controlRes, linesRes, categoryOf] = await Promise.all([
      sb
        .from("ops_order_control")
        .select(
          "storage_from, storage_fee_override, storage_fee_msbf, storage_fee_sof, storage_collected_at, storage_waiver_status",
        )
        .eq("order_id", orderId)
        .maybeSingle(),
      sb.from("order_lines").select("sku").eq("order_id", orderId),
      catalogCategoryOf(sb),
    ]);

    const control = controlRes?.data ?? null;
    // No overlay row → the operator never turned storage on → gate open.
    if (!control) return null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const skus: string[] = (linesRes?.data ?? []).map((l: any) => String(l.sku));
    const hold = storageHold({
      storageFrom: control.storage_from ?? null,
      override: control.storage_fee_override ?? null,
      importedMsbf: control.storage_fee_msbf ?? null,
      importedSof: control.storage_fee_sof ?? null,
      skus,
      categoryOf,
      asOf: new Date().toISOString().slice(0, 10),
      collectedAt: control.storage_collected_at ?? null,
      waiverStatus: control.storage_waiver_status ?? null,
    });
    // Collected, waived, or released by the manager → the goods go. A release
    // that did not waive leaves `owing` above zero on purpose: the money action
    // stays open, it just no longer stands in front of the delivery.
    if (hold.released || hold.owing <= 0) return null;

    return {
      amount: hold.owing,
      message:
        `Storage fee of RM ${hold.owing.toLocaleString()} must be collected before this order ` +
        `can be dispatched — or a manager releases the delivery.`,
    };
  } catch {
    // Fail OPEN — a gate-lookup hiccup must not block dispatch of the live
    // orders (0 of which currently carry storage).
    return null;
  }
}
