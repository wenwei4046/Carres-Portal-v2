import type { LogisticsLowStockRow } from "@/lib/queries";

/**
 * Low Stock side card — SKUs with `available <= 1` across all warehouses.
 *
 * Mirrors `reference/proto/logistics-dashboard.jsx` `StackedLayout` rows
 * 109-118: white card, hairline borders, per-row 1fr/auto grid:
 *   - Left: SKU name (proto uses stock dictionary lookup; we show the SKU
 *     code itself until M5 task 3 wires the SKU ↔ name map)
 *   - Right: "{N} units" in mono, colored destructive (proto `--danger`) when
 *     available is 0, warning (proto `--warning`) when available is 1
 *
 * Empty state mirrors proto: "All SKUs healthy."
 */
const MAX_ROWS = 5;

interface Props {
  lowStock: LogisticsLowStockRow[];
  onViewAll: () => void;
}

export default function LowStockCard({ lowStock, onViewAll }: Props) {
  const rows = lowStock.slice(0, MAX_ROWS);

  return (
    <div className="bg-white border border-base-200 rounded-md overflow-hidden">
      <header className="px-[18px] py-3.5 flex items-baseline justify-between">
        <div>
          <div className="font-display text-[15px] font-semibold text-base-900">
            Low stock
          </div>
          <div className="text-[11px] text-base-500 mt-0.5">
            &le;1 unit across all warehouses
          </div>
        </div>
        <button
          type="button"
          onClick={onViewAll}
          className="btn-ghost text-[11px] py-1 px-2"
        >
          Open warehouse &rarr;
        </button>
      </header>
      <div className="px-[18px] pb-3.5">
        {rows.length === 0 ? (
          <div className="text-[12px] text-base-500 text-center py-4">
            All SKUs healthy.
          </div>
        ) : (
          rows.map((row) => {
            const available = row.available;
            // Proto: 0 → --danger (red), 1 → --warning (honey).
            const tone =
              available === 0 ? "text-destructive" : "text-warning";
            return (
              <div
                key={`${row.sku}-${row.warehouse_id}`}
                className="grid items-center gap-3 py-2.5 border-t border-base-100"
                style={{ gridTemplateColumns: "1fr auto" }}
              >
                <div className="text-[12px] text-base-900 truncate">
                  {row.sku}
                </div>
                <span
                  className={`font-mono text-[11px] font-semibold ${tone}`}
                >
                  {available} units
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
