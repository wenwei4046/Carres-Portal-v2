import {
  supplierClaimTypeLabel,
  warehouseReceiptStatusLabel,
  warehouseReceiptSummary,
  type WarehouseReceiptStatus,
} from "@carres/shared";
import { useWarehouseMyReceipts } from "@/lib/queries";
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
  amended: "pill-confirmed",
  draft: "pill-neutral",
  voided: "pill-neutral",
  returned: "pill-overdue",
};

export default function WarehouseMyReceipts() {
  const [lookup, setLookup] = useState("");
  const [exact, setExact] = useState("");
  const [pages, setPages] = useState<Array<{ before: string; beforeId: string } | null>>([null]);
  const cursor = pages[pages.length - 1];
  const { data, isLoading, isError, error, refetch } = useWarehouseMyReceipts({ exact, cursor });
  const receipts = data?.receipts ?? [];

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
      <div className="text-body text-base-600 mb-[18px]">
        Every count we sent, and what Carres did with it.
      </div>

      <form
        className="mb-3 flex flex-wrap items-center gap-2 border-y border-base-200 py-2"
        onSubmit={(event) => {
          event.preventDefault();
          setExact(lookup.trim());
          setPages([null]);
        }}
      >
        <input
          value={lookup}
          onChange={(event) => setLookup(event.target.value)}
          aria-label="Exact PO, Receiving Session or GRN"
          placeholder="Exact PO, Receiving Session or GRN"
          className="h-8 min-w-[260px] flex-1 rounded border border-base-300 px-2 text-meta"
        />
        <button type="submit" className="btn-secondary px-3 py-1.5 text-label">Find</button>
        {exact ? <button type="button" className="btn-ghost px-2 py-1.5 text-label" onClick={() => { setLookup(""); setExact(""); setPages([null]); }}>Clear</button> : null}
      </form>

      <div className="overflow-auto bg-white">
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
                  {r.po_id}
                  <div className="font-normal text-label text-base-600 mt-0.5">
                    {r.supplier_name ?? "—"}
                  </div>
                </td>
                <td className="px-4 py-3 whitespace-nowrap font-mono text-meta">
                  {r.do_number}
                </td>
                <td className="px-4 py-3 text-base-800">
                  <div>{warehouseReceiptSummary(r.lines)}</div>
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
      <div className="mt-3 flex items-center justify-between border-t border-base-200 pt-2 text-label text-base-600">
        <span>Page {pages.length} · {receipts.length} records</span>
        <div className="flex gap-2">
          <button type="button" className="btn-secondary px-3 py-1.5" disabled={pages.length === 1} onClick={() => setPages((current) => current.slice(0, -1))}>Previous</button>
          <button type="button" className="btn-secondary px-3 py-1.5" disabled={!data?.nextCursor} onClick={() => data?.nextCursor && setPages((current) => [...current, data.nextCursor])}>Next</button>
        </div>
      </div>
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
import { useState } from "react";
