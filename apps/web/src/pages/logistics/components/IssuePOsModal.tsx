import { toast } from "sonner";
import { ApiError } from "@/lib/api";
import {
  useIssuePosForOrderMutation,
  type LogisticsOrderDetailOrder,
} from "@/lib/queries";
import { Modal, ModalActions } from "./Modal";

/**
 * IssuePOsModal — confirms auto-issuing one or more POs to cover the
 * shortages on an `awaiting_logistics_action` order. Shortages are grouped by supplier
 * server-side (per `logistics_issue_pos_for_order` RPC), so the preview is
 * "you'll create N POs across M suppliers".
 *
 * Mirrors `reference/proto/logistics-orders.jsx` shortage-driven flow
 * (lines 412-424 + 32-88 in logistics-actions.jsx). The proto does NOT have
 * a dedicated dialog — the action bar's "Create PO for shortages" button
 * directly stashes a prefill request and navigates to procurement. v2
 * surfaces a small confirmation modal so logistics can preview the shortage
 * count before it commits — proto's silent jump-to-procurement felt
 * surprising during M5.0 testing per the carry-forward in CLAUDE.md.
 */
interface Shortage {
  sku: string;
  short: number;
}

interface Props {
  order: LogisticsOrderDetailOrder;
  shortages: Shortage[];
  onClose: () => void;
}

export default function IssuePOsModal({ order, shortages, onClose }: Props) {
  const issue = useIssuePosForOrderMutation(order.id);
  const totalShort = shortages.reduce((s, x) => s + x.short, 0);
  const valid = shortages.length > 0 && !issue.isPending;

  async function submit() {
    if (!valid) return;
    try {
      const res = await issue.mutateAsync();
      const n = res.pos_created?.length ?? 0;
      toast.success(`Issued ${n} PO${n === 1 ? "" : "s"} for #${order.dl}`);
      onClose();
    } catch (e: unknown) {
      if (e instanceof ApiError) toast.error(e.message || "Issue POs failed");
      else toast.error(e instanceof Error ? e.message : "Issue POs failed");
    }
  }

  return (
    <Modal title={`Issue purchase orders · #${order.dl}`} onClose={onClose}>
      <div className="text-[12px] text-base-600 mb-3.5 font-body">
        We&rsquo;ll group shortages by supplier and auto-issue one PO per
        supplier. Each line uses the suggested supplier from the SKU&rsquo;s
        category mapping.
      </div>

      {shortages.length === 0 ? (
        <div className="text-[12px] text-success px-3 py-2.5 bg-success-soft rounded-[4px] mb-4">
          No shortages — every line is covered by current stock.
        </div>
      ) : (
        <div className="border border-base-200 rounded-[4px] overflow-hidden mb-4">
          <div className="px-3 py-2 bg-base-50 border-b border-base-200 text-[11px] font-semibold uppercase tracking-[0.12em] text-base-700">
            Shortages ({shortages.length} SKU{shortages.length === 1 ? "" : "s"} · {totalShort} unit{totalShort === 1 ? "" : "s"})
          </div>
          <div className="max-h-[240px] overflow-auto">
            {shortages.map((s, i) => (
              <div
                key={s.sku}
                className={`flex justify-between items-center px-3 py-2 text-[12px] ${i ? "border-t border-dashed border-base-100" : ""}`}
              >
                <span className="font-mono text-[11px] text-base-700">{s.sku}</span>
                <span className="font-mono text-[11px] text-warning font-semibold">
                  short {s.short}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <ModalActions
        onCancel={onClose}
        onPrimary={submit}
        primary="Issue POs"
        primaryDisabled={!valid}
        primaryPending={issue.isPending}
      />
    </Modal>
  );
}
