import { Hono, type Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import {
  Adapters,
  DB,
  autocountImportInput,
  autocountImportResponseSchema,
  cancelOrderInputSchema,
  createOrderInputSchema,
  isProceedBlockerCode,
  orderSchema,
  ordersListResponseSchema,
  orderStatusSchema,
  setOpsAssignedLogisticInputSchema,
  setOrderAddressInputSchema,
  setOrderDateInputSchema,
  topUpOrderInputSchema,
  updateOrderInputSchema,
  type AutocountImportResult,
} from "@carres/shared";
import { userClient, adminClient } from "../lib/supabase";
import {
  getOrderSkus,
  validateDeliveryLeadTime,
  type LeadTimeViolation,
} from "../lib/lead-time";
import { recomputeAndExplodeSofaBuildLines } from "../lib/sofa-recompute";
import { recomputeSpecialAddonLines } from "../lib/special-addons-recompute";
import { recomputeDeliveryFee } from "../lib/delivery-fee-recompute";
import { validateFreeItemClaims, resolveDefaultFreeGiftLines } from "../lib/free-gift-resolve";
import { recomputePwpLines } from "../lib/pwp-recompute";
import { claimPwpCodesForLines } from "../lib/pwp-codes-claim";
import { sweepReservedForSubmit } from "../lib/pwp-carry-forward";
import type { AppEnv } from "../types";

/**
 * 2026-05-12 (Loo) — `SalesOrderData` is the JSON shape the
 * `/sales-order-data` route returns. Rendering happens client-side per
 * apps/web/src/lib/pdf/render.ts; this type stays here as the route's
 * response contract and lives alongside the route handler that fills it.
 */
type SalesOrderData = {
  so_number: string;
  issue_date: string;
  order_id: string;
  order_code: string;
  status_label: string;
  channel: "dealer" | "showroom";
  customer: { name: string; address: string; phone: string | null };
  dealer: {
    name: string;
    contact: string | null;
    // 2026-05-22 (Loo, migration 0144) — dealer-side fallback address used
    // by the PDF "Sold By" block when no outlet is attached (pure dealer
    // channel). outlet_address takes precedence when present.
    address: string | null;
    outlet_name: string | null;
    outlet_address: string | null;
    salesperson_name: string | null;
    salesperson_phone: string | null;
  };
  delivery: { date: string; floor: number; has_lift: boolean };
  lines: Array<{
    sku: string;
    description: string;
    qty: number;
    unit_price: number;
    line_total: number;
    attrs: Record<string, unknown> | null;
  }>;
  addons: Array<{ label: string; qty: number; unit_price: number; line_total: number }>;
  subtotal: number;
  total: number;
  paid: number;
  balance_due: number;
  currency: string;
  signed: boolean;
  /** 2026-05-22 (Loo) — signed URL to the customer's eSign PNG. The PDF
   *  template renders this as an <Image> inside the signature block. Null
   *  when the order pre-dates signature capture or the file is missing. */
  signature_url: string | null;
};

const ordersRouter = new Hono<AppEnv>();

const listQuerySchema = z.object({
  status: orderStatusSchema.optional(),
  outletId: z.string().uuid().optional(),
  salespersonId: z.string().uuid().optional(),
  // Accepted but ignored for dealer/salesperson — RLS does the right thing.
  // Phase 3 (Principal) will use this for cross-dealer filtering.
  dealerId: z.string().uuid().optional(),
});

ordersRouter.get("/", async (c) => {
  const auth = c.var.auth;
  const parsed = listQuerySchema.safeParse(Object.fromEntries(new URL(c.req.url).searchParams));
  if (!parsed.success) {
    throw new HTTPException(400, { message: "Invalid query: " + parsed.error.issues[0]?.message });
  }
  const { status, outletId, salespersonId, dealerId } = parsed.data;

  const sb = userClient(c.env, auth.jwt);
  // PostgREST: select.eq*.order — .order() ends the chain (returns awaitable).
  // We embed minimal `unit_price/qty` from order_lines + order_addons so the
  // dashboard can show the per-card RM total and the monthly-spend subtitle
  // without an extra round-trip per order. Stair carry is intentionally
  // EXCLUDED here (matches the prototype's `monthValue` definition which sums
  // line+addon only — stair is a delivery-time concern, not a sales metric).
  let q = sb.from("orders").select(
    "*, line_count:order_lines(count), order_lines(unit_price, qty), order_addons(unit_price, qty)",
  );

  if (status) q = q.eq("status", status);
  if (outletId) q = q.eq("outlet_id", outletId);
  if (salespersonId) q = q.eq("salesperson_id", salespersonId);
  // Principal/internal roles can filter by a specific dealer; dealer/salesperson
  // scope is forced by RLS regardless of what they pass.
  if (
    dealerId &&
    (auth.role === "principal" ||
      auth.role === "operation" ||
      auth.role === "finance" ||
      auth.role === "bd")
  ) {
    q = q.eq("dealer_id", dealerId);
  }

  const { data, error } = await q.order("placed_at", { ascending: false });
  if (error) throw new HTTPException(500, { message: error.message });

  const orders = (data ?? []).map((row) => {
    const r = row as DB.OrderRow & {
      line_count?: Array<{ count: number }>;
      order_lines?: Array<{ unit_price: string | number; qty: number }>;
      order_addons?: Array<{ unit_price: string | number; qty: number }>;
    };
    return {
      ...Adapters.orderFromRow(r),
      lineCount: r.line_count?.[0]?.count ?? 0,
      totalAmount: computeTotalFromLines(r.order_lines, r.order_addons),
    };
  });

  const body = ordersListResponseSchema.parse({ orders, total: orders.length });
  return c.json(body);
});

/**
 * GET /api/orders/inbox — operation triage queue (migration 0136).
 *
 * Returns AutoCount-imported orders still in Inbox = status='place' AND
 * source_system='autocount' AND ops_assigned_logistic IS NULL.
 *
 * Operation OR principal only. RLS sees all orders for internal roles, so
 * the filter is the only narrowing. Sorted oldest first (FIFO triage).
 *
 * Static path — must register BEFORE the GET /:id route so "inbox" doesn't
 * match the :id param. (Hono Trie router resolves static > dynamic anyway,
 * but ordering is explicit insurance.)
 */
ordersRouter.get("/inbox", async (c) => {
  const auth = c.var.auth;
  if (auth.role !== "operation" && auth.role !== "principal") {
    throw new HTTPException(403, { message: "Operation or principal only" });
  }
  const sb = userClient(c.env, auth.jwt);
  const { data, error } = await sb
    .from("orders")
    .select(
      "id, so, customer_name, customer_phone, customer_address, delivery_date, paid, source_ref, source_system, ops_assigned_logistic, placed_at, order_lines(sku, qty, attrs)",
    )
    .eq("status", "place")
    .eq("source_system", "autocount")
    .is("ops_assigned_logistic", null)
    .order("placed_at", { ascending: true });
  if (error) throw new HTTPException(500, { message: error.message });
  return c.json({ orders: data ?? [], total: (data ?? []).length });
});

/**
 * POST /api/orders — atomic create via RPC `create_order(payload jsonb)`.
 *
 * Flow:
 *   1. Verify caller is dealer/salesperson/internal (middleware sets c.var.auth)
 *   2. Validate camelCase input with zod
 *   3. Adapter converts → snake_case jsonb RPC payload (+ injects dealerId from JWT)
 *   4. Call RPC — atomic insert across 5 tables (orders + lines + addons +
 *      history + audit_log). If anything fails, Postgres rolls back the whole TX.
 *   5. Re-fetch the inserted order with rels (same shape as GET /:id) so the
 *      client can route directly to /dealer/orders/:id without a second fetch.
 *
 * Attribution: a dealer/salesperson/showroom places under its OWN JWT dealer —
 * the body `dealerId` is IGNORED for them (no spoofing). An internal role
 * (principal/operation/finance/bd) carries no own dealer_id and places ON BEHALF
 * OF a dealer it picks, supplied as the body `dealerId`. The RPC also re-checks
 * cross-dealer via SECURITY DEFINER, so a hand-crafted payload can't sneak through.
 */
// Internal roles that may place an order on behalf of a picked dealer (they
// carry no own dealer_id). A dealer/salesperson/showroom never reaches the
// body-dealerId branch — their JWT dealer always wins.
const ORDER_CREATE_INTERNAL_ROLES = new Set<string>(["principal", "operation", "finance", "bd"]);

ordersRouter.post("/", async (c) => {
  const auth = c.var.auth;

  if (auth.role !== "dealer" && auth.role !== "salesperson" && auth.role !== "showroom" &&
      auth.role !== "principal" && auth.role !== "operation" &&
      auth.role !== "finance" && auth.role !== "bd") {
    throw new HTTPException(403, { message: "Role cannot create orders" });
  }
  if ((auth.role === "dealer" || auth.role === "salesperson" || auth.role === "showroom") && !auth.dealerId) {
    throw new HTTPException(403, { message: "Dealer scope missing on JWT" });
  }

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw new HTTPException(400, { message: "Body must be valid JSON" });
  }

  const parsed = createOrderInputSchema.safeParse(body);
  if (!parsed.success) {
    throw new HTTPException(400, {
      message: "Invalid order input: " + parsed.error.issues[0]?.message,
    });
  }
  // Effective dealer: a dealer/salesperson/showroom uses its OWN JWT dealer; an
  // internal role (principal/operation/finance/bd, no own dealer_id) uses the
  // picked body `dealerId`. The body field is honored ONLY when the JWT has no
  // dealer AND the role is internal — a dealer can never spoof another via body.
  const effectiveDealerId =
    auth.dealerId ??
    (ORDER_CREATE_INTERNAL_ROLES.has(auth.role) ? parsed.data.dealerId ?? null : null);
  if (!effectiveDealerId) {
    throw new HTTPException(403, {
      message: "An order needs a dealer to place it under — pick a dealer first",
    });
  }

  // Storage path guard: the wizard uploads attachments directly to Supabase
  // Storage with the user JWT before calling this endpoint. Storage RLS
  // gates the WRITE side (dealer can only upload to their own folder), but the
  // path string we receive here is just data — a malicious payload could point
  // at another dealer's folder. Without this check, an internal role rendering
  // the order detail (which has read-all on storage) would see an attachment
  // belonging to a different dealer. Reject any path outside the caller's
  // dealer folder before we persist it.
  const expectedPrefix = `orders-attachments/${effectiveDealerId}/`;
  if (!parsed.data.signaturePath.startsWith(expectedPrefix)) {
    throw new HTTPException(400, {
      message: "signaturePath must be inside your dealer folder",
    });
  }
  if (
    parsed.data.paymentSlipPath &&
    !parsed.data.paymentSlipPath.startsWith(expectedPrefix)
  ) {
    throw new HTTPException(400, {
      message: "paymentSlipPath must be inside your dealer folder",
    });
  }

  const sb = userClient(c.env, auth.jwt);

  // Server-side lead-time floor (mattress + bedframe = 14d, sofa = 21d). The
  // wizard's Step 3 picker already enforces this client-side, but a curl or
  // a third-party integration could still POST a sub-lead-time date. We
  // resolve the SKUs against product_models.category to find the longest
  // gating lead-time, then reject the request if the picked date is earlier
  // than today + that floor. TBD orders (delivery.date === null) skip — they
  // get gated again at POST /:id/date when the dealer confirms.
  if (parsed.data.delivery.date) {
    const skus = parsed.data.lines.map((l) => l.sku);
    const violation = await validateDeliveryLeadTime(sb, skus, parsed.data.delivery.date);
    if (violation) return c.json(leadTimeBody(violation), 422);
  }

  // 0185 (free items) — free-item-campaign claims + anti-tamper, FIRST. A line
  // the client marked `attrs.free_item={campaignId}` is re-validated against
  // ACTIVE free_item_campaigns (eligibility + qty ≤ max_free_qty); valid → its
  // unitPrice is FORCED to 0 + the marker canonicalised to `{campaignId,name}`
  // (the client price is never trusted), ineligible → 409 free_item_not_eligible
  // (NOT silently honored). ALSO strips any client-sent `attrs.free_gift` (gifts
  // are server-appended only, below). Runs before the sofa recompute so a forced-0
  // line is consistent through the rest of the pipeline. No claim + no marker →
  // byte-identical (DORMANT).
  const freeItem = await validateFreeItemClaims(sb, parsed.data.lines);
  if (freeItem.status === "server_error") {
    throw new HTTPException(500, { message: freeItem.message });
  }
  if (freeItem.status === "bad_request") {
    return c.json(
      {
        error: "rule_violation",
        code: "free_item_not_eligible",
        message: freeItem.message,
      },
      409,
    );
  }

  // 0186 (PWP / Promo) — STATELESS same-cart purchase-with-purchase + promo
  // apply. A reward line the salesperson toggled carries `attrs.pwp={ruleId}`;
  // we re-run the SAME pure `resolvePwp` against ACTIVE pwp_rules + the cart and,
  // for a genuinely-granted line, FORCE its unitPrice to the reward sku's
  // `product_skus.pwp_price` ('pwp') or 0 ('promo') + canonicalise the marker to
  // `{ruleId,type,triggerRef}` (the client price is never trusted). Runs AFTER
  // the free-item gate (on the free_gift-stripped lines) and BEFORE the sofa
  // recompute so (a) a sofa-build PWP claim is rejected cleanly (409
  // pwp_not_eligible_sofa_build — a build line is recomputed under an ABSOLUTE
  // drift gate) and (b) the forced reward price is the trusted base the
  // special-addon / delivery recomputes read. Ineligible / over-allowance /
  // unknown-rule → 409. No marker → byte-identical (DORMANT, no DB read).
  const pwp = await recomputePwpLines(sb, freeItem.lines);
  if (pwp.status === "server_error") {
    throw new HTTPException(500, { message: pwp.message });
  }
  if (pwp.status === "bad_request") {
    return c.json(
      {
        error: "rule_violation",
        code: pwp.code,
        message: pwp.message,
      },
      409,
    );
  }

  // 0187 (PWP VOUCHER STATE MACHINE) — Stage B, the parallel lineage/lock LEDGER.
  // P8b above is the PRICING authority (it already forced the reward unitPrice +
  // canonicalised attrs.pwp, carrying through code + claimGroup). Stage B is a
  // SEPARATE post-recompute step that CLAIMS the RESERVED voucher each priced
  // reward line references (RESERVED→USED, atomic, bound to the SAME rule that
  // priced it + a per-submit claimGroup correlation uuid). The code NEVER sets a
  // price (§4.6) — it is a status row in pwp_codes + a string on attrs.pwp.
  // userClient/RLS + the SECURITY DEFINER pwp_claim_code / pwp_release_codes RPCs
  // only — NEVER service_role. DORMANT: no line carries attrs.pwp.code → ZERO DB
  // call → claimedPwpCodes=[] → every rollback below is a no-op → byte-identical.
  // P8d (§4.2): pass the order's customer phone so a CROSS-order claim
  // (attrs.pwp.crossOrder=true) can assert the phone binding in the DEFINER RPC.
  // A same-cart claim ignores it (byte-identical to P8c).
  const pwpClaim = await claimPwpCodesForLines(sb, { id: auth.id }, pwp.lines, parsed.data.customer.phone);
  if (pwpClaim.status === "server_error") {
    throw new HTTPException(500, { message: pwpClaim.message });
  }
  if (pwpClaim.status === "bad_request") {
    return c.json(
      {
        error: "rule_violation",
        code: pwpClaim.code,
        message: pwpClaim.message,
      },
      409,
    );
  }
  // The rollback ledger for EVERY downstream post-claim early-exit (§4.5). The
  // ledger records each code's MODE (same-cart vs cross-order) so the rollback
  // restores it to its CORRECT prior state: same-cart USED→RESERVED via
  // `pwp_release_codes` (owner); cross-order USED→AVAILABLE via
  // `pwp_release_available_code` (DEFINER, allowlist + claim_group bound — a
  // committed-stamped code is NOT releasable there). Empty ledger → no RPC.
  const claimedPwpCodes = pwpClaim.claimed.map((cc) => cc.code);
  const ownPwpCodes = pwpClaim.claimed.filter((cc) => !cc.crossOrder).map((cc) => cc.code);
  const crossPwpCodes = pwpClaim.claimed.filter((cc) => cc.crossOrder).map((cc) => cc.code);
  const pwpClaimGroup = pwpClaim.claimGroup;
  const rollbackPwpClaims = async (): Promise<void> => {
    if (ownPwpCodes.length > 0) await sb.rpc("pwp_release_codes", { p_codes: ownPwpCodes });
    if (crossPwpCodes.length > 0 && pwpClaimGroup) {
      await sb.rpc("pwp_release_available_code", { p_codes: crossPwpCodes, p_claim_group: pwpClaimGroup });
    }
  };

  // Phase 4 (sofa engine) — server recompute + 0.5% drift-reject for any sofa
  // BUILD line (one carrying `attrs.sofa_build`). The client price is a preview;
  // we re-run the SAME pure `computeSofaPrice` against FRESH DB catalog prices.
  // Mismatch > 0.5% → 422 (anti-fudge); within → the build line is EXPLODED into
  // one real per-compartment line (Phase 5), summing to the authoritative server
  // total. Non-build lines pass through verbatim; `create_order` + `order_lines`
  // stay UNCHANGED — the RPC just inserts the (possibly expanded) line set.
  // NOTE: sofa recompute runs on `pwpClaim.lines` (=== pwp.lines — price + attrs
  // untouched by Stage B). The P8c carry-through left `attrs.pwp.code`/`claimGroup`
  // on coded lines, so they persist into create_order's payload.lines.
  const recompute = await recomputeAndExplodeSofaBuildLines(sb, pwpClaim.lines);
  if (recompute.status === "bad_request") {
    await rollbackPwpClaims(); // exit 1 (§4.5)
    throw new HTTPException(400, { message: recompute.message });
  }
  if (recompute.status === "server_error") {
    await rollbackPwpClaims(); // exit 2 (§4.5)
    throw new HTTPException(500, { message: recompute.message });
  }
  if (recompute.status === "drift") {
    await rollbackPwpClaims(); // exit 3 (§4.5)
    return c.json(
      {
        error: "rule_violation",
        code: "sofa_price_drift",
        message:
          `Sofa price mismatch on '${recompute.drift.lineSku}': client RM ` +
          `${recompute.drift.clientTotal.toFixed(2)} vs server RM ` +
          `${recompute.drift.serverTotal.toFixed(2)}. Please rebuild and retry.`,
        clientTotal: recompute.drift.clientTotal,
        serverTotal: recompute.drift.serverTotal,
      },
      422,
    );
  }

  // 0181 (special add-ons) — honest-pricing trust gate. Any line carrying
  // `attrs.specials` has its surcharge re-resolved against FRESH active defs; a
  // retired code or a >0.5% (min RM0.01) drift rejects the POST. On pass the
  // line's unitPrice is nudged to the server total + attrs.specials canonicalised.
  // Runs on the post-sofa line set; sofa-exploded lines carry no specials so they
  // pass through. create_order / order_lines stay UNCHANGED.
  const specialRecompute = await recomputeSpecialAddonLines(sb, recompute.lines);
  if (specialRecompute.status === "bad_request") {
    await rollbackPwpClaims(); // exit 4 (§4.5)
    throw new HTTPException(400, { message: specialRecompute.message });
  }
  if (specialRecompute.status === "server_error") {
    await rollbackPwpClaims(); // exit 5 (§4.5)
    throw new HTTPException(500, { message: specialRecompute.message });
  }
  if (specialRecompute.status === "drift") {
    await rollbackPwpClaims(); // exit 6 (§4.5)
    return c.json(
      {
        error: "rule_violation",
        code: "special_price_drift",
        message:
          `Special add-on price mismatch on '${specialRecompute.drift.lineSku}': client RM ` +
          `${specialRecompute.drift.clientTotal.toFixed(2)} vs server RM ` +
          `${specialRecompute.drift.serverTotal.toFixed(2)}. Please reconfigure and retry.`,
        clientTotal: specialRecompute.drift.clientTotal,
        serverTotal: specialRecompute.drift.serverTotal,
      },
      422,
    );
  }

  // 0185 (default free gifts) — DETERMINISTIC server-appended RM0 lines. Runs
  // AFTER the special-addon recompute (on the post-sofa-explode set) and BEFORE
  // the delivery recompute. The server runs the SAME pure resolver the POS preview
  // used (NO client claim — gifts are server-authoritative) and APPENDS one RM0
  // order_line per resolved gift (a real accessory sku, `attrs.free_gift`). A
  // misconfigured gift (giftSku not a real product_skus row) is fail-SOFT (logged
  // + omitted). DORMANT (no gift configured) → returns nothing → byte-identical.
  const giftResult = await resolveDefaultFreeGiftLines(sb, specialRecompute.lines);
  if (giftResult.status === "server_error") {
    await rollbackPwpClaims(); // exit 7 (§4.5)
    throw new HTTPException(500, { message: giftResult.message });
  }
  // The fully-verified line set fed to create_order: paid/freed lines + appended
  // RM0 gift lines. No-funding: gift + free-item lines are EXCLUDED from the
  // delivery charged-category set inside recomputeDeliveryFee.
  const finalLines = [...specialRecompute.lines, ...giftResult.lines];

  // 0184 (delivery TRIP fee) — server-authoritative recompute. Re-runs the pure
  // `computeDeliveryFee` against FRESH delivery_fee_config + active
  // special_delivery_fee_rules + the cart's real categories, and APPENDS the
  // delivery order_addons (DELIVERY / DELIVERY_CROSS / DELIVERY_ADD) for any
  // component > 0. The only client-trusted values are additionalDeliveryFee +
  // crossCategorySourceSo. The floor STAIR surcharge coexists (ADDITIVE).
  // Dormant (0-rate config) → zero components → no addon appended → totals stay
  // byte-identical. A bad cross-order link → 400 (order NOT created); a catalog
  // read error → 500 (fail-closed). create_order / order_lines stay UNTOUCHED —
  // the delivery addons just ride the existing payload.addons[] path. Free lines
  // (free_gift / free_item) never contribute a delivery charge (no-funding).
  const deliveryRecompute = await recomputeDeliveryFee(sb, finalLines, {
    additionalDeliveryFee: parsed.data.additionalDeliveryFee ?? 0,
    crossCategorySourceSo: parsed.data.crossCategorySourceSo ?? null,
    customerPhone: parsed.data.customer.phone,
  });
  if (deliveryRecompute.status === "bad_request") {
    await rollbackPwpClaims(); // exit 8 (§4.5)
    throw new HTTPException(400, { message: deliveryRecompute.message });
  }
  if (deliveryRecompute.status === "server_error") {
    await rollbackPwpClaims(); // exit 9 (§4.5)
    throw new HTTPException(500, { message: deliveryRecompute.message });
  }

  // 0184 honest-pricing — the delivery fee is SERVER-authoritative. Strip any
  // client-sent delivery addon (DELIVERY / DELIVERY_CROSS / DELIVERY_ADD) BEFORE
  // merging, so the charge comes SOLELY from the server recompute above — a
  // tampered client cannot inject or pre-empt a delivery line.
  const DELIVERY_ADDON_KEYS = new Set(["DELIVERY", "DELIVERY_CROSS", "DELIVERY_ADD"]);
  const clientAddons = parsed.data.addons.filter((a) => !DELIVERY_ADDON_KEYS.has(a.addonKey));

  // Feed the fully-verified line set (sofa-exploded + special-checked + freed
  // items + appended RM0 gifts) + the appended delivery addons into the RPC.
  const payload = Adapters.orderInputToRpcPayload(
    {
      ...parsed.data,
      lines: finalLines,
      addons: [...clientAddons, ...deliveryRecompute.addons],
    },
    effectiveDealerId,
  );
  const { data: created, error } = await sb.rpc("create_order", { payload });
  if (error) {
    // exit 10 (§4.5) — the create_order TX rolled back, so the claimed voucher
    // codes must un-claim. Placed as the FIRST line of the error block so ALL FOUR
    // sub-exits below (403 throw / mixed_category_lines 422 return / 400 throw /
    // 500 throw) inherit the rollback before any branch runs.
    await rollbackPwpClaims();
    // 42501 = manual cross-dealer check inside the RPC. We map to 403 so the
    // client sees the same code as RLS-denied reads.
    if (error.code === "42501" || /forbidden/i.test(error.message ?? "")) {
      throw new HTTPException(403, { message: "Forbidden" });
    }
    if (error.code === "22023") {
      // Loo 2026-05-11 (migration 0089) — surface the new category mutex
      // detail to the client as a typed code so the UI can toast a friendly
      // message instead of the raw RPC error string. Other 22023s stay on
      // the generic 400 path (pre-existing contract).
      const detail = (error as { details?: string }).details;
      if (detail === "mixed_category_lines") {
        return c.json(
          {
            error: "rule_violation",
            code: "mixed_category_lines",
            message: "Sofa cannot mix with mattress or bed frame in the same order. Please place them as separate Sales Orders.",
          },
          422,
        );
      }
      throw new HTTPException(400, { message: error.message });
    }
    throw new HTTPException(500, { message: error.message });
  }

  const id = (created as { id: string } | null)?.id;
  if (!id) {
    await rollbackPwpClaims(); // exit 11 (§4.5)
    throw new HTTPException(500, { message: "RPC did not return an order id" });
  }

  // 0187/0188 (PWP VOUCHER) — the CONFIRM-PASS, now in TWO independent blocks
  // (P8d §3.1, the BLOCKER fix). At claim time the order had no id (create_order
  // DB-generates it — a caller-minted id can't be threaded in without touching the
  // RPC), so each claimed code is USED with redeemed_order_id NULL but claim_group
  // SET (the interim join key). Now the id is known.
  let carryForwardWarning: string | undefined;

  // BLOCK 1 — STAMP redeemed_order_id on the codes THIS submit claimed (own +
  // cross-order). Runs ONLY when a reward was actually claimed. Via the DEFINER
  // `pwp_stamp_redeemed` (code-allowlist bound) so it reaches a NON-owned cross-
  // order USED code the owner-scoped table UPDATE could not (§4.4). FAIL-CLOSED:
  // a stamp error OR a short row (fewer stamped than claimed) → release the claims
  // + 500 (the order committed but the lock record is inconsistent → clean retry).
  if (claimedPwpCodes.length > 0 && pwpClaimGroup) {
    const { data: stampedN, error: stampErr } = await sb.rpc("pwp_stamp_redeemed", {
      p_codes: claimedPwpCodes,
      p_claim_group: pwpClaimGroup,
      p_order_id: id,
    });
    if (stampErr) {
      await rollbackPwpClaims();
      throw new HTTPException(500, {
        message: "Order created but PWP code stamp failed; please retry.",
      });
    }
    if ((typeof stampedN === "number" ? stampedN : 0) < claimedPwpCodes.length) {
      await rollbackPwpClaims();
      throw new HTTPException(500, {
        message: "Order created but PWP code stamp incomplete; please retry.",
      });
    }
  }

  // BLOCK 2 (HOISTED OUT of the claims guard, §3.1) — the CARRY-FORWARD / DELETE
  // SWEEP. Runs whenever the caller has ANY unclaimed RESERVED codes to dispose
  // of, INDEPENDENT of whether a reward was claimed — so the headline scenario
  // (buy a trigger, claim NOTHING this cart, carry a voucher to the next order)
  // fires reliably. The in-scope RESERVED set is SERVER-DERIVED from the order's
  // own trigger lines (`finalLines`), NOT the client `pwpCartLineKeys` hint (which
  // is UNION'd as a belt). For each: active+carry rule + a captured phone → flip
  // RESERVED→AVAILABLE bound to the customer (P8d); else DELETE (P8c). DORMANT: 0
  // RESERVED rows → one indexed 0-row read, no write. A sweep failure does NOT
  // roll back the COMMITTED order (the dangling RESERVED codes are harmless /
  // reaper-cleaned) — log + continue, mirroring the post-commit "don't punish the
  // client" philosophy.
  const sweep = await sweepReservedForSubmit(sb, {
    ownerStaffId: auth.id,
    ownerDealerId: effectiveDealerId,
    orderId: id,
    customerPhone: parsed.data.customer.phone,
    finalLines,
    clientCartLineKeys: parsed.data.pwpCartLineKeys ?? [],
  });
  if (sweep.status === "server_error") {
    console.error("pwp carry-forward sweep failed (non-fatal):", sweep.message);
  } else if (sweep.softWarning) {
    // A would-carry voucher was dropped for lack of a captured phone — surface it
    // (response header, below) so the salesperson can re-capture + redeem manually.
    carryForwardWarning = sweep.softWarning;
  }

  // Compose full response — same shape as GET /:id (lines + addons + history).
  // exit 12 (§4.5): a re-fetch failure here does NOT rollback — the order
  // COMMITTED and the Confirm-pass already stamped the codes; only the 201
  // response failed. The codes stay USED + stamped (correct); the client re-GETs.
  const { data: full, error: fetchErr } = await sb
    .from("orders")
    .select("*, order_lines(*), order_addons(*), order_history(*)")
    .eq("id", id)
    .maybeSingle();
  if (fetchErr) throw new HTTPException(500, { message: fetchErr.message });
  if (!full) throw new HTTPException(500, { message: "Order created but not readable" });

  const row = full as DB.OrderRow & {
    order_lines?: DB.OrderLineRow[];
    order_addons?: DB.OrderAddonRow[];
    order_history?: DB.OrderHistoryRow[];
  };
  const order = Adapters.orderFromRow(row, {
    lines: row.order_lines ?? [],
    addons: row.order_addons ?? [],
    history: row.order_history ?? [],
  });
  // P8d (§3.3): surface the carry-forward soft-warning as a RESPONSE HEADER (NOT a
  // body field — the 201 body stays a bare `orderSchema` so the POS parse is byte-
  // identical). The POS reads the header to toast "N earned voucher(s) were not
  // saved — capture the customer's phone to keep them." Absent on every other order.
  if (carryForwardWarning) {
    c.header("X-Pwp-Carry-Forward-Warning", encodeURIComponent(carryForwardWarning));
  }
  return c.json(orderSchema.parse(order), 201);
});

