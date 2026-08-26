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
import {
  useDeleteSkuSupplierOffer,
  useOperationSuppliers,
  usePatchCatalogSku,
  useSkuSupplierOffers,
  useUpsertSkuSupplierOffer,
} from "@/lib/queries";
import { INPUT_CLS } from "@/pages/operation/components/Modal";
import { CategoryChip, CATEGORY_LABEL, CodeChip } from "../components/atoms";

/**
 * Operation Catalog › SKU Master (0226) — the COSTING view of the shared
 * product_skus list. One money column: COST (the buying price operation
 * records), writable by operation + principal (DB trigger relaxed in 0226).
 * Deliberately NOT here: selling price, PWP, margin, per-size price grid,
 * bulk delete, import/export, + New SKU — this is a recording surface, not a
 * structure editor (structure lives in Product & Maintenance).
 *
 * Same render cap as the selling SKU Master: at most VISIBLE_CAP rows, with a
 * refine-your-filter hint past that (Loo's HV-Portal lag rule).
 */

const VISIBLE_CAP = 300;
// 8 tracks: code · desc · product · category · size · supplier · cost · edit
// 2026-08-24 - SUPPLIER added beside cost: the buyer recording a cost is
// looking at a quotation, and the quotation has a name on it. The name is
// DERIVED from supplier_id through the roster (Law A/D) - never stored here.
const GRID_COLS =
  "170px minmax(180px,1.4fr) minmax(120px,1fr) 110px 110px minmax(150px,1.2fr) 130px 60px";

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
  const [category, setCategory] = useState<CatFilter>("all");
  const [modelFilter, setModelFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [editMode, setEditMode] = useState(false);
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
            data-testid="opcost-sku-search"
            className={`${INPUT_CLS} w-56`}
          />
          <button
            type="button"
            onClick={() => setEditMode((v) => !v)}
            className={`${editMode ? "btn-secondary" : "btn-primary"} text-meta`}
            data-testid="opcost-edit-costs"
          >
            {editMode ? "Done editing" : "Edit Costs"}
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
        <span className="text-base-400"> · cost = buying price (isolated from POS selling)</span>
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
          <div className="label" />
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
            supplierName={r.sku.supplierId ? supplierNameById.get(r.sku.supplierId) ?? null : null}
            suppliers={suppliersQ.data?.suppliers ?? []}
            heights={sofaHeights}
          />
        ))}
      </div>
    </div>
  );
}

