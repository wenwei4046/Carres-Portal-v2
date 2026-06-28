import type { SupabaseClient } from "@supabase/supabase-js";

import type { RecomputableLine } from "./sofa-recompute";

/**
 * Order-path PWP voucher CLAIM (2990s Products parity Phase 8c, migration 0187) —
 * Stage B of the two-stage PWP pipeline (design plan §0 / §4.2). P8b
 * (`recomputePwpLines`) is the PRICING authority and runs FIRST: it forces a
 * granted reward line's unitPrice and canonicalises `attrs.pwp` to
 * `{ ruleId, type, triggerRef }` PLUS carries through the client's `code` +
 * `claimGroup`. Stage B is a SEPARATE, PARALLEL lineage/lock LEDGER step that runs
 * AFTER the P8b price stage: for each priced reward line carrying a non-empty
 * `attrs.pwp.code`, it atomically claims that RESERVED voucher (RESERVED→USED)
 * via the SECURITY DEFINER `pwp_claim_code` RPC, asserting the code was minted
 * under the SAME rule that priced the line, and stamping the per-submit
 * `claimGroup` correlation uuid (the cancel/recovery join key available BEFORE
 * `create_order` returns an order id).
 *
 * THE CODE NEVER SETS A PRICE. The lines out of this lib are `pwp.lines`
 * UNCHANGED — price = exactly what P8b forced. Stage B only flips a row status in
 * `pwp_codes`. If a claimed code is missing / un-reservable / minted under a
 * different rule, the ORDER REJECTS (409 `pwp_code_rejected`) — the rejection is
 * about the LOCK record, not the price (§4.6).
 *
 * Rollback: this is the ONLY stage that writes to `pwp_codes` before
 * `create_order`, so the returned `claimed[]` ledger has exactly one producer.
 * Every downstream early-exit in `orders.ts` reverses exactly that ledger via the
 * atomic batch `pwp_release_codes(text[])` RPC (§4.3 / §4.5).
 *
 * DORMANT short-circuit (§7): no line carries a non-empty `attrs.pwp.code` →
 * `{ status:"ok", lines, claimed:[], claimGroup:null }` with ZERO DB call. This
 * mirrors the delivery-fee-recompute / pwp-recompute no-claim short-circuits, so a
 * P8b-only or no-rules order is byte-identical and touches no voucher ledger.
 *
 * Uses the USER JWT (RLS) + the SECURITY DEFINER RPCs only — NEVER service_role.
 * `create_order` / `order_lines` / `DraftLine` / `cart.ts` stay UNTOUCHED: the
 * `code` / `claimGroup` ride the existing `attrs.pwp` jsonb on the payload.lines
 * path.
 */

/** The rollback ledger entry. `crossOrder` records which claim RPC minted the
 *  USED state so the rollback restores it to the CORRECT prior state:
 *    - same-cart (`crossOrder=false`) → was RESERVED → `pwp_release_codes` (owner).
 *    - cross-order (`crossOrder=true`) → was AVAILABLE → `pwp_release_available_code`
 *      (DEFINER, allowlist + claim_group bound). */
export type ClaimedCode = { code: string; crossOrder: boolean };

export type PwpClaimOutcome =
  | { status: "ok"; lines: RecomputableLine[]; claimed: ClaimedCode[]; claimGroup: string | null }
  | { status: "bad_request"; message: string; code: "pwp_code_rejected" }
  | { status: "server_error"; message: string };

/** The caller's auth context this lib needs (id only — same shape `orders.ts`
 *  passes from `c.var.auth`). */
export interface ClaimAuth {
  id: string;
}

/** Read a line's `attrs.pwp` claim signal: the bound voucher `code`, the pricing
 *  `ruleId`, the per-submit `claimGroup`, and the P8d `crossOrder` flag. The three
 *  strings are trimmed or "" when absent; `crossOrder` is true ONLY for a
 *  `crossOrder === true` marker (an AVAILABLE carry-forward voucher claim). */
function readPwpClaim(attrs: Record<string, unknown> | null): {
  code: string;
  ruleId: string;
  claimGroup: string;
  crossOrder: boolean;
} {
  const pwp = (attrs as { pwp?: { code?: unknown; ruleId?: unknown; claimGroup?: unknown; crossOrder?: unknown } } | null)
    ?.pwp;
  const code = typeof pwp?.code === "string" ? pwp.code.trim() : "";
  const ruleId = typeof pwp?.ruleId === "string" ? pwp.ruleId.trim() : "";
  const claimGroup = typeof pwp?.claimGroup === "string" ? pwp.claimGroup.trim() : "";
  const crossOrder = pwp?.crossOrder === true;
  return { code, ruleId, claimGroup, crossOrder };
}

/**
 * Stage B — claim the RESERVED voucher each priced reward line references.
 *
 * @param sb    the USER-JWT supabase client (RLS) — `orders.ts` passes
 *              `userClient(c.env, auth.jwt)`. The RPCs are SECURITY DEFINER but
 *              read `auth.uid()` from the JWT, so the same client is used.
 * @param _auth the caller's auth context (currently unused — the RPCs derive the
 *              owner from `auth.uid()` — but kept for parity with the other
 *              recompute libs + future use; named `_auth` to satisfy lint).
 * @param lines the P8b-priced lines (price + `attrs.pwp` already canonical).
 * @param customerPhone the REDEEMING order's customer phone (raw — the RPC
 *              canonicalizes via `pwp_phone_key`). Required for a cross-order
 *              (`crossOrder=true`) claim; the SQL twin asserts the phone binding.
 *              A same-cart claim ignores it.
 */
