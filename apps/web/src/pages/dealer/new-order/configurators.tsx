import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Minus, Plus, LayoutGrid } from "lucide-react";
import type {
  ProductCategory,
  ProductModelDto,
  ProductSkuDto,
  SofaFabricDto,
  FabricTierGlobalConfig,
  ModelFabricTierOverrideDto,
  SofaCompartmentDto,
  ModelSofaCompartmentDto,
  SofaComboDto,
  FabricTierConfigDto,
} from "@carres/shared";
import { resolveFabricDelta } from "@carres/shared";
import type { DraftLine } from "./draft";
import SofaBuildCanvas from "../sofa-build/SofaBuildCanvas";
import { buildToDraftLine } from "../sofa-build/sofa-build-draft";

/**
 * Per-category product configurators + the sofa-mutex helper, extracted from
 * the legacy `ProductPicker` so BOTH the old inline picker (now removed) and
 * the new full-screen POS catalog flow (`dealer/pos/*`) build identical
 * `DraftLine` objects from one source of truth.
 *
 * Each configurator owns its own transient state and only commits a DraftLine
 * via `onAdd` when the user clicks Add. The CALLER is responsible for forcing
 * a remount (`key={model.id}`) when the selected model changes — see the
 * SO-1006 note in `SofaConfigurator` / `BedframeConfigurator` below.
 */

/** The three configurable product families (accessory/service have no
 *  variant axis and are not sold through these configurators). */
export const PRODUCT_CATEGORIES: { key: ProductCategory; label: string; icon: string }[] = [
  { key: "mattress", label: "Mattress", icon: "▭" },
  { key: "bedframe", label: "Bed Frame", icon: "▤" },
  { key: "sofa", label: "Sofa", icon: "▦" },
];

/**
 * Compute the set of categories that are locked out for "Add line" given the
 * lines already on the draft. Business rule (Loo 2026-05-11, migration 0089):
 * sofa is mutually exclusive with mattress + bedframe at the order level.
 * Mattress + bedframe can co-exist with each other.
 *
 * Exported for unit tests; the server-side mutex lives in migration 0089's
 * create_order RPC so direct API hits can't bypass this UI gate.
 */
export function lockedCategoriesFor(
  draftLines: DraftLine[],
  skuToCategory: Map<string, ProductCategory>,
): Set<ProductCategory> {
  const present = new Set<ProductCategory>();
  for (const l of draftLines) {
    const cat = skuToCategory.get(l.sku);
    if (cat) present.add(cat);
  }
  const locked = new Set<ProductCategory>();
  if (present.has("sofa")) {
    locked.add("mattress");
    locked.add("bedframe");
  }
  if (present.has("mattress") || present.has("bedframe")) {
    locked.add("sofa");
  }
  return locked;
}