const CostRowView = memo(function CostRowView({
  row,
  editMode,
  supplierName,
  suppliers,
  heights,
}: {
  row: FlatRow;
  editMode: boolean;
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
      <div />
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
function SupplierOffersStrip({
  sku,
  suppliers,
  category,
  heights,
}: {
  sku: ProductSkuDto;
  suppliers: Array<{ id: string; name: string }>;
  /** The MODEL's category — a sofa offer is priced per seat height (0389),
   *  everything else keeps the flat price box. */
  category: string | null;
  /** The active sofa seat heights, pool-ordered — one box per height. */
  heights: string[];
}) {
  const isPrincipal = useAuth((s) => s.role) === "principal";
  const offersQ = useSkuSupplierOffers(sku.id, true);
  const upsert = useUpsertSkuSupplierOffer();
  const remove = useDeleteSkuSupplierOffer();
  const [supplierId, setSupplierId] = useState("");
  const [code, setCode] = useState("");
  const [price, setPrice] = useState("");
  const [pwp, setPwp] = useState("");
  /* 0389 — a sofa module is priced per seat height (Xammar: 24"/28"/30", from
     BOTH Hookkas). One box per active height; blanks are simply not quoted. */
  const [heightPrices, setHeightPrices] = useState<Record<string, string>>({});
  const sofa = category === "sofa";
  const offers = offersQ.data?.offers ?? [];

  function save() {
    if (!supplierId) return;
    const p = price.trim() === "" ? null : Number(price);
    const w = pwp.trim() === "" ? null : Number(pwp);
    if (
      (p !== null && (!Number.isFinite(p) || p < 0)) ||
      (w !== null && (!Number.isFinite(w) || w < 0))
    ) {
      toast.error("Enter non-negative numbers (blank = not quoted)");
      return;
    }
    const heightMap: Record<string, number> = {};
    for (const h of heights) {
      const t = (heightPrices[h] ?? "").trim();
      if (t === "") continue;
      const n = Number(t);
      if (!Number.isFinite(n) || n < 0) {
        toast.error("Enter non-negative numbers (blank = not quoted)");
        return;
      }
      heightMap[h] = n;
    }
    upsert.mutate(
      {
        skuId: sku.id,
        supplierId,
        supplierCode: code.trim() || null,
        price: p,
        pwpPrice: w,
        /* Sent only from the sofa lane, and null when every box is blank — an
           explicit clear, matching what the boxes show. Non-sofa saves omit
           the key entirely: leave the stored map alone, and keep the payload
           free of a column an older Worker's schema would refuse. */
        ...(sofa
          ? { pricesBySize: Object.keys(heightMap).length > 0 ? heightMap : null }
          : {}),
      },
      {
        onSuccess: () => {
          toast.success(`${sku.sku} · offer saved`);
          setSupplierId("");
          setCode("");
          setPrice("");
          setPwp("");
        },
        onError: (e: unknown) =>
          toast.error(e instanceof ApiError ? e.message : "Save failed"),
      },
    );
  }

  return (
    <div
      className="border-b border-base-100 bg-base-50 px-3 py-2"
      data-testid={`opcost-offers-${sku.sku}`}
    >
      {offersQ.isLoading ? (
        <span className="text-meta text-base-500">Loading…</span>
      ) : offers.length === 0 ? (
        <span className="text-meta text-base-500">No offers recorded</span>
      ) : (
        <ul className="flex flex-col gap-1">
          {offers.map((o) => (
            <li
              key={o.supplierId}
              className="flex flex-wrap items-center gap-2 text-meta text-base-700"
            >
              <span className="font-medium">{o.supplierName ?? "—"}</span>
              <span className="font-mono text-base-500">{o.supplierCode ?? "—"}</span>
              <span>
                {o.pricesBySize && Object.keys(o.pricesBySize).length > 0
                  ? heights
                      .filter((h) => typeof o.pricesBySize?.[h] === "number")
                      .map((h) => `${h}″ RM ${(o.pricesBySize as Record<string, number>)[h].toFixed(2)}`)
                      .join(" · ")
                  : o.price == null
                    ? "—"
                    : `RM ${o.price.toFixed(2)}`}
              </span>
              <span className="text-base-500">
                {o.pwpPrice == null ? "PWP —" : `PWP RM ${o.pwpPrice.toFixed(2)}`}
              </span>
              {isPrincipal && (
                <button
                  type="button"
                  onClick={() =>
                    remove.mutate(
                      { skuId: sku.id, supplierId: o.supplierId },
                      {
                        onError: (e: unknown) =>
                          toast.error(e instanceof ApiError ? e.message : "Remove failed"),
                      },
                    )
                  }
                  aria-label={`Remove ${o.supplierName ?? "offer"}`}
                  data-testid={`opcost-offer-remove-${sku.sku}-${o.supplierId}`}
                  className="text-base-400 hover:text-kit-red-11"
                >
                  ×
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {isPrincipal && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <select
            value={supplierId}
            onChange={(e) => {
              const next = e.target.value;
              setSupplierId(next);
              /* ⭐ PICKING A SUPPLIER WITH AN OFFER LOADS THAT OFFER
                 (2026-08-26). A re-save writes the WHOLE offer, so fixing a
                 code typo with blank price boxes silently wiped the recorded
                 price — the keyer had no way to know the blank meant "erase",
                 not "keep". The boxes now start from what is on file, and the
                 save writes back exactly what is shown. */
              const existing = offers.find((o) => o.supplierId === next);
              setCode(existing?.supplierCode ?? "");
              setPrice(existing?.price == null ? "" : String(existing.price));
              setPwp(existing?.pwpPrice == null ? "" : String(existing.pwpPrice));
              const map: Record<string, string> = {};
              for (const [k, v] of Object.entries(existing?.pricesBySize ?? {})) {
                if (typeof v === "number") map[k] = String(v);
              }
              setHeightPrices(map);
            }}
            aria-label={`${sku.sku} offer supplier`}
            data-testid={`opcost-offer-supplier-${sku.sku}`}
            className={`${INPUT_CLS} w-44 text-meta`}
          >
            <option value="">Supplier…</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Their code"
            data-testid={`opcost-offer-code-${sku.sku}`}
            className={`${INPUT_CLS} w-36 text-meta font-mono`}
          />
          {sofa ? (
            heights.map((h) => (
              <input
                key={h}
                value={heightPrices[h] ?? ""}
                onChange={(e) =>
                  setHeightPrices((prev) => ({ ...prev, [h]: e.target.value }))
                }
                placeholder={`${h}″`}
                title={`Price at ${h}″`}
                data-testid={`opcost-offer-height-${sku.sku}-${h}`}
                className={`${INPUT_CLS} w-20 text-meta`}
              />
            ))
          ) : (
            <input
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="Price"
              data-testid={`opcost-offer-price-${sku.sku}`}
              className={`${INPUT_CLS} w-24 text-meta`}
            />
          )}
          <input
            value={pwp}
            onChange={(e) => setPwp(e.target.value)}
            placeholder="PWP"
            data-testid={`opcost-offer-pwp-${sku.sku}`}
            className={`${INPUT_CLS} w-24 text-meta`}
          />
          <button
            type="button"
            onClick={save}
            disabled={!supplierId || upsert.isPending}
            data-testid={`opcost-offer-save-${sku.sku}`}
            className="btn-primary text-meta"
          >
            Save offer
          </button>
        </div>
      )}
    </div>
  );
}
