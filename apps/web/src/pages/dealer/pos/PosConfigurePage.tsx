import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, LayoutTemplate, Minus, Plus, Ticket, X } from "lucide-react";
import type {
  CatalogFabricDto,
  CatalogOptionPoolDto,
  CatalogResponse,
  FabricTierGlobalConfig,
  ModelFabricTierOverrideDto,
  ProductModelDto,
  ProductSkuDto,
  PwpCodeDto,
  PwpDiscoverDto,
  SpecialAddonDto,
} from "@carres/shared";
import {
  allowedFabricsFor,
  allowedPoolValues,
  computedTotalHeight,
  resolveFabricDelta,
  resolveOptionsTotal,
  type OptionPick,
} from "@carres/shared";
import type { DraftLine } from "../new-order/draft";
import { newLocalId } from "../new-order/configurators";
import { SpecialAddonsPicker, useSpecials } from "../new-order/special-addons-picker";
import { useSeriesFabric, FABRIC_KIV } from "../sofa-build/use-series-fabric";
import type { SellingFabric } from "../sofa-build/selling-fabrics";
import type { ModelMeta } from "./catalog-index";
import {
  coveringPwpForLine,
  linePwpCode,
  markLinePwp,
  markLinePwpWithAvailableCode,
  markLinePwpWithCode,
  pwpRewardPrice,
} from "./pwp-line";

/**
 * Full-page mattress / bed-frame configurator — the design prototype's
 * ConfiguratorScreen (`prototype/pos-configurator.jsx`, lockTab mode): a
 * cfg-header with the live total + breakdown popover and Cancel / Add CTA,
 * over a cfg-grid of plan-view canvas (left) + option controls (right).
 *
 * The DraftLine it emits is byte-identical to the old drawer configurators
 * (`new-order/configurators.tsx` Mattress/BedframeConfigurator) — same attrs,
 * same unitPrice math, same label — only the shell changed. Specials keep the
 * functional `SpecialAddonsPicker` (same convention as the cart popup: shell
 * is prototype, internals untouched).
 */

/** Standard MY bed sizes (cm) — the plan view draws these to scale. */
const SIZE_FOOTPRINTS: { match: RegExp; code: string; w: number; d: number; label: string }[] = [
  { match: /super\s*single/i, code: "ss", w: 107, d: 190, label: "Super single" },
  { match: /\bking\b/i, code: "k", w: 183, d: 190, label: "King" },
  { match: /\bqueen\b/i, code: "q", w: 152, d: 190, label: "Queen" },
  { match: /\bsingle\b/i, code: "s", w: 91, d: 190, label: "Single" },
];

export interface SizeFootprint {
  w: number;
  d: number;
  label: string;
}

/** Mattress-gap "Confirm later" sentinel — rides attrs.gap verbatim so the
 *  SO PDF / Create-PO / receive modals show the choice is still pending
 *  (the team's KIV vocabulary, same as the fabric/leg dropdowns). */
export const GAP_KIV = "KIV";

/** Best-effort footprint from a sku's free-text variant ("Queen", "Fab2-King",
 *  "152 x 190", bare "K"/"Q"/"SS"/"S" codes). Null = unknown → the plan view
 *  falls back to its empty state; nothing else depends on this. */
export function footprintForVariant(variant: string | null | undefined): SizeFootprint | null {
  if (!variant) return null;
  const dims = variant.match(/(\d{2,3})\s*[x×]\s*(\d{2,3})/);
  if (dims) {
    const w = Number(dims[1]);
    const d = Number(dims[2]);
    if (w >= 60 && w <= 220 && d >= 150 && d <= 220) return { w, d, label: variant.trim() };
  }
  for (const f of SIZE_FOOTPRINTS) if (f.match.test(variant)) return { w: f.w, d: f.d, label: f.label };
  const bare = variant.toLowerCase().replace(/[^a-z]/g, "");
  const byCode = SIZE_FOOTPRINTS.find((f) => f.code === bare);
  return byCode ? { w: byCode.w, d: byCode.d, label: byCode.label } : null;
}

/** Wood / upholstery tone for a free-text colour name — drives the bed plan
 *  view's frame tint + swatch chip. Unknown names fall back to natural oak. */
export function hexForColourName(name: string): string {
  const n = name.toLowerCase();
  const MAP: [RegExp, string][] = [
    [/walnut/, "#6B4A2B"],
    [/oak|natural|wood/, "#C8A878"],
    [/ash|pale/, "#D4C7AF"],
    [/white|ivory/, "#E8E4DC"],
    [/black|charcoal|ink/, "#3A3537"],
    [/gr[ae]y|slate|stone/, "#9B9389"],
    [/brown|coffee|mocha/, "#8B5A33"],
    [/cream|bouc/, "#F0E5C9"],
    [/beige|sand|khaki|linen|oat/, "#DDD7CF"],
    [/blue|navy/, "#34495E"],
    [/green|forest|olive/, "#2F5D4F"],
    [/red|maroon|rust|terracotta/, "#A6471E"],
  ];
  for (const [re, hex] of MAP) if (re.test(n)) return hex;
  return "#C8A878";
}

/** Measure the plan container so the drawing scales to its parent — the
 *  design's usePlanContainer (width-driven, stable height). */
