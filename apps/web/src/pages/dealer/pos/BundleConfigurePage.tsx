import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronRight, X } from "lucide-react";
import type { BundleSlot, CatalogResponse, ProductBundleDto } from "@carres/shared";
import { rm } from "@/lib/format-currency";
import type { DraftLine } from "../new-order/draft";
import type { buildCatalogIndex } from "./catalog-index";
import { attrsKey } from "./cart";
import { deriveBundleSlots, slotNeedsConfig, type BundleSlotPick } from "./bundle-flow";
import PosConfigurePage from "./PosConfigurePage";
import ConfigureDrawer from "./ConfigureDrawer";

type CatalogIndex = ReturnType<typeof buildCatalogIndex>;

/**
 * Bundle slot walker (0241) — the "pick your items" overlay a bundle opens
 * when any slot needs the customer's input. CART-STYLE (Loo 2026-07-19): a
 * slot of qty N expands into N separate unit rows, each configured on its own
 * (two units of the same product can carry different specs — 8" vs 6" divan);
 * at Add-to-cart, units whose product + EVERY spec are identical merge back
 * into one line, anything different stays its own line. Each unit mounts the
 * product's OWN configure surface (PosConfigurePage / ConfigureDrawer), so
 * specs work exactly like a single-item sale; no PWP/voucher props are passed
 * — no discount stacks inside a bundle.
 */
