import { useState } from "react";
import { toast } from "sonner";
import {
  usePoPay,
  usePoSchedule,
  type FinanceApAgingRow,
} from "@/lib/queries";
import { rm } from "@/lib/format-currency";
import type { PaymentMethod } from "@carres/shared";

const METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "duitnow_qr",    label: "DuitNow QR" },
  { value: "cheque",        label: "Cheque" },
  { value: "cash",          label: "Cash" },
];

/**
 * AP Drawer — slides in from the right when a payable row is clicked.
 *
 * Visual reference: `reference/proto/finance-ap.jsx:88-176`. Wires:
 *   - Schedule payment: usePoSchedule({ poId }) → POST
 *     /api/finance/payments/po-schedule → finance_po_schedule RPC. No
 *     form input; the proto's "Schedule" button is a single click that
 *     just flips pay_status='unpaid' -> 'scheduled'. The scheduled date
 *     is captured in the audit log only.
 *   - Mark / Release payment: usePoPay({ poId, amount, method, reference })
 *     → POST /api/finance/payments/po-pay → finance_po_pay RPC. Inserts
 *     outbound payment + flips pay_status='paid'. Inline form panel
 *     mirrors ARDrawer's record-receipt UX.
 *
 * Action gating by pay_status_ui:
 *   - matched   → Schedule + Mark paid (2 buttons)
 *   - scheduled → Release payment (single button → opens pay form)
 *   - paid / in_transit / in_production → no action buttons (status only)
 *
 * Closes on overlay click or X button.
 */
