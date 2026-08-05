import { useMemo, useState } from "react";
import { ArrowLeft, Check, Plus, Repeat, X } from "lucide-react";
import type { CatalogResponse, PosRentalPlan, ProductModelDto } from "@carres/shared";
import { newLocalId } from "../new-order/configurators";
import type { DraftLine } from "../new-order/draft";
import { rentalAttrs } from "./rental-cart";
import ConfigureTopbarBrand, { type WizardTopbarCtx } from "./ConfigureTopbarBrand";

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
 * Quantity is fixed at 1 and has no stepper: one rented item is one signed
 * agreement with one Stripe subscription and one tracked asset. Renting two
 * means two lines, which is honest rather than clever.
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
}: {
  card: RentalOfferCard;
  catalog: CatalogResponse;
  onAdd: (line: DraftLine) => void;
  onClose: () => void;
  wizardTopbar?: WizardTopbarCtx;
}) {
  const { model, plansBySku } = card;

  // The SKUs this model can be rented in, in catalog order.
  const skus = useMemo(() => {
    const wanted = new Set(plansBySku.keys());
    return catalog.skus
      .filter((s) => s.modelId === model.id && wanted.has(s.sku))
      .sort((a, b) => a.variant.localeCompare(b.variant, undefined, { numeric: true }));
  }, [catalog.skus, model.id, plansBySku]);

  const [skuCode, setSkuCode] = useState<string | null>(skus.length === 1 ? skus[0].sku : null);
  const [planId, setPlanId] = useState<string | null>(null);

  const sku = skus.find((s) => s.sku === skuCode) ?? null;

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
      localId: newLocalId(),
      sku: sku.sku,
      qty: 1,
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

  return (
    <div
      className={`pos-proto cfg-root${wizardTopbar ? " has-wizardbar" : ""}`}
      style={{ position: "fixed", inset: 0, zIndex: 50 }}
      role="dialog"
      aria-modal="true"
      aria-label={`Configure ${model.name} · Rent-to-Own`}
      data-testid="rental-configure"
    >
      {wizardTopbar ? <ConfigureTopbarBrand ctx={wizardTopbar} onBack={onClose} /> : null}

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
            {plan ? plan.monthlyFee.toLocaleString("en-MY") : "—"}
          </div>
          <div className="cfg-header__totalNote" data-testid="rental-cfg-contract">
            {plan
              ? `× ${plan.termMonths} months = ${rm(contractTotal)}`
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
            <Plus size={16} strokeWidth={1.75} /> Add to Cart
          </button>
        </div>
      </div>

      <div className="cfg-body">
        <div className="cfg-grid cfg-grid--full">
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
                  item = one agreement. Renting two means adding it twice.
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
    </div>
  );
}

/** Shown on the CTA once a line is staged (kept for parity with the bought
 *  configure page's Update-item affordance if editing lands later). */
export const RENTAL_ADD_ICON = Check;
