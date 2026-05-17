import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  useFinanceRefunds,
  useCreateRefund,
  useFinanceArAging,
  type FinanceRefundRow,
} from "@/lib/queries";
import { rm } from "@/lib/format-currency";

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
 *   - useCreateRefund:  POST /api/finance/refunds/create — kind=credit
 *     auto-generates CN-{seq} via next_credit_note_no RPC; kind=refund
 *     with amount > RM 1000 fires an approval row (Q5=A locked).
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

  const [showForm, setShowForm] = useState(false);

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
          <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
            Finance · Documents
          </div>
          <h1 className="font-display text-[32px] mt-1.5 mb-1 text-foreground tracking-[-0.02em]">
            Refunds &amp; Credit Notes
          </h1>
          <div className="text-[13px] text-muted-foreground">
            Money going back to customers · credits applied against future orders
          </div>
        </div>
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="px-3 py-2 rounded-md bg-primary text-primary-foreground text-[12px] font-semibold"
        >
          + Issue credit note
        </button>
      </header>

      <div className="grid grid-cols-3 gap-3.5 mb-6">
        <Kpi label="Issued" value={rm(totals.issued)} hint="Credit notes outstanding" tone="warn" />
        <Kpi label="Pending / approved" value={rm(totals.pending)} hint="Refunds awaiting bank release" tone="warn" accent />
        <Kpi label="Applied / paid" value={rm(totals.applied)} hint="Used or refunded" tone="ok" />
      </div>

      <div className="bg-card rounded-md border border-border overflow-auto">
        <div
          className="grid items-center px-4 py-2.5 bg-muted/40 border-b border-border text-[10px] uppercase tracking-[0.06em] font-bold text-muted-foreground"
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
          <div className="p-12 text-center text-[12.5px] text-muted-foreground">Loading…</div>
        ) : enriched.length === 0 ? (
          <div className="p-12 text-center text-[12.5px] text-muted-foreground">
            No refunds or credit notes yet. Click + Issue credit note to start.
          </div>
        ) : (
          enriched.map((r) => <RefundRow key={r.id} r={r} />)
        )}
      </div>

      <div className="mt-3.5 px-4 py-3 bg-muted/30 rounded-md text-[11.5px] text-muted-foreground">
        <b>Credit note</b> reduces what a customer owes (applied to balance on next order).{" "}
        <b>Refund</b> moves cash back to customer's bank.
      </div>

      {showForm && (
        <IssueRefundModal onClose={() => setShowForm(false)} />
      )}

      {refundsQ.error && (
        <div className="mt-5 p-3 text-[12px] rounded-md bg-destructive/5 text-destructive border border-destructive/30">
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
      className="grid items-center px-4 py-3 border-b border-border text-[12.5px]"
      style={{ gridTemplateColumns: "120px 90px 1.4fr 1.6fr 110px 110px 100px", minWidth: 920 }}
    >
      <span className="font-mono font-semibold">{r.noteId}</span>
      <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
        {r.kind === "credit" ? "Credit" : "Refund"}
      </span>
      <span className="text-muted-foreground text-[11.5px] truncate" title={r.reason ?? ""}>
        {r.reason ?? "—"}
      </span>
      <span className="text-[11.5px] text-muted-foreground truncate">{detail}</span>
      <span className="font-mono text-right font-bold text-primary">{rm(r.amount)}</span>
      <span>
        <span className={`px-2 py-0.5 rounded text-[10.5px] font-bold ${tone}`}>
          {r.uiStatusLabel}
        </span>
      </span>
      <span className="text-right text-[11px] text-muted-foreground">{date}</span>
    </div>
  );
}

