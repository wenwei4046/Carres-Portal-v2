import { ShieldCheck, X } from "lucide-react";
import { useState } from "react";
import type { CatalogResponse, GuaranteeTermDto, ProductSkuDto } from "@carres/shared";
import type { DraftLine } from "../new-order/draft";

/**
 * Guarantee → covered-item picker (0261-0263).
 *
 * A guarantee is the ONLY catalog card that cannot be added on its own: Loo's
 * ruling #2 is 1:1, and the whole point of the feature is that ops can track
 * back from a claim to the exact model that was covered. An unattached
 * guarantee is a RM150 liability nobody can trace, so this modal is the gate —
 * pick the item first, then it goes into the cart.
 *
 * Eligibility = the term's `coversCategory` (mattress for v1). If the cart has
 * no eligible line the modal says so instead of offering an empty list.
 */
export default function GuaranteePickerModal({
  term,
  sku,
  lines,
  catalog,
  onCancel,
  onPick,
}: {
  term: GuaranteeTermDto;
  sku: ProductSkuDto;
  /** The current cart lines — the candidates to cover. */
  lines: DraftLine[];
  catalog: CatalogResponse;
  onCancel: () => void;
  /** Called with the covered line's sku + a human label for the cart row. */
  onPick: (coversSku: string, coversLabel: string) => void;
}) {
  const [picked, setPicked] = useState<string | null>(null);

  const skuByCode = new Map(catalog.skus.map((s) => [s.sku, s]));
  const modelById = new Map(catalog.models.map((m) => [m.id, m]));

  /** Cart lines whose model sits in the covered category. A guarantee already
   *  in the cart is never itself coverable. */
  const candidates = lines
    .map((l) => {
      const s = skuByCode.get(l.sku);
      const model = s ? modelById.get(s.modelId) : undefined;
      if (!model || model.category !== term.coversCategory) return null;
      const label = s?.variant?.trim() ? `${model.name} ${s.variant}` : model.name;
      return { line: l, sku: l.sku, label };
    })
    .filter((x): x is { line: DraftLine; sku: string; label: string } => x !== null);

  // Two adds of the same sku are one candidate — the entitlement records the
  // sku, and ops re-points the unit from the Guarantees page if it ever matters.
  const unique = Array.from(new Map(candidates.map((c) => [c.sku, c])).values());

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-base-900/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Choose the item this guarantee covers"
    >
      <div className="w-full max-w-md rounded-lg bg-card shadow-xl border border-base-200">
        <div className="flex items-start gap-3 p-5 border-b border-base-200">
          <ShieldCheck size={20} className="text-primary shrink-0 mt-0.5" strokeWidth={1.75} />
          <div className="flex-1">
            <h2 className="t-h4 text-base-900">{term.label}</h2>
            <p className="t-small text-base-600 mt-0.5">
              {term.coverageYears} years ·{" "}
              {term.remedy === "replace" ? "one-for-one replacement" : "repair"} · RM{" "}
              {sku.price.toFixed(2)}
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Close"
            className="text-base-500 hover:text-base-900"
          >
            <X size={17} strokeWidth={1.75} />
          </button>
        </div>

        <div className="p-5">
          {unique.length === 0 ? (
            <p className="t-body text-base-700">
              Add the {term.coversCategory} to the cart first — a guarantee has to be attached to
              the item it covers, otherwise it cannot be claimed later.
            </p>
          ) : (
            <>
              <p className="t-small text-base-600 mb-3">
                Which item does this guarantee cover? One guarantee covers one item.
              </p>
              <div className="flex flex-col gap-2">
                {unique.map((c) => (
                  <button
                    key={c.sku}
                    type="button"
                    onClick={() => setPicked(c.sku)}
                    aria-pressed={picked === c.sku}
                    className={`flex items-center justify-between gap-3 rounded border px-3 py-2 text-left transition-colors ${
                      picked === c.sku
                        ? "border-primary bg-primary/5"
                        : "border-base-200 hover:border-base-400"
                    }`}
                  >
                    <span className="t-body text-base-900">{c.label}</span>
                    <span className="font-mono text-[11px] text-base-500">{c.sku}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 p-5 pt-0">
          <button type="button" className="btn-secondary" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={!picked}
            onClick={() => {
              const hit = unique.find((c) => c.sku === picked);
              if (hit) onPick(hit.sku, hit.label);
            }}
          >
            Add guarantee
          </button>
        </div>
      </div>
    </div>
  );
}
