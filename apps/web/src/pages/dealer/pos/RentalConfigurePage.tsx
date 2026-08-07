import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, Check, Minus, Plus, Repeat, X } from "lucide-react";
import type { CatalogResponse, PosRentalPlan, ProductModelDto } from "@carres/shared";
import { newLocalId } from "../new-order/configurators";
import type { DraftLine } from "../new-order/draft";
import { rentalAttrs, rentalOf } from "./rental-cart";
import ConfigureTopbarBrand, { type WizardTopbarCtx } from "./ConfigureTopbarBrand";
import MattressPlan, { footprintForVariant } from "./MattressPlan";

/**
 * Rent-to-Own configure surface (Loo 2026-07-26).
 *
 * Deliberately the SAME page shape as PosConfigurePage — header with a live
 * total and an Add to Cart CTA, canvas on the left, `cfg-section` controls on
 * the right — because Loo's whole point was that renting must not feel like a
 * different machine:
 *
 *   "它同样是可以 add to cart 的，就像一模一样的 SKU item。它们唯一的区别只是，
 *    在 add to cart 之前，点进去那个 product 会跳进去一个 tab，要选择它要供多久，
 *    以及它的 variant 是什么，其他的都一模一样"
 *
 * So: SIZE first (exactly as a bought mattress), then RENTAL TERM. Nothing else
 * changes. The two numbers a customer actually weighs — the monthly fee and
 * what the whole contract comes to — are both on screen at the same time,
 * because "RM59" without "× 84 = RM4,956" is how people mis-buy credit.
 *
 * QUANTITY (Loo, 2026-08-06 — "option to add quantity needs to be done first").
 * The stepper sets how many UNITS, and each unit still becomes its OWN
 * agreement: `submitRentalCart` mints `qty` agreements for this line. That is
 * not a compromise, it is what the schema permits. `rental_agreements` (0249)
 * carries a single `sku`, `term_months`, `monthly_fee` and
 * `stripe_subscription_id`, and its whole endgame is singular — `buyout_at`,
 * `buyout_amount`, `ownership_transfer_at`, `ownership_doc_url` (the signed
 * request-to-buy form) and one `status`. One agreement covering two mattresses
 * could never let a customer buy out one and keep renting the other, could not
 * have one unit repossessed while the other stays active, and would put two
 * items on one signed ownership form. So quantity is the operator's shortcut
 * for repeating the 1:1:1 — one agreement, one subscription, one tracked
 * asset — never an exception to it.
 */

export interface RentalOfferCard {
  model: ProductModelDto;
  /** Every plan for this model's SKUs, grouped by the SKU they price. */
  plansBySku: Map<string, PosRentalPlan[]>;
}

const termLabel = (months: number): string => {
  if (months % 12 === 0) {
    const y = months / 12;
    return `${y} year${y === 1 ? "" : "s"}`;
  }
  return `${months} months`;
};

const rm = (n: number) => `RM${n.toLocaleString("en-MY", { maximumFractionDigits: 2 })}`;

