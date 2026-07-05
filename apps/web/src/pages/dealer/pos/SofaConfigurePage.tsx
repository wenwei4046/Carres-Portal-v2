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
  PwpDiscoverDto,
  Rot,
  SofaComboDto,
  SofaCompartmentDto,
  SofaFabricDto,
  SofaHeight,
} from "@carres/shared";
import {
  analyzeSofa,
  canMirror,
  findModule,
  groupSofas,
  mirrorModules,
  moduleFootprint,
  resolveFabricDelta,
  ROOM_H,
  SOFA_HEIGHTS,
} from "@carres/shared";
import { usePwpAvailableForPhone } from "@/lib/queries";
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

type SeedCell = { moduleCode: string; x: number; y: number; rot: Rot };

const SEED_ROTS: Rot[] = [0, 90, 180, 270];

/** One flush left→right run (tops aligned) at default depth. */
function seedStraight(codes: string[], depth: string): SeedCell[] {
  const cells: SeedCell[] = [];
  let x = 60;
  let y: number | null = null;
  for (const code of codes) {
    const fp = moduleFootprint(findModule(code) ?? { w: 95, d: 95, cushions: 0 }, 0, depth);
    if (y === null) y = Math.max(20, ROOM_H / 2 - fp.h / 2);
    cells.push({ moduleCode: code, x, y, rot: 0 });
    x += fp.w;
  }
  return cells;
}

/** An L arrangement: run east up to (and incl.) the corner, then stack the
 *  tail SOUTH below the corner — corner + tail rotations are parameters. */
function seedTurned(
  codes: string[],
  cornerIdx: number,
  cornerRot: Rot,
  tailRot: Rot,
  depth: string,
): SeedCell[] {
  const cells: SeedCell[] = [];
  let x = 60;
  const y = 60;
  let southX = x;
  let southY = y;
  codes.forEach((code, i) => {
    const mod = findModule(code) ?? { w: 95, d: 95, cushions: 0 };
    if (i < cornerIdx) {
      const fp = moduleFootprint(mod, 0, depth);
      cells.push({ moduleCode: code, x, y, rot: 0 });
      x += fp.w;
    } else if (i === cornerIdx) {
      const fp = moduleFootprint(mod, cornerRot, depth);
      cells.push({ moduleCode: code, x, y, rot: cornerRot });
      southX = x;
      southY = y + fp.h;
    } else {
      const fp = moduleFootprint(mod, tailRot, depth);
      cells.push({ moduleCode: code, x: southX, y: southY, rot: tailRot });
      southY += fp.h;
    }
  });
  return cells;
}

/** True when the cells form ONE connected sofa the arm-cap analysis accepts. */
function seedClosed(cells: SeedCell[], depth: string): boolean {
  const withIds = cells.map((c, i) => ({ ...c, id: `seed-${i}` }));
  const groups = groupSofas(withIds, depth);
  return groups.length === 1 && analyzeSofa(groups[0], depth).closed;
}

/**
 * Lay a combo's modules onto the canvas. Straight runs stay flush left→right;
 * a combo with exactly ONE corner module gets the L treatment — the tail turns
 * south, and we search corner/tail rotations until the SAME arm-cap analysis
 * the canvas enforces reports a closed sofa (the seed validates itself). No
 * closed arrangement, or 2+ corners → the straight fallback and the user
 * rearranges on canvas.
 */
export function comboSeedCells(combo: SofaComboDto, depth: string): SeedCell[] {
  const codes = combo.slots
    .map((s) => s[0])
    .filter((code): code is string => !!code);
  if (codes.length === 0) return [];

  const straight = seedStraight(codes, depth);
  const cornerIdxs = codes
    .map((c, i) => ((findModule(c)?.group ?? "") === "Corner" ? i : -1))
    .filter((i) => i >= 0);
  if (cornerIdxs.length !== 1 || seedClosed(straight, depth)) return straight;

  const cornerIdx = cornerIdxs[0];
  for (const cornerRot of SEED_ROTS) {
    for (const tailRot of SEED_ROTS) {
      const turned = seedTurned(codes, cornerIdx, cornerRot, tailRot, depth);
      if (seedClosed(turned, depth)) return turned;
    }
  }
  return straight;
}

/** Quick-pick fabric-select sentinel — "Confirm later, customer to confirm". */
const QP_FABRIC_DEFER = "__defer__";

/** Overall footprint of a flush left→right layout, in cm — width = Σ module
 *  widths, depth = deepest module. Drives the to-scale plan-view callouts. */
