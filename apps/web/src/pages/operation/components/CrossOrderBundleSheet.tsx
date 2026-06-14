/**
 * CrossOrderBundleSheet — bottom action bar that appears when one or more
 * in_production orders are checkbox-selected on the kanban. Lets operation
 * combine all the shortages into one PO.
 *
 * Mirrors `reference/proto/operation-orders.jsx` lines 78-126 (the
 * `selected.size > 0 && (...)` block):
 *   - Dark base-900 surface, white text, 4px radius, 12/16 padding
 *   - Left side: bold "{n} order(s) selected" + base-300 hint with SKU/unit
 *     summary (we only know order count up front; the SKU aggregation needs
 *     the order detail data which the kanban list doesn't carry, so we keep
 *     the hint to a simple count for M5.2 — the real combined-PO modal lands
 *     in M5.3 and will recompute aggregates from the drawer-detail fetch).
 *   - Right side: "Clear" ghost button + "Bundle into PO" primary CTA
 *
 * The plan note says: "for M5.2 just collect the selected order ids and pass
 * them to a wired-but-empty handler `onBundleClick(orderIds: string[])`. M5.3
 * will replace the handler with the real modal open."
 */
interface Props {
  selectedOrderIds: string[];
  onClear: () => void;
  /** M5.3 wires CreatePOModal here. */
  onBundleClick: (orderIds: string[]) => void;
}

export default function CrossOrderBundleSheet({
  selectedOrderIds,
  onClear,
  onBundleClick,
}: Props) {
  const count = selectedOrderIds.length;
  if (count === 0) return null;

  return (
    <div
      className="flex justify-between items-center px-4 py-3 mb-3 rounded-[4px] gap-3.5 bg-base-900 text-white"
      data-testid="cross-order-bundle-sheet"
      role="region"
      aria-label="Bulk-select action bar"
    >
      <div className="flex flex-col gap-0.5">
        <div className="text-[12px] font-semibold">
          {count} order{count === 1 ? "" : "s"} selected
        </div>
        <div className="text-[11px] text-base-300 font-body">
          Combine shortages into a single PO
        </div>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onClear}
          className="text-[12px] text-base-300 hover:text-white px-3 py-1.5 transition-colors"
        >
          Clear
        </button>
        <button
          type="button"
          onClick={() => onBundleClick(selectedOrderIds)}
          className="bg-primary text-primary-foreground hover:bg-signature-700 px-3.5 py-1.5 rounded text-[12px] font-semibold uppercase tracking-[0.06em] transition-colors"
        >
          + Create combined PO &rarr;
        </button>
      </div>
    </div>
  );
}
