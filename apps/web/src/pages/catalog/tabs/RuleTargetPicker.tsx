// ----------------------------------------------------------------------------
// RuleTargetPicker — the category-aware product targeting control that produces
// a `RuleTarget[]` for the unified matcher (`@carres/shared/rule-target`). In
// Carres the first consumer is the Special Delivery Fee editor (Maintenance tab,
// migration 0184). Ported in shape from 2990s
// `apps/pos/src/components/products/RuleTargetPicker.tsx`, adapted to Carres
// catalog data (models / sofa combos / sofa compartments ride in the catalog
// bundle — no extra query) + v17 tokens (Tailwind utilities, no inline styles).
//
//   MATTRESS / BEDFRAME : add the Model = any variant; tick sizes to narrow.
//   SOFA                : add the Model, then Any build / By combo / By compartment.
//   ACCESSORY / SERVICE : add the Model (no variant axis).
// Models are ADDED via a dropdown (Loo 2026-07-11) — only picked models render.
//
// Sizes + compartments come from the model's allowed_options / the per-model
// offered compartment set; combos from catalog.sofaCombos scoped by model.
// ----------------------------------------------------------------------------

import { X } from "lucide-react";
import type {
  CatalogResponse,
  ProductModelDto,
  RuleTarget,
  RuleTargetScopeValue,
  SofaComboDto,
  TargetRefinement,
} from "@carres/shared";

const CATEGORY_ORDER = ["sofa", "mattress", "bedframe", "accessory", "service"];

const modelLabel = (m: ProductModelDto): string => m.name || m.modelKey;

/** A short summary of a combo's slots, e.g. "2A(LHF)|2A(RHF) + L(LHF)". Mirrors
 *  SofaCombosPanel.slotsSummary so the chip reads the same in both editors. */
function comboLabel(c: SofaComboDto): string {
  if (c.label && c.label.trim()) return c.label.trim();
  if (c.slots.length === 0) return "combo";
  return c.slots.map((s) => s.join("|")).join(" + ");
}

/** The size strings a mattress/bedframe model offers — `allowed_options.sizes`
 *  when curated, else DERIVED from the model's live SKU variants. Some models
 *  (e.g. imported ones) never had allowed_options populated even though their
 *  SKUs carry King/Queen/… variants; the order-time matcher compares against
 *  the SKU variant anyway, so the SKU-derived list is the correct vocabulary
 *  (Loo 2026-07-06: the "Only for specific sizes" tick showed nothing). */
export function modelSizes(m: ProductModelDto, catalog: CatalogResponse): string[] {
  const curated = (m.allowedOptions?.sizes ?? []).map((s) => s.trim()).filter(Boolean);
  if (curated.length > 0) return curated;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of catalog.skus) {
    if (s.modelId !== m.id || s.variantKind !== "size" || s.discontinuedAt) continue;
    const v = (s.variant ?? "").trim();
    if (!v || seen.has(v.toUpperCase())) continue;
    seen.add(v.toUpperCase());
    out.push(v);
  }
  return out;
}

/** The compartment codes a sofa model offers — the per-model offered set
 *  (model_sofa_compartments → sofa_compartments.code), falling back to the
 *  model's allowed_options.compartments. */
function modelCompartments(m: ProductModelDto, catalog: CatalogResponse): string[] {
  const codeById = new Map((catalog.sofaCompartments ?? []).map((c) => [c.id, c.code]));
  const offered = (catalog.modelSofaCompartments ?? [])
    .filter((mc) => mc.modelId === m.id)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((mc) => codeById.get(mc.compartmentId))
    .filter((c): c is string => Boolean(c));
  if (offered.length > 0) return offered;
  return (m.allowedOptions?.compartments ?? []).map((c) => c.trim()).filter(Boolean);
}

/** Coerce draft targets to valid, persistable `RuleTarget[]`: an entry whose
 *  refinement list is empty collapses to scope 'model' (= any variant/build), so
 *  a half-finished "By size/combo/compartment" never ships an empty list (which
 *  the server Zod would reject). */
