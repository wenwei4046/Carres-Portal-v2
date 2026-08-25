import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import type {
  CatalogOptionPoolDto,
  ProductCategory,
  ProductModelDto,
  ProductSkuDto,
  SofaCompartmentDto,
  VariantKind,
} from "@carres/shared";
import type { SofaComboDto } from "@carres/shared";
import {
  PRODUCT_CATEGORIES,
  autoBedSkuDescription,
  canonicalSize,
  guaranteeVisitsTotal,
  type GuaranteeKind,
} from "@carres/shared";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import {
  useCreateCatalogModel,
  useCreateSupplier,
  useOperationSuppliers,
  useCreateCatalogSku,
  useCreateGuaranteeProduct,
  useGenerateSkus,
  useOfferModelCompartments,
} from "@/lib/queries";
import { INPUT_CLS, Modal, ModalActions } from "@/pages/operation/components/Modal";
import { CATEGORY_LABEL, CodeChip } from "../components/atoms";
import GuaranteeScopeFields, {
  EMPTY_GUARANTEE_SCOPE,
  type GuaranteeScopeValue,
} from "./GuaranteeScopeFields";

/**
 * + New SKU -- two modes:
 *   "New product" (default) -- the model has never existed: pick a category,
 *   type the product name (-> kebab model key), a first size + price, and we
 *   create BOTH the model and its first SKU in one go.
 *   "Add to existing model" -- add another size/variant under a model that
 *   already exists.
 *
 * Either way the server derives the code as `{MODEL_KEY}-{variant}` and (for
 * service/accessory categories) skips the supplier requirement.
 *
 * Cost is optional on creation (blank = null). If provided it auto-fills onto
 * every Create-PO line that references this SKU.
 *
 * SOFA (principal, Loo 2026-07-06) -- a new sofa is a COMBINATION of pool
 * compartments, so picking category Sofa surfaces the compartment pool as
 * chips (default: every compartment offered, 2990s parity). Creating then
 * makes the model (sofa_mode 'custom') and offers each ticked compartment;
 * every offer auto-generates its real `{MODEL_KEY}-{code}` SKU server-side
 * with description "Sofa {Name} {code}" (all editable later in SKU Master).
 * Untick ALL compartments to fall back to the classic single flat SKU.
 *
 * MATTRESS / BEDFRAME (Loo 2026-07-06) -- the size field surfaces the
 * category's size POOL (Special Add-ons → Sizes: S / SS / Q / K / SK …) as
 * chips, default all selected. Creating makes the model + ONE SKU PER TICKED
 * SIZE via the existing generate-skus endpoint (one optional price seeds them
 * all); pool edits auto-follow. Untick all → the classic single-SKU flow.
 *
 * ADD TO EXISTING MODEL (Loo 2026-07-21) -- picking a model surfaces the SAME
 * option chips as "New product" for its category, filtered to what the model
 * does NOT yet carry (custom sofa → unoffered compartments; mattress/bedframe
 * → pool sizes with no live SKU), default NONE selected — tick just the
 * additions. Flat sofas keep the free-text variant field.
 */

type Mode = "new" | "existing";