function usePlanContainer(): [React.RefObject<HTMLDivElement>, { w: number; h: number }] {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 460, h: 280 });
  useEffect(() => {
    if (!ref.current) return;
    // jsdom (tests) has no ResizeObserver — fall back to the default size.
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        const cw = e.contentRect.width;
        const w = Math.max(220, cw - 80);
        const h = Math.max(220, Math.min(420, Math.round(w * 0.7)));
        setSize({ w, h });
      }
    });
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, size];
}

/** Mattress plan view — the selected size as a quilted to-scale rectangle,
 *  measured at the perimeter (design's MattressPlanView; scaled against the
 *  largest stocked size so Single reads visibly smaller than King). */
function MattressPlan({ footprint }: { footprint: SizeFootprint | null }) {
  const [ref, target] = usePlanContainer();
  if (!footprint) {
    return (
      <div className="cfg-plan cfg-plan--empty" ref={ref}>
        <div className="cfg-plan__emptyInner">
          <LayoutTemplate size={28} strokeWidth={1.5} />
          <div>Pick a size to see the footprint to scale.</div>
        </div>
      </div>
    );
  }
  const maxW = 183;
  const maxD = 190;
  const scale = Math.min(target.w / (maxW + 12), target.h / (maxD + 12));
  const drawW = maxW * scale;
  const drawH = maxD * scale;
  const mattW = footprint.w * scale;
  const mattH = footprint.d * scale;
  const offsetX = (drawW - mattW) / 2;
  const offsetY = (drawH - mattH) / 2;

  return (
    <div className="cfg-plan cfg-plan--mattress" ref={ref}>
      <div className="cfg-plan__inner" style={{ width: drawW + 80, height: drawH + 80, position: "relative" }}>
        <div className="cfg-plan__measureTop" style={{ left: 40 + offsetX, top: 14, width: mattW }}>
          <span className="cfg-plan__measureTick"></span>
          <span className="cfg-plan__measureNum">{footprint.w} cm</span>
          <span className="cfg-plan__measureTick"></span>
        </div>
        <div className="cfg-plan__measureLeft" style={{ left: 14, top: 40 + offsetY, height: mattH }}>
          <span className="cfg-plan__measureTick"></span>
          <span className="cfg-plan__measureNum">{footprint.d} cm</span>
          <span className="cfg-plan__measureTick"></span>
        </div>
        <div style={{ position: "absolute", left: 40 + offsetX, top: 40 + offsetY }}>
          <div className="cfg-plan__mattActive" style={{ width: mattW, height: mattH }}>
            <div className="cfg-plan__mattSeams" />
          </div>
        </div>
      </div>
      <div className="cfg-plan__legend">
        <span>
          <span className="cfg-plan__legendDot cfg-plan__legendDot--matt"></span>
          {footprint.label} footprint
        </span>
        <span style={{ marginLeft: "auto" }}>
          {footprint.w} × {footprint.d} cm
        </span>
      </div>
    </div>
  );
}

/** Bed-frame plan view — frame outline (+18 cm overhang / +12 cm depth pad)
 *  around the dashed mattress area, tinted by the picked colour (design's
 *  BedPlanView; Carres frames are all platform style → no headboard block). */
function BedPlan({
  footprint,
  colourName,
}: {
  footprint: SizeFootprint | null;
  colourName: string;
}) {
  const [ref, target] = usePlanContainer();
  if (!footprint) {
    return (
      <div className="cfg-plan cfg-plan--empty" ref={ref}>
        <div className="cfg-plan__emptyInner">
          <LayoutTemplate size={28} strokeWidth={1.5} />
          <div>Pick a size to see the frame footprint.</div>
        </div>
      </div>
    );
  }
  const hex = hexForColourName(colourName);
  const totalW = footprint.w + 18;
  const totalD = footprint.d + 12;
  const scale = Math.min(target.w / totalW, target.h / totalD);

  return (
    <div className="cfg-plan" ref={ref}>
      <div
        className="cfg-plan__inner"
        style={{ width: totalW * scale + 80, height: totalD * scale + 80, position: "relative" }}
      >
        <div className="cfg-plan__measureTop" style={{ left: 40, top: 14, width: totalW * scale }}>
          <span className="cfg-plan__measureTick"></span>
          <span className="cfg-plan__measureNum">{totalW} cm</span>
          <span className="cfg-plan__measureTick"></span>
        </div>
        <div className="cfg-plan__measureLeft" style={{ left: 14, top: 40, height: totalD * scale }}>
          <span className="cfg-plan__measureTick"></span>
          <span className="cfg-plan__measureNum">{totalD} cm</span>
          <span className="cfg-plan__measureTick"></span>
        </div>
        <div style={{ position: "absolute", left: 40, top: 40 }}>
          <div
            className="cfg-plan__block"
            style={{
              width: totalW * scale,
              height: totalD * scale,
              background: "#FFFCF3",
              border: `2px solid ${hex}`,
              borderRadius: 6,
              position: "relative",
            }}
          >
            <div
              style={{
                position: "absolute",
                left: 9 * scale,
                top: 6 * scale,
                width: footprint.w * scale,
                height: footprint.d * scale,
                background: "#F4F0E1",
                border: "1px dashed rgba(34,31,32,0.28)",
                borderRadius: 4,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexDirection: "column",
                gap: 2,
              }}
            >
              <span
                style={{
                  fontFamily: "var(--font-button)",
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: "var(--fg-muted)",
                }}
              >
                {footprint.label}
              </span>
              <span style={{ fontSize: 10, color: "var(--fg-soft)" }}>
                {footprint.w} × {footprint.d} cm
              </span>
            </div>
          </div>
        </div>
      </div>
      <div className="cfg-plan__legend">
        <span>
          <span className="cfg-plan__legendDot" style={{ background: hex }}></span>
          {colourName || "Frame"}
        </span>
        <span>
          <span
            className="cfg-plan__legendDot"
            style={{ background: "#F4F0E1", border: "1px dashed rgba(34,31,32,0.4)" }}
          ></span>
          Mattress area
        </span>
        <span style={{ marginLeft: "auto" }}>Platform frame</span>
      </div>
    </div>
  );
}

