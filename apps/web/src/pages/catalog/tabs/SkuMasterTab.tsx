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
import { useAuth } from "@/lib/auth";
import { useDeleteCatalogSku, usePatchCatalogSku } from "@/lib/queries";
import { INPUT_CLS } from "@/pages/operation/components/Modal";
import { CategoryChip, CATEGORY_LABEL, CodeChip, SkuStatusPill } from "../components/atoms";
import { skuMargin } from "../margin";
import NewSkuModal from "./NewSkuModal";
import EditSkuModal from "./EditSkuModal";
import ImportSkusDialog from "./ImportSkusDialog";
import { buildSkuExportCsv, downloadCsv } from "@/lib/sku-csv";

/**
 * SKU Master — flat product table for the Master Admin. Columns: Product code ·
 * Description · Product name · Category · Size · Price · Margin · Status.
 * (The COST column was dropped 2026-07-06 — Loo: not needed for now. Cost
 * itself survives in the schema + Edit modal + import; only the list column
 * went, so margin still renders for SKUs whose cost is set elsewhere.)
 * Filter by category + model pills + free-text search; picking a category
 * reveals a second pill row of that category's model names (shown even for a
 * single model — e.g. Sofa → Booqit). "Edit Prices" flips the Price cell to an
 * inline input (commit on blur, verified by the catalog re-fetch the patch
 * triggers). Price 0 renders as a muted "not set" — NEVER coerced to 0.
 *
 * Performance: the live catalog has 1000+ SKUs. We render at most VISIBLE_CAP
 * rows and show a "refine your filter" banner past that, rather than mount
 * 1000 DOM rows on every keystroke (Loo's HV-Portal lag rule).
 */

