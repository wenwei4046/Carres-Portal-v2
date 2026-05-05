import type { LogisticsOrderListRow } from "@/lib/queries";
import { cjkClassName } from "@/lib/cjk";

/**
 * OrderCard — kanban tile for the LogisticsOrders pipeline view.
 *
 * Mirrors `reference/proto/logistics-orders.jsx` lines 197-252 (the inner
 * card inside `OrderColumn`):
 *   - White card, 1px base-100 border, 4px radius, 6px bottom margin
 *   - Hover: border swaps to terracotta
 *   - Selected (awaiting_logistics_action + checkbox checked): peach signature-50 fill
 *     + terracotta border
 *   - Top row: `#DL` (mono 11px bold) and placed-at date (mono 10px base-500)
 *   - Customer name (CJK detect, 13px)
 *   - Channel: showroom badge (uppercase, slate outline) + dealer/showroom name
 *   - Delivery date or "Date TBD"
 *   - LP pill (only if any thread has a customer-leg LP assigned)
 *   - Bottom row: total (we omit — list endpoint doesn't return total) +
 *     bucket-action hint (terracotta arrow)
 *
 * Phase 4.5 Chunk 2 (T9) — LP pill source pivoted from order-level
 * `delivery_partner_id` to `order_supplier_threads[].delivery_partner_id` per
 * design spec §CQ1 option (b). Multi-supplier orders may have N threads with
 * different partners; we summarise:
 *   - 0 assignments → omit pill (unassigned state)
 *   - 1 distinct partner across all assigned threads → pill = partner short id
 *   - ≥2 distinct partners → pill = "Multi-LP" hint (drawer surfaces detail)
 * The order-level `delivery_partner_id` is still populated for legacy callers
 * (print-DO, etc.) but no longer drives the kanban presentation.
 *
 * Selectable: only awaiting_logistics_action orders surface a checkbox. The whole card
 * is the click target for opening the drawer; the checkbox region uses
 * stopPropagation so toggling doesn't accidentally open the drawer.
 */

/** Phase 4.5 Chunk 2 (T9) — derive a kanban-friendly LP summary from the
 *  embedded threads. Returns `null` when no thread has an assigned partner so
 *  the caller can omit the pill entirely. When threads disagree, returns a
 *  "Multi-LP" sentinel so the user knows to open the drawer for detail. */
type LpSummary =
  | { kind: "none" }
  | { kind: "single"; partnerId: string }
  | { kind: "multi"; count: number };

function summariseThreadLps(
  threads: LogisticsOrderListRow["order_supplier_threads"],
): LpSummary {
  if (!threads || threads.length === 0) return { kind: "none" };
  const assigned = threads.filter((t) => t.delivery_partner_id !== null);
  if (assigned.length === 0) return { kind: "none" };
  const distinct = new Set(
    assigned.map((t) => t.delivery_partner_id as string),
  );
  if (distinct.size === 1) {
    return { kind: "single", partnerId: distinct.values().next().value as string };
  }
  return { kind: "multi", count: distinct.size };
}

interface Props {
  order: LogisticsOrderListRow;
  /** When true, render the leading checkbox column (awaiting_logistics_action only). */
  selectable: boolean;
  selected: boolean;
  onToggleSelect: () => void;
  onOpen: () => void;
  /** Optional CTA hint (e.g. "Assign delivery →") shown bottom-right. */
  actionHint?: string;
  /** Pipeline v2 expand-to-zoom: when another column is expanded this column
   *  shrinks to ~10% width, so we strip the card down to just `#DL` + customer
   *  name to stay scannable. */
  compact?: boolean;
}

