import { useEffect, useMemo, useState } from "react";
import {
  parseCompartmentStructure,
  findModule,
  moduleFootprint,
  cellEdges,
  EDGE_W,
  EDGE_N,
  EDGE_E,
  EDGE_S,
  DEFAULT_FOOTPRINT,
} from "@carres/shared";
import type { EdgeType } from "@carres/shared";
import { ART_BBOX_FALLBACK, getCachedArtBbox, measureArtBbox } from "./sofa-art";

/**
 * <CompartmentSilhouette> — a top-down plan-view SVG of one sofa compartment,
 * REDRAWN from the compartment's geometry (NOT a copy of the 2990s PNGs).
 *
 * Locked decision (Loo, 2026-06-21): silhouettes are SVG-redraw so every
 * present / future / renamed compartment auto-covers. The shape is derived from
 * T1's pure geometry:
 *   · `moduleFootprint` → the body aspect (drives the viewBox so a 2-seater is
 *     visibly wider than a 1-seater, an L-chaise visibly deeper);
 *   · `cellEdges(rot 0)` → which sides carry an `arm` (dark side strip) vs a
 *     `back` (backrest strip); the 2990s art idiom (a body rect + a backrest
 *     strip on the back edge + arm rects on arm edges + per-cushion dashed
 *     seams) rebuilt in v17 tokens (cool-gray body, flame for selected).
 *   · `parseCompartmentStructure` → the P/R/L mechanism glyph (Lucide, NO emoji).
 *
 * Purely presentational — no state, no queries. If the compartment row carries
 * an `iconUrl` (0178 `sofa_compartments.icon_url`) we prefer the photoreal
 * `<img>` and keep the SVG as the conceptual fallback.
 *
 * Variants:
 *   · `selected` → flame ring (matches the v17 selected-ring token).
 *   · `violation` → red outline (the builder's arm-cap / arm-collision warning).
 */

// Plan-view furniture palette — WARM, matching the CARRES prototype art:
// a cream seat cushion inside a tan arm/backrest frame with a dark outline, so
// each compartment reads with front/back depth (not a flat gray box).
const STROKE = "#2B2521"; // dark warm charcoal — the sofa outline
const BODY_FILL = "#EFE7D6"; // cream / oat seat cushion (the light base)
const BACK_FILL = "#CBAA7C"; // warm tan backrest band
const ARM_FILL = "#BE9A64"; // deeper tan arms (reads as the frame)
const SEAM = "#A98C5E"; // muted tan cushion seam

/** The warm plan-view palette, shared with <SofaPlanView> (the joined view). */
export const PLAN_PALETTE = {
  stroke: STROKE,
  body: BODY_FILL,
  back: BACK_FILL,
  arm: ARM_FILL,
  seam: SEAM,
} as const;

/** A short mechanism label drawn in the body centre when a compartment has a
 *  power / recliner / power-leg mechanism. NOT an emoji (CLAUDE.md §10). */
const MECH_LABEL: Record<"P" | "R" | "L", string> = {
  P: "P",
  R: "R",
  L: "L",
};

