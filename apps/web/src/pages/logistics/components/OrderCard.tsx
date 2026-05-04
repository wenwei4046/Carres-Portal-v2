import type { LogisticsOrderListRow } from "@/lib/queries";
import { cjkClassName } from "@/lib/cjk";

/**
 * OrderCard — kanban tile for the LogisticsOrders pipeline view.
 *
 * Mirrors `reference/proto/logistics-orders.jsx` lines 197-252 (the inner
 * card inside `OrderColumn`):
 *   - White card, 1px base-100 border, 4px radius, 6px bottom margin
 *   - Hover: border swaps to terracotta
 *   - Selected (awaiting_stock + checkbox checked): peach signature-50 fill
 *     + terracotta border
 *   - Top row: `#DL` (mono 11px bold) and placed-at date (mono 10px base-500)
 *   - Customer name (CJK detect, 13px)
 *   - Channel: showroom badge (uppercase, slate outline) + dealer/showroom name
 *   - Delivery date or "Date TBD"
 *   - Partner via line (only if assigned)
 *   - Bottom row: total (we omit — list endpoint doesn't return total) +
 *     bucket-action hint (terracotta arrow)
 *
 * The proto reads delivery_partner from `state.deliveryPartners`. v2 list
 * endpoint returns `delivery_partner_id` only — partner name shows up only on
 * the drawer fetch; for the kanban we just show "via partner assigned" if the
 * id is set. (Could enrich the list later — out of scope for M5.2.)
 *
 * Selectable: only awaiting_stock orders surface a checkbox. The whole card
 * is the click target for opening the drawer; the checkbox region uses
 * stopPropagation so toggling doesn't accidentally open the drawer.
 */
interface Props {
  order: LogisticsOrderListRow;
  /** When true, render the leading checkbox column (awaiting_stock only). */
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
            {/* Partner name needs the drawer-fetch join to surface here — list
                endpoint returns id only. Keep this line off until the M5.0
                phase-4-detail-partner-name-join TODO lands. */}
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
