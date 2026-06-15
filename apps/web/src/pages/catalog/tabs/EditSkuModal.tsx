import { useState } from "react";
import { toast } from "sonner";
import type { ProductModelDto, ProductSkuDto } from "@carres/shared";
import { ApiError } from "@/lib/api";
import { usePatchCatalogModel, usePatchCatalogSku } from "@/lib/queries";
import { INPUT_CLS, Modal, ModalActions } from "@/pages/operation/components/Modal";
import { CodeChip } from "../components/atoms";

/**
 * Edit SKU — per-row editor. Editable: Product name (the model name, shared by
 * every SKU of that model), Description, Retail price, COGS / cost. Product code
 * is READ-ONLY by design (Loo 2026-06-15): the code is a join key for orders /
 * POs / stock, so letting it change would orphan those references. Size is shown
 * read-only for context (it drives the code; change it via the Modular tab).
 *
 * Name patches the model (PATCH /models); description + price + cost patch the
 * SKU (PATCH /skus). Cost is nullable — an empty field clears it back to "not
 * set". Only changed fields are sent.
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
  // Cost is nullable — start blank when unset so an empty field round-trips to null.
  const [cost, setCost] = useState(sku.cost == null ? "" : String(sku.cost));

  const priceNum = Number(price);
  const priceOk = price.trim() !== "" && Number.isFinite(priceNum) && priceNum >= 0;
  const costTrim = cost.trim();
  const costNum = costTrim === "" ? null : Number(costTrim);
  const costOk = costNum === null || (Number.isFinite(costNum) && costNum >= 0);
  const nameOk = !model || name.trim().length >= 2;
  const valid = priceOk && costOk && nameOk;
  const pending = patchSku.isPending || patchModel.isPending;

  async function save() {
    if (!valid) return;
    try {
      // SKU-level: description + price + cost (only if changed).
      const skuPatch: { description?: string | null; price?: number; cost?: number | null } = {};
      const nextDesc = description.trim() || null;
      if (nextDesc !== (sku.description ?? null)) skuPatch.description = nextDesc;
      if (priceNum !== sku.price) skuPatch.price = priceNum;
      if (costNum !== (sku.cost ?? null)) skuPatch.cost = costNum;
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

        <div>
          <span className="label block mb-1">Size</span>
          <input value={sku.variant} disabled className={`${INPUT_CLS} disabled:opacity-60`} />
          <div className="t-tiny text-base-400 mt-1">Change via Modular.</div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="label block mb-1">Retail price (RM)</span>
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
          <label className="block">
            <span className="label block mb-1">COGS / cost (RM)</span>
            <input
              type="number"
              min={0}
              step="0.01"
              value={cost}
              onChange={(e) => setCost(e.target.value)}
              placeholder="not set"
              data-testid="edit-sku-cost"
              className={`${INPUT_CLS} text-right font-mono`}
            />
            <div className="t-tiny text-base-400 mt-1">Cost of goods sold; fills Create-PO lines.</div>
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
