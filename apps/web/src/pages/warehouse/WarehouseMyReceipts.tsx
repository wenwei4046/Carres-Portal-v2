import { useState } from "react";
import { warehouseConfirmationReportFromWire } from "@carres/shared/adapters";
import Button from "@/components/kit/Button";
import WarehouseCountModal from "./WarehouseCountModal";
import WarehouseArrivalModal from "./WarehouseArrivalModal";
import {
  supplierClaimTypeLabel,
  documentDisplayNumber,
  type WarehouseIncomingPo,
  type WarehouseIncomingArrival,
  type WarehouseConfirmationReportInput,
  type WarehouseConfirmationResult,
  warehouseReceiptStatusLabel,
  warehouseReceiptSummary,
  type WarehouseReceiptStatus,
} from "@carres/shared";
import { useWarehouseMyReceipts, useWarehouseIncoming, useWarehouseArrivals } from "@/lib/queries";
import { fmtDate } from "@/lib/fmt-date";
import PageHeader from "@/components/PageHeader";

/**
 * WarehouseMyReceipts — R6: what we filed, and what Carres did with it.
 *
 * The card's third bullet is "their own open issues (R2 cases they reported)",
 * and this is where they appear — through the receipt they came from
 * (`supplier_claims.warehouse_receipt_id`, 0302), never through a read on the
 * claim table. A warehouse sees the three facts about its own report (what it
 * was, how many, is it settled) and none of the supplier correspondence.
 *
 * A returned count says WHY in the row itself. A rejection whose reason lives
 * one click away is a rejection nobody reads.
 */
const STATUS_PILL: Record<WarehouseReceiptStatus, string> = {
  submitted: "pill-warning",
  posted: "pill-confirmed",
  draft: "pill-neutral",
  voided: "pill-neutral",
  returned: "pill-overdue",
};

