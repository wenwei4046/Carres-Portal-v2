import { useMemo, useState } from "react";
import { toast } from "sonner";
import type { ProductModelDto, VariantKind } from "@carres/shared";
import { ApiError } from "@/lib/api";
import { useCreateCatalogSku } from "@/lib/queries";
import { INPUT_CLS, Modal, ModalActions } from "@/pages/operation/components/Modal";
import { CATEGORY_LABEL, CodeChip } from "../components/atoms";

/**
 * + New SKU — single-SKU create under an existing model. The server derives
 * the code as `{MODEL_KEY}-{variant}` and (for service/accessory models)
 * relaxes the supplier requirement automatically, so this one form covers both
 * the "model-based" and the "accessory/service no-supplier" cases. Bulk
 * size-fan-out lives on the Modular tab's Generate SKUs.
 */

// Default variant_kind from the model's category, matching the old catalog's
// rule: size categories → 'size'; sofa → preset/part by sofa_mode; everything
// else (accessory/service) → 'preset'.
function defaultVariantKind(model: ProductModelDto): VariantKind {
  if (model.category === "sofa") return model.sofaMode === "custom" ? "part" : "preset";
  if (model.category === "mattress" || model.category === "bedframe") return "size";
  return "preset";
}

export default function NewSkuModal({
  models,
  onClose,
}: {
  models: ProductModelDto[];
  onClose: () => void;
}) {
  const create = useCreateCatalogSku();
  const [modelId, setModelId] = useState("");
  const [variant, setVariant] = useState("");
  const [price, setPrice] = useState("");
  const [description, setDescription] = useState("");

  // Models sorted by category then name so the dropdown reads top-down.
  const sortedModels = useMemo(
    () =>
      [...models].sort(
        (a, b) =>
          a.category.localeCompare(b.category) || a.name.localeCompare(b.name),
      ),
    [models],
  );

  const model = sortedModels.find((m) => m.id === modelId);
  const codePreview = model && variant.trim()
    ? `${model.modelKey.toUpperCase()}-${variant.trim()}`
    : "";

  const priceNum = price.trim() === "" ? 0 : Number(price);
  const valid =
    !!model &&
    variant.trim().length > 0 &&
    Number.isFinite(priceNum) &&
    priceNum >= 0;

  function submit() {
    if (!model || !valid) return;
    create.mutate(
      {
        modelId: model.id,
        variant: variant.trim(),
        variantKind: defaultVariantKind(model),
        price: priceNum,
        description: description.trim() || null,
      },
      {
        onSuccess: () => {
          toast.success(`Added ${codePreview}`);
          onClose();
        },
        onError: (e: unknown) =>
          toast.error(e instanceof ApiError ? e.message : "Add failed"),
      },
    );
  }

  return (
    <Modal title="New SKU" onClose={onClose}>
      <div className="flex flex-col gap-3">
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

        <label className="block">
          <span className="label block mb-1">Size / variant</span>
          <input
            value={variant}
            onChange={(e) => setVariant(e.target.value)}
            placeholder={model?.category === "sofa" ? "3-seater" : "King"}
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
        primary="Add SKU"
        primaryDisabled={!valid}
        primaryPending={create.isPending}
      />
    </Modal>
  );
}