export default function OrderCard({
  order,
  selectable,
  selected,
  onToggleSelect,
  onOpen,
  actionHint,
  compact = false,
}: Props) {
  const customer = order.customer_name;
  const dealerName = order.dealers?.name ?? "—";
  const isShowroom = order.outlet_id !== null;
  const dealerLabel = isShowroom
    ? dealerName.replace(/^Showroom · /, "")
    : dealerName;

  const dateLabel = order.delivery_date
    ? `→ ${order.delivery_date}`
    : "Date TBD";

  const placedShort = order.placed_at?.slice(0, 10) ?? "";

  // Phase 4.5 Chunk 2 (T9) — LP pill driven by thread.delivery_partner_id.
  const lpSummary = summariseThreadLps(order.order_supplier_threads);

  const containerCls = [
    "flex w-full box-border cursor-pointer rounded-[4px] mb-1.5 last:mb-0 transition-colors",
    selected
      ? "bg-signature-50 border border-primary"
      : "bg-white border border-base-100 hover:border-primary",
  ].join(" ");

  return (
    <div
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={`Order #${order.dl} for ${customer}`}
      className={containerCls}
      data-testid={`order-card-${order.dl}`}
    >
      {selectable && (
        <div
          // Wrapper handles the click; stop propagation so the row click
          // doesn't fire and re-trigger card open.
          onClick={(e) => {
            e.stopPropagation();
            onToggleSelect();
          }}
          onKeyDown={(e) => {
            if (e.key === " ") {
              e.preventDefault();
              e.stopPropagation();
              onToggleSelect();
            }
          }}
          className="flex items-start pt-3 pl-2.5 cursor-pointer"
          role="checkbox"
          aria-checked={selected}
          tabIndex={-1}
          aria-label={selected ? "Deselect order" : "Select order to combine PO"}
        >
          <input
            type="checkbox"
            checked={selected}
            // onChange is the canonical React handler for checkbox toggles
            // (covers click + keyboard space). The wrapper still handles
            // clicks on its padding area for a larger hit target.
            onChange={onToggleSelect}
            // Prevent propagation so a direct native-checkbox click doesn't
            // bubble to the outer card and open the drawer.
            onClick={(e) => e.stopPropagation()}
            className="m-0 cursor-pointer accent-primary"
            tabIndex={-1}
          />
        </div>
      )}
      <div className="flex-1 min-w-0 px-3 py-2.5">
        <div className="flex items-baseline justify-between">
          <span className="font-mono text-[11px] font-semibold text-base-900">
            #{order.dl}
          </span>
          {!compact && (
            <span className="font-mono text-[10px] text-base-500">
              {placedShort}
            </span>
          )}
        </div>
        <div
          className={`${cjkClassName(customer)} text-[13px] font-medium text-base-900 mt-0.5 ${compact ? "truncate" : ""}`}
        >
          {customer}
        </div>
        {!compact && (
          <>
            <div className="flex items-center gap-1.5 mt-0.5">
              {isShowroom && (
                <span
                  className="inline-block text-[9px] font-bold uppercase tracking-[0.1em] leading-none py-[2px] px-[5px] border rounded-[2px] flex-shrink-0"
                  style={{ color: "#3c5a78", borderColor: "#3c5a78" }}
                >
                  Showroom
                </span>
              )}
              <span className="text-[11px] text-base-600 overflow-hidden text-ellipsis whitespace-nowrap min-w-0">
                {dealerLabel}
              </span>
            </div>
            <div className="text-[11px] text-base-500 mt-0.5">{dateLabel}</div>
            {/* Phase 4.5 Chunk 2 (T9) — LP pill from thread.delivery_partner_id.
                The list endpoint returns the partner uuid only (no name join);
                we surface a short id slug + open the drawer for full detail.
                Multi-LP threads collapse to "Multi-LP · N" so the chip stays
                scannable at kanban density. */}
            {lpSummary.kind !== "none" && (
              <div
                className="flex items-center gap-1 mt-1"
                data-testid="order-card-lp-pill"
              >
                <span className="text-[9px] uppercase tracking-[0.1em] font-semibold text-base-500">
                  via
                </span>
                {lpSummary.kind === "single" ? (
                  <span
                    className="font-mono text-[10px] text-base-700"
                    data-testid="order-card-lp-pill-partner"
                  >
                    LP-{lpSummary.partnerId.slice(0, 8)}
                  </span>
                ) : (
                  <span
                    className="font-mono text-[10px] text-warning"
                    data-testid="order-card-lp-pill-multi"
                  >
                    Multi-LP &middot; {lpSummary.count}
                  </span>
                )}
              </div>
            )}
            <div className="flex items-baseline justify-end mt-1.5">
              {actionHint && (
                <span className="text-[10px] text-primary font-semibold">
                  {actionHint} &rarr;
                </span>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
