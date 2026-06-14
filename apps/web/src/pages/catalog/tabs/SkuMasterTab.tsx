import { memo, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import type {
  CatalogResponse,
  ProductCategory,
  ProductModelDto,
  ProductSkuDto,
} from "@carres/shared";
import { PRODUCT_CATEGORIES } from "@carres/shared";
import { ApiError } from "@/lib/api";
import { useDeleteCatalogSku, usePatchCatalogSku } from "@/lib/queries";
import { INPUT_CLS } from "@/pages/operation/components/Modal";
import { CategoryChip, CATEGORY_LABEL, CodeChip, SkuStatusPill } from "../components/atoms";
import NewSkuModal from "./NewSkuModal";

/**
 * SKU Master — flat 7-column product table (+ a leading select column for bulk
 * delete). Columns: Product code · Description · Product name · Category ·
 * Size · Price · Status. Filter by category + free-text search; "Edit Prices"
 * flips the Price column to inline inputs (commit on blur, verified by the
 * catalog re-fetch the patch triggers). Price 0 renders as a muted "not set" —
 * we NEVER surface cost here (cost is the PO side; it lives on Create-PO).
 *
 * Performance: the live catalog has 1000+ SKUs. We render at most VISIBLE_CAP
 * rows and show a "refine your filter" banner past that, rather than mount
 * 1000 DOM rows on every keystroke (Loo's HV-Portal lag rule).
 */

const VISIBLE_CAP = 300;
const GRID_COLS = "32px 150px minmax(180px,1.4fr) minmax(120px,1fr) 110px 100px 130px 92px";

type CatFilter = ProductCategory | "all";

interface FlatRow {
  sku: ProductSkuDto;
  model: ProductModelDto | undefined;
  category: ProductCategory | undefined;
  productName: string;
}

function fmtPrice(n: number): string {
  return `RM ${n.toLocaleString("en-MY", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default function SkuMasterTab({ catalog }: { catalog: CatalogResponse }) {
  const [category, setCategory] = useState<CatFilter>("all");
  const [search, setSearch] = useState("");
  const [editMode, setEditMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [newOpen, setNewOpen] = useState(false);

  const del = useDeleteCatalogSku();

  const modelById = useMemo(() => {
    const m = new Map<string, ProductModelDto>();
    for (const model of catalog.models) m.set(model.id, model);
    return m;
  }, [catalog.models]);

  const allRows = useMemo<FlatRow[]>(() => {
    return catalog.skus.map((sku) => {
      const model = modelById.get(sku.modelId);
      return {
        sku,
        model,
        category: model?.category,
        productName: model?.name ?? "—",
      };
    });
  }, [catalog.skus, modelById]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allRows
      .filter((r) => (category === "all" ? true : r.category === category))
      .filter((r) => {
        if (!q) return true;
        return (
          r.sku.sku.toLowerCase().includes(q) ||
          (r.sku.description ?? "").toLowerCase().includes(q) ||
          r.productName.toLowerCase().includes(q) ||
          r.sku.variant.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => a.sku.sku.localeCompare(b.sku.sku));
  }, [allRows, category, search]);

  const visible = filtered.slice(0, VISIBLE_CAP);
  const overflow = filtered.length - visible.length;

  // Drop selections that left the visible set (category/search change) so the
  // "Delete N" count never claims off-screen rows.
  useEffect(() => {
    setSelected((prev) => {
      if (prev.size === 0) return prev;
      const live = new Set(visible.map((r) => r.sku.id));
      const next = new Set<string>();
      for (const id of prev) if (live.has(id)) next.add(id);
      return next.size === prev.size ? prev : next;
    });
  }, [visible]);

  const visibleIds = visible.map((r) => r.sku.id);
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));
  const someSelected = !allSelected && visibleIds.some((id) => selected.has(id));

  function toggleRow(id: string) {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }
  function toggleAll() {
    setSelected((prev) => {
      const n = new Set(prev);
      if (allSelected) for (const id of visibleIds) n.delete(id);
      else for (const id of visibleIds) n.add(id);
      return n;
    });
  }

  async function bulkDelete() {
    if (selected.size === 0) return;
    if (
      !confirm(
        `Discontinue ${selected.size} SKU${selected.size === 1 ? "" : "s"}? ` +
          `Existing orders/POs keep working; new ones won't see them.`,
      )
    )
      return;
    const ids = Array.from(selected);
    const results = await Promise.allSettled(ids.map((id) => del.mutateAsync(id)));
    const failed = results.filter((r) => r.status === "rejected").length;
    setSelected(new Set());
    if (failed === 0) toast.success(`Discontinued ${ids.length} SKU${ids.length === 1 ? "" : "s"}`);
    else toast.error(`${ids.length - failed} done · ${failed} failed`);
  }

  return (
    <div>
      {/* Filter + actions */}
      <div className="flex justify-between items-center gap-3 mb-4 flex-wrap">
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
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search code / name / size…"
            aria-label="Search SKUs"
            data-testid="sku-search"
            className={`${INPUT_CLS} w-56`}
          />
          {selected.size > 0 && (
            <button
              type="button"
              onClick={bulkDelete}
              disabled={del.isPending}
              className="btn-danger text-[12px]"
              data-testid="sku-bulk-delete"
            >
              {del.isPending ? "Working…" : `Delete ${selected.size}`}
            </button>
          )}
          <button
            type="button"
            onClick={() => setEditMode((v) => !v)}
            className={`${editMode ? "btn-secondary" : "btn-primary"} text-[12px]`}
            data-testid="sku-edit-prices"
          >
            {editMode ? "Done editing" : "Edit Prices"}
          </button>
          <button
            type="button"
            onClick={() => setNewOpen(true)}
            className="btn-hero text-[12px]"
            data-testid="sku-new"
          >
            + New SKU
          </button>
        </div>
      </div>

      <p className="t-tiny text-base-500 mb-2">
        {filtered.length} SKU{filtered.length === 1 ? "" : "s"}
        {overflow > 0 && (
          <span className="text-base-400">
            {" "}
            · showing first {VISIBLE_CAP} — refine the search or category to see the rest
          </span>
        )}
      </p>

      {/* Grid */}
      <div className="bg-white border border-base-200 rounded-[4px] overflow-hidden">
        <div
          className="grid items-center gap-3 px-3 py-2 bg-base-50 border-b border-base-200"
          style={{ gridTemplateColumns: GRID_COLS }}
        >
          <input
            type="checkbox"
            aria-label="Select all visible SKUs"
            checked={allSelected}
            ref={(el) => {
              if (el) el.indeterminate = someSelected;
            }}
            onChange={toggleAll}
          />
          <div className="label">Code</div>
          <div className="label">Description</div>
          <div className="label">Product</div>
          <div className="label">Category</div>
          <div className="label">Size</div>
          <div className="label text-right">Price</div>
          <div className="label">Status</div>
        </div>

        {visible.length === 0 && (
          <div className="t-small text-base-500 px-3 py-6 text-center">
            No SKUs match. Adjust the filter or add one with + New SKU.
          </div>
        )}

        {visible.map((r) => (
          <SkuRowView
            key={r.sku.id}
            row={r}
            editMode={editMode}
            selected={selected.has(r.sku.id)}
            onToggle={toggleRow}
          />
        ))}
      </div>

      {newOpen && <NewSkuModal models={catalog.models} onClose={() => setNewOpen(false)} />}
    </div>
  );
}

