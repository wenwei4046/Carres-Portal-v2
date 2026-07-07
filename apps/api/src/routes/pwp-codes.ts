import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import {
  Adapters,
  DB,
  PWP_CODES,
  PWP_RULES,
  SOFA_COMBO_PRICING,
  lineMatchesTargets,
  pwpReserveInputSchema,
  pwpCodesResponseSchema,
  pwpDiscoverResponseSchema,
  type PwpRule,
  type RuleLineInput,
  type RuleTarget,
} from "@carres/shared";
import { userClient } from "../lib/supabase";
import { resolveSkuInfo, type SkuInfo } from "../lib/rule-line-input";
import type { AppEnv } from "../types";

/**
 * 2990s Products parity Phase 8c (migration 0187) — the PWP voucher RESERVE API.
 *
 * The cart-side counterpart of the order-path claim (`pwp-codes-claim.ts`). As a
 * salesperson adds/changes a TRIGGER line (a product that unlocks a PWP/promo
 * reward), the POS reconciler calls this router to RESERVE one `pwp_codes` row per
 * unlocked reward slot (`qtyPerTrigger × qty`), "occupying the number" so two
 * carts can never reserve the same voucher string. At Confirm a reward line's
 * bound code is CLAIMED (RESERVED→USED) by the order route; the unclaimed
 * RESERVED ones are swept. P8c is SAME-CART ONLY — every operation is
 * owner-scoped (`owner_staff_id = auth.uid()` via RLS); there is no cross-order /
 * AVAILABLE path (that is P8d).
 *
 * Routes (all under /api/pwp-codes, all behind the global `authMiddleware`):
 *   POST   /reserve                  — idempotent (sequential) reconcile of ONE
 *                                      trigger line's RESERVED set (top-up / trim).
 *   DELETE /reserve?cartLineKey=…     — free a removed/zeroed trigger line's
 *                                      RESERVED codes (RESERVED only — never USED).
 *   GET    /mine                     — the caller's RESERVED set + a self-heal
 *                                      (owner-scoped orphan reaper) sweep.
 *   POST   /reap                     — the caller-scoped orphan reaper (also the
 *                                      target of the daily cron, owner-scoped here).
 *
 * All DB access via `userClient(c.env, auth.jwt)` (RLS) + the SECURITY DEFINER
 * RPCs — NEVER service_role. DORMANT: 0 active `pwp_rules` → reserve matches no
 * rule → 0 codes minted → byte-identical (the POS reconciler never even calls
 * reserve in that case).
 */

const pwpCodesRouter = new Hono<AppEnv>();

/* ─── code minting (mirrors 2990s genCode) ─────────────────────────────────── */

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** 'PWP-' + 4 digits + 4 A–Z, from crypto.getRandomValues. Re-drawn on a PK
 *  collision (23505) by the caller. */
function genCode(): string {
  const buf = new Uint32Array(8);
  crypto.getRandomValues(buf);
  let digits = "";
  for (let i = 0; i < 4; i++) digits += String(buf[i]! % 10);
  let letters = "";
  for (let i = 0; i < 4; i++) letters += LETTERS[buf[4 + i]! % 26];
  return `PWP-${digits}${letters}`;
}

/* ─── trigger-line → RuleLineInput (mirrors pwp-recompute's deriveRuleLine) ──── */

function deriveRuleLine(info: SkuInfo | null): RuleLineInput {
  const category = info?.category ?? "";
  const isSofa = category.toLowerCase() === "sofa";
  return {
    category,
    modelId: info?.modelId ?? null,
    sizeCode: !isSofa && info?.variant ? info.variant.toUpperCase() : null,
    builtCompartments: [],
  };
}

const upper = (s: string): string => String(s ?? "").toUpperCase();

/* ─── POST /reserve — reconcile ONE trigger line's RESERVED set ─────────────── */

