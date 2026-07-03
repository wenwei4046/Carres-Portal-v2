import { useMemo } from "react";
import type { CatalogResponse } from "@carres/shared";
import { rm } from "@/lib/format-currency";
import type { WizardDraft } from "../new-order/draft";
import { cartTotalExStair } from "./cart";

/**
 * Right-hand Order summary rail on the CUSTOMER step — 2990s parity:
 * SO-XXXX · date header, ITEMS (thumb + label + qty + price), CUSTOMER,
 * DELIVERY, PAYMENT ("Pending" until captured), TOTALS, and a bottom total
 * strip. Pure presentation over the live WizardDraft — updates as the form
 * fills. The SO number is minted at submit, so it reads "SO-XXXX" here.
 */
export default function OrderSummaryRail({
  draft,
  catalog,
}: {
  draft: WizardDraft;
  catalog: CatalogResponse;
}) {
  const today = useMemo(() => {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
  }, []);

  const photoBySku = useMemo(() => {
    const modelById = new Map(catalog.models.map((m) => [m.id, m]));
    const map = new Map<string, string | null>();
    for (const s of catalog.skus) {
      map.set(s.sku, modelById.get(s.modelId)?.photoUrl ?? null);
    }
    return map;
  }, [catalog]);

  const itemsSubtotal = cartTotalExStair(draft.lines, draft.addons);
  const c = draft.customer;
  const customerCaptured = c.name.trim().length > 0 || c.phone.trim().length > 0;

  const deliveryLabel = draft.delivery.dateTbd
    ? "To be confirmed"
    : draft.delivery.date
      ? draft.delivery.date
      : "Pending";
  const paymentLabel = draft.paid > 0 ? `${rm(draft.paid)} received` : "Pending";

  return (
    <aside
      className="bg-card border border-base-200 rounded-lg shadow-sm overflow-hidden flex flex-col"
      data-testid="pos-order-summary"
    >
      <div className="p-5 pb-4">
        <p className="t-tiny text-base-400 font-mono">SO-XXXX · {today}</p>
        <h2 className="t-h3 mt-0.5">Order summary</h2>
      </div>

      <div className="px-5 flex flex-col divide-y divide-base-100">
        {/* Items */}
        <section className="py-4">
          <p className="t-micro text-base-400 mb-2.5">Items · {draft.lines.length}</p>
          {draft.lines.length === 0 ? (
            <p className="t-small text-base-400 italic">Cart is empty</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {draft.lines.map((l) => {
                const photo = photoBySku.get(l.sku);
                return (
                  <li key={l.localId} className="flex items-start gap-3">
                    <span className="w-10 h-10 rounded-md bg-base-100 border border-base-200 overflow-hidden grid place-items-center shrink-0">
                      {photo ? (
                        <img src={photo} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <span className="t-tiny text-base-400">
                          {(l.label || l.sku).slice(0, 2).toUpperCase()}
                        </span>
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block t-small font-semibold leading-snug">
                        {l.label || l.sku}
                      </span>
                      <span className="block t-tiny text-base-400">qty {l.qty}</span>
                    </span>
                    <span className="font-mono text-[12px] font-semibold shrink-0">
                      {rm(l.unitPrice * l.qty)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Customer */}
        <section className="py-4">
          <p className="t-micro text-base-400 mb-1.5">Customer</p>
          {customerCaptured ? (
            <p className="t-small">
              {c.name || "—"}
              {c.phone && <span className="text-base-500"> · {c.phone}</span>}
            </p>
          ) : (
            <p className="t-small text-base-400 italic">Not yet captured</p>
          )}
        </section>

        {/* Delivery */}
        <section className="py-4">
          <p className="t-micro text-base-400 mb-1.5">Delivery</p>
          <p className={`t-small ${deliveryLabel === "Pending" ? "text-base-400 italic" : ""}`}>
            {deliveryLabel}
          </p>
        </section>

        {/* Payment */}
        <section className="py-4">
          <p className="t-micro text-base-400 mb-1.5">Payment</p>
          <p className={`t-small ${paymentLabel === "Pending" ? "text-base-400 italic" : ""}`}>
            {paymentLabel}
          </p>
        </section>

        {/* Totals */}
        <section className="py-4">
          <p className="t-micro text-base-400 mb-1.5">Totals</p>
          <div className="flex items-baseline justify-between">
            <span className="t-small text-base-600">Items subtotal</span>
            <span className="font-mono text-[13px] font-semibold">{rm(itemsSubtotal)}</span>
          </div>
        </section>
      </div>

      {/* Bottom total strip */}
      <div className="mt-auto bg-base-900 text-white px-5 py-3.5 flex items-baseline justify-between">
        <span className="t-micro text-white/60">Total</span>
        <span className="font-mono text-[18px] font-bold">{rm(itemsSubtotal)}</span>
      </div>
    </aside>
  );
}