const VISIBLE_CAP = 300;
// 10 tracks: checkbox · code · desc · product · category · size · price · margin · status · edit
const GRID_COLS = "32px 150px minmax(180px,1.4fr) minmax(120px,1fr) 110px 100px 110px 90px 92px 60px";

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
  // Phase 2 (0175): only the principal ("Master Admin") may set/change SKU
  // price + cost. Non-principal internal users see those cells read-only — the
  // inline price/cost editor + the per-row Edit modal's price/cost fields are
  // gated. Every other catalog edit (pos_active, description, name, delete,
  // + New SKU as UNPRICED) stays available.
  const isPrincipal = useAuth((s) => s.role) === "principal";
  const [category, setCategory] = useState<CatFilter>("all");
  const [modelFilter, setModelFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [editMode, setEditMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [newOpen, setNewOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editRow, setEditRow] = useState<FlatRow | null>(null);

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

  // Models for the model pill row — scoped to the active category so the row
  // isn't a flat 1000-model list; hidden entirely while category is "all".
  const categoryModels = useMemo(
    () =>
      catalog.models
        .filter((m) => category === "all" || m.category === category)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [catalog.models, category],
  );

  // 0204 (Loo 2026-07-06) — the sofa-size axis (Special Add-ons → SOFA →
  // Sizes pool). With the Sofa category filtered AND the pool configured, the
  // grid swaps the single Price column for ONE PRICE COLUMN PER SIZE (2990s
  // parity) — adding a size to the pool automatically adds a column here.
  const sofaSizes = useMemo(
    () =>
      (catalog.optionPools ?? [])
        .filter((p) => p.pool === "sofa_size" && p.active)
        .sort((a, b) => a.sortOrder - b.sortOrder || a.value.localeCompare(b.value))
        .map((p) => p.value),
    [catalog.optionPools],
  );
  const sofaSizeMode = category === "sofa" && sofaSizes.length > 0;
  const gridCols = sofaSizeMode
    ? `32px 150px minmax(200px,1.2fr) ${sofaSizes.map(() => "minmax(84px,1fr)").join(" ")} 92px 60px`
    : GRID_COLS;

  // Switching category invalidates a model pick from the previous category —
  // reset synchronously in the same handler so there's no stale-filter frame.
  function pickCategory(next: CatFilter) {
    setCategory(next);
    setModelFilter("all");
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allRows
      .filter((r) => (category === "all" ? true : r.category === category))
      .filter((r) => (modelFilter === "all" ? true : r.sku.modelId === modelFilter))
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
  }, [allRows, category, modelFilter, search]);

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

  // Export the CURRENTLY FILTERED set (category + search), one row per SKU, in
  // the round-trippable import format. Stamps the active category into the name.
  function exportCsv() {
    if (filtered.length === 0) {
      toast.error("Nothing to export with the current filter");
      return;
    }
    const csv = buildSkuExportCsv(filtered.map((r) => ({ sku: r.sku, model: r.model })));
    const tag = category === "all" ? "" : `${category}-`;
    downloadCsv(`carres-skus-${tag}${new Date().toISOString().slice(0, 10)}.csv`, csv);
    toast.success(`Exported ${filtered.length} SKU${filtered.length === 1 ? "" : "s"}`);
  }

  return (
    <div>
      {/* Filter + actions */}
      <div className="flex justify-between items-center gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-1.5 flex-wrap">
          <CategoryChip active={category === "all"} onClick={() => pickCategory("all")}>
            All
          </CategoryChip>
          {PRODUCT_CATEGORIES.map((c) => (
            <CategoryChip key={c} active={category === c} onClick={() => pickCategory(c)}>
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
          {isPrincipal ? (
            <button
              type="button"
              onClick={() => setEditMode((v) => !v)}
              className={`${editMode ? "btn-secondary" : "btn-primary"} text-[12px]`}
              data-testid="sku-edit-prices"
            >
              {editMode ? "Done editing" : "Edit Prices"}
            </button>
          ) : (
            <span
              className="t-tiny text-base-400 italic"
              data-testid="sku-price-lock-hint"
              title="Price + cost are set by the principal (Master Admin)"
            >
              Prices: Master Admin only
            </span>
          )}
          <button
            type="button"
            onClick={exportCsv}
            className="btn-secondary text-[12px]"
            data-testid="sku-export"
          >
            Export SKUs
          </button>
          <button
            type="button"
            onClick={() => setImportOpen(true)}
            className="btn-secondary text-[12px]"
            data-testid="sku-import"
          >
            Import SKUs
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

      {/* Model pill row — second-level filter under the category chips. Shown
          whenever a specific category is picked, even with a single model, so
          the model name (e.g. Booqit) is always visible + clickable. */}
      {category !== "all" && categoryModels.length > 0 && (
        <div
          className="flex items-center gap-1.5 flex-wrap -mt-1 mb-4"
          data-testid="sku-model-filter"
        >
          <span className="t-micro text-base-400 mr-1">Model</span>
          <CategoryChip active={modelFilter === "all"} onClick={() => setModelFilter("all")}>
            All {CATEGORY_LABEL[category]}
          </CategoryChip>
          {categoryModels.map((m) => (
            <CategoryChip
              key={m.id}
              active={modelFilter === m.id}
              onClick={() => setModelFilter(m.id)}
            >
              {m.name}
            </CategoryChip>
          ))}
        </div>
      )}

      <p className="t-tiny text-base-500 mb-2">
        {filtered.length} SKU{filtered.length === 1 ? "" : "s"}
        {overflow > 0 && (
          <span className="text-base-400">
            {" "}
            · showing first {VISIBLE_CAP} — refine the search or category to see the rest
          </span>
        )}
        {sofaSizeMode && (
          <span className="text-base-400" data-testid="sofa-size-mode-hint">
            {" "}
            · per-size prices (RM) — a blank cell inherits the base price shown in grey
            (base price: row Edit); sizes follow Special Add-ons → Sizes
          </span>
        )}
      </p>

      {/* Grid */}
      <div className="bg-white border border-base-200 rounded-[4px] overflow-x-auto">
        <div
          className="grid items-center gap-3 px-3 py-2 bg-base-50 border-b border-base-200"
          style={{ gridTemplateColumns: gridCols }}
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
          {sofaSizeMode ? (
            <>
              <div className="label">Code</div>
              <div className="label">Description</div>
              {sofaSizes.map((s) => (
                <div key={s} className="label text-right" data-testid={`sku-size-col-${s}`}>
                  {s}
                </div>
              ))}
              <div className="label">Status</div>
              <div className="label" />
            </>
          ) : (
            <>
              <div className="label">Code</div>
              <div className="label">Description</div>
              <div className="label">Product</div>
              <div className="label">Category</div>
              <div className="label">Size</div>
              <div className="label text-right">Price</div>
              <div className="label text-right">Margin</div>
              <div className="label">Status</div>
              <div className="label" />
            </>
          )}
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
            editMode={editMode && isPrincipal}
            selected={selected.has(r.sku.id)}
            onToggle={toggleRow}
            onEdit={setEditRow}
            sofaSizes={sofaSizeMode ? sofaSizes : null}
            gridCols={gridCols}
          />
        ))}
      </div>

      {newOpen && (
        <NewSkuModal
          models={catalog.models}
          sofaCompartments={catalog.sofaCompartments ?? []}
          onClose={() => setNewOpen(false)}
        />
      )}
      {importOpen && <ImportSkusDialog onClose={() => setImportOpen(false)} />}
      {editRow && (
        <EditSkuModal sku={editRow.sku} model={editRow.model} onClose={() => setEditRow(null)} />
      )}
    </div>
  );
}

