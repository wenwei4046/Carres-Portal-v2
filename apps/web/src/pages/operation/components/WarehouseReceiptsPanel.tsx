import { useState } from "react";
import { toast } from "sonner";
import { ApiError } from "@/lib/api";
import {
  useOperationWarehouseReceipts,
  useWarehouseReceiptReviewMutation,
  type WarehouseReceiptQueueRow,
} from "@/lib/queries";
import { fmtDate } from "@/lib/fmt-date";

/**
 * WarehouseReceiptsPanel — the ops half of R6, on the Receiving station.
 *
 * The card's done-when is "a Klang receiving lands in the system with zero ops
 * typing — ops only reviews", so this panel offers exactly two moves and
 * neither of them re-enters a number:
 *
 *   Check in   — replay the warehouse's count through the receive engine
 *   Send back  — return it with a reason, so the pallet is counted again
 *
 * **Zero permanent pixels.** The panel renders nothing at all when no count is
 * waiting: an empty band above the queue would train the operator to scroll
 * past the one place a new arrival appears.
 *
 * Check-in is deliberately NOT a form. A count ops disagrees with goes BACK to
 * the only people who can look at the goods again — an ops-side edit field here
 * would be the "zero ops typing" promise quietly withdrawn, and it would make
 * the record say the warehouse counted something it never counted.
 */
export default function WarehouseReceiptsPanel() {
  const { data } = useOperationWarehouseReceipts("submitted");
  const receipts = data?.receipts ?? [];

  if (receipts.length === 0) return null;

  return (
    <section
      className="mb-4 border border-base-200 rounded bg-white"
      data-testid="warehouse-receipts-panel"
    >
      <div className="px-4 py-2.5 border-b border-base-100 bg-base-50 flex items-center gap-2">
        <h2 className="text-[11px] font-bold uppercase tracking-[0.02em] text-base-700">
          Counted by the warehouse
        </h2>
        <span className="font-mono text-[10px] px-1.5 py-px rounded-full bg-base-200 text-base-700">
          {receipts.length}
        </span>
        <span className="text-[11px] text-base-600">
          Nothing has moved yet — check one in to book the goods.
        </span>
      </div>
      <div>
        {receipts.map((r) => (
          <ReceiptRow key={r.id} receipt={r} />
        ))}
      </div>
    </section>
  );
}

function ReceiptRow({ receipt: r }: { receipt: WarehouseReceiptQueueRow }) {
  const [sendingBack, setSendingBack] = useState(false);
  const [reason, setReason] = useState("");

  const checkIn = useWarehouseReceiptReviewMutation("check-in");
  const sendBack = useWarehouseReceiptReviewMutation("send-back");
  const busy = checkIn.isPending || sendBack.isPending;

  async function doCheckIn() {
    try {
      await checkIn.mutateAsync({ receiptId: r.id });
      toast.success(
        `${r.po_id} checked in · DO ${r.do_number}${
          r.opens_claims ? " · supplier claim opened" : ""
        }`,
      );
    } catch (e: unknown) {
      toast.error(
        e instanceof ApiError || e instanceof Error
          ? e.message
          : "Check in failed",
      );
    }
  }

  async function doSendBack() {
    if (reason.trim().length === 0) return;
    try {
      await sendBack.mutateAsync({ receiptId: r.id, reason: reason.trim() });
      toast.success(`${r.po_id} sent back to ${r.warehouse_name ?? "the warehouse"}`);
      setSendingBack(false);
      setReason("");
    } catch (e: unknown) {
      toast.error(
        e instanceof ApiError || e instanceof Error
          ? e.message
          : "Send back failed",
      );
    }
  }

  return (
    <div
      className="border-t border-base-100 px-4 py-3 flex items-start gap-4 flex-wrap"
      data-testid={`warehouse-receipt-${r.po_id}`}
    >
      <div className="min-w-[150px]">
        <div className="font-mono font-semibold text-base-900">{r.po_id}</div>
        <div className="text-[11px] text-base-600 mt-0.5">
          {r.supplier_name ?? "—"} → {r.warehouse_name ?? "—"}
        </div>
      </div>

      <div className="flex-1 min-w-[220px]">
        {/* Composed by the shared module — the warehouse's own list says the
            same sentence about the same receipt. */}
        <div className="text-[12.5px] text-base-800">{r.summary}</div>
        <div className="text-[11px] text-base-600 mt-0.5">
          DO {r.do_number} · counted by {r.submitted_by_name ?? "the warehouse"}{" "}
          · {fmtDate(r.submitted_at)}
        </div>
        {r.note && (
          <div className="text-[11px] text-base-600 mt-1 italic">{r.note}</div>
        )}
        {/* Said BEFORE the button is pressed: a check-in with an issue files a
            case against a supplier, and somebody then has to chase it. */}
        {r.opens_claims && (
          <div
            className="text-[11px] text-danger mt-1"
            data-testid={`warehouse-receipt-claims-${r.po_id}`}
          >
            Checking this in opens a supplier claim.
          </div>
        )}
      </div>

      {sendingBack ? (
        <div className="flex items-start gap-2 flex-wrap">
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="What must they fix?"
            aria-label={`Reason for sending ${r.po_id} back`}
            data-testid={`warehouse-receipt-reason-${r.po_id}`}
            className="w-[230px] px-2 py-1.5 border border-base-300 rounded-[4px] text-[12px] bg-white outline-none focus:border-base-500"
          />
          <button
            type="button"
            onClick={doSendBack}
            disabled={reason.trim().length === 0 || busy}
            className="btn-secondary text-[11px] py-1.5 px-3 disabled:opacity-40"
            data-testid={`warehouse-receipt-confirm-send-back-${r.po_id}`}
          >
            {sendBack.isPending ? "Sending…" : "Send back"}
          </button>
          <button
            type="button"
            onClick={() => {
              setSendingBack(false);
              setReason("");
            }}
            className="btn-ghost text-[11px] py-1.5 px-2"
          >
            Cancel
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSendingBack(true)}
            disabled={busy}
            className="btn-ghost text-[11px] py-1.5 px-2"
            data-testid={`warehouse-receipt-send-back-${r.po_id}`}
          >
            Send back
          </button>
          <button
            type="button"
            onClick={doCheckIn}
            disabled={busy}
            className="btn-primary text-[11px] py-1.5 px-3 disabled:opacity-40"
            data-testid={`warehouse-receipt-check-in-${r.po_id}`}
          >
            {checkIn.isPending ? "Checking in…" : "Check in"}
          </button>
        </div>
      )}
    </div>
  );
}
