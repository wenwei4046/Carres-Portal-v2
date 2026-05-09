import { useMemo, useState } from "react";
import { toast } from "sonner";
import type {
  ProductCategory,
  ProductModelDto,
  ProductSkuDto,
  SofaFabricDto,
} from "@carres/shared";
import { ApiError } from "@/lib/api";
import {
  useCatalog,
  useCreateCatalogModel,
  useCreateCatalogSku,
  useCreateSofaFabric,
  useDeleteCatalogModel,
  useDeleteCatalogSku,
  useDeleteSofaFabric,
  usePatchCatalogModel,
  usePatchCatalogSku,
  usePatchSofaFabric,
} from "@/lib/queries";
import { INPUT_CLS, Modal, ModalActions } from "@/pages/logistics/components/Modal";

/**
 * LogisticsCatalog — single CRUD page for principal + logistics to manage
 * the SKU catalog (Loo 2026-05-09 Q1=b, Q2=c, Q3=b, Q4=c). Mounted at
 * /logistics/catalog and /principal/catalog; both routes render this same
 * component since the underlying RLS gate (is_internal()) covers both roles.
 *
 * Layout
 *   • Tabs: Mattress / Bedframe / Sofa
 *   • Per category: list of models (non-discontinued); each row expands
 *     to show variants. Inline edit for cost + retail price.
 *   • + Add model     opens the Add-Model modal (category preset)
 *   • + Add variant   opens the Add-Variant modal (model preset)
 *   • + Add fabric    opens the Add-Fabric modal (model preset; sofa only)
 *   • Each model + variant + fabric carries a Discontinue (soft-delete) button.
 *
 * Cost editing rule (Q5=a): cost is the procurement cost auto-fed onto every
 * Create-PO line. NULL means "not yet set" — UI shows a red ⚠ on those rows
 * so logistics can fill them in before next PO.
 */

const CATEGORIES: { key: ProductCategory; label: string; icon: string }[] = [
  { key: "mattress", label: "Mattress", icon: "▭" },
  { key: "bedframe", label: "Bed frame", icon: "▤" },
  { key: "sofa", label: "Sofa", icon: "▦" },
];

interface AddModelState {
  category: ProductCategory;
}
interface AddVariantState {
  model: ProductModelDto;
}
interface AddFabricState {
  model: ProductModelDto;
}

