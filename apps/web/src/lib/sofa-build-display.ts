import type { OrderLine } from "@carres/shared";

/**
 * Sofa engine Phase 5 — regroup exploded sofa-build order lines for DISPLAY.
 *
 * A built sofa is persisted as one `order_line` per compartment (the Phase-5
 * explode), each carrying `attrs.sofa_build_key` (+ `module_code`, `cell_index`,
 * geometry, fabric). Internal surfaces (operation / PO / stock) WANT those
 * per-compartment lines — each compartment is made + shipped + tracked
 * separately. Customer-facing summaries want the opposite: ONE "sofa" row. This
 * pure helper regroups for the customer-facing case; it is a strict no-op for
 * every keyless line (every existing flat order renders byte-identically).
 *
 * Mirrors the combo regroup `lineComboKey` in `pos/CartDrawer.tsx`.
 */

/** A line's sofa-build group key, or `null` for a standalone (non-build) line. */
export function lineSofaBuildKey(
  attrs: Record<string, unknown> | null | undefined,
): string | null {
  const k = attrs?.sofa_build_key;
  return typeof k === "string" && k.length > 0 ? k : null;
}

/** The compartment code an exploded line was built from (`attrs.module_code`). */
function lineModuleCode(attrs: Record<string, unknown> | null | undefined): string | null {
  const m = attrs?.module_code;
  return typeof m === "string" && m.length > 0 ? m : null;
}

export interface SofaBuildGroupRow {
  kind: "sofa_build";
  buildKey: string;
  /** The compartment lines that make up this sofa, in order. */
  lines: OrderLine[];
  /** One assembled sofa. */
  qty: number;
  /** Σ unitPrice × qty over the compartment lines (equals the build total). */
  totalPrice: number;
  /** Compartment summary like "2A + L + 1A" (falls back to skus). */
  summary: string;
}
export interface StandaloneLineRow {
  kind: "line";
  line: OrderLine;
}
export type OrderDisplayRow = SofaBuildGroupRow | StandaloneLineRow;

/**
 * Collapse exploded sofa-build lines (sharing a `sofa_build_key`) into one
 * display row per sofa; every other line passes through as a standalone row, in
 * original order (a group lands at its FIRST line's position). A keyless order
 * returns one `StandaloneLineRow` per line — identical to no grouping.
 */
export function groupSofaBuildLines(lines: readonly OrderLine[]): OrderDisplayRow[] {
  const rows: OrderDisplayRow[] = [];
  const groupIndexByKey = new Map<string, number>();
  for (const line of lines) {
    const key = lineSofaBuildKey(line.attrs);
    if (!key) {
      rows.push({ kind: "line", line });
      continue;
    }
    const at = groupIndexByKey.get(key);
    const code = lineModuleCode(line.attrs) ?? line.sku;
    if (at === undefined) {
      groupIndexByKey.set(key, rows.length);
      rows.push({
        kind: "sofa_build",
        buildKey: key,
        lines: [line],
        qty: 1,
        totalPrice: line.unitPrice * line.qty,
        summary: code,
      });
    } else {
      const row = rows[at] as SofaBuildGroupRow;
      row.lines.push(line);
      row.totalPrice += line.unitPrice * line.qty;
      row.summary += ` + ${code}`;
    }
  }
  return rows;
}
