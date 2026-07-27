import { useStockAlerts, useReorderStock } from "@/lib/queries";

/**
 * StockAlertsTile — Phase 4.5 Chunk 2 Sprint D Task 21.
 *
 * Self-contained dashboard tile that surfaces SKUs whose effective stock
 * `(qty - reserved)` has dropped below their configured `low_threshold`.
 * Reads from `GET /api/operation/stock-alerts` (T18 route → RPC
 * `operation_stock_alerts()` in migration 0054).
 *
 * Layout / styling mirrors the side cards on `OperationDashboard`
 * (`OpenPOsCard`, `LowStockCard`): white surface, hairline base-200 border,
 * 18px gutter, font-display title + small base-500 hint, then a compact list
 * of rows separated by base-100 dividers.
 *
 * Per the master plan §Sprint D Task 21:
 *   - tile shows the alert count + the top-3 alert SKUs
 *   - clicking "View alerts" jumps to the warehouse tab with the low-stock
 *     alert filter pre-applied
 *
 * Routing (2026-06-05 fix — closes `phase-4.5-chunk-2-alerts-tab-routing`):
 * `OperationApp` is tab-state-driven (only `/operation/procurement` + `/orders`
 * are URL-driven), so this tile must NOT write a URL. The earlier
 * `navigate("/operation/warehouse?alert=true")` was a no-op nothing read back —
 * `OperationWarehouse` never consumed `?alert=true`, and the bare
 * `/operation/warehouse` path didn't survive a refresh (the shell boots to the
 * dashboard tab). Instead the parent threads `onJumpToWarehouse`, wired to
 * `goWarehouse({ alert: true })`, which flips the tab AND seeds the warehouse
 * page's "Alerts" view via the same prefill idiom the shell already uses for
 * movements. Kept optional — when omitted (tests in isolation, or future
 * callers outside `OperationApp`) clicking is a safe no-op.
 *
 * Empty / loading / error states all render in-place rather than hiding the
 * tile — the dashboard grid expects a fixed slot, and a "No alerts" badge
 * is the right reassurance signal at zero. The proto convention for empty
 * side cards (`LowStockCard` line 46-47) is the same.
 */
/**
 * K1 ADDITION (2026-07-27) — the tile also raises `Reorder stock`.
 *
 * The threshold source above (`stock_balances.low_threshold`, 0054) has never
 * had a single row configured and no screen to configure one, so this tile has
 * shown "No alerts" since the day it shipped. K1's reorder points are the
 * thing operators actually set, so they are ADDED here (not swapped in): the
 * old rows keep working the day someone sets a threshold, and the new ones
 * lead because they carry a verb. This is the "into the ops worklist" half of
 * card K1 — without it, a low pillow is only discoverable by opening Stock.
 */
const MAX_ROWS = 3;

interface Props {
  onJumpToWarehouse?: () => void;
  /** Land on Stock → On hand, where the reorder points live. Falls back to the
   *  warehouse jump when the shell didn't wire it (tests in isolation). */
  onJumpToStock?: () => void;
}

