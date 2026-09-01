import { memo, useMemo, useState } from "react";
import { toast } from "sonner";
import type {
  CatalogResponse,
  ProductCategory,
  ProductModelDto,
  ProductSkuDto,
} from "@carres/shared";
import { PRODUCT_CATEGORIES, activeSofaSizes } from "@carres/shared";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useOperationSuppliers, usePatchCatalogSku } from "@/lib/queries";
import { INPUT_CLS } from "@/pages/operation/components/Modal";
import { CategoryChip, CATEGORY_LABEL, CodeChip } from "../components/atoms";
import { skuMargin } from "../margin";
import { SupplierOffersStrip } from "../components/SupplierOffers";
import NewSkuModal from "./NewSkuModal";
import ImportSkusDialog from "./ImportSkusDialog";
import { buildSkuExportCsv, downloadCsv } from "@/lib/sku-csv";

/**
 * Operation Catalog › SKU Master — the shared `product_skus` list.
 *
 * ⭐ THE TWO CATALOGS ALIGN — OWNER RULING 2026-08-26 (Jess).
 *
 * This tab used to be a deliberately NARROWER surface than Product &
 * Maintenance: cost only, no selling price, no margin, no import/export, and
 * no `+ New SKU`, on the reasoning that structure belongs to the admin door and
 * this one only records what we pay. Jess ruled that split off:
 *
 *   "if it available [at the admin catalog] to add stuff into catalog then it
 *    should be doable from operations' side catalog as well —
 *    the 2 catalogues should align"
 *
 * So the columns and the doors are the same on both sides now. What is NOT the
 * same is who may WRITE what, and that is not a second policy invented here —
 * **the UI mirrors the API gate exactly** (`gateSkuPatchPriceCost`,
 * `routes/catalog.ts`), so no cell offers an edit the server would refuse:
 *
 * ```
 * price · pwpPrice · pricesBySize   principal ONLY (0175 + a DB trigger)
 * cost                             operation OR principal (0226)
 * supplier · supplier code · rest  any internal user
 * ```
 *
 * Operation SEES the selling price and cannot change it — Jess, 2026-08-26:
 * *"it makes sense to let them see and not change it, cuz it avoids data
 * pollution"*. A read-only number answers the question that used to be asked
 * across the room; it cannot be fat-fingered into the customer's price.
 *
 * 🟡 STILL NOT HERE, deliberately: bulk delete. Every other gap Jess named is
 * closed above, but permanently deleting catalog rows is destructive and was
 * never asked for by name — it needs its own yes, not an inference from
 * "align".
 *
 * Same render cap as the selling SKU Master: at most VISIBLE_CAP rows, with a
 * refine-your-filter hint past that (Loo's HV-Portal lag rule).
 */

const VISIBLE_CAP = 300;
// 10 tracks: code · desc · product · category · size · supplier · cost · price
// · pwp · margin.
// 2026-08-24 - SUPPLIER added beside cost: the buyer recording a cost is
// looking at a quotation, and the quotation has a name on it. The name is
// DERIVED from supplier_id through the roster (Law A/D) - never stored here.
// 2026-08-26 - PRICE / PWP / MARGIN joined it under the alignment ruling. The
// grid scrolls sideways in its own container rather than shrinking the columns
// that were already here.
const GRID_COLS =
  "170px minmax(180px,1.4fr) minmax(120px,1fr) 100px 100px minmax(150px,1.2fr) 110px 110px 110px 90px";

type CatFilter = ProductCategory | "all";

interface FlatRow {
  sku: ProductSkuDto;
  model: ProductModelDto | undefined;
  category: ProductCategory | undefined;
  productName: string;
}

