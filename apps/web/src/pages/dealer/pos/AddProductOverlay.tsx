import { useMemo, useState } from "react";
import { X } from "lucide-react";
import type {
  CatalogResponse,
  Order,
  ProductCategory,
  ProductModelDto,
} from "@carres/shared";
import { CATEGORY_LABEL } from "@/pages/catalog/components/atoms";
import type { DraftLine } from "../new-order/draft";
import { lockedCategoriesFor } from "../new-order/configurators";
import { buildCatalogIndex } from "./catalog-index";
import ConfigureDrawer from "./ConfigureDrawer";
import ProductCard from "./ProductCard";

/**
 * AddProductOverlay — Add-product P1 (0231, design 2026-07-18 §4). Full-screen
 * catalog picker for appending products to a PLACE-lane order from the POS
 * order-detail drawer. Reuses the POS card grid + ConfigureDrawer (every
 * category configures in the drawer here — the full-page wizard surfaces stay
 * wizard-only). The emitted DraftLine goes to the parent, which POSTs
 * sku/qty/attrs ONLY — the server prices from the fresh catalog.
 *
 * Exclusions:
 *   · sofa models with OFFERED COMPARTMENTS (the visual-builder path) are
 *     hidden until P2 — the server 409s attrs.sofa_build as backstop (the
 *     compartment props are also withheld from ConfigureDrawer so no build
 *     entry can render);
 *   · categories locked by the 0089 mutex against the ORDER's existing lines
 *     dim out (same ProductCard `locked` affordance as the wizard).
 *
 * z-index: the POS detail drawer sits at z-100 (`.os-detail-overlay`) while
 * ConfigureDrawer is a fixed z-60 — so everything here nests in ONE z-[110]
 * container, creating a stacking context in which the drawer's own z-60
 * still paints above the grid.
 */
export default function AddProductOverlay({
  order,
  catalog,
  busy,
  error,
  onPick,
  onClose,
}: {
  order: Order;
  catalog: CatalogResponse;
  busy: boolean;
  error: string | null;
  /** The configured line to append — the parent runs the POST and closes on success. */
  onPick: (line: DraftLine) => void;
  onClose: () => void;
}) {
  const index = useMemo(
    () => buildCatalogIndex(catalog, catalog.fabricTierConfig, catalog.modelFabricTierOverrides),
    [catalog],
  );
  const [search, setSearch] = useState("");
  const [cat, setCat] = useState<ProductCategory | "all">("all");
  const [configureModel, setConfigureModel] = useState<ProductModelDto | null>(null);

  // 0089 mutex against the ORDER's existing lines (lockedCategoriesFor only
  // reads `.sku`, so the persisted rows adapt structurally).
  const lockedCats = useMemo(() => {
    const pseudo = (order.lines ?? []).map((l) => ({ sku: l.sku })) as unknown as Parameters<
      typeof lockedCategoriesFor
    >[0];
    return lockedCategoriesFor(pseudo, index.skuToCategory);
  }, [order.lines, index]);

  // Sofa models offering compartments = the build path → hidden until P2.
  const buildOnlyModelIds = useMemo(() => {
    const ids = new Set<string>();
    for (const mc of catalog.modelSofaCompartments ?? []) ids.add(mc.modelId);
    return ids;
  }, [catalog.modelSofaCompartments]);

  const models = useMemo(() => {
    const q = search.trim().toLowerCase();
    return index.productModels.filter((m) => {
      if (m.category === "sofa" && buildOnlyModelIds.has(m.id)) return false;
      if (cat !== "all" && m.category !== cat) return false;
      if (q && !(index.meta.get(m.id)?.searchBlob ?? "").includes(q)) return false;
      return true;
    });
  }, [index, cat, search, buildOnlyModelIds]);

  const cats = useMemo(() => {
    const present = new Set<ProductCategory>();
    for (const m of index.productModels) {
      if (m.category === "sofa" && buildOnlyModelIds.has(m.id)) continue;
      present.add(m.category);
    }
    return [...present];
  }, [index, buildOnlyModelIds]);

  return (
    <div className="fixed inset-0 z-[110]" data-testid="pos-add-product-overlay">
      <div
        className="absolute inset-0 bg-base-900/55"
        onClick={onClose}
        role="presentation"
        aria-hidden="true"
      />
      <div
        className="absolute inset-0 sm:inset-8 bg-base-50 sm:rounded-md shadow-md flex flex-col overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-label="Add product"
      >
        <header className="flex items-center gap-3 px-6 py-4 border-b border-base-200 bg-white">
          <div className="min-w-0 flex-1">
            <p className="kicker">Order #{order.so}</p>
            <h2 className="t-h3">Add product</h2>
          </div>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search products…"
            aria-label="Search products"
            className="w-[220px] px-3 py-2 border border-base-300 rounded bg-white text-sm outline-none focus:border-primary"
            data-testid="pos-add-search"
          />
          <button
            type="button"
            className="btn-ghost p-2"
            onClick={onClose}
            aria-label="Close add product"
            data-testid="pos-add-close"
          >
            <X size={18} strokeWidth={1.75} />
          </button>
        </header>

        <div className="flex items-center gap-1.5 px-6 py-3 flex-wrap">
          <CatChip active={cat === "all"} label="All" onClick={() => setCat("all")} />
          {cats.map((ck) => (
            <CatChip
              key={ck}
              active={cat === ck}
              label={CATEGORY_LABEL[ck]}
              onClick={() => setCat(ck)}
            />
          ))}
        </div>

        {error && (
          <div
            className="mx-6 mb-2 px-3 py-2 rounded border border-danger/40 bg-danger/5 text-sm text-danger"
            data-testid="pos-add-error"
          >
            {error}
          </div>
        )}

        <div className="flex-1 overflow-auto px-6 pb-8">
          {busy && <div className="t-small text-base-500 mb-2">Adding…</div>}
          {models.length === 0 ? (
            <div className="t-small text-base-500 py-10 text-center">No products match.</div>
          ) : (
            <div className="cat-grid">
              {models.map((m) => (
                <ProductCard
                  key={m.id}
                  model={m}
                  meta={index.meta.get(m.id)!}
                  locked={lockedCats.has(m.category)}
                  onConfigure={() => setConfigureModel(m)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {configureModel && (
        <ConfigureDrawer
          model={configureModel}
          meta={index.meta.get(configureModel.id)}
          skus={index.skusByModel.get(configureModel.id) ?? []}
          fabrics={index.fabricsByModel.get(configureModel.id) ?? []}
          fabricTierConfig={catalog.fabricTierConfig}
          modelFabricTierOverrides={catalog.modelFabricTierOverrides}
          specialAddons={catalog.specialAddons}
          onAdd={(line) => {
            setConfigureModel(null);
            onPick(line);
          }}
          onClose={() => setConfigureModel(null)}
        />
      )}
    </div>
  );
}

function CatChip({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full border text-[12px] font-semibold transition-colors ${
        active
          ? "border-primary bg-primary text-white"
          : "border-base-200 bg-white text-base-700 hover:border-primary/40"
      }`}
    >
      {label}
    </button>
  );
}