export function finalizeRuleTargets(targets: RuleTarget[]): RuleTarget[] {
  const out: RuleTarget[] = [];
  for (const t of targets) {
    if (!t.modelId) continue;
    if (t.scope === "variant" && (t.sizeCodes?.length ?? 0) > 0) {
      out.push({ modelId: t.modelId, scope: "variant", sizeCodes: t.sizeCodes });
    } else if (t.scope === "combo" && (t.comboIds?.length ?? 0) > 0) {
      out.push({ modelId: t.modelId, scope: "combo", comboIds: t.comboIds });
    } else if (t.scope === "compartment" && (t.compartments?.length ?? 0) > 0) {
      out.push({ modelId: t.modelId, scope: "compartment", compartments: t.compartments });
    } else {
      out.push({ modelId: t.modelId, scope: "model" });
    }
  }
  return out;
}

function Chip({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`inline-flex items-center gap-1 rounded-[4px] border px-2 py-0.5 text-[12px] transition-colors ${
        on
          ? "border-base-900 bg-base-900 text-white"
          : "border-base-300 bg-white text-base-600 hover:border-base-500"
      }`}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Single-model refinement (the per-row scope + lists, model already fixed).
// Exported (0185) so the Promo / Free Gifts editor can reuse the IDENTICAL
// category-aware refinement control for a per-model default-gift CONDITION (the
// model is already fixed by the gift's row) without re-implementing it.
// ---------------------------------------------------------------------------
export function RuleTargetRefinementRow({
  category,
  model,
  catalog,
  value,
  onChange,
}: {
  category: string;
  model: ProductModelDto;
  catalog: CatalogResponse;
  value: TargetRefinement;
  onChange: (next: TargetRefinement) => void;
}) {
  const cat = category.toLowerCase();
  const toggle = (list: string[] | undefined, v: string): string[] => {
    const cur = list ?? [];
    return cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v];
  };

  if (cat === "mattress" || cat === "bedframe") {
    const sizes = modelSizes(model, catalog);
    if (sizes.length === 0) return null;
    const picked = value.scope === "variant" ? (value.sizeCodes ?? []) : [];
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="t-tiny text-base-400">Sizes:</span>
        {sizes.map((size) => {
          const code = size.toUpperCase();
          const on = picked.includes(code);
          return (
            <Chip
              key={size}
              on={on}
              onClick={() => {
                const next = toggle(picked, code);
                onChange(next.length ? { scope: "variant", sizeCodes: next } : { scope: "model" });
              }}
            >
              {size}
            </Chip>
          );
        })}
        {picked.length === 0 && <span className="t-tiny text-base-400">(any variant)</span>}
      </div>
    );
  }

  if (cat === "sofa") {
    const combos = (catalog.sofaCombos ?? []).filter((c) => c.modelId === model.id && c.active);
    const compartments = modelCompartments(model, catalog);
    const mode: RuleTargetScopeValue =
      value.scope === "combo" || value.scope === "compartment" ? value.scope : "model";
    return (
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={mode}
          aria-label={`${modelLabel(model)} sofa scope`}
          onChange={(e) => {
            const m = e.target.value as RuleTargetScopeValue;
            onChange(
              m === "combo"
                ? { scope: "combo", comboIds: [] }
                : m === "compartment"
                  ? { scope: "compartment", compartments: [] }
                  : { scope: "model" },
            );
          }}
          className="border border-base-300 rounded-[4px] text-[12px] px-1.5 py-1 bg-white"
        >
          <option value="model">Any build</option>
          {combos.length > 0 && <option value="combo">By combo</option>}
          {compartments.length > 0 && <option value="compartment">By compartment</option>}
        </select>
        {mode === "combo" && (
          <div className="flex flex-wrap gap-1.5">
            {combos.map((cb) => (
              <Chip
                key={cb.id}
                on={(value.comboIds ?? []).includes(cb.id)}
                onClick={() => onChange({ scope: "combo", comboIds: toggle(value.comboIds, cb.id) })}
              >
                {comboLabel(cb)}
              </Chip>
            ))}
          </div>
        )}
        {mode === "compartment" && (
          <div className="flex flex-wrap gap-1.5">
            {compartments.map((code) => (
              <Chip
                key={code}
                on={(value.compartments ?? []).includes(code)}
                onClick={() =>
                  onChange({ scope: "compartment", compartments: toggle(value.compartments, code) })
                }
              >
                {code}
              </Chip>
            ))}
          </div>
        )}
      </div>
    );
  }

  // accessory / service — no variant axis.
  return null;
}