export default function LogisticsCatalog() {
  // 0075 — admin mode includes discontinued items so the toggle UX has
  // both states visible (Loo 2026-05-09).
  const catalogQ = useCatalog({ admin: true });
  const [activeCat, setActiveCat] = useState<ProductCategory>("mattress");
  const [addModel, setAddModel] = useState<AddModelState | null>(null);
  const [addVariant, setAddVariant] = useState<AddVariantState | null>(null);
  const [addFabric, setAddFabric] = useState<AddFabricState | null>(null);

  // 0075 — admin mode renders discontinued rows too so the toggle shows
  // both states. Each consumer fades them visually + offers Restore.
  const skusByModel = useMemo(() => {
    const m = new Map<string, ProductSkuDto[]>();
    for (const s of catalogQ.data?.skus ?? []) {
      const arr = m.get(s.modelId) ?? [];
      arr.push(s);
      m.set(s.modelId, arr);
    }
    return m;
  }, [catalogQ.data]);

  const fabricsByModel = useMemo(() => {
    const m = new Map<string, SofaFabricDto[]>();
    for (const f of catalogQ.data?.sofaFabrics ?? []) {
      const arr = m.get(f.modelId) ?? [];
      arr.push(f);
      m.set(f.modelId, arr);
    }
    return m;
  }, [catalogQ.data]);

  const modelsInCat = (catalogQ.data?.models ?? [])
    .filter((m) => m.category === activeCat);

  return (
    <div className="px-9 py-8 pb-14">
      <div className="flex justify-between items-end mb-6">
        <div>
          <div className="kicker">Catalog</div>
          <h1
            className="font-display text-[28px] leading-[1.05] mt-1.5 tracking-[-0.025em] font-bold text-base-900"
          >
            SKU catalog &amp; cost
          </h1>
          <p className="text-[13px] text-base-600 font-body mt-1">
            Add models, set procurement cost + retail price. Cost feeds every
            new PO automatically.
          </p>
        </div>
      </div>

      {/* Category tabs */}
      <div
        className="flex border-b border-base-200 mb-5"
        role="tablist"
        aria-label="Catalog category"
      >
        {CATEGORIES.map((c) => {
          const active = activeCat === c.key;
          return (
            <button
              key={c.key}
              role="tab"
              aria-selected={active}
              data-testid={`catalog-tab-${c.key}`}
              onClick={() => setActiveCat(c.key)}
              className={`px-5 py-2.5 text-[13px] border-b-2 transition-colors ${
                active
                  ? "border-primary text-base-900 font-semibold"
                  : "border-transparent text-base-600 hover:text-base-900"
              }`}
            >
              <span className="text-base mr-1.5">{c.icon}</span>
              {c.label}
            </button>
          );
        })}
      </div>

      {/* Per-category Add Model */}
      <div className="mb-4">
        <button
          type="button"
          onClick={() => setAddModel({ category: activeCat })}
          data-testid="catalog-add-model"
          className="btn-primary text-[12px]"
        >
          + Add {activeCat} model
        </button>
      </div>

      {catalogQ.isLoading && (
        <div className="text-[12px] text-base-500">Loading catalog…</div>
      )}
      {!catalogQ.isLoading && modelsInCat.length === 0 && (
        <div className="text-[12px] text-base-500">
          No {activeCat} models yet. Click + Add to create one.
        </div>
      )}

      <div className="flex flex-col gap-4">
        {modelsInCat.map((model) => (
          <ModelCard
            key={model.id}
            model={model}
            skus={skusByModel.get(model.id) ?? []}
            fabrics={fabricsByModel.get(model.id) ?? []}
            onAddVariant={() => setAddVariant({ model })}
            onAddFabric={() => setAddFabric({ model })}
          />
        ))}
      </div>

      {addModel && (
        <AddModelModal
          category={addModel.category}
          onClose={() => setAddModel(null)}
        />
      )}
      {addVariant && (
        <AddVariantModal
          model={addVariant.model}
          onClose={() => setAddVariant(null)}
        />
      )}
      {addFabric && (
        <AddFabricModal
          model={addFabric.model}
          onClose={() => setAddFabric(null)}
        />
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Per-model card
// -----------------------------------------------------------------------------

// 0075 (Loo 2026-05-09) — Animated on/off pill replacing the plain
// Discontinue text button. Orange (terracotta) when in the discontinued
// state, gray when active. The thumb slides 14px between states with a
// 160ms transition.
function ToggleDiscontinue({
  discontinued,
  onChange,
  pending,
  ariaLabel,
}: {
  discontinued: boolean;
  onChange: (next: boolean) => void;
  pending?: boolean;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={discontinued}
      aria-label={ariaLabel}
      disabled={pending}
      onClick={(e) => {
        e.stopPropagation();
        onChange(!discontinued);
      }}
      className="inline-flex items-center gap-2 select-none"
      style={{ opacity: pending ? 0.55 : 1 }}
    >
      <span
        className="relative rounded-full"
        style={{
          width: 32,
          height: 18,
          background: discontinued
            ? "var(--brand-signature, #D64F20)"
            : "rgba(34,31,32,.18)",
          transition: "background 160ms",
        }}
      >
        <span
          className="absolute rounded-full bg-white shadow-sm"
          style={{
            width: 14,
            height: 14,
            top: 2,
            left: discontinued ? 16 : 2,
            transition: "left 160ms",
          }}
        />
      </span>
      <span
        className="text-[10.5px] font-ui font-semibold uppercase"
        style={{
          letterSpacing: "0.08em",
          color: discontinued
            ? "var(--brand-signature, #D64F20)"
            : "var(--base-600)",
        }}
      >
        {discontinued ? "Discontinued" : "Active"}
      </span>
    </button>
  );
}

function ModelCard({
  model,
  skus,
  fabrics,
  onAddVariant,
  onAddFabric,
}: {
  model: ProductModelDto;
  skus: ProductSkuDto[];
  fabrics: SofaFabricDto[];
  onAddVariant: () => void;
  onAddFabric: () => void;
}) {
  const deleteModel = useDeleteCatalogModel();
  const patchModel = usePatchCatalogModel();
  // Loo 2026-05-09 — collapse by default. Click header to expand variants
  // + fabrics; click again to close. Compact list when there are many
  // models in the catalog.
  const [expanded, setExpanded] = useState(false);
  const isDiscontinued = !!model.discontinuedAt;

  function toggleDiscontinue(next: boolean) {
    if (next) {
      // Going discontinued: confirm + hit DELETE (stamps discontinued_at).
      if (!confirm(`Discontinue "${model.name}"? It will be hidden from new POs but kept in records.`)) return;
      deleteModel.mutate(model.id, {
        onSuccess: () => toast.success(`${model.name} discontinued`),
        onError: (err: unknown) =>
          toast.error(err instanceof ApiError ? err.message : "Discontinue failed"),
      });
    } else {
      // Restore: PATCH discontinuedAt:null.
      patchModel.mutate(
        { id: model.id, patch: { discontinuedAt: null } },
        {
          onSuccess: () => toast.success(`${model.name} re-activated`),
          onError: (err: unknown) =>
            toast.error(err instanceof ApiError ? err.message : "Restore failed"),
        },
      );
    }
  }

  return (
    <div
      className="bg-white border border-base-200 rounded-[4px] p-4"
      data-testid={`catalog-model-${model.modelKey}`}
      style={{ opacity: isDiscontinued ? 0.55 : 1 }}
    >
      {/* Clickable header — toggles expand/collapse. Discontinue button
          stops propagation so it doesn't trigger the toggle. */}
      <div
        className="flex justify-between items-start gap-3 cursor-pointer select-none"
        onClick={() => setExpanded((v) => !v)}
        role="button"
        aria-expanded={expanded}
        data-testid={`catalog-model-toggle-${model.modelKey}`}
      >
        <div className="min-w-0 flex items-start gap-2">
          <span
            className="text-[12px] text-base-500 mt-[3px]"
            style={{
              transition: "transform 120ms",
              transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
              display: "inline-block",
              width: 10,
            }}
            aria-hidden="true"
          >
            ▶
          </span>
          <div className="min-w-0">
            <div className="font-ui text-[14px] font-semibold">{model.name}</div>
            <div className="text-[11px] text-base-500 mt-0.5 font-body">
              <span className="font-mono">{model.modelKey}</span>
              {model.blurb ? <> · {model.blurb}</> : null}
              {" · "}
              {skus.length} variant{skus.length === 1 ? "" : "s"}
              {model.category === "sofa" && fabrics.length > 0 && (
                <>
                  {" · "}
                  {fabrics.length} fabric{fabrics.length === 1 ? "" : "s"}
                </>
              )}
            </div>
            {expanded && model.category === "bedframe" && (
              <div className="text-[10.5px] text-base-500 mt-1.5 font-body">
                Colors:{" "}
                <span className="font-mono">
                  {model.colors?.join(" / ") || "—"}
                </span>
                {" · "}
                Gaps:{" "}
                <span className="font-mono">
                  {model.gaps?.join(" / ") || "—"}
                </span>
              </div>
            )}
          </div>
        </div>
        <div data-testid={`catalog-model-discontinue-${model.modelKey}`}>
          <ToggleDiscontinue
            discontinued={isDiscontinued}
            onChange={toggleDiscontinue}
            pending={deleteModel.isPending || patchModel.isPending}
            ariaLabel={`Toggle ${model.name} discontinued state`}
          />
        </div>
      </div>

      {expanded && (
      <>
      {/* Variants table */}
      <div className="border-t border-base-100 pt-2.5 mt-2.5">
        <div
          className="grid items-center gap-3 px-1 py-1.5 bg-base-50 border-b border-base-200 rounded-[3px]"
          style={{ gridTemplateColumns: "1.4fr 110px 110px auto" }}
        >
          <div className="label">
            {model.category === "sofa" ? "Component" : "Variant"}
          </div>
          <div className="label text-right">Retail (RM)</div>
          <div className="label text-right">Cost (RM)</div>
          <div></div>
        </div>
        {skus.length === 0 && (
          <div className="text-[11px] text-base-500 py-2 px-1">
            No variants yet. Click + Add variant.
          </div>
        )}
        {skus.map((sku) => (
          <SkuRow key={sku.id} sku={sku} />
        ))}
        <div className="pt-2.5">
          <button
            type="button"
            onClick={onAddVariant}
            data-testid={`catalog-add-variant-${model.modelKey}`}
            className="btn-ghost text-[11px]"
          >
            + Add variant
          </button>
        </div>
      </div>

      {/* Sofa fabrics */}
      {model.category === "sofa" && (
        <div className="border-t border-base-100 mt-3 pt-2.5">
          <div className="label mb-1.5">Fabrics</div>
          <div
            className="grid items-center gap-3 px-1 py-1 bg-base-50 border-b border-base-200 rounded-[3px]"
            style={{ gridTemplateColumns: "1fr 1fr 110px auto" }}
          >
            <div className="label">Fabric</div>
            <div className="label">Colors (comma-separated)</div>
            <div className="label text-right">Surcharge (RM)</div>
            <div></div>
          </div>
          {fabrics.length === 0 && (
            <div className="text-[11px] text-base-500 py-1">
              No fabrics yet.
            </div>
          )}
          {fabrics.map((f) => (
            <FabricRow key={f.id} fabric={f} />
          ))}
          <div className="pt-2.5">
            <button
              type="button"
              onClick={onAddFabric}
              data-testid={`catalog-add-fabric-${model.modelKey}`}
              className="btn-ghost text-[11px]"
            >
              + Add fabric
            </button>
          </div>
        </div>
      )}
      </>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Inline-editable rows
// -----------------------------------------------------------------------------

function SkuRow({ sku }: { sku: ProductSkuDto }) {
  const patch = usePatchCatalogSku();
  const del = useDeleteCatalogSku();
  const isDiscontinued = !!sku.discontinuedAt;

  function toggleDiscontinue(next: boolean) {
    if (next) {
      if (!confirm(`Discontinue ${sku.variant}? Existing POs/orders keep working; new ones won't see it.`)) return;
      del.mutate(sku.id, {
        onSuccess: () => toast.success(`${sku.variant} discontinued`),
        onError: (e: unknown) =>
          toast.error(e instanceof ApiError ? e.message : "Discontinue failed"),
      });
    } else {
      patch.mutate(
        { id: sku.id, patch: { discontinuedAt: null } },
        {
          onSuccess: () => toast.success(`${sku.variant} re-activated`),
          onError: (e: unknown) =>
            toast.error(e instanceof ApiError ? e.message : "Restore failed"),
        },
      );
    }
  }

  function commitField(field: "price" | "cost", raw: string) {
    const trimmed = raw.trim();
    let val: number | null;
    if (trimmed === "") {
      // Cost can be null ("not yet set"); price is required non-null on
      // the column itself so we treat empty as "no change".
      if (field === "cost") val = null;
      else return;
    } else {
      const parsed = Number(trimmed);
      if (!Number.isFinite(parsed) || parsed < 0) {
        toast.error("Enter a non-negative number");
        return;
      }
      val = parsed;
    }
    if ((field === "price" && val === sku.price) ||
        (field === "cost" && val === sku.cost)) {
      return;
    }
    patch.mutate(
      { id: sku.id, patch: { [field]: val } as { price?: number; cost?: number | null } },
      {
        onSuccess: () => toast.success(`${sku.variant} · ${field} updated`),
        onError: (e: unknown) =>
          toast.error(e instanceof ApiError ? e.message : "Update failed"),
      },
    );
  }

  return (
    <div
      className="grid items-center gap-3 px-1 py-2 border-b border-base-100 last:border-b-0"
      style={{
        gridTemplateColumns: "1.4fr 110px 110px auto",
        opacity: isDiscontinued ? 0.55 : 1,
      }}
      data-testid={`catalog-sku-${sku.sku}`}
    >
      <div className="text-[12px] font-body">
        <div>{sku.variant}</div>
        <div className="font-mono text-[10px] text-base-500 mt-0.5">
          {sku.sku}
        </div>
      </div>
      <input
        type="number"
        min={0}
        step="0.01"
        defaultValue={sku.price}
        onBlur={(e) => commitField("price", e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        aria-label={`${sku.variant} retail price`}
        className={`${INPUT_CLS} text-right font-mono text-[12px]`}
      />
      <input
        type="number"
        min={0}
        step="0.01"
        defaultValue={sku.cost ?? ""}
        placeholder="—"
        onBlur={(e) => commitField("cost", e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        aria-label={`${sku.variant} cost`}
        className={`${INPUT_CLS} text-right font-mono text-[12px]`}
        style={
          sku.cost == null
            ? { borderColor: "var(--brand-signature)" }
            : undefined
        }
      />
      <ToggleDiscontinue
        discontinued={isDiscontinued}
        onChange={toggleDiscontinue}
        pending={del.isPending || patch.isPending}
        ariaLabel={`Toggle ${sku.variant} discontinued state`}
      />
    </div>
  );
}

function FabricRow({ fabric }: { fabric: SofaFabricDto }) {
  const patch = usePatchSofaFabric();
  const del = useDeleteSofaFabric();
  const isDiscontinued = !!fabric.discontinuedAt;

  function commitSurcharge(raw: string) {
    const trimmed = raw.trim();
    if (trimmed === "") return;
    const val = Number(trimmed);
    if (!Number.isFinite(val) || val < 0) {
      toast.error("Surcharge must be a non-negative number");
      return;
    }
    if (val === fabric.surcharge) return;
    patch.mutate(
      { id: fabric.id, patch: { surcharge: val } },
      {
        onError: (e: unknown) =>
          toast.error(e instanceof ApiError ? e.message : "Update failed"),
      },
    );
  }

  // 0075 — comma-separated colors edit. Empty input → null (no colors).
  function commitColors(raw: string) {
    const next = raw
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean);
    const same =
      (fabric.colors ?? []).length === next.length &&
      (fabric.colors ?? []).every((c, i) => c === next[i]);
    if (same) return;
    patch.mutate(
      { id: fabric.id, patch: { colors: next.length === 0 ? null : next } },
      {
        onSuccess: () => toast.success(`${fabric.fabricName} colors updated`),
        onError: (e: unknown) =>
          toast.error(e instanceof ApiError ? e.message : "Update failed"),
      },
    );
  }

  function toggleDiscontinue(next: boolean) {
    if (next) {
      if (!confirm(`Discontinue fabric "${fabric.fabricName}"?`)) return;
      del.mutate(fabric.id, {
        onError: (e: unknown) =>
          toast.error(e instanceof ApiError ? e.message : "Discontinue failed"),
      });
    } else {
      patch.mutate(
        { id: fabric.id, patch: { discontinuedAt: null } },
        {
          onSuccess: () => toast.success(`${fabric.fabricName} re-activated`),
          onError: (e: unknown) =>
            toast.error(e instanceof ApiError ? e.message : "Restore failed"),
        },
      );
    }
  }

  return (
    <div
      className="grid items-center gap-3 px-1 py-1.5"
      style={{
        gridTemplateColumns: "1fr 1fr 110px auto",
        opacity: isDiscontinued ? 0.55 : 1,
      }}
      data-testid={`catalog-fabric-${fabric.id}`}
    >
      <div className="text-[12px] font-body">{fabric.fabricName}</div>
      <input
        type="text"
        defaultValue={(fabric.colors ?? []).join(", ")}
        placeholder="Slate, Cream, Navy"
        onBlur={(e) => commitColors(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        aria-label={`${fabric.fabricName} colors`}
        className={`${INPUT_CLS} text-[12px]`}
      />
      <input
        type="number"
        min={0}
        step="0.01"
        defaultValue={fabric.surcharge}
        onBlur={(e) => commitSurcharge(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        aria-label={`${fabric.fabricName} surcharge`}
        className={`${INPUT_CLS} text-right font-mono text-[12px]`}
      />
      <ToggleDiscontinue
        discontinued={isDiscontinued}
        onChange={toggleDiscontinue}
        pending={del.isPending || patch.isPending}
        ariaLabel={`Toggle ${fabric.fabricName} discontinued state`}
      />
    </div>
  );
}

// -----------------------------------------------------------------------------
// Modals: Add Model / Variant / Fabric
// -----------------------------------------------------------------------------

// Derive a kebab-case modelKey from a human display name. Lowercases, then
// collapses any run of non-alphanumeric chars into a single dash, then trims
// leading/trailing dashes. Loo 2026-05-09 — UX preference: he shouldn't have
// to know what kebab-case is; the form derives it from the display name.
function deriveModelKey(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function AddModelModal({
  category,
  onClose,
}: {
  category: ProductCategory;
  onClose: () => void;
}) {
  const create = useCreateCatalogModel();
  const [name, setName] = useState("");
  const [blurb, setBlurb] = useState("");
  const [colors, setColors] = useState("");
  const [gaps, setGaps] = useState("");
  const [sofaMode, setSofaMode] = useState<"preset" | "custom" | "both">("preset");

  const modelKey = deriveModelKey(name);
  const valid = name.length >= 2 && modelKey.length >= 2;

  function submit() {
    if (!valid) return;
    create.mutate(
      {
        category,
        modelKey,
        name,
        blurb: blurb.trim() || null,
        colors:
          category === "bedframe" && colors.trim()
            ? colors.split(",").map((c) => c.trim()).filter(Boolean)
            : null,
        gaps:
          category === "bedframe" && gaps.trim()
            ? gaps.split(",").map((g) => g.trim()).filter(Boolean)
            : null,
        sofaMode: category === "sofa" ? sofaMode : null,
      },
      {
        onSuccess: () => {
          toast.success(`Added ${name}`);
          onClose();
        },
        onError: (e: unknown) =>
          toast.error(e instanceof ApiError ? e.message : "Add failed"),
      },
    );
  }

  return (
    <Modal title={`New ${category} model`} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <FieldRow label="Display name">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Carres Hybrid"
            data-testid="add-model-name"
            className={INPUT_CLS}
          />
          {/* Auto-derived internal id preview so the user sees what gets
              stored without having to understand kebab-case. */}
          {modelKey && (
            <div className="text-[10.5px] text-base-500 font-mono mt-1">
              Internal id: <span className="text-base-700">{modelKey}</span>
            </div>
          )}
        </FieldRow>
        <FieldRow label="Blurb (optional)">
          <input
            value={blurb}
            onChange={(e) => setBlurb(e.target.value)}
            placeholder="Premium hybrid coil-and-foam"
            className={INPUT_CLS}
          />
        </FieldRow>
        {category === "bedframe" && (
          <>
            <FieldRow label="Colors (comma-separated)">
              <input
                value={colors}
                onChange={(e) => setColors(e.target.value)}
                placeholder="Black, Walnut, Natural Oak"
                className={INPUT_CLS}
              />
            </FieldRow>
            <FieldRow label='Gaps (comma-separated, e.g. 10", 12", 14")'>
              <input
                value={gaps}
                onChange={(e) => setGaps(e.target.value)}
                placeholder='10", 12", 14"'
                className={INPUT_CLS}
              />
            </FieldRow>
          </>
        )}
        {category === "sofa" && (
          <FieldRow label="Sofa mode">
            <select
              value={sofaMode}
              onChange={(e) =>
                setSofaMode(e.target.value as "preset" | "custom" | "both")
              }
              className={INPUT_CLS}
            >
              <option value="preset">Preset (whole sofa SKUs)</option>
              <option value="custom">Custom (component pieces)</option>
              <option value="both">Both</option>
            </select>
          </FieldRow>
        )}
      </div>
      <ModalActions
        onCancel={onClose}
        onPrimary={submit}
        primary="Add model"
        primaryDisabled={!valid}
        primaryPending={create.isPending}
      />
    </Modal>
  );
}

function AddVariantModal({
  model,
  onClose,
}: {
  model: ProductModelDto;
  onClose: () => void;
}) {
  const create = useCreateCatalogSku();
  const [variant, setVariant] = useState("");
  const [variantKind, setVariantKind] = useState<"size" | "preset" | "part">(
    model.category === "sofa"
      ? model.sofaMode === "custom"
        ? "part"
        : "preset"
      : "size",
  );
  const [price, setPrice] = useState("");
  const [cost, setCost] = useState("");

  const priceNum = Number(price);
  const costNum = cost.trim() === "" ? null : Number(cost);
  const valid =
    variant.length > 0 &&
    Number.isFinite(priceNum) &&
    priceNum >= 0 &&
    (costNum === null || (Number.isFinite(costNum) && costNum >= 0));

  function submit() {
    if (!valid) return;
    create.mutate(
      {
        modelId: model.id,
        variant,
        variantKind,
        price: priceNum,
        cost: costNum,
      },
      {
        onSuccess: () => {
          toast.success(`Added ${variant} to ${model.name}`);
          onClose();
        },
        onError: (e: unknown) =>
          toast.error(e instanceof ApiError ? e.message : "Add failed"),
      },
    );
  }

  return (
    <Modal title={`Add variant to ${model.name}`} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <FieldRow
          label={
            model.category === "sofa"
              ? "Component name (e.g. 3-seater, Corner)"
              : "Size variant (e.g. King, Queen)"
          }
        >
          <input
            value={variant}
            onChange={(e) => setVariant(e.target.value)}
            data-testid="add-variant-name"
            className={INPUT_CLS}
          />
        </FieldRow>
        {model.category === "sofa" && (
          <FieldRow label="Variant kind">
            <select
              value={variantKind}
              onChange={(e) =>
                setVariantKind(e.target.value as "size" | "preset" | "part")
              }
              className={INPUT_CLS}
            >
              <option value="preset">Preset (complete sofa)</option>
              <option value="part">Part (component piece)</option>
            </select>
          </FieldRow>
        )}
        <FieldRow label="Retail price (RM)">
          <input
            type="number"
            min={0}
            step="0.01"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            data-testid="add-variant-price"
            className={INPUT_CLS}
          />
        </FieldRow>
        <FieldRow label="Cost (RM, optional — set later if unknown)">
          <input
            type="number"
            min={0}
            step="0.01"
            value={cost}
            onChange={(e) => setCost(e.target.value)}
            placeholder="—"
            data-testid="add-variant-cost"
            className={INPUT_CLS}
          />
        </FieldRow>
      </div>
      <ModalActions
        onCancel={onClose}
        onPrimary={submit}
        primary="Add variant"
        primaryDisabled={!valid}
        primaryPending={create.isPending}
      />
    </Modal>
  );
}

function AddFabricModal({
  model,
  onClose,
}: {
  model: ProductModelDto;
  onClose: () => void;
}) {
  const create = useCreateSofaFabric();
  const [name, setName] = useState("");
  const [surcharge, setSurcharge] = useState("0");
  const [colors, setColors] = useState("");

  const surchargeNum = Number(surcharge);
  const valid =
    name.length > 0 && Number.isFinite(surchargeNum) && surchargeNum >= 0;

  function submit() {
    if (!valid) return;
    const colorsArr = colors
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean);
    create.mutate(
      {
        modelId: model.id,
        fabricName: name,
        surcharge: surchargeNum,
        colors: colorsArr.length > 0 ? colorsArr : null,
      },
      {
        onSuccess: () => {
          toast.success(`Added ${name} fabric`);
          onClose();
        },
        onError: (e: unknown) =>
          toast.error(e instanceof ApiError ? e.message : "Add failed"),
      },
    );
  }

  return (
    <Modal title={`Add fabric to ${model.name}`} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <FieldRow label="Fabric name">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Linen Slate"
            data-testid="add-fabric-name"
            className={INPUT_CLS}
          />
        </FieldRow>
        <FieldRow label="Colors (comma-separated, optional — set later if unknown)">
          <input
            value={colors}
            onChange={(e) => setColors(e.target.value)}
            placeholder="Slate, Cream, Navy, Charcoal"
            data-testid="add-fabric-colors"
            className={INPUT_CLS}
          />
        </FieldRow>
        <FieldRow label="Surcharge (RM, applied per unit on top of variant price)">
          <input
            type="number"
            min={0}
            step="0.01"
            value={surcharge}
            onChange={(e) => setSurcharge(e.target.value)}
            data-testid="add-fabric-surcharge"
            className={INPUT_CLS}
          />
        </FieldRow>
      </div>
      <ModalActions
        onCancel={onClose}
        onPrimary={submit}
        primary="Add fabric"
        primaryDisabled={!valid}
        primaryPending={create.isPending}
      />
    </Modal>
  );
}

function FieldRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="label block mb-1">{label}</span>
      {children}
    </label>
  );
}
