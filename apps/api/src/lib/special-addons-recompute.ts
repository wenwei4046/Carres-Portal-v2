import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  Adapters,
  DB,
  resolveSpecialsTotal,
  type SpecialAddonDef,
  type SpecialAddonPick,
} from "@carres/shared";

/**
 * Special-addon server recompute — the honest-pricing trust gate (Loo 2026-06-25,
 * mirroring the sofa Phase-4 pattern). A configured line may carry special
 * add-on picks in `attrs.specials[]` (each `{ code, choiceLabels }`) plus a
 * client-computed `attrs.specials_total` folded into the line `unitPrice`. The
 * client total is a PREVIEW; here Hono re-resolves the surcharge from FRESH,
 * ACTIVE special_addons defs with the SAME pure resolver the POS used.
 *
 *   · attrs malformed                → bad_request (400)
 *   · a referenced code is gone/retired → bad_request (400, "reconfigure")
 *   · |client − server| > max(0.5%, RM0.01) → drift (422 special_price_drift)
 *   · otherwise → nudge `unitPrice` by (server − client) so the line is
 *     authoritative on the special portion, and overwrite `attrs.specials` /
 *     `attrs.specials_total` with the server-canonical values.
 *
 * Lines without specials pass through verbatim. Runs AFTER the sofa recompute on
 * its (possibly exploded) line set; create_order / order_lines stay UNCHANGED —
 * the verified line set just flows into the existing RPC. Fails CLOSED (a catalog
 * read error → server_error; never silently price a special at 0).
 */

// One shared line shape across the recompute stages — special-addon recompute
// consumes the sofa recompute's output directly, so they MUST share one type
// (a drift in either would otherwise go uncaught by structural typing).
export type { RecomputableLine } from "./sofa-recompute";
import type { RecomputableLine } from "./sofa-recompute";

export interface SpecialPriceDrift {
  lineSku: string;
  clientTotal: number;
  serverTotal: number;
}

export type SpecialRecomputeOutcome =
  | { status: "ok"; lines: RecomputableLine[] }
  | { status: "drift"; drift: SpecialPriceDrift }
  | { status: "bad_request"; message: string }
  | { status: "server_error"; message: string };

const round2 = (n: number): number => Math.round(n * 100) / 100;

const pickSchema = z.object({
  code: z.string().min(1),
  choiceLabels: z.array(z.string()).default([]),
});
const specialsAttrsSchema = z.object({
  specials: z.array(pickSchema).min(1),
  specials_total: z.number().finite(),
});

function hasSpecials(attrs: Record<string, unknown> | null): boolean {
  if (!attrs) return false;
  const s = (attrs as { specials?: unknown }).specials;
  return Array.isArray(s) && s.length > 0;
}

/** A line already FREE (campaign-freed `attrs.free_item`, or an appended RM0
 *  gift `attrs.free_gift`) is LOCKED at RM0 — Phase 7 (F2). Any price recompute
 *  must skip it so a special surcharge is never re-added onto a freed line. */
function isFreeLine(attrs: Record<string, unknown> | null): boolean {
  if (!attrs) return false;
  return Boolean(attrs.free_item) || Boolean(attrs.free_gift);
}

export async function recomputeSpecialAddonLines(
  sb: SupabaseClient,
  lines: RecomputableLine[],
): Promise<SpecialRecomputeOutcome> {
  // 1. Gather every referenced code; bail early if no line carries specials.
  //    A FREE line is locked at RM0 (F2) — skip it (no surcharge re-add).
  const codes = new Set<string>();
  for (const line of lines) {
    if (isFreeLine(line.attrs)) continue;
    if (!hasSpecials(line.attrs)) continue;
    const parsed = specialsAttrsSchema.safeParse(line.attrs);
    if (!parsed.success) {
      return {
        status: "bad_request",
        message: "Invalid special add-on attrs: " + (parsed.error.issues[0]?.message ?? "malformed"),
      };
    }
    for (const p of parsed.data.specials) codes.add(p.code);
  }
  if (codes.size === 0) return { status: "ok", lines };

  // 2. Fresh, ACTIVE defs for the referenced codes (a retired code won't appear
  //    → reported as unavailable below).
  const { data, error } = await sb
    .from("special_addons")
    .select("*")
    .in("code", Array.from(codes))
    .eq("active", true);
  if (error) return { status: "server_error", message: error.message };
  const defsByCode = new Map<string, SpecialAddonDef>();
  for (const row of data ?? []) {
    const def = Adapters.specialAddonFromRow(row as DB.SpecialAddonRow);
    defsByCode.set(def.code, def);
  }

  // 3. Verify + nudge each specials line. A FREE line (locked at RM0) passes
  //    through verbatim — never re-priced (F2).
  const out: RecomputableLine[] = [];
  for (const line of lines) {
    if (isFreeLine(line.attrs) || !hasSpecials(line.attrs)) {
      out.push(line);
      continue;
    }
    const parsed = specialsAttrsSchema.safeParse(line.attrs);
    if (!parsed.success) {
      return { status: "bad_request", message: "Invalid special add-on attrs" };
    }
    const picks: SpecialAddonPick[] = parsed.data.specials;
    const clientTotal = parsed.data.specials_total;
    const { total: serverTotal, unknownCodes, lines: resolved } = resolveSpecialsTotal(picks, defsByCode);
    if (unknownCodes.length > 0) {
      return {
        status: "bad_request",
        message: `Special add-on '${unknownCodes[0]}' is no longer available — please reconfigure the line.`,
      };
    }
    const tol = Math.max(Math.abs(serverTotal) * 0.005, 0.01);
    if (Math.abs(clientTotal - serverTotal) > tol) {
      return { status: "drift", drift: { lineSku: line.sku, clientTotal, serverTotal } };
    }
    out.push({
      ...line,
      unitPrice: round2((line.unitPrice ?? 0) - clientTotal + serverTotal),
      attrs: { ...(line.attrs as Record<string, unknown>), specials: resolved, specials_total: serverTotal },
    });
  }
  return { status: "ok", lines: out };
}
