import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  useFinanceArAging,
  useFinanceInvoices,
  type FinanceArAgingRow,
} from "@/lib/queries";
import { apiFetch, ApiError } from "@/lib/api";
import { renderInvoicePdf } from "@/lib/pdf/render";
import type { InvoiceTemplateData } from "@/lib/pdf/types";
import { rm, rmCompact } from "@/lib/format-currency";
import { fmtDate } from "@/lib/fmt-date";
import { FinanceKpi } from "@/components/FinanceKpi";

type InvoiceStatus = "unpaid" | "partial" | "paid";
type InvoiceTab    = "all" | InvoiceStatus;

interface InvoiceRow extends FinanceArAgingRow {
  status: InvoiceStatus;
  tax:    number;
  net:    number;
}

/**
 * Finance Invoices page — Phase 5 Chunk A close-out (page deferred from
 * Chunk A initial sprint to this session, served by existing routes only).
 *
 * Visual reference: `reference/proto/finance-invoices.jsx:1-103`. Reuses
 * the same `finance_ar_aging` RPC payload as the AR page; the tabbing
 * dimension is invoice status (paid/partial/unpaid) derived from
 * `outstanding === 0 ? "paid" : paid === 0 ? "unpaid" : "partial"`.
 *
 * SST 8% inclusive (per Q2 + proto finance-invoices.jsx:34): tax portion
 * is `total * 0.08 / 1.08`. KPIs split gross / net / SST.
 *
 * Issue + PDF download:
 *   - "+ New invoice" button surfaces a toast directing finance to use
 *     the per-row Issue invoice flow on the AR drawer. The schema doesn't
 *     support batch issue; per-row keeps the auth/audit story clean.
 *   - PDF download is a stub here — Q7=A locks server-side render via
 *     @react-pdf/renderer for tax compliance, deferred to Chunk C.
 */
