/**
 * Delivery Reason Library v1 (T4, delivery execution queue — Jess 2026-07-26).
 *
 * Staff pick facts, never write essays: every delay/reschedule reason is a
 * fixed entry with a stable `key` (what gets STORED — labels may be reworded
 * later without re-tagging history), a human `label` (verb-free fact, plain
 * words), a `category` (lets the dashboard later say "42% of delays are
 * customer-side") and a hidden `responsibility` — never shown to staff. The
 * responsibility split is what later lets the storage-fee rule say "customer
 * delay starts the storage clock, Carres delay never charges" without a second
 * tagging pass over history.
 *
 * Responsibility follows the category by LAW (asserted in tests):
 *   customer → customer · payment → customer (waiting for the customer's money
 *   is customer-side delay — it starts the storage clock) · stock → carres ·
 *   logistic → carres · site → external.
 *
 * First consumer: the one-time postpone/reschedule recorder (migration 0196 —
 * `ops_order_control.extension_reason` stores the KEY; legacy rows hold the old
 * free-ish labels "Renovation"/"Traveling"/"Others" and display as-is via
 * `deliveryReasonLabel`).
 */

export type DeliveryReasonCategory =
  | "customer"
  | "stock"
  | "payment"
  | "logistic"
  | "site";

export type DeliveryResponsibility = "customer" | "carres" | "external";

export interface DeliveryReason {
  key: string;
  label: string;
  category: DeliveryReasonCategory;
  /** Hidden — never rendered for staff; feeds dashboards + the storage-fee rule. */
  responsibility: DeliveryResponsibility;
}

export const DELIVERY_REASONS = [
  // customer
  { key: "customer_reschedule", label: "Customer requested reschedule", category: "customer", responsibility: "customer" },
  { key: "customer_renovation", label: "Customer renovation", category: "customer", responsibility: "customer" },
  { key: "customer_hold", label: "Customer requested hold", category: "customer", responsibility: "customer" },
  { key: "customer_unreachable", label: "Customer unreachable", category: "customer", responsibility: "customer" },
  // stock
  { key: "stock_not_ready", label: "Stock not ready", category: "stock", responsibility: "carres" },
  // payment
  { key: "waiting_balance_payment", label: "Waiting balance payment", category: "payment", responsibility: "customer" },
  { key: "waiting_storage_fee", label: "Waiting storage fee", category: "payment", responsibility: "customer" },
  // customer — at the door (SO V2 Card 5, 0344: the delivery-attempt exception
  // reads THIS library; a second word list is the defect it exists to prevent)
  { key: "customer_rejected_goods", label: "Customer rejected the goods", category: "customer", responsibility: "customer" },
  // logistic
  { key: "driver_unavailable", label: "Driver unavailable", category: "logistic", responsibility: "carres" },
  { key: "vehicle_breakdown", label: "Vehicle breakdown", category: "logistic", responsibility: "carres" },
  { key: "logistic_capacity_full", label: "Logistic capacity full", category: "logistic", responsibility: "carres" },
  { key: "delivery_failed", label: "Delivery failed", category: "logistic", responsibility: "carres" },
  // site
  { key: "condo_approval_required", label: "Condo approval required", category: "site", responsibility: "external" },
  { key: "lift_booking_required", label: "Lift booking required", category: "site", responsibility: "external" },
  // the Delivery Order blueprint's remaining exception reasons (owner-approved
  // card, 2026-08-16) — the DO register's `Delivery exception` carries ONE of
  // these, from THIS library, never a second word list. Responsibility still
  // follows the category by the law above.
  { key: "goods_damaged", label: "Goods damaged", category: "stock", responsibility: "carres" },
  { key: "wrong_goods", label: "Wrong goods", category: "stock", responsibility: "carres" },
  { key: "photo_missing", label: "Delivery photo missing", category: "logistic", responsibility: "carres" },
  { key: "loan_not_collected", label: "Loan not collected back", category: "logistic", responsibility: "carres" },
] as const satisfies readonly DeliveryReason[];

export type DeliveryReasonKey = (typeof DELIVERY_REASONS)[number]["key"];

/** Tuple of keys for zod enums (z.enum needs a non-empty tuple). */
export const DELIVERY_REASON_KEYS = DELIVERY_REASONS.map((r) => r.key) as [
  DeliveryReasonKey,
  ...DeliveryReasonKey[],
];

/** Visible group headers for the picker (the category itself is a grouping
 *  aid, not a question staff answer). */
export const DELIVERY_REASON_CATEGORY_LABEL: Record<DeliveryReasonCategory, string> = {
  customer: "Customer",
  stock: "Stock",
  payment: "Payment",
  logistic: "Logistic",
  site: "Site",
};

export function deliveryReasonByKey(key: string | null | undefined): DeliveryReason | null {
  if (!key) return null;
  return DELIVERY_REASONS.find((r) => r.key === key) ?? null;
}

/** Stored value → display label. Legacy rows (pre-T4: "Renovation",
 *  "Traveling", "Others") are not keys — they display as-is. */
export function deliveryReasonLabel(value: string | null | undefined): string {
  if (!value) return "—";
  return deliveryReasonByKey(value)?.label ?? value;
}
