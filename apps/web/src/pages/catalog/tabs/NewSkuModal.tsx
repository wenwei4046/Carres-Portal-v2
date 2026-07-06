import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import type {
  CatalogOptionPoolDto,
  ProductCategory,
  ProductModelDto,
  SofaCompartmentDto,
  VariantKind,
} from "@carres/shared";
import { PRODUCT_CATEGORIES } from "@carres/shared";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import {
  useCreateCatalogModel,
  useCreateCatalogSku,
  useGenerateSkus,
  useOfferModelCompartments,
} from "@/lib/queries";
import { INPUT_CLS, Modal, ModalActions } from "@/pages/operation/components/Modal";
import { CATEGORY_LABEL, CodeChip } from "../components/atoms";

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
  sofaCompartments = [],
  optionPools = [],
  onClose,
}: {
  models: ProductModelDto[];
  /** Compartment pool (catalog bundle) — drives the sofa "pick compartments →
   *  auto-generate SKUs" path. Optional so non-catalog callers stay valid. */
  sofaCompartments?: SofaCompartmentDto[];
  /** Maintenance option pools (catalog bundle) — the mattress/bedframe SIZE
   *  chips read `mattress_size` / `bedframe_size` from here. */
  optionPools?: CatalogOptionPoolDto[];
  onClose: () => void;
}) {
  // Phase 2 (0175): price + cost are principal-only ("Master Admin"). A
  // non-principal may still create a SKU — it's just UNPRICED (price 0 / cost
  // null) and the principal prices it later. Hide the price/cost fields and
  // force the unpriced payload for them.
  const isPrincipal = useAuth((s) => s.role) === "principal";
  const createModel = useCreateCatalogModel();
  const createSku = useCreateCatalogSku();
  const offerCompartments = useOfferModelCompartments();
  const generateSkus = useGenerateSkus();
  const [mode, setMode] = useState<Mode>("new");

  // shared fields
  const [variant, setVariant] = useState("");
  const [price, setPrice] = useState("");
  const [cost, setCost] = useState(""); // blank -> null (cost is optional on creation)
  const [description, setDescription] = useState("");
  // new-product fields
  const [category, setCategory] = useState<ProductCategory>("mattress");
  const [name, setName] = useState("");
  // existing-model field
  const [modelId, setModelId] = useState("");

  // Sofa compartment pool (active only, pool order). A new sofa model defaults
  // to offering EVERY compartment — untick what this model doesn't offer.
  const compPool = useMemo(
    () =>
      sofaCompartments
        .filter((c) => c.active)
        .sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code)),
    [sofaCompartments],
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
  // the size field becomes pool chips, default ALL selected. Pool edits
  // auto-follow; other categories keep the free-text size field.
  const sizePool = useMemo(() => {
    const pool =
      category === "mattress" ? "mattress_size" : category === "bedframe" ? "bedframe_size" : null;
    if (!pool) return [] as CatalogOptionPoolDto[];
    return optionPools
      .filter((p) => p.pool === pool && p.active)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.value.localeCompare(b.value));
  }, [optionPools, category]);
  const [selectedSizes, setSelectedSizes] = useState<Set<string>>(
    () => new Set(sizePool.map((p) => p.value)),
  );
  // Category flips swap the pool (mattress ↔ bedframe ↔ none) — re-default to
  // "all of the new pool". Locked once the model exists (category is disabled).
  useEffect(() => {
    if (createdModelId === null) setSelectedSizes(new Set(sizePool.map((p) => p.value)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category]);

  const sortedModels = useMemo(
    () =>
      [...models].sort(
        (a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name),
      ),
    [models],
  );
  const existingModel = sortedModels.find((m) => m.id === modelId);

  const modelKey = mode === "new" ? deriveModelKey(name) : existingModel?.modelKey ?? "";
  const codePreview =
    modelKey && variant.trim() ? `${modelKey.toUpperCase()}-${variant.trim()}` : "";

  const priceNum = price.trim() === "" ? 0 : Number(price);
  const priceOk = Number.isFinite(priceNum) && priceNum >= 0;

  // cost: blank = null (not set); a non-negative number is valid
  const costTrimmed = cost.trim();
  const costNum: number | null = costTrimmed === "" ? null : Number(costTrimmed);
  const costOk =
    costTrimmed === "" ||
    (Number.isFinite(costNum as number) && (costNum as number) >= 0);

  // Sofa compartment path (principal-only — the per-compartment offer PUT is
  // principal-gated server-side; everyone else keeps the classic flow).
  const compSection = mode === "new" && category === "sofa" && isPrincipal;
  const compFlow = compSection && (selectedComps.size > 0 || createdModelId !== null);
  const firstSelectedCode = compPool.find((c) => selectedComps.has(c.id))?.code ?? "";

  // Mattress/bedframe size path — internal-open (generate-skus is the same
  // endpoint the Modular "New Model" uses; a non-principal generates UNPRICED).
  const sizeSection = mode === "new" && sizePool.length > 0;
  const sizeFlow = sizeSection && (selectedSizes.size > 0 || createdModelId !== null);
  const firstSelectedSize = sizePool.find((p) => selectedSizes.has(p.value))?.value ?? "";

  const valid = compFlow
    ? name.trim().length >= 2 && modelKey.length >= 2 && selectedComps.size > 0
    : sizeFlow
      ? name.trim().length >= 2 &&
        modelKey.length >= 2 &&
        selectedSizes.size > 0 &&
        (!isPrincipal || priceOk)
      : variant.trim().length > 0 &&
        // Price/cost only gate validity when the principal can actually set them.
        (!isPrincipal || (priceOk && costOk)) &&
        (mode === "new" ? name.trim().length >= 2 && modelKey.length >= 2 : !!existingModel);

  const pending =
    createModel.isPending ||
    createSku.isPending ||
    offerCompartments.isPending ||
    generateSkus.isPending;

  async function submit() {
    if (!valid) return;
    try {
      // Sofa compartment path — create the model (sofa_mode 'custom'), then
      // offer every ticked compartment; each offer mints its real
      // `{MODEL_KEY}-{code}` SKU server-side ("Sofa {Name} {code}").
      if (compFlow) {
        let sofaModelId = createdModelId;
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
        const { failed } = await offerCompartments.mutateAsync({
          modelId: sofaModelId,
          compartmentIds: ids,
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
          `Created ${name.trim()} + ${ids.length} compartment SKU${ids.length === 1 ? "" : "s"}`,
        );
        onClose();
        return;
      }

      // Mattress/bedframe size path — create the model (sizes seed the Modular
      // pool) then materialize ONE SKU PER TICKED SIZE ({MODEL_KEY}-{size}) via
      // the idempotent generate-skus endpoint. One optional price seeds all.
      if (sizeFlow) {
        const sizes = sizePool.filter((p) => selectedSizes.has(p.value)).map((p) => p.value);
        let sizeModelId = createdModelId;
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
          input: { variants: sizes, price: isPrincipal && priceNum > 0 ? priceNum : undefined },
        });
        toast.success(
          `Created ${name.trim()} + ${r.generated} SKU${r.generated === 1 ? "" : "s"}`,
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
        variant: variant.trim(),
        variantKind: kind,
        // 0175 — non-principal creates an UNPRICED SKU (price 0 / cost null);
        // the principal prices it later. Principal can seed price/cost here.
        price: isPrincipal ? priceNum : 0,
        cost: isPrincipal ? costNum : null,
        description: description.trim() || null,
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
            className={`t-small font-semibold px-3.5 py-1 rounded-full transition-colors disabled:opacity-50 ${
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
            <div className="t-small font-semibold text-amber-800">Model created</div>
            <div className="t-tiny text-amber-700 mt-0.5">
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
                <div className="t-tiny text-base-500 font-mono mt-1">
                  Internal id: <span className="text-base-700">{modelKey}</span>
                </div>
              )}
            </label>
            {compSection && (
              <div className="block" data-testid="new-sku-compartments">
                <div className="flex items-center justify-between mb-1">
                  <span className="label">Compartments</span>
                  {compPool.length > 0 && (
                    <div className="flex items-center gap-2.5">
                      <button
                        type="button"
                        onClick={() => setSelectedComps(new Set(compPool.map((c) => c.id)))}
                        className="t-tiny font-semibold text-base-500 hover:text-base-900 uppercase"
                        data-testid="new-sku-comps-all"
                      >
                        All
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedComps(new Set())}
                        className="t-tiny font-semibold text-base-500 hover:text-base-900 uppercase"
                        data-testid="new-sku-comps-none"
                      >
                        None
                      </button>
                    </div>
                  )}
                </div>
                {compPool.length === 0 ? (
                  <div className="t-tiny text-base-500">
                    No compartments in the pool yet — add them in Maintenance → Sofa
                    Compartments, or use the size field below for a flat sofa SKU.
                  </div>
                ) : (
                  <>
                    <div className="flex flex-wrap gap-1.5">
                      {compPool.map((comp) => {
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
                            className={`t-tiny font-mono font-semibold px-2 py-1 rounded-[4px] border transition-colors ${
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
                    <div className="t-tiny text-base-500 mt-1.5">
                      {selectedComps.size > 0 ? (
                        <>
                          Every sofa is a combination of compartments — auto-generates{" "}
                          <span className="text-base-700 font-medium">{selectedComps.size}</span>{" "}
                          SKU{selectedComps.size === 1 ? "" : "s"}, e.g.{" "}
                          <span className="font-mono text-base-700">
                            {(modelKey || "model").toUpperCase()}-{firstSelectedCode}
                          </span>{" "}
                          · &quot;Sofa {name.trim() || "…"} {firstSelectedCode}&quot;. Untick what
                          this model doesn&apos;t offer; prices are set per SKU in SKU Master.
                        </>
                      ) : (
                        <>None selected — creates a single flat sofa SKU from the size field below.</>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
            {sizeSection && (
              <div className="block" data-testid="new-sku-sizes">
                <div className="flex items-center justify-between mb-1">
                  <span className="label">Sizes</span>
                  <div className="flex items-center gap-2.5">
                    <button
                      type="button"
                      onClick={() => setSelectedSizes(new Set(sizePool.map((p) => p.value)))}
                      className="t-tiny font-semibold text-base-500 hover:text-base-900 uppercase"
                      data-testid="new-sku-sizes-all"
                    >
                      All
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedSizes(new Set())}
                      className="t-tiny font-semibold text-base-500 hover:text-base-900 uppercase"
                      data-testid="new-sku-sizes-none"
                    >
                      None
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {sizePool.map((p) => {
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
                        title={p.label ?? p.dimensions ?? p.value}
                        className={`t-tiny font-mono font-semibold px-2 py-1 rounded-[4px] border transition-colors ${
                          on
                            ? "bg-base-900 border-base-900 text-white"
                            : "bg-white border-base-200 text-base-500 hover:border-base-400"
                        }`}
                        data-testid={`new-sku-size-${p.value}`}
                      >
                        {p.value}
                      </button>
                    );
                  })}
                </div>
                <div className="t-tiny text-base-500 mt-1.5">
                  {selectedSizes.size > 0 ? (
                    <>
                      Auto-generates{" "}
                      <span className="text-base-700 font-medium">{selectedSizes.size}</span> SKU
                      {selectedSizes.size === 1 ? "" : "s"}, e.g.{" "}
                      <span className="font-mono text-base-700">
                        {(modelKey || "model").toUpperCase()}-{firstSelectedSize}
                      </span>
                      . Untick the sizes this product doesn&apos;t come in — the list follows
                      Special Add-ons → Sizes.
                    </>
                  ) : (
                    <>None selected — creates a single SKU from the size field below.</>
                  )}
                </div>
              </div>
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
                  {CATEGORY_LABEL[m.category]} {m.name}
                </option>
              ))}
            </select>
          </label>
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
              <div className="t-small text-base-600">Price</div>
              <div className="t-tiny text-base-400 mt-0.5">
                Generated SKUs are created unpriced — the principal (Master Admin) prices them.
              </div>
            </div>
          ))}

        {/* Classic single-SKU fields — hidden on the compartment path (codes,
            descriptions + prices all derive per compartment there) AND on the
            size path (one SKU per ticked size instead). */}
        {!compFlow && !sizeFlow && (
          <>
            <label className="block">
              <span className="label block mb-1">Size / variant</span>
              <input
                value={variant}
                onChange={(e) => setVariant(e.target.value)}
                placeholder={category === "sofa" ? "3-seater" : "King"}
                data-testid="new-sku-variant"
                className={INPUT_CLS}
              />
              {codePreview && (
                <div className="t-tiny text-base-500 mt-1 flex items-center gap-1.5">
                  Code: <CodeChip>{codePreview}</CodeChip>
                </div>
              )}
            </label>

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
                <div className="t-small text-base-600">Price &amp; cost</div>
                <div className="t-tiny text-base-400 mt-0.5">
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
                placeholder="Shown on the SKU list + dealer picker"
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
            ? `Create model + ${selectedComps.size} SKU${selectedComps.size === 1 ? "" : "s"}`
            : sizeFlow
              ? `Create model + ${selectedSizes.size} SKU${selectedSizes.size === 1 ? "" : "s"}`
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
