/**
 * SalesOrderAmendment — governed proposal, impact and management decision.
 *
 * A contractual change (items · price · promised date · instalment plan) is
 * not a correction: the customer agreed to those, so they travel as a proposed
 * amendment the customer must accept. This slice owns proposal, impact,
 * management decision, atomic apply, stale refusal and the resulting revision.
 *
 * ```
 * SUBMIT   records a proposal. The sales order does not move.
 * IMPACT   reads every affected owner and writes none of them.
 * DECIDE   Principal rejects, or approves + applies in one DB transaction.
 * ```
 *
 * WHAT THIS SCREEN MUST NOT DO, and the reason is the whole card: an open
 * amendment must NOT lock the phone number, the address or the notes beside
 * it. `LOCK THE CONSEQUENCE, NOT THE WHOLE DOCUMENT` — a customer who has not
 * replied yet must not be able to freeze a typo fix. So this component draws
 * a panel and no disabled state anywhere else on the page.
 *
 * STALE is the guard the owner confirmed. The amendment binds the CLASS A
 * fields it was computed from. A Class B correction landing while it waits
 * leaves it valid, by definition of the allowlist; another Class A change
 * makes it STALE, because the customer would otherwise be accepting a document
 * that is no longer true.
 */
import { useEffect, useState } from "react";
import { toast } from "sonner";
import Button from "@/components/kit/Button";
import DatePicker from "@/components/kit/DatePicker";
import Modal from "@/components/kit/Modal";
import Textarea from "@/components/kit/Textarea";
import Input from "@/components/kit/Input";
import { useAuth } from "@/lib/auth";
import { fmtDate } from "@/lib/fmt-date";
import {
  useDecideSalesOrderAmendment,
  useSalesOrderAmendment,
  useSalesOrderAmendmentImpact,
  useSubmitSalesOrderAmendment,
  type AmendmentProposal,
} from "@/lib/queries";

export interface AmendmentLine {
  id?: string;
  sku: string;
  qty: number;
  unit_price: number;
}

