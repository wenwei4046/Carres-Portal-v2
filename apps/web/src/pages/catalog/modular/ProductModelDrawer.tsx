import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type {
  AllowedOptions,
  CatalogResponse,
  ProductCategory,
  ProductModelDto,
  ProductSkuDto,
  SofaFabricDto,
  SofaCompartmentDto,
  ModelSofaCompartmentDto,
  SpecialAddonDto,
  CatalogOptionPoolDto,
  FabricTierValue,
} from "@carres/shared";
import { deriveSkuCode } from "@carres/shared";
import { ApiError } from "@/lib/api";
import {
  useCreateSofaFabric,
  useDeleteModelPhoto,
  useDeleteSofaFabric,
  useGenerateSkus,
  usePatchCatalogModel,
  usePatchCatalogSku,
  usePatchSofaFabric,
  useSetModelPhoto,
  useToggleSizesActive,
  useUpsertModelFabricTierOverride,
  useUpsertModelSofaCompartment,
  useDeleteModelSofaCompartment,
} from "@/lib/queries";
import { INPUT_CLS, Modal, ModalActions } from "@/pages/operation/components/Modal";
import { CATEGORY_LABEL, CodeChip, SkuStatusPill } from "../components/atoms";
import SofaCombosPanel from "./SofaCombosPanel";

/**
 * ProductModelDrawer — right slide-over for one model. Sections:
 *   • Photo card        — signed-upload (shrink → sign → upload → store) + remove
 *   • Option pools      — Sizes (active-set; cascades pos_active across size
 *                         SKUs) + Compartments / Colors / Gaps (pure pools that
 *                         feed Generate SKUs)
 *   • Variant SKUs      — per-SKU ON/OFF (pos_active) + All on / All off
 *   • Generate SKUs     — materialize one SKU per ticked size (idempotent)
 *
 * "Active sizes" is the cascade endpoint: the chip set IS allowed_options.sizes
 * (what Generate targets). The chip UNIVERSE is the union of (a) that active set,
 * (b) every materialized size variant, and (c) sizes typed this session
 * (`extraSizes`). (c) matters because a just-added size that hasn't been
 * Generated yet lives only in allowed_options.sizes — without it, toggling that
 * size off (or "All off") would rewrite the active set and the chip would vanish
 * with no SKU to keep it. Tracking session-added sizes keeps it re-activatable.
 */

type OptionAxis = "sizes" | "compartments" | "colors" | "gaps";

const AXES_BY_CATEGORY: Record<ProductCategory, OptionAxis[]> = {
  mattress: ["sizes"],
  bedframe: ["sizes", "colors", "gaps"],
  sofa: ["sizes", "compartments", "colors"],
  accessory: [],
  service: [],
};

const AXIS_LABEL: Record<OptionAxis, string> = {
  sizes: "Sizes",
  compartments: "Compartments",
  colors: "Colours",
  gaps: "Gaps",
};

