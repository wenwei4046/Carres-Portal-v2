import { memo, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import type {
  CatalogResponse,
  ProductCategory,
  ProductModelDto,
  ProductSkuDto,
} from "@carres/shared";
import { activeSofaSizes, categoryHasSizeAxis, PRODUCT_CATEGORIES } from "@carres/shared";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useDeleteCatalogSku, usePatchCatalogModel, usePatchCatalogSku } from "@/lib/queries";
import { INPUT_CLS } from "@/pages/operation/components/Modal";
import { CategoryChip, CATEGORY_LABEL, CodeChip } from "../components/atoms";
import { skuMargin } from "../margin";
import NewSkuModal from "./NewSkuModal";
import ImportSkusDialog from "./ImportSkusDialog";
import { buildSkuExportCsv, downloadCsv } from "@/lib/sku-csv";

/**
 * SKU Master — flat product table for the Master Admin. Columns: Product code ·
 * Description · Product name · Category · Size · Price · Margin.
 * (The COST column was dropped 2026-07-06 — Loo: not needed for now — and the
 * STATUS column followed the same day: POS ON/OFF belongs to the Modular tab;
 * `pos_active` itself is untouched — the Modular toggle + the POS bundle
 * filter keep reading it. Discontinued rows still dim to 50% opacity.)
 *
 * "Edit" (Loo 2026-07-21) = ONE toolbar toggle next to Export SKUs that flips
 * EVERY visible row into inline editing at once — no per-row Edit button, no
 * modal. Code / description / size / category flip to inputs that commit on
 * blur; the Price / PWP cells open too (principal only, 0175) — everything on
 * a row is editable except the product name. Price 0 renders as a muted
 * "not set" — NEVER coerced to 0.
 * (History: 2026-07-06 per-row inline Edit replaced the modal; 2026-07-20 the
 * row Edit absorbed the separate "Edit Prices" toggle; 2026-07-21 the per-row
 * button moved to the toolbar and became edit-all.)
 *
 * "Delete N" (Loo 2026-07-20) = PERMANENT delete — the SKU row is gone for
 * good (order/PO history keeps its sku text snapshot). Soft retirement stays
 * available as discontinued_at via PATCH.
 *
 * Performance: the live catalog has 1000+ SKUs. We render at most VISIBLE_CAP
 * rows and show a "refine your filter" banner past that, rather than mount
 * 1000 DOM rows on every keystroke (Loo's HV-Portal lag rule).
 */

