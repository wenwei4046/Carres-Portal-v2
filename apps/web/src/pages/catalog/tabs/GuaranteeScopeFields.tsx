import { useMemo } from "react";
import type {
  CatalogOptionPoolDto,
  ProductCategory,
  ProductModelDto,
  SofaComboDto,
  SofaCompartmentDto,
} from "@carres/shared";
import { INPUT_CLS } from "@/pages/operation/components/Modal";
import { CATEGORY_LABEL } from "../components/atoms";

/**
 * What a guarantee covers — the scope half of the + New SKU form when the
 * category is Guarantee (Loo 2026-07-26).
 *
 *   Mattress / Bed frame → a MODEL (or any in the category) + VARIANTS (or any)
 *   Sofa                 → any model · a model · a COMBO · a COMPARTMENT
 *   Accessory            → a model (or any). No variant axis — Loo was explicit.
 *
 * "Any" is the default at every level, so the quick case (cover every mattress)
 * stays two clicks, and narrowing is opt-in.
 *
 * Extracted from NewSkuModal because that file already carries three creation
 * flows; a fourth inline would make it unreadable.
 */

/** Only these can be covered — a guarantee can't cover a service or another
 *  guarantee, and offering them would author a term that can never match. */
export const COVERABLE_CATEGORIES: ProductCategory[] = [
  "mattress",
  "bedframe",
  "sofa",
  "accessory",
];

export type SofaScopeKind = "any" | "model" | "combo" | "compartment";

export interface GuaranteeScopeValue {
  coversCategory: ProductCategory;
  coversModelId: string | null;
  coversVariants: string[];
  coversComboId: string | null;
  coversCompartmentId: string | null;
  sofaKind: SofaScopeKind;
}

export const EMPTY_GUARANTEE_SCOPE: GuaranteeScopeValue = {
  coversCategory: "mattress",
  coversModelId: null,
  coversVariants: [],
  coversComboId: null,
  coversCompartmentId: null,
  sofaKind: "any",
};

