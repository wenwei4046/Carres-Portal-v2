import { useMemo, useState } from "react";
import type {
  CatalogResponse,
  ProductCategory,
  ProductModelDto,
  ProductSkuDto,
  SofaFabricDto,
} from "@carres/shared";
import type { DraftLine } from "./draft";

const CATEGORIES: { key: ProductCategory; label: string; icon: string }[] = [
  { key: "mattress", label: "Mattress", icon: "▭" },
  { key: "bedframe", label: "Bed frame", icon: "▤" },
  { key: "sofa", label: "Sofa", icon: "▦" },
];

interface Props {
  catalog: CatalogResponse;
  onAddLine: (line: DraftLine) => void;
}

/**
 * 3-category product picker — proto-faithful 2-col model card grid.
 *   Category tab bar → grid of model cards (2-col) → inline configurator at
 *   bottom when a model is selected.
 *
 *   Mattress: pick model → pick size SKU → qty → Add
 *   Bedframe: pick model → pick size SKU + color + gap → qty → Add
 *   Sofa (full per D2): pick model → mode (preset / custom for sofa_mode='both';
 *     locked otherwise) → pick a SKU + optional fabric (with surcharge) → qty → Add
 *
 * Each configurator owns its own transient state and only mutates parent state
 * via `onAddLine` when the user explicitly clicks Add. Resets on add.
 */
export default function ProductPicker({ catalog, onAddLine }: Props) {
  const [activeCat, setActiveCat] = useState<ProductCategory>("mattress");
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);

  // Pre-index for fast model→skus + model→fabrics lookups.
  const skusByModel = useMemo(() => {
    const m = new Map<string, ProductSkuDto[]>();
    for (const s of catalog.skus) {
      const arr = m.get(s.modelId) ?? [];
      arr.push(s);
      m.set(s.modelId, arr);
    }
    return m;
  }, [catalog.skus]);

  const fabricsByModel = useMemo(() => {
    const m = new Map<string, SofaFabricDto[]>();
    for (const f of catalog.sofaFabrics) {
      const arr = m.get(f.modelId) ?? [];
      arr.push(f);
      m.set(f.modelId, arr);
    }
    return m;
  }, [catalog.sofaFabrics]);

  const inCat = catalog.models.filter((m) => m.category === activeCat);
  const selected = selectedModelId ? catalog.models.find((m) => m.id === selectedModelId) : null;
  const selectedSkus = selected ? skusByModel.get(selected.id) ?? [] : [];
  const selectedFabrics = selected ? fabricsByModel.get(selected.id) ?? [] : [];

  function handleAdd(line: DraftLine) {
    onAddLine(line);
    setSelectedModelId(null);
  }

  return (
    <div className="rounded border border-base-200 bg-white overflow-hidden">
      {/* Category tabs */}
      <div className="flex border-b border-base-100">
        {CATEGORIES.map((c) => {
          const active = activeCat === c.key;
          return (
            <button
              key={c.key}
              onClick={() => {
                setActiveCat(c.key);
                setSelectedModelId(null);
              }}
              className={`flex-1 px-4 py-3 text-center border-b-2 transition-colors ${
                active
                  ? "bg-white border-primary text-base-900"
                  : "bg-base-50 border-transparent text-base-600 hover:text-base-900"
              }`}
            >
              <span className="text-base mr-1.5">{c.icon}</span>
              <span className="text-[13px] font-semibold">{c.label}</span>
            </button>
          );
        })}
      </div>

      {/* Model grid (2-col) */}
      {inCat.length === 0 && (
        <p className="px-8 py-8 text-center text-xs text-base-500">
          No {activeCat} models in catalog.
        </p>
      )}
      {inCat.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-3">
          {inCat.map((model) => {
            const skuCount = (skusByModel.get(model.id) ?? []).length;
            const active = selectedModelId === model.id;
            return (
              <button
                key={model.id}
                onClick={() => setSelectedModelId(active ? null : model.id)}
                className={`text-left p-3 rounded border-[1.5px] transition-colors ${
                  active
                    ? "border-primary bg-signature-50"
                    : "border-base-200 bg-white hover:border-primary/40"
                }`}
              >
                <div className="text-[13px] font-semibold">{model.name}</div>
                {model.blurb && (
                  <div className="text-[11px] text-base-500 mt-0.5">{model.blurb}</div>
                )}
                <div className="text-[10px] text-base-500 mt-1.5 font-mono">
                  {skuCount} variant{skuCount === 1 ? "" : "s"}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Inline configurator for the selected model */}
      {selected && (
        <div className="border-t border-base-100 p-3.5 bg-base-50">
          {selected.category === "mattress" && (
            <MattressConfigurator model={selected} skus={selectedSkus} onAdd={handleAdd} />
          )}
          {selected.category === "bedframe" && (
            <BedframeConfigurator model={selected} skus={selectedSkus} onAdd={handleAdd} />
          )}
          {selected.category === "sofa" && (
            <SofaConfigurator
              model={selected}
              skus={selectedSkus}
              fabrics={selectedFabrics}
              onAdd={handleAdd}
            />
          )}
        </div>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Configurators — each owns transient state, calls onAdd to commit a DraftLine.
// -----------------------------------------------------------------------------

function newLocalId(): string {
  // crypto.randomUUID is available in modern browsers and JSDOM 22+.
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function MattressConfigurator({
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

function BedframeConfigurator({
  model,
  skus,
  onAdd,
}: {
  model: ProductModelDto;
  skus: ProductSkuDto[];
  onAdd: (line: DraftLine) => void;
}) {
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

function SofaConfigurator({
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

// -----------------------------------------------------------------------------
// Shared atoms (kept inline since file is already long; if these grow larger
// they can move into a per-wizard atoms file in a later slice).
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