export default function PosConfigurePage({
  model,
  // meta (fromPrice) is accepted for call-site parity with the drawer, but the
  // header shows the LIVE total instead — the design has no from-price slot.
  meta: _meta,
  skus,
  specialAddons,
  optionPools,
  fabrics,
  fabricTierConfig,
  modelFabricTierOverrides,
  catalog,
  cartLines,
  pwpReservedCodes,
  pwpClaimGroup,
  customerPhone,
  onApplyVoucherCode,
  onAdd,
  onClose,
}: {
  model: ProductModelDto;
  meta: ModelMeta | undefined;
  skus: ProductSkuDto[];
  specialAddons?: SpecialAddonDto[] | null;
  /** 0201-wiring — the Maintenance option pools (divan / gap / leg heights). */
  optionPools?: CatalogOptionPoolDto[] | null;
  /** 0202-wiring — the master fabric list (per-model opt-in ticks gate it). */
  fabrics?: CatalogFabricDto[] | null;
  fabricTierConfig?: FabricTierGlobalConfig | null;
  modelFabricTierOverrides?: ModelFabricTierOverrideDto[] | null;
  /** PWP voucher bar (P8b/c/d) — the full catalog bundle. Optional: absent (or
   *  0 active pwp_rules) → the voucher section never renders (DORMANT). */
  catalog?: CatalogResponse | null;
  /** The current cart lines — PWP eligibility runs the SAME shared
   *  `coveringPwpForLine` over cart + this candidate, so the bar never offers a
   *  claim the server would 409. */
  cartLines?: DraftLine[];
  /** 0187 — the caller's RESERVED pwp_codes (from /pwp-codes/mine). Auto Fill
   *  binds the first free one under a covering rule. */
  pwpReservedCodes?: PwpCodeDto[];
  /** 0187 — the per-cart claimGroup stamped onto a bound reward line. */
  pwpClaimGroup?: string;
  /** 0188 — the cart's customer phone; gates the cross-order manual Apply
   *  (a carry-forward voucher is phone-bound; the server re-asserts). */
  customerPhone?: string;
  /** 0188 — manual voucher-code lookup (type/scan a number → stripped DTO). */
  onApplyVoucherCode?: (code: string) => Promise<PwpDiscoverDto | null>;
  onAdd: (line: DraftLine) => void;
  onClose: () => void;
}) {
  const isBed = model.category === "bedframe";
  const catLabel = isBed ? "Bed frame" : "Mattress";

  // 0201-wiring — bedframe option pools, gated by the model's Modular ticks
  // (empty ticks = every active master option; the 2990s default). Gaps keep
  // the legacy `model.gaps` column as a tick fallback inside allowedPoolValues.
  const divanOpts = useMemo(
    () => (isBed ? allowedPoolValues(model, "divan_height", optionPools) : []),
    [isBed, model, optionPools],
  );
  const gapOpts = useMemo(
    () => (isBed ? allowedPoolValues(model, "gap", optionPools) : []),
    [isBed, model, optionPools],
  );
  // Gap VALUES to render — when the gap pool is absent (legacy caller / fresh
  // DB) fall back to the model's own gaps column so the section never vanishes.
  const gapChoices = useMemo(
    () =>
      gapOpts.length > 0 ? gapOpts.map((o) => o.value) : isBed ? model.gaps ?? [] : [],
    [gapOpts, isBed, model.gaps],
  );
  const legOpts = useMemo(
    () => (isBed ? allowedPoolValues(model, "bedframe_leg_height", optionPools) : []),
    [isBed, model, optionPools],
  );
  // 0202-wiring — master fabrics this model offers (opt-in; empty = no section).
  const fabricOpts = useMemo(
    () => (isBed ? allowedFabricsFor(model, fabrics) : []),
    [isBed, model, fabrics],
  );

  const [skuId, setSkuId] = useState<string>("");
  // Mattress gap is THREE-state (Loo 2026-07-11): Confirm later (KIV, the
  // default — the customer hasn't decided yet; rides attrs.gap = "KIV" so the
  // PO/PDF show the pending choice) · None ("" — explicitly no gap) · a value.
  const [gap, setGap] = useState<string>(gapChoices.length > 0 ? GAP_KIV : "");
  // Divan / leg / fabric are OPTIONAL (2990s "Confirm later", Loo 2026-06-11):
  // "" = customer confirms the dimension later; no surcharge applies.
  const [divan, setDivan] = useState<string>("");
  const [leg, setLeg] = useState<string>("");
  // Fabric IS the bed's colour / finish (Loo 2026-07-06 — a bed frame follows
  // the fabric). A two-level Series → Colour dropdown with KIV-to-defer at each
  // level, driven by the SAME `useSeriesFabric` hook the sofa uses (Loo
  // 2026-07-07: "I want the dropdown like the sofa's Fabric Option"). Priced by
  // the fabric's bedframe tier; the picked colour is the finish name + tint.
  const bedFabrics = useMemo<SellingFabric[]>(
    () =>
      fabricOpts.map((f) => ({
        key: `cf:${f.fabricCode}`,
        name: f.description ? `${f.fabricCode} · ${f.description}` : f.fabricCode,
        tier: f.bedframeTier,
        id: null,
        code: f.fabricCode,
        swatch: null,
        series: f.series,
      })),
    [fabricOpts],
  );
  const {
    seriesList: fabSeriesList,
    series: fabSeries,
    chooseSeries: chooseFabSeries,
    colourKey: fabColourKey,
    setColourKey: setFabColourKey,
    seriesColours: fabSeriesColours,
    fabric: selFabric,
  } = useSeriesFabric(bedFabrics);
  const fabricCode = selFabric?.code ?? "";
  const finishName = selFabric?.name ?? "";
  const [qty, setQty] = useState(1);
  const sku = skus.find((s) => s.id === skuId);
  const sp = useSpecials(model, specialAddons);

  // The option picks + their server-verifiable total — the SAME pure resolver
  // Hono re-runs on submit (option-picks-recompute), so this preview cannot
  // drift from the authoritative figure.
  const fabricTierOverride =
    (modelFabricTierOverrides ?? []).find((o) => o.modelId === model.id) ?? null;
  const optionPicks = useMemo<OptionPick[]>(() => {
    const picks: OptionPick[] = [];
    if (divan) picks.push({ kind: "divan_height", value: divan });
    if (leg) picks.push({ kind: "bedframe_leg_height", value: leg });
    if (fabricCode) picks.push({ kind: "fabric", value: fabricCode });
    return picks;
  }, [divan, leg, fabricCode]);
  const resolvedOptions = useMemo(
    () =>
      resolveOptionsTotal(optionPicks, {
        pools: optionPools ?? [],
        fabrics: fabrics ?? [],
        category: model.category,
        fabricTierOverride,
        fabricTierConfig: fabricTierConfig ?? null,
      }),
    [optionPicks, optionPools, fabrics, model.category, fabricTierOverride, fabricTierConfig],
  );
  const optionsTotal = resolvedOptions.total;
  const totalHeight = computedTotalHeight(divan || null, leg || null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const footprint = useMemo(() => footprintForVariant(sku?.variant), [sku?.variant]);

  const unitPrice = (sku?.price ?? 0) + sp.surcharge + optionsTotal;

  /** The DraftLine this configuration would emit — byte-identical to the old
   *  drawer configurators (same attrs, same unitPrice math, same label); used
   *  by BOTH `add()` and the PWP eligibility candidate below. */
  function composeLine(localId: string, lineQty: number): DraftLine | null {
    if (!sku) return null;
    const optionsPatch =
      resolvedOptions.lines.length > 0
        ? { options: resolvedOptions.lines, options_total: optionsTotal }
        : {};
    const attrs = isBed
      ? { gap, ...optionsPatch, ...sp.attrsPatch }
      : sp.picks.length > 0
        ? sp.attrsPatch
        : null;
    return {
      localId,
      sku: sku.sku,
      qty: lineQty,
      attrs,
      unitPrice,
      label: isBed
        ? `${model.name} · ${sku.variant}${finishName ? ` · ${finishName}` : ""}${gap ? ` · gap ${gap}` : ""}`
        : `${model.name} · ${sku.variant}`,
    };
  }

  // ── PWP & Promo voucher (2990s configurator rail parity) ──────────────────
  // A REAL apply, not a hint: the emitted line is PWP-claimed (attrs.pwp with
  // the bound code + claimGroup) and the live total shows the forced reward
  // price. Eligibility runs the SAME shared `coveringPwpForLine` the cart +
  // server use, over cart + a qty-1 candidate of the CURRENT picks — the bar
  // never offers a claim the server would 409 (honest-pricing). DORMANT (no
  // catalog / 0 active rules) → the section never renders.
  const pwpLineId = useRef(newLocalId());
  const pwpRulesActive = (catalog?.pwpRules ?? []).some((r) => r.active);
  const pwpCandidate = catalog && pwpRulesActive ? composeLine(pwpLineId.current, 1) : null;
  const pwpCovering =
    pwpCandidate && catalog
      ? coveringPwpForLine(pwpCandidate, [...(cartLines ?? []), pwpCandidate], catalog)
      : [];

  const [pwpApplied, setPwpApplied] = useState<{
    ruleId: string;
    code: string | null;
    crossOrder: boolean;
  } | null>(null);
  const [pwpInput, setPwpInput] = useState("");
  const [pwpErr, setPwpErr] = useState<string | null>(null);
  const [pwpBusy, setPwpBusy] = useState(false);

  const appliedRule = pwpApplied
    ? pwpCovering.find((r) => r.id === pwpApplied.ruleId) ?? null
    : null;
  // A pick change (size / specials) that breaks the claim drops it, so the bar
  // never previews a price the server would reject.
  useEffect(() => {
    if (pwpApplied && !appliedRule) {
      setPwpApplied(null);
      setPwpErr(null);
    }
  }, [pwpApplied, appliedRule]);

  const pwpPrice =
    appliedRule && pwpCandidate && catalog
      ? pwpRewardPrice(pwpCandidate, catalog, appliedRule) ?? 0
      : null;
  const pwpActive = pwpApplied != null && appliedRule != null && pwpPrice != null;

  // Codes already bound to another reward line in this cart — never re-offer.
  const consumedCodes = new Set<string>();
  for (const l of cartLines ?? []) {
    const c = linePwpCode(l);
    if (c) consumedCodes.add(c);
  }
  const hasVoucherLayer = typeof pwpClaimGroup === "string" && pwpClaimGroup.length > 0;
  // Auto Fill target: the first covering rule backed by a free RESERVED code
  // (voucher layer on); without the layer (DORMANT/test) the first covering
  // rule claims code-less — byte-identical to P8b (mirrors CartDrawer).
  const autoFill = (() => {
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
    setQty(1); // a PWP/promo reward line must be quantity 1 (server-enforced)
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
      const rule = pwpCovering.find((r) => r.id === reserved.ruleId);
      if (!rule) {
        setPwpErr("This voucher doesn't apply to this product.");
        return;
      }
      setPwpApplied({ ruleId: rule.id, code: reserved.code, crossOrder: false });
      setPwpErr(null);
      setQty(1);
      return;
    }
    // Cross-order (carry-forward) voucher — phone-bound; needs the customer
    // phone (captured at step 02) so the server can answer the binding.
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
      const rule = v.ruleId ? pwpCovering.find((r) => r.id === v.ruleId) : undefined;
      if (!rule) {
        setPwpErr("This voucher doesn't apply to this product.");
        return;
      }
      setPwpApplied({ ruleId: rule.id, code: v.code, crossOrder: true });
      setQty(1);
    } catch {
      setPwpErr("Couldn't check that voucher — please retry.");
    } finally {
      setPwpBusy(false);
    }
  }

  function removePwp() {
    setPwpApplied(null);
    setPwpInput("");
    setPwpErr(null);
  }

  const effUnitPrice = pwpActive ? (pwpPrice as number) : unitPrice;
  const total = effUnitPrice * qty;
  const canAdd = !!sku && sp.complete;

  const title = sku
    ? `${model.name} · ${sku.variant}`
    : `${model.name} · Pick a size`;
  const sub = sku
    ? [
        footprint ? `${footprint.w}×${footprint.d} cm` : null,
        isBed && finishName ? finishName : null,
        isBed && divan ? `divan ${divan}` : null,
        isBed && gap ? `gap ${gap}` : null,
        isBed && leg ? `leg ${leg}` : null,
        qty > 1 ? `× ${qty}` : null,
      ]
        .filter(Boolean)
        .join(" · ") || "Ready to add"
    : "Size drives the plan view + price";

  const breakdown: { label: string; price: number; note?: boolean }[] = !sku
    ? [{ label: "Pick a size to see the price", price: 0, note: true }]
    : pwpActive
      ? [
          {
            label: `${sku.variant} · PWP voucher${pwpApplied?.code ? ` ${pwpApplied.code}` : ""} (all-in)`,
            price: pwpPrice as number,
          },
        ]
      : [
          { label: `${sku.variant} ${isBed ? "frame" : "mattress"}`, price: sku.price },
          ...resolvedOptions.lines.map((o) => ({
            label:
              o.kind === "fabric"
                ? `Fabric · ${o.label ?? o.value}`
                : `${o.kind === "divan_height" ? "Divan" : "Leg"} ${o.value}`,
            price: o.surcharge,
          })),
          ...(sp.surcharge > 0 ? [{ label: "Special add-ons", price: sp.surcharge }] : []),
          ...(qty > 1 ? [{ label: `× ${qty} pieces`, price: total - unitPrice }] : []),
        ];

  // Same DraftLine as the old drawer configurators — contract untouched. The
  // option picks ride attrs.options + options_total; the server re-resolves
  // them on submit (option-picks-recompute) and overwrites with canonical rows.
  // A PWP-applied line is emitted already claimed (attrs.pwp + forced preview
  // price via the SAME markLinePwp* helpers the cart uses); the server
  // re-validates + forces the price regardless.
  function add() {
    if (!sku || !sp.complete) return;
    const base = composeLine(newLocalId(), pwpActive ? 1 : qty);
    if (!base) return;
    let line = base;
    if (pwpActive && pwpApplied && appliedRule && pwpPrice != null) {
      line = pwpApplied.code
        ? pwpApplied.crossOrder
          ? markLinePwpWithAvailableCode(
              base,
              appliedRule,
              pwpPrice,
              pwpApplied.code,
              pwpClaimGroup ?? "",
            )
          : markLinePwpWithCode(base, appliedRule, pwpPrice, pwpApplied.code, pwpClaimGroup ?? "")
        : markLinePwp(base, appliedRule, pwpPrice);
    }
    onAdd(line);
    onClose();
  }

  return createPortal(
    <div
      className="pos-proto cfg-root"
      style={{ position: "fixed", inset: 0, zIndex: 50 }}
      role="dialog"
      aria-modal="true"
      aria-label={`Configure ${model.name}`}
      data-testid="pos-configure-page"
    >
      {/* Header — back · live summary · live total (+ breakdown pop) · CTA */}
      <div className="cfg-header cfg-header--icon">
        <button
          className="cfg-header__back"
          onClick={onClose}
          title="Back to catalog"
          aria-label="Back to catalog"
          data-testid="cfg-back"
        >
          <ArrowLeft size={16} strokeWidth={1.75} />
        </button>
        <div className="cfg-header__live">
          <div className="cfg-header__summary">
            <div className="cfg-header__eyebrow">
              {model.name} · {catLabel}
            </div>
            <div className="cfg-header__title">{title}</div>
            <div className="cfg-header__sub">{sub}</div>
          </div>
          <div className="cfg-header__total" tabIndex={0}>
            <div className="cfg-header__totalLabel">Live total</div>
            <div className="cfg-header__totalNum" data-testid="cfg-live-total">
              <sup>RM</sup>
              {total.toLocaleString("en-MY")}
            </div>
            <div className="cfg-header__totalNote">
              {sku
                ? `${pwpActive ? "PWP · " : ""}${qty} × RM ${effUnitPrice.toLocaleString("en-MY")}`
                : "Pick a size"}
            </div>
            {breakdown.length > 0 && (
              <div className="cfg-header__pop" role="tooltip">
                <div className="cfg-header__popHd">Breakdown</div>
                {breakdown.map((b, i) => (
                  <div key={i} className={"cfg-header__popRow" + (b.note ? " is-note" : "")}>
                    {b.note ? (
                      <span style={{ fontStyle: "italic", opacity: 0.85 }}>{b.label}</span>
                    ) : (
                      <>
                        <span>{b.label}</span>
                        <span>RM{(b.price || 0).toLocaleString("en-MY")}</span>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="cfg-header__cta">
            <button className="btn btn--ghost" onClick={onClose}>
              <X size={14} strokeWidth={1.75} /> Cancel
            </button>
            <button
              className="btn btn--primary btn--lg"
              onClick={add}
              disabled={!canAdd}
              title={!sku ? "Pick a size first" : !sp.complete ? "Finish the add-on options" : undefined}
              data-testid="cfg-add-to-cart"
            >
              <Plus size={16} strokeWidth={1.75} /> Add to Cart
            </button>
          </div>
        </div>
      </div>

      {/* Body — plan-view canvas (left) + controls (right) */}
      <div className="cfg-body">
        <div className="cfg-grid">
          <div className="cfg-canvas">
            <div className="cfg-canvas__head">
              <div>
                <span className="pos-eyebrow" style={{ color: "var(--c-burnt)" }}>
                  {catLabel}
                </span>
                <h2 className="cfg-canvas__title">
                  {model.name}
                  {sku ? ` · ${footprint?.label ?? sku.variant}` : ""}
                </h2>
              </div>
              <span className="cfg-canvas__detail">
                {footprint
                  ? isBed
                    ? `Footprint ${footprint.w + 18} × ${footprint.d + 12} cm`
                    : `Footprint ${footprint.w} × ${footprint.d} cm`
                  : "Pick a size"}
              </span>
            </div>
            {isBed ? (
              <BedPlan footprint={footprint} colourName={finishName} />
            ) : (
              <MattressPlan footprint={footprint} />
            )}
          </div>

          <div className="cfg-controls">
            {/* Size */}
            <div className="cfg-section">
              <div className="cfg-section__head">
                <span className="pos-eyebrow">Size</span>
                <span className="cfg-section__detail">
                  {sku
                    ? `${sku.variant}${footprint ? ` · ${footprint.w}×${footprint.d} cm` : ""}`
                    : `${skus.length} option${skus.length === 1 ? "" : "s"}`}
                </span>
              </div>
              {skus.length === 0 ? (
                <div className="cfg-empty">No sizes for this model yet.</div>
              ) : (
                <div className="cfg-optGrid">
                  {skus.map((s) => {
                    const fp = footprintForVariant(s.variant);
                    return (
                      <button
                        key={s.id}
                        className={`cfg-opt ${skuId === s.id ? "is-on" : ""}`}
                        onClick={() => setSkuId(s.id)}
                        data-testid={`cfg-size-${s.id}`}
                      >
                        <span className="cfg-opt__title">{fp?.label ?? s.variant}</span>
                        <span className="cfg-opt__sub">
                          {fp ? `${fp.w}×${fp.d} cm` : s.sku}
                        </span>
                        <span className="cfg-opt__price">RM{s.price.toLocaleString("en-MY")}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Fabric option — Series → Colour, two-level KIV-to-defer, driven
                by the SAME useSeriesFabric hook the sofa uses. This IS the bed's
                finish: a frame follows the fabric, priced by its bedframe tier
                (Loo 2026-07-07: "I want the dropdown like the sofa's"). */}
            {isBed && bedFabrics.length > 0 && (
              <div className="cfg-section" data-testid="cfg-fabric-section">
                <div className="cfg-section__head">
                  <span className="pos-eyebrow">Fabric option</span>
                  <span className="cfg-section__detail">series · colour · KIV to defer</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {fabSeriesList.length > 1 && (
                    <select
                      value={fabSeries}
                      onChange={(e) => chooseFabSeries(e.target.value)}
                      aria-label="Fabric series"
                      className="cfg-select"
                      data-testid="cfg-fabric-series"
                    >
                      <option value="">KIV · series to confirm</option>
                      {fabSeriesList.map((s) => (
                        <option key={s} value={s}>
                          {s === "Other" ? "Other" : `${s} series`}
                        </option>
                      ))}
                    </select>
                  )}
                  {fabSeries && (
                    <select
                      value={fabColourKey}
                      onChange={(e) => setFabColourKey(e.target.value)}
                      aria-label="Fabric colour"
                      className="cfg-select"
                      data-testid="cfg-fabric"
                    >
                      <option value={FABRIC_KIV}>KIV · colour to confirm</option>
                      {fabSeriesColours.map((f) => {
                        const delta = resolveFabricDelta(
                          f.tier,
                          fabricTierOverride,
                          fabricTierConfig ?? null,
                        );
                        return (
                          <option key={f.key} value={f.key}>
                            {f.name}
                            {delta > 0 ? ` · +RM ${delta.toLocaleString("en-MY")}` : " · Included"}
                          </option>
                        );
                      })}
                    </select>
                  )}
                </div>
              </div>
            )}

            {/* Divan height — bed frames; pool-priced, optional (confirm later) */}
            {isBed && divanOpts.length > 0 && (
              <div className="cfg-section">
                <div className="cfg-section__head">
                  <span className="pos-eyebrow">Divan height</span>
                  <span className="cfg-section__detail">{divan || "Confirm later"}</span>
                </div>
                <select
                  value={divan}
                  onChange={(e) => setDivan(e.target.value)}
                  aria-label="Divan height"
                  className="cfg-select"
                  data-testid="cfg-divan"
                >
                  <option value="" data-testid="cfg-divan-later">
                    Confirm later
                  </option>
                  {divanOpts.map((o) => (
                    <option key={o.id} value={o.value} data-testid={`cfg-divan-${o.value}`}>
                      {o.value}
                      {o.surcharge != null && o.surcharge !== 0
                        ? ` · +RM ${o.surcharge.toLocaleString("en-MY")}`
                        : ""}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Mattress gap — bed frames; the master Gaps pool ∩ Modular ticks
                (legacy model.gaps column when no pool is available). Three
                states: Confirm later (KIV, default) · None · a thickness. */}
            {isBed && gapChoices.length > 0 && (
              <div className="cfg-section">
                <div className="cfg-section__head">
                  <span className="pos-eyebrow">Mattress gap</span>
                  <span className="cfg-section__detail">
                    {gap === GAP_KIV ? "Confirm later" : gap ? `${gap} thickness` : "None"}
                  </span>
                </div>
                <select
                  value={gap}
                  onChange={(e) => setGap(e.target.value)}
                  aria-label="Mattress gap"
                  className="cfg-select"
                  data-testid="cfg-gap"
                >
                  <option value={GAP_KIV} data-testid="cfg-gap-later">
                    Confirm later
                  </option>
                  <option value="" data-testid="cfg-gap-none">
                    None
                  </option>
                  {gapChoices.map((g) => (
                    <option key={g} value={g} data-testid={`cfg-gap-${g}`}>
                      {g}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Leg height — bed frames; pool-priced, optional. Total height is
                COMPUTED (divan + leg) — never an input (Loo 2026-07-06). */}
            {isBed && legOpts.length > 0 && (
              <div className="cfg-section">
                <div className="cfg-section__head">
                  <span className="pos-eyebrow">Leg height</span>
                  <span className="cfg-section__detail" data-testid="cfg-total-height">
                    {totalHeight ? `Total height ${totalHeight}` : leg || "Confirm later"}
                  </span>
                </div>
                <select
                  value={leg}
                  onChange={(e) => setLeg(e.target.value)}
                  aria-label="Leg height"
                  className="cfg-select"
                  data-testid="cfg-leg"
                >
                  <option value="" data-testid="cfg-leg-later">
                    Confirm later
                  </option>
                  {legOpts.map((o) => (
                    <option key={o.id} value={o.value} data-testid={`cfg-leg-${o.value}`}>
                      {o.value}
                      {o.surcharge != null && o.surcharge !== 0
                        ? ` · +RM ${o.surcharge.toLocaleString("en-MY")}`
                        : ""}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* About the model */}
            {model.blurb && (
              <div className="cfg-section">
                <div className="cfg-section__head">
                  <span className="pos-eyebrow">About this {catLabel.toLowerCase()}</span>
                </div>
                <div
                  style={{
                    padding: "14px 16px",
                    borderRadius: 12,
                    background: "var(--pos-bg)",
                    color: "var(--fg)",
                    fontSize: 13,
                    lineHeight: 1.55,
                  }}
                >
                  {model.blurb}
                </div>
              </div>
            )}

            {/* Special add-ons — functional picker kept, prototype shell */}
            {sp.offered.length > 0 && (
              <div className="cfg-section">
                <div className="cfg-section__head">
                  <span className="pos-eyebrow">Options</span>
                  <span className="cfg-section__detail">
                    {sp.surcharge > 0 ? `+RM${sp.surcharge.toLocaleString("en-MY")}` : "Included"}
                  </span>
                </div>
                <SpecialAddonsPicker defs={sp.offered} value={sp.picks} onChange={sp.setPicks} />
              </div>
            )}

            {/* Quantity */}
            <div className="cfg-section">
              <div className="cfg-section__head">
                <span className="pos-eyebrow">Quantity</span>
                <span className="cfg-section__detail">
                  {pwpActive ? "PWP · 1 piece" : `${qty} piece${qty === 1 ? "" : "s"}`}
                </span>
              </div>
              <div className="cfg-stepper">
                <button
                  type="button"
                  className="cfg-stepperBtn"
                  onClick={() => setQty(Math.max(1, qty - 1))}
                  disabled={qty <= 1}
                  aria-label="Decrease quantity"
                >
                  <Minus size={16} strokeWidth={1.75} />
                </button>
                <span className="cfg-stepperVal" data-testid="cfg-qty">
                  {qty}
                </span>
                <button
                  type="button"
                  className="cfg-stepperBtn"
                  onClick={() => setQty(qty + 1)}
                  disabled={pwpActive}
                  title={pwpActive ? "A PWP/promo reward is limited to 1 piece" : undefined}
                  aria-label="Increase quantity"
                >
                  <Plus size={16} strokeWidth={1.75} />
                </button>
              </div>
            </div>

            {/* PWP & Promo voucher — 2990s configurator rail parity. Rendered
                only when the catalog carries an ACTIVE pwp_rule (DORMANT
                otherwise). Auto Fill binds the same-cart RESERVED code; typing
                a code applies a reserved OR cross-order (saved) voucher. */}
            {catalog && pwpRulesActive && (
              <div className="cfg-section" data-testid="cfg-pwp-section">
                <div className="cfg-section__head">
                  <span className="pos-eyebrow">PWP &amp; Promo voucher</span>
                  <span className="cfg-section__detail">
                    {pwpActive
                      ? "Applied"
                      : autoFill
                        ? "Voucher ready"
                        : sku
                          ? "Optional"
                          : "Pick a size first"}
                  </span>
                </div>
                {pwpActive && pwpApplied ? (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 10,
                      padding: "12px 14px",
                      borderRadius: 12,
                      border: "1.5px solid var(--c-burnt, #A6471E)",
                      background: "var(--pos-panel, #fff)",
                    }}
                    data-testid="cfg-pwp-applied"
                  >
                    <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                      <Ticket size={16} strokeWidth={1.75} style={{ color: "var(--c-burnt, #A6471E)" }} />
                      <span>
                        <span style={{ fontWeight: 700 }}>
                          {pwpApplied.code ? `PWP ${pwpApplied.code}` : "PWP price"}
                        </span>
                        <span style={{ display: "block", color: "var(--fg-muted)", fontSize: 12 }}>
                          {appliedRule?.type === "promo" && pwpPrice === 0
                            ? "Applied · FREE"
                            : `Applied · RM ${(pwpPrice ?? 0).toLocaleString("en-MY")} all-in`}
                        </span>
                      </span>
                    </span>
                    <button
                      type="button"
                      className="btn btn--ghost"
                      onClick={removePwp}
                      data-testid="cfg-pwp-remove"
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {autoFill && (
                      <p
                        style={{ margin: 0, fontSize: 12, color: "var(--c-burnt, #A6471E)" }}
                        data-testid="cfg-pwp-ready"
                      >
                        A PWP code from this cart is ready — tap Auto Fill.
                      </p>
                    )}
                    <div style={{ display: "flex", gap: 8 }}>
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
                        style={{
                          flex: 1,
                          minWidth: 0,
                          padding: "10px 12px",
                          borderRadius: 12,
                          border: "1.5px solid var(--line, #d9d2c7)",
                          background: "var(--pos-panel, #fff)",
                          fontSize: 13,
                          textTransform: "uppercase",
                        }}
                        data-testid="cfg-pwp-input"
                      />
                      {autoFill && (
                        <button
                          type="button"
                          className="btn btn--primary"
                          onClick={applyAutoFill}
                          data-testid="cfg-pwp-autofill"
                        >
                          Auto Fill
                        </button>
                      )}
                      <button
                        type="button"
                        className="btn btn--ghost"
                        onClick={() => void applyManualCode()}
                        disabled={pwpBusy || !pwpInput.trim()}
                        data-testid="cfg-pwp-apply"
                      >
                        {pwpBusy ? "Checking…" : "Apply"}
                      </button>
                    </div>
                    {pwpErr && (
                      <p
                        style={{ margin: 0, fontSize: 12, color: "var(--c-danger, #B4321A)" }}
                        data-testid="cfg-pwp-error"
                      >
                        {pwpErr}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
