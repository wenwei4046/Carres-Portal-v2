import { useMemo, useState } from "react";
import type { CatalogResponse, ProductModelDto, SofaComboDto } from "@carres/shared";
import { activeSofaSizes } from "@carres/shared";
import { fmtRm, slotsSummary } from "../format";

/* OPERATION — SOFA COMBO COST
 *
 * The costing door onto sofa combos. The admin Sofa combos tab (principal)
 * owns the SELLING price and every edit; this one answers a single question
 * Operation asks all day and could not answer here before: what does this
 * combo cost us at each seat height?
 *
 * Read-only by construction. `/principal?tab=catalog` is where a combo is
 * created, priced or retired, so this is a door and not a duplicate
 * (Ownership Law C) and a summary that may never gain a form (Law B).
 *
 * MEASURED 2026-09-01: cost lives on the combo as `costByHeight` and nowhere
 * else. A compartment carries `defaultPrice` — a SELLING price — and no cost
 * column exists on `sofa_compartments` in any migration. So the parts identify
 * the combo; they do not carry money, and this grid does not pretend they do.
 */

/** Quick Pick presets are POS shortcuts, not priced combos — the admin tab
 *  excludes them from its pricing count and this grid excludes them too. */
function isPricingCombo(c: SofaComboDto): boolean {
  return !c.isQuickPick;
}

export default function OperationComboCostTab({ catalog }: { catalog: CatalogResponse }) {
  const combos = useMemo(
    () => (catalog.sofaCombos ?? []).filter(isPricingCombo),
    [catalog.sofaCombos],
  );

  /* 0389 — the same seat-height axis the SKU cost grid and the admin combo
     panel price on. One axis, so the two grids stay comparable. */
  const heights = useMemo(() => activeSofaSizes(catalog.optionPools), [catalog.optionPools]);

  const modelById = useMemo(() => {
    const m = new Map<string, ProductModelDto>();
    for (const model of catalog.models) m.set(model.id, model);
    return m;
  }, [catalog.models]);

  // "" = every model that has at least one combo.
  const [modelFilter, setModelFilter] = useState<string>("");
  const [search, setSearch] = useState("");

  const modelsWithCombos = useMemo(() => {
    const ids = new Set(combos.map((c) => c.modelId));
    return catalog.models
      .filter((m) => ids.has(m.id))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [combos, catalog.models]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return combos
      .filter((c) => (modelFilter ? c.modelId === modelFilter : true))
      .map((c) => ({
        combo: c,
        modelName: modelById.get(c.modelId)?.name ?? "—",
        parts: slotsSummary(c.slots),
      }))
      .filter((r) =>
        q
          ? `${r.modelName} ${r.combo.label ?? ""} ${r.parts}`.toLowerCase().includes(q)
          : true,
      )
      .sort(
        (a, b) =>
          a.modelName.localeCompare(b.modelName) || a.parts.localeCompare(b.parts),
      );
  }, [combos, modelFilter, search, modelById]);

  const gridCols = `minmax(130px,1fr) minmax(120px,1fr) minmax(170px,1.4fr) 90px ${heights
    .map(() => "110px")
    .join(" ")}`;

  return (
    <section className="max-w-[1600px]" data-testid="opcombo-section">
      <div className="text-strong font-display mb-1">Sofa combo cost</div>
      <p className="text-meta text-base-500 mb-3">
        What each sofa combo costs us, by seat height. Selling price and every edit stay in
        Catalog.
      </p>

      <div className="flex items-end gap-3 flex-wrap mb-3">
        <label className="inline-flex items-center gap-2">
          <span className="label">Model</span>
          <select
            value={modelFilter}
            onChange={(e) => setModelFilter(e.target.value)}
            aria-label="Sofa model"
            data-testid="opcombo-model-filter"
            className="border border-base-200 rounded-[4px] px-2 py-1 text-meta bg-white"
          >
            <option value="">All models</option>
            {modelsWithCombos.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search model, label or parts"
          aria-label="Search combos"
          data-testid="opcombo-search"
          className="border border-base-200 rounded-[4px] px-2 py-1 text-meta bg-white min-w-[220px]"
        />
        <span className="text-meta text-base-500" data-testid="opcombo-count">
          {rows.length} combo{rows.length === 1 ? "" : "s"}
        </span>
      </div>

      <div className="bg-white border border-base-200 rounded-[4px] overflow-x-auto">
        <div
          className="grid items-center gap-3 px-3 py-2 bg-base-50 border-b border-base-200"
          style={{ gridTemplateColumns: gridCols }}
        >
          <div className="label">Model</div>
          <div className="label">Combo</div>
          <div className="label">Parts</div>
          <div className="label">Tier</div>
          {heights.map((h) => (
            <div key={h} className="label text-right">
              {h}
            </div>
          ))}
        </div>

        {rows.length === 0 ? (
          <div className="px-3 py-6 text-meta text-base-500" data-testid="opcombo-empty">
            No sofa combos to show.
          </div>
        ) : (
          rows.map(({ combo, modelName, parts }) => (
            <div
              key={combo.id}
              className="grid items-center gap-3 px-3 py-2 border-b border-base-100 last:border-b-0"
              style={{ gridTemplateColumns: gridCols, opacity: combo.active ? 1 : 0.5 }}
              data-testid={`opcombo-row-${combo.id}`}
            >
              <div className="text-meta text-base-800">{modelName}</div>
              <div className="text-meta text-base-800">{combo.label ?? "—"}</div>
              <div className="text-meta font-mono text-base-600" title={parts}>
                {parts}
              </div>
              <div className="text-meta text-base-600">
                {combo.tier ? combo.tier.replace("PRICE_", "P") : "Any"}
              </div>
              {heights.map((h) => {
                const cost = combo.costByHeight?.[h] ?? null;
                return (
                  <div
                    key={h}
                    className="text-right"
                    data-testid={`opcombo-cost-${combo.id}-${h}`}
                  >
                    {cost == null ? (
                      <span className="text-meta text-base-400 italic">not set</span>
                    ) : (
                      <span className="t-num text-meta text-base-800">{fmtRm(cost)}</span>
                    )}
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>
    </section>
  );
}
