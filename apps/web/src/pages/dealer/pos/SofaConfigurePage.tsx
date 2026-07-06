import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, Plus, X } from "lucide-react";
import type {
  CatalogFabricDto,
  CatalogOptionPoolDto,
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
  allowedPoolValues,
  gatedSofaHeights,
  analyzeSofa,
  canMirror,
  findModule,
  groupSofas,
  mirrorModules,
  moduleFootprint,
  resolveFabricDelta,
  ROOM_H,
} from "@carres/shared";
import { usePwpAvailableForPhone } from "@/lib/queries";
import type { DraftLine } from "../new-order/draft";
import { sellingFabricsFor } from "../sofa-build/selling-fabrics";
import SofaBuildCanvas from "../sofa-build/SofaBuildCanvas";
import { buildToDraftLine } from "../sofa-build/sofa-build-draft";
import SofaPlanView, { PLAN_PAD } from "../sofa-build/SofaPlanView";
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
 * The 2990s corner-L layout (Configurator `cellsFromComboModules`): a 3-piece
 * Corner + 2-seater + 1-seater combo ALWAYS draws with the 2-seater as the
 * LONG bar beside the corner and the 1-seater as the SHORT chaise leg dropping
 * below it — never the other way around. The chaise's hand picks the side:
 * LHF → corner top-left, chaise bottom-left; RHF → the whole L mirrors.
 * Cells return in left→right walk order (chaise first for LHF) so the cart
 * label reads like the customer facing the sofa — leftmost closing side first.
 * Any other module set → null (caller falls through to the generic seed).
 */
function seedCornerL(codes: string[], depth: string): SeedCell[] | null {
  if (codes.length !== 3) return null;
  const byGroup = (g: string) => codes.find((c) => findModule(c)?.group === g);
  const cnr = byGroup("Corner");
  const two = byGroup("2-seater");
  const one = byGroup("1-seater");
  if (!cnr || !two || !one) return null;
  const cnrFp = moduleFootprint(findModule(cnr)!, 0, depth);
  const twoFp = moduleFootprint(findModule(two)!, 0, depth);
  const chaiseW = moduleFootprint(findModule(one)!, 90, depth).w;
  const x = 60;
  const y = 60;
  if (one.includes("RHF")) {
    // Chaise drops bottom-right: 2-seater · corner (arms N+E) · chaise, outer
    // edges flush on the right.
    return [
      { moduleCode: two, x, y, rot: 0 },
      { moduleCode: cnr, x: x + twoFp.w, y, rot: 90 },
      { moduleCode: one, x: x + twoFp.w + cnrFp.w - chaiseW, y: y + cnrFp.h, rot: 90 },
    ];
  }
  // Chaise drops bottom-left: chaise · corner (arms N+W) · 2-seater.
  return [
    { moduleCode: one, x, y: y + cnrFp.h, rot: 270 },
    { moduleCode: cnr, x, y, rot: 0 },
    { moduleCode: two, x: x + cnrFp.w, y, rot: 0 },
  ];
}

/**
 * Lay a combo's modules onto the canvas. A 3-piece Corner + 2-seater +
 * 1-seater combo takes the fixed 2990s corner-L (`seedCornerL`) — long bar
 * beside the corner, chaise below. Straight runs stay flush left→right; any
 * other combo with exactly ONE corner module gets the generic L treatment —
 * the tail turns south, and we search corner/tail rotations until the SAME
 * arm-cap analysis the canvas enforces reports a closed sofa (the seed
 * validates itself). No closed arrangement, or 2+ corners → the straight
 * fallback and the user rearranges on canvas.
 */
