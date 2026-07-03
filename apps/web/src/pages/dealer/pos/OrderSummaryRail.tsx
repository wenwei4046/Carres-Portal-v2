import { useMemo } from "react";
import type { CatalogResponse } from "@carres/shared";
import { rm } from "@/lib/format-currency";
import type { WizardDraft } from "../new-order/draft";
import { cartTotalExStair } from "./cart";

/**
 * Right-hand Order summary rail (02 Customer + 03 Confirm) — prototype skin
 * (`.summary`, Loo's Claude Design 2026-07-04): SO-XXXX · date head, ITEMS
 * (photo + label + qty + price), ADD-ONS, CUSTOMER, EMERGENCY, DELIVERY,
 * PAYMENT ("Pending" until captured), TOTALS sections, Bodoni total foot.
 * Pure presentation over the live WizardDraft — updates as the form fills.
 * The SO number is minted at submit, so it reads "SO-XXXX" here.
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
  const itemCount = draft.lines.reduce((s, l) => s + l.qty, 0);

  return (
    <aside className="summary" data-testid="pos-order-summary">
      <div className="summary__head">
        <div className="summary__order">SO-XXXX · {today}</div>
        <div className="summary__title">Order summary</div>
      </div>

      <div className="summary__body">
        {/* Items */}
        <div className="summary__section">
          <div className="summary__section-label">Items · {itemCount}</div>
          {draft.lines.length === 0 ? (
            <div style={{ fontSize: 12, color: "var(--fg-muted)", fontStyle: "italic" }}>
              Cart is empty
            </div>
          ) : (
            <div className="summary__items">
              {draft.lines.map((l) => {
                const photo = photoBySku.get(l.sku);
                return (
                  <div key={l.localId} className="summary__item">
                    <div
                      className="summary__item-photo"
                      style={
                        photo
                          ? { backgroundImage: `url(${photo})` }
                          : { background: "var(--c-beige)" }
                      }
                    />
                    <div className="summary__item-main">
                      <div className="summary__item-name">{l.label || l.sku}</div>
                      <div className="summary__item-meta">qty {l.qty}</div>
                    </div>
                    <span className="summary__item-price">
                      <sup>RM</sup>
                      {(l.unitPrice * l.qty).toLocaleString("en-MY")}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Add-ons */}
        {draft.addons.length > 0 && (
          <div className="summary__section">
            <div className="summary__section-label">Add-ons</div>
            {draft.addons.map((a) => (
              <div key={a.key} className="summary__row">
                <span className="key">
                  {a.name}
                  {a.qty > 1 ? ` × ${a.qty}` : ""}
                </span>
                <span className="val">+{rm(a.unitPrice * a.qty)}</span>
              </div>
            ))}
          </div>
        )}

        {/* Customer */}
        <div className="summary__section">
          <div className="summary__section-label">Customer</div>
          {customerCaptured ? (
            <>
              {c.name && (
                <div className="summary__row">
                  <span className="key">Name</span>
                  <span className="val">{c.name}</span>
                </div>
              )}
              {c.phone && (
                <div className="summary__row">
                  <span className="key">Phone</span>
                  <span className="val">{c.phone}</span>
                </div>
              )}
              {c.email && (
                <div className="summary__row">
                  <span className="key">Email</span>
                  <span className="val" style={{ maxWidth: 200, overflowWrap: "anywhere" }}>
                    {c.email}
                  </span>
                </div>
              )}
              {c.addressUnknown ? (
                <div className="summary__row">
                  <span className="key">Address</span>
                  <span className="val" style={{ fontStyle: "italic", color: "var(--fg-muted)" }}>
                    To be filled later
                  </span>
                </div>
              ) : (
                c.addressLine1 && (
                  <div className="summary__row">
                    <span className="key">Address</span>
                    <span className="val" style={{ maxWidth: 200 }}>
                      {[c.addressLine1, c.addressCity, c.addressPostcode]
                        .filter(Boolean)
                        .join(", ")}
                    </span>
                  </div>
                )
              )}
            </>
          ) : (
            <div style={{ fontSize: 12, color: "var(--fg-muted)", fontStyle: "italic" }}>
              Not yet captured
            </div>
          )}
        </div>

        {/* Emergency */}
        {c.emergencyName && (
          <div className="summary__section">
            <div className="summary__section-label">Emergency contact</div>
            <div className="summary__row">
              <span className="key">
                {c.emergencyRelationship === "__OTHER__"
                  ? c.emergencyRelationshipOther || "Contact"
                  : c.emergencyRelationship || "Contact"}
              </span>
              <span className="val">{c.emergencyName}</span>
            </div>
            {c.emergencyPhone && (
              <div className="summary__row">
                <span className="key">Phone</span>
                <span className="val">{c.emergencyPhone}</span>
              </div>
            )}
          </div>
        )}

        {/* Delivery */}
        <div className="summary__section">
          <div className="summary__section-label">Delivery</div>
          {draft.delivery.dateTbd ? (
            <div className="summary__row">
              <span className="key">Date</span>
              <span className="val" style={{ fontStyle: "italic", color: "var(--c-orange)" }}>
                For Further Notice
              </span>
            </div>
          ) : draft.delivery.date ? (
            <div className="summary__row">
              <span className="key">Date</span>
              <span className="val">{draft.delivery.date}</span>
            </div>
          ) : (
            <div style={{ fontSize: 12, color: "var(--fg-muted)", fontStyle: "italic" }}>
              Pending
            </div>
          )}
        </div>

        {/* Payment */}
        <div className="summary__section">
          <div className="summary__section-label">Payment</div>
          {draft.paid > 0 ? (
            <div className="summary__row">
              <span className="key">Received</span>
              <span className="val">{rm(draft.paid)}</span>
            </div>
          ) : (
            <div style={{ fontSize: 12, color: "var(--fg-muted)", fontStyle: "italic" }}>
              Pending
            </div>
          )}
        </div>

        {/* Totals */}
        <div className="summary__section">
          <div className="summary__section-label">Totals</div>
          <div className="summary__row">
            <span className="key">Items subtotal</span>
            <span className="val">{rm(itemsSubtotal)}</span>
          </div>
        </div>
      </div>

      <div className="summary__foot">
        <div className="summary__total-row">
          <span className="summary__total-label">Total</span>
          <span className="summary__total-num">
            <sup>RM</sup>
            {itemsSubtotal.toLocaleString("en-MY")}
          </span>
        </div>
        <div style={{ fontSize: 11, color: "var(--fg-muted)", textAlign: "right" }}>
          Delivery + stair carry are finalised at confirm.
        </div>
      </div>
    </aside>
  );
}
