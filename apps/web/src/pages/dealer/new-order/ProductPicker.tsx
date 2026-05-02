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
 * 3-category product picker with inline configurators per the proto:
 *   - Mattress: pick model → pick size SKU → qty → Add
 *   - Bedframe: pick model → pick size SKU + color + gap → qty → Add
 *   - Sofa (full per D2): pick model → mode (preset / custom for sofa_mode='both';
 *     locked otherwise) → pick a SKU + optional fabric (with surcharge) → qty → Add
 *
 * Each configurator owns its own transient state and only mutates parent state
 * via `onAddLine` when the user explicitly clicks Add. Resets on add.
 */
export default function ProductPicker({ catalog, onAddLine }: Props) {
  const [activeCat, setActiveCat] = useState<ProductCategory>("mattress");
  const [openModelId, setOpenModelId] = useState<string | null>(null);

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

  function handleAdd(line: DraftLine) {
    onAddLine(line);
    setOpenModelId(null);
  }

  return (
    <div>
      {/* Category tabs */}
      <div className="flex gap-1.5 mb-3 border-b border-border">
        {CATEGORIES.map((c) => {
          const active = activeCat === c.key;
          return (
            <button
              key={c.key}
              onClick={() => {
                setActiveCat(c.key);
                setOpenModelId(null);
              }}
              className={`px-3.5 py-2.5 text-sm border-b-2 -mb-px ${
                active
                  ? "border-primary text-foreground font-semibold"
                  : "border-transparent text-muted-foreground font-medium hover:text-foreground"
              }`}
            >
              <span className="mr-1.5">{c.icon}</span>
              {c.label}
            </button>
          );
        })}
      </div>

      {/* Model list — click expands inline configurator */}
      <div className="flex flex-col gap-2">
        {inCat.length === 0 && (
          <p className="text-xs text-muted-foreground py-3">No {activeCat} models in catalog.</p>
        )}
        {inCat.map((model) => {
          const skus = skusByModel.get(model.id) ?? [];
          const fabrics = fabricsByModel.get(model.id) ?? [];
          const open = openModelId === model.id;
          return (
            <div key={model.id} className="rounded-md border border-border bg-white overflow-hidden">
              <button
                onClick={() => setOpenModelId(open ? null : model.id)}
                className={`w-full px-3.5 py-3 text-left flex items-center justify-between gap-3 ${
                  open ? "bg-secondary/30" : "hover:bg-secondary/20"
                }`}
              >
                <div className="min-w-0">
                  <div className="text-sm font-semibold truncate">{model.name}</div>
                  {model.blurb && (
                    <div className="text-[11px] text-muted-foreground mt-0.5 truncate">
                      {model.blurb}
                    </div>
                  )}
                </div>
                <span className="text-xs text-muted-foreground font-mono shrink-0">
                  {open ? "▼" : "▶"} {skus.length} variant{skus.length === 1 ? "" : "s"}
                </span>
              </button>
              {open && (
                <div className="px-3.5 py-3 border-t border-border bg-background">
                  {model.category === "mattress" && (
                    <MattressConfigurator model={model} skus={skus} onAdd={handleAdd} />
                  )}
                  {model.category === "bedframe" && (
                    <BedframeConfigurator model={model} skus={skus} onAdd={handleAdd} />
                  )}
                  {model.category === "sofa" && (
                    <SofaConfigurator
                      model={model}
                      skus={skus}
                      fabrics={fabrics}
                      onAdd={handleAdd}
                    />
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
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
      <button
        onClick={add}
        disabled={!sku}
        className={addBtnClass(!!sku)}
      >
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
        <button onClick={add} disabled={!sku} className={addBtnClass(!!sku)}>
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
      {/* Mode tabs (visible only when sofa_mode='both') */}
      {allowed.length > 1 && (
        <div className="flex gap-1.5">
          {allowed.map((m) => (
            <button
              key={m}
              onClick={() => {
                setMode(m);
                setSkuId("");
              }}
              className={`px-3 py-1.5 text-xs rounded-md border ${
                mode === m
                  ? "border-primary bg-primary/10 text-primary font-semibold"
                  : "border-border text-muted-foreground hover:border-primary/40"
              }`}
            >
              {m === "preset" ? "Preset" : "Custom (parts)"}
            </button>
          ))}
        </div>
      )}

      {skusForMode.length === 0 && (
        <p className="text-xs text-muted-foreground">
          No {mode} variants for this model yet.
        </p>
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
        <div className="text-xs text-muted-foreground self-end pb-2.5">
          Unit price <span className="font-mono font-semibold text-foreground">RM {unitPrice.toLocaleString()}</span>
          {surcharge > 0 && <span className="ml-1.5 text-[10px]">(base RM {sku?.price.toLocaleString() ?? 0} + fabric RM {surcharge})</span>}
        </div>
        <button onClick={add} disabled={!sku} className={addBtnClass(!!sku)}>
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
      <span className="block text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1">
        {label}
      </span>
      {children}
    </label>
  );
}

function inputClass({ disabled }: { disabled?: boolean } = {}) {
  // Active inputs go white (gating cue: white = next to fill); disabled
  // selectors fall back to body cream so the user sees what's locked.
  if (disabled) {
    return "w-full px-2.5 py-2 text-sm font-body rounded-md border border-border bg-background text-muted-foreground cursor-not-allowed outline-none";
  }
  return "w-full px-2.5 py-2 text-sm font-body rounded-md border border-border bg-white outline-none focus:border-primary";
}

function addBtnClass(enabled: boolean) {
  return [
    "px-3.5 py-2 rounded-md text-sm font-semibold whitespace-nowrap",
    enabled
      ? "bg-primary text-primary-foreground hover:bg-primary/90"
      : "bg-secondary text-muted-foreground cursor-not-allowed",
  ].join(" ");
}
