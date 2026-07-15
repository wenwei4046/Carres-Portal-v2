import { useMemo, useState } from "react";
import { Check, CheckCircle2, Gift, Plus, QrCode } from "lucide-react";
import type { CatalogResponse, Order } from "@carres/shared";
import DownloadSalesOrderButton from "@/components/DownloadSalesOrderButton";
import { useAuth } from "@/lib/auth";
import { usePwpCodesByOrder } from "@/lib/queries";
import StripeCollectModal from "../pos/StripeCollectModal";

interface Props {
  order: Order;
  /** POS catalog bundle — resolves each line's MODEL PHOTO + product name
   *  (order_lines only carry the sku). Absent/unknown sku falls back to the
   *  bare sku code + beige placeholder tile (pre-photo behaviour). */
  catalog?: CatalogResponse | null;
  /** 0224 — the order was submitted with the Stripe method but is STILL
   *  unpaid (dealer kept it for a WhatsApp'd link): shows a "Collect online"
   *  button for this amount. Null for paid / non-Stripe orders. */
  stripeCollectAmount?: number | null;
  /** 0224 pay-before-create — the amount ALREADY collected via Stripe before
   *  this screen mounted (the wizard's QR flow). Seeds the receipt panel. */
  stripeCollectedAmount?: number;
  /** Reset the flow back to a fresh draft + the CATALOG step (no navigation). */
  onNewOrder: () => void;
  /** Leave the POS — caller clears the draft and navigates to the orders list. */
  onClose: () => void;
}

/** sku → { name, variant, photo } off the catalog bundle (same photo source
 *  as OrderSummaryRail — the MODEL's photo_url). Missing catalog → empty map. */
function skuInfoMap(catalog: CatalogResponse | null | undefined) {
  const map = new Map<string, { name: string; variant: string | null; photo: string | null }>();
  if (!catalog) return map;
  const modelById = new Map(catalog.models.map((m) => [m.id, m]));
  for (const s of catalog.skus) {
    const model = modelById.get(s.modelId);
    map.set(s.sku, {
      name: model?.name ?? s.sku,
      variant: s.variant && s.variant.trim().length > 0 ? s.variant : null,
      photo: model?.photoUrl ?? null,
    });
  }
  return map;
}

/**
 * Post-submit confirmation — prototype skin (`.confirm`, Loo's Claude Design
 * 2026-07-04): left hero (check ring, "Order confirmed · CO-{so}" eyebrow,
 * "Welcome home, {first name}." Bodoni-accent headline, arrival line, CTA
 * row) + right `.confirm__panel` receipt (items + totals from the created
 * order). Order ID format stays `CO-{so}` (dealer-local sequence from the
 * create_order RPC — same string the kanban card shows).
 */
