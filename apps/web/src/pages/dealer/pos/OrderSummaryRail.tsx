import { useMemo } from "react";
import type { CatalogResponse } from "@carres/shared";
import { rm } from "@/lib/format-currency";
import { draftTotals } from "@/lib/order-totals";
import type { DraftLine, WizardDraft } from "../new-order/draft";
import { previewDefaultGifts } from "./free-line";

/** A sofa-BUILD line's size + option picks, read tolerantly off the free
 *  jsonb — feeds the structured spec lines under the model name (prototype
 *  style, Loo 2026-07-12). Null for every non-build line. */
function sofaBuildOf(l: DraftLine): {
  height: string;
  fabricName: string | null;
  fabricDeferred: boolean;
  fabricSeries: string | null;
  fabricSurcharge: number;
  legHeight: string | null;
  legSurcharge: number;
  remark: string | null;
  remarkSurcharge: number;
} | null {
  const attrs = l.attrs as Record<string, unknown> | null;
  const sb = attrs?.sofa_build as { cells?: unknown; height?: unknown } | undefined;
  if (!sb || !Array.isArray(sb.cells) || sb.cells.length === 0) return null;
  const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  return {
    height: typeof sb.height === "string" ? sb.height : "24",
    fabricName: typeof attrs?.fabric_name === "string" ? attrs.fabric_name : null,
    fabricDeferred: attrs?.fabric_deferred === true,
    fabricSeries: typeof attrs?.fabric_series === "string" ? attrs.fabric_series : null,
    fabricSurcharge: num(attrs?.fabric_surcharge),
    legHeight: typeof attrs?.leg_height === "string" ? attrs.leg_height : null,
    legSurcharge: num(attrs?.leg_surcharge),
    remark: typeof attrs?.remark === "string" && attrs.remark ? attrs.remark : null,
    remarkSurcharge: num(attrs?.remark_surcharge),
  };
}

/** "1B(LHF) + CNR + 2A(RHF)" → "1B+CNR+2A" (the compact code string the
 *  prototype's "Custom (…)" detail line shows). */
