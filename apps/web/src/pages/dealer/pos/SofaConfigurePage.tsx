import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, LayoutGrid, Sparkles } from "lucide-react";
import type {
  FabricTierConfigDto,
  FabricTierGlobalConfig,
  ModelFabricTierOverrideDto,
  ModelSofaCompartmentDto,
  ProductModelDto,
  ProductSkuDto,
  Rot,
  SofaComboDto,
  SofaCompartmentDto,
  SofaFabricDto,
} from "@carres/shared";
import { findModule, moduleFootprint, ROOM_H } from "@carres/shared";
import type { DraftLine } from "../new-order/draft";
import SofaBuildCanvas from "../sofa-build/SofaBuildCanvas";
import { buildToDraftLine } from "../sofa-build/sofa-build-draft";
import CompartmentSilhouette from "../sofa-build/CompartmentSilhouette";
import type { ModelMeta } from "./catalog-index";

/**
 * Full-page sofa configurator (2990s parity — clicking a modular sofa card
 * JUMPS STRAIGHT IN, no drawer hop). Two modes, tabbed in the page header:
 *
 *   Quick pick — this model's active sofa COMBOS as preset cards (label,
 *                composition silhouettes, price range). Picking one loads it
 *                onto the canvas pre-assembled and switches to Customize.
 *   Customize — the existing SofaBuildCanvas, embedded (page owns the chrome).
 *
 * The canvas prices per connected group (combo match included), so a loaded
 * quick pick shows its combo price live once fabric/height are confirmed —
 * add-to-cart goes through the same buildToDraftLine contract as before.
 */

interface QuickPick {
  combo: SofaComboDto;
  title: string;
  codes: string[];
  priceLabel: string;
}

/** Lay a combo's modules flush left→right (tops aligned) at default depth. */
export function comboSeedCells(
  combo: SofaComboDto,
  depth: string,
): Array<{ moduleCode: string; x: number; y: number; rot: Rot }> {
  const cells: Array<{ moduleCode: string; x: number; y: number; rot: Rot }> = [];
  let x = 60;
  let y: number | null = null;
  for (const slot of combo.slots) {
    const code = slot[0];
    if (!code) continue;
    const fp = moduleFootprint(findModule(code) ?? { w: 95, d: 95, cushions: 0 }, 0, depth);
    if (y === null) y = Math.max(20, ROOM_H / 2 - fp.h / 2);
    cells.push({ moduleCode: code, x, y, rot: 0 });
    x += fp.w;
  }
  return cells;
}

function priceLabelOf(combo: SofaComboDto): string {
  const vals = Object.values(combo.pricesByHeight).filter(
    (v): v is number => typeof v === "number",
  );
  if (vals.length === 0) return "Priced on build";
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const rm = (n: number) => `RM ${n.toLocaleString("en-MY")}`;
  return min === max ? rm(min) : `From ${rm(min)}`;
}

