import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { isLivePayment } from "@carres/shared";
import type { PaymentRegisterRow } from "@carres/shared/payment-register";
import type { InvoiceRegisterRow } from "@carres/shared/payment-invoice-register";
import { soRemaining } from "@carres/shared/payment-invoice-register";
import EmptyState from "@/components/kit/EmptyState";
import Select from "@/components/kit/Select";
import { SectionCard } from "@/components/SectionPanel";
import { useInvoiceRegister, usePaymentRegister } from "@/lib/queries";
import { fmtDate, fmtMonth } from "@/lib/fmt-date";
import { rm } from "@/lib/format-currency";

/**
 * Reports → Payment (docs/payment/MASTER.md §11 + §16 — the six approved
 * read-only listings: Money received · Customer balances · Storage charged
 * and collected · Storage waived · Payment corrections · Money needing
 * review; never a Refund, Bank Matching or Negative Payment report).
 *
 * The governed report rules (the Purchasing/Receiving reports' three laws)
 * apply unchanged:
 *
 *  1. **It stores nothing.** One read of the same payments wire the Payments
 *     Register reads and one read of the same invoices wire the Invoices
 *     Register reads; every figure is computed at render time by the SHARED
 *     arithmetic (`soRemaining` — Law D), so this report and a register can
 *     never say two answers.
 *  2. **Every row is a DOOR.** A payment opens its own record in the Payments
 *     Register; an SO opens its collection object in the Invoices Register.
 *  3. **The exclusion is stated on screen.** Voided payments, settled orders
 *     and unpriced orders are excluded from their sections with a sentence,
 *     never silently.
 *
 * The month filter governs the DATED sections (Money received · Payment
 * corrections). Balances, storage and review money are TODAY's facts and say
 * so — a balance has no month.
 */

const METHODS: Record<string, string> = {
  bank: "Bank transfer", bank_transfer: "Bank transfer", cash: "Cash", card: "Card",
  cheque: "Cheque", online: "Online payment", other: "Other",
  duitnow_qr: "DuitNow QR", credit_card: "Credit card", debit_card: "Debit card",
};

const KIND_WORD: Record<string, string> = {
  sales: "Sales Invoice",
  storage: "Storage Invoice",
  additional_storage: "Additional Storage Invoice",
};

/** `3 payments · RM 3,700.00 received` — composed once so the sentence and
 *  its test cannot drift apart. */
export function moneyReceivedLine(rows: readonly PaymentRegisterRow[]): string {
  const total = rows.reduce((sum, r) => sum + Number(r.amount), 0);
  return `${rows.length} payment${rows.length === 1 ? "" : "s"} · ${rm(total)} received`;
}

/** One balance row per SO — the SHARED `soRemaining` across every live
 *  invoice kind, deduped through the Sales door. */
export function customerBalanceRows(rows: readonly InvoiceRegisterRow[]): Array<{
  orderId: string; so: number | null; customer: string; doorId: string;
  outstanding: number; storageOwing: number; overpaid: number;
}> {
  const byOrder = new Map<string, InvoiceRegisterRow[]>();
  for (const r of rows) {
    const list = byOrder.get(r.order_id) ?? [];
    list.push(r);
    byOrder.set(r.order_id, list);
  }
  const out: ReturnType<typeof customerBalanceRows> = [];
  for (const [orderId, mine] of byOrder) {
    const money = soRemaining(mine, orderId);
    if (!money.known) continue;
    const door = mine.find((r) => r.kind === "sales") ?? mine[0];
    out.push({
      orderId,
      so: door.orders?.so ?? null,
      customer: door.orders?.customer_name ?? "Customer not available",
      doorId: door.id,
      outstanding: money.outstanding,
      storageOwing: money.storageOwing,
      overpaid: money.overpaid,
    });
  }
  return out.sort((a, b) => b.outstanding - a.outstanding);
}

function Head({ children, note }: { children: React.ReactNode; note?: string }) {
  return <div className="mb-2">
    <h2 className="text-strong">{children}</h2>
    {note && <p className="text-label font-normal text-base-500">{note}</p>}
  </div>;
}

function Row({ to, children }: { to: string; children: React.ReactNode }) {
  return <Link to={to}
    className="flex items-center justify-between gap-3 rounded-control border border-base-200 bg-white px-2 py-1.5 hover:bg-hovertint">
    {children}
  </Link>;
}