function IssueRefundModal({ onClose }: { onClose: () => void }) {
  const aging = useFinanceArAging();
  const orders = aging.data?.rows ?? [];

  const [kind, setKind]       = useState<RefundKind>("credit");
  const [orderId, setOrderId] = useState("");
  const [amount, setAmount]   = useState("");
  const [reason, setReason]   = useState("");

  const create = useCreateRefund({
    onSuccess: (resp) => {
      const r = resp as { needsApproval: boolean };
      if (r.needsApproval) {
        toast.success(`Refund queued · awaiting Principal approval (> RM 1,000)`);
      } else {
        toast.success(`${kind === "credit" ? "Credit note issued" : "Refund approved"}`);
      }
      onClose();
    },
    onError: (e) => toast.error(`Issue failed: ${e.message}`),
  });

  function submit() {
    const amt = parseFloat(amount);
    if (!orderId) {
      toast.error("Pick an order");
      return;
    }
    if (!amt || amt <= 0) {
      toast.error("Amount must be positive");
      return;
    }
    if (!reason.trim()) {
      toast.error("Reason required");
      return;
    }
    create.mutate({
      orderId,
      amount: amt,
      reason: reason.trim(),
      kind,
    });
  }

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center">
      <div onClick={onClose} className="absolute inset-0 bg-black/40" aria-hidden="true" />
      <div
        role="dialog"
        aria-label={`Issue ${kind === "credit" ? "credit note" : "refund"}`}
        className="relative w-[480px] max-w-[92vw] p-6 rounded-md bg-card shadow-2xl"
      >
        <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Finance · New note</div>
        <div className="font-display text-[22px] mt-1 mb-4">
          Issue {kind === "credit" ? "credit note" : "refund"}
        </div>

        <div className="flex gap-px bg-muted rounded p-0.5 mb-4 w-fit">
          {(["credit", "refund"] as RefundKind[]).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className={`px-3 py-1 rounded text-[11.5px] font-semibold transition-colors ${
                kind === k
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {k === "credit" ? "Credit note" : "Refund"}
            </button>
          ))}
        </div>

        <div className="text-[10px] uppercase tracking-[0.06em] font-semibold text-muted-foreground mb-1">Source order</div>
        <select
          aria-label="Source order"
          value={orderId}
          onChange={(e) => setOrderId(e.target.value)}
          className="w-full px-2.5 py-1.5 border border-border rounded text-[12.5px] mb-3 bg-background"
        >
          <option value="">Select order…</option>
          {orders.map((o) => (
            <option key={o.order_id} value={o.order_id}>
              SO-{o.so} · {o.customer_name} · {rm(o.total)}
            </option>
          ))}
        </select>

        <div className="text-[10px] uppercase tracking-[0.06em] font-semibold text-muted-foreground mb-1">Amount (RM)</div>
        <input
          aria-label="Amount"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="e.g. 480"
          className="w-full px-2.5 py-1.5 border border-border rounded text-[12.5px] mb-3 bg-background"
        />

        <div className="text-[10px] uppercase tracking-[0.06em] font-semibold text-muted-foreground mb-1">Reason</div>
        <textarea
          aria-label="Reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Damaged on delivery, dealer goodwill, etc."
          rows={3}
          className="w-full px-2.5 py-1.5 border border-border rounded text-[12.5px] mb-3 bg-background resize-none"
        />

        {kind === "refund" && parseFloat(amount) > 1000 && (
          <div className="px-3 py-2 mb-3 rounded bg-primary/10 text-[11.5px] text-primary">
            Refunds &gt; RM 1,000 require principal approval before payout (Q5=A locked).
          </div>
        )}

        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-2 rounded-md border border-border text-[12.5px]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={create.isPending}
            className="px-3 py-2 rounded-md bg-primary text-primary-foreground font-semibold text-[12.5px] disabled:opacity-60"
          >
            {create.isPending ? "Issuing…" : `Issue ${kind === "credit" ? "credit" : "refund"}`}
          </button>
        </div>
      </div>
    </div>
  );
}

function Kpi({
  label, value, hint, tone, accent,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "warn" | "ok";
  accent?: boolean;
}) {
  const valueTone = tone === "warn" ? "text-primary" : tone === "ok" ? "text-success" : "text-foreground";
  return (
    <div className={`bg-card rounded-md border ${accent ? "border-primary" : "border-border"} px-5 py-[18px]`}>
      <div className={`text-[10px] uppercase tracking-[0.06em] font-semibold ${accent ? "text-primary" : "text-muted-foreground"}`}>
        {label}
      </div>
      <div className={`font-display text-[26px] mt-1.5 leading-none tabular-nums ${valueTone}`}>
        {value}
      </div>
      {hint && <div className="text-[11px] text-muted-foreground mt-1.5">{hint}</div>}
    </div>
  );
}