export default function ThankYou({
  order,
  catalog,
  stripeCollectAmount,
  stripeCollectedAmount,
  onNewOrder,
  onClose,
}: Props) {
  const role = useAuth((s) => s.role);
  const firstName = order.customer.name?.trim().split(/\s+/)[0] || "friend";
  // 0224 — Stripe collect-at-handover: the QR / link modal opens by itself
  // right after submit; the customer pays before walking away. `collected`
  // folds the recorded amount into the receipt panel (the `order` prop is a
  // point-in-time snapshot — orders.paid moved server-side).
  const [collectOpen, setCollectOpen] = useState(() => (stripeCollectAmount ?? 0) > 0);
  const [collected, setCollected] = useState(stripeCollectedAmount ?? 0);
  // Item photo + product name off the catalog (Loo 2026-07-14 — the receipt
  // showed a bare beige tile + the raw sku code; it should read like the
  // pre-submit OrderSummaryRail: model photo, product name, variant meta).
  const infoBySku = useMemo(() => skuInfoMap(catalog), [catalog]);
  const addonNameByKey = useMemo(
    () => new Map((catalog?.addons ?? []).map((a) => [a.key, a.name])),
    [catalog],
  );
  const itemCount = (order.lines ?? []).reduce((s, l) => s + l.qty, 0);
  const itemsTotal = (order.lines ?? []).reduce((s, l) => s + l.unitPrice * l.qty, 0);
  const addonsTotal = (order.addons ?? []).reduce((s, a) => s + a.unitPrice * a.qty, 0);
  const total = itemsTotal + addonsTotal;
  // 2990s parity (0204): the vouchers this order EARNED (carry-forward codes the
  // customer can redeem on a future order) — printed here so they walk away with
  // the code, like the 2990s SO. Empty for a no-PWP order (query returns []).
  const earnedVouchersQ = usePwpCodesByOrder(order.id);
  const earnedVouchers = (earnedVouchersQ.data?.codes ?? []).filter(
    (c) => c.status === "AVAILABLE",
  );

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
            {collected > 0 ? (
              <span className="confirm__collected" data-testid="thankyou-stripe-collected">
                <CheckCircle2 size={16} strokeWidth={2} />
                RM {collected.toLocaleString("en-MY")} collected online
              </span>
            ) : (stripeCollectAmount ?? 0) > 0 ? (
              <button
                type="button"
                className="btn btn--primary btn--lg"
                onClick={() => setCollectOpen(true)}
                data-testid="thankyou-stripe-collect"
              >
                <QrCode size={16} strokeWidth={2} />
                Collect RM {stripeCollectAmount!.toLocaleString("en-MY")} online
              </button>
            ) : null}
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
              {(order.lines ?? []).map((l, i) => {
                const info = infoBySku.get(l.sku);
                const attrs = l.attrs as Record<string, unknown> | null;
                const isFree = Boolean(attrs?.free_gift || attrs?.free_item);
                const meta = [
                  info?.variant,
                  `qty ${l.qty}`,
                  attrs?.free_gift ? "GWP" : attrs?.free_item ? "FREE" : null,
                ]
                  .filter(Boolean)
                  .join(" · ");
                return (
                  <div key={l.id ?? i} className="summary__item">
                    <div
                      className="summary__item-photo"
                      style={
                        info?.photo
                          ? { backgroundImage: `url(${info.photo})`, backgroundColor: "#fff" }
                          : undefined
                      }
                    />
                    <div className="summary__item-main">
                      <div className="summary__item-name">{info?.name ?? l.sku}</div>
                      <div className="summary__item-meta">{meta}</div>
                    </div>
                    {isFree ? (
                      <span
                        className="summary__item-price"
                        style={{ color: "var(--success, #16a34a)" }}
                      >
                        FREE
                      </span>
                    ) : (
                      <span className="summary__item-price">
                        <sup>RM</sup>
                        {(l.unitPrice * l.qty).toLocaleString("en-MY")}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {(order.addons ?? []).length > 0 && (
            <div className="summary__section">
              <div className="summary__section-label">Add-ons</div>
              {(order.addons ?? []).map((a, i) => (
                <div key={a.id ?? i} className="summary__row">
                  <span className="key">
                    {addonNameByKey.get(a.addonKey) ?? a.addonKey}
                    {a.qty > 1 ? ` × ${a.qty}` : ""}
                  </span>
                  <span className="val">
                    +RM{(a.unitPrice * a.qty).toLocaleString("en-MY")}
                  </span>
                </div>
              ))}
            </div>
          )}

          {earnedVouchers.length > 0 && (
            <div className="summary__section" data-testid="thankyou-vouchers">
              <div className="summary__section-label">
                <Gift size={12} strokeWidth={1.75} style={{ verticalAlign: "middle", marginRight: 4 }} />
                Customer vouchers
              </div>
              {earnedVouchers.map((v) => (
                <div key={v.code} className="summary__row">
                  <span className="key" style={{ fontFamily: "var(--font-mono, monospace)" }}>
                    {v.code}
                  </span>
                  <span className="val">
                    {v.type === "promo" ? "FREE" : "PWP"} · {v.rewardCategory}
                  </span>
                </div>
              ))}
              <div className="summary__row">
                <span className="key" style={{ fontSize: 11, opacity: 0.7 }}>
                  Redeemable on the customer&rsquo;s next order (same name + phone).
                </span>
              </div>
            </div>
          )}

          <div className="summary__section">
            <div className="summary__section-label">Payment</div>
            <div className="summary__row">
              <span className="key">Received</span>
              <span className="val">RM{(order.paid + collected).toLocaleString("en-MY")}</span>
            </div>
            {total - order.paid - collected > 0 && (
              <div className="summary__row">
                <span className="key">Balance due</span>
                <span className="val">
                  RM{(total - order.paid - collected).toLocaleString("en-MY")}
                </span>
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

      {collectOpen && (
        <StripeCollectModal
          orderId={order.id}
          so={order.so}
          total={total}
          paid={order.paid + collected}
          initialAmount={stripeCollectAmount ?? undefined}
          customerName={order.customer.name}
          customerPhone={order.customer.phone ?? null}
          onPaid={(amount) => setCollected((c) => c + amount)}
          onClose={() => setCollectOpen(false)}
        />
      )}
    </div>
  );
}
