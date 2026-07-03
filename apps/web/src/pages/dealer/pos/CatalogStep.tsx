import { Search, Sofa } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import type {
  CatalogResponse,
  ComboDto,
  ProductCategory,
  PwpCodeDto,
  PwpDiscoverDto,
} from "@carres/shared";
import { useDebouncedValue } from "@/lib/useDebouncedValue";
import { comboToDraftLines, type DraftLine, type WizardDraft } from "../new-order/draft";
import { lockedCategoriesFor } from "../new-order/configurators";
import { buildCatalogIndex } from "./catalog-index";
import { cartItemCount, cartTotalExStair, mergeLine } from "./cart";
import PosSidebar, { type RailEntry, type RailKey } from "./PosSidebar";
import ProductCard from "./ProductCard";
import ComboCard from "./ComboCard";
import ConfigureDrawer from "./ConfigureDrawer";
import CartDrawer from "./CartDrawer";
import AddonsPanel from "./AddonsPanel";
import FloatingCartButton from "./FloatingCartButton";

const CARD_ORDER: ProductCategory[] = ["mattress", "bedframe", "sofa"];

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
  const activeAddons = useMemo(() => catalog.addons.filter((a) => a.active), [catalog.addons]);

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
    { key: "addons", label: "Add-ons", count: activeAddons.length },
  ];

  // Models to render, filtered by rail + search, ordered category-first
  // (mattress → bedframe → sofa) inside the single CARRES series group.
  const shownCats = activeRail === "all" ? CARD_ORDER : [activeRail as ProductCategory];
  const shownModels = shownCats
    .filter((cat) => cat === "mattress" || cat === "bedframe" || cat === "sofa")
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

  // Explode a combo into its component DraftLines (split price) and fold ALL of
  // them into the cart via mergeLine. attrs.combo_key keeps them grouped + lets
  // CartDrawer offer one "Remove combo". Re-adding the same combo bumps qty via
  // mergeLine (acceptable v1). The exploded lines carry the SELLING price from
  // the catalog; a component SKU missing from the bundle is priced 0 by
  // explodeCombo and the rest absorb the combo total (accepted v1 behaviour).
  function addCombo(combo: ComboDto) {
    const cls = comboToDraftLines(combo, (sku) => ({
      price: index.skuPrice.get(sku) ?? NaN,
      label: index.skuLabel.get(sku) ?? sku,
    }));
    let lines = draft.lines;
    for (const l of cls) lines = mergeLine(lines, l);
    onChange({ ...draft, lines });
    setPulse(true);
    window.setTimeout(() => setPulse(false), 220);
    toast.success(`Added "${combo.name}" (${cls.length} item${cls.length === 1 ? "" : "s"})`);
  }

  // Combos shown only on the "All" rail (combos aren't a product category) and
  // filtered by the same search box (match on name or comboKey).
  const shownCombos =
    activeRail === "all"
      ? index.combos.filter(
          (c) =>
            !search ||
            c.name.toLowerCase().includes(search) ||
            c.comboKey.toLowerCase().includes(search),
        )
      : [];

  const configureModel = configureModelId
    ? index.productModels.find((m) => m.id === configureModelId) ?? null
    : null;

  const itemCount = cartItemCount(draft.lines);
  const cartTotal = cartTotalExStair(draft.lines, draft.addons);

  return (
    <div className="flex h-full min-h-0">
      {/* Left sidebar — categories / quick / MAINTAIN (principal) / footer */}
      <aside className="hidden md:flex w-60 shrink-0 flex-col border-r border-base-100 bg-white overflow-auto px-2 py-4">
        <PosSidebar
          entries={railEntries}
          active={activeRail}
          onSelect={setActiveRail}
          onResetFilters={resetFilters}
        />
      </aside>

      {/* Main: sticky toolbar + grid / add-ons */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Sticky toolbar */}
        <div className="flex items-center gap-3 px-5 py-3 border-b border-base-100 bg-white/90 backdrop-blur sticky top-0 z-10">
          {/* Pill search input with flame focus ring */}
          <div className="relative flex-1 max-w-sm">
            <Search
              size={15}
              strokeWidth={1.75}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-base-400 pointer-events-none"
            />
            <input
              type="search"
              value={rawSearch}
              onChange={(e) => setRawSearch(e.target.value)}
              placeholder="Name, SKU, model…"
              aria-label="Search catalog"
              className="w-full pl-9 pr-4 py-2 rounded-full border border-base-200 bg-base-50 t-small outline-none
                         focus:border-primary focus:ring-2 focus:ring-primary/15 focus:bg-white transition-all"
            />
          </div>

          {/* Section label + count */}
          <span className="t-tiny text-base-400 whitespace-nowrap">
            {activeRail === "addons"
              ? `${activeAddons.length} add-on${activeAddons.length === 1 ? "" : "s"}`
              : `${shownModelCount} piece${shownModelCount === 1 ? "" : "s"}`}
          </span>
        </div>

        <div className="flex-1 overflow-auto px-5 py-5 pb-28">
          {/* Sofa-exclusivity notice — mirrors the 2990s catalog banner. */}
          {activeRail !== "addons" && (cartHasSofa || cartHasMainNonSofa) && (
            <div className="flex items-center gap-2 px-3.5 py-2.5 mb-4 rounded-lg border border-base-200 bg-base-50 t-small text-base-700">
              <Sofa size={16} strokeWidth={1.75} className="shrink-0 text-base-500" />
              <span>
                {cartHasSofa
                  ? "Sofa order — sofas don't share an order with mattresses or bed frames. Check out or clear the cart to switch categories."
                  : "This order has a mattress or bed frame. Sofas are placed separately — check out or clear the cart to start a sofa order."}
              </span>
            </div>
          )}

          {activeRail === "addons" ? (
            <AddonsPanel addons={activeAddons} draft={draft} onChange={onChange} />
          ) : shownModels.length === 0 && shownCombos.length === 0 ? (
            <div className="text-center py-16">
              <p className="t-body text-base-500">
                {search ? `No pieces match "${rawSearch.trim()}".` : "No products in catalog."}
              </p>
              {search && (
                <button type="button" onClick={resetFilters} className="btn-secondary mt-4">
                  Reset filters
                </button>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-8">
              {/* Combos (套餐) — featured bundle row, "All" rail only. */}
              {shownCombos.length > 0 && (
                <section data-testid="pos-combos-section">
                  <div className="flex items-baseline gap-2 mb-3">
                    <span className="pill pill-neutral">Combos</span>
                    <span className="font-mono text-[11px] text-base-400">
                      {shownCombos.length} bundle{shownCombos.length === 1 ? "" : "s"}
                    </span>
                  </div>
                  <div
                    className="grid gap-4"
                    style={{ gridTemplateColumns: "repeat(auto-fill,minmax(240px,1fr))" }}
                  >
                    {shownCombos.map((combo) => (
                      <ComboCard key={combo.id} combo={combo} onAdd={() => addCombo(combo)} />
                    ))}
                  </div>
                </section>
              )}

              {/* Single-brand series group — Carres is ONE brand, so the 2990s
                  per-branding sections collapse to one "CARRES" header. */}
              {shownModels.length > 0 && (
                <section data-testid="pos-series-carres">
                  <div className="flex items-baseline gap-2 mb-3">
                    <span className="pill pill-neutral">CARRES</span>
                    <span className="font-mono text-[11px] text-base-400">
                      {shownModelCount} piece{shownModelCount === 1 ? "" : "s"}
                    </span>
                  </div>
                  {/* Auto-fill grid: minmax(240px, 1fr) */}
                  <div
                    className="grid gap-4"
                    style={{ gridTemplateColumns: "repeat(auto-fill,minmax(240px,1fr))" }}
                  >
                    {shownModels.map((model) => (
                      <ProductCard
                        key={model.id}
                        model={model}
                        meta={index.meta.get(model.id)!}
                        locked={lockedCats.has(model.category)}
                        inCart={modelIdsInCart.has(model.id)}
                        onConfigure={() => setConfigureModelId(model.id)}
                      />
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}
        </div>
      </div>

      <FloatingCartButton
        itemCount={itemCount}
        total={cartTotal}
        pulse={pulse}
        onClick={() => onCartOpenChange(true)}
      />

      {configureModel && (
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
      )}

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
