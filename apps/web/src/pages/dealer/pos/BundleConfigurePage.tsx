import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronRight, X } from "lucide-react";
import type { BundleSlot, CatalogResponse, ProductBundleDto } from "@carres/shared";
import { rm } from "@/lib/format-currency";
import type { DraftLine } from "../new-order/draft";
import type { buildCatalogIndex } from "./catalog-index";
import { deriveBundleSlots, slotNeedsConfig, type BundleSlotPick } from "./bundle-flow";

type CatalogIndex = ReturnType<typeof buildCatalogIndex>;
import PosConfigurePage from "./PosConfigurePage";
import ConfigureDrawer from "./ConfigureDrawer";

/**
 * Bundle slot walker (0241) — the "pick your items" overlay a bundle opens
 * when any slot needs the customer's input. One row per item slot; the active
 * slot asks (a) which product, when the slot allows several, then (b) mounts
 * that product's OWN configure surface (PosConfigurePage for mattress/bed
 * frame, ConfigureDrawer for flat sofa / accessory / service) with the slot's
 * allowed variants — so specs (size / fabric / divan / legs / specials) work
 * EXACTLY like a single-item sale. No PWP/voucher props are passed: no
 * discount stacks inside a bundle. "Add to cart" arms only when every slot is
 * resolved; the caller assembles the Σ-exact split + surcharges.
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

  // Slots with nothing to ask auto-resolve at their pinned sku (catalog price,
  // no attrs) — the V1 behaviour, per slot.
  const [picks, setPicks] = useState<(BundleSlotPick | null)[]>(() =>
    slots.map((slot) => {
      if (slotNeedsConfig(slot, catalog)) return null;
      const sku = catalog.skus.find((s) => s.sku === slot.sku);
      const model = sku ? catalog.models.find((m) => m.id === sku.modelId) : undefined;
      if (!sku || !model) return null;
      return {
        sku: sku.sku,
        catalogPrice: sku.price,
        unitPrice: sku.price,
        qty: slot.qty,
        attrs: null,
        label: sku.variant?.trim() ? `${model.name} · ${sku.variant}` : model.name,
      };
    }),
  );
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const [chosenModelId, setChosenModelId] = useState<string | null>(null);

  const allDone = picks.every((p) => p !== null);
  const extra = picks.reduce(
    (s, p) => s + (p ? Math.round((p.unitPrice - p.catalogPrice) * 100) * p.qty : 0),
    0,
  );
  const totalPreview = bundle.price + extra / 100;

  function slotModels(slot: BundleSlot) {
    return slot.modelIds
      .map((id) => catalog.models.find((m) => m.id === id))
      .filter((m): m is NonNullable<typeof m> => Boolean(m));
  }

  function openSlot(i: number) {
    const slot = slots[i]!;
    const models = slotModels(slot);
    setActiveIdx(i);
    setChosenModelId(models.length === 1 ? models[0]!.id : null);
  }

  function recordPick(i: number, slot: BundleSlot, line: DraftLine) {
    const sku = catalog.skus.find((s) => s.sku === line.sku);
    if (!sku) return;
    setPicks((cur) =>
      cur.map((p, j) =>
        j === i
          ? {
              sku: line.sku,
              catalogPrice: sku.price,
              // qty is the SLOT's — the surface's stepper is ignored inside a
              // bundle (a slot sells exactly its quantity).
              unitPrice: line.unitPrice,
              qty: slot.qty,
              attrs: (line.attrs as Record<string, unknown> | null) ?? null,
              label: line.label,
            }
          : p,
      ),
    );
    setActiveIdx(null);
    setChosenModelId(null);
  }

  // The active slot's mounted configure surface.
  const activeSurface = (() => {
    if (activeIdx === null) return null;
    const slot = slots[activeIdx]!;
    const models = slotModels(slot);
    const model = chosenModelId ? models.find((m) => m.id === chosenModelId) : null;
    if (!model) return null;
    const liveSkus = catalog.skus.filter((s) => s.modelId === model.id && !s.discontinuedAt);
    const skus =
      slot.variant === "fixed" ? liveSkus.filter((s) => s.sku === slot.sku) : liveSkus;
    const seed: DraftLine | undefined =
      slot.variant === "fixed" && skus[0]
        ? { localId: "bundle-seed", sku: skus[0].sku, qty: slot.qty, attrs: null, unitPrice: 0, label: "" }
        : undefined;
    const common = {
      model,
      meta: index.meta.get(model.id),
      skus,
      onAdd: (line: DraftLine) => recordPick(activeIdx, slot, line),
      onClose: () => {
        setActiveIdx(null);
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
      <div style={{ maxWidth: 760, margin: "0 auto", padding: "28px 20px 120px" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 4 }}>
          <h2 style={{ fontFamily: "var(--font-title)", fontWeight: 700, fontSize: 22 }}>
            {bundle.name}
          </h2>
          <span className="pos-price text-[20px]">
            <span className="pos-price-rm">RM</span>
            {bundle.price.toLocaleString("en-MY")}
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
        <p style={{ fontSize: 12, color: "var(--fg-muted)", marginBottom: 18 }}>
          Pick each item — the bundle price covers the set; options with a surcharge add on top.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {slots.map((slot, i) => {
            const pick = picks[i];
            const models = slotModels(slot);
            const title =
              slot.label ??
              (models.length === 1 ? models[0]!.name : models.map((m) => m.name).join(" / "));
            return (
              <div
                key={i}
                className="pos-card"
                style={{ padding: "14px 16px", display: "flex", alignItems: "center", gap: 12 }}
                data-testid={`bundle-slot-${i}`}
              >
                <span
                  aria-hidden="true"
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: 999,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: pick ? "var(--success-soft, #e6f6ec)" : "var(--pos-panel, #f4f1ea)",
                    color: pick ? "var(--success, #1a7f4b)" : "var(--fg-muted)",
                    fontSize: 12,
                    fontWeight: 700,
                    flexShrink: 0,
                  }}
                >
                  {pick ? <Check size={14} strokeWidth={2.5} /> : i + 1}
                </span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>
                    Item {i + 1} · {title}
                    {slot.qty > 1 && <span style={{ color: "var(--fg-muted)" }}> ×{slot.qty}</span>}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--fg-muted)" }}>
                    {pick
                      ? `${pick.label}${pick.unitPrice > pick.catalogPrice ? ` · options +${rm((pick.unitPrice - pick.catalogPrice) * pick.qty)}` : ""}`
                      : slot.variant === "fixed"
                        ? "Spec to confirm"
                        : "Your choice of product / size"}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => openSlot(i)}
                  className={pick ? "btn btn--ghost btn--sm" : "btn btn--primary btn--sm"}
                  data-testid={`bundle-slot-open-${i}`}
                >
                  {pick ? "Change" : "Pick"}
                  <ChevronRight size={14} strokeWidth={2} />
                </button>
              </div>
            );
          })}
        </div>

        {/* Model chooser for the active multi-product slot. */}
        {activeIdx !== null && chosenModelId === null && (
          <div
            className="pos-card"
            style={{ marginTop: 14, padding: 16 }}
            data-testid="bundle-model-chooser"
          >
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 10 }}>
              Item {activeIdx + 1} — which product?
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {slotModels(slots[activeIdx]!).map((m) => (
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

        <div
          style={{
            position: "fixed",
            left: 0,
            right: 0,
            bottom: 0,
            background: "var(--pos-panel, #fff)",
            borderTop: "1px solid var(--line-strong, #e5e1d8)",
            padding: "12px 20px",
            display: "flex",
            alignItems: "center",
            gap: 14,
            justifyContent: "flex-end",
          }}
        >
          <span style={{ fontSize: 12, color: "var(--fg-muted)" }}>
            Bundle {rm(bundle.price)}
            {extra > 0 && ` + options ${rm(extra / 100)}`}
          </span>
          <span className="pos-price text-[18px]">
            <span className="pos-price-rm">RM</span>
            {totalPreview.toLocaleString("en-MY")}
          </span>
          <button
            type="button"
            disabled={!allDone}
            onClick={() => onComplete(picks as BundleSlotPick[])}
            className="btn btn--primary"
            data-testid="bundle-walker-add"
          >
            Add to cart
          </button>
        </div>
      </div>

      {activeSurface}
    </div>,
    document.body,
  );
}