// ---------------------------------------------------------------------------
// AutoCount import door — POST /api/orders/import
// Contract: docs/autocount-import-contract.md. Mirrors create_order's table
// writes via the sibling RPC import_autocount_order (migration 0132).
// create_order is NOT reused (requires wizard-only fields; can't store the
// AutoCount Ref/PO# the idempotency key needs).
// ---------------------------------------------------------------------------

/** Split a combined Ref ("TCF0282/CR1009", "TCF0282 + CR1009") → sorted uniq. */
function normalizeRefs(ref: string): string[] {
  return Array.from(
    new Set(
      ref
        .split(/[/+,]/)
        .map((r) => r.trim().toUpperCase())
        .filter((r) => r.length > 0),
    ),
  ).sort();
}

const CORE_ITEM_RE = /mattress|bed ?fram|sofa/i;
function isCoreItem(itemGroup: string): boolean {
  return CORE_ITEM_RE.test(itemGroup);
}

/** §5: CR = Carres PJ Showroom → showroom channel; everything else dealer. */
function deriveChannel(refs: string[]): string {
  return refs.some((r) => r.startsWith("CR")) ? "showroom" : "dealer";
}

function buildAddress(row: {
  addr1?: string | null;
  addr2?: string | null;
  addr3?: string | null;
  addr4?: string | null;
  deliveryLocation?: string | null;
}): string | null {
  const parts = [row.addr1, row.addr2, row.addr3, row.addr4, row.deliveryLocation]
    .map((p) => (p ?? "").trim())
    .filter((p) => p.length > 0);
  return parts.length > 0 ? parts.join(", ") : null;
}

