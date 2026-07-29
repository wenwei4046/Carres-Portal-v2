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
 * The list is the card's first bullet, and its scope is not a filter this page
 * applies: `warehouse_incoming_pos` (0302) only ever returns POs bound for the
 * caller's own warehouse, so there is no client-side narrowing to get wrong and
 * no other warehouse's PO can be reached by editing a URL.
 *
 * A PO whose count is already waiting for Carres shows that state instead of
 * the button — one open receipt per PO is a unique index in the database, so
 * offering a second form would only produce an error the clerk cannot fix.
 */
export default function WarehouseIncoming() {
  const [countPoId, setCountPoId] = useState<string | null>(null);
  const { data, isLoading, isError, error, refetch } = useWarehouseIncoming();

  const pos = data?.pos ?? [];
  const countPo = countPoId
    ? (pos.find((p) => p.po_id === countPoId) ?? null)
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
      {/* The shared header bar (UI-KIT §A9) — nothing drawn by hand here. */}
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
              <Th>Items</Th>
              <Th>Expected</Th>
              <Th> </Th>
            </tr>
          </thead>
          <tbody>
            {pos.length === 0 && (
              <tr>
                <td colSpan={5} className="p-12 text-center text-meta text-base-500">
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
              const waiting = !!po.open_receipt_id;
              return (
                <tr
                  key={po.po_id}
                  className="border-t border-base-100 align-top hover:bg-primary/5"
                  data-testid="warehouse-incoming-row"
                >
                  <td className="px-4 py-3 whitespace-nowrap font-mono font-semibold text-base-900">
                    {po.po_id}
                  </td>
                  <td className="px-4 py-3 text-base-800">
                    {po.supplier_name ?? "—"}
                  </td>
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
                    {po.eta_date ? (
                      fmtDate(po.eta_date)
                    ) : (
                      <span className="text-base-400">—</span>
                    )}
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
                        onClick={() => setCountPoId(po.po_id)}
                        className="btn-primary text-label py-1.5 px-3"
                        data-testid={`warehouse-count-${po.po_id}`}
                      >
                        Count this delivery
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
        <WarehouseCountModal po={countPo} onClose={() => setCountPoId(null)} />
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