pwpCodesRouter.post("/reserve", async (c) => {
  const auth = c.var.auth;

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw new HTTPException(400, { message: "Body must be valid JSON" });
  }
  const parsed = pwpReserveInputSchema.safeParse(body);
  if (!parsed.success) {
    throw new HTTPException(400, {
      message: "Invalid reserve input: " + parsed.error.issues[0]?.message,
    });
  }
  const { cartLineKey, sku, qty, rewardLine, builtCompartments } = parsed.data;
  const sb = userClient(c.env, auth.jwt);

  // 1. Resolve the trigger sku → { category, modelId, variant }. A sofa BUILD
  //    trigger additionally carries its built module codes (client-sent, but
  //    harmless to trust here: a fudged list only mints RESERVED codes that the
  //    order-path grant re-validates against the REAL build before any claim).
  const skuRes = await resolveSkuInfo(sb, [sku]);
  if (!skuRes.ok) throw new HTTPException(500, { message: skuRes.message });
  const info = skuRes.skuInfo.get(sku) ?? null;
  const triggerLine: RuleLineInput = {
    ...deriveRuleLine(info),
    builtCompartments: (builtCompartments ?? []).map((m) => m.trim()).filter(Boolean),
  };

  // 2. ACTIVE pwp_rules (RLS). The adapter parses RuleTargets.
  const rulesR = await sb.from(PWP_RULES).select("*").eq("active", true);
  if (rulesR.error) throw new HTTPException(500, { message: rulesR.error.message });
  const rules: PwpRule[] = ((rulesR.data ?? []) as DB.PwpRuleRow[]).map((r) => Adapters.pwpRuleFromRow(r));

  // 3. Select rules whose TRIGGER scope matches this line: category match AND the
  //    RuleTarget matcher covers it. (combo-scope triggers are not minted from a
  //    flat-sku reserve — a combo trigger is exploded into per-sku component lines,
  //    each a flat trigger; an empty comboMap means a combo target never matches
  //    here, which is correct for the flat-line reserve.) Builds a per-rule target
  //    count = qtyPerTrigger × qty.
  // COMBO-scope trigger targets need each combo's slots to match a BUILD
  // trigger. Load them only when a build is in play AND some rule references a
  // combo trigger (flat-line reserves keep the zero-read path).
  let comboModulesById = new Map<string, string[][]>();
  const triggerComboIds = new Set<string>();
  if (triggerLine.builtCompartments.length > 0) {
    for (const rule of rules) {
      for (const t of rule.triggerTargets) {
        if (t.scope === "combo") for (const id of t.comboIds ?? []) triggerComboIds.add(id);
      }
    }
  }
  if (triggerComboIds.size > 0) {
    const { data, error } = await sb
      .from(SOFA_COMBO_PRICING)
      .select("id, slots")
      .in("id", Array.from(triggerComboIds));
    if (error) throw new HTTPException(500, { message: error.message });
    comboModulesById = new Map(
      ((data ?? []) as Array<{ id: string; slots: string[][] | null }>).map((r) => [
        r.id,
        r.slots ?? [],
      ]),
    );
  }

  const matched: Array<{ rule: PwpRule; target: number }> = [];
  for (const rule of rules) {
    // 2990s one-way parity: a trigger line that is ITSELF a reward never mints
    // PROMO vouchers (a free reward funding the next free reward). PWP rules
    // still reserve — chaining is intentional. Unmatched promo reservations for
    // this line are trimmed as strays below.
    if (rewardLine && rule.type === "promo") continue;
    if (upper(triggerLine.category) !== upper(rule.triggerCategory)) continue;
    if (!lineMatchesTargets(triggerLine, rule.triggerTargets, comboModulesById)) continue;
    const qpt = Math.max(1, Math.floor(Number(rule.qtyPerTrigger) || 1));
    matched.push({ rule, target: qpt * qty });
  }
  const matchedRuleIds = new Set(matched.map((m) => m.rule.id));

  // 4. Load existing RESERVED rows for this cart line (owner-scoped via RLS).
  const existingR = await sb
    .from(PWP_CODES)
    .select("*")
    .eq("cart_line_key", cartLineKey)
    .eq("owner_staff_id", auth.id)
    .eq("status", "RESERVED");
  if (existingR.error) throw new HTTPException(500, { message: existingR.error.message });
  const existing = (existingR.data ?? []) as DB.PwpCodeRow[];

  // 5. Per matched rule: top-up (insert delta) / trim (delete surplus) / no-op.
  for (const m of matched) {
    const have = existing.filter((e) => e.rule_id === m.rule.id);
    if (have.length < m.target) {
      const toInsert = m.target - have.length;
      const rewardTargets: RuleTarget[] = m.rule.rewardTargets;
      for (let k = 0; k < toInsert; k++) {
        // Insert with a 23505-retry on the PK collision (a freshly drawn code may
        // collide with a live one). Bounded re-draw.
        let inserted = false;
        for (let attempt = 0; attempt < 8 && !inserted; attempt++) {
          const code = genCode();
          const { error } = await sb.from(PWP_CODES).insert({
            code,
            rule_id: m.rule.id,
            type: m.rule.type,
            reward_category: m.rule.rewardCategory,
            reward_targets: rewardTargets,
            status: "RESERVED",
            owner_staff_id: auth.id,
            cart_line_key: cartLineKey,
            trigger_item_code: sku,
          });
          if (!error) {
            inserted = true;
            break;
          }
          if (error.code === "23505") continue; // PK collision → re-draw
          throw new HTTPException(500, { message: error.message });
        }
        if (!inserted) {
          throw new HTTPException(500, { message: "Could not mint a unique PWP voucher code" });
        }
      }
    } else if (have.length > m.target) {
      const surplus = have.slice(m.target).map((e) => e.code);
      const { error } = await sb
        .from(PWP_CODES)
        .delete()
        .in("code", surplus)
        .eq("owner_staff_id", auth.id)
        .eq("status", "RESERVED");
      if (error) throw new HTTPException(500, { message: error.message });
    }
    // have.length === m.target → no-op.
  }

  // 6. Trim strays: any RESERVED row for this cart line whose rule is no longer in
  //    the matched set (rule deactivated / trigger changed category).
  const strays = existing.filter((e) => !e.rule_id || !matchedRuleIds.has(e.rule_id)).map((e) => e.code);
  if (strays.length > 0) {
    const { error } = await sb
      .from(PWP_CODES)
      .delete()
      .in("code", strays)
      .eq("owner_staff_id", auth.id)
      .eq("status", "RESERVED");
    if (error) throw new HTTPException(500, { message: error.message });
  }

  // 7. Return the line's FULL current RESERVED set.
  const finalR = await sb
    .from(PWP_CODES)
    .select("*")
    .eq("cart_line_key", cartLineKey)
    .eq("owner_staff_id", auth.id)
    .eq("status", "RESERVED");
  if (finalR.error) throw new HTTPException(500, { message: finalR.error.message });
  const codes = ((finalR.data ?? []) as DB.PwpCodeRow[]).map((r) => Adapters.pwpCodeFromRow(r));
  return c.json(pwpCodesResponseSchema.parse({ codes }));
});