export default function RentalConfigurePage({
  card,
  catalog,
  onAdd,
  onClose,
  wizardTopbar,
  editLine,
}: {
  card: RentalOfferCard;
  catalog: CatalogResponse;
  onAdd: (line: DraftLine) => void;
  onClose: () => void;
  wizardTopbar?: WizardTopbarCtx;
  /** Cart-line EDIT (the ✎ pencil). Present = re-open this line prefilled and
   *  REPLACE it on emit; absent = a fresh add. Same contract PosConfigurePage
   *  has for a bought line, so the two pencils behave identically. */
  editLine?: DraftLine;
}) {
  const { model, plansBySku } = card;

  // The SKUs this model can be rented in, in catalog order.
  const skus = useMemo(() => {
    const wanted = new Set(plansBySku.keys());
    return catalog.skus
      .filter((s) => s.modelId === model.id && wanted.has(s.sku))
      .sort((a, b) => a.variant.localeCompare(b.variant, undefined, { numeric: true }));
  }, [catalog.skus, model.id, plansBySku]);

  // EDIT seed. The plan id is read back out of `attrs.rental` rather than
  // re-derived from the sku, because a sku can carry several terms and only the
  // stored plan says which one the customer actually signed for.
  const editRental = editLine ? rentalOf(editLine) : null;
  const [skuCode, setSkuCode] = useState<string | null>(
    editLine?.sku ?? (skus.length === 1 ? skus[0].sku : null),
  );
  const [planId, setPlanId] = useState<string | null>(editRental?.planId ?? null);
  const [qty, setQty] = useState(editLine?.qty ?? 1);

  const sku = skus.find((s) => s.sku === skuCode) ?? null;
  const footprint = useMemo(() => footprintForVariant(sku?.variant), [sku?.variant]);

  // Terms available for the picked size, cheapest-monthly last so the longest
  // (and cheapest per month) commitment is not the accidental default.
  const terms = useMemo(() => {
    if (!skuCode) return [];
    return (plansBySku.get(skuCode) ?? [])
      .slice()
      .sort((a, b) => a.termMonths - b.termMonths);
  }, [plansBySku, skuCode]);

  const plan = terms.find((t) => t.id === planId) ?? null;
  const contractTotal = plan ? plan.monthlyFee * plan.termMonths : 0;
  const canAdd = !!sku && !!plan;

  function add() {
    if (!sku || !plan) return;
    onAdd({
      // Keep the edited line's id so the caller replaces IN PLACE rather than
      // appending a second line beside the one being edited.
      localId: editLine?.localId ?? newLocalId(),
      sku: sku.sku,
      // UNITS, not agreements. `submitRentalCart` expands this into `qty`
      // separate agreements — see the quantity note in this file's header.
      qty,
      unitPrice: plan.monthlyFee,
      label: `${model.name} · ${sku.variant} · ${termLabel(plan.termMonths)} rental`,
      attrs: rentalAttrs({
        planId: plan.id,
        termMonths: plan.termMonths,
        monthlyFee: plan.monthlyFee,
        contractTotal,
        variantLabel: sku.variant,
      }),
    });
  }

  return createPortal(
    <div
      className={`pos-proto cfg-root${wizardTopbar ? " has-wizardbar" : ""}`}
      style={{ position: "fixed", inset: 0, zIndex: 50 }}
      role="dialog"
      aria-modal="true"
      aria-label={`Configure ${model.name} · Rent-to-Own`}
      data-testid="rental-configure"
    >
      {/* The strip rides its OWN 48px row, exactly as PosConfigurePage does it
          (b8d7e5d8, 2026-07-26). `.cfg-root.has-wizardbar` declares FOUR grid
          rows and `.cfg-wizardbar` is the band that fills the first one —
          height, padding, background and the bottom rule all live on that
          class, so rendering the brand bare gives grid row 1 an unstyled,
          zero-chrome child. That is the overlap the original fix was written
          for; its commit message is literally "sofa header overlapped". */}
      {wizardTopbar ? (
        <div className="cfg-wizardbar">
          <ConfigureTopbarBrand ctx={wizardTopbar} onBack={onClose} />
        </div>
      ) : null}

      <div className="cfg-header">
        <div className="cfg-header__left">
          {!wizardTopbar && (
            <button className="cfg-header__back" onClick={onClose} aria-label="Back">
              <ArrowLeft size={16} strokeWidth={1.75} />
            </button>
          )}
          <div className="cfg-header__summary">
            <div className="cfg-header__eyebrow">{model.name} · Rent-to-Own</div>
            <div className="cfg-header__title">
              {sku ? sku.variant : "Pick a size"}
              {plan ? ` · ${termLabel(plan.termMonths)}` : ""}
            </div>
            <div className="cfg-header__sub">
              {plan
                ? `Own it after the final month`
                : "Pick a size, then how long the customer rents for"}
            </div>
          </div>
        </div>

        {/* The monthly figure is the headline because that is what the customer
            decides on — but the contract total sits directly under it, never a
            click away. */}
        <div className="cfg-header__total" tabIndex={0}>
          <div className="cfg-header__totalLabel">Per month</div>
          <div className="cfg-header__totalNum" data-testid="rental-cfg-monthly">
            <sup>RM</sup>
            {plan ? (plan.monthlyFee * qty).toLocaleString("en-MY") : "—"}
          </div>
          {/* Both figures are what the CUSTOMER pays, so both carry the
              quantity. Showing a per-unit fee beside a whole-cart total is how
              people mis-read credit, which is the same reason the contract
              total sits here at all instead of a click away. */}
          <div className="cfg-header__totalNote" data-testid="rental-cfg-contract">
            {plan
              ? `${qty > 1 ? `${qty} × RM${plan.monthlyFee.toLocaleString("en-MY")} · ` : ""}× ${plan.termMonths} months = ${rm(contractTotal * qty)}`
              : "Pick a term"}
          </div>
        </div>

        <div className="cfg-header__cta">
          <button className="btn btn--ghost" onClick={onClose}>
            <X size={14} strokeWidth={1.75} /> Cancel
          </button>
          <button
            className="btn btn--primary btn--lg"
            onClick={add}
            disabled={!canAdd}
            title={!sku ? "Pick a size first" : !plan ? "Pick how long they rent for" : undefined}
            data-testid="rental-cfg-add"
          >
            {editLine ? (
              <>
                <Check size={16} strokeWidth={1.75} /> Update item
              </>
            ) : (
              <>
                <Plus size={16} strokeWidth={1.75} /> Add to Cart
              </>
            )}
          </button>
        </div>
      </div>

      <div className="cfg-body">
        {/* Plan-view canvas (left) + controls (right) — the same `cfg-grid`
            1.4fr/1fr split PosConfigurePage uses (Loo 2026-08-06: "need the
            same ui like this"). This page previously opted into
            `cfg-grid--full`, the modifier that collapses the grid to one
            column, because it had no canvas to put on the left. Removing the
            modifier is what re-opens the left column; the block below is what
            fills it. The drawing itself is shared, not copied — see
            ./MattressPlan. */}
        <div className="cfg-grid">
          <div className="cfg-canvas">
            <div className="cfg-canvas__head">
              <div>
                <span className="pos-eyebrow" style={{ color: "var(--c-burnt)" }}>
                  Rent-to-Own
                </span>
                <h2 className="cfg-canvas__title">
                  {model.name}
                  {sku ? ` · ${footprint?.label ?? sku.variant}` : ""}
                </h2>
              </div>
              <span className="cfg-canvas__detail">
                {footprint ? `Footprint ${footprint.w} × ${footprint.d} cm` : "Pick a size"}
              </span>
            </div>
            <MattressPlan footprint={footprint} />
          </div>

          <div className="cfg-controls">
            {/* ── Size — identical to the bought-mattress picker ───────────── */}
            <div className="cfg-section">
              <div className="cfg-section__head">
                <span className="pos-eyebrow">Size</span>
                <span className="cfg-section__detail">
                  {sku ? sku.variant : `${skus.length} option${skus.length === 1 ? "" : "s"}`}
                </span>
              </div>
              {skus.length === 0 ? (
                <div className="cfg-empty">
                  No size of this model is on rental offer yet — author one in Admin → Rental.
                </div>
              ) : (
                <div className="cfg-optGrid">
                  {skus.map((s) => {
                    const cheapest = Math.min(
                      ...(plansBySku.get(s.sku) ?? []).map((p) => p.monthlyFee),
                    );
                    return (
                      <button
                        key={s.sku}
                        className={`cfg-opt ${skuCode === s.sku ? "is-on" : ""}`}
                        onClick={() => {
                          setSkuCode(s.sku);
                          setPlanId(null); // terms differ per size — never carry one across
                        }}
                        data-testid={`rental-size-${s.sku}`}
                      >
                        <span className="cfg-opt__title">{s.variant}</span>
                        <span className="cfg-opt__sub">{s.sku}</span>
                        <span className="cfg-opt__price">from {rm(cheapest)}/mo</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* ── Rental term — the one thing a sale does not ask ──────────── */}
            <div className="cfg-section" data-testid="rental-term-section">
              <div className="cfg-section__head">
                <span className="pos-eyebrow">Rental term</span>
                <span className="cfg-section__detail">
                  {plan ? `${plan.termMonths} monthly payments` : "How long do they rent for?"}
                </span>
              </div>
              {!skuCode ? (
                <div className="cfg-empty">Pick a size first.</div>
              ) : terms.length === 0 ? (
                <div className="cfg-empty">No term is priced for this size yet.</div>
              ) : (
                <div className="cfg-optGrid">
                  {terms.map((t) => (
                    <button
                      key={t.id}
                      className={`cfg-opt ${planId === t.id ? "is-on" : ""}`}
                      onClick={() => setPlanId(t.id)}
                      data-testid={`rental-term-${t.termMonths}`}
                    >
                      <span className="cfg-opt__title">{termLabel(t.termMonths)}</span>
                      <span className="cfg-opt__sub">
                        {t.termMonths} months · total {rm(t.monthlyFee * t.termMonths)}
                      </span>
                      <span className="cfg-opt__price">{rm(t.monthlyFee)}/mo</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* ── Quantity — the same stepper the bought page uses ─────────── */}
            <div className="cfg-section">
              <div className="cfg-section__head">
                <span className="pos-eyebrow">Quantity</span>
                {/* "agreements", not "pieces". The bought page counts pieces
                    because a piece is what leaves the warehouse; here each unit
                    is also a separate signed contract with its own RA number,
                    and the operator has to be able to say that out loud before
                    the customer signs. */}
                <span className="cfg-section__detail">
                  {qty} agreement{qty === 1 ? "" : "s"}
                </span>
              </div>
              <div className="cfg-stepper">
                <button
                  type="button"
                  className="cfg-stepperBtn"
                  onClick={() => setQty(Math.max(1, qty - 1))}
                  disabled={qty <= 1}
                  aria-label="Decrease quantity"
                >
                  <Minus size={16} strokeWidth={1.75} />
                </button>
                <span className="cfg-stepperVal" data-testid="rental-cfg-qty">
                  {qty}
                </span>
                <button
                  type="button"
                  className="cfg-stepperBtn"
                  onClick={() => setQty(qty + 1)}
                  aria-label="Increase quantity"
                >
                  <Plus size={16} strokeWidth={1.75} />
                </button>
              </div>
            </div>

            {/* What the store must be able to say out loud before adding. */}
            <div className="cfg-section">
              <div className="cfg-section__head">
                <span className="pos-eyebrow">What happens next</span>
              </div>
              <ul
                style={{
                  margin: 0,
                  paddingLeft: 18,
                  fontSize: 12.5,
                  lineHeight: 1.7,
                  color: "var(--fg-muted)",
                }}
                data-testid="rental-explainer"
              >
                <li>
                  <Repeat size={11} strokeWidth={2} style={{ verticalAlign: -1 }} /> One rented
                  item = one agreement.{" "}
                  {qty > 1
                    ? `This line signs ${qty} separate agreements, each with its own RA number.`
                    : "Two units means two agreements, each with its own RA number."}
                </li>
                <li>A rental cannot share an order with items bought outright.</li>
                <li>
                  After checkout, finance approves the credit — <b>no card is charged</b> until
                  they do.
                </li>
                {plan && (
                  <li>
                    The customer owns it once all {plan.termMonths} payments are made.
                  </li>
                )}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Shown on the CTA once a line is staged (kept for parity with the bought
 *  configure page's Update-item affordance if editing lands later). */
export const RENTAL_ADD_ICON = Check;
