import { useMemo } from "react";
import { toast } from "sonner";
import {
  useFinanceRefunds,
  type FinanceRefundRow,
} from "@/lib/queries";
import { rm } from "@/lib/format-currency";
import { FinanceKpi } from "@/components/FinanceKpi";

type RefundKind = "credit" | "refund";

interface RefundDisplayRow extends FinanceRefundRow {
  noteId:      string;       // CN-{n} or RF-{so} for display
  kind:        RefundKind;
  uiStatus:    "pending" | "approved" | "rejected" | "paid" | "issued" | "applied";
  uiStatusLabel: string;
}

/**
 * Finance Refunds & Credit Notes page — Phase 5 Chunk C.
 *
 * Visual reference: `reference/proto/finance-refunds.jsx`. Wires:
 *   - useFinanceRefunds: GET /api/finance/refunds
 *   - The create door LEFT with payment/MASTER.md §13 (no routine Refund
 *     queue/page/action; no automatic Customer Credit). History reads on;
 *     the API create route stays mounted but nothing here calls it, and
 *     retiring the surface itself remains approved target work.
 *
 * Status derivation per migration 0065 docstring:
 *   credit_note_no IS NULL  + status='approved' -> "RF approved" (refund)
 *   credit_note_no IS NULL  + status='paid'     -> "RF paid"
 *   credit_note_no NOT NULL + status='approved' -> "CN issued"
 *   credit_note_no NOT NULL + status='paid'     -> "CN applied"
 */
export default function FinanceRefunds() {
  const refundsQ = useFinanceRefunds();
  const rows = refundsQ.data ?? [];


  const enriched = useMemo<RefundDisplayRow[]>(() => {
    return rows.map((r) => {
      const isCreditNote = r.credit_note_no !== null;
      const kind: RefundKind = isCreditNote ? "credit" : "refund";

      // UI status — credit notes overload status='approved' as "issued",
      // status='paid' as "applied" (per migration 0065 design note).
      let uiStatus: RefundDisplayRow["uiStatus"];
      if (isCreditNote) {
        uiStatus =
          r.status === "approved" ? "issued" :
          r.status === "paid"     ? "applied" :
                                    r.status;
      } else {
        uiStatus = r.status;
      }
      const uiStatusLabel =
        uiStatus === "issued"  ? "Issued"  :
        uiStatus === "applied" ? "Applied" :
        uiStatus === "pending" ? "Pending" :
        uiStatus === "paid"    ? "Paid"    :
        uiStatus === "approved"? "Approved":
                                 "Rejected";

      return {
        ...r,
        noteId: r.credit_note_no ?? `RF-${r.id.slice(0, 4).toUpperCase()}`,
        kind,
        uiStatus,
        uiStatusLabel,
      };
    });
  }, [rows]);

  const totals = useMemo(() => {
    return enriched.reduce(
      (acc, r) => {
        if (r.uiStatus === "issued")  acc.issued  += r.amount;
        if (r.uiStatus === "pending" || r.uiStatus === "approved") acc.pending += r.amount;
        if (r.uiStatus === "applied" || r.uiStatus === "paid")     acc.applied += r.amount;
        return acc;
      },
      { issued: 0, pending: 0, applied: 0 },
    );
  }, [enriched]);

  return (
    <div className="p-9 max-w-[1400px] mx-auto">
      <header className="flex items-end justify-between gap-4 flex-wrap mb-7">
        <div>
          <div className="text-label uppercase tracking-[0.12em] text-muted-foreground">
            Finance · Documents
          </div>
          <h1 className="font-display text-page mt-1.5 mb-1 text-foreground tracking-[-0.02em]">
            Refunds &amp; Credit Notes
          </h1>
          <div className="text-body text-muted-foreground">
            Money going back to customers · credits applied against future orders
          </div>
        </div>
      </header>

      {/* payment/MASTER.md §13 — Carres has a no-refund policy. There is no
          routine Refund queue, action or automatic Customer Credit; the one
          exceptional path runs Service Case → Management decision → Finance
          external transfer. This page is READ-ONLY history; the create door
          left with the ruling. Retirement of the surface itself stays
          approved target work and is never done destructively. */}
      <div className="mb-6 px-4 py-3 rounded-md border border-border bg-muted/30 text-meta text-muted-foreground">
        Carres has a no-refund policy. An exceptional refund runs through a Service Case and
        a Management decision; Finance transfers externally. This page is history only —
        nothing new is created here.
      </div>

      <div className="grid grid-cols-3 gap-3.5 mb-6">
        <FinanceKpi label="Issued" value={rm(totals.issued)} hint="Credit notes outstanding" tone="warn" />
        <FinanceKpi label="Pending / approved" value={rm(totals.pending)} hint="Refunds awaiting bank release" tone="warn" accent />
        <FinanceKpi label="Applied / paid" value={rm(totals.applied)} hint="Used or refunded" tone="ok" />
      </div>

      <div className="bg-card rounded-md border border-border overflow-auto">
        <div
          className="grid items-center px-4 py-2.5 bg-muted/40 border-b border-border text-label uppercase tracking-[0.06em] font-semibold text-muted-foreground"
          style={{ gridTemplateColumns: "120px 90px 1.4fr 1.6fr 110px 110px 100px", minWidth: 920 }}
        >
          <span>Note ID</span>
          <span>Kind</span>
          <span>Reason</span>
          <span>Status detail</span>
          <span className="text-right">Amount</span>
          <span>Status</span>
          <span className="text-right">Date</span>
        </div>

        {refundsQ.isLoading ? (
          <div className="p-12 text-center text-meta text-muted-foreground">Loading…</div>
        ) : enriched.length === 0 ? (
          <div className="p-12 text-center text-meta text-muted-foreground">
            No refunds or credit notes on record.
          </div>
        ) : (
          enriched.map((r) => <RefundRow key={r.id} r={r} />)
        )}
      </div>

      <div className="mt-3.5 px-4 py-3 bg-muted/30 rounded-md text-label text-muted-foreground">
        <b>Credit note</b> reduces what a customer owes (applied to balance on next order).{" "}
        <b>Refund</b> moves cash back to customer's bank.
      </div>

      {refundsQ.error && (
        <div className="mt-5 p-3 text-meta rounded-md bg-destructive/5 text-destructive border border-destructive/30">
          Failed to load refunds: {String(refundsQ.error)}
        </div>
      )}
    </div>
  );
}

