import { useState } from "react";
import { toast } from "sonner";
import type { ProductModelDto, ProductSkuDto } from "@carres/shared";
import { ApiError } from "@/lib/api";
import { usePatchCatalogModel, usePatchCatalogSku } from "@/lib/queries";
import { INPUT_CLS, Modal, ModalActions } from "@/pages/operation/components/Modal";
import { CodeChip } from "../components/atoms";

/**
 * Edit SKU — per-row editor. Editable: Product name (the model name, shared by
 * every SKU of that model), Description, Price. Product code is READ-ONLY by
 * design (Loo 2026-06-15): the code is a join key for orders / POs / stock, so
 * letting it change would orphan those references. Size is shown read-only for
 * context (it drives the code; change it via the Modular tab).
 *
 * Name patches the model (PATCH /models); description + price patch the SKU
 * (PATCH /skus). Only changed fields are sent.
 */
export default function EditSkuModal({
  sku,
  model,
  onClose,
}: {
  sku: ProductSkuDto;
  model: ProductModelDto | undefined;
  onClose: () => void;
}) {
  const patchSku = usePatchCatalogSku();
  const patchModel = usePatchCatalogModel();

  const [name, setName] = useState(model?.name ?? "");
  const [description, setDescription] = useState(sku.description ?? "");
  const [price, setPrice] = useState(String(sku.price));

  const priceNum = Number(price);
  const priceOk = price.trim() !== "" && Number.isFinite(priceNum) && priceNum >= 0;
  const nameOk = !model || name.trim().length >= 2;
  const valid = priceOk && nameOk;
  const pending = patchSku.isPending || patchModel.isPending;

  async function save() {
    if (!valid) return;
    try {
      // SKU-level: description + price (only if changed).
      const skuPatch: { description?: string | null; price?: number } = {};
      const nextDesc = description.trim() || null;
      if (nextDesc !== (sku.description ?? null)) skuPatch.description = nextDesc;
      if (priceNum !== sku.price) skuPatch.price = priceNum;
      if (Object.keys(skuPatch).length > 0) {
        await patchSku.mutateAsync({ id: sku.id, patch: skuPatch });
      }
      // Model-level: name (shared across this model's SKUs).
      if (model && name.trim() !== model.name) {
        await patchModel.mutateAsync({ id: model.id, patch: { name: name.trim() } });
      }
      toast.success(`${sku.sku} updated`);
      onClose();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Update failed");
    }
  }

  return (
    <Modal title="Edit SKU" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <div>
          <span className="label block mb-1">Product code</span>
          <div className="flex items-center gap-2">
            <CodeChip>{sku.sku}</CodeChip>
            <span className="t-tiny text-base-400">locked — used by orders &amp; POs</span>
          </div>
        </div>

        <label className="block">
          <span className="label block mb-1">Product name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={!model}
            data-testid="edit-sku-name"
            className={`${INPUT_CLS} disabled:opacity-60`}
          />
          {model && (
            <div className="t-tiny text-base-400 mt-1">
              Shared by all {model.name} SKUs.
            </div>
          )}
        </label>

        <label className="block">
          <span className="label block mb-1">Description</span>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Shown on the SKU list + dealer picker"
            data-testid="edit-sku-description"
            className={INPUT_CLS}
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <span className="label block mb-1">Size</span>
            <input value={sku.variant} disabled className={`${INPUT_CLS} disabled:opacity-60`} />
            <div className="t-tiny text-base-400 mt-1">Change via Modular.</div>
          </div>
          <label className="block">
            <span className="label block mb-1">Price (RM)</span>
            <input
              type="number"
              min={0}
              step="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              data-testid="edit-sku-price"
              className={`${INPUT_CLS} text-right font-mono`}
            />
          </label>
        </div>
      </div>

      <ModalActions
        onCancel={onClose}
        onPrimary={save}
        primary="Save"
        primaryDisabled={!valid}
        primaryPending={pending}
      />
    </Modal>
  );
}
