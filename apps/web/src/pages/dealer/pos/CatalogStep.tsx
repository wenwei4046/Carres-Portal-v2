import { Search, Sofa } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import type {
  CatalogResponse,
  ProductCategory,
  ProductModelDto,
  PwpCodeDto,
  PwpDiscoverDto,
} from "@carres/shared";
import { useDebouncedValue } from "@/lib/useDebouncedValue";
import { type DraftLine, type WizardDraft } from "../new-order/draft";
import { lockedCategoriesFor, newLocalId } from "../new-order/configurators";
import { offeredSpecialsFor } from "../new-order/special-addons-picker";
import { buildCatalogIndex } from "./catalog-index";
import { cartItemCount, cartTotalExStair, mergeLine } from "./cart";
import PosSidebar, { type RailEntry, type RailKey } from "./PosSidebar";
import ProductCard from "./ProductCard";
import ConfigureDrawer from "./ConfigureDrawer";
import PosConfigurePage from "./PosConfigurePage";
import SofaConfigurePage from "./SofaConfigurePage";
import CartDrawer from "./CartDrawer";
import AddonsPanel, { offerableAddons } from "./AddonsPanel";
import FloatingCartButton from "./FloatingCartButton";

const CARD_ORDER: ProductCategory[] = ["mattress", "bedframe", "sofa", "accessory"];

/**
 * Step 01 — POS catalog. 2990s-parity layout: sectioned left sidebar
 * (categories / quick / principal-only MAINTAIN / pricing footer), searchable
 * card grid grouped under ONE brand-series header (Carres is a single brand —
 * the 2990s multi-brand grouping collapses to one "CARRES" section), an
 * "Add-ons" panel, a configure drawer per model, a cart drawer, and the
 * floating cart CTA. Builds `DraftLine`/`DraftAddon` objects identical to the
 * legacy wizard so the submit pipeline is untouched.
 *
 * All data-flow logic (mergeLine, mutex, toast): UNCHANGED.
 */
