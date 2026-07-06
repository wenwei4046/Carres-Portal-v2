import { useMemo, useState } from "react";
import { Layers, Search, SlidersHorizontal } from "lucide-react";
import type {
  CatalogResponse,
  ProductCategory,
  ProductModelDto,
  ProductSkuDto,
} from "@carres/shared";
import { PRODUCT_CATEGORIES } from "@carres/shared";
import { CategoryChip, CATEGORY_LABEL } from "../components/atoms";
import AllowedOptionsModal from "./AllowedOptionsModal";
import ProductModelDrawer from "./ProductModelDrawer";
import NewModelModal from "./NewModelModal";

/**
 * Modular — the 2990s "Products › Modular" layout (Loo 2026-07-06 screenshots):
 * a searchable card wall grouped by CATEGORY ("N MODELS · CLICK A CARD TO EDIT
 * ALLOWED OPTIONS"). Clicking a card opens the CENTERED Allowed Options modal
 * (the daily action — tick what POS staff can pick). The heavier model-setup
 * surface (photo · blurb · SKU generation · per-SKU toggles · sofa combos)
 * stays in the legacy drawer, reachable from the card's corner icon or the
 * modal's "Model setup" link — 2990s keeps the same split ("those stay on
 * Backend").
 *
 * Card badges: "Hidden from POS" = the model HAS SKUs but none is pos_active
 * (the 2990s model-level visibility, derived — Carres has no model.active).
 */

type CatFilter = ProductCategory | "all";

