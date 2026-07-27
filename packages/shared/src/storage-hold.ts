/**
 * storageHold — an order's storage fee, and whether it still holds the delivery
 * (card C9, Jess 2026-07-27).
 *
 * **The ruling.** An uncollected storage fee is the same as an unpaid balance:
 * the goods do not go. If something must go out anyway, the MANAGER releases it
 * and nobody else — and a release does not silently forgive the money.
 *
 * Before this file the portal read the storage fee in THREE different ways, the
 * same shape of drift C5 fixed for the goods balance:
 *
 *   * the Orders ladder summed the Master-imported `storage_fee_msbf` +
 *     `storage_fee_sof` and IGNORED `storage_fee_override`, so an order the
 *     operator had marked "No storage" still counted its fee;
 *   * the dispatch gate (`storageBlock`) read the override and the computed
 *     fee and IGNORED the imported columns, so an order carrying a Master fee
 *     and no `storage_from` was never blocked;
 *   * the drawer read all three in the right order and was the only one right.
 *
 * One rule now, three readers. The order of precedence is the drawer's, because
 * it is the one a human keys numbers into: **override (including 0) beats the
 * Master-imported figure, which beats the computed one.**
 *
 * **The two outcomes ride the columns that already exist** (no migration —
 * checked, per the card):
 *
 *   | The manager's decision | `storage_waiver_status` | `storage_fee_override` |
 *   |---|---|---|
 *   | released, fee still owed | `approved` | untouched — the fee stays owed |
 *   | released and waived      | `approved` | `0` — the fee is written off |
 *   | refused                  | `rejected` | untouched |
 *
 * `approved` therefore means RELEASED, and the write-off is the override — the
 * instrument that already means "this order owes no storage fee", already
 * honoured by every reader, and separate from `storage_fee_msbf` / `_sof`, so
 * the figure that was written off stays on the record instead of vanishing.
 *
 * **A release lifts the HOLD, never the debt.** `owing` keeps its value after a
 * release; only `released` changes. That is what keeps the money action open on
 * a released order — Jess: "an override must never quietly forgive money".
 */
import { computeOrderStorage } from "./schemas/ops-order-control";

export interface StorageHoldInput {
  /** `ops_order_control.storage_from` — the operator's "storage starts here".
   *  Null and no imported fee ⇒ no fee, however late the order is. */
  storageFrom: string | null;
  /** `ops_order_control.storage_fee_override` — a keyed figure. **0 is a
   *  value, not an absence**: it means the fee is written off (the drawer's
   *  "No storage", and C9's waive). */
  override?: number | string | null;
  /** `ops_order_control.storage_fee_msbf` (0207) — Jess's Master-sheet figure. */
  importedMsbf?: number | string | null;
  /** `ops_order_control.storage_fee_sof` (0207). */
  importedSof?: number | string | null;
  /** The order's line SKUs — they decide which rate applies (MS/BF · sofa). */
  skus: readonly string[];
  /** Today, as an ISO date. Handed in so this stays pure. */
  asOf: string;
  /** `ops_order_control.storage_collected_at` — the fee is in. */
  collectedAt?: string | null;
  /** `ops_order_control.storage_waiver_status`. */
  waiverStatus?: string | null;
}

export interface StorageHold {
  /** The chargeable fee, after the override / imported / computed ladder. */
  fee: number;
  /** Storage money still owed. Collection clears it; a RELEASE does not. */
  owing: number;
  /** The manager lifted the hold — the goods may go whether or not the fee is
   *  in. Never means the money is forgiven. */
  released: boolean;
  /** Released AND nothing left to collect — the "released and waived" outcome
   *  as it reads back off the row. Display only; no rule keys on it. */
  waived: boolean;
  /** A release was asked for and nobody has decided yet. */
  requested: boolean;
}

function n(v: number | string | null | undefined): number {
  if (v == null || v === "") return 0;
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

export function storageHold({
  storageFrom,
  override,
  importedMsbf,
  importedSof,
  skus,
  asOf,
  collectedAt,
  waiverStatus,
}: StorageHoldInput): StorageHold {
  const hasOverride = override != null && override !== "";
  // No ETA fallback, deliberately (`computeOrderStorage`): a fee is owed only
  // once a human declared storage. An order that is merely late does not start
  // owing rent, and must not have its delivery held for one.
  const computed = computeOrderStorage({
    storageFrom,
    override: hasOverride ? n(override) : null,
    skus,
    asOf,
  });
  const imported = n(importedMsbf) + n(importedSof);
  const fee = hasOverride
    ? Math.max(0, n(override))
    : imported > 0
      ? imported
      : Math.max(0, computed.amount);

  const status = waiverStatus ?? "none";
  const released = status === "approved";
  const owing = collectedAt ? 0 : fee;
  return {
    fee,
    owing,
    released,
    waived: released && owing <= 0,
    requested: status === "requested",
  };
}
