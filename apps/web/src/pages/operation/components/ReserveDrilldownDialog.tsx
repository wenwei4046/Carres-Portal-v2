import { toast } from "sonner";
import { useReservedDrilldown } from "@/lib/queries";
import { Modal } from "./Modal";
import StageChip from "./StageChip";

/**
 * ReserveDrilldownDialog — Phase 4 Pipeline v2 (C4) drill-down on a single
 * (warehouse, sku) pair to surface which orders are holding the
 * `stock_balances.reserved` count.
 *
 * Triggered from `OperationWarehouse`'s new "Reserved" tab when the user
 * clicks a SKU row. The dialog calls
 * `GET /api/operation/warehouse/reserved-drilldown?warehouseId=…&sku=…`
 * and renders one row per order, with the order's #SO, customer name, stage
 * chip, and the reserved qty for that SKU.
 *
 * Why no deep-link: `OperationApp` uses tab-state, not URL params, so there's
 * no `?open=` URL pattern to navigate to. Instead, each order row exposes a
 * "Copy SO" button that copies `#SO{n}` to the clipboard — the user can then
 * search for it on the orders tab. Keeps the wiring simple and avoids
 * shoehorning a router into the operation shell just for this drill-down.
 *
 * Layout (proto-style — no proto counterpart, plan-driven):
 *   - Header: "Reserved orders · {skuLabel} @ {warehouseName}"
 *   - Summary band: total qty + count of orders
 *   - List: one row per order — #SO · customer · stage chip · ×qty · Copy
 *   - Empty state: "No orders are currently holding reserve for this SKU"
 *   - Loading state: skeleton rows
 *   - Error state: red banner with retry
 */
interface Props {
  /** UUID of the warehouse the user clicked into. */
  warehouseId: string;
  /** Raw SKU code (e.g. `mattress:carres-cloud:King`). */
  sku: string;
  /** Friendly display name for the warehouse (e.g. "KL Warehouse"). */
  warehouseName: string;
  /** Friendly display name for the SKU (e.g. "Carres Cloud · King").
   *  Falls back to the raw SKU when the catalog hasn't loaded a friendly form. */
  skuLabel?: string;
  onClose: () => void;
}

export default function ReserveDrilldownDialog({
  warehouseId,
  sku,
  warehouseName,
  skuLabel,
  onClose,
}: Props) {
  const drilldown = useReservedDrilldown(warehouseId, sku);
  const data = drilldown.data;
  const orders = data?.orders ?? [];

  async function copyDl(so: number) {
    const text = `#SO${so}`;
    try {
      // navigator.clipboard is async + Promise-returning; toast on resolve.
      await navigator.clipboard.writeText(text);
      toast.success(`Copied ${text}`);
    } catch {
      toast.error("Couldn't copy — clipboard blocked");
    }
  }

  const friendlySku = skuLabel ?? sku;

  return (
    <Modal title={`Reserved orders · ${friendlySku}`} onClose={onClose} size="lg">
      <div className="text-meta text-base-600 mb-3.5 font-body">
        Orders currently holding reserved stock at{" "}
        <strong>{warehouseName}</strong>. Reserve releases automatically on DO
        upload or order abandon.
      </div>

      {drilldown.isLoading ? (
        <div data-testid="reserve-drilldown-loading">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-12 bg-base-50 border border-base-100 rounded-[4px] mb-1.5 animate-pulse"
            />
          ))}
        </div>
      ) : drilldown.isError ? (
        <div
          className="rounded-[4px] bg-destructive/10 border border-destructive/30 p-4 text-body"
          data-testid="reserve-drilldown-error"
        >
          <div className="text-destructive font-semibold mb-2">
            Couldn&rsquo;t load drill-down
          </div>
          <div className="text-meta text-base-700 mb-3">
            {(drilldown.error as Error | undefined)?.message ?? "Unknown error"}
          </div>
          <button
            type="button"
            onClick={() => void drilldown.refetch()}
            className="btn-secondary text-label py-1.5 px-3"
          >
            Retry
          </button>
        </div>
      ) : (
        <>
          {/* Summary band */}
          <div
            className="card mb-3.5 px-3.5 py-2.5"
            style={{ background: "var(--base-50)" }}
            data-testid="reserve-drilldown-summary"
          >
            <div className="flex justify-between items-center gap-4 flex-wrap">
              <div className="font-body text-meta">
                <strong>{friendlySku}</strong>
                {skuLabel ? (
                  <span className="font-mono text-label text-base-500 ml-1.5">
                    {sku}
                  </span>
                ) : null}
                <span className="text-base-500"> @ {warehouseName}</span>
              </div>
              <div className="font-mono text-label text-base-600">
                <strong>{data?.total ?? 0}</strong> reserved across{" "}
                <strong>{orders.length}</strong> order
                {orders.length === 1 ? "" : "s"}
              </div>
            </div>
          </div>

          {orders.length === 0 ? (
            <div
              className="p-9 text-center text-base-500 text-body border border-base-100 rounded-[4px]"
              data-testid="reserve-drilldown-empty"
            >
              No orders are currently holding reserve for this SKU.
            </div>
          ) : (
            <div className="card p-0" data-testid="reserve-drilldown-list">
              <div
                className="grid items-center gap-3 px-[14px] py-2 bg-base-50 border-b border-base-200"
                style={{
                  gridTemplateColumns: "100px minmax(0,1fr) 150px 90px 90px",
                }}
              >
                <div className="label">SO</div>
                <div className="label">Customer</div>
                <div className="label">Stage</div>
                <div className="label text-right">Reserved</div>
                <div className="label text-right" />
              </div>
              {orders.map((o) => (
                <div
                  key={o.id}
                  data-testid={`reserve-drilldown-row-${o.id}`}
                  className="grid items-center gap-3 px-[14px] py-2.5 border-t border-base-100"
                  style={{
                    gridTemplateColumns: "100px minmax(0,1fr) 150px 90px 90px",
                  }}
                >
                  <div className="font-mono text-meta font-semibold">
                    #SO{o.so}
                  </div>
                  <div className="font-body text-body truncate">
                    {o.customerName}
                  </div>
                  <div>
                    <StageChip stage={o.operationStage} />
                  </div>
                  <div className="font-mono text-body text-right font-semibold">
                    ×{o.reservedQty}
                  </div>
                  <div className="text-right">
                    <button
                      type="button"
                      onClick={() => void copyDl(o.so)}
                      className="btn-ghost text-label py-1 px-2"
                      data-testid={`reserve-drilldown-copy-${o.id}`}
                    >
                      Copy SO
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Footer with single Close button — no destructive primary action. */}
      <div className="flex justify-end gap-2 mt-4">
        <button type="button" onClick={onClose} className="btn-secondary text-meta">
          Close
        </button>
      </div>
    </Modal>
  );
}