/** "RM3322 Paid" → 3322; "RM874" / "" → 0 (treated as outstanding). */
function parsePaid(balance?: string | null | undefined): number {
  if (!balance || !/paid/i.test(balance)) return 0;
  const m = balance.replace(/,/g, "").match(/RM\s*(\d+(?:\.\d+)?)/i);
  return m ? Number(m[1]) : 0;
}

/**
 * SKU resolution: AutoCount Description → portal Item Code, via
 * product_skus.variant (which migration 0133 seeded with the AutoCount
 * Description text). The lookup is a single batched SELECT before the
 * per-order loop, so the per-row resolve becomes a Map.get.
 *
 * Lines whose description is not in product_skus.variant fall back to
 * storing the raw description as sku, and core items (mattress/bedframe/
 * sofa) are flagged in the import report so operation can reconcile.
 */
/**
 * AutoCount appends a colorway suffix to the Detail Description that the
 * product catalog (product_skus.variant) does NOT store — e.g. AutoCount
 * sends `Muro DSL8019/30"(3 Seater)/Col:NINJA-02` but the catalog row is
 * just `Muro DSL8019/30"(3 Seater)` and the color is encoded in the
 * sibling `sku` (Item Code). Stripping the trailing color clause restores
 * an exact match on the model+seater portion.
 *
 * Heuristic only — we look for the FIRST `/` followed by a known color
 * marker (`COLOUR` / `Col:` / fabric codes like `M2402-`, `PC151-`,
 * `KN390-`, `HR805-`, named colors). False positives are harmless: if the
 * stripped string also fails to match we proceed to model-family
 * fallback (Layer 3 in `buildSkuResolver`).
 */
