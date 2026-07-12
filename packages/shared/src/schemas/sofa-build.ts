import { z } from "zod";
import { fabricTierSchema } from "./catalog";

/**
 * Sofa-build line attrs schema (sofa engine Phase 4).
 *
 * Phase 3 emits a built sofa as ONE order line whose `attrs` carry a geometry
 * descriptor under `sofa_build` (plus the fabric convention + a `sofa_build_key`
 * + `mode: "build"`). On submit, the Hono guard (Phase 4) must trust NOTHING in
 * that free jsonb — it re-parses the build with this schema before recomputing
 * the price server-side. A line is a "build line" iff `attrs.sofa_build` is a
 * present, non-null object (`isSofaBuildLine`); only then does the schema run.
 *
 * `.passthrough()` keeps the sibling attrs keys (fabric_id / fabric_name /
 * fabric_surcharge / mode / sofa_build_key) intact — the recompute only reads
 * `sofa_build` + `fabric_tier`, but the line's other attrs must survive into
 * `order_lines.attrs` unchanged (Phase 5 regroup reads them).
 */

/** One built cell — `moduleCode` is the only price-load-bearing field; the
 *  geometry (x/y/rot) rides along for the Phase-5 explode/regroup. */
export const sofaBuildCellSchema = z.object({
  moduleCode: z.string().min(1),
  x: z.number().nullable().optional(),
  y: z.number().nullable().optional(),
  rot: z.number().nullable().optional(),
});
export type SofaBuildCellAttrs = z.infer<typeof sofaBuildCellSchema>;

export const sofaBuildLineAttrsSchema = z
  .object({
    sofa_build: z.object({
      cells: z.array(sofaBuildCellSchema).min(1),
      height: z.string().min(1),
    }),
    /** Lookup tier for the combo + the fabric-tier delta. Absent/null → the
     *  engine prices at the default PRICE_1 tier. */
    fabric_tier: fabricTierSchema.nullable().optional(),
    /** 0201-wiring — the chosen `sofa_leg_height` pool VALUE. Absent/null → no
     *  leg surcharge. The recompute feeds it into `computeSofaPrice`, which
     *  prices an unknown/inactive value at 0 (a bad claim drifts + rejects). */
    leg_height: z.string().nullable().optional(),
    /** Remark price adjustment (Loo 2026-07-12) — an OPERATOR-DECIDED ± RM
     *  folded into the line unitPrice alongside a special remark ("custom
     *  armrest +200"). There is no config to verify it against, so the server
     *  TRUSTS the number but requires it typed-finite here (a NaN/string can't
     *  poison the drift gate) and adds it to the expected engine total. Ignored
     *  on a PWP-claimed line (the reward price is forced). */
    remark_surcharge: z.number().finite().nullable().optional(),
    sofa_build_key: z.string().optional(),
  })
  .passthrough();
export type SofaBuildLineAttrs = z.infer<typeof sofaBuildLineAttrsSchema>;

/**
 * Cheap guard: does this order line carry a sofa build? Run BEFORE the schema
 * so non-build lines (normal POS / combo / import) skip the recompute entirely.
 */
export function isSofaBuildLine(
  attrs: Record<string, unknown> | null | undefined,
): boolean {
  return (
    !!attrs &&
    typeof attrs === "object" &&
    "sofa_build" in attrs &&
    attrs.sofa_build != null &&
    typeof attrs.sofa_build === "object"
  );
}
