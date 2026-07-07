import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, LayoutTemplate, Minus, Plus, X } from "lucide-react";
import type {
  CatalogFabricDto,
  CatalogOptionPoolDto,
  FabricTierGlobalConfig,
  ModelFabricTierOverrideDto,
  ProductModelDto,
  ProductSkuDto,
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
  const [gap, setGap] = useState<string>(gapChoices[0] ?? "");
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
  const total = unitPrice * qty;
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

  const breakdown: { label: string; price: number; note?: boolean }[] = sku
    ? [
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
      ]
    : [{ label: "Pick a size to see the price", price: 0, note: true }];

  // Same DraftLine as the old drawer configurators — contract untouched. The
  // option picks ride attrs.options + options_total; the server re-resolves
  // them on submit (option-picks-recompute) and overwrites with canonical rows.
  function add() {
    if (!sku || !sp.complete) return;
    const optionsPatch =
      resolvedOptions.lines.length > 0
        ? { options: resolvedOptions.lines, options_total: optionsTotal }
        : {};
    const attrs = isBed
      ? { gap, ...optionsPatch, ...sp.attrsPatch }
      : sp.picks.length > 0
        ? sp.attrsPatch
        : null;
    onAdd({
      localId: newLocalId(),
      sku: sku.sku,
      qty,
      attrs,
      unitPrice,
      label: isBed
        ? `${model.name} · ${sku.variant}${finishName ? ` · ${finishName}` : ""}${gap ? ` · gap ${gap}` : ""}`
        : `${model.name} · ${sku.variant}`,
    });
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
              {sku ? `${qty} × RM ${unitPrice.toLocaleString("en-MY")}` : "Pick a size"}
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
                      style={{
                        width: "100%",
                        padding: "10px 12px",
                        borderRadius: 12,
                        border: "1.5px solid var(--line, #d9d2c7)",
                        background: "var(--pos-panel, #fff)",
                        fontSize: 13,
                      }}
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
                      style={{
                        width: "100%",
                        padding: "10px 12px",
                        borderRadius: 12,
                        border: "1.5px solid var(--line, #d9d2c7)",
                        background: "var(--pos-panel, #fff)",
                        fontSize: 13,
                      }}
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
                <div className="cfg-optGrid cfg-optGrid--5">
                  <button
                    className={`cfg-opt cfg-opt--compact ${divan === "" ? "is-on" : ""}`}
                    onClick={() => setDivan("")}
                    data-testid="cfg-divan-later"
                  >
                    <span className="cfg-opt__title">Later</span>
                  </button>
                  {divanOpts.map((o) => (
                    <button
                      key={o.id}
                      className={`cfg-opt cfg-opt--compact ${divan === o.value ? "is-on" : ""}`}
                      onClick={() => setDivan(o.value)}
                      data-testid={`cfg-divan-${o.value}`}
                    >
                      <span className="cfg-opt__title">{o.value}</span>
                      {o.surcharge != null && o.surcharge !== 0 && (
                        <span className="cfg-opt__sub">
                          +RM{o.surcharge.toLocaleString("en-MY")}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Mattress gap — bed frames; the master Gaps pool ∩ Modular ticks
                (legacy model.gaps column when no pool is available). */}
            {isBed && gapChoices.length > 0 && (
              <div className="cfg-section">
                <div className="cfg-section__head">
                  <span className="pos-eyebrow">Mattress gap</span>
                  <span className="cfg-section__detail">{gap ? `${gap} thickness` : "None"}</span>
                </div>
                <div className="cfg-optGrid cfg-optGrid--5">
                  <button
                    className={`cfg-opt cfg-opt--compact ${gap === "" ? "is-on" : ""}`}
                    onClick={() => setGap("")}
                  >
                    <span className="cfg-opt__title">None</span>
                  </button>
                  {gapChoices.map((g) => (
                    <button
                      key={g}
                      className={`cfg-opt cfg-opt--compact ${gap === g ? "is-on" : ""}`}
                      onClick={() => setGap(g)}
                      data-testid={`cfg-gap-${g}`}
                    >
                      <span className="cfg-opt__title">{g}</span>
                    </button>
                  ))}
                </div>
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
                <div className="cfg-optGrid cfg-optGrid--5">
                  <button
                    className={`cfg-opt cfg-opt--compact ${leg === "" ? "is-on" : ""}`}
                    onClick={() => setLeg("")}
                    data-testid="cfg-leg-later"
                  >
                    <span className="cfg-opt__title">Later</span>
                  </button>
                  {legOpts.map((o) => (
                    <button
                      key={o.id}
                      className={`cfg-opt cfg-opt--compact ${leg === o.value ? "is-on" : ""}`}
                      onClick={() => setLeg(o.value)}
                      data-testid={`cfg-leg-${o.value}`}
                    >
                      <span className="cfg-opt__title">{o.value}</span>
                      {o.surcharge != null && o.surcharge !== 0 && (
                        <span className="cfg-opt__sub">
                          +RM{o.surcharge.toLocaleString("en-MY")}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
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
                  {qty} piece{qty === 1 ? "" : "s"}
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
                  aria-label="Increase quantity"
                >
                  <Plus size={16} strokeWidth={1.75} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