// ---------------------------------------------------------------------------
// Multi-model picker → RuleTarget[]. DROPDOWN form (Loo 2026-07-11): pick a
// model from the "Add model…" select to add it; each added model renders as a
// row with its refinement control + a remove ×. Nothing added = the consumer's
// "any {category}" semantics (unchanged). A target whose model falls outside
// the current category filter stays VISIBLE + removable (the old tick-list
// silently kept it).
// ---------------------------------------------------------------------------
export default function RuleTargetPicker({
  catalog,
  value,
  onChange,
  categories,
}: {
  catalog: CatalogResponse;
  value: RuleTarget[];
  onChange: (next: RuleTarget[]) => void;
  /** Optional lowercase category filter; omitted = all categories. */
  categories?: string[];
}) {
  const upsert = (modelId: string, next: RuleTarget | null): void => {
    const rest = value.filter((e) => e.modelId !== modelId);
    onChange(next ? [...rest, next] : rest);
  };

  const filter = categories?.map((c) => c.toLowerCase());
  const models = catalog.models
    .filter((m) => !m.discontinuedAt)
    .filter((m) => !filter || filter.includes(m.category.toLowerCase()));

  const byCategory = models.reduce<Record<string, ProductModelDto[]>>((acc, m) => {
    (acc[m.category] ??= []).push(m);
    return acc;
  }, {});
  const sorted = [
    ...CATEGORY_ORDER.filter((c) => byCategory[c]),
    ...Object.keys(byCategory).filter((c) => !CATEGORY_ORDER.includes(c)),
  ];

  const selectedIds = new Set(value.map((e) => e.modelId));
  // Display resolves against the FULL catalog so a cross-category leftover
  // target still shows its name (and can be removed).
  const anyModelById = new Map(catalog.models.map((m) => [m.id, m]));
  const addable = (cat: string) => (byCategory[cat] ?? []).filter((m) => !selectedIds.has(m.id));
  const anyAddable = models.some((m) => !selectedIds.has(m.id));

  return (
    <div className="max-h-[340px] overflow-auto border border-base-200 rounded-[4px] p-2 bg-white flex flex-col gap-0.5">
      <select
        value=""
        disabled={!anyAddable}
        aria-label="Add model"
        onChange={(e) => {
          const id = e.target.value;
          if (id) upsert(id, { modelId: id, scope: "model" });
        }}
        className="w-full border border-base-300 rounded-[4px] text-[13px] px-2 py-1.5 bg-white disabled:opacity-50"
        data-testid="rtp-add-model"
      >
        <option value="">
          {models.length === 0 ? "No models found" : anyAddable ? "Add model…" : "All models added"}
        </option>
        {sorted.length > 1
          ? sorted.map((cat) =>
              addable(cat).length > 0 ? (
                <optgroup key={cat} label={cat}>
                  {addable(cat).map((m) => (
                    <option key={m.id} value={m.id}>
                      {modelLabel(m)}
                    </option>
                  ))}
                </optgroup>
              ) : null,
            )
          : sorted.flatMap((cat) =>
              addable(cat).map((m) => (
                <option key={m.id} value={m.id}>
                  {modelLabel(m)}
                </option>
              )),
            )}
      </select>

      {value.map((entry) => {
        const m = anyModelById.get(entry.modelId);
        return (
          <div
            key={entry.modelId}
            className="flex flex-wrap items-center gap-2 px-1 py-1"
            data-testid={`rtp-model-${entry.modelId}`}
          >
            <span className="flex-1 min-w-[160px] text-[13px] font-medium">
              {m ? modelLabel(m) : entry.modelId}
            </span>
            {m && (
              <RuleTargetRefinementRow
                category={m.category}
                model={m}
                catalog={catalog}
                value={entry}
                onChange={(ref) => upsert(entry.modelId, { modelId: entry.modelId, ...ref })}
              />
            )}
            <button
              type="button"
              aria-label={`Remove ${m ? modelLabel(m) : entry.modelId}`}
              onClick={() => upsert(entry.modelId, null)}
              className="text-base-400 hover:text-destructive transition-colors"
              data-testid={`rtp-remove-${entry.modelId}`}
            >
              <X size={14} strokeWidth={1.75} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
