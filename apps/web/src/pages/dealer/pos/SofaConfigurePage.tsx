import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import type {
  CatalogFabricDto,
  CatalogOptionPoolDto,
  CatalogResponse,
  FabricTierConfigDto,
  FabricTierGlobalConfig,
  ModelFabricTierOverrideDto,
  ModelSofaCompartmentDto,
  ProductModelDto,
  ProductSkuDto,
  PwpCodeDto,
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
  gatedSofaSizes,
  analyzeSofa,
  canMirror,
  cellsBbox,
  computeSofaPrice,
  findModule,
  groupSofas,
  mirrorModules,
  moduleFootprint,
  orderSofaCellsLeftToRight,
  resolveFabricDelta,
  ROOM_H,
  ROOM_W,
  type FabricTier,
  type SofaBuild,
  type SofaPricingSnapshot,
} from "@carres/shared";
import { useDeleteSofaCombo } from "@/lib/queries";
import { useAuth } from "@/lib/auth";
import type { DraftLine } from "../new-order/draft";
import {
  coveringPwpForLine,
  linePwpCode,
  markLinePwp,
  markLinePwpWithAvailableCode,
  markLinePwpWithCode,
  pwpRewardPrice,
} from "./pwp-line";
import { sellingFabricsFor } from "../sofa-build/selling-fabrics";
import SofaBuildCanvas from "../sofa-build/SofaBuildCanvas";
import CreateSofaComboModal from "../sofa-build/CreateSofaComboModal";
import { useSeriesFabric, FABRIC_KIV } from "../sofa-build/use-series-fabric";
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
/** Translate a seeded arrangement so its footprint bbox centres in the room
 *  (Loo 2026-07-11 — a loaded quick pick lands mid-canvas, not top-left).
 *  Falls back to a 20px margin when the arrangement outgrows the room. */
export function centerSeedInRoom(cells: SeedCell[], depth: string): SeedCell[] {
  const bb = cellsBbox(cells.map((c, i) => ({ ...c, id: `seed-${i}` })), depth);
  if (!bb) return cells;
  const dx = Math.max(20, (ROOM_W - bb.w) / 2) - bb.x;
  const dy = Math.max(20, (ROOM_H - bb.h) / 2) - bb.y;
  return cells.map((c) => ({ ...c, x: Math.round(c.x + dx), y: Math.round(c.y + dy) }));
}

/** A combo's composition read like the customer facing the sofa — leftmost
 *  arm to rightmost arm along the connected chain (Loo 2026-07-11: the SKU
 *  reading convention — an arm opens, an arm closes a complete sofa). Seeds
 *  the layout, then applies the shared explode-order walk; NOT slot order. */
export function walkCodes(combo: SofaComboDto, depth = "24"): string[] {
  const seeded = comboSeedCells(combo, depth).map((c, i) => ({ ...c, id: `walk-${i}` }));
  return orderSofaCellsLeftToRight(seeded, depth).map((c) => c.moduleCode);
}

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

