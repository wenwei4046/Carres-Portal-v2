import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft } from "lucide-react";
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

  // Hero pane previews the hovered (else first) pick — clicking a card still
  // loads it straight onto the canvas, same contract as before.
  const [hoverId, setHoverId] = useState<string | null>(null);
  const heroPick =
    picks.find((p) => p.combo.id === hoverId) ?? picks[0] ?? null;

  return createPortal(
    <div
      className="pos-proto cfg-root"
      style={{ position: "fixed", inset: 0, zIndex: 50 }}
      role="dialog"
      aria-modal="true"
      aria-label={`Configure ${model.name}`}
      data-testid="sofa-configure-page"
    >
      {/* Header — the design's cfg-header with the sofa-flow crumb: back ·
          eyebrow/model · mode tabs (rail pill pair) · from-price. */}
      <div className="cfg-header cfg-header--icon">
        <button
          className="cfg-header__back"
          type="button"
          onClick={onClose}
          aria-label="Back to catalog"
          data-testid="sofa-configure-back"
        >
          <ArrowLeft size={16} strokeWidth={1.75} />
        </button>
        <div className="sof-flow__headerCrumb" style={{ minWidth: 0 }}>
          <span className="sof-flow__crumbDepth">
            <span className="sof-flow__crumbDot" />
            {model.name}
          </span>
          <div className="sof-flow__modeTabs">
            <button
              type="button"
              className={`sof-flow__modeTab ${mode === "quick" ? "is-on" : ""}`}
              disabled={picks.length === 0}
              aria-pressed={mode === "quick"}
              onClick={() => setMode("quick")}
              data-testid="sofa-mode-quick"
            >
              Quick pick
            </button>
            <button
              type="button"
              className={`sof-flow__modeTab ${mode === "custom" ? "is-on" : ""}`}
              aria-pressed={mode === "custom"}
              onClick={() => setMode("custom")}
              data-testid="sofa-mode-custom"
            >
              Customize
            </button>
          </div>
        </div>
        <div className="cfg-header__live">
          <div className="cfg-header__summary">
            <div className="cfg-header__eyebrow">Sofa · built from modules</div>
            <div className="cfg-header__title">{model.name}</div>
            <div className="cfg-header__sub">
              {mode === "quick"
                ? "Pick a layout — it lands on the canvas assembled"
                : "Drag modules · rotate · we price the connected sofa live"}
            </div>
          </div>
          {meta && (
            <div className="cfg-header__total" tabIndex={0}>
              <div className="cfg-header__totalLabel">From</div>
              <div className="cfg-header__totalNum">
                <sup>RM</sup>
                {meta.fromPrice.toLocaleString("en-MY")}
              </div>
              <div className="cfg-header__totalNote">priced live on the canvas</div>
            </div>
          )}
        </div>
      </div>

      {/* Body */}
      {mode === "quick" ? (
        <div className="cfg-body" style={{ minHeight: 0, overflow: "hidden" }}>
          <div className="sof-qp" style={{ height: "100%" }}>
            {/* Rail — this model's ready-made layouts */}
            <div className="sof-qp__rail">
              <div className="sof-qp__railHead">
                <span className="pos-eyebrow">Quick pick</span>
                <span className="sof-qp__railDetail">combo pricing per layout</span>
              </div>
              <div className="sof-qp__grid" data-testid="sofa-quick-picks">
                {picks.map((p) => (
                  <button
                    key={p.combo.id}
                    type="button"
                    onClick={() => loadPick(p)}
                    onMouseEnter={() => setHoverId(p.combo.id)}
                    className={`sof-qp__card ${heroPick?.combo.id === p.combo.id ? "is-on" : ""}`}
                    data-testid={`sofa-quick-pick-${p.combo.id}`}
                  >
                    <span className="sof-qp__art" style={{ gap: 2 }}>
                      {p.codes.slice(0, 4).map((code, i) => (
                        <CompartmentSilhouette
                          key={`${code}-${i}`}
                          code={code}
                          className="h-12 w-auto"
                        />
                      ))}
                      {p.codes.length > 4 && (
                        <span className="sof-qp__cardSub">+{p.codes.length - 4}</span>
                      )}
                    </span>
                    <span className="sof-qp__cardBody">
                      <span className="sof-qp__cardLabel">{p.title}</span>
                      <span className="sof-qp__cardSub">{p.codes.join(" + ")}</span>
                      <span className="sof-qp__cardPrice">{p.priceLabel}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Hero — the hovered pick at room scale, then load on canvas */}
            <div className="sof-qp__hero">
              <div className="sof-qp__heroFrame">
                {heroPick ? (
                  <div style={{ display: "flex", alignItems: "flex-end", gap: 4 }}>
                    {heroPick.codes.slice(0, 6).map((code, i) => (
                      <CompartmentSilhouette
                        key={`${code}-${i}`}
                        code={code}
                        className="h-40 w-auto"
                      />
                    ))}
                  </div>
                ) : (
                  <span className="sof-qp__railDetail">No layouts authored yet.</span>
                )}
              </div>
              {heroPick && (
                <div className="sof-qp__heroFoot">
                  <span>
                    <span className="sof-qp__cardLabel">{heroPick.title}</span>
                    <span className="sof-qp__heroDim" style={{ marginLeft: 10 }}>
                      {heroPick.codes.join(" + ")}
                    </span>
                  </span>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 14 }}>
                    <span className="sof-qp__cardPrice" style={{ fontSize: 14 }}>
                      {heroPick.priceLabel}
                    </span>
                    <button
                      type="button"
                      className="btn btn--primary"
                      onClick={() => loadPick(heroPick)}
                    >
                      Load on canvas →
                    </button>
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="cfg-body" style={{ position: "relative", minHeight: 0 }}>
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
