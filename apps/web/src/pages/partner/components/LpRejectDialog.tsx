import { useState } from "react";
import { toast } from "sonner";
import { ApiError } from "@/lib/api";
import { useLpRejectOrder } from "@/lib/queries";

/**
 * LpRejectDialog — Migration 0147 (item h, 2026-05-23).
 *
 * Partner-side modal for rejecting an incoming delivery assignment. Reason
 * is REQUIRED — the RPC raises 22023 detail 'reason_required' on empty,
 * so the FE gate enforces the same up front for a clean UX. The reason
 * surfaces back to Operation in the red-badge tooltip + reselect dialog.
 */
interface Props {
  orderId: string;
  so: number;
  onClose: () => void;
}

interface ApiErrorBody {
  code?: string;
  message?: string;
}

function readErrorBody(err: ApiError): ApiErrorBody {
  return (err.body ?? {}) as ApiErrorBody;
}

export default function LpRejectDialog({ orderId, so, onClose }: Props) {
  const [reason, setReason] = useState("");
  const reject = useLpRejectOrder(orderId);
  const trimmed = reason.trim();
  const tooLong = trimmed.length > 500;
  const valid = trimmed.length > 0 && !tooLong && !reject.isPending;

  async function submit() {
    if (!valid) return;
    try {
      await reject.mutateAsync({ reason: trimmed });
      toast.success(`#${so} rejected · sent back to Operation`);
      onClose();
    } catch (e: unknown) {
      if (e instanceof ApiError) {
        const body = readErrorBody(e);
        if (body.code === "already_accepted") {
          toast.error("Already accepted — refresh and check");
        } else if (body.code === "already_rejected") {
          toast.error("Already rejected — refresh");
        } else {
          toast.error(e.message || "Reject failed");
        }
      } else {
        toast.error(e instanceof Error ? e.message : "Reject failed");
      }
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/40"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="bg-card border border-border rounded-md w-full max-w-md p-5"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={`Reject delivery #${so}`}
      >
        <div className="text-[14px] font-semibold mb-2">
          Reject delivery · #{so}
        </div>
        <p className="text-[12px] text-muted-foreground mb-3">
          Tell Operation why you can&rsquo;t take this delivery. They&rsquo;ll
          see your reason and pick a different LP.
        </p>

        <label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          Reason *
        </label>
        <textarea
          autoFocus
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. out of capacity for that zone this week"
          rows={4}
          className="w-full mt-1 mb-1 px-2 py-1.5 border border-border rounded text-[12px] font-body focus:outline-none focus:border-primary"
          aria-label="Reject reason"
        />
        <div className="text-[10px] text-muted-foreground mb-3 flex justify-between">
          <span>Required</span>
          <span className={tooLong ? "text-destructive font-semibold" : ""}>
            {trimmed.length}/500
          </span>
        </div>

        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={onClose}
            className="text-[12px] px-3 py-1.5 rounded border border-border hover:bg-accent/40"
            disabled={reject.isPending}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            className="text-[12px] px-3 py-1.5 rounded bg-destructive text-destructive-foreground font-semibold disabled:opacity-40"
            disabled={!valid}
          >
            {reject.isPending ? "Rejecting…" : "Reject"}
          </button>
        </div>
      </div>
    </div>
  );
}