const COLOR_SUFFIX_RE =
  /\s*\/(?:\s*)(?:COLOUR|COLOR|Col:|COL:|col:|M\d{3,}|PC\s?\d{3,}|KN\d{3,}|HR\d{3,}|BL\d{2,}|RD\d{2,}|EO\d{2,}|Ninja|NINJA|Eleganz|Garfield|GARFIELD|Fossil|FOSSIL|Pearl|PEARL|Sand|SAND|Forest|FOREST|Light\s|Lighty\s|Metal|METAL|Tundora|TUNDORA|Cheron)/;
function stripColorSuffix(s: string): string {
  const m = s.match(COLOR_SUFFIX_RE);
  return m && m.index !== undefined ? s.slice(0, m.index).trim() : s;
}

/**
 * Extract a model identifier from an AutoCount description for Layer 3
 * model-family lookup. The identifier is the *model + width/size* prefix
 * shared across every seater + colorway variant of that supplier model.
 *
 * Examples:
 *   `HK5531/28"(2+L Seater)/COLOUR NINJA 08`  → `HK5531/28"`
 *   `Muro DSL8019/30"(3 Seater)`               → `Muro DSL8019/30"`
 *   `1013Jager/Fab3-Queen/PC151-01`            → `1013Jager/Fab3-Queen`
 *   `FORTE-L1202F-Q`                           → `FORTE-L1202F-Q` (whole string)
 *
 * Rule: cut at the first `(` if present (sofa seater paren); else cut at
 * the second `/` if there are 3+ slashes (bedframe `Model/Fab/Color`);
 * else return as-is (mattress / single-token sku).
 */
function extractModelIdentifier(desc: string): string {
  const noColor = stripColorSuffix(desc);
  const parenIdx = noColor.indexOf("(");
  if (parenIdx > 0) return noColor.slice(0, parenIdx).trim();
  const parts = noColor.split("/");
  if (parts.length > 2) return parts.slice(0, 2).join("/").trim();
  return noColor.trim();
}

/**
 * Layer-4 model token — looser than `extractModelIdentifier`. We drop the
 * width/size segment as well, keeping only the FIRST `/`-separated token.
 * Catches AutoCount sending a width the catalog doesn't carry (e.g.
 * `SF03-HK5535/32"` when catalog has only `/24"` and `/30"`) or a slightly
 * malformed model+seater spec (`SF02-DSL9038/30"/ "(2 Seater)`).
 *
 *   `SF03-HK5535/32"(3 Seater)`          → `SF03-HK5535`
 *   `SF02-DSL9038/30"/ "(2 Seater)`      → `SF02-DSL9038`
 *   `Muro DSL8019/30"(2 Seater)`         → `Muro DSL8019`
 *   `1013Jager/Fab3-Queen`               → `1013Jager`
 *   `FORTE-L1202F-Q`                     → `FORTE-L1202F-Q` (no slash to cut)
 */
function extractModelToken(desc: string): string {
  const noColor = stripColorSuffix(desc);
  const parenIdx = noColor.indexOf("(");
  const modelId =
    parenIdx > 0 ? noColor.slice(0, parenIdx).trim() : noColor.trim();
  const firstSlash = modelId.indexOf("/");
  return firstSlash > 0 ? modelId.slice(0, firstSlash).trim() : modelId.trim();
}

/**
 * Pick the catalog variant that best represents the AutoCount description
 * within its model family. Prefer matching seater config (e.g. `(2 Seater)`
 * — by exact paren content first, then by seater number). Falls back to
 * the alphabetically first candidate so the result is deterministic.
 */
function pickBestModelCandidate(
  desc: string,
  candidates: string[],
): string | null {
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  const seaterMatch = desc.match(/\(([^)]+)\)/);
  if (seaterMatch) {
    const desiredSeater = seaterMatch[1].toLowerCase().trim();
    const exact = candidates.find((c) => {
      const m = c.match(/\(([^)]+)\)/);
      return m && m[1].toLowerCase().trim() === desiredSeater;
    });
    if (exact) return exact;

    const numMatch = desiredSeater.match(/^(\d+)/);
    if (numMatch) {
      const numSeater = candidates.find((c) =>
        c.toLowerCase().includes(`(${numMatch[1]} seater)`),
      );
      if (numSeater) return numSeater;
    }
  }
  return [...candidates].sort()[0];
}

/**
 * Paginate `product_skus` (PostgREST defaults to a 1000-row cap so we
 * walk through `.range()` until a short page comes back). Returns the
 * full catalog snapshot used for in-memory matching.
 */
async function loadAllCatalogRows(
  sb: ReturnType<typeof userClient>,
): Promise<Array<{ sku: string; variant: string }>> {
  const PAGE = 1000;
  const all: Array<{ sku: string; variant: string }> = [];
  let offset = 0;
  // Hard ceiling to prevent an unbounded loop if the catalog explodes.
  for (let i = 0; i < 20; i++) {
    const { data, error } = await sb
      .from("product_skus")
      .select("sku, variant")
      .range(offset, offset + PAGE - 1);
    if (error || !data) break;
    all.push(...(data as Array<{ sku: string; variant: string }>));
    if (data.length < PAGE) break;
    offset += PAGE;
  }
  return all;
}

async function buildSkuResolver(
  sb: ReturnType<typeof userClient>,
  descriptions: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (descriptions.length === 0) return map;

  // 2026-06-04 — Loo's listing exposed that AutoCount sofa specs explode
  // into per-colorway descriptions (`HK5531/28"(2+L Seater)/COLOUR NINJA 08`)
  // while the catalog only stores model+seater (`HK5531/28"(2 Seater)`).
  // Enumerating every colorway in the catalog is impractical, so the
  // resolver is now a 4-layer cascade keyed on the original description:
  //   1. exact match
  //   2. color-stripped match (drops `/COLOUR..`, `/Col:..`, `/M2402-..` …)
  //   3. model-family match — same model identifier (model + width) +
  //      best-fit seater (preserves supplier routing when the colorway
  //      isn't in the catalog).
  //   4. model-token match — same model TOKEN (drops width too) + best-fit
  //      seater. Catches AutoCount sending a width the catalog doesn't
  //      carry (`SF03-HK5535/32"` when catalog has only `/24"` + `/30"`)
  //      or a malformed spec (`SF02-DSL9038/30"/ "(2 Seater)`).
  // One subrequest reads the whole catalog (~1k rows) so all four layers
  // run in memory.
  const catalog = await loadAllCatalogRows(sb);
  if (catalog.length === 0) return map;

  const byVariant = new Map<string, string>();
  for (const row of catalog) byVariant.set(row.variant, row.sku);

  for (const d of descriptions) {
    // Layer 1: exact match on the raw AutoCount description.
    const exact = byVariant.get(d);
    if (exact) {
      map.set(d, exact);
      continue;
    }
    // Layer 2: drop the AutoCount colorway suffix and try again.
    const stripped = stripColorSuffix(d);
    if (stripped !== d) {
      const sFromStripped = byVariant.get(stripped);
      if (sFromStripped) {
        map.set(d, sFromStripped);
        continue;
      }
    }
    // Layer 3: model-family — pick a catalog row whose variant starts with
    // the full model identifier (model + width). Skip super-short
    // identifiers to avoid generic-word collisions.
    const modelId = extractModelIdentifier(stripped);
    if (modelId.length >= 4) {
      const layer3Candidates = catalog
        .filter((c) => c.variant.startsWith(modelId))
        .map((c) => c.variant);
      if (layer3Candidates.length > 0) {
        const best = pickBestModelCandidate(stripped, layer3Candidates);
        if (best) {
          const sku = byVariant.get(best);
          if (sku) {
            map.set(d, sku);
            continue;
          }
        }
      }
    }
    // Layer 4: model-token — drop the width segment too. Only run when the
    // token is shorter than the identifier (i.e. there's actually a slash
    // to cut on); same min-length guard.
    const modelToken = extractModelToken(stripped);
    if (modelToken.length < 4 || modelToken === modelId) continue;
    const layer4Candidates = catalog
      .filter((c) => c.variant.startsWith(modelToken))
      .map((c) => c.variant);
    if (layer4Candidates.length === 0) continue;
    const best4 = pickBestModelCandidate(stripped, layer4Candidates);
    if (best4) {
      const sku = byVariant.get(best4);
      if (sku) map.set(d, sku);
    }
  }
  return map;
}