export default function StockAlertsTile({ onJumpToWarehouse, onJumpToStock }: Props = {}) {
  const { data, isLoading, isError } = useStockAlerts();
  const reorderQ = useReorderStock();

  // Same degrade-don't-crash contract as ReorderStockCard: a Worker that
  // predates the /reorder route answers with a different shape, and the
  // shipped threshold tile must keep working around it.
  const reorderRows = Array.isArray(reorderQ.data?.rows)
    ? reorderQ.data.rows.filter((r) => r?.state === "reorder")
    : [];
  const reorderCount = Array.isArray(reorderQ.data?.rows)
    ? (reorderQ.data.alertCount ?? reorderRows.length)
    : 0;

  const handleOpen = () => {
    // Tab-state only — see the routing note above. When there is a reorder to
    // raise, the useful destination is the Stock door (that is where the point
    // is set); otherwise keep the shipped warehouse jump.
    if (reorderCount > 0 && onJumpToStock) onJumpToStock();
    else onJumpToWarehouse?.();
  };

  const alerts = data?.alerts ?? [];
  const top = alerts.slice(0, Math.max(0, MAX_ROWS - reorderRows.length));
  const topReorder = reorderRows.slice(0, MAX_ROWS);
  const count = alerts.length + reorderCount;

  // Outer wrapper kept identical to OpenPOsCard / LowStockCard so the side-card
  // grid stays visually consistent. The whole tile is clickable, but only via
  // the explicit "Open warehouse →" button — that mirrors the other side
  // cards (clicking the body alone would conflict with row-level interactions
  // we may add later).
  return (
    <div
      className="bg-white border border-base-200 rounded-md overflow-hidden"
      data-testid="stock-alerts-tile"
    >
      <header className="px-[18px] py-3.5 flex items-baseline justify-between">
        <div>
          <div className="t-h4 font-display text-base-900">
            Stock alerts
          </div>
          <div className="text-[11px] text-base-500 mt-0.5">
            {isLoading
              ? "Loading…"
              : isError
                ? "Couldn’t load alerts"
                : count === 0
                  ? "No alerts — all SKUs above threshold"
                  : reorderCount > 0
                    ? `${count} SKU${count === 1 ? "" : "s"} to reorder`
                    : `${count} SKU${count === 1 ? "" : "s"} below threshold`}
          </div>
        </div>
        <button
          type="button"
          onClick={handleOpen}
          className="btn-ghost text-[11px] py-1 px-2"
          data-testid="stock-alerts-open"
          aria-label="View alerts in warehouse"
        >
          View alerts &rarr;
        </button>
      </header>

      <div className="px-[18px] pb-3.5">
        {isLoading ? (
          <div
            className="text-[12px] text-base-500 text-center py-4"
            data-testid="stock-alerts-loading"
          >
            Loading…
          </div>
        ) : isError ? (
          <div
            className="text-[12px] text-danger text-center py-4"
            data-testid="stock-alerts-error"
          >
            Couldn’t load alerts.
          </div>
        ) : count === 0 ? (
          <div
            className="text-[12px] text-base-500 text-center py-4"
            data-testid="stock-alerts-empty"
          >
            All SKUs above threshold.
          </div>
        ) : (
          <>
            <div
              className="flex items-baseline gap-2 py-1"
              data-testid="stock-alerts-count"
            >
              <span className="font-mono text-[28px] font-semibold leading-none text-danger">
                {count}
              </span>
              <span className="text-[11px] text-base-500">
                {reorderCount > 0 ? "need ordering" : "below threshold"}
              </span>
            </div>
            {topReorder.map((row) => (
              <div
                key={`reorder-${row.sku}`}
                data-testid={`stock-alerts-reorder-${row.sku}`}
                className="grid items-center gap-3 py-2.5 border-t border-base-100"
                style={{ gridTemplateColumns: "1fr auto" }}
              >
                <div className="min-w-0">
                  <div className="text-[12px] text-base-900 truncate">
                    {row.sku}
                  </div>
                  <div className="text-[11px] text-base-500 truncate">
                    Reorder stock · {row.onHand} left
                    {row.incoming > 0 ? `, ${row.incoming} coming` : ""}
                  </div>
                </div>
                <span className="font-mono text-[11px] font-semibold text-danger whitespace-nowrap">
                  {row.reorderPoint} point
                </span>
              </div>
            ))}
            {top.map((row) => (
              <div
                key={`${row.sku}-${row.warehouse_id}`}
                data-testid={`stock-alerts-row-${row.sku}`}
                className="grid items-center gap-3 py-2.5 border-t border-base-100"
                style={{ gridTemplateColumns: "1fr auto" }}
              >
                <div className="min-w-0">
                  <div className="text-[12px] text-base-900 truncate">
                    {row.sku}
                  </div>
                  <div className="text-[11px] text-base-500 truncate">
                    @ {row.warehouse_id.slice(0, 8)}
                  </div>
                </div>
                <span className="font-mono text-[11px] font-semibold text-danger whitespace-nowrap">
                  {row.shortage > 0 ? `-${row.shortage}` : row.shortage} unit
                  {Math.abs(row.shortage) === 1 ? "" : "s"}
                </span>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
