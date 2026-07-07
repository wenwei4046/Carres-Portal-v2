import { useMemo } from "react";
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
import type { EdgeType, Rot } from "@carres/shared";
import { PLAN_PALETTE as C } from "./CompartmentSilhouette";

/**
 * <SofaPlanView> — a JOINED top-down plan view of a whole sofa layout in ONE
 * SVG. Where <CompartmentSilhouette> draws a single module in its own box,
 * this positions every cell at its seed x/y in a shared cm coordinate system,
 * so flush modules tile into one continuous sofa (colinear junction strokes
 * overlap into a single internal divider), matching the prototype's composed
 * plan view. Purely presentational — no state, no queries. Same warm palette
 * as the single-module silhouette (PLAN_PALETTE).
 */

export interface PlanCell {
  moduleCode: string;
  x: number;
  y: number;
  rot: Rot;
}

/** Breathing room around the layout inside the viewBox, in cm per side — the
 *  SVG's intrinsic aspect is (bbox.w + 2·PAD) / (bbox.h + 2·PAD). */
export const PLAN_PAD = 4;

export default function SofaPlanView({
  cells,
  depth = "24",
  className,
}: {
  /** Seed cells (e.g. from `comboSeedCells`) — positions in cm, rot in degrees. */
  cells: PlanCell[];
  /** Seat depth in inches (widens the seat axis). Default 24″. */
  depth?: string;
  className?: string;
}) {
  const geom = useMemo(() => {
    const items = cells.map((cell) => {
      const module = findModule(cell.moduleCode);
      const fp = moduleFootprint(module ?? DEFAULT_FOOTPRINT, cell.rot, depth);
      const edges: EdgeType[] = cellEdges(cell);
      return {
        ...cell,
        w: fp.w,
        h: fp.h,
        edges,
        cushions: module?.cushions ?? 0,
        mechanism: parseCompartmentStructure(cell.moduleCode)?.mechanism ?? null,
      };
    });
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const it of items) {
      minX = Math.min(minX, it.x);
      minY = Math.min(minY, it.y);
      maxX = Math.max(maxX, it.x + it.w);
      maxY = Math.max(maxY, it.y + it.h);
    }
    return { items, minX, minY, w: maxX - minX, h: maxY - minY };
  }, [cells, depth]);

  if (geom.items.length === 0) return null;

  const PAD = PLAN_PAD;
  const vbW = geom.w + PAD * 2;
  const vbH = geom.h + PAD * 2;
  // Normalised cell origin inside the viewBox.
  const ox = (x: number) => x - geom.minX + PAD;
  const oy = (y: number) => y - geom.minY + PAD;

  return (
    <svg
      viewBox={`0 0 ${vbW} ${vbH}`}
      className={`block ${className ?? ""}`}
      role="img"
      aria-label="Sofa plan view"
      data-testid="sofa-plan-svg"
    >
      {/* pass 1 — seat bodies (fill only; strokes come last so dividers stay crisp) */}
      {geom.items.map((it, i) => (
        <rect
          key={`body-${i}`}
          x={ox(it.x)}
          y={oy(it.y)}
          width={it.w}
          height={it.h}
          fill={C.body}
        />
      ))}

      {/* pass 2 — backrest + arm strips per cell edge */}
      {geom.items.map((it, i) => {
        const ARM = Math.min(14, it.w * 0.16, it.h * 0.16);
        const BACK = Math.min(12, it.h * 0.16, it.w * 0.16);
        const x = ox(it.x);
        const y = oy(it.y);
        const strips: React.ReactNode[] = [];
        const strip = (
          key: string,
          sx: number,
          sy: number,
          sw: number,
          sh: number,
          fill: string,
        ) =>
          strips.push(
            <rect
              key={key}
              x={sx}
              y={sy}
              width={sw}
              height={sh}
              fill={fill}
              stroke={C.stroke}
              strokeWidth={0.9}
            />,
          );
        if (it.edges[EDGE_N] === "back") strip(`bn-${i}`, x, y, it.w, BACK, C.back);
        if (it.edges[EDGE_S] === "back") strip(`bs-${i}`, x, y + it.h - BACK, it.w, BACK, C.back);
        if (it.edges[EDGE_W] === "back") strip(`bw-${i}`, x, y, BACK, it.h, C.back);
        if (it.edges[EDGE_E] === "back") strip(`be-${i}`, x + it.w - BACK, y, BACK, it.h, C.back);
        if (it.edges[EDGE_W] === "arm") strip(`aw-${i}`, x, y, ARM, it.h, C.arm);
        if (it.edges[EDGE_E] === "arm") strip(`ae-${i}`, x + it.w - ARM, y, ARM, it.h, C.arm);
        if (it.edges[EDGE_N] === "arm") strip(`an-${i}`, x, y, it.w, ARM, C.arm);
        if (it.edges[EDGE_S] === "arm") strip(`as-${i}`, x, y + it.h - ARM, it.w, ARM, C.arm);
        return strips;
      })}

      {/* pass 3 — per-cushion dashed seams (along the seat length axis) */}
      {geom.items.map((it, i) => {
        if (it.cushions <= 1) return null;
        const x = ox(it.x);
        const y = oy(it.y);
        return Array.from({ length: it.cushions - 1 }, (_, k) => {
          const horizontalRun = it.rot % 180 === 0;
          const cx = x + (it.w * (k + 1)) / it.cushions;
          const cy = y + (it.h * (k + 1)) / it.cushions;
          return horizontalRun ? (
            <line
              key={`seam-${i}-${k}`}
              x1={cx}
              y1={y}
              x2={cx}
              y2={y + it.h}
              stroke={C.seam}
              strokeWidth={0.9}
              strokeDasharray="3,3"
            />
          ) : (
            <line
              key={`seam-${i}-${k}`}
              x1={x}
              y1={cy}
              x2={x + it.w}
              y2={cy}
              stroke={C.seam}
              strokeWidth={0.9}
              strokeDasharray="3,3"
            />
          );
        });
      })}

      {/* pass 4 — cell outlines (colinear junction strokes read as ONE divider) */}
      {geom.items.map((it, i) => (
        <rect
          key={`outline-${i}`}
          x={ox(it.x)}
          y={oy(it.y)}
          width={it.w}
          height={it.h}
          fill="none"
          stroke={C.stroke}
          strokeWidth={2}
          data-testid="plan-cell-body"
        />
      ))}

      {/* pass 5 — mechanism glyphs (P / R / L) — text, never emoji */}
      {geom.items.map((it, i) =>
        it.mechanism ? (
          <text
            key={`mech-${i}`}
            x={ox(it.x) + it.w / 2}
            y={oy(it.y) + it.h / 2}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={Math.min(it.w, it.h) * 0.28}
            fontWeight={700}
            fill={C.stroke}
            data-testid="plan-cell-mechanism"
          >
            {it.mechanism}
          </text>
        ) : null,
      )}
    </svg>
  );
}
