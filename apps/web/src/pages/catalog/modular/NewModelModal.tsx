import { useMemo, useState } from "react";
import { toast } from "sonner";
import type { ProductCategory } from "@carres/shared";
import { PRODUCT_CATEGORIES, deriveModelKey } from "@carres/shared";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useCreateCatalogModel, useGenerateSkus } from "@/lib/queries";
import { INPUT_CLS, Modal, ModalActions } from "@/pages/operation/components/Modal";
import { CATEGORY_LABEL } from "../components/atoms";

/**
 * + New Model (Modular tab, 2990s Products parity Phase 2) — create a whole
 * product model and (optionally) its full size range in one go. The existing
 * "+ New SKU → New product" path forces a first priced SKU; this one lets you
 * stand up a model + N size SKUs at once (or a bare model to flesh out in the
 * drawer), matching the 2990s "New Model" flow.
 *
 * Reuses the existing endpoints — POST /models then POST /models/:id/generate-skus
 * — so there's no new contract. Sizes seed allowed_options.sizes (Modular's pool)
 * and materialize one SKU each ({MODEL_KEY}-{size}). Default price is principal-
 * only (0175); a non-principal generates the SKUs UNPRICED for the principal.
 */
export default function NewModelModal({ onClose }: { onClose: () => void }) {
  const isPrincipal = useAuth((s) => s.role) === "principal";
  const createModel = useCreateCatalogModel();
  const generateSkus = useGenerateSkus();

  const [category, setCategory] = useState<ProductCategory>("mattress");
  const [name, setName] = useState("");
  const [sizesRaw, setSizesRaw] = useState("");
  const [price, setPrice] = useState("");
  // If the model was created but generate-skus then failed (e.g. no supplier
  // covers the category yet), remember its id so a retry only re-runs the SKU
  // generation instead of re-inserting the model (which would 23505 on the
  // unique (category, model_key) constraint).
  const [createdModelId, setCreatedModelId] = useState<string | null>(null);

  const modelKey = deriveModelKey(name);
  const sizes = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const s of sizesRaw.split(",")) {
      const t = s.trim();
      if (t && !seen.has(t.toLowerCase())) {
        seen.add(t.toLowerCase());
        out.push(t);
      }
    }
    return out;
  }, [sizesRaw]);

  const priceNum = price.trim() === "" ? 0 : Number(price);
  const priceOk = Number.isFinite(priceNum) && priceNum >= 0;
  // Mirror the server caps (generateSkusInput: ≤100 variants, ≤60 chars each)
  // so a too-big paste is caught BEFORE the model is created.
  const sizesOk = sizes.length <= 100 && sizes.every((s) => s.length <= 60);
  const valid = name.trim().length >= 2 && modelKey.length >= 2 && (!isPrincipal || priceOk) && sizesOk;
  const pending = createModel.isPending || generateSkus.isPending;

  async function submit() {
    if (!valid) return;
    try {
      let modelId = createdModelId;
      if (!modelId) {
        const res = await createModel.mutateAsync({
          category,
          modelKey,
          name: name.trim(),
          allowedOptions: sizes.length > 0 ? { sizes } : undefined,
        });
        modelId = res.model.id;
        setCreatedModelId(modelId); // lock identity; a retry only re-generates
      }
      let generated = 0;
      if (sizes.length > 0) {
        const r = await generateSkus.mutateAsync({
          modelId,
          // Non-principal generates UNPRICED (price omitted → server defaults 0).
          input: { variants: sizes, price: isPrincipal && priceNum > 0 ? priceNum : undefined },
        });
        generated = r.generated;
      }
      toast.success(
        sizes.length > 0
          ? `Created ${name.trim()} + ${generated} SKU${generated === 1 ? "" : "s"}`
          : `Created ${name.trim()}`,
      );
      onClose();
    } catch (e) {
      // The model may already be created (createdModelId set) even though
      // generate-skus failed — e.g. no supplier covers this category yet.
      // Surface the reason; a retry skips the create and re-runs generation.
      toast.error(e instanceof ApiError ? e.message : "Create failed");
    }
  }

  return (
    <Modal title="New Model" onClose={onClose}>
      <div className="flex flex-col gap-3">
        {createdModelId && (
          <div
            className="rounded-[4px] border border-amber-300 bg-amber-50 px-3 py-2"
            data-testid="new-model-created-notice"
          >
            <div className="t-small font-semibold text-amber-800">Model created</div>
            <div className="t-tiny text-amber-700 mt-0.5">
              The model exists — fix the issue above and click again to retry SKU generation only.
            </div>
          </div>
        )}
        <label className="block">
          <span className="label block mb-1">Category</span>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as ProductCategory)}
            disabled={createdModelId !== null}
            data-testid="new-model-category"
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
            data-testid="new-model-name"
            className={`${INPUT_CLS} disabled:opacity-50`}
          />
          {modelKey && (
            <div className="t-tiny text-base-500 font-mono mt-1">
              Internal id: <span className="text-base-700">{modelKey}</span>
            </div>
          )}
        </label>

        <label className="block">
          <span className="label block mb-1">Sizes / variants (optional, comma-separated)</span>
          <input
            value={sizesRaw}
            onChange={(e) => setSizesRaw(e.target.value)}
            placeholder="K, Q, S"
            data-testid="new-model-sizes"
            className={INPUT_CLS}
          />
          <div className="t-tiny text-base-500 mt-1">
            {sizes.length > 0 ? (
              <>
                Generates <span className="text-base-700 font-medium">{sizes.length}</span> SKU
                {sizes.length === 1 ? "" : "s"}:{" "}
                {sizes.slice(0, 8).map((s) => `${modelKey.toUpperCase()}-${s}`).join(", ")}
                {sizes.length > 8 ? ` … (+${sizes.length - 8})` : ""}
              </>
            ) : (
              "Leave blank to create the model only — add SKUs later in the drawer."
            )}
          </div>
          {!sizesOk && (
            <div className="t-tiny text-red-600 mt-1" data-testid="new-model-sizes-error">
              Max 100 sizes, each ≤ 60 chars. Trim the list before creating.
            </div>
          )}
        </label>

        {isPrincipal ? (
          <label className="block">
            <span className="label block mb-1">Default price for generated SKUs (RM, optional)</span>
            <input
              type="number"
              min={0}
              step="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="0.00"
              data-testid="new-model-price"
              className={INPUT_CLS}
            />
          </label>
        ) : (
          <div
            className="rounded-[4px] border border-base-200 bg-base-50 px-3 py-2"
            data-testid="new-model-price-lock-hint"
          >
            <div className="t-small text-base-600">Price</div>
            <div className="t-tiny text-base-400 mt-0.5">
              Generated SKUs are created unpriced — the principal (Master Admin) prices them.
            </div>
          </div>
        )}
      </div>

      <ModalActions
        onCancel={onClose}
        onPrimary={submit}
        primary={sizes.length > 0 ? `Create model + ${sizes.length} SKU${sizes.length === 1 ? "" : "s"}` : "Create model"}
        primaryDisabled={!valid}
        primaryPending={pending}
      />
    </Modal>
  );
}