const SkuRowView = memo(function SkuRowView({
  row,
  editMode,
  selected,
  onToggle,
  onEdit,
  sofaSizes,
  gridCols,
}: {
  row: FlatRow;
  editMode: boolean;
  selected: boolean;
  onToggle: (id: string) => void;
  onEdit: (row: FlatRow) => void;
  /** 0204 — non-null = render the sofa-size grid variant (one price cell per
   *  pool size for compartment SKUs; flat SKUs span the size tracks). */
  sofaSizes: string[] | null;
  gridCols: string;
}) {
  const { sku, category, productName } = row;
  const patch = usePatchCatalogSku();
  const discontinued = !!sku.discontinuedAt;
  const margin = skuMargin(sku.price, sku.cost);
  const marginLabel = category === "sofa" ? "base margin" : "plan margin";

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

  // 0204 — sofa-size grid variant: one price cell per pool size for a
  // COMPARTMENT sku; a flat (non-compartment) sofa sku keeps its single price
  // spanning the size tracks. Category/Size/Margin columns are dropped here —
  // the sofa filter + the description already carry that context.
  if (sofaSizes) {
    return (
      <div
        className="grid items-center gap-3 px-3 py-2 border-b border-base-100 last:border-b-0"
        style={{ gridTemplateColumns: gridCols, opacity: discontinued ? 0.5 : 1 }}
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
        {sku.compartmentId != null ? (
          <CompartmentSizeCells sku={sku} sizes={sofaSizes} editMode={editMode} />
        ) : (
          <div
            className="text-right"
            style={{ gridColumn: `span ${sofaSizes.length}` }}
            data-testid={`sku-flat-price-${sku.sku}`}
          >
            <span className="t-tiny text-base-400 mr-1.5">flat SKU · one price</span>
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
                className={`${INPUT_CLS} text-right t-num text-[12px] max-w-[140px] inline-block`}
              />
            ) : sku.price === 0 ? (
              <span className="t-tiny text-base-400 italic">price not set</span>
            ) : (
              <span className="t-num text-[12px] text-base-800">{fmtPrice(sku.price)}</span>
            )}
          </div>
        )}
        <div>
          {discontinued ? (
            <span className="pill pill-neutral">Discontinued</span>
          ) : (
            <SkuStatusPill posActive={sku.posActive !== false} />
          )}
        </div>
        <div className="text-right">
          <button
            type="button"
            onClick={() => onEdit(row)}
            className="btn-ghost text-[11px]"
            data-testid={`sku-edit-${sku.sku}`}
          >
            Edit
          </button>
        </div>
      </div>
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

      {/* Price */}
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
            className={`${INPUT_CLS} text-right t-num text-[12px]`}
          />
        ) : sku.price === 0 ? (
          <span className="t-tiny text-base-400 italic">price not set</span>
        ) : (
          <span className="t-num text-[12px] text-base-800">{fmtPrice(sku.price)}</span>
        )}
      </div>

      {/* Margin */}
      <div className="text-right" data-testid={`sku-margin-${sku.sku}`}>
        {margin === null ? (
          <span className="t-tiny text-base-400 italic" title={`${marginLabel} · cost not set`}>—</span>
        ) : (
          <span
            className={`t-num text-[12px] ${margin.amount < 0 ? "text-[#C44D2B]" : "text-base-700"}`}
            title={marginLabel}
          >
            {fmtPrice(margin.amount)}
            <span className="text-base-400 text-[10px] ml-0.5">
              {(margin.pct * 100).toFixed(1)}%
            </span>
          </span>
        )}
      </div>

      <div>
        {discontinued ? (
          <span className="pill pill-neutral">Discontinued</span>
        ) : (
          <SkuStatusPill posActive={sku.posActive !== false} />
        )}
      </div>
      <div className="text-right">
        <button
          type="button"
          onClick={() => onEdit(row)}
          className="btn-ghost text-[11px]"
          data-testid={`sku-edit-${sku.sku}`}
        >
          Edit
        </button>
      </div>
    </div>
  );
});