ordersRouter.post("/import", async (c) => {
  const auth = c.var.auth;
  if (auth.role !== "operation" && auth.role !== "principal") {
    throw new HTTPException(403, { message: "Import is operation/principal only" });
  }

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw new HTTPException(400, { message: "Body must be valid JSON" });
  }

  const parsed = autocountImportInput.safeParse(body);
  if (!parsed.success) {
    // Surface zod's path alongside the message — without it ops sees the
    // useless "String must contain at least 1 character(s)" with no hint as to
    // which row or field. Real-world trigger: AutoCount exports a discount
    // line with a blank `Item Group` cell; the path now reads
    // "Invalid import input at rows.148.itemGroup: ..." so the bad CSV cell is
    // immediately findable. (2026-06-04 — Loo 192-row listing 4 jun 26.csv)
    const issue = parsed.error.issues[0];
    const path = issue && issue.path.length > 0 ? issue.path.join(".") : "<root>";
    throw new HTTPException(400, {
      message: `Invalid import input at ${path}: ${issue?.message ?? "validation failed"}`,
    });
  }
  let { dealerId, sourceSystem, rows } = parsed.data;

  // Auto-resolve dealer when caller omits it (operation role doesn't pick one).
  if (!dealerId) {
    const { data: dealerRow, error: dealerErr } = await adminClient(c.env)
      .from("dealers")
      .select("id")
      .order("name")
      .limit(1)
      .single();
    if (dealerErr || !dealerRow) {
      throw new HTTPException(500, { message: "No dealer account found — create one first." });
    }
    dealerId = dealerRow.id as string;
  }

  // Group rows into orders by normalized Ref set.
  const groups = new Map<string, { sourceRef: string[]; rows: typeof rows }>();
  for (const row of rows) {
    const refs = normalizeRefs(row.ref);
    if (refs.length === 0) continue;
    const key = refs.join("|");
    let g = groups.get(key);
    if (!g) {
      g = { sourceRef: refs, rows: [] };
      groups.set(key, g);
    }
    g.rows.push(row);
  }

  const sb = userClient(c.env, auth.jwt);

  // One batched catalog read: resolve every distinct description in the batch.
  const distinctDescriptions = Array.from(
    new Set(rows.map((r) => r.detailDescription.trim())),
  );
  const skuByDesc = await buildSkuResolver(sb, distinctDescriptions);

  // Phase 1 (in-memory, no subrequests): build one payload per grouped order
  // and keep the per-group unmatched-SKU metadata so we can zip it back by
  // index after the batch RPC returns.
  const payloads: unknown[] = [];
  const groupMeta: Array<{ sourceRef: string[]; unmatched: string[] }> = [];

  for (const g of groups.values()) {
    const first = g.rows[0];
    const unmatched: string[] = [];
    const lines = g.rows.map((r) => {
      const desc = r.detailDescription.trim();
      const resolved = skuByDesc.get(desc) ?? null;
      if (!resolved && isCoreItem(r.itemGroup)) unmatched.push(desc);
      return {
        sku: resolved ?? desc,
        qty: r.qty,
        attrs: null,
        unit_price: 0, // listing carries no price; financials stay in AutoCount
        source_po: r.poDocNo ?? null,
      };
    });

    payloads.push({
      dealer_id: dealerId,
      source_system: sourceSystem,
      source_ref: g.sourceRef,
      channel: deriveChannel(g.sourceRef),
      customer_name: first.debtorName,
      customer_phone: first.phone ?? null,
      customer_address: buildAddress(first),
      customer_address_unknown: false,
      delivery_date: first.deliveryDate ?? null,
      delivery_date_tbd: !first.deliveryDate,
      paid: parsePaid(first.balance),
      lines,
    });
    groupMeta.push({ sourceRef: g.sourceRef, unmatched });
  }

  // Phase 2 (ONE subrequest): the whole batch goes to Postgres in a single
  // import_autocount_orders RPC. It loops server-side — each order in its own
  // subtransaction — and returns a per-order result array IN INPUT ORDER. This
  // keeps the Worker at a CONSTANT 2 subrequests (catalog read + this call)
  // regardless of how many orders the listing has, so the Cloudflare Free-plan
  // 50-subrequest cap can no longer truncate a large import. (migration 0143)
  const results: AutocountImportResult[] = [];

  if (payloads.length > 0) {
    const { data, error } = await sb.rpc("import_autocount_orders", { payloads });
    if (error) {
      // The batch call itself failed (e.g. role gate / transport). Report every
      // grouped order as errored rather than 500-ing the whole import.
      for (const m of groupMeta) {
        results.push({
          sourceRef: m.sourceRef,
          result: "error",
          orderId: null,
          so: null,
          unmatchedDescriptions: m.unmatched,
          error: error.message,
        });
      }
    } else {
      const rows = (data ?? []) as Array<{
        id: string | null;
        so: number | null;
        // 0135 adds 'updated_items_locked'; 0143 batch adds per-order 'error'.
        result:
          | "created"
          | "updated"
          | "updated_items_locked"
          | "skipped_locked"
          | "error";
        error?: string | null;
      }>;
      groupMeta.forEach((m, i) => {
        const d = rows[i];
        if (!d) {
          results.push({
            sourceRef: m.sourceRef,
            result: "error",
            orderId: null,
            so: null,
            unmatchedDescriptions: m.unmatched,
            error: "no result returned for this order",
          });
          return;
        }
        results.push({
          sourceRef: m.sourceRef,
          result: d.result,
          orderId: d.id,
          so: d.so,
          unmatchedDescriptions: m.unmatched,
          error: d.error ?? null,
        });
      });
    }
  }

  const resp = {
    ordersTotal: results.length,
    created: results.filter((r) => r.result === "created").length,
    // Counts bucket 'updated' + 'updated_items_locked' together — per-row
    // detail in `results[].result` preserves the distinction for the UI.
    updated: results.filter(
      (r) => r.result === "updated" || r.result === "updated_items_locked",
    ).length,
    skippedLocked: results.filter((r) => r.result === "skipped_locked").length,
    errored: results.filter((r) => r.result === "error").length,
    results,
  };
  return c.json(autocountImportResponseSchema.parse(resp));
});

/**
 * POST /api/orders/:id/accept-autocount-items — one-shot unlock for the
 * portal-wins-AutoCount guard. Clears `orders.items_edited`, so the next
 * AutoCount re-import REPLACES the order's items array with AutoCount's
 * version (instead of preserving the portal-edited one).
 *
 * Use when AutoCount has the truer items list (e.g. customer changed
 * configuration after order, ops's earlier edit is now stale).
 *
 * Allowed: operation, principal (mirrors /import gate). Only valid while
 * the order is at status='place' — past that, items are frozen anyway by
 * the proceed flow.
 */
