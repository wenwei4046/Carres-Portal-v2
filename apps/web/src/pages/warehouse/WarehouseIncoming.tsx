import { useState } from "react";
import { poReceivingProgress } from "@carres/shared";
import { useWarehouseIncoming } from "@/lib/queries";
import { fmtDate } from "@/lib/fmt-date";
import PageHeader from "@/components/PageHeader";
import WarehouseCountModal from "./WarehouseCountModal";

/**
 * WarehouseIncoming — R6: what is coming to THIS warehouse, and the form to
 * count it.
 *
 * Scope is a server fact: `warehouse_incoming_pos` returns only PO lines whose
 * governed Deliver To belongs to the caller's warehouse. Client filtering never
 * decides access and editing a URL cannot expose another destination.
 *
 * A PO/destination scope whose count is waiting for Carres shows that state;
 * Draft and Returned reopen the exact persistent Receiving Session.
 */
export default function WarehouseIncoming() {
  const [countScopeId, setCountScopeId] = useState<string | null>(null);
  const { data, isLoading, isError, error, refetch } = useWarehouseIncoming();

  const pos = data?.pos ?? [];
  const countPo = countScopeId
    ? (pos.find((p) => p.scope_id === countScopeId) ?? null)
    : null;

  if (isLoading) {
    return (
      <div className="px-9 py-8" data-testid="warehouse-incoming-skeleton">
        <div className="h-9 w-1/3 bg-base-100 rounded animate-pulse mb-6" />
        <div className="bg-white border border-base-200 rounded">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-14 border-b border-base-100 animate-pulse bg-base-50/40"
            />
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="px-9 py-8">
        <div className="rounded-md bg-destructive/10 border border-destructive/30 p-4 text-body">
          <div className="text-destructive font-semibold mb-2">
            Couldn&rsquo;t load what is coming in
          </div>
          <div className="text-meta text-base-700 mb-3">
            {(error as Error | undefined)?.message ?? "Unknown error"}
          </div>
          <button
            type="button"
            onClick={() => void refetch()}
            className="btn-secondary text-label py-1.5 px-3"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="px-9 py-8 pb-14" data-testid="warehouse-incoming">
      {/* The shared page header keeps this route inside the common ERP shell. */}
      <PageHeader
        kicker={data?.warehouse?.name ?? "Warehouse"}
        title="Incoming"
        className="mb-3"
      />
      <div className="text-body text-base-600 mb-[18px]">
        Goods on their way here. Count what the driver brings, then Carres checks
        it in.
      </div>

      <div className="bg-white border border-base-200 rounded overflow-auto">
        <table
          className="w-full border-collapse text-body [&_tbody_tr:nth-child(even)]:bg-base-100/70"
          style={{ minWidth: 760 }}
        >
          <thead className="bg-base-700 border-b-2 border-primary text-white">
            <tr>
              <Th>PO</Th>
              <Th>Factory</Th>
              <Th>Deliver To</Th>
              <Th>Items</Th>
              <Th>PO Delivery Date</Th>
              <Th>Supplier Delivery Date</Th>
              <Th> </Th>
            </tr>
          </thead>
          <tbody>
            {pos.length === 0 && (
              <tr>
                <td colSpan={7} className="p-12 text-center text-meta text-base-500">
                  Nothing is on its way here right now.
                </td>
              </tr>
            )}
            {pos.map((po) => {
              // The SAME progress rule the ops Receiving list reads, so the two
              // screens can never describe one delivery two ways.
              const progress = poReceivingProgress(
                po.lines.map((l) => ({
                  qty: l.qty,
                  received_qty: l.received_qty,
                  damaged_qty: l.damaged_qty,
                  wrong_item_qty: l.wrong_item_qty,
                })),
              );
              const waiting = po.open_receipt?.status === "submitted";
              const recoverable = po.open_receipt?.status === "draft" || po.open_receipt?.status === "returned";
              return (
                <tr
                  key={po.scope_id}
                  className="border-t border-base-100 align-top hover:bg-primary/5"
                  data-testid="warehouse-incoming-row"
                >
                  <td className="px-4 py-3 whitespace-nowrap font-mono font-semibold text-base-900">
                    {po.po_id}
                  </td>
                  <td className="px-4 py-3 text-base-800">
                    {po.supplier_name ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-base-800">{po.deliver_to.name}</td>
                  <td className="px-4 py-3 text-base-700">
                    <div className="text-meta">
                      {po.lines.length} item{po.lines.length === 1 ? "" : "s"}
                    </div>
                    {progress.pendingLabel && (
                      <div className="text-label text-base-600 mt-1">
                        {progress.pendingLabel}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-base-700">
                    {po.po_delivery_date ? (
                      fmtDate(po.po_delivery_date)
                    ) : (
                      <span className="text-base-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-base-700">
                    {po.supplier_delivery_date ? fmtDate(po.supplier_delivery_date) : <span className="text-base-400">—</span>}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-right">
                    {waiting ? (
                      <span
                        className="pill pill-warning"
                        data-testid={`warehouse-waiting-${po.po_id}`}
                      >
                        Waiting Carres check
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setCountScopeId(po.scope_id)}
                        className="btn-primary text-label py-1.5 px-3"
                        data-testid={`warehouse-count-${po.po_id}`}
                      >
                        {recoverable ? po.open_receipt?.status === "returned" ? "Recount" : "Continue count" : "Count this delivery"}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {countPo && (
        <WarehouseCountModal po={countPo} onClose={() => setCountScopeId(null)} />
      )}
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-4 py-2.5 text-label font-semibold uppercase tracking-[0.02em] text-white text-left">
      {children}
    </th>
  );
}