/**
 * 0204 — one price cell per pool size for a COMPARTMENT sku row (sofa-size
 * grid). View mode: an explicit per-size price renders normally; an unset size
 * shows the inherited base price muted in parentheses. Edit mode: one input
 * per size; each blur PATCHes the FULL {size → RM} map rebuilt from a local
 * draft, so two successive cell edits COMPOSE instead of racing the catalog
 * refetch, and prices under keys NOT in the current pool (renamed/removed
 * sizes) are PRESERVED — a cell edit never silently erases an orphaned price.
 */
function CompartmentSizeCells({
  sku,
  sizes,
  editMode,
}: {
  sku: ProductSkuDto;
  sizes: string[];
  editMode: boolean;
}) {
  const patch = usePatchCatalogSku();
  // The user's in-session truth for this row's inputs (server refetch never
  // clobbers half-typed cells; init from the sku once on mount).
  const [draft, setDraft] = useState<Record<string, string>>(() => {
    const d: Record<string, string> = {};
    for (const s of sizes) {
      const v = sku.pricesBySize?.[s];
      d[s] = typeof v === "number" ? String(v) : "";
    }
    return d;
  });

  function commit() {
    // Orphan preservation: keep prices under keys outside the current pool.
    const map: Record<string, number> = {};
    for (const [k, v] of Object.entries(sku.pricesBySize ?? {})) {
      if (!sizes.includes(k) && typeof v === "number") map[k] = v;
    }
    for (const s of sizes) {
      const t = (draft[s] ?? "").trim();
      if (t === "") continue; // blank = unpriced at this size (inherits base)
      const n = Number(t);
      if (!Number.isFinite(n) || n < 0) {
        toast.error("Enter a non-negative number");
        return;
      }
      map[s] = n;
    }
    // No-op guard — identical map ⇒ no PATCH.
    const before: Record<string, number> = {};
    for (const [k, v] of Object.entries(sku.pricesBySize ?? {})) {
      if (typeof v === "number") before[k] = v;
    }
    const same =
      Object.keys(map).length === Object.keys(before).length &&
      Object.entries(map).every(([k, v]) => before[k] === v);
    if (same) return;
    patch.mutate(
      { id: sku.id, patch: { pricesBySize: map } },
      {
        onSuccess: () => toast.success(`${sku.sku} · size prices updated`),
        onError: (e: unknown) =>
          toast.error(e instanceof ApiError ? e.message : "Update failed"),
      },
    );
  }

  return (
    <>
      {sizes.map((s) => {
        const explicit = sku.pricesBySize?.[s];
        return (
          <div key={s} className="text-right" data-testid={`sku-size-${sku.sku}-${s}`}>
            {editMode ? (
              <input
                type="number"
                min={0}
                step="0.01"
                value={draft[s] ?? ""}
                placeholder={sku.price > 0 ? String(sku.price) : "—"}
                onChange={(e) => setDraft((d) => ({ ...d, [s]: e.target.value }))}
                onBlur={commit}
                onKeyDown={(e) => {
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                }}
                aria-label={`${sku.sku} price at ${s}`}
                className={`${INPUT_CLS} text-right t-num text-[12px]`}
              />
            ) : typeof explicit === "number" ? (
              <span className="t-num text-[12px] text-base-800">{fmtPrice(explicit)}</span>
            ) : sku.price > 0 ? (
              <span
                className="t-tiny text-base-400"
                title={`Inherits the base price ${fmtPrice(sku.price)} — set a price for ${s} to override`}
              >
                ({fmtPrice(sku.price)})
              </span>
            ) : (
              <span className="t-tiny text-base-400 italic">—</span>
            )}
          </div>
        );
      })}
    </>
  );
}