/* ─── DELETE /reserve?cartLineKey=… — free a line's reservations ────────────── */

pwpCodesRouter.delete("/reserve", async (c) => {
  const auth = c.var.auth;
  const cartLineKey = new URL(c.req.url).searchParams.get("cartLineKey");
  if (!cartLineKey) {
    throw new HTTPException(400, { message: "cartLineKey query param is required" });
  }
  const sb = userClient(c.env, auth.jwt);
  // ONLY RESERVED is deletable — a USED code (claimed at a prior committed submit)
  // is never touched here.
  const { error } = await sb
    .from(PWP_CODES)
    .delete()
    .eq("cart_line_key", cartLineKey)
    .eq("owner_staff_id", auth.id)
    .eq("status", "RESERVED");
  if (error) throw new HTTPException(500, { message: error.message });
  return c.json({ ok: true });
});

/* ─── GET /available — cross-order DISCOVERY (P8d, 0188) ────────────────────── */

// GET /api/pwp-codes/available?phone=…  OR  ?code=…[&phone=…]
//
// The cross-order voucher DISCOVERY read. Calls the SECURITY DEFINER
// `pwp_discover_available` — a MINIMAL stripped projection (NO bound phone / owner
// / trigger sku / customer id). The phone match is computed SERVER-SIDE
// (`phoneMatches` boolean), so the stored phone is NEVER returned — killing the
// `?code=` enumeration / PII oracle. The RPC REQUIRES a phone-or-code selector
// (no dump-all of the AVAILABLE pool) + scopes a salesperson to their own dealer
// (internal roles see all). PDPA-safe. userClient/RLS + the DEFINER RPC only —
// never service_role + never a table `select('*')`. DORMANT: 0 AVAILABLE rows →
// `{ vouchers: [] }`; the POS only calls this when PWP is active.
pwpCodesRouter.get("/available", async (c) => {
  const auth = c.var.auth;
  const sb = userClient(c.env, auth.jwt);
  const url = new URL(c.req.url);
  const phone = url.searchParams.get("phone"); // raw; canonicalized in the RPC
  const code = url.searchParams.get("code");
  const name = url.searchParams.get("name"); // 0204 — drives name_matches (raw)
  // No selector → no discovery (the RPC also short-circuits, but skip the call).
  if (!phone && !code) {
    return c.json(pwpDiscoverResponseSchema.parse({ vouchers: [] }));
  }

  const { data, error } = await sb.rpc("pwp_discover_available", {
    p_phone: phone ?? null,
    p_code: code ?? null,
    p_name: name ?? null,
  });
  if (error) throw new HTTPException(500, { message: error.message });
  // The RPC already returns the STRIPPED shape — map snake→camel into the discover
  // DTO (no PII can reach the client by construction).
  const vouchers = ((data ?? []) as DB.PwpDiscoverRow[]).map((r) => Adapters.pwpDiscoverFromRow(r));
  return c.json(pwpDiscoverResponseSchema.parse({ vouchers }));
});