const SkuRowView = memo(function SkuRowView({
  row,
  editMode,
  selected,
  onToggle,
}: {
  row: FlatRow;
  editMode: boolean;
  selected: boolean;
  onToggle: (id: string) => void;
}) {
  const { sku, category, productName } = row;
  const patch = usePatchCatalogSku();
  const discontinued = !!sku.discontinuedAt;

  function commitPrice(raw: string) {
    const trimmed = raw.trim();
    if (trimmed === "") return; // empty = no change (price is non-null on the column)
    const val = Number(trimmed);
    if (!Number.isFinite(val) || val < 0) {
      toast.error("Enter a non-negative number");
      return;
    }
    if (val === sku.price) return;
    patch.mutate(
      { id: sku.id, patch: { price: val } },
      {
        onSuccess: () => toast.success(`${sku.sku} · price updated`),
        onError: (e: unknown) =>
          toast.error(e instanceof ApiError ? e.message : "Update failed"),
      },
    );
  }

  return (
    <div
      className="grid items-center gap-3 px-3 py-2 border-b border-base-100 last:border-b-0"
      style={{ gridTemplateColumns: GRID_COLS, opacity: discontinued ? 0.5 : 1 }}
      data-testid={`sku-row-${sku.sku}`}
    >
      <input
        type="checkbox"
        aria-label={`Select ${sku.sku}`}
        checked={selected}
        onChange={() => onToggle(sku.id)}
      />
      <div>
        <CodeChip>{sku.sku}</CodeChip>
      </div>
      <div className="t-small text-base-700 truncate" title={sku.description ?? ""}>
        {sku.description || <span className="text-base-400">—</span>}
      </div>
      <div className="t-small text-base-800 truncate" title={productName}>
        {productName}
      </div>
      <div className="t-tiny text-base-600">
        {category ? CATEGORY_LABEL[category] : "—"}
      </div>
      <div className="t-small text-base-700">{sku.variant}</div>
      <div className="text-right">
        {editMode ? (
          <input
            type="number"
            min={0}
            step="0.01"
            defaultValue={sku.price}
            onBlur={(e) => commitPrice(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            }}
            aria-label={`${sku.sku} price`}
            className={`${INPUT_CLS} text-right font-mono text-[12px]`}
          />
        ) : sku.price === 0 ? (
          <span className="t-tiny text-base-400 italic">price not set</span>
        ) : (
          <span className="font-mono text-[12px] text-base-800">{fmtPrice(sku.price)}</span>
        )}
      </div>
      <div>
        {discontinued ? (
          <span className="pill pill-neutral">Discontinued</span>
        ) : (
          <SkuStatusPill posActive={sku.posActive !== false} />
        )}
      </div>
    </div>
  );
});
