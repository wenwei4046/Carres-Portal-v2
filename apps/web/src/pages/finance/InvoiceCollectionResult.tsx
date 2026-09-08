import { useState } from "react";
import type { InvoiceRegisterRow } from "@carres/shared/payment-invoice-register";
import {
  COLLECTION_OUTCOMES,
  COLLECTION_OUTCOME_NEXT,
  COLLECTION_OUTCOME_WORD,
  type CollectionOutcome,
} from "@carres/shared/payment-collection-outcome";
import { SectionCard } from "@/components/SectionPanel";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { qk } from "@/lib/queries";
import { toast } from "sonner";

/**
 * Record the result — the §3 structured collection outcome (0446).
 *
 * Five approved results, one obvious button each. `Customer will pay on a
 * date` asks for its date and nothing else does; the door refuses a past
 * date, so the field cannot offer one either.
 *
 * ⛔ `Customer paid` IS NOT MONEY, and the page says so: the balance stays
 * open until the payment is recorded through the posting door. That is §3's
 * "`Done` never replaces authoritative completion" on screen.
 */
function todayIso(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kuala_Lumpur" });
}

export default function InvoiceCollectionResult({ invoice, onClose }: {
  invoice: InvoiceRegisterRow;
  onClose: () => void;
}) {
  const [outcome, setOutcome] = useState<CollectionOutcome | null>(null);
  const [promisedDate, setPromisedDate] = useState("");
  const [note, setNote] = useState("");
  const qc = useQueryClient();

  const record = useMutation({
    mutationFn: () => apiFetch(`/api/finance/invoices/${invoice.id}/collection-outcome`, {
      method: "POST",
      body: JSON.stringify({
        outcome,
        promisedDate: outcome === "will_pay_on_date" ? promisedDate : null,
        note: note.trim() || null,
      }),
    }),
    onSuccess: () => {
      toast.success("Result recorded");
      void qc.invalidateQueries({ queryKey: ["finance", "collection-outcomes", invoice.id] });
      void qc.invalidateQueries({ queryKey: qk.finance.invoiceRegister(), exact: true });
      onClose();
    },
    onError: (e: Error) => toast.error(`The result was not recorded — ${e.message}`),
  });

  const needsDate = outcome === "will_pay_on_date";
  const ready = outcome != null && (!needsDate || promisedDate >= todayIso());

  return <div className="flex-1 overflow-auto p-4" data-testid="invoice-collection-result">
    <SectionCard><div className="p-4">
      <h2 className="text-strong mb-2">What did the customer say?</h2>
      <div className="space-y-2 text-body">
        <div className="space-y-1">
          {COLLECTION_OUTCOMES.map((key) => <button key={key} type="button"
            onClick={() => setOutcome(key)}
            aria-pressed={outcome === key}
            className={`block w-full rounded-control border px-2 py-1.5 text-left ${
              outcome === key
                ? "border-kit-blue-9 bg-kit-blue-3"
                : "border-base-200 bg-white hover:bg-hovertint"}`}>
            <span className="block text-body font-semibold">{COLLECTION_OUTCOME_WORD[key]}</span>
            <span className="block text-label font-normal">{COLLECTION_OUTCOME_NEXT[key]}</span>
          </button>)}
        </div>

        {needsDate && <label className="block">
          <span className="text-label">The day the customer promised</span>
          <input type="date" value={promisedDate} min={todayIso()}
            onChange={(e) => setPromisedDate(e.target.value)}
            aria-label="The day the customer promised"
            className="mt-0.5 w-full rounded-md border border-base-200 px-2 py-1.5 text-body" />
          <span className="text-label font-normal">A promise cannot be for a day that has passed.</span>
        </label>}

        <label className="block">
          <span className="text-label">Anything to add (optional)</span>
          <input value={note} onChange={(e) => setNote(e.target.value)}
            aria-label="Anything to add"
            className="mt-0.5 w-full rounded-md border border-base-200 px-2 py-1.5 text-body" />
        </label>

        {outcome === "customer_paid" && <p className="text-label font-normal"
          data-testid="said-paid-is-not-money">
          This only records what the customer said. The amount still needed does not change
          until the payment is recorded with its evidence.</p>}

        <div className="flex gap-2 pt-1">
          <button className="btn-primary" disabled={!ready || record.isPending}
            onClick={() => record.mutate()}>Record the result</button>
          <button className="btn-secondary" onClick={onClose}>Back</button>
        </div>
      </div>
    </div></SectionCard>
  </div>;
}
