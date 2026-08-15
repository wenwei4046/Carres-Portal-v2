/**
 * CorrectionWorkList — STAGE 3 · card 3.4, the receiving module's own list.
 *
 * ONE component, TWO surfaces, and the difference between them IS the law:
 *
 * ```
 * canClose = false   the SALES ORDER's side. It shows what this change caused
 *                    and offers no way to tick it off — the module that raised
 *                    the work does not close it.
 * canClose = true    the RECEIVING module's page. Someone there looks, and
 *                    says so.
 * ```
 *
 * `LINEAGE IS NOT PERMISSION.` Closing a row records that a human looked. It
 * does not touch the purchase order, the receipt, the invoice or the trip —
 * and the sentence on the row says so out loud, because an operator who reads
 * "never auto-revised" knows the PO is still theirs to change by hand.
 *
 * The row's sentence is the FLOOR EVALUATOR's, stored as raised. It is not
 * re-worded here: one arithmetic, one wording (ERP-ARCHITECTURE Law D).
 */
import { useState } from "react";
import { toast } from "sonner";
import Button from "@/components/kit/Button";
import { fmtDate } from "@/lib/fmt-date";
import { useCloseCorrectionWork, type CorrectionWorkRow } from "@/lib/queries";

/** Plain words for the module that owns the correction — no module codenames. */
const OWNER_WORD: Record<CorrectionWorkRow["module"], string> = {
  purchasing: "Purchasing",
  operation: "Operation",
  delivery: "Delivery",
  finance: "Finance",
};

function Row({ row, canClose }: { row: CorrectionWorkRow; canClose: boolean }) {
  const [note, setNote] = useState("");
  const [asking, setAsking] = useState(false);
  const closeMut = useCloseCorrectionWork({
    onSuccess: (r) => {
      toast.success(r.already_closed ? "Already closed" : "Closed");
      setAsking(false);
      setNote("");
    },
    /* The refusal that matters carries its own sentence — "closed by the module
     * that receives it, not the one that raised it" — so the operator learns
     * the rule instead of meeting a generic failure. */
    onError: (e) => toast.error(e.message),
  });

  const done = row.state === "closed";
  return (
    <li
      className={`rounded-card border px-3 py-2.5 ${
        done ? "border-kit-slate-5 bg-kit-slate-3" : "border-kit-slate-5 bg-white"
      }`}
      data-testid={`correction-work-${row.id}`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-label font-semibold tracking-wide text-base-700 uppercase">
          {OWNER_WORD[row.module]}
          {row.shared && (
            <span className="ml-2 rounded-full bg-base-900 px-2 py-0.5 text-meta font-semibold text-white normal-case">
              Shared
            </span>
          )}
        </span>
        <span className="text-meta text-base-500">
          {row.orders ? `SO-${row.orders.so} · ` : ""}Rev {row.revision} ·{" "}
          {fmtDate(row.raised_at, { time: true })}
        </span>
      </div>

      <p className="text-body text-base-900 mt-1 break-words">{row.evidence}</p>

      {done ? (
        <p className="text-meta text-base-500 mt-1.5">
          Closed {fmtDate(row.closed_at, { time: true })}
          {row.closed_note ? ` — ${row.closed_note}` : ""}
        </p>
      ) : canClose ? (
        <div className="mt-2">
          {asking ? (
            <div className="flex flex-wrap items-center gap-2">
              <input
                aria-label="What did you find?"
                placeholder="What did you find?"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="h-8 min-w-[16rem] flex-1 rounded-control border border-base-200 px-2 text-body"
              />
              <Button
                size="sm"
                variant="primary"
                loading={closeMut.isPending}
                onClick={() => closeMut.mutate({ id: row.id, note: note.trim() || undefined })}
                data-testid="correction-work-confirm-close"
              >
                Close this work
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setAsking(false)}>
                Cancel
              </Button>
            </div>
          ) : (
            <Button
              size="sm"
              variant="neutral"
              onClick={() => setAsking(true)}
              data-testid="correction-work-close"
            >
              Close this work
            </Button>
          )}
        </div>
      ) : (
        /* The read-only side says WHY there is no button here. */
        <p className="text-meta text-base-500 mt-1.5">
          {OWNER_WORD[row.module]} closes this — the sales order raised it.
        </p>
      )}
    </li>
  );
}

export default function CorrectionWorkList({
  work,
  canClose,
  emptyWord,
}: {
  work: CorrectionWorkRow[];
  canClose: boolean;
  /** What the surface says when it holds nothing. */
  emptyWord: string;
}) {
  if (work.length === 0) {
    return <p className="text-body text-base-500">{emptyWord}</p>;
  }
  return (
    <ul className="flex flex-col gap-2" data-testid="correction-work-list">
      {work.map((row) => (
        <Row key={row.id} row={row} canClose={canClose} />
      ))}
    </ul>
  );
}