export function newLocalId(): string {
  // crypto.randomUUID is available in modern browsers and JSDOM 22+.
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function MattressConfigurator({
  model,
  skus,
  onAdd,
}: {
  model: ProductModelDto;
  skus: ProductSkuDto[];
  onAdd: (line: DraftLine) => void;
}) {
  const [skuId, setSkuId] = useState<string>("");
  const [qty, setQty] = useState(1);
  const sku = skus.find((s) => s.id === skuId);

  function add() {
    if (!sku) return;
    onAdd({
      localId: newLocalId(),
      sku: sku.sku,
      qty,
      attrs: null,
      unitPrice: sku.price,
      label: `${model.name} · ${sku.variant}`,
    });
    setSkuId("");
    setQty(1);
  }

  return (
    <div className="flex flex-col gap-5">
      <FieldLabel label="Size">
        <select
          value={skuId}
          onChange={(e) => setSkuId(e.target.value)}
          className={selectClass()}
        >
          <option value="">— pick size —</option>
          {skus.map((s) => (
            <option key={s.id} value={s.id}>
              {s.variant} · RM {s.price.toLocaleString()}
            </option>
          ))}
        </select>
      </FieldLabel>

      <div className="flex items-end justify-between gap-4">
        <QtyPill qty={qty} onChange={setQty} />
        <button
          onClick={add}
          disabled={!sku}
          className="btn-primary whitespace-nowrap"
        >
          + Add
        </button>
      </div>
    </div>
  );
}

export function BedframeConfigurator({
  model,
  skus,
  onAdd,
}: {
  model: ProductModelDto;
  skus: ProductSkuDto[];
  onAdd: (line: DraftLine) => void;
}) {
  // 2026-05-18 (Loo screenshot — SO-1006 saved no fabric / no color). The
  // CALLER must remount this with `key={model.id}` on model switch so
  // useState(model.colors?.[0]) + useState(model.gaps?.[0]) re-init with the
  // new model's defaults. Without the remount, dropdown state leaks across
  // models — a stale color/gap id matches nothing in the new model's options,
  // the dropdown silently renders blank, and the line is added with attrs that
  // don't reflect a real selection.
  const [skuId, setSkuId] = useState<string>("");
  const [color, setColor] = useState<string>(model.colors?.[0] ?? "");
  const [gap, setGap] = useState<string>(model.gaps?.[0] ?? "");
  const [qty, setQty] = useState(1);
  const sku = skus.find((s) => s.id === skuId);

  function add() {
    if (!sku) return;
    onAdd({
      localId: newLocalId(),
      sku: sku.sku,
      qty,
      attrs: { color, gap },
      unitPrice: sku.price,
      label: `${model.name} · ${sku.variant} · ${color}${gap ? ` · gap ${gap}` : ""}`,
    });
    setSkuId("");
    setQty(1);
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-3 gap-3">
        <FieldLabel label="Size">
          <select
            value={skuId}
            onChange={(e) => setSkuId(e.target.value)}
            className={selectClass()}
          >
            <option value="">— pick size —</option>
            {skus.map((s) => (
              <option key={s.id} value={s.id}>
                {s.variant} · RM {s.price.toLocaleString()}
              </option>
            ))}
          </select>
        </FieldLabel>
        <FieldLabel label="Color">
          <select
            value={color}
            onChange={(e) => setColor(e.target.value)}
            disabled={!model.colors?.length}
            className={selectClass({ disabled: !model.colors?.length })}
          >
            {(model.colors ?? []).map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </FieldLabel>
        <FieldLabel label="Gap">
          <select
            value={gap}
            onChange={(e) => setGap(e.target.value)}
            disabled={!model.gaps?.length}
            className={selectClass({ disabled: !model.gaps?.length })}
          >
            <option value="">— none —</option>
            {(model.gaps ?? []).map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </FieldLabel>
      </div>

      <div className="flex items-end justify-between gap-4">
        <QtyPill qty={qty} onChange={setQty} />
        <button
          onClick={add}
          disabled={!sku}
          className="btn-primary whitespace-nowrap"
        >
          + Add
        </button>
      </div>
    </div>
  );
}

export function SofaConfigurator({
  model,
  skus,
  fabrics,
  fabricTierConfig,
  modelFabricTierOverrides,
  onAdd,
}: {
  model: ProductModelDto;
  skus: ProductSkuDto[];
  fabrics: SofaFabricDto[];
  /** Global tier delta config (from catalog bundle, migration 0176). May be absent on pre-0176 bundles — safe fallback is delta=0. */
  fabricTierConfig?: FabricTierGlobalConfig | null;
  /** Per-model tier overrides array (from catalog bundle). May be absent; looked up by model.id. */
  modelFabricTierOverrides?: ModelFabricTierOverrideDto[] | null;
  onAdd: (line: DraftLine) => void;
}) {
  // Mode = 'preset' (pick a complete sub-model) or 'custom' (pick a part).
  // sofa_mode tells which modes are allowed; 'both' shows tabs.
  //
  // 2026-05-18 (Loo screenshot — SO-1006 Kestrel L-shape saved
  // `attrs = { mode: "preset" }` with NO fabric even though Kestrel has 2
  // fabrics). useState(fabrics[0]?.id) only runs on initial mount, so the
  // CALLER must remount with `key={model.id}` on model switch — otherwise the
  // old model's fabric id sticks, matches no new-model option, and the line is
  // added blank.
  const allowed: ("preset" | "custom")[] =
    model.sofaMode === "both"
      ? ["preset", "custom"]
      : model.sofaMode === "custom"
        ? ["custom"]
        : ["preset"];
  const [mode, setMode] = useState<"preset" | "custom">(allowed[0] ?? "preset");
  const [skuId, setSkuId] = useState<string>("");
  const [fabricId, setFabricId] = useState<string>(fabrics[0]?.id ?? "");
  const [qty, setQty] = useState(1);

  // Preset mode selects from variant_kind='preset'; custom picks from 'part'.
  const skusForMode = skus.filter((s) =>
    mode === "preset" ? s.variantKind === "preset" : s.variantKind === "part",
  );

  const sku = skusForMode.find((s) => s.id === skuId);
  const fabric = fabrics.find((f) => f.id === fabricId);

  // Per-model override (null means "inherit from global config").
  const overrideForThisModel =
    modelFabricTierOverrides?.find((o) => o.modelId === model.id) ?? null;

  // Resolve effective delta via the tier helper. For PRICE_1 (or when config
  // is absent/pre-0176), this always returns 0 — identical to the old surcharge
  // path. The legacy per-fabric `fabric.surcharge` is NOT added on top; it is
  // now superseded by the tier delta as the price knob.
  const effectiveDelta = resolveFabricDelta(
    fabric?.tier ?? "PRICE_1",
    overrideForThisModel,
    fabricTierConfig ?? null,
  );

  const unitPrice = (sku?.price ?? 0) + effectiveDelta;

  function add() {
    if (!sku) return;
    const attrs: Record<string, unknown> = { mode };
    if (fabric) {
      // 2026-05-12 (Loo): persist fabric_id (FK) alongside fabric_name
      // (display) + fabric_surcharge (price). Without fabric_id, the
      // operation CreatePOModal autofill cascade can't pre-select the fabric
      // chip even when the dealer DID pick one — the cascade keys off id.
      // fabric_surcharge carries the resolved effectiveDelta so the DraftLine
      // contract is unchanged. fabric_tier is the new metadata key (additive).
      attrs.fabric_id = fabric.id;
      attrs.fabric_name = fabric.fabricName;
      attrs.fabric_surcharge = effectiveDelta;
      attrs.fabric_tier = fabric.tier;
    }
    onAdd({
      localId: newLocalId(),
      sku: sku.sku,
      qty,
      attrs,
      unitPrice,
      label: `${model.name} · ${sku.variant}${fabric ? ` · ${fabric.fabricName}` : ""}${effectiveDelta > 0 ? ` (+RM ${effectiveDelta})` : ""}`,
    });
    setSkuId("");
    setFabricId(fabrics[0]?.id ?? "");
    setQty(1);
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Mode pills (visible only when sofa_mode='both') — 2990s chip style */}
      {allowed.length > 1 && (
        <div className="flex gap-2">
          {allowed.map((m) => (
            <button
              key={m}
              onClick={() => {
                setMode(m);
                setSkuId("");
              }}
              className={[
                "px-4 py-2 text-[13px] font-semibold rounded-xl border-[1.5px] transition-colors",
                mode === m
                  ? "pos-selected border-primary bg-signature-50 text-primary"
                  : "border-base-200 text-base-600 hover:border-primary/40",
              ].join(" ")}
            >
              {m === "preset" ? "Preset" : "Custom (parts)"}
            </button>
          ))}
        </div>
      )}

      {skusForMode.length === 0 && (
        <p className="t-small text-base-500">No {mode} variants for this model yet.</p>
      )}

      <div className="grid grid-cols-2 gap-3">
        <FieldLabel label={mode === "preset" ? "Preset" : "Part"}>
          <select
            value={skuId}
            onChange={(e) => setSkuId(e.target.value)}
            disabled={skusForMode.length === 0}
            className={selectClass({ disabled: skusForMode.length === 0 })}
          >
            <option value="">— pick {mode === "preset" ? "preset" : "part"} —</option>
            {skusForMode.map((s) => (
              <option key={s.id} value={s.id}>
                {s.variant} · RM {s.price.toLocaleString()}
              </option>
            ))}
          </select>
        </FieldLabel>
        <FieldLabel label="Fabric">
          <select
            value={fabricId}
            onChange={(e) => setFabricId(e.target.value)}
            disabled={fabrics.length === 0}
            className={selectClass({ disabled: fabrics.length === 0 })}
          >
            {fabrics.length === 0 && <option value="">— none —</option>}
            {fabrics.map((f) => {
              const d = resolveFabricDelta(f.tier, overrideForThisModel, fabricTierConfig ?? null);
              return (
                <option key={f.id} value={f.id}>
                  {f.fabricName}
                  {d > 0 ? ` (+RM ${d})` : ""}
                </option>
              );
            })}
          </select>
        </FieldLabel>
      </div>

      {/* Live unit price */}
      {sku && (
        <div className="flex items-baseline gap-1.5">
          <span className="t-small text-base-500">Unit price</span>
          <span className="pos-price text-[20px]">
            <span className="pos-price-rm">RM</span>
            {unitPrice.toLocaleString()}
          </span>
          {effectiveDelta > 0 && (
            <span className="t-tiny text-base-500">
              (base RM {sku.price.toLocaleString()} + fabric RM {effectiveDelta})
            </span>
          )}
        </div>
      )}

      <div className="flex items-end justify-between gap-4">
        <QtyPill qty={qty} onChange={setQty} />
        <button
          onClick={add}
          disabled={!sku}
          className="btn-primary whitespace-nowrap"
        >
          + Add
        </button>
      </div>
    </div>
  );
}

/**
 * Render the configurator that matches a model's category. Returns null for
 * accessory/service (no variant axis). The CALLER must key this by model.id
 * (a fresh mount per model) so the per-category useState defaults re-init —
 * see the SO-1006 notes above.
 */
export function ConfiguratorForModel({
  model,
  skus,
  fabrics,
  fabricTierConfig,
  modelFabricTierOverrides,
  sofaCompartments,
  modelSofaCompartments,
  sofaCombos,
  onAdd,
}: {
  model: ProductModelDto;
  skus: ProductSkuDto[];
  fabrics: SofaFabricDto[];
  fabricTierConfig?: FabricTierGlobalConfig | null;
  modelFabricTierOverrides?: ModelFabricTierOverrideDto[] | null;
  /** Sofa engine (0178/0179) — the global compartment pool. ADDITIVE: only
   *  used to open the visual builder for a sofa model that offers compartments;
   *  mattress/bedframe/no-offer-sofa paths ignore these entirely. */
  sofaCompartments?: SofaCompartmentDto[] | null;
  /** Per-model offered compartments (UNfiltered — filtered to model.id here). */
  modelSofaCompartments?: ModelSofaCompartmentDto[] | null;
  /** Sofa combos (0179) — passed through to the builder for combo pricing. */
  sofaCombos?: SofaComboDto[] | null;
  onAdd: (line: DraftLine) => void;
}) {
  if (model.category === "mattress") {
    return <MattressConfigurator model={model} skus={skus} onAdd={onAdd} />;
  }
  if (model.category === "bedframe") {
    return <BedframeConfigurator model={model} skus={skus} onAdd={onAdd} />;
  }
  if (model.category === "sofa") {
    return (
      <SofaConfiguratorOrBuilder
        model={model}
        skus={skus}
        fabrics={fabrics}
        fabricTierConfig={fabricTierConfig}
        modelFabricTierOverrides={modelFabricTierOverrides}
        sofaCompartments={sofaCompartments}
        modelSofaCompartments={modelSofaCompartments}
        sofaCombos={sofaCombos}
        onAdd={onAdd}
      />
    );
  }
  return null;
}

/**
 * Sofa branch dispatcher (Phase 3, sofa engine). A sofa model that OFFERS
 * compartments (`model_sofa_compartments` rows for this model, 0178) gets the
 * visual drag plan-view builder; every other sofa model keeps the existing
 * preset/part dropdown `SofaConfigurator` UNCHANGED. The builder opens as a
 * full-screen portal overlay ON TOP of the 460px ConfigureDrawer.
 *
 * Dormant-in-prod by construction: prod has 0 offered compartments → the
 * builder never appears (the plan's safety gate).
 */
function SofaConfiguratorOrBuilder({
  model,
  skus,
  fabrics,
  fabricTierConfig,
  modelFabricTierOverrides,
  sofaCompartments,
  modelSofaCompartments,
  sofaCombos,
  onAdd,
}: {
  model: ProductModelDto;
  skus: ProductSkuDto[];
  fabrics: SofaFabricDto[];
  fabricTierConfig?: FabricTierGlobalConfig | null;
  modelFabricTierOverrides?: ModelFabricTierOverrideDto[] | null;
  sofaCompartments?: SofaCompartmentDto[] | null;
  modelSofaCompartments?: ModelSofaCompartmentDto[] | null;
  sofaCombos?: SofaComboDto[] | null;
  onAdd: (line: DraftLine) => void;
}) {
  const [builderOpen, setBuilderOpen] = useState(false);

  // This model's offered compartments (filter the UNfiltered prop to model.id).
  const offered = useMemo(
    () => (modelSofaCompartments ?? []).filter((mc) => mc.modelId === model.id),
    [modelSofaCompartments, model.id],
  );
  const hasOffered = offered.length > 0;

  // The model's representative sofa sku (deterministic): first preset, else
  // first sku. When the model has NO sku the builder can't emit a contract-safe
  // DraftLine, so we disable "Add" with a note (the canvas itself stays usable).
  const hasRepSku = skus.length > 0;

  // No offered compartments → unchanged dropdown configurator.
  if (!hasOffered) {
    return (
      <SofaConfigurator
        model={model}
        skus={skus}
        fabrics={fabrics}
        fabricTierConfig={fabricTierConfig}
        modelFabricTierOverrides={modelFabricTierOverrides}
        onAdd={onAdd}
      />
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-xl border border-base-200 bg-base-50 p-4">
        <p className="t-small text-base-600 mb-3">
          This sofa is built from modules — design it on the room canvas and we price it live.
        </p>
        <button
          type="button"
          onClick={() => setBuilderOpen(true)}
          disabled={!hasRepSku}
          className="btn-primary inline-flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-50"
          data-testid="sofa-open-builder"
        >
          <LayoutGrid size={15} strokeWidth={1.75} />
          Build your sofa
        </button>
        {!hasRepSku && (
          <p className="t-tiny text-danger mt-2" data-testid="sofa-builder-no-sku">
            This model has no SKU yet — a build can't be added to the cart until one exists.
          </p>
        )}
      </div>

      {builderOpen &&
        createPortal(
          <SofaBuildCanvas
            model={model}
            skus={skus}
            compartmentPool={sofaCompartments ?? []}
            modelCompartments={offered}
            sofaCombos={sofaCombos ?? []}
            fabricTierConfig={fabricTierConfig as FabricTierConfigDto | null | undefined}
            fabricTierOverride={
              (modelFabricTierOverrides ?? []).find((o) => o.modelId === model.id) ?? null
            }
            sofaFabrics={fabrics}
            onAddBuild={(payload) => {
              const line = buildToDraftLine(payload, model, skus);
              if (line) onAdd(line);
              setBuilderOpen(false);
            }}
            onClose={() => setBuilderOpen(false)}
          />,
          document.body,
        )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Shared field atoms
// -----------------------------------------------------------------------------

function FieldLabel({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="label block mb-1.5">{label}</span>
      {children}
    </label>
  );
}

/** Pill stepper — round −/+ buttons flanking a centered qty count. */
function QtyPill({ qty, onChange }: { qty: number; onChange: (n: number) => void }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="label">Qty</span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onChange(Math.max(1, qty - 1))}
          disabled={qty <= 1}
          aria-label="Decrease quantity"
          className="inline-flex items-center justify-center w-8 h-8 rounded-full border border-base-200 text-base-600 transition-colors hover:border-base-400 hover:text-base-900 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <Minus size={14} strokeWidth={1.75} />
        </button>
        <span className="font-mono text-[15px] font-semibold w-8 text-center text-base-900">
          {qty}
        </span>
        <button
          type="button"
          onClick={() => onChange(qty + 1)}
          aria-label="Increase quantity"
          className="inline-flex items-center justify-center w-8 h-8 rounded-full border border-base-200 text-base-600 transition-colors hover:border-base-400 hover:text-base-900"
        >
          <Plus size={14} strokeWidth={1.75} />
        </button>
      </div>
    </div>
  );
}

function selectClass({ disabled }: { disabled?: boolean } = {}) {
  // Active inputs go white (gating cue: white = next to fill); disabled
  // selectors fall back to body cream so the user sees what's locked.
  if (disabled) {
    return "w-full px-3 py-2.5 text-[13px] font-body rounded-lg border border-base-200 bg-base-50 text-base-400 cursor-not-allowed outline-none appearance-none";
  }
  return "w-full px-3 py-2.5 text-[13px] font-body rounded-lg border border-base-200 bg-white outline-none focus:border-primary transition-colors appearance-none cursor-pointer";
}
