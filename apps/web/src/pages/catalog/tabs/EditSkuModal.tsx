import { useState } from "react";
import { toast } from "sonner";
import type { ProductModelDto, ProductSkuDto } from "@carres/shared";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { usePatchCatalogModel, usePatchCatalogSku } from "@/lib/queries";
import { INPUT_CLS, Modal, ModalActions } from "@/pages/operation/components/Modal";
import { CodeChip } from "../components/atoms";
import { skuMargin } from "../margin";

/**
 * Edit SKU — per-row editor. Editable: Product name (the model name, shared by
 * every SKU of that model), Description, Price, Cost (nullable). Product code is
 * READ-ONLY by design (Loo 2026-06-15): the code is a join key for orders / POs
 * / stock, so letting it change would orphan those references. Size is shown
 * read-only for context (it drives the code; change it via the Modular tab).
 *
 * Name patches the model (PATCH /models); description + price + cost patch the
 * SKU (PATCH /skus). Only changed fields are sent. Blank cost input → null.
 * Margin (plan margin / base margin for sofa) is shown live and read-only.
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
  // Phase 2 (0175): price + cost are principal-only ("Master Admin"). For
  // non-principal users the price/cost fields render read-only and are never
  // included in the SKU patch; name + description stay editable.
  const isPrincipal = useAuth((s) => s.role) === "principal";
  const patchSku = usePatchCatalogSku();
  const patchModel = usePatchCatalogModel();

  const [name, setName] = useState(model?.name ?? "");
  const [description, setDescription] = useState(sku.description ?? "");
  const [price, setPrice] = useState(String(sku.price));
  // cost: blank string = null ("not set"); a numeric string = the cost value
  const [cost, setCost] = useState(sku.cost !== null ? String(sku.cost) : "");
  // 0186 — PWP reward price: blank = null ("not set"), same shape as cost.
  const [pwpPrice, setPwpPrice] = useState(
    sku.pwpPrice !== null && sku.pwpPrice !== undefined ? String(sku.pwpPrice) : "",
  );

  const priceNum = Number(price);
  const priceOk = price.trim() !== "" && Number.isFinite(priceNum) && priceNum >= 0;

  // Derive costNum/costOk — blank is valid (→ null); a non-negative number is valid
  const costTrimmed = cost.trim();
  const costNum: number | null = costTrimmed === "" ? null : Number(costTrimmed);
  const costOk =
    costTrimmed === "" ||
    (Number.isFinite(costNum as number) && (costNum as number) >= 0);

  // pwpPrice — same blank=null / non-negative rule as cost.
  const pwpTrimmed = pwpPrice.trim();
  const pwpNum: number | null = pwpTrimmed === "" ? null : Number(pwpTrimmed);
  const pwpOk =
    pwpTrimmed === "" || (Number.isFinite(pwpNum as number) && (pwpNum as number) >= 0);

  const nameOk = !model || name.trim().length >= 2;
  // Non-principal can't edit price/cost/pwpPrice, so their validity doesn't gate Save.
  const valid = nameOk && (!isPrincipal || (priceOk && costOk && pwpOk));
  const pending = patchSku.isPending || patchModel.isPending;

  // Live margin: use the current input values for instant feedback
  const liveMargin = skuMargin(priceOk ? priceNum : sku.price, costOk ? costNum : sku.cost);
  const marginLabel = model?.category === "sofa" ? "base margin" : "plan margin";

  async function save() {
    if (!valid) return;
    try {
      // SKU-level: description + (principal-only) price + cost + pwpPrice (only
      // if changed).
      const skuPatch: {
        description?: string | null;
        price?: number;
        cost?: number | null;
        pwpPrice?: number | null;
      } = {};
      const nextDesc = description.trim() || null;
      if (nextDesc !== (sku.description ?? null)) skuPatch.description = nextDesc;
      // 0175 / 0186 — only the principal can change price/cost/pwpPrice. Skip
      // these for everyone else so the API gate / DB trigger is never tripped on
      // a benign edit.
      if (isPrincipal) {
        if (priceNum !== sku.price) skuPatch.price = priceNum;
        if (costNum !== sku.cost) skuPatch.cost = costNum;
        if (pwpNum !== (sku.pwpPrice ?? null)) skuPatch.pwpPrice = pwpNum;
      }
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
          {isPrincipal ? (
            <label className="block">
              <span className="label block mb-1">Price (RM)</span>
              <input
                type="number"
                min={0}
                step="0.01"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                data-testid="edit-sku-price"
                className={`${INPUT_CLS} text-right t-num`}
              />
            </label>
          ) : (
            <div>
              <span className="label block mb-1">Price (RM)</span>
              <div
                className="t-small t-num text-right text-base-700 mt-2"
                data-testid="edit-sku-price-readonly"
              >
                {sku.price === 0 ? (
                  <span className="text-base-400 italic">not set</span>
                ) : (
                  sku.price.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                )}
              </div>
              <div className="t-tiny text-base-400 mt-1">Master Admin only.</div>
            </div>
          )}
        </div>

        {/* Cost + live margin */}
        <div className="grid grid-cols-2 gap-3">
          {isPrincipal ? (
            <label className="block">
              <span className="label block mb-1">Cost (RM)</span>
              <input
                type="number"
                min={0}
                step="0.01"
                value={cost}
                onChange={(e) => setCost(e.target.value)}
                placeholder="not set"
                data-testid="edit-sku-cost"
                className={`${INPUT_CLS} text-right t-num`}
              />
              <div className="t-tiny text-base-400 mt-1">Blank = not set (null).</div>
            </label>
          ) : (
            <div>
              <span className="label block mb-1">Cost (RM)</span>
              <div
                className="t-small t-num text-right text-base-700 mt-2"
                data-testid="edit-sku-cost-readonly"
              >
                {sku.cost === null ? (
                  <span className="text-base-400 italic">not set</span>
                ) : (
                  sku.cost.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                )}
              </div>
              <div className="t-tiny text-base-400 mt-1">Master Admin only.</div>
            </div>
          )}
          <div>
            <span className="label block mb-1">{marginLabel}</span>
            {liveMargin === null ? (
              <div className="t-small text-base-400 italic mt-2">— set cost to compute</div>
            ) : (
              <div
                className={`t-num text-[13px] mt-2 ${liveMargin.amount < 0 ? "text-[#C44D2B]" : "text-base-700"}`}
                data-testid="edit-sku-margin"
              >
                RM {liveMargin.amount.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                <span className="text-base-400 text-[11px] ml-1">
                  ({(liveMargin.pct * 100).toFixed(1)}%)
                </span>
              </div>
            )}
          </div>
        </div>

        {/* PWP price (0186) — the discounted price this SKU sells at as a PWP
            reward. Principal-only, same gate as price/cost. */}
        <div className="grid grid-cols-2 gap-3">
          {isPrincipal ? (
            <label className="block">
              <span className="label block mb-1">PWP price (RM)</span>
              <input
                type="number"
                min={0}
                step="0.01"
                value={pwpPrice}
                onChange={(e) => setPwpPrice(e.target.value)}
                placeholder="not set"
                data-testid="edit-sku-pwp-price"
                className={`${INPUT_CLS} text-right t-num`}
              />
              <div className="t-tiny text-base-400 mt-1">
                Reward price for PWP rules. Blank = not set (null).
              </div>
            </label>
          ) : (
            <div>
              <span className="label block mb-1">PWP price (RM)</span>
              <div
                className="t-small t-num text-right text-base-700 mt-2"
                data-testid="edit-sku-pwp-price-readonly"
              >
                {sku.pwpPrice === null || sku.pwpPrice === undefined ? (
                  <span className="text-base-400 italic">not set</span>
                ) : (
                  sku.pwpPrice.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                )}
              </div>
              <div className="t-tiny text-base-400 mt-1">Master Admin only.</div>
            </div>
          )}
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
