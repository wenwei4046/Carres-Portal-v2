/**
 * THE SALES ORDER'S PAYMENT LEDGER — read-only, forever (ownership Law B).
 *
 * The MONEY card stated three numbers and nothing about how they were reached,
 * so an operator asked "has the deposit come in?" and had to leave for the
 * Payments desk to find out. This prints the `order_payments` rows the desk
 * already owns: WHEN the money was taken, HOW, HOW MUCH, against WHAT
 * reference, which receipt and slip prove it, and WHO recorded it.
 *
 * ⛔ IT MAY NEVER GAIN A FORM. Recording, voiding, refunding and allocating are
 * Payment's acts; this is a SUMMARY, and the mechanical test in
 * `ERP-ARCHITECTURE.md` Law B is what keeps it one — remove every control here
 * and no business record becomes unreachable, because the card's header already
 * carries `Open this order in Payments`, which is the Law C door.
 *
 * ⭐ A VOIDED ROW STAYS, AND IS NOT MONEY (0343/0347). A void is a STAMP, never
 * a delete: money history is never erased. The row prints struck through and
 * stamped so the reader sees that it HAPPENED and was reversed — which is the
 * question somebody asks when a customer says "but I paid". `isLivePayment` is
 * the ONE predicate for that; no reader spells `voided_at` itself.
 *
 * ⭐ NOTHING HERE IS ADDED UP. `Paid` and `Outstanding` are stated by the card
 * from `orderMoney`, because summing these rows would be a second arithmetic
 * for one fact (Law D) and would go wrong on exactly the rows that look most
 * ordinary: a `counted_in_paid: false` history mirror of a deposit the create
 * door already banked, and every `storage` collection, which is a different
 * debt with a different clock.
 */
// design-standard: not-a-list-page — this is the MONEY card's own ledger, not
// a page. It has no destination, no toolbar and no header of its own: the card
// owns its heading and its `Open this order in Payments` door, and the rows are
// this one order's fixed history — no sort, no filter, no selection. Wrapping
// it in ListPageShell would draw a second page chrome inside one card.
import { isLivePayment, type OrderPaymentRow } from "@carres/shared";
import { fmtMoney } from "@carres/shared";
import Loading from "@/components/kit/Loading";
import EmptyState from "@/components/kit/EmptyState";
import { fmtDate } from "@/lib/fmt-date";
import { payMethodWord, viewSlip } from "@/lib/payment-display";
import { useOrderPayments } from "@/lib/queries";
import type { SalesOrderTemplateData } from "@/lib/pdf/types";

/** What the row is FOR, when it is not the ordinary case. A `payment` needs no
 *  word; a deposit and a storage collection are different debts and say so. */
function kindWord(kind: OrderPaymentRow["kind"]): string | null {
  if (kind === "deposit") return "Deposit";
  if (kind === "storage") return "Storage fee";
  return null;
}

export default function PaymentLedger({
  orderId,
  savedPayments,
  summaryLoading,
  summaryError,
}: {
  orderId: string | null;
  savedPayments?: SalesOrderTemplateData["payments"];
  summaryLoading?: boolean;
  summaryError?: boolean;
}) {
  const q = useOrderPayments(orderId);

  if (!orderId) return null;
  if (q.isLoading) return <Loading label="Opening the payments" />;

  /* A LEDGER THE READER MAY NOT SEE IS NOT AN EMPTY LEDGER. The route answers
     403 to anyone who is not operation/principal, and printing "No payments"
     at a salesperson would state, as a fact, that a customer has paid nothing.
     Absence is not zero. */
  if (q.isError) {
    const forbidden = (q.error as { status?: number } | null)?.status === 403;
    return (
      <p className="text-meta text-base-500" data-testid="so-payments-unreadable">
        {forbidden
          ? "Payments are not available to your role — open the order in Payments."
          : "The payments could not be opened."}
      </p>
    );
  }

  const ledger = q.data?.payments ?? [];
  // Older orders can have an at-sale payment but no ledger row. Reuse the
  // saved document's payment projection; never create a payment or add the
  // summary to a nonempty ledger (including a ledger containing only voids).
  if (ledger.length === 0 && summaryLoading) return <Loading label="Opening the payments" />;
  if (ledger.length === 0 && summaryError) {
    return <p className="text-meta text-base-500" data-testid="so-payments-unreadable">The payments could not be opened.</p>;
  }
  const rows = ledger.length > 0
    ? ledger.map((payment) => ({ payment, summary: null }))
    : (savedPayments ?? []).map((summary) => ({ payment: null, summary }));
  if (rows.length === 0) {
    return (
      <div data-testid="so-payments-empty">
        <EmptyState title="No payment has been recorded on this order" />
      </div>
    );
  }

  return (
    /* The page never scrolls sideways; a narrow container scrolls THIS box. */
    <div className="overflow-x-auto">
      <table className="w-full text-body" data-testid="so-payments">
        <thead>
          <tr className="text-label text-base-500">
            <th className="align-middle py-1 pr-3 text-left font-medium">Date</th>
            <th className="align-middle py-1 pr-3 text-left font-medium">Method</th>
            <th className="align-middle py-1 pr-3 text-right font-medium">Amount</th>
            <th className="align-middle py-1 pr-3 text-left font-medium">Reference</th>
            <th className="align-middle py-1 pr-3 text-left font-medium">Receipt</th>
            <th className="align-middle py-1 pr-3 text-left font-medium">Slip</th>
            <th className="align-middle py-1 text-left font-medium">Recorded by</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ payment: p, summary }, index) => {
            const live = p ? isLivePayment(p) : true;
            const kind = p ? kindWord(p.kind) : null;
            return (
              <tr
                key={p?.id ?? `saved-payment-${index}`}
                className={`border-t border-kit-slate-5 ${live ? "" : "text-base-500"}`}
                data-testid={!p ? "so-payment-summary-row" : live ? "so-payment-row" : "so-payment-row-voided"}
              >
                <td className="align-middle py-1.5 pr-3 whitespace-nowrap">{fmtDate(p?.paid_on ?? summary?.date ?? null)}</td>
                <td className="align-middle py-1.5 pr-3">
                  <div>{p ? payMethodWord(p.method) : summary?.label}</div>
                  {kind && <div className="mt-0.5 text-meta text-base-600">{kind}</div>}
                </td>
                <td className={`align-middle py-1.5 pr-3 text-right tabular-nums whitespace-nowrap ${live ? "" : "line-through"}`}>
                  {fmtMoney(Number(p?.amount ?? summary?.amount ?? 0))}
                </td>
                <td className="align-middle py-1.5 pr-3 font-mono text-meta">{(p ? p.reference : summary?.reference) || "Not recorded"}</td>
                <td className="align-middle py-1.5 pr-3 font-mono text-meta">{p?.receipt_no || "Not recorded"}</td>
                <td className="align-middle py-1.5 pr-3">
                  {p?.receipt_url ? (
                    <button
                      type="button"
                      onClick={() => void viewSlip(p)}
                      className="text-meta font-medium text-kit-blue-11 underline-offset-2 hover:underline"
                    >
                      View slip
                    </button>
                  ) : (
                    <span className="text-meta text-base-500">Not recorded</span>
                  )}
                </td>
                <td className="align-middle py-1.5">
                  {/* The saved summary's collector is not a ledger recorder. */}
                  <div>{p?.recorded_by_name || "Not recorded"}</div>
                  {!live && p && (
                    <div className="mt-0.5 text-meta font-medium text-danger">
                      Voided{p.void_reason ? ` · ${p.void_reason}` : ""}
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