export default function CatalogStep({
  draft,
  onChange,
  catalog,
  onProceed,
  cartOpen,
  onCartOpenChange,
  pwpReservedCodes,
  pwpClaimGroup,
  customerPhone,
  pwpAvailableVouchers,
  onApplyVoucherCode,
}: {
  draft: WizardDraft;
  onChange: (next: WizardDraft) => void;
  catalog: CatalogResponse;
  onProceed: () => void;
  cartOpen: boolean;
  onCartOpenChange: (open: boolean) => void;
  /** 0187 (Phase 8c) — the caller's RESERVED pwp_codes (from /pwp-codes/mine),
   *  feeding the CartDrawer voucher rail. Optional: absent → no voucher rail
   *  (DORMANT byte-identical). */
  pwpReservedCodes?: PwpCodeDto[];
  /** 0187 — the per-cart claimGroup correlation uuid bound onto a claimed reward
   *  line's attrs.pwp.claimGroup. Optional. */
  pwpClaimGroup?: string;
  /** 0188 (Phase 8d) — the cart's customer phone (gates the cross-order
   *  "Redeem saved voucher" affordance). Optional. */
  customerPhone?: string;
  /** 0188 — AVAILABLE carry-forward vouchers discovered for the customer phone. */
  pwpAvailableVouchers?: PwpDiscoverDto[];
  /** 0188 — manual voucher-code lookup callback (type/scan a number). */
  onApplyVoucherCode?: (code: string) => Promise<PwpDiscoverDto | null>;
}) {
  const index = useMemo(
    () =>
      buildCatalogIndex(catalog, catalog.fabricTierConfig, catalog.modelFabricTierOverrides),
    [catalog],
  );
  const activeAddons = useMemo(() => offerableAddons(catalog.addons), [catalog.addons]);

  const [activeRail, setActiveRail] = useState<RailKey>("all");
  const [rawSearch, setRawSearch] = useState("");
  const search = useDebouncedValue(rawSearch.trim().toLowerCase(), 180);
  const [configureModelId, setConfigureModelId] = useState<string | null>(null);
  const [pulse, setPulse] = useState(false);

  const lockedCats = useMemo(
    () => lockedCategoriesFor(draft.lines, index.skuToCategory),
    [draft.lines, index.skuToCategory],
  );

  // If the active category just got locked by the mutex, bounce to All.
  useEffect(() => {
    if (activeRail !== "all" && activeRail !== "addons" && lockedCats.has(activeRail)) {
      setActiveRail("all");
    }
  }, [activeRail, lockedCats]);

  const countByCat = useMemo(() => {
    const m = new Map<ProductCategory, number>();
    for (const model of index.productModels) {
      m.set(model.category, (m.get(model.category) ?? 0) + 1);
    }
    return m;
  }, [index.productModels]);

  // Which model IDs have lines in the cart (for .pos-selected ring on cards).
  // DraftLine.sku is the sku code string; match against ProductSkuDto.sku.
  const modelIdsInCart = useMemo(() => {
    const cartSkus = new Set(draft.lines.map((l) => l.sku));
    const s = new Set<string>();
    for (const [modelId, skus] of index.skusByModel) {
      if (skus.some((sk) => cartSkus.has(sk.sku))) {
        s.add(modelId);
      }
    }
    return s;
  }, [draft.lines, index.skusByModel]);

  const railEntries: RailEntry[] = [
    { key: "all", label: "All open", count: index.productModels.length },
    {
      key: "mattress",
      label: "Mattresses",
      count: countByCat.get("mattress") ?? 0,
      locked: lockedCats.has("mattress"),
    },
    {
      key: "bedframe",
      label: "Bed frames",
      count: countByCat.get("bedframe") ?? 0,
      locked: lockedCats.has("bedframe"),
    },
    {
      key: "sofa",
      label: "Sofas",
      count: countByCat.get("sofa") ?? 0,
      locked: lockedCats.has("sofa"),
    },
    // Accessories are cards too (2990s parity) — never mutex-locked.
    {
      key: "accessory",
      label: "Accessories",
      count: countByCat.get("accessory") ?? 0,
    },
    { key: "addons", label: "Add-ons", count: activeAddons.length },
  ];

  // Models to render, filtered by rail + search, ordered category-first
  // (mattress → bedframe → sofa) inside the single CARRES series group.
  const shownCats = activeRail === "all" ? CARD_ORDER : [activeRail as ProductCategory];
  const shownModels = shownCats
    .filter((cat) => CARD_ORDER.includes(cat))
    .flatMap((cat) =>
      index.productModels.filter((m) => {
        if (m.category !== cat) return false;
        if (!search) return true;
        return index.meta.get(m.id)?.searchBlob.includes(search) ?? false;
      }),
    );

  const shownModelCount = shownModels.length;

  // Sofa ↔ mattress/bedframe exclusivity, for the banner above the grid.
  // Sofa in cart locks the mattress+bedframe rails; either of those locks sofa.
  const cartHasSofa = lockedCats.has("mattress") || lockedCats.has("bedframe");
  const cartHasMainNonSofa = lockedCats.has("sofa");

  function resetFilters() {
    setRawSearch("");
    setActiveRail("all");
  }

  function addLine(line: DraftLine) {
    onChange({ ...draft, lines: mergeLine(draft.lines, line) });
    // Trigger the one-shot FAB pulse (class applied by FloatingCartButton when
    // pulse=true; cleared after 220ms).
    setPulse(true);
    window.setTimeout(() => setPulse(false), 220);
    toast.success("Added to cart");
  }

  // Card tap. Accessories / services have no options to pick — a single-sku,
  // no-specials model adds STRAIGHT to the cart (Loo 2026-07-06: "can direct
  // add to cart", no drawer). Anything with a real choice opens the configurator.
  function handleConfigure(model: ProductModelDto) {
    const modelSkus = index.skusByModel.get(model.id) ?? [];
    const flat = model.category === "accessory" || model.category === "service";
    if (flat && modelSkus.length === 1 && offeredSpecialsFor(model, catalog.specialAddons).length === 0) {
      const s = modelSkus[0]!;
      addLine({
        localId: newLocalId(),
        sku: s.sku,
        qty: 1,
        attrs: null,
        unitPrice: s.price,
        label: `${model.name} · ${s.variant}`,
      });
      return;
    }
    setConfigureModelId(model.id);
  }

  const configureModel = configureModelId
    ? index.productModels.find((m) => m.id === configureModelId) ?? null
    : null;

  const itemCount = cartItemCount(draft.lines);
  const cartTotal = cartTotalExStair(draft.lines, draft.addons);

  return (
    <div className="catalog">
      {/* Left sidebar — categories / TBC / quick / MAINTAIN (principal) / footer */}
      <PosSidebar
        entries={railEntries}
        active={activeRail}
        onSelect={setActiveRail}
        onResetFilters={resetFilters}
      />

      {/* Main: toolbar + grid / add-ons */}
      <main className="cat-main">
        <div className="cat-toolbar">
          <div className="cat-search">
            <Search size={16} strokeWidth={1.75} />
            <input
              type="search"
              value={rawSearch}
              onChange={(e) => setRawSearch(e.target.value)}
              placeholder="Search by name, SKU, or detail…"
              aria-label="Search catalog"
            />
          </div>
          {/* One brand today — the series filter activates when series data exists. */}
          <select className="cat-select" value="All series" onChange={() => {}}>
            <option>All series</option>
          </select>
          <span className="cat-toolbar__count">
            {activeRail === "addons"
              ? `${activeAddons.length} add-on${activeAddons.length === 1 ? "" : "s"}`
              : `${shownModelCount} piece${shownModelCount === 1 ? "" : "s"}`}
          </span>
        </div>

        <div className="cat-grid-wrap">
          {/* Sofa-exclusivity notice — functional mutex feedback. */}
          {activeRail !== "addons" && (cartHasSofa || cartHasMainNonSofa) && (
            <div
              className="fade-in"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "10px 14px",
                marginBottom: 16,
                background: "var(--pos-panel)",
                border: "1px solid var(--line-strong)",
                borderRadius: 12,
                fontSize: 12,
                color: "var(--fg)",
              }}
            >
              <Sofa size={16} strokeWidth={1.75} style={{ flexShrink: 0 }} />
              <span>
                {cartHasSofa
                  ? "Sofa order — sofas don't share an order with mattresses or bed frames. Check out or clear the cart to switch categories."
                  : "This order has a mattress or bed frame. Sofas are placed separately — check out or clear the cart to start a sofa order."}
              </span>
            </div>
          )}

          {activeRail === "addons" ? (
            <AddonsPanel addons={activeAddons} draft={draft} onChange={onChange} />
          ) : shownModels.length === 0 ? (
            <div className="cat-empty">
              <h4>No pieces match.</h4>
              <p>Try clearing the search or pick a different category.</p>
              {search && (
                <button
                  type="button"
                  onClick={resetFilters}
                  className="btn btn--ghost btn--sm"
                  style={{ marginTop: 14 }}
                >
                  Reset filters
                </button>
              )}
            </div>
          ) : (
            <div className="cat-grid">
              {shownModels.map((model) => (
                <ProductCard
                  key={model.id}
                  model={model}
                  meta={index.meta.get(model.id)!}
                  locked={lockedCats.has(model.category)}
                  inCart={modelIdsInCart.has(model.id)}
                  onConfigure={() => handleConfigure(model)}
                />
              ))}
            </div>
          )}
        </div>
      </main>

      <FloatingCartButton
        itemCount={itemCount}
        total={cartTotal}
        pulse={pulse}
        onClick={() => onCartOpenChange(true)}
      />

      {configureModel &&
        (() => {
          // POS-parity (Loo 2026-07-04) — a MODULAR sofa (offers compartments)
          // jumps STRAIGHT into the full-page configurator (Quick pick +
          // Customize tabs), no drawer hop. Every other model (mattress /
          // bedframe / accessory / dropdown-sofa) keeps the drawer.
          const offered = (catalog.modelSofaCompartments ?? []).filter(
            (mc) => mc.modelId === configureModel.id,
          );
          // Mattress + bed frame ALSO go full page now (prototype's
          // ConfiguratorScreen — plan-view canvas + live total), same
          // straight-in convention. Accessory / pillow / dropdown-sofa /
          // service keep the drawer.
          if (
            configureModel.category === "mattress" ||
            configureModel.category === "bedframe"
          ) {
            return (
              <PosConfigurePage
                model={configureModel}
                meta={index.meta.get(configureModel.id)}
                skus={index.skusByModel.get(configureModel.id) ?? []}
                specialAddons={catalog.specialAddons}
                optionPools={catalog.optionPools}
                fabrics={catalog.fabrics}
                fabricTierConfig={catalog.fabricTierConfig}
                modelFabricTierOverrides={catalog.modelFabricTierOverrides}
                catalog={catalog}
                cartLines={draft.lines}
                pwpReservedCodes={pwpReservedCodes}
                pwpClaimGroup={pwpClaimGroup}
                customerPhone={customerPhone}
                onApplyVoucherCode={onApplyVoucherCode}
                onAdd={addLine}
                onClose={() => setConfigureModelId(null)}
              />
            );
          }
          if (configureModel.category === "sofa" && offered.length > 0) {
            return (
              <SofaConfigurePage
                model={configureModel}
                meta={index.meta.get(configureModel.id)}
                skus={index.skusByModel.get(configureModel.id) ?? []}
                fabrics={index.fabricsByModel.get(configureModel.id) ?? []}
                masterFabrics={catalog.fabrics}
                optionPools={catalog.optionPools}
                fabricTierConfig={catalog.fabricTierConfig}
                modelFabricTierOverrides={catalog.modelFabricTierOverrides}
                sofaCompartments={catalog.sofaCompartments ?? []}
                modelCompartments={offered}
                sofaCombos={catalog.sofaCombos ?? []}
                catalog={catalog}
                cartLines={draft.lines}
                pwpReservedCodes={pwpReservedCodes}
                pwpClaimGroup={pwpClaimGroup}
                customerPhone={customerPhone}
                onApplyVoucherCode={onApplyVoucherCode}
                onAdd={addLine}
                onClose={() => setConfigureModelId(null)}
              />
            );
          }
          return (
            <ConfigureDrawer
              model={configureModel}
              meta={index.meta.get(configureModel.id)}
              skus={index.skusByModel.get(configureModel.id) ?? []}
              fabrics={index.fabricsByModel.get(configureModel.id) ?? []}
              fabricTierConfig={catalog.fabricTierConfig}
              modelFabricTierOverrides={catalog.modelFabricTierOverrides}
              sofaCompartments={catalog.sofaCompartments}
              modelSofaCompartments={catalog.modelSofaCompartments}
              sofaCombos={catalog.sofaCombos}
              specialAddons={catalog.specialAddons}
              onAdd={addLine}
              onClose={() => setConfigureModelId(null)}
            />
          );
        })()}

      {cartOpen && (
        <CartDrawer
          draft={draft}
          onChange={onChange}
          onProceed={() => {
            onCartOpenChange(false);
            onProceed();
          }}
          onClose={() => onCartOpenChange(false)}
          catalog={catalog}
          pwpReservedCodes={pwpReservedCodes}
          pwpClaimGroup={pwpClaimGroup}
          customerPhone={customerPhone}
          pwpAvailableVouchers={pwpAvailableVouchers}
          onApplyVoucherCode={onApplyVoucherCode}
        />
      )}
    </div>
  );
}
