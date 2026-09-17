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
import { atSalePaymentWord, payMethodWord, viewSlip } from "@/lib/payment-display";
import { useOrderPayments } from "@/lib/queries";

/** What the row is FOR, when it is not the ordinary case. A `payment` needs no
 *  word; a deposit and a storage collection are different debts and say so. */
function kindWord(kind: OrderPaymentRow["kind"]): string | null {
  if (kind === "deposit") return "Deposit";
  if (kind === "storage") return "Storage fee";
  return null;
}

export interface SavedPaymentDetails {
  paid: number;
  method?: string | null;
  months?: number | null;
  reference?: string | null;
  slip?: string | null;
}

export default function PaymentLedger({ orderId, saved }: {
  orderId: string | null;
  saved?: SavedPaymentDetails;
}) {
  const q = useOrderPayments(orderId);

  if (!orderId) return null;
  const hasSavedEvidence = Boolean(saved && (saved.paid > 0 || saved.method || saved.reference || saved.slip));
  const capture = hasSavedEvidence && saved ? (
    <div className="mb-3 text-body" data-testid="so-payment-saved">
      <p className="font-medium">Payment details recorded at sale</p>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-body" aria-label="Payment details recorded at sale">
          <thead>
            <tr className="text-label text-base-500">
              <th scope="col" className="py-2 pr-4 text-left font-medium align-top">Method</th>
              <th scope="col" className="py-2 pr-4 text-left font-medium align-top">Reference</th>
              <th scope="col" className="py-2 text-left font-medium align-top">Slip</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-kit-slate-5">
              <td className="py-2 pr-4 align-top" data-testid="money-instalment">{atSalePaymentWord(saved.method, saved.months) || "Not recorded"}</td>
              <td className="py-2 pr-4 align-top break-words font-mono text-meta">{saved.reference || "Not recorded"}</td>
              <td className="py-2 align-top">{saved.slip ? (
                <button type="button" onClick={() => void viewSlip({ receipt_url: saved.slip! })}
                  className="text-meta font-medium text-kit-blue-11 underline-offset-2 hover:underline">View slip</button>
              ) : "Not recorded"}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  ) : null;
  if (q.isLoading || q.isPending) return <>{capture}<Loading label="Opening the payments" /></>;

  // Saved order evidence remains visible when the separate transaction read fails.
  if (q.isError) {
    const forbidden = (q.error as { status?: number } | null)?.status === 403;
    return <>{capture}
      <p className="text-meta text-base-500" data-testid="so-payments-unreadable">
        {forbidden
          ? "Payments are not available to your role — open the order in Payments."
          : "The payments could not be opened."}
      </p>
    </>;
  }

  const rows = q.data?.payments ?? [];
  if (rows.length === 0) {
    if (saved && (saved.paid > 0 || saved.reference || saved.slip)) {
      return <>{capture}<p className="text-meta text-base-600">
        {saved.paid > 0
          ? "The order records a paid amount. Individual payment transactions are not available."
          : "Payment evidence is saved, but the recorded paid amount is zero. Check this order in Payments."}
      </p></>;
    }
    return <>{capture}<div data-testid="so-payments-empty">
      <EmptyState title="No payment transactions to show" />
    </div></>;
  }

  return (
    /* The page never scrolls sideways; a narrow container scrolls THIS box. */
    <>{capture}<div className="overflow-x-auto">
      <table className="w-full text-body" data-testid="so-payments">
        <thead>
          <tr className="text-label text-base-500">
            <th className="py-2 pr-4 text-left font-medium align-top whitespace-nowrap">Date</th>
            <th className="py-2 pr-4 text-left font-medium align-top">Method</th>
            <th className="py-2 pr-4 text-right font-medium align-top whitespace-nowrap">Amount</th>
            <th className="py-2 pr-4 text-left font-medium align-top">Reference</th>
            <th className="py-2 pr-4 text-left font-medium align-top">Receipt</th>
            <th className="py-2 pr-4 text-left font-medium align-top">Slip</th>
            <th className="py-2 text-left font-medium align-top">Recorded by</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => {
            const live = isLivePayment(p);
            const kind = kindWord(p.kind);
            return (
              <tr
                key={p.id}
                className={`border-t border-kit-slate-5 ${live ? "" : "text-base-500"}`}
                data-testid={live ? "so-payment-row" : "so-payment-row-voided"}
              >
                <td className="py-2 pr-4 align-top whitespace-nowrap">{fmtDate(p.paid_on)}</td>
                <td className="py-2 pr-4 align-top">
                  <div>{payMethodWord(p.method)}</div>
                  {kind && <div className="mt-0.5 text-meta text-base-600">{kind}</div>}
                </td>
                <td className={`py-2 pr-4 align-top text-right tabular-nums whitespace-nowrap ${live ? "" : "line-through"}`}>
                  {fmtMoney(Number(p.amount ?? 0))}
                </td>
                <td className="py-2 pr-4 align-top font-mono text-meta">{p.reference || "Not recorded"}</td>
                <td className="py-2 pr-4 align-top font-mono text-meta">{p.receipt_no || "Not recorded"}</td>
                <td className="py-2 pr-4 align-top">
                  {p.receipt_url ? (
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
                <td className="py-2 align-top">
                  <div>{p.recorded_by_name || "Not recorded"}</div>
                  {!live && (
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
    </div></>
  );
}
