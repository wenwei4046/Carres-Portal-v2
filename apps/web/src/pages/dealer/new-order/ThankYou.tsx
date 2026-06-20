import { CheckCircle2 } from "lucide-react";
import type { Order } from "@carres/shared";
import DownloadSalesOrderButton from "@/components/DownloadSalesOrderButton";
import { useAuth } from "@/lib/auth";

interface Props {
  order: Order;
  /** Reset the flow back to a fresh draft + the CATALOG step (no navigation). */
  onNewOrder: () => void;
  /** Leave the POS — caller clears the draft and navigates to the orders list. */
  onClose: () => void;
}

/**
 * Post-submit confirmation screen — 2990s confirmed-screen feel:
 * flame CheckCircle2 icon in a flame-tinted ring, CO-{so} order ref heading,
 * what's-next numbered list, Download Sales Order, and two CTAs:
 *   • "+ New order"  → flame .btn-hero  (resets draft, stays in POS)
 *   • "View orders"  → .btn-secondary   (clears draft, navigates away)
 *
 * Order ID format: `CO-{so}` where so is the dealer-local sequence (the DB
 * column populated by create_order RPC). Same display string the dealer
 * sees on the kanban card.
 */
export default function ThankYou({ order, onNewOrder, onClose }: Props) {
  const role = useAuth((s) => s.role);
  return (
    <div className="animate-page-enter overflow-hidden">
      {/* ── Hero band ── */}
      <div className="px-9 pt-12 pb-8 text-center">
        {/* Flame ring + icon */}
        <div className="w-16 h-16 mx-auto mb-5 rounded-full bg-primary/10 grid place-items-center">
          <CheckCircle2
            size={32}
            strokeWidth={1.75}
            className="text-primary"
            aria-hidden="true"
          />
        </div>

        {/* Order ref */}
        <p className="kicker mb-2">Order confirmed</p>
        <h1 className="t-h2 font-semibold tracking-[-0.025em] text-base-900">
          CO-{order.so}
        </h1>
        <p className="t-body text-base-500 mt-1">
          Submitted to Carres — we'll take it from here.
        </p>
      </div>

      {/* ── Body ── */}
      <div className="px-9 pb-9 text-left space-y-6">
        {/* What's next */}
        <div>
          <p className="kicker mb-3">What happens next</p>
          <ol className="list-none m-0 p-0 space-y-3">
            {[
              <>
                Order sits in <strong className="text-base-800">Place</strong> until you click{" "}
                <em>Proceed</em> when the customer is ready.
              </>,
              "Operation will issue a PO and prepare the goods.",
              <>
                Once the DO is submitted, the order moves to{" "}
                <strong className="text-base-800">Delivered</strong>.
              </>,
            ].map((step, i) => (
              <li key={i} className="flex gap-3 items-start">
                <span className="mt-0.5 flex-shrink-0 w-5 h-5 rounded-full bg-primary/10 text-primary t-tiny font-semibold grid place-items-center">
                  {i + 1}
                </span>
                <span className="t-body text-base-600 leading-snug">{step}</span>
              </li>
            ))}
          </ol>
        </div>

        {/* Download SO */}
        {role && (
          <div>
            <p className="kicker mb-2">Print for customer</p>
            <DownloadSalesOrderButton
              orderId={order.id}
              so={order.so}
              role={role}
              variant="secondary"
              className="w-full"
            />
          </div>
        )}

        {/* CTAs */}
        <div className="flex flex-col gap-2.5 pt-1">
          {/* ONE flame hero CTA on this screen */}
          <button type="button" onClick={onNewOrder} className="btn-hero w-full">
            + New order
          </button>
          <button type="button" onClick={onClose} className="btn-secondary w-full">
            View orders
          </button>
        </div>
      </div>
    </div>
  );
}