ordersRouter.post("/:id/accept-autocount-items", async (c) => {
  const auth = c.var.auth;
  if (auth.role !== "operation" && auth.role !== "principal") {
    throw new HTTPException(403, { message: "Operation or principal only" });
  }
  const id = c.req.param("id");
  const sb = userClient(c.env, auth.jwt);
  const { data, error } = await sb
    .from("orders")
    .update({ items_edited: false, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "place")
    .select("id, items_edited")
    .maybeSingle();
  if (error) throw new HTTPException(500, { message: error.message });
  if (!data) {
    throw new HTTPException(404, {
      message: "Order not found, not at status='place', or RLS-hidden",
    });
  }
  return c.json({ id: data.id, items_edited: data.items_edited });
});

/**
 * POST /api/orders/:id/ops-assign — set/clear orders.ops_assigned_logistic
 * (migration 0136). The Inbox triage step: operation picks which logistic
 * partner (NETS / TSDD / AL / HOUZS) will handle this AutoCount-imported
 * order. Pass deliveryPartnerId=null to clear (returns the order to Inbox).
 *
 * Operation OR principal only. Scoped to status='place' — past that, the
 * formal proceed/assign flow owns delivery_partner_id and this triage
 * column becomes purely historical.
 */
ordersRouter.post("/:id/ops-assign", async (c) => {
  const auth = c.var.auth;
  if (auth.role !== "operation" && auth.role !== "principal") {
    throw new HTTPException(403, { message: "Operation or principal only" });
  }
  const id = c.req.param("id");

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw new HTTPException(400, { message: "Body must be valid JSON" });
  }
  const parsed = setOpsAssignedLogisticInputSchema.safeParse(body);
  if (!parsed.success) {
    throw new HTTPException(400, {
      message: "Invalid ops-assign input: " + parsed.error.issues[0]?.message,
    });
  }

  const sb = userClient(c.env, auth.jwt);
  const { data, error } = await sb
    .from("orders")
    .update({
      ops_assigned_logistic: parsed.data.deliveryPartnerId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("status", "place")
    .select("id, ops_assigned_logistic")
    .maybeSingle();
  if (error) throw new HTTPException(500, { message: error.message });
  if (!data) {
    throw new HTTPException(404, {
      message: "Order not found, not at status='place', or RLS-hidden",
    });
  }
  return c.json({
    id: data.id,
    ops_assigned_logistic: data.ops_assigned_logistic,
  });
});

/**
 * Storage path → signed URL with 1h TTL. Persisted column stores
 * `orders-attachments/{dealer_id}/{wizard_uuid}/file.ext`; createSignedUrl
 * wants the path *within* the bucket, so we strip the bucket prefix.
 *
 * Returns null when the input is null or the path doesn't begin with the
 * expected bucket. We never reveal whether an unsigned path was malformed
 * vs. genuinely missing — the caller just sees a missing URL field, same
 * as if the dealer never uploaded one.
 */
const ATTACHMENTS_BUCKET = "orders-attachments";
const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 hour

async function signAttachment(
  sb: ReturnType<typeof userClient>,
  pathWithBucket: string | null,
): Promise<string | null> {
  if (!pathWithBucket) return null;
  const prefix = `${ATTACHMENTS_BUCKET}/`;
  if (!pathWithBucket.startsWith(prefix)) return null;
  const objectKey = pathWithBucket.slice(prefix.length);
  const { data, error } = await sb.storage
    .from(ATTACHMENTS_BUCKET)
    .createSignedUrl(objectKey, SIGNED_URL_TTL_SECONDS);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

/**
 * Compute the same totalAmount the list endpoint exposes (line + addon, no
 * stair). Detail + proceed responses include this so client-side helpers
 * (`proceedBlockers`, action panel) read the same value across views without
 * re-summing nested arrays.
 */
function computeTotalFromLines(
  lines: Array<{ unit_price: string | number; qty: number }> | undefined,
  addons: Array<{ unit_price: string | number; qty: number }> | undefined,
): number {
  const lineTotal = (lines ?? []).reduce(
    (s, l) => s + Number(l.unit_price) * l.qty,
    0,
  );
  const addonTotal = (addons ?? []).reduce(
    (s, a) => s + Number(a.unit_price) * a.qty,
    0,
  );
  return lineTotal + addonTotal;
}

/**
 * Re-fetch an order with its rels, sign attachment URLs, attach totalAmount,
 * and return a fully-shaped Order JSON. Used by every mutation route
 * (create / proceed / top-up / address / date / edit) so callers always get
 * the same shape they would from GET /:id.
 *
 * Throws HTTPException 500 if Supabase errors, 404 if the row is RLS-hidden
 * or genuinely missing.
 */
async function fetchAndShapeOrder(
  sb: ReturnType<typeof userClient>,
  id: string,
): Promise<unknown> {
  const { data, error: fetchErr } = await sb
    .from("orders")
    .select("*, order_lines(*), order_addons(*), order_history(*)")
    .eq("id", id)
    .maybeSingle();
  if (fetchErr) throw new HTTPException(500, { message: fetchErr.message });
  if (!data) throw new HTTPException(404, { message: "Order not found" });

  const row = data as DB.OrderRow & {
    order_lines?: DB.OrderLineRow[];
    order_addons?: DB.OrderAddonRow[];
    order_history?: DB.OrderHistoryRow[];
  };
  const order = Adapters.orderFromRow(row, {
    lines: row.order_lines ?? [],
    addons: row.order_addons ?? [],
    history: row.order_history ?? [],
  });
  const [signatureUrl, paymentSlipUrl] = await Promise.all([
    signAttachment(sb, order.signatureUrl),
    signAttachment(sb, order.paymentSlipUrl),
  ]);
  const totalAmount = computeTotalFromLines(row.order_lines, row.order_addons);
  return orderSchema.parse({ ...order, signatureUrl, paymentSlipUrl, totalAmount });
}

/**
 * Validates that a Storage path lives inside the caller's dealer folder.
 * Returns the same `400 path-outside-folder` error the create route uses.
 * Inline-callable from any mutation route that accepts upload paths.
 */
function assertDealerOwnedPath(path: string, dealerId: string, fieldName: string) {
  const expectedPrefix = `orders-attachments/${dealerId}/`;
  if (!path.startsWith(expectedPrefix)) {
    throw new HTTPException(400, {
      message: `${fieldName} must be inside your dealer folder`,
    });
  }
}

/**
 * POST /api/orders/:id/proceed — atomic Place→Proceed transition via the
 * `proceed_order(uuid)` RPC defined in 0008.
 *
 * Error contract (matches RPC's RAISE EXCEPTION codes):
 *   • 42501 (forbidden)            → 403
 *   • 42P01 (order_not_found)      → 404
 *   • 22023 (wrong_status)         → 422 { code: "wrong_status" }
 *   • P0001 (blocker validation)   → 422 { code: <ProceedBlockerCode> }
 *   • anything else                → 500
 *
 * On success we re-fetch the full order (lines + addons + history) and sign
 * the attachment URLs so the client gets the same shape as GET /:id.
 */
ordersRouter.post("/:id/proceed", async (c) => {
  const auth = c.var.auth;
  const id = c.req.param("id");
  const idCheck = z.string().uuid().safeParse(id);
  if (!idCheck.success) throw new HTTPException(404, { message: "Order not found" });

  if (
    auth.role !== "dealer" && auth.role !== "salesperson" && auth.role !== "showroom" &&
    auth.role !== "principal" && auth.role !== "operation" &&
    auth.role !== "finance" && auth.role !== "bd"
  ) {
    throw new HTTPException(403, { message: "Role cannot proceed orders" });
  }

  const sb = userClient(c.env, auth.jwt);
  const { error: rpcError } = await sb.rpc("proceed_order", { p_order_id: id });

  if (rpcError) {
    const sqlstate = rpcError.code;
    // PostgreSQL DETAIL field round-trips through PostgREST as `details`. The
    // RPC always sets it to one of our PROCEED_BLOCKER_CODES (or 'wrong_status').
    const detailCode = isProceedBlockerCode(rpcError.details) ? rpcError.details : null;

    if (sqlstate === "42501") {
      throw new HTTPException(403, { message: "Forbidden" });
    }
    if (sqlstate === "42P01") {
      throw new HTTPException(404, { message: "Order not found" });
    }
    if (sqlstate === "P0001" || sqlstate === "22023") {
      // 422 Unprocessable Entity — request was well-formed but a business
      // precondition failed. Body carries the specific blocker code so the
      // client can show the matching inline hint without parsing strings.
      return c.json(
        {
          error: "proceed_order_blocked",
          code: detailCode,
          message: rpcError.message,
        },
        422,
      );
    }
    throw new HTTPException(500, { message: rpcError.message });
  }

  // Re-fetch with relations — same shape as GET /:id so the client can
  // setQueryData(qk.order(id), …) and skip a follow-up round-trip.
  return c.json(await fetchAndShapeOrder(sb, id));
});

/**
 * Shared body parser + RPC dispatcher for the three blocker-resolution
 * mutations (top-up / address / date). Keeps the route handlers small and
 * uniform: parse → validate → call RPC → map errors → re-fetch + return.
 */
/** Standard 422 body shape for lead-time violations. Mirrors `mapPgError`'s
 *  P0001 (rule_violation) so the FE can branch on `error === "rule_violation"`
 *  + `code === "lead_time_violation"` to surface a date-picker friendly
 *  message. `minDate` + `leadDays` are extras the wizard's inline reason can
 *  display without re-fetching catalog. */
function leadTimeBody(v: LeadTimeViolation): {
  error: "rule_violation";
  code: "lead_time_violation";
  message: string;
  minDate: string;
  leadDays: number;
} {
  return {
    error: "rule_violation",
    code: "lead_time_violation",
    message: v.message,
    minDate: v.minDate,
    leadDays: v.leadDays,
  };
}

async function dispatchOrderMutation<TBody>(
  c: Context<AppEnv>,
  opts: {
    schema: { safeParse: (v: unknown) => { success: boolean; data?: TBody; error?: { issues: { message?: string }[] } } };
    /** RPC name as defined in the migration (e.g. "top_up_order"). */
    rpcName: string;
    /** Maps the validated body + dealer context to the named-arg payload. */
    rpcArgs: (body: TBody, dealerId: string) => Record<string, unknown>;
    /** Optional pre-flight checks (storage paths inside dealer folder, etc.). */
    preFlight?: (body: TBody, dealerId: string) => void;
    /** Optional async pre-flight, runs after the sync `preFlight` with access
     *  to the supabase client + order id. Return a Response to short-circuit
     *  with that response; return null to continue to the RPC dispatch. Used
     *  by POST /:id/date to enforce lead-time floor (which needs to query
     *  product_models for the order's lines). */
    asyncPreFlight?: (
      body: TBody,
      ctx: { sb: ReturnType<typeof userClient>; id: string; dealerId: string | null },
    ) => Promise<Response | null>;
    /** Tag used in 422 response bodies so the frontend can branch on the route. */
    errorTag: string;
  },
): Promise<Response> {
  const auth = c.var.auth;
  const idCheck = z.string().uuid().safeParse(c.req.param("id"));
  if (!idCheck.success || !idCheck.data) {
    throw new HTTPException(404, { message: "Order not found" });
  }
  const id: string = idCheck.data;

  if (
    auth.role !== "dealer" && auth.role !== "salesperson" && auth.role !== "showroom" &&
    auth.role !== "principal" && auth.role !== "operation" &&
    auth.role !== "finance" && auth.role !== "bd"
  ) {
    throw new HTTPException(403, { message: "Role cannot mutate orders" });
  }
  if ((auth.role === "dealer" || auth.role === "salesperson" || auth.role === "showroom") && !auth.dealerId) {
    throw new HTTPException(403, { message: "Dealer scope missing on JWT" });
  }

  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    throw new HTTPException(400, { message: "Body must be valid JSON" });
  }
  const parsed = opts.schema.safeParse(raw);
  if (!parsed.success || !parsed.data) {
    throw new HTTPException(400, {
      message: "Invalid input: " + (parsed.error?.issues[0]?.message ?? "unknown"),
    });
  }
  if (opts.preFlight && auth.dealerId) {
    opts.preFlight(parsed.data, auth.dealerId);
  }

  const sb = userClient(c.env, auth.jwt);
  if (opts.asyncPreFlight) {
    const short = await opts.asyncPreFlight(parsed.data, {
      sb,
      id,
      dealerId: auth.dealerId ?? null,
    });
    if (short) return short;
  }
  const args = opts.rpcArgs(parsed.data, auth.dealerId ?? "");
  // `args` is the named-arg object Postgres expects; pass through verbatim.
  const { error: rpcError } = await sb.rpc(opts.rpcName, args as never);
  if (rpcError) {
    const sqlstate = rpcError.code;
    if (sqlstate === "42501") throw new HTTPException(403, { message: "Forbidden" });
    if (sqlstate === "42P01") throw new HTTPException(404, { message: "Order not found" });
    if (sqlstate === "22023" || sqlstate === "P0001") {
      return c.json(
        {
          error: opts.errorTag,
          code: rpcError.details ?? null,
          message: rpcError.message ?? "Unprocessable entity",
        },
        422,
      );
    }
    throw new HTTPException(500, { message: rpcError.message });
  }

  return c.json(await fetchAndShapeOrder(sb, id));
}

/** POST /api/orders/:id/top-up — record a partial payment toward an order's
 *  total. Photos uploaded to Storage by the dealer before this call; we
 *  validate paths live inside the dealer folder and pass them through to the
 *  RPC which persists them in `order_history.metadata`. */
ordersRouter.post("/:id/top-up", (c) =>
  dispatchOrderMutation(c, {
    schema: topUpOrderInputSchema,
    rpcName: "top_up_order",
    errorTag: "top_up_blocked",
    preFlight: (body, dealerId) => {
      for (const p of body.photoPaths) {
        assertDealerOwnedPath(p, dealerId, "photoPaths[]");
      }
    },
    rpcArgs: (body) => ({
      p_order_id: c.req.param("id"),
      p_amount: body.amount,
      p_method: body.method,
      p_method_label: body.methodLabel,
      p_reference: body.reference,
      p_note: body.note,
      p_date: body.date,
      p_photo_paths: body.photoPaths,
    }),
  }),
);

/** POST /api/orders/:id/address — fill in a deferred delivery address.
 *  Mirrors AddAddressModal in proto. */
ordersRouter.post("/:id/address", (c) =>
  dispatchOrderMutation(c, {
    schema: setOrderAddressInputSchema,
    rpcName: "set_order_address",
    errorTag: "set_address_blocked",
    rpcArgs: (body) => ({
      p_order_id: c.req.param("id"),
      p_address: body.address,
      p_billing: body.billing,
      p_billing_same: body.billingSame,
    }),
  }),
);

/** POST /api/orders/:id/date — confirm a TBD delivery date. Mirrors
 *  ConfirmDateModal in proto. The lead-time floor (mattress/bedframe 14d,
 *  sofa 21d — see shared `DELIVERY_LEAD_DAYS`) is enforced via async
 *  pre-flight because the wizard's client-side gate doesn't apply once
 *  the order is already in Place with `dateTbd: true`. */
ordersRouter.post("/:id/date", (c) =>
  dispatchOrderMutation(c, {
    schema: setOrderDateInputSchema,
    rpcName: "set_order_date",
    errorTag: "set_date_blocked",
    asyncPreFlight: async (body, ctx) => {
      const skus = await getOrderSkus(ctx.sb, ctx.id);
      const violation = await validateDeliveryLeadTime(ctx.sb, skus, body.date);
      if (violation) return c.json(leadTimeBody(violation), 422);
      return null;
    },
    rpcArgs: (body) => ({
      p_order_id: c.req.param("id"),
      p_date: body.date,
      // Phase 11.1 — confirming a TBD order sets BOTH dates (proceed pairs with
      // delivery). The schema enforces proceedDate <= date.
      p_proceed_date: body.proceedDate,
    }),
  }),
);

/** POST /api/orders/:id/cancel — Phase 2C.3 dealer cancel. Only Place
 *  orders cancelable; once proceeded, operation owns the rollback flow. */
ordersRouter.post("/:id/cancel", (c) =>
  dispatchOrderMutation(c, {
    schema: cancelOrderInputSchema,
    rpcName: "cancel_order",
    errorTag: "cancel_order_blocked",
    rpcArgs: (body) => ({
      p_order_id: c.req.param("id"),
      p_reason: body.reason,
    }),
  }),
);

/**
 * PATCH /api/orders/:id — full edit of a Place order. Phase 2C.2 — mirrors
 * proto's CustomerEditor (dealer-orders.jsx:472-581). Caller sends camelCase
 * partial fields under `customer` / `delivery` and we flatten to the
 * snake_case payload `update_order` RPC consumes.
 *
 * Only fields present in the payload are written. The RPC re-runs the same
 * status guard as the targeted RPCs (Place orders only) so an order that
 * just transitioned to Proceed under us cannot be edited mid-flight.
 */
ordersRouter.patch("/:id", async (c) => {
  const auth = c.var.auth;
  const idCheck = z.string().uuid().safeParse(c.req.param("id"));
  if (!idCheck.success || !idCheck.data) {
    throw new HTTPException(404, { message: "Order not found" });
  }
  const id: string = idCheck.data;

  if (
    auth.role !== "dealer" && auth.role !== "salesperson" && auth.role !== "showroom" &&
    auth.role !== "principal" && auth.role !== "operation" &&
    auth.role !== "finance" && auth.role !== "bd"
  ) {
    throw new HTTPException(403, { message: "Role cannot edit orders" });
  }
  if ((auth.role === "dealer" || auth.role === "salesperson" || auth.role === "showroom") && !auth.dealerId) {
    throw new HTTPException(403, { message: "Dealer scope missing on JWT" });
  }

  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    throw new HTTPException(400, { message: "Body must be valid JSON" });
  }
  const parsed = updateOrderInputSchema.safeParse(raw);
  if (!parsed.success) {
    throw new HTTPException(400, {
      message: "Invalid edit input: " + (parsed.error.issues[0]?.message ?? "unknown"),
    });
  }

  // Flatten camelCase nested input to the snake_case keys the RPC reads via
  // jsonb_object_field. Only keys present on the input object are forwarded
  // so the RPC's "this key was specified" detection works.
  const flat: Record<string, unknown> = {};
  const cust = parsed.data.customer;
  if (cust) {
    if ("name" in cust) flat.customer_name = cust.name;
    if ("phone" in cust) flat.customer_phone = cust.phone ?? "";
    if ("address" in cust) flat.customer_address = cust.address ?? "";
    if ("addressUnknown" in cust) flat.customer_address_unknown = cust.addressUnknown;
    if ("billing" in cust) flat.customer_billing = cust.billing ?? "";
    if ("billingSame" in cust) flat.customer_billing_same = cust.billingSame;
    if ("emergency" in cust) flat.customer_emergency = cust.emergency ?? "";
  }
  const del = parsed.data.delivery;
  if (del) {
    if ("date" in del) flat.delivery_date = del.date ?? "";
    // Phase 11.1 — proceed date editable alongside delivery date.
    if ("proceedDate" in del) flat.proceed_date = del.proceedDate ?? "";
    if ("dateTbd" in del) flat.delivery_date_tbd = del.dateTbd;
    if ("floor" in del) flat.delivery_floor = del.floor;
    if ("hasLift" in del) flat.delivery_has_lift = del.hasLift;
    if ("stairItems" in del) flat.delivery_stair_items = del.stairItems;
  }

  if (Object.keys(flat).length === 0) {
    throw new HTTPException(400, { message: "No editable fields in payload" });
  }

  const sb = userClient(c.env, auth.jwt);

  // Lead-time floor on delivery.date edits. The wizard's Step 3 picker gates
  // create, but the dealer can hit PATCH to mutate a Place order's date —
  // without this check the wizard's 14/21-day floor is trivially bypassable.
  // TBD-flip (dateTbd: true with empty date) skips; non-TBD edits validate.
  if (del?.date && !del.dateTbd) {
    const skus = await getOrderSkus(sb, id);
    const violation = await validateDeliveryLeadTime(sb, skus, del.date);
    if (violation) return c.json(leadTimeBody(violation), 422);
  }

  const { error: rpcError } = await sb.rpc("update_order", {
    p_order_id: id,
    p_payload: flat,
  });
  if (rpcError) {
    const sqlstate = rpcError.code;
    if (sqlstate === "42501") throw new HTTPException(403, { message: "Forbidden" });
    if (sqlstate === "42P01") throw new HTTPException(404, { message: "Order not found" });
    if (sqlstate === "22023" || sqlstate === "P0001") {
      return c.json(
        {
          error: "update_order_blocked",
          code: rpcError.details ?? null,
          message: rpcError.message ?? "Unprocessable entity",
        },
        422,
      );
    }
    throw new HTTPException(500, { message: rpcError.message });
  }

  return c.json(await fetchAndShapeOrder(sb, id));
});

ordersRouter.get("/:id", async (c) => {
  const auth = c.var.auth;
  const id = c.req.param("id");
  const idCheck = z.string().uuid().safeParse(id);
  if (!idCheck.success) throw new HTTPException(404, { message: "Order not found" });

  const sb = userClient(c.env, auth.jwt);
  // PostgREST nested syntax: 1 round-trip pulls order + lines + addons + history.
  // Each child table has its own RLS policy that mirrors the parent — so child
  // rows are visible iff the parent is.
  const { data, error } = await sb
    .from("orders")
    .select("*, order_lines(*), order_addons(*), order_history(*)")
    .eq("id", id)
    .maybeSingle();

  if (error) throw new HTTPException(500, { message: error.message });
  // Same message whether the row genuinely doesn't exist or is RLS-hidden — we
  // never reveal which.
  if (!data) throw new HTTPException(404, { message: "Order not found" });

  const row = data as DB.OrderRow & {
    order_lines?: DB.OrderLineRow[];
    order_addons?: DB.OrderAddonRow[];
    order_history?: DB.OrderHistoryRow[];
  };
  const order = Adapters.orderFromRow(row, {
    lines: row.order_lines ?? [],
    addons: row.order_addons ?? [],
    history: row.order_history ?? [],
  });

  // Replace raw Storage paths with 1h signed URLs so the client can render
  // <img src=> directly. Stored DB values stay as paths — RLS still gates
  // who can sign them, so an internal viewer reading another dealer's order
  // gets a properly signed URL only when their RLS policy allows it.
  const [signatureUrl, paymentSlipUrl] = await Promise.all([
    signAttachment(sb, order.signatureUrl),
    signAttachment(sb, order.paymentSlipUrl),
  ]);
  // totalAmount mirrors the list endpoint formula so proceedBlockers, the
  // ActionPanel, and the order detail footer all read the same value (the
  // detail view used to omit it which surfaced a phantom "Order pricing"
  // blocker on every Place order — see Phase 2C.1a).
  const totalAmount = computeTotalFromLines(row.order_lines, row.order_addons);
  const signed = { ...order, signatureUrl, paymentSlipUrl, totalAmount };

  return c.json(orderSchema.parse(signed));
});

// 2026-05-12 (Loo) — Sales Order data for client-side PDF render.
// Returns JSON (NOT PDF bytes) — the browser does the @react-pdf render
// because Workers blocks the yoga-layout WASM compile. The route stays
// here for the SQL joins + role gate + RLS scoping.
//
// Customer-facing doc. Dealer / Showroom / Salesperson / operation / Finance
// / Principal / BD can pull; Partner / Supplier are denied at the route gate
// (Partner has POD, Supplier has PO — they shouldn't be handing out the
// customer SO). RLS on `orders` narrows further to rows each role can read.
ordersRouter.get("/:id/sales-order-data", async (c) => {
  const auth = c.var.auth;
  const role = auth.role;
  if (role === "partner" || role === "supplier") {
    throw new HTTPException(403, {
      message: "Sales Order PDF not available for this role",
    });
  }
  const id = c.req.param("id");
  const idCheck = z.string().uuid().safeParse(id);
  if (!idCheck.success) throw new HTTPException(404, { message: "Order not found" });

  const sb = userClient(c.env, auth.jwt);

  // Join order + lines + addons + dealer + outlet + salesperson in one
  // PostgREST round-trip. Each child table inherits its RLS from `orders`,
  // so a row visible to the caller carries all its children through.
  const { data, error } = await sb
    .from("orders")
    .select(
      "id, so, status, channel, customer_name, customer_phone, customer_address, " +
        "delivery_date, delivery_date_tbd, delivery_floor, delivery_has_lift, " +
        "paid, signature_url, placed_at, " +
        "order_lines(sku, qty, unit_price, attrs), " +
        "order_addons(addon_key, qty, unit_price), " +
        "dealers(name, contact, address), " +
        "outlets(name, address), " +
        "salespersons(name, phone)",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw new HTTPException(500, { message: error.message });
  if (!data) throw new HTTPException(404, { message: "Order not found" });

  // PostgREST nested select shape; cast in-place since this is the only
  // consumer of this exact join.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const o = data as any;
  const lines: Array<{
    sku: string;
    qty: number;
    unit_price: number | string;
    attrs: Record<string, unknown> | null;
  }> = o.order_lines ?? [];
  const addons: Array<{ addon_key: string; qty: number; unit_price: number | string }> =
    o.order_addons ?? [];

  const lineRows = lines.map((l) => {
    const qty = Number(l.qty);
    const unitPrice = Number(l.unit_price);
    return {
      sku: String(l.sku),
      description: String(l.sku),
      qty,
      unit_price: unitPrice,
      line_total: qty * unitPrice,
      attrs: l.attrs ?? null,
    };
  });
  const addonRows = addons.map((a) => {
    const qty = Number(a.qty);
    const unitPrice = Number(a.unit_price);
    return {
      label: String(a.addon_key),
      qty,
      unit_price: unitPrice,
      line_total: qty * unitPrice,
    };
  });

  const subtotal =
    lineRows.reduce((s, r) => s + r.line_total, 0) +
    addonRows.reduce((s, r) => s + r.line_total, 0);
  const total = subtotal;
  const paid = Number(o.paid ?? 0);
  const balance_due = total - paid;

  // proto `soNumber` → "SO-001001" (6-digit zero-padded so).
  const so_number = `SO-${String(o.so).padStart(6, "0")}`;
  const issue_date = (o.placed_at as string | null)?.slice(0, 10) ?? "—";
  const statusLabel =
    o.status === "place"
      ? "Awaiting fulfilment"
      : o.status === "proceed_order"
        ? "Proceed requested"
        : o.status === "delivered"
          ? "Delivered"
          : o.status === "cancelled"
            ? "Cancelled"
            : String(o.status);

  const channel: "dealer" | "showroom" =
    o.channel === "showroom" || o.outlets ? "showroom" : "dealer";

  // Sign the customer's eSign PNG so the PDF template can render it inline.
  // 1h TTL is enough — the browser downloads the PDF or saves the image
  // immediately when render fires.
  const signatureSignedUrl = await signAttachment(sb, o.signature_url ?? null);

  const payload: SalesOrderData = {
    so_number,
    issue_date,
    order_id: id,
    order_code: `SO-${o.so}`,
    status_label: statusLabel,
    channel,
    customer: {
      name: String(o.customer_name ?? "—"),
      address: String(o.customer_address ?? "—"),
      phone: o.customer_phone ?? null,
    },
    dealer: {
      name: String(o.dealers?.name ?? "Carres"),
      contact: o.dealers?.contact ?? null,
      address: o.dealers?.address ?? null,
      outlet_name: o.outlets?.name ?? null,
      outlet_address: o.outlets?.address ?? null,
      salesperson_name: o.salespersons?.name ?? null,
      salesperson_phone: o.salespersons?.phone ?? null,
    },
    delivery: {
      date: o.delivery_date_tbd ? "To be confirmed" : String(o.delivery_date ?? "—"),
      floor: Number(o.delivery_floor ?? 1),
      has_lift: Boolean(o.delivery_has_lift),
    },
    lines: lineRows,
    addons: addonRows,
    subtotal,
    total,
    paid,
    balance_due,
    currency: "MYR",
    signed: !!o.signature_url,
    signature_url: signatureSignedUrl,
  };

  return c.json(payload);
});

/**
 * GET /api/orders/:id/invoice-pdf-data — Loo 2026-05-13.
 *
 * Sales Invoice PDF data for the operation drawer "Print Invoice" button.
 * Mirrors the Finance route at /api/finance/invoices/:id/pdf-data shape
 * but keyed by order_id (not invoice_id) and gated permissively so the
 * operation user can re-print at dispatch handover without bouncing
 * through Finance.
 *
 * Available to operation, finance, principal, bd. Partner / supplier /
 * dealer / showroom / salesperson denied (invoice is an internal/tax
 * doc; the customer-facing SO PDF is already wired elsewhere).
 *
 * Required state: order.invoice_no is set (0098's BEFORE-UPDATE trigger
 * auto-issues at dispatch). Returns 422 if not yet issued — caller should
 * surface as "invoice not yet generated".
 */
ordersRouter.get("/:id/invoice-pdf-data", async (c) => {
  const auth = c.var.auth;
  const role = auth.role;
  if (!["operation", "finance", "principal", "bd"].includes(String(role))) {
    throw new HTTPException(403, { message: "Invoice PDF not available for this role" });
  }
  const id = c.req.param("id");
  const idCheck = z.string().uuid().safeParse(id);
  if (!idCheck.success) throw new HTTPException(404, { message: "Order not found" });

  const sb = userClient(c.env, auth.jwt);

  const { data: order, error: ordErr } = await sb
    .from("orders")
    .select(
      "id, so, status, invoice_no, invoiced_at, customer_name, customer_phone, customer_address, dealer_id, dealers(name, contact)",
    )
    .eq("id", id)
    .maybeSingle();
  if (ordErr) throw new HTTPException(500, { message: ordErr.message });
  if (!order) throw new HTTPException(404, { message: "Order not found" });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ord: any = order;
  if (!ord.invoice_no) {
    throw new HTTPException(422, {
      message: "Invoice not yet issued (auto-issued at dispatch — wait until operation_stage='dispatched')",
    });
  }

  const { data: inv, error: invErr } = await sb
    .from("invoices")
    .select("id, invoice_no, amount, tax_amount, issued_at, voided_at")
    .eq("invoice_no", ord.invoice_no)
    .maybeSingle();
  if (invErr) throw new HTTPException(500, { message: invErr.message });
  if (!inv) throw new HTTPException(404, { message: "Invoice row missing for order" });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const i: any = inv;
  if (i.voided_at) {
    throw new HTTPException(422, { message: "Invoice has been voided — re-issue first" });
  }

  const { data: lines, error: linErr } = await sb
    .from("order_lines")
    .select("sku, qty, unit_price")
    .eq("order_id", id);
  if (linErr) throw new HTTPException(500, { message: linErr.message });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lineRows = (lines ?? []) as any[];

  const skus: string[] = lineRows.map((l) => String(l.sku));
  const skuVariantBySku: Record<string, string> = {};
  if (skus.length > 0) {
    const { data: skuRows, error: skuErr } = await sb
      .from("product_skus")
      .select("sku, variant")
      .in("sku", skus);
    if (skuErr) throw new HTTPException(500, { message: skuErr.message });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const r of (skuRows ?? []) as any[]) {
      skuVariantBySku[String(r.sku)] = String(r.variant);
    }
  }

  const taxAmount = Number(i.tax_amount ?? 0);
  const total = Number(i.amount ?? 0);
  const subtotal = +(total - taxAmount).toFixed(2);

  const dealerRow = ord.dealers ?? null;
  const dealerName = dealerRow?.name ?? "Carres";
  const dealerContact = dealerRow?.contact ?? null;

  return c.json({
    invoice_no: String(i.invoice_no),
    issue_date: String(i.issued_at).slice(0, 10),
    order_id: String(ord.id),
    order_code: `SO-${ord.so}`,
    customer: {
      name: String(ord.customer_name ?? ""),
      address: String(ord.customer_address ?? "—"),
      phone: ord.customer_phone ?? null,
    },
    dealer: {
      name: dealerName,
      contact: dealerContact,
    },
    lines: lineRows.map((l) => {
      const qty = Number(l.qty);
      const unitPrice = Number(l.unit_price);
      return {
        sku: String(l.sku),
        description: skuVariantBySku[l.sku] ?? String(l.sku),
        qty,
        unit: "pc",
        unit_price: unitPrice,
        line_total: +(qty * unitPrice).toFixed(2),
      };
    }),
    subtotal,
    tax_amount: taxAmount,
    total,
    currency: "MYR",
  });
});

export default ordersRouter;