/* ─── GET /by-order/:orderId — the vouchers EARNED on one order (0204) ──────── */

// 2990s parity (Loo 2026-07-06): the reference prints a customer's earned
// voucher codes on the SO so they physically carry them. This is the v2
// surface: the POS ThankYou screen (and any reprint) lists the codes whose
// carry-forward `source_order_id` is this order. Owner/dealer-scoped via the
// pwp_codes RLS (the creating salesperson owns the codes they just minted) —
// plain table read under the user JWT, no DEFINER needed, never service_role.
// DORMANT: an order with no carried vouchers returns `{ codes: [] }`.
pwpCodesRouter.get("/by-order/:orderId", async (c) => {
  const auth = c.var.auth;
  const orderId = c.req.param("orderId");
  const sb = userClient(c.env, auth.jwt);
  const { data, error } = await sb
    .from(PWP_CODES)
    .select("*")
    .eq("source_order_id", orderId)
    .in("status", ["AVAILABLE", "USED"]);
  if (error) throw new HTTPException(500, { message: error.message });
  const codes = ((data ?? []) as DB.PwpCodeRow[]).map((r) => Adapters.pwpCodeFromRow(r));
  return c.json(pwpCodesResponseSchema.parse({ codes }));
});

/* ─── GET /mine — the reconciler's read (+ owner-scoped self-heal) ──────────── */

pwpCodesRouter.get("/mine", async (c) => {
  const auth = c.var.auth;
  const sb = userClient(c.env, auth.jwt);

  // Self-heal (§4.4a): reclaim the caller's crash-stranded USED-unstamped orphans
  // (older than the grace, with no committed order adopting the claim_group) back
  // to RESERVED, so they reappear in the Auto-Fill rail. Best-effort — a reaper
  // error must not block the read. The RPC is SELF-SCOPED: it forces the owner to
  // auth.uid() + clamps the grace to a 15-min floor (review BLOCKER fix), so no
  // p_owner arg is passed — the route can no longer widen the scope.
  await sb.rpc("pwp_reap_orphans", { p_grace_minutes: 15 });
  // Re-stamp lineage (review MINOR): the inverse case — a USED code stranded
  // redeemed_order_id NULL but whose claim_group IS adopted by exactly one committed
  // non-cancelled order (worker died after commit, before the Confirm-pass stamp).
  // The reaper LEAVES it (the belt sees the adopting order); this idempotent pass
  // stamps redeemed_order_id from the adopting order so P8d's lineage stays accurate.
  // Best-effort — must not block the read.
  await sb.rpc("pwp_restamp_orphans");

  const { data, error } = await sb
    .from(PWP_CODES)
    .select("*")
    .eq("owner_staff_id", auth.id)
    .eq("status", "RESERVED");
  if (error) throw new HTTPException(500, { message: error.message });
  const codes = ((data ?? []) as DB.PwpCodeRow[]).map((r) => Adapters.pwpCodeFromRow(r));
  return c.json(pwpCodesResponseSchema.parse({ codes }));
});

/* ─── POST /reap — the caller-scoped orphan reaper (also the cron target) ───── */

pwpCodesRouter.post("/reap", async (c) => {
  const auth = c.var.auth;
  const sb = userClient(c.env, auth.jwt);
  // Self-scoped — a salesperson reclaims only their OWN orphans. The RPC forces the
  // owner to auth.uid() (no p_owner arg) + a 15-min grace floor (review BLOCKER
  // fix). The all-owners (incl. nulled-owner) backstop is the cron-only
  // pwp_reap_orphans_all() (NOT granted to authenticated), wired to a daily cron
  // when the backstop goes live (CF pwp-orphan-reaper-cron-unwired).
  const { data, error } = await sb.rpc("pwp_reap_orphans", {
    p_grace_minutes: 15,
  });
  if (error) throw new HTTPException(500, { message: error.message });
  return c.json({ reaped: typeof data === "number" ? data : 0 });
});

export default pwpCodesRouter;
