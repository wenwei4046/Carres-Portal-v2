import { useNavigate } from "react-router-dom";
import { useStockAlerts } from "@/lib/queries";

/**
 * StockAlertsTile — Phase 4.5 Chunk 2 Sprint D Task 21.
 *
 * Self-contained dashboard tile that surfaces SKUs whose effective stock
 * `(qty - reserved)` has dropped below their configured `low_threshold`.
 * Reads from `GET /api/logistics/stock-alerts` (T18 route → RPC
 * `logistics_stock_alerts()` in migration 0054).
 *
 * Layout / styling mirrors the side cards on `LogisticsDashboard`
 * (`OpenPOsCard`, `LowStockCard`): white surface, hairline base-200 border,
 * 18px gutter, font-display title + small base-500 hint, then a compact list
 * of rows separated by base-100 dividers.
 *
 * Per the master plan §Sprint D Task 21:
 *   - tile shows the alert count + the top-3 alert SKUs
 *   - clicking the tile navigates to `/logistics/warehouse?alert=true`
 *
 * T42-C3 (codex review fix): `LogisticsApp` is tab-state-driven, so a bare
 * `navigate(...)` only changes the URL but leaves the dashboard tab selected.
 * The `onJumpToWarehouse` prop lets the parent flip its `useState` tab in
 * lockstep so the warehouse view actually mounts. Kept optional for
 * backward compatibility — when omitted (e.g. tests rendering the tile in
 * isolation, or future callers outside `LogisticsApp`), only the URL
 * navigation runs and the test assertions still hold.
 *
 * Empty / loading / error states all render in-place rather than hiding the
 * tile — the dashboard grid expects a fixed slot, and a "No alerts" badge
 * is the right reassurance signal at zero. The proto convention for empty
 * side cards (`LowStockCard` line 46-47) is the same.
 */
const MAX_ROWS = 3;

interface Props {
  onJumpToWarehouse?: () => void;
}

export default function StockAlertsTile({ onJumpToWarehouse }: Props = {}) {
  const navigate = useNavigate();
  const { data, isLoading, isError } = useStockAlerts();

  const handleOpen = () => {
    // Flip the parent's tab state FIRST (synchronous setState) so the
    // warehouse slot mounts on the same React commit that consumes the new
    // URL. Reversing the order would race the conditional render in
    // `LogisticsApp` against the next event-loop tick.
    onJumpToWarehouse?.();
    navigate("/logistics/warehouse?alert=true");
  };

  const alerts = data?.alerts ?? [];
  const top = alerts.slice(0, MAX_ROWS);
  const count = alerts.length;

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
          <div className="font-display text-[15px] font-semibold text-base-900">
            Stock alerts
          </div>
          <div className="text-[11px] text-base-500 mt-0.5">
            {isLoading
              ? "Loading…"
              : isError
                ? "Couldn’t load alerts"
                : count === 0
                  ? "No alerts — all SKUs above threshold"
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
                below threshold
              </span>
            </div>
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
