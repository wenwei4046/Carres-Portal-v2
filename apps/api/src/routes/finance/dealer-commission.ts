import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { dcKpiRuleAddInput, dcPaymentLinkInput, dcQuotaInput, dcRuleAddInput, dcTakeBackInput } from "@carres/shared/dealer-commission";
import { requireFinance } from "../../lib/auth-guards";
import { fail, parseJsonBody } from "../../lib/route-helpers";
import { getStaffContext } from "../../lib/staff-token";
import { userClient } from "../../lib/supabase";
import type { AppEnv } from "../../types";

/**
 * FINANCE · DEALER COMMISSION AND RENOVATION REBATE (migrations 0544, 0661).
 * Rates Finance keeps and one read for the report. Nothing here is owed or
 * posted (CLAUDE.md §7); the arithmetic is packages/shared/src/dealer-commission.ts.
 *
 *   GET    /?month=YYYY-MM     dealer_commission_source for that month
 *   GET    /rules              dealer_commission_rules_read: the dated rates and switches
 *   POST   /rules              dealer_commission_rule_add: a rate or switch from a day
 *   DELETE /rules/:id          dealer_commission_rule_remove: one added by mistake
 *   PUT    /orders/:orderId/take-back   dealer_commission_take_back (0662): a
 *                              cancelled order's commission taken back, or kept again
 *   GET    /statement/:dealerId  dealer_commission_statement (0664)
 *   GET    /payment-choices    paid direct vouchers not yet a payment to a dealer
 *   POST   /payments           a paid voucher counted as a payment to a dealer
 *   DELETE /payments/:id       taken off the dealer's statement
 *   PUT    /quotas/:dealerId   a dealer's renovation quota (empty: no limit yet, 0665),
 *                              rebate rate, start date
 *   GET    /kpi-rules          dealer_kpi_rules_read (0665): the KPI allowance rules
 *   POST   /kpi-rules          dealer_kpi_rule_add: a KPI allowance from a day
 *   DELETE /kpi-rules/:id      dealer_kpi_rule_remove: one added by mistake
 *
 * And `dealerStatementRouter` (mounted at /api/dealer-commission): the
 * dealer's own statement, for its store owner (0664, D3).
 *
 * 0661: a rate has a start day, so the one default rate and the per-product
 * rates (PUT /settings, PUT and DELETE /rates) are gone; their values are the
 * first rules. The doors decide who may change a rate and what is valid.
 *
 * Finance and principal twice: `requireFinance` here, and the database.
 */
const r = new Hono<AppEnv>();
const UUID = /^[0-9a-f-]{36}$/i;

r.get("/", requireFinance, async (c) => {
  const month = c.req.query("month") ?? "";
  if (!/^\d{4}-\d{2}$/.test(month)) return c.json({ error: "bad_request", message: "Pick a month." }, 400);
  const { data, error } = await userClient(c.env, c.var.auth.jwt).rpc("dealer_commission_source", { p_month: `${month}-01` });
  if (error) return fail(c, error);
  return c.json(data);
});

r.get("/rules", requireFinance, async (c) => {
  const { data, error } = await userClient(c.env, c.var.auth.jwt).rpc("dealer_commission_rules_read");
  if (error) return fail(c, error);
  return c.json(data);
});

r.post("/rules", requireFinance, async (c) => {
  const body = await parseJsonBody(c, dcRuleAddInput);
  if (!body.ok) return c.json(body.body, body.status);
  const b = body.data;
  const { data, error } = await userClient(c.env, c.var.auth.jwt).rpc("dealer_commission_rule_add", {
    p_kind: b.kind,
    p_dealer_id: b.kind === "dealer" ? b.dealerId : null,
    p_model_id: b.kind === "product" || b.kind === "promotion" ? b.modelId : null,
    p_category: b.kind === "category" ? b.category : null,
    // A promotion item's points off ride in the rate; a switch has none.
    p_rate: b.kind === "promotion" ? (b.isOn ? b.points ?? null : null) : b.kind === "category" ? null : b.rate,
    p_is_on: b.kind === "promotion" || b.kind === "category" ? b.isOn : null,
    p_starts_on: b.startsOn,
    p_memo: b.memo ?? null,
  });
  if (error) return fail(c, error);
  return c.json(data, 201);
});

r.delete("/rules/:id", requireFinance, async (c) => {
  const id = c.req.param("id");
  if (!UUID.test(id)) return c.json({ error: "not_found", message: "That rate is not on the list." }, 404);
  const { data, error } = await userClient(c.env, c.var.auth.jwt).rpc("dealer_commission_rule_remove", { p_id: id });
  if (error) return fail(c, error);
  return c.json(data);
});

