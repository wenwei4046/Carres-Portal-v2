import type { operationOpenPoRow } from "@/lib/queries";

/**
 * Open Purchase Orders side card — top-N pending POs.
 *
 * Mirrors `reference/proto/operation-dashboard.jsx` `SideCard` + the inner
 * iteration on lines 89-107. We render at most `MAX_ROWS` POs; the dashboard
 * RPC already caps the open_pos array at 4 server-side, so the slice here is
 * a defensive belt-and-braces.
 *
 * Each row is grid-laid `auto 1fr auto`:
 *   - PO# (mono, 12px, semibold)
 *   - Middle: lines summary (top SKU + N more) on row 1, supplier · ETA · Σ on row 2
 *   - Right: tiny "OPEN" mono uppercase badge in warning color
 *
 * The proto reads supplier name + SKU name from in-memory state. We don't have
 * those joined here in M5 task 1 (the RPC returns supplier_id only), so we
 * surface the IDs verbatim. M5 task 3 (procurement page) wires supplier+SKU
 * lookups; once that lands we can pass them in here too.
 */
const MAX_ROWS = 4;

interface Props {
  pos: operationOpenPoRow[];
  onViewAll: () => void;
}

export default function OpenPOsCard({ pos, onViewAll }: Props) {
  const rows = pos.slice(0, MAX_ROWS);
  const hint =
    pos.length === 0 ? "no shortages" : `${pos.length} with suppliers`;

  return (
    <div className="bg-white border border-base-200 rounded-md overflow-hidden">
      <header className="px-[18px] py-3.5 flex items-baseline justify-between">
        <div>
          <div className="t-h4 font-display text-base-900">
            Open purchase orders
          </div>
          <div className="text-[11px] text-base-500 mt-0.5">{hint}</div>
        </div>
        <button
          type="button"
          onClick={onViewAll}
          className="btn-ghost text-[11px] py-1 px-2"
        >
          Manage POs &rarr;
        </button>
      </header>
      <div className="px-[18px] pb-3.5">
        {rows.length === 0 ? (
          <div className="text-[12px] text-base-500 text-center py-4">
            No open POs &mdash; all stock secured.
          </div>
        ) : (
          rows.map((po) => (
            <div
              key={po.id}
              className="grid items-center gap-3 py-2.5 border-t border-base-100"
              style={{ gridTemplateColumns: "auto 1fr auto" }}
            >
              <span className="font-mono text-[12px] font-semibold text-base-900">
                {po.id.slice(0, 8)}
              </span>
              <div className="min-w-0">
                <div className="text-[12px] text-base-900 truncate">
                  {po.so ? `For #${po.so}` : "Multi-order PO"}
                </div>
                <div className="text-[11px] text-base-500 truncate">
                  ETA {po.eta_date ?? "—"} · {po.sup_status.replace(/_/g, " ")}
                </div>
              </div>
              <span className="font-mono text-[10px] uppercase tracking-[0.1em] font-semibold text-warning">
                OPEN
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