export default function ProductModelDrawer({
  model,
  skus,
  catalog,
  isPrincipal,
  onClose,
}: {
  model: ProductModelDto;
  skus: ProductSkuDto[];
  /** Full catalog bundle — required to read sofaFabrics + tier overrides. */
  catalog?: CatalogResponse;
  /** True when the current user is principal. Gates tier/delta money knobs. */
  isPrincipal?: boolean;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [generateOpen, setGenerateOpen] = useState(false);
  // Sizes typed this session — unioned into the chip universe so a freshly
  // added (not-yet-Generated) size survives an "All off" / toggle-off and stays
  // re-activatable. Reset per model via the key in ModularTab.
  const [extraSizes, setExtraSizes] = useState<string[]>([]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const axes = AXES_BY_CATEGORY[model.category];
  const opts: AllowedOptions = model.allowedOptions ?? {};

  // Size universe = active set ∪ every materialized size variant (so the chips
  // survive "All off").
  const sizeUniverse = useMemo(() => {
    const set = new Set<string>(opts.sizes ?? []);
    for (const s of skus) if (s.variantKind === "size") set.add(s.variant);
    for (const s of extraSizes) set.add(s);
    return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }, [opts.sizes, skus, extraSizes]);

  // 0182 — curated size SUGGESTIONS from the global option pool, by category.
  // These only suggest: clicking a chip adds the value into allowed_options.sizes
  // (the authoritative per-model source). Sofa/accessory/service have no size pool.
  const sizePoolName =
    model.category === "mattress"
      ? "mattress_size"
      : model.category === "bedframe"
        ? "bedframe_size"
        : null;
  const sizeSuggestions = useMemo<CatalogOptionPoolDto[]>(() => {
    if (!sizePoolName) return [];
    return (catalog?.optionPools ?? [])
      .filter((p) => p.pool === sizePoolName && p.active)
      .slice()
      .sort(
        (a, b) =>
          a.sortOrder - b.sortOrder ||
          a.value.localeCompare(b.value, undefined, { numeric: true }),
      );
  }, [catalog?.optionPools, sizePoolName]);

  return (
    <div
      role="presentation"
      onClick={onClose}
      className="fixed inset-0 z-[60] flex justify-end"
      style={{ background: "rgba(34,31,32,0.5)" }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Edit ${model.name}`}
        onClick={(e) => e.stopPropagation()}
        className="h-full w-full max-w-[560px] bg-card text-card-foreground border-l border-base-200 overflow-auto"
      >
        {/* Header */}
        <div className="px-6 pt-4 pb-3 border-b border-base-100 flex justify-between items-start sticky top-0 bg-card z-10">
          <div>
            <div className="t-h3 font-display">{model.name}</div>
            <div className="t-tiny text-base-500 mt-0.5 flex items-center gap-1.5">
              {CATEGORY_LABEL[model.category]} · <CodeChip>{model.modelKey}</CodeChip>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-1 text-[18px] text-base-700 hover:text-base-900 leading-none"
          >
            ×
          </button>
        </div>

        <div className="p-6 flex flex-col gap-6">
          <PhotoCard model={model} />
          <BlurbField model={model} />

          {axes.map((axis) =>
            axis === "sizes" ? (
              <SizeActivePool
                key="sizes"
                model={model}
                universe={sizeUniverse}
                active={new Set(opts.sizes ?? [])}
                suggestions={sizeSuggestions}
                onRegisterSize={(s) =>
                  setExtraSizes((prev) => (prev.includes(s) ? prev : [...prev, s]))
                }
              />
            ) : (
              <ChipPool key={axis} model={model} axis={axis} values={opts[axis] ?? []} />
            ),
          )}

          {axes.length === 0 && (
            <p className="t-tiny text-base-400">
              No variant axes for {CATEGORY_LABEL[model.category]} — manage its SKUs in SKU Master.
            </p>
          )}

          <VariantSkuTable skus={skus} />

          {/* Fabrics panel — sofa models only */}
          {model.category === "sofa" && catalog && (
            <SofaFabricsPanel
              model={model}
              fabrics={catalog.sofaFabrics.filter((f) => f.modelId === model.id && !f.discontinuedAt)}
              tierOverride={
                (catalog.modelFabricTierOverrides ?? []).find((o) => o.modelId === model.id) ?? null
              }
              isPrincipal={isPrincipal ?? false}
            />
          )}

          {/* Offered compartments panel (0178) — sofa models only */}
          {model.category === "sofa" && catalog && (
            <SofaCompartmentsOfferedPanel
              modelId={model.id}
              modelKey={model.modelKey}
              pool={(catalog.sofaCompartments ?? []).filter((c) => c.active)}
              offered={(catalog.modelSofaCompartments ?? []).filter((o) => o.modelId === model.id)}
              skus={skus}
              isPrincipal={isPrincipal ?? false}
            />
          )}

          {/* Sofa combos panel (0179) — sofa models only */}
          {model.category === "sofa" && catalog && (
            <SofaCombosPanel
              modelId={model.id}
              pool={catalog.sofaCompartments ?? []}
              offered={(catalog.modelSofaCompartments ?? []).filter((o) => o.modelId === model.id)}
              combos={catalog.sofaCombos ?? []}
              isPrincipal={isPrincipal ?? false}
            />
          )}

          {/* Special add-ons offered (0181) — any category. Internal-editable
              (which add-ons this model offers); the add-ons themselves are
              principal-authored in the Special Add-ons tab. */}
          {catalog && (
            <SpecialAddonsOfferedPanel
              model={model}
              pool={(catalog.specialAddons ?? []).filter(
                (a) => a.active && a.categories.includes(model.category),
              )}
            />
          )}

          {axes.includes("sizes") && (
            <div>
              <button
                type="button"
                onClick={() => setGenerateOpen(true)}
                className="btn-primary text-[12px]"
                data-testid="generate-skus-open"
              >
                Generate SKUs
              </button>
            </div>
          )}
        </div>
      </div>

      {generateOpen && (
        <GenerateSkusModal
          model={model}
          universe={sizeUniverse}
          existing={new Set(skus.map((s) => s.variant))}
          onClose={() => setGenerateOpen(false)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Photo card
// ---------------------------------------------------------------------------

function PhotoCard({ model }: { model: ProductModelDto }) {
  const setPhoto = useSetModelPhoto();
  const delPhoto = useDeleteModelPhoto();
  const inputRef = useRef<HTMLInputElement | null>(null);

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-pick of the same file
    if (!file) return;
    setPhoto.mutate(
      { modelId: model.id, file },
      {
        onSuccess: () => toast.success("Photo updated"),
        onError: (err: unknown) =>
          toast.error(err instanceof ApiError ? err.message : (err as Error).message || "Upload failed"),
      },
    );
  }

  function remove() {
    if (!confirm("Remove this model photo?")) return;
    delPhoto.mutate(model.id, {
      onSuccess: () => toast.success("Photo removed"),
      onError: (err: unknown) =>
        toast.error(err instanceof ApiError ? err.message : "Remove failed"),
    });
  }

  return (
    <div>
      <div className="label mb-2">Photo</div>
      <div className="flex items-center gap-4">
        {model.photoUrl ? (
          <img
            src={model.photoUrl}
            alt={model.name}
            className="w-24 h-24 object-cover rounded-[6px] border border-base-200 bg-base-50"
          />
        ) : (
          <div className="w-24 h-24 rounded-[6px] border border-dashed border-base-300 bg-base-50 grid place-items-center text-base-300 text-[28px]">
            ▦
          </div>
        )}
        <div className="flex flex-col gap-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={onPick}
            data-testid="model-photo-input"
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={setPhoto.isPending}
            className="btn-secondary text-[12px]"
          >
            {setPhoto.isPending ? "Uploading…" : model.photoUrl ? "Replace photo" : "Upload photo"}
          </button>
          {model.photoUrl && (
            <button
              type="button"
              onClick={remove}
              disabled={delPhoto.isPending}
              className="btn-danger text-[12px]"
            >
              Remove
            </button>
          )}
          <span className="t-tiny text-base-400">JPEG/PNG/WebP · auto-shrunk to ≤2 MB</span>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Blurb (model tagline)
// ---------------------------------------------------------------------------

function BlurbField({ model }: { model: ProductModelDto }) {
  const patch = usePatchCatalogModel();
  function commit(raw: string) {
    const next = raw.trim();
    if (next === (model.blurb ?? "")) return;
    patch.mutate(
      { id: model.id, patch: { blurb: next || null } },
      {
        onError: (e: unknown) =>
          toast.error(e instanceof ApiError ? e.message : "Update failed"),
      },
    );
  }
  return (
    <label className="block">
      <span className="label block mb-1">Description / blurb</span>
      <input
        defaultValue={model.blurb ?? ""}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        placeholder="Short tagline shown to dealers"
        className={INPUT_CLS}
      />
    </label>
  );
}

// ---------------------------------------------------------------------------
// Size active pool (cascade) — chips toggle pos_active across size SKUs
// ---------------------------------------------------------------------------

function SizeActivePool({
  model,
  universe,
  active,
  suggestions = [],
  onRegisterSize,
}: {
  model: ProductModelDto;
  universe: string[];
  active: Set<string>;
  /** 0182 — curated pool sizes for this model's category, shown as quick-add
   *  chips. Suggestions only: clicking one writes into allowed_options.sizes. */
  suggestions?: CatalogOptionPoolDto[];
  onRegisterSize: (size: string) => void;
}) {
  const toggle = useToggleSizesActive();
  const [adding, setAdding] = useState("");

  function setActive(next: string[]) {
    toggle.mutate(
      { modelId: model.id, input: { sizes: next } },
      {
        onError: (e: unknown) =>
          toast.error(e instanceof ApiError ? e.message : "Update failed"),
      },
    );
  }

  function toggleSize(size: string) {
    const next = new Set(active);
    if (next.has(size)) next.delete(size);
    else next.add(size);
    setActive(Array.from(next));
  }

  function addSizeValue(raw: string) {
    const v = raw.trim();
    if (!v) return;
    // Track it locally so it survives a later "All off", then activate it.
    onRegisterSize(v);
    if (active.has(v)) return;
    setActive([...Array.from(active), v]);
  }

  function addSize() {
    const v = adding;
    setAdding("");
    addSizeValue(v);
  }

  // Pool sizes not already present in the universe — offered as quick-add chips.
  const availSuggestions = suggestions.filter((s) => !universe.includes(s.value));

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="label">Active sizes</div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setActive(universe)}
            disabled={toggle.isPending || universe.length === 0}
            className="btn-ghost text-[11px]"
          >
            All on
          </button>
          <button
            type="button"
            onClick={() => setActive([])}
            disabled={toggle.isPending}
            className="btn-ghost text-[11px]"
          >
            All off
          </button>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {universe.length === 0 && (
          <span className="t-tiny text-base-400">No sizes yet — add one below, then Generate SKUs.</span>
        )}
        {universe.map((size) => {
          const on = active.has(size);
          return (
            <button
              key={size}
              type="button"
              onClick={() => toggleSize(size)}
              disabled={toggle.isPending}
              aria-pressed={on}
              className={`t-tiny font-semibold px-2.5 py-1 rounded-full border transition-colors ${
                on
                  ? "bg-base-900 text-white border-base-900"
                  : "bg-white text-base-500 border-base-300 hover:border-base-500"
              }`}
              data-testid={`size-chip-${size}`}
            >
              {size}
            </button>
          );
        })}
      </div>
      <div className="flex gap-2 mt-2">
        <input
          value={adding}
          onChange={(e) => setAdding(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") addSize();
          }}
          placeholder="Add a size (e.g. Super King)"
          className={`${INPUT_CLS} max-w-[220px]`}
        />
        <button type="button" onClick={addSize} className="btn-ghost text-[11px]">
          + Add size
        </button>
      </div>
      {availSuggestions.length > 0 && (
        <div className="mt-2" data-testid="size-suggestions">
          <div className="t-tiny text-base-400 mb-1">Quick add from pool</div>
          <div className="flex flex-wrap gap-1.5">
            {availSuggestions.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => addSizeValue(s.value)}
                disabled={toggle.isPending}
                title={s.label ?? s.dimensions ?? undefined}
                className="t-tiny px-2.5 py-1 rounded-full border border-dashed border-base-300 text-base-500 hover:border-base-500 hover:text-base-700 transition-colors disabled:opacity-50"
                data-testid={`size-suggestion-${s.value}`}
              >
                + {s.value}
              </button>
            ))}
          </div>
        </div>
      )}
      <p className="t-tiny text-base-400 mt-1.5">
        Turning a size on/off shows or hides every SKU of that size from dealers.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 0181 — Special add-ons offered: which (principal-authored, category-matching)
// special add-ons this model offers at POS. Writes allowed_options.specials
// (codes). Internal-editable (model patch is internal); the add-on defs + prices
// are principal-only (Special Add-ons tab).
// ---------------------------------------------------------------------------

function SpecialAddonsOfferedPanel({
  model,
  pool,
}: {
  model: ProductModelDto;
  pool: SpecialAddonDto[];
}) {
  const patch = usePatchCatalogModel();
  const offered: string[] = (model.allowedOptions?.specials ?? []) as string[];

  function toggle(code: string) {
    const next = offered.includes(code) ? offered.filter((c) => c !== code) : [...offered, code];
    const allowedOptions: AllowedOptions = { ...(model.allowedOptions ?? {}), specials: next };
    patch.mutate(
      { id: model.id, patch: { allowedOptions } },
      { onError: (e: unknown) => toast.error(e instanceof ApiError ? e.message : "Update failed") },
    );
  }

  const fmt = (n: number) => `${n < 0 ? "−" : "+"}RM ${Math.abs(n).toLocaleString("en-MY")}`;

  return (
    <div>
      <div className="label mb-1">Special add-ons offered</div>
      <p className="t-tiny text-base-500 mb-2">
        Tick which special add-ons this model offers at POS. Author them in the Special Add-ons tab.
      </p>
      {pool.length === 0 ? (
        <p className="t-tiny text-base-400">
          No special add-ons for {CATEGORY_LABEL[model.category]} yet.
        </p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {pool.map((a) => (
            <label
              key={a.id}
              className="flex items-center gap-2 t-small"
              data-testid={`model-special-${a.code}`}
            >
              <input
                type="checkbox"
                checked={offered.includes(a.code)}
                onChange={() => toggle(a.code)}
              />
              <span className="text-base-800">{a.label}</span>
              <span className="t-tiny text-base-400">
                {fmt(a.sellingPrice)}
                {a.optionGroups.length > 0 ? ` · ${a.optionGroups.length}Q` : ""}
              </span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

// Generic chip pool (compartments / colours / gaps) — pure allowed_options pool
// ---------------------------------------------------------------------------

function ChipPool({
  model,
  axis,
  values,
}: {
  model: ProductModelDto;
  axis: Exclude<OptionAxis, "sizes">;
  values: string[];
}) {
  const patch = usePatchCatalogModel();
  const [adding, setAdding] = useState("");

  function write(next: string[]) {
    const allowedOptions: AllowedOptions = { ...(model.allowedOptions ?? {}), [axis]: next };
    patch.mutate(
      { id: model.id, patch: { allowedOptions } },
      {
        onError: (e: unknown) =>
          toast.error(e instanceof ApiError ? e.message : "Update failed"),
      },
    );
  }

  function add() {
    const v = adding.trim();
    setAdding("");
    if (!v || values.includes(v)) return;
    write([...values, v]);
  }

  return (
    <div>
      <div className="label mb-2">{AXIS_LABEL[axis]}</div>
      <div className="flex flex-wrap gap-1.5">
        {values.length === 0 && <span className="t-tiny text-base-400">None yet.</span>}
        {values.map((v) => (
          <span
            key={v}
            className="inline-flex items-center gap-1 t-tiny font-medium px-2.5 py-1 rounded-full bg-base-100 text-base-700"
          >
            {v}
            <button
              type="button"
              onClick={() => write(values.filter((x) => x !== v))}
              disabled={patch.isPending}
              aria-label={`Remove ${v}`}
              className="text-base-400 hover:text-danger leading-none"
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2 mt-2">
        <input
          value={adding}
          onChange={(e) => setAdding(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") add();
          }}
          placeholder={`Add a ${AXIS_LABEL[axis].toLowerCase().replace(/s$/, "")}`}
          className={`${INPUT_CLS} max-w-[220px]`}
        />
        <button type="button" onClick={add} className="btn-ghost text-[11px]">
          + Add
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Variant SKU table — per-SKU pos_active toggle + All on / All off
// ---------------------------------------------------------------------------

function VariantSkuTable({ skus }: { skus: ProductSkuDto[] }) {
  const patch = usePatchCatalogSku();
  const [bulkBusy, setBulkBusy] = useState(false);
  // Track the single SKU mid-toggle so one in-flight mutation doesn't disable
  // every row's pill (the shared hook's isPending would otherwise freeze all).
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const sorted = useMemo(
    () => [...skus].sort((a, b) => a.variant.localeCompare(b.variant, undefined, { numeric: true })),
    [skus],
  );

  function toggleOne(sku: ProductSkuDto) {
    setTogglingId(sku.id);
    patch.mutate(
      { id: sku.id, patch: { posActive: sku.posActive === false } },
      {
        onError: (e: unknown) =>
          toast.error(e instanceof ApiError ? e.message : "Update failed"),
        onSettled: () => setTogglingId((cur) => (cur === sku.id ? null : cur)),
      },
    );
  }

  async function setAll(next: boolean) {
    setBulkBusy(true);
    const results = await Promise.allSettled(
      sorted
        .filter((s) => (s.posActive !== false) !== next)
        .map((s) => patch.mutateAsync({ id: s.id, patch: { posActive: next } })),
    );
    setBulkBusy(false);
    const failed = results.filter((r) => r.status === "rejected").length;
    if (failed > 0) toast.error(`${failed} SKU${failed === 1 ? "" : "s"} failed`);
    else toast.success(next ? "All SKUs ON" : "All SKUs OFF");
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="label">Variant SKUs ({sorted.length})</div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setAll(true)}
            disabled={bulkBusy || sorted.length === 0}
            className="btn-ghost text-[11px]"
          >
            All on
          </button>
          <button
            type="button"
            onClick={() => setAll(false)}
            disabled={bulkBusy || sorted.length === 0}
            className="btn-ghost text-[11px]"
          >
            All off
          </button>
        </div>
      </div>
      <div className="border border-base-200 rounded-[4px] overflow-hidden">
        {sorted.length === 0 && (
          <div className="t-tiny text-base-400 px-3 py-3">
            No SKUs yet. Use Generate SKUs (sizes) or + New SKU.
          </div>
        )}
        {sorted.map((sku) => (
          <div
            key={sku.id}
            className="grid items-center gap-3 px-3 py-1.5 border-b border-base-100 last:border-b-0"
            style={{ gridTemplateColumns: "1fr 90px 64px", opacity: sku.discontinuedAt ? 0.5 : 1 }}
            data-testid={`variant-row-${sku.sku}`}
          >
            <div className="min-w-0">
              <div className="t-small text-base-800">{sku.variant}</div>
              <div className="font-mono text-[10px] text-base-500">{sku.sku}</div>
            </div>
            <div className="text-right t-num text-[11px] text-base-700">
              {sku.price === 0 ? <span className="text-base-400">—</span> : sku.price.toFixed(2)}
            </div>
            <div className="text-right">
              <button
                type="button"
                onClick={() => toggleOne(sku)}
                disabled={togglingId === sku.id || bulkBusy || !!sku.discontinuedAt}
                title="Toggle visible to dealers"
                aria-label={`Toggle ${sku.sku}`}
              >
                <SkuStatusPill posActive={sku.posActive !== false} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sofa fabrics panel — list fabrics per model + per-model tier delta override
// ---------------------------------------------------------------------------

const TIER_LABELS: Record<FabricTierValue, string> = {
  PRICE_1: "P1 – Base",
  PRICE_2: "P2 – Mid",
  PRICE_3: "P3 – Premium",
};

function SofaFabricsPanel({
  model,
  fabrics,
  tierOverride,
  isPrincipal,
}: {
  model: ProductModelDto;
  fabrics: SofaFabricDto[];
  tierOverride: { modelId: string; tier2Delta: number | null; tier3Delta: number | null } | null;
  isPrincipal: boolean;
}) {
  const [adding, setAdding] = useState(false);

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <div className="label">Fabrics</div>
        {isPrincipal && (
          <button
            type="button"
            onClick={() => setAdding((v) => !v)}
            className="btn-ghost text-[11px]"
            data-testid="fabric-add-toggle"
          >
            {adding ? "Close" : "+ Add fabric"}
          </button>
        )}
      </div>
      <p className="t-tiny text-base-500 mb-3">
        Fabric options for this sofa model. Tier sets the price band (P1 = base, no delta).
        {!isPrincipal && " Tier is principal-only — read-only for your role."}
      </p>

      {adding && (
        <FabricAddForm
          modelId={model.id}
          isPrincipal={isPrincipal}
          onDone={() => setAdding(false)}
        />
      )}

      <div className="border border-base-200 rounded-[4px] overflow-hidden mb-4">
        <div
          className="grid items-center gap-3 px-3 py-2 bg-base-50 border-b border-base-200"
          style={{ gridTemplateColumns: "minmax(120px,1fr) 100px 96px 64px" }}
        >
          <div className="label">Fabric name</div>
          <div className="label">Surcharge (RM)</div>
          <div className="label">Tier</div>
          <div className="label" />
        </div>
        {fabrics.length === 0 && (
          <div className="t-small text-base-500 px-3 py-3">No fabrics yet.</div>
        )}
        {fabrics.map((f) => (
          <FabricRow key={f.id} fabric={f} isPrincipal={isPrincipal} />
        ))}
      </div>

      <TierDeltaOverrideCard
        model={model}
        override={tierOverride}
        isPrincipal={isPrincipal}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// 0178 — Offered compartments panel: which pool compartments this sofa model
// offers. The price column edits the synced `{MODEL_KEY}-{code}` SKU's price —
// the SKU Master row, which is the AUTHORITATIVE à-la-carte compartment price
// (Loo, 2026-07-05). Sofa-only, principal-gated.
// ---------------------------------------------------------------------------

function SofaCompartmentsOfferedPanel({
  modelId,
  modelKey,
  pool,
  offered,
  skus,
  isPrincipal,
}: {
  modelId: string;
  modelKey: string;
  pool: SofaCompartmentDto[];
  offered: ModelSofaCompartmentDto[];
  /** This model's SKUs (admin bundle — includes the pos_active=false synced
   *  compartment SKUs), used to read + edit each compartment's price. */
  skus: ProductSkuDto[];
  isPrincipal: boolean;
}) {
  const upsert = useUpsertModelSofaCompartment();
  const del = useDeleteModelSofaCompartment();
  const patchSku = usePatchCatalogSku();
  const offeredById = new Map(offered.map((o) => [o.compartmentId, o]));
  // The synced compartment SKU rows, keyed by compartment id (Phase 5 sync
  // stamps product_skus.compartment_id).
  const skuByCompId = new Map(
    skus.filter((s) => s.compartmentId != null).map((s) => [s.compartmentId as string, s]),
  );

  // Phase 5 — offering a compartment auto-syncs a real product_skus row whose
  // sku is the shared `deriveSkuCode(modelKey, code)` (one formula, no drift with
  // the api mint). It is always pos_active=false, so it never shows in the flat
  // POS grid. Derived client-side for a read-back so the principal sees the sync
  // landed — no API round-trip needed.
  const syncedSku = (code: string) => deriveSkuCode(modelKey, code);

  function toggle(comp: SofaCompartmentDto, on: boolean) {
    const opts = {
      onError: (e: unknown) => toast.error(e instanceof ApiError ? e.message : "Update failed"),
    };
    if (on) {
      upsert.mutate({ modelId, compartmentId: comp.id, input: {} }, opts);
    } else {
      del.mutate({ modelId, compartmentId: comp.id }, opts);
    }
  }

  function commitSkuPrice(comp: SofaCompartmentDto, raw: string) {
    const row = skuByCompId.get(comp.id);
    if (!row) return;
    const trimmed = raw.trim();
    if (trimmed === "") return;
    const next = Number(trimmed);
    if (!Number.isFinite(next) || next < 0 || next === row.price) return;
    patchSku.mutate(
      { id: row.id, patch: { price: next } },
      { onError: (e: unknown) => toast.error(e instanceof ApiError ? e.message : "Update failed") },
    );
  }

  const COLS = "44px 110px minmax(120px,1fr) 130px";

  return (
    <div className="mb-4">
      <div className="label mb-1">Offered compartments</div>
      <p className="t-tiny text-base-500 mb-3">
        Tick which pool compartments this sofa model offers. The price edits the
        compartment&apos;s own SKU (the same row as SKU Master) — that SKU price
        is what the sofa builder charges.
        {!isPrincipal && " Principal only — read-only for your role."}
      </p>
      <div className="border border-base-200 rounded-[4px] overflow-hidden">
        <div
          className="grid items-center gap-3 px-3 py-2 bg-base-50 border-b border-base-200"
          style={{ gridTemplateColumns: COLS }}
        >
          <div className="label">Offer</div>
          <div className="label">Code</div>
          <div className="label">Description</div>
          <div className="label text-right">Price (RM)</div>
        </div>
        {pool.length === 0 && (
          <div className="t-small text-base-500 px-3 py-3">
            No compartments in the pool yet — add them in Maintenance → Sofa Compartments.
          </div>
        )}
        {pool.map((comp) => {
          const row = offeredById.get(comp.id);
          const isOffered = row != null;
          const skuRow = skuByCompId.get(comp.id);
          return (
            <div
              key={comp.id}
              className="grid items-center gap-3 px-3 py-2 border-b border-base-100 last:border-b-0"
              style={{ gridTemplateColumns: COLS }}
              data-testid={`offered-row-${comp.code}`}
            >
              <input
                type="checkbox"
                checked={isOffered}
                disabled={!isPrincipal}
                onChange={(e) => toggle(comp, e.target.checked)}
                aria-label={`offer ${comp.code}`}
                data-testid={`offered-check-${comp.code}`}
              />
              <CodeChip>{comp.code}</CodeChip>
              <div className="min-w-0">
                <span className="t-small text-base-600 truncate block">{comp.description ?? "—"}</span>
                {isOffered && (
                  <span
                    className="font-mono text-[10px] text-base-400 truncate block"
                    title="Auto-synced catalog SKU (hidden from the POS grid)"
                    data-testid={`synced-sku-${comp.code}`}
                  >
                    → {syncedSku(comp.code)} · pos off
                  </span>
                )}
              </div>
              <input
                key={`sp-${comp.id}-${skuRow?.price ?? "x"}-${isOffered}`}
                type="number"
                min={0}
                step="0.01"
                defaultValue={isOffered && skuRow ? skuRow.price : ""}
                placeholder={isOffered ? "0.00" : ""}
                disabled={!isPrincipal || !isOffered || !skuRow}
                onBlur={(e) => commitSkuPrice(comp, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                }}
                aria-label={`${comp.code} price`}
                title="Writes to the compartment's SKU price (SKU Master)"
                className={`${INPUT_CLS} text-right t-num text-[12px] disabled:opacity-50`}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function FabricRow({
  fabric,
  isPrincipal,
}: {
  fabric: SofaFabricDto;
  isPrincipal: boolean;
}) {
  const patch = usePatchSofaFabric();
  const del = useDeleteSofaFabric();

  function commitName(raw: string) {
    const next = raw.trim();
    if (next.length < 1 || next === fabric.fabricName) return;
    patch.mutate(
      { id: fabric.id, patch: { fabricName: next } },
      { onError: (e: unknown) => toast.error(e instanceof ApiError ? e.message : "Update failed") },
    );
  }

  function setTier(tier: FabricTierValue) {
    if (tier === fabric.tier) return;
    patch.mutate(
      { id: fabric.id, patch: { tier } },
      { onError: (e: unknown) => toast.error(e instanceof ApiError ? e.message : "Update failed") },
    );
  }

  function remove() {
    if (!confirm(`Remove fabric "${fabric.fabricName}"?`)) return;
    del.mutate(fabric.id, {
      onSuccess: () => toast.success(`${fabric.fabricName} removed`),
      onError: (e: unknown) => toast.error(e instanceof ApiError ? e.message : "Remove failed"),
    });
  }

  return (
    <div
      className="grid items-center gap-3 px-3 py-2 border-b border-base-100 last:border-b-0"
      style={{ gridTemplateColumns: "minmax(120px,1fr) 100px 96px 64px" }}
      data-testid={`fabric-row-${fabric.id}`}
    >
      {isPrincipal ? (
        <input
          defaultValue={fabric.fabricName}
          onBlur={(e) => commitName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
          aria-label={`${fabric.id} name`}
          className="w-full px-2 py-1 border border-transparent hover:border-base-200 focus:border-base-400 rounded-[3px] text-[13px] outline-none bg-transparent"
          data-testid={`fabric-name-input-${fabric.id}`}
        />
      ) : (
        <span className="t-small text-base-800 px-2" data-testid={`fabric-name-readonly-${fabric.id}`}>{fabric.fabricName}</span>
      )}
      <div className="t-num text-[12px] text-base-700 px-2">
        {fabric.surcharge > 0 ? `+${fabric.surcharge.toFixed(2)}` : "—"}
      </div>
      {isPrincipal ? (
        <select
          value={fabric.tier}
          onChange={(e) => setTier(e.target.value as FabricTierValue)}
          disabled={patch.isPending}
          aria-label={`${fabric.id} tier`}
          className={`${INPUT_CLS} text-[12px] py-0.5`}
          data-testid={`fabric-tier-${fabric.id}`}
        >
          {(Object.keys(TIER_LABELS) as FabricTierValue[]).map((t) => (
            <option key={t} value={t}>{TIER_LABELS[t]}</option>
          ))}
        </select>
      ) : (
        <span className="t-tiny text-base-600 px-2" data-testid={`fabric-tier-readonly-${fabric.id}`}>{TIER_LABELS[fabric.tier]}</span>
      )}
      <div className="text-right">
        {isPrincipal ? (
          <button
            type="button"
            onClick={remove}
            disabled={del.isPending}
            className="btn-danger text-[11px]"
            data-testid={`fabric-remove-${fabric.id}`}
          >
            Remove
          </button>
        ) : (
          <span />
        )}
      </div>
    </div>
  );
}

function FabricAddForm({
  modelId,
  isPrincipal,
  onDone,
}: {
  modelId: string;
  isPrincipal: boolean;
  onDone: () => void;
}) {
  const create = useCreateSofaFabric();
  const [name, setName] = useState("");
  const [surcharge, setSurcharge] = useState("0");
  const [tier, setTier] = useState<FabricTierValue>("PRICE_1");

  const surNum = Number(surcharge);
  const valid = name.trim().length >= 1 && Number.isFinite(surNum) && surNum >= 0;

  async function submit() {
    if (!valid) return;
    try {
      await create.mutateAsync({
        modelId,
        fabricName: name.trim(),
        surcharge: surNum,
        tier: isPrincipal ? tier : "PRICE_1",
      });
      toast.success(`Added ${name.trim()}`);
      onDone();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Add failed");
    }
  }

  return (
    <div className="bg-base-50 border border-base-200 rounded-[4px] p-4 mb-3 flex flex-wrap gap-3 items-end">
      <label className="block">
        <span className="label block mb-1">Name</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Cloud Linen"
          className={`${INPUT_CLS} w-40`}
          data-testid="fabric-add-name"
        />
      </label>
      <label className="block">
        <span className="label block mb-1">Surcharge (RM)</span>
        <input
          type="number"
          min={0}
          step="0.01"
          value={surcharge}
          onChange={(e) => setSurcharge(e.target.value)}
          className={`${INPUT_CLS} w-28`}
          data-testid="fabric-add-surcharge"
        />
      </label>
      {isPrincipal && (
        <label className="block">
          <span className="label block mb-1">Tier</span>
          <select
            value={tier}
            onChange={(e) => setTier(e.target.value as FabricTierValue)}
            className={`${INPUT_CLS} text-[12px]`}
            data-testid="fabric-add-tier"
          >
            {(Object.keys(TIER_LABELS) as FabricTierValue[]).map((t) => (
              <option key={t} value={t}>{TIER_LABELS[t]}</option>
            ))}
          </select>
        </label>
      )}
      <button
        type="button"
        onClick={submit}
        disabled={!valid || create.isPending}
        className="btn-primary text-[12px] disabled:opacity-40"
        data-testid="fabric-add-submit"
      >
        {create.isPending ? "Adding…" : "Add fabric"}
      </button>
    </div>
  );
}

/**
 * Per-model tier delta override card. Null delta = inherit from global config.
 * Principal-gated: only principal can edit the numeric inputs.
 */
function TierDeltaOverrideCard({
  model,
  override,
  isPrincipal,
}: {
  model: ProductModelDto;
  override: { modelId: string; tier2Delta: number | null; tier3Delta: number | null } | null;
  isPrincipal: boolean;
}) {
  const upsert = useUpsertModelFabricTierOverride();

  const [t2, setT2] = useState(override?.tier2Delta !== null && override?.tier2Delta !== undefined ? String(override.tier2Delta) : "");
  const [t3, setT3] = useState(override?.tier3Delta !== null && override?.tier3Delta !== undefined ? String(override.tier3Delta) : "");

  // Re-sync when override changes (another session or our own save)
  useEffect(() => {
    setT2(override?.tier2Delta !== null && override?.tier2Delta !== undefined ? String(override.tier2Delta) : "");
    setT3(override?.tier3Delta !== null && override?.tier3Delta !== undefined ? String(override.tier3Delta) : "");
  }, [override?.tier2Delta, override?.tier3Delta]);

  const t2Num = t2.trim() === "" ? null : Number(t2);
  const t3Num = t3.trim() === "" ? null : Number(t3);
  const t2Valid = t2Num === null || (Number.isFinite(t2Num) && t2Num >= 0);
  const t3Valid = t3Num === null || (Number.isFinite(t3Num) && t3Num >= 0);

  const dirty =
    t2Num !== (override?.tier2Delta ?? null) ||
    t3Num !== (override?.tier3Delta ?? null);

  function save() {
    if (!t2Valid || !t3Valid || !dirty) return;
    upsert.mutate(
      { modelId: model.id, tier2Delta: t2Num, tier3Delta: t3Num },
      {
        onSuccess: () => toast.success("Tier override saved"),
        onError: (e: unknown) => toast.error(e instanceof ApiError ? e.message : "Save failed"),
      },
    );
  }

  return (
    <div>
      <div className="label mb-1">Tier delta override (blank = use global)</div>
      <p className="t-tiny text-base-500 mb-2">
        Per-model premium added to base price for P2 / P3 fabrics on this model.
        Leave blank to inherit from global Fabric tier deltas.
        {!isPrincipal && " Principal only — read-only for your role."}
      </p>
      <div className="bg-white border border-base-200 rounded-[4px] p-4 flex flex-wrap gap-4 items-end">
        <label className="block">
          <span className="label block mb-1">P2 delta (RM)</span>
          <input
            type="number"
            min={0}
            step="0.01"
            value={t2}
            disabled={!isPrincipal}
            onChange={(e) => setT2(e.target.value)}
            placeholder="global"
            className={`${INPUT_CLS} w-28 disabled:opacity-60`}
            data-testid={`model-tier2-delta-${model.id}`}
          />
        </label>
        <label className="block">
          <span className="label block mb-1">P3 delta (RM)</span>
          <input
            type="number"
            min={0}
            step="0.01"
            value={t3}
            disabled={!isPrincipal}
            onChange={(e) => setT3(e.target.value)}
            placeholder="global"
            className={`${INPUT_CLS} w-28 disabled:opacity-60`}
            data-testid={`model-tier3-delta-${model.id}`}
          />
        </label>
        {isPrincipal && (
          <button
            type="button"
            onClick={save}
            disabled={!t2Valid || !t3Valid || !dirty || upsert.isPending}
            className="btn-primary text-[12px] disabled:opacity-40"
            data-testid={`model-tier-override-save-${model.id}`}
          >
            {upsert.isPending ? "Saving…" : "Save override"}
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Generate SKUs modal
// ---------------------------------------------------------------------------

function GenerateSkusModal({
  model,
  universe,
  existing,
  onClose,
}: {
  model: ProductModelDto;
  universe: string[];
  existing: Set<string>;
  onClose: () => void;
}) {
  const gen = useGenerateSkus();
  // Default-tick the sizes that don't have a SKU yet (the useful case); keep
  // existing ones unticked so the dialog reads as "what's missing".
  const [ticked, setTicked] = useState<Set<string>>(
    () => new Set(universe.filter((s) => !existing.has(s))),
  );
  const [price, setPrice] = useState("");

  function toggle(size: string) {
    setTicked((prev) => {
      const n = new Set(prev);
      if (n.has(size)) n.delete(size);
      else n.add(size);
      return n;
    });
  }

  const variants = Array.from(ticked);
  const priceNum = price.trim() === "" ? undefined : Number(price);
  const priceValid = priceNum === undefined || (Number.isFinite(priceNum) && priceNum >= 0);

  function submit() {
    if (variants.length === 0 || !priceValid) return;
    gen.mutate(
      { modelId: model.id, input: { variants, ...(priceNum !== undefined ? { price: priceNum } : {}) } },
      {
        onSuccess: (r) => {
          toast.success(`Generated ${r.generated} · skipped ${r.skipped}`);
          onClose();
        },
        onError: (e: unknown) =>
          toast.error(e instanceof ApiError ? e.message : "Generate failed"),
      },
    );
  }

  return (
    <Modal title={`Generate SKUs · ${model.name}`} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <div>
          <div className="label mb-1.5">Sizes</div>
          <div className="flex flex-wrap gap-1.5">
            {universe.length === 0 && (
              <span className="t-tiny text-base-400">
                No sizes defined. Add sizes in Active sizes first.
              </span>
            )}
            {universe.map((size) => {
              const on = ticked.has(size);
              const made = existing.has(size);
              return (
                <button
                  key={size}
                  type="button"
                  onClick={() => toggle(size)}
                  aria-pressed={on}
                  className={`t-tiny font-semibold px-2.5 py-1 rounded-full border transition-colors ${
                    on
                      ? "bg-base-900 text-white border-base-900"
                      : "bg-white text-base-500 border-base-300 hover:border-base-500"
                  }`}
                  title={made ? "Already has a SKU (will be skipped if re-ticked)" : ""}
                >
                  {size}
                  {made && " ✓"}
                </button>
              );
            })}
          </div>
          <p className="t-tiny text-base-400 mt-1.5">
            Codes mint as <span className="font-mono">{model.modelKey.toUpperCase()}-SIZE</span>. Existing
            codes are skipped.
          </p>
        </div>
        <label className="block">
          <span className="label block mb-1">Default price (RM, optional)</span>
          <input
            type="number"
            min={0}
            step="0.01"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="0.00 — set later in SKU Master"
            className={INPUT_CLS}
          />
        </label>
      </div>
      <ModalActions
        onCancel={onClose}
        onPrimary={submit}
        primary={`Generate ${variants.length}`}
        primaryDisabled={variants.length === 0 || !priceValid}
        primaryPending={gen.isPending}
      />
    </Modal>
  );
}