export default function APDrawer({
  row,
  onClose,
}: {
  row: FinanceApAgingRow;
  onClose: () => void;
}) {
  const [payPanelOpen, setPayPanelOpen] = useState(false);
  const [payAmt, setPayAmt]             = useState(String(row.total || ""));
  const [payRef, setPayRef]             = useState("");
  const [payMethod, setPayMethod]       = useState<PaymentMethod>("bank_transfer");

  const poPay = usePoPay({
    onSuccess: () => {
      toast.success(`${row.po_id} marked paid · RM ${parseFloat(payAmt || "0").toFixed(2)}`);
      onClose();
    },
    onError: (e) => toast.error(`Pay failed: ${e.message}`),
  });

  const poSchedule = usePoSchedule({
    onSuccess: () => {
      toast.info(`${row.po_id} scheduled for payment`);
      onClose();
    },
    onError: (e) => toast.error(`Schedule failed: ${e.message}`),
  });

  function submitPay() {
    const amt = parseFloat(payAmt);
    if (!amt || amt <= 0) {
      toast.error("Amount must be positive");
      return;
    }
    poPay.mutate({
      poId:      row.po_id,
      amount:    amt,
      method:    payMethod,
      reference: payRef || null,
    });
  }

  function submitSchedule() {
    poSchedule.mutate({ poId: row.po_id });
  }

  const dueTone = row.due_in !== null && row.due_in < 7 ? "warn" : "ok";
  const dueText = row.due_in === null ? "—" : `${row.due_in}d`;

  // 3-way match: PO is always green (it exists). DO is green when has_do.
  // Invoice is implied by pay_status_ui having progressed past in_*.
  const doOk  = row.has_do
              || row.pay_status_ui === "matched"
              || row.pay_status_ui === "scheduled"
              || row.pay_status_ui === "paid";
  const invOk = row.pay_status_ui === "matched"
              || row.pay_status_ui === "scheduled"
              || row.pay_status_ui === "paid";

  return (
    <div className="fixed inset-0 z-[100] flex justify-end">
      <div
        onClick={onClose}
        className="absolute inset-0 bg-black/40"
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-label={`Payable ${row.po_id}`}
        className="relative w-[520px] max-w-[92vw] h-full bg-card shadow-2xl flex flex-col overflow-auto"
      >
        <div className="px-6 py-5 border-b border-border flex items-start justify-between">
          <div>
            <div className="text-label uppercase tracking-[0.12em] text-muted-foreground">
              Payable
            </div>
            <div className="font-display text-title mt-1">{row.po_id}</div>
            <div className="text-meta text-muted-foreground mt-0.5">
              {row.supplier_name ?? "Unknown supplier"}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-strong text-muted-foreground hover:text-foreground"
          >
            ×
          </button>
        </div>

        <div className="px-6 py-5 flex flex-col gap-[18px]">
          <div className="grid grid-cols-2 gap-2.5">
            <Mini label="Total"  value={rm(row.total)} tone="neutral" />
            <Mini label="Due in" value={dueText}        tone={dueTone}  />
          </div>

          <div>
            <div className="text-label uppercase tracking-[0.06em] font-semibold text-muted-foreground mb-1.5">
              Three-way match
            </div>
            <div className="bg-background/60 rounded-md border border-border px-3 py-2">
              <MatchRow
                label="Purchase Order"
                id={row.po_id}
                ok
                detail={
                  row.lines.length > 1
                    ? `${row.lines.length} lines · ${row.qty} units total`
                    : row.lines[0]
                      ? `${row.lines[0].qty} × ${row.lines[0].sku_name}${row.lines[0].unit_cost !== null ? ` @ ${rm(row.lines[0].unit_cost)}` : ""}`
                      : `${row.qty} units`
                }
              />
              <MatchRow
                label="Delivery Order"
                id={row.do_number ?? (doOk ? "—" : "Pending")}
                ok={doOk}
                detail={row.do_number ? "Goods received at warehouse" : "Awaiting goods"}
              />
              <MatchRow
                label="Supplier Invoice"
                id={invOk ? `SI-${row.po_id.replace("PO-", "")}` : "—"}
                ok={invOk}
                detail={invOk ? "Tax invoice received" : "Awaiting from supplier"}
                last
              />
            </div>
          </div>

          {row.lines.length > 1 && (
            <div>
              <div className="text-label uppercase tracking-[0.06em] font-semibold text-muted-foreground mb-1.5">
                Lines
              </div>
              <div className="bg-background/60 rounded-md border border-border px-3 py-2">
                {row.lines.map((ln) => (
                  <div
                    key={ln.sku}
                    className="flex justify-between py-1.5 text-meta border-b border-dashed border-border last:border-0"
                  >
                    <span>
                      {ln.sku_name}{" "}
                      <span className="text-muted-foreground">
                        · {ln.qty}× {ln.unit_cost !== null ? `@ ${rm(ln.unit_cost)}` : "(no cost set)"}
                      </span>
                    </span>
                    <span className="font-mono font-semibold">{rm(ln.line_total)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <div className="text-label uppercase tracking-[0.06em] font-semibold text-muted-foreground mb-1.5">
              PO history
            </div>
            <div className="bg-background/60 rounded-md border border-border px-3 py-2">
              {row.history.length === 0 ? (
                <div className="py-1.5 text-label text-muted-foreground">
                  No history entries yet.
                </div>
              ) : (
                row.history.map((h, i) => (
                  <div
                    key={i}
                    className="flex justify-between py-1 text-meta border-b border-dashed border-border last:border-0"
                  >
                    <span>{h.text}</span>
                    <span className="text-muted-foreground font-mono">
                      {formatDate(h.occurred_at)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          {!payPanelOpen && row.pay_status_ui === "matched" && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={submitSchedule}
                disabled={poSchedule.isPending}
                className="flex-1 py-2 rounded-md border border-border text-meta disabled:opacity-60"
              >
                {poSchedule.isPending ? "Scheduling…" : "Schedule payment"}
              </button>
              <button
                type="button"
                onClick={() => setPayPanelOpen(true)}
                className="flex-1 py-2 rounded-md bg-primary text-primary-foreground font-semibold text-meta"
              >
                Mark as paid
              </button>
            </div>
          )}

          {!payPanelOpen && row.pay_status_ui === "scheduled" && (
            <button
              type="button"
              onClick={() => setPayPanelOpen(true)}
              className="w-full py-2.5 rounded-md bg-primary text-primary-foreground font-semibold text-body"
            >
              Release payment
            </button>
          )}

          {payPanelOpen && (
            <div className="bg-background/60 rounded-md border border-border p-3.5">
              <div className="text-label uppercase tracking-[0.06em] font-semibold text-muted-foreground mb-2">
                Release payment
              </div>
              <input
                aria-label="Amount"
                value={payAmt}
                onChange={(e) => setPayAmt(e.target.value)}
                placeholder="Amount (RM)"
                inputMode="decimal"
                className="w-full px-2.5 py-1.5 border border-border rounded text-meta mb-2 bg-card"
              />
              <select
                aria-label="Method"
                value={payMethod}
                onChange={(e) => setPayMethod(e.target.value as PaymentMethod)}
                className="w-full px-2.5 py-1.5 border border-border rounded text-meta mb-2 bg-card"
              >
                {METHODS.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
              <input
                aria-label="Reference"
                value={payRef}
                onChange={(e) => setPayRef(e.target.value)}
                placeholder="Bank ref / cheque no. (optional)"
                className="w-full px-2.5 py-1.5 border border-border rounded text-meta mb-2.5 bg-card"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={submitPay}
                  disabled={poPay.isPending}
                  className="flex-1 py-2 rounded-md bg-primary text-primary-foreground font-semibold text-meta disabled:opacity-60"
                >
                  {poPay.isPending ? "Releasing…" : "Confirm payment"}
                </button>
                <button
                  type="button"
                  onClick={() => setPayPanelOpen(false)}
                  className="px-3 py-2 rounded-md border border-border text-meta"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MatchRow({
  label, id, ok, detail, last,
}: {
  label: string;
  id: string;
  ok: boolean;
  detail: string;
  last?: boolean;
}) {
  return (
    <div className={`flex items-center gap-3 py-2 ${last ? "" : "border-b border-dashed border-border"}`}>
      <div className={`w-[22px] h-[22px] rounded grid place-items-center text-meta font-semibold flex-shrink-0 ${
        ok ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"
      }`}>
        {ok ? "✓" : "○"}
      </div>
      <div className="flex-1">
        <div className="text-meta font-semibold">
          {label}{" "}
          <span className="font-mono text-meta font-medium text-muted-foreground ml-1">{id}</span>
        </div>
        <div className="text-label text-muted-foreground mt-0.5">{detail}</div>
      </div>
    </div>
  );
}

function Mini({
  label, value, tone,
}: {
  label: string;
  value: string;
  tone: "warn" | "ok" | "neutral";
}) {
  const valTone = tone === "warn" ? "text-primary" : tone === "ok" ? "text-success" : "text-foreground";
  return (
    <div className="bg-background/60 rounded-md border border-border px-3.5 py-2.5">
      <div className="text-label uppercase tracking-[0.06em] font-semibold text-muted-foreground">
        {label}
      </div>
      <div className={`font-display text-title mt-0.5 leading-none tabular-nums ${valTone}`}>
        {value}
      </div>
    </div>
  );
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString("en-MY", {
      year:  "2-digit",
      month: "short",
      day:   "numeric",
    });
  } catch {
    return iso;
  }
}
