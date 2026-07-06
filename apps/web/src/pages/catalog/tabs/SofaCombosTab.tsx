import { useMemo, useState } from "react";
import type { CatalogResponse } from "@carres/shared";
import SofaCombosPanel from "../modular/SofaCombosPanel";

/**
 * Sofa Combos tab (the renamed "Combos" tab). Hosts ONLY sofa combos
 * (migration 0179) — the old fixed-set "Overall Combo" (0177) was removed
 * 2026-07-06.
 *
 * Layout (Loo 2026-07-07, matching the 2990s reference): combos are GROUPED BY
 * base model — a "Model (N combos)" heading per model, then that model's combo
 * cards. The Model dropdown filters to one model or shows "All base models".
 * Each card shows the full seat-height price grid + PWP + effective date + Edit
 * / History; delete is the trash icon. Only PRICING combos appear here — Quick
 * Pick presets (is_quick_pick) live in the POS Quick pick tab, not this pricing
 * view. Principal-gated (RLS + API 403 are the real boundary).
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
  const combos = catalog.sofaCombos ?? [];

  // Pricing-combo count per model (Quick Pick presets excluded — they belong to
  // the POS Quick pick tab). Drives the dropdown counts + which models to show.
  const pricingCountByModel = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of combos) {
      if (c.isQuickPick) continue;
      m.set(c.modelId, (m.get(c.modelId) ?? 0) + 1);
    }
    return m;
  }, [combos]);

  // "" = All base models; else a specific model id.
  const [selected, setSelected] = useState<string>("");

  // When "All": every sofa model that HAS ≥1 pricing combo (matches the
  // reference — only models with combos are listed). When a specific model is
  // picked: just that one (even with 0 combos, so you can create the first).
  const modelsToShow = useMemo(() => {
    if (selected) return sofaModels.filter((m) => m.id === selected);
    return sofaModels.filter((m) => (pricingCountByModel.get(m.id) ?? 0) > 0);
  }, [selected, sofaModels, pricingCountByModel]);

  return (
    <section className="max-w-[1600px]" data-testid="sofa-combos-section">
      <div className="flex items-end justify-between gap-4 flex-wrap mb-1">
        <div className="t-h4 font-display">Sofa combos</div>
        {sofaModels.length > 0 && (
          <label className="inline-flex items-center gap-2">
            <span className="label">Model</span>
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              className="px-3 py-1.5 border border-base-300 rounded-[4px] text-[13px] bg-white outline-none focus:border-base-500"
              aria-label="Sofa model"
              data-testid="sofa-combos-model"
            >
              <option value="">All base models</option>
              {sofaModels.map((m) => {
                const n = pricingCountByModel.get(m.id) ?? 0;
                return (
                  <option key={m.id} value={m.id}>
                    {m.name}
                    {n > 0 ? ` (${n})` : ""}
                  </option>
                );
              })}
            </select>
          </label>
        )}
      </div>
      <p className="t-tiny text-base-500 mb-6">
        Matched-shape compartment bundles priced per seat height, grouped by base model. When a
        build matches a combo&apos;s slots, the combo price for the chosen height wins over
        à-la-carte. Offer compartments to the model in Modular first. Pricing is principal-only.
        {!isPrincipal && " Read-only for your role."}
      </p>

      {sofaModels.length === 0 ? (
        <div className="t-small text-base-500 border border-base-200 rounded-[6px] px-3 py-6 text-center">
          No sofa models yet. Add a sofa model in Modular first.
        </div>
      ) : modelsToShow.length === 0 ? (
        <div className="t-small text-base-500 border border-base-200 rounded-[6px] px-3 py-6 text-center">
          No sofa combos yet. Pick a model from the dropdown above to create one.
        </div>
      ) : (
        modelsToShow.map((m) => (
          <SofaCombosPanel
            key={m.id}
            modelId={m.id}
            modelName={m.name}
            pool={catalog.sofaCompartments ?? []}
            offered={(catalog.modelSofaCompartments ?? []).filter((o) => o.modelId === m.id)}
            combos={combos}
            optionPools={catalog.optionPools}
            isPrincipal={isPrincipal}
          />
        ))
      )}
    </section>
  );
}
