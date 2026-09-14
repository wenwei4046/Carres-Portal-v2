import { Link } from "react-router-dom";
import type { SupplierBillRegisterRow } from "@carres/shared/schemas/finance-ap";
import type { FinanceApAgingRow } from "@/lib/queries";
import { useSupplierBills } from "@/lib/payables-queries";
import { rm } from "@/lib/format-currency";
import { BILL_STATUS_WORD, money, word } from "./payables/payables-words";

/**
 * AP Drawer — slides in from the right when a payable row is clicked.
 *
 * Visual reference: `reference/proto/finance-ap.jsx:88-176`.
 *
 * 0477 — the drawer no longer pays. `Schedule payment` / `Mark as paid` /
 * `Release payment` wrote a payment with no bill behind it and no second
 * person; their routes now answer 410. A supplier is paid by a Payment
 * Voucher — the one door — so the drawer links there instead:
 *   - the Supplier Invoice row shows the REAL bill entered for this PO (it
 *     was a made-up `SI-…` number ticked by pay status), or says none is
 *     entered and offers `Convert GRN to bill`;
 *   - `New Payment Voucher` opens the voucher form for this supplier.
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
  const bills = useSupplierBills();
  const bill = billForPo(bills.data, row.po_id);

  const dueTone = row.due_in !== null && row.due_in < 7 ? "warn" : "ok";
  const dueText = row.due_in === null ? "—" : `${row.due_in}d`;

  // 3-way match: PO is always green (it exists). DO is green when has_do.
  const doOk = row.has_do
    || row.pay_status_ui === "matched"
    || row.pay_status_ui === "scheduled"
    || row.pay_status_ui === "paid";
  const invOk = bill !== null && bill.status === "confirmed";

  const newBillHref = `/finance/bills/new?po=${encodeURIComponent(row.po_id)}`
    + (row.supplier_id ? `&supplier=${encodeURIComponent(row.supplier_id)}` : "");
  const voucherHref = row.supplier_id
    ? `/finance/payment-vouchers/new?supplier=${encodeURIComponent(row.supplier_id)}`
      + (bill && bill.status === "confirmed" ? `&bill=${encodeURIComponent(bill.id)}` : "")
    : "/finance/payment-vouchers/new";

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
                id={bill ? (bill.bill_no ?? "Draft bill") : bills.isError ? "—" : "No bill entered"}
                ok={invOk}
                detail={bills.isError
                  ? "Bills could not be loaded"
                  : bill
                    ? `${bill.supplier_invoice_no} · ${word(BILL_STATUS_WORD, bill.status)} · ${money(bill.total_amount)}`
                    : "No bill is entered for this PO yet"}
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

          <div className="flex flex-col gap-2" data-testid="ap-drawer-doors">
            <p className="text-meta text-muted-foreground">
              A supplier is paid by a payment voucher, against a confirmed bill.
            </p>
            <div className="flex gap-2">
              {bill ? (
                <Link to={`/finance/bills/${bill.id}`} className="btn-secondary flex-1 text-center">
                  Open bill
                </Link>
              ) : (
                <Link to={newBillHref} className="btn-secondary flex-1 text-center">
                  Convert GRN to bill
                </Link>
              )}
              <Link to={voucherHref} className="btn-primary flex-1 text-center">
                New Payment Voucher
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** The live bill entered for a PO: a confirmed one first, else a draft.
 *  A cancelled bill is not a bill. Rows that are not bill rows are ignored. */
export function billForPo(
  rows: SupplierBillRegisterRow[] | undefined,
  poId: string,
): SupplierBillRegisterRow | null {
  if (!Array.isArray(rows)) return null;
  const mine = rows.filter((b) =>
    b && typeof b.id === "string" && b.po_id === poId && (b.status === "confirmed" || b.status === "draft"));
  return mine.find((b) => b.status === "confirmed") ?? mine[0] ?? null;
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