// kebab-case the display name -> internal model_key (Loo never types the key).
function deriveModelKey(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function variantKindFor(category: ProductCategory, model?: ProductModelDto): VariantKind {
  if (category === "sofa") return model?.sofaMode === "custom" ? "part" : "preset";
  if (category === "mattress" || category === "bedframe") return "size";
  return "preset";
}

export default function NewSkuModal({
  models,
  skus = [],
  sofaCompartments = [],
  optionPools = [],
  sofaCombos = [],
  onClose,
}: {
  models: ProductModelDto[];
  /** Full SKU list (catalog bundle) — "Add to existing model" filters the
   *  compartment/size chips down to what the picked model doesn't have yet. */
  skus?: ProductSkuDto[];
  /** Compartment pool (catalog bundle) — drives the sofa "pick compartments →
   *  auto-generate SKUs" path. Optional so non-catalog callers stay valid. */
  sofaCompartments?: SofaCompartmentDto[];
  /** Maintenance option pools (catalog bundle) — the mattress/bedframe SIZE
   *  chips read `mattress_size` / `bedframe_size` from here. */
  optionPools?: CatalogOptionPoolDto[];
  /** Sofa combos (catalog bundle) — the Guarantee scope picker offers them as
   *  a coverage target. Optional so non-catalog callers stay valid. */
  sofaCombos?: SofaComboDto[];
  onClose: () => void;
}) {
  // Phase 2 (0175): price + cost are principal-only ("Master Admin"). A
  // non-principal may still create a SKU — it's just UNPRICED (price 0 / cost
  // null) and the principal prices it later. Hide the price/cost fields and
  // force the unpriced payload for them.
  const isPrincipal = useAuth((s) => s.role) === "principal";
  const createModel = useCreateCatalogModel();
  const createSku = useCreateCatalogSku();
  const createGuarantee = useCreateGuaranteeProduct();
  const offerCompartments = useOfferModelCompartments();
  const generateSkus = useGenerateSkus();
  const [mode, setMode] = useState<Mode>("new");

  // shared fields
  const [variant, setVariant] = useState("");
  const [price, setPrice] = useState("");
  const [cost, setCost] = useState(""); // blank -> null (cost is optional on creation)
  const [description, setDescription] = useState("");
  /* 0375 — the SUPPLIER'S own item code (their quotation's code for this
   * piece). Free text, optional; ours is the SKU code above. */
  const [supplierCode, setSupplierCode] = useState("");
  /* ⭐ ONE CODE FOR THE BATCH, ANY PIECE OVERRIDDEN (2026-08-24).
   *
   * A supplier's quotation names the SUPPLIER's code, never Carres' SKU — it is
   * the only string a keyer can match a factory's paperwork against. The bulk
   * flows generate many SKUs at once and a quotation usually lists a different
   * code per size or per compartment, so one shared box would write the same
   * wrong code onto every row.
   *
   * `supplierCode` above is the batch default; this map overrides one piece.
   * Keyed by what the SUBMIT sends — the canonical size NAME for the size flow
   * (`King`, which is what `variants` carries) and the compartmentId for the
   * compartment flow (which is what that loop iterates). Keying by anything the
   * server cannot recognise would silently drop the override. */
  const [supplierCodes, setSupplierCodes] = useState<Record<string, string>>({});
  /* 2026-08-24 - WHO supplies this piece. Empty = Auto: the route resolves
   * the supplier from `suppliers.cat_covered[]` exactly as it always has,
   * so an untouched form is byte-identical to before this picker existed.
   * Picking one writes supplier_id explicitly - the identity is the FK;
   * the NAME is only ever derived from it (Law A/D), never typed here. */
  const [supplierId, setSupplierId] = useState("");
  const suppliersQ = useOperationSuppliers();
  /* ⭐ Adding a supplier without leaving the SKU (2026-08-24). Principal-only,
   * because `suppliers_principal_write` (0002) has always been the boundary —
   * the panel simply does not render for anyone who would be refused. */
  const createSupplier = useCreateSupplier();
  const [newSupplierOpen, setNewSupplierOpen] = useState(false);
  const [newSupplierName, setNewSupplierName] = useState("");
  const [newSupplierKind, setNewSupplierKind] =
    useState<"own_logistics" | "factory_pickup">("factory_pickup");
  const [newSupplierCats, setNewSupplierCats] = useState<ProductCategory[]>([]);
  // new-product fields
  const [category, setCategory] = useState<ProductCategory>("mattress");
  const [name, setName] = useState("");
  // existing-model field
  const [modelId, setModelId] = useState("");
  // GUARANTEE authoring (Loo 2026-07-26) — picking category Guarantee swaps the
  // whole form: WHAT it covers + for how long, instead of a name + a size.
  const [gScope, setGScope] = useState<GuaranteeScopeValue>(EMPTY_GUARANTEE_SCOPE);
  const [gYears, setGYears] = useState("15");
  const [gBusy, setGBusy] = useState(false);
  // 0274 (Loo 2026-07-26) — the same category now authors BOTH kinds of cover.
  // one_time = a guarantee (one claim). recurring = a care plan whose visits are
  // counted down. Defaults to one_time so the existing flow is unchanged.
  const [gKind, setGKind] = useState<GuaranteeKind>("one_time");
  const [gVisitsPerYear, setGVisitsPerYear] = useState("2");

  const sortedModels = useMemo(
    () =>
      [...models].sort(
        (a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name),
      ),
    [models],
  );
  // ⭐ TWO MODELS CAN SHARE A NAME (2026-08-24) — the schema's real identity is
  // `(category, model_key)`, not name. Two suppliers each pitching a "Booqit"
  // land as two separate models the moment either one's model_key differs
  // (the import's own escape hatch; the auto-derived key alone WOULD collide).
  // The "Add to existing model" list read `{Category} {Name}` only, so two
  // same-named rows were LITERALLY IDENTICAL TEXT — a keyer had no way to tell
  // Hookka's Booqit from anyone else's, and could add a SKU to the wrong one.
  // Disambiguate ONLY where a real collision exists in this category, using a
  // fact already loaded (model_key) rather than inventing a supplier concept
  // a model doesn't have — supplier lives on the SKU, not here.
  const duplicateNameKeys = useMemo(() => {
    const seen = new Map<string, number>();
    for (const m of models) {
      const k = `${m.category} ${m.name.trim().toLowerCase()}`;
      seen.set(k, (seen.get(k) ?? 0) + 1);
    }
    return new Set([...seen].filter(([, n]) => n > 1).map(([k]) => k));
  }, [models]);
  // ⭐ ONE PICKER, THREE FLOWS (2026-08-24). The classic single-SKU flow always
  // had this control; the bulk paths (sizeFlow, compFlow) did not, so a batch
  // of mattress sizes or sofa compartments always guessed its supplier via the
  // route's category-cover fallback with no way to override it. Same state
  // (`supplierId`), same control, rendered wherever a flow needs it — the value
  // means the same thing everywhere: empty = Auto (today's resolve), a pick =
  // an explicit override sent to whichever endpoint this flow calls.
  const supplierPickerField = (
    <div className="block">
      <label className="block">
        <span className="label block mb-1">Supplier</span>
        <select
          value={supplierId}
          onChange={(e) => setSupplierId(e.target.value)}
          data-testid="new-sku-supplier"
          className={INPUT_CLS}
        >
          {/* Auto keeps the route's category-based resolution - the behaviour
              every SKU before this picker was created under. */}
          <option value="">Auto (by category)</option>
          {(suppliersQ.data?.suppliers ?? []).map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      {/* ⭐ MEETING A NEW SUPPLIER MID-CATALOG (2026-08-24).
          Until today the portal had NO supplier-creation door anywhere, so a
          keyer who reached a factory nobody had entered yet had to stop, open
          the SQL editor (or ask someone who could) and come back. The record
          still belongs to Purchasing; this is a door onto it, and the point of
          putting it HERE is that the half-written SKU survives. */}
      {isPrincipal && !newSupplierOpen && (
        <button
          type="button"
          onClick={() => {
            setNewSupplierOpen(true);
            /* Pre-tick the category being keyed: it is the answer nine times
               out of ten, and it is the one fact this modal already knows. */
            setNewSupplierCats(effectiveCategory ? [effectiveCategory] : []);
          }}
          className="mt-1.5 text-meta font-medium text-kit-blue-9 underline underline-offset-2"
          data-testid="new-sku-supplier-add-open"
        >
          + New supplier
        </button>
      )}
      {isPrincipal && newSupplierOpen && (
        <div
          className="mt-2 flex flex-col gap-2 rounded-card border border-base-200 bg-base-50 p-2.5"
          data-testid="new-sku-supplier-add"
        >
          <label className="block">
            <span className="label block mb-1">New supplier name</span>
            <input
              value={newSupplierName}
              onChange={(e) => setNewSupplierName(e.target.value)}
              placeholder="e.g. Hookka"
              data-testid="new-sku-supplier-add-name"
              className={INPUT_CLS}
            />
          </label>
          <label className="block">
            <span className="label block mb-1">How the goods leave the factory</span>
            <select
              value={newSupplierKind}
              onChange={(e) =>
                setNewSupplierKind(e.target.value as "own_logistics" | "factory_pickup")
              }
              data-testid="new-sku-supplier-add-kind"
              className={INPUT_CLS}
            >
              <option value="factory_pickup">We collect from the factory</option>
              <option value="own_logistics">They deliver to us</option>
            </select>
          </label>
          <div className="block">
            <span className="label block mb-1">What they supply</span>
            <div className="flex flex-wrap gap-1.5">
              {PRODUCT_CATEGORIES.map((cat) => {
                const on = newSupplierCats.includes(cat);
                return (
                  <button
                    key={cat}
                    type="button"
                    aria-pressed={on}
                    onClick={() =>
                      setNewSupplierCats((prev) =>
                        prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat],
                      )
                    }
                    className={`rounded-[4px] border px-2 py-1 text-meta font-semibold transition-colors ${
                      on
                        ? "border-base-900 bg-base-900 text-white"
                        : "border-base-200 bg-white text-base-500 hover:border-base-400"
                    }`}
                    data-testid={`new-sku-supplier-add-cat-${cat}`}
                  >
                    {CATEGORY_LABEL[cat]}
                  </button>
                );
              })}
            </div>
            <div className="mt-1 text-meta text-base-500">
              Ticking a category lets Carres pick this supplier on its own. You can always choose
              them by hand instead.
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={newSupplierName.trim().length < 2 || createSupplier.isPending}
              onClick={async () => {
                try {
                  const { supplier } = await createSupplier.mutateAsync({
                    name: newSupplierName.trim(),
                    kind: newSupplierKind,
                    catCovered: newSupplierCats,
                  });
                  /* Select it immediately — the keyer asked for this supplier
                     because they are keying its SKU right now. */
                  setSupplierId(supplier.id);
                  setNewSupplierOpen(false);
                  setNewSupplierName("");
                  toast.success(`${supplier.name} added — selected for this SKU`);
                } catch (e) {
                  toast.error(e instanceof ApiError ? e.message : "Could not add the supplier");
                }
              }}
              className="btn-primary text-meta"
              data-testid="new-sku-supplier-add-save"
            >
              {createSupplier.isPending ? "Adding…" : "Add supplier"}
            </button>
            <button
              type="button"
              onClick={() => setNewSupplierOpen(false)}
              className="btn-ghost text-meta"
              data-testid="new-sku-supplier-add-cancel"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );

  /* The batch-default code plus one box per piece being generated. Rendered by
     both bulk flows; the classic single-SKU flow keeps its own plain field
     below, because there is no batch to default and no second piece to
     override — a "same as above" placeholder would be describing nothing. */
  const supplierCodeBatchField = (pieces: { key: string; label: string }[]) => (
    <div className="block" data-testid="new-sku-supplier-code-batch">
      <label className="block">
        <span className="label block mb-1">Supplier item code (optional)</span>
        <input
          value={supplierCode}
          onChange={(e) => setSupplierCode(e.target.value)}
          placeholder="One code for the whole batch — override any piece below"
          data-testid="new-sku-supplier-code"
          className={INPUT_CLS}
        />
      </label>
      {pieces.length > 0 && (
        <div className="mt-2 flex flex-col gap-1.5" data-testid="new-sku-supplier-code-pieces">
          {pieces.map((p) => (
            <label key={p.key} className="flex items-center gap-2">
              <span className="w-24 shrink-0 truncate font-mono text-meta text-base-500">
                {p.label}
              </span>
              <input
                value={supplierCodes[p.key] ?? ""}
                onChange={(e) =>
                  setSupplierCodes((prev) => ({ ...prev, [p.key]: e.target.value }))
                }
                /* The placeholder SHOWS the inherited value, so an empty box is
                   never mistaken for an empty code. */
                placeholder={supplierCode.trim() || "same as above"}
                data-testid={`new-sku-supplier-code-piece-${p.key}`}
                className={INPUT_CLS}
              />
            </label>
          ))}
        </div>
      )}
    </div>
  );

  const modelOptionLabel = (m: ProductModelDto): string => {
    const dupe = duplicateNameKeys.has(`${m.category} ${m.name.trim().toLowerCase()}`);
    return `${CATEGORY_LABEL[m.category]} ${m.name}${dupe ? ` (${m.modelKey})` : ""}`;
  };
  const existingModel = sortedModels.find((m) => m.id === modelId);
  // The category the option chips key off — the picked category (new) or the
  // picked model's (existing): "Add to existing model" surfaces the SAME chips
  // as "New product" (Loo 2026-07-21).
  const effectiveCategory = mode === "new" ? category : existingModel?.category;

  // The picked model's LIVE SKUs (discontinued excluded — a soft-retired
  // compartment sku re-offers cleanly, so its chip stays offerable).
  const liveModelSkus = useMemo(
    () =>
      mode === "existing" && existingModel
        ? skus.filter((s) => s.modelId === existingModel.id && !s.discontinuedAt)
        : [],
    [mode, skus, existingModel],
  );

  // Sofa compartment pool (active only, pool order). A new sofa model defaults
  // to offering EVERY compartment — untick what this model doesn't offer. In
  // existing mode the chips are only the compartments NOT yet offered.
  const compPool = useMemo(
    () =>
      sofaCompartments
        .filter((c) => c.active)
        .sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code)),
    [sofaCompartments],
  );
  const offeredCompIds = useMemo(
    () =>
      new Set(liveModelSkus.map((s) => s.compartmentId).filter((x): x is string => x != null)),
    [liveModelSkus],
  );
  const compChoices = useMemo(
    () => (mode === "existing" ? compPool.filter((c) => !offeredCompIds.has(c.id)) : compPool),
    [mode, compPool, offeredCompIds],
  );
  const [selectedComps, setSelectedComps] = useState<Set<string>>(
    () => new Set(compPool.map((c) => c.id)),
  );
  // Compartment-path retry anchor: once the model row exists, a retry must NOT
  // re-insert it (23505 on the unique (category, model_key) constraint) — it
  // only re-offers the still-selected (= failed) compartments / re-runs the
  // idempotent generate-skus (existing codes are skipped).
  const [createdModelId, setCreatedModelId] = useState<string | null>(null);

  // Mattress/bedframe SIZE pool (Special Add-ons → Sizes; Loo 2026-07-06) —
  // the size field becomes pool chips. Keyed off effectiveCategory so the
  // existing-model path gets the same chips; there they're filtered to sizes
  // the model has no live SKU for yet.
  const sizePool = useMemo(() => {
    const pool =
      effectiveCategory === "mattress"
        ? "mattress_size"
        : effectiveCategory === "bedframe"
          ? "bedframe_size"
          : null;
    if (!pool) return [] as CatalogOptionPoolDto[];
    return optionPools
      .filter((p) => p.pool === pool && p.active)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.value.localeCompare(b.value));
  }, [optionPools, effectiveCategory]);
  const existingSizeNames = useMemo(
    () => new Set(liveModelSkus.map((s) => canonicalSize(s.variant).name)),
    [liveModelSkus],
  );
  const sizeChoices = useMemo(
    () =>
      mode === "existing"
        ? sizePool.filter((p) => !existingSizeNames.has(canonicalSize(p.value).name))
        : sizePool,
    [mode, sizePool, existingSizeNames],
  );
  const [selectedSizes, setSelectedSizes] = useState<Set<string>>(
    () => new Set(sizePool.map((p) => p.value)),
  );
  // Re-default the tick state when the chips swap under it (category flip /
  // mode flip / model pick): new mode = ALL of the pool (untick what the
  // product doesn't offer), existing mode = NONE (tick just the additions).
  // Locked once the model exists (category is disabled).
  useEffect(() => {
    if (createdModelId !== null) return;
    if (mode === "new") {
      setSelectedComps(new Set(compPool.map((c) => c.id)));
      setSelectedSizes(new Set(sizePool.map((p) => p.value)));
    } else {
      setSelectedComps(new Set());
      setSelectedSizes(new Set());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, category, modelId]);

  const modelKey = mode === "new" ? deriveModelKey(name) : existingModel?.modelKey ?? "";
  // Mattress/bedframe sizes get a SHORT code suffix server-side (a typed "King"
  // becomes `-K`); preview that so the code shown matches what's created.
  const isBedVariant = effectiveCategory === "mattress" || effectiveCategory === "bedframe";
  // Accessory / service carry NO size/variant axis (one SKU per model, Loo
  // 2026-07-11): the field is hidden, nothing to fill — the server mints the
  // bare MODEL_KEY as the SKU code.
  const noVariantAxis = effectiveCategory === "accessory" || effectiveCategory === "service";
  const codeSuffix = isBedVariant ? canonicalSize(variant.trim()).code : variant.trim();

  // Auto-description preview (Loo 2026-07-20) — a bed SKU created with a BLANK
  // description gets `{Category} {Model name} {dimensions}` stamped server-side
  // (the dimensions from the Maintenance size pool). Mirror that lookup here so
  // the modal previews exactly what will be written. Accessory/service stay manual.
  const bedPoolEntries = useMemo(() => {
    if (!isBedVariant || !effectiveCategory) return [];
    return optionPools.filter((p) => p.pool === `${effectiveCategory}_size`);
  }, [optionPools, isBedVariant, effectiveCategory]);
  const effectiveModelName = mode === "new" ? name : existingModel?.name ?? "";
  const autoDescPreview =
    isBedVariant && effectiveCategory && variant.trim() && description.trim() === ""
      ? autoBedSkuDescription(effectiveCategory, effectiveModelName, variant.trim(), bedPoolEntries)
      : null;
  const codePreview = noVariantAxis
    ? modelKey.toUpperCase()
    : modelKey && variant.trim()
      ? `${modelKey.toUpperCase()}-${codeSuffix}`
      : "";

  // GUARANTEE flow — a wholly separate authoring path (server mints the code,
  // the label and the terms row atomically).
  const guaranteeFlow = mode === "new" && category === "guarantee";
  const gYearsNum = Number(gYears);
  const gYearsOk = Number.isInteger(gYearsNum) && gYearsNum >= 1 && gYearsNum <= 50;
  const gVisitsNum = Number(gVisitsPerYear);
  const gVisitsOk =
    gKind === "one_time" ||
    (Number.isInteger(gVisitsNum) && gVisitsNum >= 1 && gVisitsNum <= 12);
  /** What the customer actually gets — the number the operator is selling. */
  const gVisitsTotal = guaranteeVisitsTotal(
    gKind,
    gYearsOk ? gYearsNum : 0,
    gKind === "recurring" ? gVisitsNum : null,
  );
  const gScopeOk =
    gScope.coversCategory === "sofa"
      ? gScope.sofaKind === "any" ||
        (gScope.sofaKind === "model" && !!gScope.coversModelId) ||
        (gScope.sofaKind === "combo" && !!gScope.coversComboId) ||
        (gScope.sofaKind === "compartment" && !!gScope.coversCompartmentId)
      : true; // non-sofa: "any model" is a legitimate scope

  const priceNum = price.trim() === "" ? 0 : Number(price);
  const priceOk = Number.isFinite(priceNum) && priceNum >= 0;

  // cost: blank = null (not set); a non-negative number is valid
  const costTrimmed = cost.trim();
  const costNum: number | null = costTrimmed === "" ? null : Number(costTrimmed);
  const costOk =
    costTrimmed === "" ||
    (Number.isFinite(costNum as number) && (costNum as number) >= 0);

  // Sofa compartment path (principal-only — the per-compartment offer PUT is
  // principal-gated server-side; everyone else keeps the classic flow). In
  // existing mode only a CUSTOM sofa model gets the chips — flat sofas keep
  // the free-text preset variant.
  const compSection =
    effectiveCategory === "sofa" &&
    isPrincipal &&
    (mode === "new" || existingModel?.sofaMode === "custom");
  const compFlow = compSection && (selectedComps.size > 0 || createdModelId !== null);
  const firstSelectedCode = compPool.find((c) => selectedComps.has(c.id))?.code ?? "";

  // Mattress/bedframe size path — internal-open (generate-skus is the same
  // endpoint the Modular "New Model" uses; a non-principal generates UNPRICED).
  const sizeSection = sizePool.length > 0;
  const sizeFlow = sizeSection && (selectedSizes.size > 0 || createdModelId !== null);
  const firstSelectedSize = sizePool.find((p) => selectedSizes.has(p.value))?.value ?? "";
  // Every generated bed SKU gets its auto description server-side — preview the
  // first ticked size's so the hint shows the exact format.
  const firstSizeDescPreview =
    firstSelectedSize && (effectiveCategory === "mattress" || effectiveCategory === "bedframe")
      ? autoBedSkuDescription(effectiveCategory, effectiveModelName, firstSelectedSize, sizePool)
      : null;

  // Chip flows: new mode needs a typed product name; existing mode needs the
  // picked model. Both need ≥1 tick.
  const chipTargetOk =
    mode === "new" ? name.trim().length >= 2 && modelKey.length >= 2 : !!existingModel;
  const valid = guaranteeFlow
    ? gYearsOk && gVisitsOk && gScopeOk && isPrincipal && priceOk
    : compFlow
    ? chipTargetOk && selectedComps.size > 0
    : sizeFlow
      ? chipTargetOk && selectedSizes.size > 0 && (!isPrincipal || priceOk)
      : // No-variant-axis categories (accessory / service) need no size/variant.
        (noVariantAxis || variant.trim().length > 0) &&
        // Price/cost only gate validity when the principal can actually set them.
        (!isPrincipal || (priceOk && costOk)) &&
        (mode === "new" ? name.trim().length >= 2 && modelKey.length >= 2 : !!existingModel);

  const pending =
    gBusy ||
    createModel.isPending ||
    createSku.isPending ||
    offerCompartments.isPending ||
    generateSkus.isPending;

  async function submit() {
    if (!valid) return;
    // GUARANTEE — one call: the server creates the model, the SKU and the terms
    // row together, or none of them. A SKU without terms would sell a
    // guarantee that covers nothing and mints no entitlement.
    if (guaranteeFlow) {
      setGBusy(true);
      try {
        const res = await createGuarantee.mutateAsync({
          coversCategory: gScope.coversCategory,
          coversModelId: gScope.coversModelId,
          coversVariants: gScope.coversVariants.length > 0 ? gScope.coversVariants : null,
          coversComboId: gScope.coversComboId,
          coversCompartmentId: gScope.coversCompartmentId,
          coverageYears: gYearsNum,
          // 0274 — the two travel together: a care plan SERVICES the item, a
          // guarantee REPLACES it. The zod refinement and the DB CHECK both
          // enforce the pairing, so sending them apart would just 422.
          kind: gKind,
          remedy: gKind === "recurring" ? "service" : "replace",
          visitsPerYear: gKind === "recurring" ? gVisitsNum : null,
          price: priceNum,
          description: description.trim() || null,
        });
        toast.success(`${res.sku} created — covers ${res.covers}`);
        onClose();
      } catch (e) {
        toast.error(e instanceof ApiError ? e.message : "Could not create the guarantee");
      } finally {
        setGBusy(false);
      }
      return;
    }
    try {
      // Sofa compartment path — create the model (sofa_mode 'custom') unless
      // adding to an existing one, then offer every ticked compartment; each
      // offer mints its real `{MODEL_KEY}-{code}` SKU server-side
      // ("Sofa {Name} {code}").
      if (compFlow) {
        let sofaModelId = mode === "existing" ? existingModel!.id : createdModelId;
        if (!sofaModelId) {
          const res = await createModel.mutateAsync({
            category,
            modelKey,
            name: name.trim(),
            sofaMode: "custom",
          });
          sofaModelId = res.model.id;
          setCreatedModelId(sofaModelId); // lock identity; a retry only re-offers
        }
        const ids = compPool.filter((c) => selectedComps.has(c.id)).map((c) => c.id);
        /* The compartment lane sends ONE code per request, so the batch default
           is resolved here rather than on the server — each PUT carries the
           single code that compartment should end up with. */
        const batch = supplierCode.trim();
        const codes: Record<string, string> = {};
        for (const compartmentId of ids) {
          const code = (supplierCodes[compartmentId] ?? "").trim() || batch;
          if (code) codes[compartmentId] = code;
        }
        const { failed } = await offerCompartments.mutateAsync({
          modelId: sofaModelId,
          compartmentIds: ids,
          supplierId: supplierId || undefined,
          /* Omitted when nobody typed a code, so a batch with no codes sends
             the byte-identical payload it sent before this field existed. */
          ...(Object.keys(codes).length > 0 ? { supplierCodes: codes } : {}),
        });
        if (failed.length > 0) {
          // Keep the modal open with ONLY the failed compartments selected —
          // clicking create again retries just those (the offer is idempotent).
          setSelectedComps(new Set(failed.map((f) => f.compartmentId)));
          toast.error(
            `${ids.length - failed.length} of ${ids.length} compartment SKUs created — ${failed.length} failed: ${failed[0].message}`,
          );
          return;
        }
        toast.success(
          mode === "existing"
            ? `Added ${ids.length} compartment SKU${ids.length === 1 ? "" : "s"} to ${existingModel!.name}`
            : `Created ${name.trim()} + ${ids.length} compartment SKU${ids.length === 1 ? "" : "s"}`,
        );
        onClose();
        return;
      }

      // Mattress/bedframe size path — create the model (sizes seed the Modular
      // pool) unless adding to an existing one, then materialize ONE SKU PER
      // TICKED SIZE ({MODEL_KEY}-{size}) via the idempotent generate-skus
      // endpoint (which also unions new sizes into allowed_options.sizes for
      // the sizes-active cascade). One optional price seeds all.
      if (sizeFlow) {
        // Store the FULL name (Single / Super Single / Queen / King) as the size
        // — the server keeps the SKU code short (`-K`) but the SIZE reads the
        // full name. allowed_options.sizes must match the variants for the
        // sizes-active cascade, so both carry the canonical name.
        const sizes = sizePool
          .filter((p) => selectedSizes.has(p.value))
          .map((p) => canonicalSize(p.value).name);
        let sizeModelId = mode === "existing" ? existingModel!.id : createdModelId;
        if (!sizeModelId) {
          const res = await createModel.mutateAsync({
            category,
            modelKey,
            name: name.trim(),
            allowedOptions: { sizes },
          });
          sizeModelId = res.model.id;
          setCreatedModelId(sizeModelId); // lock identity; a retry only re-generates
        }
        const r = await generateSkus.mutateAsync({
          modelId: sizeModelId,
          // Non-principal generates UNPRICED (price omitted → server defaults 0).
          input: {
            variants: sizes,
            price: isPrincipal && priceNum > 0 ? priceNum : undefined,
            supplierId: supplierId || undefined,
            /* The server resolves per-variant → batch → NULL, so both ride the
               one request. Only the sizes actually being generated are sent —
               a code typed against a size then unticked must not travel. */
            supplierCode: supplierCode.trim() || undefined,
            ...(() => {
              const own = sizes.reduce<Record<string, string>>((acc, v) => {
                const code = (supplierCodes[v] ?? "").trim();
                if (code) acc[v] = code;
                return acc;
              }, {});
              /* Same rule as the compartment lane: an empty map is not sent, so
                 a batch with no per-piece codes is byte-identical to before. */
              return Object.keys(own).length > 0 ? { supplierCodes: own } : {};
            })(),
          },
        });
        toast.success(
          mode === "existing"
            ? `Added ${r.generated} SKU${r.generated === 1 ? "" : "s"} to ${existingModel!.name}`
            : `Created ${name.trim()} + ${r.generated} SKU${r.generated === 1 ? "" : "s"}`,
        );
        onClose();
        return;
      }

      let targetModelId: string;
      let kind: VariantKind;
      if (mode === "new") {
        const res = await createModel.mutateAsync({
          category,
          modelKey,
          name: name.trim(),
        });
        targetModelId = res.model.id;
        kind = variantKindFor(category);
      } else {
        targetModelId = existingModel!.id;
        kind = variantKindFor(existingModel!.category, existingModel!);
      }
      await createSku.mutateAsync({
        modelId: targetModelId,
        // Accessory / service: no variant axis — always sent empty (a stale
        // value typed before a category flip must not leak into the code).
        variant: noVariantAxis ? "" : variant.trim(),
        variantKind: kind,
        // 0175 — non-principal creates an UNPRICED SKU (price 0 / cost null);
        // the principal prices it later. Principal can seed price/cost here.
        price: isPrincipal ? priceNum : 0,
        cost: isPrincipal ? costNum : null,
        description: description.trim() || null,
        supplierId: supplierId || null,
        supplierCode: supplierCode.trim() || null,
      });
      toast.success(`Added ${codePreview || variant.trim()}`);
      onClose();
    } catch (e) {
      // If the model was created but the SKU insert failed (e.g. no supplier
      // covers this category yet), the model persists -- surface the reason so
      // the user can fix it (add a supplier / pick a different category).
      toast.error(e instanceof ApiError ? e.message : "Add failed");
    }
  }

  return (
    <Modal title="New SKU" onClose={onClose}>
      {/* Mode switch */}
      <div className="inline-flex items-center gap-1 p-1 bg-base-100 rounded-full mb-4">
        {(["new", "existing"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            disabled={createdModelId !== null}
            className={`text-body font-semibold px-3.5 py-1 rounded-full transition-colors disabled:opacity-50 ${
              mode === m ? "bg-white text-base-900 shadow-sm" : "text-base-600 hover:text-base-900"
            }`}
            data-testid={`new-sku-mode-${m}`}
          >
            {m === "new" ? "New product" : "Add to existing model"}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-3">
        {createdModelId && (
          <div
            className="rounded-[4px] border border-amber-300 bg-amber-50 px-3 py-2"
            data-testid="new-sku-model-created-notice"
          >
            <div className="text-body font-semibold text-amber-800">Model created</div>
            <div className="text-meta text-amber-700 mt-0.5">
              The model exists — click create again to retry the remaining SKUs only.
            </div>
          </div>
        )}
        {mode === "new" ? (
          <>
            <label className="block">
              <span className="label block mb-1">Category</span>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as ProductCategory)}
                disabled={createdModelId !== null}
                data-testid="new-sku-category"
                className={`${INPUT_CLS} disabled:opacity-50`}
              >
                {PRODUCT_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_LABEL[c]}
                  </option>
                ))}
              </select>
            </label>
            {guaranteeFlow ? (
              <>
                {/* WHAT it covers — the whole point of a guarantee (Loo
                    2026-07-26). Name, size and code are all DERIVED from this
                    plus the years, so two people can't spell the same cover
                    two ways. */}
                <GuaranteeScopeFields
                  value={gScope}
                  onChange={setGScope}
                  models={models}
                  optionPools={optionPools}
                  sofaCompartments={sofaCompartments}
                  sofaCombos={sofaCombos}
                />
                {/* 0274 — which of the two covers this is. Asked BEFORE the
                    years, because it changes what "years" means: 15 years of a
                    single swap promise, or 3 years of scheduled visits. */}
                <div>
                  <span className="label block mb-1">Type</span>
                  <div className="flex gap-1.5">
                    {(
                      [
                        ["one_time", "One-time", "One claim, then it is used up"],
                        ["recurring", "Recurring", "Visits counted down each year"],
                      ] as [GuaranteeKind, string, string][]
                    ).map(([k, title, hint]) => (
                      <button
                        key={k}
                        type="button"
                        onClick={() => setGKind(k)}
                        aria-pressed={gKind === k}
                        title={hint}
                        data-testid={`new-sku-guarantee-kind-${k}`}
                        className={`flex-1 text-left px-3 py-2 rounded-[4px] border transition-colors ${
                          gKind === k
                            ? "bg-base-900 text-white border-base-900"
                            : "bg-white text-base-700 border-base-300 hover:border-base-500"
                        }`}
                      >
                        <span className="text-body font-semibold block">{title}</span>
                        <span className="text-meta opacity-80">{hint}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <label className="block">
                  <span className="label block mb-1">
                    {gKind === "recurring" ? "Plan runs for (years)" : "Covered for (years)"}
                  </span>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    step={1}
                    value={gYears}
                    onChange={(e) => setGYears(e.target.value)}
                    data-testid="new-sku-guarantee-years"
                    className={INPUT_CLS}
                  />
                  {!gYearsOk && gYears.trim() !== "" && (
                    <p className="text-meta text-danger mt-1">Between 1 and 50 years.</p>
                  )}
                </label>

                {gKind === "recurring" && (
                  <label className="block">
                    <span className="label block mb-1">Visits per year</span>
                    <input
                      type="number"
                      min={1}
                      max={12}
                      step={1}
                      value={gVisitsPerYear}
                      onChange={(e) => setGVisitsPerYear(e.target.value)}
                      data-testid="new-sku-guarantee-visits"
                      className={INPUT_CLS}
                    />
                    {!gVisitsOk && gVisitsPerYear.trim() !== "" ? (
                      <p className="text-meta text-danger mt-1">Between 1 and 12 visits a year.</p>
                    ) : (
                      // The total is the thing being sold — an operator should
                      // never have to multiply it in their head at the counter.
                      <p className="text-meta text-base-500 mt-1" data-testid="new-sku-guarantee-total">
                        {gYearsOk
                          ? `${gVisitsTotal} visits in total over ${gYearsNum} year${gYearsNum === 1 ? "" : "s"}.`
                          : "Set the years to see the total."}
                      </p>
                    )}
                  </label>
                )}
                {isPrincipal ? (
                  <label className="block">
                    <span className="label block mb-1">Price (RM)</span>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                      placeholder="0.00"
                      data-testid="new-sku-guarantee-price"
                      className={INPUT_CLS}
                    />
                  </label>
                ) : (
                  <div className="rounded-[4px] border border-base-200 bg-base-50 px-3 py-2">
                    <div className="text-body text-base-600">Principal only</div>
                    <div className="text-meta text-base-400 mt-0.5">
                      A guarantee carries a multi-year liability, so only the Master Admin
                      can author one.
                    </div>
                  </div>
                )}
                <label className="block">
                  <span className="label block mb-1">Description (optional)</span>
                  <input
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="What the customer gets if they claim"
                    data-testid="new-sku-guarantee-description"
                    className={INPUT_CLS}
                  />
                </label>
                {/* No size and no cost on purpose: a guarantee has no variant
                    axis, and it is never purchased from a supplier. */}
              </>
            ) : (
            <label className="block">
              <span className="label block mb-1">Product name</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={createdModelId !== null}
                placeholder="Lumi FirmCare"
                data-testid="new-sku-name"
                className={`${INPUT_CLS} disabled:opacity-50`}
              />
              {modelKey && (
                <div className="text-meta text-base-500 font-mono mt-1">
                  Internal id: <span className="text-base-700">{modelKey}</span>
                </div>
              )}
            </label>
            )}
          </>
        ) : (
          <label className="block">
            <span className="label block mb-1">Model</span>
            <select
              value={modelId}
              onChange={(e) => setModelId(e.target.value)}
              data-testid="new-sku-model"
              className={INPUT_CLS}
            >
              <option value="">Select a model...</option>
              {sortedModels.map((m) => (
                <option key={m.id} value={m.id}>
                  {modelOptionLabel(m)}
                </option>
              ))}
            </select>
          </label>
        )}

        {/* Option chips — shared by BOTH modes (Loo 2026-07-21): custom sofa →
            compartment pool; mattress/bedframe → size pool. In existing mode
            the chips are pre-filtered to what the model doesn't carry yet. */}
        {compSection && (
          <div className="block" data-testid="new-sku-compartments">
            <div className="flex items-center justify-between mb-1">
              <span className="label">Compartments</span>
              {compChoices.length > 0 && (
                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => setSelectedComps(new Set(compChoices.map((c) => c.id)))}
                    className="text-meta font-semibold text-base-500 hover:text-base-900 uppercase"
                    data-testid="new-sku-comps-all"
                  >
                    All
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedComps(new Set())}
                    className="text-meta font-semibold text-base-500 hover:text-base-900 uppercase"
                    data-testid="new-sku-comps-none"
                  >
                    None
                  </button>
                </div>
              )}
            </div>
            {compPool.length === 0 ? (
              <div className="text-meta text-base-500">
                No compartments in the pool yet — add them in Maintenance → Sofa
                Compartments, or use the size field below for a flat sofa SKU.
              </div>
            ) : compChoices.length === 0 ? (
              <div className="text-meta text-base-500" data-testid="new-sku-comps-none-left">
                This model already offers every pool compartment — nothing left to add.
              </div>
            ) : (
              <>
                <div className="flex flex-wrap gap-1.5">
                  {compChoices.map((comp) => {
                    const on = selectedComps.has(comp.id);
                    return (
                      <button
                        key={comp.id}
                        type="button"
                        onClick={() =>
                          setSelectedComps((prev) => {
                            const next = new Set(prev);
                            if (next.has(comp.id)) next.delete(comp.id);
                            else next.add(comp.id);
                            return next;
                          })
                        }
                        aria-pressed={on}
                        title={comp.description ?? comp.code}
                        className={`text-meta font-mono font-semibold px-2 py-1 rounded-[4px] border transition-colors ${
                          on
                            ? "bg-base-900 border-base-900 text-white"
                            : "bg-white border-base-200 text-base-500 hover:border-base-400"
                        }`}
                        data-testid={`new-sku-comp-${comp.code}`}
                      >
                        {comp.code}
                      </button>
                    );
                  })}
                </div>
                <div className="text-meta text-base-500 mt-1.5">
                  {selectedComps.size > 0 ? (
                    <>
                      Every sofa is a combination of compartments — auto-generates{" "}
                      <span className="text-base-700 font-medium">{selectedComps.size}</span>{" "}
                      SKU{selectedComps.size === 1 ? "" : "s"}, e.g.{" "}
                      <span className="font-mono text-base-700">
                        {(modelKey || "model").toUpperCase()}-{firstSelectedCode}
                      </span>{" "}
                      · &quot;Sofa {effectiveModelName.trim() || "…"} {firstSelectedCode}&quot;.{" "}
                      {mode === "existing"
                        ? "Only compartments this model doesn't offer yet are shown; prices are set per SKU in SKU Master."
                        : "Untick what this model doesn't offer; prices are set per SKU in SKU Master."}
                    </>
                  ) : mode === "existing" ? (
                    <>Tick the compartments to add — each mints its real SKU.</>
                  ) : (
                    <>None selected — creates a single flat sofa SKU from the size field below.</>
                  )}
                </div>
              </>
            )}
          </div>
        )}
        {compFlow && supplierPickerField}
        {compFlow &&
          supplierCodeBatchField(
            compPool
              .filter((c) => selectedComps.has(c.id))
              .map((c) => ({ key: c.id, label: c.code })),
          )}
        {sizeSection && (
          <div className="block" data-testid="new-sku-sizes">
            <div className="flex items-center justify-between mb-1">
              <span className="label">Sizes</span>
              {sizeChoices.length > 0 && (
                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => setSelectedSizes(new Set(sizeChoices.map((p) => p.value)))}
                    className="text-meta font-semibold text-base-500 hover:text-base-900 uppercase"
                    data-testid="new-sku-sizes-all"
                  >
                    All
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedSizes(new Set())}
                    className="text-meta font-semibold text-base-500 hover:text-base-900 uppercase"
                    data-testid="new-sku-sizes-none"
                  >
                    None
                  </button>
                </div>
              )}
            </div>
            {sizeChoices.length === 0 ? (
              <div className="text-meta text-base-500" data-testid="new-sku-sizes-none-left">
                This model already has a SKU for every pool size — nothing left to add.
              </div>
            ) : (
              <>
                <div className="flex flex-wrap gap-1.5">
                  {sizeChoices.map((p) => {
                    const on = selectedSizes.has(p.value);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() =>
                          setSelectedSizes((prev) => {
                            const next = new Set(prev);
                            if (next.has(p.value)) next.delete(p.value);
                            else next.add(p.value);
                            return next;
                          })
                        }
                        aria-pressed={on}
                        title={[p.value, p.label ?? p.dimensions].filter(Boolean).join(" · ")}
                        className={`text-meta font-semibold px-2 py-1 rounded-[4px] border transition-colors ${
                          on
                            ? "bg-base-900 border-base-900 text-white"
                            : "bg-white border-base-200 text-base-500 hover:border-base-400"
                        }`}
                        data-testid={`new-sku-size-${p.value}`}
                      >
                        {canonicalSize(p.value).name}
                      </button>
                    );
                  })}
                </div>
                <div className="text-meta text-base-500 mt-1.5">
                  {selectedSizes.size > 0 ? (
                    <>
                      Auto-generates{" "}
                      <span className="text-base-700 font-medium">{selectedSizes.size}</span> SKU
                      {selectedSizes.size === 1 ? "" : "s"}, e.g.{" "}
                      <span className="font-mono text-base-700">
                        {(modelKey || "model").toUpperCase()}-{firstSelectedSize}
                      </span>
                      {firstSizeDescPreview && (
                        <>
                          {" "}· desc{" "}
                          <span className="font-mono text-base-700">{firstSizeDescPreview}</span>
                        </>
                      )}
                      .{" "}
                      {mode === "existing"
                        ? "Only sizes this model doesn't have yet are shown — the list follows Special Add-ons → Sizes."
                        : "Untick the sizes this product doesn't come in — the list follows Special Add-ons → Sizes."}
                    </>
                  ) : mode === "existing" ? (
                    <>Tick the sizes to add — one SKU per size.</>
                  ) : (
                    <>None selected — creates a single SKU from the size field below.</>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* Size path keeps ONE price field — it seeds every generated SKU. */}
        {sizeFlow &&
          (isPrincipal ? (
            <label className="block">
              <span className="label block mb-1">Price for every generated SKU (RM, optional)</span>
              <input
                type="number"
                min={0}
                step="0.01"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="0.00"
                data-testid="new-sku-price"
                className={INPUT_CLS}
              />
            </label>
          ) : (
            <div
              className="rounded-[4px] border border-base-200 bg-base-50 px-3 py-2"
              data-testid="new-sku-price-lock-hint"
            >
              <div className="text-body text-base-600">Price</div>
              <div className="text-meta text-base-400 mt-0.5">
                Generated SKUs are created unpriced — the principal (Master Admin) prices them.
              </div>
            </div>
          ))}
        {sizeFlow && supplierPickerField}
        {sizeFlow &&
          supplierCodeBatchField(
            /* Keyed by the CANONICAL NAME, because that is what the submit puts
               in `variants` — keying by the raw pool value would hand the server
               a map it cannot match and the override would vanish silently. */
            sizePool
              .filter((p) => selectedSizes.has(p.value))
              .map((p) => ({
                key: canonicalSize(p.value).name,
                label: canonicalSize(p.value).name,
              })),
          )}

        {/* Classic single-SKU fields — hidden on the compartment path (codes,
            descriptions + prices all derive per compartment there) AND on the
            size path (one SKU per ticked size instead). In existing mode a
            chip section OWNS the flow outright (no free-text fallback — the
            additions are picked, not typed). */}
        {!guaranteeFlow &&
          !compFlow &&
          !sizeFlow &&
          !(mode === "existing" && (compSection || sizeSection)) && (
          <>
            {noVariantAxis ? (
              // Accessory / service: no size/variant axis — nothing to fill.
              // Just preview the code the server will mint (the bare model key).
              codePreview && (
                <div
                  className="text-meta text-base-500 flex items-center gap-1.5"
                  data-testid="new-sku-no-variant-hint"
                >
                  Code: <CodeChip>{codePreview}</CodeChip>
                </div>
              )
            ) : (
              <label className="block">
                <span className="label block mb-1">Size / variant</span>
                <input
                  value={variant}
                  onChange={(e) => setVariant(e.target.value)}
                  placeholder={effectiveCategory === "sofa" ? "3-seater" : "King"}
                  data-testid="new-sku-variant"
                  className={INPUT_CLS}
                />
                {codePreview && (
                  <div className="text-meta text-base-500 mt-1 flex items-center gap-1.5">
                    Code: <CodeChip>{codePreview}</CodeChip>
                  </div>
                )}
              </label>
            )}

            {isPrincipal ? (
              <>
                <label className="block">
                  <span className="label block mb-1">Price (RM, optional)</span>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    placeholder="0.00"
                    data-testid="new-sku-price"
                    className={INPUT_CLS}
                  />
                </label>

                <label className="block">
                  <span className="label block mb-1">Cost (RM, optional)</span>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={cost}
                    onChange={(e) => setCost(e.target.value)}
                    placeholder="not set"
                    data-testid="new-sku-cost"
                    className={INPUT_CLS}
                  />
                </label>
              </>
            ) : (
              <div
                className="rounded-[4px] border border-base-200 bg-base-50 px-3 py-2"
                data-testid="new-sku-price-lock-hint"
              >
                <div className="text-body text-base-600">Price &amp; cost</div>
                <div className="text-meta text-base-400 mt-0.5">
                  Set by the principal (Master Admin). This SKU is created unpriced —
                  the principal will price it.
                </div>
              </div>
            )}

            <label className="block">
              <span className="label block mb-1">Description (optional)</span>
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={autoDescPreview ?? "Shown on the SKU list + dealer picker"}
                className={INPUT_CLS}
              />
              {autoDescPreview && (
                <div className="text-meta text-base-500 mt-1" data-testid="new-sku-auto-desc">
                  Blank = auto-filled{" "}
                  <span className="font-mono text-base-700">{autoDescPreview}</span> (from the
                  size pool dimensions)
                </div>
              )}
            </label>

            {supplierPickerField}

            <label className="block">
              <span className="label block mb-1">Supplier item code (optional)</span>
              <input
                value={supplierCode}
                onChange={(e) => setSupplierCode(e.target.value)}
                placeholder="The supplier's own code for this piece (e.g. off the Hookka quotation)"
                data-testid="new-sku-supplier-code"
                className={INPUT_CLS}
              />
            </label>
          </>
        )}
      </div>

      <ModalActions
        onCancel={onClose}
        onPrimary={submit}
        primary={
          compFlow
            ? mode === "existing"
              ? `Add ${selectedComps.size} SKU${selectedComps.size === 1 ? "" : "s"}`
              : `Create model + ${selectedComps.size} SKU${selectedComps.size === 1 ? "" : "s"}`
            : sizeFlow
              ? mode === "existing"
                ? `Add ${selectedSizes.size} SKU${selectedSizes.size === 1 ? "" : "s"}`
                : `Create model + ${selectedSizes.size} SKU${selectedSizes.size === 1 ? "" : "s"}`
              : mode === "new"
                ? "Create product + SKU"
                : "Add SKU"
        }
        primaryDisabled={!valid}
        primaryPending={pending}
      />
    </Modal>
  );
}
