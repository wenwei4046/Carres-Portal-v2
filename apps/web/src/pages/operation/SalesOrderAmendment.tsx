/**
 * SalesOrderAmendment — STAGE 3 · card 3.5, the spine and NOTHING past it.
 *
 * A contractual change (items · price · promised date · instalment plan) is
 * not a correction: the customer agreed to those, so they travel as a proposed
 * AMENDMENT the customer must accept. Stage 3 builds the record and the
 * concurrency guard; it does not build the document, the signature or the
 * apply — those are the owner's wall.
 *
 * ```
 * SUBMIT   here.  Records a proposal. The sales order does not move.
 * ISSUE    NOT BUILT — the amendment document's form is undecided.
 * ACCEPT   NOT BUILT — the signing mechanism is with legal counsel.
 * APPLY    exists ONLY as a refusal, and the refusal is the deliverable.
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
import { useState } from "react";
import { toast } from "sonner";
import Button from "@/components/kit/Button";
import Modal from "@/components/kit/Modal";
import Textarea from "@/components/kit/Textarea";
import Input from "@/components/kit/Input";
import { fmtDate } from "@/lib/fmt-date";
import {
  useSalesOrderAmendment,
  useSubmitSalesOrderAmendment,
  type AmendmentProposal,
} from "@/lib/queries";

export interface AmendmentLine {
  sku: string;
  qty: number;
  unit_price: number;
}

export default function SalesOrderAmendment({
  orderId,
  currentLines,
}: {
  orderId: string;
  /** The order's lines today — the proposal starts as a copy of them. */
  currentLines: AmendmentLine[];
}) {
  const liveQ = useSalesOrderAmendment(orderId);
  const amendment = liveQ.data?.amendment ?? null;

  const [open, setOpen] = useState(false);
  const [lines, setLines] = useState<AmendmentLine[]>([]);
  const [reason, setReason] = useState("");

  const submitMut = useSubmitSalesOrderAmendment(orderId, {
    onSuccess: (r) => {
      toast.success(`Proposed from Rev ${r.base_revision}`);
      setOpen(false);
      setReason("");
    },
    onError: (e) => toast.error(e.message),
  });

  const startProposal = () => {
    setLines(currentLines.map((l) => ({ ...l })));
    setReason("");
    setOpen(true);
  };

  const changed = lines.some((l, i) => {
    const was = currentLines[i];
    return !was || was.qty !== l.qty || was.unit_price !== l.unit_price;
  });

  const proposal = (): AmendmentProposal => ({ lines });

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
              {amendment.stale ? "Out of date — propose again" : "Waiting for the customer"}
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
              : "The customer has not agreed yet, so the sales order has not changed. Contact and address corrections are still free to save."}
          </p>

          {/* THE WALL, said on the screen rather than hidden in a comment. */}
          <p className="text-meta text-base-500 mt-2" data-testid="amendment-wall">
            Sending this to the customer for signature is not built yet.
          </p>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-meta text-base-500">
            Items, price and the promised date are what the customer agreed to — they change by
            proposal, not by editing.
          </p>
          <Button size="sm" variant="neutral" onClick={startProposal} data-testid="amendment-open-form">
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
              disabled={!changed}
              loading={submitMut.isPending}
              onClick={() =>
                submitMut.mutate({ proposed: proposal(), reason: reason.trim() || undefined })
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
