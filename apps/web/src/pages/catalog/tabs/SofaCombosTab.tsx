import { useMemo, useState } from "react";
import type { CatalogResponse } from "@carres/shared";
import SofaCombosPanel from "../modular/SofaCombosPanel";

/**
 * Sofa Combos tab (the renamed "Combos" tab). The old "Overall Combo" feature
 * (a fixed-set SKU bundle sold at one price, migration 0177) was removed
 * 2026-07-06 — it was written in error and never used. This tab now hosts ONLY
 * sofa combos.
 *
 * A sofa combo = a matched-shape compartment bundle priced per seat height
 * (migration 0179): pick a sofa model, then author/edit its combos in the panel
 * below. The list is a 2-column card grid. Principal-gated
 * (sofa_combo_pricing_write_principal RLS + the API's 403 are the real
 * boundary); a non-principal gets a friendly read-only view.
 */
export default function SofaCombosTab({
  catalog,
  isPrincipal,
}: {
  catalog: CatalogResponse;
  isPrincipal: boolean;
}) {
  const sofaModels = useMemo(
    () =>
      catalog.models
        .filter((m) => m.category === "sofa")
        .sort((a, b) => a.name.localeCompare(b.name)),
    [catalog.models],
  );
  const offeredCountByModel = useMemo(() => {
    const m = new Map<string, number>();
    for (const o of catalog.modelSofaCompartments ?? []) {
      m.set(o.modelId, (m.get(o.modelId) ?? 0) + 1);
    }
    return m;
  }, [catalog.modelSofaCompartments]);

  // Default to the first sofa model that actually offers compartments (a combo
  // needs offered codes for its slots); fall back to the first sofa model.
  const [modelId, setModelId] = useState<string>(
    () =>
      sofaModels.find((m) => (offeredCountByModel.get(m.id) ?? 0) > 0)?.id ??
      sofaModels[0]?.id ??
      "",
  );
  const model = sofaModels.find((m) => m.id === modelId) ?? null;

  return (
    <section className="max-w-[1600px]" data-testid="sofa-combos-section">
      <div className="flex items-end justify-between gap-4 flex-wrap mb-1">
        <div className="t-h4 font-display">Sofa combos</div>
        {sofaModels.length > 0 && (
          <label className="inline-flex items-center gap-2">
            <span className="label">Model</span>
            <select
              value={modelId}
              onChange={(e) => setModelId(e.target.value)}
              className="px-3 py-1.5 border border-base-300 rounded-[4px] text-[13px] bg-white outline-none focus:border-base-500"
              aria-label="Sofa model"
              data-testid="sofa-combos-model"
            >
              {sofaModels.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                  {(offeredCountByModel.get(m.id) ?? 0) > 0
                    ? ` (${offeredCountByModel.get(m.id)} compartments)`
                    : ""}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <p className="t-tiny text-base-500 mb-4">
        Matched-shape compartment bundles priced per seat height. When a build matches a
        combo&apos;s slots, the combo price for the chosen height wins over à-la-carte. Offer
        compartments to the model in Modular first. Pricing is principal-only.
        {!isPrincipal && " Read-only for your role."}
      </p>

      {sofaModels.length === 0 ? (
        <div className="t-small text-base-500 border border-base-200 rounded-[6px] px-3 py-6 text-center">
          No sofa models yet. Add a sofa model in Modular first.
        </div>
      ) : model ? (
        <SofaCombosPanel
          key={model.id}
          modelId={model.id}
          pool={catalog.sofaCompartments ?? []}
          offered={(catalog.modelSofaCompartments ?? []).filter((o) => o.modelId === model.id)}
          combos={catalog.sofaCombos ?? []}
          optionPools={catalog.optionPools}
          isPrincipal={isPrincipal}
        />
      ) : null}
    </section>
  );
}
