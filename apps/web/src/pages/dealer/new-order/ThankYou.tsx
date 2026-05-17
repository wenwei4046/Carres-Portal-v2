import type { Order } from "@carres/shared";
import DownloadSalesOrderButton from "@/components/DownloadSalesOrderButton";
import { useAuth } from "@/lib/auth";

interface Props {
  order: Order;
  /** Reset wizard back to a fresh draft + Step 1 (no close). */
  onNewOrder: () => void;
  /** Close the modal entirely and return to dashboard. */
  onClose: () => void;
}

/**
 * Post-submit confirmation screen — proto-faithful: solid sage success badge
 * + "Thank you" hero + "What's next" 3-step list + two CTA buttons.
 *
 * Order ID format: `CO-{so}` where so is the dealer-local sequence (the DB
 * column populated by create_order RPC). Same display string the dealer
 * sees on the kanban card.
 */
export default function ThankYou({ order, onNewOrder, onClose }: Props) {
  const role = useAuth((s) => s.role);
  return (
    <div className="text-center overflow-hidden">
      <div className="px-9 pt-11 pb-7 bg-base-50">
        <div className="w-16 h-16 mx-auto mb-[18px] rounded-full bg-success text-white grid place-items-center text-[28px] leading-none">
          ✓
        </div>
        <div className="font-display text-[32px] tracking-[-0.025em] font-semibold leading-tight">
          Thank you
        </div>
        <div className="text-sm text-base-600 mt-1.5">
          Order <span className="font-mono font-semibold text-base-900">CO-{order.so}</span> has
          been submitted to Carres.
        </div>
      </div>
      <div className="px-9 pt-5 pb-7 text-left">
        <div className="label mb-1.5">What's next</div>
        <ol className="m-0 pl-[18px] text-[13px] text-base-700 leading-[1.7] font-body list-decimal">
          <li>
            Order sits in <strong>Place</strong> until you click <em>Proceed</em> when the
            customer is ready.
          </li>
          <li>operation will issue a PO and prepare the goods.</li>
          <li>
            Once the DO is submitted, the order moves to <strong>Delivered</strong>.
          </li>
        </ol>
        {role && (
          <div className="mt-[22px]">
            <div className="label mb-1.5">Print for customer</div>
            <DownloadSalesOrderButton
              orderId={order.id}
              so={order.so}
              role={role}
              variant="secondary"
              className="w-full"
            />
          </div>
        )}
        <div className="flex gap-2.5 mt-[22px]">
          <button type="button" onClick={onNewOrder} className="btn-secondary flex-1">
            + New order
          </button>
          <button type="button" onClick={onClose} className="btn-primary flex-1">
            Back to dashboard
          </button>
        </div>
      </div>
    </div>
  );
}
