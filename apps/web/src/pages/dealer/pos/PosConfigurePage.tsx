import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, LayoutTemplate, Minus, Plus, X } from "lucide-react";
import type { ProductModelDto, ProductSkuDto, SpecialAddonDto } from "@carres/shared";
import type { DraftLine } from "../new-order/draft";
import { newLocalId } from "../new-order/configurators";
import { SpecialAddonsPicker, useSpecials } from "../new-order/special-addons-picker";
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
  onAdd,
  onClose,
}: {
  model: ProductModelDto;
  meta: ModelMeta | undefined;
  skus: ProductSkuDto[];
  specialAddons?: SpecialAddonDto[] | null;
  onAdd: (line: DraftLine) => void;
  onClose: () => void;
}) {
  const isBed = model.category === "bedframe";
  const catLabel = isBed ? "Bed frame" : "Mattress";

  const [skuId, setSkuId] = useState<string>("");
  const [color, setColor] = useState<string>(model.colors?.[0] ?? "");
  const [gap, setGap] = useState<string>(model.gaps?.[0] ?? "");
  const [qty, setQty] = useState(1);
  const sku = skus.find((s) => s.id === skuId);
  const sp = useSpecials(model, specialAddons);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const footprint = useMemo(() => footprintForVariant(sku?.variant), [sku?.variant]);

  const unitPrice = (sku?.price ?? 0) + sp.surcharge;
  const total = unitPrice * qty;
  const canAdd = !!sku && sp.complete;

  const title = sku
    ? `${model.name} · ${sku.variant}`
    : `${model.name} · Pick a size`;
  const sub = sku
    ? [
        footprint ? `${footprint.w}×${footprint.d} cm` : null,
        isBed && color ? color : null,
        isBed && gap ? `gap ${gap}` : null,
        qty > 1 ? `× ${qty}` : null,
      ]
        .filter(Boolean)
        .join(" · ") || "Ready to add"
    : "Size drives the plan view + price";

  const breakdown: { label: string; price: number; note?: boolean }[] = sku
    ? [
        { label: `${sku.variant} ${isBed ? "frame" : "mattress"}`, price: sku.price },
        ...(sp.surcharge > 0 ? [{ label: "Special add-ons", price: sp.surcharge }] : []),
        ...(qty > 1 ? [{ label: `× ${qty} pieces`, price: total - unitPrice }] : []),
      ]
    : [{ label: "Pick a size to see the price", price: 0, note: true }];

  // Same DraftLine as the old drawer configurators — contract untouched.
  function add() {
    if (!sku || !sp.complete) return;
    onAdd({
      localId: newLocalId(),
      sku: sku.sku,
      qty,
      attrs: isBed
        ? { color, gap, ...sp.attrsPatch }
        : sp.picks.length > 0
          ? sp.attrsPatch
          : null,
      unitPrice,
      label: isBed
        ? `${model.name} · ${sku.variant} · ${color}${gap ? ` · gap ${gap}` : ""}`
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
              <BedPlan footprint={footprint} colourName={color} />
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

            {/* Colour / finish — bed frames only */}
            {isBed && (model.colors?.length ?? 0) > 0 && (
              <div className="cfg-section">
                <div className="cfg-section__head">
                  <span className="pos-eyebrow">Colour / finish</span>
                  <span className="cfg-section__detail">{color || "—"}</span>
                </div>
                <div className="cfg-swatchRow">
                  {(model.colors ?? []).map((c) => (
                    <button
                      key={c}
                      className={`cfg-sw ${color === c ? "is-on" : ""}`}
                      onClick={() => setColor(c)}
                      data-testid={`cfg-colour-${c}`}
                    >
                      <span className="cfg-sw__chip" style={{ background: hexForColourName(c) }}></span>
                      <span className="cfg-sw__name">{c}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Mattress gap — bed frames with gap options */}
            {isBed && (model.gaps?.length ?? 0) > 0 && (
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
                  {(model.gaps ?? []).map((g) => (
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