function layoutDims(codes: string[], depth: string): { w: number; d: number } {
  let w = 0;
  let d = 0;
  for (const code of codes) {
    const fp = moduleFootprint(findModule(code) ?? { w: 95, d: 95, cushions: 0 }, 0, depth);
    w += fp.w;
    d = Math.max(d, fp.h);
  }
  return { w, d };
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

  // Per-card L↔R orientation (2990s "flip" — prototype pos-sofa-config.jsx). 'L'
  // = the combo as authored; 'R' = mirrored. Only shown for handed layouts.
  const [flip, setFlip] = useState<Record<string, "L" | "R">>({});

  /** The combo slots/codes to SHOW + SEED for a pick, honouring its flip. */
  function displayFor(pick: QuickPick): { flipped: boolean; slots: string[][]; codes: string[] } {
    const flipped = flip[pick.combo.id] === "R";
    const slots = flipped ? mirrorModules(pick.combo.slots) : pick.combo.slots;
    const codes = slots.map((s) => s[0]).filter((code): code is string => !!code);
    return { flipped, slots, codes };
  }

  // ── INSERT PWP CODE (2990s parity) ──────────────────────────────────────
  // Validate-only: the header box checks a voucher code against the existing
  // /pwp-codes/available lookup and, on a match, carries the code forward as a
  // benign hint on the emitted line (attrs.pwp_pending_code). The cart's PWP
  // machine + the server remain the sole authority for actually consuming a
  // voucher — this never mutates voucher state.
  const [pwpInput, setPwpInput] = useState("");
  const [pwpCode, setPwpCode] = useState<string | null>(null);
  const pwpQuery = usePwpAvailableForPhone({ code: pwpCode });
  const pwpVoucher: PwpDiscoverDto | null =
    pwpCode !== null
      ? pwpQuery.data?.vouchers.find(
          (v) => v.code.toUpperCase() === pwpCode.toUpperCase(),
        ) ?? null
      : null;
  const pwpChecking = pwpCode !== null && pwpQuery.isFetching;
  const pwpError = pwpCode !== null && !pwpChecking && !pwpVoucher;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function loadPick(pick: QuickPick) {
    const { slots } = displayFor(pick);
    setSeed(comboSeedCells({ ...pick.combo, slots }, "24"));
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

  // ── Quick-pick direct-add controls (seat height · fabric · remark) ──────
  const [qpHeight, setQpHeight] = useState<SofaHeight>("24");
  const [qpFabricId, setQpFabricId] = useState<string>(QP_FABRIC_DEFER);
  const [qpRemark, setQpRemark] = useState("");

  // Heights this preset is priced for; fall back to the first priced one.
  const heroHeights = heroPick
    ? SOFA_HEIGHTS.filter((h) => heroPick.combo.pricesByHeight[h] != null)
    : [];
  const effHeight = heroHeights.includes(qpHeight) ? qpHeight : heroHeights[0] ?? qpHeight;
  const qpDeferred = qpFabricId === QP_FABRIC_DEFER;
  const qpFabric = qpDeferred ? null : fabrics.find((f) => f.id === qpFabricId) ?? null;
  const qpDelta = qpFabric
    ? resolveFabricDelta(qpFabric.tier, fabricTierOverride, fabricTierConfig ?? null)
    : 0;
  const heroBase = heroPick ? heroPick.combo.pricesByHeight[effHeight] ?? null : null;
  const qpTotal = heroBase !== null ? heroBase + qpDelta : null;

  /** Add the previewed preset straight to the cart (no canvas hop). */
  function addQuickPick(pick: QuickPick) {
    const base = pick.combo.pricesByHeight[effHeight];
    if (base == null) return;
    const { slots } = displayFor(pick);
    const cells = comboSeedCells({ ...pick.combo, slots }, effHeight);
    const line = buildToDraftLine(
      {
        cells: cells.map((c) => ({ moduleCode: c.moduleCode, x: c.x, y: c.y, rot: c.rot })),
        height: effHeight,
        fabricTier: qpFabric?.tier ?? "PRICE_1",
        fabricId: qpFabric?.id ?? null,
        fabricName: qpFabric?.fabricName ?? null,
        fabricSurcharge: qpDelta,
        fabricDeferred: qpDeferred,
        total: base + qpDelta,
        priceBasis: "combo",
      },
      model,
      skus,
    );
    if (line) {
      const attrs = line.attrs as Record<string, unknown>;
      if (qpRemark.trim()) attrs.remark = qpRemark.trim();
      if (pwpVoucher) attrs.pwp_pending_code = pwpVoucher.code;
      onAdd(line);
    }
    onClose();
  }

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
        {/* INSERT PWP CODE — validate a voucher code (2990s parity). */}
        <div
          className="sof-flow__pwp"
          style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}
          data-testid="sofa-pwp"
        >
          {pwpVoucher ? (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }} className="t-small">
              <span className="pill pill-confirmed" data-testid="sofa-pwp-applied">
                PWP {pwpVoucher.code} ✓
              </span>
              <button
                type="button"
                className="t-small text-base-500 underline hover:text-base-800"
                onClick={() => {
                  setPwpCode(null);
                  setPwpInput("");
                }}
                data-testid="sofa-pwp-remove"
              >
                remove
              </button>
            </span>
          ) : (
            <>
              <input
                type="text"
                value={pwpInput}
                onChange={(e) => {
                  setPwpInput(e.target.value);
                  if (pwpCode !== null) setPwpCode(null);
                }}
                placeholder="Insert PWP code"
                aria-label="Insert PWP code"
                className="rounded-[6px] border border-base-300 bg-white px-2 py-1.5 t-small uppercase"
                style={{ width: 148 }}
                data-testid="sofa-pwp-input"
              />
              <button
                type="button"
                className="btn btn--secondary"
                disabled={pwpChecking || !pwpInput.trim()}
                onClick={() => setPwpCode(pwpInput.trim().toUpperCase())}
                data-testid="sofa-pwp-apply"
              >
                {pwpChecking ? "Checking…" : "Apply"}
              </button>
              {pwpError && (
                <span className="t-small text-danger" data-testid="sofa-pwp-error">
                  No such / not redeemable PWP code.
                </span>
              )}
            </>
          )}
        </div>
        <div className="cfg-header__live">
          <div className="cfg-header__summary">
            <div className="cfg-header__eyebrow">{model.name} · Sofa</div>
            <div className="cfg-header__title" data-testid="sofa-config-name">
              {mode === "quick" && heroPick
                ? displayFor(heroPick).codes.join(" + ")
                : model.name}
            </div>
            <div className="cfg-header__sub">
              {mode === "quick"
                ? heroPick
                  ? "Quick pick"
                  : "Pick a layout — it lands on the canvas assembled"
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
                {picks.map((p) => {
                  const d = displayFor(p);
                  const isOn = heroPick?.combo.id === p.combo.id;
                  const mirrorable = canMirror(p.combo.slots);
                  return (
                    <button
                      key={p.combo.id}
                      type="button"
                      onClick={() => loadPick(p)}
                      onMouseEnter={() => setHoverId(p.combo.id)}
                      className={`sof-qp__card ${isOn ? "is-on" : ""}`}
                      data-testid={`sofa-quick-pick-${p.combo.id}`}
                    >
                      <span className="sof-qp__art" style={{ gap: 2 }}>
                        {d.codes.slice(0, 4).map((code, i) => (
                          <CompartmentSilhouette
                            key={`${code}-${i}`}
                            code={code}
                            className="h-12 w-auto"
                          />
                        ))}
                        {d.codes.length > 4 && (
                          <span className="sof-qp__cardSub">+{d.codes.length - 4}</span>
                        )}
                      </span>
                      <span className="sof-qp__cardBody">
                        <span className="sof-qp__cardLabel">{p.title}</span>
                        <span className="sof-qp__cardSub">{d.codes.join(" + ")}</span>
                        <span className="sof-qp__cardPrice">{p.priceLabel}</span>
                      </span>
                      {mirrorable && isOn && (
                        <span
                          className="sof-qp__flip"
                          role="group"
                          aria-label="Flip layout left or right"
                          onClick={(e) => {
                            e.stopPropagation();
                            setFlip((f) => ({ ...f, [p.combo.id]: d.flipped ? "L" : "R" }));
                          }}
                          data-testid={`sofa-flip-${p.combo.id}`}
                        >
                          <span className={d.flipped ? "" : "is-on"}>L</span>
                          <span className={d.flipped ? "is-on" : ""}>R</span>
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Fabric — optional, deferrable to the customer */}
              <div className="sof-qp__railHead" style={{ marginTop: 16 }}>
                <span className="pos-eyebrow">Fabric</span>
                <span className="sof-qp__railDetail">optional · confirm later</span>
              </div>
              <select
                value={qpFabricId}
                onChange={(e) => setQpFabricId(e.target.value)}
                className="rounded-[6px] border border-base-300 bg-white px-2 py-1.5 t-small"
                style={{ width: "100%" }}
                data-testid="sofa-qp-fabric"
              >
                {fabrics.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.fabricName} · {f.tier.replace("PRICE_", "P")}
                  </option>
                ))}
                <option value={QP_FABRIC_DEFER}>Confirm later — customer to confirm</option>
              </select>

              {/* Remark */}
              <div className="sof-qp__railHead" style={{ marginTop: 16 }}>
                <span className="pos-eyebrow">Remark</span>
              </div>
              <textarea
                value={qpRemark}
                onChange={(e) => setQpRemark(e.target.value)}
                placeholder="e.g. deliver before CNY, match showroom unit…"
                rows={3}
                className="rounded-[6px] border border-base-300 bg-white px-2 py-1.5 t-small"
                style={{ width: "100%", resize: "vertical" }}
                data-testid="sofa-qp-remark"
              />
            </div>

            {/* Hero — the hovered pick as a to-scale PLAN VIEW with cm callouts */}
            <div className="sof-qp__hero">
              <div className="sof-qp__heroFrame">
                {heroPick ? (
                  (() => {
                    const codes = displayFor(heroPick).codes;
                    const dim = layoutDims(codes, "24");
                    return (
                      <div
                        style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}
                        data-testid="sofa-plan-view"
                      >
                        {/* width callout */}
                        <span
                          className="t-tiny font-mono"
                          style={{
                            border: "1px solid var(--line, #d9d2c7)",
                            borderRadius: 4,
                            padding: "1px 6px",
                            background: "var(--pos-panel, #fff)",
                          }}
                          data-testid="sofa-plan-width"
                        >
                          {dim.w} cm
                        </span>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{ display: "flex", alignItems: "flex-end", gap: 4 }}>
                            {codes.slice(0, 6).map((code, i) => (
                              <CompartmentSilhouette
                                key={`${code}-${i}`}
                                code={code}
                                className="h-40 w-auto"
                              />
                            ))}
                          </div>
                          {/* depth callout */}
                          <span
                            className="t-tiny font-mono"
                            style={{
                              border: "1px solid var(--line, #d9d2c7)",
                              borderRadius: 4,
                              padding: "1px 6px",
                              background: "var(--pos-panel, #fff)",
                              writingMode: "vertical-rl",
                            }}
                            data-testid="sofa-plan-depth"
                          >
                            {dim.d} cm
                          </span>
                        </div>
                        <span className="sof-qp__railDetail">Plan view · to scale</span>
                      </div>
                    );
                  })()
                ) : (
                  <span className="sof-qp__railDetail">No layouts authored yet.</span>
                )}
              </div>
              {heroPick && (
                <div className="sof-qp__heroFoot">
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                    <span>
                      <span className="sof-qp__cardLabel">{heroPick.title}</span>
                      <span className="sof-qp__heroDim" style={{ marginLeft: 10 }}>
                        {displayFor(heroPick).codes.join(" + ")}
                      </span>
                    </span>
                    {/* Seat-height toggle (only the heights this preset is priced for) */}
                    {heroHeights.length > 0 && (
                      <span
                        className="sof-flow__modeTabs"
                        role="group"
                        aria-label="Seat height"
                        data-testid="sofa-qp-heights"
                      >
                        {heroHeights.map((h) => (
                          <button
                            key={h}
                            type="button"
                            className={`sof-flow__modeTab ${effHeight === h ? "is-on" : ""}`}
                            aria-pressed={effHeight === h}
                            onClick={() => setQpHeight(h)}
                            data-testid={`sofa-qp-height-${h}`}
                          >
                            {h}&Prime;
                          </button>
                        ))}
                      </span>
                    )}
                  </span>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 14 }}>
                    <span className="text-right">
                      <span className="pos-eyebrow" style={{ fontSize: 10, display: "block" }}>
                        Live total
                      </span>
                      <span className="sof-qp__cardPrice" style={{ fontSize: 18 }} data-testid="sofa-qp-total">
                        {qpTotal !== null ? `RM ${qpTotal.toLocaleString("en-MY")}` : "—"}
                      </span>
                    </span>
                    <button
                      type="button"
                      className="btn btn--secondary"
                      onClick={() => loadPick(heroPick)}
                      data-testid="sofa-qp-customize"
                    >
                      Customize →
                    </button>
                    <button
                      type="button"
                      className="btn btn--primary"
                      disabled={qpTotal === null}
                      onClick={() => addQuickPick(heroPick)}
                      data-testid="sofa-qp-add"
                    >
                      Add to cart
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
              if (line) {
                // Carry a validated PWP code forward as a benign hint — the
                // cart's PWP control + the server are the sole authority for
                // actually applying/consuming the voucher.
                if (pwpVoucher) {
                  (line.attrs as Record<string, unknown>).pwp_pending_code = pwpVoucher.code;
                }
                onAdd(line);
              }
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
