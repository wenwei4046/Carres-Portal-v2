import { Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import type { CatalogResponse, ProductCategory } from "@carres/shared";
import { CATEGORY_LABEL } from "@/pages/catalog/components/atoms";
import { useDebouncedValue } from "@/lib/useDebouncedValue";
import type { DraftLine, WizardDraft } from "../new-order/draft";
import { lockedCategoriesFor } from "../new-order/configurators";
import { buildCatalogIndex } from "./catalog-index";
import { cartItemCount, cartTotalExStair, mergeLine } from "./cart";
import CategoryRail, { type RailEntry, type RailKey } from "./CategoryRail";
import ProductCard from "./ProductCard";
import ConfigureDrawer from "./ConfigureDrawer";
import CartDrawer from "./CartDrawer";
import AddonsPanel from "./AddonsPanel";
import FloatingCartButton from "./FloatingCartButton";

const RAIL_ICON: Record<RailKey, string> = {
  all: "▦",
  mattress: "▭",
  bedframe: "▤",
  sofa: "◳",
  addons: "✦",
};
const CARD_ORDER: ProductCategory[] = ["mattress", "bedframe", "sofa"];

/**
 * Step 01 — POS catalog. Left category rail + searchable, category-grouped
 * product card grid (+ an "Add-ons" panel), a configure drawer per model, a
 * cart drawer, and the floating cart CTA. Builds `DraftLine`/`DraftAddon`
 * objects identical to the legacy wizard so the submit pipeline is untouched.
 *
 * Visual re-skin (2990s style): sticky pill-search toolbar, auto-fill card
 * grid (minmax 240px), flame rail, price-hero cards, ink-pill cart FAB.
 * All data-flow logic (mergeLine, mutex, toast): UNCHANGED.
 */
export default function CatalogStep({
  draft,
  onChange,
  catalog,
  onProceed,
  cartOpen,
  onCartOpenChange,
}: {
  draft: WizardDraft;
  onChange: (next: WizardDraft) => void;
  catalog: CatalogResponse;
  onProceed: () => void;
  cartOpen: boolean;
  onCartOpenChange: (open: boolean) => void;
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
    { key: "all", label: "All products", count: index.productModels.length, icon: RAIL_ICON.all },
    {
      key: "mattress",
      label: CATEGORY_LABEL.mattress,
      count: countByCat.get("mattress") ?? 0,
      icon: RAIL_ICON.mattress,
      locked: lockedCats.has("mattress"),
    },
    {
      key: "bedframe",
      label: "Bed Frame",
      count: countByCat.get("bedframe") ?? 0,
      icon: RAIL_ICON.bedframe,
      locked: lockedCats.has("bedframe"),
    },
    {
      key: "sofa",
      label: CATEGORY_LABEL.sofa,
      count: countByCat.get("sofa") ?? 0,
      icon: RAIL_ICON.sofa,
      locked: lockedCats.has("sofa"),
    },
    { key: "addons", label: "Add-ons", count: activeAddons.length, icon: RAIL_ICON.addons },
  ];

  // Which category sections to render, filtered by search.
  const shownCats = activeRail === "all" ? CARD_ORDER : [activeRail as ProductCategory];
  const sections = shownCats
    .filter((cat) => cat === "mattress" || cat === "bedframe" || cat === "sofa")
    .map((cat) => {
      const models = index.productModels.filter((m) => {
        if (m.category !== cat) return false;
        if (!search) return true;
        return index.meta.get(m.id)?.searchBlob.includes(search) ?? false;
      });
      return { cat, models };
    })
    .filter((s) => s.models.length > 0);

  const shownModelCount = sections.reduce((n, s) => n + s.models.length, 0);

  function addLine(line: DraftLine) {
    onChange({ ...draft, lines: mergeLine(draft.lines, line) });
    // Trigger the one-shot FAB pulse (class applied by FloatingCartButton when
    // pulse=true; cleared after 220ms).
    setPulse(true);
    window.setTimeout(() => setPulse(false), 220);
    toast.success("Added to cart");
  }

  const configureModel = configureModelId
    ? index.productModels.find((m) => m.id === configureModelId) ?? null
    : null;

  const itemCount = cartItemCount(draft.lines);
  const cartTotal = cartTotalExStair(draft.lines, draft.addons);

  return (
    <div className="flex h-full min-h-0">
      {/* Left category rail */}
      <aside className="hidden md:flex w-56 shrink-0 flex-col border-r border-base-100 bg-white overflow-auto px-2 py-4">
        <CategoryRail entries={railEntries} active={activeRail} onSelect={setActiveRail} />
        <div className="mt-auto pt-6 px-3">
          <p className="label mb-1.5">Honest pricing</p>
          <p className="t-tiny text-base-400 leading-relaxed">
            Every model is priced on its own — no markups, no surprises. What you see is the floor
            price.
          </p>
        </div>
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
              placeholder="Search by name, model, fabric…"
              aria-label="Search catalog"
              className="w-full pl-9 pr-4 py-2 rounded-full border border-base-200 bg-base-50 t-small outline-none
                         focus:border-primary focus:ring-2 focus:ring-primary/15 focus:bg-white transition-all"
            />
          </div>

          {/* Section label + count */}
          <span className="t-tiny text-base-400 whitespace-nowrap">
            {activeRail === "addons"
              ? `${activeAddons.length} add-on${activeAddons.length === 1 ? "" : "s"}`
              : `${shownModelCount} item${shownModelCount === 1 ? "" : "s"}`}
          </span>
        </div>

        <div className="flex-1 overflow-auto px-5 py-5 pb-28">
          {activeRail === "addons" ? (
            <AddonsPanel addons={activeAddons} draft={draft} onChange={onChange} />
          ) : sections.length === 0 ? (
            <p className="t-body text-base-500 text-center py-16">
              {search ? `No products match "${rawSearch.trim()}".` : "No products in catalog."}
            </p>
          ) : (
            <div className="flex flex-col gap-8">
              {sections.map(({ cat, models }) => (
                <section key={cat}>
                  <div className="flex items-baseline gap-2 mb-3">
                    <span className="pill pill-neutral">{CATEGORY_LABEL[cat]}</span>
                    <span className="font-mono text-[11px] text-base-400">
                      {models.length} model{models.length === 1 ? "" : "s"}
                    </span>
                  </div>
                  {/* Auto-fill grid: minmax(240px, 1fr) */}
                  <div
                    className="grid gap-4"
                    style={{ gridTemplateColumns: "repeat(auto-fill,minmax(240px,1fr))" }}
                  >
                    {models.map((model) => (
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
              ))}
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
        />
      )}
    </div>
  );
}
