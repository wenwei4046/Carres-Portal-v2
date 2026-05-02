import { useState } from "react";
import type { Order } from "@carres/shared";

interface Props {
  order: Order;
  /** Reset wizard back to a fresh draft + Step 1 (no close). */
  onNewOrder: () => void;
  /** Close the modal entirely and return to dashboard. */
  onClose: () => void;
}

/**
 * Post-submit confirmation screen. Shows the freshly minted order_no, a
 * one-click copy of the reference, customer name + total, and the two
 * obvious next-actions: file another order, or back to the kanban.
 *
 * Order ID format: `CO-{dl}` where dl is the dealer-local sequence (the DB
 * column populated by create_order RPC). Same display string the dealer
 * sees on the kanban card.
 */
export default function ThankYou({ order, onNewOrder, onClose }: Props) {
  const [copied, setCopied] = useState(false);
  const orderNo = `CO-${order.dl}`;
  const total =
    (order.lines ?? []).reduce((s, l) => s + l.unitPrice * l.qty, 0) +
    (order.addons ?? []).reduce((s, a) => s + a.unitPrice * a.qty, 0);
  // Stair carry isn't included here — display total stays consistent with the
  // wizard preview which excluded stair when total was sub+addon. The order
  // detail page renders the authoritative grand total via order-totals.ts.

  function copy() {
    void navigator.clipboard.writeText(orderNo).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="px-7 py-10 flex flex-col items-center text-center">
      <div className="w-16 h-16 rounded-full bg-emerald-100 grid place-items-center text-3xl text-emerald-600 mb-4">
        ✓
      </div>
      <h2 className="font-display text-2xl font-semibold tracking-tight mb-1.5">
        Order placed
      </h2>
      <p className="text-sm text-muted-foreground mb-6">
        {order.customer.name} · RM {total.toLocaleString()}
      </p>

      <div className="flex items-center gap-2 mb-7">
        <code className="font-mono text-base tracking-[0.16em] px-3 py-2 rounded-md bg-secondary border border-border">
          {orderNo}
        </code>
        <button
          type="button"
          onClick={copy}
          className="text-xs px-3 py-2 rounded-md border border-border hover:border-primary"
          aria-label="Copy order number"
        >
          {copied ? "✓ Copied" : "Copy"}
        </button>
      </div>

      <div className="flex flex-col sm:flex-row gap-2.5 w-full max-w-sm">
        <button
          type="button"
          onClick={onNewOrder}
          className="flex-1 px-4 py-2.5 rounded-md border border-border text-sm font-semibold hover:border-primary"
        >
          + New order
        </button>
        <button
          type="button"
          onClick={onClose}
          className="flex-1 px-4 py-2.5 rounded-md bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90"
        >
          Back to dashboard
        </button>
      </div>
    </div>
  );
}