function fmtRm(n: number): string {
  return `RM ${n.toLocaleString("en-MY", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default function OperationSkuCostTab({ catalog }: { catalog: CatalogResponse }) {
  /* The SAME gate the server applies (0175) — price, PWP and the per-size grid
     are the principal's alone. Operation reads them; the cells never open. */
  const isPrincipal = useAuth((s) => s.role) === "principal";
  const [category, setCategory] = useState<CatFilter>("all");
  const [modelFilter, setModelFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [editMode, setEditMode] = useState(false);
  /* Aligned with the selling grid (2026-08-26): "all" | "none" (no supplier on
     the SKU) | a suppliers.id. Matched by FK, never by typed text. */
  const [supplierFilter, setSupplierFilter] = useState<string>("all");
  const [newOpen, setNewOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  /* The roster is already cached by the order drawer / Suppliers tab; this
   * adds no server work of its own. Map once, look up per row. */
  const suppliersQ = useOperationSuppliers();
  /* 0389 — the active sofa seat heights, pool-ordered with the canonical
     fallback: the same axis the SKU Master grid prices the slot on. */
  const sofaHeights = useMemo(() => activeSofaSizes(catalog.optionPools), [catalog.optionPools]);
  const supplierNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of suppliersQ.data?.suppliers ?? []) m.set(s.id, s.name);
    return m;
  }, [suppliersQ.data?.suppliers]);

  const modelById = useMemo(() => {
    const m = new Map<string, ProductModelDto>();
    for (const model of catalog.models) m.set(model.id, model);
    return m;
  }, [catalog.models]);

  const allRows = useMemo<FlatRow[]>(
    () =>
      catalog.skus.map((sku) => {
        const model = modelById.get(sku.modelId);
        return {
          sku,
          model,
          category: model?.category,
          productName: model?.name ?? "—",
        };
      }),
    [catalog.skus, modelById],
  );

  const categoryModels = useMemo(
    () =>
      catalog.models
        .filter((m) => category === "all" || m.category === category)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [catalog.models, category],
  );

  function pickCategory(next: CatFilter) {
    setCategory(next);
    setModelFilter("all");
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allRows
      .filter((r) => (category === "all" ? true : r.category === category))
      .filter((r) => (modelFilter === "all" ? true : r.sku.modelId === modelFilter))
      .filter((r) =>
        supplierFilter === "all"
          ? true
          : supplierFilter === "none"
            ? r.sku.supplierId == null
            : r.sku.supplierId === supplierFilter,
      )
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
  }, [allRows, category, modelFilter, search, supplierFilter]);

  const visible = filtered.slice(0, VISIBLE_CAP);
  const overflow = filtered.length - visible.length;

  /* Export the CURRENTLY FILTERED set, in the round-trippable import format —
     the same builder the selling grid uses, so a file exported from one door
     imports through the other (Law D: one shape, one writer). */
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
          <select
            value={supplierFilter}
            onChange={(e) => setSupplierFilter(e.target.value)}
            aria-label="Filter by supplier"
            data-testid="opcost-supplier-filter"
            className={`${INPUT_CLS} w-44`}
          >
            <option value="all">All suppliers</option>
            {/* "No supplier" is a real bucket, not an error state: service and
                accessory SKUs legitimately carry none (0171). */}
            <option value="none">No supplier</option>
            {(suppliersQ.data?.suppliers ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search code / name / size…"
            aria-label="Search SKUs"
            data-testid="opcost-sku-search"
            className={`${INPUT_CLS} w-56`}
          />
          {!isPrincipal && (
            <span
              className="text-meta text-base-400 italic"
              data-testid="opcost-price-lock-hint"
              title="Selling price and PWP are set by the principal (Master Admin)"
            >
              Prices: Master Admin only
            </span>
          )}
          <button
            type="button"
            onClick={() => setEditMode((v) => !v)}
            className={`${editMode ? "btn-secondary" : "btn-primary"} text-meta`}
            data-testid="opcost-edit-costs"
          >
            {editMode ? "Done editing" : "Edit Costs"}
          </button>
          <button
            type="button"
            onClick={exportCsv}
            className="btn-secondary text-meta"
            data-testid="opcost-export"
          >
            Export SKUs
          </button>
          <button
            type="button"
            onClick={() => setImportOpen(true)}
            className="btn-secondary text-meta"
            data-testid="opcost-import"
          >
            Import SKUs
          </button>
          {/* ⭐ Jess's literal ask: adding to the catalog is available on the
              admin door, so it is available here. The modal is the SAME
              component — it already gates its own price field on the role, so
              an operation user creates an UNPRICED SKU exactly as the API
              allows (`gateSkuCreatePriceCost`). */}
          <button
            type="button"
            onClick={() => setNewOpen(true)}
            className="btn-hero text-meta"
            data-testid="opcost-new-sku"
          >
            + New SKU
          </button>
        </div>
      </div>

      {/* Model pill row — second-level filter under the category chips. */}
      {category !== "all" && categoryModels.length > 0 && (
        <div
          className="flex items-center gap-1.5 flex-wrap -mt-1 mb-4"
          data-testid="opcost-model-filter"
        >
          <span className="text-label uppercase tracking-[0.05em] text-base-400 mr-1">Model</span>
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

      <p className="text-meta text-base-500 mb-2">
        {filtered.length} SKU{filtered.length === 1 ? "" : "s"}
        {overflow > 0 && (
          <span className="text-base-400">
            {" "}
            · showing first {VISIBLE_CAP} — refine the search or category to see the rest
          </span>
        )}
        <span className="text-base-400">
          {" "}
          · cost = what we pay · price = what the customer pays
          {!isPrincipal && " (read-only here)"}
        </span>
      </p>

      {/* Grid */}
      <div className="bg-white border border-base-200 rounded-[4px] overflow-x-auto">
        <div
          className="grid items-center gap-3 px-3 py-2 bg-base-50 border-b border-base-200"
          style={{ gridTemplateColumns: GRID_COLS }}
        >
          <div className="label">Code</div>
          <div className="label">Description</div>
          <div className="label">Product</div>
          <div className="label">Category</div>
          <div className="label">Size</div>
          <div className="label">Supplier</div>
          <div className="label text-right">Cost</div>
          <div className="label text-right">Price</div>
          <div className="label text-right">PWP Price</div>
          <div className="label text-right">Margin</div>
        </div>

        {visible.length === 0 && (
          <div className="text-body text-base-500 px-3 py-6 text-center">
            No SKUs match. Adjust the filter or the search.
          </div>
        )}

        {visible.map((r) => (
          <CostRowView
            key={r.sku.id}
            row={r}
            editMode={editMode}
            canEditPrices={isPrincipal}
            supplierName={r.sku.supplierId ? supplierNameById.get(r.sku.supplierId) ?? null : null}
            suppliers={suppliersQ.data?.suppliers ?? []}
            heights={sofaHeights}
          />
        ))}
      </div>

      {/* The SAME two components the admin door opens — not lookalikes. A CSV
          exported from either grid imports through either dialog. */}
      {newOpen && (
        <NewSkuModal
          models={catalog.models}
          skus={catalog.skus}
          sofaCompartments={catalog.sofaCompartments ?? []}
          optionPools={catalog.optionPools ?? []}
          sofaCombos={catalog.sofaCombos ?? []}
          onClose={() => setNewOpen(false)}
        />
      )}
      {importOpen && <ImportSkusDialog onClose={() => setImportOpen(false)} />}
    </div>
  );
}

const CostRowView = memo(function CostRowView({
  row,
  editMode,
  canEditPrices,
  supplierName,
  suppliers,
  heights,
}: {
  row: FlatRow;
  editMode: boolean;
  /** 0175 — the principal alone may move a selling price. Everyone internal
   *  READS it (Jess 2026-08-26), which is why the cell renders either way. */
  canEditPrices: boolean;
  /** Resolved through the roster by supplier_id; null = the SKU names no
   *  supplier (legitimate for service/accessory, 0171). */
  supplierName: string | null;
  /** The roster, for the edit-mode picker. The IDENTITY written is always
   *  supplier_id; the name is only ever what the picker displays. */
  suppliers: Array<{ id: string; name: string }>;
  /** Active sofa seat heights (0389) — the offers strip prices sofa offers
   *  per height, the same axis the SKU Master grid prices the slot on. */
  heights: string[];
}) {
  const { sku, category, productName } = row;
  const patch = usePatchCatalogSku();
  const discontinued = !!sku.discontinuedAt;
  const [offersOpen, setOffersOpen] = useState(false);
  const margin = skuMargin(sku.price, sku.cost ?? null);

  // Blank clears back to "not set" (cost is nullable, unlike selling price).
  function commitCost(raw: string) {
    const trimmed = raw.trim();
    const val = trimmed === "" ? null : Number(trimmed);
    if (val !== null && (!Number.isFinite(val) || val < 0)) {
      toast.error("Enter a non-negative number (blank = not set)");
      return;
    }
    if (val === (sku.cost ?? null)) return;
    patch.mutate(
      { id: sku.id, patch: { cost: val } },
      {
        onSuccess: () => toast.success(`${sku.sku} · cost updated`),
        onError: (e: unknown) =>
          toast.error(e instanceof ApiError ? e.message : "Update failed"),
      },
    );
  }

  /* Selling price (0175) — principal only, and the cell that calls this only
     renders for the principal. `price` is NOT nullable: blank means 0, which
     is the not-set sentinel the whole catalog already reads. */
  function commitPrice(raw: string) {
    const trimmed = raw.trim();
    const val = trimmed === "" ? 0 : Number(trimmed);
    if (!Number.isFinite(val) || val < 0) {
      toast.error("Enter a non-negative number (blank = not set)");
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

  /* PWP (0186) — ≤0 and null BOTH mean "not set"; blank clears back to null
     rather than promising a zero-ringgit reward. */
  function commitPwp(raw: string) {
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

  /* 2026-08-24 - the buyer keys a quotation HERE, so the two supplier facts
   * are editable HERE: who supplies it (supplier_id, via the roster picker -
   * never a typed name) and their code for it (supplier_code, free text).
   * Neither is money, so neither is 0175-locked - operation may write both,
   * the same standing 0226 gave it over cost. */
  function commitSupplier(nextId: string) {
    const val = nextId || null;
    if (val === (sku.supplierId ?? null)) return;
    patch.mutate(
      { id: sku.id, patch: { supplierId: val } },
      {
        onSuccess: () => toast.success(`${sku.sku} · supplier updated`),
        onError: (e: unknown) =>
          toast.error(e instanceof ApiError ? e.message : "Update failed"),
      },
    );
  }
  function commitSupplierCode(raw: string) {
    const val = raw.trim() || null;
    if (val === (sku.supplierCode ?? null)) return;
    patch.mutate(
      { id: sku.id, patch: { supplierCode: val } },
      {
        onSuccess: () => toast.success(`${sku.sku} · supplier code updated`),
        onError: (e: unknown) =>
          toast.error(e instanceof ApiError ? e.message : "Update failed"),
      },
    );
  }

  return (
    <>
    <div
      className="grid items-center gap-3 px-3 py-2 border-b border-base-100 last:border-b-0"
      style={{ gridTemplateColumns: GRID_COLS, opacity: discontinued ? 0.5 : 1 }}
      data-testid={`opcost-row-${sku.sku}`}
    >
      <div>
        <CodeChip>{sku.sku}</CodeChip>
      </div>
      <div className="text-body text-base-700 truncate" title={sku.description ?? ""}>
        {sku.description || <span className="text-base-400">—</span>}
      </div>
      <div className="text-body text-base-800 truncate" title={productName}>
        {productName}
      </div>
      <div className="text-meta text-base-600">{category ? CATEGORY_LABEL[category] : "—"}</div>
      <div className="text-body text-base-700">{sku.variant || "—"}</div>
      <div data-testid={`opcost-supplier-${sku.sku}`}>
        {editMode ? (
          <div className="flex flex-col gap-1">
            <select
              defaultValue={sku.supplierId ?? ""}
              onChange={(e) => commitSupplier(e.target.value)}
              aria-label={`${sku.sku} supplier`}
              data-testid={`opcost-supplier-pick-${sku.sku}`}
              className={`${INPUT_CLS} text-meta`}
            >
              <option value="">No supplier</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <input
              defaultValue={sku.supplierCode ?? ""}
              onBlur={(e) => commitSupplierCode(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              }}
              placeholder="Their code"
              aria-label={`${sku.sku} supplier code`}
              data-testid={`opcost-supplier-code-${sku.sku}`}
              className={`${INPUT_CLS} text-meta font-mono`}
            />
          </div>
        ) : (
          <div className="text-meta text-base-600 truncate" title={supplierName ?? ""}>
            {supplierName || <span className="text-base-400">—</span>}
            {sku.supplierCode ? (
              <span className="text-base-400 font-mono"> · {sku.supplierCode}</span>
            ) : null}
          </div>
        )}
        {/* 0388 — the OTHER suppliers' paper. The slot above stays the routing
            truth; this strip records what everyone else quoted so a second
            source's code and prices stop living on paper only. */}
        <button
          type="button"
          onClick={() => setOffersOpen((v) => !v)}
          className="mt-0.5 text-label font-medium text-kit-blue-9 underline underline-offset-2"
          data-testid={`opcost-offers-toggle-${sku.sku}`}
        >
          {offersOpen ? "Hide other suppliers" : "Other suppliers"}
        </button>
      </div>
      <div className="text-right" data-testid={`opcost-cost-${sku.sku}`}>
        {editMode ? (
          <input
            type="number"
            min={0}
            step="0.01"
            defaultValue={sku.cost ?? ""}
            placeholder="—"
            onBlur={(e) => commitCost(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            }}
            aria-label={`${sku.sku} cost`}
            className={`${INPUT_CLS} text-right t-num text-meta`}
          />
        ) : sku.cost == null ? (
          <span className="text-meta text-base-400 italic">not set</span>
        ) : (
          <span className="t-num text-meta text-base-800">{fmtRm(sku.cost)}</span>
        )}
      </div>
      {/* ⭐ SELLING PRICE — visible to everyone internal, editable by the
          principal alone (Jess, 2026-08-26: "let them see and not change it,
          cuz it avoids data pollution"). `price` is NOT nullable — 0 is the
          not-set sentinel (0175) and is never printed as RM 0.00. */}
      <div className="text-right" data-testid={`opcost-price-${sku.sku}`}>
        {editMode && canEditPrices ? (
          <input
            type="number"
            min={0}
            step="0.01"
            defaultValue={sku.price || ""}
            placeholder="—"
            onBlur={(e) => commitPrice(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            }}
            aria-label={`${sku.sku} price`}
            className={`${INPUT_CLS} text-right t-num text-meta`}
          />
        ) : sku.price > 0 ? (
          <span className="t-num text-meta text-base-800">{fmtRm(sku.price)}</span>
        ) : (
          <span className="text-meta text-base-400 italic">not set</span>
        )}
      </div>
      {/* PWP — the 0186 reward price. ≤0 / null both mean NOT SET, never free. */}
      <div className="text-right" data-testid={`opcost-pwp-${sku.sku}`}>
        {editMode && canEditPrices ? (
          <input
            type="number"
            min={0}
            step="0.01"
            defaultValue={sku.pwpPrice ?? ""}
            placeholder="—"
            onBlur={(e) => commitPwp(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            }}
            aria-label={`${sku.sku} PWP price`}
            className={`${INPUT_CLS} text-right t-num text-meta`}
          />
        ) : sku.pwpPrice != null && sku.pwpPrice > 0 ? (
          <span className="t-num text-meta text-base-800">{fmtRm(sku.pwpPrice)}</span>
        ) : (
          <span className="text-meta text-base-400 italic">not set</span>
        )}
      </div>
      {/* Margin is DERIVED, never stored and never typed — one arithmetic,
          shared with the admin grid (Law D). `null` = cost not set, which is
          not the same fact as a zero margin. */}
      <div className="text-right" data-testid={`opcost-margin-${sku.sku}`}>
        {margin == null ? (
          <span className="text-meta text-base-400">—</span>
        ) : (
          <span
            className={`t-num text-meta ${margin.amount < 0 ? "text-danger" : "text-base-600"}`}
            title={category === "sofa" ? "Base margin — the sofa fabric surcharge is not counted" : undefined}
          >
            {Math.round(margin.pct * 100)}%
          </span>
        )}
      </div>
    </div>
    {offersOpen && (
      <SupplierOffersStrip sku={sku} suppliers={suppliers} category={category ?? null} heights={heights} />
    )}
    </>
  );
});

/**
 * ⭐ 0388 — EVERY SUPPLIER'S PAPER FOR ONE SKU (YH, 2026-08-26).
 *
 * The measured case: both Hookkas supply some of the same bedframes, and the
 * one supplier slot meant the second company's own item code and prices had
 * nowhere to be written — the keyer was holding a quotation the system refused
 * to remember. This strip records one offer per supplier: THEIR code, THEIR
 * price/PWP. The slot above remains the only thing POs route by; recording an
 * offer changes no behaviour anywhere.
 *
 * Writes are principal-only (offers carry prices — the 0175/0186 boundary);
 * everyone internal may read.
 */