export default function FinancePaymentReport() {
  const paymentsQ = usePaymentRegister();
  const invoicesQ = useInvoiceRegister();
  const payments = useMemo(() => paymentsQ.data ?? [], [paymentsQ.data]);
  const invoices = useMemo(() => invoicesQ.data ?? [], [invoicesQ.data]);

  // The months that actually hold a dated event, newest first — the report
  // opens on the period the operator is living in.
  const months = useMemo(() => {
    const set = new Set<string>();
    for (const p of payments) {
      if (p.paid_on) set.add(p.paid_on.slice(0, 7));
      if (p.voided_at) set.add(p.voided_at.slice(0, 7));
    }
    return [...set].sort().reverse();
  }, [payments]);
  const [pickedMonth, setPickedMonth] = useState<string | null>(null);
  const month = pickedMonth ?? months[0] ?? null;

  const received = useMemo(
    () => payments.filter((p) => isLivePayment(p) && month !== null && p.paid_on?.slice(0, 7) === month),
    [payments, month]);
  const corrections = useMemo(
    () => payments.filter((p) => !isLivePayment(p) && month !== null && p.voided_at?.slice(0, 7) === month),
    [payments, month]);
  const balances = useMemo(() => customerBalanceRows(invoices), [invoices]);
  const owing = balances.filter((b) => b.outstanding > 0);
  const unpricedCount = useMemo(() => {
    const seen = new Set<string>();
    for (const r of invoices) {
      if (!seen.has(r.order_id) && !soRemaining(invoices, r.order_id).known) seen.add(r.order_id);
    }
    return seen.size;
  }, [invoices]);
  const storageInvoices = useMemo(
    () => invoices.filter((r) => r.kind !== "sales" && r.status !== "draft"),
    [invoices]);
  const needsReview = balances.filter((b) => b.overpaid > 0);

  if (paymentsQ.isError || invoicesQ.isError) {
    return <div className="p-6"><EmptyState
      title="This report could not be opened"
      detail="Try again."
    /></div>;
  }
  const loading = paymentsQ.isLoading || invoicesQ.isLoading;

  return <div className="p-6 max-w-[1100px] mx-auto" data-testid="payment-report">
    <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <div className="text-label uppercase tracking-[0.12em] text-base-500">Reports · Payment</div>
        <h1 className="text-xl font-semibold">Payment</h1>
      </div>
      <div className="w-[180px]">
        <Select id="payment-report-month" label="Month"
          value={month ?? undefined}
          onValueChange={setPickedMonth}
          disabled={months.length === 0}
          placeholder="No month yet"
          options={months.map((m) => ({ value: m, label: fmtMonth(m) }))} />
      </div>
    </header>

    {loading ? <p className="text-body text-base-500">Loading…</p> : <div className="space-y-4">

      <SectionCard><div className="p-3" data-testid="report-money-received">
        <Head note="Voided payments are not money received and are excluded here; they stay under Payment corrections.">
          Money received</Head>
        <p className="text-body font-semibold mb-2">{moneyReceivedLine(received)}</p>
        <div className="space-y-1">
          {received.map((p) => <Row key={p.id} to={`/finance/payments?payment=${p.id}`}>
            <span className="min-w-0">
              <span className="block text-body font-semibold">{p.receipt_no ?? "Receipt number missing"}</span>
              <span className="block text-label font-normal">
                {p.orders ? `SO-${p.orders.so}` : "SO not available"} · {p.orders?.customer_name ?? "Customer not available"} · {fmtDate(p.paid_on)} · {METHODS[p.method ?? ""] ?? p.method ?? "Method not recorded"}
              </span>
            </span>
            <span className="text-body font-semibold tabular-nums shrink-0">{rm(Number(p.amount))}</span>
          </Row>)}
          {received.length === 0 && <p className="text-label font-normal text-base-400">No money received this month.</p>}
        </div>
      </div></SectionCard>

      <SectionCard><div className="p-3" data-testid="report-customer-balances">
        <Head note={`Today's facts — a balance has no month. Settled orders are excluded.${unpricedCount > 0 ? ` ${unpricedCount} order${unpricedCount === 1 ? "" : "s"} with no recorded value cannot say a balance and ${unpricedCount === 1 ? "is" : "are"} excluded.` : ""}`}>
          Customer balances</Head>
        <div className="space-y-1">
          {owing.map((b) => <Row key={b.orderId} to={`/finance/invoices?invoice=${b.doorId}`}>
            <span className="min-w-0">
              <span className="block text-body font-semibold">{b.so !== null ? `SO-${b.so}` : "SO not available"} · {b.customer}</span>
              {b.storageOwing > 0 && <span className="block text-label font-normal">
                includes storage {rm(b.storageOwing)}</span>}
            </span>
            <span className="text-body font-semibold tabular-nums shrink-0">{rm(b.outstanding)} still needed</span>
          </Row>)}
          {owing.length === 0 && <p className="text-label font-normal text-base-400">No customer owes money.</p>}
        </div>
      </div></SectionCard>

      <SectionCard><div className="p-3" data-testid="report-storage">
        <Head note="Money is recorded against the order, never one paper — each SO's remaining across every kind is under Customer balances. Drafts ask for nothing yet and are excluded.">
          Storage charged and collected</Head>
        <div className="space-y-1">
          {storageInvoices.map((r) => <Row key={r.id} to={`/finance/invoices?invoice=${r.id}`}>
            <span className="min-w-0">
              <span className="block text-body font-semibold">
                {r.invoice_no ?? "Number not issued"}{r.status === "voided" ? " · VOIDED" : ""}
              </span>
              <span className="block text-label font-normal">
                {KIND_WORD[r.kind]} · {r.orders ? `SO-${r.orders.so}` : "SO not available"} · {r.orders?.customer_name ?? "Customer not available"}{r.issued_at ? ` · ${fmtDate(r.issued_at)}` : ""}
              </span>
            </span>
            <span className="text-body font-semibold tabular-nums shrink-0">{rm(Number(r.amount) + Number(r.tax_amount))}</span>
          </Row>)}
          {storageInvoices.length === 0 && <p className="text-label font-normal text-base-400">No storage has been charged.</p>}
        </div>
      </div></SectionCard>

      <SectionCard><div className="p-3" data-testid="report-storage-waived">
        <Head>Storage waived</Head>
        <p className="text-label font-normal text-base-400">
          No storage waiver is recorded yet. The storage waiver journey is not built; when it is,
          every waiver appears here with its reason and approver.</p>
      </div></SectionCard>

      <SectionCard><div className="p-3" data-testid="report-corrections">
        <Head note="A void keeps the payment and reverses its money — nothing is deleted.">
          Payment corrections</Head>
        <div className="space-y-1">
          {corrections.map((p) => <Row key={p.id} to={`/finance/payments?payment=${p.id}`}>
            <span className="min-w-0">
              <span className="block text-body font-semibold">{p.receipt_no ?? "Receipt number missing"} · VOIDED</span>
              <span className="block text-label font-normal">
                {p.orders ? `SO-${p.orders.so}` : "SO not available"} · {p.voided_at ? fmtDate(p.voided_at) : "Date not available"} · {p.void_reason ?? "Reason not available"}
              </span>
            </span>
            <span className="text-body font-semibold tabular-nums shrink-0">{rm(Number(p.amount))}</span>
          </Row>)}
          {corrections.length === 0 && <p className="text-label font-normal text-base-400">No payment was corrected this month.</p>}
        </div>
      </div></SectionCard>

      <SectionCard><div className="p-3" data-testid="report-needs-review">
        <Head note="Money past every recorded obligation. Review the allocation — never auto-create a credit or refund.">
          Money needing review</Head>
        <div className="space-y-1">
          {needsReview.map((b) => <Row key={b.orderId} to={`/finance/invoices?invoice=${b.doorId}`}>
            <span className="block text-body font-semibold min-w-0">{b.so !== null ? `SO-${b.so}` : "SO not available"} · {b.customer}</span>
            <span className="text-body font-semibold tabular-nums shrink-0">{rm(b.overpaid)} needs review</span>
          </Row>)}
          {needsReview.length === 0 && <p className="text-label font-normal text-base-400">No money needs review.</p>}
        </div>
      </div></SectionCard>

    </div>}
  </div>;
}