export function comboSeedCells(combo: SofaComboDto, depth: string): SeedCell[] {
  const codes = combo.slots
    .map((s) => s[0])
    .filter((code): code is string => !!code);
  if (codes.length === 0) return [];

  const cornerL = seedCornerL(codes, depth);
  if (cornerL && seedClosed(cornerL, depth)) return cornerL;

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

// Hero dimension lines — port of 2990s SofaCellsPreview `showDims`: a measured
// line with end ticks spanning the sofa's W (above) / D (right), the cm chip
// riding the line's midpoint. Same ink as the plan-view stroke.
const DIM_INK = "#2c2c2a";
const dimTickV: React.CSSProperties = { width: 1.5, height: 8, background: DIM_INK, flexShrink: 0 };
const dimTickH: React.CSSProperties = { width: 8, height: 1.5, background: DIM_INK, flexShrink: 0 };
const dimLineH: React.CSSProperties = { flex: 1, height: 1.5, background: DIM_INK };
const dimLineV: React.CSSProperties = { flex: 1, width: 1.5, background: DIM_INK };
const dimChip: React.CSSProperties = {
  position: "absolute",
  top: "50%",
  left: "50%",
  transform: "translate(-50%, -50%)",
  border: "1px solid var(--line, #d9d2c7)",
  borderRadius: 4,
  padding: "1px 6px",
  background: "var(--pos-panel, #fff)",
  whiteSpace: "nowrap",
};

/** Overall bbox of a seeded layout in cm (works for straight runs AND L-shapes).
 *  Drives the to-scale plan-view callouts. */
function cellsDims(cells: SeedCell[], depth: string): { w: number; d: number } {
  if (cells.length === 0) return { w: 0, d: 0 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const c of cells) {
    const fp = moduleFootprint(findModule(c.moduleCode) ?? { w: 95, d: 95, cushions: 0 }, c.rot, depth);
    minX = Math.min(minX, c.x);
    minY = Math.min(minY, c.y);
    maxX = Math.max(maxX, c.x + fp.w);
    maxY = Math.max(maxY, c.y + fp.h);
  }
  return { w: maxX - minX, d: maxY - minY };
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
  masterFabrics,
  optionPools,
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
  /** 0202-wiring — the master Fabrics tab list (per-model opt-in ticks). */
  masterFabrics?: CatalogFabricDto[] | null;
  /** 0201-wiring — Maintenance pools (sofa sizes + leg heights). */
  optionPools?: CatalogOptionPoolDto[] | null;
  fabricTierConfig?: FabricTierGlobalConfig | null;
  modelFabricTierOverrides?: ModelFabricTierOverrideDto[] | null;
  sofaCompartments: SofaCompartmentDto[];
  /** Already filtered to model.id. */
  modelCompartments: ModelSofaCompartmentDto[];
  sofaCombos: SofaComboDto[];
  onAdd: (line: DraftLine) => void;
  onClose: () => void;
}) {
  // 0201/0202-wiring — the Maintenance-authored option sources:
  //   sizes (seat heights) = the ACTIVE `sofa_size` pool values;
  //   leg heights = `sofa_leg_height` pool ∩ this model's Modular ticks;
  //   fabrics = legacy per-model rows + the model's opted-in master fabrics.
  const offeredHeights = useMemo(() => gatedSofaHeights(model, optionPools), [model, optionPools]);
  const legOpts = useMemo(
    () => allowedPoolValues(model, "sofa_leg_height", optionPools),
    [model, optionPools],
  );
  const sellingFabrics = useMemo(
    () => sellingFabricsFor(model, fabrics, masterFabrics),
    [model, fabrics, masterFabrics],
  );
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

  // Hero pane previews the hovered (else selected, else first) pick. Clicking a
  // card SELECTS it (prototype behaviour — Customize is the explicit canvas path).
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const heroPick =
    picks.find((p) => p.combo.id === hoverId) ??
    picks.find((p) => p.combo.id === selectedId) ??
    picks[0] ??
    null;

  // ── Quick-pick direct-add controls (seat height · fabric · leg · remark) ──
  const [qpHeight, setQpHeight] = useState<SofaHeight>(offeredHeights[0] ?? "24");
  const [qpFabricKey, setQpFabricKey] = useState<string>(QP_FABRIC_DEFER);
  const [qpLeg, setQpLeg] = useState<string>("");
  const [qpRemark, setQpRemark] = useState("");

  // Heights = the ACTIVE Maintenance sofa sizes this preset is priced for.
  const heroHeights = heroPick
    ? offeredHeights.filter((h) => heroPick.combo.pricesByHeight[h] != null)
    : [];
  const effHeight = heroHeights.includes(qpHeight) ? qpHeight : heroHeights[0] ?? qpHeight;
  const qpDeferred = qpFabricKey === QP_FABRIC_DEFER;
  const qpFabric = qpDeferred
    ? null
    : sellingFabrics.find((f) => f.key === qpFabricKey) ?? null;
  const qpDelta = qpFabric
    ? resolveFabricDelta(qpFabric.tier, fabricTierOverride, fabricTierConfig ?? null)
    : 0;
  // Leg-height surcharge (0201 pool; server re-verifies via computeSofaPrice).
  const qpLegDelta = qpLeg ? legOpts.find((o) => o.value === qpLeg)?.surcharge ?? 0 : 0;
  const heroBase = heroPick ? heroPick.combo.pricesByHeight[effHeight] ?? null : null;
  const qpTotal = heroBase !== null ? heroBase + qpDelta + qpLegDelta : null;

  // The hero layout seeded at the chosen depth — ONE joined plan view + bbox dims.
  const heroCells = heroPick
    ? comboSeedCells({ ...heroPick.combo, slots: displayFor(heroPick).slots }, effHeight)
    : [];
  const heroDims = cellsDims(heroCells, effHeight);

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
        fabricCode: qpFabric?.code ?? null,
        fabricName: qpFabric?.name ?? null,
        fabricSurcharge: qpDelta,
        fabricDeferred: qpDeferred,
        legHeight: qpLeg || null,
        legSurcharge: qpLegDelta,
        total: base + qpDelta + qpLegDelta,
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
          {/* Seat-size toggle — top-left, beside the mode tabs (prototype). */}
          {mode === "quick" && heroHeights.length > 0 && (
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
                ? `${displayFor(heroPick).codes.join(" + ")} · ${effHeight}″`
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
          {mode === "quick" ? (
            <div className="cfg-header__total" tabIndex={0}>
              <div className="cfg-header__totalLabel">Live total</div>
              <div className="cfg-header__totalNum" data-testid="sofa-qp-total">
                {qpTotal !== null ? (
                  <>
                    <sup>RM</sup>
                    {qpTotal.toLocaleString("en-MY")}
                  </>
                ) : (
                  "—"
                )}
              </div>
              <div className="cfg-header__totalNote">combo pricing per layout</div>
            </div>
          ) : (
            meta && (
              <div className="cfg-header__total" tabIndex={0}>
                <div className="cfg-header__totalLabel">From</div>
                <div className="cfg-header__totalNum">
                  <sup>RM</sup>
                  {meta.fromPrice.toLocaleString("en-MY")}
                </div>
                <div className="cfg-header__totalNote">priced live on the canvas</div>
              </div>
            )
          )}
          <span style={{ display: "inline-flex", alignItems: "center", gap: 10, marginLeft: 14 }}>
            <button
              type="button"
              className="btn btn--secondary"
              onClick={onClose}
              data-testid="sofa-cancel"
            >
              <X size={14} strokeWidth={2} /> Cancel
            </button>
            {mode === "quick" && (
              <button
                type="button"
                className="btn btn--primary"
                disabled={!heroPick || qpTotal === null}
                onClick={() => heroPick && addQuickPick(heroPick)}
                data-testid="sofa-qp-add"
              >
                <Plus size={14} strokeWidth={2} /> Add to Cart
              </button>
            )}
          </span>
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
                  const cardCells = comboSeedCells({ ...p.combo, slots: d.slots }, "24");
                  return (
                    <button
                      key={p.combo.id}
                      type="button"
                      onClick={() => setSelectedId(p.combo.id)}
                      onMouseEnter={() => setHoverId(p.combo.id)}
                      className={`sof-qp__card ${isOn ? "is-on" : ""}`}
                      data-testid={`sofa-quick-pick-${p.combo.id}`}
                    >
                      <span className="sof-qp__art" style={{ gap: 2 }}>
                        <SofaPlanView cells={cardCells} depth="24" className="h-12 w-auto" />
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

              {/* Fabric — swatch pills (prototype), deferrable to the customer */}
              <div className="sof-qp__railHead" style={{ marginTop: 16 }}>
                <span className="pos-eyebrow">Fabric option</span>
                <span className="sof-qp__railDetail">optional · confirm later</span>
              </div>
              <div
                style={{ display: "flex", flexWrap: "wrap", gap: 8 }}
                role="group"
                aria-label="Fabric option"
                data-testid="sofa-qp-fabric"
              >
                {sellingFabrics.map((f) => {
                  const delta = resolveFabricDelta(
                    f.tier,
                    fabricTierOverride,
                    fabricTierConfig ?? null,
                  );
                  const on = qpFabricKey === f.key;
                  return (
                    <button
                      key={f.key}
                      type="button"
                      onClick={() => setQpFabricKey(f.key)}
                      aria-pressed={on}
                      className={`inline-flex items-center gap-2 rounded-full border bg-white px-3 py-1.5 t-small transition-colors ${
                        on ? "border-primary text-primary" : "border-base-300 text-base-700"
                      }`}
                      data-testid={`sofa-qp-fabric-${f.key}`}
                    >
                      <span
                        className="h-3 w-3 rounded-full border border-base-300"
                        style={{ background: f.swatch ?? "#CBAA7C" }}
                      />
                      {f.name}
                      <span className="t-micro text-base-400">
                        {delta > 0 ? `+RM ${delta.toLocaleString("en-MY")}` : "Included"}
                      </span>
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => setQpFabricKey(QP_FABRIC_DEFER)}
                  aria-pressed={qpDeferred}
                  className={`inline-flex items-center gap-2 rounded-full border bg-white px-3 py-1.5 t-small transition-colors ${
                    qpDeferred ? "border-primary text-primary" : "border-base-300 text-base-700"
                  }`}
                  data-testid="sofa-qp-fabric-defer"
                >
                  Confirm later
                  <span className="t-micro text-base-400">customer to confirm</span>
                </button>
              </div>

              {/* Leg height — the sofa_leg_height pool ∩ Modular ticks (0201).
                  Optional; the surcharge joins the drift-gated build total. */}
              {legOpts.length > 0 && (
                <>
                  <div className="sof-qp__railHead" style={{ marginTop: 16 }}>
                    <span className="pos-eyebrow">Leg height</span>
                    <span className="sof-qp__railDetail">optional · confirm later</span>
                  </div>
                  <div
                    style={{ display: "flex", flexWrap: "wrap", gap: 8 }}
                    role="group"
                    aria-label="Leg height"
                    data-testid="sofa-qp-legs"
                  >
                    {legOpts.map((o) => {
                      const on = qpLeg === o.value;
                      return (
                        <button
                          key={o.id}
                          type="button"
                          onClick={() => setQpLeg(on ? "" : o.value)}
                          aria-pressed={on}
                          className={`inline-flex items-center gap-2 rounded-full border bg-white px-3 py-1.5 t-small transition-colors ${
                            on ? "border-primary text-primary" : "border-base-300 text-base-700"
                          }`}
                          data-testid={`sofa-qp-leg-${o.value}`}
                        >
                          {o.value}
                          <span className="t-micro text-base-400">
                            {o.surcharge != null && o.surcharge !== 0
                              ? `+RM ${o.surcharge.toLocaleString("en-MY")}`
                              : "Included"}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </>
              )}

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
                  <div data-testid="sofa-plan-view">
                    {/* ONE joined sofa — all modules in a single to-scale SVG.
                        Sized by .sof-qp__heroBox (min(55cqh, 80cqw/AR) inside
                        the size-container heroFrame) so the sofa FILLS the
                        stage like the 2990s hero, instead of a fixed 256px
                        strip (Loo 2026-07-06 — "ratio 太小"). AR includes the
                        SVG's own PLAN_PAD breathing room so the box matches
                        the viewBox exactly (no letterbox). */}
                    <div
                      className="sof-qp__heroBox"
                      style={
                        {
                          aspectRatio: `${heroDims.w + PLAN_PAD * 2} / ${heroDims.d + PLAN_PAD * 2}`,
                          "--qp-ar": String(
                            (heroDims.w + PLAN_PAD * 2) / Math.max(1, heroDims.d + PLAN_PAD * 2),
                          ),
                        } as React.CSSProperties
                      }
                    >
                      <SofaPlanView cells={heroCells} depth={effHeight} className="h-full w-full" />
                      {/* Measured dimension lines (2990s showDims) — end ticks
                          inset by PLAN_PAD so they sit exactly on the sofa's
                          edges; the cm chip rides the line's midpoint. */}
                      <div
                        aria-hidden="true"
                        style={{
                          position: "absolute",
                          left: `${(PLAN_PAD / (heroDims.w + PLAN_PAD * 2)) * 100}%`,
                          right: `${(PLAN_PAD / (heroDims.w + PLAN_PAD * 2)) * 100}%`,
                          top: -34,
                          height: 16,
                          display: "flex",
                          alignItems: "center",
                          pointerEvents: "none",
                        }}
                      >
                        <span style={dimTickV} />
                        <span style={dimLineH} />
                        <span style={dimTickV} />
                        <span className="t-tiny font-mono" style={dimChip} data-testid="sofa-plan-width">
                          {heroDims.w} cm
                        </span>
                      </div>
                      <div
                        aria-hidden="true"
                        style={{
                          position: "absolute",
                          top: `${(PLAN_PAD / (heroDims.d + PLAN_PAD * 2)) * 100}%`,
                          bottom: `${(PLAN_PAD / (heroDims.d + PLAN_PAD * 2)) * 100}%`,
                          right: -34,
                          width: 16,
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          pointerEvents: "none",
                        }}
                      >
                        <span style={dimTickH} />
                        <span style={dimLineV} />
                        <span style={dimTickH} />
                        <span className="t-tiny font-mono" style={dimChip} data-testid="sofa-plan-depth">
                          {heroDims.d} cm
                        </span>
                      </div>
                    </div>
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
                      {displayFor(heroPick).codes.join(" + ")}
                    </span>
                  </span>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 14 }}>
                    <span className="sof-qp__railDetail">{effHeight}&Prime; seat · to scale</span>
                    <button
                      type="button"
                      className="btn btn--secondary"
                      onClick={() => loadPick(heroPick)}
                      data-testid="sofa-qp-customize"
                    >
                      Customize →
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
            sellingFabrics={sellingFabrics}
            legHeightOptions={legOpts}
            heights={offeredHeights}
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
