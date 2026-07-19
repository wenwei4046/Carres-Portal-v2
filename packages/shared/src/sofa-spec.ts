import { orderSofaCellsLeftToRight, type GeoCell } from "./sofa-geometry";

/**
 * Customer-facing sofa spec copy from a build's EXPLODED order lines
 * (Loo 2026-07-19) — the sofa is ONE item in the customer's hands; the
 * per-compartment split is an operation-side detail. This re-composes the cart
 * label ("1B(LHF) + CNR + 2A(RHF) · 24″ · CG-011 Peach · leg 4″", see
 * `buildLabel` in the web `sofa-build-draft`) from what the Phase-5 explode
 * persists on each line's attrs:
 *   · cells   = `module_code` (sku fallback), walked LEFT→RIGHT via the
 *               persisted geometry (x/y/rot + sofa_height) when complete, else
 *               kept in stored line order — never invents an order.
 *   · height  = `sofa_height` (stamped from 2026-07-19; older orders omit it,
 *               the segment simply drops).
 *   · fabric  = `fabric_name`, else `fabric_series` → "EZ · colour KIV".
 *   · leg     = `leg_height` → "leg 4″" (the pool value carries its own unit).
 * Pure — shared by the POS receipt/order-detail regroup AND the Sales Order
 * PDF payload so every customer surface prints the SAME copy.
 */

/** The slice of an exploded order line the spec needs (domain OR raw row). */
export interface SofaSpecLine {
  sku: string;
  attrs?: Record<string, unknown> | null;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim().length > 0 ? v : null;
}

export function sofaBuildSpec(lines: readonly SofaSpecLine[]): string {
  if (lines.length === 0) return "";
  const first = lines[0]?.attrs ?? {};

  const height = str(first["sofa_height"]);
  const codes: string[] = [];
  const geo: GeoCell[] = [];
  let walkable = height !== null;
  lines.forEach((l, i) => {
    const a = l.attrs ?? {};
    const code = str(a["module_code"]) ?? l.sku;
    codes.push(code);
    const { x, y, rot } = a as { x?: unknown; y?: unknown; rot?: unknown };
    if (
      typeof x === "number" &&
      Number.isFinite(x) &&
      typeof y === "number" &&
      Number.isFinite(y) &&
      (rot === 0 || rot === 90 || rot === 180 || rot === 270)
    ) {
      geo.push({ id: `cell-${i}`, moduleCode: code, x, y, rot });
    } else {
      walkable = false;
    }
  });
  const orderedCodes =
    walkable && height ? orderSofaCellsLeftToRight(geo, height).map((c) => c.moduleCode) : codes;

  const parts: string[] = [orderedCodes.join(" + ")];
  if (height) parts.push(`${height}″`);
  const fabricName = str(first["fabric_name"]);
  const fabricSeries = str(first["fabric_series"]);
  if (fabricName) parts.push(fabricName);
  else if (fabricSeries) parts.push(`${fabricSeries} · colour KIV`);
  const leg = str(first["leg_height"]);
  if (leg) parts.push(`leg ${leg}`);
  return parts.join(" · ");
}