export default function ModularTab({
  catalog,
  isPrincipal = false,
}: {
  catalog: CatalogResponse;
  isPrincipal?: boolean;
}) {
  const [category, setCategory] = useState<CatFilter>("all");
  const [search, setSearch] = useState("");
  const [optionsModelId, setOptionsModelId] = useState<string | null>(null);
  const [drawerModelId, setDrawerModelId] = useState<string | null>(null);
  const [newModelOpen, setNewModelOpen] = useState(false);

  const skusByModel = useMemo(() => {
    const m = new Map<string, ProductSkuDto[]>();
    for (const s of catalog.skus) {
      const arr = m.get(s.modelId) ?? [];
      arr.push(s);
      m.set(s.modelId, arr);
    }
    return m;
  }, [catalog.skus]);

  const q = search.trim().toLowerCase();

  // Group models by category, canonical order, honouring the filter + search.
  const grouped = useMemo(() => {
    const out: { category: ProductCategory; models: ProductModelDto[] }[] = [];
    for (const cat of PRODUCT_CATEGORIES) {
      if (category !== "all" && category !== cat) continue;
      const models = catalog.models
        .filter((m) => m.category === cat)
        .filter(
          (m) =>
            !q ||
            m.name.toLowerCase().includes(q) ||
            m.modelKey.toLowerCase().includes(q) ||
            (m.blurb ?? "").toLowerCase().includes(q),
        )
        .sort((a, b) => a.name.localeCompare(b.name));
      if (models.length > 0) out.push({ category: cat, models });
    }
    return out;
  }, [catalog.models, category, q]);

  const totalShown = grouped.reduce((s, g) => s + g.models.length, 0);

  const optionsModel = optionsModelId
    ? catalog.models.find((m) => m.id === optionsModelId) ?? null
    : null;
  const drawerModel = drawerModelId
    ? catalog.models.find((m) => m.id === drawerModelId) ?? null
    : null;

  return (
    <div>
      <div className="flex justify-between items-center gap-3 mb-3 flex-wrap">
        <div className="flex items-center gap-1.5 flex-wrap">
          <CategoryChip active={category === "all"} onClick={() => setCategory("all")}>
            All
          </CategoryChip>
          {PRODUCT_CATEGORIES.map((c) => (
            <CategoryChip key={c} active={category === c} onClick={() => setCategory(c)}>
              {CATEGORY_LABEL[c]}
            </CategoryChip>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search
              size={14}
              strokeWidth={1.75}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-base-400"
            />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search models…"
              aria-label="Search models"
              className="pl-8 pr-3 py-1.5 border border-base-300 rounded-full text-[13px] bg-white outline-none focus:border-base-500 w-56"
              data-testid="modular-search"
            />
          </div>
          <button
            type="button"
            onClick={() => setNewModelOpen(true)}
            className="btn-hero text-[12px]"
            data-testid="model-new"
          >
            + New Model
          </button>
        </div>
      </div>

      <div className="t-micro text-base-500 mb-4" data-testid="modular-count">
        {totalShown} MODEL{totalShown === 1 ? "" : "S"} · CLICK A CARD TO EDIT ALLOWED OPTIONS
      </div>

      {grouped.length === 0 && (
        <div className="t-small text-base-500 py-6">No models match.</div>
      )}

      <div className="flex flex-col gap-5">
        {grouped.map((group) => (
          <section
            key={group.category}
            className="bg-white border border-base-200 rounded-[6px] p-4"
            data-testid={`modular-group-${group.category}`}
          >
            <div className="flex items-center gap-2 mb-3">
              <span className="pill pill-neutral uppercase">{CATEGORY_LABEL[group.category]}</span>
              <span className="t-tiny text-base-500">
                {group.models.length} model{group.models.length === 1 ? "" : "s"}
              </span>
            </div>
            <div
              className="grid gap-3"
              style={{ gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))" }}
            >
              {group.models.map((model) => (
                <ModelCard
                  key={model.id}
                  model={model}
                  skus={skusByModel.get(model.id) ?? []}
                  onOpen={() => setOptionsModelId(model.id)}
                  onOpenSetup={() => setDrawerModelId(model.id)}
                />
              ))}
            </div>
          </section>
        ))}
      </div>

      {optionsModel && (
        <AllowedOptionsModal
          key={optionsModel.id}
          model={optionsModel}
          skus={skusByModel.get(optionsModel.id) ?? []}
          catalog={catalog}
          isPrincipal={isPrincipal}
          onOpenSetup={() => {
            setDrawerModelId(optionsModel.id);
            setOptionsModelId(null);
          }}
          onClose={() => setOptionsModelId(null)}
        />
      )}

      {drawerModel && (
        <ProductModelDrawer
          key={drawerModel.id}
          model={drawerModel}
          skus={skusByModel.get(drawerModel.id) ?? []}
          catalog={catalog}
          isPrincipal={isPrincipal}
          onClose={() => setDrawerModelId(null)}
        />
      )}

      {newModelOpen && <NewModelModal onClose={() => setNewModelOpen(false)} />}
    </div>
  );
}

function ModelCard({
  model,
  skus,
  onOpen,
  onOpenSetup,
}: {
  model: ProductModelDto;
  skus: ProductSkuDto[];
  onOpen: () => void;
  onOpenSetup: () => void;
}) {
  const liveSkus = skus.filter((s) => !s.discontinuedAt);
  const hidden = liveSkus.length > 0 && !liveSkus.some((s) => s.posActive !== false);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      className="group relative flex items-start gap-3 p-3 border border-base-200 rounded-[6px] bg-base-50/60 hover:border-base-400 hover:shadow-sm cursor-pointer transition-all"
      data-testid={`model-card-${model.modelKey}`}
      aria-label={`Edit allowed options for ${model.name}`}
    >
      {model.photoUrl ? (
        <img
          src={model.photoUrl}
          alt={model.name}
          className="w-12 h-12 object-cover rounded-[4px] border border-base-200 bg-white shrink-0"
          loading="lazy"
        />
      ) : (
        <div className="w-12 h-12 rounded-[4px] border border-dashed border-base-300 bg-white grid place-items-center text-base-300 text-[16px] shrink-0">
          ▦
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="t-small font-semibold text-base-900 uppercase truncate pr-6">
          {model.name}
        </div>
        <div className="t-tiny text-base-500 truncate">{model.modelKey}</div>
        {hidden && (
          <span className="pill pill-neutral mt-1 inline-block" data-testid={`model-hidden-${model.modelKey}`}>
            Hidden from POS
          </span>
        )}
        <div className="t-tiny text-base-500 mt-1 flex items-center gap-1">
          <Layers size={11} strokeWidth={1.75} />
          {liveSkus.length} SKU{liveSkus.length === 1 ? "" : "s"}
        </div>
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onOpenSetup();
        }}
        title="Model setup (photo · SKUs · combos)"
        aria-label={`Model setup for ${model.name}`}
        className="absolute top-2 right-2 p-1 rounded text-base-300 hover:text-base-700 hover:bg-base-100 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
        data-testid={`model-setup-${model.modelKey}`}
      >
        <SlidersHorizontal size={13} strokeWidth={1.75} />
      </button>
    </div>
  );
}