r.put("/orders/:orderId/take-back", requireFinance, async (c) => {
  const orderId = c.req.param("orderId");
  if (!UUID.test(orderId)) return c.json({ error: "not_found", message: "That dealer order is not on the list." }, 404);
  const body = await parseJsonBody(c, dcTakeBackInput);
  if (!body.ok) return c.json(body.body, body.status);
  const { data, error } = await userClient(c.env, c.var.auth.jwt).rpc("dealer_commission_take_back", {
    p_order_id: orderId, p_take_back: body.data.takeBack,
  });
  if (error) return fail(c, error);
  return c.json(data);
});

r.get("/statement/:dealerId", requireFinance, async (c) => {
  const dealerId = c.req.param("dealerId");
  if (!UUID.test(dealerId)) return c.json({ error: "not_found", message: "That dealer is not on the list." }, 404);
  const { data, error } = await userClient(c.env, c.var.auth.jwt).rpc("dealer_commission_statement", { p_dealer_id: dealerId });
  if (error) return fail(c, error);
  return c.json(data);
});

r.get("/payment-choices", requireFinance, async (c) => {
  const { data, error } = await userClient(c.env, c.var.auth.jwt).rpc("dealer_commission_payment_choices");
  if (error) return fail(c, error);
  return c.json(data);
});

r.post("/payments", requireFinance, async (c) => {
  const body = await parseJsonBody(c, dcPaymentLinkInput);
  if (!body.ok) return c.json(body.body, body.status);
  const { data, error } = await userClient(c.env, c.var.auth.jwt).rpc("dealer_commission_payment_link", {
    p_voucher_id: body.data.voucherId, p_dealer_id: body.data.dealerId,
  });
  if (error) return fail(c, error);
  return c.json(data, 201);
});

r.delete("/payments/:id", requireFinance, async (c) => {
  const id = c.req.param("id");
  if (!UUID.test(id)) return c.json({ error: "not_found", message: "That payment is not on the statement." }, 404);
  const { data, error } = await userClient(c.env, c.var.auth.jwt).rpc("dealer_commission_payment_unlink", { p_id: id });
  if (error) return fail(c, error);
  return c.json(data);
});

r.get("/kpi-rules", requireFinance, async (c) => {
  const { data, error } = await userClient(c.env, c.var.auth.jwt).rpc("dealer_kpi_rules_read");
  if (error) return fail(c, error);
  return c.json(data);
});

r.post("/kpi-rules", requireFinance, async (c) => {
  const body = await parseJsonBody(c, dcKpiRuleAddInput);
  if (!body.ok) return c.json(body.body, body.status);
  const b = body.data;
  const { data, error } = await userClient(c.env, c.var.auth.jwt).rpc("dealer_kpi_rule_add", {
    p_starts_on: b.startsOn, p_model_id: b.modelId, p_per_unit: b.perUnit,
    p_tiers: b.tiers, p_period: b.period, p_memo: b.memo ?? null,
  });
  if (error) return fail(c, error);
  return c.json(data, 201);
});

r.delete("/kpi-rules/:id", requireFinance, async (c) => {
  const id = c.req.param("id");
  if (!UUID.test(id)) return c.json({ error: "not_found", message: "That KPI allowance is not on the list." }, 404);
  const { data, error } = await userClient(c.env, c.var.auth.jwt).rpc("dealer_kpi_rule_remove", { p_id: id });
  if (error) return fail(c, error);
  return c.json(data);
});

r.put("/quotas/:dealerId", requireFinance, async (c) => {
  const dealerId = c.req.param("dealerId");
  if (!UUID.test(dealerId)) return c.json({ error: "not_found", message: "That dealer is not on the list." }, 404);
  const body = await parseJsonBody(c, dcQuotaInput);
  if (!body.ok) return c.json(body.body, body.status);
  const { error } = await userClient(c.env, c.var.auth.jwt).from("dealer_rebate_quotas").upsert({
    dealer_id: dealerId, quota: body.data.quota, rebate_rate: body.data.rebateRate, starts_on: body.data.startsOn,
  });
  if (error) return fail(c, error);
  return c.json({ ok: true });
});

export default r;

/**
 * 0664 (D3, 「dealer 要能看自己的statement」) — the dealer's own commission
 * statement. A DEALER store login with its store owner's (principal-tier)
 * staff token, as the store account page asks (routes/account.ts); the
 * database gives a dealer login its own dealer only, whatever is asked.
 */
export const dealerStatementRouter = new Hono<AppEnv>();

dealerStatementRouter.get("/statement", async (c) => {
  const auth = c.var.auth;
  if (auth.role !== "dealer" || !auth.dealerId) {
    throw new HTTPException(403, { message: "Dealer store login only" });
  }
  const staff = await getStaffContext(c);
  if (!staff || staff.tier !== "principal") {
    throw new HTTPException(403, { message: "Store owner only" });
  }
  const { data, error } = await userClient(c.env, auth.jwt).rpc("dealer_commission_statement", { p_dealer_id: null });
  if (error) return fail(c, error);
  return c.json(data);
});
