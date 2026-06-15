import { useState } from "react";
import type {
  ProductCategory,
  ProductModelDto,
  ProductSkuDto,
  SofaFabricDto,
} from "@carres/shared";
import type { DraftLine } from "./draft";

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
    <div className="grid grid-cols-[1fr_80px_auto] gap-2.5 items-end">
      <FieldLabel label="Size">
        <select
          value={skuId}
          onChange={(e) => setSkuId(e.target.value)}
          className={inputClass()}
        >
          <option value="">— pick size —</option>
          {skus.map((s) => (
            <option key={s.id} value={s.id}>
              {s.variant} · RM {s.price.toLocaleString()}
            </option>
          ))}
        </select>
      </FieldLabel>
      <FieldLabel label="Qty">
        <input
          type="number"
          min={1}
          value={qty}
          onChange={(e) => setQty(Math.max(1, parseInt(e.target.value, 10) || 1))}
          className={inputClass()}
        />
      </FieldLabel>
      <button onClick={add} disabled={!sku} className="btn-primary whitespace-nowrap">
        + Add
      </button>
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
    <div className="flex flex-col gap-2.5">
      <div className="grid grid-cols-3 gap-2.5">
        <FieldLabel label="Size">
          <select
            value={skuId}
            onChange={(e) => setSkuId(e.target.value)}
            className={inputClass()}
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
            className={inputClass({ disabled: !model.colors?.length })}
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
            className={inputClass({ disabled: !model.gaps?.length })}
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
      <div className="grid grid-cols-[80px_auto] gap-2.5 items-end justify-end">
        <FieldLabel label="Qty">
          <input
            type="number"
            min={1}
            value={qty}
            onChange={(e) => setQty(Math.max(1, parseInt(e.target.value, 10) || 1))}
            className={inputClass()}
          />
        </FieldLabel>
        <button onClick={add} disabled={!sku} className="btn-primary whitespace-nowrap">
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
  onAdd,
}: {
  model: ProductModelDto;
  skus: ProductSkuDto[];
  fabrics: SofaFabricDto[];
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
  const surcharge = fabric?.surcharge ?? 0;
  const unitPrice = (sku?.price ?? 0) + surcharge;

  function add() {
    if (!sku) return;
    const attrs: Record<string, unknown> = { mode };
    if (fabric) {
      // 2026-05-12 (Loo): persist fabric_id (FK) alongside fabric_name
      // (display) + fabric_surcharge (price). Without fabric_id, the
      // operation CreatePOModal autofill cascade can't pre-select the fabric
      // chip even when the dealer DID pick one — the cascade keys off id.
      attrs.fabric_id = fabric.id;
      attrs.fabric_name = fabric.fabricName;
      attrs.fabric_surcharge = surcharge;
    }
    onAdd({
      localId: newLocalId(),
      sku: sku.sku,
      qty,
      attrs,
      unitPrice,
      label: `${model.name} · ${sku.variant}${fabric ? ` · ${fabric.fabricName}` : ""}${surcharge ? ` (+RM ${surcharge})` : ""}`,
    });
    setSkuId("");
    setFabricId(fabrics[0]?.id ?? "");
    setQty(1);
  }

  return (
    <div className="flex flex-col gap-2.5">
      {/* Mode pills (visible only when sofa_mode='both') */}
      {allowed.length > 1 && (
        <div className="flex gap-1.5">
          {allowed.map((m) => (
            <button
              key={m}
              onClick={() => {
                setMode(m);
                setSkuId("");
              }}
              className={`px-3 py-1.5 text-xs rounded border-[1.5px] ${
                mode === m
                  ? "border-primary bg-signature-50 text-primary font-semibold"
                  : "border-base-200 text-base-700 hover:border-primary/40"
              }`}
            >
              {m === "preset" ? "Preset" : "Custom (parts)"}
            </button>
          ))}
        </div>
      )}

      {skusForMode.length === 0 && (
        <p className="text-xs text-base-500">No {mode} variants for this model yet.</p>
      )}

      <div className="grid grid-cols-2 gap-2.5">
        <FieldLabel label={mode === "preset" ? "Preset" : "Part"}>
          <select
            value={skuId}
            onChange={(e) => setSkuId(e.target.value)}
            disabled={skusForMode.length === 0}
            className={inputClass({ disabled: skusForMode.length === 0 })}
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
            className={inputClass({ disabled: fabrics.length === 0 })}
          >
            {fabrics.length === 0 && <option value="">— none —</option>}
            {fabrics.map((f) => (
              <option key={f.id} value={f.id}>
                {f.fabricName}
                {f.surcharge > 0 ? ` (+RM ${f.surcharge})` : ""}
              </option>
            ))}
          </select>
        </FieldLabel>
      </div>

      <div className="grid grid-cols-[80px_1fr_auto] gap-2.5 items-end">
        <FieldLabel label="Qty">
          <input
            type="number"
            min={1}
            value={qty}
            onChange={(e) => setQty(Math.max(1, parseInt(e.target.value, 10) || 1))}
            className={inputClass()}
          />
        </FieldLabel>
        <div className="text-xs text-base-500 self-end pb-2.5">
          Unit price{" "}
          <span className="font-mono font-semibold text-base-900">
            RM {unitPrice.toLocaleString()}
          </span>
          {surcharge > 0 && (
            <span className="ml-1.5 text-[10px]">
              (base RM {sku?.price.toLocaleString() ?? 0} + fabric RM {surcharge})
            </span>
          )}
        </div>
        <button onClick={add} disabled={!sku} className="btn-primary whitespace-nowrap">
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
  onAdd,
}: {
  model: ProductModelDto;
  skus: ProductSkuDto[];
  fabrics: SofaFabricDto[];
  onAdd: (line: DraftLine) => void;
}) {
  if (model.category === "mattress") {
    return <MattressConfigurator model={model} skus={skus} onAdd={onAdd} />;
  }
  if (model.category === "bedframe") {
    return <BedframeConfigurator model={model} skus={skus} onAdd={onAdd} />;
  }
  if (model.category === "sofa") {
    return <SofaConfigurator model={model} skus={skus} fabrics={fabrics} onAdd={onAdd} />;
  }
  return null;
}

// -----------------------------------------------------------------------------
// Shared field atoms
// -----------------------------------------------------------------------------

function FieldLabel({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="label block mb-1">{label}</span>
      {children}
    </label>
  );
}

function inputClass({ disabled }: { disabled?: boolean } = {}) {
  // Active inputs go white (gating cue: white = next to fill); disabled
  // selectors fall back to body cream so the user sees what's locked.
  if (disabled) {
    return "w-full px-2.5 py-2 text-sm font-body rounded border border-base-300 bg-base-50 text-base-500 cursor-not-allowed outline-none";
  }
  return "w-full px-2.5 py-2 text-sm font-body rounded border border-base-300 bg-white outline-none focus:border-primary";
}
