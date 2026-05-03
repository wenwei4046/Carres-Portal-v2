import { useState } from "react";
import { toast } from "sonner";
import { ApiError } from "@/lib/api";
import {
  useAttachDoMutation,
  type LogisticsOrderDetailOrder,
  type LogisticsOrderDetailWarehouse,
  type LogisticsOrderDetailLine,
} from "@/lib/queries";
import { INPUT_CLS, Modal, ModalActions } from "./Modal";

/**
 * DOAttachModal — attaches a Delivery Order number and flips the order to
 * delivered. Decrements stock from the source warehouse on success.
 *
 * Mirrors `reference/proto/logistics-orders.jsx` `DOAttachDialog`
 * (lines 493-527):
 *   - Title: "Attach Delivery Order · #{dl}"
 *   - Body intro: "Once attached, the order moves to Delivered and N items
 *     will be deducted from {warehouse}."
 *   - Required DO# input (auto-suggested "DO-{9800-9999}" — random)
 *   - Optional DO note textarea (2 rows)
 *   - Required "Customer signed the DO on receipt" checkbox (bordered, dashed)
 *   - Primary: "Mark delivered" — disabled until DO# >= 3 chars AND signed
 *
 * Per plan: photo upload was mentioned in M5 Task 2 instructions, but the
 * proto's DOAttachDialog has NO photo upload — only DO# / note / signed
 * checkbox. We follow proto fidelity (Loo's hard requirement).
 */
interface Props {
  order: LogisticsOrderDetailOrder;
  warehouse: LogisticsOrderDetailWarehouse | null;
  lines: LogisticsOrderDetailLine[];
  onClose: () => void;
}

function totalItems(lines: LogisticsOrderDetailLine[]): number {
  return lines.reduce((s, l) => s + Number(l.qty || 0), 0);
}

function suggestDoNumber(): string {
  return "DO-" + (9800 + Math.floor(Math.random() * 200));
}

export default function DOAttachModal({ order, warehouse, lines, onClose }: Props) {
  const [doNumber, setDoNumber] = useState(suggestDoNumber);
  const [doNote, setDoNote] = useState("");
  const [signed, setSigned] = useState(false);

  const attach = useAttachDoMutation(order.id);
  const itemCount = totalItems(lines);
  const valid = doNumber.trim().length >= 3 && signed && !attach.isPending;

  async function submit() {
    if (!valid) return;
    try {
      await attach.mutateAsync({
        doNumber: doNumber.trim(),
        doNote: doNote.trim() || undefined,
        signed: true,
      });
      toast.success(`#${order.dl} delivered · stock deducted`);
      onClose();
    } catch (e: unknown) {
      if (e instanceof ApiError) toast.error(e.message || "Mark delivered failed");
      else toast.error(e instanceof Error ? e.message : "Mark delivered failed");
    }
  }

  return (
    <Modal title={`Attach Delivery Order · #${order.dl}`} onClose={onClose}>
      <div className="text-[12px] text-base-600 mb-3.5 font-body">
        Once attached, the order moves to <strong>Delivered</strong> and{" "}
        {itemCount} item{itemCount === 1 ? "" : "s"} will be deducted from{" "}
        <strong>{warehouse?.name ?? "the source warehouse"}</strong>.
      </div>

      <div className="grid gap-3 mb-4">
        <div>
          <label className="label mb-1.5 block" htmlFor="do-number-input">
            DO number *
          </label>
          <input
            id="do-number-input"
            value={doNumber}
            onChange={(e) => setDoNumber(e.target.value)}
            className={INPUT_CLS}
          />
        </div>
        <div>
          <label className="label mb-1.5 block" htmlFor="do-note-input">
            Note (optional)
          </label>
          <textarea
            id="do-note-input"
            rows={2}
            value={doNote}
            onChange={(e) => setDoNote(e.target.value)}
            placeholder="e.g. Delivered at lobby · customer signed"
            className={`${INPUT_CLS} resize-y`}
          />
        </div>
        <label className="flex gap-2 items-center px-3 py-2.5 border border-dashed border-base-300 rounded-[4px] cursor-pointer">
          <input
            type="checkbox"
            checked={signed}
            onChange={(e) => setSigned(e.target.checked)}
            className="accent-primary"
          />
          <span className="text-[12px] font-body">
            Customer signed the DO on receipt
          </span>
        </label>
      </div>

      <ModalActions
        onCancel={onClose}
        onPrimary={submit}
        primary="Mark delivered"
        primaryDisabled={!valid}
        primaryPending={attach.isPending}
      />
    </Modal>
  );
}