export default function FinanceInvoices() {
  const aging    = useFinanceArAging();
  const invoices = useFinanceInvoices();
  const rows     = aging.data?.rows ?? [];

  // Lookup map: invoice_no -> invoice.id for PDF download.
  const invoiceIdByNo = useMemo(() => {
    const m = new Map<string, string>();
    for (const inv of invoices.data ?? []) m.set(inv.invoice_no, inv.id);
    return m;
  }, [invoices.data]);

  const [tab, setTab] = useState<InvoiceTab>("all");

  const enriched = useMemo<InvoiceRow[]>(() => {
    return rows.map((r) => {
      const status: InvoiceStatus =
        r.outstanding === 0 ? "paid"   :
        r.paid === 0        ? "unpaid" :
                              "partial";
      const tax = +(r.total * 0.08 / 1.08).toFixed(2);
      const net = +(r.total - tax).toFixed(2);
      return { ...r, status, tax, net };
    });
  }, [rows]);

  const filtered = useMemo(() => {
    if (tab === "all") return enriched;
    return enriched.filter((r) => r.status === tab);
  }, [enriched, tab]);

  const totals = useMemo(() => {
    return filtered.reduce(
      (acc, r) => ({
        gross: acc.gross + r.total,
        net:   acc.net   + r.net,
        tax:   acc.tax   + r.tax,
      }),
      { gross: 0, net: 0, tax: 0 },
    );
  }, [filtered]);

  const tabs: { key: InvoiceTab; label: string; count: number }[] = [
    { key: "all",     label: "All",     count: enriched.length },
    { key: "unpaid",  label: "Unpaid",  count: enriched.filter((r) => r.status === "unpaid").length },
    { key: "partial", label: "Partial", count: enriched.filter((r) => r.status === "partial").length },
    { key: "paid",    label: "Paid",    count: enriched.filter((r) => r.status === "paid").length },
  ];

  function handleNewInvoice() {
    toast.info(
      "To issue a tax invoice, open the matching receivable on the AR page → Issue invoice. Server-side gate requires status=delivered AND paid >= total.",
      { duration: 6000 },
    );
  }

  async function handleDownloadPdf(row: InvoiceRow) {
    if (row.status !== "paid") {
      toast.warning(`${row.invoice_no} not yet finalised — invoice PDF only after delivery + full payment`);
      return;
    }
    const invId = invoiceIdByNo.get(row.invoice_no);
    if (!invId) {
      toast.warning(`${row.invoice_no} not yet issued by finance — open AR drawer → Issue invoice first`);
      return;
    }
    try {
      const data = await apiFetch<InvoiceTemplateData>(
        `/api/finance/invoices/${invId}/pdf-data`,
      );
      const blob = await renderInvoicePdf(data);
      const url  = URL.createObjectURL(blob);
      window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : String(e);
      toast.error(`PDF download failed: ${msg}`);
    }
  }

  return (
    <div className="p-9 max-w-[1400px] mx-auto">
      <header className="flex items-end justify-between gap-4 flex-wrap mb-7">
        <div>
          <div className="text-label uppercase tracking-[0.12em] text-muted-foreground">
            Finance · Documents
          </div>
          <h1 className="font-display text-page mt-1.5 mb-1 text-foreground tracking-[-0.02em]">
            Invoices
          </h1>
          <div className="text-body text-muted-foreground">
            Tax invoices issued to customers · SST 8% inclusive
          </div>
        </div>
        <button
          type="button"
          onClick={handleNewInvoice}
          className="px-3 py-2 rounded-md bg-primary text-primary-foreground text-meta font-semibold"
        >
          + New invoice
        </button>
      </header>

      <div className="grid grid-cols-3 gap-3.5 mb-6">
        <FinanceKpi label="Gross billed" value={rmCompact(totals.gross)} hint={`${filtered.length} invoices`} />
        <FinanceKpi label="Net (excl. tax)" value={rmCompact(totals.net)} hint="Revenue base" tone="ok" />
        <FinanceKpi label="SST collected" value={rmCompact(totals.tax)} hint="8% portion" />
      </div>

      <div className="flex gap-1 mb-3.5 border-b border-border">
        {tabs.map((t) => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`px-3.5 py-2 text-meta font-semibold transition-colors -mb-px border-b-2 ${
                active
                  ? "text-foreground border-primary"
                  : "text-muted-foreground border-transparent hover:text-foreground"
              }`}
            >
              {t.label}{" "}
              <span className="font-mono text-label text-muted-foreground ml-1">· {t.count}</span>
            </button>
          );
        })}
      </div>

      <div className="bg-card rounded-md border border-border overflow-auto">
        <div
          className="grid items-center px-4 py-2.5 bg-muted/40 border-b border-border text-label uppercase tracking-[0.06em] font-semibold text-muted-foreground"
          style={{ gridTemplateColumns: "120px 1.3fr 1fr 90px 110px 110px 90px 100px", minWidth: 980 }}
        >
          <span>Invoice</span>
          <span>Customer</span>
          <span>Dealer</span>
          <span>Issued</span>
          <span className="text-right">Net</span>
          <span className="text-right">SST 8%</span>
          <span className="text-right">Status</span>
          <span className="text-right">Action</span>
        </div>

        {aging.isLoading ? (
          <div className="p-12 text-center text-meta text-muted-foreground">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-meta text-muted-foreground">No invoices.</div>
        ) : (
          filtered.map((r) => (
            <InvoiceTableRow key={r.order_id} row={r} onPdf={() => handleDownloadPdf(r)} />
          ))
        )}
      </div>

      {aging.error && (
        <div className="mt-5 p-3 text-meta rounded-md bg-destructive/5 text-destructive border border-destructive/30">
          Failed to load invoices: {String(aging.error)}
        </div>
      )}
    </div>
  );
}

function InvoiceTableRow({ row, onPdf }: { row: InvoiceRow; onPdf: () => void }) {
  const issued = formatIssuedDate(row.placed_at);
  const tone =
    row.status === "paid"    ? "bg-success/15 text-success" :
    row.status === "partial" ? "bg-blue-500/15 text-blue-700" :
                               "bg-primary/15 text-primary";

  return (
    <div
      className="grid items-center px-4 py-3 border-b border-border text-meta"
      style={{ gridTemplateColumns: "120px 1.3fr 1fr 90px 110px 110px 90px 100px", minWidth: 980 }}
    >
      <span className="font-mono font-semibold">{row.invoice_no}</span>
      <span>{row.customer_name}</span>
      <span className="text-muted-foreground">{row.dealer_name ?? "—"}</span>
      <span className="text-label text-muted-foreground">{issued}</span>
      <span className="font-mono text-right">{rm(row.net)}</span>
      <span className="font-mono text-right text-muted-foreground">{rm(row.tax)}</span>
      <span className="text-right">
        <span className={`px-2 py-0.5 rounded text-label font-semibold ${tone}`}>
          {row.status === "paid" ? "Paid" : row.status === "partial" ? "Partial" : "Unpaid"}
        </span>
      </span>
      <span className="text-right">
        <button
          type="button"
          onClick={onPdf}
          className="text-label px-2.5 py-1 rounded border border-border bg-background hover:bg-muted/40"
        >
          PDF
        </button>
      </span>
    </div>
  );
}

// The one portal date spelling (COPY-STANDARD): weekday first, year only when
// it is not this year, Kuala Lumpur time. `toLocaleDateString` was a second
// spelling that also moved with the browser's timezone.
function formatIssuedDate(iso: string): string {
  return fmtDate(iso);
}