export default function SofaConfigurePage({
  model,
  meta,
  skus,
  fabrics,
  fabricTierConfig,
  modelFabricTierOverrides,
  sofaCompartments,
  modelCompartments,
  sofaCombos,
  onAdd,
  onClose,
}: {
  model: ProductModelDto;
  meta: ModelMeta | undefined;
  skus: ProductSkuDto[];
  fabrics: SofaFabricDto[];
  fabricTierConfig?: FabricTierGlobalConfig | null;
  modelFabricTierOverrides?: ModelFabricTierOverrideDto[] | null;
  sofaCompartments: SofaCompartmentDto[];
  /** Already filtered to model.id. */
  modelCompartments: ModelSofaCompartmentDto[];
  sofaCombos: SofaComboDto[];
  onAdd: (line: DraftLine) => void;
  onClose: () => void;
}) {
  const picks: QuickPick[] = useMemo(
    () =>
      sofaCombos
        .filter((c) => c.modelId === model.id && c.active && !c.discontinuedAt)
        .map((c) => {
          const codes = c.slots.map((s) => s[0]).filter((code): code is string => !!code);
          return {
            combo: c,
            title: c.label?.trim() || codes.join(" + "),
            codes,
            priceLabel: priceLabelOf(c),
          };
        }),
    [sofaCombos, model.id],
  );

  const [mode, setMode] = useState<"quick" | "custom">(picks.length > 0 ? "quick" : "custom");
  const [seed, setSeed] = useState<Array<{
    moduleCode: string;
    x: number;
    y: number;
    rot: Rot;
  }> | null>(null);
  // Remount key — bumps when a pick is loaded so the canvas re-reads the seed.
  const [seedKey, setSeedKey] = useState(0);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function loadPick(pick: QuickPick) {
    setSeed(comboSeedCells(pick.combo, "24"));
    setSeedKey((k) => k + 1);
    setMode("custom");
  }

  const fabricTierOverride =
    (modelFabricTierOverrides ?? []).find((o) => o.modelId === model.id) ?? null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex flex-col bg-base-50"
      role="dialog"
      aria-modal="true"
      aria-label={`Configure ${model.name}`}
      data-testid="sofa-configure-page"
    >
      {/* Page header — back · model · mode tabs · from-price */}
      <header className="flex shrink-0 items-center gap-4 border-b border-base-200 bg-white px-5 py-3">
        <button
          type="button"
          onClick={onClose}
          aria-label="Back to catalog"
          className="btn-ghost flex h-9 w-9 shrink-0 items-center justify-center"
          data-testid="sofa-configure-back"
        >
          <ArrowLeft size={18} strokeWidth={1.75} />
        </button>
        <div className="min-w-0">
          <p className="t-micro text-base-400">Sofa</p>
          <h2 className="t-h3 truncate">{model.name}</h2>
        </div>

        {/* Mode tabs */}
        <div className="flex-1 flex justify-center">
          <div className="flex items-center gap-1.5">
            <ModeTab
              icon={Sparkles}
              label="Quick pick"
              active={mode === "quick"}
              disabled={picks.length === 0}
              onClick={() => setMode("quick")}
              testId="sofa-mode-quick"
            />
            <ModeTab
              icon={LayoutGrid}
              label="Customize"
              active={mode === "custom"}
              onClick={() => setMode("custom")}
              testId="sofa-mode-custom"
            />
          </div>
        </div>

        {meta && (
          <p className="shrink-0 leading-none hidden sm:block">
            <span className="pos-price-rm t-tiny">From RM</span>
            <span className="pos-price text-[22px]">{meta.fromPrice.toLocaleString()}</span>
          </p>
        )}
      </header>

      {/* Body */}
      {mode === "quick" ? (
        <div className="flex-1 min-h-0 overflow-auto px-6 py-6">
          <p className="t-small text-base-500 mb-5 max-w-xl">
            Ready-made layouts for this model — pick one and it lands on the canvas assembled;
            confirm the fabric and seat height there, then add it to the cart.
          </p>
          <div
            className="grid gap-4"
            style={{ gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))" }}
            data-testid="sofa-quick-picks"
          >
            {picks.map((p) => (
              <button
                key={p.combo.id}
                type="button"
                onClick={() => loadPick(p)}
                className="text-left bg-white border border-base-200 rounded-xl p-5 hover:border-primary hover:shadow-md transition-all group"
                data-testid={`sofa-quick-pick-${p.combo.id}`}
              >
                {/* Composition silhouettes */}
                <div className="flex items-end gap-1 mb-4 h-14 overflow-hidden">
                  {p.codes.slice(0, 5).map((code, i) => (
                    <CompartmentSilhouette key={`${code}-${i}`} code={code} className="h-12 w-auto" />
                  ))}
                  {p.codes.length > 5 && (
                    <span className="t-tiny text-base-400">+{p.codes.length - 5}</span>
                  )}
                </div>
                <p className="t-small font-semibold">{p.title}</p>
                <p className="t-tiny text-base-500 mt-0.5 font-mono">{p.codes.join(" + ")}</p>
                <div className="flex items-baseline justify-between mt-3">
                  <span className="pos-price text-[18px]">
                    <span className="pos-price-rm">{"‎"}</span>
                    {p.priceLabel}
                  </span>
                  <span className="t-tiny text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                    Load on canvas →
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="relative flex-1 min-h-0">
          <SofaBuildCanvas
            key={seedKey}
            embedded
            initialCells={seed ?? []}
            model={model}
            skus={skus}
            compartmentPool={sofaCompartments}
            modelCompartments={modelCompartments}
            sofaCombos={sofaCombos}
            fabricTierConfig={fabricTierConfig as FabricTierConfigDto | null | undefined}
            fabricTierOverride={fabricTierOverride}
            sofaFabrics={fabrics}
            onAddBuild={(payload) => {
              const line = buildToDraftLine(payload, model, skus);
              if (line) onAdd(line);
              onClose();
            }}
            onClose={onClose}
          />
        </div>
      )}
    </div>,
    document.body,
  );
}

function ModeTab({
  icon: Icon,
  label,
  active,
  disabled,
  onClick,
  testId,
}: {
  icon: typeof Sparkles;
  label: string;
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  testId: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      data-testid={testId}
      className={[
        "flex items-center gap-1.5 rounded-full px-4 py-1.5 t-small font-semibold border transition-colors",
        active
          ? "bg-base-900 text-white border-base-900"
          : disabled
            ? "bg-white text-base-300 border-base-200 cursor-not-allowed"
            : "bg-white text-base-600 border-base-200 hover:border-base-400",
      ].join(" ")}
    >
      <Icon size={14} strokeWidth={1.75} />
      {label}
    </button>
  );
}