export default function BundleConfigurePage({
  bundle,
  catalog,
  index,
  onComplete,
  onClose,
}: {
  bundle: ProductBundleDto;
  catalog: CatalogResponse;
  index: CatalogIndex;
  onComplete: (picks: BundleSlotPick[]) => void;
  onClose: () => void;
}) {
  const modelIdOf = (sku: string) => catalog.skus.find((s) => s.sku === sku)?.modelId ?? null;
  const slots = useMemo(() => deriveBundleSlots(bundle, modelIdOf), [bundle]); // eslint-disable-line react-hooks/exhaustive-deps

  // A slot of qty N walks as N single-unit rows.
  const units = useMemo(
    () =>
      slots.flatMap((slot, si) =>
        Array.from({ length: slot.qty }, (_, u) => ({ slot, si, u })),
      ),
    [slots],
  );

  // Units with nothing to ask auto-resolve at their pinned sku (catalog price,
  // no attrs) — the V1 behaviour, per unit.
  const [picks, setPicks] = useState<(BundleSlotPick | null)[]>(() =>
    units.map(({ slot }) => {
      if (slotNeedsConfig(slot, catalog)) return null;
      const sku = catalog.skus.find((s) => s.sku === slot.sku);
      const model = sku ? catalog.models.find((m) => m.id === sku.modelId) : undefined;
      if (!sku || !model) return null;
      return {
        sku: sku.sku,
        catalogPrice: sku.price,
        unitPrice: sku.price,
        qty: 1,
        attrs: null,
        label: sku.variant?.trim() ? `${model.name} · ${sku.variant}` : model.name,
      };
    }),
  );
  const [activeUnit, setActiveUnit] = useState<number | null>(null);
  const [chosenModelId, setChosenModelId] = useState<string | null>(null);

  const allDone = picks.every((p) => p !== null);
  const extraCents = picks.reduce(
    (s, p) => s + (p ? Math.round((p.unitPrice - p.catalogPrice) * 100) : 0),
    0,
  );
  const totalPreview = bundle.price + extraCents / 100;

  // The "worth" this bundle discounts from — Σ of each unit's cheapest
  // eligible pick (same rule the catalog card strikes through).
  const originalTotal = useMemo(
    () =>
      units.reduce((s, { slot }) => {
        if (slot.variant === "fixed")
          return s + (catalog.skus.find((sk) => sk.sku === slot.sku)?.price ?? 0);
        const prices = slot.modelIds.flatMap((mid) =>
          catalog.skus
            .filter((sk) => sk.modelId === mid && !sk.discontinuedAt)
            .map((sk) => sk.price),
        );
        return s + (prices.length ? Math.min(...prices) : 0);
      }, 0),
    [units, catalog.skus],
  );

  function slotModels(slot: BundleSlot) {
    return slot.modelIds
      .map((id) => catalog.models.find((m) => m.id === id))
      .filter((m): m is NonNullable<typeof m> => Boolean(m));
  }

  function photoForUnit(i: number): string | null {
    const pick = picks[i];
    const { slot } = units[i]!;
    const mid = pick
      ? catalog.skus.find((s) => s.sku === pick.sku)?.modelId
      : slot.modelIds[0];
    return (mid && catalog.models.find((m) => m.id === mid)?.photoUrl) || null;
  }

  function openUnit(i: number) {
    const { slot } = units[i]!;
    const models = slotModels(slot);
    setActiveUnit(i);
    setChosenModelId(models.length === 1 ? models[0]!.id : null);
  }

  function recordPick(i: number, line: DraftLine) {
    const sku = catalog.skus.find((s) => s.sku === line.sku);
    if (!sku) return;
    setPicks((cur) =>
      cur.map((p, j) =>
        j === i
          ? {
              sku: line.sku,
              catalogPrice: sku.price,
              unitPrice: line.unitPrice,
              // one row = one unit; identical units merge at Add-to-cart.
              qty: 1,
              attrs: (line.attrs as Record<string, unknown> | null) ?? null,
              label: line.label,
            }
          : p,
      ),
    );
    setActiveUnit(null);
    setChosenModelId(null);
  }

  /** Merge units whose product + EVERY spec are identical (Loo 2026-07-19 —
   *  anything different, even a price-neutral remark, stays its own line). */
  function addAll() {
    const merged: BundleSlotPick[] = [];
    const at = new Map<string, number>();
    for (const p of picks as BundleSlotPick[]) {
      const key = `${p.sku}|${p.unitPrice}|${attrsKey(p.attrs)}`;
      const i = at.get(key);
      if (i != null) merged[i]!.qty += 1;
      else {
        at.set(key, merged.length);
        merged.push({ ...p });
      }
    }
    onComplete(merged);
  }

  // The active unit's mounted configure surface.
  const activeSurface = (() => {
    if (activeUnit === null) return null;
    const { slot } = units[activeUnit]!;
    const models = slotModels(slot);
    const model = chosenModelId ? models.find((m) => m.id === chosenModelId) : null;
    if (!model) return null;
    const liveSkus = catalog.skus.filter((s) => s.modelId === model.id && !s.discontinuedAt);
    const skus =
      slot.variant === "fixed" ? liveSkus.filter((s) => s.sku === slot.sku) : liveSkus;
    const seed: DraftLine | undefined =
      slot.variant === "fixed" && skus[0]
        ? { localId: "bundle-seed", sku: skus[0].sku, qty: 1, attrs: null, unitPrice: 0, label: "" }
        : undefined;
    const common = {
      model,
      meta: index.meta.get(model.id),
      skus,
      onAdd: (line: DraftLine) => recordPick(activeUnit, line),
      onClose: () => {
        setActiveUnit(null);
        setChosenModelId(null);
      },
    };
    if (model.category === "mattress" || model.category === "bedframe") {
      return (
        <PosConfigurePage
          {...common}
          specialAddons={catalog.specialAddons}
          optionPools={catalog.optionPools}
          fabrics={catalog.fabrics}
          fabricTierConfig={catalog.fabricTierConfig}
          modelFabricTierOverrides={catalog.modelFabricTierOverrides}
          editLine={seed}
        />
      );
    }
    return (
      <ConfigureDrawer
        {...common}
        fabrics={index.fabricsByModel.get(model.id) ?? []}
        fabricTierConfig={catalog.fabricTierConfig}
        modelFabricTierOverrides={catalog.modelFabricTierOverrides}
        sofaCompartments={catalog.sofaCompartments}
        modelSofaCompartments={[]}
        sofaCombos={catalog.sofaCombos}
        specialAddons={catalog.specialAddons}
      />
    );
  })();

  return createPortal(
    <div
      className="pos-proto cfg-root"
      style={{ position: "fixed", inset: 0, zIndex: 50, overflowY: "auto" }}
      role="dialog"
      aria-modal="true"
      aria-label={`Build bundle ${bundle.name}`}
      data-testid="bundle-configure-page"
    >
      <div style={{ maxWidth: 1060, margin: "0 auto", padding: "28px 20px 60px" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 4 }}>
          <h2 style={{ fontFamily: "var(--font-title)", fontWeight: 700, fontSize: 22 }}>
            {bundle.name}
          </h2>
          <span className="prod-card__badge" style={{ position: "static" }}>
            Bundle
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cancel bundle"
            className="btn btn--ghost"
            style={{ marginLeft: "auto" }}
            data-testid="bundle-walker-cancel"
          >
            <X size={16} strokeWidth={1.75} />
            Cancel
          </button>
        </div>
        <p style={{ fontSize: 12, color: "var(--fg-muted)", marginBottom: 20 }}>
          Pick every item like a cart — two of the same product can carry different specs; identical
          ones merge into one line at the end.
        </p>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0,1fr) 300px",
            gap: 24,
            alignItems: "start",
          }}
        >
          {/* Unit rows — cart anatomy: photo · name/spec · action. */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {units.map(({ slot, si, u }, i) => {
              const pick = picks[i];
              const models = slotModels(slot);
              const title =
                slot.label ??
                (models.length === 1 ? models[0]!.name : models.map((m) => m.name).join(" / "));
              const photo = photoForUnit(i);
              const surcharge = pick
                ? Math.round((pick.unitPrice - pick.catalogPrice) * 100) / 100
                : 0;
              return (
                <div
                  key={i}
                  className="pos-card"
                  style={{ padding: "12px 14px", display: "flex", alignItems: "center", gap: 12 }}
                  data-testid={`bundle-slot-${i}`}
                >
                  <div
                    aria-hidden="true"
                    style={{
                      width: 56,
                      height: 56,
                      borderRadius: 12,
                      flexShrink: 0,
                      background: photo
                        ? `url(${photo}) center/cover`
                        : "var(--pos-panel)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "var(--fg-muted)",
                    }}
                  >
                    {!photo && "▦"}
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span
                        aria-hidden="true"
                        style={{
                          width: 20,
                          height: 20,
                          borderRadius: 999,
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          background: pick ? "var(--success-soft)" : "var(--pos-panel)",
                          color: pick ? "var(--success)" : "var(--fg-muted)",
                          fontSize: 11,
                          fontWeight: 700,
                          flexShrink: 0,
                        }}
                      >
                        {pick ? <Check size={12} strokeWidth={2.5} /> : i + 1}
                      </span>
                      <span style={{ fontWeight: 600, fontSize: 14, minWidth: 0 }} className="truncate">
                        Item {si + 1}
                        {slot.qty > 1 ? ` · #${u + 1}` : ""} · {title}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: "var(--fg-muted)", marginTop: 2 }}>
                      {pick
                        ? pick.label
                        : slot.variant === "fixed"
                          ? "Spec to confirm"
                          : "Your choice of product / size"}
                      {pick && surcharge > 0 && (
                        <span style={{ color: "var(--c-burnt)" }}> · options +{rm(surcharge)}</span>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => openUnit(i)}
                    className={pick ? "btn btn--ghost btn--sm" : "btn btn--primary btn--sm"}
                    data-testid={`bundle-slot-open-${i}`}
                  >
                    {pick ? "Change" : "Pick"}
                    <ChevronRight size={14} strokeWidth={2} />
                  </button>
                </div>
              );
            })}

            {/* Model chooser for the active multi-product unit. */}
            {activeUnit !== null && chosenModelId === null && (
              <div
                className="pos-card"
                style={{ padding: 16 }}
                data-testid="bundle-model-chooser"
              >
                <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 10 }}>
                  Item {units[activeUnit]!.si + 1}
                  {units[activeUnit]!.slot.qty > 1 ? ` · #${units[activeUnit]!.u + 1}` : ""} — which
                  product?
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {slotModels(units[activeUnit]!.slot).map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setChosenModelId(m.id)}
                      className="btn btn--ghost"
                      data-testid={`bundle-pick-model-${m.id}`}
                    >
                      {m.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Sticky order summary — the cart-foot anatomy. */}
          <aside
            className="pos-card"
            style={{ padding: 18, position: "sticky", top: 24 }}
            data-testid="bundle-walker-summary"
          >
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12 }}>Bundle summary</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 13 }}>
              {originalTotal > bundle.price && (
                <div style={{ display: "flex", justifyContent: "space-between", color: "var(--fg-muted)" }}>
                  <span>Worth (from)</span>
                  <s>{rm(originalTotal)}</s>
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>Bundle price</span>
                <span style={{ fontWeight: 600 }}>{rm(bundle.price)}</span>
              </div>
              {extraCents > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>Options</span>
                  <span>+{rm(extraCents / 100)}</span>
                </div>
              )}
              {originalTotal > bundle.price && (
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    color: "var(--c-burnt)",
                    fontWeight: 700,
                  }}
                >
                  <span>Customer saves</span>
                  <span>{rm(originalTotal - bundle.price)}</span>
                </div>
              )}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  borderTop: "1px solid var(--line-strong)",
                  paddingTop: 10,
                  marginTop: 4,
                }}
              >
                <span style={{ fontWeight: 600 }}>Total</span>
                <span className="pos-price text-[22px]">
                  <span className="pos-price-rm">RM</span>
                  {totalPreview.toLocaleString("en-MY")}
                </span>
              </div>
            </div>
            <button
              type="button"
              disabled={!allDone}
              onClick={addAll}
              className="btn btn--primary"
              style={{ width: "100%", marginTop: 14, justifyContent: "center" }}
              data-testid="bundle-walker-add"
            >
              Add to cart
            </button>
            {!allDone && (
              <p style={{ fontSize: 11, color: "var(--fg-muted)", marginTop: 8, textAlign: "center" }}>
                Pick every item to add the bundle.
              </p>
            )}
          </aside>
        </div>
      </div>

      {activeSurface}
    </div>,
    document.body,
  );
}
