import { Check, Plus } from "lucide-react";
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
 * Post-submit confirmation — prototype skin (`.confirm`, Loo's Claude Design
 * 2026-07-04): left hero (check ring, "Order confirmed · CO-{so}" eyebrow,
 * "Welcome home, {first name}." Bodoni-accent headline, arrival line, CTA
 * row) + right `.confirm__panel` receipt (items + totals from the created
 * order). Order ID format stays `CO-{so}` (dealer-local sequence from the
 * create_order RPC — same string the kanban card shows).
 */
export default function ThankYou({ order, onNewOrder, onClose }: Props) {
  const role = useAuth((s) => s.role);
  const firstName = order.customer.name?.trim().split(/\s+/)[0] || "friend";
  const itemCount = (order.lines ?? []).reduce((s, l) => s + l.qty, 0);
  const itemsTotal = (order.lines ?? []).reduce((s, l) => s + l.unitPrice * l.qty, 0);
  const addonsTotal = (order.addons ?? []).reduce((s, a) => s + a.unitPrice * a.qty, 0);
  const total = itemsTotal + addonsTotal;

  return (
    <div className="confirm">
      {/* ── Hero ── */}
      <div className="confirm__hero">
        <div className="confirm__hero-inner">
          <div className="confirm__check">
            <Check size={26} strokeWidth={2.5} />
          </div>
          <div className="confirm__eyebrow">Order confirmed · CO-{order.so}</div>
          <h1 className="confirm__head">
            Welcome <span className="accent">home</span>, {firstName}.
          </h1>
          <p className="confirm__sub">
            Your {itemCount} {itemCount === 1 ? "piece" : "pieces"} will arrive{" "}
            {order.delivery.dateTbd ? (
              <strong>on a date to be confirmed</strong>
            ) : order.delivery.date ? (
              <strong>on {order.delivery.date}</strong>
            ) : (
              <strong>on a date we'll confirm with the customer</strong>
            )}
            . The order sits in <strong>Place</strong> until it's proceeded; operation takes it
            from there.
          </p>
          <div className="confirm__cta-row">
            <button type="button" className="btn btn--primary btn--lg" onClick={onNewOrder}>
              <Plus size={16} strokeWidth={2} />
              New order
            </button>
            {role && (
              <DownloadSalesOrderButton
                orderId={order.id}
                so={order.so}
                role={role}
                variant="secondary"
              />
            )}
            <button type="button" className="btn btn--ghost btn--lg" onClick={onClose}>
              View orders
            </button>
          </div>
        </div>
      </div>

      {/* ── Receipt panel ── */}
      <aside className="confirm__panel">
        <div className="summary__head">
          <div className="summary__order">CO-{order.so}</div>
          <div className="summary__title">Receipt</div>
        </div>
        <div className="summary__body">
          <div className="summary__section">
            <div className="summary__section-label">Items</div>
            <div className="summary__items">
              {(order.lines ?? []).map((l, i) => (
                <div key={l.id ?? i} className="summary__item">
                  <div className="summary__item-photo" style={{ background: "var(--c-beige)" }} />
                  <div className="summary__item-main">
                    <div className="summary__item-name">{l.sku}</div>
                    <div className="summary__item-meta">qty {l.qty}</div>
                  </div>
                  <span className="summary__item-price">
                    <sup>RM</sup>
                    {(l.unitPrice * l.qty).toLocaleString("en-MY")}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {(order.addons ?? []).length > 0 && (
            <div className="summary__section">
              <div className="summary__section-label">Add-ons</div>
              {(order.addons ?? []).map((a, i) => (
                <div key={a.id ?? i} className="summary__row">
                  <span className="key">
                    {a.addonKey}
                    {a.qty > 1 ? ` × ${a.qty}` : ""}
                  </span>
                  <span className="val">
                    +RM{(a.unitPrice * a.qty).toLocaleString("en-MY")}
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="summary__section">
            <div className="summary__section-label">Payment</div>
            <div className="summary__row">
              <span className="key">Received</span>
              <span className="val">RM{order.paid.toLocaleString("en-MY")}</span>
            </div>
            {total - order.paid > 0 && (
              <div className="summary__row">
                <span className="key">Balance due</span>
                <span className="val">RM{(total - order.paid).toLocaleString("en-MY")}</span>
              </div>
            )}
          </div>
        </div>
        <div className="summary__foot">
          <div className="summary__total-row">
            <span className="summary__total-label">Total</span>
            <span className="summary__total-num">
              <sup>RM</sup>
              {total.toLocaleString("en-MY")}
            </span>
          </div>
        </div>
      </aside>
    </div>
  );
}