const VISIBLE_CAP = 300;
// 9 tracks: checkbox · code · desc · product · category · size · price · pwp · margin
// (PWP = the 0186 per-SKU PWP reward price, 2990s "PWP Price" column. The sofa
// per-size grid variant deliberately has NO pwp column — a sofa's PWP price
// lives on the matched COMBO (pwp_prices_by_height), never on component SKUs.)
const GRID_COLS = "32px 170px minmax(180px,1.4fr) minmax(120px,1fr) 110px 100px 110px 90px 90px";
// Same tracks minus the 100px SIZE one — used when the active filter is a
// category with no size axis (Service / Guarantee), where every SIZE cell would
// either repeat the CODE column or print an invoice sentence (Loo 2026-07-26).
const GRID_COLS_NO_SIZE = "32px 170px minmax(180px,1.4fr) minmax(120px,1fr) 110px 110px 90px 90px";

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
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [newOpen, setNewOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  // Edit-all (Loo 2026-07-21) — ONE toolbar toggle; while on, every visible
  // row renders its inline inputs. No modal, no per-row toggle.
  const [editAll, setEditAll] = useState(false);

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
  // Sizes pool, the SAME `activeSofaSizes` the builder's Customize canvas
  // offers). With the Sofa category filtered, the grid swaps the single Price
  // column for ONE PRICE COLUMN PER SIZE (2990s parity) — adding a size to
  // the pool automatically adds a column here. `activeSofaSizes` falls back
  // to the canonical SOFA_HEIGHTS when the pool is empty, so the sofa grid
  // variant only needs the pools field to be present.
  const sofaSizes = useMemo(() => activeSofaSizes(catalog.optionPools), [catalog.optionPools]);
  const sofaSizeMode =
    category === "sofa" &&
    (catalog.optionPools ?? []).some((p) => p.pool === "sofa_size" && p.active);
  // Loo 2026-07-26 (SKU Master screenshots): drop the SIZE column outright when
  // the filter is a category that has none. Under "All" the column stays (other
  // categories need it) and the sizeless ROWS render "—" instead of the noise.
  const sizelessMode = category !== "all" && !categoryHasSizeAxis(category);
  const gridCols = sofaSizeMode
    ? `32px 170px minmax(200px,1.2fr) ${sofaSizes.map(() => "minmax(84px,1fr)").join(" ")}`
    : sizelessMode
      ? GRID_COLS_NO_SIZE
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
        `Permanently delete ${selected.size} SKU${selected.size === 1 ? "" : "s"}? ` +
          `This cannot be undone. Existing orders/POs keep their line history.`,
      )
    )
      return;
    const ids = Array.from(selected);
    const results = await Promise.allSettled(ids.map((id) => del.mutateAsync(id)));
    const failed = results.filter((r) => r.status === "rejected").length;
    setSelected(new Set());
    if (failed === 0) toast.success(`Deleted ${ids.length} SKU${ids.length === 1 ? "" : "s"}`);
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
          {!isPrincipal && (
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
            onClick={() => setEditAll((v) => !v)}
            className={`${editAll ? "btn-primary" : "btn-secondary"} text-[12px]`}
            title="Edit every visible SKU inline — changes commit on blur"
            data-testid="sku-edit-all"
          >
            {editAll ? "Done" : "Edit"}
          </button>
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
            </>
          ) : (
            <>
              <div className="label">Code</div>
              <div className="label">Description</div>
              <div className="label">Product</div>
              <div className="label">Category</div>
              {!sizelessMode && <div className="label">Size</div>}
              <div className="label text-right">Price</div>
              <div className="label text-right">PWP Price</div>
              <div className="label text-right">Margin</div>
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
            canEditPrices={isPrincipal}
            selected={selected.has(r.sku.id)}
            onToggle={toggleRow}
            inlineEdit={editAll}
            sofaSizes={sofaSizeMode ? sofaSizes : null}
            gridCols={gridCols}
            showSize={!sizelessMode}
          />
        ))}
      </div>

      {newOpen && (
        <NewSkuModal
          models={catalog.models}
          skus={catalog.skus}
          sofaCompartments={catalog.sofaCompartments ?? []}
          optionPools={catalog.optionPools ?? []}
          onClose={() => setNewOpen(false)}
        />
      )}
      {importOpen && <ImportSkusDialog onClose={() => setImportOpen(false)} />}
    </div>
  );
}

