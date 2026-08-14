/**
 * CancelSalesOrderDialog — the governed door for cancelling one customer
 * transaction (SO V2 Cancel slice, migration 0350).
 *
 * **Cancel means the customer transaction was cancelled.** It is not a way to
 * fix a wrong record — that is `Staff correction` through the governed edit /
 * amendment lane — and it is not a way to re-order, because the same
 * transaction keeps the same SO number (MASTER, Sales Order rules).
 *
 * THREE THINGS THIS SURFACE OWES THE OPERATOR, and it is here because nothing
 * else was giving them:
 *
 *   1 · WHETHER IT CAN BE CANCELLED AT ALL, in words. A proceeded order fails
 *       safe in the database; before this dialog the operator learned that by
 *       pressing the button and reading an error. Now the refusal is on screen
 *       before the reason box, and the destructive action is simply absent.
 *
 *   2 · WHAT ELSE THIS RAISES. The impact read names the seven owners that
 *       hold something open on this order. They are CONSEQUENCES, not
 *       blockers: cancelling the customer's order does not cancel a supplier's
 *       PO, release a reserved unit or refund a ringgit. Each owner keeps its
 *       own door, and this dialog links to them and writes none of them.
 *
 *   3 · THE MONEY THAT IS NOW EXPOSED. Money already collected against goods
 *       the customer will not receive is stated plainly. Releasing it is the
 *       principal's decision through the refund record (0345), so this dialog
 *       says the obligation exists and never spends it.
 *
 * The reason is REQUIRED — the database refuses a blank one, and the button
 * stays disabled so the operator never meets that refusal as an error.
 */
import { useState } from "react";
import Modal from "@/components/kit/Modal";
import Button from "@/components/kit/Button";
import Textarea from "@/components/kit/Textarea";
import Loading from "@/components/kit/Loading";
import { useCancelOrder, useSalesOrderCancelImpact } from "@/lib/queries";
import { toast } from "sonner";

export default function CancelSalesOrderDialog({
  orderId,
  so,
  open,
  onOpenChange,
  onCancelled,
}: {
  orderId: string;
  so: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Fired once the transaction is cancelled, so the caller can refresh. */
  onCancelled?: () => void;
}) {
  const [reason, setReason] = useState("");
  const impactQ = useSalesOrderCancelImpact(orderId, open);
  const cancelMut = useCancelOrder(orderId, {
    onSuccess: () => {
      toast.info(`SO-${so} cancelled`);
      setReason("");
      onOpenChange(false);
      onCancelled?.();
    },
    onError: (err) => toast.error(err.message || "This order could not be cancelled"),
  });

  const impact = impactQ.data ?? null;
  const findings = impact?.findings ?? [];
  /* Only the owners actually holding something reach the screen — a row of
     seven zeroes is noise, and an empty consequence list is a real answer. */
  const openFindings = findings.filter(
    (f) => f.count > 0 || (f.amount != null && Number(f.amount) > 0),
  );
  const canCancel = impact?.cancellable === true;

  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        if (!next) setReason("");
        onOpenChange(next);
      }}
      title={`Cancel SO-${so}`}
      description="The customer cancelled this order. The order keeps its number and nothing is deleted."
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} data-testid="cancel-so-close">
            Keep the order
          </Button>
          {/* Kit law: there is no danger variant — §3.3 gives red one job, and
              a destructive action is a neutral button whose WORD says what it
              does. `Cancel SO-{so}` names the record it ends. */}
          {canCancel && (
            <Button
              variant="neutral"
              disabled={!reason.trim()}
              loading={cancelMut.isPending}
              onClick={() => cancelMut.mutate({ reason: reason.trim() })}
              data-testid="cancel-so-confirm"
            >
              Cancel SO-{so}
            </Button>
          )}
        </div>
      }
    >
      {impactQ.isLoading && <Loading label="Checking what this order still holds" />}

      {impactQ.isError && (
        <p className="text-body text-base-700" data-testid="cancel-so-impact-error">
          What this order still holds could not be read, so it is not safe to cancel it here yet.
        </p>
      )}

      {impact && (
        <div className="grid gap-3">
          {!canCancel && (
            <p className="text-body text-base-900" data-testid="cancel-so-refusal">
              {impact.refusal}
            </p>
          )}

          {canCancel && openFindings.length > 0 && (
            <div data-testid="cancel-so-impact">
              <div className="text-label text-base-500">This order still holds</div>
              <ul className="mt-1.5 grid gap-1 sm:grid-cols-2">
                {openFindings.map((finding) => (
                  <li key={`${finding.owner}-${finding.kind}`} className="text-meta text-base-700">
                    <a className="underline underline-offset-2" href={finding.href}>
                      {finding.owner}
                    </a>
                    {finding.amount != null
                      ? ` · RM ${Number(finding.amount).toLocaleString()}`
                      : ` · ${finding.count}`}
                  </li>
                ))}
              </ul>
              <p className="mt-1.5 text-meta text-base-500">
                Cancelling the customer's order does not close these. Open each owner to handle its
                own work.
              </p>
            </div>
          )}

          {canCancel && Number(impact.paid) > 0 && (
            <p className="text-body text-base-900" data-testid="cancel-so-money">
              The customer has paid RM {Number(impact.paid).toLocaleString()} on this order. Money
              already collected stays recorded — giving it back is a separate decision.
            </p>
          )}

          {canCancel && (
            <Textarea
              id="cancel-so-reason"
              label="Why is this order cancelled"
              required
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              data-testid="cancel-so-reason"
            />
          )}
        </div>
      )}
    </Modal>
  );
}