export async function claimPwpCodesForLines(
  sb: SupabaseClient,
  _auth: ClaimAuth,
  lines: RecomputableLine[],
  customerPhone: string | null = null,
): Promise<PwpClaimOutcome> {
  // 1. Collect coded reward lines. A line with no non-empty `attrs.pwp.code` is
  //    not a voucher claim. DORMANT short-circuit: no coded line → no DB call.
  const coded: Array<{
    index: number;
    code: string;
    ruleId: string;
    claimGroup: string;
    sku: string;
    crossOrder: boolean;
  }> = [];
  for (let i = 0; i < lines.length; i++) {
    const { code, ruleId, claimGroup, crossOrder } = readPwpClaim(lines[i]!.attrs as Record<string, unknown> | null);
    if (!code) continue;
    coded.push({ index: i, code, ruleId, claimGroup, sku: lines[i]!.sku, crossOrder });
  }
  if (coded.length === 0) {
    return { status: "ok", lines, claimed: [], claimGroup: null };
  }

  // 2. One claimGroup per submit. Every coded line MUST carry the SAME non-empty
  //    claimGroup (the POS mints one per cart submit). Any coded line missing
  //    claimGroup / ruleId, or a disagreeing claimGroup → reject.
  let claimGroup = "";
  for (const c of coded) {
    if (!c.ruleId) {
      return {
        status: "bad_request",
        code: "pwp_code_rejected",
        message: "This PWP voucher claim is missing its pricing rule — please re-add the offer and retry.",
      };
    }
    if (!c.claimGroup) {
      return {
        status: "bad_request",
        code: "pwp_code_rejected",
        message: "This PWP voucher claim is missing its submit group — please re-add the offer and retry.",
      };
    }
    if (claimGroup === "") claimGroup = c.claimGroup;
    else if (claimGroup !== c.claimGroup) {
      return {
        status: "bad_request",
        code: "pwp_code_rejected",
        message: "PWP voucher claims in this order disagree on their submit group — please rebuild the cart and retry.",
      };
    }
  }

  // 3. Dedup codes — the same voucher code on two lines is a double-spend attempt.
  const seen = new Set<string>();
  for (const c of coded) {
    if (seen.has(c.code)) {
      return {
        status: "bad_request",
        code: "pwp_code_rejected",
        message: "The same PWP voucher cannot be applied to two lines — please re-add the offer and retry.",
      };
    }
    seen.add(c.code);
  }

  // 4. Claim each code atomically, bound to the pricing rule + the claimGroup. The
  //    claim RPC differs by mode:
  //      - same-cart  (RESERVED→USED) via `pwp_claim_code` (owner-scoped).
  //      - cross-order (AVAILABLE→USED) via `pwp_claim_available_code` (DEFINER,
  //        phone-bound: the SQL twin asserts pwp_phone_key(customerPhone) ==
  //        bound_customer_phone + expiry). A NULL row → 409 (phone mismatch /
  //        wrong rule / expired / already USED) — same rejection as a same-cart miss.
  //    On any early-return below, release the partial ledger first so a partial
  //    claim never leaks — split by mode so each code returns to its CORRECT state.
  const claimed: ClaimedCode[] = [];
  const releasePartial = async () => {
    if (claimed.length === 0) return;
    const ownCodes = claimed.filter((c) => !c.crossOrder).map((c) => c.code);
    const crossCodes = claimed.filter((c) => c.crossOrder).map((c) => c.code);
    if (ownCodes.length > 0) await sb.rpc("pwp_release_codes", { p_codes: ownCodes });
    if (crossCodes.length > 0) {
      await sb.rpc("pwp_release_available_code", { p_codes: crossCodes, p_claim_group: claimGroup });
    }
  };

  for (const c of coded) {
    const { data: row, error } = c.crossOrder
      ? await sb.rpc("pwp_claim_available_code", {
          p_code: c.code,
          p_rule_id: c.ruleId, // the code must be minted under the rule that priced this line
          p_claim_group: claimGroup, // cancel/recovery join key, set at claim (pre-create_order)
          p_redeemed_sku: c.sku, // best-effort audit (§4.2a)
          p_customer_phone: customerPhone, // the binding the SQL twin asserts (§4.2)
        })
      : await sb.rpc("pwp_claim_code", {
          p_code: c.code,
          p_rule_id: c.ruleId,
          p_claim_group: claimGroup,
          p_redeemed_sku: c.sku,
        });
    if (error) {
      // Fail-closed: release any partial claims, then 500.
      await releasePartial();
      return { status: "server_error", message: error.message };
    }
    // The RPC RETURNS the claimed row, or NULL when 0 rows matched (not RESERVED /
    // not AVAILABLE / not the caller's / wrong rule / already USED / phone mismatch
    // / expired). PostgREST surfaces a composite-returning function's NULL as
    // `data === null`.
    if (row == null) {
      await releasePartial();
      return {
        status: "bad_request",
        code: "pwp_code_rejected",
        message: c.crossOrder
          ? "This saved voucher can't be redeemed — check the customer's phone, or it may be used or expired."
          : "This PWP voucher is no longer reservable — please re-add the offer and retry.",
      };
    }
    claimed.push({ code: c.code, crossOrder: c.crossOrder });
  }

  // 5. lines pass through — price already forced by P8b; `code`+`claimGroup`
  //    already on `attrs.pwp` (persist into order_lines.attrs via create_order).
  return { status: "ok", lines, claimed, claimGroup };
}
