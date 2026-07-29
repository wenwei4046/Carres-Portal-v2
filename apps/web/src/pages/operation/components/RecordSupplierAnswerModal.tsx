import { useState } from "react";
import { toast } from "sonner";
import {
  poReceivingProgress,
  purchasingActionButton,
  purchasingActionDone,
  purchasingActionLine,
  tomorrowDeliveryAnswerLabel,
} from "@carres/shared";
import { ApiError } from "@/lib/api";
import {
  useRecordBalanceDateMutation,
  useRecordTomorrowDeliveryMutation,
  type operationPoListRow,
} from "@/lib/queries";
import { fmtDate } from "@/lib/fmt-date";
import { INPUT_CLS, Modal, ModalActions } from "./Modal";

/**
 * P3 · Recording what the supplier said — the ONE form for both supplier calls
 * (`docs/PURCHASING-WORKING-FLOW.md` §3).
 *
 * ONE component for two actions because UI-KIT §6.1 is explicit — the second
 * occurrence is a full stop, extract it first — and the shell here IS the same
 * shell: the action's own row line as the title, the fact the operator is
 * looking at, a date, an optional note, and the action's own Button. Only the
 * QUESTION differs, and that difference is the whole body.
 *
 * **NOT a tick-box.** COPY-STANDARD's no-decorative-checkbox law says that where
 * a form already collects the inputs, that form IS the checklist — so §3's
 * checklist ("ask whether it ships tomorrow · ask for the delivery order ·
 * record the answer · record the quantity they will send") is not drawn a second
 * time beside it.
 *
 * **EVERY VISIBLE STRING IS RULED.** The title is `purchasingActionLine`, the
 * button is `purchasingActionButton`, the toast is `purchasingActionDone`, the
 * two answers are `tomorrowDeliveryAnswerLabel` (COPY-STANDARD's answers table,
 * Loo 2026-07-29), and the balance line is `poReceivingProgress().pendingLabel`
 * — R1's own shipped sentence. The only string not from the dictionary is
 * `Note (optional)`, reused verbatim from the order drawer exactly as C8 did,
 * and reported rather than invented: free text has no dictionary row anywhere.
 *
 * **The date input carries no visible label on purpose.** Under the delayed
 * answer it sits directly beneath `It ships later than {date}`, which has
 * already said what the field is for; a second word above it would be a word
 * nobody ruled. Screen readers get the same sentence through `aria-label`.
 */

type Kind = "tomorrow" | "balance";

interface Props {
  kind: Kind;
  po: operationPoListRow;
  supplierName: string;
  /** The PO LINE this balance call is about. Required when kind = "balance",
   *  because that action is counted per line and nothing else identifies one. */
  poLineId?: string;
  onClose: () => void;
}

export default function RecordSupplierAnswerModal({
  kind,
  po,
  supplierName,
  poLineId,
  onClose,
}: Props) {
  const actionKey =
    kind === "tomorrow"
      ? ("confirm_tomorrows_delivery" as const)
      : ("confirm_balance_delivery_date" as const);

  const [answer, setAnswer] = useState<"shipping" | "delayed">("shipping");
  const [newDate, setNewDate] = useState("");
  const [note, setNote] = useState("");

  const line = poLineId
    ? po.purchase_order_lines.find((l) => l.id === poLineId) ?? null
    : null;

  const tomorrowM = useRecordTomorrowDeliveryMutation();
  const balanceM = useRecordBalanceDateMutation();
  const pending = tomorrowM.isPending || balanceM.isPending;

  const title = purchasingActionLine(actionKey, { supplier: supplierName });
  const primary = purchasingActionButton(actionKey);

  // The expected arrival this call is ABOUT. The engine never raises the
  // tomorrow call without one, so the fallback is unreachable from the UI — it
  // exists so this component cannot render the word "null" if it ever is.
  const aboutDate = po.eta_date ? fmtDate(po.eta_date) : "";

  const canSubmit =
    kind === "tomorrow"
      ? answer === "shipping" || newDate !== ""
      : newDate !== "";

  const onError = (e: unknown) => {
    const msg =
      e instanceof ApiError ? e.message : (e as Error)?.message ?? "Could not save";
    toast.error(msg);
  };
  const onDone = () => {
    const done = purchasingActionDone(actionKey);
    if (done) toast.success(done);
    onClose();
  };

  const submit = () => {
    if (!canSubmit || pending) return;
    if (kind === "tomorrow") {
      tomorrowM.mutate(
        {
          poId: po.id,
          answer,
          ...(answer === "delayed" ? { newDate } : {}),
          ...(note.trim() ? { reason: note.trim() } : {}),
        },
        { onSuccess: onDone, onError },
      );
      return;
    }
    if (!poLineId) return;
    balanceM.mutate(
      {
        poLineId,
        newDate,
        ...(note.trim() ? { reason: note.trim() } : {}),
      },
      { onSuccess: onDone, onError },
    );
  };

  return (
    <Modal title={title} onClose={onClose}>
      <div data-testid={`supplier-answer-${kind}`}>
        {kind === "tomorrow" ? (
          <div className="grid gap-2 mb-4">
            {(["shipping", "delayed"] as const).map((a) => {
              const label = tomorrowDeliveryAnswerLabel(a, aboutDate);
              return (
                <label
                  key={a}
                  className={`flex items-start gap-2.5 px-3 py-2.5 border rounded-[4px] cursor-pointer ${
                    answer === a
                      ? "border-base-700 bg-base-50"
                      : "border-base-200 hover:border-base-300"
                  }`}
                >
                  <input
                    type="radio"
                    name="tomorrow-answer"
                    checked={answer === a}
                    onChange={() => setAnswer(a)}
                    data-testid={`supplier-answer-${a}`}
                    className="mt-0.5"
                  />
                  <span className="text-[13px] text-base-900">{label}</span>
                </label>
              );
            })}

            {answer === "delayed" && (
              <input
                type="date"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                aria-label={tomorrowDeliveryAnswerLabel("delayed", aboutDate)}
                data-testid="supplier-answer-new-date"
                className={INPUT_CLS}
              />
            )}
          </div>
        ) : (
          <div className="grid gap-2 mb-4">
            {/* R1's own sentence about this line — a FACT, so it states what is
                short without a to-do word in it. */}
            <div className="text-[13px] text-base-900" data-testid="balance-line-fact">
              {line?.sku ?? "—"}
              {(() => {
                const p = poReceivingProgress(line ? [line] : []);
                return p.pendingLabel ? ` · ${p.pendingLabel}` : "";
              })()}
            </div>
            <input
              type="date"
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
              aria-label={title}
              data-testid="supplier-answer-new-date"
              className={INPUT_CLS}
            />
          </div>
        )}

        <div className="grid gap-1.5 mb-4">
          {/* Reused verbatim from the order drawer — free text has no dictionary
              row anywhere in COPY-STANDARD, and C8 met the same square and made
              the same call rather than inventing one. Reported, not smuggled. */}
          <span className="t-tiny text-base-500">Note (optional)</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            data-testid="supplier-answer-note"
            className={INPUT_CLS}
          />
        </div>

        <ModalActions
          onCancel={onClose}
          onPrimary={submit}
          primary={primary}
          primaryDisabled={!canSubmit}
          primaryPending={pending}
        />
      </div>
    </Modal>
  );
}