function RefundRow({ r }: { r: RefundDisplayRow }) {
  const tone =
    r.uiStatus === "applied" || r.uiStatus === "paid"  ? "bg-success/15 text-success" :
    r.uiStatus === "rejected"                          ? "bg-destructive/15 text-destructive" :
    r.uiStatus === "issued"                            ? "bg-primary/15 text-primary" :
                                                          "bg-blue-500/15 text-blue-700";
  const date = (r.paid_at ?? r.approved_at ?? r.created_at).slice(0, 10);

  const detail =
    r.uiStatus === "applied" && r.applied_to_order_id
      ? `Applied to order ${r.applied_to_order_id.slice(0, 8)}…`
      : r.uiStatus === "issued"
        ? "Awaiting application against future order"
        : r.uiStatus === "pending"
          ? "Awaiting principal approval (> RM 1,000)"
          : r.uiStatus === "approved"
            ? "Ready to pay (use AR drawer or refund_pay)"
            : r.uiStatus === "paid"
              ? "Bank transfer recorded"
              : "Refund rejected";

  return (
    <div
      className="grid items-center px-4 py-3 border-b border-border text-meta"
      style={{ gridTemplateColumns: "120px 90px 1.4fr 1.6fr 110px 110px 100px", minWidth: 920 }}
    >
      <span className="font-mono font-semibold">{r.noteId}</span>
      <span className="text-label uppercase tracking-wider text-muted-foreground">
        {r.kind === "credit" ? "Credit" : "Refund"}
      </span>
      <span className="text-muted-foreground text-label truncate" title={r.reason ?? ""}>
        {r.reason ?? "—"}
      </span>
      <span className="text-label text-muted-foreground truncate">{detail}</span>
      <span className="font-mono text-right font-semibold text-primary">{rm(r.amount)}</span>
      <span>
        <span className={`px-2 py-0.5 rounded text-label font-semibold ${tone}`}>
          {r.uiStatusLabel}
        </span>
      </span>
      <span className="text-right text-label text-muted-foreground">{date}</span>
    </div>
  );
}