export default function SalesOrderAmendment({
  orderId,
  currentLines,
  currentDeliveryDate = null,
  currentDeliveryDateTbd = false,
  currentInstallmentMonths = null,
  proposalSeed,
}: {
  orderId: string;
  /** The order's lines today — the proposal starts as a copy of them. */
  currentLines: AmendmentLine[];
  currentDeliveryDate?: string | null;
  currentDeliveryDateTbd?: boolean;
  currentInstallmentMonths?: number | null;
  proposalSeed?: AmendmentProposal | null;
}) {
  const liveQ = useSalesOrderAmendment(orderId);
  const amendment = liveQ.data?.amendment ?? null;
  const impactQ = useSalesOrderAmendmentImpact(amendment?.id ?? null);
  const role = useAuth((s) => s.role);

  const [open, setOpen] = useState(false);
  const [lines, setLines] = useState<AmendmentLine[]>([]);
  const [reason, setReason] = useState("");
  const [decisionReason, setDecisionReason] = useState("");
  const [deliveryDate, setDeliveryDate] = useState<string | null>(currentDeliveryDate);
  const [deliveryDateTbd, setDeliveryDateTbd] = useState(currentDeliveryDateTbd);
  const [installmentMonths, setInstallmentMonths] = useState<number | null>(currentInstallmentMonths);

  const submitMut = useSubmitSalesOrderAmendment(orderId, {
    onSuccess: (r) => {
      toast.success(`Proposed from Rev ${r.base_revision}`);
      setOpen(false);
      setReason("");
    },
    onError: (e) => toast.error(e.message),
  });
  const decideMut = useDecideSalesOrderAmendment(orderId, {
    onSuccess: (r) => {
      toast.success(r.status === "applied" ? `Approved · Rev ${r.revision}` : "Amendment rejected");
      setDecisionReason("");
    },
    onError: (e) => toast.error(e.message),
  });

  const startProposal = (seed?: AmendmentProposal | null) => {
    setLines((seed?.lines ?? currentLines).map((l) => ({ ...l })));
    setDeliveryDate(seed && "delivery_date" in seed ? (seed.delivery_date ?? null) : currentDeliveryDate);
    setDeliveryDateTbd(seed && "delivery_date_tbd" in seed ? Boolean(seed.delivery_date_tbd) : currentDeliveryDateTbd);
    setInstallmentMonths(seed && "installment_months" in seed ? (seed.installment_months ?? null) : currentInstallmentMonths);
    setReason("");
    setOpen(true);
  };

  useEffect(() => {
    if (proposalSeed) startProposal(proposalSeed);
    // A seed is an explicit user action; current facts are intentionally captured at that moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proposalSeed]);

  const changed = lines.some((l, i) => {
    const was = currentLines[i];
    return !was || was.qty !== l.qty || was.unit_price !== l.unit_price;
  }) || deliveryDate !== currentDeliveryDate || deliveryDateTbd !== currentDeliveryDateTbd
    || installmentMonths !== currentInstallmentMonths;

  const proposal = (): AmendmentProposal => ({
    lines,
    delivery_date: deliveryDate,
    delivery_date_tbd: deliveryDateTbd,
    installment_months: installmentMonths,
  });

  return (
    <div data-testid="amendment-lane">
      {amendment ? (
        <div
          className={`rounded-card border px-3 py-2.5 ${
            amendment.stale ? "border-danger bg-white" : "border-kit-slate-5 bg-kit-slate-3"
          }`}
          data-testid="amendment-open"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-label font-semibold tracking-wide text-base-700 uppercase">
              {amendment.stale ? "Out of date — propose again" : "Waiting for management"}
            </span>
            <span className="text-meta text-base-500">
              From Rev {amendment.base_revision} · {fmtDate(amendment.submitted_at, { time: true })}
            </span>
          </div>

          {amendment.reason && (
            <p className="text-meta text-base-700 mt-1.5 break-words">Reason — {amendment.reason}</p>
          )}

          <p className="text-body text-base-900 mt-2">
            {amendment.stale
              ? "The order's items, price or promised date changed after this was written. The customer would be agreeing to something that is no longer true — write a new proposal from the order as it stands now."
              : "The proposal has not been approved, so the Sales Order has not changed. Contact and address corrections are still free to save."}
          </p>

          {(impactQ.data?.findings ?? []).length > 0 && (
            <div className="mt-3 border-t border-kit-slate-5 pt-2" data-testid="amendment-impact">
              <div className="text-label text-base-500">Before approval</div>
              <ul className="mt-1.5 grid gap-1 sm:grid-cols-2">
                {(impactQ.data?.findings ?? []).map((finding) => (
                  <li key={`${finding.owner}-${finding.kind}`} className="text-meta text-base-700">
                    <a className="underline underline-offset-2" href={finding.href}>{finding.owner}</a>
                    {finding.amount != null
                      ? ` · RM ${Number(finding.amount).toLocaleString()}`
                      : ` · ${finding.count}`}
                  </li>
                ))}
              </ul>
              <p className="mt-1.5 text-meta text-base-500">
                These are read-only consequences. Open the owning module to handle its work.
              </p>
            </div>
          )}

          {role === "principal" && !amendment.stale && (
            <div className="mt-3 border-t border-kit-slate-5 pt-3">
              <Textarea
                id="amendment-decision-reason"
                label="Management decision reason"
                rows={2}
                value={decisionReason}
                onChange={(e) => setDecisionReason(e.target.value)}
              />
              <div className="mt-2 flex justify-end gap-2">
                <Button
                  variant="neutral"
                  disabled={!decisionReason.trim()}
                  loading={decideMut.isPending}
                  onClick={() => decideMut.mutate({ amendmentId: amendment.id, decision: "reject", note: decisionReason.trim() })}
                >
                  Reject
                </Button>
                <Button
                  variant="primary"
                  disabled={!decisionReason.trim()}
                  loading={decideMut.isPending}
                  onClick={() => decideMut.mutate({ amendmentId: amendment.id, decision: "approve", note: decisionReason.trim() })}
                >
                  Approve and apply
                </Button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-end gap-2">
          {/* ⭐ THE STANDING EXPLANATION IS GONE — YH, 2026-08-26. The line read
              "Items, price and the promised date are what the customer agreed
              to — they change by proposal, not by editing", and it was written
              when those three sat beside EDITABLE boxes and the reader had to
              be told why some fields opened and others did not. They are
              read-only facts now, so the sentence explains a distinction the
              screen no longer draws, and the modal states the rule where it is
              actually needed.

              🟡 THE DOOR ITSELF STAYS, and that is deliberate rather than a
              half-done removal. YH asked for the button to go too, on the
              grounds that "the 3 dates in order info are fixed" — true of the
              DATES, and `Amend delivery date` covers those on its own. But this
              modal is also the ONLY way to change ITEMS, UNIT PRICE and
              INSTALMENT MONTHS anywhere on the Sales Order (its single mount is
              asserted by the ui-contract suite). Deleting it would retire three
              capabilities on a reason that names none of them, so it is raised
              rather than assumed. */}
          <Button size="sm" variant="neutral" onClick={() => startProposal()} data-testid="amendment-open-form">
            Propose a change to the customer
          </Button>
        </div>
      )}

      <Modal
        open={open}
        onOpenChange={setOpen}
        title="Propose a change to the customer"
        description="This records a proposal. The sales order does not change until the customer agrees."
        width="wide"
        footer={
          <span className="flex items-center gap-3 pt-1">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={!changed || !reason.trim()}
              loading={submitMut.isPending}
              onClick={() =>
                submitMut.mutate({ proposed: proposal(), reason: reason.trim() })
              }
              data-testid="amendment-submit"
            >
              Record the proposal
            </Button>
          </span>
        }
      >
        <div className="flex flex-col gap-3">
          {lines.map((l, i) => (
            <div key={`${l.sku}-${i}`} className="grid grid-cols-[1fr_90px_130px] items-end gap-2">
              <div className="text-body text-base-900 pb-1.5 break-words">{l.sku}</div>
              <Input
                id={`amd-qty-${i}`}
                label="Qty"
                type="number"
                min={1}
                value={String(l.qty)}
                onChange={(e) =>
                  setLines((ls) =>
                    ls.map((x, j) =>
                      j === i ? { ...x, qty: Math.max(1, Number(e.target.value) || 1) } : x,
                    ),
                  )
                }
              />
              <Input
                id={`amd-price-${i}`}
                label="Unit price (RM)"
                type="number"
                min={0}
                value={String(l.unit_price)}
                onChange={(e) =>
                  setLines((ls) =>
                    ls.map((x, j) =>
                      j === i ? { ...x, unit_price: Math.max(0, Number(e.target.value) || 0) } : x,
                    ),
                  )
                }
              />
            </div>
          ))}
          <div className="grid grid-cols-2 gap-3">
            <DatePicker
              id="amd-delivery-date"
              label="Promised delivery"
              disabled={deliveryDateTbd}
              value={deliveryDate}
              onChange={setDeliveryDate}
            />
            <Input
              id="amd-installment-months"
              label="Instalment months"
              type="number"
              min={0}
              value={installmentMonths == null ? "" : String(installmentMonths)}
              onChange={(e) => setInstallmentMonths(e.target.value === "" ? null : Math.max(0, Number(e.target.value) || 0))}
            />
          </div>
          <label className="flex items-center gap-2 text-body text-base-700">
            <input
              type="checkbox"
              checked={deliveryDateTbd}
              onChange={(e) => setDeliveryDateTbd(e.target.checked)}
            />
            Delivery date to be confirmed
          </label>
          <Textarea
            id="amd-reason"
            label="Why is this changing?"
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
      </Modal>
    </div>
  );
}
