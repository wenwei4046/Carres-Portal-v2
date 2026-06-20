import { useMemo, useState } from "react";
import { toast } from "sonner";
import type {
  CatalogResponse,
  ProductCategory,
  ProductModelDto,
  ProductSkuDto,
} from "@carres/shared";
import { PRODUCT_CATEGORIES } from "@carres/shared";
import { ApiError } from "@/lib/api";
import { usePatchCatalogModel } from "@/lib/queries";
import { CategoryChip, CATEGORY_LABEL, CodeChip } from "../components/atoms";
import ProductModelDrawer from "./ProductModelDrawer";

/**
 * Modular — model cards grouped by category. Each row: photo · category · code
 * · name (inline edit) · Active rollup pill · description · Edit (opens the
 * drawer). The drawer is where photo upload, option pools, the per-size SKU
 * ON/OFF toggles and Generate SKUs live.
 *
 * "Active" is a cosmetic rollup (D3): the model reads ACTIVE if ANY of its
 * SKUs is pos_active. It's not a writable model column — the real toggles are
 * per-SKU inside the drawer.
 */

const GRID_COLS = "56px 96px 130px minmax(160px,1.3fr) 92px minmax(140px,1fr) 64px";

type CatFilter = ProductCategory | "all";

export default function ModularTab({
  catalog,
  isPrincipal = false,
}: {
  catalog: CatalogResponse;
  isPrincipal?: boolean;
}) {
  const [category, setCategory] = useState<CatFilter>("all");
  const [drawerModelId, setDrawerModelId] = useState<string | null>(null);

  const skusByModel = useMemo(() => {
    const m = new Map<string, ProductSkuDto[]>();
    for (const s of catalog.skus) {
      const arr = m.get(s.modelId) ?? [];
      arr.push(s);
      m.set(s.modelId, arr);
    }
    return m;
  }, [catalog.skus]);

  // Group models by category, in the canonical category order, honouring the
  // active category filter.
  const grouped = useMemo(() => {
    const out: { category: ProductCategory; models: ProductModelDto[] }[] = [];
    for (const cat of PRODUCT_CATEGORIES) {
      if (category !== "all" && category !== cat) continue;
      const models = catalog.models
        .filter((m) => m.category === cat)
        .sort((a, b) => a.name.localeCompare(b.name));
      if (models.length > 0) out.push({ category: cat, models });
    }
    return out;
  }, [catalog.models, category]);

  const drawerModel = drawerModelId
    ? catalog.models.find((m) => m.id === drawerModelId) ?? null
    : null;

  return (
    <div>
      <div className="flex items-center gap-1.5 flex-wrap mb-4">
        <CategoryChip active={category === "all"} onClick={() => setCategory("all")}>
          All
        </CategoryChip>
        {PRODUCT_CATEGORIES.map((c) => (
          <CategoryChip key={c} active={category === c} onClick={() => setCategory(c)}>
            {CATEGORY_LABEL[c]}
          </CategoryChip>
        ))}
      </div>

      {grouped.length === 0 && (
        <div className="t-small text-base-500 py-6">No models in this category yet.</div>
      )}

      <div className="flex flex-col gap-6">
        {grouped.map((group) => (
          <div key={group.category}>
            <div className="t-micro text-base-500 mb-2">{CATEGORY_LABEL[group.category]}</div>
            <div className="bg-white border border-base-200 rounded-[4px] overflow-hidden">
              <div
                className="grid items-center gap-3 px-3 py-2 bg-base-50 border-b border-base-200"
                style={{ gridTemplateColumns: GRID_COLS }}
              >
                <div className="label">Photo</div>
                <div className="label">Code</div>
                <div className="label">Name</div>
                <div className="label">Description</div>
                <div className="label">Active</div>
                <div className="label" />
                <div className="label" />
              </div>
              {group.models.map((model) => (
                <ModelRow
                  key={model.id}
                  model={model}
                  skus={skusByModel.get(model.id) ?? []}
                  onEdit={() => setDrawerModelId(model.id)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

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
    </div>
  );
}

function ModelRow({
  model,
  skus,
  onEdit,
}: {
  model: ProductModelDto;
  skus: ProductSkuDto[];
  onEdit: () => void;
}) {
  const patch = usePatchCatalogModel();
  const [editingName, setEditingName] = useState(false);

  const activeRollup = skus.some((s) => s.posActive !== false && !s.discontinuedAt);

  function commitName(raw: string) {
    const next = raw.trim();
    setEditingName(false);
    if (next.length < 2 || next === model.name) return;
    patch.mutate(
      { id: model.id, patch: { name: next } },
      {
        onSuccess: () => toast.success("Name updated"),
        onError: (e: unknown) =>
          toast.error(e instanceof ApiError ? e.message : "Update failed"),
      },
    );
  }

  return (
    <div
      className="grid items-center gap-3 px-3 py-2 border-b border-base-100 last:border-b-0"
      style={{ gridTemplateColumns: GRID_COLS }}
      data-testid={`model-row-${model.modelKey}`}
    >
      <ModelPhotoCell photoUrl={model.photoUrl ?? null} alt={model.name} />
      <div>
        <CodeChip>{model.modelKey}</CodeChip>
      </div>
      <div>
        {editingName ? (
          <input
            autoFocus
            defaultValue={model.name}
            onBlur={(e) => commitName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") setEditingName(false);
            }}
            aria-label={`Edit ${model.name} name`}
            className="w-full px-2 py-1 border border-base-400 rounded-[3px] text-[13px] outline-none"
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditingName(true)}
            className="t-small text-base-800 font-medium text-left hover:underline decoration-dotted"
            title="Click to rename"
          >
            {model.name}
          </button>
        )}
      </div>
      <div className="t-tiny text-base-500 truncate" title={model.blurb ?? ""}>
        {model.blurb || <span className="text-base-300">—</span>}
      </div>
      <div>
        {activeRollup ? (
          <span className="pill pill-confirmed">ACTIVE</span>
        ) : (
          <span className="pill pill-neutral">INACTIVE</span>
        )}
      </div>
      <div className="t-tiny text-base-500">
        {skus.length} SKU{skus.length === 1 ? "" : "s"}
      </div>
      <div className="text-right">
        <button
          type="button"
          onClick={onEdit}
          className="btn-ghost text-[11px]"
          data-testid={`model-edit-${model.modelKey}`}
        >
          Edit
        </button>
      </div>
    </div>
  );
}

function ModelPhotoCell({ photoUrl, alt }: { photoUrl: string | null; alt: string }) {
  if (photoUrl) {
    return (
      <img
        src={photoUrl}
        alt={alt}
        className="w-12 h-12 object-cover rounded-[4px] border border-base-200 bg-base-50"
        loading="lazy"
      />
    );
  }
  return (
    <div className="w-12 h-12 rounded-[4px] border border-dashed border-base-300 bg-base-50 grid place-items-center text-base-300 text-[16px]">
      ▦
    </div>
  );
}
