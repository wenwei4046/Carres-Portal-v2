import { useEffect, useRef, useState } from "react";
import { LayoutTemplate } from "lucide-react";

/**
 * The to-scale plan view, and the size lookup that feeds it.
 *
 * Extracted from `PosConfigurePage` (2026-08-06) when the Rent-to-Own configure
 * surface needed the SAME canvas — Loo: *"need the same ui like this"*. It moved
 * here rather than being exported sideways out of `PosConfigurePage` because two
 * unrelated pages now draw it, and a rental page importing the mattress page to
 * borrow a rectangle is a dependency neither file wants.
 *
 * `PosConfigurePage` re-exports `footprintForVariant` and `SizeFootprint` for
 * back-compat, so no existing import path changed.
 *
 * Nothing in here talks to the server, the cart or the draft — it takes a
 * footprint and draws it. That is why it is safe for both callers.
 */

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

/** Measure the plan container so the drawing scales to its parent — the
 *  design's usePlanContainer (width-driven, stable height). */
export function usePlanContainer(): [React.RefObject<HTMLDivElement>, { w: number; h: number }] {
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
export default function MattressPlan({ footprint }: { footprint: SizeFootprint | null }) {
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