function bareCodes(composition: string): string {
  return composition
    .split("+")
    .map((s) => s.trim().replace(/\(.*?\)/g, ""))
    .filter(Boolean)
    .join("+");
}

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

  // Shared draftTotals — the SAME math as the Step-3 recap + the DealerPos
  // footer (Loo 2026-07-12: this rail said RM 2,570 while the footer said
  // RM 2,920 — stair carry + the delivery fee were missing here).
  const totals = useMemo(() => draftTotals(draft, catalog), [draft, catalog]);
  const c = draft.customer;
  const customerCaptured = c.name.trim().length > 0 || c.phone.trim().length > 0;
  // Default free gifts the server WILL append at submit — show them here as RM0
  // line items so the summary (the SO preview) matches what's booked. Same pure
  // resolver the cart uses; the client never sends a gift line (server-appended).
  const giftRows = useMemo(() => previewDefaultGifts(draft.lines, catalog), [draft.lines, catalog]);
  const itemCount =
    draft.lines.reduce((s, l) => s + l.qty, 0) + giftRows.reduce((s, g) => s + g.qty, 0);

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
                // "Booqit · 1A(LHF) + 2A(RHF) · 24″ · …" → bold MODEL NAME on
                // top, the configuration as a muted detail line (the same split
                // the cart rows use — Loo 2026-07-12: one long bold line read
                // as fragments). Empty segments drop, so a variant-less label
                // ("Mattress Protector · ") strands no separator.
                const segs = (l.label || l.sku)
                  .split(" · ")
                  .map((s) => s.trim())
                  .filter(Boolean);
                const name = segs[0] ?? l.sku;
                const build = sofaBuildOf(l);

                // ── Sofa BUILD row (prototype style, Loo 2026-07-12): the
                // MODEL PHOTO tile (rounded square — the plan-view sketch was
                // reverted same-day), the bold line "Booqit · 1B(LHF) + CNR +
                // 2A(RHF)", then mono spec lines: "Custom (1B+CNR+2A) · 24″ ·
                // qty 1" + per-pick surcharges (fabric / leg / remark). ──
                if (build) {
                  const composition = segs[1] ?? "";
                  const fabricLine = build.fabricName
                    ? `Fabric · ${build.fabricName}${build.fabricSurcharge > 0 ? ` · +${rm(build.fabricSurcharge)}` : ""}`
                    : build.fabricSeries
                      ? `Fabric · ${build.fabricSeries} series · colour KIV`
                      : build.fabricDeferred
                        ? "Fabric · KIV"
                        : null;
                  return (
                    <div key={l.localId} className="summary__item" data-testid={`summary-build-${l.localId}`}>
                      <div
                        className="summary__item-photo"
                        style={
                          photo
                            ? { backgroundImage: `url(${photo})`, backgroundColor: "#fff" }
                            : undefined
                        }
                      />
                      <div className="summary__item-main">
                        <div className="summary__item-name">
                          {name}
                          {composition ? ` · ${composition}` : ""}
                        </div>
                        <div className="summary__item-meta">
                          Custom{composition ? ` (${bareCodes(composition)})` : ""} · {build.height}″ · qty {l.qty}
                        </div>
                        {fabricLine && <div className="summary__item-meta">{fabricLine}</div>}
                        {build.legHeight && (
                          <div className="summary__item-meta">
                            Leg {build.legHeight}
                            {build.legSurcharge > 0 ? ` · +${rm(build.legSurcharge)}` : ""}
                          </div>
                        )}
                        {(build.remark || build.remarkSurcharge !== 0) && (
                          <div className="summary__item-meta">
                            ✎ {build.remark ?? "Price adjustment"}
                            {build.remarkSurcharge !== 0
                              ? ` · ${build.remarkSurcharge > 0 ? "+" : "−"}${rm(Math.abs(build.remarkSurcharge))}`
                              : ""}
                          </div>
                        )}
                      </div>
                      <span className="summary__item-price">
                        <sup>RM</sup>
                        {(l.unitPrice * l.qty).toLocaleString("en-MY")}
                      </span>
                    </div>
                  );
                }

                const detail = segs.slice(1).join(" · ");
                return (
                  <div key={l.localId} className="summary__item">
                    <div
                      className="summary__item-photo"
                      style={
                        photo
                          ? { backgroundImage: `url(${photo})`, backgroundColor: "#fff" }
                          : undefined
                      }
                    />
                    <div className="summary__item-main">
                      <div className="summary__item-name">{name}</div>
                      {detail && <div className="summary__item-meta">{detail}</div>}
                      <div className="summary__item-meta">qty {l.qty}</div>
                    </div>
                    <span className="summary__item-price">
                      <sup>RM</sup>
                      {(l.unitPrice * l.qty).toLocaleString("en-MY")}
                    </span>
                  </div>
                );
              })}
              {/* Default free gifts (server-appended at submit) — shown as RM0
                  items so "Convert to Sales Order" clearly carries them. */}
              {giftRows.map((g) => {
                const photo = photoBySku.get(g.giftSku);
                return (
                  <div key={`gift-${g.sourceModelId}-${g.giftSku}`} className="summary__item" data-testid={`summary-gift-${g.giftSku}`}>
                    <div
                      className="summary__item-photo"
                      style={
                        photo
                          ? { backgroundImage: `url(${photo})`, backgroundColor: "#fff" }
                          : undefined
                      }
                    />
                    <div className="summary__item-main">
                      <div className="summary__item-name">{g.name}</div>
                      <div className="summary__item-meta">
                        qty {g.qty} · GWP{g.campaign ? ` · ${g.campaign}` : ""}
                      </div>
                    </div>
                    <span className="summary__item-price" style={{ color: "var(--success, #16a34a)" }}>
                      FREE
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

        {/* Totals — full breakdown, same rows as the Step-3 recap. Stair +
            delivery appear once the delivery details set them (>0), and the
            foot Total ALWAYS equals the footer bar's number. */}
        <div className="summary__section">
          <div className="summary__section-label">Totals</div>
          <div className="summary__row">
            <span className="key">Items subtotal</span>
            <span className="val">{rm(totals.lineSub)}</span>
          </div>
          {totals.addonSub > 0 && (
            <div className="summary__row">
              <span className="key">Add-ons</span>
              <span className="val">{rm(totals.addonSub)}</span>
            </div>
          )}
          {totals.stair > 0 && (
            <div className="summary__row">
              <span className="key">Stair carry</span>
              <span className="val">{rm(totals.stair)}</span>
            </div>
          )}
          {totals.deliveryTotal > 0 && (
            <div className="summary__row">
              <span className="key">Delivery fee</span>
              <span className="val">{rm(totals.deliveryTotal)}</span>
            </div>
          )}
        </div>
      </div>

      <div className="summary__foot">
        <div className="summary__total-row">
          <span className="summary__total-label">Total</span>
          <span className="summary__total-num" data-testid="summary-grand-total">
            <sup>RM</sup>
            {totals.grand.toLocaleString("en-MY")}
          </span>
        </div>
      </div>
    </aside>
  );
}