export default function GuaranteeScopeFields({
  value,
  onChange,
  models,
  optionPools,
  sofaCompartments,
  sofaCombos,
}: {
  value: GuaranteeScopeValue;
  onChange: (next: GuaranteeScopeValue) => void;
  models: ProductModelDto[];
  optionPools: CatalogOptionPoolDto[];
  sofaCompartments: SofaCompartmentDto[];
  sofaCombos: SofaComboDto[];
}) {
  const cat = value.coversCategory;

  const catModels = useMemo(
    () =>
      models
        .filter((m) => m.category === cat && !m.discontinuedAt)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [models, cat],
  );

  // The size pool for the covered category — the SAME pool the product's own
  // SKUs are generated from, so a guarantee can never be scoped to a size the
  // catalog doesn't sell.
  const sizePool = useMemo(() => {
    const pool =
      cat === "mattress" ? "mattress_size" : cat === "bedframe" ? "bedframe_size" : null;
    if (!pool) return [] as CatalogOptionPoolDto[];
    return optionPools
      .filter((p) => p.pool === pool && p.active)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.value.localeCompare(b.value));
  }, [optionPools, cat]);

  const compartments = useMemo(
    () =>
      sofaCompartments
        .filter((c) => c.active)
        .sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code)),
    [sofaCompartments],
  );

  const combos = useMemo(
    () =>
      sofaCombos
        .filter((c) => c.active)
        .sort((a, b) => (a.label ?? "").localeCompare(b.label ?? "")),
    [sofaCombos],
  );

  const modelName = (id: string | null) => models.find((m) => m.id === id)?.name ?? null;

  function set(patch: Partial<GuaranteeScopeValue>) {
    onChange({ ...value, ...patch });
  }

  /** Switching the covered category invalidates every narrowing under it. */
  function pickCategory(next: ProductCategory) {
    onChange({ ...EMPTY_GUARANTEE_SCOPE, coversCategory: next });
  }

  function toggleVariant(v: string) {
    const has = value.coversVariants.includes(v);
    set({
      coversVariants: has
        ? value.coversVariants.filter((x) => x !== v)
        : [...value.coversVariants, v],
    });
  }

  const hasVariantAxis = cat === "mattress" || cat === "bedframe";

  return (
    <div className="flex flex-col gap-3">
      <label className="block">
        <span className="label">Covers which category</span>
        <select
          value={cat}
          onChange={(e) => pickCategory(e.target.value as ProductCategory)}
          className={INPUT_CLS}
          aria-label="Covered category"
        >
          {COVERABLE_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABEL[c]}
            </option>
          ))}
        </select>
      </label>

      {/* SOFA — combo / compartment / model / any (Loo: sofa is scoped by the
          shape or the piece, not by a size). */}
      {cat === "sofa" ? (
        <>
          <label className="block">
            <span className="label">Covers</span>
            <select
              value={value.sofaKind}
              onChange={(e) =>
                onChange({
                  ...EMPTY_GUARANTEE_SCOPE,
                  coversCategory: "sofa",
                  sofaKind: e.target.value as SofaScopeKind,
                })
              }
              className={INPUT_CLS}
              aria-label="Sofa scope"
            >
              <option value="any">Any sofa model</option>
              <option value="model">One sofa model</option>
              <option value="combo">One combo</option>
              <option value="compartment">One compartment</option>
            </select>
          </label>

          {value.sofaKind === "model" && (
            <ModelPicker
              models={catModels}
              value={value.coversModelId}
              onPick={(id) => set({ coversModelId: id })}
              anyLabel="Pick a sofa model…"
              required
            />
          )}

          {value.sofaKind === "combo" && (
            <label className="block">
              <span className="label">Combo</span>
              <select
                value={value.coversComboId ?? ""}
                onChange={(e) => set({ coversComboId: e.target.value || null })}
                className={INPUT_CLS}
                aria-label="Covered combo"
              >
                <option value="">Pick a combo…</option>
                {combos.map((cb) => (
                  <option key={cb.id} value={cb.id}>
                    {cb.label ?? "Combo"} · {modelName(cb.modelId) ?? "—"}
                  </option>
                ))}
              </select>
              {combos.length === 0 && (
                <p className="t-tiny text-base-500 mt-1">
                  No combos authored yet — add one under Sofa Combos first.
                </p>
              )}
            </label>
          )}

          {value.sofaKind === "compartment" && (
            <label className="block">
              <span className="label">Compartment</span>
              <select
                value={value.coversCompartmentId ?? ""}
                onChange={(e) => set({ coversCompartmentId: e.target.value || null })}
                className={INPUT_CLS}
                aria-label="Covered compartment"
              >
                <option value="">Pick a compartment…</option>
                {compartments.map((cp) => (
                  <option key={cp.id} value={cp.id}>
                    {cp.code}
                    {cp.description ? ` · ${cp.description}` : ""}
                  </option>
                ))}
              </select>
            </label>
          )}
        </>
      ) : (
        <>
          <ModelPicker
            models={catModels}
            value={value.coversModelId}
            onPick={(id) => set({ coversModelId: id, coversVariants: [] })}
            anyLabel={`Any ${CATEGORY_LABEL[cat].toLowerCase()}`}
          />

          {/* Variants — mattress / bed frame only. Loo: accessories carry none. */}
          {hasVariantAxis && sizePool.length > 0 && (
            <div>
              <span className="label">Sizes covered</span>
              <div className="flex flex-wrap gap-1.5 mt-1">
                <button
                  type="button"
                  onClick={() => set({ coversVariants: [] })}
                  aria-pressed={value.coversVariants.length === 0}
                  className={`t-tiny px-2.5 py-1 rounded-full border transition-colors ${
                    value.coversVariants.length === 0
                      ? "bg-base-900 text-white border-base-900"
                      : "bg-white text-base-700 border-base-300 hover:border-base-500"
                  }`}
                >
                  Any size
                </button>
                {sizePool.map((p) => {
                  const on = value.coversVariants.includes(p.value);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => toggleVariant(p.value)}
                      aria-pressed={on}
                      className={`t-tiny px-2.5 py-1 rounded-full border transition-colors ${
                        on
                          ? "bg-base-900 text-white border-base-900"
                          : "bg-white text-base-700 border-base-300 hover:border-base-500"
                      }`}
                    >
                      {p.label ?? p.value}
                    </button>
                  );
                })}
              </div>
              <p className="t-tiny text-base-500 mt-1">
                None ticked = every size is covered.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ModelPicker({
  models,
  value,
  onPick,
  anyLabel,
  required = false,
}: {
  models: ProductModelDto[];
  value: string | null;
  onPick: (id: string | null) => void;
  anyLabel: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="label">Product</span>
      <select
        value={value ?? ""}
        onChange={(e) => onPick(e.target.value || null)}
        className={INPUT_CLS}
        aria-label="Covered product"
      >
        <option value="">{anyLabel}</option>
        {models.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </select>
      {required && !value && (
        <p className="t-tiny text-base-500 mt-1">Pick the model this guarantee covers.</p>
      )}
    </label>
  );
}