export default function CompartmentSilhouette({
  code,
  depth = "24",
  iconUrl,
  selected = false,
  violation = false,
  flush = false,
  className,
}: {
  /** Compartment code, e.g. '1A(LHF)', '2NA', 'CNR', 'L(RHF)'. */
  code: string;
  /** Seat depth in inches (widens the body length axis). Default 24″. */
  depth?: string;
  /** Optional photoreal art (0178). Preferred over the SVG when present. */
  iconUrl?: string | null;
  selected?: boolean;
  violation?: boolean;
  /** Build-canvas mode (Loo 2026-07-06 — joined modules must tile with NO
   *  seams): the art bleeds edge-to-edge. iconUrl art is alpha-bbox-fitted
   *  (2990s technique) so its padded margins are cropped away; the SVG
   *  fallback drops its viewBox inset + corner radius. Default (palette /
   *  standalone) keeps the breathing room. */
  flush?: boolean;
  className?: string;
}) {
  const geom = useMemo(() => {
    const struct = parseCompartmentStructure(code);
    const module = findModule(code);
    const fp = moduleFootprint(module ?? DEFAULT_FOOTPRINT, 0, depth);
    // Edge types per side [W,N,E,S] at rot 0 → where arms / backrest sit.
    const edges: EdgeType[] = cellEdges({ moduleCode: code, x: 0, y: 0, rot: 0 });
    const cushions = module?.cushions ?? 0;
    return {
      w: fp.w,
      h: fp.h,
      cushions,
      mechanism: struct?.mechanism ?? null,
      armW: edges[EDGE_W] === "arm",
      armE: edges[EDGE_E] === "arm",
      armN: edges[EDGE_N] === "arm",
      armS: edges[EDGE_S] === "arm",
      backN: edges[EDGE_N] === "back",
      backW: edges[EDGE_W] === "back",
      backE: edges[EDGE_E] === "back",
      backS: edges[EDGE_S] === "back",
    };
  }, [code, depth]);

  // Flush art path — re-render once the alpha bbox has been measured so the
  // first paint (fallback stretch) snaps to the cropped fit.
  const [, bumpArt] = useState(0);
  useEffect(() => {
    if (!iconUrl || !flush) return;
    let live = true;
    void measureArtBbox(iconUrl).then(() => {
      if (live) bumpArt((n) => n + 1);
    });
    return () => {
      live = false;
    };
  }, [iconUrl, flush]);

  const ringStyle = violation
    ? { boxShadow: "0 0 0 2px hsl(var(--danger))" }
    : selected
      ? { boxShadow: "0 0 0 3px hsl(var(--primary) / 0.4)" }
      : undefined;

  // Flush photoreal path (build canvas): scale/offset the img so the measured
  // silhouette bbox fills the cell exactly — cropped margins ⇒ joined modules
  // tile without gaps (2990s SofaCellsPreview technique).
  if (iconUrl && flush) {
    const bbox = getCachedArtBbox(iconUrl) ?? ART_BBOX_FALLBACK;
    const bw = Math.max(bbox.r - bbox.l, 0.01);
    const bh = Math.max(bbox.b - bbox.t, 0.01);
    return (
      <div
        className={`relative overflow-hidden ${className ?? ""}`}
        style={ringStyle}
        data-testid="compartment-silhouette-img-flush"
        data-code={code}
      >
        <img
          src={iconUrl}
          alt={code}
          draggable={false}
          className="absolute max-w-none select-none"
          style={{
            width: `${100 / bw}%`,
            height: `${100 / bh}%`,
            left: `${(-bbox.l / bw) * 100}%`,
            top: `${(-bbox.t / bh) * 100}%`,
          }}
          data-testid="compartment-silhouette-img"
        />
      </div>
    );
  }

  // Photoreal path: a 0178 icon_url wins. Keep the same box / ring chrome.
  if (iconUrl) {
    return (
      <img
        src={iconUrl}
        alt={code}
        className={`block rounded-[4px] object-contain bg-white ${className ?? ""}`}
        style={ringStyle}
        data-testid="compartment-silhouette-img"
      />
    );
  }

  // SVG geometry. viewBox = the footprint aspect (cm), small inset for stroke.
  // Flush (build canvas): NO inset — cells abut in cm space, so any padding
  // here reads as a visible gap between joined modules.
  const PAD = flush ? 0 : 4;
  const vbW = geom.w + PAD * 2;
  const vbH = geom.h + PAD * 2;
  const ARM = Math.min(14, geom.w * 0.16, geom.h * 0.16); // arm strip thickness
  const BACK = Math.min(12, geom.h * 0.16, geom.w * 0.16); // backrest thickness

  return (
    <svg
      viewBox={`0 0 ${vbW} ${vbH}`}
      className={`block rounded-[4px] ${className ?? ""}`}
      style={ringStyle}
      role="img"
      aria-label={`${code} plan view`}
      data-testid="compartment-silhouette"
      data-code={code}
    >
      {/* body */}
      <rect
        x={PAD}
        y={PAD}
        width={geom.w}
        height={geom.h}
        rx={flush ? 0 : 3}
        fill={BODY_FILL}
        stroke={violation ? "hsl(var(--danger))" : STROKE}
        strokeWidth={2}
      />

      {/* backrest strip (on the back edge) */}
      {geom.backN && (
        <rect x={PAD} y={PAD} width={geom.w} height={BACK} fill={BACK_FILL} stroke={STROKE} strokeWidth={0.9} data-testid="silhouette-back" />
      )}
      {geom.backS && (
        <rect x={PAD} y={PAD + geom.h - BACK} width={geom.w} height={BACK} fill={BACK_FILL} stroke={STROKE} strokeWidth={0.9} data-testid="silhouette-back" />
      )}
      {geom.backW && (
        <rect x={PAD} y={PAD} width={BACK} height={geom.h} fill={BACK_FILL} stroke={STROKE} strokeWidth={0.9} data-testid="silhouette-back" />
      )}
      {geom.backE && (
        <rect x={PAD + geom.w - BACK} y={PAD} width={BACK} height={geom.h} fill={BACK_FILL} stroke={STROKE} strokeWidth={0.9} data-testid="silhouette-back" />
      )}

      {/* arm rects */}
      {geom.armW && (
        <rect x={PAD} y={PAD} width={ARM} height={geom.h} fill={ARM_FILL} stroke={STROKE} strokeWidth={0.9} data-testid="silhouette-arm-left" />
      )}
      {geom.armE && (
        <rect x={PAD + geom.w - ARM} y={PAD} width={ARM} height={geom.h} fill={ARM_FILL} stroke={STROKE} strokeWidth={0.9} data-testid="silhouette-arm-right" />
      )}
      {geom.armN && (
        <rect x={PAD} y={PAD} width={geom.w} height={ARM} fill={ARM_FILL} stroke={STROKE} strokeWidth={0.9} data-testid="silhouette-arm-top" />
      )}
      {geom.armS && (
        <rect x={PAD} y={PAD + geom.h - ARM} width={geom.w} height={ARM} fill={ARM_FILL} stroke={STROKE} strokeWidth={0.9} data-testid="silhouette-arm-bottom" />
      )}

      {/* per-cushion seams (vertical dashed dividers along the seat length) */}
      {geom.cushions > 1 &&
        Array.from({ length: geom.cushions - 1 }, (_, i) => {
          const x = PAD + (geom.w * (i + 1)) / geom.cushions;
          return (
            <line
              key={i}
              x1={x}
              y1={PAD}
              x2={x}
              y2={PAD + geom.h}
              stroke={SEAM}
              strokeWidth={0.9}
              strokeDasharray="3,3"
              data-testid="silhouette-seam"
            />
          );
        })}

      {/* mechanism glyph (P / R / L) — text, never emoji */}
      {geom.mechanism && (
        <text
          x={PAD + geom.w / 2}
          y={PAD + geom.h / 2}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={Math.min(geom.w, geom.h) * 0.28}
          fontWeight={700}
          fill={STROKE}
          data-testid="silhouette-mechanism"
        >
          {MECH_LABEL[geom.mechanism]}
        </text>
      )}
    </svg>
  );
}
