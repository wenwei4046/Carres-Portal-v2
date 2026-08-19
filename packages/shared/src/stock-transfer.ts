/**
 * WAREHOUSE TRANSFERS — the ONE state arithmetic (0365).
 *
 * Warehouse Blueprint item 8 (owner-approved 2026-08-14), slice 1:
 *
 *   Requested  →  In transit  →  Received      (+ Cancelled, pre-collection)
 *
 * The owner's words: the state "不是一个可随意编辑的 dropdown，而是由已完成事件
 * 推导" — it is DERIVED from the events that actually happened, never stored as
 * an editable column. That is Architecture Law D: one derived fact, ONE
 * arithmetic. The database stores observations (`ops_stock_transfer_events`);
 * this function is the only place that turns them into a state, and the
 * register, the API and the tests all read this copy.
 *
 * PURE — no I/O, no clock.
 *
 * The blueprint's `Preparing` / `Ready for collection` rungs need Positions,
 * and `Partially received` / `Exception` need the partial-receipt flow; both
 * are later slices and neither is faked here.
 */

// ── The events a transfer can carry ──────────────────────────────────────────

export const STOCK_TRANSFER_EVENT_KINDS = [
  "requested",
  "collected",
  "arrived",
  "cancelled",
] as const;

export type StockTransferEventKind = (typeof STOCK_TRANSFER_EVENT_KINDS)[number];

export interface StockTransferEventFact {
  kind: StockTransferEventKind;
}

// ── The states those events derive ───────────────────────────────────────────

export type StockTransferState =
  | "requested"
  | "in_transit"
  | "received"
  | "cancelled";

/** The pill words. COPY-STANDARD owns them; this is where they live once. */
export const STOCK_TRANSFER_STATE_LABEL: Record<StockTransferState, string> = {
  requested: "Requested",
  in_transit: "In transit",
  received: "Received",
  cancelled: "Cancelled",
};

/**
 * The state of one transfer, from its events alone.
 *
 * Order matters and encodes the law:
 *   · `arrived` wins — goods that landed are Received whatever else was logged.
 *   · `collected` without `arrived` is In transit. **Collection alone never
 *     derives Received** — the two facts are separate events precisely so that
 *     one confirmation cannot pretend the goods both left and arrived.
 *   · `cancelled` only reaches the screen when nothing was ever collected; the
 *     database refuses a cancel after collection, so this is belt and braces
 *     rather than a second opinion.
 */
export function stockTransferStateOf(
  events: ReadonlyArray<StockTransferEventFact>,
): StockTransferState {
  const has = (kind: StockTransferEventKind) => events.some((e) => e.kind === kind);

  if (has("arrived")) return "received";
  if (has("collected")) return "in_transit";
  if (has("cancelled")) return "cancelled";
  return "requested";
}

export function stockTransferStateLabel(
  events: ReadonlyArray<StockTransferEventFact>,
): string {
  return STOCK_TRANSFER_STATE_LABEL[stockTransferStateOf(events)];
}

// ── Why goods move ───────────────────────────────────────────────────────────

/**
 * The business reasons a transfer exists, closed. A purpose nobody can name is
 * a transfer nobody can audit six months later — and `sales_order` is load
 * bearing, not decorative: it is the ONLY purpose that may take a reserved
 * unit, and only for that unit's own order.
 */
export const STOCK_TRANSFER_PURPOSES = [
  { key: "sales_order", label: "For a sales order" },
  { key: "display", label: "For display" },
  { key: "rebalance", label: "Move stock between sites" },
  { key: "return_to_warehouse", label: "Back to the warehouse" },
] as const;

export type StockTransferPurpose = (typeof STOCK_TRANSFER_PURPOSES)[number]["key"];

export const STOCK_TRANSFER_PURPOSE_KEYS = STOCK_TRANSFER_PURPOSES.map(
  (p) => p.key,
) as unknown as readonly StockTransferPurpose[];

export function stockTransferPurposeLabel(
  purpose: string | null | undefined,
): string {
  return (
    STOCK_TRANSFER_PURPOSES.find((p) => p.key === purpose)?.label ?? purpose ?? "—"
  );
}

// ── In transit is a unit status, and it has exactly one meaning ──────────────

/**
 * `ops_stock_items.status` while the goods are between two sites.
 *
 * `transferred` sat in the vocabulary since 0137 with NO writer anywhere and
 * zero rows; 0365 is its first writer and fixes its meaning: custody has left
 * the origin and the destination has not yet received. Minting a second
 * literal beside it would give one fact two words (Architecture Law C).
 *
 * Everything that decides availability already excludes it, which is why this
 * card patches no consumer: `SELLABLE_STOCK_STATUSES` is `['free']`, every
 * pick filters `status='free'`, and `ops_rollup_stock_balances` counts only
 * free + reserved. A unit in transit is therefore absent from every
 * availability figure in the system — asserted in the tests, not assumed.
 */
export const IN_TRANSIT_STOCK_STATUS = "transferred" as const;

export function isInTransitStockStatus(
  status: string | null | undefined,
): boolean {
  return status === IN_TRANSIT_STOCK_STATUS;
}
