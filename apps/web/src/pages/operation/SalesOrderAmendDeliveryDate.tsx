/**
 * AMEND DELIVERY DATE — the three fields, wired to the governed machinery.
 *
 * Copied in SHAPE from 2990's amend block (owner ruling 2026-08-15) and in
 * NOTHING else: 2990 writes the new date onto the order. Here the promised date
 * is what the customer agreed to, so the same three fields open the ONE
 * amendment lane —
 *
 * ```
 * Amend date (from customer)   the day the customer ASKED. Not today.
 * Amended delivery date        what the promise becomes IF it is approved.
 * Amend reason *               mandatory. Six months later it is the only
 *                              answer to "why did the promise move".
 * ```
 *
 * ONE MACHINERY, NOT A SECOND DOOR. This submits `sales_order_submit_amendment`
 * — the same RPC, the same one-live-per-order index, the same Before/After and
 * the same Rev N+1 on approval — as `Propose a change to the customer` beside
 * it. It is a narrower FORM over the same act, not a second record (ownership
 * Law C). While an amendment is open this block states that and submits
 * nothing: two live proposals would be two documents claiming to be the
 * contract.
 *
 * THE ORDER DOES NOT MOVE HERE. Submitting records a proposal; the document
 * preview keeps rendering the current effective Revision until management
 * approves.
 */
import { useState } from "react";
import { toast } from "sonner";
import Button from "@/components/kit/Button";
import DatePicker from "@/components/kit/DatePicker";
import Textarea from "@/components/kit/Textarea";
import { fmtDate } from "@/lib/fmt-date";
import { useSubmitSalesOrderAmendment, type SalesOrderAmendment } from "@/lib/queries";

/** Today as `YYYY-MM-DD`, read in LOCAL time so the day never shifts. */
function todayIso(): string {
  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${mm}-${dd}`;
}

export default function SalesOrderAmendDeliveryDate({
  orderId,
  currentDeliveryDate,
  liveAmendment,
  onDone,
}: {
  orderId: string;
  currentDeliveryDate: string | null;
  /** The order's open amendment, if any — this block yields to it. */
  liveAmendment: SalesOrderAmendment | null;
  /** ⭐ Called after a proposal is recorded (YH, 2026-08-27). The three fields
   *  live in a MODAL now, opened from beside `Customer Delivery`, and a modal
   *  that stays open over a form it has already submitted reads as a failure.
   *  Optional, so the component still stands alone. */
  onDone?: () => void;
}) {
  const [askedOn, setAskedOn] = useState<string | null>(null);
  const [newDate, setNewDate] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const submitMut = useSubmitSalesOrderAmendment(orderId, {
    onSuccess: (r) => {
      toast.success(`Proposed from Rev ${r.base_revision}`);
      setAskedOn(null);
      setNewDate(null);
      setReason("");
      onDone?.();
    },
    onError: (e) => toast.error(e.message),
  });

  if (liveAmendment) {
    return (
      <p className="text-meta text-base-600" data-testid="amend-delivery-date-waiting">
        {liveAmendment.stale
          ? "A proposal on this order is out of date. Write a new one from the order as it stands now."
          : "A proposal is waiting for management. The delivery date changes when it is approved."}
      </p>
    );
  }

  const moved = Boolean(newDate) && newDate !== currentDeliveryDate;
  const ready = moved && reason.trim().length > 0;

  return (
    <div className="flex flex-col gap-3" data-testid="amend-delivery-date">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <DatePicker
          id="so-amend-asked-on"
          label="Amend date (from customer)"
          hint="The day the customer asked"
          value={askedOn}
          onChange={setAskedOn}
        />
        <DatePicker
          id="so-amend-new-date"
          label="Amended delivery date"
          hint={
            currentDeliveryDate
              ? `Promised today — ${fmtDate(currentDeliveryDate)}`
              : "No delivery date promised yet"
          }
          value={newDate}
          onChange={setNewDate}
        />
      </div>
      <Textarea
        id="so-amend-reason"
        label="Amend reason"
        required
        rows={2}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
      {/* The `creates a Revision · needs approval` line moved to the modal's
          description (YH, 2026-08-27) — it is the first thing read on opening,
          rather than a footnote beside the button that commits it. */}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button
          size="sm"
          variant="neutral"
          disabled={!ready}
          loading={submitMut.isPending}
          data-testid="amend-delivery-date-submit"
          onClick={() =>
            submitMut.mutate({
              proposed: { delivery_date: newDate, delivery_date_tbd: false },
              reason: reason.trim(),
              /* A day nobody typed is not "today" — it is unknown, and the
                 door refuses a future one outright. */
              customerAskedOn: askedOn && askedOn <= todayIso() ? askedOn : null,
            })
          }
        >
          Record the proposal
        </Button>
      </div>
    </div>
  );
}
