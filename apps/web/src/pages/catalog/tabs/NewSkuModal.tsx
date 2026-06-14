import { useMemo, useState } from "react";
import { toast } from "sonner";
import type { ProductCategory, ProductModelDto, VariantKind } from "@carres/shared";
import { PRODUCT_CATEGORIES } from "@carres/shared";
import { ApiError } from "@/lib/api";
import { useCreateCatalogModel, useCreateCatalogSku } from "@/lib/queries";
import { INPUT_CLS, Modal, ModalActions } from "@/pages/operation/components/Modal";
import { CATEGORY_LABEL, CodeChip } from "../components/atoms";

/**
 * + New SKU — two modes:
 *   • "New product" (default) — the model has never existed: pick a category,
 *     type the product name (→ kebab model key), a first size + price, and we
 *     create BOTH the model and its first SKU in one go.
 *   • "Add to existing model" — add another size/variant under a model that
 *     already exists.
 *
 * Either way the server derives the code as `{MODEL_KEY}-{variant}` and (for
 * service/accessory categories) skips the supplier requirement.
 */

type Mode = "new" | "existing";

// kebab-case the display name → internal model_key (Loo never types the key).
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
  onClose,
}: {
  models: ProductModelDto[];
  onClose: () => void;
}) {
  const createModel = useCreateCatalogModel();
  const createSku = useCreateCatalogSku();
  const [mode, setMode] = useState<Mode>("new");

  // shared fields
  const [variant, setVariant] = useState("");
  const [price, setPrice] = useState("");
  const [description, setDescription] = useState("");
  // new-product fields
  const [category, setCategory] = useState<ProductCategory>("mattress");
  const [name, setName] = useState("");
  // existing-model field
  const [modelId, setModelId] = useState("");

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
  const valid =
    variant.trim().length > 0 &&
    priceOk &&
    (mode === "new" ? name.trim().length >= 2 && modelKey.length >= 2 : !!existingModel);

  const pending = createModel.isPending || createSku.isPending;

  async function submit() {
    if (!valid) return;
    try {
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
        price: priceNum,
        description: description.trim() || null,
      });
      toast.success(`Added ${codePreview || variant.trim()}`);
      onClose();
    } catch (e) {
      // If the model was created but the SKU insert failed (e.g. no supplier
      // covers this category yet), the model persists — surface the reason so
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
            className={`t-small font-semibold px-3.5 py-1 rounded-full transition-colors ${
              mode === m ? "bg-white text-base-900 shadow-sm" : "text-base-600 hover:text-base-900"
            }`}
            data-testid={`new-sku-mode-${m}`}
          >
            {m === "new" ? "New product" : "Add to existing model"}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-3">
        {mode === "new" ? (
          <>
            <label className="block">
              <span className="label block mb-1">Category</span>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as ProductCategory)}
                data-testid="new-sku-category"
                className={INPUT_CLS}
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
                placeholder="Lumi FirmCare"
                data-testid="new-sku-name"
                className={INPUT_CLS}
              />
              {modelKey && (
                <div className="t-tiny text-base-500 font-mono mt-1">
                  Internal id: <span className="text-base-700">{modelKey}</span>
                </div>
              )}
            </label>
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
              <option value="">Select a model…</option>
              {sortedModels.map((m) => (
                <option key={m.id} value={m.id}>
                  {CATEGORY_LABEL[m.category]} · {m.name}
                </option>
              ))}
            </select>
          </label>
        )}

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

        <label className="block">
          <span className="label block mb-1">Price (RM, optional — leave blank for “not set”)</span>
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
          <span className="label block mb-1">Description (optional)</span>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Shown on the SKU list + dealer picker"
            className={INPUT_CLS}
          />
        </label>
      </div>

      <ModalActions
        onCancel={onClose}
        onPrimary={submit}
        primary={mode === "new" ? "Create product + SKU" : "Add SKU"}
        primaryDisabled={!valid}
        primaryPending={pending}
      />
    </Modal>
  );
}
