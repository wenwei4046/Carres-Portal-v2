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
  checked_in: "pill-confirmed",
  returned: "pill-overdue",
};

export default function WarehouseMyReceipts() {
  const { data, isLoading, isError, error, refetch } = useWarehouseMyReceipts();
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
        <div className="rounded-md bg-destructive/10 border border-destructive/30 p-4 text-sm">
          <div className="text-destructive font-semibold mb-2">
            Couldn&rsquo;t load what we filed
          </div>
          <div className="text-[12px] text-base-700 mb-3">
            {(error as Error | undefined)?.message ?? "Unknown error"}
          </div>
          <button
            type="button"
            onClick={() => void refetch()}
            className="btn-secondary text-[11px] py-1.5 px-3"
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
      <div className="text-[13px] text-base-600 mb-[18px]">
        Every count we sent, and what Carres did with it.
      </div>

      <div className="bg-white border border-base-200 rounded overflow-auto">
        <table
          className="w-full border-collapse text-[13px] [&_tbody_tr:nth-child(even)]:bg-base-100/70"
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
                <td colSpan={5} className="p-12 text-center text-[12px] text-base-500">
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
                  <div className="font-normal text-[11px] text-base-600 mt-0.5">
                    {r.supplier_name ?? "—"}
                  </div>
                </td>
                <td className="px-4 py-3 whitespace-nowrap font-mono text-[12px]">
                  {r.do_number}
                </td>
                <td className="px-4 py-3 text-base-800">
                  <div>{warehouseReceiptSummary(r.lines)}</div>
                  {r.note && (
                    <div className="text-[11px] text-base-600 mt-1">{r.note}</div>
                  )}
                  {/* The claims this count opened, once Carres checked it in. */}
                  {(r.claims ?? []).length > 0 && (
                    <div className="mt-1.5 grid gap-0.5">
                      {(r.claims ?? []).map((c) => (
                        <div
                          key={c.claim_no}
                          className="text-[11px] text-base-700"
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
                      className="text-[11px] text-danger mt-1 max-w-[280px]"
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
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-[0.02em] text-white text-left">
      {children}
    </th>
  );
}