export default function WarehouseMyReceipts() {
  const { data, isLoading, isError, error, refetch } = useWarehouseMyReceipts();
  const receipts = data?.receipts ?? [];
  const incoming = useWarehouseIncoming();
  const arrivals = useWarehouseArrivals();
  const [editing, setEditing] = useState<{
    po?: WarehouseIncomingPo;
    source?: WarehouseIncomingArrival;
    saved: { saveKey: string; report: WarehouseConfirmationReportInput; result: WarehouseConfirmationResult };
  } | null>(null);

  if (isLoading) {
    return (
      <div className="px-9 py-8" data-testid="warehouse-receipts-skeleton">
        <div className="h-9 w-1/3 bg-base-100 rounded animate-pulse mb-6" />
        <div className="bg-white border border-base-200 rounded">
          {Array.from({ length: 3 }).map((_, i) => (
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
            Couldn&rsquo;t load what we filed
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
    <div className="px-9 py-8 pb-14" data-testid="warehouse-receipts">
      <PageHeader kicker="Warehouse" title="My receiving" className="mb-3" />

      <div className="bg-white border border-base-200 rounded overflow-auto">
        <table
          className="w-full border-collapse text-body [&_tbody_tr:nth-child(even)]:bg-base-100/70"
          style={{ minWidth: 820 }}
        >
          <thead className="bg-base-700 border-b-2 border-primary text-white">
            <tr>
              <Th>PO</Th>
              <Th>DO</Th>
              <Th>What we counted</Th>
              <Th>Sent</Th>
              <Th>Where it is</Th>
            </tr>
          </thead>
          <tbody>
            {receipts.length === 0 && (
              <tr>
                <td colSpan={5} className="p-12 text-center text-meta text-base-500">
                  Nothing counted yet.
                </td>
              </tr>
            )}
            {receipts.map((r) => (
              <tr
                key={r.id}
                className="border-t border-base-100 align-top"
                data-testid="warehouse-receipt-row"
              >
                <td className="px-4 py-3 whitespace-nowrap font-mono font-semibold text-base-900">
                  {documentDisplayNumber(r.po_id ?? r.source_no ?? warehouseConfirmationReportFromWire(r.raw_report)?.poId ?? "") || "Not recorded"}
                  <div className="font-normal text-label text-base-600 mt-0.5">
                    {r.supplier_name ?? ""}
                  </div>
                </td>
                <td className="px-4 py-3 whitespace-nowrap font-mono text-meta">
                  {r.do_number ?? warehouseConfirmationReportFromWire(r.raw_report)?.doNumber ?? "Not recorded"}
                </td>
                <td className="px-4 py-3 text-base-800">
                  <div>{r.status === "draft" && !r.lines.length ? "Not recorded" : warehouseReceiptSummary(r.lines)}</div>
                  {r.note && (
                    <div className="text-label text-base-600 mt-1">{r.note}</div>
                  )}
                  {/* The claims this count opened, once Carres checked it in. */}
                  {(r.claims ?? []).length > 0 && (
                    <div className="mt-1.5 grid gap-0.5">
                      {(r.claims ?? []).map((c) => (
                        <div
                          key={c.claim_no}
                          className="text-label text-base-700"
                          data-testid={`warehouse-receipt-claim-${c.claim_no}`}
                        >
                          <span className="font-mono">{c.claim_no}</span>{" "}
                          {supplierClaimTypeLabel(c.claim_type)} · {c.qty} ×{" "}
                          {c.sku} ·{" "}
                          <span
                            className={
                              c.status === "closed" ? "text-success" : "text-base-600"
                            }
                          >
                            {c.status === "closed" ? "Settled" : "Still open"}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-base-700">
                  {fmtDate(r.submitted_at)}
                </td>
                <td className="px-4 py-3">
                  <span className={`pill ${STATUS_PILL[r.status] ?? "pill-neutral"}`}>
                    {warehouseReceiptStatusLabel(r.status)}
                  </span>
                  {(r.blockers ?? []).map((blocker) => <p key={blocker.code} className="text-body text-kit-red-9">{blocker.message}</p>)}
                  {r.status === "draft" && r.save_key && r.revision != null && (() => {
                    const report = warehouseConfirmationReportFromWire(r.raw_report);
                    const po = incoming.data?.pos.find((item) => item.po_id === report?.poId);
                    const source = arrivals.data?.arrivals?.find((item) => item.id === report?.arrivalSourceId);
                    const sourceQuery = report?.arrivalSourceId ? arrivals : incoming;
                    const unavailable = sourceQuery.isLoading ? "Loading…"
                      : sourceQuery.isError ? "Could not be loaded"
                      : !report || (!po && !source) ? "Not available. Go back and reload." : null;
                    return <><Button disabled={Boolean(unavailable)} aria-describedby={unavailable ? `receipt-unavailable-${r.id}` : undefined} onClick={() => {
                      if (!report || (!po && !source) || !r.save_key || r.revision == null) return;
                      setEditing({ po, source, saved: { saveKey: r.save_key, report,
                        result: { id: r.id, receipt_id: r.id, status: "draft", revision: r.revision,
                          grn_no: null, blockers: r.blockers ?? [], already_saved: true } } });
                    }}>Open Receiving</Button>
                      {unavailable && <p id={`receipt-unavailable-${r.id}`} className="text-body text-base-700">{unavailable}</p>}
                      {sourceQuery.isError && <Button onClick={() => void sourceQuery.refetch()}>Try again</Button>}
                    </>;
                  })()}
                  {r.status === "returned" && r.return_reason && (
                    <div
                      className="text-label text-danger mt-1 max-w-[280px]"
                      data-testid={`warehouse-receipt-reason-${r.id}`}
                    >
                      {r.return_reason}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editing?.source && <WarehouseArrivalModal key={editing.saved.result.id} source={editing.source} saved={editing.saved} onClose={() => setEditing(null)} />}
      {editing?.po && <WarehouseCountModal key={editing.saved.result.id} po={editing.po}
        saved={editing.saved} onClose={() => setEditing(null)} />}
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