export default function SofaConfigurePage({
  model,
  // meta (fromPrice) is accepted for call-site parity, but the header shows
  // the LIVE canvas total instead (Loo 2026-07-10) — the price follows what's
  // actually placed on the canvas, no static from-price anywhere in the POS.
  meta: _meta,
  skus,
  fabrics,
  masterFabrics,
  optionPools,
  fabricTierConfig,
  modelFabricTierOverrides,
  sofaCompartments,
  modelCompartments,
  sofaCombos,
  catalog,
  cartLines,
  pwpReservedCodes,
  pwpClaimGroup,
  customerPhone,
  onApplyVoucherCode,
  editLine,
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
  /** PWP voucher bar — the full catalog bundle. Optional: absent (or 0 active
   *  pwp_rules) → the box never renders (DORMANT byte-identical). */
  catalog?: CatalogResponse | null;
  /** The current cart lines — PWP eligibility runs the shared
   *  `coveringPwpForLine` over cart + the emitted line. */
  cartLines?: DraftLine[];
  /** 0187 — the caller's RESERVED pwp_codes; Auto Fill binds one on claim. */
  pwpReservedCodes?: PwpCodeDto[];
  /** 0187 — the per-cart claimGroup stamped onto a bound reward line. */
  pwpClaimGroup?: string;
  /** 0188 — the cart's customer phone (gates the cross-order manual apply). */
  customerPhone?: string;
  /** 0188 — manual voucher-code lookup (type/scan a number → stripped DTO). */
  onApplyVoucherCode?: (code: string) => Promise<PwpDiscoverDto | null>;
  /** Cart-line EDIT (Loo 2026-07-12): a sofa-BUILD DraftLine to prefill from —
   *  opens straight in Customize with the stored geometry on the canvas and
   *  the fabric / leg / height restored. Read once at mount; `onAdd` then
   *  REPLACES the line in the cart. A PWP claim on the old line is NOT
   *  restored — the cart re-offers it. */
  editLine?: DraftLine;
  onAdd: (line: DraftLine) => void;
  onClose: () => void;
}) {
  // 0201/0202-wiring — the Maintenance-authored option sources:
  //   COMBO heights (quick-pick tabs) = ACTIVE `sofa_size` ∩ canonical axis;
  //   à-la-carte SIZES (Customize canvas, 0204) = EVERY active `sofa_size`
  //     value incl. non-canonical ("Flat") — per-size prices key off these;
  //   leg heights = `sofa_leg_height` pool ∩ this model's Modular ticks;
  //   fabrics = legacy per-model rows + the model's opted-in master fabrics.
  const offeredHeights = useMemo(() => gatedSofaHeights(model, optionPools), [model, optionPools]);
  const sofaSizes = useMemo(() => gatedSofaSizes(model, optionPools), [model, optionPools]);
  const legOpts = useMemo(
    () => allowedPoolValues(model, "sofa_leg_height", optionPools),
    [model, optionPools],
  );
  const sellingFabrics = useMemo(
    () => sellingFabricsFor(model, fabrics, masterFabrics),
    [model, fabrics, masterFabrics],
  );

  // Cart-line EDIT prefill — the stored `attrs.sofa_build` geometry + the
  // fabric / leg / remark picks, parsed tolerantly off the free jsonb. Read
  // ONCE at mount (the caller mounts a fresh page per edit) — it feeds state
  // initializers + the canvas's mount-time initial props only.
  const editBuild = useMemo(() => {
    const attrs = (editLine?.attrs ?? null) as Record<string, unknown> | null;
    const sb = attrs?.sofa_build as { cells?: unknown; height?: unknown } | undefined;
    if (!sb || !Array.isArray(sb.cells)) return null;
    const cells = (sb.cells as Array<Record<string, unknown>>)
      .filter((c) => typeof c?.moduleCode === "string")
      .map((c) => ({
        moduleCode: c.moduleCode as string,
        x: typeof c.x === "number" ? c.x : 0,
        y: typeof c.y === "number" ? c.y : 0,
        rot: (typeof c.rot === "number" && [0, 90, 180, 270].includes(c.rot)
          ? c.rot
          : 0) as Rot,
      }));
    if (cells.length === 0) return null;
    const height = typeof sb.height === "string" ? sb.height : null;
    const fabricKey =
      typeof attrs?.fabric_id === "string" && attrs.fabric_id
        ? `sf:${attrs.fabric_id}`
        : typeof attrs?.fabric_code === "string" && attrs.fabric_code
          ? `cf:${attrs.fabric_code}`
          : null;
    return {
      // Same treatment as a loaded quick pick (Loo 2026-07-12): the stored
      // geometry re-lands CENTRED in the room, wherever it was left when the
      // line was built. Pure translation — grouping/pricing are unaffected.
      cells: centerSeedInRoom(cells, height ?? "24"),
      height,
      fabricKey,
      fabricSeries: typeof attrs?.fabric_series === "string" ? attrs.fabric_series : null,
      legHeight: typeof attrs?.leg_height === "string" ? attrs.leg_height : null,
      remark: typeof attrs?.remark === "string" ? attrs.remark : "",
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fabric SERIES → COLOUR with two-level KIV (Loo 2026-07-06). The exact same
  // hook drives the Customize canvas, so the two surfaces never drift. Aliased
  // to the quick-pick names below.
  const {
    seriesList: fabricSeriesList,
    series: qpSeries,
    chooseSeries: chooseQpSeries,
    colourKey: qpFabricKey,
    setColourKey: setQpFabricKey,
    seriesColours,
    fabric: qpFabric,
    deferred: qpDeferred,
    fabricSeries: qpFabricSeries,
  } = useSeriesFabric(sellingFabrics, {
    key: editBuild?.fabricKey,
    series: editBuild?.fabricSeries,
  });
  // Customize size — CONTROLLED here so the header chips (Loo 2026-07-06) and
  // the canvas's bottom-bar picker drive the same value; survives the canvas
  // remount when a quick pick is loaded (seedKey).
  const [custSize, setCustSize] = useState<string>(() => {
    if (editBuild?.height && sofaSizes.includes(editBuild.height)) return editBuild.height;
    return sofaSizes.includes("24") ? "24" : sofaSizes[0] ?? "24";
  });
  // Customize LIVE total — mirrored up from the canvas engine (onLiveTotal) so
  // the header price follows every module placed/removed; null = empty canvas.
  const [custTotal, setCustTotal] = useState<number | null>(null);
  const picks: QuickPick[] = useMemo(
    () =>
      sofaCombos
        // 0206 — the Quick pick tab shows only rows flagged as Quick Pick
        // presets; plain pricing combos (isQuickPick=false) stay out of it.
        .filter((c) => c.modelId === model.id && c.active && !c.discontinuedAt && c.isQuickPick)
        .map((c) => {
          const codes = c.slots.map((s) => s[0]).filter((code): code is string => !!code);
          // The SKU reading convention (Loo 2026-07-11): an authored label
          // that is merely a "+"-join of these same codes (any order) is
          // re-read in the arm→arm walk order; a real custom name ("Family
          // corner L") passes through untouched.
          const walk = walkCodes(c);
          const label = c.label?.trim() ?? "";
          const labelCodes = label.split("+").map((s) => s.trim()).filter(Boolean);
          const isCodeJoin =
            labelCodes.length === codes.length &&
            [...labelCodes].sort().join("|") === [...codes].sort().join("|");
          return {
            combo: c,
            title: label && !isCodeJoin ? label : walk.join(" + "),
            codes,
          };
        }),
    [sofaCombos, model.id],
  );

  // An EDIT opens straight in Customize with the stored geometry loaded.
  const [mode, setMode] = useState<"quick" | "custom">(
    editBuild ? "custom" : picks.length > 0 ? "quick" : "custom",
  );
  // Principal-only "Create combo" (Loo 2026-07-06): a Master Admin can capture
  // the current Customize build as a priced sofa combo. `comboCodes` = the
  // arranged compartment codes handed up by the canvas (null = modal closed).
  const isPrincipal = useAuth((s) => s.role) === "principal";
  // 0206 — principal can delete a Quick Pick preset from its card (soft-delete).
  const deleteCombo = useDeleteSofaCombo();
  // 0206 — one modal, two kinds: "combo" (priced pricing rule) vs "quick_pick"
  // (a price-less layout preset shown in the Quick pick tab).
  const [creating, setCreating] = useState<{
    codes: string[];
    kind: "combo" | "quick_pick";
  } | null>(null);
  const [seed, setSeed] = useState<Array<{
    moduleCode: string;
    x: number;
    y: number;
    rot: Rot;
  }> | null>(editBuild ? editBuild.cells : null);
  // Remount key — bumps when a pick is loaded so the canvas re-reads the seed.
  const [seedKey, setSeedKey] = useState(0);

  // Per-card L↔R orientation (2990s "flip" — prototype pos-sofa-config.jsx). 'L'
  // = the combo as authored; 'R' = mirrored. Only shown for handed layouts.
  const [flip, setFlip] = useState<Record<string, "L" | "R">>({});

  /** The combo slots/codes to SHOW + SEED for a pick, honouring its flip. */
  function displayFor(pick: QuickPick): { flipped: boolean; slots: string[][]; codes: string[] } {
    const flipped = flip[pick.combo.id] === "R";
    const slots = flipped ? mirrorModules(pick.combo.slots) : pick.combo.slots;
    // Composition reads arm→arm left→right (the walk order), not slot order.
    const codes = walkCodes({ ...pick.combo, slots });
    return { flipped, slots, codes };
  }

  // ── INSERT PWP CODE — real apply (parity with PosConfigurePage) ──────────
  // The header box APPLIES a voucher, it no longer just validates: the emitted
  // line is PWP-claimed via the SAME markLinePwp* helpers the cart uses, price
  // forced to the reward figure. Eligibility runs the shared coveringPwpForLine
  // over cart + the emitted line — in Quick pick against a live candidate of
  // the current layout; in Customize (the canvas owns the cells) validation
  // runs at add-to-cart, falling back to the normal price with a toast when
  // the code doesn't cover the build. DORMANT (no catalog / 0 active rules) →
  // the box never renders.
  const pwpRulesActive = (catalog?.pwpRules ?? []).some((r) => r.active);
  const [pwpApplied, setPwpApplied] = useState<{
    ruleId: string;
    code: string | null;
    crossOrder: boolean;
  } | null>(null);
  const [pwpInput, setPwpInput] = useState("");
  const [pwpErr, setPwpErr] = useState<string | null>(null);
  const [pwpBusy, setPwpBusy] = useState(false);
  // Codes already bound to another reward line in this cart — never re-offer.
  const consumedCodes = new Set<string>();
  for (const l of cartLines ?? []) {
    const c = linePwpCode(l);
    if (c) consumedCodes.add(c);
  }
  const hasVoucherLayer = typeof pwpClaimGroup === "string" && pwpClaimGroup.length > 0;
  const activeRuleIds = new Set(
    (catalog?.pwpRules ?? []).filter((r) => r.active).map((r) => r.id),
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function loadPick(pick: QuickPick) {
    const { slots } = displayFor(pick);
    setSeed(centerSeedInRoom(comboSeedCells({ ...pick.combo, slots }, "24"), "24"));
    setSeedKey((k) => k + 1);
    setMode("custom");
  }

  // 0206 — principal deletes a Quick Pick preset (soft-delete via the shared
  // sofa-combo DELETE). A confirm guards the curated list against a mis-tap.
  function deletePick(pick: QuickPick) {
    if (deleteCombo.isPending) return;
    if (!window.confirm(`Delete quick pick "${pick.title}"?`)) return;
    deleteCombo.mutate(pick.combo.id, {
      onSuccess: () => toast.success("Quick pick deleted"),
      onError: () => toast.error("Could not delete the quick pick."),
    });
  }

  const fabricTierOverride =
    (modelFabricTierOverrides ?? []).find((o) => o.modelId === model.id) ?? null;

  // Price a quick-pick layout with the SAME engine the canvas + server use:
  // à-la-carte (the sum of the component compartment prices), or a matched
  // pricing combo when the layout hits one. A Quick Pick row carries no price of
  // its own (0206) — the total is computed live, not read off the combo.
  const pricingSnapshot: SofaPricingSnapshot = useMemo(
    () => ({
      compartmentPool: sofaCompartments,
      modelCompartments,
      sofaCombos,
      fabricTierOverride,
      fabricTierConfig: fabricTierConfig ?? null,
      legHeightPool: legOpts,
    }),
    [sofaCompartments, modelCompartments, sofaCombos, fabricTierOverride, fabricTierConfig, legOpts],
  );
  // Price with the SAME cells (incl. seeded geometry) the DraftLine emits, so
  // the preview total and the server recompute group/combo-gate identically —
  // combo matching is connectivity-gated (rule 1b in `computeSofaPrice`).
  const priceCells = (
    cells: SofaBuild["cells"],
    tier: FabricTier,
    height: string,
    leg: string | null,
  ) => {
    const build: SofaBuild = {
      modelId: model.id,
      cells,
      fabricTier: tier,
      height,
      legHeight: leg,
    };
    return computeSofaPrice(build, pricingSnapshot);
  };
  // Geometry-free code-list pricing (card "from" labels): the whole pick is one
  // connected sofa by definition, which is exactly the engine's no-geometry
  // fallback group.
  const pricePick = (codes: string[], tier: FabricTier, height: string, leg: string | null) =>
    priceCells(codes.map((moduleCode) => ({ moduleCode })), tier, height, leg);
  // Card "from" price — the base layout total at PRICE_1 fabric, no leg.
  const cardHeight = offeredHeights[0] ?? "24";
  const cardPriceLabel = (codes: string[]) => {
    const t = pricePick(codes, "PRICE_1", cardHeight, null).total;
    return t > 0 ? `From RM ${t.toLocaleString("en-MY")}` : "—";
  };

  // Hero pane previews the SELECTED (else first) pick — CLICK only, no
  // hover-follow (Loo 2026-07-11: the preview must not chase the mouse).
  // Customize stays the explicit canvas path.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const heroPick =
    picks.find((p) => p.combo.id === selectedId) ??
    picks[0] ??
    null;

  // ── Quick-pick direct-add controls (seat height · fabric · leg · remark) ──
  const [qpHeight, setQpHeight] = useState<SofaHeight>(() => {
    const h = editBuild?.height as SofaHeight | null | undefined;
    return h && offeredHeights.includes(h) ? h : offeredHeights[0] ?? "24";
  });
  const [qpLeg, setQpLeg] = useState<string>(() => {
    const v = editBuild?.legHeight ?? "";
    return v && legOpts.some((o) => o.value === v) ? v : "";
  });
  const [qpRemark, setQpRemark] = useState(editBuild?.remark ?? "");

  // Heights = the model's full offered sizes (à-la-carte prices any size; a
  // matched combo may cover only some, and the engine falls back per size).
  const heroHeights = heroPick ? offeredHeights : [];
  const effHeight = heroHeights.includes(qpHeight) ? qpHeight : heroHeights[0] ?? qpHeight;
  // KIV (series or colour) → no concrete fabric → no tier delta yet. These ride
  // onto the DraftLine attrs; the LIVE TOTAL itself comes from computeSofaPrice.
  const qpDelta = qpFabric
    ? resolveFabricDelta(qpFabric.tier, fabricTierOverride, fabricTierConfig ?? null)
    : 0;
  // Leg-height surcharge (0201 pool; server re-verifies via computeSofaPrice).
  const qpLegDelta = qpLeg ? legOpts.find((o) => o.value === qpLeg)?.surcharge ?? 0 : 0;
  // The hero layout seeded at the chosen depth — ONE joined plan view + bbox dims.
  const heroCells = heroPick
    ? comboSeedCells({ ...heroPick.combo, slots: displayFor(heroPick).slots }, effHeight)
    : [];
  // LIVE TOTAL = component sum, or a matched combo price — priced live via the
  // shared engine (NOT read off the combo, which has no price for a quick pick).
  // Priced on the SEEDED cells (the geometry `addQuickPick` emits), so the
  // connectivity-gated combo decision here == the server recompute's.
  const qpTotal = heroPick
    ? priceCells(
        heroCells.map((c) => ({ moduleCode: c.moduleCode, x: c.x, y: c.y, rot: c.rot })),
        qpFabric?.tier ?? "PRICE_1",
        effHeight,
        qpLeg || null,
      ).total
    : null;
  const heroDims = cellsDims(heroCells, effHeight);

  /** The DraftLine the CURRENT quick pick would emit (geometry + options) —
   *  the PWP eligibility candidate. Null in Customize / no pick / no rep sku. */
  const quickCandidate: DraftLine | null = (() => {
    if (!catalog || !pwpRulesActive || mode !== "quick" || !heroPick) return null;
    const { slots } = displayFor(heroPick);
    const seeded = comboSeedCells({ ...heroPick.combo, slots }, effHeight);
    const cells = seeded.map((c) => ({ moduleCode: c.moduleCode, x: c.x, y: c.y, rot: c.rot }));
    const priced = priceCells(cells, qpFabric?.tier ?? "PRICE_1", effHeight, qpLeg || null);
    return buildToDraftLine(
      {
        cells,
        height: effHeight,
        fabricTier: qpFabric?.tier ?? "PRICE_1",
        fabricId: qpFabric?.id ?? null,
        fabricCode: qpFabric?.code ?? null,
        fabricName: qpFabric?.name ?? null,
        fabricSeries: qpFabricSeries,
        fabricSurcharge: qpDelta,
        fabricDeferred: qpDeferred,
        legHeight: qpLeg || null,
        legSurcharge: qpLegDelta,
        total: priced.total,
        priceBasis: priced.basis,
      },
      model,
      skus,
    );
  })();
  /** The rules that would grant the current quick pick — null = UNKNOWN
   *  (Customize mode owns its cells; validation then runs at add-to-cart). */
  const pwpCovering =
    quickCandidate && catalog
      ? coveringPwpForLine(quickCandidate, [...(cartLines ?? []), quickCandidate], catalog)
      : null;

  // Auto Fill target: the first covering rule backed by a free RESERVED code
  // (voucher layer on); without the layer the first covering rule claims
  // code-less — byte-identical to P8b (mirrors CartDrawer/PosConfigurePage).
  const autoFill = (() => {
    if (!pwpCovering) return null;
    for (const rule of pwpCovering) {
      const code =
        (pwpReservedCodes ?? []).find(
          (rc) => rc.ruleId === rule.id && rc.status === "RESERVED" && !consumedCodes.has(rc.code),
        )?.code ?? null;
      if (!hasVoucherLayer || code) return { rule, code };
    }
    return null;
  })();

  function applyAutoFill() {
    if (!autoFill) return;
    setPwpApplied({ ruleId: autoFill.rule.id, code: autoFill.code, crossOrder: false });
    setPwpInput(autoFill.code ?? "");
    setPwpErr(null);
  }

  async function applyManualCode() {
    const code = pwpInput.trim().toUpperCase();
    if (!code) return;
    // A same-cart RESERVED code typed by hand binds exactly like Auto Fill.
    const reserved = (pwpReservedCodes ?? []).find(
      (rc) => rc.code.toUpperCase() === code && rc.status === "RESERVED",
    );
    if (reserved) {
      if (consumedCodes.has(reserved.code)) {
        setPwpErr("This voucher is already applied to a line in this cart.");
        return;
      }
      if (!reserved.ruleId || !activeRuleIds.has(reserved.ruleId)) {
        setPwpErr("This voucher's offer is no longer active.");
        return;
      }
      if (pwpCovering && !pwpCovering.some((r) => r.id === reserved.ruleId)) {
        setPwpErr("This voucher doesn't apply to this sofa layout.");
        return;
      }
      setPwpApplied({ ruleId: reserved.ruleId, code: reserved.code, crossOrder: false });
      setPwpErr(null);
      return;
    }
    // Cross-order (carry-forward) voucher — phone-bound; the server re-asserts.
    if (!onApplyVoucherCode || !hasVoucherLayer) {
      setPwpErr("Voucher not found, already used, or expired.");
      return;
    }
    if (!(customerPhone ?? "").trim()) {
      setPwpErr(
        "Enter the customer's phone (step 02) first to redeem a saved voucher — or apply it from the cart.",
      );
      return;
    }
    setPwpBusy(true);
    setPwpErr(null);
    try {
      const v = await onApplyVoucherCode(code);
      if (!v) {
        setPwpErr("Voucher not found, already used, or expired.");
        return;
      }
      if (consumedCodes.has(v.code)) {
        setPwpErr("This voucher is already applied to a line in this cart.");
        return;
      }
      if (!v.phoneMatches || !v.nameMatches) {
        setPwpErr("This voucher belongs to a different customer.");
        return;
      }
      if (!v.ruleId || !activeRuleIds.has(v.ruleId)) {
        setPwpErr("This voucher's offer is no longer active.");
        return;
      }
      if (pwpCovering && !pwpCovering.some((r) => r.id === v.ruleId)) {
        setPwpErr("This voucher doesn't apply to this sofa layout.");
        return;
      }
      setPwpApplied({ ruleId: v.ruleId, code: v.code, crossOrder: true });
    } catch {
      setPwpErr("Couldn't check that voucher — please retry.");
    } finally {
      setPwpBusy(false);
    }
  }

  // Quick-mode preview: the applied rule's PWP total for the CURRENT layout.
  // Null when the applied code doesn't cover it (the chip then warns that the
  // sofa will add at its normal price).
  const qpAppliedRule =
    pwpApplied && pwpCovering
      ? pwpCovering.find((r) => r.id === pwpApplied.ruleId) ?? null
      : null;
  const qpPwpTotal =
    qpAppliedRule && quickCandidate && catalog
      ? pwpRewardPrice(quickCandidate, catalog, qpAppliedRule)
      : null;

  /** Mark the emitted line as the applied PWP reward — validated against the
   *  REAL line via the same shared resolver the server runs. Not covered →
   *  toast + the line goes in at its normal price (never a dishonest claim). */
  function finalizePwpLine(line: DraftLine): DraftLine {
    if (!pwpApplied || !catalog) return line;
    const covering = coveringPwpForLine(line, [...(cartLines ?? []), line], catalog);
    const rule = covering.find((r) => r.id === pwpApplied.ruleId);
    const price = rule ? pwpRewardPrice(line, catalog, rule) : null;
    if (!rule || price == null) {
      toast.error("The PWP code doesn't cover this sofa — added at the normal price.");
      return line;
    }
    if (pwpApplied.code && pwpClaimGroup) {
      return pwpApplied.crossOrder
        ? markLinePwpWithAvailableCode(line, rule, price, pwpApplied.code, pwpClaimGroup)
        : markLinePwpWithCode(line, rule, price, pwpApplied.code, pwpClaimGroup);
    }
    return markLinePwp(line, rule, price);
  }

  /** Add the previewed preset straight to the cart (no canvas hop). Priced live
   *  via the shared engine — à-la-carte, or a matched combo. */
  function addQuickPick(pick: QuickPick) {
    const { slots } = displayFor(pick);
    const seeded = comboSeedCells({ ...pick.combo, slots }, effHeight);
    const cells = seeded.map((c) => ({ moduleCode: c.moduleCode, x: c.x, y: c.y, rot: c.rot }));
    // Price the EXACT cells the line emits (geometry included) — the server
    // recompute re-groups them for the connectivity-gated combo decision, and
    // the drift gate demands the preview agree.
    const priced = priceCells(cells, qpFabric?.tier ?? "PRICE_1", effHeight, qpLeg || null);
    const line = buildToDraftLine(
      {
        cells,
        height: effHeight,
        fabricTier: qpFabric?.tier ?? "PRICE_1",
        fabricId: qpFabric?.id ?? null,
        fabricCode: qpFabric?.code ?? null,
        fabricName: qpFabric?.name ?? null,
        // Record the chosen series even when the colour is KIV (the hook drops
        // the synthetic "Other" bucket to null).
        fabricSeries: qpFabricSeries,
        fabricSurcharge: qpDelta,
        fabricDeferred: qpDeferred,
        legHeight: qpLeg || null,
        legSurcharge: qpLegDelta,
        total: priced.total,
        priceBasis: priced.basis,
      },
      model,
      skus,
    );
    if (line) {
      const attrs = line.attrs as Record<string, unknown>;
      if (qpRemark.trim()) attrs.remark = qpRemark.trim();
      onAdd(finalizePwpLine(line));
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
          eyebrow/model · mode tabs (rail pill pair) · live total. */}
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
          {/* Seat-size toggle — top-left, beside the mode tabs (prototype).
              Quick pick: combo-priced sizes only (a chip must be sellable at
              its combo price). Customize: the model's FULL gated size axis —
              same chips drive the canvas's controlled size (Loo 2026-07-06). */}
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
          {mode === "custom" && sofaSizes.length > 0 && (
            <span
              className="sof-flow__modeTabs"
              role="group"
              aria-label="Seat size"
              data-testid="sofa-cust-sizes"
            >
              {sofaSizes.map((h) => (
                <button
                  key={h}
                  type="button"
                  className={`sof-flow__modeTab ${custSize === h ? "is-on" : ""}`}
                  aria-pressed={custSize === h}
                  onClick={() => setCustSize(h)}
                  data-testid={`sofa-cust-size-${h}`}
                >
                  {/^\d+$/.test(h) ? <>{h}&Prime;</> : h}
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
        {/* INSERT PWP CODE — real apply (Auto Fill same-cart RESERVED code, or
            type a reserved / saved voucher). DORMANT-hidden without active
            rules. Not covered in Quick pick → an inline warning; Customize
            validates at add-to-cart (toast fallback to the normal price). */}
        {catalog && pwpRulesActive && (
          <div
            className="sof-flow__pwp"
            style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}
            data-testid="sofa-pwp"
          >
            {pwpApplied ? (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }} className="t-small">
                <span className="pill pill-confirmed" data-testid="sofa-pwp-applied">
                  {pwpApplied.code ? `PWP ${pwpApplied.code}` : "PWP price"} ✓
                  {qpPwpTotal != null ? ` · RM ${qpPwpTotal.toLocaleString("en-MY")}` : ""}
                </span>
                {pwpCovering && !qpAppliedRule && (
                  <span className="t-small text-warning" data-testid="sofa-pwp-uncovered">
                    doesn't cover this layout — adds at normal price
                  </span>
                )}
                <button
                  type="button"
                  className="t-small text-base-500 underline hover:text-base-800"
                  onClick={() => {
                    setPwpApplied(null);
                    setPwpInput("");
                    setPwpErr(null);
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
                    if (pwpErr) setPwpErr(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void applyManualCode();
                  }}
                  placeholder="Insert PWP code"
                  aria-label="Insert PWP code"
                  className="rounded-[6px] border border-base-300 bg-white px-2 py-1.5 t-small uppercase"
                  style={{ width: 148 }}
                  data-testid="sofa-pwp-input"
                />
                {autoFill && (
                  <button
                    type="button"
                    className="btn btn--primary"
                    onClick={applyAutoFill}
                    data-testid="sofa-pwp-autofill"
                  >
                    Auto Fill
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn--secondary"
                  disabled={pwpBusy || !pwpInput.trim()}
                  onClick={() => void applyManualCode()}
                  data-testid="sofa-pwp-apply"
                >
                  {pwpBusy ? "Checking…" : "Apply"}
                </button>
                {pwpErr && (
                  <span className="t-small text-danger" data-testid="sofa-pwp-error">
                    {pwpErr}
                  </span>
                )}
              </>
            )}
          </div>
        )}
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
                {(qpPwpTotal ?? qpTotal) !== null ? (
                  <>
                    <sup>RM</sup>
                    {(qpPwpTotal ?? qpTotal)!.toLocaleString("en-MY")}
                  </>
                ) : (
                  "—"
                )}
              </div>
              <div className="cfg-header__totalNote">
                {qpPwpTotal != null
                  ? "PWP voucher price"
                  : "component total · combo when matched"}
              </div>
            </div>
          ) : (
            <div className="cfg-header__total" tabIndex={0}>
              <div className="cfg-header__totalLabel">Live total</div>
              <div className="cfg-header__totalNum" data-testid="sofa-cust-total">
                {custTotal !== null ? (
                  <>
                    <sup>RM</sup>
                    {custTotal.toLocaleString("en-MY")}
                  </>
                ) : (
                  "—"
                )}
              </div>
              <div className="cfg-header__totalNote">component total · combo when matched</div>
            </div>
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
            {/* Quick pick is priced live (component total, or a matched combo)
                — the direct Add to Cart uses that engine price. */}
            {mode === "quick" && qpTotal !== null && (
              <button
                type="button"
                className="btn btn--primary"
                disabled={!heroPick}
                onClick={() => heroPick && addQuickPick(heroPick)}
                data-testid="sofa-qp-add"
              >
                <Plus size={14} strokeWidth={2} /> {editLine ? "Update item" : "Add to Cart"}
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
                <span className="sof-qp__railDetail">component total · combo when matched</span>
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
                      className={`sof-qp__card ${isOn ? "is-on" : ""}`}
                      data-testid={`sofa-quick-pick-${p.combo.id}`}
                    >
                      <span className="sof-qp__art" style={{ gap: 2 }}>
                        <SofaPlanView cells={cardCells} depth="24" className="h-full w-full" />
                      </span>
                      <span className="sof-qp__cardBody">
                        <span className="sof-qp__cardLabel">{p.title}</span>
                        <span className="sof-qp__cardSub">{d.codes.join(" + ")}</span>
                        <span className="sof-qp__cardPrice">{cardPriceLabel(p.codes)}</span>
                        {/* Jump straight onto the drag canvas with THIS layout
                            loaded (Loo 2026-07-11). span[role=button] — the card
                            itself is a <button> (same idiom as flip/delete). */}
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedId(p.combo.id);
                            loadPick(p);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.stopPropagation();
                              e.preventDefault();
                              setSelectedId(p.combo.id);
                              loadPick(p);
                            }
                          }}
                          className="sof-qp__cardCustomize"
                          data-testid={`sofa-quick-pick-customize-${p.combo.id}`}
                        >
                          Continue in Customize →
                        </span>
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
                      {isPrincipal && (
                        <span
                          role="button"
                          tabIndex={0}
                          aria-label={`Delete quick pick ${p.title}`}
                          title="Delete this quick pick"
                          onClick={(e) => {
                            e.stopPropagation();
                            deletePick(p);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.stopPropagation();
                              e.preventDefault();
                              deletePick(p);
                            }
                          }}
                          data-testid={`sofa-quick-pick-delete-${p.combo.id}`}
                          style={{
                            position: "absolute",
                            top: 8,
                            left: 8,
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            width: 24,
                            height: 24,
                            borderRadius: 999,
                            background: "var(--pos-panel, #fff)",
                            border: "1px solid var(--line)",
                            color: "var(--c-burnt, #BC4319)",
                            cursor: "pointer",
                          }}
                        >
                          <Trash2 size={13} strokeWidth={2} />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Fabric — Series → Colour, both deferrable via KIV (Loo
                  2026-07-06). Pick a series → its colours appear; either level
                  can stay KIV so the sofa still adds to cart. One series → the
                  series step auto-collapses. A swatch chip shows the pick. */}
              {sellingFabrics.length > 0 && (
                <>
                  <div className="sof-qp__railHead" style={{ marginTop: 16 }}>
                    <span className="pos-eyebrow">Fabric option</span>
                    <span className="sof-qp__railDetail">series · colour · KIV to defer</span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {fabricSeriesList.length > 1 && (
                      <select
                        value={qpSeries}
                        onChange={(e) => chooseQpSeries(e.target.value)}
                        aria-label="Fabric series"
                        className="rounded-[6px] border border-base-300 bg-white px-2 py-1.5 t-small"
                        style={{ width: "100%" }}
                        data-testid="sofa-qp-fabric-series"
                      >
                        <option value="">KIV · series to confirm</option>
                        {fabricSeriesList.map((s) => (
                          <option key={s} value={s}>
                            {s === "Other" ? "Other" : `${s} series`}
                          </option>
                        ))}
                      </select>
                    )}
                    {qpSeries && (
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span
                          className="h-4 w-4 shrink-0 rounded-full border border-base-300"
                          style={{ background: qpFabric?.swatch ?? "transparent" }}
                          aria-hidden="true"
                        />
                        <select
                          value={qpFabricKey}
                          onChange={(e) => setQpFabricKey(e.target.value)}
                          aria-label="Fabric colour"
                          className="rounded-[6px] border border-base-300 bg-white px-2 py-1.5 t-small"
                          style={{ width: "100%" }}
                          data-testid="sofa-qp-fabric"
                        >
                          <option value={FABRIC_KIV}>KIV · colour to confirm</option>
                          {seriesColours.map((f) => {
                            const delta = resolveFabricDelta(
                              f.tier,
                              fabricTierOverride,
                              fabricTierConfig ?? null,
                            );
                            return (
                              <option key={f.key} value={f.key}>
                                {f.name}
                                {delta > 0
                                  ? ` · +RM ${delta.toLocaleString("en-MY")}`
                                  : " · Included"}
                              </option>
                            );
                          })}
                        </select>
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* Leg height — the sofa_leg_height pool ∩ Modular ticks (0201).
                  Optional; the surcharge joins the drift-gated build total.
                  A dropdown (Loo 2026-07-06) — the tiers read as one ordered
                  list instead of a wrap of look-alike "Included" chips. */}
              {legOpts.length > 0 && (
                <>
                  <div className="sof-qp__railHead" style={{ marginTop: 16 }}>
                    <span className="pos-eyebrow">Leg height</span>
                    <span className="sof-qp__railDetail">optional · KIV to defer</span>
                  </div>
                  <select
                    value={qpLeg}
                    onChange={(e) => setQpLeg(e.target.value)}
                    aria-label="Leg height"
                    className="rounded-[6px] border border-base-300 bg-white px-2 py-1.5 t-small"
                    style={{ width: "100%" }}
                    data-testid="sofa-qp-legs"
                  >
                    <option value="">KIV</option>
                    {legOpts.map((o) => (
                      <option key={o.id} value={o.value}>
                        {o.value}
                        {o.surcharge != null && o.surcharge !== 0
                          ? ` · +RM ${o.surcharge.toLocaleString("en-MY")}`
                          : " · Included"}
                      </option>
                    ))}
                  </select>
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
            initialFabricKey={seedKey === 0 ? editBuild?.fabricKey : undefined}
            initialFabricSeries={seedKey === 0 ? editBuild?.fabricSeries : undefined}
            initialLegHeight={seedKey === 0 ? editBuild?.legHeight : undefined}
            addLabel={editLine ? "Update item" : undefined}
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
            heights={sofaSizes}
            heightValue={custSize}
            onHeightChange={setCustSize}
            onLiveTotal={setCustTotal}
            onAddBuild={(payload) => {
              const line = buildToDraftLine(payload, model, skus);
              // An applied voucher is validated against the REAL build here
              // (finalizePwpLine) — covered → the line goes in PWP-claimed at
              // the forced reward price; not covered → toast + normal price.
              if (line) onAdd(finalizePwpLine(line));
              onClose();
            }}
            onCreateCombo={
              isPrincipal ? (codes) => setCreating({ codes, kind: "combo" }) : undefined
            }
            onCreateQuickPick={
              isPrincipal ? (codes) => setCreating({ codes, kind: "quick_pick" }) : undefined
            }
            onClose={onClose}
          />
        </div>
      )}
      {creating && (
        <CreateSofaComboModal
          model={model}
          moduleCodes={creating.codes}
          heights={offeredHeights}
          kind={creating.kind}
          onClose={() => setCreating(null)}
        />
      )}
    </div>,
    document.body,
  );
}