const SkuRowView = memo(function SkuRowView({
  row,
  canEditPrices,
  selected,
  onToggle,
  inlineEdit,
  sofaSizes,
  gridCols,
  showSize,
}: {
  row: FlatRow;
  /** 0175 — true only for the principal; price/PWP cells stay read-only otherwise. */
  canEditPrices: boolean;
  selected: boolean;
  onToggle: (id: string) => void;
  /** Loo 2026-07-21 — driven by the toolbar edit-all toggle: every visible row
   *  flips to inline inputs (code / description / size / category, plus the
   *  Price / PWP cells for the principal) at once. No modal. */
  inlineEdit: boolean;
  /** 0204 — non-null = render the sofa-size grid variant (one price cell per
   *  pool size for compartment SKUs; flat SKUs span the size tracks). */
  sofaSizes: string[] | null;
  gridCols: string;
  /** false when the whole SIZE column is dropped (Service / Guarantee filter);
   *  the row must then omit its SIZE cell or every later cell shifts a track. */
  showSize: boolean;
}) {
  const { sku, model, category, productName } = row;
  const priceEdit = inlineEdit && canEditPrices;
  const patch = usePatchCatalogSku();
  const patchModel = usePatchCatalogModel();
  const discontinued = !!sku.discontinuedAt;
  const margin = skuMargin(sku.price, sku.cost);
  const marginLabel = category === "sofa" ? "base margin" : "plan margin";
  // Accessory / service carry NO size/variant axis (one SKU per model, Loo
  // 2026-07-11): their SIZE may be cleared; other categories keep theirs.
  const noVariantAxis = category === "accessory" || category === "service";
  // Loo 2026-07-26 — a Service variant IS the code and a Guarantee variant is
  // the invoice sentence, so neither is a size. Under the "All" filter (where
  // the column still exists for the others) such a row shows "—" rather than
  // repeating the code / printing a sentence in the SIZE column.
  const sizeless = !categoryHasSizeAxis(category);

  /** Commit the FULL code — a free, directly-renameable field (Loo 2026-07-11,
   *  AutoCount style: ACC-601). Historical orders/POs keep the OLD code string;
   *  a compartment re-offer re-asserts the compartment's own code. A collision
   *  with an existing code surfaces as the server's 409. */
  function commitCode(raw: string) {
    const v = raw.trim();
    if (v === "" || v === sku.sku) return;
    patch.mutate(
      { id: sku.id, patch: { sku: v } },
      {
        onSuccess: () => toast.success(`${sku.sku} → ${v}`),
        onError: (e: unknown) =>
          toast.error(e instanceof ApiError ? e.message : "Update failed"),
      },
    );
  }

  /** Commit the SIZE (variant) label — never touches the code. Clearing is
   *  allowed only for accessory/service (no variant axis). */
  function commitSize(raw: string) {
    const v = raw.trim();
    if (v === sku.variant) return;
    if (v === "" && !noVariantAxis) return;
    patch.mutate(
      { id: sku.id, patch: { variant: v } },
      {
        onSuccess: () => toast.success(`${sku.sku} · size ${v || "cleared"}`),
        onError: (e: unknown) =>
          toast.error(e instanceof ApiError ? e.message : "Update failed"),
      },
    );
  }

  function commitDescription(raw: string) {
    const d = raw.trim();
    if (d === (sku.description ?? "")) return;
    patch.mutate(
      { id: sku.id, patch: { description: d || null } },
      {
        onSuccess: () => toast.success(`${sku.sku} · description updated`),
        onError: (e: unknown) =>
          toast.error(e instanceof ApiError ? e.message : "Update failed"),
      },
    );
  }

  /** Category lives on the MODEL — changing it moves the model AND all its
   *  sibling SKUs to the new category (say so in the toast). */
  function commitCategory(next: string) {
    if (!model || next === model.category) return;
    patchModel.mutate(
      { id: model.id, patch: { category: next as ProductCategory } },
      {
        onSuccess: () =>
          toast.success(`${model.name} moved to ${CATEGORY_LABEL[next as ProductCategory]} (all its SKUs)`),
        onError: (e: unknown) =>
          toast.error(e instanceof ApiError ? e.message : "Update failed"),
      },
    );
  }

  /** Inline CODE cell: the WHOLE code is one free-text input (Loo 2026-07-11 —
   *  not a locked prefix + suffix; codes are AutoCount-style free strings). */
  const codeCell = inlineEdit ? (
    <input
      defaultValue={sku.sku}
      onBlur={(e) => commitCode(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
      aria-label={`${sku.sku} code`}
      title="Edit the full SKU code — new orders/POs use the new code; history keeps the old string"
      className={`${INPUT_CLS} t-num text-[12px] w-full min-w-0`}
    />
  ) : (
    <div>
      <CodeChip>{sku.sku}</CodeChip>
    </div>
  );

  /** Inline DESCRIPTION cell. */
  const descriptionCell = inlineEdit ? (
    <input
      defaultValue={sku.description ?? ""}
      placeholder="—"
      onBlur={(e) => commitDescription(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
      aria-label={`${sku.sku} description`}
      className={`${INPUT_CLS} t-small text-[12px]`}
    />
  ) : (
    <div className="t-small text-base-700 truncate" title={sku.description ?? ""}>
      {sku.description || <span className="text-base-400">—</span>}
    </div>
  );

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

  // 0186 — the PWP reward price. Blank = null ("not set" — the SKU cannot be a
  // PWP reward); a 'promo' reward ignores it (always RM 0).
  function commitPwpPrice(raw: string) {
    const trimmed = raw.trim();
    const val = trimmed === "" ? null : Number(trimmed);
    if (val !== null && (!Number.isFinite(val) || val < 0)) {
      toast.error("Enter a non-negative number (blank = not set)");
      return;
    }
    if (val === (sku.pwpPrice ?? null)) return;
    patch.mutate(
      { id: sku.id, patch: { pwpPrice: val } },
      {
        onSuccess: () => toast.success(`${sku.sku} · PWP price updated`),
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
        {codeCell}
        {descriptionCell}
        {sku.compartmentId != null ? (
          <CompartmentSizeCells sku={sku} sizes={sofaSizes} editMode={priceEdit} />
        ) : (
          <div
            className="text-right"
            style={{ gridColumn: `span ${sofaSizes.length}` }}
            data-testid={`sku-flat-price-${sku.sku}`}
          >
            <span className="t-tiny text-base-400 mr-1.5">flat SKU · one price</span>
            {priceEdit ? (
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
      </div>
    );
  }

  return (
    <div
      className="grid items-center gap-3 px-3 py-2 border-b border-base-100 last:border-b-0"
      // MUST be the same `gridCols` the header uses — this row hardcoded
      // GRID_COLS while the header switched to the no-size variant, so the row
      // kept a 9th (100px) track the header had dropped. Same fr tracks, less
      // free width in the row → every column after Description drifted left
      // (Loo 2026-07-26: "category 跟价钱偏离这么远"). One template, one source.
      style={{ gridTemplateColumns: gridCols, opacity: discontinued ? 0.5 : 1 }}
      data-testid={`sku-row-${sku.sku}`}
    >
      <input
        type="checkbox"
        aria-label={`Select ${sku.sku}`}
        checked={selected}
        onChange={() => onToggle(sku.id)}
      />
      {codeCell}
      {descriptionCell}
      <div className="t-small text-base-800 truncate" title={productName}>
        {productName}
      </div>
      {inlineEdit && model ? (
        <select
          defaultValue={model.category}
          onChange={(e) => commitCategory(e.target.value)}
          aria-label={`${sku.sku} category`}
          title="Category lives on the product — changing it moves ALL of this product's SKUs"
          className={`${INPUT_CLS} t-tiny`}
          data-testid={`sku-category-select-${sku.sku}`}
        >
          {PRODUCT_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABEL[c]}
            </option>
          ))}
        </select>
      ) : (
        <div className="t-tiny text-base-600">
          {category ? CATEGORY_LABEL[category] : "—"}
        </div>
      )}
      {showSize &&
        (inlineEdit && !sizeless ? (
          <input
            defaultValue={sku.variant}
            onBlur={(e) => commitSize(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            }}
            placeholder={noVariantAxis ? "no size" : undefined}
            aria-label={`${sku.sku} size`}
            title={
              noVariantAxis
                ? "Optional — accessories/services carry no size"
                : "The SIZE label — editing it never changes the code"
            }
            className={`${INPUT_CLS} t-small text-[12px] w-full min-w-0`}
          />
        ) : (
          <div className="t-small text-base-700">{sizeless ? "—" : sku.variant || "—"}</div>
        ))}

      {/* Price */}
      <div className="text-right">
        {priceEdit ? (
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

      {/* PWP Price (0186) — the reward price when this SKU is a PWP reward. */}
      <div className="text-right" data-testid={`sku-pwp-${sku.sku}`}>
        {priceEdit ? (
          <input
            type="number"
            min={0}
            step="0.01"
            defaultValue={sku.pwpPrice ?? ""}
            placeholder="—"
            onBlur={(e) => commitPwpPrice(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            }}
            aria-label={`${sku.sku} PWP price`}
            className={`${INPUT_CLS} text-right t-num text-[12px]`}
          />
        ) : sku.pwpPrice == null ? (
          <span className="t-tiny text-base-400 italic" title="No PWP price — this SKU cannot be a PWP reward">
            —
          </span>
        ) : (
          <span className="t-num text-[12px] text-base-800">{fmtPrice(sku.pwpPrice)}</span>
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
